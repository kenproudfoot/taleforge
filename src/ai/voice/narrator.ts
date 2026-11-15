import { setDucked } from '@/audio/bus';
import { castVoice } from './casting';
import type { VoiceInfo } from './casting';
import { speechUnits } from './sentences';
import type { SpeechUnit } from './sentences';
import { createBrowserTts } from './tts';
import type { TtsProvider, Utterance } from './tts';

export interface SpeakingRange {
  entryId: string;
  start: number;
  end: number;
}

export interface NarratorConfig {
  enabled: boolean;
  narratorVoice: string;
  speed: number;
  npcVoices: boolean;
  /** Lower-cased NPC name -> voice id chosen by the user. */
  overrides: Record<string, string>;
  /** Lower-cased NPC name -> free-text voice hint from the campaign cast. */
  hints: Record<string, string>;
}

export interface NarratorDeps {
  provider(): TtsProvider;
  config(): NarratorConfig;
  onSpeaking(range: SpeakingRange | null): void;
  onError?(message: string): void;
  /** Injected in tests; defaults to the real music ducking. */
  duck?(on: boolean): void;
  /** Injected in tests; defaults to Date.now. */
  now?(): number;
}

interface Item {
  entryId: string;
  unit: SpeechUnit;
  abort: AbortController;
  prepared: Promise<Utterance | null>;
}

const MAX_PREPARING = 3;
/** How long to use the browser voice after the configured voice service fails before trying it again. */
export const FALLBACK_RETRY_MS = 60_000;

/**
 * Reads the Dungeon Master aloud. Text is fed in as it streams; each complete sentence is sent to the
 * text-to-speech provider straight away (a few in parallel) and played in order, so the first sentence
 * starts while the rest is still being written. Music ducks while speaking.
 */
export class Narrator {
  private queue: Item[] = [];
  private waiting: Array<() => void> = [];
  private preparing = 0;
  private consumed = new Map<string, number>();
  private current: Item | null = null;
  private running = false;
  private silenced = false;
  private fallback: TtsProvider | null = null;
  /** When to try the configured voice service again after it failed (a failure can be temporary). */
  private fallbackUntil = 0;
  private fallbackReported = false;
  private voices: { provider: TtsProvider; list: Promise<VoiceInfo[]> } | null = null;

  constructor(private deps: NarratorDeps) {}

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  private provider(): TtsProvider {
    if (this.fallback && this.now() < this.fallbackUntil) return this.fallback;
    return this.deps.provider();
  }

  private voiceList(provider: TtsProvider): Promise<VoiceInfo[]> {
    if (this.voices?.provider.id !== provider.id) this.voices = { provider, list: provider.listVoices().catch(() => []) };
    return this.voices.list;
  }

  /** Call at the start of each DM turn: lifts a barge-in silence. */
  newTurn(): void {
    this.silenced = false;
  }

  /** Feeds the current text of a DM chat entry. `done` means no more text will arrive for it. */
  feed(entryId: string, text: string, done: boolean): void {
    const config = this.deps.config();
    const units = speechUnits(text, done);
    const from = this.consumed.get(entryId) ?? 0;
    this.consumed.set(entryId, units.length);
    if (!config.enabled || this.silenced) return;
    for (const unit of units.slice(from)) this.enqueue(entryId, unit);
  }

  private enqueue(entryId: string, unit: SpeechUnit): void {
    const abort = new AbortController();
    const item: Item = { entryId, unit, abort, prepared: this.prepare(unit, abort.signal) };
    this.queue.push(item);
    void this.run();
  }

  private async prepare(unit: SpeechUnit, signal: AbortSignal): Promise<Utterance | null> {
    // Limit how many requests are in flight so a long reply does not flood the provider.
    if (this.preparing >= MAX_PREPARING) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.preparing++;
    try {
      if (signal.aborted) return null;
      const config = this.deps.config();
      const attempt = async (provider: TtsProvider) => {
        const voices = await this.voiceList(provider);
        const voice = castVoice(unit.speaker, voices, config.narratorVoice, { overrides: config.overrides, hints: config.hints, npcVoices: config.npcVoices });
        return provider.prepare(unit.text, voice, { speed: config.speed, signal });
      };
      try {
        return await attempt(this.provider());
      } catch (e) {
        if (signal.aborted) return null;
        if (this.provider().id === 'browser') throw e;
        // The chosen voice service failed: tell the user once, use the browser's voice for a while, then
        // try the service again (permission changes and rate limits are often temporary).
        this.fallback ??= createBrowserTts();
        this.fallbackUntil = this.now() + FALLBACK_RETRY_MS;
        if (!this.fallbackReported) {
          this.fallbackReported = true;
          this.deps.onError?.(`The voice service failed (${e instanceof Error ? e.message : String(e)}). Using the browser's built-in voice for now; TaleForge will try it again in a minute.`);
        }
        return await attempt(this.fallback);
      }
    } catch (e) {
      if (!signal.aborted) this.deps.onError?.(`Could not speak: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    } finally {
      this.preparing--;
      this.waiting.shift()?.();
    }
  }

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const duck = this.deps.duck ?? setDucked;
    duck(true);
    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift()!;
        this.current = item;
        const utterance = await item.prepared;
        if (utterance && !item.abort.signal.aborted) {
          this.deps.onSpeaking({ entryId: item.entryId, start: item.unit.start, end: item.unit.end });
          await utterance.play();
        }
        this.current = null;
      }
    } finally {
      this.running = false;
      this.deps.onSpeaking(null);
      duck(false);
    }
  }

  get speaking(): boolean {
    return this.running;
  }

  /** Skips the line being read and moves on to the next. */
  skip(): void {
    this.current?.abort.abort();
  }

  /** Stops everything now and stays quiet for the rest of this turn (barge-in, or voice turned off). */
  stop(): void {
    this.silenced = true;
    for (const item of this.queue) item.abort.abort();
    this.queue = [];
    this.current?.abort.abort();
  }

  /** Forget a failed provider so the configured one is tried again (after settings change). */
  resetProvider(): void {
    this.fallback = null;
    this.fallbackUntil = 0;
    this.fallbackReported = false;
    this.voices = null;
  }
}

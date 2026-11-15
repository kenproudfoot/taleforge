import { playClip } from '@/audio/bus';
import { providerFetch } from '../providers/http';
import { ProviderError } from '../providers/types';
import type { VoiceInfo } from './casting';

export type TtsProviderId = 'openai' | 'elevenlabs' | 'browser';

export interface SpeakOptions {
  speed: number;
  signal?: AbortSignal;
}

/** A prepared utterance: `play` resolves when it has finished (or was aborted). */
export interface Utterance {
  play(): Promise<void>;
}

export interface TtsProvider {
  id: TtsProviderId;
  listVoices(): Promise<VoiceInfo[]>;
  listModels(): Promise<string[]>;
  /** Fetches or prepares the audio so that playback can start instantly later. */
  prepare(text: string, voice: string, options: SpeakOptions): Promise<Utterance>;
}

/** OpenAI does not publish a voice list endpoint; these are the built-in voice names. Any other name can be typed in Settings. */
export const OPENAI_VOICES: VoiceInfo[] = [
  { id: 'onyx', name: 'Onyx', gender: 'male', description: 'deep, steady' },
  { id: 'fable', name: 'Fable', gender: 'male', description: 'warm storyteller' },
  { id: 'ash', name: 'Ash', gender: 'male', description: 'calm, clear' },
  { id: 'echo', name: 'Echo', gender: 'male', description: 'even, friendly' },
  { id: 'ballad', name: 'Ballad', gender: 'male', description: 'expressive' },
  { id: 'verse', name: 'Verse', gender: 'male', description: 'lively' },
  { id: 'alloy', name: 'Alloy', gender: 'female', description: 'neutral, balanced' },
  { id: 'coral', name: 'Coral', gender: 'female', description: 'bright, warm' },
  { id: 'nova', name: 'Nova', gender: 'female', description: 'energetic' },
  { id: 'sage', name: 'Sage', gender: 'female', description: 'gentle, measured' },
  { id: 'shimmer', name: 'Shimmer', gender: 'female', description: 'soft, clear' },
];

export function createOpenAiTts(apiKey: string, model: string): TtsProvider {
  const headers = { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' };
  return {
    id: 'openai',
    listVoices: async () => OPENAI_VOICES,
    async listModels() {
      const res = await providerFetch('https://api.openai.com/v1/models', { headers });
      const data = (await res.json()) as { data: Array<{ id: string }> };
      return data.data.map((m) => m.id).filter((id) => /tts/i.test(id)).sort();
    },
    async prepare(text, voice, options) {
      const res = await providerFetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers,
        signal: options.signal,
        body: JSON.stringify({ model, voice, input: text, response_format: 'mp3', speed: options.speed }),
      });
      const audio = await res.arrayBuffer();
      return { play: () => playClip(audio, 'voice', { signal: options.signal }) };
    },
  };
}

export function createElevenLabsTts(apiKey: string, model: string): TtsProvider {
  const headers = { 'xi-api-key': apiKey, 'content-type': 'application/json' };
  return {
    id: 'elevenlabs',
    async listVoices() {
      const res = await providerFetch('https://api.elevenlabs.io/v1/voices', { headers });
      const data = (await res.json()) as { voices?: Array<{ voice_id: string; name: string; labels?: Record<string, string> }> };
      return (data.voices ?? []).map((v) => ({
        id: v.voice_id,
        name: v.name,
        gender: v.labels?.gender ?? '',
        description: [v.labels?.age, v.labels?.accent, v.labels?.description].filter(Boolean).join(', '),
      }));
    },
    async listModels() {
      const res = await providerFetch('https://api.elevenlabs.io/v1/models', { headers });
      const data = (await res.json()) as Array<{ model_id: string; can_do_text_to_speech?: boolean }>;
      return data.filter((m) => m.can_do_text_to_speech !== false).map((m) => m.model_id);
    },
    async prepare(text, voice, options) {
      const res = await providerFetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers,
        signal: options.signal,
        body: JSON.stringify({ text, ...(model ? { model_id: model } : {}) }),
      });
      const audio = await res.arrayBuffer();
      // ElevenLabs has no speed parameter on every model, so speed is applied at playback.
      return { play: () => playClip(audio, 'voice', { signal: options.signal, rate: options.speed }) };
    },
  };
}

function browserVoices(): Promise<SpeechSynthesisVoice[]> {
  const synth = globalThis.speechSynthesis;
  if (!synth) return Promise.resolve([]);
  const now = synth.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(synth.getVoices());
    synth.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1200);
  });
}

/** The free fallback: the browser's built-in speech synthesis. */
export function createBrowserTts(): TtsProvider {
  return {
    id: 'browser',
    async listVoices() {
      const voices = await browserVoices();
      const lang = (navigator.language || 'en').slice(0, 2);
      return voices
        .filter((v) => v.lang.startsWith(lang) || v.lang.startsWith('en'))
        .map((v) => ({ id: v.voiceURI, name: `${v.name} (${v.lang})`, description: v.localService ? 'on this device' : 'online' }));
    },
    listModels: async () => [],
    async prepare(text, voice, options) {
      const synth = globalThis.speechSynthesis;
      if (!synth) throw new ProviderError('bad_request', 'This browser has no built-in speech.');
      const voices = await browserVoices();
      return {
        play: () =>
          new Promise<void>((resolve) => {
            if (options.signal?.aborted) return resolve();
            const utterance = new SpeechSynthesisUtterance(text);
            const chosen = voices.find((v) => v.voiceURI === voice);
            if (chosen) utterance.voice = chosen;
            utterance.rate = options.speed;
            const stop = () => {
              synth.cancel();
              resolve();
            };
            utterance.onend = utterance.onerror = () => {
              options.signal?.removeEventListener('abort', stop);
              resolve();
            };
            options.signal?.addEventListener('abort', stop, { once: true });
            synth.speak(utterance);
          }),
      };
    },
  };
}

export interface VoiceSettingsLike {
  provider: 'auto' | TtsProviderId;
  model: string;
}

/** Which provider "auto" means for the keys available: OpenAI, then ElevenLabs, then the browser. */
export function resolveTtsProvider(setting: VoiceSettingsLike['provider'], keys: { openai: string; elevenlabs: string }): TtsProviderId {
  if (setting === 'openai' && keys.openai) return 'openai';
  if (setting === 'elevenlabs' && keys.elevenlabs) return 'elevenlabs';
  if (setting === 'browser') return 'browser';
  if (setting === 'auto') return keys.openai ? 'openai' : keys.elevenlabs ? 'elevenlabs' : 'browser';
  return 'browser';
}

export const DEFAULT_TTS_MODEL: Record<TtsProviderId, string> = { openai: 'gpt-4o-mini-tts', elevenlabs: '', browser: '' };

let override: TtsProvider | null = null;
/** Tests substitute a fake TTS provider. */
export function setTtsOverride(provider: TtsProvider | null): void {
  override = provider;
}

export function getTtsProvider(settings: VoiceSettingsLike, keys: { openai: string; elevenlabs: string }): TtsProvider {
  if (override) return override;
  const id = resolveTtsProvider(settings.provider, keys);
  const model = settings.model || DEFAULT_TTS_MODEL[id];
  if (id === 'openai') return createOpenAiTts(keys.openai, model);
  if (id === 'elevenlabs') return createElevenLabsTts(keys.elevenlabs, model);
  return createBrowserTts();
}

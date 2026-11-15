import { getAudioBus, resumeAudio, setBusVolume } from './bus';
import type { Catalog } from './tracks';

const buffers = new Map<string, Promise<AudioBuffer>>();

/** Decodes an audio file once and caches the result for the session. */
export function loadBuffer(key: string, load: () => Promise<ArrayBuffer>): Promise<AudioBuffer> {
  let hit = buffers.get(key);
  if (!hit) {
    const bus = getAudioBus();
    if (!bus) return Promise.reject(new Error('Web Audio is not available'));
    hit = load().then((data) => bus.ctx.decodeAudioData(data));
    buffers.set(key, hit);
    hit.catch(() => buffers.delete(key));
  }
  return hit;
}

export interface LoopStep {
  /** When this copy starts, relative to the first start. */
  start: number;
  /** When the next copy starts and this one begins to fade out. */
  handover: number;
}

/** Times at which a looping track restarts with a crossfade. Pure, for testing. */
export function loopSchedule(duration: number, crossfade: number, count: number): LoopStep[] {
  const xf = Math.min(crossfade, duration / 3);
  return Array.from({ length: count }, (_, i) => ({ start: i * (duration - xf), handover: (i + 1) * (duration - xf) }));
}

interface Playing {
  key: string;
  out: GainNode;
  sources: AudioBufferSourceNode[];
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * Plays one music track at a time on the music bus. Tracks loop with a crossfade (long enough to smooth
 * over the ending of a full song), and a change of track crossfades from the old one to the new one.
 */
export class MusicManager {
  private playing: Playing | null = null;
  private requested: string | null = null;

  get currentKey(): string | null {
    return this.requested;
  }

  async play(key: string, load: () => Promise<ArrayBuffer>, options: { gain: number; crossfade: number; fadeIn?: number }): Promise<void> {
    if (this.requested === key) return;
    this.requested = key;
    const bus = getAudioBus();
    if (!bus) return;
    let buffer: AudioBuffer;
    try {
      buffer = await loadBuffer(key, load);
    } catch {
      if (this.requested === key) this.requested = null;
      return;
    }
    if (this.requested !== key) return;
    const { ctx } = bus;
    const fade = options.fadeIn ?? 2.5;
    this.fadeOut(fade);
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, ctx.currentTime);
    out.gain.linearRampToValueAtTime(options.gain, ctx.currentTime + fade);
    out.connect(bus.music);
    const playing: Playing = { key, out, sources: [], timer: null };
    this.playing = playing;
    const xf = Math.min(options.crossfade, buffer.duration / 3);
    const startCopy = (at: number, fadeInFor: number) => {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const g = ctx.createGain();
      g.gain.setValueAtTime(fadeInFor > 0 ? 0 : 1, at);
      if (fadeInFor > 0) g.gain.linearRampToValueAtTime(1, at + fadeInFor);
      source.connect(g).connect(out);
      source.start(at);
      playing.sources.push(source);
      // Hand over to the next copy before this one ends; the two fades always add up to full level.
      const handover = at + buffer.duration - xf;
      g.gain.setValueAtTime(1, handover);
      g.gain.linearRampToValueAtTime(0, handover + xf);
      source.stop(handover + xf + 0.05);
      source.onended = () => {
        playing.sources = playing.sources.filter((s) => s !== source);
      };
      const wait = Math.max(0, (handover - ctx.currentTime - 1.5) * 1000);
      playing.timer = setTimeout(() => {
        if (this.playing === playing) startCopy(handover, xf);
      }, wait);
    };
    startCopy(ctx.currentTime + 0.05, 0);
  }

  private fadeOut(seconds: number): void {
    const old = this.playing;
    const bus = getAudioBus();
    if (!old || !bus) return;
    this.playing = null;
    if (old.timer) clearTimeout(old.timer);
    const now = bus.ctx.currentTime;
    old.out.gain.cancelScheduledValues(now);
    old.out.gain.setValueAtTime(old.out.gain.value, now);
    old.out.gain.linearRampToValueAtTime(0, now + seconds);
    for (const s of old.sources) {
      try {
        s.stop(now + seconds + 0.05);
      } catch {
        // already stopping
      }
    }
    setTimeout(() => old.out.disconnect(), (seconds + 0.2) * 1000);
  }

  stop(seconds = 1.5): void {
    this.requested = null;
    this.fadeOut(seconds);
  }
}

let catalogPromise: Promise<Catalog> | null = null;
const base = () => `${import.meta.env.BASE_URL}content/audio/`;

export function loadCatalog(): Promise<Catalog> {
  catalogPromise ??= fetch(`${base()}tracks.json`).then((r) => {
    if (!r.ok) throw new Error(`Could not load the music list (${r.status})`);
    return r.json() as Promise<Catalog>;
  });
  catalogPromise.catch(() => (catalogPromise = null));
  return catalogPromise;
}

export function audioUrl(file: string): string {
  return `${base()}${file}`;
}

export async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  return res.arrayBuffer();
}

/** Plays a one-shot sound effect from the catalogue on the effects bus. */
export async function playSfx(file: string, volume = 1): Promise<void> {
  const bus = getAudioBus();
  if (!bus || bus.ctx.state !== 'running') return;
  try {
    const buffer = await loadBuffer(`sfx:${file}`, () => fetchArrayBuffer(audioUrl(file)));
    const source = bus.ctx.createBufferSource();
    source.buffer = buffer;
    const g = bus.ctx.createGain();
    g.gain.value = Math.max(0, Math.min(1, volume));
    source.connect(g).connect(bus.sfx);
    source.start();
  } catch {
    // A missing sound effect never interrupts the game.
  }
}

/** Applies the user's volume settings to the buses. */
export function applyVolumes(audio: { musicVolume: number; sfxVolume: number; muted: boolean }): void {
  setBusVolume('music', audio.muted ? 0 : audio.musicVolume);
  setBusVolume('sfx', audio.muted ? 0 : audio.sfxVolume);
}

/** Browsers start audio suspended until the page is used: resume on the first interaction. */
export function unlockAudioOnGesture(): () => void {
  const unlock = () => void resumeAudio();
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  return () => {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
}

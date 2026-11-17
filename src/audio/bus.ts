// The app's audio graph: music, sound effects and voice each have a gain bus feeding the master output.
// Music ducks (drops in volume) while the Dungeon Master is speaking.

export interface AudioBus {
  ctx: AudioContext;
  master: GainNode;
  music: GainNode;
  /** Sits between the music bus and the master: lowered while a voice is speaking. */
  duck: GainNode;
  sfx: GainNode;
  voice: GainNode;
}

let bus: AudioBus | null = null;

export const DUCKED_LEVEL = 0.28;

/** Creates the audio graph on first use. Browsers only allow this after a user gesture. */
export function getAudioBus(): AudioBus | null {
  if (bus) return bus;
  const Ctor = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  const ctx = new Ctor();
  const master = ctx.createGain();
  const music = ctx.createGain();
  const duck = ctx.createGain();
  const sfx = ctx.createGain();
  const voice = ctx.createGain();
  music.connect(duck).connect(master);
  sfx.connect(master);
  voice.connect(master);
  master.connect(ctx.destination);
  bus = { ctx, master, music, duck, sfx, voice };
  return bus;
}

/** Resumes audio after a user gesture (autoplay policies start contexts suspended). */
export async function resumeAudio(): Promise<void> {
  const b = getAudioBus();
  if (b && b.ctx.state === 'suspended') await b.ctx.resume().catch(() => undefined);
}

function ramp(param: AudioParam, value: number, ctx: AudioContext, seconds: number): void {
  const now = ctx.currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(value, now + seconds);
}

let duckers = 0;
let hushers = 0;

/** The music level the duck gain should sit at: silent under a preview, lowered under a voice, else full. */
export function duckLevel(): number {
  return hushers > 0 ? 0 : duckers > 0 ? DUCKED_LEVEL : 1;
}

function applyDuck(lowering: boolean): void {
  const b = getAudioBus();
  if (b) ramp(b.duck.gain, duckLevel(), b.ctx, lowering ? 0.25 : 0.7);
}

/** Lowers the music while something is speaking. Calls nest: music returns when every speaker has finished. */
export function setDucked(on: boolean): void {
  duckers = Math.max(0, duckers + (on ? 1 : -1));
  applyDuck(on);
}

/** Fades the music out while another track (a music preview) plays over it. Calls nest like setDucked. */
export function setHushed(on: boolean): void {
  hushers = Math.max(0, hushers + (on ? 1 : -1));
  applyDuck(on);
}

export function setBusVolume(which: 'music' | 'sfx' | 'voice' | 'master', value: number): void {
  const b = getAudioBus();
  if (b) ramp(b[which].gain, Math.max(0, Math.min(1, value)), b.ctx, 0.15);
}

/** Plays an encoded audio clip (mp3, ogg, wav...) on a bus. Resolves when it ends; `stop` cuts it short. */
export async function playClip(data: ArrayBuffer, which: 'sfx' | 'voice', options: { rate?: number; signal?: AbortSignal; volume?: number } = {}): Promise<void> {
  const b = getAudioBus();
  if (!b) return;
  await resumeAudio();
  const buffer = await b.ctx.decodeAudioData(data.slice(0));
  if (options.signal?.aborted) return;
  const source = b.ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = options.rate ?? 1;
  const gain = b.ctx.createGain();
  gain.gain.value = options.volume ?? 1;
  source.connect(gain).connect(b[which]);
  await new Promise<void>((resolve) => {
    const stop = () => {
      try {
        source.stop();
      } catch {
        // already stopped
      }
      resolve();
    };
    source.onended = () => {
      options.signal?.removeEventListener('abort', stop);
      resolve();
    };
    options.signal?.addEventListener('abort', stop, { once: true });
    source.start();
  });
}

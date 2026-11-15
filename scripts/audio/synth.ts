// A small offline synthesizer for composing TaleForge's own music and sound effects.
// Everything is deterministic (seeded), so tracks can be re-rendered identically.

export const SR = 44100;

export class Rand {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  pick<T>(list: T[]): T {
    return list[Math.floor(this.next() * list.length)]!;
  }
}

export const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** A stereo mix buffer with a little tail room. */
export class Mix {
  readonly L: Float32Array;
  readonly R: Float32Array;
  constructor(readonly seconds: number) {
    const n = Math.ceil(seconds * SR);
    this.L = new Float32Array(n);
    this.R = new Float32Array(n);
  }
  get length(): number {
    return this.L.length;
  }
  /** Adds a mono signal starting at time t with constant-power pan (-1..1). */
  add(t: number, signal: Float32Array, gain = 1, pan = 0): void {
    const start = Math.round(t * SR);
    const a = ((pan + 1) * Math.PI) / 4;
    const gl = Math.cos(a) * gain;
    const gr = Math.sin(a) * gain;
    const end = Math.min(signal.length, this.L.length - start);
    for (let i = Math.max(0, -start); i < end; i++) {
      this.L[start + i]! += signal[i]! * gl;
      this.R[start + i]! += signal[i]! * gr;
    }
  }
  addMix(other: Mix, gain = 1): void {
    for (let i = 0; i < Math.min(this.length, other.length); i++) {
      this.L[i]! += other.L[i]! * gain;
      this.R[i]! += other.R[i]! * gain;
    }
  }
}

/** Attack-decay-sustain-release envelope, sample by sample. */
export function adsr(n: number, a: number, d: number, s: number, r: number, hold: number): Float32Array {
  const env = new Float32Array(n);
  const A = a * SR;
  const D = d * SR;
  const H = hold * SR;
  const R = r * SR;
  for (let i = 0; i < n; i++) {
    let v: number;
    if (i < A) v = i / A;
    else if (i < A + D) v = 1 - (1 - s) * ((i - A) / D);
    else if (i < H) v = s;
    else v = s * Math.max(0, 1 - (i - H) / R);
    env[i] = v;
  }
  return env;
}

/** Band-limited additive oscillator: `partial(k)` gives the amplitude of harmonic k (1-based). */
function additive(freq: number, n: number, partial: (k: number) => number, maxHz = 9000, detuneCents = 0, vibrato = 0, vibRate = 5.2): Float32Array {
  const out = new Float32Array(n);
  const f0 = freq * 2 ** (detuneCents / 1200);
  const K = Math.max(1, Math.floor(maxHz / f0));
  const amps: number[] = [];
  for (let k = 1; k <= K; k++) amps.push(partial(k));
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = f0 * (1 + vibrato * Math.sin(2 * Math.PI * vibRate * t) * Math.min(1, t * 2));
    phase += (2 * Math.PI * f) / SR;
    let v = 0;
    for (let k = 0; k < amps.length; k++) if (amps[k]) v += amps[k]! * Math.sin((k + 1) * phase);
    out[i] = v;
  }
  return out;
}

export const saw = (k: number) => 1 / k;
export const square = (k: number) => (k % 2 ? 1 / k : 0);
export const triangle = (k: number) => (k % 2 ? ((k - 1) / 2) % 2 ? -1 / (k * k) : 1 / (k * k) : 0);

export function lowpass(x: Float32Array, cutoff: number | ((i: number) => number)): Float32Array {
  const out = new Float32Array(x.length);
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    const c = typeof cutoff === 'number' ? cutoff : cutoff(i);
    const a = 1 - Math.exp((-2 * Math.PI * c) / SR);
    y += a * (x[i]! - y);
    out[i] = y;
  }
  return out;
}

export function highpass(x: Float32Array, cutoff: number): Float32Array {
  const low = lowpass(x, cutoff);
  return x.map((v, i) => v - low[i]!);
}

function mul(a: Float32Array, b: Float32Array): Float32Array {
  for (let i = 0; i < a.length; i++) a[i]! *= b[i]!;
  return a;
}

function noise(n: number, rand: Rand): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = rand.next() * 2 - 1;
  return out;
}

// ---------------------------------------------------------------- instruments

/** Warm detuned string/synth pad. */
export function pad(midi: number, dur: number, opts: { attack?: number; release?: number; bright?: number; shape?: (k: number) => number } = {}): Float32Array {
  const attack = opts.attack ?? 1.2;
  const release = opts.release ?? 2;
  const n = Math.ceil((dur + release) * SR);
  const f = mtof(midi);
  const shape = opts.shape ?? saw;
  const a = additive(f, n, shape, 6000, -7, 0.003, 4.1);
  const b = additive(f, n, shape, 6000, 7, 0.003, 4.7);
  for (let i = 0; i < n; i++) a[i] = (a[i]! + b[i]!) * 0.5;
  const out = lowpass(a, (opts.bright ?? 1) * Math.min(2600, f * 5));
  return mul(out, adsr(n, attack, 0.5, 0.85, release, dur));
}

/** Karplus-Strong plucked string (harp, guitar, upright bass). */
export function pluck(midi: number, dur: number, rand: Rand, opts: { damping?: number; bright?: number } = {}): Float32Array {
  const n = Math.ceil((dur + 0.4) * SR);
  const period = Math.max(2, Math.round(SR / mtof(midi)));
  const ring = noise(period, rand);
  const smoothed = lowpass(ring, 3000 * (opts.bright ?? 1));
  const buf = Float32Array.from(smoothed);
  const out = new Float32Array(n);
  const damping = opts.damping ?? 0.996;
  let idx = 0;
  for (let i = 0; i < n; i++) {
    const next = (idx + 1) % period;
    const v = buf[idx]!;
    out[i] = v;
    buf[idx] = damping * 0.5 * (v + buf[next]!);
    idx = next;
  }
  return mul(out, adsr(n, 0.002, 0.05, 1, 0.35, dur));
}

/** FM bell / vibraphone / sonar ping. */
export function bell(midi: number, dur: number, opts: { ratio?: number; index?: number; decay?: number } = {}): Float32Array {
  const n = Math.ceil(dur * SR);
  const f = mtof(midi);
  const ratio = opts.ratio ?? 3.5;
  const index = opts.index ?? 2.2;
  const decay = opts.decay ?? 1.6;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.exp(-t / decay) * Math.min(1, t / 0.003);
    const mod = index * Math.exp(-t / (decay * 0.4)) * Math.sin(2 * Math.PI * f * ratio * t);
    out[i] = env * Math.sin(2 * Math.PI * f * t + mod);
  }
  return out;
}

/** Soft piano-like tone: slightly inharmonic partials with per-partial decay. */
export function piano(midi: number, dur: number): Float32Array {
  const n = Math.ceil((dur + 1.2) * SR);
  const f = mtof(midi);
  const out = new Float32Array(n);
  const B = 0.0004;
  for (let k = 1; k <= 10; k++) {
    const fk = f * k * Math.sqrt(1 + B * k * k);
    if (fk > 9000) break;
    const amp = (1 / k ** 1.4) * (k === 1 ? 1 : 0.8);
    const decay = 1.6 / (1 + k * 0.35);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      out[i]! += amp * Math.exp(-t / decay) * Math.sin(2 * Math.PI * fk * t);
    }
  }
  return mul(out, adsr(n, 0.004, 0.1, 1, 0.4, dur));
}

/** Breathy flute / ocarina lead. */
export function flute(midi: number, dur: number, rand: Rand): Float32Array {
  const n = Math.ceil((dur + 0.25) * SR);
  const tone = additive(mtof(midi), n, (k) => (k === 1 ? 1 : k === 2 ? 0.22 : k === 3 ? 0.08 : 0), 9000, 0, 0.006, 5.3);
  const breath = lowpass(highpass(noise(n, rand), 900), 3500);
  for (let i = 0; i < n; i++) tone[i] = tone[i]! + breath[i]! * 0.06;
  return mul(tone, adsr(n, 0.08, 0.1, 0.85, 0.2, dur));
}

/** Brass-like lead (fanfares, muted trumpet with a lower cutoff). */
export function brass(midi: number, dur: number, opts: { mute?: boolean } = {}): Float32Array {
  const n = Math.ceil((dur + 0.2) * SR);
  const f = mtof(midi);
  const raw = additive(f, n, saw, 8000, 0, 0.004, 5.5);
  const env = adsr(n, 0.05, 0.15, 0.75, 0.18, dur);
  const out = lowpass(raw, (i) => (opts.mute ? 900 : 1600) + env[i]! * (opts.mute ? 700 : 2600));
  return mul(out, env);
}

/** Round bass: sine plus a little of a filtered saw. */
export function bass(midi: number, dur: number, opts: { bite?: number } = {}): Float32Array {
  const n = Math.ceil((dur + 0.15) * SR);
  const f = mtof(midi);
  const s = additive(f, n, (k) => (k === 1 ? 1 : (opts.bite ?? 0.3) / k), 2500);
  return mul(lowpass(s, 900), adsr(n, 0.008, 0.2, 0.7, 0.12, dur));
}

/** Analogue-style synth tone for arpeggios and stabs. */
export function synth(midi: number, dur: number, opts: { cutoff?: number; shape?: (k: number) => number; release?: number } = {}): Float32Array {
  const n = Math.ceil((dur + (opts.release ?? 0.15)) * SR);
  const f = mtof(midi);
  const raw = additive(f, n, opts.shape ?? square, 9000, 4);
  const env = adsr(n, 0.004, 0.18, 0.4, opts.release ?? 0.15, dur);
  const out = lowpass(raw, (i) => 400 + env[i]! * (opts.cutoff ?? 3200));
  return mul(out, env);
}

// ---------------------------------------------------------------- percussion

export function kick(): Float32Array {
  const n = Math.ceil(0.45 * SR);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 48 + 110 * Math.exp(-t / 0.035);
    phase += (2 * Math.PI * f) / SR;
    out[i] = Math.sin(phase) * Math.exp(-t / 0.16) * 1.1;
  }
  return out;
}

/** Big drum: taiko / frame drum / timpani depending on the pitch and decay. */
export function drum(pitch: number, decay: number, rand: Rand, skin = 0.25): Float32Array {
  const n = Math.ceil(decay * 4 * SR);
  const out = new Float32Array(n);
  const hit = lowpass(noise(n, rand), 1200);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    phase += (2 * Math.PI * pitch * (1 + 0.5 * Math.exp(-t / 0.02))) / SR;
    out[i] = Math.sin(phase) * Math.exp(-t / decay) + hit[i]! * skin * Math.exp(-t / 0.03);
  }
  return out;
}

export function snare(rand: Rand, decay = 0.12): Float32Array {
  const n = Math.ceil(0.35 * SR);
  const nz = highpass(noise(n, rand), 1500);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    out[i] = nz[i]! * Math.exp(-t / decay) * 0.8 + Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t / 0.05) * 0.5;
  }
  return out;
}

export function hat(rand: Rand, decay = 0.035): Float32Array {
  const n = Math.ceil(0.15 * SR);
  const nz = highpass(noise(n, rand), 7000);
  return nz.map((v, i) => v * Math.exp(-i / SR / decay) * 0.6);
}

/** Jazz brush swish on a snare. */
export function brush(rand: Rand, dur = 0.22): Float32Array {
  const n = Math.ceil(dur * SR);
  const nz = lowpass(highpass(noise(n, rand), 2000), 6000);
  return nz.map((v, i) => {
    const t = i / SR;
    return v * Math.sin(Math.PI * Math.min(1, t / dur)) * 0.5;
  });
}

// ---------------------------------------------------------------- effects

class Comb {
  private buf: Float32Array;
  private i = 0;
  private store = 0;
  constructor(size: number, private feedback: number, private damp: number) {
    this.buf = new Float32Array(size);
  }
  process(x: number): number {
    const y = this.buf[this.i]!;
    this.store = y * (1 - this.damp) + this.store * this.damp;
    this.buf[this.i] = x + this.store * this.feedback;
    this.i = (this.i + 1) % this.buf.length;
    return y;
  }
}

class Allpass {
  private buf: Float32Array;
  private i = 0;
  constructor(size: number) {
    this.buf = new Float32Array(size);
  }
  process(x: number): number {
    const b = this.buf[this.i]!;
    this.buf[this.i] = x + b * 0.5;
    this.i = (this.i + 1) % this.buf.length;
    return b - x;
  }
}

/** Freeverb-style stereo reverb, mixed in place. */
export function reverb(mix: Mix, wet: number, room = 0.84, damp = 0.3): void {
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const aps = [556, 441, 341, 225];
  for (const [ch, spread] of [
    [mix.L, 0],
    [mix.R, 23],
  ] as const) {
    const cs = combs.map((s) => new Comb(s + spread, room, damp));
    const as = aps.map((s) => new Allpass(s + spread));
    const dry = Float32Array.from(ch);
    for (let i = 0; i < ch.length; i++) {
      const x = dry[i]! * 0.015;
      let y = 0;
      for (const c of cs) y += c.process(x);
      for (const a of as) y = a.process(y);
      ch[i] = dry[i]! + y * wet;
    }
  }
}

/** Folds everything after `loopSeconds` back onto the start so the loop is seamless, then masters. */
export function finish(mix: Mix, loopSeconds: number | null, targetPeak = 0.89): { L: Float32Array; R: Float32Array } {
  let L = mix.L;
  let R = mix.R;
  if (loopSeconds !== null) {
    const n = Math.round(loopSeconds * SR);
    L = new Float32Array(n);
    R = new Float32Array(n);
    for (let i = 0; i < mix.length; i++) {
      L[i % n]! += mix.L[i]!;
      R[i % n]! += mix.R[i]!;
    }
  }
  // Gentle saturation then normalise.
  const sat = (v: number) => Math.tanh(v * 1.2) / Math.tanh(1.2);
  let peak = 1e-9;
  for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]!), Math.abs(R[i]!));
  const pre = 1 / peak;
  let peak2 = 1e-9;
  for (let i = 0; i < L.length; i++) {
    L[i] = sat(L[i]! * pre);
    R[i] = sat(R[i]! * pre);
    peak2 = Math.max(peak2, Math.abs(L[i]!), Math.abs(R[i]!));
  }
  const g = targetPeak / peak2;
  for (let i = 0; i < L.length; i++) {
    L[i]! *= g;
    R[i]! *= g;
  }
  if (loopSeconds === null) {
    // One-shots: short fade at the very end so nothing clicks.
    const f = Math.min(L.length, Math.round(0.02 * SR));
    for (let i = 0; i < f; i++) {
      const k = i / f;
      L[L.length - 1 - i]! *= k;
      R[R.length - 1 - i]! *= k;
    }
  }
  return { L, R };
}

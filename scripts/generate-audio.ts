// npm run generate:audio [-- <id> ...]
// Composes TaleForge's own music loops and sound effects with the synthesizer in scripts/audio/synth.ts,
// writes WAV and encodes AAC .m4a with macOS afconvert into public/content/audio/. Deterministic.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Mix, Rand, SR, bass, bell, brass, brush, drum, finish, flute, hat, kick, pad, piano, pluck, reverb, saw, snare, synth, triangle } from './audio/synth';
import { writeWav } from './lib/wav';

interface Piece {
  id: string;
  kind: 'music' | 'sfx';
  /** Loop length in seconds, or null for a one-shot. */
  render(): { mix: Mix; loop: number | null };
}

const ROOT = join(process.cwd(), 'public/content/audio');

/** Plays a chord's notes from the given array with a slight strum. */
function chord(mix: Mix, t: number, notes: number[], dur: number, voice: (m: number, d: number) => Float32Array, gain: number, spread = 0.5): void {
  notes.forEach((m, i) => mix.add(t + i * 0.012, voice(m, dur), gain / Math.sqrt(notes.length), (i / Math.max(1, notes.length - 1) - 0.5) * spread));
}

/** Melody from [midi|null, beats] pairs. */
function melody(mix: Mix, start: number, beat: number, notes: Array<[number | null, number]>, voice: (m: number, d: number) => Float32Array, gain: number, pan = 0): number {
  let t = start;
  for (const [m, beats] of notes) {
    if (m !== null) mix.add(t, voice(m, beats * beat * 0.92), gain, pan);
    t += beats * beat;
  }
  return t;
}

const PIECES: Piece[] = [
  {
    id: 'fantasy-exploration',
    kind: 'music',
    render() {
      const bpm = 92;
      const b = 60 / bpm;
      const bars = 16;
      const loop = bars * 4 * b;
      const mix = new Mix(loop + 6);
      const rand = new Rand(11);
      // D dorian: Dm G C Am F C G Am, two bars each.
      const prog = [
        [50, 53, 57, 62],
        [43, 50, 55, 59],
        [48, 52, 55, 60],
        [45, 52, 57, 60],
        [41, 48, 53, 57],
        [48, 52, 55, 64],
        [43, 50, 55, 62],
        [45, 52, 57, 64],
      ];
      prog.forEach((c, i) => {
        const t = i * 8 * b;
        chord(mix, t, c.slice(1).map((m) => m + 12), 8 * b, (m, d) => pad(m, d, { attack: 1.6, bright: 0.8 }), 0.32);
        mix.add(t, bass(c[0]! - 12, 3.8 * b), 0.42);
        mix.add(t + 4 * b, bass(c[0]! - 12 + 7, 3.8 * b), 0.32);
        // Harp: rising and falling eighth notes over two octaves.
        const arp = [...c.slice(1).map((m) => m + 12), ...c.slice(1).map((m) => m + 24)];
        const order = [0, 1, 2, 3, 4, 5, 4, 3, 1, 2, 3, 4, 5, 4, 2, 1];
        order.forEach((k, j) => mix.add(t + j * 0.5 * b, pluck(arp[k % arp.length]!, 1.4, rand, { damping: 0.997 }), 0.2, j % 2 ? 0.35 : -0.25));
        // Frame drum: a soft heartbeat on 1 and the "and" of 3.
        for (let bar = 0; bar < 2; bar++) {
          mix.add(t + bar * 4 * b, drum(78, 0.18, rand, 0.3), 0.35, -0.1);
          mix.add(t + bar * 4 * b + 2.5 * b, drum(92, 0.12, rand, 0.25), 0.22, 0.1);
        }
      });
      // A wandering flute melody over the second half.
      const tune: Array<[number | null, number]> = [
        [null, 4], [69, 1.5], [72, 0.5], [74, 2], [72, 1], [71, 1], [67, 3], [null, 1],
        [69, 1], [71, 1], [72, 1.5], [74, 0.5], [76, 3], [74, 1], [72, 2], [71, 2], [69, 4],
      ];
      melody(mix, 32 * b, b, tune, (m, d) => flute(m, d, rand), 0.33, 0.15);
      reverb(mix, 0.55, 0.86);
      return { mix, loop };
    },
  },
  {
    id: 'fantasy-tension',
    kind: 'music',
    render() {
      const bpm = 68;
      const b = 60 / bpm;
      const loop = 16 * 4 * b;
      const mix = new Mix(loop + 7);
      const rand = new Rand(12);
      for (let bar = 0; bar < 16; bar += 4) {
        const t = bar * 4 * b;
        chord(mix, t, [40, 47, 52], 16 * b, (m, d) => pad(m, d, { attack: 3, bright: 0.6 }), 0.42, 0.8);
      }
      for (let bar = 0; bar < 16; bar++) {
        const t = bar * 4 * b;
        // Heartbeat.
        mix.add(t, drum(56, 0.22, rand, 0.15), 0.5);
        mix.add(t + 0.42 * b, drum(52, 0.2, rand, 0.12), 0.38);
        // Uneasy semitone in the strings: F against E.
        if (bar % 2 === 1) {
          mix.add(t + 2 * b, pad(65, 1.8 * b, { attack: 0.4, release: 1.2, bright: 0.9 }), 0.16, 0.4);
          mix.add(t + 3.5 * b, pad(64, 1.8 * b, { attack: 0.4, release: 1.4, bright: 0.9 }), 0.14, 0.4);
        }
        if (bar % 4 === 3) mix.add(t + 1 * b, bell(77, 3.5, { ratio: 2.76, index: 1.2, decay: 1.4 }), 0.1, -0.5);
        // Low plucked pulse.
        for (let k = 0; k < 4; k++) mix.add(t + k * b, pluck(28, 0.5, rand, { damping: 0.99, bright: 0.4 }), 0.22);
      }
      reverb(mix, 0.7, 0.9);
      return { mix, loop };
    },
  },
  {
    id: 'fantasy-combat',
    kind: 'music',
    render() {
      const bpm = 138;
      const b = 60 / bpm;
      const bars = 32;
      const loop = bars * 4 * b;
      const mix = new Mix(loop + 5);
      const rand = new Rand(13);
      const roots = [38, 34, 36, 33];
      const chords = [
        [62, 65, 69],
        [58, 62, 65],
        [60, 64, 67],
        [57, 61, 64],
      ];
      for (let bar = 0; bar < bars; bar++) {
        const t = bar * 4 * b;
        const ci = Math.floor(bar / 2) % 4;
        const root = roots[ci]!;
        // Driving low-string ostinato.
        const cell = [0, 0, 12, 0, 0, 0, 10, 12];
        cell.forEach((iv, k) => mix.add(t + k * 0.5 * b, synth(root + iv, 0.42 * b, { shape: saw, cutoff: 1400, release: 0.05 }), 0.2, -0.2));
        mix.add(t, bass(root - 12, 1.8 * b, { bite: 0.5 }), 0.4);
        // Taiko pattern.
        const hits: Array<[number, number, number]> = [
          [0, 62, 0.6],
          [1.5, 70, 0.35],
          [2, 62, 0.5],
          [3, 70, 0.4],
          [3.5, 75, 0.35],
        ];
        for (const [at, p, g] of hits) mix.add(t + at * b, drum(p, 0.25, rand, 0.4), g, (p - 66) / 20);
        if (bar % 2 === 0) chord(mix, t, chords[ci]!, 7.8 * b, (m, d) => pad(m, d, { attack: 0.5, bright: 1.1 }), 0.24);
      }
      // Brass call in the second half.
      const call: Array<[number | null, number]> = [
        [62, 1.5], [65, 0.5], [69, 2], [70, 1], [69, 1], [67, 2], [65, 1], [64, 1], [62, 4],
        [62, 1.5], [65, 0.5], [69, 2], [74, 2], [72, 1], [70, 1], [69, 2], [64, 4], [null, 4],
      ];
      melody(mix, 16 * 4 * b, b, call, (m, d) => brass(m, d), 0.26, 0.1);
      melody(mix, 16 * 4 * b, b, call, (m, d) => brass(m - 12, d), 0.16, -0.2);
      reverb(mix, 0.35, 0.8);
      return { mix, loop };
    },
  },
  {
    id: 'noir-streets',
    kind: 'music',
    render() {
      const bpm = 88;
      const b = 60 / bpm;
      const swing = (eighth: number) => (eighth % 2 ? 0.66 : 0) * b + Math.floor(eighth / 2) * b;
      const loop = 16 * 4 * b;
      const mix = new Mix(loop + 5);
      const rand = new Rand(21);
      // Cm7 Fm7 Bb7 Ebmaj7 Abmaj7 Dm7b5 G7 Cm7
      const prog: Array<{ walk: number[]; voicing: number[] }> = [
        { walk: [36, 39, 43, 41], voicing: [58, 63, 67, 70] },
        { walk: [41, 44, 48, 46], voicing: [56, 60, 63, 68] },
        { walk: [46, 50, 53, 51], voicing: [56, 62, 65, 68] },
        { walk: [39, 43, 46, 44], voicing: [55, 58, 62, 67] },
        { walk: [44, 48, 51, 49], voicing: [55, 60, 63, 67] },
        { walk: [38, 41, 44, 42], voicing: [56, 60, 62, 65] },
        { walk: [43, 47, 50, 48], voicing: [53, 59, 62, 65] },
        { walk: [36, 39, 43, 35], voicing: [58, 62, 63, 67] },
      ];
      prog.forEach((c, i) => {
        for (let bar = 0; bar < 2; bar++) {
          const t = (i * 2 + bar) * 4 * b;
          const walk = bar === 0 ? c.walk : [c.walk[2]!, c.walk[1]!, c.walk[0]! + 12, prog[(i + 1) % 8]!.walk[0]! + 1];
          walk.forEach((m, k) => mix.add(t + k * b, pluck(m, 0.95 * b, rand, { damping: 0.9965, bright: 0.45 }), 0.55, -0.15));
          // Ride pattern: ding, ding-a ding.
          for (const e of [0, 2, 3, 4, 6, 7]) mix.add(t + swing(e), hat(rand, e % 2 ? 0.05 : 0.12), e % 2 ? 0.1 : 0.16, 0.45);
          mix.add(t + 1 * b, brush(rand), 0.3, 0.2);
          mix.add(t + 3 * b, brush(rand), 0.3, 0.2);
          // Piano comps on the "and" of 2 and on 4.
          chord(mix, t + swing(3), c.voicing, 0.4 * b, piano, 0.2, 0.4);
          if (bar === 1) chord(mix, t + swing(6), c.voicing, 0.35 * b, piano, 0.14, 0.4);
        }
      });
      const line: Array<[number | null, number]> = [
        [null, 8], [67, 1.5], [70, 0.5], [72, 1], [70, 1], [67, 2], [65, 2], [63, 3], [null, 1],
        [null, 4], [63, 1], [65, 1], [67, 1.5], [70, 0.5], [68, 2], [67, 2], [62, 4], [60, 4], [null, 4],
      ];
      melody(mix, 16 * b, b, line, (m, d) => brass(m, d, { mute: true }), 0.24, -0.3);
      reverb(mix, 0.4, 0.82, 0.45);
      return { mix, loop };
    },
  },
  {
    id: 'noir-tension',
    kind: 'music',
    render() {
      const bpm = 64;
      const b = 60 / bpm;
      const loop = 12 * 4 * b;
      const mix = new Mix(loop + 7);
      const rand = new Rand(22);
      for (let bar = 0; bar < 12; bar++) {
        const t = bar * 4 * b;
        [50, 57, 58, 57].forEach((m, k) => mix.add(t + k * b, piano(m - 12, 0.9 * b), 0.38, -0.2));
        mix.add(t, bass(26, 3.6 * b), 0.38);
        mix.add(t + 1 * b, brush(rand, 0.4), 0.22, 0.3);
        mix.add(t + 3 * b, brush(rand, 0.4), 0.22, 0.3);
        if (bar % 2 === 1) {
          mix.add(t + 2.5 * b, bell(75, 3, { ratio: 4, index: 0.9, decay: 1.2 }), 0.13, 0.5);
          mix.add(t + 2.5 * b, bell(74, 3, { ratio: 4, index: 0.9, decay: 1.2 }), 0.1, 0.55);
        }
        if (bar % 4 === 0) chord(mix, t, [50, 53, 56], 15.5 * b, (m, d) => pad(m, d, { attack: 2.5, bright: 0.5 }), 0.22);
      }
      reverb(mix, 0.55, 0.88, 0.4);
      return { mix, loop };
    },
  },
  {
    id: 'noir-chase',
    kind: 'music',
    render() {
      const bpm = 168;
      const b = 60 / bpm;
      const bars = 32;
      const loop = bars * 4 * b;
      const mix = new Mix(loop + 4);
      const rand = new Rand(23);
      const roots = [41, 41, 46, 46, 41, 41, 48, 47];
      for (let bar = 0; bar < bars; bar++) {
        const t = bar * 4 * b;
        const r = roots[bar % 8]!;
        [r, r + 3, r + 7, r + 6].forEach((m, k) => mix.add(t + k * b, pluck(m - 12, 0.9 * b, rand, { damping: 0.995, bright: 0.5 }), 0.55, -0.15));
        for (let e = 0; e < 8; e++) mix.add(t + e * 0.5 * b + (e % 2 ? 0.08 * b : 0), hat(rand, 0.04), e % 2 ? 0.1 : 0.15, 0.4);
        mix.add(t + 1 * b, snare(rand, 0.09), 0.32, 0.15);
        mix.add(t + 3 * b, snare(rand, 0.09), 0.32, 0.15);
        if (bar % 2 === 1) mix.add(t + 3.5 * b, snare(rand, 0.05), 0.22, 0.15);
        mix.add(t, kick(), 0.4);
        if (bar % 4 === 3) chord(mix, t + 2.5 * b, [r + 12, r + 15, r + 18, r + 22], 0.4 * b, (m, d) => brass(m, d), 0.3);
      }
      const riff: Array<[number | null, number]> = [
        [65, 0.5], [68, 0.5], [72, 1], [70, 0.5], [68, 0.5], [65, 1], [null, 1], [63, 0.5], [65, 1.5], [null, 2],
      ];
      for (let rep = 0; rep < 4; rep++) melody(mix, (16 + rep * 4) * 4 * b, b, riff, (m, d) => brass(m, d, { mute: true }), 0.26, -0.25);
      reverb(mix, 0.25, 0.75);
      return { mix, loop };
    },
  },
  {
    id: 'scifi-exploration',
    kind: 'music',
    render() {
      const bpm = 100;
      const b = 60 / bpm;
      const bars = 16;
      const loop = bars * 4 * b;
      const mix = new Mix(loop + 7);
      const rand = new Rand(31);
      const prog = [
        [57, 64, 71, 72],
        [53, 60, 64, 69],
        [48, 55, 59, 64],
        [55, 62, 64, 71],
      ];
      for (let bar = 0; bar < bars; bar++) {
        const t = bar * 4 * b;
        const c = prog[Math.floor(bar / 4) % 4]!;
        if (bar % 4 === 0) chord(mix, t, c, 16 * b, (m, d) => pad(m, d, { attack: 2.2, bright: 0.9, shape: triangle }), 0.4, 1);
        if (bar % 2 === 0) mix.add(t, bass(c[0]! - 24, 7.6 * b, { bite: 0.15 }), 0.42);
        // Sixteenth-note arpeggio whose filter breathes over four bars.
        const open = 900 + 2600 * (0.5 - 0.5 * Math.cos((2 * Math.PI * (bar % 4)) / 4));
        for (let s = 0; s < 16; s++) {
          const note = c[[0, 1, 2, 3, 2, 1, 3, 2][s % 8]!]! + 12;
          mix.add(t + s * 0.25 * b, synth(note, 0.2 * b, { cutoff: open, release: 0.12 }), 0.12, s % 2 ? 0.45 : -0.45);
        }
        mix.add(t, kick(), 0.22);
        mix.add(t + 2 * b, kick(), 0.18);
        if (bar % 4 === 2) mix.add(t + 1.5 * b, bell(88, 3, { ratio: 1.41, index: 1.5, decay: 1.1 }), 0.08, 0.6);
        void rand;
      }
      reverb(mix, 0.6, 0.88);
      return { mix, loop };
    },
  },
  {
    id: 'scifi-tension',
    kind: 'music',
    render() {
      const bpm = 80;
      const b = 60 / bpm;
      const loop = 16 * 4 * b;
      const mix = new Mix(loop + 7);
      const rand = new Rand(32);
      for (let bar = 0; bar < 16; bar++) {
        const t = bar * 4 * b;
        for (let e = 0; e < 8; e++) mix.add(t + e * 0.5 * b, synth(28, 0.4 * b, { cutoff: 600 + (e % 4 === 0 ? 900 : 0), release: 0.08 }), 0.32);
        for (let s = 0; s < 16; s++) if (s % 4 !== 0) mix.add(t + s * 0.25 * b, hat(rand, 0.015), 0.07, 0.6);
        if (bar % 4 === 0) chord(mix, t, [52, 58, 63], 16 * b, (m, d) => pad(m, d, { attack: 3, bright: 0.7, shape: triangle }), 0.3, 1);
        // Sonar ping with an echo.
        if (bar % 2 === 0) {
          for (let echo = 0; echo < 3; echo++) mix.add(t + 1 * b + echo * 0.75 * b, bell(84, 2.2, { ratio: 1, index: 0.3, decay: 0.7 }), 0.14 * 0.45 ** echo, echo % 2 ? 0.5 : -0.5);
        }
      }
      reverb(mix, 0.65, 0.9);
      return { mix, loop };
    },
  },
  {
    id: 'scifi-combat',
    kind: 'music',
    render() {
      const bpm = 132;
      const b = 60 / bpm;
      const bars = 32;
      const loop = bars * 4 * b;
      const mix = new Mix(loop + 4);
      const rand = new Rand(33);
      const roots = [40, 36, 38, 35];
      for (let bar = 0; bar < bars; bar++) {
        const t = bar * 4 * b;
        const r = roots[Math.floor(bar / 2) % 4]!;
        for (let s = 0; s < 16; s++) mix.add(t + s * 0.25 * b, synth(r - 12 + (s % 4 === 3 ? 12 : 0), 0.2 * b, { cutoff: 1500, shape: saw, release: 0.04 }), 0.22);
        for (let k = 0; k < 4; k++) mix.add(t + k * b, kick(), 0.5);
        mix.add(t + 1 * b, snare(rand), 0.34, 0.1);
        mix.add(t + 3 * b, snare(rand), 0.34, 0.1);
        for (let e = 0; e < 8; e++) mix.add(t + e * 0.5 * b + 0.25 * b, hat(rand), 0.12, 0.5);
        if (bar >= 16) {
          for (let s = 0; s < 8; s++) mix.add(t + s * 0.5 * b, synth(r + 24 + [0, 7, 12, 15, 12, 7, 3, 7][s]!, 0.4 * b, { cutoff: 3000, release: 0.1 }), 0.1, s % 2 ? 0.5 : -0.5);
        }
        if (bar % 2 === 0) chord(mix, t, [r + 24, r + 31, r + 36], 0.3 * b, (m, d) => synth(m, d, { shape: saw, cutoff: 4000 }), 0.22);
      }
      reverb(mix, 0.3, 0.8);
      return { mix, loop };
    },
  },
  {
    id: 'calm-hearth',
    kind: 'music',
    render() {
      const bpm = 72;
      const b = 60 / bpm;
      const loop = 16 * 4 * b;
      const mix = new Mix(loop + 7);
      const rand = new Rand(41);
      const prog = [
        [41, 57, 60, 64],
        [45, 55, 60, 64],
        [46, 57, 62, 65],
        [48, 55, 60, 65],
      ];
      for (let bar = 0; bar < 16; bar++) {
        const t = bar * 4 * b;
        const c = prog[Math.floor(bar / 2) % 4]!;
        if (bar % 2 === 0) {
          chord(mix, t, c.slice(1), 8 * b, (m, d) => pad(m, d, { attack: 2, bright: 0.6, shape: triangle }), 0.32);
          mix.add(t, bass(c[0]! - 12, 7.5 * b, { bite: 0.1 }), 0.3);
        }
        [1, 2, 3, 2].forEach((k, j) => mix.add(t + j * b, pluck(c[k]! + 12, 2, rand, { damping: 0.998, bright: 0.7 }), 0.18, j % 2 ? 0.3 : -0.3));
      }
      const tune: Array<[number | null, number]> = [
        [72, 2], [74, 1], [76, 1], [77, 3], [76, 1], [74, 4], [null, 4], [72, 2], [69, 2], [72, 2], [74, 2], [72, 6], [null, 2],
        [79, 2], [77, 1], [76, 1], [74, 3], [72, 1], [74, 4], [null, 4], [76, 2], [74, 2], [72, 4], [69, 4], [null, 4],
      ];
      melody(mix, 0, b, tune, piano, 0.3, 0.1);
      reverb(mix, 0.6, 0.86, 0.4);
      return { mix, loop };
    },
  },
  {
    id: 'triumph-banners',
    kind: 'music',
    render() {
      const bpm = 104;
      const b = 60 / bpm;
      const loop = 16 * 4 * b;
      const mix = new Mix(loop + 6);
      const rand = new Rand(42);
      const prog = [
        [48, 60, 64, 67],
        [41, 60, 65, 69],
        [43, 59, 62, 67],
        [48, 60, 64, 67],
        [45, 60, 64, 69],
        [41, 60, 65, 69],
        [43, 59, 62, 67],
        [48, 60, 64, 72],
      ];
      prog.forEach((c, i) => {
        const t = i * 8 * b;
        chord(mix, t, c.slice(1), 8 * b, (m, d) => pad(m, d, { attack: 0.8, bright: 1.1 }), 0.3);
        mix.add(t, bass(c[0]! - 12, 3.8 * b), 0.38);
        mix.add(t + 4 * b, bass(c[0]!, 3.8 * b), 0.3);
        for (const at of [0, 3, 4, 6, 7]) mix.add(t + at * b, drum(at % 4 === 0 ? 58 : 66, 0.35, rand, 0.2), at % 4 === 0 ? 0.42 : 0.26);
        c.slice(1).forEach((m, k) => mix.add(t + 6 * b + k * 0.25 * b, pluck(m + 12, 1.2, rand), 0.14, 0.4));
      });
      const fanfare: Array<[number | null, number]> = [
        [67, 1], [72, 1.5], [72, 0.5], [74, 1], [76, 3], [74, 1], [72, 2], [74, 2], [71, 4],
        [69, 1], [72, 1.5], [72, 0.5], [76, 1], [77, 3], [76, 1], [74, 1], [71, 1], [72, 4], [null, 4],
      ];
      melody(mix, 0, b, fanfare, (m, d) => brass(m, d), 0.3, 0.1);
      melody(mix, 32 * b, b, fanfare, (m, d) => brass(m, d), 0.3, 0.1);
      melody(mix, 32 * b, b, fanfare, (m, d) => brass(m - 5, d), 0.16, -0.25);
      reverb(mix, 0.45, 0.85);
      return { mix, loop };
    },
  },
  {
    id: 'defeat-ashes',
    kind: 'music',
    render() {
      const bpm = 58;
      const b = 60 / bpm;
      const loop = 12 * 4 * b;
      const mix = new Mix(loop + 8);
      const rand = new Rand(43);
      const prog = [
        [45, 57, 60, 64],
        [41, 57, 60, 65],
        [38, 57, 62, 65],
        [40, 56, 59, 64],
      ];
      prog.forEach((c, i) => {
        const t = i * 12 * b;
        chord(mix, t, c.slice(1), 12 * b, (m, d) => pad(m, d, { attack: 2.5, bright: 0.5 }), 0.34);
        mix.add(t, bass(c[0]! - 12, 11.5 * b, { bite: 0.05 }), 0.32);
        for (let k = 0; k < 3; k++) mix.add(t + k * 4 * b + 2 * b, piano(c[1 + (k % 3)]! + 12, 3 * b), 0.16, 0.25);
      });
      const lament: Array<[number | null, number]> = [
        [null, 2], [72, 3], [71, 1], [69, 4], [null, 2], [69, 2], [67, 2], [65, 4], [64, 2], [null, 2],
        [65, 2], [64, 2], [62, 4], [60, 2], [59, 2], [57, 6], [null, 2],
      ];
      melody(mix, 0, b, lament, (m, d) => pad(m - 12, d, { attack: 0.25, release: 0.8, bright: 1.2 }), 0.3, -0.15);
      void rand;
      reverb(mix, 0.7, 0.9, 0.4);
      return { mix, loop };
    },
  },
  // ------------------------------------------------------------ sound effects
  ...[1, 2, 3].map(
    (v): Piece => ({
      id: `dice-${v}`,
      kind: 'sfx',
      render() {
        const rand = new Rand(100 + v);
        const mix = new Mix(0.18);
        // A woody clack: a short resonant knock plus a click.
        const n = Math.round(0.16 * SR);
        const knock = new Float32Array(n);
        const f = 900 + v * 260;
        for (let i = 0; i < n; i++) {
          const t = i / SR;
          knock[i] = Math.sin(2 * Math.PI * f * t) * Math.exp(-t / 0.018) + Math.sin(2 * Math.PI * f * 2.7 * t) * 0.4 * Math.exp(-t / 0.008) + (rand.next() * 2 - 1) * Math.exp(-t / 0.003) * 0.6;
        }
        mix.add(0, knock, 0.8);
        return { mix, loop: null };
      },
    }),
  ),
  {
    id: 'ui-click',
    kind: 'sfx',
    render() {
      const mix = new Mix(0.12);
      mix.add(0, bell(96, 0.1, { ratio: 1.5, index: 0.6, decay: 0.02 }), 0.5);
      return { mix, loop: null };
    },
  },
  {
    id: 'roll-success',
    kind: 'sfx',
    render() {
      const mix = new Mix(1.6);
      mix.add(0, bell(79, 1.4, { ratio: 2, index: 1, decay: 0.5 }), 0.5, -0.2);
      mix.add(0.11, bell(84, 1.4, { ratio: 2, index: 1, decay: 0.6 }), 0.5, 0.2);
      reverb(mix, 0.4);
      return { mix, loop: null };
    },
  },
  {
    id: 'roll-fail',
    kind: 'sfx',
    render() {
      const mix = new Mix(1.4);
      mix.add(0, bell(55, 1.2, { ratio: 1.41, index: 1.4, decay: 0.45 }), 0.6, -0.1);
      mix.add(0.16, bell(50, 1.2, { ratio: 1.41, index: 1.4, decay: 0.5 }), 0.6, 0.1);
      reverb(mix, 0.3);
      return { mix, loop: null };
    },
  },
  {
    id: 'roll-crit',
    kind: 'sfx',
    render() {
      const mix = new Mix(2.4);
      [72, 76, 79, 84, 88, 91].forEach((m, i) => mix.add(i * 0.06, bell(m, 1.8, { ratio: 2, index: 0.8, decay: 0.6 }), 0.32, (i % 2 ? 1 : -1) * 0.4));
      reverb(mix, 0.6, 0.86);
      return { mix, loop: null };
    },
  },
  {
    id: 'stinger-victory',
    kind: 'sfx',
    render() {
      const mix = new Mix(5.5);
      const rand = new Rand(200);
      const b = 0.22;
      for (let k = 0; k < 8; k++) mix.add(k * 0.06, drum(62, 0.2, rand, 0.2), 0.2 + k * 0.03);
      melody(mix, 0.5, b, [[67, 1], [67, 1], [67, 1], [72, 6]], (m, d) => brass(m, d), 0.4);
      melody(mix, 0.5, b, [[64, 1], [64, 1], [64, 1], [67, 6]], (m, d) => brass(m, d), 0.26, -0.3);
      chord(mix, 0.5 + 3 * b, [48, 55, 60, 64, 67], 2.4, (m, d) => pad(m, d, { attack: 0.08, release: 1.5, bright: 1.3 }), 0.4);
      mix.add(0.5 + 3 * b, drum(55, 0.6, rand, 0.4), 0.5);
      reverb(mix, 0.5, 0.86);
      return { mix, loop: null };
    },
  },
  {
    id: 'stinger-defeat',
    kind: 'sfx',
    render() {
      const mix = new Mix(6);
      const rand = new Rand(201);
      melody(mix, 0.1, 0.45, [[64, 2], [63, 2], [62, 2], [57, 6]], (m, d) => brass(m, d, { mute: true }), 0.35);
      chord(mix, 2.8, [33, 45, 48, 52], 2.5, (m, d) => pad(m, d, { attack: 0.3, release: 2, bright: 0.6 }), 0.45);
      mix.add(2.8, drum(45, 0.9, rand, 0.3), 0.55);
      reverb(mix, 0.6, 0.9);
      return { mix, loop: null };
    },
  },
];

const only = process.argv.slice(2);
const work = mkdtempSync(join(tmpdir(), 'taleforge-audio-'));
mkdirSync(join(ROOT, 'music'), { recursive: true });
mkdirSync(join(ROOT, 'sfx'), { recursive: true });
try {
  for (const piece of PIECES) {
    if (only.length && !only.includes(piece.id)) continue;
    const started = Date.now();
    const { mix, loop } = piece.render();
    const { L, R } = finish(mix, loop, piece.kind === 'sfx' ? 0.8 : 0.85);
    const wav = join(work, `${piece.id}.wav`);
    writeWav(wav, [L, R], SR);
    const out = join(ROOT, piece.kind, `${piece.id}.m4a`);
    execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', piece.kind === 'sfx' ? '96000' : '112000', wav, out]);
    console.log(`${piece.id}: ${(L.length / SR).toFixed(1)} s ${loop ? 'loop' : 'one-shot'} (${((Date.now() - started) / 1000).toFixed(1)} s to render)`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

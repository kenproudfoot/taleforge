import { writeFileSync } from 'node:fs';

/** Writes 16-bit PCM WAV from planar float channels in [-1, 1]. */
export function writeWav(path: string, channels: Float32Array[], sampleRate: number): void {
  const frames = channels[0]!.length;
  const n = channels.length;
  const data = Buffer.alloc(frames * n * 2);
  let o = 0;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < n; c++) {
      const v = Math.max(-1, Math.min(1, channels[c]![i]!));
      data.writeInt16LE(Math.round(v * 32767), o);
      o += 2;
    }
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(n, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * n * 2, 28);
  header.writeUInt16LE(n * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([header, data]));
}

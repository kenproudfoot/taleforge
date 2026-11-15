// npm run import:music -- <file.m4a> <track-id> [...]
// Decodes owner-supplied tracks (any format Chromium can decode, including Opus in M4A) with Playwright's
// Chromium, then encodes AAC .m4a with macOS afconvert into public/content/audio/music/. macOS only.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { writeWav } from './lib/wav';

const args = process.argv.slice(2);
if (args.length < 2 || args.length % 2) {
  console.error('usage: npm run import:music -- <file> <track-id> [<file> <track-id> ...]');
  process.exit(1);
}
const DECODE = `async (data) => {
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  const ctx = new OfflineAudioContext(2, 44100, 44100);
  const buffer = await ctx.decodeAudioData(bytes.buffer);
  const toB64 = (f) => {
    const u8 = new Uint8Array(f.buffer);
    let s = '';
    for (let k = 0; k < u8.length; k += 0x8000) s += String.fromCharCode(...u8.subarray(k, k + 0x8000));
    return btoa(s);
  };
  const chans = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) chans.push(toB64(buffer.getChannelData(c)));
  return { rate: buffer.sampleRate, chans };
}`;
const outDir = join(process.cwd(), 'public/content/audio/music');
const work = mkdtempSync(join(tmpdir(), 'taleforge-music-'));
const browser = await chromium.launch();
const page = await browser.newPage();
try {
  for (let i = 0; i < args.length; i += 2) {
    const [file, id] = [args[i]!, args[i + 1]!];
    const b64 = readFileSync(file).toString('base64');
    // Passed as source text: tsx would otherwise inject helpers the page does not have.
    const decoded = (await page.evaluate(`(${DECODE})(${JSON.stringify(b64)})`)) as { rate: number; chans: string[] };
    const channels = decoded.chans.map((c) => {
      const buf = Buffer.from(c, 'base64');
      return new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
    });
    const wav = join(work, `${id}.wav`);
    writeWav(wav, channels, decoded.rate);
    const out = join(outDir, `${id}.m4a`);
    execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '128000', wav, out]);
    console.log(`${file} -> ${out} (${(channels[0]!.length / decoded.rate).toFixed(1)} s)`);
  }
} finally {
  await browser.close();
  rmSync(work, { recursive: true, force: true });
}

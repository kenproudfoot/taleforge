import { setDepthOverride } from './art/depth';
import { createMockProvider, setProviderOverride } from './providers';
import type { MockTurn } from './providers/mock';

export interface E2eScript {
  /** Replies for Dungeon Master requests (those that carry tools), in order. */
  dm: MockTurn[];
  /** Replies for helper-model requests, in order; the last one repeats. */
  helper?: string[];
}

/**
 * End-to-end tests and the offline demo set localStorage["taleforge:e2e"] to a script. Every text
 * request is then answered by a scripted provider instead of a real model, so no key or network is needed.
 */
export function installE2eProvider(script: E2eScript): void {
  let dm = 0;
  let helper = 0;
  setProviderOverride(
    createMockProvider((req) => {
      if (req.tools?.length) return script.dm[dm++] ?? { text: 'The story rests here for now.' };
      const replies = script.helper ?? ['[]'];
      return { text: replies[Math.min(helper++, replies.length - 1)] ?? '' };
    }),
  );
  // No depth model download in tests: a gradient (near at the bottom) stands in for the real depth map.
  setDepthOverride(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 40;
    const ctx = canvas.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, 40);
    g.addColorStop(0, '#000');
    g.addColorStop(1, '#fff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 40);
    return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no blob'))), 'image/png'));
  });
}

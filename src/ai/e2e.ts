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
}

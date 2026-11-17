import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Session } from '@/game/session';
import { ChatLog } from './ChatLog';

const TEXT = 'The seal groans open.\n\n«ORISON: Come in, and keep your voices low.»\n\nThe drone hesitates. Marisai, what do you do?';

function session(): Session {
  return { chat: [{ id: 'd1', kind: 'dm', text: TEXT }], state: { party: [], roster: [], pendingRoll: null }, images: { portraits: {} } } as unknown as Session;
}

const view = (speaking: { entryId: string; start: number; end: number } | null) => render(<ChatLog session={session()} busy={false} onRetry={() => {}} speaking={speaking} names={['Marisai']} />).container;

describe('ChatLog read-aloud', () => {
  it('keeps the formatted layout while a line is read aloud, highlighting it in place', () => {
    const quiet = view(null);
    const start = TEXT.indexOf('«');
    const loud = view({ entryId: 'd1', start, end: TEXT.indexOf('»') + 1 });
    // Same speech block, same hand-off rule: nothing jumps when the voice starts or stops.
    expect(loud.querySelectorAll('blockquote')).toHaveLength(quiet.querySelectorAll('blockquote').length);
    expect(loud.querySelector('blockquote cite')?.textContent).toBe('ORISON');
    expect(loud.querySelectorAll('hr')).toHaveLength(1);
    expect(loud.querySelector('blockquote mark')?.textContent).toBe('Come in, and keep your voices low.');
    expect(loud.textContent).not.toContain('«');
    expect(quiet.querySelector('mark')).toBeNull();
  });

  it('highlights a narration sentence inside its paragraph', () => {
    const start = TEXT.indexOf('The drone');
    const loud = view({ entryId: 'd1', start, end: start + 'The drone hesitates.'.length });
    expect(loud.querySelector('p mark')?.textContent).toBe('The drone hesitates.');
    expect(loud.querySelectorAll('blockquote')).toHaveLength(1);
  });
});

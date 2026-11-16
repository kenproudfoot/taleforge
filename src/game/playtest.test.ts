import { afterEach, describe, expect, it, vi } from 'vitest';
import { queuePlaytestLog, resetPlaytestSync } from '@/storage/playtestSync';
import { addPlaytestEvent, analyzePlaytest, buildPlaytestLog, EMPTY_PLAYTEST, playtestFileId } from './playtest';
import type { PlaytestEvent, PlaytestLog } from './playtest';
import { testSession } from './testing';

const turn = (n: number, input: string, extra: Partial<Extract<PlaytestEvent, { type: 'turn' }>> = {}): PlaytestEvent => ({
  type: 'turn',
  at: n,
  turn: n,
  input,
  waitMs: 5000,
  firstMs: 1200,
  requests: 2,
  ok: true,
  tools: [],
  ...extra,
});

function log(events: PlaytestEvent[], extra: Partial<PlaytestLog> = {}): PlaytestLog {
  const session = testSession();
  return { ...buildPlaytestLog(session, { dm: 'local gpt-oss', helper: 'local gpt-oss', voice: 'local', speech: 'local', pictures: 'openai' }), events, ...extra };
}

describe('playtest log', () => {
  it('builds a self-contained log with a readable file id', () => {
    const l = log([]);
    expect(l).toMatchObject({ format: 'taleforge-playtest', version: 1, campaignId: 'the-sunken-crown', ended: null, survey: null });
    expect(l.party.map((p) => p.name)).toEqual(['Lyra Vance', 'Brann']);
    expect(playtestFileId(l)).toMatch(/^\d{4}-\d{2}-\d{2}_the-sunken-crown_session-[\w-]+$/);
  });

  it('keeps the event list bounded', () => {
    let data = EMPTY_PLAYTEST;
    for (let i = 0; i < 2005; i++) data = addPlaytestEvent(data, { type: 'voice_issue', at: i, message: String(i) });
    expect(data.events).toHaveLength(2000);
    expect(data.events[0]).toMatchObject({ message: '5' });
  });

  it('finds slow and failed turns, rejected tools, skipped rolls, and problems with voice and pictures', () => {
    const f = analyzePlaytest(
      log([
        turn(1, '(opening)', { tools: [{ name: 'scene_change', ok: true }] }),
        turn(2, 'Brann: I attack the wight!', { waitMs: 9000 }),
        turn(3, 'Lyra: I pick the lock.', { tools: [{ name: 'request_roll', ok: true }] }),
        turn(4, 'Lyra: We rest.', { waitMs: 45_000, tools: [{ name: 'heal', ok: false, error: 'unknown character' }] }),
        turn(5, 'Brann: Onward.', { ok: false, error: 'LM Studio is not answering', firstMs: null }),
        { type: 'voice_issue', at: 6, message: 'busy' },
        { type: 'picture', at: 7, kind: 'scene', ms: 12_000, ok: true },
        { type: 'picture', at: 8, kind: 'npc', ms: 3000, ok: false, error: 'quota' },
      ]),
    );
    expect(f.turns).toBe(5);
    expect(f.failedTurns).toEqual([{ turn: 5, input: 'Brann: Onward.', error: 'LM Studio is not answering' }]);
    expect(f.wait).toEqual({ median: 5000, p90: 9000, max: 45_000 });
    expect(f.slowTurns).toEqual([{ turn: 4, input: 'Lyra: We rest.', waitMs: 45_000 }]);
    expect(f.rejectedTools).toEqual([{ turn: 4, tool: 'heal', error: 'unknown character' }]);
    expect(f.possibleSkippedRolls).toEqual([{ turn: 2, input: 'Brann: I attack the wight!' }]);
    expect(f.rollsPerTurn).toBeCloseTo(0.25);
    expect(f.sceneChanges).toBe(1);
    expect(f.voiceIssues).toEqual(['busy']);
    expect(f.pictures).toEqual({ painted: 1, failed: 1, medianMs: 12_000, errors: ['quota'] });
  });

  it('pairs each 👎 with the DM text and the player message before it', () => {
    const l = log([], {
      chat: [
        { id: 'p1', kind: 'player', characterId: 'pc-brann', text: 'I swing at it.' },
        { id: 'd1', kind: 'dm', text: 'You miss, obviously.' },
        { id: 'd2', kind: 'dm', text: 'The fog rolls in.' },
      ],
      feedback: { d1: { rating: 'down', note: 'should have rolled', at: 1 }, d2: { rating: 'up', note: '', at: 2 }, gone: { rating: 'down', note: '', at: 3 } },
    });
    const f = analyzePlaytest(l);
    expect(f.liked).toBe(1);
    expect(f.disliked).toEqual([
      { player: 'I swing at it.', dm: 'You miss, obviously.', note: 'should have rolled' },
      { player: '', dm: '(message not found)', note: '' },
    ]);
    expect(analyzePlaytest(log([])).wait).toBeNull();
  });
});

describe('playtest sync', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    resetPlaytestSync();
  });

  it('batches saves and posts the newest log once, when the local server can store it', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => (init?.method === 'POST' ? new Response(null, { status: 204 }) : Response.json({ enabled: true })));
    vi.stubGlobal('fetch', fetchFn);
    const l = log([]);
    queuePlaytestLog(l);
    queuePlaytestLog({ ...l, elapsedMs: 99 });
    await vi.advanceTimersByTimeAsync(1600);
    const posts = fetchFn.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(String(posts[0]![0])).toBe(`/local/playtest/${playtestFileId(l)}`);
    expect(JSON.parse((posts[0]![1] as RequestInit).body as string)).toMatchObject({ elapsedMs: 99 });
  });

  it('does nothing when the page is not served by TaleForge’s local server', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn(async () => new Response('not found', { status: 404 }));
    vi.stubGlobal('fetch', fetchFn);
    queuePlaytestLog(log([]));
    await vi.advanceTimersByTimeAsync(1600);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

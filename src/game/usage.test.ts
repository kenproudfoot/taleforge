import { describe, expect, it } from 'vitest';
import { meter, onMeter } from '@/ai/meter';
import type { LedgerEntry, MeterEvent } from '@/ai/meter';
import { costOf, formatSmallCost, imagePriceFor, listenPricePerMinute, voicePricePerMillionChars } from '@/ai/pricing';
import { ledgerToCsv, PROJECTION_MIN_MS, summarizeUsage } from './usage';

const tokens = (input: number, cacheRead: number, cacheWrite: number, output: number) => ({ inputTokens: input, cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite, outputTokens: output });
const entry = (e: Partial<LedgerEntry> & Pick<LedgerEntry, 'kind'>): LedgerEntry => ({ at: 0, turn: 1, provider: 'anthropic', model: 'claude-sonnet-5-5', costUsd: null, ...e });

describe('costOf', () => {
  it('prices text with the model’s own cache rates', () => {
    // Sonnet 5.5: $2 in, $0.10 cache read, $2.50 cache write, $10 out per million.
    const usage = tokens(1000, 20_000, 4000, 500);
    expect(costOf({ kind: 'dm', provider: 'anthropic', model: 'claude-sonnet-5-5', usage })).toBeCloseTo((1000 * 2 + 20_000 * 0.1 + 4000 * 2.5 + 500 * 10) / 1e6);
    expect(costOf({ kind: 'helper', provider: 'gemini', model: 'gemini-x', usage })).toBeNull();
    expect(costOf({ kind: 'dm', provider: 'anthropic', model: 'claude-sonnet-5-5' })).toBeNull();
  });
  it('prices GPT Image tokens, and lets the user override pictures', () => {
    const event: MeterEvent = { kind: 'image', provider: 'openai', model: 'gpt-image-2', imageTokens: { textInput: 100, imageInput: 0, output: 1584 } };
    expect(costOf(event)).toBeCloseTo((100 * 5 + 1584 * 30) / 1e6);
    expect(imagePriceFor('gpt-image-2.6-flare')?.outputPerM).toBe(30);
    expect(imagePriceFor('gpt-image-1-mini')?.outputPerM).toBe(8);
    expect(costOf({ ...event, imageTokens: undefined })).toBeNull();
    expect(costOf({ kind: 'image', provider: 'custom', model: 'localhost:8000' })).toBeNull();
    expect(costOf({ kind: 'image', provider: 'custom', model: 'localhost:8000' }, { picture: 0, voicePerMillionChars: null })).toBe(0);
    expect(costOf(event, { picture: 0.04, voicePerMillionChars: null })).toBe(0.04);
  });
  it('prices voices per character and listening per minute', () => {
    expect(costOf({ kind: 'voice', provider: 'openai', model: 'tts-1', chars: 1000 })).toBeCloseTo(0.015);
    expect(voicePricePerMillionChars('openai', 'tts-1-hd')).toBe(30);
    expect(costOf({ kind: 'voice', provider: 'browser', model: '', chars: 5000 })).toBe(0);
    expect(costOf({ kind: 'voice', provider: 'elevenlabs', model: 'eleven_v3', chars: 1000 })).toBeNull();
    expect(costOf({ kind: 'voice', provider: 'elevenlabs', model: 'eleven_v3', chars: 1000 }, { picture: null, voicePerMillionChars: 100 })).toBeCloseTo(0.1);
    expect(costOf({ kind: 'listen', provider: 'openai', model: 'gpt-4o-mini-transcribe', seconds: 120 })).toBeCloseTo(0.006);
    expect(listenPricePerMinute('openai', 'whisper-1')).toBe(0.006);
    expect(listenPricePerMinute('webspeech', '')).toBe(0);
    expect(costOf({ kind: 'listen', provider: 'openai', model: 'mystery' , seconds: 10 })).toBeNull();
  });
  it('formats small costs', () => {
    expect([formatSmallCost(null), formatSmallCost(0), formatSmallCost(0.0004), formatSmallCost(0.0123), formatSmallCost(1.5)]).toEqual(['—', '$0', '<$0.001', '$0.012', '$1.50']);
  });
});

describe('meter', () => {
  it('delivers events to listeners and survives a throwing listener', () => {
    const seen: string[] = [];
    const offBad = onMeter(() => {
      throw new Error('boom');
    });
    const off = onMeter((e) => seen.push(e.kind));
    meter({ kind: 'voice', provider: 'browser', model: '', chars: 3 });
    off();
    offBad();
    meter({ kind: 'voice', provider: 'browser', model: '', chars: 3 });
    expect(seen).toEqual(['voice']);
  });
});

describe('summarizeUsage', () => {
  const ledger: LedgerEntry[] = [
    entry({ kind: 'dm', turn: 1, usage: tokens(100, 0, 9000, 400), costUsd: 0.03 }),
    entry({ kind: 'dm', turn: 1, usage: tokens(50, 9000, 0, 100), costUsd: 0.005 }),
    entry({ kind: 'dm', turn: 2, usage: tokens(80, 9000, 200, 300), costUsd: 0.006 }),
    entry({ kind: 'helper', turn: 2, usage: tokens(500, 0, 0, 100), costUsd: 0.001, label: 'picture prompt' }),
    entry({ kind: 'image', turn: 1, provider: 'openai', model: 'gpt-image-2', imageTokens: { textInput: 40, imageInput: 0, output: 1584 }, costUsd: 0.05, label: 'portrait', detail: '1024x1536 medium' }),
    entry({ kind: 'image', turn: 2, provider: 'gemini', model: 'g', costUsd: null }),
    entry({ kind: 'voice', turn: 2, provider: 'openai', model: 'tts-1', chars: 2000, costUsd: 0.03 }),
    entry({ kind: 'listen', turn: 2, provider: 'openai', model: 'gpt-4o-mini-transcribe', seconds: 30, costUsd: 0.0015 }),
  ];

  it('totals by service, groups DM requests by turn and measures caching', () => {
    const s = summarizeUsage(ledger, 60_000, 45);
    expect(s.totalUsd).toBeCloseTo(0.1235);
    expect(s.byKind.dm).toMatchObject({ calls: 3, inputTokens: 230, cacheReadTokens: 18_000, cacheWriteTokens: 9200, outputTokens: 800 });
    expect(s.byKind.image).toMatchObject({ calls: 2, unpriced: 1, inputTokens: 40, outputTokens: 1584 });
    expect(s.byKind.image.costUsd).toBeCloseTo(0.05);
    expect(s.byKind.voice.chars).toBe(2000);
    expect(s.byKind.listen.seconds).toBe(30);
    expect(s.dmTurns.map((t) => [t.turn, t.calls])).toEqual([
      [1, 2],
      [2, 1],
    ]);
    expect(s.dmTurns[0]!.costUsd).toBeCloseTo(0.035);
    expect(s.cacheHitRate).toBeCloseTo(18_000 / (230 + 18_000 + 9200));
    expect(s.perTurnUsd).toBeCloseTo((0.041 + 0.001) / 2);
    expect(s.projectedUsd).toBeNull();
  });
  it('projects the full game once enough has been played', () => {
    const s = summarizeUsage(ledger, PROJECTION_MIN_MS * 2, 20);
    expect(s.projectedUsd).toBeCloseTo(0.1235 * 2);
    // Never projects less than what has already been spent.
    expect(summarizeUsage(ledger, 60 * 60_000, 20).projectedUsd).toBeCloseTo(0.1235);
  });
  it('is empty for a game with no ledger', () => {
    const s = summarizeUsage([], 0, 45);
    expect(s).toMatchObject({ totalUsd: 0, dmTurns: [], cacheHitRate: null, perTurnUsd: null, projectedUsd: null });
  });
  it('exports a CSV with one row per call', () => {
    const csv = ledgerToCsv([entry({ kind: 'image', label: 'scene, "night"', detail: '1536x1024 low', imageTokens: { textInput: 1, imageInput: 2, output: 3 }, costUsd: 0.0123456789 }), entry({ kind: 'listen', seconds: 12.345 })]);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^time,turn,kind,provider,model,label,detail,input_tokens/);
    expect(lines[1]).toContain('"scene, ""night"""');
    expect(lines[1]).toMatch(/,1,2,3,,,0\.012346$/);
    expect(lines[2]).toMatch(/,12\.3,$/);
  });
});

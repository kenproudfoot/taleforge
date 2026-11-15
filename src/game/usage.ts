import type { LedgerEntry, MeterKind } from '@/ai/meter';

export const KIND_LABELS: Record<MeterKind, string> = {
  dm: 'Dungeon Master',
  helper: 'Helper (prompts, recaps, summaries)',
  image: 'Pictures',
  voice: 'Narration voice',
  listen: 'Speech recognition',
};

export interface KindTotals {
  calls: number;
  /** Sum of the calls that have a known price. */
  costUsd: number;
  /** Calls whose price is unknown (counted, but not in the cost). */
  unpriced: number;
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  chars: number;
  seconds: number;
}

export interface TurnRow {
  turn: number;
  calls: number;
  inputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface UsageSummary {
  totalUsd: number;
  byKind: Record<MeterKind, KindTotals>;
  /** Dungeon Master requests grouped by engine turn. */
  dmTurns: TurnRow[];
  /** Share of DM input tokens served from the prompt cache (0–1), or null before the first request. */
  cacheHitRate: number | null;
  /** Average DM + helper cost per turn that had DM requests. */
  perTurnUsd: number | null;
  /** Total projected over the campaign's target length, once enough play has happened to say. */
  projectedUsd: number | null;
}

const KINDS: MeterKind[] = ['dm', 'helper', 'image', 'voice', 'listen'];

function emptyTotals(): KindTotals {
  return { calls: 0, costUsd: 0, unpriced: 0, inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, chars: 0, seconds: 0 };
}

/** Minimum play before projecting a full-game cost: early turns (portraits, the opening) skew it. */
export const PROJECTION_MIN_MS = 5 * 60_000;

export function summarizeUsage(ledger: LedgerEntry[], elapsedMs: number, targetMinutes: number): UsageSummary {
  const byKind = Object.fromEntries(KINDS.map((k) => [k, emptyTotals()])) as Record<MeterKind, KindTotals>;
  const turns = new Map<number, TurnRow>();
  let totalUsd = 0;
  for (const e of ledger) {
    const t = byKind[e.kind];
    t.calls += 1;
    if (e.costUsd === null) t.unpriced += 1;
    else {
      t.costUsd += e.costUsd;
      totalUsd += e.costUsd;
    }
    const u = e.usage;
    if (u) {
      t.inputTokens += u.inputTokens;
      t.cacheReadTokens += u.cacheReadTokens;
      t.cacheWriteTokens += u.cacheWriteTokens;
      t.outputTokens += u.outputTokens;
    }
    if (e.imageTokens) {
      t.inputTokens += e.imageTokens.textInput + e.imageTokens.imageInput;
      t.outputTokens += e.imageTokens.output;
    }
    t.chars += e.chars ?? 0;
    t.seconds += e.seconds ?? 0;
    if (e.kind === 'dm' && u) {
      const row = turns.get(e.turn) ?? { turn: e.turn, calls: 0, inputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 0, costUsd: 0 };
      row.calls += 1;
      row.inputTokens += u.inputTokens;
      row.cacheWriteTokens += u.cacheWriteTokens;
      row.cacheReadTokens += u.cacheReadTokens;
      row.outputTokens += u.outputTokens;
      row.costUsd += e.costUsd ?? 0;
      turns.set(e.turn, row);
    }
  }
  const dm = byKind.dm;
  const dmInput = dm.inputTokens + dm.cacheReadTokens + dm.cacheWriteTokens;
  const dmTurns = [...turns.values()].sort((a, b) => a.turn - b.turn);
  return {
    totalUsd,
    byKind,
    dmTurns,
    cacheHitRate: dmInput > 0 ? dm.cacheReadTokens / dmInput : null,
    perTurnUsd: dmTurns.length ? (dm.costUsd + byKind.helper.costUsd) / dmTurns.length : null,
    projectedUsd: elapsedMs >= PROJECTION_MIN_MS && targetMinutes > 0 ? Math.max(totalUsd, (totalUsd / elapsedMs) * targetMinutes * 60_000) : null,
  };
}

const csvCell = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** One row per metered call, for a spreadsheet. */
export function ledgerToCsv(ledger: LedgerEntry[]): string {
  const header = ['time', 'turn', 'kind', 'provider', 'model', 'label', 'detail', 'input_tokens', 'cache_write_tokens', 'cache_read_tokens', 'output_tokens', 'image_text_input_tokens', 'image_input_tokens', 'image_output_tokens', 'characters', 'seconds', 'estimated_usd'];
  const rows = ledger.map((e) =>
    [
      new Date(e.at).toISOString(),
      e.turn,
      e.kind,
      e.provider,
      e.model,
      e.label,
      e.detail,
      e.usage?.inputTokens,
      e.usage?.cacheWriteTokens,
      e.usage?.cacheReadTokens,
      e.usage?.outputTokens,
      e.imageTokens?.textInput,
      e.imageTokens?.imageInput,
      e.imageTokens?.output,
      e.chars,
      e.seconds === undefined ? undefined : Math.round(e.seconds * 10) / 10,
      e.costUsd === null ? null : Math.round(e.costUsd * 1e6) / 1e6,
    ]
      .map(csvCell)
      .join(','),
  );
  return [header.join(','), ...rows].join('\n') + '\n';
}

import type { ChatEntry, Session } from './session';

/** One Dungeon Master tool call in a turn, and whether the engine accepted it. */
export interface PlaytestTool {
  name: string;
  ok: boolean;
  /** Why the engine rejected it. */
  error?: string;
}

export type PlaytestEvent =
  | {
      type: 'turn';
      at: number;
      turn: number;
      /** What the players said ("(opening)" / "(resume)" for the automatic turns). */
      input: string;
      /** How long the table waited for the DM, not counting time spent rolling dice. */
      waitMs: number;
      /** Time to the first narration or tool call. */
      firstMs: number | null;
      requests: number;
      ok: boolean;
      error?: string;
      tools: PlaytestTool[];
    }
  | { type: 'voice_issue'; at: number; message: string }
  | { type: 'picture'; at: number; kind: string; ms: number; ok: boolean; error?: string };

export interface PlaytestFeedback {
  rating: 'up' | 'down';
  note: string;
  at: number;
}

export interface PlaytestSurvey {
  /** 1 (not fun) to 5 (great fun). */
  fun: number;
  pacing: 'too slow' | 'just right' | 'too fast';
  confusing: string;
  other: string;
  at: number;
}

export interface PlaytestData {
  events: PlaytestEvent[];
  /** DM chat entry id → the table's reaction. */
  feedback: Record<string, PlaytestFeedback>;
  survey: PlaytestSurvey | null;
}

export const EMPTY_PLAYTEST: PlaytestData = { events: [], feedback: {}, survey: null };

/** Keeps the log bounded on very long games. */
const MAX_EVENTS = 2000;

export function addPlaytestEvent(data: PlaytestData, event: PlaytestEvent): PlaytestData {
  const events = [...data.events, event];
  return { ...data, events: events.length > MAX_EVENTS ? events.slice(-MAX_EVENTS) : events };
}

export interface PlaytestSetup {
  dm: string;
  helper: string;
  voice: string;
  speech: string;
  pictures: string;
}

/** The file written to playtests/: everything needed to understand how the game went, nothing secret. */
export interface PlaytestLog {
  format: 'taleforge-playtest';
  version: 1;
  sessionId: string;
  campaignId: string;
  campaignTitle: string;
  startedAt: number;
  updatedAt: number;
  elapsedMs: number;
  ended: string | null;
  setup: PlaytestSetup;
  party: Array<{ id: string; name: string; player: string; archetype: string }>;
  chat: ChatEntry[];
  events: PlaytestEvent[];
  feedback: Record<string, PlaytestFeedback>;
  survey: PlaytestSurvey | null;
  costUsd: number;
}

export function buildPlaytestLog(session: Session, setup: PlaytestSetup): PlaytestLog {
  return {
    format: 'taleforge-playtest',
    version: 1,
    sessionId: session.id,
    campaignId: session.campaignId,
    campaignTitle: session.campaignTitle,
    startedAt: session.createdAt,
    updatedAt: session.updatedAt,
    elapsedMs: session.state.elapsedMs,
    ended: session.state.ended?.outcome ?? null,
    setup,
    party: session.state.party.map((p) => ({ id: p.id, name: p.name, player: p.playerName, archetype: p.archetypeId })),
    chat: session.chat,
    events: session.playtest.events,
    feedback: session.playtest.feedback,
    survey: session.playtest.survey,
    costUsd: session.costUsd,
  };
}

/** A readable, sortable file name: date, campaign and session. */
export function playtestFileId(log: Pick<PlaytestLog, 'startedAt' | 'campaignId' | 'sessionId'>): string {
  const date = new Date(log.startedAt).toISOString().slice(0, 10);
  return `${date}_${log.campaignId}_${log.sessionId}`.replace(/[^A-Za-z0-9_-]/g, '-');
}

/* ------------------------------------------------------------------ analysis (used by the report script) */

/** Player actions that should almost always be settled by a roll. */
const RISKY = /\b(attack|strike|stab|slash|swing|shoot|fire at|punch|kick|charge|fight|cast|sneak|climb|leap|jump|pick (the|its|a) lock|force|break (down|open)|persuade|convince|lie|bluff|intimidate|steal|hide)\b/i;

export interface PlaytestFindings {
  turns: number;
  failedTurns: Array<{ turn: number; input: string; error: string }>;
  wait: { median: number; p90: number; max: number } | null;
  firstWords: { median: number } | null;
  slowTurns: Array<{ turn: number; input: string; waitMs: number }>;
  rejectedTools: Array<{ turn: number; tool: string; error: string }>;
  possibleSkippedRolls: Array<{ turn: number; input: string }>;
  rollsPerTurn: number;
  sceneChanges: number;
  voiceIssues: string[];
  pictures: { painted: number; failed: number; medianMs: number | null; errors: string[] };
  liked: number;
  disliked: Array<{ player: string; dm: string; note: string }>;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))]!;
}

export const SLOW_TURN_MS = 30_000;

export function analyzePlaytest(log: PlaytestLog): PlaytestFindings {
  const turns = log.events.filter((e): e is Extract<PlaytestEvent, { type: 'turn' }> => e.type === 'turn');
  const ok = turns.filter((t) => t.ok);
  const waits = ok.map((t) => t.waitMs);
  const firsts = ok.map((t) => t.firstMs).filter((v): v is number => v !== null);
  const pictures = log.events.filter((e): e is Extract<PlaytestEvent, { type: 'picture' }> => e.type === 'picture');
  const painted = pictures.filter((p) => p.ok);

  const disliked: PlaytestFindings['disliked'] = [];
  for (const [entryId, fb] of Object.entries(log.feedback)) {
    if (fb.rating !== 'down') continue;
    const index = log.chat.findIndex((e) => e.id === entryId);
    const dm = log.chat[index];
    const player = [...log.chat.slice(0, Math.max(0, index))].reverse().find((e) => e.kind === 'player');
    disliked.push({ player: player?.kind === 'player' ? player.text : '', dm: dm?.kind === 'dm' ? dm.text : '(message not found)', note: fb.note });
  }

  return {
    turns: turns.length,
    failedTurns: turns.filter((t) => !t.ok).map((t) => ({ turn: t.turn, input: t.input, error: t.error ?? 'unknown error' })),
    wait: waits.length ? { median: percentile(waits, 0.5), p90: percentile(waits, 0.9), max: Math.max(...waits) } : null,
    firstWords: firsts.length ? { median: percentile(firsts, 0.5) } : null,
    slowTurns: ok.filter((t) => t.waitMs > SLOW_TURN_MS).map((t) => ({ turn: t.turn, input: t.input, waitMs: t.waitMs })),
    rejectedTools: turns.flatMap((t) => t.tools.filter((x) => !x.ok).map((x) => ({ turn: t.turn, tool: x.name, error: x.error ?? '' }))),
    possibleSkippedRolls: ok.filter((t) => RISKY.test(t.input) && !t.tools.some((x) => x.name === 'request_roll')).map((t) => ({ turn: t.turn, input: t.input })),
    rollsPerTurn: ok.length ? ok.reduce((n, t) => n + t.tools.filter((x) => x.name === 'request_roll').length, 0) / ok.length : 0,
    sceneChanges: ok.reduce((n, t) => n + t.tools.filter((x) => x.name === 'scene_change' && x.ok).length, 0),
    voiceIssues: log.events.flatMap((e) => (e.type === 'voice_issue' ? [e.message] : [])),
    pictures: {
      painted: painted.length,
      failed: pictures.length - painted.length,
      medianMs: painted.length ? percentile(painted.map((p) => p.ms), 0.5) : null,
      errors: pictures.flatMap((p) => (p.ok ? [] : [p.error ?? 'unknown error'])),
    },
    liked: Object.values(log.feedback).filter((f) => f.rating === 'up').length,
    disliked,
  };
}

import type { LedgerEntry } from '@/ai/meter';
import type { PlaytestData } from './playtest';
import { EMPTY_PLAYTEST } from './playtest';
import type { ChatMessage, TextProviderId, Usage } from '@/ai/providers/types';
import { ZERO_USAGE } from '@/ai/providers/types';
import type { ChipTone, GameState, RollReport } from '@/engine/types';

export type DiceMode = 'digital' | 'physical' | 'per_player';

export type ChatEntry =
  | { id: string; kind: 'dm'; text: string }
  | { id: string; kind: 'player'; characterId: string; text: string }
  | { id: string; kind: 'chip'; text: string; tone: ChipTone }
  | { id: string; kind: 'roll'; report: RollReport; free?: boolean }
  | { id: string; kind: 'image'; imageKey: string; caption: string }
  | { id: string; kind: 'error'; text: string };

export interface SessionImages {
  /** Party member or roster id -> image cache key. */
  portraits: Record<string, string>;
  /** Location id -> image cache key. */
  scenes: Record<string, string>;
  party: string | null;
  /** The image currently shown in the scene panel (a scene or a moment). */
  current: string | null;
  /** Party member or roster id -> portrait with the name plaque drawn on (the card art). */
  cards: Record<string, string>;
  /** Images painted during this session (for the cost meter). */
  generated: number;
  /** How many times each place ("scene:<id>") and character ("npc:<id>") has been shown; each new visit gets a new picture. */
  visits?: Record<string, number>;
  /** Every picture that has been the current one, oldest first, with where the party was: the scene panel's history. */
  shown?: ShownImage[];
}

export interface ShownImage {
  key: string;
  /** Location id when the picture first became current. */
  at: string | null;
}

/** Everything needed to resume a game: saved to IndexedDB after every turn. */
export interface Session {
  version: 1;
  id: string;
  campaignId: string;
  campaignTitle: string;
  createdAt: number;
  updatedAt: number;
  state: GameState;
  chat: ChatEntry[];
  /** Provider-neutral DM conversation: the verbatim recent turns. */
  history: ChatMessage[];
  /** Rolling summary of turns that were compressed out of `history`. */
  summary: string;
  dm: { provider: TextProviderId; model: string };
  diceMode: DiceMode;
  /** Per-player choice when diceMode is "per_player": party member id -> mode. */
  playerDice: Record<string, 'digital' | 'physical'>;
  usage: { dm: Usage; helper: Usage };
  /** Estimated USD for everything metered in this game (DM, helper, pictures, voice, listening). */
  costUsd: number;
  /** Every metered service call, for the usage panel and the CSV export. */
  ledger: LedgerEntry[];
  /** Playtest log: turn timings, tool calls, problems and the table's feedback (see playtest.ts). */
  playtest: PlaytestData;
  images: SessionImages;
  recap: string | null;
  /** Lower-cased NPC name -> voice id chosen by the players in the roster card. */
  voiceCast: Record<string, string>;
}

export interface SessionSummary {
  id: string;
  campaignId: string;
  campaignTitle: string;
  updatedAt: number;
  elapsedMs: number;
  party: string[];
  ended: boolean;
  act: number;
  costUsd: number;
}

export function summarizeSession(s: Session): SessionSummary {
  return {
    id: s.id,
    campaignId: s.campaignId,
    campaignTitle: s.campaignTitle,
    updatedAt: s.updatedAt,
    elapsedMs: s.state.elapsedMs,
    party: s.state.party.map((p) => p.name),
    ended: s.state.ended !== null,
    act: s.state.actIndex + 1,
    costUsd: s.costUsd,
  };
}

let counter = 0;
/** Short unique id for chat entries and sessions. */
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export function createSession(input: {
  campaignId: string;
  campaignTitle: string;
  state: GameState;
  dm: Session['dm'];
  diceMode: DiceMode;
  playerDice?: Session['playerDice'];
  now?: number;
}): Session {
  const now = input.now ?? Date.now();
  return {
    version: 1,
    id: newId('session'),
    campaignId: input.campaignId,
    campaignTitle: input.campaignTitle,
    createdAt: now,
    updatedAt: now,
    state: input.state,
    chat: [],
    history: [],
    summary: '',
    dm: input.dm,
    diceMode: input.diceMode,
    playerDice: input.playerDice ?? {},
    usage: { dm: ZERO_USAGE, helper: ZERO_USAGE },
    costUsd: 0,
    ledger: [],
    playtest: EMPTY_PLAYTEST,
    images: { portraits: {}, scenes: {}, party: null, current: null, cards: {}, generated: 0 },
    recap: null,
    voiceCast: {},
  };
}

/** Whether this party member rolls physical dice under the session's dice mode. */
export function usesPhysicalDice(session: Pick<Session, 'diceMode' | 'playerDice'>, memberId: string): boolean {
  if (session.diceMode === 'physical') return true;
  if (session.diceMode === 'digital') return false;
  return session.playerDice[memberId] === 'physical';
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Adds the current picture to the history the first time it is shown (pure). */
export function recordShown(session: Session): Session {
  const { current, shown = [] } = session.images;
  if (!current || shown.some((s) => s.key === current)) return session;
  return { ...session, images: { ...session.images, shown: [...shown, { key: current, at: session.state.locationId }] } };
}

/**
 * The pictures to page through in the scene panel, oldest first, each with the chat caption when it was a
 * story moment. Older saves without a history fall back to the chat's pictures; the current one is always in.
 */
export function sceneGallery(session: Session): Array<ShownImage & { caption?: string }> {
  const captions = new Map<string, string>();
  for (const e of session.chat) if (e.kind === 'image') captions.set(e.imageKey, e.caption);
  const list: ShownImage[] = session.images.shown?.length ? [...session.images.shown] : [...captions.keys()].map((key) => ({ key, at: null }));
  const current = session.images.current;
  if (current && !list.some((s) => s.key === current)) list.push({ key: current, at: session.state.locationId });
  return list.map((s) => (captions.has(s.key) ? { ...s, caption: captions.get(s.key)! } : s));
}

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
  costUsd: number;
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

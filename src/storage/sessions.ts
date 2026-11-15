import { z } from 'zod';
import { gameStateSchema } from '@/engine/schema';
import { summarizeSession } from '@/game/session';
import type { Session, SessionSummary } from '@/game/session';
import { getDb } from './db';

const usage = z.object({ inputTokens: z.number(), outputTokens: z.number(), cacheReadTokens: z.number(), cacheWriteTokens: z.number() });

/** Validates the envelope and the engine state strictly; chat and history are checked structurally. */
export const sessionSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  campaignId: z.string().min(1),
  campaignTitle: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  state: gameStateSchema,
  chat: z.array(z.looseObject({ id: z.string(), kind: z.enum(['dm', 'player', 'chip', 'roll', 'image', 'error']) })),
  history: z.array(z.looseObject({ role: z.enum(['user', 'assistant']), content: z.array(z.looseObject({ type: z.string() })) })),
  summary: z.string(),
  dm: z.object({ provider: z.enum(['anthropic', 'openai', 'gemini', 'openrouter', 'mock']), model: z.string() }),
  diceMode: z.enum(['digital', 'physical', 'per_player']),
  playerDice: z.record(z.string(), z.enum(['digital', 'physical'])),
  usage: z.object({ dm: usage, helper: usage }),
  costUsd: z.number(),
  images: z.object({
    portraits: z.record(z.string(), z.string()),
    scenes: z.record(z.string(), z.string()),
    party: z.string().nullable(),
    current: z.string().nullable(),
  }),
  recap: z.string().nullable(),
});

/** Parses a session from storage or a backup file. Throws a readable error when it is not valid. */
export function parseSession(data: unknown): Session {
  const result = sessionSchema.safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new Error(`Not a valid TaleForge session (${first?.path.join('.') || 'file'}: ${first?.message}).`);
  }
  return result.data as unknown as Session;
}

/** Strips provider-private blocks (thinking, signatures): they are only valid inside one live turn. */
export function persistable(session: Session): Session {
  return { ...session, history: session.history.map(({ raw: _raw, ...m }) => m) };
}

export async function saveSession(session: Session): Promise<void> {
  const record = { ...persistable(session), updatedAt: Date.now() };
  await (await getDb()).put('sessions', record as unknown as { id: string; updatedAt: number });
}

export async function loadSession(id: string): Promise<Session | null> {
  const record = await (await getDb()).get('sessions', id);
  return record ? parseSession(record) : null;
}

/** Saved games, most recently played first. Unreadable records are skipped. */
export async function listSessions(): Promise<SessionSummary[]> {
  const all = await (await getDb()).getAll('sessions');
  const out: SessionSummary[] = [];
  for (const record of all) {
    try {
      out.push(summarizeSession(parseSession(record)));
    } catch {
      // skip corrupt saves rather than break the list
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteSession(id: string): Promise<void> {
  await (await getDb()).delete('sessions', id);
}

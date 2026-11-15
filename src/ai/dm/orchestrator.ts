import type { Rng } from '@/engine/rng';
import { beginTurn, recordSpotlight } from '@/engine/pacing';
import { summarizeReport } from '@/engine/rolls';
import { TOOL_DESCRIPTIONS, TOOL_NAMES, applyToolCall, toolJsonSchema } from '@/engine/tools';
import type { Effect, EngineCampaign, PendingRoll, RollReport } from '@/engine/types';
import { newId } from '@/game/session';
import type { ChatEntry, Session } from '@/game/session';
import { estimateCost } from '../pricing';
import type { Price } from '../pricing';
import { PROVIDER_LABELS, ProviderError, addUsage, describeProviderError } from '../providers/types';
import type { ChatMessage, ChatRequest, ContentBlock, Effort, TextProvider, ToolDef } from '../providers/types';
import { buildMessages, playerBlock, stateBlock } from './context';
import type { TurnInput } from './context';
import { addressedMember } from './narration';

export const DM_TOOLS: ToolDef[] = TOOL_NAMES.map((name) => ({ name, description: TOOL_DESCRIPTIONS[name], schema: toolJsonSchema(name) }));

/** Most model calls allowed in one turn (each tool round trip is one call). */
export const MAX_STEPS = 8;

export interface DmDeps {
  provider: TextProvider;
  model: string;
  effort?: Effort;
  price?: Price;
  system: ChatRequest['system'];
  campaign: EngineCampaign;
  rng: Rng;
  getSession(): Session;
  /** All session changes go through here so the store stays the single source of truth. */
  setSession(change: (s: Session) => Session): void;
  /**
   * Called when the DM asks a party member to roll. The UI collects the dice (updating the session state
   * through the engine) and resolves with the finished report.
   */
  awaitRoll(pending: PendingRoll): Promise<RollReport>;
  onEffect?(effect: Effect): void;
  signal?: AbortSignal;
}

export interface TurnResult {
  ok: boolean;
  /** Party member the DM handed the spotlight to, if it named one. */
  addressed: string | null;
  error?: string;
}

function chip(text: string, tone: Extract<ChatEntry, { kind: 'chip' }>['tone'] = 'neutral'): ChatEntry {
  return { id: newId('chip'), kind: 'chip', text, tone };
}

/**
 * Runs one Dungeon Master turn: sends the table's input, streams the narration, applies every tool call
 * through the engine (pausing for player rolls) and loops until the model stops calling tools.
 * On failure the session is restored to how it was before the turn, plus an error entry.
 */
export async function runDmTurn(deps: DmDeps, input: TurnInput): Promise<TurnResult> {
  const before = deps.getSession();
  const append = (...entries: ChatEntry[]) => deps.setSession((s) => ({ ...s, chat: [...s.chat, ...entries] }));

  try {
    // 1. Start the turn in the engine and put the players' words in the chat and the history.
    const started = beginTurn(before.state);
    let state = started.state;
    if (input.type === 'players') for (const m of input.messages) state = recordSpotlight(state, m.characterId);
    const playerEntries: ChatEntry[] =
      input.type === 'players' ? input.messages.map((m) => ({ id: newId('player'), kind: 'player' as const, characterId: m.characterId, text: m.text })) : [];
    deps.setSession((s) => ({
      ...s,
      state,
      chat: [...s.chat, ...playerEntries, ...started.lines.map((line) => chip(line, 'bad'))],
      history: [...s.history, { role: 'user', content: [{ type: 'text', text: playerBlock(input, state) }] }],
    }));
    // Frozen for the whole turn so every request of the tool loop shares the same prefix.
    const frozenState = stateBlock(state, deps.campaign);

    let lastText = '';
    for (let step = 0; step < MAX_STEPS; step++) {
      const session = deps.getSession();
      const entryId = newId('dm');
      let text = '';
      const toolCalls: Array<{ id: string; name: string; input: unknown }> = [];
      let stopReason = 'end';
      let raw: ChatMessage['raw'];

      for await (const event of deps.provider.stream({
        model: deps.model,
        system: deps.system,
        messages: buildMessages(session.history, session.summary, frozenState),
        tools: DM_TOOLS,
        effort: deps.effort,
        signal: deps.signal,
      })) {
        if (event.type === 'text') {
          const first = text === '';
          text += event.text;
          const current = text;
          deps.setSession((s) =>
            first
              ? { ...s, chat: [...s.chat, { id: entryId, kind: 'dm', text: current }] }
              : { ...s, chat: s.chat.map((e) => (e.id === entryId && e.kind === 'dm' ? { ...e, text: current } : e)) },
          );
        } else if (event.type === 'tool_call') toolCalls.push(event);
        else if (event.type === 'usage') {
          const usage = event.usage;
          const costUsd = estimateCost(usage, deps.price);
          deps.setSession((s) => ({
            ...s,
            usage: { ...s.usage, dm: addUsage(s.usage.dm, usage) },
            costUsd: s.costUsd + (costUsd ?? 0),
            ledger: [...s.ledger, { at: Date.now(), turn: s.state.turn, kind: 'dm', provider: deps.provider.id, model: deps.model, usage, costUsd }],
          }));
        } else {
          stopReason = event.stopReason;
          raw = event.raw;
        }
      }
      if (deps.signal?.aborted) throw new ProviderError('aborted', 'Request cancelled');
      if (stopReason === 'refusal') throw new Error('The model declined to continue this scene. Try rephrasing, or switch the DM model from the top bar.');
      if (text.trim()) lastText = text;

      const assistant: ChatMessage = {
        role: 'assistant',
        content: [...(text.trim() ? [{ type: 'text' as const, text }] : []), ...toolCalls.map((c) => ({ type: 'tool_use' as const, id: c.id, name: c.name, input: c.input }))],
        raw,
      };
      if (assistant.content.length === 0) {
        if (stopReason === 'max_tokens') throw new Error('The reply was cut off before it began. Try again.');
        break;
      }
      deps.setSession((s) => ({ ...s, history: [...s.history, assistant] }));
      if (toolCalls.length === 0) break;

      // 2. Apply each tool call in order, waiting for player dice where needed.
      const results: ContentBlock[] = [];
      for (const call of toolCalls) {
        const outcome = applyToolCall(deps.getSession().state, deps.campaign, { name: call.name, input: call.input }, deps.rng);
        deps.setSession((s) => ({ ...s, state: outcome.state }));
        let result = outcome.result;
        const entries: ChatEntry[] = [];
        for (const effect of outcome.effects) {
          if (effect.type === 'chip') entries.push(chip(effect.text, effect.tone));
          else if (effect.type === 'roll_report') {
            entries.push({ id: newId('roll'), kind: 'roll', report: effect.report }, ...effect.report.consequences.map((line) => chip(line, 'bad')));
          }
          deps.onEffect?.(effect);
        }
        if (entries.length) append(...entries);
        if (outcome.pending) {
          const report = await deps.awaitRoll(outcome.pending);
          if (deps.signal?.aborted) throw new ProviderError('aborted', 'Request cancelled');
          result = summarizeReport(report);
          append({ id: newId('roll'), kind: 'roll', report }, ...report.consequences.map((line) => chip(line, 'info')));
          deps.onEffect?.({ type: 'roll_report', report });
        }
        results.push({ type: 'tool_result', toolUseId: call.id, name: call.name, content: JSON.stringify(result), ...(outcome.ok ? {} : { isError: true }) });
      }
      deps.setSession((s) => ({ ...s, history: [...s.history, { role: 'user', content: results }] }));
    }

    const end = deps.getSession();
    return { ok: true, addressed: end.state.ended ? null : addressedMember(lastText, end.state) };
  } catch (e) {
    const aborted = e instanceof ProviderError && e.kind === 'aborted';
    const message = e instanceof ProviderError ? describeProviderError(e, PROVIDER_LABELS[deps.provider.id]) : e instanceof Error ? e.message : String(e);
    // Put everything back as it was before the turn, keeping only the usage that was really spent.
    deps.setSession((s) => ({
      ...before,
      usage: s.usage,
      costUsd: s.costUsd,
      ledger: s.ledger,
      images: s.images,
      chat: aborted ? before.chat : [...before.chat, { id: newId('error'), kind: 'error', text: message }],
    }));
    return { ok: false, addressed: null, error: message };
  }
}

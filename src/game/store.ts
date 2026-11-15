import { create } from 'zustand';
import { compactHistory } from '@/ai/dm/context';
import type { TurnInput } from '@/ai/dm/context';
import { runDmTurn } from '@/ai/dm/orchestrator';
import { buildSystemPrompt } from '@/ai/dm/prompt';
import { onHelperUsage } from '@/ai/helper';
import { priceFor } from '@/ai/pricing';
import { addUsage, getTextProvider, withJsonTools } from '@/ai/providers';
import type { TextProviderId } from '@/ai/providers';
import { useSettings } from '@/app/settingsStore';
import type { CoreContent } from '@/content/core';
import { loadCampaign, loadCore } from '@/content/library';
import type { LoadedCampaign } from '@/content/library';
import { toEngineCampaign } from '@/content/pack';
import type { CampaignPack } from '@/content/pack';
import { parseDice, rollDice } from '@/engine/dice';
import { createCryptoRng } from '@/engine/rng';
import type { Rng } from '@/engine/rng';
import { chooseHeroic as engineChooseHeroic, submitDice as engineSubmitDice } from '@/engine/rolls';
import { applyMilestoneBoost, tick as engineTick } from '@/engine/state';
import type { Effect, EngineCampaign, RollReport, Stat } from '@/engine/types';
import { loadSession, saveSession } from '@/storage/sessions';
import { newId } from './session';
import type { DiceMode, Session } from './session';

export type GameEvent = Effect | { type: 'turn_started' } | { type: 'turn_finished'; ok: boolean } | { type: 'dm_text'; entryId: string; text: string; done: boolean };

const eventListeners = new Set<(event: GameEvent) => void>();
/** Voice, art and music services subscribe here to react to what happens in the game. */
export function onGameEvent(listener: (event: GameEvent) => void): () => void {
  eventListeners.add(listener);
  return () => eventListeners.delete(listener);
}
function emit(event: GameEvent): void {
  for (const l of eventListeners) l(event);
}

interface GameStore {
  session: Session | null;
  pack: CampaignPack | null;
  core: CoreContent | null;
  campaign: EngineCampaign | null;
  assetUrl: LoadedCampaign['assetUrl'];
  /** The DM is working on a turn. */
  busy: boolean;
  /** Party member currently selected on the "Speaking as" chips. */
  speaker: string | null;
  paused: boolean;
  loadError: string | null;
  /** Opens a saved session and its campaign. */
  open(sessionId: string): Promise<void>;
  /** Starts a brand-new session: stores it and runs the opening turn. */
  begin(session: Session, loaded: LoadedCampaign, core: CoreContent): Promise<void>;
  send(text: string, characterId?: string): Promise<void>;
  /** Re-runs the last turn after an error. */
  retry(): Promise<void>;
  submitDice(dice: number[]): void;
  chooseHeroic(choice: 'accept' | 'reroll' | 'plus5'): void;
  /** A roll outside any DM request, shown in the chat. */
  freeRoll(notation: string, characterId?: string): void;
  setSpeaker(id: string): void;
  setDiceMode(mode: DiceMode, playerDice?: Session['playerDice']): void;
  setDmModel(provider: TextProviderId, model: string): void;
  boost(memberId: string, stat: Stat): void;
  tick(ms: number): void;
  setPaused(paused: boolean): void;
  /** Replaces the session object (art and recap services use this). */
  patch(change: (s: Session) => Session): void;
  save(): Promise<void>;
  close(): void;
}

let rng: Rng = createCryptoRng();
/** Tests substitute a deterministic RNG. */
export function setGameRng(next: Rng | null): void {
  rng = next ?? createCryptoRng();
}

let rollResolver: ((report: RollReport) => void) | null = null;
let abort: AbortController | null = null;
let lastInput: TurnInput | null = null;
let unsubscribeHelper: (() => void) | null = null;

export const useGame = create<GameStore>((set, get) => {
  const patch = (change: (s: Session) => Session) => {
    const current = get().session;
    if (current) set({ session: change(current) });
  };

  const runTurn = async (input: TurnInput) => {
    const { session, pack, core, campaign } = get();
    if (!session || !pack || !core || !campaign || get().busy) return;
    if (session.state.ended) return;
    lastInput = input;
    const settings = useSettings.getState().settings;
    abort = new AbortController();
    set({ busy: true });
    emit({ type: 'turn_started' });
    let ok = false;
    try {
      let provider = getTextProvider(session.dm.provider, settings.keys);
      if (settings.dm.toolMode === 'json') provider = withJsonTools(provider);
      let streaming: { id: string; text: string } | null = null;
      const result = await runDmTurn(
        {
          provider,
          model: session.dm.model,
          effort: settings.dm.effort,
          price: priceFor(session.dm.provider, session.dm.model),
          system: buildSystemPrompt(core, pack, session.state),
          campaign,
          rng,
          getSession: () => get().session!,
          setSession: (change) => {
            patch(change);
            // Forward streaming narration to listeners (the voice service speaks it sentence by sentence).
            const last = get().session?.chat.at(-1);
            if (last?.kind === 'dm' && (streaming?.id !== last.id || streaming.text !== last.text)) {
              if (streaming && streaming.id !== last.id) emit({ type: 'dm_text', entryId: streaming.id, text: streaming.text, done: true });
              streaming = { id: last.id, text: last.text };
              emit({ type: 'dm_text', entryId: last.id, text: last.text, done: false });
            }
          },
          awaitRoll: (pending) => {
            if (streaming) emit({ type: 'dm_text', entryId: streaming.id, text: streaming.text, done: true });
            streaming = null;
            if (pending.rollerIsParty) set({ speaker: pending.rollerId });
            return new Promise<RollReport>((resolve) => {
              rollResolver = resolve;
            });
          },
          onEffect: emit,
          signal: abort.signal,
        },
        input,
      );
      const finished = streaming as { id: string; text: string } | null;
      if (finished) emit({ type: 'dm_text', entryId: finished.id, text: finished.text, done: true });
      ok = result.ok;
      if (result.ok) {
        lastInput = null;
        if (result.addressed) set({ speaker: result.addressed });
      }
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      patch((s) => ({ ...s, chat: [...s.chat, { id: newId('error'), kind: 'error', text }] }));
    } finally {
      rollResolver = null;
      abort = null;
      set({ busy: false });
      emit({ type: 'turn_finished', ok });
    }
    await get().save();
    if (ok) void compact();
  };

  const compact = async () => {
    const { session } = get();
    if (!session) return;
    try {
      const { helper, keys } = useSettings.getState().settings;
      const provider = getTextProvider(helper.provider, keys);
      const sessionId = session.id;
      const result = await compactHistory(session.history, session.summary, { provider, model: helper.model });
      // Only apply if no new turn started while the helper was working.
      if (result && get().session?.id === sessionId && !get().busy && get().session!.history.length === session.history.length) {
        patch((s) => ({ ...s, history: result.history, summary: result.summary, usage: { ...s.usage, helper: addUsage(s.usage.helper, result.usage) } }));
        await get().save();
      }
    } catch {
      // Compaction is an optimization: if it fails the full history simply stays.
    }
  };

  const attachHelperAccounting = () => {
    unsubscribeHelper?.();
    unsubscribeHelper = onHelperUsage((completion, cost) => {
      patch((s) => ({ ...s, usage: { ...s.usage, helper: addUsage(s.usage.helper, completion.usage) }, costUsd: s.costUsd + cost }));
    });
  };

  return {
    session: null,
    pack: null,
    core: null,
    campaign: null,
    assetUrl: () => null,
    busy: false,
    speaker: null,
    paused: false,
    loadError: null,

    async open(sessionId) {
      get().close();
      try {
        const session = await loadSession(sessionId);
        if (!session) throw new Error('That saved game no longer exists.');
        const [loaded, core] = await Promise.all([loadCampaign(session.campaignId), loadCore()]);
        // A roll that was pending when the game was closed cannot be resumed: clear it.
        const state = session.state.pendingRoll ? { ...session.state, pendingRoll: null } : session.state;
        set({
          session: { ...session, state },
          pack: loaded.pack,
          core,
          campaign: toEngineCampaign(loaded.pack),
          assetUrl: loaded.assetUrl,
          speaker: state.party.find((p) => p.status === 'ok')?.id ?? state.party[0]?.id ?? null,
          paused: false,
          loadError: null,
        });
        attachHelperAccounting();
      } catch (e) {
        set({ loadError: e instanceof Error ? e.message : String(e) });
      }
    },

    async begin(session, loaded, core) {
      get().close();
      set({
        session,
        pack: loaded.pack,
        core,
        campaign: toEngineCampaign(loaded.pack),
        assetUrl: loaded.assetUrl,
        speaker: session.state.party[0]?.id ?? null,
        paused: false,
        loadError: null,
      });
      attachHelperAccounting();
      await saveSession(session);
      await runTurn({ type: 'start' });
    },

    async send(text, characterId) {
      const { session, speaker } = get();
      const trimmed = text.trim();
      if (!session || !trimmed) return;
      const id = characterId ?? speaker ?? session.state.party[0]?.id;
      if (!id) return;
      await runTurn({ type: 'players', messages: [{ characterId: id, text: trimmed }] });
    },

    async retry() {
      const { session } = get();
      if (!session || get().busy) return;
      const input = lastInput ?? (session.history.length === 0 ? { type: 'start' as const } : { type: 'resume' as const });
      patch((s) => ({ ...s, chat: s.chat.filter((e, i) => !(e.kind === 'error' && i === s.chat.length - 1)) }));
      await runTurn(input);
    },

    submitDice(dice) {
      const { session } = get();
      if (!session?.state.pendingRoll) return;
      const step = engineSubmitDice(session.state, dice, rng);
      patch((s) => ({ ...s, state: step.state }));
      if (step.report) rollResolver?.(step.report);
    },

    chooseHeroic(choice) {
      const { session } = get();
      if (!session?.state.pendingRoll) return;
      const step = engineChooseHeroic(session.state, choice);
      patch((s) => ({ ...s, state: step.state }));
      if (step.report) rollResolver?.(step.report);
    },

    freeRoll(notation, characterId) {
      const { session, speaker } = get();
      const parsed = parseDice(notation);
      if (!session || !parsed) return;
      const member = session.state.party.find((p) => p.id === (characterId ?? speaker)) ?? session.state.party[0]!;
      const roll = rollDice(parsed, rng);
      const report: RollReport = {
        id: newId('free'),
        rollerId: member.id,
        rollerName: member.name,
        kind: 'check',
        stat: 'STR',
        reason: `Free roll: ${notation.trim()}`,
        targetName: null,
        check: { dice: roll.rolls, natural: roll.rolls[0] ?? roll.total, mode: 'normal', modifier: roll.modifier, proficiency: 0, bonus: 0, total: roll.total, dc: 0, success: true, crit: false, complication: false },
        damage: null,
        heroicSpent: 'none',
        notes: [],
        consequences: [],
      };
      patch((s) => ({ ...s, chat: [...s.chat, { id: newId('roll'), kind: 'roll', report, free: true }] }));
    },

    setSpeaker: (id) => set({ speaker: id }),

    setDiceMode(mode, playerDice) {
      patch((s) => ({ ...s, diceMode: mode, playerDice: playerDice ?? s.playerDice }));
      void get().save();
    },

    setDmModel(provider, model) {
      patch((s) => ({ ...s, dm: { provider, model } }));
      void get().save();
    },

    boost(memberId, stat) {
      const { session, campaign } = get();
      if (!session || !campaign) return;
      const state = applyMilestoneBoost(session.state, campaign, memberId, stat);
      const member = state.party.find((p) => p.id === memberId)!;
      patch((s) => ({ ...s, state, chat: [...s.chat, { id: newId('chip'), kind: 'chip', text: `${member.name} grows stronger: +1 ${stat}`, tone: 'good' }] }));
      void get().save();
    },

    tick(ms) {
      const { session, paused } = get();
      if (!session || paused || session.state.ended) return;
      patch((s) => ({ ...s, state: engineTick(s.state, ms) }));
    },

    setPaused: (paused) => set({ paused }),
    patch,

    async save() {
      const { session } = get();
      if (session) await saveSession(session);
    },

    close() {
      abort?.abort();
      abort = null;
      rollResolver = null;
      lastInput = null;
      unsubscribeHelper?.();
      unsubscribeHelper = null;
      set({ session: null, pack: null, core: null, campaign: null, assetUrl: () => null, busy: false, speaker: null, paused: false, loadError: null });
    },
  };
});

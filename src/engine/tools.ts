import { z } from 'zod';
import { parseDice, rollDice } from './dice';
import { damageParty, damageRoster, healParty, healRoster, recoverForNewAct } from './health';
import type { Rng } from './rng';
import { requestRoll, summarizeReport } from './rolls';
import { findCombatant, findPartyMember, findRosterEntry, rosterEntryFromTemplate, slugify } from './state';
import { MOODS, STATS } from './types';
import type { Effect, EngineCampaign, GameState, PendingRoll, RollReport } from './types';

const name = z.string().min(1).max(80);
const amount = z.union([z.number().int().min(0).max(999), z.string().min(1).max(12)]);

/** The DM's tools: the only way the model can change game state. Descriptions are sent to the model. */
export const TOOL_SCHEMAS = {
  request_roll: z.object({
    character: name.describe('Who rolls: a party member, or an NPC/enemy in the scene (rolled automatically).'),
    kind: z.enum(['check', 'attack', 'save']),
    stat: z.enum(STATS).optional().describe('Stat used. Optional for attacks (the attacker\'s weapon stat is used).'),
    dc: z.number().int().min(5).max(25).optional().describe('Easy 10, Moderate 13, Hard 16, Heroic 19. Not used for attacks.'),
    target: name.optional().describe('Required for attacks: who is attacked.'),
    reason: z.string().min(1).max(160).describe('Short reason shown to the player, e.g. "pick the vault lock".'),
    advantage: z.enum(['advantage', 'disadvantage', 'none']).optional(),
    purpose: z.enum(['normal', 'stabilize']).optional().describe('"stabilize" for a WIS DC 10 check on a Downed ally.'),
    attack: z.string().max(60).optional().describe('For NPC attackers: the name of the attack to use.'),
  }),
  apply_damage: z.object({
    target: name,
    amount: amount.describe('A number or dice notation such as "1d6+1". For damage NOT from an attack roll (traps, falls, hazards).'),
    reason: z.string().max(160),
  }),
  heal: z.object({ target: name, amount: amount.describe('A number or dice notation.'), reason: z.string().max(160) }),
  add_condition: z.object({ target: name, condition: z.string().min(1).max(40) }),
  remove_condition: z.object({ target: name, condition: z.string().min(1).max(40) }),
  roster_add: z.object({
    id: z.string().max(60).optional().describe('Cast id from the campaign cast file. Omit to improvise a new character.'),
    name: name.optional().describe('Required when improvising.'),
    role: z.enum(['ally', 'neutral', 'enemy', 'boss']).optional(),
    look: z.string().max(400).optional().describe('Visual description for the portrait.'),
    hp: z.number().int().min(1).max(200).optional(),
    defense: z.number().int().min(5).max(22).optional(),
    attack_name: z.string().max(60).optional(),
    attack_bonus: z.number().int().min(-2).max(10).optional(),
    attack_damage: z.string().max(12).optional().describe('Dice notation, e.g. "1d6+1".'),
    history: z.string().max(400).optional(),
  }),
  roster_remove: z.object({
    id: name.describe('Roster id or name.'),
    reason: z.enum(['defeated', 'fled', 'left', 'ally_departed']),
  }),
  scene_change: z.object({
    location: name.describe('Location id from the world file. For an improvised place give a new short id.'),
    name: z.string().max(80).optional().describe('Display name, only for improvised places.'),
    description: z.string().max(400).optional().describe('Visual description, required for improvised places.'),
  }),
  advance_progress: z.object({
    beat: z.string().max(60).optional().describe('Beat id just completed.'),
    milestone: z.boolean().optional().describe('True if this moves the party clearly closer to the campaign goal.'),
    advance_act: z.boolean().optional().describe('Force the next act to begin even if beats remain.'),
  }),
  record_clue: z.object({ text: z.string().min(1).max(200), id: z.string().max(60).optional() }),
  give_item: z.object({
    name,
    description: z.string().max(200).optional(),
    to: name.optional().describe('Party member name, or omit for a shared party item.'),
  }),
  remove_item: z.object({ name }),
  encounter_result: z.object({ encounter_id: z.string().min(1).max(60), outcome: z.enum(['won', 'lost', 'avoided']) }),
  set_music_mood: z.object({ mood: z.enum(MOODS) }),
  request_image: z.object({
    description: z.string().min(1).max(400).describe('The dramatic moment to illustrate.'),
    include_party: z.boolean().optional(),
  }),
  use_signature: z.object({
    character: name.describe('Party member using their once-per-act signature ability.'),
    target: name.optional().describe('Ally to heal, if the ability heals.'),
  }),
  award_heroic_point: z.object({ character: name, reason: z.string().max(160) }),
  adjust_resource: z.object({
    resource: z.string().min(1).max(40).describe('Campaign resource id, e.g. "nerve" or "oxygen".'),
    delta: z.number().int().min(-20).max(20),
    target: name.optional().describe('Party member, for per-character resources.'),
    reason: z.string().max(160),
  }),
  end_campaign: z.object({
    outcome: z.enum(['victory', 'defeat', 'bittersweet']),
    ending: z.string().max(60).optional().describe('Ending id from the campaign file.'),
    epilogue_hint: z.string().max(400),
  }),
} as const;

export type ToolName = keyof typeof TOOL_SCHEMAS;
export const TOOL_NAMES = Object.keys(TOOL_SCHEMAS) as ToolName[];

export const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  request_roll:
    'Ask for a dice roll. Never invent roll results. For a party member the game pauses until the player rolls; the result comes back as this tool\'s result. Attack hits roll and apply damage automatically.',
  apply_damage: 'Deal damage that does not come from an attack roll.',
  heal: 'Restore hit points. Also gets a Downed character back up.',
  add_condition: 'Add a short condition (e.g. Poisoned, Frightened, Hidden) to a character.',
  remove_condition: 'Remove a condition from a character.',
  roster_add: 'Bring an NPC or enemy into the scene, from the cast file by id or improvised.',
  roster_remove: 'Remove an NPC or enemy from the scene.',
  scene_change: 'Move the party to another location. Sets the music mood and scene image.',
  advance_progress: 'Mark a story beat complete and/or a goal milestone reached.',
  record_clue: 'Record a clue or discovery in the party log.',
  give_item: 'Give the party or a character an item.',
  remove_item: 'Remove an item that was used up, lost or given away.',
  encounter_result: 'Record how an encounter ended.',
  set_music_mood: 'Override the music mood.',
  request_image: 'Ask the Art Director to paint a key story moment. Use sparingly: 2-4 times per session.',
  use_signature: 'A party member uses their signature ability (once per act). The engine applies its effect.',
  award_heroic_point: 'Reward great roleplay or a clever idea with a Heroic Point.',
  adjust_resource: 'Change a campaign-specific resource (see the campaign rules).',
  end_campaign: 'End the campaign after the final scene is resolved.',
};

export function toolJsonSchema(tool: ToolName): Record<string, unknown> {
  const schema = z.toJSONSchema(TOOL_SCHEMAS[tool]) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

export interface ToolCall {
  name: string;
  input: unknown;
}

export interface ToolOutcome {
  state: GameState;
  ok: boolean;
  /** JSON-serializable result handed back to the model. */
  result: Record<string, unknown>;
  effects: Effect[];
  /** Set when the call started a player roll: the real result arrives once the dice are in. */
  pending?: PendingRoll;
  report?: RollReport;
}

function fail(state: GameState, error: string): ToolOutcome {
  return { state, ok: false, result: { error }, effects: [] };
}

function rollAmount(value: number | string, rng: Rng): number | null {
  if (typeof value === 'number') return value;
  const n = parseDice(value);
  return n ? rollDice(n, rng).total : null;
}

/**
 * Validates and applies one DM tool call. Never throws on bad model input:
 * invalid calls return `ok: false` with an error the model can read and correct.
 */
export function applyToolCall(state: GameState, campaign: EngineCampaign, call: ToolCall, rng: Rng): ToolOutcome {
  if (!(call.name in TOOL_SCHEMAS)) {
    return fail(state, `Unknown tool "${call.name}". Available tools: ${TOOL_NAMES.join(', ')}.`);
  }
  const tool = call.name as ToolName;
  if (state.ended && tool !== 'request_image') return fail(state, 'The campaign has ended.');
  const parsed = TOOL_SCHEMAS[tool].safeParse(call.input ?? {});
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ');
    return fail(state, `Invalid input for ${tool}: ${detail}`);
  }
  const next = structuredClone(state);
  const effects: Effect[] = [];
  const done = (result: Record<string, unknown>): ToolOutcome => ({ state: next, ok: true, result, effects });
  const chip = (text: string, tone: 'neutral' | 'good' | 'bad' | 'info' = 'neutral') => effects.push({ type: 'chip', text, tone });

  switch (tool) {
    case 'request_roll': {
      const input = parsed.data as z.infer<typeof TOOL_SCHEMAS.request_roll>;
      const r = requestRoll(state, input, rng);
      if (!r.ok) return fail(state, r.error);
      if (r.deferred) {
        return { state: r.state, ok: true, result: { status: 'waiting for the player to roll' }, effects: r.effects, pending: r.pending };
      }
      return { state: r.state, ok: true, result: summarizeReport(r.report), effects: r.effects, report: r.report };
    }

    case 'apply_damage':
    case 'heal': {
      const input = parsed.data as z.infer<typeof TOOL_SCHEMAS.apply_damage>;
      const target = findCombatant(next, input.target);
      if (!target) return fail(state, `No one called "${input.target}" is known.`);
      const value = rollAmount(input.amount, rng);
      if (value === null) return fail(state, `"${input.amount}" is not a number or dice notation like 1d6+1.`);
      let lines: string[];
      if (tool === 'apply_damage') {
        lines = target.kind === 'party' ? damageParty(next, target.member, value) : damageRoster(target.entry, value);
      } else {
        lines = target.kind === 'party' ? healParty(target.member, value, campaign) : healRoster(target.entry, value);
      }
      for (const line of lines) chip(line, tool === 'heal' ? 'good' : 'bad');
      return done({ amount: value, consequences: lines });
    }

    case 'add_condition':
    case 'remove_condition': {
      const input = parsed.data as z.infer<typeof TOOL_SCHEMAS.add_condition>;
      const target = findCombatant(next, input.target);
      if (!target) return fail(state, `No one called "${input.target}" is known.`);
      const who = target.kind === 'party' ? target.member : target.entry;
      const has = who.conditions.some((c) => c.toLowerCase() === input.condition.toLowerCase());
      if (tool === 'add_condition') {
        if (!has) who.conditions.push(input.condition);
        chip(`${who.name}: ${input.condition}`, 'info');
      } else {
        if (!has) return fail(state, `${who.name} does not have the condition "${input.condition}".`);
        who.conditions = who.conditions.filter((c) => c.toLowerCase() !== input.condition.toLowerCase());
        chip(`${who.name} is no longer ${input.condition}`, 'info');
      }
      return done({ conditions: who.conditions });
    }

    case 'roster_add': {
      const input = parsed.data as z.infer<typeof TOOL_SCHEMAS.roster_add>;
      const template = input.id ? campaign.cast.find((c) => c.id === input.id) : undefined;
      if (input.id && !template && !input.name) {
        return fail(state, `No cast entry "${input.id}". Cast ids: ${campaign.cast.map((c) => c.id).join(', ')}. To improvise, give a name.`);
      }
      if (template) {
        const existing = next.roster.find((e) => e.id === template.id);
        if (existing) {
          if (existing.present && existing.status === 'active') return done({ id: existing.id, note: 'already in the scene' });
          existing.present = true;
          if (existing.status !== 'defeated') existing.status = 'active';
          effects.push({ type: 'roster_added', id: existing.id });
          return done({ id: existing.id, hp: existing.hp, defense: existing.defense });
        }
        const entry = rosterEntryFromTemplate(template);
        next.roster.push(entry);
        effects.push({ type: 'roster_added', id: entry.id });
        chip(`${entry.name} enters the scene`, 'info');
        return done({ id: entry.id, hp: entry.hp, defense: entry.defense, attacks: entry.attacks });
      }
      if (!input.name) return fail(state, 'Give either a cast id or a name for an improvised character.');
      let id = slugify(input.id ?? input.name);
      const taken = new Set([...next.roster.map((e) => e.id), ...next.party.map((p) => p.id), ...campaign.cast.map((c) => c.id)]);
      for (let n = 2; taken.has(id); n++) id = `${slugify(input.id ?? input.name)}-${n}`;
      const role = input.role ?? 'neutral';
      const hostile = role === 'enemy' || role === 'boss';
      if (input.attack_damage && !parseDice(input.attack_damage)) {
        return fail(state, `attack_damage "${input.attack_damage}" is not dice notation like 1d6+1.`);
      }
      const entry = rosterEntryFromTemplate(
        {
          id,
          name: input.name,
          role,
          look: input.look ?? '',
          hp: input.hp ?? (role === 'boss' ? 30 : hostile ? 10 : 8),
          defense: input.defense ?? (role === 'boss' ? 14 : 12),
          attacks:
            hostile || input.attack_damage
              ? [{ name: input.attack_name ?? 'Attack', bonus: input.attack_bonus ?? 3, damage: input.attack_damage ?? '1d6' }]
              : [],
          abilities: [],
          tactics: '',
          history: input.history ?? '',
        },
        true,
      );
      next.roster.push(entry);
      effects.push({ type: 'roster_added', id });
      chip(`${entry.name} enters the scene`, 'info');
      return done({ id, hp: entry.hp, defense: entry.defense, attacks: entry.attacks });
    }

    case 'roster_remove': {
      const input = parsed.data as z.infer<typeof TOOL_SCHEMAS.roster_remove>;
      const entry = findRosterEntry(next, input.id);
      if (!entry) return fail(state, `No roster entry "${input.id}".`);
      entry.present = false;
      entry.status = input.reason;
      effects.push({ type: 'roster_removed', id: entry.id, reason: input.reason });
      return done({ id: entry.id, removed: input.reason });
    }

    case 'scene_change': {
      const input = parsed.data as z.infer<typeof TOOL_SCHEMAS.scene_change>;
      const known = campaign.locations.find((l) => l.id === input.location || l.name.toLowerCase() === input.location.toLowerCase());
      if (known) {
        next.locationId = known.id;
        next.musicMood = known.musicMood;
        effects.push({ type: 'scene_changed', locationId: known.id }, { type: 'music', mood: known.musicMood });
        return done({ location: known.id, name: known.name });
      }
      if (!input.description) {
        return fail(
          state,
          `Unknown location "${input.location}". Known ids: ${campaign.locations.map((l) => l.id).join(', ')}. For an improvised place also give a description.`,
        );
      }
      const id = slugify(input.location);
      if (!next.improvisedLocations.some((l) => l.id === id)) {
        next.improvisedLocations.push({ id, name: input.name ?? input.location, description: input.description });
      }
      next.locationId = id;
      effects.push({ type: 'scene_changed', locationId: id });
      return done({ location: id, improvised: true });
    }

    case 'advance_progress': {
      const input = parsed.data as z.infer<typeof TOOL_SCHEMAS.advance_progress>;
      if (!input.beat && !input.milestone && !input.advance_act) return fail(state, 'Give a beat, a milestone, or advance_act.');
      if (input.beat && !next.beatsCompleted.includes(input.beat)) next.beatsCompleted.push(input.beat);
      if (input.milestone && next.milestonesDone < campaign.goal.milestones) {
        next.milestonesDone += 1;
        chip(`Milestone reached (${next.milestonesDone}/${campaign.goal.milestones})`, 'good');
      }
      const act = campaign.acts[next.actIndex];
      const actDone = !!act && act.beats.length > 0 && act.beats.every((b) => next.beatsCompleted.includes(b));
      if ((input.advance_act || actDone) && next.actIndex < campaign.acts.length - 1) {
        next.actIndex += 1;
        const lines = recoverForNewAct(next, campaign);
        for (const line of lines) chip(line, 'good');
        const title = campaign.acts[next.actIndex]!.title;
        chip(`Act ${next.actIndex + 1}: ${title}`, 'info');
        effects.push({ type: 'act_advanced', actIndex: next.actIndex });
        if (next.actIndex >= Math.floor(campaign.acts.length / 2) && next.party.some((p) => !p.milestoneBoostTaken)) {
          effects.push({ type: 'milestone_boost_available' });
        }
      }
      return done({
        act: next.actIndex + 1,
        beats_completed: next.beatsCompleted,
        milestones: `${next.milestonesDone}/${campaign.goal.milestones}`,
      });
    }

    case 'record_clue': {
      const input = parsed.data as z.infer<typeof TOOL_SCHEMAS.record_clue>;
      const id = input.id ? slugify(input.id) : `clue-${next.clues.length + 1}`;
      if (next.clues.some((c) => c.id === id || c.text === input.text)) return done({ note: 'already recorded' });
      next.clues.push({ id, text: input.text });
      chip(`Clue found: ${input.text}`, 'info');
      return done({ id });
    }

    case 'give_item': {
      const input = parsed.data as z.infer<typeof TOOL_SCHEMAS.give_item>;
      let holder = 'party';
      if (input.to && input.to.toLowerCase() !== 'party') {
        const member = findPartyMember(next, input.to);
        if (!member) return fail(state, `No party member called "${input.to}".`);
        holder = member.id;
      }
      next.items.push({ name: input.name, description: input.description ?? '', holder });
      const who = holder === 'party' ? 'The party' : next.party.find((p) => p.id === holder)!.name;
      chip(`${who} gains: ${input.name}`, 'good');
      return done({ holder });
    }

    case 'remove_item': {
      const input = parsed.data as z.infer<typeof TOOL_SCHEMAS.remove_item>;
      const i = next.items.findIndex((it) => it.name.toLowerCase() === input.name.toLowerCase());
      if (i < 0) return fail(state, `No item called "${input.name}". Items: ${next.items.map((it) => it.name).join(', ') || 'none'}.`);
      next.items.splice(i, 1);
      chip(`Item gone: ${input.name}`);
      return done({ removed: input.name });
    }

    case 'encounter_result': {
      const input = parsed.data as z.infer<typeof TOOL_SCHEMAS.encounter_result>;
      const existing = next.encounters.find((e) => e.id === input.encounter_id);
      if (existing) existing.outcome = input.outcome;
      else next.encounters.push({ id: input.encounter_id, outcome: input.outcome });
      chip(`Encounter ${input.outcome}`, input.outcome === 'lost' ? 'bad' : 'good');
      return done({ encounters: next.encounters.length });
    }

    case 'set_music_mood': {
      const input = parsed.data as z.infer<typeof TOOL_SCHEMAS.set_music_mood>;
      next.musicMood = input.mood;
      effects.push({ type: 'music', mood: input.mood });
      return done({ mood: input.mood });
    }

    case 'request_image': {
      const input = parsed.data as z.infer<typeof TOOL_SCHEMAS.request_image>;
      effects.push({ type: 'image_request', description: input.description, includeParty: input.include_party ?? true });
      return done({ status: 'queued; it will appear when ready, keep narrating' });
    }

    case 'use_signature': {
      const input = parsed.data as z.infer<typeof TOOL_SCHEMAS.use_signature>;
      const member = findPartyMember(next, input.character);
      if (!member) return fail(state, `No party member called "${input.character}".`);
      if (member.status !== 'ok') return fail(state, `${member.name} is ${member.status} and cannot act.`);
      if (member.signatureUsedInAct === next.actIndex) {
        return fail(state, `${member.name} has already used ${member.signature.name} this act.`);
      }
      member.signatureUsedInAct = next.actIndex;
      const sig = member.signature;
      const result: Record<string, unknown> = { ability: sig.name, description: sig.description };
      chip(`${member.name} uses ${sig.name}`, 'good');
      const effect = sig.effect;
      if (effect.type === 'heal') {
        const target = input.target ? findPartyMember(next, input.target) : member;
        if (!target) return fail(state, `No party member called "${input.target}".`);
        const lines = healParty(target, rollDice(effect.dice, rng).total, campaign);
        for (const line of lines) chip(line, 'good');
        result.consequences = lines;
      } else if (effect.type === 'next_roll') {
        member.boons.push({ type: 'next_roll', advantage: effect.advantage ?? false, bonus: effect.bonus ?? 0, source: sig.name });
        result.effect = `${member.name}'s next roll gets ${effect.advantage ? 'advantage' : ''}${effect.advantage && effect.bonus ? ' and ' : ''}${effect.bonus ? `+${effect.bonus}` : ''}`;
      } else if (effect.type === 'damage_bonus') {
        member.boons.push({ type: 'damage_bonus', dice: effect.dice, source: sig.name });
        result.effect = `${member.name}'s next hit deals +${effect.dice} damage`;
      } else if (effect.type === 'guard') {
        member.boons.push({ type: 'guard', amount: effect.amount, source: sig.name });
        result.effect = `the next damage any party member takes is reduced by ${effect.amount}`;
      } else {
        result.effect = 'narrative: describe it succeeding as written';
      }
      return done(result);
    }

    case 'award_heroic_point': {
      const input = parsed.data as z.infer<typeof TOOL_SCHEMAS.award_heroic_point>;
      const member = findPartyMember(next, input.character);
      if (!member) return fail(state, `No party member called "${input.character}".`);
      if (member.heroicPoints >= 3) return done({ heroic_points: member.heroicPoints, note: 'already at the maximum of 3' });
      member.heroicPoints += 1;
      chip(`${member.name} earns a Heroic Point`, 'good');
      return done({ heroic_points: member.heroicPoints });
    }

    case 'adjust_resource': {
      const input = parsed.data as z.infer<typeof TOOL_SCHEMAS.adjust_resource>;
      const def = campaign.resources.find((r) => r.id === input.resource || r.name.toLowerCase() === input.resource.toLowerCase());
      if (!def) {
        return fail(state, `No resource "${input.resource}". Resources: ${campaign.resources.map((r) => r.id).join(', ') || 'none in this campaign'}.`);
      }
      const clamp = (v: number) => Math.max(0, Math.min(def.max, v));
      if (def.scope === 'party') {
        const value = clamp((next.partyResources[def.id] ?? def.start) + input.delta);
        next.partyResources[def.id] = value;
        chip(`${def.name}: ${value}/${def.max}`, input.delta < 0 ? 'bad' : 'good');
        return done({ resource: def.id, value, max: def.max, ...(value === 0 ? { warning: `${def.name} has run out` } : {}) });
      }
      if (!input.target) return fail(state, `${def.name} is tracked per character: give a target.`);
      const member = findPartyMember(next, input.target);
      if (!member) return fail(state, `No party member called "${input.target}".`);
      const value = clamp((member.resources[def.id] ?? def.start) + input.delta);
      member.resources[def.id] = value;
      chip(`${member.name} ${def.name}: ${value}/${def.max}`, input.delta < 0 ? 'bad' : 'good');
      return done({ resource: def.id, target: member.name, value, max: def.max, ...(value === 0 ? { warning: `${member.name}'s ${def.name} has run out` } : {}) });
    }

    case 'end_campaign': {
      const input = parsed.data as z.infer<typeof TOOL_SCHEMAS.end_campaign>;
      if (next.pendingRoll) return fail(state, 'Resolve the pending roll before ending the campaign.');
      next.ended = { outcome: input.outcome, ending: input.ending ?? null, epilogueHint: input.epilogue_hint };
      next.musicMood = input.outcome === 'defeat' ? 'defeat' : 'triumph';
      effects.push({ type: 'music', mood: next.musicMood }, { type: 'campaign_ended', outcome: input.outcome });
      return done({ ended: input.outcome, note: 'Narrate a short epilogue now.' });
    }
  }
}

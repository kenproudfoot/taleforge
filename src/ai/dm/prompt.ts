import type { CoreContent } from '@/content/core';
import type { CampaignPack } from '@/content/pack';
import { STATS } from '@/engine/types';
import type { GameState, PartyMember } from '@/engine/types';
import type { ChatRequest } from '../providers/types';

function signed(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}

export function describeMember(m: PartyMember): string {
  const p = m.profile;
  const lines = [
    `### ${m.name} (${m.archetypeName}${m.isCompanion ? ', companion character' : ''}), played by ${m.playerName}`,
    p.pronouns && `Pronouns: ${p.pronouns}`,
    [p.age, p.build, p.features].filter(Boolean).join(', ') && `Appearance: ${[p.age, p.build, p.features].filter(Boolean).join(', ')}`,
    p.strikingFeature && `Striking feature: ${p.strikingFeature}`,
    p.outfit && `Outfit: ${p.outfit}`,
    p.signatureItem && `Signature item: ${p.signatureItem}`,
    m.companion && `Companion: ${m.companion.name}, ${m.companion.description}`,
    p.trait && `Personality: ${p.trait}`,
    p.flaw && `Flaw or fear: ${p.flaw}`,
    p.hook && `Hook: ${p.hook}`,
    `Stats: ${STATS.map((s) => `${s} ${signed(m.stats[s])}`).join(', ')}; proficient in ${m.proficiencies.join(' and ')}`,
    `Attack: ${m.attackStat}, d${m.weaponDie} damage. Gear: ${m.gear.join(', ')}`,
    `Signature ability (once per act): ${m.signature.name}. ${m.signature.description}`,
  ];
  return lines.filter(Boolean).join('\n');
}

function campaignSection(pack: CampaignPack): string {
  const m = pack.manifest;
  const out: string[] = [];
  out.push(`# The campaign: ${m.title}`);
  out.push(`Genre: ${m.genre}. Setting: ${m.era}. Tone: ${pack.world.tone} Content rating: ${m.content_rating}. Target length: ${m.target_minutes} minutes.`);
  out.push(`Goal: ${m.goal.text} (${m.goal.milestones} milestones)`);
  out.push(`## Overview\n${pack.overview}`);
  if (pack.opening) out.push(`## Opening scene\n${pack.opening}`);
  out.push('## Acts and beats');
  m.acts.forEach((act, i) => {
    out.push(`### Act ${i + 1}: ${act.title} (about ${act.minutes} minutes)`);
    for (const beat of act.beats) out.push(`Beat "${beat}": ${pack.beats[beat] ?? ''}`);
  });
  out.push('## Endings');
  for (const ending of m.endings) out.push(`Ending "${ending}": ${pack.endings[ending] ?? ''}`);
  out.push(`## World lore\n${pack.world.lore}`);
  if (pack.world.factions.length) out.push(`Factions:\n${pack.world.factions.map((f) => `- ${f.name}: ${f.summary}`).join('\n')}`);
  out.push('## Locations (use these ids with scene_change)');
  for (const l of pack.world.locations) {
    out.push(`- ${l.id}: ${l.name}.${l.connects.length ? ` Leads to: ${l.connects.join(', ')}.` : ''} ${l.description}`);
  }
  out.push('## Cast (use these ids with roster_add)');
  for (const c of pack.cast) {
    const attacks = c.attacks.map((a) => `${a.name} ${signed(a.bonus)} for ${a.damage}`).join('; ');
    out.push(
      [
        `- ${c.id}: ${c.name} (${c.role}). ${c.look}. HP ${c.hp}, Defense ${c.defense}${attacks ? `, attacks: ${attacks}` : ''}.`,
        c.abilities.length ? `  Abilities: ${c.abilities.join(' | ')}` : '',
        c.tactics ? `  Tactics: ${c.tactics}` : '',
        c.history ? `  History: ${c.history}` : '',
        c.notes ? `  How to play: ${c.notes}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
  if (pack.rules.extra_rules.length || pack.rules.resources.length) {
    out.push('## Campaign rules');
    for (const r of pack.rules.resources) {
      out.push(`- Resource "${r.id}" (${r.name}, ${r.scope === 'party' ? 'shared by the party' : 'per character'}, starts at ${r.start} of ${r.max}): ${r.description} Change it with adjust_resource.`);
    }
    for (const r of pack.rules.extra_rules) out.push(`- ${r.name}: ${r.text}`);
    if (pack.rules.permadeath) out.push('- Permadeath is ON: a character who is Out of the fight is dead.');
  }
  if (pack.secrets.length) {
    out.push('## SECRETS (Dungeon Master only)');
    out.push('Never state or hint at a secret until its reveal condition has actually happened in play. Until then, play NPCs as if the secret were true but unspoken.');
    for (const s of pack.secrets) out.push(`- ${s.title}. Reveal when: ${s.revealWhen}\n  ${s.text.replace(/\n+/g, ' ')}`);
  }
  return out.join('\n\n');
}

/**
 * The stable system prompt: DM style, core rules, the whole campaign pack and the party sheets.
 * It is identical on every request of a session (until a milestone boost changes a stat), so it is
 * marked for prompt caching. Volatile state travels in the turn message instead.
 *
 * Design choice: the secrets section is always included, marked DM-only with its reveal conditions,
 * so the DM can foreshadow fairly and play NPCs consistently.
 */
export function buildSystemPrompt(core: CoreContent, pack: CampaignPack, state: GameState): ChatRequest['system'] {
  const text = [
    `You are the Dungeon Master for "${pack.manifest.title}", a tabletop role-playing session played aloud by ${state.party.filter((p) => !p.isCompanion).length} player(s) at one computer.`,
    core.dmStyle,
    `# Rules of the game\nThe game engine applies these rules and does all arithmetic. You decide when they apply.\n\n${core.rules}`,
    campaignSection(pack),
    `# The party\n\n${state.party.map(describeMember).join('\n\n')}`,
    [
      '# Each turn',
      'Every player message arrives with the current game state and a pacing note. Trust that state over your memory.',
      'Reply with spoken narration (2-5 sentences), using tools for every roll and every change to the game. End by addressing a character by name.',
      'Before you narrate, check: is someone attacking or attempting something risky? Then call request_roll first and wait for the result. Has the party arrived somewhere new? Then call scene_change first.',
    ].join('\n'),
  ].join('\n\n');
  return [{ text, cache: true }];
}

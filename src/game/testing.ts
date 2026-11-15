// Test fixtures built from the real bundled content. Not used by the shipped app.
import { skinArchetypes, toEngineCampaign } from '@/content/pack';
import { loadTestCore, loadTestPack } from '@/content/testing';
import { createGame } from '@/engine/state';
import { buildParty, emptyAnswers } from './characters';
import type { CharacterAnswers } from './characters';
import { createSession } from './session';
import type { Session } from './session';

export function testAnswers(): CharacterAnswers[] {
  return [
    { ...emptyAnswers(0), playerName: 'Sam', archetype: 'medic', name: 'Lyra Vance', pronouns: 'she/her', bump: 'WIS', trait: 'Stubbornly kind', hook: 'Elder Maren pulled you from the surf as a child.' },
    { ...emptyAnswers(1), playerName: 'Alex', archetype: 'bruiser', name: 'Brann', pronouns: 'he/him', bump: 'CON', signatureItem: 'A notched war-axe', companion: { name: 'Biscuit', description: 'a scruffy terrier', fullMember: false, archetype: '' } },
  ];
}

export function testWorld() {
  const pack = loadTestPack();
  const core = loadTestCore();
  const campaign = toEngineCampaign(pack);
  const archetypes = skinArchetypes(core.archetypes, pack);
  return { pack, core, campaign, archetypes };
}

/** A fresh two-character session of The Sunken Crown (Lyra the Healer, Brann the Knight). */
export function testSession(): Session {
  const { pack, campaign, archetypes } = testWorld();
  const state = createGame(campaign, buildParty(testAnswers(), archetypes, campaign));
  return createSession({ campaignId: pack.id, campaignTitle: pack.manifest.title, state, dm: { provider: 'mock', model: 'mock-dm' }, diceMode: 'digital', now: 1_800_000_000_000 });
}

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyToolCall } from '@/engine/tools';
import { createGame } from '@/engine/state';
import { createSeededRng } from '@/engine/rng';
import { buildParty, emptyAnswers } from '@/game/characters';
import { skinArchetypes, parseCampaignPack, toEngineCampaign } from './pack';
import { loadTestCore, readPackFiles } from './testing';

const IDS = readdirSync(join(process.cwd(), 'public/content/campaigns'), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

describe.each(IDS)('starter campaign %s', (id) => {
  const { pack, issues } = parseCampaignPack(readPackFiles(id), { folder: id });

  it('validates with no errors or warnings', () => {
    expect(issues).toEqual([]);
    expect(pack).not.toBeNull();
  });

  it('meets the starter-campaign bar: 3 acts, 6-8 beats, 6+ cast, a boss, 2+ endings, re-skins for all roles', () => {
    const m = pack!.manifest;
    expect(m.acts).toHaveLength(3);
    const beats = m.acts.flatMap((a) => a.beats);
    expect(beats.length).toBeGreaterThanOrEqual(6);
    expect(beats.length).toBeLessThanOrEqual(8);
    expect(pack!.cast.length).toBeGreaterThanOrEqual(6);
    expect(pack!.cast.some((c) => c.role === 'boss')).toBe(true);
    expect(m.endings.length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(pack!.rules.archetype_skins)).toHaveLength(8);
    expect(m.acts.reduce((n, a) => n + a.minutes, 0)).toBe(m.target_minutes);
    expect(pack!.secrets.length).toBeGreaterThanOrEqual(3);
    expect(m.hooks.length).toBeGreaterThanOrEqual(3);
  });

  it('every ending says its outcome, and every location is reachable from the opening', () => {
    for (const ending of pack!.manifest.endings) expect(pack!.endings[ending]).toMatch(/Outcome: (victory|bittersweet|defeat)\./);
    const locations = pack!.world.locations;
    const seen = new Set([pack!.manifest.opening_location ?? locations[0]!.id]);
    for (let changed = true; changed; ) {
      changed = false;
      for (const l of locations) {
        if (!seen.has(l.id)) continue;
        for (const next of l.connects) {
          if (!seen.has(next)) {
            seen.add(next);
            changed = true;
          }
        }
      }
    }
    expect([...seen].sort()).toEqual(locations.map((l) => l.id).sort());
  });

  it('can be played start to finish through the engine', () => {
    const campaign = toEngineCampaign(pack!);
    const archetypes = skinArchetypes(loadTestCore().archetypes, pack!);
    const party = buildParty([{ ...emptyAnswers(0), playerName: 'A', archetype: 'scholar', name: 'Quinn', bump: 'INT' }], archetypes, campaign);
    let state = createGame(campaign, party);
    const rng = createSeededRng(1);
    expect(state.locationId).toBe(pack!.manifest.opening_location);
    for (const l of pack!.world.locations) state = applyToolCall(state, campaign, { name: 'scene_change', input: { location: l.id } }, rng).state;
    for (const c of pack!.cast) {
      const out = applyToolCall(state, campaign, { name: 'roster_add', input: { id: c.id } }, rng);
      expect(out.ok).toBe(true);
      state = out.state;
    }
    for (const beat of campaign.acts.flatMap((a) => a.beats)) state = applyToolCall(state, campaign, { name: 'advance_progress', input: { beat, milestone: true } }, rng).state;
    expect(state.actIndex).toBe(2);
    expect(state.milestonesDone).toBe(campaign.goal.milestones);
    for (const r of campaign.resources) {
      const out = applyToolCall(state, campaign, { name: 'adjust_resource', input: { resource: r.id, delta: -1, target: 'Quinn', reason: 'test' } }, rng);
      expect(out.ok).toBe(true);
    }
    const end = applyToolCall(state, campaign, { name: 'end_campaign', input: { outcome: 'victory', ending: campaign.endings[0], epilogue_hint: 'x' } }, rng);
    expect(end.state.ended?.ending).toBe(campaign.endings[0]);
  });
});

it('ships exactly the three starter campaigns', () => {
  expect(IDS.sort()).toEqual(['ashes-on-45th-street', 'signal-from-kepler-9', 'the-sunken-crown']);
});

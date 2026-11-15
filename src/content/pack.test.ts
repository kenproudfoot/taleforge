import { describe, expect, it } from 'vitest';
import { parseCore } from './core';
import { formatIssue, hasErrors } from './issues';
import type { Issue } from './issues';
import { PACK_FILES, parseCampaignPack, skinArchetypes, toEngineCampaign } from './pack';
import type { PackContext, PackFile, PackFiles } from './pack';
import { summarizePack } from './summary';
import { loadTestCore, loadTestPack, readCoreFiles, readPackFiles } from './testing';

const GOOD = readPackFiles();

/** Returns the issues for the good pack with one text replacement applied to one file. */
function broken(file: PackFile, from: string | RegExp, to: string, context: PackContext = {}): Issue[] {
  const text = GOOD[file];
  const changed = text.replace(from, to);
  if (changed === text) throw new Error(`fixture replacement did not match in ${file}: ${String(from)}`);
  const result = parseCampaignPack({ ...GOOD, [file]: changed }, context);
  if (hasErrors(result.issues)) expect(result.pack).toBeNull();
  return result.issues;
}

function lineOf(file: PackFile, needle: string, text: string = GOOD[file]): number {
  const index = text.split('\n').findIndex((l) => l.includes(needle));
  if (index < 0) throw new Error(`"${needle}" not found in ${file}`);
  return index + 1;
}

describe('a good pack', () => {
  it('parses with no issues', () => {
    const { pack, issues } = parseCampaignPack(GOOD, { folder: 'the-sunken-crown', assets: [], bundledTracks: [] });
    expect(issues).toEqual([]);
    expect(pack).not.toBeNull();
  });

  it('exposes the content the app needs', () => {
    const pack = loadTestPack();
    expect(pack.id).toBe('the-sunken-crown');
    expect(pack.players).toEqual({ min: 1, max: 4 });
    expect(pack.overview).toMatch(/Tolmere/);
    expect(pack.opening).toMatch(/Dusk in Brinewick/);
    expect(Object.keys(pack.beats)).toHaveLength(7);
    expect(Object.keys(pack.endings)).toEqual(['the-bell-rings', 'a-new-warden', 'lost-to-the-deep']);
    expect(pack.world.locations).toHaveLength(7);
    expect(pack.world.locations[0]).toMatchObject({ id: 'brinewick', musicMood: 'calm', connects: ['causeway'] });
    expect(pack.world.locations[0]!.description).toMatch(/tarred cottages/);
    expect(pack.world.lore).toMatch(/Velmar was a sea-kingdom/);
    expect(pack.cast.find((c) => c.id === 'drowned-king')).toMatchObject({ role: 'boss', hp: 44 });
    expect(pack.cast.find((c) => c.id === 'captain-varr')!.notes).toMatch(/mirror/);
    expect(pack.cast.find((c) => c.id === 'pip')!.attacks).toEqual([]);
    expect(pack.secrets).toHaveLength(5);
    expect(pack.secrets[0]).toMatchObject({ id: 'the-bargain' });
    expect(pack.secrets[0]!.text).toMatch(/bargained with the Deep/);
    expect(pack.rules.resources[0]).toMatchObject({ id: 'tide', scope: 'party', start: 6 });
    expect(pack.rules.prose).toMatch(/Tide Clock/);
  });

  it('converts to the engine campaign with the opening location first', () => {
    const engine = toEngineCampaign(loadTestPack());
    expect(engine).toMatchObject({ id: 'the-sunken-crown', targetMinutes: 45, permadeath: false });
    expect(engine.locations[0]!.id).toBe('brinewick');
    expect(engine.acts.map((a) => a.beats.length)).toEqual([2, 3, 2]);
    expect(engine.cast[0]).not.toHaveProperty('voice');
    const reordered = toEngineCampaign({ ...loadTestPack(), manifest: { ...loadTestPack().manifest, opening_location: 'causeway' } });
    expect(reordered.locations[0]!.id).toBe('causeway');
  });

  it('re-skins archetypes for the campaign', () => {
    const skinned = skinArchetypes(loadTestCore().archetypes, loadTestPack());
    const knight = skinned.find((a) => a.id === 'bruiser')!;
    expect(knight.name).toBe('Knight');
    expect(knight.signature.name).toBe('Shield Wall');
    expect(knight.signature.description).toMatch(/^You plant your feet.*\(Step in front of a blow/);
    expect(knight.signature.effect).toEqual({ type: 'guard', amount: 8 });
    expect(knight.gear[0]).toBe('Longsword or war-axe');
    const pack = loadTestPack();
    const bare = skinArchetypes(loadTestCore().archetypes, { ...pack, rules: { ...pack.rules, archetype_skins: {} } });
    expect(bare.find((a) => a.id === 'bruiser')!.name).toBe('Bruiser');
  });

  it('summarizes for the picker', () => {
    expect(summarizePack(loadTestPack())).toMatchObject({ id: 'the-sunken-crown', targetMinutes: 45, players: '1-4', keyArt: null });
  });
});

describe('precise errors on broken packs', () => {
  it('reports missing files', () => {
    const files: Partial<PackFiles> = { ...GOOD };
    delete files['secrets.md'];
    const { pack, issues } = parseCampaignPack(files);
    expect(pack).toBeNull();
    expect(issues).toEqual([expect.objectContaining({ file: 'secrets.md', message: 'File is missing.' })]);
    expect(issues[0]!.fix).toContain(PACK_FILES.join(', '));
  });

  it('reports a file with no front matter', () => {
    const { issues } = parseCampaignPack({ ...GOOD, 'world.md': '# World\nNo front matter here.' });
    expect(issues[0]).toMatchObject({ file: 'world.md', line: 1, message: 'No YAML front matter found.' });
  });

  it('reports YAML syntax errors with a line number', () => {
    const issues = broken('cast.md', 'hp: 8', 'hp: [8');
    expect(issues[0]).toMatchObject({ severity: 'error', file: 'cast.md' });
    expect(issues[0]!.message).toMatch(/^YAML syntax error/);
    expect(issues[0]!.line).toBeGreaterThan(1);
  });

  it('missing required field: names the field and shows an example', () => {
    const issues = broken('campaign.md', /^title: .*\n/m, '');
    expect(issues).toEqual([
      expect.objectContaining({ file: 'campaign.md', field: 'title', message: 'Missing required field "title".', fix: 'Add it, e.g. title: The Sunken Crown' }),
    ]);
  });

  it('wrong type: says what was expected, at the right line', () => {
    const issues = broken('campaign.md', 'target_minutes: 45', 'target_minutes: "long"');
    expect(issues[0]).toMatchObject({ field: 'target_minutes', line: lineOf('campaign.md', 'target_minutes'), message: '"target_minutes" must be number.' });
  });

  it('bad enum value: lists the allowed values at the right line', () => {
    const issues = broken('world.md', 'music_mood: mystery\n    connects: [causeway, cathedral-nave]', 'music_mood: spooky\n    connects: [causeway, cathedral-nave]');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ file: 'world.md', field: 'locations.2.music_mood', line: lineOf('world.md', 'name: The Gate of Bells') + 2 });
    expect(issues[0]!.fix).toBe('Use one of: title, exploration, tension, combat, calm, mystery, triumph, defeat.');
  });

  it('typo in a field name: reported as unknown', () => {
    const issues = broken('campaign.md', 'tagline:', 'tagline2:');
    expect(issues.map((i) => i.message)).toEqual(expect.arrayContaining(['Missing required field "tagline".', 'Unknown field: tagline2.']));
    const unknown = issues.find((i) => i.message.startsWith('Unknown'))!;
    expect(unknown.line).toBe(lineOf('campaign.md', 'tagline:'));
    expect(unknown.fix).toMatch(/check for typos/);
  });

  it('bad colour, id and player range', () => {
    expect(broken('campaign.md', 'accent: "#d9b45a"', 'accent: gold')[0]).toMatchObject({ field: 'theme.accent' });
    expect(broken('campaign.md', 'id: the-sunken-crown', 'id: The Sunken Crown')[0]!.message).toMatch(/lowercase letters, digits and hyphens/);
    expect(broken('campaign.md', 'players: 1-4', 'players: 2-9')[0]!.message).toMatch(/between 1 and 4/);
  });

  it('beat listed in an act but never described', () => {
    const issues = broken('campaign.md', '### the-reliquary', '### the-vault');
    const err = issues.find((i) => i.severity === 'error')!;
    expect(err).toMatchObject({ file: 'campaign.md', field: 'acts.1.beats.2', line: lineOf('campaign.md', 'id: act2'), message: 'Beat "the-reliquary" has no description.' });
    expect(err.fix).toContain('### the-reliquary');
    const warning = issues.find((i) => i.severity === 'warning')!;
    expect(warning.message).toBe('Section "### the-vault" is not listed in any act.');
    expect(warning.line).toBe(lineOf('campaign.md', '### the-reliquary'));
  });

  it('missing overview and ending descriptions', () => {
    expect(broken('campaign.md', '## Overview', '## Summary')[0]).toMatchObject({ message: 'Missing the "## Overview" section.' });
    const issues = broken('campaign.md', '### a-new-warden', '### other');
    expect(issues[0]).toMatchObject({ field: 'endings.1', message: 'Ending "a-new-warden" has no description.' });
  });

  it('duplicate ids', () => {
    expect(broken('campaign.md', 'beats: [throne-of-tides, the-turning-tide]', 'beats: [throne-of-tides, the-causeway]').map((i) => i.message)).toContain(
      'Beat "the-causeway" appears in more than one place.',
    );
    expect(broken('campaign.md', 'id: act2', 'id: act1')[0]!.message).toBe('Act id "act1" is used more than once.');
    expect(broken('world.md', '- id: causeway', '- id: brinewick').map((i) => i.message)).toContain('Location id "brinewick" is used more than once.');
    expect(broken('cast.md', '- id: pip', '- id: elder-maren')[0]!.message).toBe('Cast id "elder-maren" is used more than once.');
    expect(broken('secrets.md', '- id: marens-debt', '- id: the-bargain').map((i) => i.message)).toContain('Secret id "the-bargain" is used more than once.');
  });

  it('cross-file references', () => {
    const connect = broken('world.md', 'connects: [causeway]', 'connects: [harbor]');
    expect(connect[0]).toMatchObject({ file: 'world.md', field: 'locations.0.connects.0', message: 'Location "brinewick" connects to unknown location "harbor".' });
    expect(connect[0]!.fix).toContain('causeway');
    const opening = broken('campaign.md', 'opening_location: brinewick', 'opening_location: tavern');
    expect(opening[0]).toMatchObject({ file: 'campaign.md', field: 'opening_location', line: lineOf('campaign.md', 'opening_location') });
  });

  it('folder name must match the id', () => {
    const { issues } = parseCampaignPack(GOOD, { folder: 'sunken' });
    expect(issues[0]).toMatchObject({ field: 'id', line: 2 });
    expect(issues[0]!.fix).toMatch(/Rename the folder to "the-sunken-crown"/);
  });

  it('cast problems: enemy without attacks, bad dice', () => {
    const noAttack = broken('cast.md', 'attacks: [{ name: Crowbar, bonus: 4, damage: 1d6+2 }]', 'attacks: []');
    expect(noAttack[0]).toMatchObject({ file: 'cast.md', field: 'cast.5.attacks', line: lineOf('cast.md', '- id: wrecker'), message: 'Wrecker is an enemy but has no attacks.' });
    const dice = broken('cast.md', 'damage: 1d6+2 }]', 'damage: lots }]');
    expect(dice[0]).toMatchObject({ field: 'cast.5.attacks.0.damage', message: 'Must be dice notation such as 1d6+1.' });
    expect(dice[0]!.fix).toContain('damage: 1d6+1');
  });

  it('rules problems', () => {
    expect(broken('rules.md', 'start: 6', 'start: 9')[0]).toMatchObject({ field: 'resources.0.start', message: 'Resource "tide" starts at 9, above its max of 6.' });
    const skin = broken('rules.md', '  bruiser:', '  paladin:');
    expect(skin[0]).toMatchObject({ file: 'rules.md' });
    expect(skin[0]!.field).toMatch(/^archetype_skins/);
  });

  it('secret without text', () => {
    const issues = broken('secrets.md', '### varrs-voice', '### something-else');
    expect(issues[0]).toMatchObject({ file: 'secrets.md', field: 'secrets.4', message: 'Secret "varrs-voice" has no text.' });
  });

  it('audio and key art references are checked against the pack and the bundled tracks', () => {
    const withAudio = GOOD['campaign.md'].replace('goal:', 'audio:\n  title: bundled:fantasy-title\n  combat: assets/music/fight.ogg\nkey_art: assets/key-art.jpg\ngoal:');
    const files = { ...GOOD, 'campaign.md': withAudio };
    expect(parseCampaignPack(files).issues).toEqual([]);
    const ok = parseCampaignPack(files, { bundledTracks: ['fantasy-title'], assets: ['assets/music/fight.ogg', 'assets/key-art.jpg'] });
    expect(ok.issues).toEqual([]);
    expect(ok.pack?.manifest.audio).toEqual({ title: 'bundled:fantasy-title', combat: 'assets/music/fight.ogg' });
    const bad = parseCampaignPack(files, { bundledTracks: ['noir-title'], assets: [] });
    expect(bad.issues.map((i) => i.message)).toEqual([
      'Unknown bundled track "fantasy-title".',
      'Audio file "assets/music/fight.ogg" is not in the pack.',
      'Key art "assets/key-art.jpg" is not in the pack.',
    ]);
    expect(bad.issues[0]).toMatchObject({ field: 'audio.title', line: lineOf('campaign.md', 'title: bundled:fantasy-title', withAudio) });
    const badRef = parseCampaignPack({ ...GOOD, 'campaign.md': withAudio.replace('bundled:fantasy-title', 'spotify:track') });
    expect(badRef.issues[0]!.message).toMatch(/bundled:<track-id>/);
  });
});

describe('warnings do not block a pack', () => {
  it('act budgets far from the target length', () => {
    const { pack, issues } = parseCampaignPack({ ...GOOD, 'campaign.md': GOOD['campaign.md'].replace('minutes: 18', 'minutes: 60') });
    expect(pack).not.toBeNull();
    expect(issues).toEqual([expect.objectContaining({ severity: 'warning', message: 'Act budgets add up to 87 minutes but target_minutes is 45.' })]);
  });
  it('no boss, no opening, undescribed location, too many milestones', () => {
    expect(broken('cast.md', 'role: boss', 'role: enemy')[0]).toMatchObject({ severity: 'warning', message: 'No cast entry has role "boss".' });
    expect(broken('campaign.md', '## Opening', '## Start')[0]).toMatchObject({ severity: 'warning' });
    expect(broken('world.md', '### bell-tower', '### tower')[0]).toMatchObject({ severity: 'warning', field: 'locations.6' });
    expect(broken('campaign.md', 'milestones: 5', 'milestones: 9')[0]).toMatchObject({ severity: 'warning', field: 'goal.milestones' });
  });
});

describe('formatIssue', () => {
  it('prints file, line, field, message and fix', () => {
    expect(formatIssue({ severity: 'error', file: 'cast.md', line: 12, field: 'cast.0.hp', message: 'Bad.', fix: 'Do this.' })).toBe(
      'ERROR cast.md:12 [cast.0.hp] Bad.\n    fix: Do this.',
    );
    expect(formatIssue({ severity: 'warning', file: 'world.md', message: 'Hmm.' })).toBe('WARNING world.md Hmm.');
  });
});

describe('core content', () => {
  it('parses the bundled core files', () => {
    const core = loadTestCore();
    expect(core.archetypes.map((a) => a.id)).toEqual(['bruiser', 'infiltrator', 'sharpshooter', 'mystic', 'scholar', 'face', 'medic', 'tinkerer']);
    expect(core.archetypes[0]).toMatchObject({ hpBonus: 6, weaponDie: 10, attackStat: 'STR' });
    expect(core.archetypes[0]!.summary).toMatch(/stands in front/);
    expect(core.questions.find((q) => q.id === 'name')).toMatchObject({ required: true, surprise: true, type: 'text' });
    expect(core.rules).toMatch(/Heroic Points/);
    expect(core.dmStyle).toMatch(/«Name: line»/);
  });
  it('every archetype array is balanced and within bounds', () => {
    for (const a of loadTestCore().archetypes) {
      const values = Object.values(a.stats);
      expect(values.reduce((x, y) => x + y, 0)).toBe(5);
      expect(Math.max(...values)).toBe(3);
      expect(a.proficiencies).toHaveLength(2);
    }
  });
  it('reports broken core files', () => {
    const files = readCoreFiles();
    expect(parseCore({ ...files, 'rules.md': undefined }).issues[0]).toMatchObject({ file: 'core/rules.md', message: 'File is missing.' });
    expect(parseCore({ ...files, 'archetypes.md': 'no front matter' }).core).toBeNull();
    const badStat = parseCore({ ...files, 'archetypes.md': files['archetypes.md'].replace('STR: 3, DEX: 0, CON: 2', 'STR: 7, DEX: 0, CON: 2') });
    expect(badStat.issues[0]).toMatchObject({ file: 'core/archetypes.md', field: 'archetypes.0.stats.STR' });
    const dup = parseCore({ ...files, 'archetypes.md': files['archetypes.md'].replace('- id: infiltrator', '- id: bruiser') });
    expect(dup.issues[0]!.message).toMatch(/exactly once/);
    const badQ = parseCore({ ...files, 'character-creation.md': files['character-creation.md'].replace('type: color', 'type: rainbow') });
    expect(badQ.issues[0]).toMatchObject({ file: 'core/character-creation.md' });
    const yamlErr = parseCore({ ...files, 'character-creation.md': '---\nquestions: [\n---\n' });
    expect(yamlErr.core).toBeNull();
  });
});

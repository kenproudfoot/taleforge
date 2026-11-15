import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCampaignPack } from '@/content/pack';
import { readPackFiles } from '@/content/testing';
import { MOODS } from '@/engine/types';
import { loopSchedule } from './music';
import { genreFamily, isMood, resolveMusic } from './tracks';
import type { Catalog } from './tracks';

const AUDIO = join(process.cwd(), 'public/content/audio');
const catalog = JSON.parse(readFileSync(join(AUDIO, 'tracks.json'), 'utf8')) as Catalog;

describe('bundled audio catalogue', () => {
  it('every catalogue file exists and every audio file is in the catalogue', () => {
    const listed = new Set([...catalog.tracks.map((t) => t.file), ...Object.values(catalog.sfx).flat()]);
    for (const file of listed) expect(existsSync(join(AUDIO, file)), file).toBe(true);
    const onDisk = ['music', 'sfx'].flatMap((d) => readdirSync(join(AUDIO, d)).map((f) => `${d}/${f}`));
    expect(onDisk.sort()).toEqual([...listed].sort());
  });
  it('has no unlicensed files: LICENSES.md records the provenance of every file', () => {
    const licenses = readFileSync(join(AUDIO, 'LICENSES.md'), 'utf8');
    const onDisk = ['music', 'sfx'].flatMap((d) => readdirSync(join(AUDIO, d)).map((f) => `${d}/${f}`));
    for (const file of onDisk) expect(licenses, file).toContain(file);
  });
  it('every default family covers every mood with a real track', () => {
    const ids = new Set(catalog.tracks.map((t) => t.id));
    for (const [family, map] of Object.entries(catalog.defaults)) {
      for (const mood of MOODS) expect(ids.has(map[mood] ?? ''), `${family}.${mood}`).toBe(true);
    }
    for (const t of catalog.tracks) {
      expect(t.gain).toBeGreaterThan(0);
      expect(t.gain).toBeLessThanOrEqual(1);
      expect(t.moods.every(isMood)).toBe(true);
    }
  });
});

describe('music resolution', () => {
  const ctx = { catalog, genre: 'medieval-fantasy', audioMap: {}, uploads: {}, campaignId: 'c' };
  it('prefers uploads, then the campaign map, then genre defaults, then generic defaults', () => {
    expect(resolveMusic('combat', { ...ctx, uploads: { combat: 'my-battle.mp3' } })).toEqual({ kind: 'upload', campaignId: 'c', mood: 'combat', title: 'my-battle.mp3' });
    expect(resolveMusic('combat', { ...ctx, audioMap: { combat: 'assets/music/war_drums.ogg' } })).toEqual({ kind: 'asset', path: 'assets/music/war_drums.ogg', title: 'war drums', gain: 1 });
    expect(resolveMusic('combat', { ...ctx, audioMap: { combat: 'bundled:noir-chase' } })).toMatchObject({ kind: 'bundled', track: { id: 'noir-chase' } });
    expect(resolveMusic('combat', ctx)).toMatchObject({ track: { id: 'fantasy-combat' } });
    expect(resolveMusic('combat', { ...ctx, genre: 'noir-mystery' })).toMatchObject({ track: { id: 'noir-chase' } });
    expect(resolveMusic('combat', { ...ctx, genre: 'space-exploration' })).toMatchObject({ track: { id: 'scifi-combat' } });
    expect(resolveMusic('tension', { ...ctx, genre: 'western' })).toMatchObject({ track: { id: 'owner-modal-pulse' } });
    expect(resolveMusic('combat', { ...ctx, audioMap: { combat: 'bundled:gone' } })).toMatchObject({ track: { id: 'fantasy-combat' } });
    expect(resolveMusic('calm', { ...ctx, catalog: { ...catalog, defaults: { fantasy: {}, noir: {}, space: {}, generic: {} } } })).toMatchObject({ track: { moods: expect.arrayContaining(['calm']) } });
    expect(resolveMusic('calm', { ...ctx, catalog: { ...catalog, tracks: [], defaults: { fantasy: {}, noir: {}, space: {}, generic: {} } } })).toBeNull();
  });
  it('maps genres to families', () => {
    expect([genreFamily('noir-mystery'), genreFamily('Space Opera'), genreFamily('Sword & Sorcery'), genreFamily('western')]).toEqual(['noir', 'space', 'fantasy', 'generic']);
  });
  it('every bundled campaign maps every mood to a known track', () => {
    const pack = parseCampaignPack(readPackFiles()).pack!;
    const ids = new Set(catalog.tracks.map((t) => t.id));
    for (const mood of MOODS) expect(ids.has((pack.manifest.audio[mood] ?? '').replace('bundled:', '')), mood).toBe(true);
  });
});

describe('loop schedule', () => {
  it('restarts each copy one crossfade before the previous ends, without gaps', () => {
    expect(loopSchedule(40, 1, 3)).toEqual([
      { start: 0, handover: 39 },
      { start: 39, handover: 78 },
      { start: 78, handover: 117 },
    ]);
    // A crossfade is never more than a third of the track.
    expect(loopSchedule(3, 4, 2)[1]!.start).toBe(2);
  });
});

import { describe, expect, it } from 'vitest';
import { resetDbForTests } from '@/storage/db';
import { loadSession, saveSession } from '@/storage/sessions';
import { recordShown, sceneGallery } from './session';
import type { Session } from './session';
import { testSession } from './testing';

const show = (s: Session, key: string, at: string | null = s.state.locationId): Session => recordShown({ ...s, state: { ...s.state, locationId: at }, images: { ...s.images, current: key } });

describe('scene picture history', () => {
  it('records each picture once, the first time it is current, with where the party was', () => {
    let s = testSession();
    s = show(s, 'img-a', 'harbour');
    s = show(s, 'img-b', 'causeway');
    s = show(s, 'img-a', 'harbour');
    expect(s.images.shown).toEqual([
      { key: 'img-a', at: 'harbour' },
      { key: 'img-b', at: 'causeway' },
    ]);
    expect(recordShown({ ...s, images: { ...s.images, current: null } })).toEqual({ ...s, images: { ...s.images, current: null } });
  });

  it('pages oldest first, with chat captions for story moments', () => {
    let s = testSession();
    s = show(s, 'img-a', 'harbour');
    s = show(s, 'img-m', 'harbour');
    s = { ...s, chat: [...s.chat, { id: 'i1', kind: 'image', imageKey: 'img-m', caption: 'the spires rise' }] };
    expect(sceneGallery(s)).toEqual([
      { key: 'img-a', at: 'harbour' },
      { key: 'img-m', at: 'harbour', caption: 'the spires rise' },
    ]);
  });

  it('includes pictures from before the history was kept: party, chat, and places visited (not painted ahead)', () => {
    let s = testSession();
    s = {
      ...s,
      chat: [{ id: 'i1', kind: 'image', imageKey: 'img-moment', caption: 'The spires' }],
      images: { ...s.images, party: 'img-party', scenes: { harbour: 'img-harbour', causeway: 'img-causeway', cathedral: 'img-ahead' }, visits: { 'scene:harbour': 1, 'scene:causeway': 1, 'npc:maren': 1 }, current: 'img-causeway' },
    };
    expect(sceneGallery(s).map((g) => g.key)).toEqual(['img-party', 'img-moment', 'img-harbour', 'img-causeway']);
    expect(sceneGallery(s).find((g) => g.key === 'img-harbour')?.at).toBe('harbour');
    // Once a history exists, those older pictures come first, then the history in order, with no repeats.
    s = show(s, 'img-new', 'cathedral');
    expect(sceneGallery(s).map((g) => g.key)).toEqual(['img-party', 'img-moment', 'img-harbour', 'img-causeway', 'img-new']);
    expect(sceneGallery({ ...testSession(), images: { ...testSession().images, current: null } })).toEqual([]);
  });

  it('survives saving and loading, along with the visit counts', async () => {
    await resetDbForTests();
    let s = show(testSession(), 'img-a', 'harbour');
    s = { ...s, images: { ...s.images, visits: { 'scene:harbour': 2 } } };
    await saveSession(s);
    const back = await loadSession(s.id);
    expect(back?.images.shown).toEqual([{ key: 'img-a', at: 'harbour' }]);
    expect(back?.images.visits).toEqual({ 'scene:harbour': 2 });
  });
});

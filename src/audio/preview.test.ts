import { describe, expect, it, vi } from 'vitest';
import { previewSource, previewVolume } from './preview';
import type { TrackInfo } from './tracks';

const track: TrackInfo = { id: 'calm-hearth', file: 'music/calm-hearth.m4a', title: 'Hearth', moods: ['calm'], genre: 'generic', gain: 0.8, source: 'generated' };
const deps = (over: Partial<Parameters<typeof previewSource>[1]> = {}) => ({
  trackUrl: (f: string) => `/content/audio/${f}`,
  assetUrl: (p: string) => (p === 'assets/music/theme.ogg' ? `/pack/${p}` : null),
  upload: vi.fn(async () => null),
  ...over,
});

describe('music preview', () => {
  it('plays bundled tracks from the audio folder with their loudness correction', async () => {
    expect(await previewSource({ kind: 'bundled', track }, deps())).toEqual({ url: '/content/audio/music/calm-hearth.m4a', gain: 0.8, revoke: false });
  });

  it('plays pack assets, or nothing when the pack lacks the file', async () => {
    expect(await previewSource({ kind: 'asset', path: 'assets/music/theme.ogg', title: 'theme', gain: 1 }, deps())).toEqual({ url: '/pack/assets/music/theme.ogg', gain: 1, revoke: false });
    expect(await previewSource({ kind: 'asset', path: 'assets/music/gone.ogg', title: 'gone', gain: 1 }, deps())).toBeNull();
  });

  it('plays the player upload from an object URL to be revoked afterwards', async () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    const upload = vi.fn(async () => new Blob(['a']));
    expect(await previewSource({ kind: 'upload', campaignId: 'c', mood: 'combat', title: 'mine.mp3' }, deps({ upload }))).toEqual({ url: 'blob:x', gain: 1, revoke: true });
    expect(upload).toHaveBeenCalledWith('c', 'combat');
    expect(await previewSource({ kind: 'upload', campaignId: 'c', mood: 'combat', title: 'mine.mp3' }, deps())).toBeNull();
    create.mockRestore();
  });

  it('keeps the preview audible even when music is turned right down', () => {
    expect(previewVolume(0.6, 1)).toBeCloseTo(0.6);
    expect(previewVolume(0, 1)).toBe(0.25);
    expect(previewVolume(1, 1.4)).toBe(1);
  });
});

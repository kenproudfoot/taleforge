import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDbForTests } from '@/storage/db';
import { getCachedImage, putCachedImage } from './cache';
import { depthKey, depthMapFor, resetDepthForTests, setDepthOverride } from './depth';
import { DEPTH_MAX_SIDE, depthSize, depthToRgba, softenDepth } from './depthMap';

describe('depth map helpers', () => {
  it('keeps the aspect and caps the longest side', () => {
    expect(depthSize(1536, 1024)).toEqual({ width: DEPTH_MAX_SIDE, height: Math.round((DEPTH_MAX_SIDE * 1024) / 1536) });
    expect(depthSize(300, 200)).toEqual({ width: 300, height: 200 });
  });

  it('dilates near things past their edges, then blurs the steps', () => {
    // A single bright (near) pixel in a dark row grows into a soft hill, brightest at the centre.
    const row = [0, 0, 0, 0, 255, 0, 0, 0, 0];
    const out = softenDepth(row, 9, 1, { dilate: 1, blur: 1 });
    expect(out[4]).toBe(255);
    expect(out[3]).toBeGreaterThan(0);
    expect(out[0]).toBe(0);
    expect([...out]).toEqual([...out].reverse());
  });

  it('turns grey bytes into opaque RGBA', () => {
    expect([...depthToRgba([7, 200])]).toEqual([7, 7, 7, 255, 200, 200, 200, 255]);
  });
});

describe('depthMapFor', () => {
  beforeEach(async () => {
    resetDepthForTests();
    await resetDbForTests();
  });

  it('estimates once, stores the map next to the picture, and reuses it', async () => {
    await putCachedImage('img-a', new Blob(['picture']), {});
    const estimate = vi.fn(async () => new Blob(['depth']));
    setDepthOverride(estimate);
    const first = await depthMapFor('img-a');
    expect(await first?.text()).toBe('depth');
    expect(await getCachedImage(depthKey('img-a'))).not.toBeNull();
    await depthMapFor('img-a');
    // A fresh page: the stored map comes back without running the model again.
    resetDepthForTests();
    setDepthOverride(estimate);
    expect(await depthMapFor('img-a')).not.toBeNull();
    expect(estimate).toHaveBeenCalledTimes(1);
  });

  it('runs one estimate at a time', async () => {
    await putCachedImage('img-a', new Blob(['a']), {});
    await putCachedImage('img-b', new Blob(['bb']), {});
    let running = 0;
    let most = 0;
    let n = 0;
    setDepthOverride(async () => {
      most = Math.max(most, ++running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return new Blob([`depth ${++n}`]);
    });
    const [a, b] = await Promise.all([depthMapFor('img-a'), depthMapFor('img-b')]);
    expect(await a?.text()).toBe('depth 1');
    expect(await b?.text()).toBe('depth 2');
    expect(most).toBe(1);
  });

  it('gives null when the picture is missing or the estimate fails', async () => {
    setDepthOverride(async () => {
      throw new Error('no model');
    });
    expect(await depthMapFor('img-missing')).toBeNull();
    await putCachedImage('img-c', new Blob(['c']), {});
    expect(await depthMapFor('img-c')).toBeNull();
  });

  it('gives null without a Worker (and no override), as in old browsers', async () => {
    await putCachedImage('img-d', new Blob(['d']), {});
    expect(typeof Worker).toBe('undefined');
    expect(await depthMapFor('img-d')).toBeNull();
  });
});

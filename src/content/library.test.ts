import { strToU8, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDbForTests } from '@/storage/db';
import { MAX_ASSET_BYTES, checkRawPack, mimeFor, rawPackFromEntries, readFiles, readZip } from './importer';
import { deleteImportedCampaign, fetchBundledTrackIds, listCampaigns, loadCampaign, loadCore, saveImportedCampaign } from './library';
import { PACK_FILES } from './pack';
import { summarizePack } from './summary';
import { loadTestPack, readCoreFiles, readPackFiles } from './testing';

const GOOD = readPackFiles();

function zipOf(entries: Record<string, string | Uint8Array>): Blob {
  const data = Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, typeof v === 'string' ? strToU8(v) : v]));
  return new Blob([zipSync(data).slice().buffer]);
}

/** A fetch stub that serves the bundled content folder from memory. */
function stubFetch(extra: Record<string, string> = {}) {
  const core = readCoreFiles();
  const routes: Record<string, string> = {
    'content/campaigns/index.json': JSON.stringify({ campaigns: [summarizePack(loadTestPack())] }),
    ...Object.fromEntries(Object.entries(core).map(([f, t]) => [`content/core/${f}`, t])),
    ...Object.fromEntries(PACK_FILES.map((f) => [`content/campaigns/the-sunken-crown/${f}`, GOOD[f]])),
    ...extra,
  };
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const hit = Object.entries(routes).find(([path]) => url.endsWith(path));
    return hit ? new Response(hit[1], { status: 200 }) : new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(async () => {
  await resetDbForTests();
  if (!URL.createObjectURL) URL.createObjectURL = () => '';
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:test/${Math.random().toString(36).slice(2)}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('importer', () => {
  it('reads a pack from the root of a zip, with assets', async () => {
    const raw = await readZip(zipOf({ ...GOOD, 'assets/key-art.png': new Uint8Array([1, 2, 3]), 'notes.txt': 'ignored' }));
    expect(Object.keys(raw.files).sort()).toEqual([...PACK_FILES].sort());
    expect(Object.keys(raw.assets)).toEqual(['assets/key-art.png']);
    expect(raw.assets['assets/key-art.png']!.type).toBe('image/png');
    expect(checkRawPack(raw).pack?.id).toBe('the-sunken-crown');
  });

  it('reads a pack nested in a folder and skips macOS junk', async () => {
    const nested = Object.fromEntries(Object.entries(GOOD).map(([k, v]) => [`my-pack/${k}`, v]));
    const raw = await readZip(zipOf({ ...nested, '__MACOSX/my-pack/._campaign.md': 'junk', 'my-pack/.DS_Store': 'junk', 'my-pack/assets/music/a.ogg': new Uint8Array([9]) }));
    expect(Object.keys(raw.files)).toHaveLength(5);
    expect(Object.keys(raw.assets)).toEqual(['assets/music/a.ogg']);
  });

  it('rejects files that are not zips', async () => {
    await expect(readZip(new Blob(['hello']))).rejects.toThrow(/not a readable .zip/);
  });

  it('reads a dropped folder', async () => {
    const files = Object.entries(GOOD).map(([name, text]) => ({ path: `the-sunken-crown/${name}`, file: new Blob([text]) }));
    files.push({ path: 'the-sunken-crown/assets/key-art.jpg', file: new Blob([new Uint8Array([1])]) });
    const raw = await readFiles(files);
    expect(Object.keys(raw.files)).toHaveLength(5);
    expect(Object.keys(raw.assets)).toEqual(['assets/key-art.jpg']);
  });

  it('reports validation issues and oversize assets', () => {
    const missing = checkRawPack(rawPackFromEntries([{ path: 'campaign.md', text: GOOD['campaign.md'] }]));
    expect(missing.pack).toBeNull();
    expect(missing.issues.filter((i) => i.message === 'File is missing.')).toHaveLength(4);
    const huge = { size: MAX_ASSET_BYTES + 1 } as Blob;
    const big = checkRawPack({ files: GOOD, assets: { 'assets/big.ogg': huge } });
    expect(big.pack).toBeNull();
    expect(big.issues[0]!.message).toMatch(/limit is 80 MB/);
    const unknownTrack = checkRawPack({ files: { ...GOOD, 'campaign.md': GOOD['campaign.md'].replace(/^audio:\n(?: {2}.*\n)+/m, 'audio: { title: "bundled:nope" }\n') }, assets: {} }, ['fantasy-title']);
    expect(unknownTrack.issues[0]!.message).toBe('Unknown bundled track "nope".');
  });

  it('maps file extensions to MIME types', () => {
    expect(mimeFor('assets/a.OGG')).toBe('audio/ogg');
    expect(mimeFor('assets/a.jpeg')).toBe('image/jpeg');
    expect(mimeFor('assets/a.bin')).toBe('application/octet-stream');
  });
});

describe('library', () => {
  it('loads and caches the core content', async () => {
    const fetchFn = stubFetch();
    const core = await loadCore();
    expect(core.archetypes).toHaveLength(8);
    await loadCore();
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it('lists and loads bundled campaigns', async () => {
    stubFetch();
    const list = await listCampaigns();
    expect(list).toEqual([expect.objectContaining({ id: 'the-sunken-crown', source: 'bundled', keyArtUrl: null })]);
    const loaded = await loadCampaign('the-sunken-crown');
    expect(loaded.source).toBe('bundled');
    expect(loaded.pack.cast).toHaveLength(8);
    expect(loaded.assetUrl('assets/key-art.jpg')).toMatch(/content\/campaigns\/the-sunken-crown\/assets\/key-art\.jpg$/);
    expect(loaded.assetUrl('../secrets.md')).toBeNull();
    await expect(loadCampaign('missing')).rejects.toThrow(/Could not load/);
  });

  it('stores, lists, loads and deletes imported campaigns', async () => {
    stubFetch();
    const files = {
      ...GOOD,
      'campaign.md': GOOD['campaign.md'].replace('id: the-sunken-crown', 'id: my-campaign').replace('goal:', 'key_art: assets/key-art.png\ngoal:'),
    };
    const raw = { files, assets: { 'assets/key-art.png': new Blob([new Uint8Array([1])], { type: 'image/png' }) } };
    const saved = await saveImportedCampaign(raw);
    expect(saved.summary).toMatchObject({ id: 'my-campaign', keyArt: 'assets/key-art.png' });
    const list = await listCampaigns();
    expect(list.map((c) => [c.id, c.source])).toEqual([
      ['the-sunken-crown', 'bundled'],
      ['my-campaign', 'imported'],
    ]);
    expect(list[1]!.keyArtUrl).toMatch(/^blob:/);
    const loaded = await loadCampaign('my-campaign');
    expect(loaded.source).toBe('imported');
    expect(loaded.assetUrl('assets/key-art.png')).toBe(list[1]!.keyArtUrl);
    expect(loaded.assetUrl('assets/nope.png')).toBeNull();
    await deleteImportedCampaign('my-campaign');
    expect(await listCampaigns()).toHaveLength(1);
  });

  it('an import with a bundled id replaces the bundled entry', async () => {
    stubFetch();
    await saveImportedCampaign({ files: GOOD, assets: {} });
    const list = await listCampaigns();
    expect(list).toEqual([expect.objectContaining({ id: 'the-sunken-crown', source: 'imported' })]);
  });

  it('refuses to store an invalid pack', async () => {
    await expect(saveImportedCampaign({ files: { 'campaign.md': GOOD['campaign.md'] }, assets: {} })).rejects.toThrow(/has errors/);
  });

  it('reads the bundled track list when present', async () => {
    stubFetch({ 'content/audio/tracks.json': JSON.stringify({ tracks: [{ id: 'fantasy-title' }] }) });
    expect(await fetchBundledTrackIds()).toEqual(['fantasy-title']);
    stubFetch();
    expect(await fetchBundledTrackIds()).toBeUndefined();
  });
});

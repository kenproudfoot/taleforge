import { getDb } from '@/storage/db';
import type { StoredCampaign } from '@/storage/db';
import { CORE_FILES, parseCore } from './core';
import type { CoreContent } from './core';
import { checkRawPack } from './importer';
import type { RawPack } from './importer';
import { formatIssue } from './issues';
import { PACK_FILES, parseCampaignPack } from './pack';
import type { CampaignPack, PackFiles } from './pack';
import { summarizePack } from './summary';
import type { CampaignSummary } from './summary';

export type CampaignSource = 'bundled' | 'imported';

export interface LibraryEntry extends CampaignSummary {
  source: CampaignSource;
  /** Resolved URL of the key art, or null to use the generated cover. */
  keyArtUrl: string | null;
}

export interface LoadedCampaign {
  pack: CampaignPack;
  source: CampaignSource;
  /** Resolves a pack-relative asset path ("assets/…") to a URL the browser can load, or null. */
  assetUrl(path: string): string | null;
}

const contentBase = () => `${import.meta.env.BASE_URL}content/`;

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  return res.text();
}

let corePromise: Promise<CoreContent> | null = null;

/** Loads and validates the core content files (rules, archetypes, character creation, DM style). Cached. */
export function loadCore(): Promise<CoreContent> {
  corePromise ??= (async () => {
    const texts = await Promise.all(CORE_FILES.map((f) => fetchText(`${contentBase()}core/${f}`)));
    const files = Object.fromEntries(CORE_FILES.map((f, i) => [f, texts[i]!]));
    const { core, issues } = parseCore(files);
    if (!core) throw new Error(`Core content is invalid:\n${issues.map(formatIssue).join('\n')}`);
    return core;
  })();
  corePromise.catch(() => (corePromise = null));
  return corePromise;
}

export async function fetchBundledTrackIds(): Promise<string[] | undefined> {
  try {
    const res = await fetch(`${contentBase()}audio/tracks.json`);
    if (!res.ok) return undefined;
    const data = (await res.json()) as { tracks?: Array<{ id: string }> };
    return (data.tracks ?? []).map((t) => t.id);
  } catch {
    return undefined;
  }
}

const objectUrls = new Map<string, string>();
function blobUrl(key: string, blob: Blob): string {
  let url = objectUrls.get(key);
  if (!url) {
    url = URL.createObjectURL(blob);
    objectUrls.set(key, url);
  }
  return url;
}

function releaseUrls(campaignId: string): void {
  for (const [key, url] of objectUrls) {
    if (key.startsWith(`${campaignId}/`)) {
      URL.revokeObjectURL(url);
      objectUrls.delete(key);
    }
  }
}

async function bundledSummaries(): Promise<CampaignSummary[]> {
  const res = await fetch(`${contentBase()}campaigns/index.json`);
  if (!res.ok) throw new Error(`Could not load the campaign list (${res.status})`);
  return ((await res.json()) as { campaigns: CampaignSummary[] }).campaigns;
}

/** Every campaign the user can play: bundled first, then imported (an import with the same id wins). */
export async function listCampaigns(): Promise<LibraryEntry[]> {
  const [bundled, imported] = await Promise.all([bundledSummaries(), (await getDb()).getAll('campaigns')]);
  const importedIds = new Set(imported.map((c) => c.id));
  return [
    ...bundled
      .filter((s) => !importedIds.has(s.id))
      .map((s) => ({ ...s, source: 'bundled' as const, keyArtUrl: s.keyArt ? `${contentBase()}campaigns/${s.id}/${s.keyArt}` : null })),
    ...imported
      .sort((a, b) => a.importedAt - b.importedAt)
      .map((c) => {
        const art = c.summary.keyArt ? c.assets[c.summary.keyArt] : undefined;
        return { ...c.summary, source: 'imported' as const, keyArtUrl: art ? blobUrl(`${c.id}/${c.summary.keyArt}`, art) : null };
      }),
  ];
}

export async function loadCampaign(id: string): Promise<LoadedCampaign> {
  const stored = await (await getDb()).get('campaigns', id);
  if (stored) {
    const { pack, issues } = parseCampaignPack(stored.files);
    if (!pack) throw new Error(`Imported campaign "${id}" is no longer valid:\n${issues.map(formatIssue).join('\n')}`);
    return {
      pack,
      source: 'imported',
      assetUrl: (path) => (stored.assets[path] ? blobUrl(`${id}/${path}`, stored.assets[path]) : null),
    };
  }
  const base = `${contentBase()}campaigns/${id}/`;
  const texts = await Promise.all(PACK_FILES.map((f) => fetchText(base + f)));
  const files = Object.fromEntries(PACK_FILES.map((f, i) => [f, texts[i]!])) as PackFiles;
  const { pack, issues } = parseCampaignPack(files);
  if (!pack) throw new Error(`Campaign "${id}" is invalid:\n${issues.map(formatIssue).join('\n')}`);
  return { pack, source: 'bundled', assetUrl: (path) => (path.startsWith('assets/') ? base + path : null) };
}

/** Validates and stores an imported pack. Throws if it has errors (callers show `checkRawPack` issues first). */
export async function saveImportedCampaign(raw: RawPack, bundledTracks?: string[]): Promise<StoredCampaign> {
  const { pack, issues } = checkRawPack(raw, bundledTracks);
  if (!pack) throw new Error(`The campaign has errors:\n${issues.filter((i) => i.severity === 'error').map(formatIssue).join('\n')}`);
  const record: StoredCampaign = {
    id: pack.id,
    files: raw.files as PackFiles,
    assets: raw.assets,
    summary: summarizePack(pack),
    importedAt: Date.now(),
  };
  releaseUrls(pack.id);
  await (await getDb()).put('campaigns', record);
  return record;
}

export async function deleteImportedCampaign(id: string): Promise<void> {
  releaseUrls(id);
  await (await getDb()).delete('campaigns', id);
}

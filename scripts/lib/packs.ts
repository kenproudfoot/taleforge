import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { CORE_FILES, parseCore } from '../../src/content/core';
import type { CoreResult } from '../../src/content/core';
import { PACK_FILES, parseCampaignPack } from '../../src/content/pack';
import type { PackFiles, PackResult } from '../../src/content/pack';

export const CONTENT_ROOT = join(process.cwd(), 'public/content');
export const CAMPAIGNS_ROOT = join(CONTENT_ROOT, 'campaigns');

function walk(dir: string, base: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (name.startsWith('.')) return [];
    return statSync(full).isDirectory() ? walk(full, base) : [relative(base, full).split(sep).join('/')];
  });
}

export function listCampaignFolders(root = CAMPAIGNS_ROOT): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => !name.startsWith('.') && statSync(join(root, name)).isDirectory())
    .sort();
}

export function bundledTrackIds(): string[] | undefined {
  const file = join(CONTENT_ROOT, 'audio/tracks.json');
  if (!existsSync(file)) return undefined;
  const data = JSON.parse(readFileSync(file, 'utf8')) as { tracks?: Array<{ id: string }> };
  return (data.tracks ?? []).map((t) => t.id);
}

/** Reads and validates one campaign folder from disk. */
export function readPackFolder(dir: string, folderName: string): PackResult {
  const files: Partial<PackFiles> = {};
  for (const f of PACK_FILES) {
    const path = join(dir, f);
    if (existsSync(path)) files[f] = readFileSync(path, 'utf8');
  }
  const assets = walk(join(dir, 'assets'), dir);
  return parseCampaignPack(files, { assets, bundledTracks: bundledTrackIds(), folder: folderName });
}

export function readCore(dir = join(CONTENT_ROOT, 'core')): CoreResult {
  const files: Partial<Record<(typeof CORE_FILES)[number], string>> = {};
  for (const f of CORE_FILES) {
    const path = join(dir, f);
    if (existsSync(path)) files[f] = readFileSync(path, 'utf8');
  }
  return parseCore(files);
}

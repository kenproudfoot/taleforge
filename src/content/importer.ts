import { unzipSync, strFromU8 } from 'fflate';
import { hasErrors } from './issues';
import type { Issue } from './issues';
import { PACK_FILES, parseCampaignPack } from './pack';
import type { CampaignPack, PackFile, PackFiles } from './pack';

/** A campaign pack as read from a zip or a dropped folder, before validation. */
export interface RawPack {
  files: Partial<PackFiles>;
  assets: Record<string, Blob>;
}

export const MAX_ASSET_BYTES = 80 * 1024 * 1024;

const MIME: Record<string, string> = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
};

export function mimeFor(path: string): string {
  return MIME[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
}

function isPackFile(name: string): name is PackFile {
  return (PACK_FILES as readonly string[]).includes(name);
}

/**
 * Builds a RawPack from a flat list of (path, content) entries. The pack may sit at the root or inside
 * one enclosing folder: everything is taken relative to the folder that holds campaign.md.
 */
export function rawPackFromEntries(entries: Array<{ path: string; text?: string; blob?: Blob }>): RawPack {
  const clean = entries
    .map((e) => ({ ...e, path: e.path.replace(/\\/g, '/').replace(/^\.?\//, '') }))
    .filter((e) => !e.path.split('/').some((part) => part.startsWith('.') || part === '__MACOSX'));
  const manifest = clean.filter((e) => e.path.split('/').pop() === 'campaign.md').sort((a, b) => a.path.length - b.path.length)[0];
  const root = manifest ? manifest.path.slice(0, -'campaign.md'.length) : '';
  const raw: RawPack = { files: {}, assets: {} };
  for (const e of clean) {
    if (!e.path.startsWith(root)) continue;
    const rel = e.path.slice(root.length);
    if (isPackFile(rel) && e.text !== undefined) raw.files[rel] = e.text;
    else if (rel.startsWith('assets/') && e.blob && e.blob.size > 0) raw.assets[rel] = e.blob;
  }
  return raw;
}

/** Reads a campaign pack from a .zip file. */
export async function readZip(file: Blob): Promise<RawPack> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(bytes);
  } catch {
    throw new Error('That file is not a readable .zip archive.');
  }
  return rawPackFromEntries(
    Object.entries(unzipped)
      .filter(([path]) => !path.endsWith('/'))
      .map(([path, data]) => {
        const name = path.split('/').pop() ?? '';
        return isPackFile(name)
          ? { path, text: strFromU8(data) }
          : { path, blob: new Blob([data.slice().buffer], { type: mimeFor(path) }) };
      }),
  );
}

/** Reads a campaign pack from files that carry a relative path (a folder picker or a dropped folder). */
export async function readFiles(files: Array<{ path: string; file: Blob }>): Promise<RawPack> {
  const entries = await Promise.all(
    files.map(async ({ path, file }) => {
      const name = path.split('/').pop() ?? '';
      return isPackFile(name) ? { path, text: await file.text() } : { path, blob: file };
    }),
  );
  return rawPackFromEntries(entries);
}

export interface ImportCheck {
  pack: CampaignPack | null;
  issues: Issue[];
}

/** Validates a raw pack the same way the command-line validator does. */
export function checkRawPack(raw: RawPack, bundledTracks?: string[]): ImportCheck {
  const result = parseCampaignPack(raw.files, { assets: Object.keys(raw.assets), bundledTracks });
  const size = Object.values(raw.assets).reduce((n, b) => n + b.size, 0);
  if (size > MAX_ASSET_BYTES) {
    result.issues.push({
      severity: 'error',
      file: 'assets/',
      message: `The assets folder is ${Math.round(size / 1024 / 1024)} MB; the limit is ${MAX_ASSET_BYTES / 1024 / 1024} MB.`,
      fix: 'Compress the audio (OGG at 96-128 kbps works well) or remove unused files.',
    });
  }
  return { pack: hasErrors(result.issues) ? null : result.pack, issues: result.issues };
}

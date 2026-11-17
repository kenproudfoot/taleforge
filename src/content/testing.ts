// Test helpers: load the real bundled content from disk. Not used by the shipped app.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CORE_FILES, parseCore } from './core';
import type { CoreContent } from './core';
import { PACK_FILES, parseCampaignPack } from './pack';
import type { CampaignPack, PackFiles } from './pack';

const CONTENT = join(process.cwd(), 'public/content');

/**
 * A bundled campaign's text files. They are a text-only pack (no assets folder), so the key art line is
 * dropped: otherwise every fixture would report the missing picture.
 */
export function readPackFiles(id = 'the-sunken-crown'): PackFiles {
  const read = (f: string) => readFileSync(join(CONTENT, 'campaigns', id, f), 'utf8');
  return Object.fromEntries(PACK_FILES.map((f) => [f, f === 'campaign.md' ? read(f).replace(/^key_art:.*\n/m, '') : read(f)])) as PackFiles;
}

export function readCoreFiles(): Record<(typeof CORE_FILES)[number], string> {
  return Object.fromEntries(CORE_FILES.map((f) => [f, readFileSync(join(CONTENT, 'core', f), 'utf8')])) as Record<
    (typeof CORE_FILES)[number],
    string
  >;
}

export function loadTestPack(id = 'the-sunken-crown'): CampaignPack {
  const { pack, issues } = parseCampaignPack(readPackFiles(id));
  if (!pack) throw new Error(`pack ${id} is invalid: ${issues.map((i) => i.message).join('; ')}`);
  return pack;
}

export function loadTestCore(): CoreContent {
  const { core, issues } = parseCore(readCoreFiles());
  if (!core) throw new Error(`core content is invalid: ${issues.map((i) => i.message).join('; ')}`);
  return core;
}

export interface PathFile {
  path: string;
  file: File;
}

interface FsEntry {
  isFile: boolean;
  isDirectory: boolean;
  fullPath: string;
  file?: (ok: (f: File) => void, err: (e: unknown) => void) => void;
  createReader?: () => { readEntries: (ok: (entries: FsEntry[]) => void, err: (e: unknown) => void) => void };
}

async function walkEntry(entry: FsEntry, out: PathFile[]): Promise<void> {
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((ok, err) => entry.file!(ok, err));
    out.push({ path: entry.fullPath.replace(/^\//, ''), file });
  } else if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    // readEntries returns results in batches; keep reading until it returns none.
    for (;;) {
      const batch = await new Promise<FsEntry[]>((ok, err) => reader.readEntries(ok, err));
      if (batch.length === 0) break;
      for (const child of batch) await walkEntry(child, out);
    }
  }
}

/** Collects every file from a drop, walking into dropped folders. */
export async function filesFromDrop(dt: DataTransfer): Promise<PathFile[]> {
  const out: PathFile[] = [];
  const entries = Array.from(dt.items ?? [])
    .map((item) => (item.webkitGetAsEntry?.() ?? null) as unknown as FsEntry | null)
    .filter((e) => e !== null);
  if (entries.length > 0) {
    for (const entry of entries) await walkEntry(entry, out);
    return out;
  }
  return Array.from(dt.files).map((file) => ({ path: file.name, file }));
}

/** Files chosen with a folder picker (`<input webkitdirectory>`). */
export function filesFromInput(list: FileList): PathFile[] {
  return Array.from(list).map((file) => ({ path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name, file }));
}

import { mkdir, rename, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join, resolve } from 'node:path';

/** Where playtest logs are written: playtests/ in the project, or PLAYTEST_DIR. Gitignored. */
export function playtestDir(): string {
  return resolve(process.env.PLAYTEST_DIR ?? 'playtests');
}

const MAX_BYTES = 20 * 1024 * 1024;
const VALID_ID = /^[A-Za-z0-9_-]{1,120}$/;

function send(res: ServerResponse, status: number, body?: unknown): void {
  res.statusCode = status;
  if (body === undefined) return void res.end();
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((ok, fail) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BYTES) {
        fail(new Error('too large'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')));
    req.on('error', fail);
  });
}

/**
 * Connect-style middleware for TaleForge's own server (dev and preview): GET /local/playtest reports that
 * logging is available, POST /local/playtest/<id> writes <id>.json. Only same-origin page requests reach it;
 * it listens on 127.0.0.1 only.
 */
export function playtestMiddleware(dir = playtestDir()) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    const url = (req.url ?? '').split('?')[0]!;
    if (url !== '/local/playtest' && !url.startsWith('/local/playtest/')) return next();
    if (req.method === 'GET' && url === '/local/playtest') return send(res, 200, { enabled: true, dir });
    if (req.method !== 'POST') return send(res, 405, { error: 'POST a playtest log' });
    const id = decodeURIComponent(url.slice('/local/playtest/'.length));
    if (!VALID_ID.test(id)) return send(res, 400, { error: 'bad log id' });
    void (async () => {
      try {
        const data = JSON.parse(await readBody(req)) as { format?: string };
        if (data?.format !== 'taleforge-playtest') return send(res, 400, { error: 'not a playtest log' });
        await mkdir(dir, { recursive: true });
        const file = join(dir, `${id}.json`);
        await writeFile(`${file}.tmp`, JSON.stringify(data, null, 2));
        await rename(`${file}.tmp`, file);
        send(res, 204);
      } catch (e) {
        send(res, e instanceof Error && e.message === 'too large' ? 413 : 400, { error: e instanceof Error ? e.message : String(e) });
      }
    })();
  };
}

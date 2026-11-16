// @vitest-environment node
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { playtestMiddleware } from './playtestServer';

const dir = mkdtempSync(join(tmpdir(), 'taleforge-playtest-'));
const handler = playtestMiddleware(dir);
const server = createServer((req, res) =>
  handler(req, res, () => {
    res.statusCode = 404;
    res.end('next');
  }),
);
let base = '';
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('playtest server', () => {
  it('reports that logging is available and writes logs to the folder', async () => {
    expect(await (await fetch(`${base}/local/playtest`)).json()).toEqual({ enabled: true, dir });
    const res = await fetch(`${base}/local/playtest/2026-11-15_the-sunken-crown_session-1`, { method: 'POST', body: JSON.stringify({ format: 'taleforge-playtest', turns: 3 }) });
    expect(res.status).toBe(204);
    expect(readdirSync(dir)).toEqual(['2026-11-15_the-sunken-crown_session-1.json']);
    expect(JSON.parse(readFileSync(join(dir, '2026-11-15_the-sunken-crown_session-1.json'), 'utf8'))).toEqual({ format: 'taleforge-playtest', turns: 3 });
  });
  it('refuses bad ids, other content and other methods, and ignores other paths', async () => {
    expect((await fetch(`${base}/local/playtest/..%2Fescape`, { method: 'POST', body: '{"format":"taleforge-playtest"}' })).status).toBe(400);
    expect((await fetch(`${base}/local/playtest/ok`, { method: 'POST', body: '{"format":"other"}' })).status).toBe(400);
    expect((await fetch(`${base}/local/playtest/ok`, { method: 'POST', body: 'not json' })).status).toBe(400);
    expect((await fetch(`${base}/local/playtest/ok`, { method: 'DELETE' })).status).toBe(405);
    expect(await (await fetch(`${base}/local/other`)).text()).toBe('next');
    expect(readdirSync(dir)).toHaveLength(1);
  });
});

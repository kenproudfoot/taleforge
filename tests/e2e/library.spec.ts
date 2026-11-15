import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';

const FILES = ['campaign.md', 'world.md', 'cast.md', 'rules.md', 'secrets.md'];
const dir = join(process.cwd(), 'public/content/campaigns/the-sunken-crown');

function zip(edit: (name: string, text: string) => string): Buffer {
  const entries = Object.fromEntries(FILES.map((f) => [`my-pack/${f}`, strToU8(edit(f, readFileSync(join(dir, f), 'utf8')))]));
  return Buffer.from(zipSync(entries));
}

test('library shows bundled campaigns with details', async ({ page }) => {
  await page.goto('./#/library');
  const card = page.getByRole('article').filter({ hasText: 'The Sunken Crown' });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Details' }).click();
  await expect(card.getByText('Reach the drowned cathedral of Tolmere')).toBeVisible();
  await expect(card.getByText(/Knight, Rogue, Ranger/)).toBeVisible();
});

test('importing a broken campaign shows precise errors', async ({ page }) => {
  await page.goto('./#/library');
  const broken = zip((name, text) => (name === 'campaign.md' ? text.replace(/^title: .*\n/m, '') : text));
  await page.getByLabel('Campaign zip file').setInputFiles({ name: 'broken.zip', mimeType: 'application/zip', buffer: broken });
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Missing required field "title".');
  await expect(alert).toContainText('campaign.md');
  await expect(alert).toContainText('Fix: Add it, e.g. title: The Sunken Crown');
});

test('importing a valid campaign adds it to the library, and it can be removed', async ({ page }) => {
  await page.goto('./#/library');
  const good = zip((name, text) =>
    name === 'campaign.md' ? text.replace('id: the-sunken-crown', 'id: the-second-crown').replace('title: The Sunken Crown', 'title: The Second Crown') : text,
  );
  await page.getByLabel('Campaign zip file').setInputFiles({ name: 'good.zip', mimeType: 'application/zip', buffer: good });
  await expect(page.getByText('was imported and is ready to play')).toBeVisible();
  const card = page.getByRole('article').filter({ hasText: 'The Second Crown' });
  await expect(card.getByText('Imported')).toBeVisible();
  await page.reload();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Remove' }).click();
  await expect(card).toHaveCount(0);
});

test('players can use their own music for a mood, and the bundled audio is served', async ({ page }) => {
  await page.goto('./#/library');
  const card = page.getByRole('article').filter({ hasText: 'The Sunken Crown' });
  await card.getByRole('button', { name: 'Details' }).click();
  await expect(card.getByText('Steel at the Gate')).toBeVisible();
  await card.getByLabel('Upload music for the combat mood').setInputFiles({ name: 'my-battle.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from([0xff, 0xfb, 0x90, 0x00]) });
  await expect(card.getByText('Your file: my-battle.mp3')).toBeVisible();
  await card.getByRole('button', { name: 'Remove your combat music' }).click();
  await expect(card.getByText('Steel at the Gate')).toBeVisible();
  await card.getByLabel('Upload music for the calm mood').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') });
  await expect(card.getByRole('alert')).toHaveText('That file is not an audio file.');

  const served = await page.evaluate(async () => {
    const catalog = (await (await fetch('content/audio/tracks.json')).json()) as { tracks: Array<{ file: string }> };
    const res = await fetch(`content/audio/${catalog.tracks[0]!.file}`);
    const buffer = await new AudioContext().decodeAudioData(await res.arrayBuffer());
    return { ok: res.ok, seconds: buffer.duration };
  });
  expect(served.ok).toBe(true);
  expect(served.seconds).toBeGreaterThan(30);
});

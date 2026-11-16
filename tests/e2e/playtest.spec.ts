import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const DIR = 'test-results/playtests';

/** The playtest loop end to end: play, react to a DM message, leave notes, and find the log on disk. */
test('a game writes a playtest log with feedback and notes to the playtests folder', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'taleforge:e2e',
      JSON.stringify({ dm: [{ text: 'Dusk in Brinewick. The bay is leaving. Mags, what do you do?' }, { text: 'You find nothing, and the tide keeps going out. Mags?' }] }),
    ),
  );
  await page.goto('./#/settings');
  await expect(page.getByRole('status').filter({ hasText: 'Logs are also written to' })).toBeVisible();
  await expect(page.getByLabel('Record playtest logs and show the feedback buttons')).toBeChecked();

  await page.goto('./#/new');
  await page.getByRole('button', { name: /The Sunken Crown/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Player name').fill('Jo');
  await page.getByText('Rogue', { exact: true }).click();
  await page.getByLabel('Character name').fill('Mags');
  await page.locator('label[title="Dexterity"]').click();
  await page.getByRole('button', { name: /Confirm and review party/ }).click();
  await page.getByRole('button', { name: /Begin the adventure/ }).click();
  await expect(page.getByText('Mags, what do you do?')).toBeVisible();
  await page.getByLabel('Your action').fill('I search the shingle for footprints.');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('You find nothing')).toBeVisible();

  // React to the second reply: thumbs down with a note.
  await page.getByRole('button', { name: 'Problem with this reply' }).last().click();
  await page.getByLabel('What went wrong? (optional)').fill('should have asked for a roll');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.getByText('should have asked for a roll')).toBeVisible();
  await page.getByRole('button', { name: 'Good reply' }).first().click();

  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Playtest notes' }).click();
  const notes = page.getByRole('dialog', { name: 'Playtest notes' });
  await notes.getByText('4', { exact: true }).click();
  await notes.getByText('too slow', { exact: true }).click();
  await notes.getByLabel('Anything confusing, broken or annoying?').fill('The map is hard to read.');
  await notes.getByRole('button', { name: 'Save notes' }).click();
  await expect(notes.getByText('Saved. Thank you!')).toBeVisible();

  // The hosted site cannot write files, so the log can be downloaded from the same window.
  const [download] = await Promise.all([page.waitForEvent('download'), notes.getByRole('button', { name: 'Download playtest log' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^taleforge-playtest_.+\.json$/);
  const downloaded = JSON.parse(readFileSync(await download.path(), 'utf8'));
  expect(downloaded).toMatchObject({ format: 'taleforge-playtest', survey: { fun: 4, pacing: 'too slow', confusing: 'The map is hard to read.' } });

  // The local server writes the log file shortly after each save.
  // Other tests write logs to the same folder in parallel: find this game's log by its notes.
  let file = '';
  const read = (f: string) => JSON.parse(readFileSync(join(DIR, f), 'utf8'));
  await expect
    .poll(
      () => {
        if (!existsSync(DIR)) return false;
        file = readdirSync(DIR).find((f) => f.endsWith('.json') && read(f).survey?.confusing === 'The map is hard to read.') ?? '';
        return file !== '';
      },
      { timeout: 10_000 },
    )
    .toBe(true);
  const log = read(file);
  expect(log.format).toBe('taleforge-playtest');
  expect(log.events.filter((e: { type: string }) => e.type === 'turn').map((e: { input: string }) => e.input)).toEqual(['(opening)', 'Mags: I search the shingle for footprints.']);
  const ratings = Object.values(log.feedback as Record<string, { rating: string; note: string }>).map((f) => `${f.rating}:${f.note}`).sort();
  expect(ratings).toEqual(['down:should have asked for a roll', 'up:']);
  expect(log.survey).toMatchObject({ fun: 4, pacing: 'too slow' });
});

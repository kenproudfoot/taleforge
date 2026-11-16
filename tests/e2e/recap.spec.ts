import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const SCRIPT = {
  helper: [
    '# Story so far\n- The party met Elder Maren and took her tide-clock.\n- They crossed to the causeway.\n# Where we are now\ncauseway: fog on every side.\n# Open threads & clues\n- A grappling iron stamped with a V.\n# NPC attitudes\n- elder-maren: friendly.\n# Next beat\nThe tide-wights rise.',
  ],
  dm: [
    { text: 'Dusk in Brinewick. Mags, what do you do?' },
    { text: 'You step onto the causeway.', toolCalls: [{ name: 'scene_change', input: { location: 'causeway' } }, { name: 'record_clue', input: { text: 'A grappling iron stamped with a V' } }, { name: 'adjust_resource', input: { resource: 'tide', delta: -1, reason: 'time' } }] },
    { text: 'The fog thickens. Mags?' },
    { text: 'Where were we? You stand on the causeway with the fog closing in. Mags, what do you do?' },
  ],
};

test('save and quit writes a recap that restores the exact game in a fresh browser', async ({ page, browser }) => {
  await page.addInitScript((s) => localStorage.setItem('taleforge:e2e', JSON.stringify(s)), SCRIPT);
  await page.goto('./#/new');
  await page.getByRole('button', { name: /The Sunken Crown/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Player name').fill('Jo');
  await page.getByText('Rogue', { exact: true }).click();
  await page.getByLabel('Character name').fill('Mags');
  await page.locator('label[title^="DEX:"]').click();
  await page.getByRole('button', { name: /Confirm and review party/ }).click();
  await page.getByRole('button', { name: /Begin the adventure/ }).click();
  await expect(page.getByText('Mags, what do you do?')).toBeVisible();
  await page.getByLabel('Your action').fill('I head out.');
  await page.getByRole('button', { name: 'Send' }).click();
  // The closing question sits below a rule, apart from the narration.
  await expect(page.getByText('The fog thickens.', { exact: true })).toBeVisible();
  await expect(page.getByText('Mags?', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Save and quit' }).click();
  const saved = page.getByRole('dialog', { name: 'Game saved' });
  await expect(saved).toBeVisible();
  const downloading = page.waitForEvent('download');
  await saved.getByRole('button', { name: 'Download recap.md' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^the-sunken-crown-recap-.*\.md$/);
  const recap = readFileSync(await download.path(), 'utf8');
  expect(recap).toContain('# Story so far\n\n- The party met Elder Maren');
  expect(recap).toContain('- **Mags** (Rogue, played by Jo)');
  expect(recap).toContain('- Tide: 5/6.');
  expect(recap).toContain('```json');

  // A different browser profile: nothing saved, only the recap file.
  const fresh = await browser.newContext();
  const other = await fresh.newPage();
  await other.addInitScript((s) => localStorage.setItem('taleforge:e2e', JSON.stringify(s)), { dm: SCRIPT.dm.slice(3) });
  await other.goto('./');
  await other.getByLabel('Recap file').setInputFiles({ name: 'recap.md', mimeType: 'text/markdown', buffer: Buffer.from(recap) });
  await expect(other).toHaveURL(/#\/play\/session-/);
  await expect(other.getByText(/Resumed from a recap saved/)).toBeVisible();
  await expect(other.getByText('The Dead Tide Causeway')).toBeVisible();
  await expect(other.getByRole('img', { name: 'Tide: 5 of 6' })).toBeVisible();
  await expect(other.getByText('A grappling iron stamped with a V')).toBeVisible();
  await other.getByRole('button', { name: 'Continue the story' }).click();
  await expect(other.getByText('Where were we? You stand on the causeway')).toBeVisible();
  await fresh.close();

  // The original browser can also export and re-import a full backup.
  await page.getByRole('dialog', { name: 'Game saved' }).getByRole('button', { name: 'Home' }).click();
  const backupDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download a backup of the The Sunken Crown game/ }).first().click();
  const backup = readFileSync(await (await backupDownload).path(), 'utf8');
  expect(JSON.parse(backup)).toMatchObject({ app: 'taleforge', kind: 'session' });
  await page.getByLabel('Recap file').setInputFiles({ name: 'notes.md', mimeType: 'text/markdown', buffer: Buffer.from('# Just notes') });
  await expect(page.getByRole('alert')).toContainText('not a TaleForge recap');
});

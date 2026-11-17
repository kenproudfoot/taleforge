import { expect, test } from '@playwright/test';
import { solidPng } from './png';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };

test('the Art Director paints portraits, the party, and scenes through a custom endpoint', async ({ page }) => {
  const prompts: string[] = [];
  await page.route('https://images.test/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = JSON.parse(route.request().postData() ?? '{}') as { prompt: string; width: number; height: number };
    prompts.push(body.prompt);
    const png = solidPng(body.width / 32, body.height / 32, [60 + prompts.length * 20, 90, 120]);
    return route.fulfill({ status: 200, headers: CORS, json: { data: [{ b64_json: png.toString('base64') }] } });
  });
  await page.addInitScript(() =>
    localStorage.setItem(
      'taleforge:e2e',
      JSON.stringify({
        helper: ['A painterly portrait of a lean rogue in a dark cloak, lantern light, misty harbour behind.'],
        dm: [
          { text: 'Dusk in Brinewick. The bay is leaving.', toolCalls: [{ name: 'roster_add', input: { id: 'elder-maren' } }] },
          { text: 'Mags, what do you do?' },
          { text: 'You step onto the causeway.', toolCalls: [{ name: 'scene_change', input: { location: 'causeway' } }, { name: 'request_image', input: { description: 'the fog parts to reveal the drowned spires' } }] },
          { text: 'The fog closes behind you. Mags?' },
        ],
      }),
    ),
  );

  await page.goto('./#/settings');
  await page.getByLabel('Image service').selectOption('custom');
  await page.getByLabel('URL', { exact: true }).fill('https://images.test/generate');
  await page.getByRole('button', { name: 'Paint a test picture' }).click();
  await expect(page.getByAltText('Test picture')).toBeVisible();
  // A local or custom service has no list price: the player sets one for the usage panel.
  await page.getByLabel('Price per picture (USD)').fill('0.01');

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

  const chat = page.getByRole('log', { name: 'Game chat' });
  await expect(chat).toContainText('Mags, what do you do?');
  // Portrait, party picture and the opening scene arrive without blocking the story.
  await expect(chat.getByRole('img', { name: 'The party, together at last' })).toBeVisible();
  // A picture in the chat opens full size.
  await chat.getByRole('button', { name: 'Open image: The party, together at last' }).click();
  await expect(page.getByRole('dialog', { name: 'The party, together at last' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'The party, together at last' })).toBeHidden();
  await expect(page.getByRole('img', { name: 'Scene: Brinewick Shingle' })).toBeVisible();
  // The scene moves in 2.5D: its depth map (a stand-in gradient in tests) turns it into a WebGL canvas,
  // in the panel and full screen.
  await expect(page.locator('canvas[aria-label="Scene: Brinewick Shingle"]')).toBeVisible();
  await page.getByRole('button', { name: 'Open the picture of Brinewick Shingle full screen' }).click();
  const full = page.getByRole('dialog', { name: 'Brinewick Shingle' });
  await expect(full.locator('canvas[aria-label="Scene: Brinewick Shingle"]')).toBeVisible();
  const box = await full.locator('canvas').boundingBox();
  expect(box && box.width > 300 && box.height > 100).toBe(true);
  await page.keyboard.press('Escape');
  await expect(full).toBeHidden();
  await expect(page.getByRole('button', { name: /Mags, Rogue/ }).locator('img')).toBeVisible();
  await expect(page.getByRole('button', { name: /Elder Maren Holt, Ally/ }).locator('img')).toBeVisible();

  // The card shows the portrait with its name plaque composited by the app.
  await page.getByRole('button', { name: /Mags, Rogue/ }).click();
  await expect(page.getByRole('img', { name: 'Mags, Rogue' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByLabel('Your action').fill('Onward.');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('img', { name: 'Scene: The Dead Tide Causeway' })).toBeVisible();
  await expect(chat.getByRole('img', { name: 'the fog parts to reveal the drowned spires' })).toBeVisible();
  await expect(page.getByText(/pictures$/)).toBeVisible();

  // Every picture went through the helper model's prompt writer, once per subject (the cache prevents repeats).
  const game = prompts.filter((p) => !p.includes('brass lantern'));
  expect(game.every((p) => p.includes('lean rogue'))).toBe(true);
  expect(game.length).toBeGreaterThanOrEqual(6);

  // The usage panel counts every picture at the player's price, and exports the log.
  await page.getByRole('button', { name: /tokens/ }).click();
  const panel = page.getByRole('dialog', { name: 'Usage and costs' });
  const row = panel.getByRole('row', { name: /^Pictures/ });
  await expect(row).toContainText(`${game.length} pictures`);
  await expect(row).toContainText(`$${(game.length * 0.01).toFixed(3)}`);
  await expect(panel.getByRole('row', { name: /^Dungeon Master/ })).toContainText('4 requests');
  const download = page.waitForEvent('download');
  await panel.getByRole('button', { name: /Download usage log/ }).click();
  expect((await download).suggestedFilename()).toMatch(/^taleforge-usage-the-sunken-crown-.*\.csv$/);
  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(panel).toBeHidden();
});

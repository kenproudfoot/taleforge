import { expect, test } from '@playwright/test';

test('app shell loads', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveTitle(/TaleForge/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('every page has a Back button that returns where you came from', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Campaigns' }).click();
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/#\/settings/);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(/#\/library/);
  // Opened directly (no history in the app): Back goes home.
  await page.goto('./#/settings');
  await page.evaluate(() => window.history.replaceState({ idx: 0 }, ''));
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(/#\/$/);
});

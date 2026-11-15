import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };

/** Serves a fake Anthropic model list so no real network call (or key) is needed. */
async function fakeAnthropic(page: Page) {
  await page.route('https://api.anthropic.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const headers = route.request().headers();
    if (![headers['x-api-key'], headers.authorization].some((h) => h?.endsWith('sk-ant-e2e'))) {
      return route.fulfill({ status: 401, headers: CORS, json: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } });
    }
    return route.fulfill({
      status: 200,
      headers: CORS,
      json: {
        data: [
          { type: 'model', id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5', created_at: '2026-09-01T00:00:00Z' },
          { type: 'model', id: 'claude-haiku-5-5', display_name: 'Claude Haiku 5.5', created_at: '2026-09-01T00:00:00Z' },
          { type: 'model', id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', created_at: '2026-09-01T00:00:00Z' },
        ],
        has_more: false,
        first_id: 'claude-sonnet-5-5',
        last_id: 'claude-opus-5-5',
      },
    });
  });
}

test('first-run wizard: keys are tested, models come from the live list, and setup survives a reload', async ({ page }) => {
  await fakeAnthropic(page);
  await page.goto('./');
  await page.getByRole('link', { name: 'Start setup' }).click();
  await page.getByRole('button', { name: 'Get started' }).click();

  const key = page.getByLabel('Anthropic API key');
  await key.fill('sk-ant-wrong');
  await page.getByRole('button', { name: 'Test connection' }).first().click();
  await expect(page.getByText('Anthropic rejected the API key. Check it in Settings.')).toBeVisible();
  await key.fill('sk-ant-e2e');
  await page.getByRole('button', { name: 'Test connection' }).first().click();
  await expect(page.getByText('Connected: 3 models available.')).toBeVisible();

  await page.getByRole('button', { name: 'Next' }).click();
  const dmModel = page.locator('#dm-model');
  await expect(dmModel.locator('option')).toHaveCount(3);
  await dmModel.selectOption('claude-opus-5-5');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Narrator voice' })).toBeVisible();
  await expect(page.getByText('Now using this browser.')).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Speaking to the Dungeon Master' })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('claude-opus-5-5 · Anthropic (Claude)')).toBeVisible();
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await expect(page.getByRole('link', { name: 'Start setup' })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Start setup' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Settings' }).first().click();
  await expect(page.getByLabel('Anthropic API key')).toHaveValue('sk-ant-e2e');
  await expect(page.locator('#dm-model')).toHaveValue('claude-opus-5-5');
});

test('settings export and import round-trip, with keys left out by default', async ({ page }) => {
  await fakeAnthropic(page);
  await page.goto('./#/settings');
  await page.getByLabel('Anthropic API key').fill('sk-ant-e2e');
  await page.locator('#dm-model').selectOption('claude-opus-5-5');
  await page.locator('#dm-effort').selectOption('high');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export settings' }).click();
  const file = await (await downloadPromise).path();
  const exported = readFileSync(file, 'utf8');
  expect(exported).not.toContain('sk-ant-e2e');
  expect(JSON.parse(exported).settings.dm).toMatchObject({ model: 'claude-opus-5-5', effort: 'high' });

  await page.locator('#dm-model').selectOption('claude-sonnet-5-5');
  await page.locator('#dm-effort').selectOption('low');
  await page.getByLabel('Settings file').setInputFiles({ name: 'taleforge-settings.json', mimeType: 'application/json', buffer: Buffer.from(exported) });
  await expect(page.getByText('Settings imported.')).toBeVisible();
  await expect(page.locator('#dm-model')).toHaveValue('claude-opus-5-5');
  await expect(page.locator('#dm-effort')).toHaveValue('high');
  await expect(page.getByLabel('Anthropic API key')).toHaveValue('sk-ant-e2e');

  await page.getByLabel('Settings file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"other"}') });
  await expect(page.getByText('That file is not a TaleForge settings export.')).toBeVisible();
});

test('a passphrase locks the keys until it is entered', async ({ page }) => {
  await fakeAnthropic(page);
  await page.goto('./#/settings');
  await page.getByLabel('Anthropic API key').fill('sk-ant-e2e');
  await page.getByLabel('New passphrase').fill('open sesame');
  await page.getByRole('button', { name: 'Encrypt keys' }).click();
  await expect(page.getByText('Keys are encrypted')).toBeVisible();

  await page.reload();
  await expect(page.getByText('Your API keys are locked')).toBeVisible();
  await expect(page.getByLabel('Anthropic API key')).toHaveValue('');
  await page.getByLabel('Passphrase', { exact: true }).fill('wrong');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('alert')).toHaveText('Wrong passphrase.');
  await page.getByLabel('Passphrase', { exact: true }).fill('open sesame');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByLabel('Anthropic API key')).toHaveValue('sk-ant-e2e');
});

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const SCRIPT = {
  dm: [
    { text: 'Dusk in Brinewick. The bay is leaving.', toolCalls: [{ name: 'roster_add', input: { id: 'elder-maren' } }] },
    { text: '«Elder Maren: You came.» Mags, what do you do?' },
    { text: 'The lock is old.', toolCalls: [{ name: 'request_roll', input: { character: 'Mags', kind: 'check', stat: 'DEX', dc: 13, reason: 'pick the lock' } }] },
  ],
};

async function audit(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s) e.g. ${v.nodes[0]?.target.join(' ')}`);
  expect(summary, `${label} accessibility violations`).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  // Measure settled screens, not mid-animation frames (the app honours reduced motion).
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript((s) => localStorage.setItem('taleforge:e2e', JSON.stringify(s)), SCRIPT);
});

async function startGame(page: Page) {
  await page.goto('./#/new');
  await page.getByRole('button', { name: /The Sunken Crown/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: /Physical dice/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Player name').fill('Jo');
  await page.getByText('Rogue', { exact: true }).click();
  await page.getByLabel('Character name').fill('Mags');
  await page.locator('label[title^="DEX:"]').click();
}

test('every main screen passes an automated WCAG 2.1 AA audit', async ({ page }) => {
  for (const [path, label] of [
    ['./', 'home'],
    ['./#/library', 'library'],
    ['./#/settings', 'settings'],
    ['./#/setup', 'setup wizard'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 }).or(page.getByRole('heading', { level: 2 })).first()).toBeVisible();
    await audit(page, label);
  }
  await startGame(page);
  await audit(page, 'character creation');
  await page.getByRole('button', { name: /Confirm and review party/ }).click();
  await audit(page, 'party review');
  await page.getByRole('button', { name: /Begin the adventure/ }).click();
  await expect(page.getByText('Mags, what do you do?')).toBeVisible();
  await audit(page, 'game table');
  await page.getByRole('button', { name: /tokens/ }).click();
  await expect(page.getByRole('dialog', { name: 'Usage and costs' })).toBeVisible();
  await audit(page, 'usage panel');
  await page.getByRole('dialog', { name: 'Usage and costs' }).getByRole('button', { name: 'Close' }).click();
  await page.getByLabel('Your action').fill('I pick the lock.');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('region', { name: 'Roll request' })).toBeVisible();
  await audit(page, 'roll prompt');
  await page.getByRole('button', { name: /Mags, Rogue/ }).click();
  await page.getByRole('button', { name: 'Stats' }).click();
  await audit(page, 'stat card');
});

test.describe('phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('no screen scrolls sideways, and the table switches to tabs', async ({ page }) => {
    const noSideScroll = async (label: string) => {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${label} scrolls sideways`).toBeLessThanOrEqual(0);
    };
    for (const path of ['./', './#/library', './#/settings', './#/new']) {
      await page.goto(path);
      await page.waitForTimeout(200);
      await noSideScroll(path);
    }
    await startGame(page);
    await noSideScroll('character creation');
    await page.getByRole('button', { name: /Confirm and review party/ }).click();
    await page.getByRole('button', { name: /Begin the adventure/ }).click();
    await expect(page.getByText('Mags, what do you do?')).toBeVisible();
    await noSideScroll('game table');
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.getByRole('button', { name: 'Usage and costs' }).click();
    await expect(page.getByRole('dialog', { name: 'Usage and costs' })).toBeVisible();
    await noSideScroll('usage panel');
    await page.getByRole('dialog', { name: 'Usage and costs' }).getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: 'Resume' }).click();
    await expect(page.getByRole('tab', { name: 'Roster' })).toBeVisible();
    await page.getByRole('tab', { name: 'State' }).click();
    await expect(page.getByRole('progressbar', { name: 'Goal progress' })).toBeVisible();
    await page.getByLabel('Your action').fill('I pick the lock.');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByRole('button', { name: 'I rolled 7' })).toBeVisible();
    await noSideScroll('roll prompt');
  });
});

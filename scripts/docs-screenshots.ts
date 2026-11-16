// npm run docs:screenshots
// Builds the app, serves it, plays a scripted session and saves the README screenshots to docs/images/.
// The Dungeon Master is scripted so the pictures are reproducible and need no API keys.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const OUT = join(process.cwd(), 'docs/images');
const PORT = 4174;
const BASE = `http://127.0.0.1:${PORT}/taleforge/`;

const SCRIPT = {
  helper: ['["Lyra Vance", "Mara Tidewell", "Iseult Brine", "Corrin Holt", "Wren Ashdown"]'],
  dm: [
    { text: 'Dusk in Brinewick. Rain has just stopped and every roof drips. The whole village stands on the shingle with lanterns, staring at the bay, because the bay is leaving.', toolCalls: [{ name: 'roster_add', input: { id: 'elder-maren' } }, { name: 'roster_add', input: { id: 'pip' } }] },
    { text: 'An old woman pushes through the crowd, a brass tide-clock swinging from her fist. «Elder Maren: You came. Thank the tides. The causeway will not stand clear for long.» She presses the clock into your hands. Lyra, what do you do?' },
    {
      text: 'You step onto the pale causeway as the fog closes in behind you. Somewhere out in the mud, a bell rings that nobody is ringing.',
      toolCalls: [
        { name: 'advance_progress', input: { beat: 'brinewick-at-dusk', milestone: true } },
        { name: 'scene_change', input: { location: 'causeway' } },
        { name: 'roster_remove', input: { id: 'elder-maren', reason: 'left' } },
        { name: 'adjust_resource', input: { resource: 'tide', delta: -1, reason: 'crossing' } },
        { name: 'record_clue', input: { text: 'A grappling iron stamped with a V' } },
        { name: 'roster_add', input: { id: 'tide-wight' } },
      ],
    },
    { text: 'A drowned sailor drags itself out of the silt, boat-hook raised, seawater pouring from its sleeves. Brann, it is coming for you!', toolCalls: [{ name: 'request_roll', input: { character: 'Brann', kind: 'attack', target: 'tide-wight', reason: 'cut the wight down' } }] },
    { text: 'Your axe bites deep and the wight folds back into the mud with a sound like a sigh.', toolCalls: [{ name: 'encounter_result', input: { encounter_id: 'causeway-wights', outcome: 'won' } }] },
    { text: 'The fog parts ahead. Lyra, the bronze gate of the drowned cathedral rises out of the mist. Pip tugs at your sleeve. What do you do?' },
    { text: 'The gate is sealed with green bronze.', toolCalls: [{ name: 'request_roll', input: { character: 'Lyra', kind: 'check', stat: 'WIS', dc: 13, reason: 'read the carvings on the gate' } }] },
    { text: 'The carvings tell the story of the tide in three panels.' },
  ],
};

async function serve(): Promise<() => void> {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) return () => server.kill();
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  server.kill();
  throw new Error('preview server did not start');
}

mkdirSync(OUT, { recursive: true });
const stop = await serve();
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript((s) => localStorage.setItem('taleforge:e2e', JSON.stringify(s)), SCRIPT);
  const shot = async (name: string, wait = 500) => {
    await page.waitForTimeout(wait);
    await page.screenshot({ path: join(OUT, `${name}.png`) });
    console.log(`docs/images/${name}.png`);
  };

  await page.goto(`${BASE}#/setup`);
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.getByLabel('Anthropic API key').fill('sk-ant-api03-example-key-for-screenshots');
  await shot('setup-wizard');

  await page.goto(`${BASE}#/library`);
  await page.getByRole('article').filter({ hasText: 'Ashes on 45th Street' }).getByRole('button', { name: 'Details' }).click();
  await shot('campaign-library');

  await page.goto(`${BASE}#/new`);
  await page.getByRole('button', { name: /The Sunken Crown/ }).click();
  await shot('campaign-picker');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: '2', exact: true }).click();
  await page.getByRole('button', { name: /Per player/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Digital dice' }).click();
  await page.getByLabel('Player name').fill('Sam');
  await page.getByText('Healer', { exact: true }).click();
  await page.getByRole('button', { name: 'Suggest names' }).click();
  await page.getByRole('button', { name: 'Lyra Vance' }).click();
  await page.getByRole('button', { name: 'she/her' }).click();
  await page.getByLabel('One striking feature').fill('a white streak in her hair from a lightning strike');
  await page.locator('label[title^="WIS:"]').click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('character-creation');
  await page.getByRole('button', { name: /Confirm and next player/ }).click();
  await page.getByRole('button', { name: 'Physical dice' }).click();
  await page.getByLabel('Player name').fill('Alex');
  await page.getByText('Knight', { exact: true }).click();
  await page.getByLabel('Character name').fill('Brann');
  await page.getByText('This character has a companion').click();
  await page.getByLabel('Companion name').fill('Biscuit');
  await page.getByLabel('What is it?').fill('a scruffy terrier with one torn ear');
  await page.locator('label[title^="STR:"]').click();
  await page.getByRole('button', { name: /Confirm and review party/ }).click();
  await page.getByRole('button', { name: /Begin the adventure/ }).click();
  await page.getByText('Lyra, what do you do?').waitFor();

  await page.getByLabel('Your action').fill('I take the clock, thank her, and lead us out onto the causeway with my lantern held high.');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByRole('region', { name: 'Roll request' }).waitFor();
  await shot('physical-dice', 900);
  const prompt = page.getByRole('region', { name: 'Roll request' });
  await prompt.getByRole('button', { name: 'I rolled 15' }).click();
  await prompt.getByRole('button', { name: 'I rolled 7' }).click();
  await page.getByText('What do you do?').last().waitFor();
  await page.getByRole('tab', { name: 'State' }).click().catch(() => undefined);
  await shot('game-table', 900);

  await page.getByRole('button', { name: /Brann, Knight/ }).click();
  await page.getByRole('button', { name: 'Stats' }).click();
  await shot('stat-card', 1000);
  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('radio', { name: /Lyra/ }).click();
  await page.getByLabel('Your action').fill('I study the carvings on the gate.');
  await page.getByRole('button', { name: 'Send' }).click();
  await prompt.getByRole('button', { name: /Roll d20/ }).click();
  const tray = page.getByRole('dialog', { name: 'Dice tray' });
  await tray.getByRole('button', { name: /Throw the/ }).waitFor();
  await page.waitForTimeout(600);
  await tray.getByRole('button', { name: /Throw the/ }).click();
  await shot('dice-tray', 650);
  await tray.waitFor({ state: 'detached', timeout: 20_000 });
  // A low roll offers the Heroic Point; keep the result either way.
  const heroic = page.getByRole('region', { name: 'Heroic Point' });
  const carvings = page.getByText('The carvings tell the story');
  await heroic.or(carvings).first().waitFor();
  if (await heroic.isVisible()) await heroic.getByRole('button', { name: 'Keep the result' }).click();
  await carvings.waitFor();

  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Save and quit' }).click();
  await page.getByRole('dialog', { name: 'Game saved' }).waitFor();
  await shot('recap');
} finally {
  await browser.close();
  stop();
}

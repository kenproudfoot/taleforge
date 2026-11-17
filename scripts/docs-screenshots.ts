// npm run docs:screenshots
// Builds the app, serves it, plays a scripted session and saves the README screenshots to docs/images/.
// The Dungeon Master is scripted so the pictures are reproducible and need no API keys.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { chromium } from '@playwright/test';

const OUT = join(process.cwd(), 'docs/images');
const PORT = 4174;
const BASE = `http://127.0.0.1:${PORT}/taleforge/`;

const SCRIPT = {
  // Names first; after that an empty rewrite, so every picture uses the app's own full prompt.
  helper: ['["Lyra Vance", "Mara Tidewell", "Iseult Brine", "Corrin Holt", "Wren Ashdown"]', ''],
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

// The pictures come from a stand-in image service: art painted ahead of time for this exact session
// (scripts/docs-art/, matched by what each prompt asks for), so the screenshots show real paintings.
const ART_DIR = join(process.cwd(), 'scripts/docs-art');
const ART: Array<[string, RegExp]> = [
  ['party', /^Group portrait/],
  ['lyra', /^Full-body.*Lyra Vance/],
  ['brann', /^Full-body.*Brann/],
  ['brinewick', /^Wide establishing shot of Brinewick/],
  ['causeway', /^Wide establishing shot of The Dead Tide Causeway/],
  ['gate-of-bells', /^Wide establishing shot of The Gate of Bells/],
  ['maren', /^Character portrait of Elder Maren/],
  ['pip', /^Character portrait of Pip/],
  ['tide-wight', /^Character portrait of Tide-Wight/],
];

function artFor(prompt: string): Buffer | null {
  const hit = ART.find(([, re]) => re.test(prompt));
  const file = hit && join(ART_DIR, `${hit[0]}.jpg`);
  return file && existsSync(file) ? readFileSync(file) : null;
}

/** A plain grey stand-in for any picture the session asks for that has no painting. */
function greyPng(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 0, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width, 70)]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))), chunk('IEND', Buffer.alloc(0))]);
}

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
  // Music previews would need real speakers: record the click instead.
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = () => Promise.resolve();
  });
  const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
  await page.route('https://images.test/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = JSON.parse(route.request().postData() ?? '{}') as { prompt: string; width: number; height: number };
    const art = artFor(body.prompt);
    if (!art) console.log(`no painting for (${body.width}x${body.height}): ${JSON.stringify(body.prompt)}`);
    const data = art ?? greyPng(Math.max(1, Math.round(body.width / 16)), Math.max(1, Math.round(body.height / 16)));
    return route.fulfill({ status: 200, headers: CORS, json: { data: [{ b64_json: data.toString('base64') }] } });
  });
  const shot = async (name: string, wait = 500) => {
    await page.waitForTimeout(wait);
    await page.screenshot({ path: join(OUT, `${name}.png`) });
    console.log(`docs/images/${name}.png`);
  };

  await page.goto(`${BASE}#/setup`);
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.getByLabel('Anthropic API key').fill('sk-ant-api03-example-key-for-screenshots');
  await shot('setup-wizard');

  await page.goto(`${BASE}#/settings`);
  await page.getByLabel('Image service').selectOption('custom');
  await page.getByLabel('URL', { exact: true }).fill('https://images.test/generate');
  await page.waitForTimeout(400);

  await page.goto(`${BASE}#/`);
  await page.mouse.move(0, 0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('home', 900);

  await page.goto(`${BASE}#/library`);
  await page.getByRole('article').filter({ hasText: 'The Light at Point Sur' }).waitFor();
  // Tall enough for both rows of cards, the bonus campaign included.
  await page.setViewportSize({ width: 1440, height: 1240 });
  await shot('campaign-library', 900);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('article').filter({ hasText: 'The Light at Point Sur' }).getByRole('button', { name: 'Details' }).click();
  const details = page.getByRole('dialog', { name: 'The Light at Point Sur' });
  await details.getByRole('button', { name: 'Play the mystery music' }).click();
  await details.getByText('Music', { exact: true }).scrollIntoViewIfNeeded();
  await shot('campaign-details');
  await details.getByRole('button', { name: 'Close' }).click();

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
  // Let the painted scene arrive and its 2.5D view settle in.
  await page.getByRole('img', { name: /^Scene: / }).first().waitFor({ timeout: 15_000 }).catch(() => undefined);
  await shot('game-table', 2500);

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

// npm run real-run -- [--campaign the-sunken-crown] [--turns 12] [--max-usd 1.5] [--quality low|medium|high]
//                     [--no-images] [--no-voice] [--headed]
//
// Plays a short game against the REAL AI services with the keys in .env.local, to measure cost and check
// quality. This spends real money: it stops after --turns player turns, or as soon as the game's estimated
// cost passes --max-usd. Results go to real-runs/<campaign>-<time>/ (gitignored): the usage log (CSV),
// the chat transcript, a summary and screenshots.
//
// The players are scripted (generic but sensible actions, physical dice with random results); the
// Dungeon Master, helper, pictures and voices are real.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';

const { values: args } = parseArgs({
  options: {
    campaign: { type: 'string', default: 'the-sunken-crown' },
    turns: { type: 'string', default: '12' },
    'max-usd': { type: 'string', default: '1.5' },
    quality: { type: 'string', default: 'medium' },
    'no-images': { type: 'boolean', default: false },
    'no-voice': { type: 'boolean', default: false },
    headed: { type: 'boolean', default: false },
    /** Free rehearsal: a scripted Dungeon Master instead of the real one, to check this script works. */
    mock: { type: 'boolean', default: false },
  },
});
const TURNS = Number(args.turns);
const MAX_USD = Number(args['max-usd']);

function readEnv(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && m[2]) out[m[1]!] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = readEnv(join(process.cwd(), '.env.local'));
const KEYS: Array<[string, string]> = [
  ['ANTHROPIC_API_KEY', 'Anthropic API key'],
  ['OPENAI_API_KEY', 'OpenAI API key'],
  ['GEMINI_API_KEY', 'Google Gemini API key'],
  ['OPENROUTER_API_KEY', 'OpenRouter API key'],
  ['ELEVENLABS_API_KEY', 'ElevenLabs API key'],
];
if (!args.mock && !env.ANTHROPIC_API_KEY && !env.OPENAI_API_KEY) {
  console.error('No ANTHROPIC_API_KEY or OPENAI_API_KEY in .env.local: nothing to run the Dungeon Master with.');
  process.exit(1);
}

const ACTIONS = [
  'I look around carefully and ask the nearest person what is going on here.',
  'I take the lead and head toward whatever seems most urgent.',
  'I search the area for anything useful or out of place.',
  'I try to talk our way past this, calmly and honestly.',
  'I stay alert and protect the others while we move forward.',
  'I attack the nearest threat.',
  'I examine the strangest thing I can see up close.',
  'I ask what our options are and pick the boldest one.',
  'I follow the clue we just found.',
  'I push on toward our goal.',
];

const PORT = 4175;
const BASE = `http://127.0.0.1:${PORT}/taleforge/`;

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

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = join(process.cwd(), 'real-runs', `${args.mock ? 'mock-' : ''}${args.campaign}-${stamp}`);
mkdirSync(OUT, { recursive: true });
const log = (s: string) => console.log(`[${new Date().toLocaleTimeString()}] ${s}`);

const stop = await serve();
const browser = await chromium.launch({ headless: !args.headed, args: ['--autoplay-policy=no-user-gesture-required'] });
const started = Date.now();
let turnsPlayed = 0;
let stopReason = 'turn limit';
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  if (args.mock) {
    const dm = Array.from({ length: TURNS + 2 }, (_, i) => ({ text: `Scene ${i + 1}: the story moves on. What do you do?` }));
    await page.addInitScript((script) => localStorage.setItem('taleforge:e2e', JSON.stringify(script)), { dm, helper: ['{}'] });
  }
  page.on('pageerror', (e) => log(`page error: ${e.message}`));
  const shot = (name: string) => page.screenshot({ path: join(OUT, `${name}.png`) });

  // Settings: keys, picture quality, voice.
  await page.goto(`${BASE}#/settings`);
  if (!args.mock) for (const [name, label] of KEYS) if (env[name]) await page.getByLabel(label).fill(env[name]!);
  if (args['no-images'] || args.mock) await page.getByLabel('Image service').selectOption('none');
  else if (env.OPENAI_API_KEY) {
    const quality = page.getByLabel('Picture quality');
    if (await quality.isVisible().catch(() => false)) await quality.selectOption(args.quality!);
  }
  if (args['no-voice']) await page.getByLabel('Read the story aloud').uncheck();
  await page.waitForTimeout(800);

  // New game: one player, physical dice (so the script can enter results), Surprise me for the character.
  await page.goto(`${BASE}#/new`);
  const manifest = readFileSync(join(process.cwd(), 'public/content/campaigns', args.campaign!, 'campaign.md'), 'utf8');
  const title = /^title:\s*["']?(.+?)["']?\s*$/m.exec(manifest)?.[1] ?? args.campaign!;
  await page.getByRole('button', { name: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first().click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: '1', exact: true }).click();
  await page.getByRole('button', { name: /^Physical dice/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Player name').fill('Tester');
  await page.locator('input[name="p0-archetype"]').first().check({ force: true });
  await page.locator('input[name="p0-bump"]').first().check({ force: true });
  await page.getByRole('button', { name: /Surprise me with everything left blank/ }).click();
  await page.getByRole('button', { name: /Confirm and review party/ }).waitFor();
  await page.waitForFunction(() => !document.body.textContent?.includes('Thinking…'), undefined, { timeout: 60_000 });
  const nameField = page.getByLabel('Character name');
  if (!(await nameField.inputValue())) await nameField.fill('Rowan');
  await page.getByRole('button', { name: /Confirm and review party/ }).click();
  await page.getByRole('button', { name: /Begin the adventure/ }).click();
  log('game started');

  const chat = page.getByRole('log', { name: 'Game chat' });
  const send = page.getByRole('button', { name: 'Send' });
  const rollRequest = page.getByRole('region', { name: 'Roll request' });
  const heroic = page.getByRole('region', { name: 'Heroic Point' });
  const costNow = async () => {
    const text = (await page.getByRole('button', { name: /tokens/ }).textContent()) ?? '';
    return Number(/\$([\d.]+)/.exec(text)?.[1] ?? 0);
  };

  /** Waits until the DM has finished and the table is waiting for the players, answering dice on the way. */
  const settle = async () => {
    for (let i = 0; i < 600; i++) {
      if (await rollRequest.isVisible().catch(() => false)) {
        const keys = rollRequest.getByRole('button', { name: /^I rolled \d+$/ });
        const n = await keys.count();
        if (n) await keys.nth(Math.floor(Math.random() * n)).click();
        else {
          const typed = rollRequest.getByRole('textbox');
          const max = Number(/1 to (\d+)/.exec((await typed.getAttribute('aria-label')) ?? '')?.[1] ?? 100);
          await typed.fill(String(1 + Math.floor(Math.random() * max)));
          await typed.press('Enter');
        }
        await page.waitForTimeout(400);
        continue;
      }
      if (await heroic.isVisible().catch(() => false)) {
        await heroic.getByRole('button', { name: 'Keep the result' }).click();
        continue;
      }
      if (await page.getByRole('dialog', { name: /^(Victory|Defeat|A bittersweet ending)$/ }).isVisible().catch(() => false)) return 'ended';
      if ((await chat.getAttribute('data-busy')) === 'false' && (await chat.getByRole('button', { name: 'Try again' }).last().isVisible().catch(() => false))) return 'error';
      if ((await chat.getAttribute('data-busy')) === 'false') {
        await page.waitForTimeout(600);
        if (!(await rollRequest.isVisible().catch(() => false))) return 'ready';
      }
      await page.waitForTimeout(500);
    }
    return 'timeout';
  };

  let state = await settle();
  await shot('01-opening');
  while (state === 'ready' && turnsPlayed < TURNS) {
    const spent = await costNow();
    if (spent >= MAX_USD) {
      stopReason = `cost limit ($${spent.toFixed(2)} ≥ $${MAX_USD})`;
      break;
    }
    const action = ACTIONS[turnsPlayed % ACTIONS.length]!;
    await page.getByLabel('Your action').fill(action);
    await send.click();
    turnsPlayed += 1;
    log(`turn ${turnsPlayed}: ${action}  (≈$${spent.toFixed(2)} so far)`);
    state = await settle();
    if (turnsPlayed % 4 === 0) await shot(`turn-${String(turnsPlayed).padStart(2, '0')}`);
  }
  if (state === 'ended') stopReason = 'campaign ended';
  if (state === 'timeout') stopReason = 'timed out waiting for the Dungeon Master';
  if (state === 'error') stopReason = 'the Dungeon Master returned an error (see transcript.txt)';
  await page.waitForTimeout(4000); // let pictures and voice in flight finish
  await shot('99-final');

  writeFileSync(join(OUT, 'transcript.txt'), (await chat.innerText()) + '\n');
  await page.getByRole('button', { name: /tokens/ }).click();
  const panel = page.getByRole('dialog', { name: 'Usage and costs' });
  await panel.waitFor();
  await page.screenshot({ path: join(OUT, 'usage-panel.png'), fullPage: true });
  const panelText = await panel.innerText();
  const download = page.waitForEvent('download');
  await panel.getByRole('button', { name: /Download usage log/ }).click();
  await (await download).saveAs(join(OUT, 'usage.csv'));

  const summary = [
    `campaign: ${args.campaign}`,
    `player turns: ${turnsPlayed} (stopped: ${stopReason})`,
    `wall time: ${((Date.now() - started) / 60_000).toFixed(1)} min`,
    `options: ${args.mock ? 'MOCK DM (free rehearsal) ' : ''}quality=${args.quality} images=${!args['no-images'] && !args.mock} voice=${!args['no-voice']}`,
    '',
    panelText,
  ].join('\n');
  writeFileSync(join(OUT, 'summary.txt'), summary + '\n');
  console.log('\n' + summary);
  log(`results in ${OUT}`);
} finally {
  await browser.close();
  stop();
}

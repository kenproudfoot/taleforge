import { expect, test } from '@playwright/test';

/** A scripted mini-campaign for the mock Dungeon Master: opening, a fight, a check and the ending. */
const SCRIPT = {
  helper: ['["Lyra Vance", "Mara Tidewell", "Iseult Brine", "Corrin Holt", "Wren Ashdown"]'],
  dm: [
    { text: 'Dusk in Brinewick. The bay is leaving, and black spires rise from the mud.', toolCalls: [{ name: 'roster_add', input: { id: 'elder-maren' } }] },
    { text: 'An old woman pushes through the crowd. «Elder Maren: You came. Thank the tides.» She presses a brass tide-clock into your hands. Lyra, what do you do?' },
    {
      text: 'You step onto the pale causeway as the fog closes in.',
      toolCalls: [
        { name: 'advance_progress', input: { beat: 'brinewick-at-dusk', milestone: true } },
        { name: 'scene_change', input: { location: 'causeway' } },
        { name: 'roster_remove', input: { id: 'elder-maren', reason: 'left' } },
        { name: 'roster_add', input: { id: 'tide-wight' } },
      ],
    },
    { text: 'A drowned sailor drags itself out of the silt, boat-hook raised. Brann, strike before it does!', toolCalls: [{ name: 'request_roll', input: { character: 'Brann', kind: 'attack', target: 'tide-wight', reason: 'cut the wight down' } }] },
    {
      text: 'Your blade bites deep and the wight folds back into the mud.',
      toolCalls: [
        { name: 'roster_remove', input: { id: 'tide-wight', reason: 'defeated' } },
        { name: 'encounter_result', input: { encounter_id: 'causeway-wights', outcome: 'won' } },
        { name: 'record_clue', input: { text: 'A grappling iron stamped with a V' } },
        { name: 'advance_progress', input: { beat: 'the-causeway', milestone: true } },
      ],
    },
    { text: 'Ahead, the great bronze gate stands sealed. Brann, put your shoulder to it.', toolCalls: [{ name: 'request_roll', input: { character: 'Brann', kind: 'check', stat: 'STR', dc: 10, reason: 'force the Gate of Bells' } }] },
    { text: 'The gate groans open, and far above the Tide Bell begins to ring.', toolCalls: [{ name: 'end_campaign', input: { outcome: 'victory', ending: 'the-bell-rings', epilogue_hint: 'The sea settles.' } }] },
    { text: 'Dawn breaks over a quiet bay. Brinewick is safe, and the drowned bells are silent at last.' },
  ],
};

test('a full scripted campaign from setup to the ending, then reopened from the saved game', async ({ page }) => {
  await page.addInitScript((script) => localStorage.setItem('taleforge:e2e', JSON.stringify(script)), SCRIPT);
  await page.goto('./');
  await page.getByRole('link', { name: /New game/ }).click();

  // Campaign and table.
  await page.getByRole('button', { name: /The Sunken Crown/ }).click();
  await expect(page.getByRole('region', { name: 'About this campaign' })).toContainText('Eighty years ago');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: '2', exact: true }).click();
  await page.getByRole('button', { name: /Physical dice/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  // Player one: name suggestions come from the helper model.
  await page.getByLabel('Player name').fill('Sam');
  await page.getByText('Healer', { exact: true }).click();
  await page.getByRole('button', { name: 'Suggest names' }).click();
  await page.getByRole('button', { name: 'Lyra Vance' }).click();
  await expect(page.getByLabel('Character name')).toHaveValue('Lyra Vance');
  await expect(page.getByText('Still needed: Stat boost')).toBeVisible();
  await page.locator('label[title="Wisdom"]').click();
  await page.getByRole('button', { name: /Confirm and next player/ }).click();

  // Player two, with a companion.
  await page.getByLabel('Player name').fill('Alex');
  await page.getByText('Knight', { exact: true }).click();
  await page.getByLabel('Character name').fill('Brann');
  await page.getByText('This character has a companion').click();
  await page.getByLabel('Companion name').fill('Biscuit');
  await page.getByLabel('What is it?').fill('a scruffy terrier');
  await page.locator('label[title="Strength"]').click();
  await page.getByRole('button', { name: /Confirm and review party/ }).click();
  await expect(page.getByText('Healer · played by Sam')).toBeVisible();
  await expect(page.getByText('With Biscuit')).toBeVisible();
  await page.getByRole('button', { name: /Begin the adventure/ }).click();

  // The opening turn: narration, NPC speech, and Maren on the roster.
  await expect(page).toHaveURL(/#\/play\/session-/);
  const chat = page.getByRole('log', { name: 'Game chat' });
  await expect(chat).toContainText('Dusk in Brinewick.');
  await expect(chat.locator('blockquote')).toContainText('You came. Thank the tides.');
  await expect(page.getByRole('button', { name: /Elder Maren Holt, Ally/ })).toBeVisible();
  await expect(page.getByRole('radio', { name: /Lyra/ })).toBeChecked();
  await expect(page.getByRole('heading', { name: 'The Sunken Crown' })).toBeVisible();

  // The stat card flips.
  await page.getByRole('button', { name: /Brann, Knight/ }).click();
  await page.getByRole('button', { name: 'Stats' }).click();
  await expect(page.getByText('Companion: Biscuit, a scruffy terrier')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  // A player turn that leads to a fight with physical dice.
  await page.getByLabel('Your action').fill('We set out across the causeway.');
  await page.getByRole('button', { name: 'Send' }).click();
  const prompt = page.getByRole('region', { name: 'Roll request' });
  await expect(prompt).toContainText('Brann, roll a d20 to attack Tide-Wight.');
  await expect(page.getByRole('radio', { name: /Brann/ })).toBeChecked();
  await expect(page.getByRole('button', { name: /Elder Maren Holt/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Tide-Wight, Enemy/ })).toBeVisible();
  await expect(page.getByText('The Dead Tide Causeway')).toBeVisible();
  await prompt.getByRole('button', { name: 'I rolled 15' }).click();
  await expect(prompt).toContainText('Brann hits! Roll a d10 for damage.');
  await prompt.getByRole('button', { name: 'I rolled 8' }).click();
  await expect(chat).toContainText('15 + 4 + 2 prof = 21 vs Defense 11');
  await expect(chat).toContainText('Damage: 12');
  await expect(chat).toContainText('Tide-Wight is defeated');
  await expect(chat).toContainText('Clue found: A grappling iron stamped with a V');

  // A check, then the ending.
  await expect(prompt).toContainText('Brann, roll a d20 for a STR check, DC 10.');
  await prompt.getByRole('button', { name: 'I rolled 12' }).click();
  await expect(chat).toContainText('Dawn breaks over a quiet bay.');
  const ending = page.getByRole('dialog', { name: 'Victory' });
  await expect(ending).toContainText('Encounters won');
  await expect(ending).toContainText('1 of 1');
  await expect(ending).toContainText('Lyra Vance, Brann');
  await ending.getByRole('button', { name: 'Home' }).click();

  // The finished game is saved and can be reopened after a reload.
  await expect(page.getByRole('heading', { name: 'Continue a saved game' })).toBeVisible();
  await page.reload();
  await page.getByRole('link', { name: 'Read' }).click();
  await expect(page.getByRole('log', { name: 'Game chat' })).toContainText('Dawn breaks over a quiet bay.');
  await expect(page.getByRole('progressbar', { name: 'Goal progress' })).toHaveAttribute('aria-valuenow', '100');
});

test('digital dice, a failed roll saved with a Heroic Point, and a free roll', async ({ page }) => {
  const script = {
    dm: [
      { text: 'A locked door bars the way. Mags, what do you do?' },
      { text: 'The lock is old and stubborn.', toolCalls: [{ name: 'request_roll', input: { character: 'Mags', kind: 'check', stat: 'DEX', dc: 25, reason: 'pick the lock' } }] },
      { text: 'Somehow, it clicks open.' },
    ],
  };
  await page.addInitScript((s) => localStorage.setItem('taleforge:e2e', JSON.stringify(s)), script);
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

  const chat = page.getByRole('log', { name: 'Game chat' });
  await expect(chat).toContainText('A locked door bars the way.');
  await page.getByRole('button', { name: 'Roll dice' }).click();
  await page.getByRole('menuitem', { name: 'd6', exact: true }).click();
  await page.getByRole('dialog', { name: 'Dice tray' }).getByRole('button', { name: 'Throw the d6' }).click();
  await expect(chat).toContainText('Free roll: 1d6', { timeout: 20_000 });

  await page.getByLabel('Your action').fill('I pick the lock.');
  await page.getByLabel('Your action').press('Enter');
  await page.getByRole('region', { name: 'Roll request' }).getByRole('button', { name: /Roll d20/ }).click();
  // The 3D tray opens: throw, watch the die settle, and see the result.
  const tray = page.getByRole('dialog', { name: 'Dice tray' });
  await tray.getByRole('button', { name: 'Throw the d20' }).click();
  await expect(tray.getByText('d20', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(tray).toHaveCount(0, { timeout: 10_000 });
  // DC 25 cannot be reached with +6 unless the die shows 19 or 20, so the Heroic Point prompt appears on most rolls.
  const heroic = page.getByRole('region', { name: 'Heroic Point' });
  const finished = chat.getByText('Somehow, it clicks open.');
  await expect(heroic.or(finished)).toBeVisible();
  if (await heroic.isVisible()) await heroic.getByRole('button', { name: 'Keep the result' }).click();
  await expect(finished).toBeVisible();
  await expect(chat.getByText(/vs DC 25/)).toBeVisible();
});

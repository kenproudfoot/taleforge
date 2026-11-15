# Writing a TaleForge campaign

A campaign is **one folder with exactly five markdown files**, plus an optional `assets/` folder. Each file
starts with YAML front matter (structured data between two `---` lines) followed by prose. You can write a
pack by hand, or have Claude write one with the [copy-paste prompt](#copy-paste-prompt-for-claude) below.

```
my-campaign/
├─ campaign.md   manifest, overview, opening scene, acts and beats, endings, theme, audio map
├─ world.md      locations (with image prompts), factions, lore, tone
├─ cast.md       NPCs and enemies with stat blocks, looks, tactics, history
├─ rules.md      archetype re-skins and campaign-specific rules
├─ secrets.md    twists and hidden truths, each with a reveal condition
└─ assets/       optional: key-art.jpg, music/*.ogg
```

The complete worked example is [`public/content/campaigns/the-sunken-crown`](../public/content/campaigns/the-sunken-crown).
Read it alongside this guide.

## Checking and importing a pack

- **In the app:** Campaign library → drag the folder or a `.zip` of it onto *Import a campaign*. Problems are
  listed with the file, line, field and a suggested fix. Imported packs are stored in your browser.
- **From the command line** (if you have the repo): `npm run validate:campaigns -- path/to/my-campaign`.
  To bundle a pack with the app, put the folder in `public/content/campaigns/` and run `npm run build`.

Errors block an import. Warnings do not, but they usually point at something worth fixing.

## General rules

- **Ids** use lowercase letters, digits and hyphens: `the-causeway`, `captain-varr`. Ids must be unique within
  their list. The folder name must equal the campaign `id`.
- **Quote** any YAML text containing `:` or `#`, and always quote hex colours: `accent: "#c9a227"`.
- Unknown fields are reported as errors, so a typo such as `tagline2:` is caught instead of ignored.
- The Dungeon Master is an AI that reads all five files. Write prose **to the DM**: say what happens, what the
  players can discover, and what success and failure lead to. Keep each section short; the DM improvises well.
- A 45-minute session comfortably holds **3 acts and 6-8 beats**. More than that will not fit.

---

## 1. `campaign.md`

```yaml
---
id: the-sunken-crown            # must match the folder name
title: The Sunken Crown
genre: medieval-fantasy         # free text; picks the card illustration (fantasy / noir / space / other)
era: The storm-bitten coast of Velmar, an age of swords and old oaths
tagline: One sentence that sells the adventure.      # max 160 characters
players: 1-4                    # a number or range within 1-4
target_minutes: 45              # 15-120; drives pacing
content_rating: PG-13           # G, PG, PG-13 or R (default PG-13)
art_style: "painterly 3D fantasy, cold sea-greens and tarnished gold, mist, lantern glow"
theme:
  accent: "#d9b45a"             # highlight colour
  background: "#0c1316"         # page background (kept dark automatically)
  display_font: Cinzel          # Cinzel, Limelight, Orbitron, Spectral or Inter
  bubble: parchment             # parchment, smoke, glass or plain
audio:                          # optional; any mood left out uses the app's default track
  title: bundled:fantasy-title          # a bundled track id...
  combat: assets/music/boss-fight.ogg   # ...or a file in this pack
goal: { text: "What the party must achieve.", milestones: 5 }   # milestones fill the progress bar
opening_location: brinewick     # optional; a location id from world.md (default: the first location)
key_art: assets/key-art.jpg     # optional; shown on the campaign card
acts:
  - { id: act1, title: "The Dead Tide", minutes: 12, beats: [brinewick-at-dusk, the-causeway] }
  - { id: act2, title: "The Drowned City", minutes: 18, beats: [gate-of-bells, varrs-bargain, the-reliquary] }
  - { id: act3, title: "The Sunken Crown", minutes: 15, beats: [throne-of-tides, the-turning-tide] }
endings: [the-bell-rings, a-new-warden, lost-to-the-deep]
hooks:                          # backstory hooks offered during character creation
  - "Elder Maren pulled you from the surf as a child. You owe her a life."
---
## Overview
The premise, the stakes, the tone. What is really going on, in plain terms.

## Opening
The first scene the DM narrates: where, when, what the party sees, who speaks to them, what they are asked.

## Beats
### brinewick-at-dusk
One `###` section per beat id listed in `acts`. Say what happens, what can be discovered, which checks make
sense (stat and DC), and what completes the beat. Mention when to mark a milestone.

## Endings
### the-bell-rings
One `###` section per ending id. Finish each with "Outcome: victory", "bittersweet" or "defeat".
```

Moods for `audio` are: `title`, `exploration`, `tension`, `combat`, `calm`, `mystery`, `triumph`, `defeat`.
Act `minutes` should add up to roughly `target_minutes`.

## 2. `world.md`

```yaml
---
tone: Eerie, wet and melancholy. A ghost story told by lantern light.
locations:
  - id: brinewick
    name: Brinewick Shingle
    image_prompt: "a storm-worn fishing village at dusk on a pebble beach, villagers holding lanterns..."
    music_mood: calm            # one of the eight moods
    connects: [causeway]        # optional; ids of places reachable from here (used to pre-paint scenes)
factions:                       # optional
  - { id: wreckers, name: Varr's Wreckers, summary: "A salvage crew here for one last score." }
---
## Lore
History and how the world works. A few paragraphs.

## Locations
### brinewick
One `###` section per location id: what the party finds there.
```

`image_prompt` is what the scene painter draws. Describe the place, not the story: architecture, light,
weather, one or two striking details. The campaign's `art_style` is added automatically.

## 3. `cast.md`

```yaml
---
cast:
  - id: tide-wight
    name: Tide-Wight
    role: enemy                 # ally, neutral, enemy or boss
    look: "a drowned sailor in rotted oilskins, eyes like wet pearls, dragging a rusted boat-hook"
    hp: 9
    defense: 11                 # party attacks must meet or beat this
    attacks: [{ name: Boat-hook, bonus: 3, damage: 1d6+1 }]   # required for enemy and boss
    abilities: ["Shies from bells and bright fire"]            # optional, free text
    tactics: "Blocks the way rather than kills. Retreats below half hit points."
    history: "The dead of eighty years of wrecks."
    stats: { DEX: 2 }           # optional modifiers for checks and saves
    voice: gravelly old sailor  # optional hint for the narrator's voice casting
---
### tide-wight
Optional `###` notes per cast id: how to play them.
```

Guidelines for a party of 1-4 starting characters (16-22 HP, Defense 10-14, attack +5, damage about 7):

| Role | HP | Defense | Attack bonus | Damage |
|---|---|---|---|---|
| Minion | 6-10 | 11-12 | +3 to +4 | 1d6+1 |
| Tough enemy | 16-24 | 13-14 | +5 | 1d8+2 |
| Boss | 36-50 | 14-16 | +6 | 1d10+3 |

Include at least six entries and one `boss`. `look` feeds the portrait painter.

## 4. `rules.md`

```yaml
---
archetype_skins:                # rename the eight roles for your genre; any left out keep their core name
  bruiser:
    name: Knight
    flavor: A sworn sword of the old kingdom.
    gear: [Longsword or war-axe, Shield and mail, Oilskin cloak]
    ability_name: Shield Wall                       # optional
    ability_flavor: You plant your feet and take the blow meant for another.   # optional
  # infiltrator, sharpshooter, mystic, scholar, face, medic, tinkerer
resources:                      # optional trackers the DM adjusts during play
  - { id: tide, name: Tide, scope: party, max: 6, start: 6, description: "Hours of low tide left." }
extra_rules:                    # optional
  - { id: deep-water, name: Deep Water, text: "Fighting in water above the waist imposes disadvantage on STR and DEX checks." }
permadeath: false
---
## Campaign rules
The same rules explained to players in a few short paragraphs.
```

Skins change names and flavor only. Mechanics (stats, hit points, weapon die, signature effect) come from the
core archetypes and never change. `scope: party` resources are shared; `scope: character` gives each
character their own.

## 5. `secrets.md`

```yaml
---
secrets:
  - id: the-bargain
    title: The king drowned his own city
    reveal_when: The party reads the steward's ledger, or the king tells them himself.
---
### the-bargain
One `###` section per secret id with the hidden truth. The DM sees these but is told never to reveal one
until its `reveal_when` condition has happened in play.
```

## `assets/` (optional)

- `key-art.jpg` (or `.png`, `.webp`, `.svg`): the campaign card image, ideally 16:10 and at least 1280 px wide.
- `music/*.ogg` (or `.mp3`, `.m4a`, `.wav`, `.opus`): tracks referenced from `audio`. They should loop cleanly.
- The whole folder must stay under 80 MB.

---

## Copy-paste prompt for Claude

Paste this into a chat with Claude, change the first paragraph, and save the five files it writes into a
folder named after the campaign id.

````text
Write a TaleForge campaign pack for: a 40-minute Western ghost story for 2-3 players, tone eerie but warm,
content rating PG-13.

TaleForge is a web app where an AI Dungeon Master runs a short tabletop RPG aloud for 1-4 players. Output
exactly five files, each in its own fenced code block labelled with its filename: campaign.md, world.md,
cast.md, rules.md, secrets.md. Each file is markdown with YAML front matter. Follow this format exactly;
unknown fields are errors.

RULES OF THE GAME (for balance): light d20. Six stats (STR DEX CON INT WIS CHA), modifiers -1 to +3. Checks
are d20 + stat (+2 if proficient) against DC 10 easy / 13 moderate / 16 hard / 19 heroic. Party characters
have 16-22 HP, Defense 10-14, attack bonus about +5 and deal about 7 damage. Minions: 6-10 HP, Defense 11-12,
attack +3 or +4, damage 1d6+1. Tough enemies: 16-24 HP, Defense 13-14, attack +5, damage 1d8+2. Boss: 36-50
HP, Defense 14-16, attack +6, damage 1d10+3.

GENERAL: ids are lowercase letters, digits and hyphens. Quote YAML text containing ":" or "#". Quote hex
colours. Write prose to the Dungeon Master, briefly: what happens, what can be discovered, which stat and DC
fit, what success and failure lead to. 3 acts, 6-8 beats in total, act minutes adding up to target_minutes.

campaign.md front matter fields:
  id, title, genre, era, tagline (max 160 chars), players (e.g. 1-4), target_minutes, content_rating
  (G, PG, PG-13 or R), art_style (a quoted style prompt for the image painter),
  theme: { accent: "#rrggbb", background: "#rrggbb" (dark), display_font: Cinzel | Limelight | Orbitron |
  Spectral | Inter, bubble: parchment | smoke | glass | plain },
  goal: { text, milestones (3-6) }, opening_location (a location id),
  acts: list of { id, title, minutes, beats: [beat ids] }, endings: [ending ids] (2-3),
  hooks: 3-4 one-sentence backstory hooks addressed to "you".
campaign.md body: "## Overview", "## Opening" (the first scene to narrate), "## Beats" with one
  "### <beat-id>" section per beat, "## Endings" with one "### <ending-id>" section per ending, each ending
  with "Outcome: victory", "Outcome: bittersweet" or "Outcome: defeat".

world.md front matter: tone; locations: list of { id, name, image_prompt (quoted: describe the place
  visually), music_mood (title | exploration | tension | combat | calm | mystery | triumph | defeat),
  connects: [location ids] }; factions: list of { id, name, summary }. 5-7 locations.
world.md body: "## Lore", then "## Locations" with one "### <location-id>" section each.

cast.md front matter: cast: list of { id, name, role (ally | neutral | enemy | boss), look (quoted visual
  description), hp, defense, attacks: [{ name, bonus, damage (dice such as 1d6+1) }] (required for enemy and
  boss), abilities: [short strings], tactics, history, stats: { STAT: modifier } (optional), voice (optional
  short voice description) }. At least 6 entries including exactly one boss.
cast.md body: optional "### <cast-id>" notes on how to play the important characters.

rules.md front matter: archetype_skins with all eight keys (bruiser, infiltrator, sharpshooter, mystic,
  scholar, face, medic, tinkerer), each { name, flavor, gear: [3 items], ability_name, ability_flavor };
  resources: optional list of { id, name, scope (party | character), max, start, description };
  extra_rules: optional list of { id, name, text }; permadeath: false.
rules.md body: "## Campaign rules" explaining the extra rules to players.

secrets.md front matter: secrets: list of { id, title, reveal_when }. 3-5 secrets, at least one a real twist.
secrets.md body: one "### <secret-id>" section per secret with the hidden truth.

Make it a complete, playable adventure with a clear goal, a memorable antagonist with an understandable
motive, at least one scene that can be solved without fighting, and a final choice that leads to the
different endings.
````

After Claude answers, save each block as a file, drop the folder into the Campaign library, and fix anything
the validator reports (you can paste its messages straight back to Claude).

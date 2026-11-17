# Audio provenance

Every audio file that ships with TaleForge is listed here. No file comes from a third-party library.

## Owner-supplied music

Created by the TaleForge project owner with [Suno](https://suno.com) and supplied for this project. The
original files carried Suno's metadata (`made with suno`, creation time and song id, below). They were
re-encoded from Opus to AAC (128 kbps) with `npm run import:music` so that every browser can play them; the
music itself is unchanged. Rights are governed by the owner's Suno account terms; anyone forking TaleForge
should replace these with music they hold the rights to (see the README, "Replacing music").

| File | Title | Suno id | Created (UTC) |
|---|---|---|---|
| `music/owner-soft-brushed-pulse.m4a` | Soft Brushed Pulse | 2a6b81c3-05f5-4e6d-ae2f-673ed4002591 | 2026-11-15 01:48 |
| `music/owner-vast-unfamiliar-world.m4a` | Vast Unfamiliar World | 86b91708-f7a1-4ee4-80f4-dc801dd282a2 | 2026-11-15 01:44 |
| `music/owner-shadowed-corner.m4a` | Shadowed Corner | bbffaad5-26aa-400d-82c1-0d30715c8669 | 2026-11-15 01:46 |
| `music/owner-modal-pulse.m4a` | Modal Pulse | 507509e3-c7bc-491d-8e73-f3ac4f13d97b | 2026-11-15 01:43 |

## Campaign music: The Light at Point Sur

Created by the TaleForge project owner with Google Gemini and supplied for this project; each original MP3
carried Google's signed C2PA content credentials. They live in the campaign pack at
`public/content/campaigns/the-light-at-point-sur/assets/music/`, turned down 3.9 dB to sit level with the
rest of the soundtrack and re-encoded to AAC (128 kbps); the music itself is unchanged. Rights are governed by
the owner's Google account terms; anyone forking TaleForge should replace these with music they hold the
rights to.

| File | Title | Mood |
|---|---|---|
| `assets/music/Tide-and-Treason.m4a` | Tide and Treason | title |
| `assets/music/Midnight-at-the-Wharf.m4a` | Midnight at the Wharf | exploration |
| `assets/music/Low-Tide-Alibi.m4a` | Low Tide Alibi | tension |
| `assets/music/Saltwater-Standoff.m4a` | Saltwater Standoff | combat |
| `assets/music/Tide-Beneath-the-Boardwalk.m4a` | Tide Beneath the Boardwalk | calm |
| `assets/music/Beneath-the-Wharf.m4a` | Beneath the Wharf | mystery |
| `assets/music/The-Harbor-Clears.m4a` | The Harbor Clears | triumph |
| `assets/music/Saltwater-Requiem.m4a` | Saltwater Requiem | defeat |

## Generated music and sound effects

Composed in code for TaleForge and rendered by `scripts/generate-audio.ts` using the synthesizer in
`scripts/audio/synth.ts` (no samples, no third-party sounds). Rendering is deterministic: running
`npm run generate:audio` on macOS reproduces these files. Released under the same licence as the TaleForge code.

| File | Title | Mood |
|---|---|---|
| `music/fantasy-exploration.m4a` | Over the Moor | exploration (fantasy) |
| `music/fantasy-tension.m4a` | Fog on the Water | tension (fantasy) |
| `music/fantasy-combat.m4a` | Steel at the Gate | combat (fantasy) |
| `music/noir-streets.m4a` | Wet Pavement | exploration (noir) |
| `music/noir-tension.m4a` | Somebody's Watching | tension, mystery (noir) |
| `music/noir-chase.m4a` | Running the Red Light | combat (noir) |
| `music/scifi-exploration.m4a` | Drift | exploration, calm (space) |
| `music/scifi-tension.m4a` | Signal Lost | tension, mystery (space) |
| `music/scifi-combat.m4a` | Hull Breach | combat (space) |
| `music/calm-hearth.m4a` | Hearth | calm |
| `music/triumph-banners.m4a` | Banners | triumph |
| `music/defeat-ashes.m4a` | Ashes | defeat |
| `sfx/dice-1.m4a`, `sfx/dice-2.m4a`, `sfx/dice-3.m4a` | Dice clacks | dice tray |
| `sfx/ui-click.m4a` | Click | interface |
| `sfx/roll-success.m4a`, `sfx/roll-fail.m4a`, `sfx/roll-crit.m4a` | Roll results | roll cards |
| `sfx/stinger-victory.m4a`, `sfx/stinger-defeat.m4a` | Stingers | end of campaign |

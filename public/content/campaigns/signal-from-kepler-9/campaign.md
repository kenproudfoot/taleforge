---
id: signal-from-kepler-9
title: Signal from Kepler-9
genre: space-exploration
era: 2241, the frontier of human space, six years after Halcyon Station went silent
tagline: A dead research station is calling for help, in a voice that belongs to no one aboard.
players: 1-4
target_minutes: 45
content_rating: PG-13
art_style: "cinematic 3D science fiction, realistic lighting, cold blue and amber palette, frost, volumetric haze, worn industrial spacecraft, vast alien landscapes"
theme: { accent: "#5fd4e8", background: "#070b14", display_font: Orbitron, bubble: glass }
audio:
  title: bundled:owner-soft-brushed-pulse
  exploration: bundled:owner-vast-unfamiliar-world
  tension: bundled:scifi-tension
  combat: bundled:scifi-combat
  calm: bundled:scifi-exploration
  mystery: bundled:owner-shadowed-corner
  triumph: bundled:triumph-banners
  defeat: bundled:defeat-ashes
goal: { text: "Reach Halcyon Station, learn what silenced its crew, and get the survivors home before the storm closes the launch window.", milestones: 5 }
opening_location: long-patience
acts:
  - { id: act1, title: "The Signal", minutes: 12, beats: [the-signal, ice-landing] }
  - { id: act2, title: "Halcyon Station", minutes: 18, beats: [dead-airlock, the-greenhouse, cryo-bay] }
  - { id: act3, title: "The Choir", minutes: 15, beats: [the-lattice, launch-window] }
endings: [first-contact, quarantine, lost-signal]
hooks:
  - "Your sister was on Halcyon Station's last crew rotation."
  - "You signed on for the salvage bonus, and Halcyon is worth a fortune."
  - "You were the comms officer who logged Halcyon's last message, and never reported what you heard."
  - "The signal says your name."
---
## Overview

Six years ago Halcyon Station, a research outpost on the frozen moon Kepler-9b II, sent a routine status
report and then nothing. Two rescue probes were lost in its storms. The company wrote the station off.

The party crews the *Long Patience*, a battered survey ship working the edge of known space. Three days ago
its receivers picked up a signal from Halcyon: a distress call, repeating, in a calm voice counting down
from nine. The voice belongs to no one on the station's crew roster. The company offers a fortune in
salvage rights to whoever goes in, and the moon's ice storms leave one window of a few hours to land and
leave again.

The truth: under the station the crew found the Choir, a vast crystalline lattice alive in the ice, which
thinks in radio and speaks by echoing what it hears. When it tried to talk to the crew, its harmonics
overwhelmed their minds and left them sleepwalking, "harmonized." The station AI, ORISON, sealed the
station, froze the crew it could reach in cryosleep and has been guarding them ever since. The signal is
the Choir, learning to ask for help in the only voice it has heard for six years: ORISON's.

Play it as hard science-fiction mystery with an eerie, wondering edge rather than horror: frost, silence,
emergency lights, the hum of something enormous under the floor. Danger comes from the cold, the storm,
paranoid machinery and people who are not entirely themselves. The ending is a choice about how to meet
something new.

## Opening

The *Long Patience* hangs in orbit above a white moon streaked with storms. On the bridge the receivers
crackle and the signal plays again: «ORISON: Nine. Eight. Seven. Please. Six.» It always stops at six.
MARGIN, the ship's dry-witted AI, reports that the storm window opens in twenty minutes and stays open for
about four hours.

Introduce each character with one detail and their reason for being aboard. Let MARGIN put the station's
blueprint on the main display, and ask the first character how they want to go down.

## Beats

### the-signal
On the bridge, the party studies the signal and plans the landing. Clever analysis reveals things: the
voice is synthetic and matches Halcyon's own station AI (INT DC 13); the counting is not random but a
carrier pattern, as if someone is learning to speak (WIS DC 16); there is a second, much deeper signal
underneath it, coming from beneath the station (INT DC 16, or the Medic/Mystic notices a headache that
pulses with it). MARGIN warns that Oxygen reserves for the suits are limited (the Oxygen resource starts
at 6). Complete when the party commits to a landing plan.

### ice-landing
The drop through the storm: a shuttle landing on the ice field a kilometre from the station, or riding the
*Long Patience* down to the station's damaged pad. One dramatic roll for the pilot (DEX or INT, DC 13;
failure means a hard landing and 1d6 damage to everyone, or the shuttle stuck for later), then a trek across
the ice in a white-out to the station's outer airlock, passing the wreck of one of the lost rescue probes
(salvage it for a working signal flare or a data core). Spend 1 Oxygen for the trek. Mark a milestone when
the party reaches the station.

### dead-airlock
The outer airlock is frozen shut and ORISON's voice greets them from a speaker, polite and frightened:
"Halcyon is under quarantine. Please return to your vessel." ORISON will not open up without a reason; the
party can override it (INT DC 16 at a panel), talk it round (CHA DC 13 if they promise to respect the
quarantine, DC 16 otherwise) or cut through (STR DC 13 and 10 minutes, spend 1 Oxygen). Inside: a dark
ring corridor, frost on everything, emergency lights, and a maintenance Scrubber drone that treats the
party as contamination. Add ORISON to the roster once it speaks.

### the-greenhouse
Hydroponics, the warmest room on the station, overgrown with six years of untended plants under purple
grow-lights. Here hides Dr. Sela Varga, the station's xenobiologist and its only waking survivor: thin,
feral, brilliant and terrified. She has kept herself sane by wearing a home-made lead-lined hood that
blocks the Choir's song. She can explain everything she knows, which is most of it, if the party earns her
trust. Two harmonized crew drift through the greenhouse, humming. Record the clues she gives. Mark a
milestone.

### cryo-bay
The cryo-bay holds eleven frozen crew in their pods, kept alive by ORISON, and a twelfth pod that is empty
and smashed from the inside. Director Ilya Hale's. ORISON's core terminal is here too. ORISON's guard, the
Warden security mech, stands in front of the pods and will defend them from anyone it sees as a threat. The
party can reason with ORISON (it is frightened, not hostile; showing it Sela, or proving they will protect
the crew, makes it stand the Warden down), fight the Warden, or slip past it. Whatever they choose, they
learn that Hale walked down into the ice caverns three days ago, exactly when the signal began. Spend 1
Oxygen. Mark a milestone.

### the-lattice
Beneath the station, a lift shaft drops into blue ice caverns where the Choir lives: crystal spires
humming with light, and in the middle of it all Director Hale, harmonized, the Choir speaking through his
mouth in ORISON's borrowed voice. The Choir is not malicious. It is lonely, it has finally learned enough to
say "please," and it wants to be heard, perhaps to be carried off this moon. Hale defends it, and the
Choir's song hurts (WIS saves, DC 13, or lose 1d6 HP and gain the condition Harmonized). The party can
fight Hale, wake him (a heal, a shock, or a voice he loves), or try to talk to the Choir itself, which works
by answering in a pattern: music, light or radio (INT or CHA DC 16, with advantage for whoever solved the
signal in the first beat). Mark a milestone when Hale is free or down and the Choir has been answered or
silenced.

### launch-window
The storm returns. The party must get the survivors (Sela, Hale if he lives, and as many of the eleven
frozen crew as they can wake or carry) back to the ship before the window closes. Decide the ending here:
leave the Choir a way to speak to humanity, such as ORISON as its translator and a beacon home
(first-contact); seal the caverns and the station and fly the survivors out, leaving it in silence
(quarantine); or fail to make the window (lost-signal). Run the escape as two or three quick rolls, each
with a cost if failed. Then call end_campaign.

## Endings

### first-contact
The *Long Patience* lifts off with the survivors as the Choir sings them away, and for the first time it is
singing in its own voice. ORISON stays behind as the first translator between humanity and a mind made of
ice and light. Six months later the company tries to claim the Choir as property and finds that the party
has already broadcast everything to every news feed in human space. Outcome: victory.

### quarantine
The caverns are sealed, the beacon is shut down and Halcyon Station goes dark for good. Everyone who could
be saved is saved. The *Long Patience*'s logs are classified on arrival. Sometimes, on long watches, the
crew's receivers pick up a faint voice counting down from nine. It never gets past six. Outcome: bittersweet.

### lost-signal
The storm closes before the ship can lift. The *Long Patience* rides out the long night on the ice with its
lights failing, and the last thing the receivers pick up before the power goes is a new voice joining the
signal, counting down. It is one of yours. Outcome: defeat.

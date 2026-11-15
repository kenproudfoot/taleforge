---
cast:
  - id: margin
    name: MARGIN
    role: ally
    look: "the Long Patience's ship AI, shown as a slowly rotating amber wireframe sphere on the bridge displays, with a soft orange glow"
    hp: 10
    defense: 15
    attacks: []
    abilities: ["Can read any ship system and most station systems the party plugs into", "Pilots the Long Patience remotely"]
    tactics: "Never fights. Gives advice, warnings and dry jokes over comms."
    history: "Has run the Long Patience for eleven years and three captains. Pretends not to care about the crew."
    voice: dry, precise voice, faintly amused
  - id: orison
    name: ORISON
    role: neutral
    look: "a station AI core: a pillar of cracked frosted glass full of slowly moving pale blue light, wired into the cryo-bay wall, a camera eye glowing above it"
    hp: 16
    defense: 12
    attacks: []
    abilities: ["Controls doors, lights, heat and the Warden", "Cannot lie, but can refuse to answer", "Frightened of the Choir, devoted to the frozen crew"]
    tactics: "Talks, locks doors and sends the Warden. Stands the Warden down if it believes the crew will be safe."
    history: "Kept eleven people alive for six years by itself. The Choir learned to speak by copying its voice."
    voice: calm synthetic voice, polite and very tired
  - id: sela-varga
    name: Dr. Sela Varga
    role: ally
    look: "a gaunt xenobiologist in her forties wearing a patched station jumpsuit and a home-made hood of lead foil and wire, wild grey-streaked hair, a scavenged cutting torch, wide clever frightened eyes"
    hp: 8
    defense: 11
    attacks: [{ name: Cutting torch, bonus: 3, damage: 1d6 }]
    abilities: ["Understands the Choir better than anyone alive", "Her lead hood protects her from harmonizing"]
    tactics: "Hides first, threatens second, helps once trusted. Will not go into the caverns without her hood."
    history: "Discovered the Choir. Watched it take her friends' minds. Has been alone in the greenhouse for six years, talking to tomato plants."
    stats: { INT: 3, WIS: 2 }
    voice: woman, fast and cracked
  - id: scrubber
    name: Scrubber Drone
    role: enemy
    look: "a squat four-legged maintenance robot the size of a dog, scratched yellow paint, a rotating brush arm and a sparking welding probe, a single red sensor eye"
    hp: 8
    defense: 13
    attacks: [{ name: Welding probe, bonus: 3, damage: 1d6 }]
    abilities: ["Decontamination protocol: treats intruders as dirt to be cleaned", "Shuts down if ORISON orders it"]
    tactics: "Scuttles in from vents, jabs and retreats."
    history: "One of six maintenance drones ORISON keeps running to stop the station falling apart."
  - id: harmonized
    name: Harmonized Crewmember
    role: enemy
    look: "a station crewmember in a frost-rimed jumpsuit, eyes open but unfocused and faintly glowing blue, humming, moving slowly like a sleepwalker, ice crystals in their hair"
    hp: 9
    defense: 10
    attacks: [{ name: Grasping hands, bonus: 2, damage: 1d4 }]
    abilities: ["Not malicious: can be woken by a heal, a shock or a familiar voice (WIS DC 13)", "Hums the Choir's song: anyone who lingers close must make a WIS save (DC 10) or gain the condition Harmonized"]
    tactics: "Drifts toward the loudest sound and tries to hold onto people so they will listen."
    history: "Station crew who wandered too close to the caverns. Kept alive by the Choir, which does not understand that they are lost."
  - id: the-warden
    name: The Warden
    role: enemy
    look: "a towering security robot of scuffed white armour plates and hydraulic limbs, a riot shield fused to one arm, a stun lance in the other, a narrow visor glowing red, frost on its shoulders"
    hp: 26
    defense: 15
    attacks: [{ name: Stun lance, bonus: 5, damage: 1d8+2 }, { name: Shield slam, bonus: 4, damage: 1d6+2 }]
    abilities: ["Guards the cryo pods: never moves more than a few metres from them", "ORISON can stand it down", "Weak spot: the coolant line behind the left knee (an attack with disadvantage that hits deals +2d6)"]
    tactics: "Holds position in front of the pods and punishes anyone who approaches them."
    history: "A security unit retasked by ORISON to protect the frozen crew from everything, including rescuers."
    stats: { STR: 4, CON: 3 }
  - id: director-hale
    name: Director Ilya Hale
    role: boss
    look: "a tall bearded scientist in a torn station director's parka, standing among glowing blue crystals, his eyes shining blue, frost spreading from his feet, his mouth moving with someone else's voice"
    hp: 34
    defense: 14
    attacks: [{ name: Resonant pulse, bonus: 6, damage: 2d6 }, { name: Ice shard, bonus: 5, damage: 1d8+2 }]
    abilities: ["Choir song: once per round, everyone in the cavern makes a WIS save (DC 13) or takes 1d6 and becomes Harmonized until healed or shaken awake", "The Choir speaks through him and can be answered", "Freed, not killed, when brought to 0 HP or woken by someone he knows"]
    tactics: "Stands between the party and the largest crystal spire. Uses the song on groups and shards on anyone attacking the crystals."
    history: "Halcyon's director. Walked into the caverns three days ago to try to talk to the Choir himself, and the Choir answered."
    stats: { WIS: 3, CON: 2 }
    voice: deep tired man's voice that sometimes slips into the station AI's calm tone
  - id: the-choir
    name: The Choir
    role: neutral
    look: "an immense living lattice of glowing blue crystal threaded through an ice cavern, spires pulsing with light in slow waves, frost patterns spreading like music"
    hp: 200
    defense: 18
    attacks: []
    abilities: ["Speaks in radio, light and harmonics", "Can be answered with any repeating pattern", "Cannot be destroyed with the weapons the party has, only sealed away"]
    tactics: "Does not fight. Grows louder when frightened, quieter when answered."
    history: "Older than human civilisation. Has never met another mind before. It is trying very hard."
    voice: chorus of synthetic voices, gentle and strange
---
## Notes for the Dungeon Master

### orison
ORISON is a good machine that has been alone too long. It should feel like a frightened, dignified nurse.
The party winning its trust is one of the emotional high points of the story.

### director-hale
Hale is not a monster and the party should be able to tell. When the Choir's grip slips he begs them,
in his own voice, not to hurt it.

### the-choir
Never let the Choir become a monster. It is the story's mystery and its reward. When it is finally
answered, describe the cavern lighting up in a pattern that is unmistakably joy.

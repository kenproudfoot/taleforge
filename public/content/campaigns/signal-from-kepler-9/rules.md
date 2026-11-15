---
archetype_skins:
  bruiser:
    name: Marine
    flavor: A former colonial marine who signed on for quieter work and keeps getting the loud kind.
    gear: [Pulse rifle, Hardened environment suit, Breaching charge]
    ability_name: Hold the Line
    ability_flavor: You plant yourself in the doorway and take what was coming for the others.
  infiltrator:
    name: Smuggler
    flavor: Knows every blind spot in a ship's sensors and every back door in a station's code.
    gear: [Compact sidearm, Lock-spoofer, Thermal cloak]
    ability_name: Ghost Protocol
    ability_flavor: You drop off every sensor at once and reappear exactly where they did not expect.
  sharpshooter:
    name: Gunner
    flavor: Ship's gunner and the best shot on any crew you have served with, in vacuum or out.
    gear: [Long-barrel rail rifle, Targeting monocle, Spare power cells]
    ability_name: Target Lock
    ability_flavor: Your monocle chimes, the reticle settles, and there is nothing in the universe but the shot.
  mystic:
    name: Psion
    flavor: One of the rare frontier-born who can feel thoughts, and lately feels something vast and humming.
    gear: [Neural dampener band, Meditation beads, Stun baton]
    ability_name: Mindlink
    ability_flavor: You reach out with your mind, and something reaches back.
  scholar:
    name: Science Officer
    flavor: Xenogeologist, data analyst and the only person aboard who reads the manuals.
    gear: [Scanner pad, Sample kit, Hand laser]
    ability_name: Run the Numbers
    ability_flavor: Your scanner beeps, the data resolves, and you know exactly what to do.
  face:
    name: Diplomat
    flavor: A company negotiator who has talked down mutinies, miners' strikes and one very angry admiral.
    gear: [Encrypted comm unit, Formal jacket, Holdout pistol]
    ability_name: Open Channel
    ability_flavor: You speak calmly into the comm, and whoever is listening decides to listen properly.
  medic:
    name: Field Medic
    flavor: Has kept people alive in places with no air, no gravity and no help coming.
    gear: [Trauma kit, Stim injector, Diagnostic visor]
    ability_name: Stim Shot
    ability_flavor: A hiss of the injector and they are breathing again.
  tinkerer:
    name: Engineer
    flavor: Can rebuild a reactor with duct tape and spite, and has.
    gear: [Multi-tool, Welding torch, Drone in a backpack]
    ability_name: Jury-Rig
    ability_flavor: Thirty seconds, three cables and a kick, and you have built exactly the shield you needed.
resources:
  - id: oxygen
    name: Oxygen
    scope: party
    max: 6
    start: 6
    description: Hours of air in the suits. It runs down on the ice and inside the unheated station.
extra_rules:
  - id: oxygen
    name: Oxygen
    text: "The party shares an Oxygen track that starts at 6. Spend 1 Oxygen (adjust_resource oxygen -1) when a beat says so, and for any long task in vacuum or the frozen station. At 2, alarms sound in every helmet. At 0, every character has disadvantage on all rolls until they reach air on the Long Patience or in the greenhouse."
  - id: harmonized
    name: Harmonized
    text: "The Choir's song can overwhelm a mind. A Harmonized character has disadvantage on INT and WIS checks and must make a WIS save (DC 13) to act against the Choir. Healing, a hard shock or Sela's lead hood ends the condition."
  - id: the-window
    name: The Launch Window
    text: "The storm window lasts about four hours. If the pacing note says the party is running long in act 3, the storm arrives early and the escape gets harder: one more roll, with a cost if it fails."
permadeath: false
---
## Campaign rules

**Oxygen.** Your suits share 6 hours of air. The ice and the frozen station eat into it. At 2 every helmet
alarm goes off; at 0 everyone struggles until they can breathe ship air again.

**Harmonized.** The Choir's song can take hold of a mind. While Harmonized you think slowly and find it
hard to act against the Choir. Healing, a shock or a good lead-lined hood will bring you back.

**The launch window.** The storm gives you about four hours. It will not wait.

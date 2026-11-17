---
archetype_skins:
  bruiser:
    name: Ex-Marine
    flavor: Korea taught you how to keep going when everyone else stops. You have not slept well since.
    gear: [Fire axe, Wool pea coat, Flask of bourbon]
    ability_name: Hold the Line
    ability_flavor: You stand in the doorway and nothing, living or dead, gets past you.
  infiltrator:
    name: Drifter
    flavor: A beatnik who hitched down Highway 1 for the poetry and stayed for the quiet. You go where you like.
    gear: [Lock picks in a cigarette tin, Sheepskin jacket, Penlight]
    ability_name: Not Really There
    ability_flavor: You slip through the fog and the shadows, and even the dead lose track of you.
  sharpshooter:
    name: Deer Hunter
    flavor: A Big Sur rancher's kid who can drop a buck at three hundred yards in a crosswind.
    gear: [Lever-action .30-30, Box of shells, Field glasses]
    ability_name: Steady Breath
    ability_flavor: Fog, dark, a moving target. You breathe out, and squeeze.
  mystic:
    name: Psychic
    flavor: Sensitive since childhood. You hear the dead whisper and you hate it, and tonight you cannot turn it off.
    gear: [Rosary or crystal pendant, Battered tarot deck, Transistor radio]
    ability_name: They Speak to Me
    ability_flavor: You open yourself up, and one of the dead tells you something no living person knows.
  scholar:
    name: Reporter
    flavor: Monterey Herald features desk, chasing the haunted-lighthouse story for the anniversary edition.
    gear: [Notebook and pencils, Polaroid camera, Press card]
    ability_name: The Real Story
    ability_flavor: You put the dates and names together, and the whole terrible pattern is suddenly clear.
  face:
    name: Coast Guard Officer
    flavor: A lieutenant from Group Monterey with a clipboard and orders, and a voice people obey.
    gear: [Service .38 revolver, Coast Guard jacket, Station keys]
    ability_name: By Order
    ability_flavor: You speak with the full authority of the service, and the living, and sometimes the dead, fall in line.
  medic:
    name: Country Doctor
    flavor: The only doctor between Carmel and Lucia. You have set bones by lamplight on kitchen tables.
    gear: [Black medical bag, Morphine syrette, Smelling salts]
    ability_name: Stay With Me
    ability_flavor: Pressure on the wound, a calm voice, and they keep breathing because you told them to.
  tinkerer:
    name: Radioman
    flavor: Navy radio school, ten years on ships. If it has a wire or a gear, you can fix it or kill it.
    gear: [Tool roll, Spare vacuum tubes, Coil of copper wire]
    ability_name: Jury-Rig
    ability_flavor: Two wires, a wrench and a prayer, and the machine does what you say.
resources:
  - id: nerve
    name: Nerve
    scope: character
    max: 3
    start: 3
    description: How steady you are. Lose it to horror and to the dead's attention; at zero you must flee the scene or freeze.
  - id: lamp-oil
    name: Lamp Oil
    scope: party
    max: 4
    start: 4
    description: Kerosene for the party's lanterns. In the dark the drowned keepers have advantage against you.
extra_rules:
  - { id: the-beam, name: The Beam, text: "When the lamp is lit, anyone who drops to 0 hit points within its sweep is claimed by the Watch unless an ally reaches them before the end of the next round." }
  - { id: the-fence, name: The Keepers' Fence, text: "The drowned keepers will not cross the picket fence around the keepers' house unless Marrow is with them." }
  - { id: horror, name: Horror, text: "Seeing something truly terrible (a body, a possession, Marrow himself) calls for a WIS save, DC 12 or 14. On a failure, lose 1 Nerve." }
permadeath: false
---
## Campaign rules

**Nerve.** Everyone starts with 3 Nerve. You lose it when the rock shows you something no one should see; you
can spend 1 Nerve to reroll a failed check, or to stand your ground when every part of you wants to run. At
0 Nerve you freeze or flee.

**Lamp oil.** Your lanterns run on kerosene. When the party runs out, the dark belongs to the dead.

**The beam.** Once the lighthouse is lit, falling unconscious in its sweep is very dangerous: reach a fallen
friend fast, or the light keeps them.

**The fence.** The old picket fence around the keepers' house is the one safe line on the rock, as long as
Marrow himself is not walking with the dead.

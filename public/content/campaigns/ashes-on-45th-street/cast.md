---
cast:
  - id: chief-dolan
    name: Fire Chief Tom Dolan
    role: neutral
    look: "a heavyset red-faced fire chief in his fifties, soot-streaked dress uniform and white helmet under his arm, grey moustache, bloodshot eyes, rain dripping from his coat"
    hp: 12
    defense: 11
    attacks: [{ name: Heavy fists, bonus: 2, damage: 1d4+1 }]
    abilities: ["Knows every fire in the city this year", "Breaks down if shown proof the fire was set"]
    tactics: "Will not fight. Shouts for the cops if threatened."
    history: "Twenty-two years on the job. Signed the false report because someone threatened his daughter's job at City Hall."
    stats: { CON: 2, WIS: 1 }
    voice: gruff man, tired and defensive
  - id: ruby-lark
    name: Ruby Lark
    role: ally
    look: "an elegant jazz singer in her late twenties, finger-waved dark hair, sequinned midnight-blue gown, red lipstick, a silver cigarette case, wary sharp eyes"
    hp: 9
    defense: 12
    attacks: [{ name: Derringer, bonus: 3, damage: 1d6 }]
    abilities: ["Knows everyone at the Blue Lantern and what they owe", "Has Evelyn's envelope"]
    tactics: "Talks in alleys, never inside. Shoots only to escape."
    history: "Evelyn's closest friend since finishing school, before Ruby's family lost everything. Sings for Castellane because he pays."
    stats: { CHA: 3, WIS: 2 }
    voice: woman, low and smoky
  - id: vincent-castellane
    name: Vincent Castellane
    role: neutral
    look: "a sleek mob boss in his forties, immaculate grey pinstripe suit, white silk scarf, slicked black hair, a heavy gold signet ring, a calm charming smile that never reaches his eyes"
    hp: 20
    defense: 13
    attacks: [{ name: Pearl-handled revolver, bonus: 5, damage: 1d8+1 }]
    abilities: ["Never alone: two of his men are always within call", "Can be bargained with; always keeps the letter of a deal"]
    tactics: "Talks, smiles, and lets his men do the fighting. Leaves if a fight turns."
    history: "Runs Crane Street. Rented out his torch man to Gordon Hartwell and thinks the client got greedy."
    stats: { CHA: 3, INT: 2, WIS: 2 }
    voice: man, smooth and quiet
  - id: sparks-malone
    name: "\"Sparks\" Malone"
    role: enemy
    look: "a skinny nervous arsonist in his thirties, burn-scarred hands, a flat cap and a too-big raincoat smelling of kerosene, darting eyes, a cigarette always lit"
    hp: 10
    defense: 13
    attacks: [{ name: Switchblade, bonus: 3, damage: 1d4+1 }, { name: Thrown kerosene lamp, bonus: 4, damage: 1d6+1 }]
    abilities: ["Slippery: has advantage on checks to run or hide", "Talks to save his own skin once cornered"]
    tactics: "Runs first. Throws a lamp to start a fire behind him. Surrenders when cornered and bleeding."
    history: "The best torch in the city. Set the Hartwell fire and did not know the watchman was inside. It is the first one he has lost sleep over."
    stats: { DEX: 3 }
    voice: man, quick and wheedling
  - id: dock-tough
    name: Castellane Dockhand
    role: enemy
    look: "a broad-shouldered 1930s longshoreman in a wool cap and rain-slick peacoat, a cargo hook in one hand, a broken nose, a scowl"
    hp: 9
    defense: 11
    attacks: [{ name: Cargo hook, bonus: 3, damage: 1d6+1 }]
    abilities: ["Knows the docks: no penalty for footing on wet planks"]
    tactics: "Blocks the way and grabs. Backs off once the first of them goes down."
    history: "Paid to unload ships and look the other way, and occasionally to do neither."
  - id: leo-brandt
    name: Leo Brandt
    role: enemy
    look: "a tall cold hitman in a black overcoat and fedora, pale face, thin mouth, gloved hands holding a Thompson submachine gun, rain dripping from the brim"
    hp: 18
    defense: 14
    attacks: [{ name: Tommy gun burst, bonus: 5, damage: 2d6 }, { name: Pistol, bonus: 5, damage: 1d8+2 }]
    abilities: ["Suppressing fire: once per fight everyone in the open makes a DEX save (DC 13) or takes 1d6", "Professional: retreats if paid less than the danger is worth"]
    tactics: "Takes cover, sprays the room, and finishes whoever is wounded. Leaves if Gordon falls or the cops arrive."
    history: "Castellane's best gun, on loan to Gordon Hartwell for the night."
    stats: { DEX: 3, WIS: 1 }
    voice: man, flat and quiet
  - id: gordon-hartwell
    name: Gordon Hartwell
    role: boss
    look: "a distinguished silver-haired tycoon in his fifties, black cashmere overcoat over a tuxedo, gold pocket watch chain, an umbrella, a grieving face that slips into contempt"
    hp: 30
    defense: 13
    attacks: [{ name: Silver-headed cane, bonus: 4, damage: 1d6+1 }, { name: Hidden pistol, bonus: 5, damage: 1d8+2 }]
    abilities: ["Money talks: once per scene he offers a bribe; anyone who takes it cannot act against him that round", "Always has a lawyer, a cop or a gunman nearby", "Breaks when shown the ledgers in front of witnesses"]
    tactics: "Buys, then threatens, then hides behind Brandt. If cornered he tries to light the kerosene himself."
    history: "Edmund Hartwell's younger brother. Ran the family fortune into the ground, then into the arson business, and needs Evelyn gone before she turns twenty-five and takes the company back."
    stats: { CHA: 3, INT: 2 }
    voice: older man, warm and polished
  - id: evelyn-hartwell
    name: Evelyn Hartwell
    role: ally
    look: "a determined young heiress of twenty-four, ash-smudged face, torn evening dress under a man's raincoat, bob haircut, rope burns on her wrists, defiant eyes"
    hp: 7
    defense: 11
    attacks: []
    abilities: ["Knows exactly where the ledgers are and what they prove", "Will not leave without the ledgers unless carried"]
    tactics: "Helps however she can: tells the party where guards are, picks up a fallen gun."
    history: "Found her uncle's second set of books, made copies, and was about to take them to a reporter."
    stats: { INT: 2, CHA: 2 }
    voice: young woman, crisp and angry
---
## Notes for the Dungeon Master

### vincent-castellane
Castellane is the most interesting person in the story and should feel like it. He is not the villain of
this case and he knows it. He respects nerve and despises sloppiness, and Gordon has been sloppy. Every
scene with him should end with an offer.

### gordon-hartwell
Gordon is genuinely sad, and genuinely willing to burn a building with his niece inside. Play the first
until the party proves the second. He is never rude; he is a man who has always been able to buy his way
out.

### sparks-malone
Sparks is a coward with a conscience. Watchman Walt Kearney's death is eating him. Any character who
mentions Walt's name gets advantage on getting him to talk.

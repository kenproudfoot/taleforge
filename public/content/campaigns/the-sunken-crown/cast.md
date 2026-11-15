---
cast:
  - id: elder-maren
    name: Elder Maren Holt
    role: ally
    look: "a weathered woman in her seventies, grey braid under an oilskin hood, sea-blue shawl, sharp pale eyes, holding a brass tide-clock on a chain"
    hp: 8
    defense: 10
    abilities: ["Tide-lore: knows the bay, the causeway and the old stories"]
    tactics: "Does not fight. Stays in Brinewick unless the party insists on bringing her."
    history: "Tide-warden of Brinewick, last of the Holt line. Her great-grandfather was the king's steward."
    voice: elderly woman, low and steady
  - id: pip
    name: Pip Tanner
    role: ally
    look: "a skinny boy of twelve with a mop of red hair, oversized patched coat, a lamplighter's pole with a lit lantern, bare muddy feet"
    hp: 6
    defense: 12
    abilities: ["Knows the causeway: the party has advantage on checks to cross it safely while he leads"]
    tactics: "Hides at the first sign of danger and shouts warnings. Turns back at the Gate of Bells unless asked to stay."
    history: "The lamplighter's boy. His father's boat is one of the wrecks in the mud."
    voice: young boy, quick and breathless
  - id: tide-wight
    name: Tide-Wight
    role: enemy
    look: "a drowned sailor in rotted oilskins, skin grey and barnacled, eyes like wet pearls, seawater pouring from its sleeves, dragging a rusted boat-hook"
    hp: 9
    defense: 11
    attacks: [{ name: Boat-hook, bonus: 3, damage: 1d6+1 }]
    abilities: ["Shies from bells and bright fire: it loses its next attack when a bell is rung or a torch is thrust at it", "Dragging grip: on a hit it may pull the target one step toward the mud instead of dealing damage"]
    tactics: "Rises from the silt beside the causeway and tries to block the way rather than kill. Retreats into the mud when it falls below half its hit points."
    history: "The dead of eighty years of wrecks. On a Dead Tide they remember that they were sailors."
  - id: brother-osric
    name: Brother Osric
    role: neutral
    look: "the translucent ghost of a stooped old monk in a salt-stained habit, rope-burned hands, sorrowful kind face, faintly glowing blue-green"
    hp: 10
    defense: 10
    abilities: ["Cannot be harmed by ordinary weapons", "Knows the order of the bells"]
    tactics: "Never fights. Fades if threatened and returns when spoken to gently."
    history: "The last bell-ringer of Tolmere. He rang the alarm on the night of the drowning and has been waiting to ring the all-clear ever since."
    voice: old man, soft and far away
  - id: captain-varr
    name: Captain Isolde Varr
    role: neutral
    look: "a rangy woman of forty with a salt-bleached braid and a scar through one eyebrow, long weather-stained captain's coat, cutlass and a brace of flintlock pistols, tired furious eyes"
    hp: 22
    defense: 14
    attacks:
      - { name: Cutlass, bonus: 5, damage: 1d8+2 }
      - { name: Flintlock pistol, bonus: 5, damage: 1d10 }
    abilities: ["Commanding: her wreckers fight with advantage while she stands", "Yields at 6 hit points or fewer rather than die"]
    tactics: "Bargains first, lies second, fights third. Keeps a pillar between herself and the strongest fighter and uses the pistol before closing with the cutlass."
    history: "Lost her ship, the Kittiwake, and nineteen crew to the bay last winter. Something in the water promised them back for the crown."
    stats: { CHA: 3, DEX: 2, WIS: 1 }
    voice: woman, dry and clipped
  - id: wrecker
    name: Wrecker
    role: enemy
    look: "a burly salvage hand in a tarred jacket and wool cap, crowbar in one fist, hooded lantern at the belt, gold tooth, wary scowl"
    hp: 10
    defense: 12
    attacks: [{ name: Crowbar, bonus: 4, damage: 1d6+2 }]
    abilities: ["Loyal: will not act against Varr, but surrenders if she yields"]
    tactics: "Gangs up on whoever looks weakest. Runs if Varr goes down."
    history: "What is left of Varr's shore crew. They are here because she asked."
  - id: vault-lurker
    name: The Vault Lurker
    role: enemy
    look: "an enormous pale eel as thick as a barrel with blind milky eyes and a mouth of needle teeth, coiling through black water among rusted grilles"
    hp: 18
    defense: 13
    attacks: [{ name: Needle bite, bonus: 5, damage: 1d8+2 }]
    abilities: ["Ambusher: its first attack from under the water has advantage", "Drawn to movement and repelled by bright light held near the surface"]
    tactics: "Strikes whoever is deepest in the water, then circles. Gives up the hunt once its prey climbs out or it loses half its hit points."
    history: "It was a small thing when the crypt flooded. It has had eighty years of treasure-seekers to grow on."
  - id: drowned-king
    name: The Drowned King
    role: boss
    look: "King Aldric of Velmar, a towering drowned monarch in corroded gilded plate armor grown over with coral and weed, a golden crown fused to his pale brow, eyes burning sea-green, a greatsword of black iron, water streaming from him"
    hp: 44
    defense: 15
    attacks:
      - { name: Tide Blade, bonus: 6, damage: 1d10+3 }
      - { name: Crushing wave, bonus: 5, damage: 2d6 }
    abilities: ["Undertow: once per fight every party member makes a STR save (DC 13) or is dragged toward the rift and takes 1d6 damage", "The crown binds him: he cannot leave the crypt", "At half hit points the man surfaces for a moment and can be spoken to"]
    tactics: "Opens with Undertow, then presses the best-armed fighter with the Tide Blade. Uses Crushing wave on anyone standing back. He is fighting against his own arm the whole time, and says so."
    history: "Aldric, last king of Velmar. He traded his city to the Deep to stop a plague, and has kept his side of the bargain every moment since."
    stats: { STR: 4, CON: 3, WIS: 2, CHA: 2 }
    voice: old king, slow and hollow
---
## Notes for the Dungeon Master

### elder-maren
Maren is honest, proud and ashamed in equal parts. She will tell the party everything about the bay and
nothing about her family until someone shows her the ledger or says the steward's name. Then it all comes
out at once.

### captain-varr
Play Varr as the party's mirror: brave, capable and trying to save people she loves. She is wrong about
what the Deep will give her. If the party shows her that, she can become the best ally in the story.

### drowned-king
Aldric speaks in short, formal sentences and treats the party as subjects come to relieve the watch. He is
not cruel. The cruelty belongs to the thing that holds his strings, and when it speaks through him the voice
drops and the water in the rift rises.

---
archetypes:
  - id: bruiser
    name: Bruiser
    summary: The one who stands in front. Hits hard, takes harder.
    stats: { STR: 3, DEX: 0, CON: 2, INT: -1, WIS: 0, CHA: 1 }
    hp_bonus: 6
    defense_bonus: 3
    proficiencies: [STR, CON]
    attack_stat: STR
    weapon_die: 10
    signature:
      name: Stand Fast
      description: Step in front of a blow. The next damage any party member takes is reduced by 8.
      effect: { type: guard, amount: 8 }
    gear: [Heavy weapon, Sturdy armor, Field rations]
    art_hint: broad shoulders, planted stance, heavy weapon held low, scarred armor
  - id: infiltrator
    name: Infiltrator
    summary: Gets in, gets out, and nobody knows until it is too late.
    stats: { STR: 0, DEX: 3, CON: 0, INT: 1, WIS: 1, CHA: 0 }
    hp_bonus: 2
    defense_bonus: 1
    proficiencies: [DEX, INT]
    attack_stat: DEX
    weapon_die: 6
    signature:
      name: Unseen Strike
      description: Vanish from sight for a moment. Your next roll has advantage and +2.
      effect: { type: next_roll, advantage: true, bonus: 2 }
    gear: [Paired blades, Lockpicks, Dark cloak]
    art_hint: lean silhouette, half-crouched, hood or cap shadowing the face, tools at the belt
  - id: sharpshooter
    name: Sharpshooter
    summary: Patient eyes and a steady hand. One shot, well placed.
    stats: { STR: 0, DEX: 3, CON: 1, INT: 0, WIS: 2, CHA: -1 }
    hp_bonus: 3
    defense_bonus: 1
    proficiencies: [DEX, WIS]
    attack_stat: DEX
    weapon_die: 8
    signature:
      name: Deadeye
      description: Take a breath and aim true. Your next hit deals an extra 2d6 damage.
      effect: { type: damage_bonus, dice: 2d6 }
    gear: [Ranged weapon, Ammunition, Spyglass]
    art_hint: ranged weapon raised or slung, one eye narrowed, weathered travelling gear
  - id: mystic
    name: Mystic
    summary: Touches powers other people only whisper about.
    stats: { STR: -1, DEX: 0, CON: 1, INT: 2, WIS: 3, CHA: 0 }
    hp_bonus: 2
    defense_bonus: 2
    proficiencies: [WIS, INT]
    attack_stat: WIS
    weapon_die: 8
    signature:
      name: Beyond the Veil
      description: Produce one clearly uncanny effect that reshapes the scene, such as a ward that holds a door, a light in total darkness, or a brief answer from something that should not speak.
      effect: { type: narrative }
    gear: [Focus or talisman, Worn book of secrets, Chalk and candles]
    art_hint: one hand raised with a faint glow, layered robes or coat, a talisman in plain view, distant gaze
  - id: scholar
    name: Scholar
    summary: Has read about this exact situation, and remembers page and paragraph.
    stats: { STR: -1, DEX: 0, CON: 0, INT: 3, WIS: 2, CHA: 1 }
    hp_bonus: 2
    defense_bonus: 1
    proficiencies: [INT, WIS]
    attack_stat: INT
    weapon_die: 6
    signature:
      name: Flash of Insight
      description: Recall exactly the right fact at the right moment. Your next roll gets +5.
      effect: { type: next_roll, bonus: 5 }
    gear: [Notebook and pencil, Magnifying lens, Concealed sidearm]
    art_hint: notebook or lens in hand, ink-stained fingers, sharp curious eyes, practical clothes with many pockets
  - id: face
    name: Face
    summary: Talks to everyone, charms most of them, and lies to the rest.
    stats: { STR: 0, DEX: 1, CON: 0, INT: 1, WIS: 0, CHA: 3 }
    hp_bonus: 2
    defense_bonus: 1
    proficiencies: [CHA, DEX]
    attack_stat: DEX
    weapon_die: 6
    signature:
      name: Center Stage
      description: Command the room. One character who can be reasoned with gives you a real concession, such as a name, a favor, a door opened or a weapon lowered.
      effect: { type: narrative }
    gear: [Fine clothes, Hidden blade, Letter of introduction]
    art_hint: open confident posture, expressive hands, striking clothes, a knowing half-smile
  - id: medic
    name: Medic
    summary: Keeps everyone breathing, usually while complaining about it.
    stats: { STR: -1, DEX: 1, CON: 1, INT: 2, WIS: 3, CHA: -1 }
    hp_bonus: 3
    defense_bonus: 1
    proficiencies: [WIS, INT]
    attack_stat: DEX
    weapon_die: 6
    signature:
      name: Patch Up
      description: Treat a wound fast. You or an ally heal 1d8+3 hit points, and a Downed ally gets back up.
      effect: { type: heal, dice: 1d8+3 }
    gear: [Medical kit, Light weapon, Smelling salts]
    art_hint: satchel of supplies across the body, sleeves rolled up, calm steady hands, tired kind eyes
  - id: tinkerer
    name: Tinkerer
    summary: Sees every problem as a machine that has not been built yet.
    stats: { STR: 0, DEX: 2, CON: 1, INT: 3, WIS: 0, CHA: -1 }
    hp_bonus: 3
    defense_bonus: 1
    proficiencies: [INT, DEX]
    attack_stat: INT
    weapon_die: 8
    signature:
      name: Just the Thing
      description: Rig up cover or a countermeasure in seconds. The next damage any party member takes is reduced by 6.
      effect: { type: guard, amount: 6 }
    gear: [Toolkit, Custom gadget, Coil of wire]
    art_hint: goggles pushed up on the forehead, tool belt, a half-finished device in hand, scorched gloves
---
# Archetypes

Archetypes are genre-neutral roles. Each campaign re-skins them with its own names, flavor, gear and
ability flavor (see the campaign's `rules.md`), so one set of eight serves every genre. The mechanics
never change: stat array, hit point bonus, proficiencies, weapon die and signature ability.

### bruiser
The one who stands in front. High Strength and Constitution, the best armor and the biggest weapon die.
Pick the Bruiser if you want to protect your friends and settle arguments directly.

### infiltrator
Quick, quiet and clever. Excels at stealth, locks, traps and striking from surprise.
Pick the Infiltrator if you like plans, shortcuts and never being where the enemy is looking.

### sharpshooter
The steady hand at a distance. Sharp senses and a ranged weapon that punishes anything in the open.
Pick the Sharpshooter if you want to spot trouble first and end it before it arrives.

### mystic
Someone who touches the uncanny: magic, spirits, psychic talent, whatever this world calls it.
Pick the Mystic if you want strange powers and stranger answers.

### scholar
The one who knows things. Investigation, history, languages, science and the telling detail.
Pick the Scholar if you love solving the puzzle before anyone else sees it.

### face
The talker. Persuasion, deception, performance and reading a room.
Pick the Face if you would rather win a fight before it starts.

### medic
The healer. Keeps the party on their feet and notices what is wrong with a body, living or dead.
Pick the Medic if you want to be the reason everyone survives.

### tinkerer
The builder and fixer. Machines, gadgets, traps and improvised solutions.
Pick the Tinkerer if you look at a locked door and think about hinges.

---
archetype_skins:
  bruiser:
    name: Knight
    flavor: A sworn sword of the old kingdom, or a village champion who simply never backs down.
    gear: [Longsword or war-axe, Shield and mail, Oilskin cloak]
    ability_name: Shield Wall
    ability_flavor: You plant your feet and take the blow meant for another.
  infiltrator:
    name: Rogue
    flavor: A smuggler, a burglar or a tomb-robber who knows that every old wall has a way through.
    gear: [Paired daggers, Lockpicks and a pry-bar, Dark hooded cloak]
    ability_name: Shadowstep
    ability_flavor: You slip out of the lantern light and strike from where nobody is looking.
  sharpshooter:
    name: Ranger
    flavor: A coast-warden or marsh hunter with a longbow and a long memory for tracks.
    gear: [Longbow and quiver, Hunting knife, Spyglass]
    ability_name: Heartseeker
    ability_flavor: You draw, breathe out, and let the arrow find what it was made for.
  mystic:
    name: Tide-Witch
    flavor: A hedge wizard or sea-priest who bargains with wind and water, carefully.
    gear: [Driftwood staff, Pouch of sea-salt and rune stones, Storm lantern]
    ability_name: Speak to the Tide
    ability_flavor: You speak an old word and, for a moment, water, fog or spirit does as you ask.
  scholar:
    name: Sage
    flavor: A chronicler of the lost kingdom who has waited a lifetime to see Tolmere rise.
    gear: [Satchel of rubbings and maps, Reading lens, Slim dagger]
    ability_name: Lore of Velmar
    ability_flavor: A line from an old chronicle comes back to you at exactly the right moment.
  face:
    name: Bard
    flavor: A travelling singer who knows every ballad about the drowned king, and suspects most are wrong.
    gear: [Lute or fiddle in a waxed case, Rapier, Flask of brandy]
    ability_name: The Old Songs
    ability_flavor: You speak or sing with such conviction that even the dead stop to listen.
  medic:
    name: Healer
    flavor: A village herb-wife, a battlefield surgeon or a gentle priest of the hearth.
    gear: [Healer's satchel, Quarterstaff, Vial of smelling salts]
    ability_name: Mending Hands
    ability_flavor: Warmth returns under your hands and the wound closes as if it thought better of it.
  tinkerer:
    name: Artificer
    flavor: A clockmaker or siege-engineer with a pack full of springs, wire and bad ideas.
    gear: [Tool roll, Clockwork crossbow, Flash-powder charges]
    ability_name: Clever Contraption
    ability_flavor: You unfold something from your pack that has no business working, and it works.
resources:
  - id: tide
    name: Tide
    scope: party
    max: 6
    start: 6
    description: Hours of the Dead Tide left on Maren's tide-clock. When it reaches 0 the sea returns.
extra_rules:
  - id: the-tide-clock
    name: The Tide Clock
    text: "The party shares a Tide track that starts at 6. Spend 1 Tide (adjust_resource tide -1) when a beat says so, and whenever the party takes a long rest, a long detour or fails badly at something slow. At 2 Tide, water starts trickling back and everyone can hear it. At 0 the sea returns: go straight to the final beat."
  - id: deep-water
    name: Deep Water
    text: "Fighting or working in water above the waist imposes disadvantage on STR and DEX checks. Anyone held under makes a CON save (DC 13) each turn or takes 1d6 damage."
  - id: bells-and-fire
    name: Bells and Fire
    text: "The restless dead of the bay shy away from rung bells and bright fire. A character who uses either cleverly gets advantage on a roll against tide-wights, or can avoid a fight with them outright."
permadeath: false
---
## Campaign rules

**The Tide Clock.** Elder Maren's brass tide-clock shows how long the Dead Tide will last. The party has 6
Tide. It ticks down as the night goes on, and when it runs out the sea comes back whether the party is
ready or not. Hurry.

**Deep Water.** Much of Tolmere is still flooded. Wading is slow and fighting in deep water is harder
(disadvantage on STR and DEX checks). Being held under is dangerous.

**Bells and Fire.** The drowned dead cannot abide the sound of a bell or the sight of a bright flame.
Clever use of either can win a fight before it starts.

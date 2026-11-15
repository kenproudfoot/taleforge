---
archetype_skins:
  bruiser:
    name: Ex-Boxer
    flavor: A heavyweight who took one dive too many, now muscle for hire with a soft spot for underdogs.
    gear: [Brass knuckles, Battered trench coat, Flask of rye]
    ability_name: Take the Punch
    ability_flavor: You step into the swing meant for a friend and keep standing.
  infiltrator:
    name: Cat Burglar
    flavor: Society parties by day, other people's safes by night.
    gear: [Lockpick roll in a cigarette case, Soft-soled shoes, Pocket flashlight]
    ability_name: Through the Window
    ability_flavor: You were never in the room, until suddenly you are behind them.
  sharpshooter:
    name: Ex-Army Marksman
    flavor: A veteran of the trenches who can still put a bullet through a playing card at fifty yards.
    gear: [Service .45, Field glasses, Army greatcoat]
    ability_name: One Clean Shot
    ability_flavor: The world goes quiet, the way it did in France, and you squeeze.
  mystic:
    name: Medium
    flavor: A spiritualist who holds séances for grieving widows, and sometimes, unsettlingly, gets an answer.
    gear: [Tarot deck, Silver locket, Planchette]
    ability_name: A Voice from the Other Side
    ability_flavor: Something speaks through you, and it knows a thing no one living told you.
  scholar:
    name: Detective
    flavor: A private eye with a licence, an overdue rent bill and a memory for faces.
    gear: [Notebook and pencil stub, Snub-nosed revolver, Press card that is not quite yours]
    ability_name: It Was You
    ability_flavor: The pieces click together all at once, and you see who did it and how.
  face:
    name: Lounge Singer
    flavor: A voice that fills a club and a smile that opens doors, and a past you do not discuss.
    gear: [Evening gown or dinner jacket, Pearl-handled derringer, Little black book]
    ability_name: The Room Is Yours
    ability_flavor: You start to sing, or just to talk, and every eye turns your way.
  medic:
    name: Doctor
    flavor: A physician who lost the uptown practice and now patches up whoever knocks at the back door.
    gear: [Black medical bag, Morphine syrette, Stethoscope]
    ability_name: Steady Hands
    ability_flavor: Blood on your cuffs, needle and thread, and a voice that tells them they will live.
  tinkerer:
    name: Mechanic
    flavor: Grease to the elbows, can fix a car, a radio or a lock, and can break all three.
    gear: [Toolbox, Battered roadster, Wire and pliers]
    ability_name: Hotwire
    ability_flavor: Two wires, a spark, and suddenly the thing in front of you works for you.
resources:
  - id: nerve
    name: Nerve
    scope: character
    max: 3
    start: 3
    description: How steady you are. Lose it to horror, violence and betrayal; spend it to hold your ground.
  - id: heat
    name: Heat
    scope: party
    max: 5
    start: 0
    description: How much attention the party has drawn from cops and the Outfit. At 5, someone comes for you.
extra_rules:
  - id: nerve
    name: Nerve
    text: "Each character has 3 Nerve. A character loses 1 Nerve (adjust_resource nerve -1) on seeing something terrible or being betrayed. A player may spend 1 Nerve to steady themselves: their next roll has advantage (grant it with request_roll advantage). At 0 Nerve a character has disadvantage on WIS and CHA checks until they spend a quiet scene recovering, which restores 1 Nerve."
  - id: heat
    name: Heat
    text: "The party starts with 0 Heat. Add 1 Heat (adjust_resource heat +1) for gunfire in public, threatening an official, or being seen where they should not be. At 3 Heat, cops start asking questions. At 5 Heat, Castellane's men or crooked police come for the party in the next scene, and the Heat drops to 2."
  - id: midnight
    name: Midnight
    text: "The warehouse on Pier 9 burns at midnight. If the party dawdles in act 2 (pacing running long), Gordon arrives early in the warehouse beat and the fire is already lit."
permadeath: false
---
## Campaign rules

**Nerve.** Everyone starts with 3 Nerve. You lose it when the city shows you its worst, and you can spend
it to steady your hand: spend 1 Nerve for advantage on your next roll. Run out and you are rattled: your
judgement and your charm both suffer until you get a quiet moment.

**Heat.** The more noise the party makes, the more Heat it draws. Gunfire, threats and trespass all add
up. At 3 the cops are asking questions; at 5 somebody comes looking for you.

**Midnight.** The clock is running. The warehouse on Pier 9 is set to burn at midnight.

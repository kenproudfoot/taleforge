---
tone: Eerie, wet and melancholy. A ghost story told by lantern light, with awe as often as fear, and sorrow under both.
locations:
  - id: brinewick
    name: Brinewick Shingle
    image_prompt: "a storm-worn fishing village at dusk on a pebble beach, villagers holding lanterns, the sea drawn far back revealing black cathedral spires and a pale stone causeway in the tidal mud, wet rooftops, mist"
    music_mood: calm
    connects: [causeway]
  - id: causeway
    name: The Dead Tide Causeway
    image_prompt: "an ancient pale stone causeway crossing dark tidal mudflats at night between walls of fog, shipwrecks and whale bones half sunk in silt, a distant drowned cathedral ahead, one small lantern far away"
    music_mood: tension
    connects: [brinewick, drowned-gate]
  - id: drowned-gate
    name: The Gate of Bells
    image_prompt: "a colossal sea-gate of green corroded bronze set in a barnacle-crusted cathedral wall, three great bells hanging above it, one gold, one iron, one cracked, seaweed draped like banners, a faint ghostly monk seated beneath"
    music_mood: mystery
    connects: [causeway, cathedral-nave]
  - id: cathedral-nave
    name: The Flooded Nave
    image_prompt: "the vast nave of a drowned gothic cathedral, knee-deep in still black water, shattered stained glass, pews tumbled like driftwood, salvage winches and oil lamps set up around a stairway descending under the altar"
    music_mood: tension
    connects: [drowned-gate, reliquary, throne-of-tides]
  - id: reliquary
    name: The Reliquary
    image_prompt: "a low vaulted crypt waist-deep in dark water, rusted iron grilles, a stone lectern with a chained ledger above the waterline, pale light rippling on the ceiling, something long moving beneath the surface"
    music_mood: mystery
    connects: [cathedral-nave]
  - id: throne-of-tides
    name: The Throne of Tides
    image_prompt: "a cavernous crypt of barnacled pillars beneath a cathedral altar, a coral-crusted throne beside a glowing rift in the floor open to the sea, a drowned king seated in corroded royal armor with a golden crown, cold green light"
    music_mood: combat
    connects: [cathedral-nave, bell-tower]
  - id: bell-tower
    name: The Tide Bell
    image_prompt: "the top of a ruined cathedral bell tower open to the night sky, an enormous silent bronze bell without a clapper, the sea rushing back across the mudflats far below, moonlight breaking through storm clouds"
    music_mood: triumph
    connects: [throne-of-tides, causeway]
factions:
  - { id: villagers, name: The People of Brinewick, summary: "Stubborn fisher families who have lost half their village to the sea and will not leave the rest." }
  - { id: wreckers, name: Varr's Wreckers, summary: "A hard-bitten salvage crew loyal to Captain Varr, here for one last score that will set things right." }
  - { id: the-deep, name: The Deep, summary: "The patient, bargaining presence in the bay. It keeps its promises exactly, which is the cruelest thing about it." }
---
## Lore

Velmar was a sea-kingdom, and Tolmere was its jewel: a cathedral city on an island joined to the mainland by
a causeway, famous for its bells. Eighty years ago, in the last year of King Aldric's reign, a plague came by
ship. Within a season half the city was dying. Then, on one night, the island sank into Greywater Bay. The
survivors on the mainland founded Brinewick and told their children that the sea had punished a proud king.

Since then the water has crept inland a little every year. The village keeps a tide-warden, always from the
Holt family, to measure the loss. Once in a generation comes a Dead Tide, an ebb so low that the drowned city
stands clear for a single night. The old people lock their doors on those nights. The bells ring by
themselves.

Magic in Velmar is rare, costly and tied to oaths. A promise made to the sea is binding on both sides.

## Locations

### brinewick
A single street of tarred cottages above a pebble beach, with the drowned foundations of older streets
visible at low water. The whole village is on the shingle tonight. People are frightened but hopeful, and
they will press small gifts on the party: a lantern, a coil of rope, a flask of something fierce.

### causeway
A mile of pale stone, wide enough for a cart, slick with weed. Fog stands in walls on both sides. Wrecks lie
in the mud where the bay took them, and the newest is a salvage brig with its back broken: Varr's old ship,
the Kittiwake. The dead from the wrecks do not rest on a Dead Tide.

### drowned-gate
The cathedral's sea-gate, sealed from the inside on the night of the drowning. The carvings on the bronze
show the tide in three panels: water leaving under an iron moon, still water under a broken moon, water
returning under a golden sun. The three bells above are the lock.

### cathedral-nave
A forest of pillars rising from black water. Sound carries strangely. Varr's crew have set up lamps and a
winch at the altar steps, and their voices echo long before they can be seen. A side chapel has a fresh hole
blasted through its wall.

### reliquary
The cathedral's treasury and record room, flooded to the waist. Most of the treasure is gone to rust. What
matters is the steward's ledger on its lectern and the oilcloth bundle hidden in the lectern's base.

### throne-of-tides
Not a throne room but a crypt: the king had his throne carried down here at the end. A rift in the floor
opens straight to the sea, and the water in it rises and falls like breathing. This is where the bargain was
made and where it is still being kept.

### bell-tower
The great Tide Bell of Tolmere hangs here without its tongue, which the king's steward removed so the bell
could never ring the bargain undone. From the top the party can see the whole bay, and the white line of the
returning sea.

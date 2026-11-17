---
tone: Cold, lonely and patient, then sudden and brutal. A 1960s ghost story told in fog, where the dead are polite until they are not.
locations:
  - id: the-gate
    name: The Gate off Highway 1
    image_prompt: "a locked chain-link Coast Guard gate beside a two-lane coastal highway at dusk in thick fog, a 1960s station wagon with headlights on, a sandbar disappearing into grey mist toward the dark silhouette of a huge rock, no light on the lighthouse"
    music_mood: tension
    connects: [the-sandbar]
  - id: the-sandbar
    name: The Sandbar and the Old Barn
    image_prompt: "a long sandy tombolo leading to a towering 361-foot black volcanic rock in fog, a weathered wooden barn, an overturned 1950s Coast Guard jeep in the sand, dark streaks on the sand, waves breaking on both sides"
    music_mood: exploration
    connects: [the-gate, the-cliff-road]
  - id: the-cliff-road
    name: The Cliff Road and the Tramway
    image_prompt: "a narrow road carved into the side of a sheer black sea rock winding upward in fog, an old iron tramway rail beside it with a small cart and a lit lantern, a sheer drop to white surf far below, a ghostly woman in a long Victorian dress on a landing"
    music_mood: tension
    connects: [the-sandbar, the-keepers-house]
  - id: the-keepers-house
    name: The Keepers' House
    image_prompt: "a three-storey sandstone Victorian lighthouse keepers' dwelling on the top of a rock in fog, a broken white picket fence, a 1950s kitchen inside lit by a single yellow bulb, a barricaded door, a child's doll on the stairs"
    music_mood: mystery
    connects: [the-cliff-road, the-blacksmith-shop, the-fog-signal, the-tower]
  - id: the-blacksmith-shop
    name: The Blacksmith Shop and Log Room
    image_prompt: "a dim stone blacksmith and carpenter shop on a lighthouse station, an old anvil and forge, shelves of leather-bound lighthouse logbooks back to 1889, one open logbook with a handwritten list of names, a kerosene lamp, fog pressing at a small window"
    music_mood: mystery
    connects: [the-keepers-house]
  - id: the-fog-signal
    name: The Fog Signal and the Overlook
    image_prompt: "a sandstone fog-signal building with a great brass horn on a cliff edge above the Pacific at night, an iron railing, fog over black water where an airship fell, the faint translucent figure of a 1930s Navy sailor standing in the air beyond the rail"
    music_mood: calm
    connects: [the-keepers-house, the-tower]
  - id: the-tower
    name: The Lantern Room
    image_prompt: "inside the lantern room of a 19th-century lighthouse, an enormous first-order Fresnel lens of glass prisms and brass glowing red and white, a dark iron spiral stair, storm windows streaming with fog, blood smeared on the brass, a cold beam sweeping out into the night"
    music_mood: combat
    connects: [the-keepers-house, the-fog-signal]
factions:
  - { id: the-watch, name: The Watch, summary: "Every soul who has died in the sweep of the Point Sur beam, bound to the rock and made to stand Silas Marrow's watch." }
  - { id: the-garritys, name: The Garrity Family, summary: "The last Coast Guard keeper's family on the rock: Hollis, Lorraine and nine-year-old Dottie." }
---
## Lore

Point Sur is a volcanic rock 361 feet high at the end of a sandbar on the Big Sur coast. Its first-order
Fresnel lens, made in Paris in 1887 and carried around Cape Horn, was lit on 1 August 1889. A falling weight
in the tower turns the lens; the light flashes red and white, and in fog the steam signal sounds every
thirty-five seconds. For half a century the station had no road: keepers' families lived on the rock behind a
picket fence that stopped children falling, a teacher lived in to school the children, and the supply ship
came every few months. The steamer Ventura ran aground just north of the point in 1875 before there was any
light at all. Highway 1 only reached the station in 1937.

On 12 February 1935 the Navy's great airship USS Macon, 785 feet long and carrying fighter planes inside her,
lost her upper fin in a squall off Point Sur and settled tail-first into the sea, watched by the keeper on the
rock. Eighty-one of her crew were pulled from the water. Two men died: Radioman First Class Ernest Edwin
Dailey, who jumped while the ship was still too high, and Mess Attendant First Class Florentino Edquiba, who
drowned swimming back into the wreck for his belongings. The wreck lies 1,500 feet down, somewhere below the
beam.

People have always said the station is haunted: a woman in a long skirt on the keepers' stairs, a keeper in
an 1800s uniform, a cook called Ruth who shuts the kitchen doors, children's voices. In this story they are
all real, and they all belong to Silas Marrow.

In 1965 the station is run by the Coast Guard with a keeper and an assistant. Everyone knows the Coast Guard
is automating lights up and down the coast. Point Sur will be next.

## Locations

### the-gate
A locked Coast Guard gate off Highway 1, which is closed to the north by a rockslide. Ray Delgado waits in
the ditch. Nothing living will come down the highway tonight.

### the-sandbar
The sandbar out to the rock, the old barn where hay for the station's horses was once stored, and the
station jeep on its side with a long dark smear leading toward the surf. Footprints that go out to the
water's edge and do not come back.

### the-cliff-road
The road blasted into the rock face in 1900, switching back up toward the summit, with the old tramway rail
beside it. The tramway car moves by itself. Ada Marrow stands on the landing where she went over in 1899.

### the-keepers-house
The sandstone dwelling built for three keepers' families, now home to one. The kitchen is 1950s yellow,
with a percolator and a transistor radio that plays only static and, once, a voice saying "now she wants you
to go home". Lorraine and Dottie are barricaded in here. Ruth shuts the doors.

### the-blacksmith-shop
The blacksmith and carpenter shop, with the logbook room behind it. Every log since 1889. Marrow's are in a
locked tin box; the lock is rusted through.

### the-fog-signal
The fog signal building and the overlook rail above the sea where the Macon fell. Edquiba stands beyond the
rail. Ray Delgado's body lies behind the boiler.

### the-tower
The lighthouse tower and lantern room. The lens is taller than a man and weighs over two tons; the clockwork
and its falling weight run down the centre of the tower. From the gallery outside you can see the whole
coast, or nothing at all.

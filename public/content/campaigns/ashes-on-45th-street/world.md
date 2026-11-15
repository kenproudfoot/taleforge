---
tone: Hard-boiled and rain-soaked. Clipped dialogue, neon in puddles, cigarette smoke, people with secrets who are mostly trying to survive. Danger is real but the violence is quick and off-camera; the pressure is moral.
locations:
  - id: hartwell-ruins
    name: The Hartwell Building, 45th Street
    image_prompt: "the smoking burnt-out shell of a six-storey 1930s office building at dawn, black girders, fire hoses in the gutter, police rope line, rain, newsboys, steam rising, wet cobblestones reflecting grey light"
    music_mood: mystery
    connects: [engine-house-12, blue-lantern]
  - id: engine-house-12
    name: Engine House 12
    image_prompt: "a 1930s brick fire station interior, a polished red fire engine, brass pole, rain on tall windows, a cluttered chief's office with a desk lamp and a bottle of whisky"
    music_mood: tension
    connects: [hartwell-ruins, blue-lantern]
  - id: hartwell-penthouse
    name: Gordon Hartwell's Penthouse
    image_prompt: "a lavish art deco penthouse at night, floor-to-ceiling windows over a rainy neon city, marble, gold trim, a grand piano, a fireplace, cold expensive emptiness"
    music_mood: tension
    connects: [hartwell-ruins, pier-9-warehouse]
  - id: blue-lantern
    name: The Blue Lantern
    image_prompt: "a smoky 1930s speakeasy jazz club bathed in blue neon, a five-piece band on a small stage, a singer in a sequinned gown at the microphone, bootleg gin in teacups, a corner booth in shadow"
    music_mood: exploration
    connects: [hartwell-ruins, harbor-docks]
  - id: harbor-docks
    name: The Crane Street Docks
    image_prompt: "rain-lashed 1930s harbour docks at night, stacked crates and cargo nets, a freighter's looming hull, swinging lanterns, wet planks, fog rolling off black water, distant warehouses"
    music_mood: combat
    connects: [blue-lantern, pier-9-warehouse]
  - id: pier-9-warehouse
    name: Pier 9 Warehouse
    image_prompt: "a brick waterfront warehouse at midnight, a rusted rolling door, a single lit office window high up, kerosene cans by the wall, guards with flashlights, rain and harbour fog"
    music_mood: tension
    connects: [harbor-docks, hartwell-penthouse]
factions:
  - { id: castellane-outfit, name: The Castellane Outfit, summary: "Vincent Castellane's organisation: clubs, docks, gambling, and a man for every job, including fire." }
  - { id: hartwell-holdings, name: Hartwell Holdings, summary: "Old money gone rotten. Respectable on the society pages, a slumlord and an insurance fraud underneath." }
  - { id: city-hall, name: City Hall, summary: "Cops, inspectors and councilmen who would all prefer the fire was an accident." }
---
## Lore

The city has no name in the papers that matters; call it what the players like. It is 1931. The banks
have failed, the bread lines run around the block, and Prohibition has made criminals rich and police
cheap. Fires happen a lot this year in the poorer parts of town, always in buildings worth more to
someone burnt than standing. Nobody has connected them, because nobody has wanted to.

The Hartwells built half of downtown two generations ago. Old Edmund Hartwell, Evelyn's father, died last
spring and left the company to his brother Gordon to run until Evelyn turns twenty-five, which would have
been next month.

## Locations

### hartwell-ruins
Wet ash, twisted iron, firemen, police and reporters. The alley behind is where the loading door was
chained and where Evelyn's glove lies. Patrolman Danny Shea guards the rope; he is young and can be
talked to.

### engine-house-12
Chief Dolan's firehouse. His office has twenty years of commendations on the wall and one bad decision in
the desk drawer. The men here liked old Walt Kearney.

### hartwell-penthouse
Forty floors up, all glass and gold. Gordon receives visitors with brandy and sympathy. There is a wall
safe behind a portrait of Edmund Hartwell with the second set of company books in it.

### blue-lantern
Castellane's club on Crane Street. The front is music and gin, the back is an office and a door to the
alley. Ruby Lark sings two sets a night. Sparks Malone drinks at the end of the bar when he is between jobs.

### harbor-docks
A maze of crates, rail spurs and fishing boats, run by Castellane's longshoremen. Good for a chase, bad
for a stranger who does not know the planks are rotten by Pier 6.

### pier-9-warehouse
Brick, three floors, one way in by land and one by water. The ground floor is soaked in kerosene. The
upstairs office has a window over the harbour and Evelyn in a chair.

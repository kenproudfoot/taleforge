---
cast:
  - id: silas-marrow
    name: Head Keeper Silas Marrow
    role: boss
    look: "the ghost of a gaunt 1890s lighthouse keeper in a dark wool uniform with tarnished brass buttons and a peaked cap, grey mutton-chop whiskers, skin like wet paper, eyes reflecting a red and white beam, fog pouring from his coat, holding a brass lamp key"
    hp: 44
    defense: 15
    attacks: [{ name: Brass lamp key, bonus: 6, damage: 1d10+3 }, { name: The cold beam, bonus: 6, damage: 1d8+2 }]
    abilities: ["Cannot be destroyed while the lamp burns and the lens turns: heals 5 at the start of each of his turns", "Commands the drowned keepers; two rise whenever he calls", "Knows the name of everyone who has died within sight of the light"]
    tactics: "Speaks first, always politely, about duty and the rules of the station. Calls the drowned keepers, then strikes whoever goes for the clockwork or the lamp. Hesitates if Ada's name is spoken."
    history: "First head keeper of Point Sur, 1889-1901. Threw his wife Ada from the cliff in 1899 when she tried to leave with the children. Died at the lens in the storm of 1901 and kept his oath that the light would never go out while he lived."
    stats: { WIS: 3, CHA: 2, STR: 2 }
    voice: old man, precise and courteous, a Scots burr gone cold
  - id: hollis-garrity
    name: Boatswain's Mate Hollis Garrity
    role: enemy
    look: "a broad Coast Guard keeper in his late thirties in a stained blue work shirt and dungarees, crew cut, eyes rolled white, hands raw and bloody from polishing brass, holding a fire axe"
    hp: 20
    defense: 13
    attacks: [{ name: Fire axe, bonus: 5, damage: 1d8+2 }]
    abilities: ["Possessed: speaks in Marrow's voice and knows the station's 1890 rules", "Fights the possession for one turn when his wife or daughter calls him by name"]
    tactics: "Guards the lantern room. Will not leave it. Fights to drive people back down the stair, not to chase them."
    history: "A decent keeper who has been on the rock two winters. Marrow chose him as his relief. He has not slept or eaten in three days."
    stats: { STR: 3, CON: 2 }
    voice: man, flat and hoarse, with someone else's words
  - id: drowned-keeper
    name: Drowned Keeper
    role: enemy
    look: "the ghost of a drowned sailor or lighthouse keeper from another decade, translucent grey skin, sea-water streaming from rotted clothes, kelp in its hair, eyes like wet pearls, crawling over a cliff edge"
    hp: 8
    defense: 11
    attacks: [{ name: Grasping cold, bonus: 4, damage: 1d6+1 }]
    abilities: ["Fades through walls and rails", "Flinches from a lit flare and does not follow anyone past the keepers' fence"]
    tactics: "Climbs up from the sea in twos and threes, grabs and drags toward the edge. Stops the moment the lamp goes dark."
    history: "Men and women of the Watch: wrecked sailors, a fallen keeper's child, a fisherman from 1912. Not cruel; obedient."
    stats: { STR: 1 }
    voice: drowned whisper, many voices at once
  - id: ray-delgado
    name: Seaman Ray Delgado
    role: ally
    look: "a skinny nineteen-year-old Coast Guard seaman in a soaked navy peacoat and watch cap, pale grey skin, dark hair plastered to his forehead, shaking, no breath fogging in the cold air"
    hp: 10
    defense: 11
    attacks: [{ name: Flashlight, bonus: 2, damage: 1d4 }]
    abilities: ["Knows every door, key and stair on the station", "Is already dead: blows pass through him, and he cannot cross the keepers' fence once the lamp is lit"]
    tactics: "Will not go first. Will not go into the fog signal building. Tries his best to help."
    history: "Assistant keeper from San Diego, on the rock since the autumn. Hollis broke his neck in the fog signal building two nights ago. He does not know he is dead."
    stats: { DEX: 1, WIS: 1 }
    voice: young man, frightened and earnest
  - id: lorraine-garrity
    name: Lorraine Garrity
    role: ally
    look: "a tough woman in her thirties in a cardigan and slacks, a dark bob gone wild, a Coast Guard flare pistol in both hands, smudged mascara, standing in front of a barricaded 1950s kitchen door"
    hp: 11
    defense: 11
    attacks: [{ name: Flare pistol, bonus: 3, damage: 1d6+1 }]
    abilities: ["Three flares left: a flare drives drowned keepers back", "Her voice can reach Hollis through the possession"]
    tactics: "Protects Dottie above everything. Fires at anything that comes in silent. Will not leave Hollis on the rock unless the party convinces her it is the only way to save Dottie."
    history: "Married Hollis at nineteen, followed him to three lights. Hates this rock and never said so."
    stats: { CHA: 2, WIS: 1 }
    voice: woman, low and steady, close to breaking
  - id: dottie-garrity
    name: Dottie Garrity
    role: neutral
    look: "a nine-year-old girl in a flannel nightgown and saddle shoes, pigtails, holding a rag doll, serious dark eyes, completely unafraid"
    hp: 4
    defense: 10
    abilities: ["Sees the dead plainly and talks to them", "Knows Ruth, the wet man and the man with the brass buttons"]
    tactics: "Hides, wanders off toward the ghosts she likes, and tells the truth."
    history: "Has played with the ghosts of the rock since the day she arrived and thought everyone could see them."
    voice: little girl, matter-of-fact
  - id: florentino-edquiba
    name: Florentino Edquiba
    role: ally
    look: "the translucent ghost of a young Filipino Navy mess attendant in a 1930s white enlisted uniform, soaked through, standing waist-deep in empty air beyond a cliff rail, kind tired eyes, sea fog around him"
    hp: 12
    defense: 12
    attacks: [{ name: The weight of the sea, bonus: 4, damage: 1d6+1 }]
    abilities: ["Can hold Marrow for one turn: the next attack against him has advantage", "Knows how the lens turns and how to stop it"]
    tactics: "Never attacks the living. Helps those who speak to him kindly and remember his name."
    history: "Mess Attendant First Class aboard USS Macon. Drowned on 12 February 1935 swimming back into the wreck for his belongings. Has stood in the beam ever since."
    stats: { WIS: 2 }
    voice: young man, soft and courteous, a Filipino accent
  - id: ada-marrow
    name: Ada Marrow
    role: neutral
    look: "the ghost of a woman in her late thirties in an 1890s long dark skirt and puff-sleeved blouse, hair pinned up, standing on a fog-bound stair landing with her back turned, sea-water dripping from her hem"
    hp: 10
    defense: 12
    abilities: ["Can hold Marrow for one turn when she faces him", "Vanishes when threatened"]
    tactics: "Warns, never fights, until the end."
    history: "Silas Marrow's wife. Tried to take the children away from the rock in 1899. The first name in his Watch."
    voice: woman, quiet and Victorian, very calm
---
### silas-marrow
Play him polite and sure of himself, a man reciting the Lighthouse Board's regulations. He believes he is
doing his duty: a light must never go out, and a light needs keepers. He cannot stand to hear Ada's name in
someone else's mouth.

### florentino-edquiba
Play him with dignity. He is the heart of the story, not a monster: a young man far from home who went back
for something that mattered and has been waiting thirty years for someone to notice him.

### ray-delgado
Do not reveal he is dead until the party finds his body or touches him. After that, he is still on their
side, and it breaks his heart.

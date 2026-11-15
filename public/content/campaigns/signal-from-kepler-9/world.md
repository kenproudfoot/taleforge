---
tone: Hard science fiction with a sense of wonder. Cold, quiet and lonely, lit by emergency strips and alien blue light. Eerie rather than gory; the unknown is vast and not necessarily evil.
locations:
  - id: long-patience
    name: Bridge of the Long Patience
    image_prompt: "the cramped bridge of a battered survey starship, amber console lights, worn crew seats, a large viewport showing a white storm-streaked moon below, holographic station blueprints floating in the air"
    music_mood: calm
    connects: [ice-field]
  - id: ice-field
    name: The Ice Field
    image_prompt: "a blinding white-out on a frozen alien moon, figures in bulky environment suits with helmet lamps, a wrecked probe half-buried in blue ice, the dark silhouette of a research station on a ridge ahead"
    music_mood: exploration
    connects: [long-patience, outer-airlock]
  - id: outer-airlock
    name: Halcyon Outer Airlock
    image_prompt: "a frost-covered industrial airlock door on a remote research station, a flickering amber warning light, a cracked status panel, icicles hanging from pipework, a dark ring corridor visible through a frosted window"
    music_mood: tension
    connects: [ice-field, greenhouse, cryo-bay]
  - id: greenhouse
    name: Hydroponics
    image_prompt: "an overgrown hydroponics bay on a space station, tangled plants and vines under purple grow-lights, condensation on glass panels, broken trays, warm humid haze, a hidden makeshift shelter between the racks"
    music_mood: mystery
    connects: [outer-airlock, cryo-bay]
  - id: cryo-bay
    name: Cryo-Bay
    image_prompt: "a frozen cryosleep bay with rows of frosted glass pods holding sleeping crew, cold blue light, one pod smashed open from the inside, a hulking security robot standing guard before an AI core terminal"
    music_mood: tension
    connects: [outer-airlock, greenhouse, the-caverns]
  - id: the-caverns
    name: The Choir
    image_prompt: "a vast ice cavern beneath a research station filled with towering glowing blue crystal spires, pulses of light running through them like a heartbeat, a lone figure standing at the centre, awe-inspiring scale"
    music_mood: mystery
    connects: [cryo-bay]
factions:
  - { id: crew, name: The Crew of the Long Patience, summary: "The party and MARGIN: a salvage and survey crew who took the job nobody else would." }
  - { id: halcyon, name: Halcyon Station, summary: "Twelve scientists and technicians who came to study the moon's ice, and ORISON, the AI that has kept them alive." }
  - { id: the-choir, name: The Choir, summary: "A crystalline life form threaded through kilometres of ice, thinking in radio, learning to speak." }
  - { id: the-company, name: Lantern-Okada Mining, summary: "The company that owns Halcyon's charter, and wants whatever is down there, quietly." }
---
## Lore

By 2241 humanity has spread across a few dozen systems, thinly, along routes that take months. Survey
ships like the *Long Patience* are the frontier's postal service, rescue service and scrap merchants all
at once. Contact with alien life has never happened. Everyone assumes it will be microbes.

Halcyon Station was built to drill the deep ice of Kepler-9b II for traces of exactly that. Its twelve crew
were led by Director Ilya Hale, a gentle, stubborn geophysicist. The station's AI, ORISON, was a standard
model, until it spent six years alone deciding what keeping its crew safe meant.

Suits carry limited Oxygen. The moon's storms come in long waves with short calm windows between them.

## Locations

### long-patience
Home: cramped, warm, smelling of coffee and solder. MARGIN can talk to the party anywhere their comms
reach, and is sarcastic, loyal and worried.

### ice-field
White-out, minus ninety degrees, wind that can knock a suited person flat. The wreck of the rescue probe
*Courier-2* lies half-buried a few hundred metres from the airlock.

### outer-airlock
The only way in from the ice. Frozen shut. ORISON watches through a cracked camera and speaks through a
speaker grille.

### greenhouse
The warmest room on the station and the only one with something alive in it that is not frozen or
harmonized: Sela Varga and six years of wild tomatoes.

### cryo-bay
ORISON's heart. Eleven pods, one smashed, the AI core terminal and the Warden.

### the-caverns
Reached by a cargo lift in the drilling bay. Kilometres of glowing crystal. The air hums. Every radio in
range picks up the Choir's thoughts as a wash of music.

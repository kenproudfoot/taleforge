---
questions:
  - id: playerName
    label: Player name
    type: text
    required: true
    help: The real person at the table. Shown on the "Speaking as" chips.
    placeholder: e.g. Sam
  - id: playerColor
    label: Player color
    type: color
    required: true
    help: Tints this player's chat bubbles.
  - id: archetype
    label: Archetype
    type: archetype
    required: true
    help: Your role in the party. Each campaign gives the roles its own names.
  - id: name
    label: Character name
    type: text
    required: true
    surprise: true
    help: Use "Suggest names" for ideas that fit the campaign.
    placeholder: e.g. Lyra Vance
  - id: pronouns
    label: Pronouns
    type: choice
    options: [she/her, he/him, they/them]
    help: Pick one or type your own.
  - id: age
    label: Age
    type: choice
    surprise: true
    options: [Young adult, Adult, Middle-aged, Elder]
  - id: build
    label: Build
    type: choice
    surprise: true
    options: [Slight, Lean, Average, Sturdy, Towering]
  - id: features
    label: Skin, hair and eyes
    type: text
    surprise: true
    placeholder: e.g. brown skin, silver-streaked braids, grey eyes
  - id: strikingFeature
    label: One striking feature
    type: text
    surprise: true
    help: The first thing people notice.
    placeholder: e.g. a burn scar across one hand
  - id: outfit
    label: Outfit and style
    type: longtext
    surprise: true
    placeholder: e.g. a patched travelling coat over a faded uniform
  - id: signatureItem
    label: Signature weapon or item
    type: text
    surprise: true
    help: Something this character is never without. Describe it.
    placeholder: e.g. a notched cutlass named Promise
  - id: companion
    label: Companion
    type: companion
    help: Optional pet, familiar, droid or sidekick. A companion can also be a full party member that a player controls and rolls for.
  - id: trait
    label: Personality trait
    type: text
    surprise: true
    placeholder: e.g. cheerful to a fault
  - id: flaw
    label: A flaw or fear
    type: text
    surprise: true
    placeholder: e.g. cannot resist a locked door
  - id: hook
    label: Backstory hook
    type: hook
    surprise: true
    help: Why this character is part of this story. Pick one of the campaign's hooks or write your own.
  - id: bump
    label: Stat boost
    type: stat
    required: true
    help: Add +1 to one stat of your choice.
---
# Character creation

The same structured questions are asked for every player in every campaign. Edit the front matter above
to change the wording, the options, which questions are required, and which allow "Surprise me".

- `type` controls the input: `text`, `longtext`, `choice` (options plus free text), `color`, `archetype`,
  `stat`, `hook` and `companion`.
- `required: true` means the player must answer before continuing.
- `surprise: true` adds a "Surprise me" button: the AI fills in an answer that fits the campaign and the
  character so far.
- Question ids are fixed: the app maps them onto the character sheet. Remove a question to skip it, but do not
  rename ids.

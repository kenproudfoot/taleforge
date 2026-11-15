# TaleForge architecture

TaleForge is a static single-page app (Vite, React 18, TypeScript strict) with no backend. Everything runs in
the browser: the game engine, the AI orchestration, storage (IndexedDB), audio (Web Audio) and 3D dice
(three.js and cannon-es). AI providers are called directly from the browser with the user's own keys.

```
                ┌──────────────────────────── browser ─────────────────────────────┐
  player ──►    │  UI (src/ui, src/app)  ──►  game store (src/game/store.ts)       │
  voice/text    │        ▲                         │                                │
                │        │ session state           ▼                                │
                │        │                 DM orchestrator (src/ai/dm) ─────────────┼──► text provider
                │        │                         │ tool calls                     │    (Claude, OpenAI,
                │        │                         ▼                                │     Gemini, OpenRouter)
                │        └──────────────  pure engine (src/engine)                  │
                │                                  │ effects (events)               │
                │      ┌───────────────┬───────────┴──────┬────────────────┐        │
                │  narrator (voice)  Art Director     music + SFX      autosave     │
                │   src/ai/voice     src/ai/art       src/audio       src/storage   │
                └──────┼───────────────┼──────────────────────────────────┼─────────┘
                       ▼               ▼                                  ▼
                 TTS / STT APIs   image APIs                         IndexedDB
```

## The engine (`src/engine`)

Pure TypeScript with no React, DOM, storage or AI imports (ESLint enforces this). It owns the rules: stats,
checks, attacks, damage, Downed and stabilising, Heroic Points, signature abilities, milestone boosts,
campaign resources, pacing and spotlight rotation.

- `GameState` (`types.ts`) is plain serializable data. Every change produces a new state; nothing mutates in
  place from the outside. `schema.ts` is a zod mirror used to validate saves and recap files, with a
  compile-time check that it matches the type.
- `tools.ts` defines the Dungeon Master's 19 tools as zod schemas (sent to models as JSON Schema) and
  `applyToolCall`, which validates and applies one call and returns `{ state, result, effects }`. Invalid calls
  never throw: they return an error the model reads and corrects.
- `rolls.ts` runs the roll state machine: a party roll becomes a `pendingRoll` that waits for dice (main →
  optional Heroic Point → damage); NPC rolls resolve immediately. The engine never chooses a party member's
  dice: the UI supplies them (3D tray or number pad).
- `rng.ts` uses `crypto.getRandomValues` with rejection sampling; tests run chi-square checks on every die.
- Effects (`chip`, `roll_report`, `scene_changed`, `music`, `image_request`, `roster_added`,
  `campaign_ended` …) are how the rest of the app learns what happened. The engine performs no side effects.

The state is event-shaped and serializable so that a future online mode can sync it between machines.

## Content (`src/content`)

Core rules, archetypes, character-creation questions and DM style are markdown files with YAML front matter
in `public/content/core/`. Campaigns are folders of five such files. `pack.ts` parses and cross-validates a
pack (beats described, locations connected, cast ids unique, audio and assets present …) and reports issues
with file, line, field and a fix suggestion, using `yaml`'s source positions. The same validator runs in the
CLI (`npm run validate:campaigns`), in CI and in the in-app importer. Imported packs are stored in IndexedDB.

## The Dungeon Master (`src/ai/dm`)

- **Providers** (`src/ai/providers`) share one interface: `listModels()` and `stream(req)` yielding text
  deltas, tool calls, usage and a stop reason. Anthropic uses the official SDK in browser mode with prompt
  caching; OpenAI and OpenRouter share an OpenAI-compatible adapter; Gemini uses its REST streaming API. Models
  without tool calling go through `withJsonTools`, which describes the tools in the prompt and parses a fenced
  JSON block. Conversation history is provider-neutral, so the DM can switch provider mid-game.
- **Prompt** (`prompt.ts`): one stable system block (DM style, rules, the whole campaign including secrets
  marked DM-only with their reveal conditions, and the party sheets), marked for caching.
- **Context** (`context.ts`): each turn's first message carries a `<game_state>` snapshot and a `<pacing>`
  note, computed once per turn and reused for every request of that turn's tool loop so the prefix stays
  byte-identical. Only the players' words are stored in history. After 14 turns the helper model folds older
  turns into a rolling summary, keeping the last 8 verbatim.
- **Orchestrator** (`orchestrator.ts`): streams narration into the chat, applies tool calls through the
  engine, pauses for player dice, feeds results back, and loops (at most 8 model calls per turn). A failed turn
  restores the session exactly as it was, plus an error the players can retry.

## Services around the game

- **Narrator** (`src/ai/voice`): splits streaming text into sentences and `«Name: line»` NPC speech, prepares
  the audio a few sentences ahead and plays them in order, highlighting the sentence being read. NPCs get
  stable voices (gender hints from the cast file, overridable per NPC). Music ducks while it speaks; pressing
  the microphone stops it. Falls back to the browser's speech synthesis if a voice service fails.
- **Speech input**: the Web Speech API where available, otherwise OpenAI transcription of a recorded clip.
- **Art Director** (`src/ai/art`): a priority queue (portraits > current scene > party > next scenes > NPCs >
  moments) with a concurrency limit, retries with backoff and an IndexedDB cache keyed by a hash of subject,
  style, provider and model. The helper model rewrites structured briefs into prompts. Name plaques are drawn
  onto portraits with canvas in the app, never by the image model.
- **Music** (`src/audio`): one track at a time on a music bus, looping with a crossfade, crossfading on mood
  changes, ducked by a separate gain stage. A mood resolves to the player's upload, else the campaign's map,
  else the genre default, else the generic default.

- **Usage metering** (`src/ai/meter.ts`, `src/ai/pricing.ts`, `src/game/usage.ts`): every paid call reports what
  the provider measured (text tokens with cache reads and writes, GPT Image tokens, characters spoken, seconds
  transcribed) through `meter()`. The game store prices each event (built-in list prices plus the user's
  overrides in Settings → Costs) and appends it to the session's `ledger`; the DM loop records its own
  requests so a failed turn keeps exactly what was spent. The usage panel summarizes the ledger and exports
  it as CSV.

## State, storage and saves

- Zustand stores: `useSettings` (settings, key encryption, serialized writes) and `useGame` (the open session,
  the turn runner, rolls, recap writing). Services subscribe to `onGameEvent`.
- IndexedDB (`src/storage/db.ts`, via `idb`): `kv` (settings), `campaigns` (imported packs), `sessions`,
  `images` and `audio` (uploads). Sessions are saved after every turn; provider-private data (thinking blocks)
  is stripped before saving because it is only valid within one live turn.
- `recap.md` (`src/game/recap.ts`): helper-written prose sections, app-written party and progress sections,
  and a fenced JSON block with the exact `GameState`. Loading a recap rebuilds the session from the JSON and
  hands the prose to the DM as the summary.

## Testing

- **Vitest** for the engine (coverage threshold 90%), content, providers (fetch and SDK fakes), the DM loop
  (scripted mock provider), voice queueing, the Art Director, audio catalogue checks and recaps.
- **Playwright** for end-to-end flows, with a scripted Dungeon Master installed through
  `localStorage["taleforge:e2e"]`: a full campaign from setup to ending, dice in both modes, settings
  round-trips and encryption, campaign import with error reporting, pictures through a mocked custom endpoint,
  recap save and restore in a fresh browser, WCAG 2.1 AA audits with axe-core on every main screen, and a
  phone-width layout check.

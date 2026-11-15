# TaleForge

AI Dungeon Master web app: a static SPA (no backend) deployed to GitHub Pages at
`https://kenproudfoot.github.io/taleforge/`. Full spec: `DNDPLAN.md` (work through its phases in order;
commit at the end of each phase, only with tests green).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server (served under `/taleforge/`) |
| `npm test` | Vitest unit + component tests (`npm run coverage` enforces >=90% on `src/engine`) |
| `npm run e2e` | Playwright; builds and serves `vite preview` on :4173 itself |
| `npm run validate:campaigns` | Validates every pack in `public/content/campaigns` |
| `npm run build` | Rebuilds the campaign index, typechecks, bundles to `dist/` |
| `npm run lint` / `npm run typecheck` | ESLint / `tsc --noEmit` |
| `npm run check` | lint + typecheck + coverage + campaign validation (run before every commit) |
| `npm run docs:screenshots` | Builds, plays a scripted session in Playwright and writes `docs/images/` |
| `npm run generate:audio [-- <id>]` | Re-renders the code-composed music and SFX (macOS: uses `afconvert`) |
| `npm run import:music -- <file> <id>` | Converts an owner-supplied track to AAC in `public/content/audio/music/` (macOS) |

## Architecture

- `src/engine/` pure TypeScript game engine (rules, dice, state, tool-call reducers, pacing). No React, DOM,
  storage or AI imports; ESLint enforces this. State is serializable and changed only by events.
- `src/content/` zod schemas + loaders for core files and campaign packs (five markdown files with YAML front matter).
- `src/ai/` `providers/` (anthropic, openai, gemini, openrouter, mock), `dm/` (orchestrator, prompt builder, tools,
  context), `art/` (Art Director queue + cache), `voice/` (TTS/STT), `recap/`.
- `src/audio/` music manager and SFX. `src/dice/` 3D tray + physical entry. `src/storage/` IndexedDB via `idb`.
- `src/ui/` React components; `src/app/` routes and shell. Hash router; Vite `base` is `/taleforge/`
  (override with `BASE_PATH`).
- `public/content/` core rules, bundled campaigns and audio. `scripts/` Node tooling run with `tsx`.
- See `docs/ARCHITECTURE.md` for the full picture and `docs/CAMPAIGN_AUTHORING.md` for the pack format.
- E2E tests script the Dungeon Master by setting `localStorage["taleforge:e2e"]` before the page loads (see
  `src/ai/e2e.ts`). Hash-only navigation does not reload, so add the init script before the first `goto`.

## Rules

- Testing is mandatory: every module ships with Vitest tests; AI providers are mocked in tests only.
- No placeholder assets or lorem ipsum in shipped UI. Icons are hand-built SVG; audio needs provenance in
  `public/content/audio/LICENSES.md`.
- No secrets in the repo. Keys live in the user's browser (IndexedDB) or in gitignored `.env.local`
  (never `VITE_`-prefixed, so they are never bundled).
- Never hard-code model IDs as the only option: fetch model lists from each provider at runtime; defaults are
  editable settings.
- The DM model never does maths: the engine resolves every roll and state change from validated tool calls.
- Styling: CSS variables in `src/ui/tokens.css` + CSS modules; campaign themes override the accent/background/display
  font variables at runtime.
- Commit only when `npm run check` and `npm run e2e` both pass; gate the commit on their exit codes.
- Toolchain is current-major (TypeScript 6, Vite 8, Vitest 5, zod 4, ESLint 10 flat config): check the installed
  version's API before assuming older syntax.

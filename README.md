# Story Orchestrator

A SillyTavern extension that runs authored, format-2 stories as **deterministic checkpoint
graphs** over a live chat. Stories declare typed qualities, checkpoints, and gates; the engine
tracks a per-chat blackboard, advances one transition per rendered-reply boundary, extracts
state off the response path with a memory LLM, and steers pacing, memory, arcs, and epistemic
state — all without an AI in the steady-state response path.

## What it does

- **Deterministic spine.** Checkpoints and typed gates over a blackboard of typed qualities.
  Exactly one transition fires per turn boundary; swipe/edit/delete roll state back cleanly.
- **Off-path extraction.** A memory-LLM shared read parses `DELTA`/`FACT`/`MEMORY` lines from
  the transcript and applies accepted deltas only at the next boundary.
- **Memory tiers, arcs & canon.** Facts, session details, short-term, and scene-history tiers
  with supersession, consolidation, arc tracking, and a derived canon summary.
- **Epistemic map & state ledger.** Per-character knowledge (who knows/suspects/hides what) and
  a typed entity-state ledger, injected privately per drafted speaker (never written to World
  Info).
- **Pacing.** Smoothed tension tracking against a chosen dramatic shape, with steering hints.
- **Two surfaces, one default.** **Player mode** is the drawer's default: where you are, what
  happened recently, open threads, the story so far, and an honest status line for what the machine
  is doing. **Author view** (per chat, asks before it reveals) *adds* the internals — blackboard,
  scheduler, injected payload, convergence, epistemic map, state ledger and the in-play driver.
- **Story identity.** Stories carry an `id` and a `version`; each chat pins the copy it plays, so
  library edits and deletions never reach a running game. Saving from the chat that plays a story
  hot-swaps compatible edits and asks before anything invalidating.
- **Checkpoint Studio + setup wizard.** A visual authoring modal over a typed mutation API with a
  diagnostics pass, plus a wizard that interviews you about a premise, proposes the graph, and
  **creates** the character cards, lorebook and group the story requires — create-only, reviewed one
  card at a time.
- **Stagecraft.** Deterministic presentation effects first (a checkpoint can switch the background),
  then background curators that only ever *propose*: the World Info curator reads real canon,
  suggests patches inside the story's declared lorebooks, and writes only what the author accepted,
  at a boundary. Off by default.
- **Author surface.** Template macros, `/cp` and `/so-mem` slash commands, an away-recap popup, and
  a tabbed drawer (blackboard, memory, scheduler, injected-payload inspector, curator review ring).

## Install

1. Copy this folder into `SillyTavern/public/scripts/extensions/third-party/story-orchestrator`
   (or install via the extension URL if you host it).
2. From the extension folder: `npm ci && npm run build`. `dist/` is **not** in the repository — the
   bundle is a build artifact attached to a release — so this step is not optional. It writes
   `dist/index.js` (what `manifest.json` loads) and `dist/manifest.json` (the build manifest: the
   bundle's sha256, the source sha256 it was built from, the SillyTavern version and the hashes of
   every host file this extension imports).
3. Reload SillyTavern. The panel appears in **Extensions → Story Orchestrator**.

Two host-side settings, both optional and both for features that stay off without them:

| For | SillyTavern setting | Without it |
|---|---|---|
| Memory model (extraction, memory, arcs, canon) | A **Connection Manager** profile, selected in the panel's **Memory LLM profile** | The story does not advance on its own; the drawer says so |
| The judge (critic, director, scene tracker) | `enableServerPlugins: true` in `config.yaml` + `npm run plugin:install` | Every judge use stays on its existing path — nothing blocks |

## Tested on

The extension is exercised against one host at a time, and this is the one it was last exercised on.
Nothing here claims other versions work — see the line under the table.

| | |
|---|---|
| SillyTavern (live play) | 1.19.0, commit `7c399419636c4df3d6d035fcddf9ccbb8248b432` — the install every live journey ran on (`host.commit` in `dist/manifest.json`) |
| SillyTavern (clean install) | 1.19.0, commit `06bde939fb1e9c4c8d8641d810f0a916b5bce127` (`release`, cloned clean): machine gates only, no live play |
| Declared older host | 1.18.0, commit `51ad27fb86d39a3daca3adaa970375c9670c12df` — the release before it, carried so the compatibility line below means something (`typecheck`, `lint`, `test`, `build` and `test:release` green there; not played through) |
| Host files | the ten `importSTModule` seams, hashed in `dist/manifest.json` → `host.files` |
| Browser | Chromium via Playwright, headed (desktop and `ST_DEBUG_VIEWPORT=390x844`) |
| Main model | TheDrummer Artemis 31B v1.1 Q4_K_M (llama.cpp on a RunPod RTX PRO 4500), Connection Manager profile |
| Memory model | the same profile; **instruct template required** — an untemplated prompt degenerates into token loops |
| Probed capabilities | `macros`, `slashCommands`, `backgrounds`, `vectors`, `judge` — `judge` is only needed when a judge usage is switched on, and every usage ships off (the settings panel's **Host capabilities** block reports each as present/absent/error, and **Copy for a bug report** pastes the whole picture) |
| Bundle | the sha256 in that build's `dist/manifest.json` → `bundle.sha256` |

**Not tested on other SillyTavern versions.** The extension imports host modules by path
(`/script.js`, `/scripts/world-info.js`, …) and hashes them at build time, so a version whose files
differ is a version nobody has run this against. The **Host capabilities** block and the build
manifest are what make the difference visible instead of mysterious: if a host seam moved, the probe
says which.

## Quick start

1. Select a **Memory LLM profile** (a SillyTavern Connection Manager profile) in the settings panel.
   It is an **install-wide** setting: every chat, including new ones, inherits it. Extraction itself
   is on by default; without a profile it stays paused and the drawer says so.
2. Get a story:
   - **From a premise** — **New story (wizard)**: the wizard asks a couple of questions, proposes the
     graph, and offers to create the cards, lorebook and group it needs (each as its own card you
     review and apply).
   - **From JSON** — paste a format-2 story into **Import format-2 JSON → Import and Load**;
     previously imported stories re-select from the Story dropdown without losing progress. See
     [`examples/`](examples/) for a complete, playable story (*Quest for the Sun Ruins*).
3. Play. The drawer opens on the player view: where you are, what happened recently, open threads,
   what the story has established, and whether the extension is reading, working, waiting or stuck.
   Turn on **Author view** for the internals, **Edit story** to open the Studio on the story this chat
   is playing, and **Restart story** for the one honest reset.

Three lifetimes, three homes: install-wide settings (memory profile, display, stagecraft) in the
extension settings; per-chat state (progress, memory, author view, shape override, speaker direction)
in the chat; authored content in the story record.

## Macros

Registered via `MacrosParser` and auto-updated from the active story:

| Macro | Expands to |
|---|---|
| `{{story_title}}` / `{{story_description}}` | Story title / description |
| `{{story_current_checkpoint}}` | Active checkpoint name + objective |
| `{{story_past_checkpoints}}` | Visited anchor names |
| `{{story_possible_transitions}}` | Outgoing transitions with rendered gate text |
| `{{story_tension}}` | Current tension level |
| `{{story_player_name}}` | Player persona name |
| `{{story_role_<id>}}` | Roster member name for role `<id>` |
| `{{story_blackboard}}` | Compact blackboard state memo |
| `{{story_canon}}` | Derived canon summary |
| `{{story_memory_<tier>}}` | A memory tier (`facts`, `session_details`, `short_term`, `scene_history`) |
| `{{story_epistemic}}` / `{{story_ledger}}` | Active-speaker epistemic block / state ledger |

## Slash commands

- `/story recap | threads | flag [note]` — player-safe: the same narrative view the drawer and the
  away-recap popup render, and a way to flag a moment that felt wrong.
- `/cp list | state | activate <id> | set <quality> <value> | extract [response] | expand [response] | converge | memorize`
  — **author-only** (`extract`/`expand` are debug verbs).
- `/so-mem list | pin <id> on|off | exclude <id> | backlog`

## Extraction timing

Accepted blackboard deltas apply at the **next** turn boundary (one transition per boundary, by
design). Cadenced reads cover a window ending `stabilityLag` messages behind the newest (default
0 — swipes are handled by rollback plus a forced re-read). Transitions with an
`extractor_trigger` regex force an immediate P0 read the moment the cue appears, so decisive
beats land without waiting for cadence — give your decisive transitions a cue.

## Development

- `npm run typecheck && npm run lint && npm test` — pure/harness gate.
- `npm run build` — production bundle + `dist/manifest.json`. `npm run test:release` checks the
  manifest against the bytes it describes (bundle hash, stable source hash, capability list).
- `npm run storybook` / `npm run test-storybook:ci` — UI, with the runner invoked by path so it
  works on Windows shells and in CI.
- `npm run test:debug` / `npm run test:plugin` / `npm run test:release` — the harness, the judge
  plugin and the release tooling, each on `node --test`.
- `scripts/release/clean-host.sh` (and `.ps1` on Windows) — the reproducible answer to "does this
  build on a machine that is not mine": clone SillyTavern at a pinned revision into a temp dir, copy
  this extension in without `node_modules`/`dist`, `npm ci` with an isolated cache, run the gates, and
  write a host record under `docs/release/clean-host/`.
- `scripts/debug/*.mts` — live SillyTavern debugging (see `scripts/debug/README.md`).
- Architecture: [`docs/architecture-v2.md`](docs/architecture-v2.md). Design spec and per-plan
  gate records: [`docs/plans/v2/`](docs/plans/v2/).

## Provenance & licensing

Story Orchestrator is **AGPL-3.0** (see [`LICENSE`](LICENSE)); distributing it requires making
source available under the same terms.

- The memory subsystem is a vendored TypeScript adaptation of
  [Smart-Memory](https://github.com/senjinthedragon/Smart-Memory) (AGPL-3.0).
- The copilot's proposal/diff-review pattern comes from
  [ST-Copilot](https://github.com/Supker/ST-Copilot) (MIT).
- The state-memo and delta-log/rollback patterns come from
  [MultihogDnDFramework](https://github.com/MultihogAurelius/SillyTavern-MultihogDnDFramework) (MIT).
- The extraction stability lag and manual memory controls follow
  [SillyTavern-MessageSummarize](https://github.com/qvink/SillyTavern-MessageSummarize)
  (AGPL-3.0 — patterns only, no code vendored).

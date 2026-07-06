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
- **Checkpoint Studio.** A visual authoring modal over a typed mutation API, with a diagnostics
  pass and an optional authoring/in-play **copilot**.
- **Author surface.** Template macros, `/cp` and `/so-mem` slash commands, an away-recap popup,
  and a tabbed debug drawer (blackboard, memory, scheduler, injected-payload inspector).

## Install

1. Copy this folder into `SillyTavern/public/scripts/extensions/third-party/story-orchestrator`
   (or install via the extension URL if you host it).
2. From the extension folder: `npm ci && npm run build` (produces the gitignored `dist/index.js`
   that `manifest.json` loads).
3. Reload SillyTavern. The panel appears in **Extensions → Story Orchestrator**.

## Quick start

1. Open the settings panel and paste a format-2 JSON into **Import format-2 JSON → Import and
   Load** (previously imported stories can be re-selected from the Story dropdown). See
   [`examples/`](examples/) for a complete, playable story (*Quest for the Sun Ruins*).
2. Select a **Memory LLM profile** (a SillyTavern Connection Manager profile) so extraction can
   run — without one, extraction stays paused outside debug runs.
3. Play. The drawer shows the active checkpoint, blackboard, tension, convergence, memory, and
   the exact prompt blocks injected on the last generation.

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

- `/cp list | state | activate <id> | set <quality> <value> | extract [response] | expand [response] | converge | memorize`
- `/so-mem list | pin <id> on|off | exclude <id> | backlog`

## Development

- `npm run typecheck && npm run lint && npm test` — pure/harness gate.
- `npm run build` — production bundle. `npm run storybook` / `npm run test-storybook:ci` — UI.
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

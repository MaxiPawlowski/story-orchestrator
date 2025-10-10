
# Codex Agent Brief

## Purpose
Checkpoint‑driven story runner for SillyTavern. It orchestrates DM + Companion roles alongside the player, watches user chat turns for win/fail trigger regexes, advances checkpoints, and applies per‑stage contextual injections (Author's Note, World Info enable/disable, preset overrides). It also tracks requirement readiness (persona, roles, lore presence) before activating runtime logic.

## High‑level Flow
1. Extension script loads; after short delayed mount it injects Settings UI and a pinned Drawer UI.
2. `StoryProvider` loads & validates bundled checkpoint JSON files (0.json, 1.json, …) via the loader + schema validator.
3. When a group chat is active, the orchestrator is ensured/initialized for the first valid story.
4. Each user message increments turn counters and may enqueue an evaluation (interval or trigger match) to the `CheckpointArbiter`.
5. Arbiter outcome (continue|win|fail) updates checkpoint status; on win the next checkpoint auto‑activates; on fail the state marks failed and awaits manual action.
6. Activating a checkpoint applies: world info toggles, per‑role Author's Notes, preset overrides (cloned from current or named base), and resets evaluation interval counters if requested.

## Entry Points & Key Files
UI / Mounting
- `src/index.tsx` – Injects Settings and Drawer roots; wraps drawer in `StoryProvider`.
- `src/Apps.tsx` – Exports `LoreManagerApp` (drawer) and `SettingsApp` shells.

Context & Hooks
- `src/components/context/StoryContext.tsx` – Loads bundle, validates JSON -> NormalizedStory, exposes checkpoint summaries + requirement flags.
- `src/hooks/useStoryOrchestrator.ts` – React hook wiring runtime store + orchestrator manager hooks into components.

Runtime Controllers & Services
- `src/services/StoryOrchestrator.ts` – Core runtime controller: checkpoint activation, trigger handling, world info + preset application, persistence coordination, turn ticking.
- `src/controllers/orchestratorManager.ts` – Singleton lifecycle manager (ensures single orchestrator instance per story, handles teardown, readiness flag, interval setting, runtime hooks).
- `src/controllers/requirementsController.ts` – Derives readiness (persona, group chat selected, required character roles exist, world info entries present) and updates store.
- `src/controllers/persistenceController.ts` – Chat/story‑scoped runtime persistence (checkpoint index, statuses, turns since eval) via `story-state` helpers.
- `src/controllers/turnController.ts` – Mediates role application decisions per turn (see attachment if extended).
- `src/services/PresetService.ts` – Clones current or named base preset; applies per‑role overrides on checkpoint activation.
- `src/services/SillyTavernAPI.ts` – Thin wrapper over host globals (event bus, world info enable/disable, AN helpers, context getters) to decouple build.
- `src/services/CheckpointArbiterService.ts` – Evaluates queued turns against win/fail logic (interval, regex matches) and returns outcome used by orchestrator.

Bundling & Validation
- `src/utils/json-bundle-loader.ts` – Multi‑strategy numeric JSON discovery (Webpack require.context, import.meta.glob, manifest fetch, sequential runtime fetch) with caching.
- `src/utils/story-loader.ts` – Assembles checkpoint bundle, normalizes order, invokes validator, logs summary.
- `src/utils/story-schema.ts` – Zod schema: Story v1.0, checkpoint structure, activation payloads.
- `src/utils/story-validator.ts` – Compiles regex specs, normalizes activation blocks (`authors_note`, `world_info`, `preset_overrides`), constructs `NormalizedStory`.

State & Stores
- `src/store/storySessionStore.ts` – Zustand vanilla store holding: active story, runtime (checkpoint index, status map, turns since eval), requirement flags, chat context, hydration/ready flags.
- `src/store/requirementsState.ts` – Shape + helpers for requirement readiness diffing and cloning.

Utilities / Supporting Logic
- `src/utils/story-state.ts` – Runtime state helpers: clamping checkpoint index, deriving statuses, evaluating triggers, sanitizing counters.
- `src/utils/eventSource.ts` – Generic event subscription wrapper used to listen for SillyTavern host events.
- `src/utils/slashCommands.ts` – Registers extension‑specific slash commands (invoked during orchestrator init).

Assets
- `src/checkpoints/` – Numeric JSON story files plus `manifest.json` (optional runtime fetch fallback). Example: `0.json`, `1.json`, `2.json`.

Styling & Build
- `src/styles.css`, Tailwind config (`tailwind.config.js`) integrated through webpack pipeline.

## Runtime Architecture (Detailed)
React Layer -> `StoryContext` -> Orchestrator Manager -> Orchestrator Core -> Services (Preset, Requirements, Persistence, Arbiter) -> Host API.

Data flow:
1. Bundle load: `story-loader` returns list of candidate stories (first valid currently used).
2. Validation: `story-validator` compiles regex triggers upfront (case‑insensitive by default unless flags supplied).
3. Activation: Orchestrator seeds role map, initializes preset baseline, world info, requirement watchers, and persists runtime snapshot (if group chat + chatId present).
4. Turn Handling: Each user input increments `turn` and `turnsSinceEval`; if a win/fail regex matches OR interval threshold reached, evaluation is queued.
5. Evaluation: `CheckpointArbiterService` resolves outcome; on success/failure it picks the appropriate outgoing transition edge (if any) for the active checkpoint; `continue` just resets the interval counter.
6. Persistence: After each runtime mutation, if persistence conditions are met (story + group chat + chatId), state is serialized via `persistStoryState` (see `story-state`).
7. UI Sync: Zustand store updates propagate through React hook selectors; Drawer panels display status, requirements, and allow manual activation.

Runtime State (Zustand):
- `runtime.checkpointIndex`
- `runtime.activeCheckpointKey`
- `runtime.checkpointStatusMap`
- `runtime.turnsSinceEval`
- `turn` (alias of turns since story start / activation logic)

## Persistence & Hydration
- Persisted per (chatId + story title) only when in group chat context.
- Hydration attempts on chat switch; if not hydrated or context invalid, runtime resets to defaults.
- Checkpoint activation during hydration avoids re‑applying effects unless index changes.

## Extensibility Points
- Slash commands registration in `slashCommands.ts` (extend for manual checkpoint control or diagnostics).
- Add new trigger types by extending `story-state` match utilities and Arbiter logic.
- Additional per‑checkpoint actions: extend `on_activate` schema (and update validator + orchestrator apply logic).

## Build & Development
- Install deps: `npm install`
- Dev (watch + typecheck): `npm run dev`
- Production build: `npm run build` (emits `dist/index.js` + copied assets)

## Agent Notes
- Always rely on normalized `NormalizedStory` object rather than raw JSON.
- When adding new runtime side effects, prefer adding them in `StoryOrchestrator.applyCheckpoint` after win/fail regex arrays are prepared.
- Keep persistence conditional (respect `canPersist()` contract: must be group chat + chatId + story).


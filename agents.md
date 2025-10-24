# Codex Agent Brief - Story Driver

## Purpose
Story Driver is a SillyTavern extension that automates checkpoint-driven stories. It watches player turns, evaluates regex or timed triggers, and applies Author's Notes, world info toggles, preset overrides, talk-control replies, and slash-command automations while enforcing persona, group, and lore requirements.

## Lifecycle & Flow
1. `src/index.tsx` mounts Drawer and Settings portals once the host UI is ready, wraps them with `ExtensionSettingsProvider` and `StoryProvider`, and registers the `talkControlInterceptor` on `globalThis`.
2. `StoryProvider` loads the story library (`storyLibrary` + `story-validator`), restores the chat's selected story, publishes metadata via context, and ensures macros are registered.
3. `orchestratorManager.ensureStory` sanitizes arbiter settings, instantiates a singleton `StoryOrchestrator`, attaches `turnController`, seeds `talkControlManager`, and syncs `storySessionStore` with chat context.
4. `StoryOrchestrator` hydrates runtime persistence (`story-state`), hooks SillyTavern events, registers slash commands, tracks requirements, updates macro snapshots, and monitors turn counters for trigger matches.
5. Player turns and manual `/checkpoint` commands queue `CheckpointArbiterService` jobs. Parsed outcomes advance checkpoints, persist runtime state, and reset timers in the Zustand store.
6. Checkpoint activation applies per-role Author's Notes, preset overrides, arbiter presets, world info toggles, automation slash commands, macro snapshots, and talk-control scopes. Requirements gating prevents side effects when the chat is not ready.

## Talk Control
- `talkControlManager` mirrors normalized story definitions, rebuilds role lookups, and tracks per-checkpoint replies (static text or LLM instructions).
- Queues triggers (`onEnter`, `onExit`, `afterSpeak`, `beforeArbiter`, `afterArbiter`), throttles actions per turn, resolves character IDs, and dispatches replies via `addOneMessage` or `generateGroupWrapper`.
- Intercepts loud generations when a pending talk-control action exists, cancels the host generation, and injects its own response while suppressing recursion.

## React Surfaces
- `src/components/drawer` shows requirement badges, checkpoint status, and the most recent queued evaluation summary.
- `src/components/settings` exposes arbiter prompt/frequency controls, story selection, refresh, and the Checkpoint Studio modal.
- `src/components/studio` contains editors for metadata, checkpoints, transitions, automations, talk control, diagnostics, and the Cytoscape/dagre `GraphPanel`.
- `ExtensionSettingsContext` sanitizes and persists arbiter settings via `utils/arbiter`.
- `StoryContext` publishes story metadata, runtime counters, requirement flags, library CRUD helpers, and persona reload hooks.

## Controllers & Services
- `StoryOrchestrator` drives checkpoint state, trigger evaluation, preset and world info application, automations, macro snapshots, persistence, and talk-control notifications.
- `orchestratorManager` guarantees a single orchestrator instance, forwards sanitized arbiter settings, attaches or detaches `turnController`, exposes pause/resume helpers, and relays evaluation callbacks.
- `turnController` listens to SillyTavern events (`MESSAGE_SENT`, `GENERATION_STARTED`, etc.), dedupes user text, sets the active role for preset application, and avoids duplicate turn ticks.
- `requirementsController` validates persona, group membership, and lore prerequisites, updating the requirement snapshot in `storySessionStore`.
- `persistenceController` loads and saves runtime snapshots keyed by `(chatId + story title)` using utilities in `story-state`, hydrating without replaying activation effects.
- `CheckpointArbiterService` builds evaluation prompts, snapshots recent chat history, calls `generateRaw`, enforces JSON-only replies, and emits outcomes used to advance checkpoints.
- `PresetService` clones current or named presets, applies per-role overrides (including `$arbiter`), syncs SillyTavern UI sliders, and resets on story changes.
- `storyMacros` registers macros at startup and refreshes snapshots (title, descriptions, checkpoint summaries, trigger list, chat excerpt, player name, role aliases) whenever the orchestrator publishes new context.
- `SillyTavernAPI` is the facade over host globals (event bus, presets, world info, slash commands, chat metadata) so services stay decoupled from runtime globals.

## State & Persistence
- `storySessionStore` (Zustand) tracks the active story, selected key, chat context, runtime (`checkpointIndex`, `activeCheckpointKey`, `turnsSinceEval`, `checkpointTurnCount`, `checkpointStatusMap`), overall turn count, hydration flag, requirement snapshot, and orchestrator readiness.
- `story-state` sanitizes runtime updates, clamps indices, derives checkpoint status maps, persists state per chat, and produces summaries for macros and the UI.
- `requirementsState` exposes immutable helpers for diffing and cloning requirement snapshots so controllers avoid redundant store writes.

## Story Authoring & Library
- `utils/story-schema.ts` defines the Zod schema (checkpoints, transitions, `talkControl`, automations, role overrides, author-note defaults).
- `story-validator` normalizes stories into ordered checkpoints, transition maps, regex lists, and talk-control checkpoints.
- `utils/checkpoint-studio.ts` powers draft models, regex and automation helpers, Mermaid export, and talk-control editors used by the Studio.
- `storyLibrary.ts` persists stories in extension settings, handles CRUD, generates stable IDs, and is consumed by `useStoryLibrary`.

## Build & Tooling
- React 19, TypeScript 5, Zustand 5, Cytoscape + dagre, Tailwind 4 (via PostCSS + webpack).
- NPM scripts: `npm run dev` (webpack watch + `tsc --watch`), `npm run typecheck`, `npm run build`.
- Styles live in `src/styles.css`; configuration resides in `tailwind.config.js`. Webpack enables live reload and fork-ts type checking.

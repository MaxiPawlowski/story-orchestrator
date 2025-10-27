# Codex Agent Brief - Story Orchestrator

## Purpose
Story Orchestrator is a ST extension that automates non-linear, checkpoint-driven stories mapped as directed graphs. It watches player turns, evaluates regex or timed triggers, and applies Author's Notes, world info toggles, preset overrides, talk-control replies, and slash-command automations while enforcing persona, group, and lore requirements.

## Lifecycle & Flow
1. `src/index.tsx` mounts Drawer and Settings portals once the host UI is ready (2-second delay for stability), wraps them with `ExtensionSettingsProvider` and `StoryProvider`, and registers the `talkControlInterceptor` on `globalThis`.
2. `StoryProvider` loads the story library (`storyLibrary` + `story-validator`), restores the chat's selected story from persisted state, publishes metadata via context, and ensures macros are registered.
3. `orchestratorManager.ensureStory` sanitizes arbiter settings, instantiates a singleton `StoryOrchestrator`, attaches `turnController`, seeds `TalkControlService`, and syncs `storySessionStore` with chat context.
4. `StoryOrchestrator` hydrates runtime persistence (`story-state`), hooks ST events (chat changes, generation lifecycle), registers slash commands, tracks requirements via subscription, updates macro snapshots, and monitors turn counters for trigger matches. Applies deferred checkpoint effects once requirements are satisfied.
5. Player turns, timed triggers (based on `checkpointTurnCount`), and manual `/checkpoint` commands queue `CheckpointArbiterService` jobs whenever regex rules match. Parsed outcomes advance checkpoints, persist runtime state, and reset timers in the Zustand vanilla store.
6. Checkpoint activation applies per-role Author's Notes (clearing for roles without specific notes), preset overrides (including `$arbiter` for evaluation phases), arbiter presets, world info toggles, automation slash commands, macro snapshots, and talk-control scopes. Requirements gating prevents side effects when the chat is not ready.

## Talk Control
- `TalkControlService` mirrors normalized story definitions, rebuilds role lookups via `CharacterResolver`, and tracks per-checkpoint replies (static text or LLM instructions) via `ReplySelector`.
- Queues triggers (`onEnter`, `onExit`, `afterSpeak`, `beforeArbiter`, `afterArbiter`), throttles actions per turn using state tracking per checkpoint, resolves character IDs from role names and group context, and dispatches replies via `MessageInjector` (`addOneMessage` or `generateGroupWrapper`).
- Intercepts loud (not quiet) generations when a pending talk-control action exists, cancels the host generation via abort callback, and injects its own response while managing intercept suppression depth and self-dispatch guards to prevent recursion.
- Listens to `MESSAGE_RECEIVED`, `GENERATION_STARTED`, `GENERATION_STOPPED`, `GENERATION_ENDED`, and chat context change events to maintain state and queue pending actions.

## React Surfaces
- `src/components/drawer` shows requirement badges, checkpoint status, and the most recent queued evaluation summary.
- `src/components/settings` exposes arbiter prompt/frequency controls, story selection, refresh, and the Checkpoint Studio modal.
- `src/components/studio` contains editors for metadata, checkpoints, transitions, automations, talk control, diagnostics, and the Cytoscape/dagre `GraphPanel`.
- `ExtensionSettingsContext` sanitizes and persists arbiter settings via `utils/arbiter`.
- `StoryContext` publishes story metadata, runtime counters, requirement flags, library CRUD helpers, and persona reload hooks.

## Controllers & Services
- `StoryOrchestrator` drives checkpoint state, trigger evaluation (regex and timed), preset and world info application, automations, macro snapshots, persistence, talk-control notifications, and deferred checkpoint effects that apply once requirements are satisfied.
- `orchestratorManager` guarantees a single orchestrator instance, forwards sanitized arbiter settings, attaches or detaches `turnController`, exposes pause/resume helpers (`pauseAutomation`, `resumeAutomation`, `isAutomationPaused`), and relays evaluation callbacks.
- `turnController` listens to ST events (`MESSAGE_SENT`, `GENERATION_STARTED`, `GENERATION_STOPPED`, `GENERATION_ENDED`, `IMPERSONATE_READY`, etc.), dedupes user text via signature-based comparison, sets the active role for preset application using epoch-based generation tracking, and avoids duplicate turn ticks.
- `requirementsController` validates persona, group membership, and lore prerequisites, updating the requirement snapshot in `storySessionStore`. Subscribes to persona reload and chat context change events. Validates story role requirements and world info entry presence.
- `persistenceController` loads and saves runtime snapshots keyed by `(chatId + story title)` using utilities in `story-state`, hydrating without replaying activation effects. Manages checkpoint status maps and hydration state flags.
- `CheckpointArbiterService` builds evaluation prompts from arbiter template, snapshots recent chat history (last N messages, reversed order), calls `generateRaw` with JSON-only mode enforced, enforces JSON-only replies (handles both raw JSON and code-fenced responses), updates `chat_excerpt` macro, and emits outcomes used to advance checkpoints.
- `PresetService` creates runtime-only preset named `Story:<storyId>`, clones base preset (current or named) into runtime scope, applies per-role overrides (including `$arbiter` role for evaluation phases), syncs UI sliders (requires exporting `setSettingByName` from `public\scripts\textgen-settings.js`), handles logit bias merging, and resets on story changes.
- `TalkControlService` manages talk-control lifecycle with three subsystems: `CharacterResolver` (resolves role names to character IDs), `ReplySelector` (picks replies and throttles per turn), `MessageInjector` (injects static/LLM messages). Exposes generation interceptor, manages suppression depth and self-dispatch guards.
- `storyMacros` registers macros at startup via `MacrosParser`, refreshes snapshots (title, descriptions, checkpoint summaries, trigger list, chat excerpt, player name, role aliases) whenever the orchestrator publishes new context, and handles role-specific macros including `story_role_dm` and `story_role_companion` aliases.
- `STAPI` is the facade over host globals (event bus, presets, world info, slash commands, chat metadata, character lookups, lorebook operations) so services stay decoupled from runtime globals.

## State & Persistence
- `storySessionStore` (Zustand vanilla) tracks the active story, selected library key, chat context (`chatId`, `groupChatSelected`), runtime (`checkpointIndex`, `activeCheckpointKey`, `turnsSinceEval`, `checkpointTurnCount`, `checkpointStatusMap`), overall turn counter, hydration flag, requirement snapshot (`requirementsReady`, `currentUserName`, `personaDefined`, `groupChatSelected`, `missingGroupMembers`, `worldLoreEntriesPresent`, `worldLoreEntriesMissing`, `globalLoreBookPresent`, `globalLoreBookMissing`), and orchestrator readiness flag.
- `story-state` sanitizes runtime updates, clamps indices, derives checkpoint status maps from explicit overrides and current position, persists state per chat in extension settings, and produces summaries for macros and the UI.
- `requirementsState` exposes immutable helpers for diffing, cloning, and equality checks so controllers avoid redundant store writes.

## Story Authoring & Library
- `utils/story-schema.ts` defines the Zod schema (checkpoints, transitions, `talkControl`, automations, role overrides, author-note defaults).
- `story-validator` normalizes stories into ordered checkpoints, transition maps, regex lists, and talk-control checkpoints.
- `utils/checkpoint-studio.ts` powers draft models, regex and automation helpers, Mermaid export, and talk-control editors used by the Studio.
- `storyLibrary.ts` persists stories in extension settings, handles CRUD, generates stable IDs, and is consumed by `useStoryLibrary`.

## Build & Tooling
- React 19, TypeScript 5, Zustand 5 (vanilla), Cytoscape + cytoscape-dagre, Tailwind 4 (via @tailwindcss/postcss + PostCSS + webpack).
- NPM scripts: `npm run dev` (cross-env + concurrently: webpack watch + `tsc --noEmit --watch`), `npm run typecheck`, `npm run build`.
- Styles live in `src/styles.css`; configuration resides in `tailwind.config.js` and `postcss.config.js`. Webpack enables live reload (LiveReloadPlugin) and fork-ts type checking (ForkTsCheckerWebpackPlugin).
- Build output: `dist/index.js` (minified with TerserPlugin in production, source maps in development).

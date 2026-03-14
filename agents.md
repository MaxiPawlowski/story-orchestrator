# Codex Agent Brief - Story Orchestrator

## Purpose
Story Orchestrator is a ST extension that automates non-linear, checkpoint-driven stories mapped as directed graphs. It watches player turns, evaluates regex or timed triggers, and applies Author's Notes, world info toggles, preset overrides, talk-control replies, and slash-command automations while enforcing persona, group, and lore requirements.

## Goals

- Turn unstructured SillyTavern chats into authored, non-linear stories.
- Detect story-beat triggers and advance checkpoint flow automatically.
- Apply AI-side effects per checkpoint (notes, presets, world info, automations).
- Let NPCs reply autonomously at story moments via Talk Control.
- Provide a visual Studio for graph authoring/editing without raw files.

## Core Concepts

- **Checkpoints**: Story beats with effects applied on activation.
- **Transitions**: Directed edges advanced by regex, timed, arbiter, or manual triggers.
- **Arbiter**: Scheduled/manual LLM judge that decides whether to advance.
- **Talk Control**: Triggered NPC reply automation (`onEnter`, `afterSpeak`, `beforeArbiter`, `afterArbiter`).
- **Story Macros**: Runtime variables (`{{story_title}}`, `{{story_current_checkpoint}}`, `{{chat_excerpt}}`, etc.).
- **Requirements**: Persona/group/lore constraints that gate and defer side effects.

## Architecture Snapshot

- `src/services`: core runtime (`StoryOrchestrator`, `CheckpointArbiterService`, `PresetService`, `TalkControlService`, `STAPI`, talk-control submodules).
- `src/controllers`: singleton lifecycle, turn tracking, requirements, persistence (`storyRuntimeController.ts` is re-export only).
- `src/store`: Zustand vanilla session store + immutable requirement helpers.
- `src/components`: context providers, drawer, settings, Studio, shared UI.
- `src/utils`: schema/validation, persistence helpers, story library, macros, slash commands, Studio helpers.
- `src/constants`, `src/hooks`, `src/types`: defaults/keys, context/library hooks, type shims.

## Key Patterns

- `STAPI.ts` is the only ST host-import surface; host modules load via dynamic `import(/* webpackIgnore: true */ "/scripts/..." )`.
- Two React roots: settings in `#extensions_settings` and drawer in `#movingDivs`.
- Mount waits for host readiness (currently delayed with `setTimeout`) before rendering portals.
- `orchestratorManager` owns singleton lifecycle; `turnController` handles dedupe + generation epoch tracking.
- Runtime/story state persists in extension settings; selected story is also tracked per chat in local storage.
- `talkControlInterceptor` generation intercept is registered in `manifest.json` and wired from `src/index.tsx`.

## Working Style

- All responses, plans, commit messages: maximally concise, grammar optional.
- No code comments — code must be self-explanatory.
- When implementing or planning, first reference how something similar was done in this codebase.
- End every plan with a concise list of unresolved questions (skip if none).
- If you are unsure how to do something, use GitHub CLI to search code examples.

## Lifecycle & Flow
1. `src/index.tsx` mounts Drawer and Settings portals once the host UI is ready, wraps them with `ExtensionSettingsProvider` and `StoryProvider`, and registers the `talkControlInterceptor` on `globalThis`.
2. `StoryProvider` loads the story library (`storyLibrary` + `story-validator`), restores the chat's selected story from persisted state, publishes metadata via context, and ensures macros are registered.
3. `orchestratorManager.ensureStory` sanitizes arbiter settings, instantiates a singleton `StoryOrchestrator`, attaches `turnController`, seeds `TalkControlService`, and syncs `storySessionStore` with chat context.
4. `StoryOrchestrator` hydrates runtime persistence (`story-state`), hooks ST events (chat changes, generation lifecycle), registers slash commands, tracks requirements via subscription, updates macro snapshots, and monitors turn counters for trigger matches. Applies deferred checkpoint effects once requirements are satisfied.
5. Player turns, timed triggers (based on `checkpointTurnCount`), and manual `/checkpoint` commands queue `CheckpointArbiterService` jobs whenever regex rules match. Parsed outcomes advance checkpoints, persist runtime state, and reset timers in the Zustand vanilla store.
6. Checkpoint activation applies per-role Author's Notes (clearing for roles without specific notes), preset overrides (including `$arbiter` for evaluation phases), arbiter presets, world info toggles, automation slash commands, macro snapshots, and talk-control scopes. Requirements gating prevents side effects when the chat is not ready.

## Talk Control
- `TalkControlService` mirrors normalized story definitions, rebuilds role lookups via `CharacterResolver`, and tracks per-checkpoint replies (static text or LLM instructions) via `ReplySelector`.
- Queues triggers (`onEnter`, `afterSpeak`, `beforeArbiter`, `afterArbiter`), throttles actions per turn using state tracking per checkpoint, resolves character IDs from role names and group context, and dispatches replies via `MessageInjector` (`addOneMessage` or `generateGroupWrapper`).
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
- `TalkControlService` manages talk-control lifecycle with three subsystems: `CharacterResolver` (resolves role names to character IDs), `ReplySelector` (picks replies and throttles per turn), `MessageInjector` (injects static/LLM messages). Exposes generation interceptor, manages suppression depth and self-dispatch guards. Supported triggers: `onEnter`, `afterSpeak`, `beforeArbiter`, `afterArbiter` — no `onExit`.
- `storyMacros` registers macros at startup via `MacrosParser`, refreshes snapshots (title, descriptions, checkpoint summaries, trigger list, chat excerpt, player name, role aliases) whenever the orchestrator publishes new context. Role macros use the generic `story_role_<role>` pattern — `story_role_dm`/`story_role_companion` are Studio UI examples, not special-cased.
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

## Path Aliases (tsconfig + webpack)

```
@components/* → src/components/*
@services/*   → src/services/*
@hooks/*      → src/hooks/*
@utils/*      → src/utils/*
@controllers/* → src/controllers/*
@constants/*  → src/constants/*
@store/*      → src/store/*
```

## Slash Commands

```
/checkpoint list   (/cp list)   — Show checkpoints with status icons (○●✔✖)
/checkpoint prev   (/cp prev)   — Step back one checkpoint
/checkpoint eval   (/cp eval)   — Queue manual arbiter evaluation
/checkpoint <id>   (/cp <id>)   — Activate checkpoint by 1-based index or id
/checkpoint id=<id> (/cp id=<id>) — Activate checkpoint by explicit id
```

## Story Macros

| Macro | Source |
|---|---|
| `{{story_title}}` | Story title |
| `{{story_description}}` | Story description |
| `{{story_current_checkpoint}}` | Active checkpoint summary |
| `{{story_past_checkpoints}}` | Recent checkpoint history with status |
| `{{story_possible_triggers}}` | Candidate transitions |
| `{{chat_excerpt}}` | Chat transcript from arbiter snapshots |
| `{{story_player_name}}` | Player persona name |
| `{{story_role_<role>}}` | Per-role display names (dynamic) |

## Gotchas

- **storyRuntimeController.ts** is a re-export stub (`export * from "@controllers/orchestratorManager"`) — not a real controller.
- **StoryOrchestrator.ts** manual eval method is `evaluateNow()`, not `evaluateCheckpoint()`.
- **PresetService** retries UI slider sync up to 20× (100ms delay) — ST DOM may not be ready immediately.
- **Arbiter responses** parsed with fallback: raw JSON first, then markdown code fences.
- **TalkControl intercept** only aborts "loud" generations. Suppression depth + self-dispatch guards prevent recursion.
- **`dist/`** is gitignored — run `npm run build` before committing if dist needs updating.
- **`global.d.ts`** resolves ST types via relative paths (`../../../../public/global`) — only valid inside the ST repo structure.
- **Tailwind 4** uses `@tailwindcss/postcss`, not the classic `tailwindcss` PostCSS plugin.
- **Webpack fallbacks** disable `fs`, `http`, `https`, `url`, `crypto` (no node builtins in browser target).


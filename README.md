# Story Driver (SillyTavern Extension)

## Overview
Story Driver is a checkpoint-driven orchestration layer for SillyTavern. Stories are authored as directed graphs where each checkpoint defines win/fail triggers, required lore, and runtime effects. The extension watches player turns, evaluates triggers, activates the next checkpoint when conditions are met, and applies contextual injections (Author’s Notes, World Info toggles, preset overrides). Requirement readiness (persona, group chat, roles, lore) is tracked before any automation runs.

## Extension Capabilities
- Pinned Drawer UI surfaces requirement status, checkpoint progress, turn counters, and manual controls.
- Settings panel injects arbiter configuration, Checkpoint Studio access, and story library management.
- Bundled JSON checkpoints (`src/checkpoints/*.json`) are validated on load; user-authored stories persist inside the SillyTavern settings namespace.
- DM/Companion runtime orchestration handles preset cloning, per-role overrides, Author’s Note assignment, and lore toggling.
- Per-chat persistence snapshots checkpoint index, status map, and evaluation counters so stories resume when chats reopen.
- Slash commands provide manual control over checkpoints and story runtime toggles (`/checkpoint`, `/story`).
- Custom Story Driver macros expose active story metadata for use in Author’s Notes, lore entries, and prompt fragments.

## Slash Commands

Story Driver registers two slash command entry points inside SillyTavern:

- `/checkpoint` (aliases `/cp`, `/storycp`):
	- `list` / `status` (default) – display all checkpoints with status markers.
	- `next`, `prev` – jump forward/backward one checkpoint.
	- `id`/index – activate a checkpoint by numeric index or explicit id (`/checkpoint 2`, `/checkpoint id=cp3`).
- `/story` (aliases `/storyctl`, `/storydriver`):
	- `status` – print orchestrator readiness, turn counters, requirement flags, persistence state.
	- `reset` – rewind to the story’s starting checkpoint and clear counters.
	- `eval` – queue a manual arbiter evaluation for the active checkpoint.
	- `persist` – force a runtime snapshot (when group chat + chat id are present).
	- `pause` / `resume` / `toggle` – control automated turn listening.

These commands are safe to call from any chat where the extension is active; errors are reported inline in the chat log.

## Story Macros

The extension registers a macro set via SillyTavern’s `MacrosParser`, making story metadata available anywhere macros are expanded (Author’s Notes, lorebook entries, world info, prompt templates, etc.).

| Macro | Description |
|-------|-------------|
| `{{story_active_title}}` | Active story title |
| `{{story_role_<role>}}` | Localized role name strings for each role defined in the current story (e.g., `{{story_role_dm}}` if a `dm` role exists) |
| `{{story_player_name}}` | Current user name resolved from requirements state |
| `{{story_active_checkpoint_id}}` | Active checkpoint id |
| `{{story_active_checkpoint_name}}` | Active checkpoint name |
| `{{story_active_checkpoint_objective}}` | Active checkpoint objective |
| `{{story_turn}}` | Total turn count processed by Story Driver |
| `{{story_turns_since_eval}}` | Turns since the arbiter last evaluated |
| `{{story_checkpoint_turns}}` | Turns spent inside the active checkpoint |

Example usages:

```text
Author’s Note: {{story_role_dm}} should brief {{story_player_name}} on {{story_active_checkpoint_objective}}.
Lore Entry: Current phase – {{story_active_checkpoint_name}} (turn {{story_turn}}).
```

Additional macros can be registered by calling `MacrosParser.registerMacro` within the extension runtime (see `src/services/storyMacros.ts`).

## Repository Layout
- `src/index.tsx` – Entry point; mounts Settings + Drawer roots under `ExtensionSettingsProvider` and `StoryProvider`.
- `src/components/` – React UI for Drawer panels, Settings shells, Checkpoint Studio editors, and shared widgets.
- `src/components/context/` – `ExtensionSettingsContext` (runtime config persistence) and `StoryContext` (story selection, checkpoint summaries, requirement flags).
- `src/controllers/` – Imperative managers: orchestrator lifecycle, requirements tracking, persistence, turn routing, slash command wiring.
- `src/services/` – Stateful logic: `StoryOrchestrator`, `CheckpointArbiterService`, `PresetService`, `SillyTavernAPI` host wrapper.
- `src/store/` – Zustand vanilla store (`storySessionStore`) and requirement state helpers.
- `src/utils/` – Story loading/validation, checkpoint studio helpers, event subscriptions, runtime math, slash command registration.
- `src/checkpoints/` – Numeric JSON assets (0.json, 1.json, …) bundled for shipping and mirrored into `dist/checkpoints/` at build time.

## Runtime Flow
1. Extension mounts; Settings + Drawer roots appear after a brief delayed mount.
2. `StoryProvider` discovers bundled checkpoints via `json-bundle-loader` → `story-loader` → `story-validator`, normalizing regex triggers and activation payloads.
3. `orchestratorManager.ensureStory` creates a singleton `StoryOrchestrator` once a valid story and group chat are detected.
4. The orchestrator hydrates persisted runtime (if available), primes role presets, and subscribes to SillyTavern host events.
5. Player turns increment `turnsSinceEval`; interval thresholds or regex matches enqueue evaluations handled by `CheckpointArbiterService`.
6. Arbiter outcomes (`continue`, `win`, `fail`) update checkpoint status, optionally follow transitions, and reset evaluation counters as configured.
7. Activating a checkpoint applies world info toggles, per-role Author’s Notes, preset overrides, and persists the new runtime snapshot.

## React Layer & Contexts
- `StoryContext` exposes normalized story metadata, checkpoint summaries, runtime counters, requirement flags, and story library operations. It synchronizes persisted story selection per chat and reacts to chat change events.
- `ExtensionSettingsContext` stores arbiter prompt/frequency inside the extension settings tree with sanitization (length clamp, numeric bounds) before forwarding to the orchestrator manager.
- Hooks (`useStoryOrchestrator`, `useStoryLibrary`, etc.) bridge the Zustand store and orchestrator manager into UI components while keeping lifecycle code isolated from React views.

## Services, Controllers & Utilities
- `StoryOrchestrator` coordinates checkpoint activation, trigger evaluation, preset + Author’s Note application, world info toggles, requirement polling, chat context changes, and persistence reconciliation.
- `orchestratorManager` enforces a single orchestrator instance, clamps interval turns/prompt length, forwards turn/evaluation callbacks, and owns the `turnController`.
- `requirementsController` listens to persona, chat, and lorebook changes via host events; it normalizes role names and updates requirement readiness (persona, group chat, role membership, lore entries, global lorebook selection).
- `persistenceController` snapshots runtime per `(chatId + story title)` using helpers in `story-state`, ensuring hydration only occurs when group chat context exists.
- `CheckpointArbiterService` compiles win/fail regex specs, renders a parameterized prompt, evaluates queued turns, and selects outgoing transitions.
- Utility modules cover story normalization (`story-validator` + `story-schema`), runtime math (`story-state`), multi-strategy bundle discovery (`json-bundle-loader`), event helpers, and slash command registration.

## State Management & Persistence
- `storySessionStore` tracks the active story, runtime snapshot (`checkpointIndex`, `activeCheckpointKey`, `checkpointStatusMap`, `turnsSinceEval`), turn counter, hydration flag, requirement state, chat context, and orchestrator readiness.
- Store actions sanitize inputs, derive checkpoint status maps, and provide setters consumed by services/controllers to keep UI, persistence, and runtime in sync.
- Persistence is opt-in per chat: when a story, chatId, and group chat selection exist, runtime is serialized; hydration avoids replaying activation side effects unless the checkpoint index changes.

## Checkpoint Content & Story Library
- Bundled stories live under `src/checkpoints/` and are ordered numerically. `story-loader` sorts, validates, and logs detailed errors when schema checks fail.
- `storyLibrary.ts` merges bundled entries with saved drafts stored in extension settings (`studio` namespace). Entries normalize into `NormalizedStory` objects exposed through `StoryContext`.
- `story-validator` compiles triggers, builds transition adjacency maps, and normalizes activation blocks (`authors_note`, `world_info`, `preset_overrides`) so runtime code can rely on consistent shapes.

## Checkpoint Studio
- `src/components/studio/` provides a multi-pane editor: story details, checkpoint CRUD, diagnostics, Cytoscape/ dagre graph visualization, and a toolbar for import/export actions.
- `utils/checkpoint-studio.ts` defines draft models, regex/string helpers, Mermaid graph generation, and cleanup utilities for converting drafts back into schema-compliant stories.
- Studio state persists through the story library helpers, letting authors save, rename, and reload custom stories without leaving SillyTavern.

## Settings & Host Integration
- Runtime configuration (arbiter prompt + interval) is persisted via `ExtensionSettingsContext` and sanitized before reaching `orchestratorManager`.
- `SillyTavernAPI` wraps host globals (event bus, world info toggles, Author’s Note helpers, preset cloning, settings persistence) to keep build tooling decoupled from the SillyTavern runtime.
- `slashCommands.ts` registers extension-specific slash commands during orchestrator initialization, enabling manual checkpoint control or diagnostics hooks.

## Development
- Install dependencies: `npm install`
- Start watch + typecheck mode: `npm run dev`
- One-off type checking: `npm run typecheck`
- Production build (emits `dist/index.js` and copies assets): `npm run build`
- Tailwind configuration lives in `tailwind.config.js`; global styles extend `src/styles.css` and are processed through the webpack pipeline.

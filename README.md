# Story Orchestrator

Story Orchestrator is a checkpoint-driven automation layer for SillyTavern that keeps story roles (DM, companion, narrators, or any custom cast you define) synchronized with the player. It models stories as directed graphs, watches every chat turn, evaluates transition triggers, and applies Author's Notes, world info toggles, preset overrides, slash command automations, and talk-control replies only when the active chat satisfies persona, lore, and group membership requirements.

## Feature Highlights
- **Checkpoint automation**: `StoryOrchestrator` advances checkpoints via regex or interval triggers, hydrates presets per role (including the arbiter role), runs `/` command automations, and toggles world info entries when checkpoints activate.
- **Adaptive talk control**: `talkControlManager` attaches to SillyTavern's generation pipeline, queues replies configured per checkpoint, and injects static or LLM-driven responses on `afterSpeak`, `beforeArbiter`, `afterArbiter`, `onEnter`, and `onExit` hooks without breaking group chat flow.
- **Live story macros**: `storyMacros` registers macros (title, checkpoint summaries, trigger candidates, chat excerpts, role aliases, player name) that refresh whenever the runtime or turn counter changes, so presets, Author's Notes, and lore entries stay in sync.
- **Turn routing + dedupe**: `turnController` listens to SillyTavern host events, filters duplicate/empty user messages, tracks the speaking persona, and tells the orchestrator which role is currently generating so preset application stays targeted.
- **Requirements dashboard**: Drawer UI surfaces persona readiness, group membership gaps, global lorebook state, missing world info entries, and recent checkpoint completions before automation is allowed to run.
- **Story library + studio**: `useStoryLibrary` persists stories inside SillyTavern settings, while the Checkpoint Studio editor (Cytoscape + dagre graph, diagnostics, CRUD) lets authors maintain schemas, automations, and talk-control replies directly in the host.
- **Slash commands**: `/checkpoint` (`/cp`) supports `list`, `prev`, `eval`, explicit checkpoint activation, and named arguments. Additional commands fire via checkpoint automations or Checkpoint Studio utilities.

## Runtime Lifecycle
1. `src/index.tsx` mounts Drawer + Settings portals after SillyTavern loads, registers the talk-control interceptor on `globalThis`, and wraps the apps with `ExtensionSettingsProvider` and `StoryProvider`.
2. `StoryProvider` loads the persisted story library (`storyLibrary` + `story-validator`), restores the chat's previously selected story, and ensures macros exist. Selecting a story calls `orchestratorManager.ensureStory`.
3. The orchestrator manager sanitizes arbiter settings, spins up a singleton `StoryOrchestrator`, attaches the `turnController`, seeds `talkControlManager`, and synchronizes the Zustand store (`storySessionStore`) with chat context.
4. `StoryOrchestrator` hydrates runtime state (`story-state` persistence), registers slash commands, primes presets, subscribes to host events, and updates macros with checkpoint context, transition summaries, and chat excerpts.
5. Each user turn increments `turn`/`turnsSinceEval`, resolves transition regex matches, and queues evaluations through `CheckpointArbiterService`. Timed intervals and manual `/checkpoint eval` commands reuse the same queue.
6. Arbiter evaluations execute via SillyTavern's `generateRaw`, parse JSON-only replies, apply role-specific arbiter presets, and call `storySessionStore` reducers to advance checkpoints, persist snapshots, and reset timers.
7. Activating a checkpoint applies Author's Notes, preset overrides, world info toggles, automation slash commands, macro snapshots, talk-control checkpoint scopes, and updates the UI states exposed by `StoryContext`.
8. `talkControlManager` listens for `MESSAGE_RECEIVED`, generation lifecycle events, and arbiter phases. It can abort quiet generations, enqueue static/LLM replies, and throttle talk-control actions per turn while respecting intercept suppression.

## Story Schema Essentials
- **Checkpoints & transitions**: Directed graph with explicit IDs. Transitions support `regex` (with labeled pattern lists) and `timed` triggers; multiple triggers per checkpoint are evaluated and prioritized by regex matches.
- **On-activate payloads**: `authors_note`, `preset_overrides`, `arbiter_preset`, `world_info`, and `automations` (slash command sequences) are normalized and executed atomically when checkpoints activate or hydrate.
- **Talk Control**: Optional `talkControl` section (camelCase or snake_case) defines per-checkpoint reply lists. Replies carry probability gates, static text or LLM instructions, and trigger hooks (`onEnter`, `afterSpeak`, etc.). Normalization maps IDs to story roles and exposes replies via `NormalizedCheckpoint.talkControl`.
- **Roles & defaults**: Role metadata powers macro aliases, preset defaults, automations, and requirement validation. `role_defaults` and `author_note_defaults` provide fallbacks when checkpoints omit overrides.

## Key React Surfaces
- `src/components/drawer` --Requirement badges, checkpoint progress, and a summary of the last queued arbiter evaluation.
- `src/components/settings` --Inline drawer for arbiter prompt/frequency, library selection, and Checkpoint Studio launcher.
- `src/components/studio` --Story editors, diagnostics, regex helpers, automations tab, and the Cytoscape/dagre graph view (`GraphPanel`).
- `src/components/context` --`ExtensionSettingsContext` sanitizes/persists arbiter settings; `StoryContext` exposes story metadata, checkpoint summaries, requirement flags, runtime counters, and CRUD helpers to the rest of the UI.

## Controllers & Services
- `orchestratorManager` --Singleton lifecycle for `StoryOrchestrator`, wiring turn hooks, arbiter settings, and talk control.
- `turnController` --Watches host events (`MESSAGE_SENT`, `GENERATION_STARTED`, etc.) to forward deduped user text and set active roles before preset application.
- `requirementsController` --Polls host context, persona name, group membership, and lorebook settings; publishes requirement readiness to the store.
- `persistenceController` --Loads/saves checkpoint state keyed by `(chatId + story title)` using helpers in `story-state`.
- `CheckpointArbiterService` --Builds evaluation prompts, snapshots recent chat history, queues SillyTavern `generateRaw` calls, parses JSON results, and hydrates macro excerpts.
- `PresetService` --Clones current/named presets, applies per-role overrides, syncs SillyTavern UI sliders, and resets when stories change.
- `talkControlManager` --Queues talk-control triggers, resolves speaker IDs, dispatches static and LLM replies, and exposes an interceptor for quiet generation aborts.
- `SillyTavernAPI` --Thin facade over host globals (event bus, settings persistence, world info operations, preset helpers, slash command execution).

## State & Persistence
- `storySessionStore` (Zustand vanilla) tracks active story metadata, chat context, runtime (`checkpointIndex`, `activeCheckpointKey`, `turnsSinceEval`, `checkpointTurnCount`, `checkpointStatusMap`), requirement state, and orchestrator readiness.
- `story-state` sanitizes runtime payloads, clamps indices, derives checkpoint status maps, persists state per chat, and exposes helpers for macros and UI summaries.
- `requirementsState` implements immutable helpers for diffing, cloning, and equality checks to avoid redundant store updates.

## Story Macros
Registered through `MacrosParser` at startup and updated by `storyMacros`:

| Macro | Description |
| --- | --- |
| `{{story_title}}` | Current story title (falls back to runtime snapshot). |
| `{{story_description}}` | Sanitized description captured from `StoryOrchestrator`. |
| `{{story_current_checkpoint}}` | Multi-line summary of the active checkpoint. |
| `{{story_past_checkpoints}}` | Recent checkpoint history with status labels. |
| `{{story_possible_triggers}}` | Labeled list of candidate transitions. |
| `{{chat_excerpt}}` | Chat transcript excerpt mirrored from arbiter snapshots. |
| `{{story_player_name}}` | Player persona name pulled from requirements. |
| `{{story_role_<role>}}` | Story role display names, plus `story_role_dm`/`story_role_companion` aliases. |

Macros update automatically whenever checkpoints change, evaluations run, or the turn counter increments.

## Slash Commands
- `/checkpoint list` --Show checkpoints with status and active marker.
- `/checkpoint prev` --Step back one checkpoint (automation pause recommended).
- `/checkpoint eval` --Queue a manual arbiter evaluation at the current node.
- `/checkpoint <id>` or `/checkpoint id=<id>` --Activate a specific checkpoint.
- Checkpoint `automations` allow per-node slash command batches (e.g., `/bg`, `/char`, diagnostics).

## Project Layout
```
src/
  index.tsx                      # Entry; mounts settings + drawer, registers talk-control interceptor
  Apps.tsx                       # Host mount points (if needed outside the portal flow)
  components/
    drawer/                      # Requirements + checkpoint panels
    settings/                    # Arbiter controls and Checkpoint Studio modal
    studio/                      # Story editor, diagnostics, graph, toolbar
    context/                     # ExtensionSettingsContext + StoryContext providers
    common/RequirementIndicator  # Shared requirement pill component
  controllers/                   # Orchestrator manager, requirements, persistence, turn & talk control
  services/                      # StoryOrchestrator, CheckpointArbiterService, PresetService, macros
  store/                         # Zustand store + requirement state helpers
  utils/                         # Story schema/validator, story-state helpers, library, slash commands, studio utils
  constants/                     # Arbiter defaults, preset keys, clamps
  hooks/                         # React hooks for orchestrator, context, library access
  stories/                       # Sample story JSON (e.g., lost-key.json)
notes/                           # Design sketches, lore/lorebook experiments
manifest.json                    # SillyTavern extension manifest
package.json                     # Dependencies and scripts (React 19, TS 5, Tailwind 4)
tailwind.config.js               # Tailwind theme
webpack.config.js                # Build + live-reload pipeline
```

## Development
- Install dependencies: `npm install`
- Start watch + live typecheck: `npm run dev` (alias: `npm start`)
- Type-check once: `npm run typecheck`
- Production bundle (`dist/index.js`): `npm run build`
- Tailwind 4 is wired through `postcss.config.js`; global styles live in `src/styles.css`

Testing inside SillyTavern:
1. Enable the extension from the host settings.
2. Import or author a story via Checkpoint Studio and select it in the Story Orchestrator settings drawer.
3. Verify requirement badges, talk-control replies, macros, slash commands, and automations while stepping through checkpoints in a group chat with the required personas and lore.




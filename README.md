# Story Driver (SillyTavern Extension)

## Overview
Story Driver is a checkpoint-driven automation layer for SillyTavern. Stories are modeled as directed graphs whose checkpoints define runtime effects, win/fail triggers, and lore prerequisites. The extension keeps DM and companion personas synchronized with the player by tracking turns, executing arbiter evaluations, switching checkpoints, and applying contextual injections only when all requirements are satisfied.

## Key Features
- Drawer UI shows requirement readiness, checkpoint progress, active turn counters, and manual activation controls.
- Settings panel exposes arbiter prompt/frequency controls, Checkpoint Studio, and the persisted story library.
- Checkpoint Studio supports story CRUD, diagnostics, and Cytoscape + dagre graph visualization inside SillyTavern.
- Runtime orchestration handles preset cloning, per-role Author's Notes, world info toggles, and macro hydration on activation.
- Per-chat persistence resumes checkpoint state, status map, and evaluation counters whenever a chat is reopened.
- Slash commands (`/checkpoint`, `/story`, `/arbiter`) provide manual control over checkpoints, automation, persistence, and arbiter runs.
- A rich macro set exposes live story metadata for Author's Notes, world info, and prompt templates.

## Slash Commands
The extension registers three command entry points. All commands can be issued from chats where Story Driver is active; errors are reported inline.

### /checkpoint (`/cp`, `/storycp`)
- `list` or `status` displays every checkpoint with status markers and highlights the active node.
- `next` and `prev` step forward/backward one checkpoint when automation is paused or manual intervention is needed.
- Passing an index (`/checkpoint 2`) or explicit id (`/checkpoint id=finale`) activates that checkpoint immediately.

### /story (`/storyctl`, `/storydriver`)
- `status` prints orchestrator readiness, turn totals, checkpoint turns, persistence state, and requirement flags.
- `reset` rewinds to the first checkpoint and clears counters; `persist` forces a runtime snapshot when chat context is valid.
- `eval` queues a manual arbiter evaluation; `pause`, `resume`, and `toggle` control automatic turn listening.

### /arbiter (`/st-arb`, `/storyarb`)
- `run` (default), `eval`, or `trigger` queues an immediate arbiter evaluation with an optional `reason` (`manual`, `trigger`, `timed`, `interval`).
- Commands accept either `/arbiter run reason=manual` or shorthand `/arbiter manual`.

## Story Macros
Macros are registered through SillyTavern's `MacrosParser` and update live as runtime state changes.

| Macro | Description |
|-------|-------------|
| `{{story_active_title}}`, `{{story_title}}` | Current story title (raw and sanitized snapshot). |
| `{{story_description}}` | Sanitized story description for prompt injection. |
| `{{story_active_checkpoint_id}}` | Active checkpoint id. |
| `{{story_active_checkpoint_name}}` | Active checkpoint name. |
| `{{story_active_checkpoint_objective}}` | Active checkpoint objective. |
| `{{story_current_checkpoint}}` | Multi-line summary of the active checkpoint. |
| `{{story_past_checkpoints}}` | Recent checkpoint history with status labels. |
| `{{story_possible_triggers}}` | Formatted list of current transition candidates. |
| `{{chat_excerpt}}` | Recent chat transcript snapshot used for arbiter prompts. |
| `{{story_turn}}` | Total processed turns. |
| `{{story_turns_since_eval}}` | Turns since the arbiter last evaluated. |
| `{{story_checkpoint_turns}}` | Turns spent inside the active checkpoint. |
| `{{story_player_name}}` | Active player name sourced from requirements. |
| `{{story_role_<role>}}` | Role display names for every role defined in the story (plus `story_role_dm` and `story_role_companion`). |

Use these macros anywhere SillyTavern expands templates (Author's Notes, lore entries, world info, preset prompts). Additional macros can be registered by calling `MacrosParser.registerMacro` inside `src/services/storyMacros.ts`.

## Runtime Lifecycle
1. The extension waits for host surfaces, then mounts Drawer and Settings roots under `ExtensionSettingsProvider` and `StoryProvider` after a short delay.
2. `StoryProvider` loads the persisted story library via `storyLibrary` and `story-validator`, normalizes triggers, and subscribes to chat-change events.
3. `orchestratorManager.ensureStory` spins up a singleton `StoryOrchestrator` when a valid story and group chat context are detected.
4. `StoryOrchestrator` hydrates persisted runtime, primes presets, registers macros, and hooks requirement polling + host events.
5. Each player turn increments counters in the shared Zustand store; interval thresholds or regex matches queue evaluations in `CheckpointArbiterService`.
6. Arbiter outcomes (`advance` or `continue`) update checkpoint statuses, optionally follow transitions, and persist runtime snapshots per `(chatId + story title)`.
7. Activating a checkpoint applies role-specific Author's Notes, preset overrides, world info toggles, macro snapshots, and updates Drawer UI state.

## Architecture Notes
- **React surfaces**: `src/index.tsx` handles delayed mounting; `src/Apps.tsx` exports `SettingsApp` and `LoreManagerApp` for host-driven mounting; Drawer and Settings shells live under `src/components/`.
- **Contexts & hooks**: `ExtensionSettingsContext` persists sanitized arbiter settings; `StoryContext` exposes story metadata, checkpoint summaries, requirement flags, and library CRUD; hooks (`useStoryOrchestrator`, `useStoryLibrary`, `useStoryContext`) bridge services and UI.
- **Controllers & services**: `orchestratorManager` enforces a single orchestrator instance and manages automation pause/resume via `turnController`; `requirementsController` tracks persona, lore, and group membership; `persistenceController` manages checkpoint snapshots; `CheckpointArbiterService` renders prompts, records chat excerpts, and parses model responses; `PresetService` applies overrides; `SillyTavernAPI` wraps host globals.
- **State management**: `storySessionStore` (Zustand vanilla) tracks runtime, turn totals, requirement state, orchestration readiness, chat context, and sanitized checkpoint status maps. Helpers in `src/store/requirementsState.ts` keep diffing and equality checks efficient.
- **Utilities**: `utils/story-validator.ts` normalizes stories; `utils/story-state.ts` handles runtime math and persistence keys; `utils/checkpoint-studio.ts` powers studio draft models, regex helpers, and Mermaid exports; `utils/slashCommands.ts` wires commands and automation toggles.

## Project Structure
```
src/
	Apps.tsx                  # Exported mount points for host-side integration
	index.tsx                 # Entry; mounts settings + drawer portals under providers
	styles.css                # Tailwind-driven global styling hooks
	components/
		drawer/                 # Drawer panels: requirements, checkpoints, runtime indicators
		settings/               # Settings shell plus Checkpoint Studio UI
		studio/                 # Studio editors, diagnostics panel, graph view, toolbar
		context/                # ExtensionSettingsContext and StoryContext providers
		common/RequirementIndicator/ # Shared UI widget for requirement badges
	controllers/              # Orchestrator, persistence, requirements, turn routing
	services/                 # StoryOrchestrator, CheckpointArbiterService, PresetService, SillyTavernAPI adapter
	store/                    # storySessionStore (Zustand) and requirement state helpers
	utils/                    # Story schema, validator, library, event helpers, slash command wiring
	constants/                # Arbiter defaults, runtime clamps, preset keys
	hooks/                    # React hooks for orchestrator, context, and library access
	stories/                  # Sample stories (e.g., lost-key.json)
notes/                      # Design sketches, lorebook ideas, scratchpad content
manifest.json               # SillyTavern extension manifest
package.json                # Dependencies and scripts (webpack + Tailwind pipeline)
tailwind.config.js          # Tailwind configuration (v4)
webpack.config.js           # Build configuration with live reload + type checking
```

## Development
- Install dependencies: `npm install`
- Start watch + live typecheck: `npm run dev` (`npm start` aliases to the same command)
- Run type checking once: `npm run typecheck`
- Create a production bundle (`dist/index.js`): `npm run build`
- Tailwind 4 is wired through `postcss.config.js`; global styles live in `src/styles.css`

When testing inside SillyTavern, enable the extension, import a story via Checkpoint Studio, and verify checkpoint automation, slash commands, and macros across persona presets, world info, and Author's Notes.

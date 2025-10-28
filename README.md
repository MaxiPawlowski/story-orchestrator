# Story Orchestrator

ST Story Orchestrator treats every adventure as a non-linear sequence of checkpoints linked in a directed graph, keeping story roles (DM, companion, narrators, or any custom cast you define) synchronized with the player while only advancing when persona, lore, and group membership requirements are satisfied.

## Feature Highlights
- **Checkpoint automation**: `StoryOrchestrator` advances checkpoints on timed triggers (monitoring `checkpointTurnCount`), snapshots the graph at each turn, and keeps runtime state aligned even when stories loop or branch.
- **Arbiter evaluations**: Regex triggers queue `CheckpointArbiterService`, which snapshots recent chat (last N messages reversed), calls ST's `generateRaw` with JSON-only prompts enforced, handles both raw JSON and code-fenced responses, and applies the model's verdict to choose the next checkpoint.
- **Preset automation**: `PresetService` refreshes sliders and overrides the moment a checkpoint activates, creating a runtime-only preset (named `Story:<storyId>`) so saved configs stay untouched; supports role-specific overrides including `$arbiter` for evaluation phases. Note: Requires `setSettingByName` exported from `public\scripts\textgen-settings.js` so the UI mirrors the changes.
- **Author's Notes automation**: Checkpoint events apply per-role Author's Notes, mixing defaults and overrides to keep narration and character voices on-model automatically.
- **World info automation**: Checkpoints light up or disable world info entries in sync with story beats, so lore unlocks exactly when the scene calls for it.
- **Adaptive talk control**: Talk control watches for player turns and pending responses, drops in gentle prompts or full character replies, and aborts loud (not quiet) generations whenever a scripted reaction needs to land first. Manages intercept suppression and self-dispatch guards to prevent recursion.
- **Turn routing + dedupe**: `turnController` listens to host events (`MESSAGE_SENT`, `GENERATION_STARTED`, `IMPERSONATE_READY`, etc.), filters duplicate/empty user messages via signature-based deduplication, tracks the active speaking role (by monitoring character names and draft contexts), and ensures preset application is targeted per role per generation epoch.
- **Requirements dashboard**: Drawer UI surfaces persona readiness, group membership gaps, global lorebook state, missing world info entries, and recent checkpoint completions before automation is allowed to run.
- **Story library + studio**: `useStoryLibrary` persists stories inside extension settings, while the Checkpoint Studio editor lets authors maintain schemas, automations, and talk-control replies directly in the host UI. Studio includes graph visualization (Cytoscape + dagre), diagnostics panel, and helpers for regex testing and Mermaid export.
- **Macros**: `storyMacros` registers macros (title, checkpoint summaries, trigger candidates, chat excerpts, role aliases, player name) that refresh whenever the runtime or turn counter changes, so presets, Author's Notes, and lore entries stay in sync.
- **Slash commands**: `/checkpoint` (`/cp`) supports `list`, `prev`, `eval`, explicit checkpoint activation, and named arguments. Additional commands fire via checkpoint automations or Checkpoint Studio utilities.

<img width="834" height="586" alt="{1CADC0CF-CAAB-40C7-92F4-1BEE3AF14920}" src="https://github.com/user-attachments/assets/0316efed-f851-4b3b-945d-c275b491a50e" />
<img width="821" height="525" alt="{4328B6CD-2285-4DEC-BA6D-C7A37AA8CFFD}" src="https://github.com/user-attachments/assets/2542fe7c-0615-4b7b-82e3-61e4fef17679" />
<img width="829" height="537" alt="{D30CE9D4-82B1-47FB-8870-747001CE1299}" src="https://github.com/user-attachments/assets/5d233b5d-6104-4a97-881a-1c4873983926" />
<img width="818" height="480" alt="{E572E280-03C1-4731-AD95-22696D2AE1AC}" src="https://github.com/user-attachments/assets/4f561b5d-d1dc-465c-be22-f3aaac60c882" />
<img width="818" height="473" alt="{E0FA58B0-D57D-4902-9BE6-2169215CF5D4}" src="https://github.com/user-attachments/assets/56b5e6a5-2fa3-431f-9363-b21071d7d903" />
<img width="830" height="430" alt="{39F00F34-5E0F-4750-A353-E194426D9E69}" src="https://github.com/user-attachments/assets/e3346aca-6025-424e-9ff1-7c89ff0cb137" />
<img width="823" height="385" alt="{41B344A9-D816-4B3D-B368-29663440094F}" src="https://github.com/user-attachments/assets/c14f56e5-29b8-40b0-aacb-417eb622703f" />
<img width="819" height="392" alt="{2F425582-82E7-41CD-B97B-119C6176C63E}" src="https://github.com/user-attachments/assets/be753133-9c2d-40e2-b11f-9dae69d6f2fc" />

There's a sample story under "stories\sun-ruins\quest-for-the-sun-ruins.json"

## Runtime Lifecycle
1. `src/index.tsx` mounts Drawer + Settings portals after the host loads (with a 2-second delay for stability), registers the talk-control interceptor on `globalThis`, and wraps the apps with `ExtensionSettingsProvider` and `StoryProvider`.
2. `StoryProvider` loads the persisted story library (`storyLibrary` + `story-validator`), restores the chat's previously selected story from persisted state, and ensures macros are registered. Selecting a story calls `orchestratorManager.ensureStory`.
3. The orchestrator manager sanitizes arbiter settings, instantiates a singleton `StoryOrchestrator`, attaches the `turnController`, seeds `TalkControlService`, and synchronizes the Zustand vanilla store (`storySessionStore`) with chat context.
4. `StoryOrchestrator` hydrates runtime state (`story-state` persistence), registers slash commands, initializes `PresetService`, subscribes to host events, starts the `requirementsController`, and updates macros with checkpoint context, transition summaries, and chat excerpts.
5. Each user turn increments `turn`/`turnsSinceEval`, resolves transition regex matches, and queues evaluations through `CheckpointArbiterService`. Timed transitions trigger automatically when `checkpointTurnCount` reaches threshold. Manual `/checkpoint eval` commands also use the same queue.
6. Arbiter evaluations execute via ST's `generateRaw`, parse JSON-only replies, apply role-specific arbiter presets (using `$arbiter` role key), and emit events to advance checkpoints, persist snapshots, and reset timers via `storySessionStore` reducers.
7. Activating a checkpoint applies Author's Notes, preset overrides, world info toggles, automation slash commands, macro snapshots, talk-control checkpoint scopes, and updates the UI states exposed by `StoryContext`. Checkpoint effects are deferred if requirements are not satisfied, then applied once requirements are met.
8. `TalkControlService` listens for `MESSAGE_RECEIVED`, generation lifecycle events (`GENERATION_STARTED`, `GENERATION_STOPPED`, `GENERATION_ENDED`), and arbiter phases. It can abort loud (not quiet) generations via the interceptor, enqueue static/LLM replies, and throttle talk-control actions per turn while managing intercept suppression depth and self-dispatch guards.

## Key React Surfaces
- `src/components/drawer` --Requirement badges (persona, group members, world info, global lorebook), checkpoint progress indicator, and a summary of the last queued arbiter evaluation.
- `src/components/settings` --Inline drawer for arbiter prompt/frequency configuration, story library selection, reload button, and Checkpoint Studio launcher.
- `src/components/studio` --Story editors (metadata, roles, talk control defaults), checkpoint editor with tabbed interface (Basics, Transitions, Author Notes, Preset Overrides, World Info, Automations, Talk Control), diagnostics panel with validation and error display, regex testing helpers, and the Cytoscape/dagre graph view (`GraphPanel`) with interactive node navigation.
- `src/components/context` --`ExtensionSettingsContext` sanitizes/persists arbiter settings using `utils/arbiter`; `StoryContext` exposes story metadata, checkpoint summaries with status, requirement flags, runtime counters, library CRUD helpers, and persona reload hooks to the rest of the UI.

## Controllers & Services
- `orchestratorManager` --Singleton lifecycle for `StoryOrchestrator`, wiring turn hooks, arbiter settings, and talk control. Provides pause/resume automation controls via `pauseAutomation()` and `resumeAutomation()`.
- `turnController` --Watches host events (`MESSAGE_SENT`, `GENERATION_STARTED`, `GENERATION_STOPPED`, `GENERATION_ENDED`, `IMPERSONATE_READY`, etc.) to forward deduped user text and set active roles before preset application. Uses epoch-based generation tracking and signature-based message deduplication.
- `requirementsController` --Polls host context, persona name, group membership, and lorebook settings; publishes requirement readiness to the store. Listens to persona reload and chat context change events. Validates story role requirements and world info entry presence.
- `persistenceController` --Loads/saves checkpoint state keyed by `(chatId + story title)` using helpers in `story-state`. Manages hydration state and checkpoint status maps.
- `CheckpointArbiterService` --Builds evaluation prompts from arbiter template, snapshots recent chat history (last N messages reversed), calls ST's `generateRaw` with JSON-only mode enforced, parses JSON results (handling both raw JSON and code-fenced responses), and emits outcomes used to advance checkpoints. Updates `chat_excerpt` macro during evaluation.
- `PresetService` --Creates and manages runtime-only preset (named `Story:<storyId>`), applies per-role overrides (including `$arbiter` role for evaluation phases), syncs ST's UI sliders via `setSettingByName` (requires export from `public\scripts\textgen-settings.js`), handles logit bias merging, and resets when stories change.
- `TalkControlService` --Queues talk-control triggers (`onEnter`, `onExit`, `afterSpeak`, `beforeArbiter`, `afterArbiter`), resolves speaker IDs via `CharacterResolver`, selects replies via `ReplySelector`, dispatches messages via `MessageInjector`, exposes an interceptor for generation aborts (loud generations only), manages intercept suppression and self-dispatch depth guards, and throttles actions per turn.
- `STAPI` --Thin facade over host globals (event bus, settings persistence, world info operations, preset helpers, slash command execution, character lookups, chat operations) so services stay decoupled from runtime globals.

## State & Persistence
- `storySessionStore` (Zustand vanilla) tracks active story metadata, selected library key, chat context (`chatId`, `groupChatSelected`), runtime (`checkpointIndex`, `activeCheckpointKey`, `turnsSinceEval`, `checkpointTurnCount`, `checkpointStatusMap`), overall turn counter, hydration flag, requirement state snapshot, and orchestrator readiness flag.
- `story-state` sanitizes runtime payloads, clamps indices, derives checkpoint status maps from explicit overrides and current position, persists state per chat in extension settings, and exposes helpers for macros and UI summaries.
- `requirementsState` implements immutable helpers for diffing, cloning, and equality checks to avoid redundant store updates. Tracks `requirementsReady`, `currentUserName`, `personaDefined`, `groupChatSelected`, `missingGroupMembers`, `worldLoreEntriesPresent`, `worldLoreEntriesMissing`, `globalLoreBookPresent`, and `globalLoreBookMissing`.

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

## Build & Tooling
- React 19, TypeScript 5, Zustand 5 (vanilla), Cytoscape + cytoscape-dagre, Tailwind 4 (via @tailwindcss/postcss + PostCSS).
- NPM scripts: `npm run dev` (concurrently runs webpack watch mode + `tsc --noEmit --watch`), `npm run typecheck`, `npm run build` (production build).
- Styles live in `src/styles.css`; configuration resides in `tailwind.config.js`. Webpack uses LiveReloadPlugin for live reload and ForkTsCheckerWebpackPlugin for parallel type checking.
- Build output goes to `dist/index.js` (with source maps in development mode).

## Slash Commands
- `/checkpoint list` (alias: `/cp list`) --Show checkpoints with status and active marker. Status icons: ○ (Pending), ● (Current), ✔ (Complete), ✖ (Failed).
- `/checkpoint prev` (alias: `/cp prev`) --Step back one checkpoint (automation pause recommended).
- `/checkpoint eval` (alias: `/cp eval`) --Queue a manual arbiter evaluation at the current node.
- `/checkpoint <id>` or `/checkpoint id=<id>` (alias: `/cp <id>` or `/cp id=<id>`) --Activate a specific checkpoint by 1-based index or checkpoint id.
- Checkpoint `automations` allow per-node slash command batches (e.g., `/bg`, `/char`, diagnostics).

## Project Layout
```
src/
  index.tsx                      # Entry; mounts settings + drawer, registers talk-control interceptor
  Apps.tsx                       # Exported components for alternative mounting (SettingsApp, LoreManagerApp)
  styles.css                     # Tailwind styles and custom CSS
  components/
    drawer/                      # Requirements + checkpoint panels
      index.tsx
      Checkpoints/
      Requirements/
    settings/                    # Arbiter controls and Checkpoint Studio modal
      index.tsx
      CheckpointStudio/
    studio/                      # Story editor, diagnostics, graph, toolbar
      CheckpointEditorPanel.tsx
      DiagnosticsPanel.tsx
      FeedbackAlert.tsx
      GraphPanel.tsx
      HelpTooltip.tsx
      MultiSelect.tsx
      StoryDetailsPanel.tsx
      Toolbar.tsx
      CheckpointEditor/          # Checkpoint editor tabs and utilities
        tabs/
      StoryDetails/              # Story metadata and role configuration
    context/                     # ExtensionSettingsContext + StoryContext providers
    common/RequirementIndicator/ # Shared requirement pill component
  controllers/                   # Orchestrator manager, requirements, persistence, turn controller
    orchestratorManager.ts
    persistenceController.ts
    requirementsController.ts
    storyRuntimeController.ts
    turnController.ts
  services/                      # StoryOrchestrator, CheckpointArbiterService, PresetService, TalkControlService
    StoryOrchestrator.ts
    CheckpointArbiterService.ts
    PresetService.ts
    STAPI.ts                     # ST API facade
    TalkControlService.ts
    TalkControl/                 # Talk control subsystem components
      CharacterResolver.ts
      MessageInjector.ts
      ReplySelector.ts
  store/                         # Zustand vanilla store + requirement state helpers
    storySessionStore.ts
    requirementsState.ts
  utils/                         # Story schema/validator, story-state helpers, library, slash commands, studio utils
    arbiter.ts
    checkpoint-studio.ts
    event-source.ts
    groups.ts
    settings.ts
    slash-commands.ts
    story-library.ts
    story-macros.ts
    story-schema.ts
    story-state.ts
    story-validator.ts
    string.ts
  constants/                     # Arbiter defaults, preset keys, clamps
    defaults.ts
    main.ts
    presetSettingKeys.ts
  hooks/                         # React hooks for orchestrator, context, library access
    useStoryContext.ts
    useStoryLibrary.ts
    useStoryOrchestrator.ts
  types/                         # TypeScript type definitions
    cytoscape-dagre.d.ts
stories/                         # Sample story JSON (e.g., lost-key.json)
notes/                           # Design sketches, lore/lorebook experiments
manifest.json                    # Extension manifest with generate_interceptor configuration
package.json                     # Dependencies and scripts (React 19, TS 5, Zustand 5, Tailwind 4)
tailwind.config.js               # Tailwind 4 theme configuration
postcss.config.js                # PostCSS configuration for Tailwind
webpack.config.js                # Webpack build + live-reload + fork-ts-checker pipeline
tsconfig.json                    # TypeScript configuration
global.d.ts                      # Global TypeScript declarations
```
## Currently working on:
  Creating a new story to test all the features together.

## Testing:
  add more customizations to checkpoint transition (each X amount of messages)
  Test Settings configuration
  default values of configs (an? preset?) are applied when no overrides
  hook cp events to proper hosts events, new chat? on chat enter? chat creation?

## ToDo:
  Bugfix: remove requirementsState, it should be its own hook, or some react context
  Bugfix: rename checkpoint studio for Studio editor.
  Feature: Better control of automatic generation continuation (max attempts, enable/disable)
  Feature: add "delay turns" on talk control replies
  Feature: merge similar checkpoints in user UI
  Feature: support multiple lorebooks
  Feature: arbiter/dm stepped thinking
  Feature: add Group Chat Scenario Override (setScenarioOverride) and personality customization to checkpoint onActivate
  Feature: predefined user responses 
  Feature: default values for settings/presets when no overrides
  Feature: Allow CP transition to change card contents (like changing memories/personal-lorebook, images, description, etc)
  Feature: Enhance Regex validity checking with real-time feedback in the UI, prevent invalid regex from being saved.
  Bugfix: User proper types for TG_SETTING_NAMES, PRESET_SETTING_KEYS, remove "any" types
  Feature: view chats under story editor
  Feature: use sillytavern's css colors for styling
  Feature: normalize window behaviour, window position setting? moving UI?

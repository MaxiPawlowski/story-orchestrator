# Key Patterns

## SillyTavern Integration
- **STAPI.ts** is the only file that imports ST host modules. All ST access goes through it.
- Host modules are loaded via `import(/* webpackIgnore: true */ "/scripts/...")` (dynamic, not bundled).
- `getContext()` is the main ST API gateway (event bus, chat, characters, settings).
- The extension registers a `generate_interceptor` named `talkControlInterceptor` in `manifest.json` — ST calls it during generation to allow talk-control to intercept/abort.
- `setSettingByName` must be exported from ST's `public/scripts/textgen-settings.js` for preset UI sync to work.

## React Architecture
- Two separate React roots: settings panel (`#extensions_settings`) and drawer portal (`#movingDivs`).
- Provider hierarchy: `ExtensionSettingsProvider` → `StoryProvider` → components.
- Mounts after a 2-second delay (`setTimeout`) to ensure ST DOM is ready.
- Zustand vanilla store (`createStore`) used for cross-component state — not React-specific zustand.

## Orchestrator Lifecycle
1. User selects story → `orchestratorManager.ensureStory()` creates singleton `StoryOrchestrator`
2. Orchestrator hydrates persisted state, subscribes to ST events, registers slash commands
3. `turnController` deduplicates user messages (signature-based), tracks generation epochs
4. Triggers evaluated: regex matches against chat + timed triggers via `checkpointTurnCount`
5. `CheckpointArbiterService` calls `generateRaw` with JSON-only prompt, parses response
6. Checkpoint activation applies: author notes, preset overrides, world info toggles, automations, talk-control scopes
7. Effects deferred if requirements not met, applied once satisfied

## State Persistence
- Runtime state persisted per chat in extension settings via `story-state.ts`
- Story library stored in extension settings via `story-library.ts`
- Story selection per chat tracked in localStorage

## Talk Control Triggers

The talk control system supports these event triggers (NOT "onExit" — that does not exist):
- `onEnter` — when checkpoint is activated
- `afterSpeak` — after NPC generates a reply
- `beforeArbiter` — before arbiter evaluation
- `afterArbiter` — after arbiter evaluation

## Story Macros

Registered via `MacrosParser`, auto-updated on checkpoint/turn changes:

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

Note: `story_role_dm` and `story_role_companion` are used as examples in the Studio UI but are just instances of the generic `story_role_<role>` pattern — not special-cased in macro registration.

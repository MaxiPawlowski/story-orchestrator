# Story Orchestrator

Story Orchestrator is a SillyTavern extension for authored, non-linear stories driven by checkpoints in a directed graph. It watches player turns, evaluates regex or timed transitions, runs arbiter checks when needed, and applies scene-side effects like Author's Notes, preset overrides, lore toggles, slash-command automations, and talk-control NPC replies.

It is built for stories that need more structure than a single long prompt, but still need to react naturally to player input.

## What it does

- Treats stories as checkpoint graphs instead of linear scripts
- Tracks one active checkpoint per chat session
- Advances through regex, timed, manual, or arbiter-driven transitions
- Applies checkpoint effects automatically on activation
- Defers effects until persona, group, and lore requirements are valid
- Supports auto-replies through Talk Control around story beats and arbiter phases
- Persists story library content and per-chat runtime state
- Provides a Studio UI for graph editing, diagnostics, and generation-assisted authoring

## Feature Set

- Checkpoint automation
  Scene state is anchored to the active checkpoint, including branching, loops, and explicit checkpoint status tracking.
- Transition system
  Outgoing edges can be regex-triggered, timed by `checkpointTurnCount`, or advanced manually with slash commands.
- Arbiter evaluations
  `CheckpointArbiterService` snapshots recent chat, enforces JSON-only evaluation replies, and resolves ambiguous progression.
- Author's Notes automation
  Per-role notes are applied on checkpoint activation, with shared defaults and role-specific overrides.
- Preset automation
  `PresetService` builds a runtime-only `Story:<storyId>` preset and applies role-scoped overrides, including `$arbiter`.
- World info automation
  Checkpoints activate and deactivate lore entries in sync with story progression.
- Talk Control
  NPC or narrator replies can trigger on `onEnter`, `afterSpeak`, `beforeArbiter`, or `afterArbiter`, using static text or LLM instructions.
- Requirements gating
  Persona, group, role, and lore prerequisites block effect application until the chat context is ready.
- Story macros
  Runtime values like `{{story_title}}`, `{{story_current_checkpoint}}`, `{{story_possible_triggers}}`, and `{{chat_excerpt}}` stay current automatically.
- Story library and Studio
  Stories are stored in extension settings and edited through a visual Studio with Cytoscape + dagre graph rendering, validation, diagnostics, and Mermaid export helpers.
- Story Generator Wizard
  The Studio includes guided generation for initial checkpoint scaffolds and scene expansion drafts.
- Slash-command controls
  `/checkpoint` and `/cp` provide list, jump, back, and manual evaluation controls.

## Runtime Flow

1. `src/index.tsx` registers the textgen preset UI bridge, exposes `talkControlInterceptor` on `globalThis`, and mounts the Settings and Drawer React roots after `APP_INITIALIZED`.
2. `StoryProvider` loads the story library, restores the selected story for the current chat, registers macros, and publishes story/runtime metadata through context.
3. `orchestratorManager` sanitizes settings, owns the singleton `StoryOrchestrator`, and wires turn handling plus talk-control interception.
4. `StoryOrchestrator` hydrates runtime state, starts requirements and persistence controllers, refreshes macro snapshots, and tracks the active checkpoint and transitions.
5. Player turns increment runtime counters, timed transitions are checked, regex matches queue arbiter work, and manual `/checkpoint eval` uses the same evaluation path.
6. Checkpoint activation applies notes, presets, world info, automations, macro updates, and talk-control scope. If requirements are blocked, those effects are deferred and flushed later.

## Architecture Patterns

- `STAPI.ts` is the extension's host boundary. Runtime code imports host behavior through facade modules under `src/services/stHost`.
- `orchestratorManager` owns lifecycle. There is exactly one active orchestrator per selected story context.
- `storySessionStore` is the shared runtime source of truth. Controllers and services publish normalized state into a vanilla Zustand store.
- Validation and normalization are separated from runtime. `story-schema`, `story-validator`, and related helpers compile authored story data into runtime-friendly forms.
- Runtime orchestration is decomposed. `StoryOrchestrator` coordinates specialized services such as `StoryEvaluationCoordinator`, `CheckpointEffectsApplier`, `CheckpointExpansionCoordinator`, `PresetService`, and `TalkControlService`.
- Requirements gating is fail-safe. Invalid persona, group, or lore conditions block side effects instead of partially applying them.
- UI surfaces are portal-mounted. Settings render into `#extensions_settings`; the drawer renders into `#movingDivs`.

## Main Surfaces

- `src/components/settings`
  Story selection, arbiter settings, refresh controls, Studio launch.
- `src/components/drawer`
  Requirement badges, checkpoint status, latest evaluation summary, expansion status.
- `src/components/studio`
  Metadata editor, checkpoint editor tabs, graph panel, diagnostics, generator wizard.
- `src/services`
  Runtime orchestration, arbiter, presets, talk control, story generation, ST host facades.
- `src/controllers`
  Singleton lifecycle, requirements, persistence, turn routing, chat-session tracking.
- `src/utils`
  Schemas, normalization, library persistence, macros, slash commands, Studio draft helpers.

## Story Format

Stories are authored in a normalized YAML-first shape, with checkpoint-local transitions and talk-control replies. JSON-compatible structures are still supported through the schema/normalization pipeline where applicable, but the current authoring model is checkpoint-colocated.

Top-level sections:

- `title`
- `description`
- `global_lorebook`
- `roles`
- `defaults`
- `start`
- `checkpoints`

Checkpoint sections:

- `id`
- `name`
- `objective`
- `authors_note`
- `world_info`
- `world_info_deactivate`
- `preset_overrides`
- `arbiter_preset`
- `automations`
- `transitions`
- `talk_control`

## Slash Commands

- `/checkpoint list` or `/cp list`
- `/checkpoint prev` or `/cp prev`
- `/checkpoint eval` or `/cp eval`
- `/checkpoint <id>` or `/cp <id>`
- `/checkpoint id=<id>` or `/cp id=<id>`

## Story Macros

| Macro | Meaning |
| --- | --- |
| `{{story_title}}` | Active story title |
| `{{story_description}}` | Active story description |
| `{{story_current_checkpoint}}` | Current checkpoint summary |
| `{{story_past_checkpoints}}` | Recent checkpoint history |
| `{{story_possible_triggers}}` | Candidate outgoing transitions |
| `{{chat_excerpt}}` | Arbiter chat snapshot excerpt |
| `{{story_player_name}}` | Current persona name |
| `{{story_role_<role>}}` | Display name for a story role |

`story_role_dm` and `story_role_companion` are Studio examples, not special runtime cases.

## Project Layout

```text
src/
  components/
    context/
    drawer/
    settings/
    studio/
  constants/
  controllers/
  hooks/
  services/
    runtime/
    presets/
    stHost/
    TalkControl/
  store/
  types/
  utils/
stories/
docs/
manifest.json
```

## Build

- `npm run dev`
- `npm run test`
- `npm run typecheck`
- `npm run build`
- `npm run storybook`

Tech stack: React 19, TypeScript 5, Zustand 5, Cytoscape, cytoscape-dagre, Tailwind 4, webpack, Jest, Storybook.

## Notes

- `StoryOrchestrator` manual evaluation entrypoint is `evaluateNow()`.
- Talk Control only intercepts loud generations.
- `manifest.json` wires the interceptor through `generate_interceptor`.
- `dist/` is ignored; build before packaging if you need fresh output.

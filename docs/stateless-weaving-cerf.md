# Story Orchestrator - Architecture Reference

This document is the compact reference for codebase structure, runtime boundaries, and the patterns the project currently uses.

## Source Layout

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
```

## Entry and Mounting

- `src/index.tsx`
  Registers the textgen preset UI bridge, exposes `talkControlInterceptor`, and mounts the extension after `APP_INITIALIZED`.
- Settings UI mounts into `#extensions_settings`.
- Drawer UI mounts into `#movingDivs`.

## Runtime Boundaries

### Host boundary

`src/services/STAPI.ts` is the public facade for SillyTavern host capabilities.

Host-specific modules live under `src/services/stHost/`:

- `context.ts`
- `characters.ts`
- `presets.ts`
- `authorNotes.ts`
- `worldInfo.ts`
- `slashCommands.ts`
- `selectors.ts`
- `modules.ts`

Runtime features should go through this boundary instead of importing host globals directly.

### Singleton boundary

`src/controllers/orchestratorManager.ts` owns:

- ensuring a single active orchestrator
- wiring sanitized arbiter settings
- pause/resume automation controls
- exposing the active talk-control interceptor

## Main Services

### `src/services/StoryOrchestrator.ts`

Top-level coordinator for:

- active checkpoint state
- turn handling
- evaluation scheduling
- macro refresh
- hydration
- checkpoint activation
- story reset/manual activation

### `src/services/runtime/StoryEvaluationCoordinator.ts`

Focused runtime logic for:

- regex trigger matching
- timed trigger evaluation
- arbiter queueing
- evaluation event emission
- prompt-context assembly

### `src/services/runtime/CheckpointEffectsApplier.ts`

Applies checkpoint side effects:

- Author's Notes
- presets
- world info changes
- slash-command automations
- deferred activation flushes

### `src/services/runtime/CheckpointExpansionCoordinator.ts`

Bridges generator-assisted story drafting into the live story model, including stub checkpoint expansion.

### `src/services/CheckpointArbiterService.ts`

Builds arbiter prompts, snapshots recent chat, calls generation, and parses JSON-only results.

### `src/services/PresetService.ts`

Builds and applies the runtime `Story:<storyId>` preset, with role-scoped overrides and `$arbiter` support.

### `src/services/TalkControlService.ts`

Maintains checkpoint-local auto-reply state and arbiter-phase hooks. Internals are split into:

- `TalkControl/CharacterResolver.ts`
- `TalkControl/ReplySelector.ts`
- `TalkControl/MessageInjector.ts`
- `TalkControl/DispatchPipeline.ts`

### `src/services/StoryGeneratorService.ts`

Provides generator-assisted draft creation for Studio flows and checkpoint expansion.

## Controllers

### `turnController.ts`

- dedupes noisy host events
- detects valid user turns
- tracks active speaking role for preset application
- guards against duplicate processing with generation epoch logic

### `requirementsController.ts`

- validates persona, role, group, and lore readiness
- pushes requirement snapshots into the store
- drives deferred-effect unblocking

### `persistenceController.ts`

- loads and saves runtime snapshots
- hydrates story state on chat changes
- keeps checkpoint status maps and hydration flags consistent

### `chatSessionBridge.ts`

- tracks normalized chat context
- exposes retained snapshots and subscriptions
- gives runtime a stable view of chat changes

## Store

### `src/store/storySessionStore.ts`

Vanilla Zustand store holding:

- active story metadata
- selected library key
- chat context
- checkpoint runtime
- turn counters
- requirement state
- roadmap/premise expansion state
- hydration and readiness flags

### `src/store/requirementsState.ts`

Immutable requirement snapshot helpers for comparison and controlled store writes.

## Story Definition Pipeline

### Schema

`src/utils/story-schema.ts` defines the authored model:

- YAML-first story format
- checkpoint-local transitions
- checkpoint-local talk-control replies
- top-level defaults for author notes and presets

### Validation and normalization

`src/utils/story-validator.ts` and companion modules:

- validate story shape
- normalize authored data into runtime-friendly structures
- compile transitions
- attach talk-control data to checkpoints
- surface diagnostics for Studio/runtime use

### Studio draft helpers

`src/utils/checkpoint-studio.ts` converts between authored story data and Studio draft models.

## React Surfaces

### Settings

`src/components/settings`

- story selection
- arbiter settings
- Studio launcher

### Drawer

`src/components/drawer`

- requirement badges
- checkpoint progression
- recent evaluation or expansion state

### Studio

`src/components/studio`

- metadata/defaults editing
- checkpoint tabs
- graph view
- diagnostics
- Story Generator Wizard

## Operational Rules

- Use the host facade, not raw globals
- Keep story state in `storySessionStore`
- Treat checkpoint activation as the side-effect boundary
- Defer effects when requirements are blocked
- Keep Talk Control limited to supported triggers: `onEnter`, `afterSpeak`, `beforeArbiter`, `afterArbiter`
- Treat `evaluateNow()` as the manual arbiter entrypoint

## Build and Tooling

- React 19
- TypeScript 5
- Zustand 5
- Cytoscape + cytoscape-dagre
- Tailwind 4
- webpack
- Jest
- Storybook

Primary scripts:

- `npm run dev`
- `npm run test`
- `npm run typecheck`
- `npm run build`
- `npm run storybook`

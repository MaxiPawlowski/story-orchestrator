# Story Orchestrator - Core Overview

## Purpose

Story Orchestrator turns a SillyTavern chat into a checkpoint-driven story runtime. Authors define a story as a graph of checkpoints and transitions. The extension tracks the active checkpoint, watches chat activity, and updates the storytelling environment as the scene changes.

That gives the project two goals at once:

- keep player input natural
- keep the story paced, structured, and inspectable

## Core Model

The runtime is centered on a directed graph.

- Checkpoints are story beats
- Transitions are valid exits from a checkpoint
- One checkpoint is active at a time

The active checkpoint controls both story progression and scene configuration. It is not just position tracking. It is the current source of truth for notes, presets, lore, automations, macros, and talk-control behavior.

## Lifecycle

### 1. Host mount

`src/index.tsx` waits for `APP_INITIALIZED`, registers the textgen preset UI bridge, exposes `talkControlInterceptor` on `globalThis`, and mounts the Settings plus Drawer roots inside SillyTavern.

### 2. Context bootstrap

`StoryProvider` loads the story library, restores the selected story for the current chat, registers story macros, and publishes story/runtime state through React context.

### 3. Orchestrator creation

`orchestratorManager` owns the singleton `StoryOrchestrator`. It sanitizes arbiter settings, ensures only one runtime instance is active, wires turn handling, and provides the active talk-control interceptor.

### 4. Runtime initialization

`StoryOrchestrator`:

- hydrates persisted runtime state
- starts requirements and persistence controllers
- seeds role mappings
- initializes `PresetService`
- starts `TalkControlService`
- subscribes to chat-session changes
- registers checkpoint slash commands

### 5. Turn processing

Valid user turns advance the turn counter and `checkpointTurnCount`. Then runtime checks:

- timed transitions
- regex transition matches
- interval-based arbiter checks

If the active checkpoint has no applicable transitions, the story remains stable.

### 6. Evaluation

`StoryEvaluationCoordinator` gathers transition candidates and delegates arbiter work to `CheckpointArbiterService` when needed. The arbiter uses recent chat snapshots and emits a concrete progression decision.

### 7. Checkpoint activation

When a checkpoint activates, `CheckpointEffectsApplier` applies checkpoint side effects or defers them if requirements are blocked. `TalkControlService` updates its active scope, macros refresh, and runtime state is persisted.

## Main Runtime Pieces

### `StoryOrchestrator`

Top-level coordinator for checkpoint state, turn handling, evaluation flow, macro refresh, hydration, and checkpoint activation.

### `StoryEvaluationCoordinator`

Owns regex matching, timed trigger handling, arbiter queueing, and prompt-context assembly for evaluations.

### `CheckpointEffectsApplier`

Applies Author's Notes, presets, world info, automations, and deferred checkpoint effects.

### `CheckpointExpansionCoordinator`

Handles stub checkpoint expansion and generator-assisted scene drafting through `StoryGeneratorService`.

### `CheckpointArbiterService`

Builds arbiter prompts, snapshots recent chat, enforces JSON-only output, parses results, and returns progression outcomes.

### `PresetService`

Builds and applies the runtime story preset, including role-scoped overrides and `$arbiter` evaluation overrides. UI sync happens through the textgen preset bridge.

### `TalkControlService`

Tracks checkpoint-local reply configuration, arbiter-phase triggers, pending generated/static replies, and generation interception for loud host generations.

### Controllers

- `orchestratorManager`
  singleton lifecycle and public runtime hooks
- `turnController`
  host-event dedupe and active-speaker routing
- `requirementsController`
  persona, group, role, and lore readiness
- `persistenceController`
  runtime hydration and save/load boundaries
- `chatSessionBridge`
  normalized chat context snapshots and subscriptions

## Data Flow

### Authored layer

Authored stories define:

- metadata
- roles
- defaults
- checkpoints
- transitions
- talk-control replies

The schema is YAML-first and checkpoint-colocated. Transitions and talk-control replies live with their checkpoint definitions.

### Runtime layer

Runtime state tracks:

- selected story
- active checkpoint index and key
- checkpoint status map
- `turn`
- `turnsSinceEval`
- `checkpointTurnCount`
- requirement snapshot
- hydration readiness
- chat context

The runtime source of truth is `storySessionStore`, a vanilla Zustand store.

## Architectural Patterns

### 1. Single host boundary

`STAPI.ts` and `src/services/stHost/*` isolate SillyTavern APIs from story logic.

### 2. Compile before runtime

`story-schema`, `story-validator`, and related helpers validate and normalize authored content before runtime services use it.

### 3. Singleton runtime

Only one orchestrator instance should own story automation for the active session.

### 4. Deferred side effects

Checkpoint state can move forward while side effects wait for missing persona, group, or lore requirements.

### 5. Shared store, split responsibilities

The store holds runtime truth. Services and controllers specialize in evaluation, effects, persistence, talk control, or host integration.

### 6. UI as a view over runtime

Drawer, Settings, and Studio consume story/runtime context rather than running story logic directly.

## Talk Control Summary

Talk Control is the auto-reply layer for authored story beats.

- Supports `onEnter`, `afterSpeak`, `beforeArbiter`, `afterArbiter`
- Can inject static text or trigger generated replies
- Resolves roles to active characters in current group context
- Throttles repeated replies per checkpoint and turn
- Intercepts loud generations only

## Persistence Summary

- Story library content lives in extension settings
- Selected story is tracked per chat
- Runtime state is keyed by chat context plus story identity
- Hydration restores state without replaying invalid effects

## Practical Summary

Story Orchestrator is a checkpoint-based story engine for SillyTavern. It combines graph-based progression, arbiter-driven transition evaluation, scene-scoped automation, and visual authoring tools so authored stories can stay structured without forcing the player into rigid command-style play.

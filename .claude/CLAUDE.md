# Story Orchestrator

SillyTavern extension for running format-2 authored stories as deterministic checkpoint graphs over an active chat.

## V2 Spine

- Stories declare qualities, checkpoints, typed gates, transitions, roster, effects, requirements, and future arc bridges.
- `StoryEngine` owns blackboard state, serialized apply queue drains, one-transition-per-boundary advancement, boundary logs, snapshots, and rollback.
- `RuntimeManager` owns ST integration, per-chat persistence in `chat_metadata.story_orchestrator`, checkpoint effects, macros, slash commands, extraction state, and UI snapshots.
- `TurnBridge` subscribes to ST generation/message/mutation events and commits only at rendered reply boundaries.
- Extraction runs off-path through `ExtractionScheduler` and `runSharedRead`; accepted deltas enqueue and apply only on the next boundary.
- Checkpoint effects can apply author notes, runtime presets, WI toggles, cast changes, and `npc_replies`.

## Build Protocol

- Read the spec, current plan, and prior Gate records before implementation.
- Validate against actual SillyTavern host source before assuming event payloads or context shapes.
- Run deterministic gates first: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- Live gates use `scripts/debug/` and shared CDP sessions; record exact commands and deviations in the plan Gate record.

## UI Entry Points

- Settings panel: story import/select, extraction settings, runtime status.
- Drawer: checkpoint progress, requirements, extraction status, blackboard state.
- Studio is planned for v2 plan 11; do not rely on deleted v1 Studio/controller code.

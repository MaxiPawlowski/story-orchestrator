# Plan 01 — Engine Core + v1 Removal

## Objective

Delete the v1 story engine and build the v2 deterministic core: format-2 schema, blackboard, gate evaluation, transitions, convergence mechanics, apply queue — pure TS with no ST imports — plus eval layers 1 (gate logic) and 3 (headless replay). Extension still loads in ST, inert.

## Context

- Spec: §Design spine, §Vocabulary, §Blackboard (incl. gate grammar), §Turn loop & commit semantics, §Convergence, §Data model, §Evaluation framework (layers 1, 3).
- Consumes: nothing (first plan). Jest 30 + ts-jest configured (`jest.config.cjs`); webpack build; path aliases in both.
- Reference for zod style: current `src/utils/story-schema.ts` before deleting it.

## Scope

**In**: v1 deletion, `src/engine/` modules, format-2 schema/validation, tests, replay harness, inert-but-loading extension.
**Non-goals**: no ST event wiring, no persistence, no extraction, no UI beyond stubs. `EngineHost` is an interface here; plan 02 implements it.

## Deliverables

New `src/engine/` (pure — no STAPI imports anywhere under it):

- `schema.ts` — zod format-2 per spec §Data model: `Quality` (key, type, values?, source, latching?, monotonic?, rubric, scope_hint?), `GateNode` (leaf `{q,op,v}` | `{all}|{any}|{not}`), `Checkpoint` (id, name, objective, type, state_snapshot?, tension_target? typed as `TensionLevel = calm|stirring|tense|critical|peak`, target_turn_length?, effects?, guidance?), `Transition` (from, to, gate, priority, effects? `{progress:{anchor,amount}}`, extractor_trigger?, extraction_hint?), `Story` (format:2, title, description, qualities[], checkpoints[], transitions[], roster[], arc_template?, requirements?), `Scaffolding` (beats[], basis, needs_review?).
- `validate.ts` — `parseStoryV2(json): NormalizedStoryV2 | ValidationError[]`. Checks: every gate `q` declared; op/type compatibility (`>= <= > <` numeric only, `in` enum/string list, `== !=` any); enum values in allowed set; transition endpoints exist; duplicate ids; exactly one start checkpoint (first, or explicit); stub with no anchor reachable beyond it is a **hard error**. Normalized shape: `checkpointById`, `outgoingByCheckpoint` sorted by priority desc, `qualityByKey`, reachability index (forward closure per checkpoint — plan 03 uses it for scope).
- `blackboard.ts` — `Blackboard`: typed values + per-quality version + latch state. `applyDelta(delta: BlackboardDelta): ApplyOutcome` enforcing type, enum membership, latching (reject unlatch unless `delta.strictUnlatch`), monotonic (clamp/reject decreases). `snapshot()`, `restore()`.
- `gates.ts` — `evaluateGate(gate, bb): boolean`; `renderGateText(gate): string` (compact `AND/OR/NOT` form; used by UI + Mermaid; never parsed).
- `transitions.ts` — `selectFiring(outgoing, bb): Transition | null` (all eligible → highest priority; stable tie by declaration order).
- `applyQueue.ts` — serialized write queue. Entries: `{source: 'mechanical'|'extractor'|'reconciliation', basisVersion, turnRange?, deltas[]}`. `drainAtBoundary()` applies in order; discards an entry whose `turnRange` is fully covered by a newer completed entry (spec §Turn loop). Nothing applies outside a boundary drain.
- `convergence.ts` — auto-declares `progress_toward_<anchorId>` qualities (`source: code`, monotonic), applies transition progress effects on fire, `thresholdFor(anchor)` (authored or Σ chain increments — plan 05 sets computed value; here: authored or explicit).
- `engine.ts` — `StoryEngine`: `loadStory(normalized)`, `hydrate(state)`, `serialize(): EngineState`, `enqueue(write)`, `commitBoundary(): BoundaryResult` (drain → refresh mechanical → evaluate gates → advance at most one transition → collect destination effects), `activeCheckpoint`, `onAdvance(cb)`, plus a boundary-indexed log of applied deltas + fired transitions (bounded window) and `rollbackTo(boundary)` (restore nearest prior snapshot, re-apply older log entries, revert transitions fired after it) — spec §Chat mutations; plan 02 wires the ST events.
- `replay.ts` — layer-3 harness: feed a script of `{write | boundary | assert}` steps against a fixture story; assert end state (active checkpoint, blackboard values, anchors visited in order).

Tests (`src/engine/*.test.ts` + `test/fixtures/`):
- Gate logic: leaf ops per type, nesting, eligibility, priority tie-break, malformed-gate rejection at validate time.
- Property tests: monotonic never decreases; latched never reverts without `strictUnlatch`; entry gate held at entry; boundary-only application (writes between boundaries invisible to gates).
- Apply queue: ordering, coverage-based staleness discard.
- Rollback: property test — apply writes, fire transitions, `rollbackTo(b)`, replay the same post-b script ≡ state as if the rolled-back segment never applied; fast-path no-op when nothing references turns ≥ T.
- Convergence: threshold crossing opens anchor gate; progress only via transition effects.
- Replay: at least 2 fixture stories (linear; branching with priorities) driven to completion via scripted writes.

## Implementation notes

**v1 deletion list** (delete file + its test): `services/StoryOrchestrator.ts`, `services/CheckpointArbiterService.ts`, `services/StoryGeneratorService.ts`, `services/StoryGeneratorPrompts.ts`, `services/runtime/*` (all — plan 05 rebuilds the coordinator shape), `controllers/orchestratorManager.ts`, `controllers/turnController.ts`, `controllers/requirementsController.ts`, `controllers/storyRuntimeController.ts`, `utils/story-schema.ts`, `utils/story-validator*.ts` (4 files), `utils/story-state.ts`, `utils/story-macros.ts`, `utils/slash-commands.ts`, `utils/checkpoint-studio.ts`, `utils/arbiter.ts`, v1 experiments `services/ContinuityKeeperService.ts`, `services/PacingMonitorService.ts`, `utils/memory-stores.ts`, `utils/narrative-context.ts`, `utils/arc-templates.ts` (plans 03/04/07 rebuild these on Smart-Memory/spec basis), studio editor tabs (`components/studio/checkpointEditor/**`, `storyDetails/**`, `StoryGeneratorWizard/**`, `CheckpointEditorPanel.tsx`, `StoryDetailsPanel.tsx`, `DiagnosticsPanel.tsx`), drawer panels bound to v1 state (`Checkpoints/`, `Requirements/`, `StoryExpansionPanel/`, `MemoryDebugPanel/`), v1-bound context providers as needed.

**Keep**: `STAPI.ts` + `stHost/**`, `PresetService` internals that `stHost/presets` needs (else fold into stHost), TalkControl subsystem (`TalkControl/**`, `TalkControlService.ts` may be reduced to the subsystem + no-op wiring), `GraphPanel.tsx` + `graphPanelUtils.ts`, Studio modal shell + generic components (`MultiSelect`, `FeedbackAlert`, `HelpTooltip`, `Toolbar`), `storySessionStore` (strip to v2-relevant keys or minimal stub), `story-library.ts` (retarget: store raw JSON, validate with `parseStoryV2`), settings/drawer entry components reduced to stubs ("v2 engine installed — runtime lands in plan 02"), debug scripts untouched (they may report empty state).

**Critical**: `manifest.json` registers `generate_interceptor: talkControlInterceptor` — `src/index.tsx` must keep registering a global with that name (no-op passthrough) or ST errors on every generation.

`persistenceController.ts`: delete; plan 02 rewrites persistence, but keep its key pattern (`story_orchestrator:{chatId}:{hash}` in `chat_metadata`) in mind — note it in Gate record for plan 02.

Types for `EngineState` (serializable: blackboard values/versions/latches, activeCheckpointId, visited anchors, turn counters) — plan 02 persists exactly this.

## Validation gate

1. Baseline commands green (00 §Gate protocol). Zero references to deleted modules (`grep` for each deleted filename in `src/`).
2. New engine tests pass; replay fixtures drive both stories to end state.
3. Live: ST loads the built extension with no console errors (`so-ui.mjs all` shows stub panel; `st-actions.mjs generation-state` works — interceptor no-op verified by sending one message in any chat).
4. Handoff: `EngineHost`/`EngineState` types documented in file headers of `engine.ts` (types only, no prose docs).

## Delegated decisions

Zod version/idioms; exact normalized index structures; fixture story content; whether `storySessionStore` is stripped or replaced (must keep name/location for UI plans).

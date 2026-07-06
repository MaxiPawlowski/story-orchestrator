# Plan 05 — Background Generation + Critic

## Objective

Generate scaffolding (not prose) for authored stub segments: compute state deltas, plan beat count, call the memory LLM, run code checks + critic, cache per chat, revalidate before use, merge generated intermediates into the live normalized story, and prove it with layer-4 tests plus a live scenario.

## Context

- Spec: §Background generation (all five steps + cache revalidation), §Convergence (arithmetic contract), §Off-path scheduler (P3), §Evaluation framework (layer 4).
- Consumes from 01: `parseStoryV2`, `Scaffolding`, blackboard snapshots, transition progress effects, `thresholdFor`, engine boundary semantics. From 02: persistence in `RuntimeExtras`, effects, slash/debug patterns. From 03/03a: `ExtractionScheduler` P0/P1 with retry/pause, memory-LLM client, `getCanonLite`, `deriveScope(..., extraGateSources?)`, facts stamped in `extras.extraction.facts`. From 04: `getTensionTrajectory`, `getGenerationBias`, committed-only tension state.
- As built: scheduler is still a single global lane; this plan must split reads (P0-P2) from heavy work (P3+) so scaffolding never blocks forced extraction. `runSharedRead` currently does not pass `extraGateSources`; this plan wires cached expansion gates into scope before insertion.
- Reuse shape (not code) of deleted v1 `CheckpointExpansionCoordinator` / `StoryGeneratorService`: coordinator-with-merge-callback + phase progress events worked well; rebuild against v2 types (git history reference OK).

## Scope

**In**: `src/generation/` pipeline, typed scaffolding/outcomes, cache in `chat_metadata`, revalidation, runtime-only insertion of generated intermediates into the live normalized story, scope refresh from cached/generated gates, scheduler P3 heavy lane, drawer expansion panel, debug-state/scenario support, layer-4 tests.

**Non-goals**: convergence-in-anger proof (06), Smart-Memory/canon contradiction checks beyond facts+canon-lite (07-09), Studio stub authoring (11), generated prose.

## Deliverables

Tooling/config:

- Add `@generation` alias to `tsconfig.json`, `webpack.config.js`, `npm run lint`, and `lint:fix`. Include `src/generation/**/*.ts` in typecheck/lint so the new top-level dir is not silently skipped.

`src/generation/`:

- `types.ts` — generated-beat, generated-outcome, cache, code-check, critic, and status types. Replace `ScaffoldingBeat.outcomes?: unknown[]` in `schema.ts` with this typed shape or equivalent engine-local exported types.
- `delta.ts` — `computeStateDelta(blackboard, anchorSnapshot, story): QualityDelta[]` with per-quality current/target/distance; numeric distance for int/float, exact mismatch for bool/enum/string.
- `planner.ts` — target-anchor discovery from a stub path; N = f(delta size, tension distance) with bounded constants; generator input = delta, tension trajectory, generation bias, canon-lite, top facts, roster, active checkpoint, stub, target anchor, and authored transition guidance/hints.
- `prompts.ts` — generator + critic prompts. Keep closed quality vocabulary, exact JSON output, no prose generation, declared deltas/increments only.
- `parse.ts` — strict generated JSON + critic verdict parsing. Reject unknown quality keys, invalid enum values, malformed gates, and progress toward unknown anchors before merge.
- `generate.ts` — memory-LLM call producing beats JSON: each beat `{ objective, guidance, tension_target, outcomes[] }`, each outcome `{ label, gate, deltas, progress? }`. Malformed output gets one repair prompt; if still invalid, mark cache failed/on-demand-later. All calls use the memory LLM profile path, never roleplay generation.
- `critic.ts` — code checks first, critic second. Code verifies cumulative deltas bridge to the anchor snapshot, progress increments sum to `thresholdFor(anchor)`, anchor-entry transition has no increment, generated gates reference declared qualities, and tension follows trajectory within tolerance. Critic checks contradictions vs facts+canon-lite and guidance quality. Max 2 revision rounds; stop at first pass; otherwise accept with `needs_review` only if code checks pass.
- `cache.ts` — `ExpansionCache` under `extras.expansion`: per stub target, basis blackboard snapshot/version sum, beat chain, verdicts, status, timestamps, attempts. Bound by count; evict oldest non-active/non-inserted entry.
- `revalidate.ts` — at stub entry: compare cumulative declared deltas from the cached chain against current blackboard → target anchor snapshot. Pass = insert full chain. Partial = insert valid prefix and schedule P3 tail regeneration. Fail = regenerate and surface on-demand wait/failure state. Numeric tolerance configurable; bool/enum/string exact.
- `merge.ts` — compose runtime raw story with generated checkpoints/transitions and re-run `parseStoryV2`; generated intermediates are runtime-only and never written to the story library. Preserve current engine state by replacing the loaded normalized story then hydrating/continuing with the same serialized engine state.
- `coordinator.ts` — entering a checkpoint whose forward path hits a stub schedules P3 pre-generation for the likeliest branch (transition priority). Before committing an eligible transition into a stub, ensure a valid cached/merged chain exists or run on-demand fallback. Unexpected branch uses the same on-demand path.

Runtime/UI/debug:

- `RuntimeExtras.expansion` + `RuntimeSnapshot.expansion`: status per stub (`idle | queued | generating | cached | stale | needs_review | failed | inserted`), target anchor, beat count, verdict, last error, objective preview.
- Runtime manager integration: coordinator starts after story load, listens on boundaries/advance, persists cache/status, drops inserted runtime-only chains on fresh story import, replays safely on hydrate.
- Extraction scope integration: pass cached-but-not-yet-inserted gate sources into `deriveScope` through `runSharedRead`, so evidence for generated gates can be read before the player reaches the stub.
- Scheduler integration: extend job priority to P3 and split lanes: reads lane (P0-P2) and heavy lane (P3+). P3 failures must not pause extraction; record expansion error/status instead.
- Slash/debug hook: add deterministic debug generation response path (global handle or `/cp expand`) equivalent to `storyOrchestratorDebugExtractionResponse`, so live gates do not require a configured memory LLM.
- Drawer: expansion status panel with per-stub status, target anchor, beat count, `needs_review`, and beat objective preview.
- Debug scripts: extend `so-state.mts` compact/full output, `so-scenario.mts` `expect`/`wait` support for expansion state, and `scripts/debug/README.md` scenario docs.

Tests/fixtures:

- `src/generation/*.test.ts`: delta computation, N bounds, strict parse, code arithmetic checks, revalidation pass/partial/fail, merge/reparse validation, scheduler lane behavior.
- `test/fixtures/background-generation.story.json`: anchor → stub → anchor with at least one extractor quality, one progress threshold, and tension targets.
- `test/goldens/background-generator*.response.txt` and `background-critic*.response.txt`: at least 5 deterministic generations for critic metric reporting.
- `test/scenarios/plan05-background-generation.json`: live deterministic debug response scenario for cache fill, instant stub transition, inserted intermediate checkpoint, and drift-triggered stale/regenerate path.

## Implementation notes

- Stub detection for this plan: authored `type: "intermediate"` with no `state_snapshot`, no `guidance`, no `effects`, and at least one reachable anchor beyond it. Do not add a schema-level `stub` type unless the spec is amended first.
- Generated narrative deltas are not direct blackboard writes. They are used for generated gates, scope, arithmetic validation, and revalidation. Only convergence progress increments become transition `effects.progress` and are applied by the engine when transitions fire.
- Generated chain shape: active authored checkpoint → generated intermediate(s) → target anchor. The authored stub is a placeholder used for planning/cache identity; after successful insertion, route around it or replace it with generated intermediates in the session graph. Avoid leaving a user-visible empty stub checkpoint active when a chain is available.
- Progress increments live only on transitions between generated intermediates or from the source into the first generated intermediate. The transition entering the anchor carries the `progress_toward_<anchor> >= threshold` gate and no increment. Direct authored transitions into the anchor are untouched.
- Merge strategy: compose merged raw story and re-run `parseStoryV2` to reuse validator/index building. If parse fails, cache status becomes `failed`; do not partially mutate runtime story.
- Hydration must not persist generated intermediates into the library story. Rebuild the merged runtime story from `extras.expansion` before hydrating engine state.
- Scheduler heavy-lane errors update expansion status only. Extraction pause remains reserved for read-lane failures.
- Critic pass rate is a metric, not a hard test threshold. Code arithmetic checks are hard failures.
- Use deterministic debug responses for live scenarios; live model generation can be recorded separately if a memory profile is configured.

## Validation gate

1. Deterministic gates:
   - `npm run typecheck`
   - `npm run lint`
   - `npm test`
   - `npm run debug:typecheck`
   - `npm run build`
2. Layer-4 suite passes on goldens. Arithmetic verifier has direct valid/invalid-chain unit tests. Revalidation has pass/partial/fail tests. Scheduler test proves P3 heavy work does not block a queued P0 read.
3. Live: `node scripts/debug/st-session.mts start --headed`, then `node scripts/debug/so-scenario.mts run test/scenarios/plan05-background-generation.json --sandbox` passes. Scenario proves cache fill, expansion snapshot in `so-state`, instant transition through a pre-generated stub, generated intermediate guidance visible in state/UI, and checkpoint progression through the generated chain.
4. Live drift: same scenario or a second scenario uses `/cp set` to drift a target quality before stub entry; stale cache is detected and regeneration/on-demand path is recorded in expansion status.
5. Standard snapshot: `node scripts/debug/st-navigation.mts recent-group` → `node scripts/debug/so-state.mts current --full` → change-specific expansion assertions.
6. Gate record appended here with date, exact command outputs, live checks, critic pass metric over ≥5 golden generations, and deviations.

## Delegated decisions

- N formula constants.
- Numeric revalidation tolerance default.
- Exact generated JSON field names, preserving the required fields above.
- On-demand fallback UX: recommended wait before committing the stub transition on rare uncached branches, rather than briefly activating an empty placeholder.
- Cache bound size.

## Gate record

Date: 2026-07-05

Command outputs:

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: passed, 6 suites / 52 tests.
- `npm run debug:typecheck`: passed.
- `npm run build`: passed with existing warnings only: stale Browserslist data and webpack asset/entrypoint size (`dist/index.js` 323 KiB).

Live checks:

- `node scripts/debug/st-session.mts start --headed`: passed, shared Chromium session started on CDP `http://127.0.0.1:9222`.
- `node scripts/debug/so-scenario.mts run test/scenarios/plan05-background-generation.json --sandbox`: passed, 13/13 steps. Proved deterministic debug expansion, inserted runtime-only intermediates, stale-cache detection after blackboard drift, manual regeneration, progress increment, and final anchor transition.
- `node scripts/debug/st-navigation.mts recent-group`: passed, opened group `1759606632088`, chat `2026-07-05@10h54m51s564ms`.
- `node scripts/debug/st-actions.mts generation-state`: passed, `isGenerating: false`, send button enabled.
- `node scripts/debug/so-state.mts current --full`: passed. Current chat has no selected story after sandbox cleanup; live snapshot shows empty expansion state and no prompt leakage.

Critic metrics:

- Deterministic layer-4 metric over `test/goldens/background-generator1..5.response.txt`: 5/5 code-check pass rate. Debug generation mode treats critic as passed after hard code checks; real memory-LLM critic path is implemented but not live-recorded in this gate because no memory profile was selected.

As built:

- Added `src/generation/` with delta planning, strict generated JSON parsing, code checks, critic prompt/verdict path, revalidation, runtime-only merge/reparse, and tests.
- Added typed scaffolding outcomes to `schema.ts`.
- Added `RuntimeExtras.expansion` / `RuntimeSnapshot.expansion`, drawer expansion status, `/cp expand`, `so-state` expansion output, `so-scenario` `expand` step and expansion assertions.
- Extended `ExtractionScheduler` with a separate heavy lane for P3+ jobs. Read-lane failures still pause extraction; heavy-lane failures update heavy error state only.
- Runtime merge routes source checkpoint transitions around authored empty stubs into generated intermediates; generated intermediates are rebuilt from `extras.expansion` and never written to the story library.

Deviations:

- Automatic P3 pre-generation does not overwrite existing stale/failed entries without an explicit manual/debug regeneration. This avoids profile-less auto-regeneration turning a useful stale status into a failed status; future UI can expose a one-click retry.
- Partial-tail regeneration is represented in pure revalidation status/tests, but live runtime currently uses full manual regeneration for stale chains.
- Live critic call against a real memory profile was not run; deterministic debug expansion validates parser/code-check/merge path.

Post-gate real-model check (2026-07-05):

- Created/selected Connection Manager profile `Story Orchestrator Memory Local` against current textgen backend `ooba`, `http://localhost:1234/`, model `pantheon-reasoning-31b-1.1-i1`.
- Direct `ConnectionManagerRequestService.sendRequest` smoke passed in 652 ms.
- Real `/cp expand` equivalent (`runExpansionNow()` without debug response) passed after prompt/parser hardening: 27.4 s, expansion status `inserted`, code check `ok`, critic verdict parsed `pass`, generated `gen_bridge_stub_1` and `gen_bridge_stub_2`.
- Hardening added after live attempts: strip/extract fenced JSON from model responses, stricter gate/progress prompt, one bounded code-check repair round, simpler N formula that does not add a beat solely for tension drift, and hard-fail runtime entries whose code checks fail.
- Re-ran `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run debug:typecheck`, and `node scripts/debug/so-scenario.mts run test/scenarios/plan05-background-generation.json --sandbox`; all passed. Build warnings unchanged except bundle size now 324 KiB.

### Retro live validation addendum (2026-07-06)

Real-LLM retro (see [retro-live-validation.md](retro-live-validation.md)): `live-plan05-expansion.json` 8/8 — real scaffold generation + real critic. OPEN FINDING F1: code check passes outcome gates that contradict latched values (unwinnable beats).

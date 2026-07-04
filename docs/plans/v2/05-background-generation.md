# Plan 05 — Background Generation + Critic

## Objective

Generate scaffolding (not prose) for stub segments in the background: state-delta computation, N-beat planning with declared deltas + progress increments, critic verification with bounded revision, likelihood-prioritized cache with entry revalidation, on-demand fallback. Layer-4 tests.

## Context

- Spec: §Background generation (all five steps + cache revalidation), §Convergence (arithmetic contract), §Off-path scheduler (P3), §Evaluation framework (layer 4).
- Consumes from 01: schema (`Scaffolding`, intermediates insertion into `NormalizedStoryV2`), blackboard snapshots, convergence `thresholdFor`. From 02: persistence, effects. From 03: scheduler (add P3), memory-LLM client, `getCanon()` (canon-lite). From 04: `getTensionTrajectory`.
- Reuse shape (not code) of deleted v1 `CheckpointExpansionCoordinator` / `StoryGeneratorService`: coordinator-with-merge-callback + phase progress events worked well; rebuild against v2 types (git history reference OK).

## Scope

**In**: `src/generation/` pipeline, cache in chat_metadata, revalidation, insertion of generated intermediates into the live normalized story (+ scope index refresh), drawer expansion progress panel, layer-4 tests.
**Non-goals**: convergence-in-anger proof (06), memory-informed contradiction checks beyond facts+canon-lite (post-09 canon upgrade is transparent), Studio stub editing (11).

## Deliverables

`src/generation/`:
- `delta.ts` — `computeStateDelta(blackboard, anchorSnapshot): QualityDelta[]` (per-quality: needed change; numeric distance, flag/enum mismatch).
- `planner.ts` — N = f(delta size, tension distance) with declared bounds (e.g. 1..6); builds generator input: delta, tension trajectory (04), `getCanon()`, roster, stub guidance from the authored transition.
- `generate.ts` — memory-LLM call producing beats JSON: per beat `{objective, guidance, tension_target, outcomes[]: {label, gate-able declared deltas, progress increment}}`; strict parse against closed vocabulary (reuse 03's validators); malformed → one re-ask then fail to on-demand-later. Terminology: a *beat* is the scaffolding unit — once inserted it *is* an intermediate checkpoint. Progress increments live only on transitions **between intermediates**; the transition entering the anchor carries the progress condition and **no increment** (spec §Convergence).
- `critic.ts` — separate call + **code checks first** (code verifies arithmetic, critic judges content): Σ increments ≥ `thresholdFor(anchor)`; cumulative declared deltas reach snapshot; tension follows trajectory; then critic prompt for contradictions vs facts+canon and guidance quality. Bounded revision (max 2 rounds), stop at pass, else accept + `needs_review`.
- `cache.ts` — `ExpansionCache` in chat_metadata: per stub, chain + `basis` snapshot + verdicts; bounded (evict oldest non-active).
- `revalidate.ts` — at stub entry: cumulative declared deltas bridge *current* blackboard → anchor snapshot (numeric tolerance config; exact flags/enums). Pass → insert beats as intermediates; insertion conjoins `progress_toward_<anchor> >= threshold` into the chain's anchor-entry transitions (from generated intermediates only — direct authored transitions untouched) and, as a named step, rebuilds the reachability index + re-derives scope. Partial → insert valid prefix, regenerate tail (P3); fail → regenerate, on-demand wait UI state.
- `coordinator.ts` — triggers: entering a checkpoint whose forward path hits a stub → schedule P3 generation for the likeliest branch (priority = authored transition priority); unexpected branch at arrival → on-demand path.
- Layer-4 tests: golden generator/critic outputs; assertions = arithmetic checks always verified in code, critic pass-rate measured and reported (test emits metric, does not hard-fail on rate), revalidation catches a drifted-basis fixture.

Drawer: expansion status (per stub: cached/generating/needs_review/stale), preview of beat objectives.

## Implementation notes

- Generated intermediates are runtime-only: they live in chat_metadata (cache) and are merged into the *session's* normalized story, never written back to the library story.
- Progress increments ride transition effects (01's `convergence.ts` applies them on fire) — the generator only declares them.
- Cached-but-not-yet-inserted chains feed their gate qualities into scope via 03's `extraGateSources` (likeliest branch) so evidence just before a stub is not missed; insertion then makes them first-class via the index rebuild.
- All generation on the memory LLM (scheduler P3), never the roleplay connection; single in-flight P3, preempted by P0/P1.

## Validation gate

1. Baseline green; layer-4 suite passes on goldens; arithmetic verifier has direct unit tests (constructed valid/invalid chains).
2. Live: fixture story anchor→stub→anchor. Enter leading checkpoint → `so-state.mjs` (extended with expansion snapshot) shows cache filling; reach stub → transition instant (no visible wait), beats play as checkpoints with guidance injected.
3. Revalidation live: `/cp set` a quality to drift the blackboard before reaching the stub → stale cache detected, regeneration triggered (audit/drawer proves path taken).
4. Critic metrics recorded in Gate record (pass rate over ≥5 golden generations).

## Delegated decisions

N formula constants; tolerance defaults; beat-JSON exact shape (must include the four scaffolding fields + outcomes); coordinator trigger granularity (checkpoint-entry vs path-distance).

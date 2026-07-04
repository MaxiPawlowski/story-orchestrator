# Plan 04 — Pacing

## Objective

Tension tracking and steering: the extractor reads tension as one of five named levels, the engine smooths it (EMA) into `tension_current`, compares against the authored dramatic shape, and injects a one-line steering hint. Smallest plan; pure arithmetic plus one contract question.

## Context

- Spec: §Tension & pacing, §Data model (`tension_target`, `arc_template`).
- Consumes from 03: shared-read contract (standing-questions block), apply queue path, drawer. From 02: effects/AN injection, settings shell.
- v1 experiments `PacingMonitorService` / `arc-templates.ts` were deleted in plan 01 — rebuild per spec, do not restore old shapes.

## Scope

**In**: tension question in the read contract, level→numeric+EMA pipeline, shape curves, steering hint injection, author controls, curve-fit replay assertion, generation-bias hook (interface only).
**Non-goals**: no generation biasing implementation (plan 05 consumes the hook), no per-beat tension authoring UI beyond raw fields (Studio in 11).

## Deliverables

`src/pacing/`:
- `tension.ts` — built-in quality `tension_current` (source: extractor, float, engine-managed): contract question added to 03's standing block ("Rate the current tension: calm | stirring | tense | critical | peak — cite the strongest signal"); parse level label; the extractor delta carries the *level*, an apply-time transform maps (0, .25, .5, .75, 1) and computes the EMA (configurable α, default .5), writing the smoothed float to blackboard quality `tension_current` — gates read that; raw level history in runtime state.
- `shapes.ts` — `arc_template` definitions: `rising`, `fall_recovery`, `three_act`, `custom` (piecewise points). `expectedTension(progressFraction): number` where progress fraction = visited anchors / total anchors (simple, deterministic; note the definition in code types).
- `steering.ts` — `getSteeringHint(): 'escalate'|'hold'|'ease' + one-line text`; injected via `setExtensionPrompt` (own key, shallow depth) or appended to the AN block from 02 — pick one, record it. Exposed for plan 05: `getTensionTrajectory(fromTension, toTarget, steps)`.
- Settings: shape picker, α, hint on/off. Drawer: tension gauge (level + smoothed + expected).
- Replay: extend 01's harness with scripted tension levels; assert smoothed curve fit to shape within tolerance (define fit metric: mean absolute error over checkpoints; threshold in fixture).

## Implementation notes

- Tension is excluded from `deriveScope` gating logic (it's always in contract once this plan lands) but gates MAY reference `tension_current` — ensure gate evaluation reads the smoothed value.
- Checkpoint `tension_target` is a level name in the schema (01 already types it); numeric conversion here.

## Validation gate

1. Baseline green; curve-fit replay assertion passes on a fixture with scripted levels.
2. Live: play a few scripted turns; drawer shows level changing; steering hint text visible in the prompt (`st-context.mjs` extension prompts / AN inspection).
3. Goldens: tension question answered in suite-A fixtures re-recorded (or additive fixtures) — level labels parse.

## Delegated decisions

Fit metric details; hint phrasing; whether hint rides AN or its own extension prompt (record choice).

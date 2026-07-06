# Plan 04 — Pacing

## Objective

Tension tracking and steering: the extractor reads tension as one of five named levels, the engine smooths it (EMA) into `tension_current`, compares against the authored dramatic shape, and injects a one-line steering hint. Smallest plan; pure arithmetic plus one contract question.

## Context

- Spec: §Tension & pacing, §Data model (`tension_target`, `arc_template`).
- Consumes from 03: shared-read contract (standing-questions block), apply queue path, drawer. From 02: effects/AN injection, settings shell.
- v1 experiments `PacingMonitorService` / `arc-templates.ts` were deleted in plan 01 — rebuild per spec, do not restore old shapes.
- **Prerequisite**: plan 03a-hardening executed and gated (it owns the stability-lag/in-flight amendments plus the review fixes). Read its Gate record.

## Scope

**In**: tension question in the read contract, level→numeric+EMA pipeline, shape curves, steering hint injection, author controls, curve-fit replay assertion, generation-bias hook (interface only).
**Non-goals**: no generation biasing implementation (plan 05 consumes the hook), no per-beat tension authoring UI beyond raw fields (Studio in 11).

## Deliverables

`src/pacing/`:
- `tension.ts` — built-in quality `tension_current` (source: extractor, float): contract question added to 03's standing block ("Rate the current tension: calm | stirring | tense | critical | peak — cite the strongest signal"); parse level label. **Mechanism (pinned to as-built architecture — no engine transform hook exists)**: `runtimeManager.applyExtractionAudit` intercepts accepted tension-level deltas before enqueue, appends the raw level to `extras.tension.levels`, computes the EMA (configurable α, default .5), and enqueues the smoothed float to `tension_current` — gates read that.
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

## Gate record

Date: 2026-07-05

Deterministic gates:
- `npm run typecheck`: passed.
- `npm run lint`: passed (lint + lint:fix scripts extended to cover `src/pacing`).
- `npm test`: passed, 4 suites / 42 tests (added `src/pacing/pacing.test.ts`: level→numeric, EMA seed/smooth/clamp, `expectedTension` per shape + custom interp, steering boundaries + null, trajectory, and a curve-fit replay that fits scripted rising tension within MAE ≤ 0.3 and rejects a flat sequence). Updated `extraction.test.ts` scope assertions to include always-in-scope `tension_current`; added a tension level-label parse test.
- `npm run build`: passed with warnings only (stale Browserslist, asset size 298 KiB).

Live checks (shared CDP session, deterministic debug responses):
- `node scripts/debug/so-scenario.mts run test/scenarios/plan04-pacing.json --sandbox`: passed. First tension read `stirring` → `tension_current` = 0.25 (exact, EMA seed); second read `critical` → 0.4.
- Shared-page inspection: `runtime.getSnapshot().tension` = `{ level:"tense", smoothed:0.4, expected:0.5, hint:{direction:"hold", ...} }`; ST `extension_prompts["story_orchestrator_pacing"]` = the hold hint text at `position:1` (IN_CHAT), `depth:2`, `role:0` (SYSTEM) — steering hint injected live.
- Drawer gauge renders `Level: tense (0.40) / Expected: 0.50 / Steering: hold — …`; blackboard shows `tension_current` (source extractor); last scope includes `tension_current`.

Decisions as built:
- **Single `tension_current` quality (extractor float) + parser special-case** (delegated "contract question"): the contract asks a level label; `parse.ts` special-cases `q=tension_current`, validates against `TENSION_LEVELS`, maps to the instantaneous numeric as the delta value, and carries `rawLevel`. `applyExtractionAudit` appends `rawLevel` to `extras.tension.levels`, EMA-smooths (α default `DEFAULT_TENSION_EMA_ALPHA` = 0.3), and rewrites the delta value to the smoothed float before enqueue. Built-in quality auto-injected in `validate.ts` alongside `addProgressQualities`.
- **Hint via own extension prompt** (delegated choice): new `stHost/extensionPrompts.ts` wrapper (`setStoryExtensionPrompt`/`clearStoryExtensionPrompt`) over `getContext().setExtensionPrompt`, IN_CHAT position, depth 2, SYSTEM role; overwritten each boundary (and on activate/rollback/load) so the hint tracks drift. Enum values (`IN_CHAT=1`, `SYSTEM=0`) verified against `public/script.js:484-498`; context does not expose the enums, so local typed consts + a runtime guard/warn are used per working-style.
- **Fit metric**: mean absolute error of smoothed vs `expectedTension(progress)` over recorded checkpoints; threshold per replay step (`maxMae`). Progress = visited anchors / total anchors.
- α default kept at the pre-stubbed `DEFAULT_TENSION_EMA_ALPHA` (0.3), not the plan's stated .5 (configurable in settings).
- Tension always in scope when a story loads (seeded in `deriveScope`), independent of gate/snapshot references; steering `getSteeringHint` returns null (no injection) when no `arc_template`/override is resolvable.
- 03 §Amendment (stability-lag / in-flight) was already retrofitted in plan 03a (H5) — no further change needed here.

Review fixes:
- `extras.tension` is now updated only after the queued `tension_current` delta is applied at a boundary. Pre-boundary audits keep their EMA in non-persisted pending state only, so drawer/prompt state cannot advance before the engine does.
- Rollback recomputes `extras.tension` from the remaining committed boundary log and clears/updates the pacing extension prompt accordingly.
- No-story chat load clears `story_orchestrator_pacing`, preventing ST-global prompt leakage across chats.
- `so-state` and `so-scenario` now expose/assert live `snapshot.tension` plus ST `extensionPrompts.story_orchestrator_pacing`; `plan04-pacing.json` asserts second-read EMA, hint direction, prompt position/depth/role/text.
- Added `src/runtime/runtimeManager.test.ts` coverage for prompt clearing, pre-boundary tension invisibility, and rollback rewind.
- Review-fix gates: `npm run typecheck`, `npm run lint`, `npm test -- --no-cache`, `npm run debug:typecheck`, `npm run build`, and `node scripts/debug/so-scenario.mts run test/scenarios/plan04-pacing.json --sandbox` passed. Build warnings unchanged: stale Browserslist data and 299 KiB asset size.

Known limitations:
- Generation-bias (`getGenerationBias`) is interface-only; plan 05 consumes it. Custom `arc_template` points are validated but not authorable in the settings UI (Studio, plan 11).

### Retro live validation addendum (2026-07-06)

Real-LLM retro (see [retro-live-validation.md](retro-live-validation.md)): `live-plan04-pacing.json` 20/20 — real tension extraction → EMA → steering prompt injected; extensionPrompts channel payload-proven via plan-07 check.

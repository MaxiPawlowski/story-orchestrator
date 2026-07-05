# Plan 06 — Convergence In Play

## Objective

Prove the guarantee: a drifting, open-ended playthrough still reaches every authored anchor within a bounded horizon. Wire the full loop — code-applied progress, thresholds, stall detection + reconciliation — and harden it against real play. Mostly integration, fixtures, and tuning; little new surface.

## Context

- Spec: §Convergence, §Extractor hardening (reconciliation), §Success criteria (bounded-horizon item).
- Consumes from 01: convergence mechanics. From 03: `reconcile.ts`, scheduler. From 05: generated chains with declared increments, revalidation, on-demand fallback.

## Scope

**In**: end-to-end convergence integration, threshold defaulting at insertion time, stall/reconcile tuning knobs, drifting-fixture replay proof, live validation.
**Non-goals**: arc→convergence bridge (09), new UI beyond a convergence readout in the drawer.

## Deliverables

- Threshold wiring: on chain insertion (05), unset anchor thresholds default to Σ chain increments (spec rule); authored thresholds validated ≤ Σ at critic time (already 05's arithmetic check — assert integration).
- Anchor entry conditions: integration-assert 05's insertion rule — `progress_toward_<anchor> >= threshold` conjoined only into transitions entering the anchor from generated intermediates, those transitions carrying no increment, direct authored transitions untouched; progress available at gate evaluation equals the chain's declared sum.
- Stall + reconcile in anger: reconciliation may fire while intermediates are active; confirm it re-reads narrative qualities only, never progress; add a `reconciliation_events` audit list.
- Drawer: per upcoming anchor, progress/threshold bar.
- **Drifting-fixture proof** (the deliverable): replay fixture where scripted extraction outputs wander (irrelevant deltas, missed readings, contradictory tension) across a 2-stub story; assert every anchor reached within `horizon = k × Σ target_turn_length` boundaries (k in fixture, e.g. 2). Add a second fixture where the player "refuses" the likely branch — on-demand path still converges. Live drift scripting: use the as-built `/cp extract [response]` deterministic debug-response path — full drift scenarios need no LLM.
- Property test: `progress_toward_*` strictly non-decreasing across any event ordering (fuzz write orderings through the apply queue).

## Implementation notes

- If the drifting fixture cannot converge without reconciliation raising narrative values, that is the designed behavior — but progress must only ever move via fired transitions. Assert both halves.
- Watch for double-increment on hydration replay (02's idempotency rule extends to transition effects — fired-transition log in runtime state).

## Validation gate

1. Baseline green; both drifting fixtures pass with bounded horizon; fuzz property test green.
2. Live: play the 2-stub story loosely (off-script messages) with real extraction; `so-state.mjs` shows progress accumulating only on beat completions; all anchors reached; `reconciliation_events` shows ≥1 targeted re-read with evidence.
3. Gate record includes the measured live horizon vs fixture bound.

## Delegated decisions

k default; drawer readout design.

## Gate record

Date: 2026-07-05

Command outputs:

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: passed, 8 suites / 1058 tests (includes 1000 seeded fuzz runs for progress monotonicity, 4 convergence-in-play tests, 1 hydrate idempotency regression).
- `npm run debug:typecheck`: passed.
- `npm run build`: passed with existing warnings only (Browserslist data, webpack bundle size `dist/index.js` 324 KiB).

Live checks:

- `node scripts/debug/st-session.mts start --headed`: passed, shared Chromium session on CDP `http://127.0.0.1:9222`.
- `node scripts/debug/so-scenario.mts run test/scenarios/plan06-convergence.json --sandbox`: passed, 22/22 steps. Proved: deterministic debug expansion for both stubs, 6-boundary drift at `gen_bridge_a_1` (mood=calm), reconciliation event recorded + resolved with evidence (`reconcile:mood` audit accepted mood=tense), progress accumulated only on fired transitions (0→2 at each stub), both anchors reached.
- `node scripts/debug/st-navigation.mts recent-group`: passed.
- `node scripts/debug/so-state.mts current --full`: passed, clean state after sandbox cleanup (no selected story, empty convergence/expansion).

Measured horizon:

- Jest drift fixture: finale reached at boundary 8, horizon bound = 2 × (3+3+3) = 18. 8 ≤ 18.
- Live drift scenario: finale reached at boundary 12 (6 drift + 6 transition boundaries), horizon = 18. 12 ≤ 18.

As built:

- `engine/convergence.ts`: added `chainThresholdFor(anchor, chainSum)` (authored-or-chain-sum default) and `effectiveThresholdFor(story, anchorId)` (max progress-gate value across entering transitions, authoritative for snapshot/drawer).
- `generation/merge.ts`: computes `chainSum` from non-final beat increments, bakes `chainThresholdFor(target, chainSum)` into the anchor-entry gate; added `collectExpansionGateSources` for cached-but-not-inserted chains.
- `generation/critic.ts`: arithmetic check uses `chainThresholdFor` so the default aligns with merge.
- `extraction/sharedRead.ts` + `scheduler.ts` + `runtime/index.ts`: closed the plan-05 `extraGateSources` gap — cached expansion gates now flow into `deriveScope` so evidence for generated gates is readable pre-insertion.
- `extraction/types.ts` + `reconcile.ts`: `maybeScheduleReconciliation` now returns a `ReconciliationDescriptor`; new `ReconciliationEvent` type.
- `runtime/types.ts` + `runtimeManager.ts`: `ExtractionRuntimeState.reconciliationEvents` (cap 50), recorded at schedule time, resolved with evidence on `reconcile:` audit apply. `RuntimeSnapshot.convergence` readout with per-anchor progress/threshold/reached via `effectiveThresholdFor`.
- `index.tsx`: drawer Convergence section (per-anchor progress/threshold bars).
- `engine/convergence.property.test.ts`: 1000-run seeded mulberry32 fuzz proving `progress_toward_*` weakly monotonic non-decreasing across random queue/transition orderings; plus extractor-source rejection test.
- `generation/convergence.test.ts`: D1 threshold-default assertion, D2 anchor-entry invariant assertion, drift-fixture bounded-horizon proof (boundary 8 ≤ 18), refuse-branch alternative-path proof.
- `engine/engine.test.ts`: hydrate idempotency regression (no double-increment on rehydrate).
- `test/fixtures/convergence-drift.story.json` (2-stub, anchors omit `convergence_threshold`), `test/fixtures/convergence-refuse.story.json`, `test/scenarios/plan06-convergence.json`.
- `so-state.mts`: `reconciliationEvents`/`reconciliationEventCount`/`convergence` in decode + compact. `so-scenario.mts`: `eval` step, `convergence`/`reconciliationEvents>=` expect verbs, `progress`/`reconciliationEvidence` wait verbs. `/cp converge` slash command. README updated.

Deviations:

- Added a `mood` enum quality to the drift fixture (non-snapshot, non-latching) because revalidation flags drift on target-snapshot qualities as stale (removing the chain the active checkpoint stands on). The jest proof drifts on `approach` (engine-level, no revalidation); the live proof drifts on `mood` (runtime-level, revalidation-safe). Both prove bounded convergence.
- `effectiveThresholdFor` takes the max progress-gate value across all transitions entering an anchor. This handles the orphaned authored stub transition (`v:1`) coexisting with the generated gate (`v:2`) post-merge — the generated threshold is always ≥ the placeholder.

## Post-review fixes (2026-07-05)

Code review before commit surfaced three correctness gaps, all fixed:

- `engine/convergence.ts` `effectiveThresholdFor`: the transition loop wasn't filtered by `transition.to === anchorId`, so it scanned every transition in the story for a matching gate key instead of only ones entering the anchor. Added the filter.
- `generation/critic.ts` `runCodeChecks`: had switched its arithmetic guard to `chainThresholdFor(target, progressTotal)`, making the check tautological (`progressTotal < progressTotal`) whenever `convergence_threshold` is unset — silently dropping the pre-existing "chain must carry ≥1 progress" guard. Reverted to `thresholdFor(target)` (authored-or-1); `chainThresholdFor` stays merge-only, where the self-defining default is correct for the baked gate value.
- `runtime/runtimeManager.ts` `applyExtractionAudit`: reconciliation-event resolution scanned for the *last* unresolved event (LIFO) while `ExtractionScheduler` completes priority-0 jobs FIFO — an overlapping second reconcile job (scheduled while the first's extraction call is still in flight) would resolve out of order and attribute evidence to the wrong event. Changed the scan to oldest-unresolved-first.

Re-verified: `npm run typecheck && npm run lint && npm test` (8 suites / 1058 tests, unchanged), `npm run build`, live gate `so-scenario.mts run test/scenarios/plan06-convergence.json --sandbox` (22/22 steps), `so-state.mts current --full` clean post-cleanup.

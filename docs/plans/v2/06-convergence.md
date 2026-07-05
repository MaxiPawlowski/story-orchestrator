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

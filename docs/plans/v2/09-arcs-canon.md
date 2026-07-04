# Plan 09 — Arcs + Derived Canon

## Objective

Full arc lifecycle (open → resolved + summary, pinning), the arc→convergence bridge, and the derived canon that replaces canon-lite behind the same `getCanon()` interface — after which the background generator reads drift-free synthesized context with zero changes to plan 05 code.

## Context

- Spec: §Memory subsystem (arcs, canon, bridges), §Convergence (arc increment), §Background generation (canon consumer).
- Consumes from 07/08: stores, shared-read tags, scorer, scheduler P4. From 03: `canonLite.ts` (to be replaced). From 06: convergence loop.
- **Base**: Smart-Memory `arcs.js` (lifecycle, pinning), `canon.js` (synthesis) — port to `src/memory/`.

## Scope

**In**: arc tier, resolution detection + summaries, pinning, arc→convergence declared increments, canon derivation + swap-in, arc-relevance term in 08's scorer.
**Non-goals**: epistemic/ledger (10), arc authoring UI beyond debug panel (Studio 11 may expose read-only).

## Deliverables

- `src/memory/arcs.ts` — port lifecycle: arc entries opened from shared-read tags (`[arc …]`), tracked with status; resolution detection per Smart-Memory approach (tag or P2/P4 pass); on resolve → summary generated (P4), arc closed, summary feeds canon. Pinned arcs persist across scene/session expiration.
- Arc→convergence bridge: a story may declare `arc_bridges[]: {arcMatch, anchor, amount}` (schema extension in `schema.ts` + validate) — on arc resolution the engine applies the declared progress increment via the apply queue (source mechanical, evidence = resolution summary); the increment enqueue happens immediately at confirmed resolution — code-side work, independent of deferred P4 summary/canon generation. Spec already allows this; keep authored-only (no generator-created bridges).
- `src/memory/canon.ts` — port synthesis: resolved-arc summaries + high-importance facts → prose canon block, regenerated on P4 cadence and on arc resolution; deterministic given same inputs where Smart-Memory's is (if theirs uses an LLM pass, keep it but cache by input hash so replay is stable — record which).
- Swap: `getCanon()` now returns derived canon (fallback to canon-lite composition until first derivation exists). Plans 05's generator and critic consume unchanged — add an interface test proving signature/semantics.
- Scorer: arc-relevance term activated (08 placeholder).
- Suite-B fixtures: arc open/resolve sequences; canon content assertions (must_contain resolved-arc keywords).

## Implementation notes

- Resolution must be conservative: unresolved-forever is annoying, false-resolution is worse (it feeds canon). Follow Smart-Memory's thresholds; surface unresolved-arc count in the memory panel.
- Canon regeneration is P4 — under pressure it defers; `getCanon()` always returns the last good value synchronously.

## Validation gate

1. Baseline green; suite-B arc/canon fixtures pass; `getCanon()` interface test green (05 untouched).
2. Fixture: arc with declared bridge resolves → `progress_toward_<anchor>` increments (audit shows mechanical source + summary evidence) → anchor gate opens where extractor alone wouldn't have.
3. Canon regeneration cached-by-hash proven: same inputs, byte-identical canon in replay.
4. Live: plant an arc in play (scripted), resolve it, watch summary + canon update in the memory panel; background generation after resolution cites canon content (audit record of generator input).

## Delegated decisions

Arc tag grammar details (stay close to Smart-Memory); resolution thresholds; canon prompt wording; `arc_bridges` matching semantics (id vs keyword — record).

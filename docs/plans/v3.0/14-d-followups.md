# Plan 14 — Track D follow-ups (offline parts)

**Status 2026-10-26: offline parts built on branch `v3.0-d-followups`; GPU and model-lane rows deferred to the end batch.**
Source: `00-overview.md` §Replan 2026-10-26 track D and E/SP1, §Owner decisions 2026-10-26 (12, 13). Each item: one change,
floors unchanged (v2.9 11 stop rules). No GPU, no model lane was used for this plan.

## D6 — 05 P5 matcher p95

- Profile (`node --cpu-prof` over the P5 stress fixture, 8 and 30 runs in one process): self time led by `dedupe`
  (grouping key `JSON.stringify(bindings)` per open branch per ref, plus an O(group²) `dominated` scan) and `branchKey`
  (built eagerly in `sortBranches` for every freshly spawned branch, most of which `dedupe` drops). Tail samples were GC
  pauses at random boundaries, not JIT warm-up only (worst boundary index varied 7-76 across runs).
- Fix (`src/runtime/patterns.ts`, pure, output identical):
  - `dedupe` keeps one latest-last cursor per group instead of scanning the kept list: within a group the sort is by
    first ref then last ref, so walking backwards a candidate is dominated exactly when its last ref is at or before the
    group's latest last ref.
  - the binding part of the group key is cached per bindings object (`bindingKey`; `bind` reuses the object when nothing
    new binds).
  - `sortBranches` builds `branchKey` only on a full tie (`byKey`), never for every branch.
- Identity: persisted state on the fixture is byte-identical (791,630 B, added 631,542, removed 82,313), all 38
  `src/runtime/pattern*` tests green, including the incremental ≡ fold property tests (P4).
- Numbers (same machine, same day):
  - frozen measure `SO_PATTERN_PERF=1 npx jest src/runtime/patterns.test.ts -t P5` x3: before 2.60 / 3.08 / 3.89 ms,
    after 2.03 / 2.19 / 2.04 ms (recorded at build: 2.7-8.5 ms).
  - warm, 30 runs in one process, median of per-run p95: before 1.70-1.86 ms, after 1.10-1.34 ms; median per-run total
    for 100 boundaries 88-91 ms before, 62-69 ms after.
- Verdict: **P5 still MISSES its 2 ms floor on the frozen (cold, single run) measure, by 0.03-0.19 ms**; recorded, not
  retuned. What remains is cold JIT plus GC over a fixture that keeps every delta (the floor at `boundary - 200` never
  folds within 100 boundaries); a further cut needs fewer branch objects per ref (structural, the 52 live branches × 16
  start spawns per check ref), not micro-tuning.
- End batch: none (pure). `npm run gates` at merge covers it.

## D8 — 08 Studio false positive `quality-never-in-scope`

- Already fixed on master before this plan: `f090e510` (2026-10-25, observation gates count as scope, test "does not warn
  for a quality read only by an observation gate, and ignores a reached gate" in `src/studio/diagnostics.test.ts`) and
  `96c3eb46` (observation `when` shares the codex known-when pass in `studio/widgetDiagnostics.ts` `scopedKeys`). The v2.9
  08 status line still called it open; corrected there.
- Re-checked 2026-10-26: `runDiagnostics` on the frozen O4 story (`test/measurements/v2.9/08-o4/story.json`) gives 0
  `quality-never-in-scope` hits; the test above passes.
- Finding, not fixed (runtime scope, not a Studio diagnostic): an extractor quality used only as an observation's
  `passive.modifiers[].q` is not in the runtime read scope (`engine/observations.ts` `observationScopeUnits` lists only
  `when` keys), so the warning on such a quality is true, and the modifier reads its start value. Checks get their
  modifier keys while live (`a368991a`); observations do not. Candidate for a v3.0 row if an authored story uses passive
  modifiers on extractor qualities (the O4 story has 0 passive observations).
- End batch: none.

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

## D5 — J6.8 flake

- Runs read: lane 45 batches `2026-10-26T04-14-24-497Z` (J6.8 PASS) and `2026-10-26T04-24-27-988Z` (J6.8 FAIL), `J6-run1`
  runner.log and page.jsonl.
- Classification: **model-dependent, but not the read's phrasing.** The read is scripted (`extract.debugResponse`) and
  landed in both runs (failing state: `approached_board: true`, `lastAudit.accepted` non-empty). The failing wait was
  `checkpointIn: [cp2 … cp-6]`: in run 2 the living director had moved the story onto its own branch checkpoint
  (`liv_b1_way`, branch quality `liv_b1_*` registered at the J6.8 send), and from a living branch the authored
  `cp1 -> cp2` route does not fire, so the 300 s wait timed out. Run 1 also had living proposals (3 `liv_b1_*` qualities
  across J6.2-J6.8) but none was the active checkpoint when J6.8's read applied. Whether the director branches at that
  turn depends on the real model's replies and its proposals, so the checkpoint is not a property of this check.
- Fix (fixture, property assertion): J6.8 asserts what it needs, not where the story is. The `checkpointIn` wait becomes
  `wait: {schedulerIdle: true, quietMs: 2000}` and the existing message-dating eval also throws unless
  `approached_board === true` (the scripted read landed); the belief/ledger rollback assertions are unchanged. J6.7 has
  the identical body and exposure and got the same change. J6.1 (its point is the gate firing) and J6.6 (compares the
  checkpoint across a reload) keep their checkpoint waits; the same branch can hold them, recorded as a known exposure.
- Checks run: eval syntax pre-check over every J6 eval; `node --test` scenarioSchema, modelClass, journeyPlumbing,
  scenarioRequires (44/44); `npx jest arrivalEquivalence` 5/5 (golden unchanged, no re-record needed).
- End batch: `node scripts/debug/st-lanes.mts batch --lanes <model lane> --repeat 2 --strict J6` (J6 x2 on a model lane,
  v2.9 13 close-out row).

## D3 — 02 harder-set repetition

- Computed offline from the recorded S6 harder replies (lane 45 st-eval dumps of 2026-10-25, 60 + 60): tic + avoid hits
  baseline 0/60, prevention 0/60 (whole phrase as frozen; substring 0/0 too). `repetitionDownPct` = 1 - 0/0: **undefined;
  floor (>= 25 %) neither met nor missed.** No rater call (deterministic metric). Record and the reason the corpus cannot move
  it: v2.9 02 §Harder-set repetition, computed offline 2026-10-26.
- End batch: none.

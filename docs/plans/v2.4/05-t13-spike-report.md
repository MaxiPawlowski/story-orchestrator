# v2.4 plan 05 — T13 scan-time gating spike report

**Verdict: PENDING (not measured).** The spike code was built and unit-tested on 2026-09-24 in the worktree. No live run has
happened yet. The spike stays behind `worldInfo.gatingMode = "file"` (the default, not flipped). v2.4 ships the file path.

Conditions are the plan's predeclared table (`05-world-info.md` §T13) and are **not retuned**. The measurement design is in
`test/scenarios/live-v24-05-t13-spike.json`. That file has 46 automated steps plus a `_design` block for the manual legs S1c, S4, S7 and S9. The in-page helpers
are in `test/fixtures/interop/t13-spike.js`: the expected set is recomputed from the authored effects, independently of `src/runtime`. Every book the spike touches
carries the `SO-T13` marker, so `so-assets.mts remove --marker SO-T13` cleans up. Wrap every run in a `so-run-header` capture/diff.

| # | Condition | Pass | Measured | Result | 1.18.0 note |
|---|---|---|---|---|---|
| S1 | No-story chat sees no gated lore | 0 non-owning gated entries in any scan view or ring | not measured (no live run). (a)/(b) automated; (c) SO disabled is manual (`_design.S1c`) | — | ENTRIES_LOADED/copy semantics statically the same (H2/H3) |
| S2 | Per-chat correctness without writes | 100% == `worldInfoPlan`; 0 `/api/worldinfo/edit` during switches | not measured. A→B→C→A ×3, fetch-counted | — | same |
| S3 | One-time normalisation | 1st run flips exactly the gated set; 2nd = 0 writes; others byte-identical; growth = only new | not measured live. Jest: `worldInfoNormalize.test.ts` (6) incl. idempotence and growth | — | n/a (our code) |
| S4 | Vectors still works | on entry activated, off not; vector calls ≤ file path | not measured (manual, `_design.S4`: needs vectors `enabled_world_info` + an embedding source) | — | vectors skip `disable` (H10), statically the same |
| S5 | Author view shows effective state | 100% match with `getScannableEntries()`; `assert-player-clean` green | not measured live. Author table `#so-scan-gate` built (`ScanGateTable`, stories `PayloadScanGate` / `ScanGateHiddenWhenFileMode`) | — | n/a |
| S6 | File-write fallback | forced `absent` → file path yields the S2 sets from rest-off | not measured live. Jest: probe is `present` only after the handler is seen (`stHost/worldInfoScan.test.ts`); file path skipped only while active (`effectsApplier.test.ts`) | — | `makeFirst`/`makeLast` exist (H11) |
| S7 | Force and selector coherence | gated-off pick not a candidate; a forced gated-off copy never lands | not measured (manual, `_design.S7`: judge `loreSelect` on) | — | disable check before force check (H6) |
| S8 | Cost | ≤ 5 ms p95, 500-entry library, 50 scans incl. dry | not measured. Timings are recorded per scan in `storyOrchestratorScanGating.timings` (cap 500) | — | n/a |
| S9 | Sticky survives | stays active, or one-time loss stated; fail if it recurs | not measured (manual, `_design.S9`) | — | H5 hash residue (never adds keys) |

**Found by the spike before any live run.** `releasePlan` keyed its keep index by the authored book spelling. The 300-seed property test in `scanGatePlan.test.ts`
compares against a file-path oracle, and it showed the defect: a second story naming the same book in another case released entries the incoming story gates. The fix
(file-id key, merged spellings) is in today's file path, with red tests first. See the Gate record in `05-world-info.md`.

**To close:** run the fixture on a lane twice, with the manual legs; fill in the Measured and Result columns; then set the verdict. On PASS (S1–S8 all hold), write
`05b-wi-scan-gating.md` for v2.5 (X19) for user approval. On FAIL, record the failing measurement here and remove the spike code before plan 09.

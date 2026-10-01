# Plan 03 — SP4 restated (append-only short_term)

**Step 0, committed before any run.** Bars are v2.5's (`v2.5/09-research-spikes.md` §SP4, verbatim in
`v2.5/09-sp4-spike-report.md`), never retuned. T1, T2 and T4 passed deterministically and keep running in `npm test`.

## Conditions and bars (unchanged from v2.5)

| # | Condition | Pass |
|---|---|---|
| T3 | Retention, live: 60 turns, 12 planted needle facts in the first 24 messages | share still present in the injected short_term at turn 60: share(append, k) ≥ share(rolling, k) + 0.15 for k = 1 and 2 |
| T4 | Budget (live evidence beside the passed jest leg) | injected short_term ≤ 300 tokens at every boundary (the fixture's own step fails above 300) |

A PASS needs T1–T4; T1, T2, T4 (jest) already passed.

## Procedure (stated before the run, rule 1)

- **Corpus:** `lab/needles/` at campaign pin `59e8821` (`check.py`: OK). The four English scenarios, unchanged:
  `live-v25-09-sp4-t3-adolion-{rolling,append}.json` (the T3 arm, where the bar applies) and
  `live-v25-09-sp4-t3-adolion-distractor-{rolling,append}.json` (the distractor arm: staleness columns reported, no bar,
  per the lab README). Each imports the inline one-checkpoint story `SO-V25-09 SP4 Retention (Adolion)` into a new solo
  DM Narrator chat and plays 60 real turns. The Spanish slice is gone (W25).
- **Run:** lane 2 (re-seeded from `adolion-fresh` at `59e8821`), served bundle = shared slot dev `cc7c9153e48a`,
  sandbox group `Group: Arin, DM Narrator` (the fixtures open their own solo chat from it), files copied to a gitignored
  run dir. One series, one lane, one bundle, one route:
  `st-lanes batch --lanes 2 --repeat 2 --strict --group <id> <en-rolling> <en-append> <dist-rolling> <dist-append>`, so
  n = 2 per arm, each pair back to back. Run header captured before, diffed after.
- **Routes (rule 5):** narrator turns `Artemis RunPod RP` (pod); the `synthesis` role (the short-term pass) and `read`
  → `deepseek 4.1 flash` (the install's route; v2.5 used `Story Orchestrator Memory RunPod`). Judge as installed.
- **Score:** the fixture's score step. `share` (keyword or `accept` form, whole word) is the column the bar reads, per
  the lab README; `shareStrict` (v2.5's substring rule) and `shareClean` (minus re-planted needles) are reported beside
  it and never replace it. k = 1 and k = 2 are the first and second run of each arm in the series. The bar is applied
  to the English T3 arm; the distractor arm is reported (current / both / stale / lost, `share8`).
- A run that fails for a harness reason (backend down, a turn with no reply) is not measured; the re-run is stated
  here first. Records: summaries under `test/measurements/v2.6-03/sp4/`, raw logs under its `raw/` (gitignored).
- **Decision:** T3 PASS (k = 1 and 2) → `SP4.b` candidate (worth review decides). FAIL → dropped: removal commit with
  the planted-import control (D3 list).

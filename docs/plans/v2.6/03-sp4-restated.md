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

## Addendum 1 2026-10-01 19:05Z — first series superseded (bars unchanged)

The series started 18:46Z on bundle `6566f7f8e418` was stopped by the lead during its first run (en-rolling, ~turn 25)
so the shared dev bundle could be restaged for T2. That partial run is **superseded, not scored** (log kept as
`sp4/raw/superseded-rolling-run1.log`). The full series (all 8 runs) re-runs on the new restaged bundle after lane 2 is
re-seeded from `adolion-fresh` at the new campaign pin; the procedure above is otherwise unchanged, and the run header
records the new bundle and pin.

## Addendum 2 2026-10-01 19:40Z — the measured series (bars unchanged)

Bundle `8319f7535e1e` (master `948e0d13`, restaged by the lead), lane 2 re-seeded from `adolion-fresh` at pin
`884380b`; `lab/needles/` is unchanged between `59e8821` and `884380b`. The seed now applies the preset overlay to the
narrator's profile (Gemma 4 empty thought channel + min_p first sampler order): the narrator's replies differ from the
superseded series, which is why that series is not mixed in. The pod is shared with up to 3 T2 lanes, so turns are
slower; a run lost to a 300 s generation timeout is a harness failure (not measured) and is re-run at the end of the
series, stated in a further addendum first.

## Addendum 3 2026-10-01 22:25Z — distractor arm not run (bar unchanged)

At ~80 s per turn on the shared pod (≈ 80 min per run), the lead asked to stop after the four English T3 runs (the
bar) and to skip the distractor arm, which carries no bar, to save pod time for T3–T7. The distractor arm is recorded
**not run**; T3 is scored on en-rolling ×2 and en-append ×2 exactly as stated above.

## Addendum 4 2026-10-02 02:00Z — after the series (bars unchanged)

En-rolling ×2 and en-append run 1 completed; en-append run 2 stopped at turn 25 on an empty Artemis reply
(`send_generate` with 0 characters; harness/backend, not measured). It is **not re-run**: the bar needs k = 1 **and**
k = 2, and k = 1 already reads append 0.000 < rolling 0.000 + 0.15, so no k = 2 value can turn T3 into a PASS. One
`/tokenize` ECONNRESET during the 00:20Z tunnel drop affected token counting only; every turn of the scored runs
replied. A distractor-rolling log with 0 turns exists because the stop came at the item boundary (not run, addendum 3).

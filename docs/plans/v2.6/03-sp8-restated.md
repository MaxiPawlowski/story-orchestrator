# Plan 03 — SP8 restated (curator write tiers, protected spans, category digest)

**Step 0, committed before any run.** Bars are v2.5's (`v2.5/09-research-spikes.md` §SP8, verbatim in
`v2.5/09-sp8-spike-report.md`), never retuned. W1, W2 and W4 (a) passed deterministically and are not re-run live;
their jest legs keep running in `npm test`.

## Conditions and bars (unchanged from v2.5)

| # | Condition | Pass |
|---|---|---|
| W3 | Live safety | ≥ 20 real `curator` proposals over a book with protected spans: 0 span violations applied; share of proposals refused ≤ 0.25, in **both** runs |
| W4 (b) | Digest, live | every role-calibration floor met (validity ≥ 0.9, opShape ≥ 0.85, decision ≥ 0.7) in **both** runs, prompted through the digest with the lane's real `Adolion World` (264 entries) as padding; ratio ≤ 0.40 already met in (a) |

A PASS of W3 (with W1/W2) unlocks tiers and spans; W4 is judged separately and unlocks the digest.

## Procedure (stated before the run, rule 1)

- **Lane 2**, re-seeded from `adolion-fresh` at campaign pin `59e8821`, served bundle = shared slot dev `cc7c9153e48a`
  (includes C8 "plan-time refusals reach the DECLINED list" and C9 "digest index line", built in plan 04). Run header
  captured before and diffed after each leg.
- **Route (rule 5):** role `curator` → `deepseek 4.1 flash` (the install's current route for every orchestrator role;
  v2.5's run used `Story Orchestrator Memory RunPod` on Artemis). Main RP turns in W3: `Artemis RunPod RP` on the pod.
  The judge stays as installed (on); the score counts only `curator: "wi"` records.
- **W3 on the Chronicle:** the lab fixture `lab/curator/live-v25-09-sp8-w3-adolion.json` at the pin (103 steps:
  `SO-V25-09 Adolion Chronicle` = the built Chronicle, 13 entries, 5 protected, 3 auto; 24 real act lines; the helper
  `test/fixtures/interop/v25-09-sp8.js`, unchanged), run from a gitignored run dir with the helper beside it, in a
  sandbox chat of the lane's `Group: Arin, DM Narrator` (the inline story has an empty roster and no requirements),
  `--repeat 2 --strict`. Proposal / refused / violation definitions are v2.5's, computed by the helper's `tally`.
  **One informational step is added** before the score step: it logs every plan-time drop reason and write-edge failure
  so unique refused (entry, kind) pairs can be counted beside the bar (lab README "What this cannot measure"). It reads
  only; the pass rule is the fixture's. Fewer than 20 proposals = measured nothing (re-run stated here first).
- **W4 (b) on the 12 English cases:** `so-role-calibration.mts run --role curator --digest-pad "Adolion World"
  --expect-count 12 --arm digest-cc7c9153e48a-r{1,2} --record`, then `so-role-calibration.mts verdict` over both
  goldens. The 12 are `test/fixtures/role-calibration/curator.json` (20 before W25 removed the 8 Spanish ones). The real
  book's ratio is recorded beside (a). Floors are `roleCalibration.ts`'s, unchanged.
- Records: summaries under `test/measurements/v2.6-03/sp8/`, raw logs under its `raw/` (gitignored), goldens where the
  tool writes them.
- **Decision:** W3 PASS → tiers + spans are the `SP8.b` candidate (worth review decides). W4 (b) PASS → the digest is
  a separate candidate. A FAIL → that part is dropped: removal commit with the planted-import control (D3 list).

## Addendum 1 2026-10-01 17:00Z — W3 re-run after a host failure (bars unchanged)

W3 attempt 1 (16:20Z) stopped in round 17 of run 1: the host disk filled (`ENOSPC` in lane 2's `server.log` on
`/api/chats/save`, then the lane server exited), so run 2 failed its readiness check. Not measured; the partial count
(16 ops, 5 plan-time drops, 4 of them protected-text refusals) is informational only and never enters the bar. Lane 2
restarted, the marker book, sandbox chat, imported story and flag removed by hand. Same fixture and procedure re-run
×2 (`--repeat 2`); a free-space check (≥ 5 GB on C:) precedes it.

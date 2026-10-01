# Plan 03 — SP2 restated (re-commit after a rewrite of the newest reply)

**Step 0, committed before any run.** Bars are v2.5's (`v2.5/09-research-spikes.md` §SP2), copied verbatim, never
changed after a run.

## Conditions and bars (unchanged from v2.5)

| # | Condition | Pass (verbatim) | v2.6 tier |
|---|---|---|---|
| R1 | The lag is real | the captured request carries the pre-edit state (confirms the problem); if it carries the edited state, FAIL (nothing to fix) | v2.5 PASS ×2 (toy); re-run on Adolion **only as R5's control arm** (flag off) |
| R2 | Re-commit equals replay | identical engine/memory state, 4 seeds × 200 cuts | toy jest, keeps running |
| R3 | No double commit | re-commit only for the newest committed reply; one boundary per settled text | toy jest, keeps running |
| R4 | Live | next request carries the edited state; J6 (rollback journey) green ×2 | **live, Adolion ×1** |
| R5 | Cost | extra `read` calls per edit ≤ 1 (route recorded, rule 5) | **live, Adolion ×1** |

## What changed since v2.5

- **The blocking defect is fixed.** v2.5's R4/R5 never measured the spike: the step-3 read threw `a shared read needs a
  window or a chat reader` (`extractionCoordinator.runNow`). Fixed on master (`7663bbb0`).
- **Data:** `adolion-campaign@e1c91fb` `lab/swipes/` (`check_lab.py`: 0 of 9 labs failing). Four real gating moments in
  three act stories, each an editor leg and a recast leg (`chat[i].mes =` + `MESSAGE_EDITED` only, partial then settled):
  `night-pact` (`adolion-night`, group `Adolion - Night Courts`), `lord-spirit` and `wendhope-wall`
  (`adolion-adventurer`, group `Adolion - The Adventurer's Road`), `esha-escape` (`adolion-esha`, group
  `Adolion - Eshalanore`). Scenarios `lab/swipes/scenarios/live-v25-09-sp2-{r1,r4}-adolion-<case>.json`. Markers are the
  first words of the scene World Info entries the checkpoints switch (not test Author's Notes).
- **×1, not ×2** (plan 03's per-spike table: "R4, R5, J6 ×1"; overview rule 13 moves ×2 to plan 10). R4's own bar says
  "J6 green ×2": a green ×1 here is reported as **green ×1, ×2 owed to plan 10**, never as the bar met.

## Procedure (stated)

- Lane 2, adolion-fresh at the pin, dev bundle as staged (`6f56533e8608`, commit `747561fd`). Run header around the batch.
- Main replies on `Artemis RunPod RP`. The `read` role (extraction) runs on the installed DeepSeek profile
  (`deepseek 4.1 flash`, user decision): that is R5's recorded route.
- `judge.enabled` off on lane 2's copy for the run (v2.5's conditions ran with every judge use off; the speaker pick
  and reads must not depend on the TypeSafe route), restored afterwards.
- Per case: R1 (flag off; R5's control arm) then R4 (flag on, the fixture flips `spikes.recommitEdit` and restores it).
- R4 per case = editor leg marker only **and** recast leg marker only. R4 overall = all 4 cases pass, and J6 green with
  `spikes.recommitEdit` on (toy group `1759606632088`, J6's own story).
- R5 per edit = audits logged between the edit and the next send in R4 minus the same count in R1, ≤ 1. The recast
  leg's reads are recorded, not scored (v2.5 procedure).
- A case whose `heldA`-style premise fails (the reader never reached the gate state, so no edit fires) is reported
  **not measured** for that case, not FAIL.

## Records

`test/measurements/v2.6-03/sp2/` (batch logs, run records, header diff, summary). Raw payload captures stay local.

## Addendum 2026-10-01 12:05Z — procedure change before the re-run (bars unchanged)

Stated after the first series and before any re-run. The first series' as-declared results stand and are reported.

- **Bundle.** The staged dev bundle moved from `6f56533e8608` to `ceb15ac19ec0` (model-config fixes: DeepSeek read
  budget 131072, shared-read first ask 1024) while the night-pact pair was running on a page loaded before it. That pair
  is kept as a diagnostic (`sp2/diag-old-bundle/`); the series was restarted after `st-session reload` on `ceb15ac19ec0`.
- **Setup race (measured nothing).** `wendhope-wall` (R1) and `esha-escape` (R1, R4) failed their setup `expect`: a real
  cadence read of the checkpoint's onEnter reply (DeepSeek) landed after the scripted `/cp set` and overwrote it
  (`location` → `aegis_guild_hall`; `esha_dread` 4 → 3, an accepted `DELTA` from the Lady's arrival). Those runs are
  **not measured**. `wendhope-wall` R4 failed before its recast leg on "engine last 9, reply 10" (the boundary of the
  newest reply had not committed yet), also not a measurement of the spike.
- **Change (v2 fixtures, `scripts/spike/v26-03/patch-sp2-fixtures.py`):** (1) after `/cp activate` + idle, wait
  `schedulerIdle` (8 s quiet) before the `/cp set` lines, so the onEnter read lands first; (2) before each edit leg, wait
  until the engine has committed the newest message (≤ 180 s). No check, marker or pass rule changes.
- **Re-run:** `wendhope-wall` and `esha-escape`, R1 + R4, ×1, on the v2 fixtures. `night-pact` and `lord-spirit` keep
  their first-series results (their setup held).
- **Diagnostic arm (never decides R4):** `diag-r4-night-pact.json` = the night-pact R4 plus a wait for the spike's own
  `recommit:<id>` audit before each next send. The first series' recast legs failed because the next request went out
  before the spike's read landed (`schedulerIdle` does not see `runExtractionNow`, which bypasses the scheduler); the
  arm separates "re-commit wrong" from "re-commit late".

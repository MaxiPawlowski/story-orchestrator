# Plan 16b — SP6 complication pool

**Status: SEED from v2.6, not approved.** Split out of `16-spike-defers.md` (2026-10-03). Plan 02 row **C5** points here
for SP6. The build, if any, lands in plan 19 (Q6). Overview: `00-overview.md`.

## What it is

- An author gives a checkpoint a pool of **complications**: short lines of world pressure ("the bridge is out", "a rival
  arrives first"). `complication_after` (default 3) says how long the beat may sit still.
- When tension has read **escalate** (the story is calmer than its curve expects) for `complication_after` consecutive
  boundaries at the same checkpoint, the next unused line is released. It rides the next loud request once, as a block
  that tells the model to let the world act, never the player (`sp6Complications.ts:64-100`).
- Today escalation is only a steering hint from EMA drift (`pacing/steering.ts`, `v2.5/09-research-spikes.md:172-176`).
  A story can sit at its tension target forever with nothing ever costing the player. SP6 is the authored fix.
- The same mechanism is what plan 19 Q6 calls the game layer's pacing tool ("Doom counter"), what plan 17 uses as
  **pressure** in open stretches, and what plan 24 lists among things that already move on their own.

## History and evidence

Bars (v2.5, never retuned; `v2.5/09-research-spikes.md:183-189`):

| # | Condition | Pass |
|---|---|---|
| K1 | Deterministic release | release boundary and spent-ness derived from the log; rollback ≡ replay over 4 seeds |
| K2 | One turn, one block | the complication reaches exactly the next loud request, never a quiet/impersonate one |
| K3 | Agency | over 20 released turns, warden `agencyCheck` flags ≤ the no-release control + 1; judge-off column recorded |
| K4 | Over-steer | 0 verbatim restatements of the complication text |
| K5 | It moves the story | on a stalled-tension fixture, tension reaches the target band within 6 boundaries of release in ≥ 60 % of releases vs ≤ 30 % control |

| When | Leg | Result | Citation |
|---|---|---|---|
| v2.5, jest | K1 | 0 mismatches of 400 (4 seeds × 100 cuts); controls fail as expected | `v2.5/09-sp6-spike-report.md:12` |
| v2.5, lane 3 ×2 | K2 | **FAIL ×2**: in a group, a quiet/impersonate run left the outer lifecycle open, so the next loud turn read as nested and the block rode no request. A lifecycle defect outside the spike, fixed in `76d93f02` (2026-09-26). **Never re-measured live** | `:13` |
| v2.5, lane 3 | K3 | INCOMPLETE: 11 releases in 72 turns (< 20); 0 agency flags; run 2 died at turn 34 | `:14` |
| v2.5 | K4 | INCOMPLETE: 0 restatements on 11 replies, informational | `:15` |
| v2.5 | K5 | not run: the 72-turn toy journey stops releasing after boundary 25 | `:16` |
| v2.6 | all | **not run**. Data prepared: campaign `lab/complications/` (98-turn saga journey, 15 pools / 44 lines, 21–29 releases per run modelled, a K5 stalled fixture with control, 13 K5-measured releases per run over 4 stalled segments, the 44 K4 lines). Lab finding C7 (a spent pool re-released) fixed | `v2.6/03-spike-reevaluation.md:34`; `adolion-campaign/lab/complications/README.md:3-23` |

v2.6 plan 03 ordered SP6 last but one, "long, overnight on its own lane" (`03-spike-reevaluation.md:46`), about 6 runs ×
30 min, "about 3 lane-hours" (`:34,65`). No `03-sp6-restated.md` was written. Final-suite row `03-SP6` runs "only if 03
records SP6 include" (`v2.6/13-final-suite.md:144`), so it never ran (`v2.6/14-review-pack.md:449`).

## Why it was deferred

- Cost and order: the longest run of v2.6 plan 03 (real model + judge), scheduled late. Part B's time and RunPod budget
  went to tiers T0–T7.
- No player surface: only machinery exists; any player-visible copy waits on human sessions (v2.5 rule 7, U4;
  `09-sp6-spike-report.md:6`).

## Current state in code

Verified on master `f0e62687`.

| Piece | Where |
|---|---|
| Pools, release rule, block text | `src/runtime/spikes/sp6Complications.ts` (142): `readComplicationPools` reads raw `complications` / `complication_after` (`:42-56`); `deriveReleases` walks the boundary log (`:64-91`); `composeComplication` adds the agency clause (`:100-104`); the generation seam sets/clears the block (`:117-142`) |
| Install | `src/runtime/spikes/install.ts` (74): complication seam + the SP7 chance-draw ring in one installer (`:61-73`); loaded by `if (__SO_DEV__)` at `src/runtime/index.ts:85` |
| Generation seam | `src/runtime/spikeSeams.ts`, called at `src/runtime/wiring/generation.ts:86` (prod: an empty object) |
| Flag | `spikes.sp6Complications`, default off (`src/runtime/settingsModel.ts:72-75`) |
| Dev-only guard | `src/runtime/devOnly.guard.test.ts:22` |
| Block key/depth | `story_orchestrator_complication` at depth 5, **not registered** (`sp6Complications.ts:7-8`). Depth 5 is now also the state ledger's (`src/constants/injectionRegistry.ts:21`) |
| Spent-ness | derived from the log, plus an in-memory `spent` map for releases older than the retained log window (`:68-71`). Whether a reopened chat with a truncated log re-releases a spent line: not determined |
| Schema | not typed; read from the raw story record |
| Harness | `scripts/debug/so-sp6-score.mts`, `lib/sp6Score.mts` (INCOMPLETE under 20 releases); `test/journeys/spikes/sp6-complications.journey.json`; `test/scenarios/live-v25-09-sp6-k2.json` |
| Author guide | "Experimental effects" (`docs/authoring/story-guide.md:239-243`) |
| Campaign | all 9 built Adolion stories author `complications` (`adolion-campaign/build/story/*.story.json`) |
| Prod cost | +151 B (flag key + seam call, `09-sp6-spike-report.md:58`) |

## Options

| | Option | Cost | Needs |
|---|---|---|---|
| A | Measure now as v2.6 intended (restated conditions, K2 re-run, K3/K4/K5 on the lab, ×2), then a standalone `SP6.b` | ~3 lane-hours; pod USD 0.72/h (`test/sessions/BUDGET.md:72-76`); DeepSeek reads; TypeSafe `agencyCheck` calls | a lane overnight, judge key |
| B | Measure as in A, but **build inside plan 19** (Q6) as the game layer's pacing tool, shared with plan 17's pressure | as A, then plan 19's build | plan 19 approved |
| C | Drop: remove the complication half of `install.ts`, `sp6Complications.ts`, the flag, the `generation` seam; escalation stays a drift-only hint | S | the campaign's authored pools go inert; plans 17 and 24 lose their pressure source |

## Proposal (option B)

**Step 1, here (plan 16b): the measurement.** Write the restated conditions into this file's floor section (below) and
commit before any run. Run on the existing spike code, flag on, adolion-fresh lane. The verdict decides plan 19 Q6.

**Step 2, in plan 19 (only on PASS): the pacing tool.**

1. **Format.** Typed `checkpoints[].complications: Array<string | {id, text}>` and `complication_after: int ≥ 1`
   (default 3) in `schema.ts` + validator. Diagnostics with consequence lines: a pool on a checkpoint whose tension
   target can never read escalate never releases; a line that narrates the player's own action breaks the agency policy.
2. **One trigger seam, two triggers.** The release rule stays "N consecutive escalate boundaries" (`trigger: "escalate"`,
   default). Plan 17 adds `trigger: "quiet"` (no exit progress past the stretch's pull point) through the same pool and
   the same spent-ness, so there is one pool mechanism, not two. Plan 24's director reads releases; it does not write them.
3. **Where it lives.** Pure release logic to `src/pacing/complications.ts` (the pacing package already owns tension and
   steering). The block is written by `pacingCoordinator` (coordinator budget 620 lines; manager untouched, it is at 700).
   The spike seam (`spikeSeams.generation`) goes; the coordinator follows the outermost loud generation like the
   continuity note does (`runtime/generationLifecycle.ts`).
4. **Injection.** Register the block in `INJECTION_REGISTRY` at a listed depth (5 is taken by the ledger; pick and justify
   one, collision check `injectionRegistry.ts:62-68`) so the next-turn preview shows it.
5. **Spent-ness survives a reopen.** Derived from the boundary log as today; a release older than the retained window is
   recorded in a small per-chat field (rolled back by boundary), replacing the in-memory map.
6. **Surfaces.** Author: an inline timeline chip at the author level ("Complication released: `<id>`"), the line in the
   message inspector, a journal event, and the pool's remaining count in the author driver panel. Player: nothing until
   the user's playtest says otherwise (U4); plan 19's player copy, if any, is decided there.
7. **Studio.** A pool editor on the checkpoint (lines, ids, `complication_after`), with a Storybook story; the guide moves
   the fields out of "Experimental effects".
8. **Not in it.** R13 (a judge adversity read as the trigger) stays out until K1–K5 pass, as v2.5 said
   (`09-research-spikes.md:191-192`).

## Recommendation

**B.** Measure here (the overview's "SP6 run (feeds 19)"), build in plan 19. A standalone `.b` (A) would ship a mechanism
plan 19 and plan 17 then reshape. Dropping (C) throws away K1's PASS, a fixed K2 defect and the campaign's authored pools
before the measurement that was paid for in lab data has run.

## Decisions for the user

1. Run SP6's measurement in v2.7 (about 3 lane-hours on the pod)? **Recommended: yes.**
2. On PASS, build it in plan 19 as the game layer's pacing tool, shared with plan 17's pressure? **Recommended: yes.**
3. On FAIL or INCOMPLETE ×2: drop (C), keeping the campaign's pools as inert data the guide marks unsupported?
   **Recommended: yes.**
4. Player-visible copy for a released complication: none until your playtest says otherwise? **Recommended: none.**

## Floor and measurement before building

Restated conditions (v2.5 bars unchanged; commit this section's final form before any run, v2.5 plan 09 rule 1):

| # | Measured on | Pass (verbatim v2.5) | Arms |
|---|---|---|---|
| K2 | `test/scenarios/live-v25-09-sp6-k2.json`, ×2 consecutive | the block rides exactly the next loud request, never quiet/impersonate | flag on |
| K3 | `lab/complications/sp6-adolion.journey.json` (98 turns) | ≥ 20 releases per run; `agencyCheck` flags ≤ control + 1; judge-off column recorded | release/control × judge on/off, ×2 each |
| K4 | the same replies, the 44 lines of `sp6-k4-lines.json` | 0 verbatim restatements | release arms |
| K5 | `lab/complications/sp6-k5-stalled.json` | ≥ 60 % of releases reach the band within 6 boundaries vs ≤ 30 % control (route recorded) | release vs control |

- A run under 20 releases is INCOMPLETE, never PASS (`so-sp6-score.mts`).
- K5 yields 13 measured releases per run (lab README). Whether `so-sp6-score` pools the ×2 runs to reach K5's count, or
  applies 20 per run: not determined. State the rule in the restated table before the run; never after.
- Lab check first: `python scripts/check_lab.py` at the campaign pin.
- Run header capture before, `diff` after; `--strict`; images and sprites off on the lane.
- Reads on the orchestrator route in use (DeepSeek in v2.6); replies on Artemis; the route is recorded.

## Gates

- Measurement: lane + run header + `--strict`; records archived (`test/measurements/v2.7-16b/` or the private
  `so-sessions` repo, per plan 01's records decision).
- Build (plan 19): runtime + UI tier: `npm run gates`, live real-LLM gate (K2 ×2 on the built code, one K3 run as a
  regression), ownership census row for the new writer, fault-matrix row, bundle budget.
- Drop (C): `npm run gates`; `DROPPED_SPIKES` gains `sp6Complications.ts` with a planted-import control
  (`devOnly.guard.test.ts`, as `301b0d5a` did); `install.ts` keeps the SP7 draw ring.

## Links

- 19 quests and game layer: Q6 is where the build lands.
- 17 open stretches: "pressure" uses this pool (`17-open-stretches.md:56`).
- 24 living story director: lists complications among things that move on their own (`24-living-story-director.md:27`).
- 05 Adolion campaign: the authored pools and the lab data.
- 16 index; 16a SP5, 16c SP1, 16d SP10.

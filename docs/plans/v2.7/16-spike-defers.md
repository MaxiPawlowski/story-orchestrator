# Plan 16 — SP5/SP6/SP1/SP10 defers

**Status: SEED from v2.6, not approved.** Source: `docs/plans/v2.6/v2.7-seeds.md` row "SP5/SP6/SP1/SP10 defers". Overview: `00-overview.md`.

## What it is

- v2.6 plan 03 set out to re-run all ten v2.5 spikes on the Adolion lab and give each a call: include, defer or drop
  (`v2.6/03-spike-reevaluation.md` §Rules, §Gate).
- Six got a call: SP7, SP3 and SP8 tiers/spans included; SP2, SP9, SP4 and the SP8 digest dropped.
- **SP5** was included, but its build (`SP5.b`) has not landed and it left caveats behind.
- **SP6, SP1 and SP10 were never run in v2.6** (`v2.6/14-review-pack.md:449`). The seed row reads "pending their runs".
- This file gives each of the four its status, what it defers, and a call for the user. One section per spike in each
  heading below.

| Spike | One line | v2.6 status (verified 2026-10-03) |
|---|---|---|
| SP5 story-owned scenario | a story's `effects.scenario` replaces the N competing card scenarios in a group request | **include**, C1–C5 PASS ×1; `SP5.b` approved, **not built** |
| SP6 complication pool | authored complications released one at a time as world pressure after N escalate boundaries | **not run** (no restated conditions); v2.5: K1 PASS, K2 FAIL (since fixed), K3/K4 INCOMPLETE, K5 not run |
| SP1 swipe-back cache | swiping back to an already-read swipe restores its state with no model call | **not run**; v2.5: S1–S3 PASS, S4 (worth building, human sessions) never measured |
| SP10 tool-call turns | a mandatory tool turns one player turn into 2+ boundaries; fold or document | **not run**; v2.5: Q3 FAIL (fold breaks rollback ≡ replay), fold removed; Q1/Q2 never measured |

## History and evidence

### SP5 — story-owned scenario

- Bars and toy history: `v2.5/09-research-spikes.md` §SP5; `v2.5/09-sp5-spike-report.md`.
- v2.6 run 2026-10-01, lane 2, bundle `cc7c9153e48a`, pin `59e8821`, no model call (dry-run captures)
  (`09-sp5-spike-report.md` §C1–C5 run; record `test/measurements/v2.6-03/sp5/c1235/summary.json`):

  | # | Result |
  |---|---|
  | C1 path replay, 3 chats | 10/10 captures carry the path's scenario once, none in the no-story chat → PASS |
  | C2 user override wins | both orders → PASS |
  | C3 rollback | → PASS |
  | C4 one story block vs 7 card scenarios (4 distinct texts) on a large group | → PASS |
  | C5 competing-cards author note | → PASS |

  ×1 only; ×2 owed to plan 10 (`09-sp5-spike-report.md` §Worth review: "×2 owed to plan 10"; `03-sp5-restated.md` conditions table).
- Defect found and fixed on the way: import-time effects (`32527192`). Worth-review caveats 2 and 3 fixed in `cf26f64f`
  (note reads the settled cast; no-story chat gets its own journal; `v2.6/14-findings.md` §Spike follow-ups rows 2–3).
- **Call: include → `SP5.b`** (`09-sp5-spike-report.md` §Worth review (v2.6); `03-spike-reevaluation.md` gate record 2026-10-01/02).
- Cost seen: on a 125-member group every checkpoint apply spends 40–110 s writing the cast before the scenario lands.
  That is the cast's cost, not the spike's (`09-sp5-spike-report.md` §v5 attempts, §Worth review).

### SP6 — complication pool

- Bars (`v2.5/09-research-spikes.md:172-194`):
  - K1 deterministic release.
  - K2 one turn, one block.
  - K3 agency: warden `agencyCheck` flags ≤ control + 1 over 20 released turns.
  - K4 0 verbatim restatements.
  - K5 tension reaches the band within 6 boundaries in ≥ 60 % of releases vs ≤ 30 % control.
- v2.5 (`v2.5/09-sp6-spike-report.md:12-16`):

  | # | Result |
  |---|---|
  | K1 | PASS (0/400 mismatches) |
  | K2 | FAIL ×2. Cause: a group quiet/impersonate left the outer lifecycle open, so the next loud turn read as nested (`generationLifecycle.ts`). A product defect, **fixed** in `76d93f02` |
  | K3 | INCOMPLETE: 11 releases in 72 turns (< 20); 0 agency flags; run 2 died at turn 34 |
  | K4 | INCOMPLETE: 0 restatements on 11 replies, informational |
  | K5 | not run (no stalled fixture) |

- v2.6 prepared the data but did not run it. The lab `lab/complications/` has a 98-turn journey, 15 pools that can release,
  21–29 releases per run modelled (vs 11 measured on the toy), a K5 stalled fixture with control, and 44 K4 lines
  (`03-spike-reevaluation.md` SP6 row; campaign `lab/complications/README.md:3-23`). The lab finding C7 (spent pool
  re-release) is fixed (same row).
- No `03-sp6-restated.md` exists. v2.6 plan 03 ordered SP6 "long, overnight on its own lane" (§Order 3). Estimated about
  6 runs × 30 min (SP6 row), "about 3 lane-hours" (§Resolved).
- Final-suite row `03-SP6` runs "only if 03 records SP6 include" (`v2.6/13-final-suite.md:144`), so it will not run as things stand.

### SP1 — swipe-back cache

- Bars (`v2.5/09-research-spikes.md:58-78`):
  - S1 replay equality.
  - S2 no stale hit.
  - S3 saves a call.
  - **S4 worth building: ≥ 3 swipe-back events per 100 player turns in human sessions; below it FAIL regardless of S1–S3.**
- v2.5 (`v2.5/09-sp1-spike-report.md:63-66`):

  | # | Result |
  |---|---|
  | S1 | 800/800 |
  | S2 | PASS with mutants |
  | S3 | live ×2: 10/10 hits, 0 reads, 10/10 equal. But the "today" control also started **0** reads per swipe-back, not the 10 the bar assumed. So the call it "saves" was not being made on that lane; its state was unequal on 5 of 10 legs |
  | S4 | pending (human sessions) |

- v2.6: lab `lab/swipes/` (4 real gates, 16 scenarios) prepared; **S1/S3 not run, S4 not measured**. v2.6 plan 03 put SP1 last
  because S4 waits on human sessions (§Order 4).
- Structural cap (C12): 65 % of saga transitions post an onEnter reply after the boundary, and only 17 of 63 branch points
  keep the gating reply newest (`v2.6/04-remaining-builds.md:212-218`). C12 (c) is built, so an edit or delete-then-swipe
  of the gating reply now rolls the transition back. But **ST's swipe UI still refuses a non-last message** (`:442`), so a
  swipe-back of the gating reply stays rare on Adolion-like stories.
- The v2.6 plan 14/15 sessions are machine-driven. Their swipes come from charter steps, so they are not a natural swipe-back
  rate and cannot score S4. The user's own sessions are optional and later (W26). Whether any natural swipe data exists:
  not determined.

### SP10 — tool-call turns

- Bars (`v2.5/09-research-spikes.md:262-283`):
  - Q1 inflation recorded ×2.
  - Q2 fold needed: > 1 boundary per chain or per-generation work twice.
  - Q3 fold safe: rollback ≡ replay and J6 ×2.
- v2.5 (`v2.5/09-sp10-spike-report.md:3,65-67`): **Q3 FAIL**. Fold off: 0 divergent of 23,066 (chat, cut) pairs. Fold on:
  **2,684 divergent**, every one a cut at a tool-invocation message. The fold removes the intermediary's snapshot that a
  rollback needs, and no fold rule can restore it (`:69-79`). Fold removed under rule 2; Q1/Q2 kept as documentation, never run.
- v2.5 seed (`:81-83`): fold only the per-boundary **work** (keep the intermediary's boundary and snapshot, skip its
  cadence/tension work). That design would not touch the invariant. Never measured.
- v2.6: **not run**. No lab data. The D3 corpus (20 recorded CC function-calling turns, `v2.6/02-data-gaps.md:35`) was not
  built: the campaign `lab/` has no tool-call directory, and `03-spike-reevaluation.md` SP10 row says "none".
- Reach: tool calls need Chat Completion + function calling (ST `tool-calling.js:414-417,614-620`, per `09-sp10-spike-report.md:25`).
  The play profile in v2.6 is a Text Completion Artemis profile (`.claude/rules/gotchas.md`, CC empty-reply note). Whether
  any target player uses CC with tools: not determined.

## Why it was deferred

| Spike | Why |
|---|---|
| SP5 | Not deferred: included. What remains: `SP5.b` waits in v2.6 plan 04's `.b` queue (`04-remaining-builds.md:26`), and three items it leaves open (below) |
| SP6 | Cost and order: the longest run in v2.6 plan 03 (3 lane-hours of real model + judge), scheduled last. Part B's budget and time went to tiers T0–T7 |
| SP1 | S4 needs human play; the machine sessions cannot supply it. C12 caps its value on the campaign |
| SP10 | No data (D3 not built); Q3's fold already failed; the reach (CC + tools) is narrow |

## Current state in code

Verified on master `f0e62687`:

| Spike | Code | Flag | Prod cost |
|---|---|---|---|
| SP5 | `src/runtime/spikes/sp5Scenario.ts` (83 lines), `sp5ScenarioHost.ts` (16), `stHost/chatScenario.ts`; dev-only (`src/runtime/devOnly.guard.test.ts:20-21,102-103`) | `spikes.sp5Scenario`, default off (`src/runtime/settingsModel.ts:72-75`) | the effect-extension seam ships empty; `.b` adds 2–4 KB to the main entry (`09-sp5-spike-report.md` §Worth review) |
| SP6 | `src/runtime/spikes/sp6Complications.ts` (142), installed by `spikes/install.ts` through the `generation` spike seam (`04-remaining-builds.md:561`); dev-only (`devOnly.guard.test.ts:22`) | `spikes.sp6Complications`, default off | +151 B (flag + seam call, `09-sp6-spike-report.md:58`) |
| SP1 | `src/runtime/spikes/swipeBack.ts` (157), `swipeCache.ts` (36), installed by `spikes/index.ts` on the bridge mutation seam; dev-only (`devOnly.guard.test.ts:23-24`) | `spikes.swipeBackCache`, default off | flag + `writes.pending` + seam (`src/runtime/runtimeManager.ts:471-472`, `turnBridge.ts:96`); about +500 B (`09-sp1-spike-report.md:88-90`) |
| SP10 | only the Q1 probe: `toolTurnProbe.ts` (70), `toolTurnSummary.ts` (128), loaded under `__SO_DEV__` at `src/runtime/index.ts:83`. The fold is gone | none | none |

All four load only through `__SO_DEV__` dynamic imports (`src/runtime/index.ts:83-100`). A prod bundle carries none of
their logic.

## Options

### SP5

| | Option | Note |
|---|---|---|
| A | Build `SP5.b` in v2.7, as approved in v2.6 | `02-v26-carry-in.md` C1 (v2.6 takes no more changes) |
| B | Carry `SP5.b` into v2.7 unchanged if v2.6 freezes without it | code stays dev-only until then |
| — | Deferred items either way | (1) **C4 (c) jump caveat**: a jump target with no scenario of its own plays unstaged after `/cp activate`. This is plan 09's seed. (2) **C3 open question**: should `effects.scenario` join C3's presentation set (applied while requirements are unmet) or stay held with World Info, as built (`04-remaining-builds.md:260,439`)? (3) C1–C5 ×2 (owed to plan 10) |

### SP6

| | Option | Cost | Needs |
|---|---|---|---|
| A | Run it as v2.6 plan 03 intended: write `03-sp6-restated.md` (K2 re-run after `76d93f02`, K3/K4 on the 98-turn journey, K5 stalled vs control, ×2 consecutive), then worth review | about 3 lane-hours; pod about USD 0.72/h on the v2.6 RTX PRO 4500 (`test/sessions/BUDGET.md`); DeepSeek reads; TypeSafe `agencyCheck` calls | a lane overnight; judge key; the restated K5 rule (the journey must keep releasing) |
| B | Fold it into plan 19 (quests / game layer): complications as an authored game mechanic, measured there with its floors | as A, later | plan 19 approved |
| C | Drop: remove `sp6Complications.ts`, the flag and the `generation` seam; escalation stays a drift-only steering hint | S (removal + planted-import control) | — |

### SP1

| | Option | Cost | Needs |
|---|---|---|---|
| A | Keep parked; measure S4 from the user's own sessions (count natural swipe-backs per 100 player turns), then decide | ~0 now; a `so-session digest` count | user sessions |
| B | Run S1/S3 on the lab's 16 scenarios now | about 1 lane-hour | moot unless S4 can pass |
| C | Drop: remove `swipeBack.ts`, `swipeCache.ts`, the flag, `writes.pending`. The bridge seam goes too unless plan 08 A is built | S | decide with plan 08 |

### SP10

| | Option | Cost | Needs |
|---|---|---|---|
| A | Build the D3 corpus (20 CC function-calling turns), run Q1/Q2 as documentation, and, only if Q2 says needed, a new spike "fold the work, keep the boundary" with its own rollback ≡ replay bar | M | a CC profile with tools on the pod (thinking-off kwargs, gotchas) |
| B | Document only: README note "with tool calling on, one player turn can commit several boundaries" | S | — |
| C | Drop: remove the Q1 probe and `v25-09-tool-turn.json` | S | — |

## Recommendation

| Spike | Recommendation | Why |
|---|---|---|
| SP5 | **A**, build `SP5.b` in v2.7 (`02-v26-carry-in.md` C1). Keep C3's current choice (scenario held with World Info) | measured value on the real campaign (one story block instead of up to 7 card texts), PASS ×1, small cost, already approved |
| SP6 | **B** (fold into plan 19) | complications are a game-layer feature; plan 19 needs the same authoring surface and floors. A standalone 3-lane-hour run now would measure a mechanism with no Studio editor or player copy (U4) |
| SP1 | **A** then likely **C** | S4 is the deciding bar and only human play can score it. C12 and ST's swipe UI keep gating-reply swipe-backs rare, and S3's control made 0 reads anyway, so there was little to save |
| SP10 | **B**, then **C** for the probe | no user on CC + tools is known; the fold failed; the work-only fold has no measured need |

## Decisions for the user

1. SP5: build `SP5.b` in v2.7 (`02-v26-carry-in.md` C1)? **Recommended: yes.**
2. SP5: should `effects.scenario` apply while a story's requirements are unmet (C3 presentation set), or stay held as
   built? **Recommended: stay held.**
3. SP5: is the C4 (c) jump caveat handled in plan 09? **Recommended: yes, plan 09 owns it.**
4. SP6: fold into plan 19 (game layer), run standalone (A), or drop (C)? **Recommended: fold into plan 19.**
5. SP1: keep parked until your own sessions give a swipe-back rate, then decide? **Recommended: yes. If you will not play
   sessions soon, drop it (C).**
6. SP10: do you or a target player use Chat Completion with function calling? **Recommended: if no, document (B) and
   drop the probe (C).**
7. Should the dev-only spike code stay in the repo while parked (it costs nothing in prod)? **Recommended: yes for SP1
   and SP6 until decisions 4–5 resolve; remove SP10's probe with decision 6.**

## Floor and measurement before building

Each run states its conditions before running (`03-spN-restated.md` style; v2.5 plan 09 rule 1). Bars are v2.5's, unchanged.

- **SP5.b:**
  - C1–C5 ×2 on an adolion-fresh lane (`13-final-suite.md:143`, row `03-SP5`).
  - C3/C4 jest as built.
- **SP6 (A or inside plan 19):**
  - K2 ×2: one block, one loud request, after the lifecycle fix.
  - K3: ≥ 20 releases per run, agency flags ≤ control + 1, judge-off column recorded.
  - K4: 0 verbatim restatements.
  - K5: ≥ 60 % of releases reach the band within 6 boundaries vs ≤ 30 % control.
  - Data: `lab/complications/` (98 turns, 21–29 releases modelled).
  - A run under 20 releases is INCOMPLETE, never PASS (`so-sp6-score.mts`).
- **SP1:**
  - S4: ≥ 3 natural swipe-back events per 100 player turns in human sessions. Below it, FAIL regardless of S1–S3.
  - S1/S3 re-run on the lab only after S4 passes.
- **SP10:**
  - Q1/Q2 on ≥ 20 recorded CC tool turns ×2.
  - Any new fold: rollback ≡ replay over 4 seeds with a fold-off control at 0, then J6 ×2.

## Gates

- SP5.b: runtime + ST-facing → `npm run gates`, then the live gate (C1–C5 ×2, run header diff).
- SP6 run: measurement only. Lane + run header + `--strict`. Any `.b` build → `npm run gates` + live real-LLM gate.
- Any drop (SP1/SP6/SP10): `npm run gates`, and `DROPPED_SPIKES` gains the files with a planted-import control in
  `src/runtime/devOnly.guard.test.ts` (as `301b0d5a` did).
- Docs-only answers (B options): none.

## Links

- 19 quests and game layer: SP6's natural home (decision 4).
- 08 SP2 re-commit v2: shares the bridge mutation seam and `writes.requeue` with SP1; dropping both removes the seam.
- 22 SP9 witness filter v2: the other dropped v2.6 plan 03 spike.
- 09 C4 option (b): owns SP5's jump caveat.
- 21 cue + scene read merge, 23 D6/T22 revisits: v2.6 plan 10/14 session evidence feeds SP1's S4 and SP5's ×2.
- 04 story presence, 18 character life, 25 new game plus, 20 J6d shadow record, 14 J7 judge ideas, 13 B10 CLI judge,
  12 curator create op, 11 warden-lore one request, 07 commitment double negatives, 10 model choice, 06 thinking per
  story, 15 open-source Jev alternative: no direct dependency.

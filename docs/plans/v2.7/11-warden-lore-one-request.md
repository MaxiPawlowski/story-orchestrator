# Plan 11 — Warden-lore in one request

**Status: SEED from v2.6, not approved.** Source: `docs/plans/v2.6/v2.7-seeds.md` row "Warden-lore in one request". Overview: `00-overview.md`.

## What it is

- The continuity warden checks each character reply with the judge (TypeSafe Jev). Continuity, agency and house-rule
  questions go in **one** combined request (`WARDEN_ARM = "combined"`, `src/judge/policy.ts:87`).
- v2.6 added a fourth family, **lore**: does the reply contradict the story-book World Info entries that fired for it?
  It ships as a **separate** judge request (ring use `wardenLore`) sent alongside the warden's own request
  (`src/runtime/continuity.ts:63-80`).
- The seed folds lore into the combined request, so there is one TypeSafe call per reply instead of two. That needs
  measurement R5 first: with lore present, every existing family must still meet its floor.

## History and evidence

| When | What | Result | Source |
|---|---|---|---|
| v2.4 plan 07 | The combined warden request (continuity + agency + house rules) had a predeclared arm B (separate calls) if continuity regressed inside it | continuity inside the combined request 83/85, same as standalone: **arm A (combined) kept** | `v2.4/07-judge.md:1143`, `:1283-1303` |
| v2.5 plan 08 L7 | Lore family designed: input = story-book entries that fired on this reply (≤ 8 × 600 chars), one-turn note, never a write. Floors R1 contradicts ≥ 0.85, R2 consistent/untouched ≥ 0.966, R3 facts-only column, R4 latency (p95 within 4000 ms + J2 bar ≤ 1 timeout per 50 over ≥ 100), **R5 combined regression** (re-run continuity, agency, house-rules fixtures with lore appended; any family below floor → arm B), R6 over-steer | Phase A instruments only; runtime not built | `v2.5/08-lore-scan-seam.md:184-202`, `:286`, `:317`, `:325` |
| v2.6, 2026-10-01 | Phase A on the English re-measure (26 cases, `jev-1.13.0`) | **60/60**: contradicts 14/14, consistent 15/15, untouched 31/31, p50 233 ms | `v2.6/15-judge-remeasure.md:152` |
| v2.6, 2026-10-01 | Runtime built in the **measured shape, arm B (separate)**. "R5 has not run, and Phase A measured the lore family alone … A combined arm needs its own R5 measurement first." | built; R4, R6, G-L7 J8 on/off owed to plan 15 Part B; R3 facts arm never run | `v2.6/15-review.md:407-429` (deviation `:421`, live owed `:429`), `v2.6/04-remaining-builds.md:536-540` |
| v2.6 plan 12 | Local llama-logprob provider for warden-lore | failed (facts arm p95 4.3 s vs 4.0 s; lore arm contaminated) | `v2.6/12-provider-matrix.md:155-156`, `:196` |

**Live use in the v2.6 sessions.** This is my scan of the gitignored `test/sessions/T*/*/journal.jsonl`: 49 sessions
T0–T7, 2026-10-01..03, events deduplicated, every answered call on route `typesafe`. It is not a formal R4 run.

| | warden | wardenLore |
|---|---|---|
| calls | 1218 | 1075 |
| answered | 1100 | 991 |
| timeout | 88 (7.2%) | 42 (3.9%) |
| busy (refused locally) | 30 | 42 |
| answered latency p50 / p95 | 663 / 2353 ms | 492 / 2744 ms |
| input tokens p50 | 4497 | 2162 |
| notes produced (`Warden flagged … `) | 252 | **12** |

- Replies that got both calls: **1026**. Combining would remove about that many TypeSafe requests (≈ 45% of the 2293
  warden-family requests).
- T1 ran under the plugin's old 60 calls/min/user limit (`v2.6/15-judge-remeasure.md:176-178`); most busy refusals
  are there (`test/sessions/T1/T1-1-1/findings.md`, 19 `wardenLore` busy). The limit is now account-wide with a
  per-user lane of 480/min (`.claude/rules/architecture.md`, judge invariant); T4 run 2 saw 36 judge calls/min
  (`test/sessions/T4/SUMMARY.md:30`).
- Both timeout rates are above J2's bar of 1 per 50. That bar belongs to the owed R4 (now `02-v26-carry-in.md` C3), not to this seed; see
  Decisions 3.

## Why it was deferred

- R5 (combined-request regression with lore present) was never measured. Without it a combined arm risks moving the
  calibration of continuity, agency and house rules, which are all on by default.
- The separate arm is what Phase A measured. It leaves the warden's own request byte-identical
  (`.claude/rules/architecture.md`, warden invariant), and a failed lore call drops only the lore finding
  (`v2.6/15-review.md:416`).

## Current state in code

| Piece | Where | State |
|---|---|---|
| Arm switch | `src/judge/policy.ts:85-87` (`WARDEN_ARMS`, `WARDEN_ARM = "combined"`) | combined for continuity/agency/house rules |
| Request builder | `src/judge/warden.ts:183-191` (`buildWardenRequests`; `lorePart` `:174`) | can already put lore into the combined request; production never passes lore to it |
| Production split | `src/runtime/continuity.ts:63-80` (`createWardenCheck`): `today = {...input, lore: []}` asked as use `warden`; lore-only input asked as use `wardenLore`, in parallel | **separate** |
| House rules with scene context | `src/judge/warden.ts:185-188` (`own`) | already a separate request when the rule needs the scene, so "one request" is not fully reachable today anyway |
| Use / provider / readiness | `judge.uses.wardenLore` (on by default, author-only), `judge.provider.wardenLore`, `JUDGE_READINESS.wardenLore` (`src/judge/settings.ts:22,244,285`, `src/judge/readiness.ts:52,71,138`) | per-use routing: a combined call would force lore onto the warden's provider |
| Calibration code | `src/judge/wardenCalibration.ts:175` (`runCombinedContinuityCalibration`), `--use warden-lore`, `--use warden-lore-facts` | R5 needs lore-appended variants of `continuity-combined`, `agency`, `house-rules` fixtures, which do not exist (`v2.5/08-lore-scan-seam.md:325`) |

## Options

| | Design | Cost | Risk | Needs |
|---|---|---|---|---|
| **A. Keep separate, close the seed** | as shipped | none | the cost is one extra TypeSafe request per reply when lore fired, now well under the rate ceiling | finish the owed R4/R6 for the separate arm (`02-v26-carry-in.md` C4) |
| **B. Measure R5, combine if it holds** | lore appended to the combined request; ring use stays `warden` for every family (as v2.4 did), or split accounting by question key | R5 fixtures (lore-appended continuity-combined, agency, house-rules) + one run per use (order of 90–110 TypeSafe calls by the per-use counts in `v2.6/15-judge-remeasure.md:51-64`; not counted exactly) + rewrite the warden invariant, readiness and ring mapping | a timeout or error now loses every family for that reply, not just lore; larger request (≈ 4.5k + 2.2k tokens p50) may raise latency against the 4000 ms timeout; breaks per-use provider routing (plan 12 seam) | R5 at every existing floor, then R4 on the combined arm |
| **C. Combine only when both uses route to the same provider** | B, but fall back to separate when `judge.provider.warden !== judge.provider.wardenLore` | B + a branch | two shapes to keep calibrated | same as B |

## Recommendation

**A: keep the separate arm and close the seed.** Suure, A is fine.

- The only gain is request count (≈ 1026 fewer over 49 sessions), and the rate ceiling no longer binds.
- The separate shape is the one that was measured. It isolates failures (lore timing out cannot cost the continuity
  note), and it keeps per-use provider routing.
- The lore family is rare in output (12 notes vs 252 for the other families), so the per-reply cost buys little to save.
- Re-open B only if TypeSafe cost or rate becomes binding.

## Decisions for the user

1. Fold warden-lore into the combined request? **Recommended: no. Keep it separate and close the seed.**
2. If yes: authorize the R5 measurement (new lore-appended fixtures, ~100 TypeSafe calls) with v2.4's rule (any family
   below floor → stay separate, no floor change)? **Recommended: only if 1 is yes.**
3. The pooled session timeout rates (warden 7.2%, wardenLore 3.9%) are above J2's bar. Should the owed R4 (`02-v26-carry-in.md` C3) run
   (formal, `so-judge timeouts`) settle this before any v2.7 judge work? **Recommended: yes, as `02-v26-carry-in.md` C3**
   (overview rule 2), not part of this plan.

## Floor and measurement before building (only if B)

- R5 (predeclared since v2.5 L7): with lore present, re-run the continuity (`--fixture continuity-combined`), agency
  and house-rules fixtures. Every family stays at its existing floor (continuity reply 0.90 / broken 0.85 / consistent
  0.966; agency writes 0.85 / clean 0.95; house rules broken 0.85 / kept 0.95 / untouched 0.966). Lore inside the
  combined request holds R1/R2 (0.85 / 0.966).
- R4 on the combined arm: p95 ≤ 4000 ms and ≤ 1 timeout per 50 over ≥ 100 calls, live.
- R6 over-steer unchanged (as declared at `v2.5/08-lore-scan-seam.md:202`; its `v2.4/07-judge.md:1433` rubric reference has drifted, line not re-located).
- Any miss → stays separate. Never retune.

## Gates

- Pure (`src/judge/`): `npm run typecheck && npm run lint && npm test` (goldens replay, `wardenLore.review.test.ts`).
- Runtime wiring (`continuity.ts`): `npm run gates` + live J2 / J8 `--judge-uses wardenLore` on/off ×2 on a lane,
  real judge.

## Links

- 14 J7 judge ideas, 13 B10 CLI judge, 15 open-source Jev alternative (provider routing interacts with combining),
  10 model choice, 12 curator create op.
- Others: 04 story presence/plays index, 19 quests/game layer, 18 character life, 25 new game plus, 08 SP2, 22 SP9,
  16 spike defers, 20 J6d shadow record, 21 cue+scene read merge, 09 C4 option b, 07 commitment double negatives,
  23 D6/T22 revisits, 06 thinking per story.

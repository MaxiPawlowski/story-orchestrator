# Plan 16c — SP1 swipe-back cache

**Status: SEED from v2.6, not approved.** Split out of `16-spike-defers.md` (2026-10-03). Plan 02 row **C5** points here
for SP1. Overview: `00-overview.md`.

## What it is

- When the player swipes a reply to another version and then back to one already read, today's runtime rolls back and
  reads that reply again, as if it were new (`runtime/turnBridge.ts`; `v2.5/09-research-spikes.md:64-67`).
- SP1 caches the committed state of each read reply, keyed by `(chat, message id, text fingerprint, scope hash,
  story id@version)`. A swipe back to a cached version restores that state with no model call and no lag
  (`v2.5/09-sp1-spike-report.md:18-31`).
- Its worth depends on one number: how often players swipe **back** to a version they already saw.

## History and evidence

Bars (v2.5, never retuned; `09-sp1-spike-report.md:9-14`):

| # | Condition | Pass |
|---|---|---|
| S1 | Replay equality | state after swipe-back == state after the original commit, 100 % over 4 seeds × 200 cuts |
| S2 | No stale hit | 0 hits when any key part changes; a mutant dropping a part fails |
| S3 | Saves a call | live, 10 swipe-backs: 0 `read` calls on hits vs 10 today; state as S1 |
| S4 | Worth building | **≥ 3 swipe-back events per 100 player turns in human sessions; below it FAIL regardless of S1–S3** |

| When | Leg | Result | Citation |
|---|---|---|---|
| v2.5, jest | S1 | 800/800, 0 reads; controls unequal | `09-sp1-spike-report.md:63` |
| v2.5, jest | S2 | PASS, every key-part mutant caught | `:64` |
| v2.5, lane 3 ×2, real LLM | S3 | flag on: 10/10 hits, 0 reads, 10/10 equal. **Control ("today") also started 0 reads per swipe-back**, not the 10 the bar assumed, and its state was unequal on 5 of 10 legs. So there was no call to save on that lane; the gain is state correctness on the swipe-0 legs | `:65` |
| v2.5 | S4 | pending (human sessions) | `:66` |
| v2.6 | all | **not run**. Lab `lab/swipes/` prepared (4 real gates, 16 lane scenarios). Ordered last because S4 waits on human sessions | `v2.6/03-spike-reevaluation.md:29,47`; `v2.6/14-review-pack.md:449` |

**Structural cap (C12).** 175 of 269 saga transitions (65 %) post an onEnter reply right after the boundary, so the reply
that moved the story is no longer the newest message. Only 17 of 63 branch points keep it newest
(`v2.6/04-remaining-builds.md:214-218`). C12 (c) is built: an edit or delete-then-swipe of the gating reply now rolls the
transition back (`:412`). But **ST's swipe UI still refuses a non-last message** (`:442`), so a swipe-back of the gating
reply stays rare on Adolion-like stories.

**No S4 data exists.** The v2.6 plan 14/15 sessions are machine-driven: their swipes come from charter steps
(`so-session swipe-new`, the loop guard's one repair swipe), so they are not a natural swipe-back rate. `so-session digest`
counts loop-guard swipes (`scripts/debug/lib/sessionDigest.mts:5-11,416`), not swipe-backs. The user's own sessions are
optional and later (v2.6 W26).

## Why it was deferred

- S4 is the deciding bar and only human play can score it.
- C12 and ST's swipe UI keep gating-reply swipe-backs rare, and S3's control made 0 reads, so the "saves a call" value
  measured 0 on the lane that ran.
- Cost L in v2.5's own estimate (a new seam plus a human-session leg; `09-research-spikes.md:77`).

## Current state in code

Verified on master `f0e62687`.

| Piece | Where |
|---|---|
| Capture, lookup, restore | `src/runtime/spikes/swipeBack.ts` (157) |
| Key + 32-entry cache | `src/runtime/spikes/swipeCache.ts` (36) |
| Install | `src/runtime/spikes/index.ts` (22): sets the bridge mutation seam to SwipeBack; loaded by `if (__SO_DEV__)` at `src/runtime/index.ts:100` |
| Flag | `spikes.swipeBackCache`, default off (`src/runtime/settingsModel.ts:72-75`) |
| Prod hooks | `RuntimeManager.writes.pending` / `requeue` (`src/runtime/runtimeManager.ts:471-472`); `TurnBridge.setMutationSeam` (`src/runtime/turnBridge.ts:96`). About +500 B (`09-sp1-spike-report.md:88-90`) |
| Dev-only guard | `src/runtime/devOnly.guard.test.ts:23-24` |
| Tests | `swipeBack.review.test.ts` (S1/S2); live `test/scenarios/live-v25-09-sp1-s3.json` + `-control.json` |
| Unmeasured cost | a capture deep-copies the chat's story record on every qualifying notify; a restore rewinds the whole record (journal and effect ledger included) (`09-sp1-spike-report.md:96-98`) |

The bridge seam and `writes.requeue` stay whatever SP1's fate: plan 08 option A (awaited re-commit after edit) is to be
built (plan 08 decision 1, answered "this is an important feature for me") and uses them.

## Options

| | Option | Cost | Needs |
|---|---|---|---|
| A | **Park**: keep the code dev-only, collect S4 passively from the user's own play, decide then | S (a counter) | user sessions |
| B | Run S1/S3 on the lab's 16 scenarios now | about 1 lane-hour | moot unless S4 can pass |
| C | Drop: remove `swipeBack.ts`, `swipeCache.ts`, `spikes/index.ts`'s SwipeBack install, the flag, `writes.pending` | S | the seam stays for plan 08 |

## Proposal (option A: what parking means)

1. **Code:** stays exactly as it is, dev-only, flag off. No prod change, no lane runs, no pod spend. Final-suite rows
   `03-SP1` do not run.
2. **Seam ownership:** plan 08 A, when built, owns `setMutationSeam`. Its install asks plan 08's handler first (edit/update),
   then SP1's (swipe), as v2.5 ordered them (`09-sp1-spike-report.md:87`). Plan 08 must not delete the SwipeBack hook.
3. **The S4 counter (the only new work).** A swipe-back event = `MESSAGE_SWIPED` on the newest reply to a swipe index that
   already holds text (a version the player has seen), not a new generation (`Generate('swipe')`, ST `script.js:10315-10320`).
   Count them per chat with player turns, and report "swipe-backs per 100 player turns" in `so-session digest` and in
   `so-journal` exports. Dev tooling only (the TurnBridge already sees the event); no player surface. Where the count is
   read from (the journal tail or a dev handle on the bridge): not determined, settled when built.
4. **What counts:** only sessions the user plays by hand. Machine sessions (charter swipes, loop-guard repairs) are
   excluded and labelled so in the digest.
5. **Decision point:** after **≥ 300 player turns** of the user's own play (enough for the 3-per-100 bar to mean more than
   one stray swipe), or at v2.7 freeze, whichever is first.

**What reopens it (any one):**

- S4 ≥ 3 swipe-backs per 100 player turns in the user's own play. Then run S1/S3 on the lab ×2 (option B), then a worth
  review with the measured value.
- A finding that a swipe-back left the story in the wrong state (S3's control was unequal on 5 of 10 legs): that is a
  correctness case, measured on its own, even with a low S4.
- ST starts allowing swipes on non-last messages, or C12 changes how onEnter replies post (more gating replies stay newest).

**What closes it:** at the decision point, S4 below 3 → drop (option C) with its planted-import control.

## Recommendation

**A, then likely C.** Build only the counter now. If the user will not play by hand soon, drop now (C): the code costs
nothing in prod, but each later refactor of the bridge has to carry it.

## Decisions for the user

1. Park SP1 and count swipe-backs from your own play? **Recommended: yes.** If you will not play by hand before v2.7
   freezes, drop it instead.
2. Do you swipe back to earlier versions of a reply while playing (not just generate new ones)? **Recommended: answer from
   habit; a clear "rarely" is enough to drop now.**
3. Decision point: 300 of your player turns or v2.7 freeze, whichever is first? **Recommended: yes.**

## Floor and measurement before building

- S4: ≥ 3 natural swipe-back events per 100 player turns, user's own sessions, ≥ 300 player turns. Below it, FAIL
  regardless of S1–S3.
- Only after S4 passes: S1/S3 ×2 on the lab (`<campaign>/lab/swipes/scenarios/live-v25-09-sp1-s3-adolion-*.json`, 4 gates
  + controls; `v2.6/13-final-suite.md:140`), conditions restated first. S3's "today" column must be re-measured, since v2.5's
  read 0.

## Gates

- Counter: debug tooling: `npm run test:debug` + `npm run debug:typecheck`; `npm run gates` if it touches `src/`.
- Drop: `npm run gates`; `DROPPED_SPIKES` gains `swipeBack.ts`, `swipeCache.ts` with a planted-import control
  (`devOnly.guard.test.ts`); the seam stays for plan 08.
- Build (only after reopening): runtime tier `npm run gates`, live S3 ×2, J6 ×2, ownership census row for `SwipeBack.restore`.

## Links

- 08 SP2 re-commit v2: shares the mutation seam and `writes.requeue`; builds first.
- 23 D6/T22 revisits, 21 cue + scene read merge: user sessions feed S4.
- 16 index; 16a SP5, 16b SP6, 16d SP10.

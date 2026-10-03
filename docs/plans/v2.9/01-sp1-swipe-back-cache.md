# Plan 01 — SP1 swipe-back cache

**Status: DEFERRED to v2.9 (user, 2026-10-03).** Was v2.7 plan 16c (split out of the removed `16-spike-defers.md`);
moved at the version split (`docs/plans/v2.7/RENUMBER.md`). Not scheduled until v2.8 closes. v2.7 02 row **C5** points
here for SP1. Overview: `00-overview.md` (this folder).

## What it is

- When the player swipes a reply to another version and then back to one already read, today's runtime rolls back and
  reads that reply again, as if it were new (`runtime/turnBridge.ts`; `v2.5/09-research-spikes.md:64-67`).
- SP1 caches the committed state of each read reply, keyed by `(chat, message id, text fingerprint, scope hash,
  story id@version)`. A swipe back to a cached version restores that state with no model call and no lag
  (`v2.5/09-sp1-spike-report.md:18-31`).
- Its worth depends on one number: how often players swipe **back** to a version they already saw.

## History and evidence

Bars (v2.5, never retuned; `v2.5/09-sp1-spike-report.md:9-14`):

| # | Condition | Pass |
|---|---|---|
| S1 | Replay equality | state after swipe-back == state after the original commit, 100 % over 4 seeds × 200 cuts |
| S2 | No stale hit | 0 hits when any key part changes; a mutant dropping a part fails |
| S3 | Saves a call | live, 10 swipe-backs: 0 `read` calls on hits vs 10 today; state as S1 |
| S4 | Worth building | **≥ 3 swipe-back events per 100 player turns in human sessions; below it FAIL regardless of S1–S3** |

| When | Leg | Result | Citation |
|---|---|---|---|
| v2.5, jest | S1 | 800/800, 0 reads; controls unequal | `v2.5/09-sp1-spike-report.md:63` |
| v2.5, jest | S2 | PASS, every key-part mutant caught | `:64` |
| v2.5, lane 3 ×2, real LLM | S3 | flag on: 10/10 hits, 0 reads, 10/10 equal. **Control ("today") also started 0 reads per swipe-back**, not the 10 the bar assumed, and its state was unequal on 5 of 10 legs. So there was no call to save on that lane; the gain is state correctness on the swipe-0 legs | `:65` |
| v2.5 | S4 | pending (human sessions) | `:66` |
| v2.6 | all | **not run**. Lab `lab/swipes/` prepared (4 real gates, 16 lane scenarios). Ordered last because S4 waits on human sessions | `v2.6/03-spike-reevaluation.md:29,47`; `v2.6/14-review-pack.md:449` |

**Structural cap (v2.6 C12).** 175 of 269 saga transitions (65 %) post an onEnter reply right after the boundary, so the
reply that moved the story is no longer the newest message. Only 17 of 63 branch points keep it newest
(`v2.6/04-remaining-builds.md:214-218`). C12 (c) is built: an edit or delete-then-swipe of the gating reply now rolls the
transition back (`:412`). But **ST's swipe UI still refuses a non-last message** (`:442`), so a swipe-back of the gating
reply stays rare on long-saga stories.

**No S4 data exists.** The v2.6 plan 14/15 sessions are machine-driven: their swipes come from charter steps
(`so-session swipe-new`, the loop guard's one repair swipe), so they are not a natural swipe-back rate. `so-session digest`
counts loop-guard swipes (`scripts/debug/lib/sessionDigest.mts:5-11,416`), not swipe-backs. The user's own sessions are
optional and later (v2.6 W26).

## Why it was deferred

- S4 is the deciding bar and only human play can score it.
- v2.6 C12 and ST's swipe UI keep gating-reply swipe-backs rare, and S3's control made 0 reads, so the "saves a call"
  value measured 0 on the lane that ran.
- Cost L in v2.5's own estimate (a new seam plus a human-session leg; `v2.5/09-research-spikes.md:77`).
- User 2026-10-03: moved to the next version; at the split it landed in v2.9 (F07: it was still scheduled as active work).

## Current state in code

Verified on master `c7967323`.

| Piece | Where |
|---|---|
| Capture, lookup, restore | `src/runtime/spikes/swipeBack.ts` (157) |
| Key + 32-entry cache | `src/runtime/spikes/swipeCache.ts` (36) |
| Install | `src/runtime/spikes/index.ts` (22): sets the bridge mutation seam to SwipeBack; loaded by `if (__SO_DEV__)` at `src/runtime/index.ts:100` |
| Flag | `spikes.swipeBackCache`, default off (`SPIKE_FLAGS`, `src/runtime/settingsModel.ts:87-90`) |
| Prod hooks | `RuntimeManager.writes.pending` / `requeue` (`src/runtime/runtimeManager.ts:471-472`); `TurnBridge.setMutationSeam` (`src/runtime/turnBridge.ts:96`). About +500 B (`v2.5/09-sp1-spike-report.md:88-90`) |
| Dev-only guard | `src/runtime/devOnly.guard.test.ts:23-24` (`DROPPED_SPIKES` at `:29-32`) |
| Tests | `swipeBack.review.test.ts` (S1/S2); live `test/scenarios/live-v25-09-sp1-s3.json` + `-control.json` |
| Unmeasured cost | a capture deep-copies the chat's story record on every qualifying notify; a restore rewinds the whole record (journal and effect ledger included) (`v2.5/09-sp1-spike-report.md:96-98`) |

The bridge seam and `writes.requeue` stay whatever SP1's fate: SP2 re-commit option A (awaited re-commit after edit,
user: "this is an important feature for me") is built in **v2.8 01** and uses them. SP2 option C (the "catching up after
your edit" status) is built as **v2.7 10**.

## Options

| | Option | Cost | Needs |
|---|---|---|---|
| A | **Park**: keep the code dev-only, collect S4 passively from the user's own play, decide then | S (a counter) | user sessions |
| B | Run S1/S3 on the lab's 16 scenarios now | about 1 lane-hour | moot unless S4 can pass |
| C | Drop: remove `swipeBack.ts`, `swipeCache.ts`, `spikes/index.ts`'s SwipeBack install, the flag, `writes.pending` | S | the seam stays for v2.8 01 (SP2 option A) |

## Proposal (option A: what parking means)

1. **Code:** stays exactly as it is, dev-only, flag off. No prod change, no lane runs, no pod spend. Final-suite rows
   `03-SP1` do not run.
2. **Seam ownership:** v2.8 01 (SP2 option A), when built, owns `setMutationSeam`. Its install asks SP2's handler first
   (edit/update), then SP1's (swipe), as v2.5 ordered them (`v2.5/09-sp1-spike-report.md:87`). SP2 must not delete the
   SwipeBack hook while SP1 is parked.
3. **The S4 counter (the only new work, if the user picks (a) below).** A swipe-back event = `MESSAGE_SWIPED` on the
   newest reply to a swipe index that already holds text (a version the player has seen), not a new generation
   (`Generate('swipe')`, ST `script.js:10315-10320`). Count them per chat with player turns, and report "swipe-backs per
   100 player turns" in `so-session digest` and in `so-journal` exports. Dev tooling only (the TurnBridge already sees
   the event); no player surface. Where the count is read from (the journal tail or a dev handle on the bridge): not
   determined, settled when built.
4. **What counts:** only sessions the user plays by hand, in group chats (v2.7 03 group-chats-only: no solo support).
   Machine sessions (charter swipes, loop-guard repairs) are excluded and labelled so in the digest.
5. **Decision point:** after **≥ 300 player turns** of the user's own play (enough for the 3-per-100 bar to mean more
   than one stray swipe), or at the v2.9 freeze, whichever is first.

**What reopens it (any one):**

- S4 ≥ 3 swipe-backs per 100 player turns in the user's own play. Then run S1/S3 on the lab ×2 (option B), then a worth
  review with the measured value.
- A finding that a swipe-back left the story in the wrong state (S3's control was unequal on 5 of 10 legs): that is a
  correctness case, measured on its own, even with a low S4.
- ST starts allowing swipes on non-last messages, or v2.6 C12 changes how onEnter replies post (more gating replies stay
  newest).

**What closes it:** at the decision point, S4 below 3 (or no S4 data) → drop (option C) with its planted-import control.

## Park mechanism: (a) or (b) (review B, 2026-10-03; open for the user)

The review asked to pick one of:

- **(a) Dev counter now.** Build item 3 above in v2.8's tooling so the user's own play produces S4 data; decide at
  300 turns or the v2.9 freeze.
- **(b) Auto-drop at the next freeze.** Build nothing. At the v2.9 freeze, if no S4 data exists, run option C. The
  v2.6 note "drop if still unmeasured at that freeze" (v2.7 overview, decision 16c) already says this.

**Recommended: (b).** No version before v2.9 has a slot for the counter, and the user's hand-played turns before the
v2.9 freeze are unlikely to reach 300. The code costs nothing in prod. If the user answers decision 2 below with
"often", take (a) instead.

## Recommendation

**A (parked), closed by (b): drop at the v2.9 freeze unless S4 data exists.** Drop earlier (C) if the user answers
decision 2 "rarely": the code costs nothing in prod, but each later refactor of the bridge has to carry it.

## Decisions for the user
allright, lets move this to next version
1. Park SP1 and count swipe-backs from your own play? **Recommended: yes.** If you will not play by hand before v2.7
   freezes, drop it instead. 
2. Do you swipe back to earlier versions of a reply while playing (not just generate new ones)? **Recommended: answer from
   habit; a clear "rarely" is enough to drop now.**
3. Decision point: 300 of your player turns or v2.7 freeze, whichever is first? **Recommended: yes.**

(Answer above kept verbatim. After the split, "v2.7 freeze" in 1 and 3 reads "v2.9 freeze". Open: decision 2, and the
park mechanism (a)/(b) above.)

## Floor and measurement before building

- S4: ≥ 3 natural swipe-back events per 100 player turns, user's own sessions, group chats, ≥ 300 player turns. Below
  it, FAIL regardless of S1–S3.
- Only after S4 passes: S1/S3 ×2 on the lab (`<campaign>/lab/swipes/scenarios/live-v25-09-sp1-s3-adolion-*.json`, 4
  gates + controls; `v2.6/13-final-suite.md:140`), conditions restated first. S3's "today" column must be re-measured,
  since v2.5's read 0. The lab scenarios must run in group chats (v2.7 03); convert any solo leg first.

## Gates

- Counter (a only): debug tooling: `npm run test:debug` + `npm run debug:typecheck`; `npm run gates` if it touches `src/`.
- Drop: `npm run gates`; `DROPPED_SPIKES` gains `swipeBack.ts`, `swipeCache.ts` with a planted-import control
  (`devOnly.guard.test.ts`); the seam stays for v2.8 01.
- Build (only after reopening): runtime tier `npm run gates`, live S3 ×2, J6 ×2, ownership census row for `SwipeBack.restore`.

## Links

- v2.7 10 (SP2 option C, built) and v2.8 01 (SP2 option A): share the mutation seam and `writes.requeue`; build first.
- v2.9 04 D6/T22 revisits, v2.8 15 cue + scene read merge: user sessions feed S4.
- v2.8 16 SP5, v2.8 17 SP6, v2.7 15 SP10: the other children of the removed v2.7 plan 16.

## Review 2026-10-03

Applied from `docs/plans/v2.7/review-2026-10-03.md` (old numbers there): **F07** (status: deferred, not active work),
**B** "16c: pick (a) or (b)" (recorded as an open choice, (b) recommended), **B11** (`SPIKE_FLAGS` at
`settingsModel.ts:87-90`), **B12** (version-qualified plan refs), **F36** (cross-refs to new numbers). Group-only per
v2.7 03.

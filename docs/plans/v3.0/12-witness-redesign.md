# Plan 12 — Witness record redesign

**Status: STUB 2026-10-26 (replan track C1, `00-overview.md` §Replan 2026-10-26). Not designed, not built, floors TO
DECIDE.** Follows v2.8 42 (`docs/plans/v2.8/42-witness-filter-v2.md`, W4 FAIL, moved here by the owner 2026-10-25).

## Goal

A per-message record of which cast members heard what, accurate enough to filter recall and private context by witness,
reversible with the message (rollback ≡ replay), and never adding text a member could not have heard (audience contract,
`memory/audience.ts`, `memory/audienceRules.ts`).

## What failed (v2.8 42 §W4 real run 2026-10-25, build G, lane 45, 74 reads)

- Real sessions: exact-set 13/147 (0.088; floor 0.9), false inclusion 339/471 (0.72; floor 0.02), false exclusion 4/574,
  coverage 153/192, mixed 0/11. The shared read answers `heard=all-present` on almost every message.
- Presence null control: exact-set 144/171 (0.84). Lab: exact-set 3/21, 17 lines rejected ("unknown member player").
- Cost: input p95 +150 tokens (floor 120), output p95 +282 (floor 160), latency p95 24.6 s vs 21.1 s: miss.
- The record stays unconsumed (as before); `memory.witness` writes nothing any reader uses.

## Why now / why maybe not

- Blocks v2.8 43 verbatim recall in groups and any message-level privacy filter (05.4 history).
- No playtest flag yet shows a character acting on a scene it missed; the owner decides whether it gets GPU time before
  that (overview question 8).

## Directions to evaluate (none chosen)

- Code-side presence from scene state and talk control, plus explicit aside / whisper markers, with the read only resolving
  the exceptions (presence already scores 0.84 exact-set).
- A separate small classification pass per message instead of lines inside the shared read (cost vs the read's budget).
- A calibrated judge use (v2.8 judge rules: no use without a passed calibration row).
- Each judged first on the existing adjudicated sets with the offline scorer `memory/witness/score.ts` (no GPU).

## Depends on

- Adjudicated real and lab sets from v2.8 42 (private tree), offline scorer.
- Performance rule: no added latency on the reply path; a side pass competes with the chat-first queue (09 C2).

## Floors

**TO DECIDE.** v2.8 42's W4 floors (exact-set >= 0.9, false inclusion <= 0.02, cost bounds) are the starting point; the
owner restates or changes them before any run. A design must beat the presence null control by a stated margin.

## GPU cost

TO ESTIMATE (the W4 real run was 74 reads on lane 45; offline scoring needs none).

## Unresolved questions

- Keep W4's 0.9 exact-set floor, or accept presence-plus-exceptions with a lower floor and a stricter false-inclusion bound?
- Is message-level privacy a product goal now (v3.0 02 reopen condition), or only witness-filtered recall?
- Which members' "heard" counts for the player character (the lab's "unknown member player" rejections)?

# Plan 41 — memory wave 1 (CPU, no read-contract change)

Agent A's sections (shared harness, items A) live above this one on master; agent B's section follows.

## Items (agent B): which memories survive and get injected

Branch `v3.0-41-memory-b`. Four items, each its own switch under `memory.*`, on by default.

### B1. "Used in reply" detector (shared by B2 and B3, no switch of its own)

- Pure `memory/used.ts` `usedInReply(items, reply, speakerNames)`: an offered item counts as used when the reply restates its
  content words (`memory/words.ts` `restatesWords`, the matcher the secret filter trusts) with the speaker's own name words
  removed, or names one of its activation triggers (`termPresent`, 4+ chars).
- Offered = what that member's draft carried: injected memory rows (the staged per-member injection), open arcs, and the
  member's private-source lines (cue/topic/echo lines, promise reminders, hearsay). Captured at `onMemberDrafted`
  (`MemoryInjector.captureDraft`), consumed by the reply that follows it (reply id = chat length at draft, or one less for a
  swipe); no capture = nothing recorded.
- Boundary work `mentions` (order 9.6, `runtime/mentionPort.ts`) writes `extras.mentions.records`
  `{id, kind, member, messageId, revision, boundary}` (revision = swipe id + text hash), ring 400, re-detection of the same
  reply replaces; `rollbackMentions` in rollback quarantine drops records at or after the message. Runs while B2 or B3 is on.

### B2. Mention ledger — `memory.mentionLedger`

- `memory-game-narrative.md` P1. A row member M restated is left out of M's own memory blocks for
  `MENTION_HOLD_BOUNDARIES` (6) boundaries (`heldForMember`, fate `mentioned`), unless the latest player message raises it
  (`raisedBy`: restates it, shares 2+ non-cast content words, or names a non-cast entity/trigger). Pinned and established
  rows are never held. Other members still get the row. Only the per-member memory tier blocks change (already late,
  per-turn); the resting block, the ledger and the prefix are untouched.

### B3. Strength-based retention — `memory.strengthRetention`

- `memory-cognition-evals.md` P4. `usedAt[]` on a row (stamped from B1, `{messageId, boundary}`, reversed by
  `stripLinksAfter` like `confirmedAt`). `strength = prior(importance) × exp(-elapsed / stability)` on the boundary clock,
  elapsed from the last use; stability grows with importance, durability and each spaced use (gap-dependent, 6 uses counted).
- `capTier(…, retention)` (`memory/strength.ts` `evictWeakest`) evicts the weakest unpinned, non-established row instead
  of the oldest, and marks it `foldedInto: "archive:evicted"` + `evictedAt` instead of deleting it; archive recall
  (`archiveRecall.ts`) brings it back by entity mention ("Recalled from earlier: …"), also in a chat with no chapter record.
  A rollback before `evictedAt` un-evicts. Archive cap 300 (weakest dropped). Score recency counts from the last use.
- Short-term tier is never strength-capped.

### B4. Retrieval query and scoring — `memory.retrievalQuery`

- `memory-agent-architectures.md` P2, `memory-rp-community.md` P3, `memory-context-compression.md` P2 (query half).
- Score query = last 4 spoken rows, recency-weighted `(i+1)/(k(k+1)/2)` (`scoreContext.ts` `windowQuery`); turn entities =
  roster names in the window + the enabled cast + (per member) the drafted member's names.
- Score terms min-max normalised across the candidate set (`score.ts` `scoreAll`), then weighted.
- Recency = min(age since creation or last use, messages since the transcript last named a non-cast entity/trigger of the
  row or restated it), over the last 40 rows; never from an injection.
- Archive recall: the last 3 rows (recency-weighted, objective at 0.15) as the lexical text and one vector query per row,
  weighted into the semantic band (`chapterKit.ts` `recallParts`, `recallBand`).

### Floors (declared 2026-10-31, before any measurement; informational, never retuned)

- F-B1 detector on the recorded transcripts (`test/fixtures/*.transcript.json`): true-use recall ≥ 0.90 (a sentence a
  member said, offered as a row, is detected), false-use rate ≤ 0.05 (sentences from other transcripts).
- F-B2 hold invariant = 100% (jest, hard): a row voiced by M is never re-injected to M within the hold window unless the
  player raises it; other members unaffected.
- F-B3 probes (agent A's harness): availability at 150 after > before; at 20 not lower than before. Archive reachability of
  evicted rows = 100% (jest), before 0 (dropped).
- F-B4 E0: new local arm f (window-weighted query + normalised terms) hit@4 ≥ arm c + 0.05 on the private set (c = 0.738);
  on the synthetic set ≥ arm c (0.25). New window/paraphrase set (`test/fixtures/retrieval-window.json`): callback subset
  hit@4 after ≥ 0.90 and > before; paraphrase subset (no lexical overlap) informational only; distractor subset (last line
  shares words with a wrong row) hit@1 after ≥ before.

### Results (offline, 2026-10-31; floors above were committed first, `896ecd34c`)

- B1 detector, 49 recorded transcripts (`src/memory/usedDetector.measure.test.ts`): true-use recall 147/147 = 1.00
  (verbatim upper bound: the offered sentence is the reply's own), false-use 0/1452 = 0.000. F-B1 met. Precision on real
  replies vs injected rows is owed (GPU row MW1-B1).
- B2 hold invariant 100% (jest, hard): `usedDetector.measure.test.ts` over every voiced transcript row and
  `runtime/mentionLedger.review.test.ts` through a real `MemoryCoordinator` (held for the speaker, kept for the other
  member, released when the player names it). F-B2 met. Probe arm with only B2 on: availability@60 0.375 = before (the
  harness writes no mention records).
- B3 probes (agent A's harness, copied from A's branch for the run; records
  `test/measurements/v3.0/memory-probes/b-before-all-off.json`, `b-after-all-on.json`): availability@20 19/24 → 19/24
  (not lower: met), @60 0.375 → 0.458 (update-fact 0/4 → 1/4, temporal 0/4 → 1/4; the only-B3 arm gives the whole gain),
  @150 9/24 → 9/24 (**F-B3 miss**: not higher). Kept-out leaks 0 → 0. Archive reach at session end (boundary 160), the
  12 single/update/temporal gold rows: before 12/12 deleted by the cap, after 12/12 in the archive and returned by
  `recallCandidates` for the probe question (F-B3 archive reachability 100%: met). The harness does not run archive recall
  at probe time, so @150 cannot see the archive; the GPU row MW1-B3 asks live with recall on.
- B4 E0 (`src/memory/e0Window.test.ts`; private pool via `SO_E0_PRIVATE_POOL=<main checkout>/test/sessions/e0/pool.json`,
  counts and scores only): private 84 questions, pool recall 0.905: arm c recomputed hit@4 0.750 / MRR@4 0.379 (golden c
  0.738), arm f 0.702 / 0.362 (**F-B4 miss**: needed ≥ 0.788, and f is below c). Synthetic 40: c 0.25 → f 0.30 (met).
  E0 asks for a verbatim quote with the question as the last line, so earlier lines in a window add noise there; the
  live recall path uses the window too, so MW1-B4 must watch quote-style callbacks. Not retuned.
- B4 window set (`test/fixtures/retrieval-window.json`, 18 cases written by agent B for this item, so biased toward the
  design; `src/memory/retrievalWindow.measure.test.ts`), before (last line, raw terms) → after (window, normalised):
  callback hit@4 0 → 1.00, hit@1 0 → 0.875 (met); paraphrase hit@4 0.40 → 0.80, hit@1 0 → 0.60 (informational: the
  cast and window names carry it, not paraphrase matching); distractor hit@1 0 → 0.80 (met), hit@4 1.00 → 1.00. Probe arm
  with only B4 on: availability@60 0.375 = before (the probes fail on the cap, not on ranking).
- Not run here: payload goldens and the prefix gate (need a lane; the brief allows a no-model lane only for a UI row).
  Every B change lands in the per-member memory tier blocks (depths 2-6, already per turn) or in scoring; the resting
  block, the ledger and the prefix are untouched by construction. Owed with the GPU rows.

### GPU rows (B)

`gpu-queue-2026-10-30.md` §Memory wave 1, agent B rows: MW1-B2 (~70 min), MW1-B3 (~120), MW1-B4 (~60), MW1-B1 (rides
MW1-B2, CPU Sol labels). Floors for those rows are stated there, before any run.

## Gate record B

2026-10-31, branch `v3.0-41-memory-b`.

- `npm run gates` (Storybook included, no `--resume`) on `3c9c8d310`: **all green in 563.4s** (build, typecheck,
  typecheck:test, test, test:debug, test:replay, test:release, test:plugin, debug:typecheck, lint, test-storybook:ci).
  Earlier full runs on the branch were red once each for: a dead export (`E0_WINDOW_ARM`, fixed), a missing plan 24
  matrix row (fixed), and one unrelated timing flake per run under machine load (`patterns.test` P5 p95,
  `so-scenario` H-a cleanup, GPU broker `imageCache` admission); each passed alone and in the final run.
- Merged master `4c961c627` (docs only) after the green run; no code moved, not re-gated.
- Main bundle 1,244,346 B (budget 1,300,000). Memory coordinator 560/560 effective lines (net zero: `lastPlayerName`
  moved to `playerTurn.ts`).
- New jest: `memory/used.test.ts`, `strength.test.ts`, `retrievalQuery.test.ts`, `e0Window.test.ts`,
  `retrievalWindow.measure.test.ts`, `usedDetector.measure.test.ts`, `runtime/mentionLedger.review.test.ts`;
  `rollbackReplay.property.test.ts` gains use + cap ops (planted control: breaking un-evict fails 4 cases);
  `chapterRetained.review.test.ts` vectorfox case counts per round instead of exactly one query.
- No live gate: no ST, no lanes, no GPU (brief). Payload goldens / prefix gate owed with the GPU rows. Floors F-B3 (@150)
  and F-B4 (E0 private) missed; recorded, switches stay on.

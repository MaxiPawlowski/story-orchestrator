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

# Plan 43 — Verbatim recall

**Status: v2.8, owner decision 2026-10-14 (moved from v2.9 05 §05.4), not built.** Gated: no runtime code before
v2.8 21 E0 names a winning arm and a witness record exists (v2.8 42 B, or the presence proxy if v2.8 21 §6.2 passes on
it). Was old v2.7 29 options B/P1/P5 → v2.8 21 (offline) + v2.9 05.4 (runtime).
**Gate tiers** (v2.8 00 §Gate taxonomy): implementation D; acceptance CL (recall fixture, second-model labels) and RP
or LT (one real-reply leg).

## 1. What it is

- Our memory tiers hold **summaries**. When a player asks "what exactly did she promise?", or a character should echo
  a line said ten scenes ago, the exact words are gone.
- Verbatim recall puts up to 4 exact past lines back into the drafted member's prompt for one generation: callbacks,
  promises, insults, names, in the speaker's own words.
- In a group, a member may only get lines it **witnessed**, and never a line that restates a secret kept from it.
  Otherwise recall re-opens the leak ST's Vector Storage has (`Past events:`, v2.8 42 H4).
- It never splices the chat (unlike Vector Storage) and never posts a message.

## 2. History and evidence

- User question that started it: Smart Context / chat vectorization, "is there any pattern to harvest?"
  (`docs/plans/v2.8/21-smart-context-harvest.md` intro). Answer: our tiers cover summarised memory; verbatim recall
  is the gap (`21:13-16`), the same gap the Timeline-Memory review named, "summary routes, raw transcript answers"
  (`docs/plans/v2.4/extension-research/timeline-memory-an-agentic-memory-system.md:27,46,60`).
- Patterns P1 (message index), P2 (row → raw range), P5 (per-member witnessed retrieval) in `21` §3 (`:117-121`).
- The leak is measured: v2.6 lab F2 put 41 unwitnessed lines into other members' prompts through Vector Storage's
  `Past events:` (`v2.5/09-sp9-spike-report.md:123`; v2.8 42 §2).
- Deferred at the split (review item 9) with a reopen trigger: E0 winner (hit@4 ≥ 0.80), VR1 + VR2 jointly on a
  fixture meeting §6.2's minimums, and a reversible witness record (`docs/plans/v2.9/05-deferred-items.md` §05.4;
  `21` §6.2 `:206-230`).
- E0 declarations committed 2026-10-14 on `v2.8-a12-e0` (`6f2dc2d1`): floors in code (`E0_FLOORS`), cost order
  (e),(c),(a),(b),(d), synthetic freeze recorded, private freeze owed.

## 3. Current state in code

Verified on master `211d8d96`.

- **D10 archive recall** is the only recall: folded rows of sealed chapters, fired when the last player turn or the
  objective names an entity those rows carry; `RECALL_LIMIT` 4, `DEFAULT_RECALL_TOKENS` 200
  (`src/memory/archiveRecall.ts:7-8`, `recallMentions` `:30`, `recallCandidates` `:36`, `selectRecall` `:41`); rides
  `scene_history` in our interceptor. It returns summaries, not quotes.
- **ST vectors used only ephemerally:** consolidation bands 0.82 / 0.55 and archive recall's semantic band
  (`src/runtime/consolidationMatches.ts`, `src/runtime/chapterKit.ts`). `/api/vector/query` drops scores
  (`src/endpoints/vectors.js:385-392` in ST), so ranking is by bands or E0's winner.
- **Scene records keep a message `range`** (`src/runtime/coordinators/memoryCoordinator.ts:205,217`); a raw re-read
  exists only for a memory conflict (`rereadConflictWindow`, `src/runtime/memoryQueue.ts:333`).
- **Held-secret filter ready to reuse:** `keptFrom(text, secrets, member)` (`src/memory/heldSecrets.ts:42`), applied
  to every shared tier.
- **No witness record:** the judge scene read keeps only the latest `present` set
  (`src/runtime/coordinators/sceneCoordinator.ts:127-129`); v2.8 42 B builds the per-message record.
- **Injection registry** has no recall key (`src/constants/injectionRegistry.ts:15-31`).
- **E0 code** (`src/memory/e0Ranking.ts`, `scripts/debug/so-e0.mts`) is on `v2.8-a12-e0`, not master.

## 4. Design options

| | Design | Cost | Risk | Verdict |
|---|---|---|---|---|
| A | Nothing new; D10 + summaries | 0 | misquotes stay | fallback if gates fail |
| **B. P1 message index, witness-filtered** | Per-chat collection keyed by message content hash; query = last player turn + last reply; rank by E0's winner; filter per drafted member by witness record, then `keptFrom`; inject ≤ 4 lines `Name: "…"` under one new key for that generation only | M+ | index persistence (VR5); query latency on the reply path | **recommended if E0 picks a winner and VR1+VR2 pass on R1** |
| C. P2 row → raw range | Index `scene_history`/chapter rows; return the row's raw `range` trimmed by a quote picker | M | quote picker misses the exact line | **pick if §6.2 shows R2 ≥ R1 on VR1** |
| D. Intent-gated recall | B or C but fired only when the player's turn asks for an exact quote (cue words or a judge Choice) | M+, one more judge call | misses callbacks the player did not ask for | optional overlay; not first |
| E. Vector Storage on, filtered | Rely on ST's interceptor | — | cannot filter per member (H4); refused | refused |

## 5. Recommendation

**Build B (or C, per v2.8 21 §6.2) only after its gates; until then, nothing at runtime.**

- **Source of truth:** the live chat. The index follows message hashes (as Vector Storage does), and every candidate is
  re-checked against the live chat at query time: a swiped, edited or deleted message is never returned, whatever the
  index says.
- **Filter order:** E0-ranked pool (top 8) → witness filter (drafted member heard it) → held-secret filter (`keptFrom`
  per member) → budget (k ≤ 4, ≤ 250 tokens) → block. A candidate with no witness row is **dropped** (recall fails
  closed; the opposite of v2.8 42 C's transcript filter, because recall adds text rather than keeping it).
- **Placement:** new registry key `story_orchestrator_recall` ("Exact words remembered"), depth 1, not scannable,
  per drafted member (swapped in `onMemberDrafted` like the private block), cleared after the generation.
  Withheld for `quiet` and `impersonate`.
- **Ownership:** an async writer with a `RunOwnership` token, re-checked before the injection write; cache keyed by
  chat, story, message id and member.
- **Code home:** lazy chunk (main bundle budget 1,300,000 B), host access through a new `stHost/` vector module.
- **On by default** once built (v2.8 rule 9). The owner can switch it off (`memory.verbatimRecall`).
- **Player surfaces:** none new. Author view gets a "recalled lines" row in the next-turn preview (composed from the
  registry, as today).
- **Persistence (VR5):** decided by v2.8 21's measurement: a persistent per-chat collection if rebuild time on the lane
  exceeds 10 s for a 500-message chat, else rebuilt per session.

## 6. Predeclared floors

Committed before any run; never retuned. Rows R-Gate are the entry gate (from v2.8 21; restated, not changed).

| # | Condition | Floor |
|---|---|---|
| R-Gate1 | v2.8 21 E0 | a winning arm with hit@4 ≥ 0.80 on the private frozen set (diagnostic arm does not count) |
| R-Gate2 | v2.8 21 §6.2 | VR1 ≥ 0.70 **and** VR2 = 0 in the same run, fixture meeting the minimums (≥ 20 positives, ≥ 20 nonce exclusions, ≥ 3 asking members, ≥ 2 secret scenes, ≥ 2 sessions) |
| R-Gate3 | Witness record | v2.8 42 Wr passes (reverses with the message), or R-Gate2 passed on the presence proxy |
| VR1 | Runtime replay of the §6.2 fixture through the built code | gold in the injected block ≥ 0.70 |
| VR2 | Same run, unwitnessed nonce lines in any member's block | 0 |
| VR2s | Held-secret lines (a `[hiding]`/`[unaware]` phrasing) in a kept-out member's block | 0 |
| VR3 | Block size | p95 ≤ 250 tokens |
| VR4 | Swipe/edit/delete: a removed message returned | 0 in property cases over 4 seeds; `rollback ≡ replay` |
| VR6r | Reply-path latency added per loud generation (lane, CPU embeddings) | p95 ≤ 300 ms |
| VR7 | Real reply uses the exact line when asked (CL-labelled "what exactly did X say" turns, ≥ 20) | ≥ 0.6 quote-faithful; the R0 (recall off) rate is reported beside it, not a floor |

## 7. Gates by tier

**Implementation (D):**
- `npm run gates`.
- jest: filter order (planted unwitnessed, planted secret, planted removed message each refused), witness-missing drop,
  per-member swap, `quiet`/`impersonate` withheld, injection refresh on write, `RunOwnership` stale-run control,
  cache key covers member + story.
- VR4 property test; VR2/VR2s on the frozen fixture replayed through the code (no model).
- Payload golden: the recall block appears only in the drafted member's dry-run prompt (`so-payload-golden.mts`).
- Registry: feature entry + Help (v2.8 rule 10); `injectionRegistry` collision test.
- `lazyHarness.guard.test.ts` / bundle budget unchanged.

**Acceptance:**
- CL: VR1/VR2/VR2s/VR3 on the private fixture ×2; VR7 labels by a second model.
- RP or LT: one real-reply leg (VR6r + VR7) ×2 on an adolion-fresh lane with Summarize and Vector Storage off, run
  header diff around the batch; real profile, no `debugResponse`.

## 8. Privacy and spoiler notes

- The block is per drafted member, never shared, never scannable, never written to World Info or the memory mirror.
- Held secrets are filtered with the same `keptFrom` every shared tier uses (architecture §Memory and privacy).
- Player-visible output must be identical with and without held secrets (K1 rule).
- Fixture questions from Adolion sessions: one model writes, a second checks, owner never sees; data in `so-sessions`,
  only hashes and scores here.
- ST Summarize / Vector Storage still copy the transcript; the `transcript-copiers` alert keeps naming them.

## 9. Dependencies and links

- v2.8 21 (A12, branch `v2.8-a12-e0`): E0 winner and §6.2 VR1/VR2 (R-Gate1, R-Gate2).
- v2.8 42 B: witness record (R-Gate3).
- v2.8 01 §F M1 (Q-M5 with the P3 arm): the D10 baseline R0 compares against.
- v2.8 44 rumors: a recalled line may be a rumor's source quote; 44 reuses this plan's witness filter.
- v2.8 13 J7.2 canon verification: may consume recalled lines as evidence (P6).
- v2.9 05 §05.4: status "moved to v2.8 43".

## 10. Decisions for the owner

1. Is verbatim recall wanted for play (open since v2.8 21 decision 2)? **Recommended: yes, behind its gates; it is the
   one memory gap the research found.**
2. Message index (B) or row → raw range (C)? **Recommended: let v2.8 21 §6.2 decide (R1 vs R2 on VR1); prefer B on a
   tie.**
3. Persistent per-chat index or rebuilt per session? **Recommended: rebuild unless VR5 shows > 10 s for 500 messages.**
4. Fire on every loud generation, or only when the player asks for a quote (D)? **Recommended: every generation first;
   add D only if VR6r fails.**
5. Missing witness row: drop the candidate or keep it? **Recommended: drop (fail closed).**

## 11. Unresolved questions

- Whether CPU `transformers` embeddings on the lane meet VR6r while the 3090 serves the 31B reply model at the same
  time.
- Whether a recall line should carry its scene/time label ("in the cellar, two days ago") or only speaker and words.
- How the block interacts with `chapters.fold` (sealed-chapter messages dropped from the prompt chat): recall may be
  the only way those words come back; measured, not assumed.

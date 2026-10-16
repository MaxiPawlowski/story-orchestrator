# Plan 43 — Verbatim recall

**Status: v2.8, owner decision 2026-10-14 (moved from v2.9 05 §05.4), not built. Revised 2026-10-14 against the Astra
review (owner approved; §12).** Gated: no runtime code before v2.8 21 E0 names a winning arm and a witness record
exists (v2.8 42 B, or the presence proxy if v2.8 21 §6.2 passes on it). Was old v2.7 29 options B/P1/P5 → v2.8 21
(offline) + v2.9 05.4 (runtime).
**Gate tiers** (v2.8 00 §Gate taxonomy): implementation D; acceptance CL (recall fixture, second-model labels) and RP
or LT (one real-reply leg).

## 1. What it is

- Our memory tiers hold **summaries**. When a player asks "what exactly did she promise?", or a character should echo
  a line said ten scenes ago, the exact words are gone.
- Verbatim recall puts up to 4 exact past **source spans** back into the drafted member's prompt for one generation,
  each with verified speaker attribution.
- **First scope: explicit quotation requests** (the player asks what someone said) and **direct source references**
  (a v2.8 47 promise links its exact pledge span). Automatic callbacks on every generation come later, only if the
  first scope measures useful (VR7p) and quiet (VR9).
- In a group, a member may only get spans it may receive under the shared audience/provenance contract (v2.8 42 §0):
  spans it **witnessed**, or the **telling** span of a report it was told (never the origin it did not hear). The
  held-secret filter `keptFrom` runs after that as a backstop.
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
- E0 code merged to master (`c1764024`): floors in code (`E0_FLOORS`, `src/memory/e0Ranking.ts:12`), cost order
  (e),(c),(a),(b),(d), synthetic freeze recorded, private freeze owed. No winner yet.

## 3. Current state in code

Verified on master `211d8d96`; re-checked on `3a716f2b` for the review.

- **D10 archive recall** is the only recall: folded rows of sealed chapters, fired when the last player turn or the
  objective names an entity those rows carry; `RECALL_LIMIT` 4, `DEFAULT_RECALL_TOKENS` 200
  (`src/memory/archiveRecall.ts:7-8`, `recallMentions` `:30`, `recallCandidates` `:36`, `selectRecall` `:41`); rides
  `scene_history` in our interceptor. It returns summaries, not quotes.
- **Vector host adapter exists:** `vectorInsert`/`vectorQuery` (`src/services/stHost/vectors.ts:25-35`), used by
  consolidation bands and archive recall (`src/runtime/consolidationMatches.ts`, `src/runtime/chapterKit.ts`).
  `/api/vector/query` drops scores (ST `src/endpoints/vectors.js:385-392`), so ranking is by bands or E0's winner.
  This plan reuses the adapter; no new `stHost/` vector module.
- **Scene records keep a message `range`** (`src/runtime/coordinators/memoryCoordinator.ts:205,217`); a raw re-read
  exists only for a memory conflict (`rereadConflictWindow`, `src/runtime/memoryQueue.ts:333`).
- **Held-secret filter:** `keptFrom(text, secrets, member)` (`src/memory/heldSecrets.ts:42`) is lexical: ≥ 2 shared
  content words at 60 % coverage (`src/memory/words.ts:25-31`), and a secret with < 2 content words after names are
  stripped never becomes a `HeldSecret` (`heldSecrets.ts:24`). A short secret or a paraphrase can pass it. It is a
  backstop, not an eligibility proof.
- **Held-secret state key:** `memoryInjector.heldSecretsKey()` (`src/runtime/memoryInjector.ts:276`), usable in a
  cache key.
- **No witness record:** the judge scene read keeps only the latest `present` set
  (`src/runtime/coordinators/sceneCoordinator.ts:127-129`); v2.8 42 B builds the per-span record.
- **Injection registry** has no recall key (`src/constants/injectionRegistry.ts:15-31`).
- **E0 code** (`src/memory/e0Ranking.ts`, `scripts/debug/so-e0.mts`) is on master; the verdict is owed.

## 4. Design options

| | Design | Cost | Risk | Verdict |
|---|---|---|---|---|
| A | Nothing new; D10 + summaries | 0 | misquotes stay | fallback if gates fail |
| B. P1 message index, eligibility-filtered | Per-chat collection of source spans (v2.8 42 §0 identity); query = the request + last reply; eligibility filter over the whole pool, then E0 rank, then top 4; inject verified spans under one new key for that generation only | M+ | index persistence (VR5); query latency on the reply path | candidate |
| C. P2 row → raw range | Index `scene_history`/chapter rows; return spans from the row's raw `range`, picked and verified | M | span picker misses the exact line | candidate; expected cheaper |
| **D. Request-gated recall (first scope)** | B or C fired only on an explicit quotation request (deterministic cue set; a judge Choice later) or a direct source reference from v2.8 47 | M | misses callbacks the player did not ask for | **first** |
| E. Vector Storage on, filtered | Rely on ST's interceptor | — | cannot filter per member (H4); refused | refused |
| F. Automatic callbacks | B or C on every loud generation, with relevance + cooldown | M+ | unsolicited repetition | only after D measures VR7p and VR9 |

## 5. Recommendation

**D first, over B or C chosen by v2.8 21 §6.2; prefer the cheaper on a tie. F later. Nothing at runtime before the
gates.**

- **Source of truth:** the live chat. Every candidate is a v2.8 42 §0 source span `{chatId, storyId, messageId,
  revision, speaker, span}`. A content hash is used only to dedup identical spans and to verify integrity; it is never
  identity. At query time each candidate's revision is re-checked against the live chat: a swiped, edited or deleted
  message never returns, whatever the index says.
- **Eligibility first (provenance), backstop second (lexical).** For a drafted member, a span is eligible only when:
  1. the witness record holds a positive `witnessed` claim for that member on the span (or a `told` claim, in which
     case only the telling span is eligible), from a `classified` state (v2.8 42 §5.2);
  2. the span is not in a `mixed` message unless it lies wholly inside one positively-witnessed span;
  3. `keptFrom` does not redact it for that member (backstop).
  Missing, `unknown`, `pending`, `no-read`, `outage` or `invalidated` → **dropped** (recall adds text, so it fails
  closed).
- **Filter before top-k.** The vector query asks for a wide pool (32), eligibility runs over the whole pool, then E0's
  winner ranks the eligible set, then top 4 within ≤ 250 tokens. If fewer than 4 survive, no refill from ineligible
  candidates. Forbidden hits can no longer starve valid recall.
- **Quotation, not retrieval.** A span is rendered as `Name said: "…"` only with speaker evidence: the span lies in a
  message ST stored under that speaker, inside one quoted-dialogue segment or a message with no other roster name as
  a dialogue tag; the rendered text is byte-equal to the source span. Narration, multi-speaker or ambiguous spans are
  rejected (never re-attributed). Player spans render as the player's name.
- **Triggers (D):** a deterministic cue set on the player's last line (`exactly`, `word for word`, `what did <name>
  say`, `your (own) words`, `you said`, `quote`), and v2.8 47 promise reminders that carry a pledge span. The query
  text is the request; recall never fires on quiet or impersonate.
- **Placement:** new registry key `story_orchestrator_recall` ("Exact words remembered"), depth 1, not scannable,
  per drafted member (swapped in `onMemberDrafted` like the private block). **Cleared** on generation end, failure,
  stop/cancel, chat change, member change and story change, not only on a successful completion.
- **Ownership and cache:** an async writer with a `RunOwnership` token, re-checked before the injection write. Cache
  key = chat, story content hash, member, query text hash, witness record revision, `heldSecretsKey()`, and each
  candidate's message revision. A current member and message id alone never make cached text reusable.
- **Code home:** lazy chunk (main bundle budget 1,300,000 B); host access through the existing
  `src/services/stHost/vectors.ts`.
- **On by default** once built (v2.8 rule 9). The owner can switch it off (`memory.verbatimRecall`).
- **Player surfaces:** none new. Author view gets a "recalled lines" row in the next-turn preview (composed from the
  registry, as today).
- **Persistence (VR5):** decided by v2.8 21's measurement: a persistent per-chat collection if rebuild time on the lane
  exceeds 10 s for a 500-message chat, else rebuilt per session.
- **F (automatic callbacks), later:** adds relevance ranking on every loud generation, a deterministic per-span
  cooldown (a span recalled once is ineligible for 20 boundaries) and the VR9 floor.

## 6. Predeclared floors

Committed before any run; never retuned. Rows R-Gate are the entry gate (from v2.8 21; restated, not changed). Rows
VR7p–VR9 added 2026-10-14 by the review (never run).

| # | Condition | Floor |
|---|---|---|
| R-Gate1 | v2.8 21 E0 | a winning arm with hit@4 ≥ 0.80 on the private frozen set (diagnostic arm does not count) |
| R-Gate2 | v2.8 21 §6.2 | VR1 ≥ 0.70 **and** VR2 = 0 in the same run, fixture meeting the minimums (≥ 20 positives, ≥ 20 nonce exclusions, ≥ 3 asking members, ≥ 2 secret scenes, ≥ 2 sessions) |
| R-Gate3 | Witness record | v2.8 42 Wr and W4fi pass, or R-Gate2 passed on the presence proxy |
| VR1 | Runtime replay of the §6.2 fixture through the built code | gold in the injected block ≥ 0.70 |
| VR2 | Same run, unwitnessed nonce spans in any member's block | 0 |
| VR2s | Held-secret spans (a `[hiding]`/`[unaware]` phrasing, including ≤ 2-word secrets and paraphrases in the fixture) in a kept-out member's block | 0, with provenance eligibility doing the refusing (keptFrom-only refusals counted separately) |
| VR2t | Told members get the telling span, never the origin | 0 origin spans for told-only members |
| VR2k | Filter before top-k: fixture with 8 forbidden top hits and ≥ 4 eligible lower hits | ≥ 4 eligible spans returned, 0 forbidden |
| VR3 | Block size | **max** ≤ 250 tokens (hard cap, every case) |
| VR4 | Swipe/edit/delete: a removed or re-revised span returned | 0 in property cases over 4 seeds; `rollback ≡ replay` |
| VR4c | Stale cache: a cached result reused after a change of query, witness revision, secret key or story hash | 0 (planted per key) |
| VR4x | Injection cleared after failure, stop, chat change, member change | 0 leftover blocks (planted per event) |
| VR6r | Reply-path latency added per triggered generation (lane, CPU embeddings) | p95 ≤ 300 ms |
| VR7 | Real reply uses the exact line when asked (CL-labelled "what exactly did X say" turns, ≥ 20) | ≥ 0.6 quote-faithful |
| VR7p | Paired improvement: same ≥ 20 request turns with recall on vs off (R0) | on − off ≥ +0.15 quote-faithful, and on ≥ off on ≥ 70 % of pairs |
| VR8 | Attribution: fixture with wrong-speaker bait (multi-speaker messages, narration) and altered-quote bait | 0 wrong-speaker spans in the block; block text byte-equal to source span in 100 % of cases |
| VR9 | Unsolicited repetition (F only): non-request turns where a reply repeats a recalled span verbatim | ≤ 0.10 of turns, and no span repeated twice within its cooldown |

## 7. Gates by tier

**Implementation (D):**
- `npm run gates`.
- jest: eligibility order (planted unwitnessed, mixed, unknown-state, told-origin, short secret, paraphrased secret,
  removed message each refused), filter before top-k (VR2k), attribution (VR8), cue triggers and their negatives,
  per-member swap, `quiet`/`impersonate` withheld, clear on every VR4x event, injection refresh on write,
  `RunOwnership` stale-run control, cache key coverage (VR4c).
- VR4 property test; VR2/VR2s/VR2t on the frozen fixture replayed through the code (no model).
- Payload golden: the recall block appears only in the drafted member's dry-run prompt (`so-payload-golden.mts`).
- Registry: feature entry + Help (v2.8 rule 10); `injectionRegistry` collision test.
- `lazyHarness.guard.test.ts` / bundle budget unchanged.

**Acceptance:**
- CL: VR1/VR2/VR2s/VR2t/VR3 on the private fixture ×2; VR7, VR7p, VR8 labels by a second model.
- RP or LT: one real-reply leg (VR6r + VR7 + VR7p) ×2 on an adolion-fresh lane with Summarize and Vector Storage
  off, run header diff around the batch; real profile, no `debugResponse`. VR9 only when F is built.

## 8. Privacy and spoiler notes

- The block is per drafted member, never shared, never scannable, never written to World Info or the memory mirror.
- Eligibility is provenance-based (v2.8 42 §0); `keptFrom` is the same backstop every shared tier uses.
- Player-visible output must be identical with and without held secrets (K1 rule).
- Fixture questions from Adolion sessions: one model writes, a second checks, owner never sees; data in `so-sessions`,
  only hashes and scores here.
- ST Summarize / Vector Storage still copy the transcript; the `transcript-copiers` alert keeps naming them.

## 9. Dependencies and links

- v2.8 21 (A12): E0 winner and §6.2 VR1/VR2 (R-Gate1, R-Gate2).
- v2.8 42 §0 (shared audience/provenance contract) and B (witness record; R-Gate3).
- v2.8 47 promises: pledge spans are direct source references (first scope).
- v2.8 01 §F M1 (Q-M5 with the P3 arm): the D10 baseline R0 compares against.
- v2.8 44 rumors: a told member gets the telling span, not the origin (VR2t).
- v2.8 13 J7.2 canon verification: may consume recalled spans as evidence (P6).
- v2.9 05 §05.4: status "moved to v2.8 43".

## 10. Decisions for the owner

1. Is verbatim recall wanted for play (open since v2.8 21 decision 2)? **Recommended: yes, behind its gates; it is the
   one memory gap the research found.**
2. Message index (B) or row → raw range (C)? **Recommended: let v2.8 21 §6.2 decide (R1 vs R2 on VR1); on a tie prefer
   the cheaper by measured VR6r + index cost (expected C).**
3. Persistent per-chat index or rebuilt per session? **Recommended: rebuild unless VR5 shows > 10 s for 500 messages.**
4. Fire on every loud generation, or only on a quotation request / promise reference (D)? **Recommended: D first;
   automatic callbacks (F) only after VR7p passes and with VR9 measured.** (Reversed from "every generation first".)
5. Missing or unknown witness state: drop the candidate or keep it? **Recommended: drop (fail closed).**
6. Ambiguous attribution: render unattributed, or reject? **Recommended: reject.**

## 11. Unresolved questions

- Whether CPU `transformers` embeddings on the lane meet VR6r while the 3090 serves the 31B reply model at the same
  time.
- Whether a recall line should carry its scene/time label ("in the cellar, two days ago") or only speaker and words.
- How the block interacts with `chapters.fold` (sealed-chapter messages dropped from the prompt chat): recall may be
  the only way those words come back; measured, not assumed (integration case recall × chapter folding).
- Whether the deterministic cue set misses too many requests; a judge Choice is the follow-up if VR7 shows misses.

## 12. Review 2026-10-14 (Astra)

Source: `review-astra-2026-10-14.md` §Plans 42-47 (43). Verified on `3a716f2b`.

- **P0 — `keptFrom` is lexical, not a privacy proof.** Accepted. Verified `words.ts:25-31` (2 words / 60 %) and
  `heldSecrets.ts:24` (short secrets dropped). → provenance eligibility first (v2.8 42 §0), `keptFrom` as backstop;
  VR2s fixture adds short and paraphrased secrets and counts keptFrom-only refusals separately; VR2t for told members.
- **P1 — content hash is not identity; cache key incomplete.** Accepted. → §0 source span identity, hash for
  dedup/integrity only; cache key adds query text, witness revision, `heldSecretsKey()`, story hash, revisions; VR4c.
- **P1 — retrieval and quotation conflated; filter after top-k starves recall.** Accepted. → speaker evidence and
  byte-exact spans, ambiguous attribution rejected (VR8, decision 6); pool of 32 filtered before ranking (VR2k).
- **P2 — two stale code claims.** Accepted. Verified `e0Ranking.ts:12` on master and `stHost/vectors.ts:25`. → §3
  corrected; reuse the existing adapter.
- **P1 — floors do not establish added value.** Accepted. → VR7 kept; VR7p paired improvement, VR8 wrong-speaker and
  altered-quote, VR9 unsolicited repetition; VR3 now a hard max.
- **Recommendation (cheaper on tie; explicit requests + promise references first; clear on failure).** Adopted:
  option D first (decision 4 reversed), decision 2 prefers the cheaper, VR4x clear events.
- Rebutted: none.

## Harvest 2026-10-14 addendum

From `docs/plans/v2.8/61-harvest-triage-2026-10-14.md`. Ideas only (source licences: AGPL/GPL/none unless noted). First verified against master `9e96871d`; revised 2026-10-16 on `e8b9dd6d` after `review-astra-harvest-2026-10-16.md`. The owner decides with the rest of this plan.

- **H13b time anchor on recalled spans** (`docs/plans/v2.8/extension-research-2026-10-14/timeline-memory.md` P2, 3/S). The render is `Name said: "…"` with no time.
  Recommended: once v2.8 50's player time display exists, a recalled span carries the story-time label **of its source
  message** (the `story_time` at the boundary that message committed in, read from the boundary log), never the time of
  recall; before that, its chapter title. Spans are addressed by message id and revision (`src/memory/audience.ts:10`), so an
  edited source is a different span and loses the old label. Floor: every rendered span's label equals its source boundary's
  time label on a scripted run with 3 time advances and a recall after each, D.
- **H13c hidden spans** are not recall-eligible: the rule lives in v2.8 42 §0 (addendum there).
- **R19 self-contained query rewrite** (`docs/plans/v2.8/extension-research-2026-10-14/timeline-memory.md` P4, 2/M): an arm in this plan's retrieval experiment (E0 /
  option F), CL offline, only after R-Gate1: rewrite the recall query into a standalone question before retrieval and compare
  hit rate with the raw query. Informational; no floor moves.

## Review 2026-10-16 (Astra)

Source: `review-astra-harvest-2026-10-16.md` §Addenda requiring correction. Verified on `e8b9dd6d`.

- **P2 — message ids need revisions; time labels must describe the source event, not recall time.** Accepted. → labels from
  the source message's boundary; spans addressed by id and revision (`src/memory/audience.ts:10`).
- **Timeline P4 (query rewrite) → 43's experiment.** Adopted as R19, an informational arm after R-Gate1.
- Rebutted: none.

## Gate record: R-Gate1 from v2.8 21 E0 (2026-10-16, branch `v2.8-e0-run`)

- **R-Gate1: met.** E0 private frozen set (84 questions, labels Sol-written and Claude-checked blind, 0 disagreed): winning
  arm (d), TypeSafe Choice with removal, hit@4 0.9048 (76/84; pool recall is also 0.9048), MRR@4 0.8988. Not the
  diagnostic arm: a winner under unchanged floors. Detail: `21-smart-context-harvest.md` §Gate record: E0 private run.
- R-Gate2 (§6.2) not run; it now uses arm (d) as the ranker. R-Gate3 unchanged (42 B record built on
  `v2.8-audience-42-44`, W4/W4fi not scored on real labels).
- **Conflict to decide before the runtime build:** arm (d) adds 4 sequential judge calls, p50 893 ms and p95 999 ms
  measured, on top of the pool query. VR6r (reply-path latency p95 ≤ 300 ms) cannot hold with (d) on the reply path. The
  ST-order arm (e) is cheap but misses R-Gate1 (hit@4 0.75). Options: run (d) off the reply path (pre-computed on the
  player's request turn before generation starts, as option D only fires on an explicit request), cut (d) to 1 call
  (rank 1 only: hit@1 0.8929 here), or amend VR6r. The floor is not retuned here; the owner decides.
- Pool recall 0.9048: 8 of 84 golds never reach the 8-candidate pool, so the R-Gate1 ceiling with topK 8 is 0.9048. §5's
  wider pool (32) would raise it; not measured.
- Nothing built at runtime.

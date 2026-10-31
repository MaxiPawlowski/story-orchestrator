# Memory research: knowledge graphs and temporal memory

Angle `knowledge-graphs` of the six-way memory survey, 2026-10-31. Research only: no code, no gates.

Question: would an entity-relation graph with validity intervals do better than our flat facts ledger plus
supersede/conflicts on four things in a long story: contradictions, "what changed since", relationship state and
multi-hop recall? And how would it fit per-member knowledge, rollback ≡ replay and name fold?

Short answer: **no to replacing the ledger with a graph; yes to taking four pieces of graph thinking.** Our ledger
is already most of a bi-temporal store: rows are append-only versions, each records the message it was read from and a
validity, and supersession never overwrites. The gaps are narrower: no multi-valued entity-to-entity relations, no
valid-time stamp, no read-time "what changed" view, zero-hop recall, character-only name resolution.

## 1. Summary

- **A "what changed since X" view, derived at read time from versions we already store** (ledger `supersedes` chain,
  epistemic `retiredAt`, chapter `blackboardDelta`). This is Graphiti's transaction-time timeline, and we have the
  data already. It needs no model call, and rollback stays exact because nothing new is persisted. Uses: a member
  coming back into a scene ("since you last spoke"), the Author console, recaps. Best ratio of value to cost.
- **Relation rows `(subject, relation, object)` with the object in the key**, so "Mara ally_of Tom" and "Mara
  ally_of Ann" can both be live and one can end without the other. Today `ledgerKey(entity, field)` makes every field
  single-valued, so a second ally supersedes the first. This is the edge model from Graphiti, Mem0g and AriGraph,
  scaled down to our ledger.
- **End an edge by deriving it, never by mutating it.** Graphiti writes `t_invalid` onto the old edge. We should
  compute the end of a version from its successor, the way `buildLedgerView` already picks the newest live version. A
  rollback that drops the successor then reopens the old interval with no reverse step at all. This keeps
  rollback ≡ replay structural.
- **Stamp valid time (`story_time`) beside transaction time (`messageId`)** on ledger and memory rows when the story
  has a clock. Then "how long has X been true" and "two days ago" phrasing are cheap code reads. Zep's biggest
  LongMemEval gain was on temporal questions (+17 to +18 points).
- **Recall one step out from the named entity (HippoRAG-lite).** Run personalized PageRank, or plain one-hop
  expansion, over a small co-occurrence graph built from live ledger, relation and memory `entities`. Seeds are the
  player line, the drafted member and the cast on stage. It is deterministic, costs microseconds in JS and needs no
  model call. Today `archiveRecall.ts` reaches only archived rows whose entity is literally named in the line.
- **Extend name fold to places and items**, using the codex and lorebook names as the alias source (exact folds only).
  This stops one entity splitting into two ledger keys, which also hides the disagreements the conflict queue should
  catch.
- **Rejected:** GraphRAG/LightRAG community indexing, a graph database, and an LLM call per write to invalidate edges.
  The evidence says graph memory helps temporal and multi-hop questions modestly, and often loses on single-hop
  facts: Mem0g −1.4 single-hop and −4 multi-hop against flat Mem0, and Zep −14 points on single-session-assistant
  questions.

## 2. Survey

### Zep / Graphiti: bi-temporal knowledge graph

- What it does: a memory layer for agents. Messages become *episodes* (raw, lossless). An LLM extracts entities and
  fact edges, links each edge back to its episode, and groups entities into *communities* with summaries.
- How it works:
  - Two timelines. Valid time T: `t_valid` and `t_invalid`, when the fact held in the world. Transaction time T':
    `t'_created` and `t'_expired`, when the system learned it and when it retired it.
  - New edges are compared by an LLM against semantically related existing edges. When a contradiction overlaps in
    time, the old edge's `t_invalid` is set to the new edge's `t_valid`. Edges are invalidated, never deleted.
  - Entity resolution: embed the name (1024-d), add full-text candidates, then let an LLM decide whether it is a
    duplicate and merge the names and summaries.
  - Communities use label propagation rather than Leiden, so they can grow incrementally; they still need periodic
    full refreshes.
  - Retrieval is cosine plus BM25 plus BFS up to n hops, reranked by RRF, MMR, episode mentions, node distance or a
    cross-encoder.
- Evidence (paper, [arXiv 2501.13956](https://arxiv.org/abs/2501.13956), [HTML](https://arxiv.org/html/2501.13956v1)):
  - DMR 94.8% against MemGPT's 93.4%.
  - LongMemEval_s with gpt-4o: 60.2% full context → 71.2%. Context went from about 115k tokens to about 1.6k, and
    latency from 28.9 s to 2.6 s.
  - By question type: temporal reasoning 45.1 → 62.4 and multi-session 44.3 → 57.9.
- Failure modes:
  - Single-session-assistant fell 94.6 → 80.4 (gpt-4o) and 81.8 → 75.0 (mini). Knowledge-update fell for gpt-4o-mini
    (76.9 → 74.4): a weaker model at extraction and answering loses the update benefit.
  - In Mem0's LOCOMO comparison, Zep scored lowest of the graph systems on multi-hop (41.4) and temporal (49.3), and
    its store exceeded 600k tokens per conversation ([Mem0 paper](https://arxiv.org/abs/2504.19413)).
  - Every write costs several LLM calls: extract, resolve, invalidate. Source code:
    [getzep/graphiti](https://github.com/getzep/graphiti).

### Mem0 / Mem0g: flat memories with a graph variant

- What it does: extracts candidate memories and asks an LLM to ADD, UPDATE, DELETE or NOOP against similar existing
  ones. Mem0g adds a graph: an entity extractor, a relationship generator (`lives_in`, `owns`, …), node reuse by
  embedding threshold, and a conflict detector plus an LLM update resolver that **marks obsolete relations invalid
  instead of deleting them**.
- Evidence (LOCOMO, LLM judge; [arXiv 2504.19413](https://arxiv.org/abs/2504.19413)):

  | | Mem0 | Mem0g |
  |---|---|---|
  | Single-hop | 67.1 | 65.7 |
  | Multi-hop | 51.2 | 47.2 |
  | Open-domain | 72.9 | 75.7 |
  | Temporal | 55.5 | 58.1 |
  | Memory tokens | about 1.8k | about 3.6k |
  | Search p50 | 0.15 s | 0.48 s |

  Full context still scored highest overall (72.9 against 68.4).
- Lesson for us: **the graph helped temporal questions and hurt multi-hop questions** on conversational data. That
  is the opposite of the usual pitch, and the authors blame redundancy in graph traversal.

### AriGraph: semantic plus episodic graph for text-game agents

- What it does: closest to our domain, a world model for an agent acting in a changing world (TextWorld, NetHack).
- How it works:
  - Each observation becomes triplets. Existing edges that touch the same vertices are retrieved, and the LLM names
    replacement pairs (old → new). Outdated edges are removed, and the prompt says "keep the old triplet when
    uncertain".
  - Each observation is also an episodic vertex linked to its triplets.
  - Retrieval: embedding search over edges, then BFS to depth d and width w, plus episodes ranked by how many
    retrieved triplets they hold.
- Evidence ([arXiv 2407.04363](https://arxiv.org/abs/2407.04363)):
  - TextWorld with GPT-4: AriGraph solves treasure hunt and cooking at every difficulty (cooking hardest 0.65).
    Full history scores 0.47 / 0.18 on the easy levels and fails the harder ones. Summary and RAG score 0.17 to 0.52.
  - The paper says it is over 10× cheaper than GraphRAG on multi-hop QA.
- Failure modes:
  - With LLaMA-3-70B it drops sharply (treasure hunt 0.47). Extraction quality is model-bound, a warning for
    Artemis 31B.
  - Cleaning, which needs "filter outdated locations", is the hardest task, and adding episodic memory *lowered* it
    (0.92 → 0.79).
  - Graph quality was never measured directly.

### HippoRAG and HippoRAG 2: personalized PageRank over an entity graph

- What it does: offline, OpenIE triples become phrase nodes and relation edges, plus passage nodes ("contains"
  edges). Synonym edges link phrases whose embedding similarity is above 0.8.
- How it works: at query time, embed the query against triples, let an LLM "recognition memory" filter keep the
  relevant ones, then seed PPR on their phrases (damping 0.5). Every passage is also seeded with a small reset weight
  (0.05), so dense retrieval stays in the mix. Passages are ranked by PageRank mass.
- Evidence (HippoRAG 2, Llama-3.3-70B reader, QA F1; [arXiv 2502.14802](https://arxiv.org/abs/2502.14802),
  [HTML](https://arxiv.org/html/2502.14802v2); HippoRAG 1 [arXiv 2405.14831](https://arxiv.org/abs/2405.14831)):

  | | Average | 2Wiki | MuSiQue | NarrativeQA |
  |---|---|---|---|---|
  | HippoRAG 2 | 59.8 | 71.0 | 48.6 | 25.9 |
  | NV-Embed-v2 (dense) | 57.0 | 61.5 | 45.7 | 25.7 |
  | GraphRAG | 49.6 | | | |
  | RAPTOR | 48.8 | | | |
  | LightRAG | 6.6 | | | |

  - Indexing MuSiQue: HippoRAG 2 used about 9M input tokens, GraphRAG about 115M, LightRAG about 68M.
- Lessons for us:
  - The multi-hop gain is real but modest.
  - On narrative QA, the closest benchmark to a story, graph retrieval is a wash against dense retrieval.
  - PPR itself is cheap. The cost sits in OpenIE indexing and the LLM filter.

### Microsoft GraphRAG and LightRAG: community summaries, local versus global

- GraphRAG ([arXiv 2404.16130](https://arxiv.org/abs/2404.16130)):
  - An LLM extracts entities and relations per chunk.
  - Leiden builds a hierarchy of communities, and an LLM writes a summary for each.
  - *Global* queries map-reduce over community summaries ("what are the main themes"). *Local* queries start at an
    entity and pull its neighbourhood plus text units.
  - Strong on sense-making over a whole corpus. Expensive to index, and incremental updates are poor.
- LightRAG ([arXiv 2410.05779](https://arxiv.org/abs/2410.05779)): dual-level keys (low = entity, high = theme) over a
  graph plus vectors, built to update incrementally. In the HippoRAG 2 controlled evaluation it collapses (6.6 F1).
- Controlled comparisons:
  - [RAG vs GraphRAG, arXiv 2502.11371](https://arxiv.org/abs/2502.11371): plain RAG wins single-hop and detail
    questions, GraphRAG wins multi-hop, and summaries differ in diversity rather than accuracy.
  - [GraphRAG-Bench, arXiv 2506.05690](https://arxiv.org/abs/2506.05690): graphs give modest gains on complex
    multi-hop questions (about +4.5 on HotpotQA) and lose on simple fact retrieval.

### Knowledge-graph state trackers for role-play and interactive fiction

- Interactive-fiction agents (KG-A2C, Ammanabrolu and Hausknecht 2020, [arXiv 2001.08837](https://arxiv.org/abs/2001.08837);
  Worldformer, [arXiv 2106.09578](https://arxiv.org/abs/2106.09578)) keep a belief graph of `(you, in, room)`,
  `(key, in, chest)` triples, updated each turn by rules or a model. They help action selection in text games. Their
  vocabulary is closed and small, and they track world state rather than character knowledge.
- SillyTavern community trackers (our corpus `C:\dev\st-extensions-research`):
  - BlazeTracker (`blazetracker-opinionated-roleplay-state-tracker/post.md`) tracks relationships per pair (wants,
    feelings, secrets, level) as "atomic events, everything editable". It runs several LLM calls per message and is
    aimed at 27B+ models.
  - BetterSimTracker v2 (`bettersimtracker-v2-custom-stats-support/source/docs/data-model.md`) separates resolver
    identity from an owner-projection map. That is the same split as our roster id against display name.
  - Neither is a graph store. Both are entity × attribute tables, like our ledger. The graph idea in the community
    shows up as *per-pair relationship rows*, not as traversal.

### Triple stores with provenance

- RDF reification, named graphs and RDF-star (W3C [RDF 1.2 Concepts](https://www.w3.org/TR/rdf12-concepts/)) attach
  provenance (source, time, confidence) to a statement. PROV-O ([W3C](https://www.w3.org/TR/prov-o/)) names the
  derivation chain. Wikidata qualifiers (`start time`, `end time`, `point in time`) are the standard valid-time
  pattern on an edge.
- The idea worth taking is the **statement as the unit**: subject, predicate, object, plus qualifiers for source,
  validity and confidence. That is what our `LedgerEntry` plus `Provenance` already is, minus the object-as-node and
  the valid-time qualifiers.

## 3. Mapping to us

### Contradictions

- We have:
  - `ledger.ts` `applyLedgerSignals`: a changed value is a *new version* with `supersedes`, never an overwrite.
  - `provenance.ts` `Validity`: `live | superseded | source-removed | conflicted | quarantined`.
  - `supersede.ts`: LLM verdicts `SUPERSEDE` / `INDEPENDENT` for uncertain memory pairs, plus `contradicted` marks.
  - `conflicts.ts`: cross-store disagreements (memory, ledger, scene) become a **hard** `conflicted` state that every
    consumer excludes. The author resolves it, `standing` keeps the established side steering, and `conflictWindow`
    re-reads the exact span.
  - Bound qualities (`ledger_binding`) are authoritative over extraction.
- Graphiti and Mem0g: newer wins automatically (transaction-time priority), with an LLM judging which edges conflict.
- Gap: none in the policy; ours is stricter and better for authored stories. The gap is *coverage*.
  - Conflict candidates come from token overlap (`conflicts.ts` stop-word Jaccard) and exact `ledgerKey` equality.
  - A relation stored as free text in a `relationship`-type MemoryEntry ("Mara now distrusts Tom") and a ledger row
    `Mara: trust_tom=high` share no key, so detection relies on wording.
  - Typed relation rows would put both claims under one key, `mara|distrusts|tom` against `mara|trusts|tom`, with a
    declared inverse.
- Fit: good for deterministic detection. LLM invalidation per write is a poor fit: one more side pass on the 3090 per
  window.

### "What changed since"

- We have: every ledger version (until `capLedger` trims below the history floor), epistemic `retiredAt` and
  `supersededBy`, memory `supersededAt`, chapter records' `blackboardDelta`, and the recap composer
  (`runtime/consequences.ts`, which reads finished boundary logs).
- Gap: no read-time diff over memory between two message ids, for a given viewer. The data is the transaction-time
  timeline (T'). Nothing projects it.
- Fit: excellent.
  - Pure function over stored rows; nothing new persisted, so rollback ≡ replay holds by construction.
  - Per member: diff since that member's last drafted message, then run the result through `withoutSecretLines` and
    the member's private view.
  - Prefix: a per-turn block, so it goes late. That fits the existing per-turn layout and
    `INJECTION_REGISTRY` depths.

### Relationship state

- We have:
  - Authored relationships as code qualities (`engine/life/*`, `relationshipKey(holder, toward, axis)`), with labels
    and secret reveals (`life/labels.ts`), private life lines only to the drafted member, and fresh-beat guards.
  - Extracted relationships: MemoryEntry type `relationship` (free text plus `entities`), ledger fields like
    `[state:Mara:character] trust=…`.
  - Rumors carry knower sets per hop.
- Gap:
  - Extracted (unauthored) relations have no structured home. In the ledger they collapse to one value per field;
    in memory they are prose.
  - A story without authored `life.relationships` gets no relation state the code can reason over: no "who is
    allied with whom", no inverse, no ending.
- Fit: relation rows are a ledger extension, not a new store. Authored `rel_*` qualities stay authoritative, the way
  bound ledger keys already are (`buildBoundKeySet`).

### Multi-hop recall

- We have:
  - `archiveRecall.ts`: archived rows (`foldedInto` a chapter) whose `entities` are named in the line, scored and
    capped (`RECALL_LIMIT` 4, about 200 tokens), with an optional semantic set.
  - `recall/*`: verbatim quote recall by cue.
  - Ledger focus by names on stage (`selectLedgerRows` `LedgerFocus`).
  - Chapter records and eras: our "communities", but time-sliced rather than topic-clustered.
- Gap:
  - "The player mentions the locket; the locket was Tom's mother's; Tom's mother was killed at the mill." The mill
    fact names neither the locket nor anything in the line, so it is never surfaced.
  - Recall is zero-hop.
- Fit: one-hop or PPR expansion over a co-occurrence graph is cheap and deterministic: build per turn from live rows,
  cache-key by chat, story and newest message id, as `recall/cacheKey.ts` already does. The token cap is unchanged.
  The risk is relevance noise (Mem0g's multi-hop drop), so it must win on a fixture before it ships on.

### Entity resolution

- We have `nameFold.ts`: `foldName` (NFKD, case, articles), `resolveName` (exact fold among roster, aliases and codex
  names, or a unique structural first/last-word match), `foldLedgerSignals` and `foldEpistemicSignals` for character
  types only, and the author-only `same-character` check after 3 reads. There is no automatic merge.
- Graphiti and Mem0g merge by embedding plus an LLM judge.
- Gap: places, items and factions are keyed by their raw lowercased string (`ledgerKey`), so "the old mill" and
  "Old Mill" are two entities.
- Fit: extend the exact-fold resolver with codex entities and lorebook entry titles, never fuzzy. Keep "ambiguous
  stays as written" and "suggest, never auto-merge". An LLM merge would break determinism on replay unless frozen,
  and adds a pass.

### Per-member knowledge

- We have epistemic rows `[knows|unaware|suspects|believes|hiding|intends]` with `subject`, `content` and
  `hiddenFrom`. `heldSecrets.ts` turns `hiding`/`unaware` into `HeldSecret { phrasings, knowers, onlyFrom }`.
  `keptFrom` filters any shared text by **word restatement** against the phrasings. `whoKnows.ts` builds the author
  grid.
- How a graph would change it: in Graphiti terms, each edge gets an audience, the set of members who know it.
  Structurally that is cleaner: a relation row could carry `knownBy` (or the `audience.ts` relations), and the shared
  ledger render could skip rows whose audience excludes the drafted member without any text matching.
- Gap and caution:
  - The model rarely emits audience reliably, which is why v2.8 42 B (witness record) is gated on its W4 floors.
  - A structural audience can only *narrow* what text filtering already allows. Keep `keptFrom` as the backstop on
    the final rendered text, since every graph render is text again.
  - So: a relation row may carry an audience when the witness record supplies one (`mayAdd`). Absent means "treat
    as shared tier", which still passes through the resting filter.
- Fit: compatible, provided the audience never *widens*.

### Rollback ≡ replay

- We have:
  - `rollbackLedger` drops versions read at or after the message (pinned kept as `keepPinnedFrom` decides) and strips
    confirmations.
  - `reverse.ts` and `derived.ts` record inputs and removals.
  - `rollbackReplay.property.test.ts`.
- Graph systems rarely address source retraction:
  - Graphiti mutates `t_invalid` on the old edge.
  - AriGraph and Mem0 delete or rewrite.
  - Undoing a later episode in those systems needs a reverse log.
- Rule for us: **validity intervals are derived, never stored on the predecessor.** `validFrom` is stamped on the row
  at write time and is immutable. `validTo` is the successor's `validFrom`, computed in the view, the same way
  `buildLedgerView` and `liveLedgerRows` derive "newest live" today. A relation that ends is a new version with value
  `ended`. Rollback then needs no new code path, and the property test covers it once new row kinds join its
  generator.

Constraints (all proposals): no new pass, a few output tokens at most; lazy chunk; per-turn blocks placed late.

## 4. Proposals (ranked)

### P1. "What changed" projection over existing versions (S)

- Change:
  - New pure module `memory/changes.ts`, lazy:
    `changesBetween(memory, fromMessageId, toMessageId, view) -> { ledger: [{entity, field, from, to}], ended: [...], learned: [...], retired: [...] }`.
  - Sources: the ledger `supersedes` chain (first and last live version inside the window), epistemic rows created or
    retired in the window, memory rows `supersededAt` in the window, and the blackboard delta from engine history.
  - Consumers, in order:
    1. Author console "Since …" section.
    2. A private per-member line "Since you last spoke: …" when a member is drafted after N boundaries off stage
       (rendered through the member's private view and `withoutSecretLines`).
    3. Recap and return-to-chat summaries.
- Cost:
  - 0 model calls. Microseconds of CPU.
  - About 40–120 tokens on a returning member's private block only, capped; nothing on ordinary turns.
- Invariants:
  - Derived at read time and never persisted, so rollback is automatic.
  - Privacy: player and shared surfaces use the resting view. Held secrets are filtered as in every shared tier.
  - The member line needs the "who was present" record (presence or roster `enabled`), so a member is not told
    what happened while they were away; that is P1b. P1b should use witness data only once the W4 floors pass, and
    until then report only what happened while the member was present.
- Measure:
  - Jest: property test that `changesBetween` after rollback equals replay.
  - Payload golden case for the returning-member block.
  - Blind Sol rating of continuity on returning-member turns, with and without the line.
- Note: the cheapest Graphiti idea to take. The T' timeline is already in our rows.

### P2. Valid-time stamp on rows (S)

- Change: at write time, `applyLedgerSignals`, memory and epistemic writers add `validFrom: { storyTime?, boundary,
  messageId }`, with `storyTime` from the `story_time` code int when the story has a clock (`engine/life/clock.ts`).
  Views derive `validTo` from the successor. Recap and changes (P1) and the ledger render can say "since day 3" or
  "for two days".
- Cost: 0 calls, a few bytes per row. The blob version bump is a no-compat change, which our rules allow.
- Invariants: immutable at write time, derived end, so rollback is safe. `story_time` itself has the `story-time`
  rollback detector, so a replayed write re-stamps identically.
- Measure: jest replay invariance, plus one live-suite fixture asking a duration question through Ask
  (`so-ask-qa.mts`).

### P3. Relation rows in the ledger (M)

- Change:
  - Contract: an optional line `[rel:Subject:relation] Object` (and `[rel-end:Subject:relation] Object`), parsed in
    `memory/parse.ts` beside `parseLedgerLine`.
  - Store: `LedgerEntry` gains `object?`, and `ledgerKey` becomes `subject|relation|object` for relation rows.
    "Ended" is a version whose value is `ended`, append-only like every other version.
  - Name fold on both ends (`foldLedgerSignals` extended to `object`).
  - Small declared inverse table for symmetric relations (`ally_of`, `married_to`, `enemy_of`), so the conflict
    detector (`conflicts.ts` `detectConflicts`) can pair `trusts` with `distrusts` deterministically.
  - Authored `rel_*` and bound keys stay authoritative.
  - Render: under the existing `Current state:` block, grouped by subject, inside `LEDGER_INJECT_CHAR_CAP`.
- Cost:
  - 0 extra calls; perhaps 20–60 more output tokens per read.
  - Read prompt grows by about 60 tokens (one format line).
  - Risk: plan 25 found Artemis ignores a sparse format line when a richer neighbour exists, and the FACT/MEMORY
    precedent shows a new line kind can be ignored or can steal rows from another tier.
- Invariants: rollback through existing `rollbackLedger`; privacy through the shared-tier resting filter. Audience
  stays optional and narrow-only (§3).
- Measure:
  - New so-live-suite fixtures (a `relations` tier) with positive and negative needles, run x2.
  - The existing tiers (facts, ledger, epistemic, intents) must not drop: the plan 25 lesson.
  - Decide by a predeclared floor and record a miss without retuning.
- Gate: adopt only if relation recall ≥ floor and no other tier drops.

### P4. One-hop / PPR recall expansion (M)

- Change:
  - In `archiveRecall.ts` (or a lazy `recall/graph.ts`), build an undirected co-occurrence graph per turn.
    - Nodes: folded entity names.
    - Edges: two entities in the same live memory row's `entities`, a ledger row's entity plus relation object
      (after P3), or a chapter `people` list.
  - Seeds: entities named in the player line, plus the drafted member and the cast on stage (lower weight).
  - Run 10–20 iterations of PPR (damping 0.5, as in HippoRAG 2), or plain one-hop expansion when the graph is tiny.
  - Score candidates by `scoreEntry` × node mass. Keep the token cap.
  - Seeded and deterministic: no randomness, ties broken by store order.
- Cost: 0 calls. Graph of at most a few hundred nodes, under 1 ms. Cache key: chat, story, newest message id,
  revision.
- Invariants: candidates already pass `isLive` and the resting filter at render. The risk is noise, not privacy.
  Expansion never crosses into rows the drafted member's private view lacks, because the graph is built from that
  view.
- Measure:
  - New recall fixture set with 2-hop needles (archived fact connected through one intermediate entity) plus
    distractors.
  - Floor on recall@4 and on "no distractor injected". Compare with the zero-hop baseline in jest (recorded goldens).
  - Then a blind Sol rating on long-chat turns.
  - Mem0g's multi-hop drop means it must beat zero-hop on fixtures first.

### P5. Exact-fold entity resolution for non-characters (S)

- Change: extend `NameSource` with codex entities (places, items, factions) and story lorebook entry titles/keys.
  `foldLedgerSignals` then canonicalizes those types too, with exact fold or unique structural match only, and
  ambiguous names left as written. The `same-character` check generalizes to `same-entity` (author-only, suggest,
  never merge).
- Cost: 0 calls.
- Invariants: fold at write time is a pure function of the story, so replay is identical. A codex change mid-run is a
  story diff, and the pinned copy keeps it stable.
- Measure: jest over recorded reads (`duplicatesT551.recorded.test.ts` style), counting distinct ledger keys that
  fold to one canonical name before and after; the conflict detector should find more true pairs on the
  contradictions fixture (`contradictions.fixture.test.ts`).

### P6 (later, gated). Edge audience from the witness record (L)

- Once v2.8 42 B passes its W4 floors, relation and ledger rows read in a window can carry the audience relation from
  `memory/audience.ts` (witnessed or told). The shared ledger render can then drop a row for a drafted member outside
  its audience structurally, before `keptFrom` runs.
- Narrow-only; `keptFrom` stays the backstop.
- Measure: the existing `secret*.review.test.ts` suite plus a privacy journey.
- Not before W4: an unreliable audience fails closed, and that would hide state from everyone.

## 5. What we do that the field does not, and rejected ideas

### Keep

- **Exact rollback of source edits, swipes and deletes.** None of the surveyed systems evaluates retracting a source
  episode. Graphiti invalidates, AriGraph and Mem0 rewrite, and GraphRAG reindexes. Our append-only versions,
  provenance `messageId` and `sourceRevision`, and the rollback ≡ replay property are rarer and more valuable for
  chat RP than any graph feature.
- **Conflicts are a hard, author-resolved state,** not automatic newest-wins. Graph systems trust the extractor's
  latest claim; with a 31B extractor that is how a wrong correction steers a character. `standing` and the windowed
  re-read are better than an LLM invalidator for authored stories.
- **Per-member epistemics and held secrets across every shared tier.** Graph memory products are single-viewer: the
  user is the only audience. Nothing comparable exists for multi-character knowledge.
- **Authored state outranks extracted state** (bound ledger keys, `rel_*` qualities, codex latches). Graph systems
  have no notion of an author.
- **Time-sliced "communities"** (chapter records and eras, with fold and unfold on rollback) suit a story better than
  GraphRAG's topic clusters. A story's natural unit is the chapter, and our records already carry
  `people`, `consequences` and `open` threads.

### Rejected

- **Replace the ledger and memory stores with a graph store** (Neo4j, Kuzu, or a JS graph DB in the page). It brings
  bundle weight, a second persistence model beside `chat_metadata`, and rollback re-plumbing. The evidence (Mem0g
  against Mem0, Zep's single-session regression, RAG against GraphRAG) shows no overall win on conversational
  memory.
- **GraphRAG global community summaries.** Indexing costs about 115M tokens on a corpus of HippoRAG's size. We never
  ask "themes of the whole corpus" questions, and canon plus chapter eras already answer "what has happened".
  Leiden communities are also unstable under incremental change.
- **LightRAG.** It collapsed in the one controlled third-party evaluation (6.6 F1 in HippoRAG 2), and the rebuild
  cost on every update is wrong for a per-turn pipeline.
- **LLM edge invalidation per write** (Graphiti, Mem0g resolver). It adds a model call per window on the 3090, and it
  makes replay depend on a nondeterministic call unless the verdict is frozen. We already have a narrow
  `SUPERSEDE/INDEPENDENT` verdict for uncertain pairs and the author queue for the rest.
- **Embedding plus LLM entity merging** (Graphiti, Mem0g). It is nondeterministic and silently merges characters. Our
  exact fold, ambiguity left as written, and author-confirmed `same-character` check are correct for a cast with
  shared surnames and titles.
- **Full OpenIE triple extraction of every window** (HippoRAG indexing). Artemis already under-writes the FACT
  format (plan 25), and a free-form triple flood would cost output tokens and precision. P3 instead asks for a few
  typed relation lines.
- **Storing `t_invalid` on the predecessor.** It mutates history and breaks rollback ≡ replay; derive the end
  instead (§3).

## Sources
Linked inline in §2 (papers, W3C specs); community trackers in `C:\dev\st-extensions-research`.

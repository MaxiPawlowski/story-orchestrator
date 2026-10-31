# Lore selection research: retrieval literature applied to keyword lorebooks

Angle A (`lore-research`), 2026-10-31. Research only; no code changed. Question: what can retrieval research (hybrid
sparse/dense, query expansion, rerankers, adaptive retrieval, budget allocation, placement, entity linking, evaluation)
add to how World Info entries reach the prompt? Labels: **M** measured in this repo (golden cited), **S** read from
source, **R** self-reported by the paper/vendor, **E** my estimate.

## 1. Summary

- **We already run the expensive half of a modern RAG stack.** Lore-select is a per-generation cross-encoder-style
  relevance pass (one judge question per candidate over the last 8 messages plus the checkpoint objective), on top of
  ST's keyword scan, with deterministic pins (`lorePins.ts`), scan-time gating, exclusive narrowing and late placement.
  What is missing is the cheap half: a first-stage scorer, a fallback, a stability policy and an end-to-end measure.
- **Gap 1: no first stage and no fallback.** When the judge is off, cooling or times out, nothing selects; ST's keyword
  scan is all there is (`loreSelect.ts` returns null, `LORE_TIMEOUT_MS` 1500). Hybrid retrieval literature says a
  lexical scorer plus rank fusion is the robust baseline; a pure, seeded BM25 over entry text against the window plus
  story-state terms would give a fallback, a pool cap and a tiebreak, all CPU, all deterministic.
- **Gap 2: the query is the transcript, not the scene.** The judge sees 8 messages and the checkpoint name/objective
  (S, `loreSelect.ts:141`). Story state we already hold (location, on-stage cast with aliases, active quest titles,
  `knownEntities`) is not part of the query. Query expansion from structured state is the narrative analogue of HyDE /
  Query2doc and costs nothing.
- **Gap 3: we retrieve on every generation.** The scene key includes `messageId` (S, `loreSelect.ts:107`), so every
  member's turn re-asks. Adaptive-retrieval work (FLARE, DRAGIN, SeaKR; an ACL 2025 comparison of 35 methods) finds
  that cheap signals decide "retrieve now?" about as well as complex pipelines. For us the cheap signal is "did the
  scene's entity set change", and holding picks steady also helps the prompt cache and the reply's consistency.
- **Gap 4: ranking quality is unmeasured end to end and below its own floor.** The relevance comparison ran 17 rows:
  precision@4 0.485 for both the Noul and Score arms against a 0.85 floor (M, `test/goldens/judge/lore-relevance.json`).
  Binary calibration is fine (52/58, recall 26/30, precision 26/28, M, `lore.calibration.json`). Nobody measures
  whether a reply *used* what was forced, or missed what it needed. `loreFired.ts` already records what fired and why.
- **Placement is in a good spot by construction.** Gemma's local layers see 1024 tokens; at the recorded p50 of 173
  tokens per history turn (M, `fable-context-slicing.md`), depth 4 sits about 700 tokens from the end, inside every
  local window. Lost-in-the-middle findings argue for keeping it there, not for moving it.
- **Budget is split by source, not by value.** Lore top-k is a fixed 4, memory tiers have their own caps, pins and the
  mirror add on top. Knapsack-style allocation with a redundancy penalty (MMR) across sources is the standard answer.

## 2. Survey

### 2.1 Hybrid sparse/dense retrieval and rank fusion

- **What.** Run a lexical scorer (BM25, or learned sparse such as SPLADE) and a dense embedding retriever, then fuse
  rankings, typically Reciprocal Rank Fusion: score = Σ 1/(k + rank), k≈60. Lexical wins on names, rare terms and exact
  identifiers; dense wins on paraphrase.
- **Sources.** Cormack et al., "Reciprocal Rank Fusion outperforms Condorcet and individual rank learning methods",
  SIGIR 2009 ([PDF](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf)); BEIR benchmark, Thakur et al. 2021
  ([arXiv 2104.08663](https://arxiv.org/abs/2104.08663)): BM25 stays a strong zero-shot baseline that many dense models
  fail to beat out of domain (R); SPLADE v2 ([arXiv 2109.10086](https://arxiv.org/abs/2109.10086)).
- **Evidence.** BEIR: BM25 beats several dense retrievers on most of 18 out-of-domain sets (R). Fusion is the default
  in Elastic, Vespa, Weaviate.
- **Failure modes for lore.** Lore entries are short and name-dense, the "corpus" per story is tens to hundreds of
  entries, and the query is chat prose. IDF over 100 entries is noisy; the same world name appears everywhere (the
  calibration note in `judge/lore.ts:31` already saw the general-overview entry win every scene). Dense retrieval needs
  an embedding model on the GPU or a download; ST Vector Storage exists but copies the transcript and is a host feature
  we only detect (`loreExclusive.ts:43` refuses exclusive mode when vectors scan WI).

### 2.2 Query expansion and rewriting

- **What.** Enrich a short query before retrieval: pseudo-relevance feedback (RM3), HyDE (generate a hypothetical
  answer, embed it), Query2doc (LLM writes a pseudo-document appended to the query), or structured expansion from known
  state.
- **Sources.** HyDE, Gao et al. 2022 ([arXiv 2212.10496](https://arxiv.org/abs/2212.10496)); Query2doc, Wang et al.
  2023 ([arXiv 2303.07678](https://arxiv.org/abs/2303.07678)), +3-15% on MS MARCO/TREC DL for BM25 (R).
- **Fit.** Both LLM methods need a generation per turn; we cannot spare that on the play GPU. But our expansion source
  is better than a hypothetical document: the blackboard knows where the party is, who is on stage, which quests are
  open and which entities the player has met. That is free and exact.
- **Failure modes.** Expansion drift (generic terms promote generic entries); expanding with a name the player has not
  discovered can pull lore that spoils (see §3.4).

### 2.3 Rerankers (cross-encoders)

- **What.** A small model reads (query, passage) jointly and scores relevance; applied to the top N of a first stage.
- **Sources.** Nogueira and Cho, "Passage Re-ranking with BERT" ([arXiv 1901.04085](https://arxiv.org/abs/1901.04085));
  `cross-encoder/ms-marco-MiniLM-L6-v2` (22M params, English); BAAI `bge-reranker-v2-m3` (568M, multilingual).
  Practitioner comparisons ([dev.to](https://dev.to/gabrielanhaia/reranker-selection-cross-encoder-vs-llm-as-reranker-vs-colbert-which-earns-its-latency-2h7o),
  [ExecuTorch card](https://huggingface.co/mlboydaisuke/bge-reranker-v2-m3-ExecuTorch),
  [reranker leaderboard](https://benchmarks.hindsight.vectorize.io/leaderboard/reranker)) put MiniLM-L6 as the
  latency choice; one conversational-facts leaderboard ranks it first (R, single task). No clean CPU timing found; my
  estimate for L6 on a desktop CPU is 2-8 ms per 256-token pair, so 40 pairs ≈ 100-300 ms (E).
- **Fit.** Our judge (Jev) is already the reranker, remote, calibrated, ~290 ms p50 (M, `lore.calibration.json`). A
  local L6 would be the offline fallback and a pool trimmer, not a replacement. The memory shortlist already parks a
  CPU cross-encoder pending a download OK (`memory-shortlist-2026-10-31.md`); one model would serve both.
- **Failure modes.** MS MARCO models are trained on web QA, not "does the next roleplay reply need this"; they reward
  lexical overlap with the last line and will not know that a mentioned faction implies its leader. Truncation at 512
  tokens is fine for lore (we clip at 600 chars).

### 2.4 Adaptive retrieval (retrieve only when needed)

- **What.** Decide per step whether to retrieve. Self-RAG trains reflection tokens; FLARE retrieves when the next
  sentence has low-probability tokens; DRAGIN uses token entropy and attention to time and form the query; SeaKR reads
  internal uncertainty.
- **Sources.** Self-RAG, Asai et al. 2023 ([arXiv 2310.11511](https://arxiv.org/abs/2310.11511)); FLARE, Jiang et al.
  2023 ([arXiv 2305.06983](https://arxiv.org/abs/2305.06983)); DRAGIN, Su et al. 2024
  ([arXiv 2403.10081](https://arxiv.org/html/2403.10081v3)); SeaKR ([arXiv 2406.19215](https://arxiv.org/pdf/2406.19215));
  Moskvoretskii et al., "Adaptive Retrieval Without Self-Knowledge? Bringing Uncertainty Back Home", ACL 2025
  ([arXiv 2501.12835](https://arxiv.org/abs/2501.12835)): 35 methods, 6 datasets; simple uncertainty estimators match
  complex adaptive pipelines on QA and beat them on efficiency (R). A 2025 line uses external features (entity
  popularity, question type) instead of model uncertainty ([arXiv 2505.04253](https://www.arxiv.org/pdf/2505.04253), R).
- **Fit.** Token-level uncertainty needs the play model's logits mid-generation; not available through ST and it would
  break the prefix-stable prompt. The external-feature branch fits: "has the set of entities in the window changed
  since the last selection?" is a deterministic trigger.
- **Failure modes.** Under-retrieval when a need arises without a new name (the player asks "what do you know about the
  old war?"). Mitigation: always re-select on a player message, hold only across member turns and swipes.

### 2.5 Context budget allocation across sources

- **What.** Select passages under a token budget to maximise relevance minus redundancy: Maximal Marginal Relevance
  (Carbonell and Goldstein 1998, [PDF](https://www.cs.cmu.edu/~jgc/publication/The_Use_MMR_Diversity_Based_LTMIR_1998.pdf)),
  greedy knapsack by score/token, and "RAG vs long context" routing (Self-Route, Li et al. 2024,
  [arXiv 2407.16833](https://arxiv.org/abs/2407.16833): route to long context only when the model says retrieval is
  insufficient; similar quality at much lower cost, R).
- **Fit.** Our depth-4 neighbourhood carries memory tiers, private blocks, the Author's Note and late lore, each with its
  own cap. A lore entry and a memory fact often restate each other (both describe the same place). Nothing deduplicates
  across those sources or trades a weak lore pick for a strong memory row.
- **Failure modes.** A shared budget couples features that are switched independently (each feature is its own
  switch); redundancy detection by wording misses paraphrase.

### 2.6 Placement and position effects

- **What.** Models use information at the start and end of context best ("lost in the middle"); attention-sink and
  calibration work tries to flatten the curve.
- **Sources.** Liu et al., "Lost in the Middle" ([arXiv 2307.03172](https://arxiv.org/abs/2307.03172)); Hsieh et al.,
  "Found in the Middle" ([arXiv 2406.16008](https://arxiv.org/abs/2406.16008)); Gemma 3 technical report
  ([arXiv 2503.19786](https://arxiv.org/abs/2503.19786)): 5 local (1024-token window) per 1 global layer; a NeurIPS
  2026 study finds middle-position needle accuracy in Gemma 3 270M collapsing by 4K tokens while 1B fails
  non-monotonically ([listing](https://neurips.cc/virtual/2026/162683), R, small models only).
- **Fit.** Our play model is Gemma 4 with the same local/global idea (50 SWA + 10 global, `context-chunking-web.md`).
  Content inside the last 1024 tokens is seen by every layer; content further back only by the 10 global layers.
  `lorePlacement.ts:64-65` moves non-constant story lore to depth 4 (before-char entries to depth 5), role system. At
  173 tokens per turn p50 plus the 276-token private block (M, `fable-context-slicing.md`), depth 4 lands roughly
  700-1000 tokens from the end (E): inside the window, but near its edge for long replies. Constants stay in the head
  for cache reasons, where only global layers reach them late in a long chat.
- **Failure modes.** Depth counts messages, not tokens; one long reply pushes lore out of the local window.

### 2.7 Entity linking and aliases

- **What.** Map surface mentions to canonical entities (BLINK, ReFinED) so retrieval keys on the entity, not the string.
  RoleRAG builds an entity graph for role-play, normalising name variants and refusing out-of-boundary knowledge.
- **Sources.** ReFinED, Ayoola et al. 2022 ([arXiv 2207.04108](https://arxiv.org/abs/2207.04108)); RoleRAG
  ([arXiv 2505.18541](https://arxiv.org/html/2505.18541v1), gains self-reported, aggregator figures unverified); a
  second 2025 paper notes no benchmark targets role-play under RAG
  ([arXiv 2508.02016](https://arxiv.org/html/2508.02016v1)).
- **Fit.** We already resolve names for memory (`memory/nameFold.ts`, roster aliases, codex names) and for "self"
  pruning (`loreSelect.ts` `memberNames`, `loreKeyMatch.ts` `aboutMember`). ST's keyword scan does not know aliases: an
  entry keyed on a full name misses a nickname unless the author listed it. Nothing lifts our alias table into lore.

### 2.8 Evaluating retrieval for narrative

- **What.** RAG evaluation splits context precision/recall (were the retrieved items relevant / was everything needed
  retrieved) from faithfulness and use. RAGAS ([arXiv 2309.15217](https://arxiv.org/abs/2309.15217)) and ARES
  ([arXiv 2311.09476](https://arxiv.org/abs/2311.09476)) use an LLM judge per item; attribution methods check whether
  the answer's claims trace to a passage.
- **Fit.** We have labels for 17 relevance rows and 58 binary rows, a `loreFired` ring with `via` per entry, and payload
  goldens. Missing: utilisation (did the reply draw on a forced entry?) and need (what did the scene require that never
  fired?). Both can be scored off-path from recorded sessions.
- **Failure modes.** Lexical attribution overcounts names shared by many entries; judge labelling of "needed" is itself
  noisy (precision@4 caps below 1 when a scene has fewer than four relevant entries, which inflates the gap to a 0.85
  floor; worth checking before reading 0.485 as failure).

## 3. Mapping to us

### 3.1 What we have (S unless marked)

| Stage | Where | Notes |
|---|---|---|
| Keyword scan | ST host | scan depth, keys, secondary logic; we predict it in `loreKeyMatch.ts` `keywordWillActivate` |
| Candidate filter | `judge/lore.ts:42` `loreCandidates` | scoped books only; drops disabled, constant, empty |
| Leave-to-scan | `loreSelect.ts:135` `leftToScan` | entries the keyword scan will fire, or about the drafted member, are not asked |
| Relevance | `judge/lore.ts` `buildLoreRequests` | one Noul per entry, 8-message window (`talkControl.ts:27`), checkpoint name + objective, 600-char clip |
| Cut | `judge/policy.ts:67-68` | `LORE_MIN_P` 0.6, `LORE_TOP_K` 4 (max 12) |
| Apply | `WORLDINFO_FORCE_ACTIVATE` | force only, no write; seam timing in `loreSelectTiming.ts` |
| Narrowing | `loreExclusive.ts` | non-picked non-constant entries suppressed when every signal agrees |
| Deterministic pins | `lorePins.ts` | `place_lore` for the current location, `people_lore` for codex entries latched this round |
| Gating | `scanGatePlan.ts`, `worldInfoScan*.ts` | checkpoint path decides gated entries per scan |
| Placement | `lorePlacement.ts:64-65` | depth 4/5, system role, constants untouched |
| Evidence | `loreFired.ts`, `worldInfoEvidence.ts` | per message: entries fired, via constant/key/forced/mirror, rolled back by message |
| Measurement | `judge/loreRanking.ts`, `loreScore.ts`, `loreRelevanceCalibration.ts` | precision@4, nDCG@4, tie rates; Score arm built, not wired |

### 3.2 Real gaps

1. No first-stage scorer: every non-keyword candidate goes to the judge, ordered by uid on ties.
2. No fallback: judge absent / cooling / timeout means no selection at all.
3. Query lacks structured scene state (cast, location, quests, met entities); pins use some of it but only for
   authored bindings.
4. No retrieval stability: re-selection on every member turn and swipe; picks can churn between members of one round.
5. No cross-source redundancy or shared budget.
6. No utilisation / need metric over real sessions; the ranking fixture is 17 rows.
7. Aliases from the roster/codex do not reach keyword activation or the selector's query.

### 3.3 Constraints that shape the fit

- Determinism and rollback: anything new must be pure over (window, state, entries) or recorded per message like
  `loreFired`. BM25 and entity-set triggers are pure; a held pick set must key on chat + story + boundary so rollback
  recomputes it.
- Prefix stability: lore lives at depth 4, after the cache-relevant head. Stable picks across members of one round mean
  the per-member tail differs less (E: small effect, since each member's head already differs).
- Main bundle budget: a BM25 index over tens to hundreds of entries is a few KB of code; ride the lore lazy path.
- Privacy: lore entries are author content shared with every member; no held-secret path runs through them today. Any
  query expansion from memory rows would be the first such path and must use the resting view.

### 3.4 One risk worth an explicit decision

Lore-select does not consult `knownEntities` (S: no codex reference in `loreSelect.ts` or `judge/lore.ts`). An entry
about an entity the player has not discovered can be forced if the judge rates it needed; authors control this today
only through checkpoint `world_info` gating. That matches "disclosure is not knowledge" (the model knowing is not the
player seeing) but a forced entry raises the chance the model names it. Not a defect claim; a switchable "prefer known
entities" bias (P2) would let the owner measure it.

## 4. Proposals (ranked)

### P1. Deterministic first stage: BM25 + state terms, used as fallback, pool cap and tiebreak (S-M, no GPU)

- **Change.** New pure module `src/judge/loreLexical.ts` (lazy): tokenise entry `comment + keys + content` (clipped as
  today), BM25 over the scoped candidate set, query = window (recency-weighted, last player line ×2) + P2's state
  terms. Use it three ways, each its own switch under `judge.uses.loreSelect` sub-options or `worldInfo.*`:
  (a) **fallback**: when the judge is absent, cooling past `LORE_RETRY_WAIT_MS` or times out, force the top 2 lexical
  picks above a score floor instead of nothing; (b) **pool cap**: send only the top N (e.g. 24) to the judge when the
  candidate set is larger; (c) **tiebreak**: order equal-p picks by lexical score instead of uid (`pickLore`).
- **Cost.** Zero model calls; <1 ms per selection for a few hundred entries (E). (b) cuts judge request size.
- **Invariants.** Pure, seeded by nothing (no randomness). Fallback picks are forces like today: nothing to roll back.
- **Measure.** Offline in jest: replay `lore.calibration.json` (58 rows) and `lore-relevance.json` (17 rows) with arms
  {judge, lexical, judge∘lexical-tiebreak, judge-on-capped-pool}; report recall/precision, precision@4, nDCG@4,
  tieRate via `loreRanking.ts`. Predeclare: (a) adopts if lexical recall@2 ≥ 0.6 on calibration rows (E floor, set
  before the run); (b) adopts if capped-pool recall drops ≤ 1 row; (c) adopts if tieRate falls and nDCG does not drop.
  Then one no-model scenario proving the fallback forces on a judge timeout.

### P2. Scene-state query expansion with alias linking (S-M, no GPU for the offline half)

- **Change.** Build a `LoreScene.state` block from what the engine already has: current location (`PARTY_LOCATION_KEY`),
  on-stage roster names with aliases (`memberNames`, `castCardName`), active quest titles, codex names of entities in
  `knownEntities`. Feed it (i) to P1's query, (ii) to the judge request as `scene.cast/place/quests` fields, and
  (iii) an alias pass: if an entry's primary key names a roster member or codex entity and the window mentions one of
  that entity's other names, treat it as keyword-fired for "leave-to-scan" accounting and as a candidate boost. Optional
  sub-switch "prefer known entities": candidates about unknown codex entities are down-weighted, never forced by the
  lexical fallback.
- **Cost.** No model calls; judge request grows by ~100-200 chars (E). Note: the judge goldens are keyed on state +
  questions, so a state change means re-recording `lore.calibration.json` and the holdout (one TypeSafe batch, no GPU).
- **Invariants.** Reads blackboard and roster only; no memory rows, so no held-secret path. Pure.
- **Measure.** Arm "state" vs today on the same goldens after re-record (TypeSafe, no GPU); predeclare recall must not
  drop and precision@4 rise ≥ 0.05. Alias pass: a jest fixture of nickname mentions; a no-model scenario with an entry
  keyed only on a full name and a chat using the alias.

### P3. Round-stable selection with an entity-change trigger (S, no GPU to build, GPU to rate)

- **Change.** Hold the last complete selection for the rest of a round (later members, swipes, continues) unless the
  set of linked entities in the window changed (P2's linker) or the checkpoint changed. Always re-select on a player
  message. Add a hysteresis option: an entry picked last turn stays unless its p falls below `min_p − 0.1` (mirrors
  ST's `sticky`, deterministic). Lives in `loreSelect.ts` cache logic; key = chat + story + checkpoint + entity-set hash
  + last player message id.
- **Cost.** Saves one judge call per extra member per round (a 3-member round: up to 2 of 3 calls, E). Zero added calls.
- **Invariants.** The held selection is keyed on message ids, so a rollback to an earlier message invalidates it the
  same way the cache does today. Exclusive mode reads `completeSelection`; its `messageId` match must accept the held
  selection explicitly (one check in `loreExclusiveFor`).
- **Measure.** Offline over recorded payloads (`so-lanes/*/debug/*/payloads.jsonl` already used by the context study):
  judge calls per round and pick churn between members of one round, before/after. Quality: a blind Sol rating pair
  (held vs fresh picks) only if churn is high; that needs the GPU for replies.

### P4. Utilisation and need metrics over recorded sessions (M, no GPU)

- **Change.** Offline scorer `scripts/debug/so-lore-eval.mts` over session evidence: for each message, take
  `loreFired` entries (via constant/key/forced/mirror) and the reply text. *Utilisation* = an entry's distinctive terms
  (terms in this entry and in fewer than 10% of the story's entries) appear in the reply. *Waste* = fired entries with
  zero utilisation, weighted by tokens. *Need* (judge, off-line batch on TypeSafe): for a sample of replies, ask
  whether the reply contradicts or invents a fact some unfired entry holds. Report per `via`.
- **Cost.** Lexical part free; judge sample ~50 questions per session (TypeSafe, no GPU).
- **Invariants.** Read-only over archived evidence; campaign evidence stays in the private `so-sessions` repo, report
  counts only.
- **Measure.** This is the measure. Its first job: tell whether keyword-fired lore or forced lore wastes more tokens,
  and whether the 0.485 precision@4 matters in play. Also re-check precision@4's ceiling per row (rows with fewer than 4
  relevant entries) before treating the 0.85 floor as reachable.

### P5. Cross-source budget with redundancy (M, GPU for quality)

- **Change.** At injection time, compute token cost and a value score for each lore pick, pin and memory row headed for
  the depth-4 neighbourhood; drop a lore pick whose distinctive terms are ≥ 70% covered by an injected memory row or pin
  (MMR-style), and let freed tokens go to the next lore pick. Behind its own switch; never touches constants or gated
  entries; secret filtering stays where it is (memory rows arrive already resting-filtered).
- **Cost.** No model calls; ms-level.
- **Invariants.** Couples lore and memory injection; must read memory blocks through the same per-member view the
  prompt uses, never the raw ledger.
- **Measure.** Payload goldens (`so-payload-golden.mts`) for token deltas, availability probes from the memory
  shortlist; quality needs a blind rating on the GPU.

### P6. Parked: local cross-encoder fallback and placement probe

- MiniLM-L6 as P1's second stage when the judge is unavailable, shared with memory's parked reranker. Needs the owner's
  download OK; measure as an extra arm on the same goldens.
- Placement: token-based depth (place lore at the message boundary nearest 600 tokens from the end instead of a fixed 4
  messages) vs depth 4, blind-rated. GPU only; low priority because depth 4 is already inside the local window at p50.

## 5. What we do that the field doesn't, and rejected ideas

**Ahead of the field.**
- Retrieval that is scene-gated by an authored graph (checkpoint path decides eligibility per scan, without writes)
  and rolled back with the chat. RAG systems have no notion of "this document is only true after chapter 3".
- A calibrated per-use relevance judge with floors and goldens replayed in jest, plus "model-mismatch" refusal. Most
  RAG stacks ship an uncalibrated reranker.
- Evidence of what actually reached the prompt (`loreFired`, observed `WORLD_INFO_ACTIVATED`), not inferred.
- Cache-aware placement as a stated rule (per-turn lore late, constants early).

**Rejected.**
- Main-model tool retrieval (TunnelVision style, Self-RAG reflection tokens): needs a tool-calling or fine-tuned play
  model, puts retrieval on the reply path, breaks prefix stability.
- FLARE / DRAGIN token-uncertainty triggers: need logits mid-generation through ST; not available and would re-prompt.
- HyDE / Query2doc: one extra generation per turn on the shared GPU for a gain structured state gives for free.
- Dense retrieval over lore as a default: an embedding model on the 3090 or a download, small corpora where BM25 plus
  the judge already cover paraphrase; ST Vector Storage remains the owner's choice and already conflicts with exclusive.
- Graph RAG over lore (RoleRAG): entity graph construction per story is authoring work the codex and roster already do
  in structured form; revisit only if P2's linker proves insufficient.
- Token-level context compression of lore (LLMLingua class): earlier research found it risky for voice and detail
  (`context-chunking-web.md`); lore entries are already short.

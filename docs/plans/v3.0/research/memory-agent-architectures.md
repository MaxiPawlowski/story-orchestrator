# Memory research: LLM agent memory architectures (2026-10-31)

Angle `agent-architectures` of the six-way memory research (brief in the session scratchpad). Research only: no code,
no runs. Sources are linked inline. Benchmark numbers are mostly self-reported by the authors or vendors, on
assistant-style QA benchmarks (LoCoMo, LongMemEval, MSC), and do not carry over to group roleplay as-is.

## 1. Summary

- **The read should see its neighbours before it writes (Mem0 / Memory-R1).** Our shared read writes MEMORY/FACT lines
  blind. It sees only the top 8 facts by importance (`extraction/canonLite.ts`). Duplicates and supersessions are then
  guessed afterwards, by Jaccard or vector bands plus a regex of state-change words (`memory/consolidate.ts`,
  `memory/similarity.ts` `STATE_CHANGE_PATTERNS`). The field's main lesson since 2025 is to show the writer the few
  existing rows nearest to what it is about to write, with short ids. The writer then emits ADD / UPDATE(id) /
  NOOP(id) itself. This costs no extra model call.
- **We already parse a SUPERSEDE/INDEPENDENT verdict, but nothing calls it.** `memory/supersede.ts`
  `parseSupersessionVerdicts` has no non-test caller. Uncertain pairs only get a `contradicted` flag and a score
  penalty. Resolving those pairs during idle time ("sleep-time", in Letta's and LightMem's terms) is a small, contained
  change.
- **Relevance is measured against the last message alone, by word overlap.** `runtime/scoreContext.ts` uses
  `lastMessageText()`, and `memory/score.ts` takes Jaccard over it. Generative Agents, Mem0, RMM and Nemori all build
  the query from more context than that. A better query (recent window, plus the drafted member, plus scene entities,
  plus open arcs) is a cheap win. Our own E0 run already showed that a re-rank pass beats raw bands
  (judge re-rank hit@4 0.905, `docs/plans/v2.8/21-smart-context-harvest.md`).
- **A per-member core block (MemGPT/Letta "core memory").** Each member would get a small, bounded, rarely changing
  block. It would be built only from rows that member may see, and updated by delta ops (ACE), never by a full
  rewrite. It fits our per-member private block and our per-member RAM prompt cache, because it changes rarely.
- **Reflection by accumulated importance, not only by cadence (Generative Agents, Nemori).** Trigger a scene
  summary or a "what changed" pass when the summed importance of new rows passes a threshold. The field's other
  trigger is a predict-calibrate miss. Today the trigger is a fixed cadence or a scene break.
- **One-hop link expansion (A-MEM, Zep, Cognee) without A-MEM's in-place rewriting.** When a row is selected, give a
  small bonus to rows tied to it by an explicit link: the same arc, the same promise, a supersede chain, or the same
  ledger entity. Rewriting older rows on a new write would break rollback ≡ replay and drifts in practice, so it is
  rejected.
- **What we keep.** Per-member privacy and held secrets, rollback ≡ replay, provenance on every derived row, and
  established/locked facts are all absent from every system surveyed. None of the proposals below weakens them.

## 2. Survey

### 2.1 Generative Agents (Park et al., 2023)
- Mechanism: an append-only **memory stream** of observations in natural language. Retrieval scores each row by
  **recency + importance + relevance**:
  - recency is an exponential decay since the row was last *accessed* (factor 0.995 per game hour);
  - importance is a 1-10 score the LLM gives when the row is written;
  - relevance is embedding cosine against a query.
  Each term is min-max normalised to [0,1] before the weighted sum (equal weights in the paper).
- **Reflection:** when the summed importance of recent events passes a threshold (150 in the paper), the agent does
  three things. It asks itself "the 3 most salient high-level questions" about its recent 100 memories. It retrieves
  memories for each question. It writes insights that cite the rows they came from. Insights go back into the stream,
  so a reflection can build on earlier reflections, which forms a tree.
- Evidence: in the authors' ablation, the full architecture was rated most believable, and removing reflection or
  planning hurt. [arXiv 2304.03442](https://arxiv.org/abs/2304.03442)
- Failure modes: insights can be hallucinated or overgeneralised. Retrieval-time recency rewards whatever was
  retrieved before (rich get richer). Every observation costs an LLM importance call.

### 2.2 MemGPT / Letta
- Mechanism: an OS analogy.
  - **Main context:** the system prompt plus editable **core memory blocks** (persona, human), each with a size limit
    and a label.
  - **Recall storage:** the full message history, searchable.
  - **Archival storage:** a vector store.
  The agent pages content in and out with function calls (`core_memory_append/replace`, `archival_memory_search`,
  `conversation_search`). A memory-pressure warning makes it summarise and flush.
  [arXiv 2310.08560](https://arxiv.org/abs/2310.08560), [memory blocks](https://www.letta.com/blog/memory-blocks)
- **Sleep-time compute (2025):** a second agent shares the memory blocks and rewrites them asynchronously between
  turns, turning raw context into "learned context". The paper reports about 5x less test-time compute at equal
  accuracy on stateful math benchmarks, and up to 13-18% accuracy gains.
  [arXiv 2504.13171](https://arxiv.org/abs/2504.13171), [Letta blog](https://letta.com/blog/sleep-time-compute),
  [docs](https://docs.letta.com/guides/agents/architectures/sleeptime/index.md)
- A useful counterpoint, from Letta's own LoCoMo test: an agent given only file tools over the raw transcript (grep,
  search, open) scored 74.0%. That beats Mem0's self-reported 68.5%. Retrieving verbatim text with a good query is a
  strong baseline. [Letta: is a filesystem all you need?](https://www.letta.com/blog/benchmarking-ai-agent-memory)
- Failure modes: self-editing depends on reliable tool calls by the main model. Blocks drift or bloat under repeated
  self-edits. Paging adds latency on the hot path.

### 2.3 Mem0 (Chhikara et al., 2025)
- Mechanism: two phases.
  1. Extraction takes the new exchange plus a rolling summary and recent messages, and produces candidate facts.
  2. Update: for each candidate, retrieve the top-k most similar stored memories. An LLM tool call then picks
     **ADD** (nothing equivalent stored), **UPDATE** (augment an existing row), **DELETE** (an existing row is
     contradicted) or **NOOP**.
  A graph variant (Mem0g) adds entity/relation triples.
  [arXiv 2504.19413](https://arxiv.org/abs/2504.19413), [explainer](https://terencecho.github.io/research-explained/mem0/)
- Evidence: the paper reports about 67% LLM-judge accuracy on LoCoMo (OpenAI memory: 53%), with roughly 90% lower p95
  latency and token cost than full context. Later third-party runs report lower (about 61%), and the cost claim covers
  retrieval only, not extraction. [review](https://www.themoonlight.io/review/mem0-building-production-ready-ai-agents-with-scalable-long-term-memory)
- Failure modes: lossy fact selection, weak on multi-evidence and implicit questions, and DELETE+ADD where UPDATE was
  right (see Memory-R1).

### 2.4 Memory-R1 (Yan et al., ACL 2026)
- Takes Mem0's four operations and trains the memory manager and an answer agent with RL (PPO/GRPO) from 152 QA
  pairs. Its motivating case: a user mentions a second dog, and a vanilla manager treats this as a contradiction and
  deletes the first. The trained one emits a single UPDATE ("adopted two dogs"). On a LLaMA-3.1-8B backbone it reports
  LoCoMo F1 30.4 -> 45.0. [arXiv 2508.19828](https://arxiv.org/abs/2508.19828),
  [ACL](https://aclanthology.org/2026.acl-long.583.pdf)
- Lesson for us, even without RL: **merge is a first-class operation**, and "same topic, new value" is not always
  supersession.

### 2.5 A-MEM (Xu et al., NeurIPS 2025)
- Mechanism: Zettelkasten notes. Each new memory becomes a note with LLM-written keywords, tags and a context
  description. The writer links it to the top-k similar notes the LLM judges related. **Memory evolution**: adding a
  note may make the LLM rewrite the context and tags of the linked older notes. Retrieval follows the links.
  [arXiv 2502.12110](https://arxiv.org/abs/2502.12110), [code](https://github.com/agiresearch/A-mem)
- Evidence: the authors report large multi-hop gains on LoCoMo over MemGPT and Mem0-style baselines.
- Failure modes: several LLM calls per write. Evolution mutates history in place, with no provenance; errors spread
  through the links and cannot be undone.

### 2.6 MemoryOS (BAI-LAB, 2025)
- Three tiers:
  - short-term: a FIFO of dialogue pages;
  - mid-term: segments grouped by topic;
  - long-term: persona, user traits and an agent knowledge base.
  A mid-term segment's **heat** combines how often it was retrieved, how long the exchange was, and an exponentially
  decayed recency. A segment above the heat threshold is promoted into long-term persona updates, and the coldest
  segments are evicted. The paper reports an average +49% F1 on LoCoMo over its baselines (GPT-4o-mini).
  [arXiv 2506.06326](https://arxiv.org/abs/2506.06326), [code](https://github.com/BAI-LAB/MemoryOS)
- Failure modes: heat counts retrieval, so retrieval feeds back into heat. The thresholds are inconsistent even across
  the repo's own configs.

### 2.7 MemOS (2025)
- A "memory operating system" with the **MemCube** unit: content plus metadata (provenance, version, access policy,
  lifecycle). It schedules memory between plaintext, activation (KV cache) and parameter forms, and migrates hot
  plaintext into cached activations. [arXiv 2507.03724](https://arxiv.org/abs/2507.03724)
- Relevance: mostly framing. The useful parts are versioned units with provenance (which we have) and the idea of
  turning hot, stable text into reusable KV (our per-member RAM cache is a simple form of this).

### 2.8 LangMem (LangChain)
- Semantic, episodic and procedural memory, kept in a key-value store with namespaces.
  - A **memory manager** extracts and consolidates in the background after a conversation ("subconscious"), and
    hot-path tools exist too.
  - A prompt optimiser learns procedural rules (instructions) from feedback.
- [docs](https://langchain-ai.github.io/langmem/), [notes](https://rywalker.com/research/langmem)
- Relevance: background consolidation off the hot path and namespaces per scope (user/agent). We already run off-path.

### 2.9 Cognee
- An ECL pipeline: `cognify` turns documents and chats into a knowledge graph of entities, relations and chunks, with
  embeddings. `memify` adds a later enrichment pass that derives rules and connections from the existing graph.
  Search combines graph traversal and vector search. [docs](https://docs.cognee.ai/),
  [comparison](https://keywordsai.co/market-map/compare/cognee-vs-langmem)
- Relevance: graph-plus-vector retrieval. Heavy infrastructure. The idea worth taking is entity-anchored expansion,
  not the graph store.

### 2.10 Zep / Graphiti (2025)
- A temporal knowledge graph whose edges carry **bi-temporal validity** (`valid_at`/`invalid_at` in story/world time,
  plus creation time). A contradicted fact is invalidated, never deleted. The paper reports DMR 94.8% vs MemGPT 93.4%,
  LongMemEval up to +18.5% with about 90% lower latency, and the largest gains on knowledge-update and temporal
  questions. [arXiv 2501.13956](https://arxiv.org/abs/2501.13956)
- Relevance: we already version instead of overwriting (ledger `supersedes`, memory `supersededBy`). Validity in
  *story time* (we now have `story_time`, `engine/life/clock.ts`) would answer "what was true on day 3".

### 2.11 Reflexion and lesson stores
- Reflexion: after a failed attempt, the agent writes a verbal self-critique into an episodic buffer, and later
  attempts read it. [arXiv 2303.11366](https://arxiv.org/abs/2303.11366)
- ExpeL and ReasoningBank generalise this into reusable lessons. ACE (ICLR 2026) keeps an itemised **playbook** updated
  by small **delta entries** merged with non-LLM logic. It names **context collapse**: an iterative rewrite shrank an
  18k-token context to 122 tokens, and accuracy fell below the unadapted baseline.
  [ACE arXiv 2510.04618](https://arxiv.org/abs/2510.04618)
- Relevance: the delta-not-rewrite rule applies to any block we regenerate. Lesson stores apply to our side passes
  (read prompt failures), not to story memory.

### 2.12 Other 2025-2026 successors
- **RMM** (ACL 2025): *prospective* reflection summarises at utterance, turn and session granularity. *Retrospective*
  reflection re-weights retrieval online, using which retrieved rows the answer actually cited. It reports more than
  10% over no memory management on LongMemEval. [arXiv 2503.08026](https://arxiv.org/abs/2503.08026)
- **SeCom** (ICLR 2025): memory units are topic segments, neither turns nor whole sessions. Units are compressed and
  denoised (LLMLingua-2) before indexing. Segment granularity beat turn and session granularity on LoCoMo.
  [MSR](https://www.microsoft.com/en-us/research/publication/secom-on-memory-construction-and-retrieval-for-personalized-conversational-agents/)
- **Nemori** (2025): splits the stream into episodes by event segmentation. Its **predict-calibrate** step predicts
  what an episode should contain from existing semantic memory, then stores only the gap between prediction and
  reality as new semantic knowledge. It reports SOTA on LoCoMo and LongMemEval, with the gap widest on long contexts.
  [arXiv 2508.03341](https://arxiv.org/abs/2508.03341)
- **LightMem** (2025): a sensory pre-filter and topic segmentation, then soft writes with timestamps at inference
  time, then a **sleep-time** offline pass that de-duplicates, resolves conflicts and abstracts. Updates run in
  parallel because each update target is independent. It reports up to 117x fewer tokens and 159x fewer API calls,
  with accuracy gains on LongMemEval. [arXiv 2510.18866](https://arxiv.org/abs/2510.18866)
- **Roleplay-specific, 2025-2026:**
  - DREAM: an event-aware memory graph, reporting +14.5% storyline consistency on CoSER;
    [arXiv 2608.05170](https://arxiv.org/pdf/2608.05170)
  - MRBench: a persona-knowledge memory benchmark; [ACL Findings 2026](https://aclanthology.org/2026.findings-acl.1175.pdf)
  - LIFESTATE-BENCH: episodic memory and relationship tracking in roleplay. [arXiv 2503.23514](https://www.arxiv.org/pdf/2503.23514)

  None of the three handles multi-character privacy.

## 3. Mapping to us

| Technique | What we have | Real gap | Fits constraints? |
|---|---|---|---|
| Mem0 ADD/UPDATE/DELETE/NOOP with neighbours | Post-hoc consolidation: Jaccard/vector bands 0.82/0.55 + state-change regex (`memory/consolidate.ts`). Ledger versions on value change (`memory/ledger.ts` `applyLedgerSignals`). Arcs dedup by overlap (`memory/arcs.ts`). The read sees top-8 facts by importance (`extraction/canonLite.ts`). | The writer never sees the rows it duplicates or updates. A regex decides supersession. "Same topic, new value, no marker" goes to `uncertain`, which only flags `contradicted` (`memory/supersede.ts` `markContradicted`). | Yes. Same read call, about +300-600 input tokens. Ops become versions (supersede chain), so rollback is unchanged. |
| LLM supersession verdict | `parseSupersessionVerdicts` exists, unwired. | Uncertain pairs stay uncertain forever, minus 2 points of score. | Yes, as an idle-time pass applied at a boundary. |
| GA recency/importance/relevance, normalised | Linear sum of 11 terms (`memory/score.ts`): importance 1-3, recency by boundary age, Jaccard to the last message, entity overlap, arc overlap, plus 100 for established rows. | Terms are not normalised (Jaccard is usually below 0.1 while durability is 1). The query is one message. Recency counts from creation, never from re-mention. Vectors are used only for dedup and recall (`memory/archiveRecall.ts` `semantic`). | Yes. Pure code, deterministic. Measurable offline with the E0 harness (`memory/e0Ranking.ts`). |
| Re-rank (E0 winner) | E0 arm (d), a judge Choice re-rank, won offline (hit@4 0.905). P4 (embeddings for live scoring) is parked. | Never wired into live injection. | Partly. A judge call per generation is too much. Once per boundary, shared by every member and filtered per member afterwards, is affordable. |
| GA reflection by importance sum | Scene summaries (`memory/sceneSummary.ts`, `sceneDetect.ts`), chapter records with cited CONSEQUENCES (`memory/chapterRecord.ts`), canon rebuilt from rows (`memory/canon.ts`). | Triggered by scene breaks, cadence or chapter seals, not by how much happened. No per-member "what I now believe" insight. | Yes for the trigger (code only). A per-member insight is a new side pass, and its cost needs a floor. |
| Nemori predict-calibrate | The read writes everything it sees in the window. Dedup happens afterwards. | Nothing tells the read "you already know X, write only what is new". | Mostly covered by the neighbour proposal (P1). |
| MemGPT core blocks / sleep-time | Per-member private block (epistemic, ledger lines, life lines, promises), rebuilt each draft. | No bounded, slowly changing per-member summary of "who I am now, what I believe about the others". | Yes. Built from rows that member may see, so privacy holds by construction. Stable text suits the per-member RAM cache. Placement needs a blind rating (architecture §Local text backend). |
| A-MEM links | Entities on rows, `arcRelevance`, promise ids, supersede chains, ledger entity keys. | Selection never follows a link. A selected row does not pull in the row that explains it. | Yes. Pure code. Links are recorded at write time, so they replay. |
| A-MEM evolution (rewrite old notes) | Never. Rows are versioned; derived artifacts record inputs and removals (`memory/derived.ts`). | n/a | **No**. It breaks rollback ≡ replay and provenance. |
| MemoryOS heat | Session rows capped at 12 per injection. Facts are typed by the read (`memory/parse.ts` `TIER_FOR_ENTRY_TYPE`). `recallCount` counts read re-confirmations (`consolidate.ts:152`). | A session detail the story keeps returning to never becomes durable unless the read re-types it. | Yes, if heat counts *transcript re-mentions* (evidence) and never injections (feedback loop). |
| Zep bi-temporal | Versions plus `supersededBy`. `story_time` clock exists (v2.8 50). | Rows carry boundary and message ids, not story time. | Later. Low value until a "when" question shows up in the floors. |
| ACE delta, not rewrite | Canon is regenerated from rows, never from the previous canon. The chapter fold is bounded and cited. | Already immune to collapse by construction. A future core block must follow the same rule. | Keep the rule. |
| Letta filesystem / verbatim recall | `memory/recall/*` with eligibility, attribution and VR floors. Runtime verbatim recall is deferred (v3.0 05). | Deferred, not missing. | Their result supports un-deferring it once the witness filter passes. |
| Reflexion lessons | The chapter prompt takes `failures` (`buildChapterRecordPrompt`). The read has reask paths. | Lessons for prompts would be tuning, which the floors rule governs. | Offline only. |

## 4. Proposals, ranked

### P1. Neighbour-aware shared read: ADD / SAME / UPDATE in the read itself (M)
- **Change.**
  - Before the read, select per window up to K (8-12) live memory rows and ledger rows. Pick them by entity overlap
    with the window (roster names and ledger entities named in the window), then by score. Render each as
    `[m3] text`.
  - Add one contract rule: a MEMORY/FACT line may carry `same=m3` (no new row; confirm it) or `update=m3` (a new
    version superseding m3).
  - Parse in `memory/parse.ts`. Apply in `extractionCoordinator.applyAudit`, routing to the existing paths:
    - `same` is the consolidate "confirmed" branch (bumps `recallCount` and `confirmedAt`);
    - `update` writes a new row with `supersededBy` on the old one, as consolidation does for markers;
    - no tag is ADD, still passed through today's heuristic consolidation as a safety net.
  - No DELETE: deletion stays author-only. The read can only supersede.
- **Modules:** `extraction/sharedRead.ts` (a new scope section beside canon), `extraction/contract.ts`,
  `memory/parse.ts`, `memory/consolidate.ts` (honours explicit tags before bands).
- **Cost:** 0 extra calls, about +300-600 input tokens on the read, no hot-path latency. The neighbour list sits late
  in the read prompt (the read is already per window, so the cache is unaffected).
- **Invariant risks:**
  - The read sees rows the transcript already justifies, so privacy is unchanged: the read is not a member prompt and
    already sees the full window. Even so, render through `restingEntries` minus held-secret rows. A secret row must
    not get a `same=` that strips its `hiddenFrom`; the tag only confirms or versions.
  - Rollback: an update is a version keyed to the read's message, so rollback drops it like any read row.
  - Ids must be per-read aliases (`m1..mK`), never stored ids, so the prompt stays byte-stable for replay goldens.
- **Measure:**
  - so-live-suite `rejected`, `facts` and `deltas` tiers (no tier may drop);
  - recorded tests `duplicatesT551.recorded.test.ts`, `injectDedup*.recorded.test.ts`;
  - a new **update-precision floor**: a small fixture set of "two dogs" cases (merge, not supersede) and true
    supersessions, scored offline;
  - the blind Sol rating on format (the facts candidate A failed format at -0.267, so predeclare format ≥ -0.2).
- Risk to watch: the Artemis contract-following record (plan 25) shows that extra format options get ignored or
  hybridised. Keep it to one optional key and accept untagged lines unchanged.

### P2. Better retrieval query and normalised scoring for injection (S-M)
- **Change.**
  - (a) Build the score query from the last 3-4 messages plus the drafted member's name plus scene location and present
    cast, not `lastMessageText()` alone (`runtime/scoreContext.ts`).
  - (b) Min-max normalise each term across the candidate set before weighting, as Generative Agents does, so Jaccard
    is no longer dwarfed by constant terms.
  - (c) Add `lastEvidencedAt`: the latest boundary whose window named any of the row's entities or triggers. It is
    derived from the transcript at read time, not stored, so replay holds. Recency uses `max(createdAt,
    lastEvidencedAt)`. This is GA's "last access" without the injection feedback loop.
  - (d) Optional, later: the E0 arm (d) re-rank, once per boundary over the union pool, cached for every member's
    draft, then filtered per member.
- **Modules:** `memory/score.ts`, `runtime/scoreContext.ts`, `memory/inject.ts` `selectTierEntries`.
- **Cost:** (a)-(c) pure code, microseconds. (d) is one judge call per boundary (TypeSafe, about 250-650 ms, off the
  hot path if it runs at boundary commit).
- **Invariant risks:** low. Code only and deterministic. Injected text changes, which the payload goldens will show
  (declared hunks). The prefix is unaffected, because the memory tiers already sit at depth 2-4.
- **Measure:**
  - reuse the E0 offline harness with a new local arm (normalised + window query) against arm (c) and the frozen 84
    questions: hit@4 and MRR, floors predeclared;
  - then payload goldens;
  - then one blind Sol rating of replies for continuity.

### P3. Idle-time supersession verdicts for uncertain pairs (S)
- **Change.**
  - Wire `parseSupersessionVerdicts`. A boundary-work entry queues the `uncertain` pairs from consolidation.
  - A side pass on the memory route runs when the scheduler is idle: the player is typing, or there is no generation
    in flight (`extraction/yieldGate.ts`). It asks one batched question of up to 8 pairs, answered `SUPERSEDE n` or
    `INDEPENDENT n`.
  - Verdicts apply at the next boundary: supersede sets `supersededBy`, independent clears `contradicted`
    (`clearContradicted`).
  - A locked or established side always goes to the conflict queue instead, as today.
- **Cost:** about one short call per few boundaries (only when pairs exist), roughly 400 tokens in and 40 out, on the
  local model in an idle window, or on the decider if calibrated.
- **Invariant risks:**
  - The run needs a RunToken.
  - The verdict is a derived artifact: record the pair ids as inputs (`memory/derived.ts`), so rollback of either
    row drops the verdict.
  - No privacy surface (rows never leave the store).
- **Measure:**
  - recorded fixtures `contradictions.fixture.test.ts` and `conflictsAgree.recorded.test.ts`;
  - a new offline floor: verdict accuracy on labelled pairs (≥ 0.8);
  - count of rows stuck `contradicted` per 100 boundaries in a long journey (should fall).

### P4. Per-member core block, delta-updated (M-L)
- **Change.**
  - Each roster member gets a bounded block (at most 120 tokens, at most 6 items): stance toward each present member,
    what they want now, and what they believe happened that matters. Each item cites row ids, in the same style as the
    chapter CONSEQUENCES.
  - Built only from the member's allowed view: their private block sources plus the resting-filtered shared tiers. A
    held secret is excluded by construction (`withoutSecretLines`, `secretAudience`).
  - Updated in sleep time, at a chapter seal or after N boundaries with new rows naming the member, by **delta ops**
    (keep / add / revise item i / drop item i), merged in code (ACE). The previous block plus the deltas give the next
    block, and every version is stored by boundary, so rollback restores the earlier version.
  - Injected inside that member's private block.
- **Why:**
  - Group RP needs each character to carry their *own* consolidated view. Today the per-member signal is scattered
    across epistemic lines, life qualities and promises.
  - A stable text is cache-friendly for the per-member RAM cache, if it is ever placed earlier. Placement change only
    after a blind rating, per the prompt-layout rule.
- **Cost:** one side pass per member per update, about 800 tokens in and 150 out. With 4 members updating every
  chapter or every ~10 boundaries, that is well under one call per turn on average.
- **Invariant risks:** the largest of the set. It is a new shared-tier-like surface, so it needs the secret review
  tests (`runtime/secret*.review.test.ts`), a derived record with inputs, and the rollback property test.
- **Measure:**
  - blind Sol rating on character consistency, plus a predeclared floor;
  - a privacy fixture: a kept-out member's block holds zero secret lines;
  - payload goldens.
- Overlaps character life (`engine/life/`) and inner voice. Design it as a *view over* them, not a new truth store.

### P5. Importance-accumulation trigger and one-hop link bonus (S)
- **Change.**
  - (a) Scene-summary and short-term compaction may also trigger when the summed `importance-1` of rows created since
    the last summary passes a threshold, as in Generative Agents. Cadence and scene break remain.
  - (b) In `selectTierEntries`, after the first pick, give a bonus (about 0.5 of the normalised max) to rows that
    share an arc id, a promise id or a ledger entity with an already selected row. This is A-MEM-style expansion,
    applied once and greedily.
- **Cost:** code only. (a) can raise summary calls in busy stretches, so cap it at one extra per N boundaries.
- **Invariant risks:** low. It is deterministic, and links come from recorded fields.
- **Measure:**
  - (a) journey count of summaries per 100 boundaries, plus the existing `compactionGate` tests;
  - (b) the E0-style offline arm.

### P6. Heat promotion of session details (S, after P2)
- **Change.** A `session_details` row whose entities were re-evidenced in at least 3 distinct windows (P2c's
  `lastEvidencedAt` history) becomes a facts-tier candidate. It is *proposed* to the next read via P1's neighbour list
  ("still true?" → `same=`), never promoted by code alone.
- **Cost:** none beyond P1. **Measure:** the live-suite facts tier, which plan 25 found was losing 6 positives to the
  session tier.

## 5. What we do that the field does not, and rejected ideas

**Keep. None of the surveyed systems has these:**
- **Per-member epistemic privacy and held secrets** across every shared tier (`memory/heldSecrets.ts`,
  `MemoryInjector.restingEntries`). Every system above assumes one user and one agent. Multi-agent variants share all
  memory.
- **Rollback ≡ replay.** Swipe, edit and delete undo memory exactly (`memory/reverse.ts`,
  `rollbackReplay.property.test.ts`). The surveyed systems append or rewrite, and none can undo a turn.
- **Provenance on every row and derived artifact** (`memory/provenance.ts`, `derived.ts`). This is MemOS's MemCube
  idea, already built.
- **Established/locked truth beats the extractor** (`isEstablished`, the held-conflict queue). Mem0 and A-MEM let the
  LLM overwrite anything.
- **Exact-quote promises, witness spans, seeded rumor spread.** Typed, code-checked memory kinds that the field
  approximates with free text.
- **A fate for every row** (`MemoryFate`: why a row was or was not injected). The field has almost no explainability.
- **Canon rebuilt from rows rather than from the previous canon.** This is immune to ACE's context collapse.
- **Predeclared floors and offline replay of ranking arms** (E0). The field's benchmark numbers are vendor
  self-reports and hard to compare (see the Letta/Mem0 dispute).

**Rejected:**
- **Self-editing memory by the play model through tool calls (MemGPT style).**
  - The play model is Artemis on Text Completion, tuned for RP; tool reliability is unproven.
  - It would add hot-path latency and let the model that speaks as a character write shared truth.
  - Off-path passes already fill this role.
- **A-MEM memory evolution (rewriting old rows on a new write).** It breaks rollback ≡ replay and provenance, and
  errors spread through the links.
- **Retrieval-count reinforcement (GA last-access recency, MemoryOS heat from retrieval).** Injection would feed back
  into its own ranking, and it is order-dependent across members. Use transcript evidence instead (P2c, P6).
- **Per-row LLM importance scoring at write time (GA 1-10).** The read already emits importance 1-3. A separate call
  per row is cost with no evidence of gain.
- **RL-trained memory manager (Memory-R1).** No training infrastructure, and no fine-tuning of Artemis. Its lesson
  (merge is an operation) is taken in P1.
- **Graph databases (Cognee, Zep/Graphiti, Mem0g).** Heavy dependencies inside an ST extension with a bundle budget.
  The entity and link structure we need already exists on our rows (P5b).
- **A full Nemori episode pipeline or SeCom compression (LLMLingua-2).** We already segment by scene and window.
  Compression models mean another model on the GPU. P1 covers predict-calibrate's useful core.
- **Reflexion and ACE playbooks for the read prompt at runtime.** That is prompt tuning, which our floors rule keeps
  offline and owner-decided.

## Unresolved questions
- P1: should the neighbour list include ledger rows (entity|field) in the same section, or only memory rows? Ledger
  already versions by key, so maybe only memory.
- P2d / P3: is the decider model a candidate for supersession verdicts? It is calibrated per use, and this would be a
  new use needing its own calibration row.
- P4: where does the core block sit? Inside the late private block (safe), or early in the per-member prefix (cache
  win, but the layout needs a blind rating).

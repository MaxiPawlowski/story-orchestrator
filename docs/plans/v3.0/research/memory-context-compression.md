# Memory research: context compression for a 32K local model (2026-10-31)

Angle: how to fit a long story into Artemis 31B (Gemma 4, 32K, thinking on) without losing what matters. Research only.
Builds on, and does not repeat, `research/context-chunking-web.md` (KV reuse, checkpoints, KV eviction, LLMLingua-2
first pass), `research/fable-context-slicing.md` (measured prompt anatomy, boundary b, read reorder), plan 13 (prefix
gate) and plan 40 (chunked compaction, built, default off). Labels: **[prod]** used in production, **[proto]** research
code, **[idea]** no implementation found. *est.* = my estimate.

## 1. Summary

- **Our rolling short-term summary is the textbook "monolithic rewrite" that ACE shows collapsing over time.**
  `runShortTermCompaction` (`src/runtime/coordinators/extractionCoordinator.ts:431`) replaces one prose blob with
  `summarize(previous + window)`. The gate (`src/memory/compactionGate.ts`) refuses empty, too long and over budget, but
  nothing refuses *detail loss*. A deterministic retention guard costs no model call (proposal 1).
- **Our recall is literal.** Archive recall fires on exact entity mentions (`src/memory/archiveRecall.ts`), and scoring
  matches the turn text by words and entities (`src/memory/score.ts`). NoLiMa shows models, and our matchers, fail when
  the cue shares no words with the memory. LongMemEval gets +9.4 % recall@k from adding extracted keys to each stored
  item at write time. Our shared read already runs, so it can emit those keys for free (proposal 2).
- **A3 compaction counts tokens as chars/4** (`src/runtime/compactHistory.ts` → `estimateTokens`), while ST's fit loop
  counts real tokens. If the estimate runs low, ST still trims one message per turn after our cut, and the cache gain plan
  40 measured goes away without anyone seeing it. This is a cheap check before A3-R (proposal 3).
- **A CPU cross-encoder reranker is the missing middle stage** between our heuristic score and the remote or uncalibrated
  judge. llama.cpp serves rerankers (`--reranking`, `/v1/rerank`) on CPU, which leaves the 3090 free. Plug it into the
  existing E0 arm harness as a new arm (proposal 4).
- **Placement under SWA and thinking is an open, testable question.** Every depth-4 block (facts, scene history,
  epistemic, ledger, guidance, story so far) sits about 1.1K tokens before the generation point (Fable §2). Thinking
  then adds hundreds more tokens before the visible reply. All of that lies outside the 1024-token window of Gemma's 50
  local layers. A recall probe would tell us whether depth matters before anyone proposes moving blocks, which is
  rating-gated (proposal 5).
- **Keep:** canon regenerated from structured sources rather than from the previous canon, the compaction ceiling tied to
  read coverage, refusal gates on summaries, and derived records with inputs and removed rows. The field mostly lacks all
  of these.
- **Rejected:** LLMLingua-family and gist-token compression of play prompts, and HyDE on the critical path (see §5).

## 2. Survey

### 2.1 Recursive / rolling summarization and its drift
- **Recursive summarization for dialogue memory**: Wang et al., [arXiv 2308.15022](https://arxiv.org/abs/2308.15022).
  - Mechanism: summarize, then repeatedly update with summary(previous memory + new dialogue).
  - Evidence: gains on Multi-Session Chat, and a hand check of 100 samples found "a few" fact errors.
  - Failure mode, admitted in the paper: error propagation, including wrong relationships and causal links. Drift
    across many rounds was never measured.
- **ACE, Agentic Context Engineering**: Zhang et al., [arXiv 2510.04618](https://arxiv.org/abs/2510.04618).
  - Names two failure modes. *Brevity bias* is the rewriter favouring short, generic text. *Context collapse* is
    monolithic LLM rewrites shrinking the context into less informative summaries; in their worked example, accuracy
    fell below the no-context baseline after a collapse step.
  - Fix: store the context as itemized bullets with ids. The model proposes small *delta* items, and non-LLM code
    merges them (grow-and-refine, with dedup by embedding).
  - Evidence: AppWorld and finance benchmarks [proto, code released].
  - Caveat: it needs a good reflector.
- **MemGPT / Letta** ([arXiv 2310.08560](https://arxiv.org/abs/2310.08560)) [prod].
  - Uses a recursive summary on eviction plus editable core memory blocks.
  - The same drift risk applies to the recursive part; the editable blocks are the structured counterpart.
- Roleplay-specific work (BOOKMARKS, MOOM, RoleMemo) is already in `context-chunking-web.md` §3: recurrent summaries lose
  details and come out generic.

### 2.2 Structured state vs prose, and consolidated restatement
- **LLMs Get Lost in Multi-Turn Conversation**: Laban et al., [arXiv 2505.06120](https://arxiv.org/abs/2505.06120).
  - The same task split across turns loses 39 % on average. Putting all shards back into one prompt (*concat*) recovers
    to about 95 % of single-turn performance.
  - A *recap* turn at the end recovers part of the loss; the paper calls recaps insufficient alone.
  - Lesson for us: a model uses state it is handed consolidated and late far better than state scattered through
    history.
- **Prompt format matters, with no universal winner**: He et al., [arXiv 2411.10541](https://arxiv.org/abs/2411.10541).
  - Up to 40 % swing on GPT-3.5 between plain text, Markdown, JSON and YAML. Larger models are more robust.
  - Implication: a 31B local model is in the sensitive range, so format is a rating question, not a style choice.
- Community trackers (ST Tracker, qvink, Memory Books) are already surveyed in
  `.claude/sillytavern-docs/community/prompting-memory-prior-art.md` §8.

### 2.3 Prompt compression
- **LongLLMLingua**: [arXiv 2310.06839](https://arxiv.org/abs/2310.06839) [prod library].
  - Question-conditioned perplexity drops weak documents, then contrastive perplexity drops weak tokens. It also
    *reorders* documents by relevance against position bias.
  - Reports +21.4 % on NQ multi-document QA at a quarter of the tokens.
  - Needs a small LM pass per query, and the output changes with every query.
- **Provence**: NAVER, [arXiv 2501.16214](https://arxiv.org/abs/2501.16214), ICLR 2025, model
  [naver/provence-reranker-debertav3-v1](https://huggingface.co/blog/nadiinchi/provence) [proto, weights released].
  - A cross-encoder reranker fine-tuned to also label each sentence keep or drop. Pruning comes almost free inside the
    reranking step.
  - The multilingual successor XProvence ([arXiv 2601.18886](https://arxiv.org/html/2601.18886v1)) uses bge-m3.
- Gist tokens and AutoCompressor need fine-tuning of the target model; already noted in `context-chunking-web.md`.

### 2.4 Retrieval: write time vs read time, query rewriting
- **LongMemEval**: Wu et al., [arXiv 2410.10813](https://arxiv.org/abs/2410.10813), ICLR 2025.
  - Store memory at round granularity, not session granularity.
  - *Fact-augmented key expansion*: index each item under extracted facts as well as its text, for +9.4 % recall@k and
    +5.4 % QA on average.
  - *Time-aware query expansion*: an LLM extracts a time range, then the search is filtered to it, for +6.8 to 11.3 %
    on temporal questions with a strong expander.
  - These are the best-measured write-time and read-time levers I found.
- **HyDE**: [arXiv 2212.10496](https://arxiv.org/abs/2212.10496).
  - The model writes a hypothetical answer, and its embedding becomes the query. Strong zero-shot gains.
  - Costs one generation per query.
- **MemoRAG** ([arXiv 2409.05591](https://arxiv.org/abs/2409.05591)): a light "memory model" emits draft clues that
  drive retrieval. A HyDE variant [proto].
- **Mem0** ([arXiv 2504.19413](https://arxiv.org/abs/2504.19413)) [prod]: ADD / UPDATE / DELETE / NOOP against retrieved
  neighbours at write time. We already do the equivalent (`supersede.ts`, `conflicts.ts`, `consolidate.ts`).

### 2.5 Small rerankers on CPU
- llama.cpp server has a rerank endpoint: `--reranking` with `--pooling rank`, served on `/v1/rerank`
  ([guide](https://www.simplified.guide/llama-cpp/server-call-rerank-api)) [prod].
- Candidate models:
  - bge-reranker-v2-m3, 568M, GGUF Q8_0 available ([HF](https://huggingface.co/fanyixiong/bge-reranker-v2-m3-Q8_0-GGUF)).
  - MiniLM-L6 cross-encoders, 22M: very fast, English.
  - Qwen3-Reranker-0.6B: llama.cpp support unverified.
- EmbeddingGemma 300M ([HF blog](https://huggingface.co/blog/embeddinggemma)) is the strongest open embedder under 500M
  on multilingual MTEB, with Matryoshka dimensions and under 200 MB quantized. It is a candidate if ST's vector source
  is ever replaced.
- I found no published CPU latency for these models on a desktop chip. That would have to be measured.

### 2.6 Long-context degradation and placement
- **Lost in the middle** ([arXiv 2307.03172](https://arxiv.org/abs/2307.03172)): a U-shaped curve, so content in the
  middle of the context is used worst.
- **NoLiMa** ([arXiv 2502.05167](https://arxiv.org/abs/2502.05167), ICML 2025): with no literal overlap between question
  and needle, 11 of 13 models fall below half their short-context score at 32K. The drop starts at 2 to 8K, and CoT does
  not fix it.
- **Context Rot**, Chroma ([report](https://research.trychroma.com/context-rot)): all 18 models degraded with input
  length. *Topically similar distractors* hurt most, which describes near-duplicate memories exactly.
- **Context length alone hurts**, Hsieh et al. 2025 ([coverage](https://the-decoder.com/yet-another-study-finds-that-overloading-llms-with-information-leads-to-worse-results/)):
  accuracy degrades even with perfect retrieval and masked filler.
- **Gemma 3 report** ([arXiv 2503.19786](https://arxiv.org/abs/2503.19786)):
  - 5 local layers per global layer, with a 1024-token local window. Global layers use RoPE base 1M, local layers 10K.
  - Artemis (Gemma 4) is 50 local + 10 global per our notes.
  - Local layers still carry far context forward through the residual stream, layer by layer, so "outside the window"
    is not the same as "invisible". Its effect on prompt-injected facts is unmeasured.

## 3. Mapping to us

| Technique | What we have | Real gap | Fits constraints? |
|---|---|---|---|
| Recursive summary | Rolling short-term entry: `previous + 12 messages → replace` (`extractionCoordinator.ts:431-466`), bounded by chapter seals (`chapterFold.ts` sets `shortTermSummaryEnd`); scene summaries are map-reduce, depth ≤ 4 (`sceneSummary.ts`); canon is regenerated from arcs + facts + checkpoint, never from the old canon (`canon.ts`) | No retention check: a rewrite that drops a named person, object or promise passes the gate. The short-term entry stores `entities: []`, so scoring and recall cannot match it by entity | Yes: a code check, pure over inputs, so rollback ≡ replay holds |
| ACE itemized deltas | Facts, ledger, arcs and promises are already itemized and code-merged (supersede, consolidate, conflicts). Only the short-term and scene-summary tiers are prose rewrites | Short-term could be bullets with ids plus ADD/KEEP/DROP | Yes, but it changes a contract (re-run live-suite floors) |
| Consolidated late state (Laban) | Scene tracker and card overlay at depth 1, short term at depth 2 (`constants/injectionRegistry.ts`) | Already roughly the concat/recap shape. Nothing to add beyond the placement probe | — |
| Format (JSON vs prose) | Tiers render as labelled prose lines | Unrated. Low priority | Rating-gated |
| LongLLMLingua / Provence | None | Per-query compression changes text after b every turn: acceptable for the cache (it is after b), but it adds a CPU or GPU pass on the critical path and is unproven for voice | Partly; see §5 |
| Write-time keys (LongMemEval) | `entities` on rows from the read; the vector `semantic` set optional in recall | Keys are names only, not themes, objects or aliases. Recall needs a literal hit | Yes: the read already runs, so the cost is tokens only |
| Read-time query expansion / HyDE | Query = the turn text (`chapterKit.ts:153`), the checkpoint objective for canon facts (`canonView.ts:62`) | The query never includes open arcs or the speaker's goals; arcs exist only as a score weight | Expansion from state: yes (code). HyDE: no (GPU generation on the critical path) |
| Reranker | Heuristic `scoreEntry`; E0 harness arms a–e incl. judge Choice (`src/memory/e0Ranking.ts`); judge lore ranking (`src/judge/loreRanking.ts`) | No cheap learned stage. Judge uses are per-use calibrated and remote by default | CPU process, no GPU. Model download needs the owner's OK |
| Context rot / distractors | Near-duplicate filter at injection (`inject.ts` `nearDuplicateIds`, 0.5 / 0.4 + 0.7), diversity floor, per-tier budgets | Budgets are fixed, never tested for "less is better" | Rating-gated ablation |
| Placement | Depth table, checked for collisions | Unknown whether depth 4 is recalled worse than depth 2 under SWA plus thinking | Probe = GPU, no layout change |
| Compaction | A3 built: 75/50 % band, keep 12, ceiling = min(read coverage, short-term end), default off (`historyCompaction.ts`, plan 40) | Uses chars/4; ST's fit uses the real tokenizer | Yes |

## 4. Proposals (ranked)

### P1. Collapse guard for the rolling short-term summary (S)
- **Change:** extend `acceptCompaction` (`src/memory/compactionGate.ts`) with two pure checks.
  - **Retention:** the names and entities in `previous` (via `memory/entities.ts` / `nameFold`) must still appear in
    the new summary, or be covered by a live fact, ledger, arc or promise row, or have their last mention fall in the
    folded range of a sealed chapter. Otherwise refuse with reason `dropped-detail`, naming the count only.
  - **Shrink floor:** refuse a summary shorter than about 60 % of `previous` when the window is non-empty, a direct
    brevity-bias guard. The ratio is *est.* and must be predeclared before measuring.
  - Also fill the entry's `entities` from the union, so recall and scoring can find the short-term tier.
- **Cost:** 0 model calls. Refusals keep the previous entry, which is today's behaviour. One retry is already allowed
  (`CompactionAttempts`).
- **Invariants:** pure over `previous`, the window and store rows, all restored by rollback. No new text, so privacy is
  unchanged (the entry already passes the resting filter).
- **Measure:**
  - Replay recorded `shortTerm` synthesis outputs (lane payload captures, role `synthesis`): refusal rate and entities
    lost per step across successive compactions.
  - New jest recorded test with a floor: entity retention ≥ 0.9 over 5 chained compactions.
  - Live-suite `facts` tier unchanged.
- **Risk:** over-refusal leaves the summary stale. Watch the `compaction-refused` journal rate; a floor of ≤ 1 in 5 is
  *est.*

### P2. Write-time retrieval keys from the shared read, and state-expanded queries (M)
- **Write time:**
  - The read contract (`src/memory/contract.ts`, `extraction/parse`) lets each MEMORY/FACT line carry up to 3 short
    `keys` (aliases, objects, places, themes), stored on `MemoryEntry` beside `entities`. This is LongMemEval's
    fact-augmented keys, made without an extra call.
  - Archive recall (`recallCandidates`) and `scoreEntry.entityOverlap` match keys as well as entities.
- **Read time:** the query becomes the turn text plus the open arc titles (`openArcTexts`), the active checkpoint
  objective and the speaker's agenda line. This is code-only expansion, the cheap part of LongMemEval's time-aware
  expansion: we have `story_time` and could filter by day part when the turn names a time.
- **Cost:**
  - About 10–25 more output tokens per extracted row on the read *est.*, roughly +0.3–0.8 s decode per read at 30 tok/s
    *est.*, off-path.
  - 0 calls at generation.
- **Invariants:** keys live on the row, so `reverse.ts` / derived rollback covers them. Keys of a held-secret row are
  never rendered, and selection still runs through the resting filter. Test: a secret row keyed "dagger" is not
  recalled for a kept-out member when the turn says "dagger".
- **Measure:**
  - Recall fixture floors (`src/memory/recall/score.ts`: vr1 ≥ 0.7, vr2s leaks 0).
  - E0 `hitAt4` / MRR on the existing questions plus a new paraphrase set with no literal overlap (NoLiMa-style).
  - Live-suite `facts` / `rejected` tiers within 0.02 (the contract changed).
- **Risk:** the read output gets longer, so keep keys optional and cap them in the parser.

### P3. Make compaction count real tokens, and prove ST never trims after a cut (S)
- **Change:** `compactionEntries` should use the request token meter (`budget.meter.count`, already used by
  `sceneSummary.ts`), or calibrate chars/4 against the Gemma tokenizer on recorded chats (Fable's `extract.py` has the
  CPU tokenizer).
- **Check:** in the A3-R arms, assert that after a compaction ST's fit loop dropped 0 further messages until the next
  cut. Equivalently, `so-payload-golden prefix` per member shows no `above-boundary` pairs between cuts.
- **Cost:** none at runtime beyond the meter (cached).
- **Invariants:** still a pure function of the rows and the budget.
- **Measure:** offline over the plan 40 arms (CPU), and a model-lane prefix recording once A3 is on.
- **Why first-class:** without it, A3's measured prefix reuse (0.31 → 0.64 p50) can disappear in real 32K chats, and the
  only symptom is latency.

### P4. CPU cross-encoder as E0 arm "f", then as a recall/lore rerank stage (M, needs a download OK)
- **Change:**
  - A llama-server instance on CPU (`--reranking --pooling rank`, no GPU layers), registered in the tray and the
    controller's reserved ports.
  - Rerank the top ~20 candidates from `scoreEntry` / archive recall / lore selection against the player's line plus
    the P2 query expansion. Start the call at `MESSAGE_SENT` and await it in the interceptor (the `loreSelectTiming.ts`
    pattern).
  - Provence-style sentence pruning is a later option for long lore entries.
- **Cost:**
  - 0 GPU.
  - CPU latency for 20 × ~120-token pairs on a 568M model is unknown; my guess is 0.3–1.5 s *est.*, hidden partly by
    the prompt build. A 22M MiniLM costs under 50 ms *est.*, English only.
  - RAM 0.6–1.2 GB.
- **Invariants:**
  - The ranker is a reader, like the judge: it never writes.
  - Candidates are filtered before ranking, so a held secret never reaches it.
  - The rank is deterministic per input, so rollback ≡ replay holds if the result is cached by chat, story, message and
    candidate hash. Remember the stale-cache gotcha: key by everything.
- **Measure:** add arm `f` to `E0_ARMS` (floors `hitAt4 ≥ 0.8`, MRR margin 0.1, predeclared). Promote only on a pass,
  then lore ranking metrics (`judge/loreRanking.ts`).
- **Risk:** a new process on the owner's machine, and a download that needs the owner's OK and a space check.

### P5. Placement and volume probe under SWA + thinking (S to M, GPU, no layout change)
- **Probe:**
  - From recorded chat request bodies, plant one unique, non-literal fact (NoLiMa style) in the depth-4 memory block vs
    the depth-2 block vs the card, then end with a player line that needs it.
  - Greedy decode with thinking as recorded. Score use of the fact, judged by Sol or by exact phrase.
  - A second arm halves the memory tier budgets (context-rot "less is more").
- **Cost:** about 3 arms × 24 points × 1 seed ≈ 72 generations, about 25 min of GPU at about 20 s per reply *est.* This
  belongs in the GPU queue behind "resume".
- **Outcome rule (predeclared):** only if depth 4 loses ≥ 15 points against depth 2 does a layout change get proposed,
  and that change then goes through blind rating as usual. A probe pass changes nothing.
- **Why:** the 2026-10 layout ratings judged voice, not recall of injected facts. This answers whether the facts tier
  pays for its tokens where it sits.

### P6 (optional, after P1). ACE-style itemized short-term tier (M)
- **Change:** the short-term entry becomes 5–12 bullets with ids. The synthesis pass returns `KEEP id` / `EDIT id: text`
  / `ADD: text` / `DROP id (covered|resolved)`, and code merges the result.
- **Effects:** removes collapse by construction, and lets supersede/consolidate treat bullets like rows. Each bullet
  records its source span, so rollback stays exact (`derived.ts` inputs).
- **Cost:** same single call per 12 messages, with shorter outputs (deltas only).
- **Measure:** P1's retention floor, the live-suite facts tier, and a blind Sol rating of replies (the prompt-visible
  text changes).
- **Do only if** P1 shows real drift.

## 5. Things we do that the field doesn't, and rejected ideas

**Worth keeping**

- **Canon from structured inputs, not from the previous canon.** `buildCanonSummaryPrompt` takes arcs, facts and the
  checkpoint, and is regenerated when the input hash changes. That is immune to recursive drift by construction.
  Most systems (MemGPT, recursive summarization) re-summarize their own summary.
- **Compaction never outruns extraction.** The A3 ceiling is min(read coverage, short-term end). We found no published
  system that ties history eviction to proven memory coverage.
- **Refusal gates on summaries** (empty, longer than inputs, over budget; `refuseIncomplete`), with the previous entry
  kept. Most systems accept whatever the summarizer returns.
- **Bounded recursion.** Rolling depth is capped by chapter seals, and scene map-reduce by `REDUCE_DEPTH_LIMIT` 4.
- **Derived artifacts with inputs and removed rows, and rollback ≡ replay as a property test.** No surveyed memory
  system can undo a summary when a message is edited.
- **Per-member privacy across every compressed tier.** All the compression literature assumes one reader.
- **Prefix-stability gate** (plan 13) and **chunked compaction with hysteresis**. The community knows SmartContext, but
  nobody gates on it.

**Rejected**

- **LLMLingua-2 / LongLLMLingua / Selective Context on play prompts.**
  - Our memory lines are already short extracted statements, so there is little filler to drop.
  - Token dropping on history or cards risks voice (`context-chunking-web.md`).
  - Question-aware compression needs a per-turn LM pass on the critical path.
  - Possible later use: lore entries only, via Provence-style sentence pruning inside a P4 reranker, never token
    dropping.
- **Gist tokens, AutoCompressor, KV-level compression:** they need fine-tuning of Artemis or kernels llama.cpp lacks.
- **HyDE / MemoRAG clue generation at read time:** that is a 31B generation on the same GPU before every reply. P2 gets
  the write-time half for free from the read, which already runs.
- **Re-summarizing chapter records into ever-higher eras by recursive prose:** eras already exist. The ACE and
  recursive-summary evidence says to keep higher levels itemized (records, arcs), not re-proses of prose.
- **A JSON/YAML state block in place of prose tiers:** He et al. show format sensitivity with no universal winner, so
  any change is a blind-rating question with no expected payoff over the itemized prose we have.
- **Moving every memory block deep or late now:** the B arm (depth 0) and the joined layouts already failed rating.
  P5 measures first.

## Unresolved questions

- Do recorded lane payloads hold enough chained `shortTerm` calls (5+ per chat) to measure P1 drift, or does it need a
  long owner chat?
- Is the 60 % shrink floor sensible? Predeclare it from the first replay's distribution, without tuning to the result.
- P4: is a CPU model process acceptable on the owner's machine, and which model may be downloaded (owner OK plus space
  check)?
- P2: should keys be visible to the author in the Author console memory tab, for debugging recall?

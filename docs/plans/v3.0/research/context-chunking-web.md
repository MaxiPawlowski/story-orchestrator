# Context chunking and KV reuse: web research (2026-10-26)

Scope: ideas for cutting prefill on Artemis 31B (Gemma 4 dense, 50 SWA layers with a 1024-token window plus 10 global layers) on a single 3090, given our constraints: each member sees only its own card and private blocks, quality is checked by blind rating, and thinking stays on.
Labels: **[prod]** production-ready, **[proto]** research prototype, **[idea]** no implementation found.
Numbers are the sources' own unless marked *est.* (my estimate, not measured).

## Key facts that shape the ranking

- **Upstream checkpoint placement does not fit our Text Completion route.**
  - llama.cpp PR [#24176](https://github.com/ggml-org/llama.cpp/pull/24176) (merged 2026-06-23) creates checkpoints at every user and tool message boundary, and always at the last user message.
  - It finds those boundaries from chat-completion message spans. A commenter reported that a text-completion session got "only two checkpoints at the end", and the author confirmed the logic assumes chat structure.
  - Our Text Completion requests therefore get end-of-prompt checkpoints only. That matches the symptom we measured.
- **Current flags** (per [particula.tech](https://particula.tech/blog/prompt-reprocessing-swa-hybrid-models-kv-cache), checked against master 2026-07-29; secondary source):
  - `--ctx-checkpoints`: default 32.
  - `--checkpoint-min-step`: default 8192. Checkpoints closer than this are evicted (PR #25472).
  - `--cache-ram`: default 8192 MiB.
  - `--checkpoint-every-n-tokens`: removed by PR #22929.
  - Budget about 60 to 215 MiB per checkpoint.
- **Mid-prompt changes are not handled upstream.** Issue [#24587](https://github.com/ggml-org/llama.cpp/issues/24587) asked for reuse when the middle of a prompt varies on SWA models. It was closed "not planned" with no maintainer reply.
- **SWA rules out shifting and partial truncation.** PR [#13194](https://cdn04132025.gitlink.org.cn/replica/llama.cpp/commit/e298d2fbd082a52c0f6ed02729f94e9bf630cf17) states that token removal and position shifting are impossible with the SWA cache. So `--cache-reuse` (KV shift) and context shift are dead for us unless we run `--swa-full`.
- **`--swa-full` is expensive on Gemma 4.** On Gemma 4 the window-sized SWA cache saves about 85% of KV at 32K versus full size ([ik_llama #1607](https://github.com/ikawrakow/ik_llama.cpp/issues/1607)). Gemma 4's SWA layers have a GQA ratio of only 2, so `--swa-full` costs roughly 6 to 7 times the SWA KV.
- **Other engines.**
  - vLLM's [hybrid KV cache manager](https://docs.vllm.ai/en/latest/design/hybrid_kv_cache_manager/) gets an SWA-layer prefix hit when only the last `window-1` tokens are cached, and frees blocks that fall outside the window. That is block-granular, so effectively it has a checkpoint at every block. **[prod]**
  - SGLang has a [unified radix cache](https://www.lmsys.org/blog/2026-08-11-unified-radix-cache) covering full, SWA and Mamba layers, each with its own reuse boundary. **[prod]**
  - Neither engine fits a 31B Q4 GGUF on a 24 GB card shared with ComfyUI as well as llama.cpp does, so I treat them as design references, not migration targets.

## 1. Position-independent and modular KV reuse

| Work | Idea | Reported quality | Implementation | SWA/hybrid? |
|---|---|---|---|---|
| [Prompt Cache](https://arxiv.org/abs/2311.04934) (Gim et al., MLSys'24) | Schema-declared prompt modules, each with its own KV | Accuracy loss from missing cross-module attention | [proto] | No |
| [CacheBlend](https://arxiv.org/html/2405.16444v3) (EuroSys'25 best paper) | Concatenate chunk KVs, then recompute about 15% of high-deviation tokens | TTFT 2.2–3.3×, "negligible" drop on RAG QA | **[prod]** in [LMCache](https://blog.lmcache.ai/2025-03-31-eurosys) + vLLM production stack | Not addressed |
| [EPIC](https://arxiv.org/abs/2410.15332) (ICML'25) | LegoLink: recompute only the first few tokens of each chunk | TTFT up to 8×, "negligible" loss | [proto] | No |
| [CacheGen](https://arxiv.org/abs/2310.07240) | Compress KV for transfer and storage | Small | [proto] / LMCache | n/a (storage only) |
| [TurboRAG](https://arxiv.org/pdf/2410.07590) (EMNLP'25) | Precomputed chunk KV with reordered positions; **needs fine-tuning** | TTFT 8.6× avg, "comparable" | [proto] | No |
| [APE](https://arxiv.org/abs/2502.05431) (ICLR'25) | Shared prefix + attention temperature/scale, training-free | 98% (RAG) / 93% (ICL) of sequential | [proto] [code](https://github.com/Infini-AI-Lab/APE) | No |
| [Block-Attention](https://arxiv.org/abs/2409.15355) | Blocks attend locally; **needs fine-tuning** | Near-parity after fine-tuning | [proto] | No |
| [KVLink](https://arxiv.org/abs/2502.16002) (NeurIPS'25) | Position re-rotation + trained link tokens | +4% over prior methods; TTFT −96% | [proto] [code](https://github.com/UCSB-NLP-Chang/KVLink) | No |

**Verdict for us: watch, don't build.**
- All of this work is evaluated on RAG and QA with full-attention models. None reports roleplay or long-form voice quality.
- CacheClip ([alphaxiv 2510.10129](https://www.alphaxiv.org/abs/2510.10129.md)) argues that per-chunk attention sinks and lost cross-chunk reasoning push outputs off-distribution. That is the failure mode a blind rating would catch.
- On Gemma 4 the first global layer sits at about layer 6, so every later layer of a spliced chunk depends on everything before it. Recompute selection would have to cover both layer types.
- No llama.cpp implementation exists.

## 2. Hybrid SWA cache management

| Approach | What it offers | Status |
|---|---|---|
| llama.cpp checkpoints (PR #15293, #24176) | SWA-state snapshots at several positions per prompt | [prod]; TC-unfriendly (see above) |
| `--swa-full` | Exact truncation anywhere, so `--cache-reuse` works | [prod]; about 6–7× SWA KV on Gemma 4 |
| vLLM hybrid allocator | A hit needs only the last window of blocks; block-granular | [prod] (vLLM) |
| SGLang unified radix (SWA + full) | Tree reuse with per-layer-type boundaries | [prod] (SGLang) |
| Disk / RAM persistence of per-agent KV ([arXiv 2603.04428](https://arxiv.org/html/2603.04428v1)) | Gemma 3 12B Q4 KV restore, TTFT 22–136× vs re-prefill | [proto], single author |
| [hearth](https://pypi.org/project/hearth-llm/0.1.0/) proxy | Saves and restores llama-server slots to disk | [proto] |

**Placement strategy.** A checkpoint is worth keeping only where the next request will diverge. For us those divergence points are:
- (a) the end of the system, preset and card block (per member);
- (b) the start of the earliest per-turn injected block;
- (c) the start of the newest message.

A checkpoint at (b) turns a member switch into "recompute injection plus the last few messages" instead of "recompute since that member's last end-of-prompt".

## 3. Context engineering for multi-character play

- **ST's own options** ([group chats docs](https://docs.sillytavern.app/usage/core-concepts/groupchats/)):
  - Swap mode, the default and what we use, puts only the speaker's card in context, so the card block changes on every switch.
  - Join mode is recommended "with llama.cpp prompt caching", but we rejected it for privacy.
  - The structure that keeps both privacy and reuse is a **per-member branch**: [system/preset + member card] → shared history → private per-turn blocks → recent tail.
  - Our member cache already implements the branch root. What is missing is finer reuse inside each branch.
- **Multi-agent tree caching.** [KVFlow](https://arxiv.org/html/2507.07400v1) (NeurIPS'25) replaces LRU with "steps-to-execution" eviction and prefetches CPU→GPU before the agent runs.
  - It reports up to 1.83× on single workflows versus SGLang HiCache.
  - Our talk control knows the next speaker deterministically, which is exactly the signal KVFlow has to estimate. **[proto]**
- **Compression.**
  - [LLMLingua-2](https://arxiv.org/abs/2403.12968) is token-dropping, task-agnostic compression trained on meeting transcripts. I found no multi-turn dialogue evaluation ([2602.24287](https://arxiv.org/pdf/2602.24287) notes it is evaluated per query). **[prod]** library, untested for roleplay.
  - [Selective Context](https://arxiv.org/abs/2310.06201), [gist tokens](https://arxiv.org/abs/2304.08467) and [AutoCompressor](https://arxiv.org/abs/2305.14788) all need fine-tuning or work per query. **[proto]**
  - Dropped function words are likely to flatten voice. Compressing cards or history is high-risk; compressing memory or lore lists is plausible.
- **Summary memory.**
  - [MemGPT/Letta](https://arxiv.org/abs/2310.08560) is **[prod]**.
  - Roleplay papers report that recurrent summarization loses details. [BOOKMARKS](https://www.opentrain.ai/papers/bookmarks-efficient-active-storyline-memory-for-role-playing--arxiv-2605.14169/) prefers search-based storyline memory; [MOOM](https://papers.cool/arxiv/2509.11860) uses multi-timescale plot summaries plus forgetting; [RoleMemo](https://awesomepapers.io/papers/2605.25693) finds persona-agnostic summaries too generic. All **[proto]**.
  - For caching, the point is not whether to summarize but **when the history start moves**. Sliding trimming moves it every turn; chunked compaction moves it rarely.

## 4. KV compression and eviction

- **Rotation before KV quantization**: llama.cpp PR [#21038](https://github.com/ggml-org/llama.cpp/pull/21038), merged 2026-04-01, applies a Hadamard rotation to Q/K/V. **[prod]**, and it is in b11888.
  - q4_0 K/V KLD on Qwen3.5-9B fell from 0.0080 to 0.0048.
  - On AIME25 (gpt-oss-20b), q8_0 K/V scored 37.1% versus 37.9% for F16, and q4_0 rose from 2.0% to 21.7%. q4 is still clearly lossy for reasoning.
  - Token generation runs at about 0.88–0.93×.
  - Conclusion: q8_0 is near-lossless, so stay there. The main use is shrinking host-RAM checkpoints.
- **[QJL](https://arxiv.org/abs/2406.03482), [KIVI](https://arxiv.org/abs/2402.02750)**: not in llama.cpp mainline (QJL was explicitly left out of #21038). **[proto]**
- **[SnapKV](https://arxiv.org/html/2404.14469v2), [H2O](https://arxiv.org/abs/2306.14048), [PyramidKV](https://arxiv.org/abs/2406.02069), [StreamingLLM](https://arxiv.org/abs/2309.17453)**: no mainline llama.cpp implementation found. **[proto]** for llama.cpp.
  - They cut memory and decode cost, not prefill (SnapKV still prefills fully).
  - They evict exactly the card and lore details roleplay needs, and llama.cpp context shift is already disabled on SWA.
  - **Not recommended.**

## 5. Speculative and prefetch scheduling

- **Think-time pre-positioning.** [Speculative Pre-Positioning](https://arxiv.org/abs/2606.29565) (single author, 2026) decodes a stateful session forward to its next decision point while idle. **[proto]**
  - It reports TTFT of about 1 ms versus 39 ms for a prefix cache.
  - Prefill-only prefetch is the safe subset of the idea.
- **KVFlow prefetch** (above): background CPU→GPU load ahead of the scheduled agent. **[proto]**
- **Chunked prefill overlapping decode.** llama.cpp continuous batching with `-np >1` mixes prefill ubatches with decode **[prod]**.
  - On a compute-bound 3090 running a 31B, overlap mostly reorders work rather than adding throughput.
  - The win is priority: the loud reply goes first, side passes go into idle gaps.
- **[Speculative Prefill](https://arxiv.org/abs/2502.02789)** (prompt-token pruning by a small model) is lossy and **[proto]**. Not for us.

## 6. What the local roleplay community does

- **KoboldCpp** ([wiki](https://github.com/LostRuins/koboldcpp/wiki)):
  - ContextShift is on by default and evicts old tokens by KV shift.
  - FastForwarding skips the already-processed prefix.
  - SmartContext halves the context and shifts in big jumps.
  - The wiki says ContextShift avoids reprocessing "so long as memory is not changed … and you don't use world info", and `--useswa` is **incompatible with ContextShift**. That is our situation exactly.
- **llama.cpp users** dump prompts (`--log-prompts-dir`), diff consecutive turns to find prefix mutation, and use `--parallel 1` to stop slot stealing ([particula.tech](https://particula.tech/blog/prompt-reprocessing-swa-hybrid-models-kv-cache)).
- **ST power users** use Join cards with llama.cpp, put dynamic World Info deep (`@D`), and turn off Vector Storage chat injection. We already found and fixed the same causes.

---

## Ranked shortlist for our setup

Gain estimates assume about 1,000 tok/s prefill. They are *est.* unless noted.

### 1. Boundary-anchored checkpoints for Text Completion (llama.cpp patch + controller)
- **What:** The controller sends explicit checkpoint positions with each request, for example `checkpoint_at: [tok offsets]` or a marker-to-token map:
  - (a) end of the member root (system, preset, card);
  - (b) start of the earliest per-turn injected block;
  - (c) start of the newest message.
- **Storage:** keep 3 per member in host RAM instead of 1, and evict by "next-speaker distance" (KVFlow-style), not LRU. This replaces the chat-span logic of #24176, which never fires for TC.
- **Gain:**
  - Warm switch drops from about 3.8 s to the cost of the injection plus the tail after (b): about 1–2.5 s *est.*
  - Swipe, regenerate and edit become about 0.1–0.5 s, because they restore at (c).
  - Rollback restores at (b) or (c) of an earlier boundary.
- **Cost:** medium. Server slot checkpoint code (about 200–400 lines) plus offsets from the extension and controller.
- **Quality risk:** none. The restore is exact.
- **Test:** replay recorded per-member prompt sequences. Log `n_past` reused and TTFT per request, and check greedy outputs are byte-identical against `cache_prompt:false`. No rating needed.

### 2. Side passes as suffix branches (extension + controller cache keys)
- **What:** 78% of requests (story read, inner beat) get their own stable prefixes, with the task instruction moved to the **end**:
  - The inner beat for member X starts with X's exact loud prefix up to boundary (b), then appends its instruction. That reuses X's checkpoint and stays private by construction.
  - The story read uses a dedicated "reader trunk": a fixed instruction header, then the transcript, append-only, with no private content. It gets its own cache key and checkpoint.
- **Gain:** 2–5K-token prefills fall to about 0.3–1K. That is roughly 2–4 s saved per side pass and most of the background GPU time *est.*
- **Cost:** low to medium, mostly prompt builders plus a routing key.
- **Quality risk:**
  - The extraction contract and position change, so re-run the live suite floors (facts, rejected).
  - The inner beat goes to blind rating.
- **Test:** measure cache hit and TTFT on recorded sessions, then score the live suite before and after on the same goldens. Blind Sol rating on inner-beat outputs, A/B.

### 3. Chunked history compaction with hysteresis (extension)
- **What:** When the context nears 32K, ST trims the oldest message every turn, which moves the history start and invalidates everything after the card on every request. Instead, evict history in large chunks (for example 25% at once, folded into existing memory tiers), so the trunk start moves once every N turns, the same idea as SmartContext.
- **Gain:** in long chats, avoids a full reprocess of about 9–25K tokens per request after the context fills. This is the largest single gain once a chat is long *est.*
- **Cost:** low to medium (extension budget logic; memory tiers already exist).
- **Quality risk:** medium. The model sees less raw history right after a compaction. Roleplay summary literature warns about lost details.
- **Test:** pick a long recorded chat past 32K. Diff first-divergence positions per turn, then blind-rate replies at points right after compaction against the trimming baseline.

### 4. Think-time prefetch of the next speaker and side passes (controller + extension)
- **What:** After a reply renders, the extension already knows the next speaker (talk control) and the boundary's side passes. During player think time the controller:
  - runs prefill-only requests (`n_predict:0`, `cache_prompt`) for the next speaker's prompt up to boundary (b);
  - schedules side passes in the gap;
  - cancels everything at ubatch granularity when the player sends.
- **Gain:** hides most of the switch cost behind 10–60 s of typing. TTFT then approaches injection plus tail only. Combined with #1, about 1–2 s *est.*
- **Cost:** medium. It needs a controller queue with preemption and must yield to the ComfyUI GPU broker.
- **Quality risk:** none. Per-turn blocks that depend on the player's line stay after (b), so they are never prefetched stale.
- **Test:** replay sessions with recorded think gaps; measure TTFT, wasted prefill tokens and ComfyUI contention.

### 5. Prefix-stability audit as a gate (extension + controller)
- **What:** The controller logs the first-divergence token index per cache key on every request (the same idea as `--log-prompts-dir` diffing). Flag any divergence above boundary (b), such as macro or timestamp churn, lore reordering, or memory blocks rewritten instead of appended, and add it to the no-model payload goldens.
- **Gain:** keeps #1–#4 working. Each hidden mutation found is worth a full reprocess per request.
- **Cost:** low.
- **Quality risk:** none.
- **Test:** add to `so-payload-golden`; assert divergence is at or after (b) across a recorded corpus.

### 6. Compact checkpoints in host RAM (llama.cpp patch)
- **What:** Store host-RAM checkpoints rotated-q8_0 or q4 (#21038 rotation is already there), or ship the SWA part only, so 3–4 checkpoints per member fit next to ComfyUI in 32 GB. This enables #1 at scale.
- **Gain:** 2–4× more resident checkpoints *est.*
- **Cost:** low to medium.
- **Quality risk:**
  - q8_0 storage is near-lossless (#21038 data).
  - q4 storage is lossy for reasoning; test it before use.
- **Test:** compare KLD and greedy divergence of restored-from-compressed against exact restore on recorded prompts; blind rating only if q4 is chosen.

### 7. Side-pass priority and batching in the controller (controller)
- **What:** Two slots with continuous batching: the loud reply preempts, and side passes queue for idle gaps. Where two side passes share a prefix (#2), batch their decode.
- **Gain:** smaller perceived latency; modest throughput gain (the 3090 is prefill-bound).
- **Cost:** low to medium.
- **Quality risk:** none.
- **Test:** concurrent replay of loud plus side traffic; record p50 and p95 loud TTFT.

### 8. Experiments to keep on watch, not build now
- **`--swa-full` at a reduced context (e.g. 16–24K):** enables exact truncation at any position, so `--cache-reuse` works and checkpoints are no longer needed. It costs about 6–7× the SWA KV and likely does not fit next to ComfyUI.
  - Test: VRAM check, then the replay TTFT test above. **[prod] flag, feasibility unknown.**
- **CacheBlend/APE-style splicing of member roots:** no llama.cpp or hybrid-SWA support, quality judged only on RAG, high rating risk. **[proto]**

**Not recommended:**
- SnapKV, H2O, StreamingLLM and PyramidKV: they do not cut prefill and they evict card and lore details.
- LLMLingua-2 on cards or history: no multi-turn evidence and a risk of voice loss.
- q4 KV for the live cache.
- Join cards: rejected for privacy.

## Unresolved questions
- Does our b11888 patch already create checkpoints mid-prompt for TC? If it does, #1 shrinks to choosing placement.
- What is the real checkpoint size for Artemis at q8_0, and so how many per member fit in RAM next to ComfyUI?
- How long do players think between turns in recorded sessions? That bounds #4.

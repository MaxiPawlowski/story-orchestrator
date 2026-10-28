# llama.cpp fork opportunities beyond the member cache (research spike, 2026-10-28)

Owner question: the cache patch "unlocked a door"; what else is reachable by patching llama.cpp, or by upstream features
we do not use yet, for our workload? Research and reading only: no GPU, no controller start/stop, no build, no lanes (an
A2 max-memory bench was running). Inputs: this spike's log reads, two parallel feeds (papers, engines; §Feeds), and a
Sol review (`openai/gpt-6.1-sol`, `codex exec`, read-only), folded in with disagreements stated (§Sol review).

Labels: **M** measured (this spike's log reads or a cited plan record), **S** read from source
(`C:\dev\tools\src\llama.cpp-b11888-so`, branch `so-cache-patch`, head `3bae32b`), **I** inferred, **E** estimate
(method stated).

Scripts (CPU only, light, in the session scratchpad `llspike\`): `agg.py` (owner controller timings), `loads.py` (load
phases), `analyze.py` (payload captures: per-role timing, copy coverage). No story text is written here.

## 1. Workload, measured

Sources:
- Owner controller native logs, `C:\dev\so-lanes\0\debug\local-residency\native-*.log`, 2026-10-25 10:32Z to
  2026-10-28 14:40Z: 191 llama-server processes, 7,757 timed tasks. They include lane runs routed through the owner's
  controller: real requests, not only owner play (M).
- Owner controller `controller.log` (same dir; no timestamps; mixes play, sprite batches and lane runs) (M).
- Payload captures `C:\dev\so-lanes\42\debug\v29gpu2\payloads.jsonl`, `45\debug\s6h\payloads.jsonl` (the corpus of
  `fable-context-slicing.md`): 674 generate requests, side-pass responses included (M).
- Plan records 06-10, 23, v2.8 28 and `fable-context-slicing.md` (cited per number).

### Where GPU time goes (server timings, 7,757 tasks, MTP on)

Bucketed by decode length, a proxy for role (chat replies with thinking land in long; reads, synthesis, curator in mid;
inner beat, director, probes in short). Server timings exclude queueing, reloads and image waits.
- Long (≥ 250 decoded tokens), n 2,440: prompt 3,034 tokens p50 (after cache reuse), prefill 3.3 s p50 at 927 tok/s;
  decode 449 tokens p50 / 828 p90, 11.4 s p50, 42.6 tok/s p50 (p10 30.2), MTP acceptance 0.59. Totals: prefill
  8,215 s, decode 34,709 s (decode 81 % of this bucket's server time).
- Mid (60-249), n 1,755: prefill 1.9 s, decode 146 tokens 3.3 s, acceptance 0.77. Totals 4,029 s / 6,718 s.
- Short (< 60), n 3,562: prefill 1.4 s, decode 35 tokens 0.7 s. Totals 5,699 s / 2,282 s.
- All: prefill 17,943 s (29 %), decode 43,709 s (71 %).

Side passes (captures):
- Story read: 136 requests, prompt 1,777 tokens, prefill 1.77 s, decode 142 tokens 4.9 s p50; decode sum 547 s vs
  prefill 176 s.
- Inner beat: prompt 248, prefill 0.29 s, decode 31 tokens 1.0 s.
- Every side pass prefills a closed empty thought (`<|channel>thought\n<channel|>` in the prompt): side passes pay no
  thinking tokens (M).
- **Copy coverage** (character level): in the read's output, 37 % p50 (40 % mean) of characters lie in runs of ≥ 24
  characters copied verbatim from its prompt (SPAN anchors, promise quotes, witness lines). Inner beat 0 %, other side
  passes 6 % p50 / 20 % mean (M). Chat replies are streamed and not captured. Token-level draft eligibility is not
  measured (Sol: the default ngram-mod lookup is 24 *tokens*; see C3).

Proxy for a perceived 3-member player turn (E, from the buckets, not a measured end-to-end): per member an inner beat on
the critical path (~2.1 s), a chat TTFT (3.3-4 s warm, ~8 s cold) and 11.4 s of decode. Decode is the largest share.

### Text reloads (the image cost)

- `loads.py`, 187 starts: to "model loaded" 26.8 s p50 (p10 22.5, p90 45.6), split: fit probe + vocab 2.9 s, **main
  weights 21.4 s p50** (p10 19.5, p90 35.3), MTP model + contexts 1.5 s (M). This answers the engines feed's open
  question (the wake split). The controller's `loadMs` for `fast+draft-mtp2` is 39.4 s (process start, admission,
  health included).
- 18.7 GB in 21.4 s is 0.87 GB/s effective. The disk is a Crucial P3 NVMe (~3 GB/s sequential) and v2.8 28 measured
  23.2-27.6 s with the GGUF page-cached, so raw disk bandwidth is not the explanation (M). What is (allocation, buffered
  reads, CPU copies, upload scheduling, sync) is **not isolated**: measure before projecting (Sol, agreed).
- Source (S): `--load-mode none` takes the non-mmap path with 4 pinned 1 MiB staging buffers and async GPU uploads
  (`llama-model-loader.cpp:1580-1642`); file reads stay synchronous buffered `ReadFile`, and Windows ignores
  `use_direct_io` (`llama-mmap.cpp:87-95,130-143`), so `--load-mode dio` is the same path (v2.8 28 measured dio
  23.3-23.4 s vs none 23.4 s; the engines feed's dio arm is already answered). mmap broke the RAM floor here (v2.8 28,
  409): Windows cannot unmap fragments, so the mapping stays resident.
- How often it hits: with MTP every SDXL image swaps text out (09 §M: text leaves 1.4-2.2 GiB, a stream needs
  2,400 + 1,024). Per-turn illustrations: 40 % of replies waited ~22.6 s on a reload (09 T3). First reply after an
  image waits the wake, 22.8 s (09 K). `controller.log`: 910 `swap-text` leases.
- Image VRAM asks (`controller.log`): SDXL scenes 2,816 MiB + 1,024 reserve with 1.4-1.8 GiB free (2.0-2.4 GiB short);
  qwen-image edits ~19 GB (always a full swap). The frequency of each kind in owner play is unknown (no lease kinds or
  timestamps in the log).

### VRAM and RAM

- Context buffers (verbose logs, M): global KV 1,360 MiB + SWA KV 637.5 MiB (q8_0, 32K), compute 396.8 MiB; MTP: model
  475.8 MiB, KV 136 + 38 MiB, compute 375.8 MiB. Contexts total 2,944 MiB (2.88 GiB), 3,420 MiB with the MTP weights,
  if distinct and actually released (an NVML delta must confirm; Sol).
- **Host RAM binds in real use**: of 85 `text sleep` events in `controller.log`, **83 dropped the sleeping server and
  its member cache** because available RAM (5.0-9.4 GiB) was under the 10,240 MiB image floor (M). `keepAcrossImages`
  (09 K) rarely survives outside benches. Sprite batches (qwen-image, ~8 GiB RAM staging) are part of that log.
- Spills: 5 spill recoveries with 1.4-1.8 GiB fit corrections; a spilled server decoded 11-17 tok/s (newest native log)
  until the guard reloaded it (M).

### Already built or decided (not re-evaluated)

- `checkpoint_at` + `cache_rewind` + duplicate drop (09 R/R2): A2 warm switch 3.31 s vs adopted A 7.50 s. The adopted A
  re-prefills a member's history since its first turn (1,296 → 5,709 tokens over six turns): **the owner's live warm
  switch degrades as a chat grows**. Pending: R2 full-length run + Sol rating.
- Idle next-speaker prefill (built, off; send-latency floor 09 §I), chat-first (adopted), sleep across images (adopted),
  native cache occupancy/limit + RAM fit (A2, `3bae32b`, bench running), S384 stream-floor rerun (owed).
- Rejected by measurement: `-ub` 1024/2048, n-max 3 for all requests, probabilistic drafting, CUDA 13 build,
  `--swa-full`, parallel 2 with batching (09 C2 P2: chat decode 42.1 → 20.2 tok/s), depth-0 layout, joined cards.
- Upstream already used: reasoning budget (`reasoning_budget_tokens`, `server-common.cpp:1516`), MTP, rotated q8_0 KV
  (#21038). Present in b11888 and unused: DFlash, EAGLE-3, DSpark drafters, stacked spec types, lazy grammars.

## 2. Candidates

Each: what, upstream status, gain on our numbers (method), patch size and maintenance, quality risk (output change needs
a blind Sol rating, owner rule 2), privacy (member state never reaches another member), measurement with a predeclared
floor.

### C1. Light sleep: free the contexts, keep the weights

- **What.** A second sleep level. `POST /sleep {"level":"context"}` saves slot states to the prompt cache (as `72f8d7d`
  does), frees the speculative state, MTP context and target context (KV, compute buffers, graphs, pool), optionally the
  MTP weights, and keeps the target model on the GPU. Wake recreates target context → MTP context → speculative state →
  slot bindings; the cache restores the member state on the next request.
- **Upstream.** None. Server sleep calls `destroy()` and wake calls `load_model()` (S, `server-context.cpp:1172-1228`),
  i.e. a full reload. vLLM has the equivalent (`release_kv_cache_memory`, sleep level 1). The engines feed's
  alternative, partial layer release (free only the layers ComfyUI needs, re-read those tensors), est. wake 3-6 s, needs
  per-layer weight buffers in the loader: higher effort than C1.
- **Gain (E).** Frees ~2.9-3.3 GiB: free VRAM ~4.3-5.5 GiB, over the 3,840 MiB an SDXL scene asks. Wake ≈ context
  creation + graph reserve + one cached-state restore (0.4-0.8 s, 09). The 1.5 s "MTP + contexts" phase does **not**
  bound it (target-context creation happens earlier inside `common_init_from_params`, Sol); est. 1-3 s, to measure.
  - SDXL image → next reply: 49.2 s (09 S2400, full swap) → ~25-30 s; against the owed S384 (stream at ~1.4 GiB free,
    31.6 s, render 136 %): a few seconds better plus ~3 GiB margin against WebGL/foreign VRAM. C1 must beat S384, not
    only the full swap.
  - Per-turn illustrations (SDXL): the 40 % of replies that wait ~22.6 s would wait the wake instead.
  - Member cache stays as with today's sleep. Host RAM is a separate budget: SDXL's RAM staging must be measured before
    the 10,240 MiB floor (written for qwen staging) is lowered for it.
  - Qwen-image edits still need the full sleep (C2).
- **Patch (revised after Sol).** ~200-300 lines. `common_init_result` privately owns model, context, threadpools,
  adapters and samplers with no context-detach lifecycle (`common/common.cpp:1159-1173,1373-1397`), so either the
  server bypasses part of that init or `common/` gains an ownership split. The MTP context takes `ctx_other = ctx_tgt`
  and its memory references the target's (`common/speculative.cpp:2695-2748`, `src/llama-context.cpp:484-494`):
  teardown and rebuild order matters, and keeping MTP weights needs separating them from `spec_init`'s context.
  Maintenance medium-high (`load_model` and `common_init` change often upstream); the ownership split is an upstream PR
  candidate.
- **Quality.** Weights untouched; state comes back through the same token-checked restore as the adopted cache. Gate
  class "exact" (owner rule 2: token-identical restores need replay equivalence + timings), with first-divergence logged.
  Sol asks for a blind rating as well; see §Sol review.
- **Privacy.** None new (same keyed entries).
- **Measure** (≈ 30 GPU min): feasibility prototype first (wake time, NVML free after release). Then paired, interleaved
  arms K1 (today), S384 (rerun on the fixed guard) and L (light sleep), `render-benchmark … auto scene 256` and
  `burst-bench` `RRRIRRRIRRRI` on `corpus-rate`, plus an L row with the live head open. Floors:
  1. image → next reply p50 ≤ 70 % of K1 and ≤ 90 % of S384; p95 reported;
  2. wake p50 ≤ 3 s, p95 ≤ 5 s;
  3. render p50 ≤ 125 % of K1's;
  4. 0 spill events (dedicated and shared GPU memory), 0 refusals, `fitCorrectionMiB` 0, live-head context kept;
  5. decode over each post-wake reply ≥ 97 % of before; first post-image reply and following warm members reported
     separately;
  6. host RAM available and commit charge minimum per lease ≥ the K1 arm's − 256 MiB;
  7. greedy check after a light-sleep restore: first divergence position recorded, no earlier than the control's own
     restore divergence distribution (09 R floor 6 method).

### C2. Fast weight load (measure, then the smallest fix)

- **What.** Instrument `load_all_data` (read time vs upload wait vs allocation), page-cached and cold. Then the smallest
  fix the split supports: larger pinned staging (constant or env knob), or Windows unbuffered overlapped reads (needs
  aligned offsets, lengths and buffers plus completion management, not just flags; Sol), plus a controller/patch step
  that reuses the first load's fitted params on wake when free VRAM is at least what it was (engines feed; −1-2 s of the
  2.9 s fit+vocab), and a `--no-warmup` arm (engines feed, est. 0.5-2 s; check first-request latency moves rather than
  disappears).
- **Upstream.** Linux DirectIO (#18012), Windows async GPU upload (#7896); Windows DirectIO is a placeholder; staging
  fixed at 1 MiB (S). Upstreamable.
- **Gain (E, conditional on the split).** If reads dominate: weights 21.4 s → 6-8 s at 2.5-3 GB/s, load 26.8 → ~10-12 s.
  If something else dominates, unknown. Applies to every full reload (qwen edits, big images, spill recovery, mode
  changes, restarts, and every image until C1).
- **Patch.** Instrumentation ~20 lines (throwaway build). Staging ~10 lines in `src/llama-model-loader.cpp`; Windows
  overlapped reads ~100-150 lines in `src/llama-mmap.cpp`. Core files, small and self-contained.
- **Quality / privacy.** None (identical bytes). Check a tensor checksum or greedy identity against a stock load.
- **Measure** (probe ≈ 5 GPU min; rebench ≈ 10): floors: total load p50 ≤ 60 % of the stock binary's, cold and
  page-cached rows, p95 reported; RAM available minimum during load ≥ stock − 256 MiB; 0 failed loads in 10; output
  identical to a stock load.

### C3. Request-local n-gram drafting on top of MTP, plus per-request draft length

- **What.** `--spec-type` with an n-gram type alongside `draft-mtp`. The n-gram family has hard-coded priority over model
  drafters (not CLI order), the first non-empty draft wins per sequence, and MTP's n-max 2 does not cap n-gram drafts
  (S + Sol: `common/speculative.cpp:2791-2818,2998-3051`). Verification is greedy sample-and-match on the target chain.
- **Privacy correction (Sol, agreed).** `ngram-mod` keeps one hash pool across all sequences
  (`common/speculative.cpp:2036-2149`): another member's private continuation can be proposed to the verifier.
  Verification keeps output to the target's own tokens, but that is not isolation. Use a **request-local** drafter:
  `ngram-simple` searches only the current request's tokens (`common/ngram-map.cpp:49-75`); `ngram-map-k` keeps
  per-slot state that must be shown to reset on a foreign prompt before use. `ngram-mod` is not used.
- **Per-request draft length** (engines feed): MTP n-max 3 was +8 % side decode (09 batch 1: side 50.8 vs 46.8 tok/s)
  and −2 % chat. The `#if 0` block (`server-schema.cpp:227-257`) holds singular `speculative.n_max`/`type`; enabling
  `n_max` with a clamp to the server's value is ~10-20 lines (start the server at 3, chat requests ask 2). Selecting
  drafter *types* per request needs more (the speculative object is global; Sol).
- **Gain (E, optimistic scenario until token eligibility is measured).** Read decode 4.9 s → ~3.7-4.4 s; over the 136
  captured reads ~70-160 s. Side decode +8 % from draft 3. Chat: no-regression floor (copy rate unknown).
- **Patch.** None for the n-gram trial; ~20 lines for per-request `n_max`.
- **Quality.** Exact class (greedy verify), batch numerics aside.
- **Measure** (offline first: token-level eligible continuations over the captured read outputs with the model's
  tokenizer, CPU; then ≈ 15 GPU min): floors: read end-to-end time p50 ≤ 85 % of MTP-only with output length within
  ±5 % (no gain from shorter or failed outputs); chat decode ≥ 0.97 ×; side decode with draft 3 ≥ 1.05 ×; VRAM delta
  ≤ 64 MiB; temperature-0 first-divergence no earlier than the control's run-to-run distribution.

### C4. Chat preempts an in-flight side pass

- **What.** `chatFirst` reorders queued work only; a read already decoding (4.9 s p50) blocks the chat. Fable: 81 of 106
  chats were issued while a side pass ran and waited 4.8 s p50 / 11.2 s p90.
  - **C4a (controller):** when a chat arrives and the running job is a story read (never an inner beat), abort it (client
    disconnect stops at the next batch) and requeue the **identical request body** after the chat.
  - **C4b (patch):** request `priority` with `-np 2 --kv-unified`: a high-priority task pauses lower slots (skipped in
    batch building, KV kept). No recompute, but −428 MiB VRAM (09 C2 P2), which collides with C1/SDXL headroom.
- **Upstream.** No request priority or slot pause (S, `update_slots`; web: none).
- **Gain (E).** Chat TTFT on affected turns −2-3 s (P1 3.82 s → ~2.4 s, P2's TTFT without P2's halved decode). The
  papers feed's "decode the side pass alongside the reply" is contradicted on this host by 09 C2 P2.
- **Quality (revised after Sol).** Output of the requeued read is the same request, but it lands later: it may apply at a
  later boundary, which can change downstream prompts. Bound and measure freshness; exactly-once application.
- **Patch.** C4a gateway ~50 lines + tests. C4b ~80-150 lines in the hot loop; only if C4a's waste is large.
- **Measure** (≈ 15 GPU min, `09/replay-gateway.mjs`, 80-request lane 42 replay, paired repeats): floors vs P1: chat
  TTFT from issue p50 ≤ 75 %, p95 ≤ 90 %; chat decode ≥ 97 %; every read completes and applies exactly once; boundary
  lag of applied reads (issue boundary → applied boundary) p95 ≤ P1's + 1; retries per read ≤ 2; wasted prefill and
  decoded tokens reported; 0 inner beats aborted; then the `inner-freshness` row.

### C5. Keyed cache entries spill to disk under RAM pressure

- **What.** Where the controller drops the sleeping server's cache for RAM (83 of 85 times), the patched server writes
  keyed entries to files and loads one back when its key returns. Entries ~0.8 GiB rewound (09 R).
- **Upstream.** Slot files exist (`--slot-save-path`); no cache-entry tier (S). Plan 08's disk mode failed because saves
  ran on the request path (52.9 s stalls).
- **Gain (E).** First post-image turn per member warm instead of cold: 09 K 4.6 vs 9.4 s, ~−4.8 s per member per
  RAM-short image, for ~2-3 GB written and ~0.3-0.5 s read per hit. If admission needs the RAM, the spill finishes
  **before** admission (on the image's clock, ~1-2 s), and it competes with ComfyUI reading its weights from the same
  NVMe (Sol).
- **Patch.** ~150-200 lines in `server-task.cpp`. Medium maintenance (our cache code).
- **Quality.** Exact; a corrupt or incompatible file is a cold miss.
- **Privacy / safety (revised after Sol).** Files hold member context: restrictive Windows ACL (owner only) on a dir
  under the controller state dir, never a lane or repo path; hashed names; atomic writes; size bound; integrity hash; a
  fingerprint of model, context/KV configuration and serialization format; deleted on load, server exit and controller
  start (deletion is cleanup, not secure erasure).
- **Measure** after C1 and A2's RAM fit (they change how often the drop happens): sprite batch with replies interleaved.
  Floors: warm share of first post-image member turns ≥ 60 %; their TTFT p50 ≤ 60 % of the drop arm; image → reply p50
  ≤ 105 % of the drop arm (spill time included); RAM floor and commit charge held; 0 spill files after exit.

### C6. Faster cache restore

- **What.** Plan 09 §E item 1, plus Sol's finding: host-state restore queues tensor regions and then calls synchronous
  `ggml_backend_tensor_set` per region (`src/llama-context.cpp:2974-3001`), from pageable memory. A bounded pinned
  pipeline with async copies may help without pinning whole entries.
- **Gain (E).** Warm switch 3.3 s ≈ 1.9 s prefill + ~1.4 s restore/overhead (09 R): −0.3-0.6 s per warm switch if the
  copy dominates. Measure restore ms (`--verbosity 4` cache-load lines) first.
- **Patch.** ~60-120 lines in `src/llama-context.cpp`. Exact. Floor: warm switch p50 ≤ control − 0.3 s, RAM minimum ≥
  control − 256 MiB.

### C7. Lower-bit KV with rotation (output-changing)

- **What** (engines feed). q5_0/q5_1, or K q8 + V q5, with the rotation already in b11888; mixed K/V types need a
  `GGML_CUDA_FA_ALL_QUANTS` build (our toolchain can). A per-layer-type split (SWA lower, global q8) needs a small patch
  (no `-ctk-swa` upstream, S per the feed).
- **Gain (E, feed).** KV −35 %: ~0.7 GiB VRAM during play (helps the stream gate and C8), entries ~−35 % (more members,
  faster restore).
- **Quality.** Output-changing: KLD on recorded RP transcripts, then the blind Sol rating; papers feed caution: KV
  compression holds on retrieval and breaks reasoning chains, and thinking is on. Rank below the exact items.

### C8. Stronger drafter (DFlash / EAGLE-3)

- `draft-dflash`/`draft-eagle3`/`draft-dspark` exist in b11888 (S, `src/models/dflash.cpp`, `eagle3.cpp`). Drafters
  exist for Artemis **v1.2** (plan 07: 5.4 / 4.5 GB, HF format) and base `gemma-4-31B-it` (z-lab DFlash, 2B BF16), not
  v1.1. The engines feed's 3090 data: DFlash helps code, about 0 on prose. VRAM does not fit beside images. **Park**
  (revisit only with a v1.2 decision). +20 % decode would save ~1.9 s per member reply (11.4 s × 0.2 / 1.2).

### C9. Profile the decode step (Sol addition)

- Upstream experimental `--backend-sampling` (`common/arg.cpp:2318-2321`) moves sampling to the backend. Profile first:
  sampler and logit-transfer time per token with our long sampler chain (DRY, penalties, min_p) at 262K vocab; only a
  measured share justifies a trial. Output may change (sampler implementation): rating if adopted. No gain claimed.

### Dropped or low

- **Grammar after thinking (lazy GBNF, CRANE):** `grammar_lazy`/`grammar_triggers` are `/completion` fields
  (`server-schema.cpp:334,369-376`). Side passes do not think (empty thought), so a plain grammar already constrains only
  the answer; chat replies carry none. A read-contract decision (plan 25: facts written as MEMORY lines) with live-suite
  floors, not engine work.
- **Cheap scoring endpoints** (`n_probs`, `n_predict: 1`): upstream, used by the env-gated `llama-logprob` judge. The
  only local classification pass is the talk director (answer ~5-10 tokens, ~0.2 s decode; prefill dominates); judge
  uses default to TypeSafe. < 0.3 s. Drop. The decider-4b cascade (papers #5) is a judge-routing decision, not llama.cpp.
- **Multi-LoRA, control vectors:** no adapters; a 31B LoRA does not train on 24 GB; LoRA requests do not batch or share
  the base prefix KV; control vectors are global and output-changing.
- **q4 parked entries** (papers #8): output-changing, needs a dequant path; C5 gives capacity exactly.
- **K-only global-layer KV** (engines #6): −680 MiB at 32K, but the FA path must rebuild V on read; high effort; watch
  upstream.
- **Cross-member KV reuse (radix, CacheBlend, KVCOMM):** history states computed under member A's card and private blocks
  carry them through the global layers; only KV under a prefix every recipient may see is reusable. The read's own keyed
  entry (a prompt reorder, Fable idea 4) is the safe instance and is product work.
- **Prefill kernels, `-ub`, CUDA env knobs, cuBLAS vs MMQ, CUDA 13:** flat or negative (09 B, 23). **KV f16:** does not
  fit. **Server-side thinking close:** exists and used.
- **Session save/restore on chat switch:** rare; C5's tier would serve it.
- **Typing-time prefill with the draft player line** (papers #3): controller + page work over the built `idlePrefill`,
  with a `checkpoint_at` at the late-lore position; no llama.cpp change. Belongs with the idle-prefill bench.

## 3. Ranked shortlist

Ordered by the first action, cheapest evidence first; value judged on seconds the player waits, exact changes first.

0. **Finish R2 for `checkpoint_at`** (built). The owner's live warm switch grows with chat length; A2 holds re-prefill at
   ~2K tokens (warm 7.5 → 3.3 s). Owed: full-length run + Sol rating (~30 GPU min). C5 and C6 depend on its small entries.
1. **C2 probe + smallest fix.** 5 GPU minutes split the 21.4 s weight phase; if reads dominate, load 26.8 → ~10-12 s for
   every full reload. 0.5-1.5 days; upstreamable.
2. **C1 light sleep**, feasibility prototype then paired bench against K1 and S384. Largest single wait in SDXL-heavy
   play (~22.6 s → est. 1-3 s); 200-300 lines including a `common/` ownership split. 2-3 days + 30 GPU min.
3. **C4a abort-and-requeue reads.** Chat TTFT −2-3 s on turns that follow a running read; gateway only, freshness floors.
   0.5 day + 15 GPU min.
4. **C3 request-local n-gram + per-request draft length.** Offline token eligibility first (CPU), then 15 GPU min.
   Side-pass decode +8-25 % (E), chat unchanged.
5. **C5 cache spill**, after C1 and A2 change the drop rate. 1-2 days.

Then C6 (measure restore first), C7 (rating-gated), C9 (profile only), C8 parked on a v1.2 decision.

**What I would build first:** C1, because it removes the largest wait the player sees and keeps the member cache
resident. Its first GPU window should also run the C2 probe (5 min) and the R2 rating, so all three decisions come out of
one session; the C3 eligibility count runs offline before any of it.

## 4. Stub plan proposal

`docs/plans/v3.0/26-llama-fork-round-4.md`: "Light sleep, fast load, preemption, request-local n-gram".
- Scope: C2, C1, C4a, C3 (n-gram trial + per-request `n_max`), each behind a config key, default off until adopted.
  Patches as commits 7+ on `so-cache-patch` (repo copy `scripts/local/llama-patches/so-cache-b11888.patch` updated),
  binary `so5`; C2 and the C1 ownership split offered upstream.
- Order: offline C3 eligibility → one GPU window: C2 probe, R2 rating, C1 feasibility → builds → paired benches → C4a.
- Floors: §2 as written, declared before any run, never retuned; misses recorded, owner decides.
- Gates: replay equivalence + timings for exact changes, rating for output-changing ones (C7, C9); the
  `feature-impact-controller.md` base set plus each change's rows (images for C1/C2, reads for C3, parallel/freshness for
  C4a); `npm run gates` before merge; no adoption on the owner's install during play.
- GPU budget ≤ 120 min: C2 probe 5, R2 30, C1 30, C2 rebench 10, C4a 15, C3 15, regression rows ~15.

## Feeds

- **Papers** (`research-papers.md`, scratchpad): folded into C3 (floors; privacy of the shared pool), C4 (its batching
  idea contradicted by 09 C2 P2), lazy GBNF (dropped to product), C8, q4 entries (dropped), cross-member caution, typing
  prefill (finish lane), cascade (judge routing).
- **Engines** (`research-engines.md`, scratchpad): no engine switch; folded: wake path (C2: split now measured, dio
  already answered on Windows, fit reuse, `--no-warmup`), per-request draft length (C3), ngram with MTP (C3), KV q5 (C7),
  partial layer release (C1 alternative), K-only global KV (dropped/watch), DFlash on prose ~0 (C8).

## Sol review (2026-10-28, `codex exec -m gpt-6.1-sol -s read-only`)

Agreed and applied:
- Decode shares are server-time proxies by length bucket, not end-to-end chat time; the "50 s turn" is a proxy.
- 0.87 GB/s does not prove staging-bound loading: C2 now measures first and picks the smallest fix.
- Light sleep is not server-only or 100-150 lines: `common_init_result` owns everything, MTP holds `ctx_other`, order
  matters; revised to 200-300 lines with a `common/` split. The 1.5 s phase does not bound wake.
- N-gram: character coverage overstates token eligibility (default lookup 24 tokens, min draft 48); priority is
  hard-coded, not CLI order; `ngram-mod`'s global pool is not isolation → request-local `ngram-simple`/`map-k` only.
  Per-request block holds singular `n_max`/`type`; type selection needs more.
- C1 must beat S384, not only the full swap; first post-image reply reported separately.
- Floors: paired interleaved arms, p95, output-length guard on reads, commit/pagefile and shared GPU memory, C4
  freshness and exactly-once, C5 Windows ACL, atomic writes, fingerprint, spill before admission.
- Added C6 per-region synchronous `tensor_set` and C9 backend-sampling profile.
- Arithmetic: +20 % decode saves ~1.9 s of 11.4 s; 1 s × 136 reads is 136 s.

Where I disagree:
- **Rating for C1.** Sol asks for a blind full-length rating because the restore control was identical on only 1 of 3
  greedy prompts. Owner rule 2 classes token-identical restores as exact (replay equivalence + timings), and C1 restores
  through the same mechanism the owner already rated and adopted (09 A). I keep C1 exact with first-divergence logged;
  if its divergence distribution is earlier than the control's, it falls to a rating.
- **Order of C1 vs C4a.** Sol ranks C4a above C1. C4a is cheaper, but C1 targets the larger wait (22.6 s on 40 % of
  replies in illustrated play vs 2-3 s on read-following turns). I keep C1 first in value and run C4a in parallel since
  it needs no patch.
- **C4 quality.** Sol calls the later landing a narrative change. The requeued read is the identical request over the
  same input range, so its result is the same distribution; only the boundary it lands on can move, which the freshness
  floor bounds. Agreed it needs that floor, not that it needs a rating.

Sol's own top 5: R2; C2 instrumentation then smallest fix; C4a bounded; C1 feasibility then paired bench; C3 token
eligibility and a privacy-partitioned trial.

## Unresolved questions

- Owner: move to Artemis v1.2 (opens DFlash/EAGLE-3, C8)?
- Where does host RAM go during play (5-9 GiB available with a 4 GiB cache)? A per-process snapshot would size C5 and A2.
- Image mix in owner play: SDXL scenes (C1) vs qwen edits (C2)? Add lease kind and timestamp to `controller.log`.
- C1 rating: exact class (my position) or blind rating (Sol)?

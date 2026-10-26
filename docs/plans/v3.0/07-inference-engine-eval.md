# Plan 07 — Inference engine evaluation (Artemis 31B, one 3090)

**Status: SPIKE done 2026-10-26: ExLlamaV3 dropped (floors missed); llama.cpp b11888 + gateway member-state cache recommended (warm member switch 9-10 s → 4.7-6.0 s measured). See Spike results.** Research 2026-10-25. Follows plan 06
(`06-local-controller-perf.md`): same model, same corpus, same bench. Question (owner): is there a custom layer or another
inference engine that fits our workload better than llama.cpp?

Labels: **M** measured here or in plan 06, **S** read from source/config, **R** reported by a primary source (link),
**I** inferred (reasoned, not measured). Sources are listed per option; dates are the source's.

## Workload and constraints (from plan 06)

- Artemis 31B v1.1 = Gemma 4 31B dense fine-tune. 60 layers: 50 SWA (window 1024, 16 KV heads × 256) + 10 global
  (4 KV heads × 512, `attention_k_eq_v: true`); MTP drafter `gemma-4-31B-it-assistant` (S, `config.json`, GGUF log).
  The local GGUF `Artemis-31B-v1m-Q4_K_M` comes from `TheDrummer/Artemis-31B-v1.1-GGUF` (v1m = the v1.1 release build) (S, config path).
- Group chat, 8-10K-token chat prompts, 78 % of requests are 1-3K side passes on the same model; thinking on; RP samplers
  (temp ~1, min_p, DRY, XTC); Text Completion with the Gemma 4 template; logprobs (`judge/llamaLogprob.ts`) and
  GBNF/`json_schema` (`copilot`, `sprites`) sometimes (S).
- Baseline b11388, `fast` profile, MTP 2: chat TTFT p50 8.5-9.0 s on member switch, prefill ~960 tok/s, decode
  41.7 / 46.6 tok/s chat/side, GPU free 1.5-1.8 GiB (M, plan 06). With the stable head + `promptReuse`: 1.93 s (no MTP),
  2.18 s (MTP) (M, plan 06 layout table).
- Host: i9-9900 (PCIe Gen3 CPU lanes), 32 GB RAM, ComfyUI shares the card. **The 3090 link reads Gen3 x8 under load**
  (`nvidia-smi pcie.link.gen.current 3`, `width.current 8`, `width.max 16`; M 2026-10-25) → ~7.9 GB/s theoretical
  host↔GPU, not the PCIe 4.0 x16 assumed in the brief.

## The physics every engine shares

- An SWA layer's state at position p depends on tokens p-1023..p. Reusing a cached prefix of length d needs the global
  layers' KV for 0..d **and** the SWA window ending at d. Every engine either (a) keeps full-length SWA KV (simple reuse,
  big VRAM), or (b) keeps only the window and restores from checkpoints/blocks that happen to end near d (S: llama.cpp
  `llama-kv-cache-iswa`, vLLM hybrid manager doc, exllamav3 `gemma4.py`, SGLang unified radix doc).
- Per-token KV of this model (S arithmetic from the GGUF log, checked against its buffer sizes):

| Part | q8_0 (llama.cpp) | FP16 (vLLM/SGLang default) |
|---|---|---|
| SWA, 50 layers (8,192 elements/layer/token) | 435,200 B ≈ 425 KiB | 800 KiB |
| Global, 10 layers (K and V stored, 4,096 el) | 42.5 KiB (1,360 MiB at 32K, M) | 80 KiB |
| One SWA window checkpoint (1,024 cells) | 425 MiB (M) | 800 MiB |

- **`--swa-full` cost** (S arithmetic): 32,768 × 425 KiB = **13.28 GiB** at q8_0 (+12.66 GiB over today's 637.5 MiB SWA
  ring); 16K: 6.64 GiB; 12K: 4.98 GiB; q4_0 KV at 32K: 7.03 GiB. With MTP ~1.6 GiB is free, so swa-full fits ≈5.5K tokens
  of context, below a single chat prompt. **Not viable on 24 GB** (agrees with plan 06 F4).
- Conclusion before any engine: no engine removes the window constraint on 24 GB. What differs is (1) **where restore
  points can be** (llama.cpp: two fixed end-of-prompt checkpoints; exllamav3: a configurable grid; vLLM: any 16-token
  block still in the pool; SGLang: radix nodes whose SWA tail survived), (2) **how much host RAM can back them**,
  (3) kernels (prefill/decode speed), (4) quant quality, (5) sampler/API parity.

## Options

### A. llama.cpp, newer build + a gateway member-state cache (stay)

- **Build gap.** We run b11388 (2026-10-04). Merged since (R, PRs): #26004 (2026-10-08) slot save/restore keeps the
  context checkpoints (before: restore lost them, next divergent prompt reprocessed fully); #30580 (10-15) off-by-two
  in the SWA reuse threshold (Gemma 4 E4B: 71 → 23 tokens reprocessed after restore, 53 → 17 after a RAM-cache switch);
  #30574 (10-15) slot file carries the MTP/draft state (acceptance after restore 37 % → 49 % on a Qwen MTP case);
  #30666 (10-19) no restoring SWA checkpoints from an unrelated prompt. Latest is b11888 (2026-10-25), downloaded.
  Flags unchanged for us except `--spec-draft-n-ubatch` (S, `--help` diff).
- **Member-state cache (custom layer, gateway).** With `--slot-save-path`, `POST /slots/0?action=save|restore`
  keyed by member: after member X's reply, save; before X's next turn, restore, then the prompt only processes what
  changed since X's last turn. On b11388 this cannot work (checkpoints and draft state are dropped by save/restore,
  #26004/#30574); on b11888 it can (I). Cost per switch: state 1.2-1.6 GiB; plan 06 measured RAM-cache save + load at
  0.37-0.77 s per switch, i.e. 3.9-8 GB/s for ~2.8 GiB moved, already at the Gen3 x8 limit (M + I) → ~0.2 s/GiB each
  way. Slot files go to disk (NVMe, OS file cache) instead of the 512 MiB-capped RAM cache, so a member's state is not
  evicted by two other members plus side passes (the plan 06 failure mode).
- **When it matters.** With the stable head (one head for all members, plan 06) the growing prefix already restores via
  `promptReuse` (1.9-2.2 s, M). The member cache is the path if the owner keeps per-member heads: expected TTFT
  ≈ 0.3-0.5 s restore + the delta since that member's last turn (2-3 other replies + tail, ~1.5-3K tokens at ~950 tok/s)
  ≈ **2-3.5 s instead of 8.5-9 s** (I). It also gives side passes their own saved state (read and inner-beat prompts
  share their own heads) (I).
- `--cache-reuse` (KV shifting) with `--swa-full`: needs swa-full (does not fit); shifted chunks keep KV computed after a
  different predecessor, so it is approximate anyway (S + I). Drop.
- DFlash/EAGLE3 drafters exist for **Artemis v1.2** (`dgibbons/Artemis-31B-v1.2-dflash` 5.4 GB, `-eagle3` 4.5 GB, HF
  format, trained on H100; S, HF API) and llama.cpp lists `draft-dflash`/`draft-eagle3` spec types (S, `--help`). Not
  for v1.1 and not GGUF; an upgrade to Artemis v1.2 would make them testable. The viral "82 → 381 tok/s on a 3090" was
  MTP + DFlash2, not the unlock (R, unlock report).
- Fit: full (it is today's engine; GBNF, logprobs, DRY/XTC/min_p, `--fit`, controller support). 3090 unlock: ~0 (Q4
  MMQ is INT8; FA's Q·Kᵀ half gains a little at depth) (R, unlock report).

### B. ExLlamaV3 + TabbyAPI (Windows native)

- **Gemma 4: supported** (`Gemma4ForConditionalGeneration`, E2B/E4B excepted) (R, README); **Gemma 4 MTP drafter
  (`Gemma4AssistantForCausalLM`) supported since v1.6.5, released 2026-10-25** (R, release notes) — brand new.
- **Artemis v1.1 EXL3 exists**: `MikeRoz/Artemis-31B-v1.1-exl3` (2026-08-07): 3.0 bpw 14.96 GiB, 3.5 bpw 16.66 GiB,
  **4.0 bpw 18.37 GiB**, 6.0 bpw 25.5 GiB (S, HF API). Same base model as our GGUF, so a clean A/B.
- **Quality per bit**: on Gemma 4 12B (RTX 5090, 2026-09-14), mean KLD vs BF16: EXL3 4.0 bpw **0.0248**, GGUF Q4_K_M
  0.0399, UD-Q4_K_XL 0.0361, Q5_K_M 0.0172; EXL3 3.0 bpw 0.094 (R, atomic.chat; third party, one model). Prefill at 2K:
  EXL3 ~4,100 vs GGUF ~1,760 tok/s; at 8K the gap narrows to roughly 3,800-5,200 vs 3,700-4,200; **decode: llama.cpp
  15-21 % faster** (113 vs 139 tok/s at 4 bpw) (R).
- **SWA handling** (S, `architecture/gemma4.py`, `generator.py`, TabbyAPI `config_sample.yml`): SWA layers are a
  "recurrent state" (window ring) unless `swa_full`; global layers are paged KV with chained page hashes (prefix tree,
  vLLM-like). Restore points = recurrent checkpoints at a configurable grid: `recurrent_checkpoint_interval` near the
  prompt end and in output (Gemma 4 default 6,144), `recurrent_checkpoint_interval_pp` during ingestion (default 32,768),
  multiples of 256, in system RAM (`sysmem_recurrent_cache`, default 4 GB). Plus a pinned host-RAM K/V page tier
  (`sysmem_kv_cache`) and an optional disk tier. With a 1,024 grid near the end, a stable-head member switch replays
  ≤1,024 tokens past the divergence instead of the whole prompt: a native version of our `promptReuse` prefill trick
  (I). Each checkpoint is one SWA window state (≈800 MiB FP16, less with cache quantization if the checkpoint keeps it;
  unverified) (I), so the grid must stay coarse; TabbyAPI notes cold prefill is 2-3 % slower at a 1-2K grid (R).
  Global layers store K only (`use_k_as_v`), half llama.cpp's global KV (S, I for the memory effect).
- **Samplers**: temperature, top-k/p, **min_p, XTC, DRY, rep/presence/frequency penalties, adaptive-P** (S,
  `sampler/custom.py`). Constraints: JSON schema, regex, **EBNF** (formatron/llguidance), not GBNF verbatim (R,
  TabbyAPI README) → our GBNF strings need a converter or a JSON-schema path (I). OpenAI `/v1/completions` text API,
  speculative via draft model or `draft_mode: mtp`, continuous batching with paged attention on Ampere+ (R).
- **Windows**: native wheels (`exllamav3-1.6.5+cu128.torch2.9.0-cp312-win_amd64`) + `triton-windows` (R, release
  assets, README). Installed in a uv venv in 4.8 GB (M).
- VRAM (I): 18.37 GiB weights (4.0 bpw; whether the 262K-row embedding stays on GPU decides ~1 GiB) + drafter BF16
  0.94 GB + global KV 32K at 8-bit ~0.3-0.7 GiB + one SWA ring + chunk activations. Expect about the same free VRAM as
  llama.cpp + MTP (~1.5-2 GiB); 3.5 bpw buys +1.7 GiB if quality holds.
- Integration (I): Python server; the controller gains a backend type (start/stop/health on `/health`, `/v1/model`
  load/unload for residency). No `--fit`: VRAM is set by `cache_size`, `max_batch_size`, `autosplit_reserve`. The
  gateway's `/completion`-specific code (`promptReuse`, timings) needs an OpenAI-path twin; the bench now has one.
- Unlock: little. EXL3 GEMM kernels are custom; ExLlamaV2 prefill used FP16-accumulate `cublasHgemm` (R, unlock
  report); EXL3 not analysed (I: small).
- Risks: MTP support is one day old; decode may be slower than llama.cpp; GBNF; logprobs format through TabbyAPI
  (unverified); Triton JIT on Windows (first-run compile time).

### C. vLLM (WSL2)

- Gemma 4 recipe badge "vLLM 0.19.1+"; stable is v0.32.0 (2026-10-18) (R). **Gemma 4 MTP PR #41745 merged 2026-05-06**
  (S, GitHub API), so the recipe's "nightly only" note is stale (I). With MTP, `--attention-backend TRITON_ATTN` is
  required because FlashAttention lacks the 512-dim global heads (R, LMCache recipe).
- **Prefix caching on SWA** (R, hybrid KV cache manager design doc): SWA blocks leaving the window are freed to the LRU
  queue (hash kept); a hit needs only the last `window-1` tokens cached for SWA layers plus the full-attention prefix.
  So any 16-token boundary can be a restore point — if those blocks survived eviction (I). Gemma-3-style layer counts
  need padding groups ("some memory waste") (R).
- **Quant on Ampere**: FP8 and NVFP4 recipes need Hopper/Blackwell (R). Marlin W4A16 (GPTQ/AWQ, compressed-tensors)
  runs on Ampere and accumulates in FP32 (R, unlock report). **No Artemis v1.1 W4A16 exists**; `dgibbons/
  Artemis-31B-v1.2-GPTQ-W4A16` (19.11 GB, compressed-tensors, 2026-10-03) is **v1.2** (S, HF API). Quantizing v1.1
  ourselves needs the 62.6 GB BF16 checkpoint and more RAM than 32 GB (a pod: ~14 min on an H100 per that repo's
  `run.json`) (S + I). A forum bot claims AWQ + MTP is unsupported (R, unverified).
- **VRAM is the blocker** (I): ~17.8 GiB weights + 0.9 GiB drafter + CUDA graphs/activations ~1-1.5 GiB + Windows
  desktop ~0.9 GiB leave ~2-3 GiB of KV pool at `gpu_memory_utilization` ~0.95. FP16 KV is ~880 KiB/token (SWA +
  global), so one active 10K request needs ~0.8 GiB SWA window + ~0.8 GiB global; almost nothing stays cached for the
  next member. Prefix caching would mostly miss on member rotation. FP8 KV storage on Ampere: unverified.
- **Samplers**: min_p yes; **no DRY, no XTC** in `vllm/sampling_params.py` (S, main) → RP sampler regression unless a
  logits-processor plugin. GBNF via structured outputs backends (xgrammar/llguidance; GBNF support unverified).
- ComfyUI: `gpu_memory_utilization` preallocates; sleep mode level 1 offloads weights to CPU RAM (needs ~18 GB in the
  WSL VM; `.wslconfig` already sets 24 GB for AssetGen) and HTTP sleep/wake needs `VLLM_SERVER_DEV_MODE` (R, sleep mode
  doc). Model reload otherwise.
- Unlock: helps (Marlin + Triton attention accumulate in FP32): +9-36 % prefill reported (R, unlock report).
- Fit: low for one 24 GB card with a 31B (no DRY/XTC, v1.2-only quant, KV-starved, WSL2, preallocation).

### D. SGLang (WSL2/Docker)

- Gemma 4 support merged 2026-04-07 (PR #21952: hybrid SWA layer types, reasoning/tool parsers) (R). Cookbook targets
  2×H200 or 1×B200 for 31B; MTP via `--speculative-algorithm NEXTN` with the assistant model; Triton attention backend
  chosen automatically (R, cookbook). No native Windows (I; no Windows build documented).
- **Radix tree**: per-member branches over a shared trunk is exactly what RadixAttention models. But for hybrid SWA the
  tree keeps only a window-plus-page SWA tail per node and evicts SWA data of internal nodes first (R, session radix
  cache doc; Unified Radix Cache replaced `SWARadixCache`). A branch point deep inside the old prompt keeps its full-layer
  KV but loses its SWA window once the old request ran >1,024 tokens past it, which our ~1.3K-token tails do (I). Same
  VRAM starvation as vLLM on 24 GB (I).
- Samplers: min_p yes; **no DRY/XTC** in `sampling_params.py` (S). HiCache (host tier) for hybrid SWA: not verified.
- Fit: lowest of the serving engines here; most work.

### E. Others

- **ik_llama.cpp**: no SWA KV compression (#1607 open since 2026-04-09; reporter on 3×3090 reached ~65K context vs
  mainline's 262K) → stores full-length SWA KV, i.e. swa-full cost (13.3 GiB at 32K q8_0). Drop (R).
- **TensorRT-LLM**: has `modeling_gemma4.py` (S); Windows support deprecated in 0.18 and slated for removal (R); no
  DRY/XTC; engine builds per config. Drop.
- **MLC-LLM**: has a `gemma4` model (S); own quant format, no MTP, no DRY/XTC, last commit 2026-10-06. Drop.
- **Aphrodite** (vLLM fork with RP samplers): no Gemma 4 model file found in its tree (S). Drop for now.

## Ranking

| # | Option | Member-switch TTFT (expected) | Decode vs 40 tok/s MTP | VRAM left for ComfyUI | Quality risk | Windows | Integration | Unlock |
|---|---|---|---|---|---|---|---|---|
| 1 | llama.cpp b11888 + stable head + `promptReuse` (built); member-state slot cache if per-member heads stay | 1.9-2.2 s (M, stable head); 2-3.5 s per-member heads (I) | = (M) | = (~1.6 GiB with MTP) | none | native | small (binary swap; slot cache ~1 module) | ~0 |
| 2 | ExLlamaV3 / TabbyAPI, EXL3 4.0 bpw + MTP | 1.5-2.5 s with a 1K checkpoint grid (I); cold ~0.8-1.0× llama.cpp prefill time (I) | 0.8-1.0× (R: −15-21 % without MTP; MTP unmeasured) | ≈ same; 3.5 bpw +1.7 GiB | lower KLD per bit (R); GBNF → EBNF | native | medium (new backend type) | small |
| 3 | vLLM, Artemis v1.2 W4A16 + MTP | cache mostly misses on 24 GB (I) | ≈ (I) | none while loaded; sleep mode | **v1.2 not v1.1; no DRY/XTC** | WSL2 | high | +9-36 % prefill (R) |
| 4 | SGLang | as vLLM (I) | ≈ (I) | none while loaded | as vLLM | WSL2/Docker | high | as vLLM |
| — | swa-full, ik_llama.cpp, TRT-LLM, MLC, Aphrodite | — | — | — | — | — | — | dropped |

**Recommendation.** No engine changes the window physics on 24 GB; the measured 4× TTFT gain already comes from the
layout (plan 06). Do 1 first (b11888 bench, then the member-state cache only if the owner rejects the stable head),
and spike 2 because it is the only alternative that is native on Windows, keeps DRY/XTC, has a v1.1 quant for a clean
A/B, a finer restore grid plus a host-RAM page tier, and better quality per bit. vLLM/SGLang only if a later
multi-request workload (batched side passes) or a bigger card changes the VRAM picture.

## Spike plan

Downloads/installs done 2026-10-25 (owner OK given via coordinator: "free to download and test everything that fits on C"):

| What | Where | Size |
|---|---|---|
| llama.cpp b11888 CUDA 12.4 (cudart copied from b11388) | `C:\dev\tools\llama-b11888-cuda12.4` | 0.7 GB |
| `MikeRoz/Artemis-31B-v1.1-exl3` `4.00bpw_H6` | `C:\dev\models\llm\Artemis-31B-v1.1-exl3\4.00bpw_H6` | 19.7 GB |
| `google/gemma-4-31B-it-assistant` (MTP drafter, BF16) | `C:\dev\models\llm\gemma-4-31B-it-assistant` | 0.97 GB |
| TabbyAPI `564f8fb` + exllamav3 1.6.5 (torch 2.9.0 cu128, triton-windows 3.8) | `C:\dev\tools\tabbyapi` (uv venv) | 4.8 GB |
| Spike config (port 18892, cache 8,8, batch 1, grid 1024/2048, sysmem 6 GiB recurrent + 2 GiB K/V) | `C:\dev\tools\tabbyapi\config-spike.yml` | — |

Not downloaded (needs the space or a pod): vLLM path = `dgibbons/Artemis-31B-v1.2-GPTQ-W4A16` 19.1 GB + vLLM in WSL
(~8-10 GB on the ext4 vhdx) + matching v1.2 GGUF for parity; only after deleting the EXL3 files. Optional 3.5 bpw EXL3
(17.9 GB) if 4.0 bpw leaves too little VRAM.

Bench (`scripts/local/bench-controller.mjs endpoint`, added in this plan): same corpora as plan 06 (`corpus.json`
rotating members, `corpus-samemember*.json`, `corpus-joined-late.json`), same seed, chat 192 / side 96 tokens, OpenAI
`/v1/completions` streaming for every engine (llama.cpp included via `--llama-arm`, so the client path is identical);
TTFT client-side, cached tokens from `usage.prompt_tokens_details` or llama.cpp `timings`, decode from token count over
the stream span, nvidia-smi every 500 ms. `--full` keeps every output (1,024-token cap) in `outputs.jsonl` for rating.

GPU order (controller and ComfyUI stopped; ~30-45 min per engine):

1. llama.cpp b11888: `text --arms base,config` with `binary` pointed at b11888 (temporary config copy), then
   `endpoint --llama-arm config --label l888` on recorded and joined-late corpora, and `--full` on 8 chat prompts.
2. TabbyAPI 4.0 bpw without draft, then with the assistant drafter (`draft_mode: model`, n=2), on the same corpora;
   grid 1024 vs default; `--full` on the same 8 prompts.
3. Quality parity: 8 chat + 8 side prompts × 2 engines, same sampler values, seed fixed; pairs shuffled and blinded,
   rated by Sol (`openai/gpt-6.1-sol`) on coherence, character voice, instruction following, prose; plus a
   logprob/KLD-free check: thinking block present and closed, no template leaks.

Predeclared floors (adopt ExLlamaV3 only if all hold; a miss is recorded, never retuned):

- Rotating stable-head corpus chat TTFT p50 ≤ llama.cpp `config` + reuse (2.18 s) × 0.9, or recorded-layout chat TTFT
  p50 ≤ 0.5 × llama.cpp base.
- Chat decode p50 ≥ 0.9 × llama.cpp + MTP (41.7 tok/s → ≥ 37.5).
- GPU free after load ≥ 1,536 MiB (the `--fit` target) and RAM available ≥ 10 GiB during the run.
- Sol blind preference ≥ 45 % for EXL3 over 16 pairs with no category below 40 %; 0 template/thinking breaks.
- DRY/XTC/min_p accepted by name (no silent drop: verified in TabbyAPI's logged generation params once).
- b11888 adopted if it is no worse than b11388 on `text --arms base,config` (TTFT ±5 %, decode ±3 %) and the slot
  save/restore round trip keeps checkpoints (reused tokens > 0 after restore on the same-member corpus).

## Spike results 2026-10-26 (GPU 00:41-01:44Z, 63 min)

New facts before the run (coordinator, owner): the stable head is **rejected** (9 of 12 groups have member-secret card
text, so join mode leaks; blind rating voice -0.35, guidance -0.30) and the depth-0 block move is being reverted. Owner
keeps per-member heads and the old depths, so the measured path is a **per-member state cache** on the recorded layout.

Conditions (M): recorded rotating corpus (`corpus.json`: 8 chat 7.9-9.6K tokens from 3 members in rotation, 16 side
passes, seed 1234, chat 192 / side 96 tokens), same-member corpus where stated. The machine was shared: another agent
ran `npm run gates` (jest, Storybook with Chromium) and no-model lanes during the whole window; b11888 `base` decode
dipped to 21-26 tok/s mid-run while b11388 `base` 20 min later held 30-31, so treat single-arm decode as ±15 %.
Power limit 350 W, Gen3 x8 link (as above).

### llama.cpp b11888 vs b11388 (rotating, recorded layout)

| Arm | Build | Chat TTFT p50 | Side TTFT p50 | Decode chat | MTP accept | GPU free min | Prompt tokens processed |
|---|---|---|---|---|---|---|---|
| base | b11388 | 8.46 s | 2.10 s | 30.9 | | 2,298 | 94,984 |
| base | b11888 | 9.21 s | 2.20 s | 24.4 (contended) | | 2,293 | 94,984 |
| config (MTP 2) | b11888 | 9.11 s | 2.16 s | 42.9 | 0.61 | 1,310 | 94,984 |
| config (MTP 2), plan 06 22:45 run | b11388 | 8.66 s | 2.21 s | 41.7 | 0.59 | 1,547 | 94,984 |
| config + member cache, cut prefill | **b11388** | 9.63 s | 2.16 s | 42.1 | 0.59 | 1,397 | 94,984 (restore kept no checkpoint) |
| config + member cache, no cut | b11888 | 9.45 s | 2.16 s | 44.2 | 0.61 | 1,215 | 94,984; exact repeat 10.1 → 1.7 s |
| **config + member cache, cut prefill** | **b11888** | **5.97 s** | 2.07 s | 44.1 | 0.59 | 1,498 | **64,203 (-32 %)** |

Full-length outputs (8 chat prompts, 1,024-token cap, MTP 2, thinking on), b11888: decode 40.8 tok/s, acceptance 0.51,
every reply closed its thinking (M).

Member cache (bench `membercut` arm; M): key = hash of the first 2,000 prompt characters (the member's head); before a
member's chat, `POST /slots/0?action=restore` of that member's file, then a prefill of the prompt cut at the first
in-history `<|turn>system` block (the depth-4 Author's Note / Story Orchestrator blocks), then the request; after the
reply, `action=save`. `--cache-ram 0 --ctx-checkpoints 4 --slot-save-path`.

- Cold turns (first appearance of each member, 3 of 8): 7.8-8.2 s, as base.
- Warm turns (5 of 8): **4.7-6.0 s** = restore 1.40-1.62 s + prefill to the cut 1.8-2.7 s (1.4-2.3K tokens: the
  messages since that member's previous cut) + final 1.1-1.2K tokens (the depth-4 tail). That tail and the 4 messages
  under it are reprocessed every turn by construction of the old layout; this is close to the floor for it.
- State per member: **2.0-2.1 GiB** on disk (KV of ~8-9K tokens + SWA ring + 4 window checkpoints of 425 MiB). Restore
  ran at ~1.4 GiB/s, below the Gen3 x8 link: the file path is the bound, not PCIe.
- Save: 1.46-2.13 s normally, with **outliers of 11.5, 39.5 and 63.2 s** while the gates run hammered C: (92-95 % full).
  A save blocks the slot, so the next request waits.
- The same arm on **b11388 restored tokens but no checkpoint** (#26004 not in that build): every warm turn reprocessed
  in full (9.3-10.8 s). The cache needs b11888 or later.
- No-cut variant: end-of-prompt checkpoints never cover the next turn's divergence, so nothing but exact repeats reuse.

### ExLlamaV3 1.6.5 / TabbyAPI, Artemis v1.1 EXL3 4.0 bpw

Config: `cache_mode 8,8`, `max_batch_size 1`, checkpoint grid 1,024 (end/generation) and 2,048 (ingestion),
`sysmem_recurrent_cache` 6-8 GiB; MTP = `gemma-4-31B-it-assistant` as draft model, 2 tokens.

| Arm | Chat TTFT p50 | Side TTFT p50 | Prefill | Decode chat / side | MTP accept | GPU free after load / min | RAM avail min |
|---|---|---|---|---|---|---|---|
| no draft, cache 32K, rotating | 13.0 s | 2.74 s | 773 tok/s | 31.1 / 33.7 | | 4,610 / 3,779 | 5.2 GB |
| no draft, same-member corpus | **4.84 s** (52-79 % cached) | 2.45 s | 720 | 31.0 / 33.5 | | 4,042 / 3,766 | 4.9 GB |
| MTP 2, cache 64K, rotating (sampler fix) | 11.2 s | 2.48 s | 788 | 40.7 / 59.9 | 0.51 | 2,373 / 1,486 | 4.3 GB |
| MTP 2, full length 1,024 | | | 679 | 38.3 | 0.39 | 1,633 / 1,525 | 5.1 GB |

- Loads in 13-26 s. Prefill is **~25 % slower than llama.cpp** on this card (773-788 vs ~1,030 tok/s); decode without
  MTP matches llama.cpp, with MTP is -5 % (rotating) to -6 % (full length).
- The checkpoint grid works natively for one member (same-member p50 4.84 s with no gateway; llama.cpp base was 10.73 s
  on that corpus in plan 06), but **rotation evicts it**: two other members' chats plus six side passes between a
  member's turns overflow the recurrent-state cache (FP16 window states), so rotating reuse was 0. More RAM is not
  available: RAM available already fell to 4.3-5.2 GB.
- **Sampler trap (found here):** our payloads carry `adaptive_target: -0.01`, which llama.cpp reads as disabled
  (negative = off) and TabbyAPI enables (`adaptive_target < 1.0`, `backends/exllamav3/sampler.py`). The first MTP run
  had 4-17 % acceptance and garbled text because of it. The bench now drops a negative target; a production adapter
  would have to do the same. DRY, min_p, penalties were accepted by name (TabbyAPI log).
- Quality, Sol blind A/B (`openai/gpt-6.1-sol`, 8 chat prompts, order shuffled, a = llama.cpp b11888 MTP, b = EXL3 4.0
  bpw MTP, both 1,024-token cap, same sampler values): **EXL3 preferred 3 of 8 (37.5 %)**; mean deltas EXL3 - llama:
  coherence -0.50, voice -0.75, guidance -0.50, continuity -0.13, prose -0.75; broken 2 vs 1; **2 of 8 EXL3 replies
  never closed their thinking** (planning leaked into the reply), 0 of 8 for llama.cpp. Small sample, one rater.

### Floors (predeclared above)

- b11888 adoption: TTFT within ±5 % and decode within ±3 % of b11388 on `base,config`: MTP arm decode +2.9 % (42.9 vs
  41.7) and TTFT +5.2 % (9.11 vs 8.66, different day); `base` TTFT +8.9 % and decode -21 % in a contended window, against
  a same-session b11388 `base` run 20 min later. **Not decided cleanly**: the MTP arm (the owner's config) is at parity,
  the `base` arm needs a quiet rerun. Checkpoints after restore: **pass** (64,203 vs 94,984 tokens processed).
- Member cache, plan 06 floor B (chat TTFT p50 ≤ 50 % of base): 5.97 / 9.11 = 66 % (warm turns only ≈ 57 %): **miss**.
- ExLlamaV3: TTFT **miss** (11.2 s vs ≤ 0.5 × base 4.6 s); decode **pass** (40.7 ≥ 37.5); GPU free **pass** (2,373 ≥
  1,536); RAM ≥ 10 GiB **miss** (4.3 GB); Sol preference **miss** (37.5 % < 45 %, voice and prose below); thinking breaks
  **miss** (2 of 8); DRY/XTC/min_p by name **pass**. **Dropped.**

### Recommendation (2026-10-26)

1. **llama.cpp b11888** is required for any member cache (checkpoint-preserving slot files). Swap after one quiet
   `text --arms base,config` rerun confirms the `base` decode dip was contention.
2. **Build the member-state cache in the gateway** (the bench arm is the prototype): key on the head hash, prefill to the
   first in-history system block, restore before the member's chat, save after the reply. Measured gain: warm member
   switch 9-10 s → 4.7-6.0 s; p50 over a rotation with cold first turns 9.1 → 6.0 s. Before shipping:
   - keep only the cut checkpoint (2.0 → ~1.2 GiB per member; `--ctx-checkpoints` keeps the newest, which drops the
     cut one, so this needs the gateway to order the save or a server patch) (I);
   - hold the states in RAM (an in-process store or the server's RAM cache sized per member), not on C:, to remove the
     11-63 s save stalls and the 1.4 s file restore (expected ~0.3 s at the Gen3 x8 rate) (I);
   - do the save in the idle gap after a reply, never in front of the next request (I);
   - budget: 3-5 members × ~1.2-2 GiB of host RAM beside ComfyUI's 8 GiB staging; evict least recently spoken.
   Expected warm TTFT then ≈ 3.5-4.5 s (I), limited by the old layout's 1.1-1.2K-token tail plus new messages.
3. Drop ExLlamaV3, vLLM and SGLang for this workload. EXL3 files, the drafter and TabbyAPI were deleted after the run
   (25.5 GB freed); b11888 stays at `C:\dev\tools\llama-b11888-cuda12.4`.

## Gate record 2026-10-26

- GPU 00:41-01:44Z (63 min): b11888 `base,config` (00:41), member arms (00:50, the first attempt failed at load because
  `--slot-save-path` needs an existing directory; fixed), b11388 control `base,config+membercut` (01:00), llama
  full-length (01:09), TabbyAPI no-draft rotating + same-member (01:14-01:24), MTP rotating (01:24, invalid: adaptive-P
  trap), MTP rotating fixed + full length (01:36-01:43).
- Runs under `C:\dev\so-lanes\bench-controller\`: `text-2026-10-26T00-41-28-323Z` (b11888 base/config),
  `text-2026-10-26T00-50-37-411Z` (member arms), `text-2026-10-26T01-00-08-666Z` (b11388 control),
  `endpoint-l888-full-2026-10-26T01-09-14-120Z`, `endpoint-exl3-nodraft-2026-10-26T01-14-12-922Z`,
  `endpoint-exl3-samemember-2026-10-26T01-19-42-464Z`, `endpoint-exl3-mtp2-c64k-2026-10-26T01-23-55-435Z` (invalid),
  `endpoint-exl3-mtp2-fixed-2026-10-26T01-36-21-220Z`, `endpoint-exl3-full-fixed-2026-10-26T01-40-10-175Z`;
  rating and TabbyAPI logs in `rating-07/`. Logs `run-07-*.log`.
- Controller stopped with `node scripts/local/cli.mjs stop` before each GPU block and restarted with `start`; final
  `/status`: phase `text`, `speculative: draft-mtp2`, profile `fast`, image residency `ram-warm` (as found). Controller
  config untouched (b11888 ran from a scratch copy passed with `--config`). Owner's ST data untouched.
- Bench changes (`scripts/local/bench-controller.mjs`): `endpoint` mode (OpenAI `/v1/completions`, any engine,
  `--llama-arm`, `--full`), `member`/`membercut` arms (`--slot-save-path`, `--member-dir`), negative `adaptive_target`
  dropped on the OpenAI path. Checked with `node --check` and the live runs above; no gates run (scripts/local bench
  only, no `src/` change).
- Deviations: machine shared with another agent's gates for the whole window (decode noise); no b11388 full-length
  outputs, so build parity on quality rests on identical settings and closed thinking, not a rating; Sol rating on 8
  pairs (floor asked for 16); vLLM skipped (coordinator).

## Unresolved questions

- Quiet rerun of b11888 `base` (decode dipped under another agent's load) before swapping the controller binary?
- Member cache store: in-process RAM store in the gateway, or a llama.cpp patch so the RAM prompt cache keys by member
  and keeps only the cut checkpoint? RAM budget per member (1.2-2 GiB) beside ComfyUI's 8 GiB staging.
- Card at PCIe Gen3 **x8** (max x16): slot sharing or seating? Doubles every host↔GPU restore if it can run x16.
- Side passes (78 % of requests) stay uncached; a per-role cache for read/inner prompts was not measured.
- Move to Artemis v1.2 (has W4A16, DFlash, EAGLE3 builds)? Out of scope here.

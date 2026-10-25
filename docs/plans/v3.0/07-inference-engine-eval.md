# Plan 07 — Inference engine evaluation (Artemis 31B, one 3090)

**Status: RESEARCH done 2026-10-25; spike staged (downloads + installs done, no GPU used yet).** Follows plan 06
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

## Unresolved questions

- Stable head on the owner's install (plan 06 question) decides whether the member-state cache is needed at all.
- Card at PCIe Gen3 **x8** (max x16): slot sharing or seating? Doubles every host↔GPU restore if it can run x16.
- GBNF users (copilot, sprites): accept EBNF/JSON-schema conversion if ExLlamaV3 wins, or keep llama.cpp for those calls?
- Move to Artemis v1.2 (has W4A16, DFlash, EAGLE3 builds)? Out of scope here; it would reopen C and the drafter options.
- Delete the EXL3 files (19.7 GB) after the spike if it misses its floors?

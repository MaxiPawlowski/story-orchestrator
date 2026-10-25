# Plan 06 — Local controller performance (Artemis 31B on the 3090)

**Status: PLAN + partial bench, 2026-10-25.** Offline spikes done (logs, payload captures, source). GPU bench run once
(owner lifted the GPU pause for this topic, then paused it again at 20:42Z; 15 arms finished, 1 diagnostic arm killed
during load). No change to `src/`, `server-plugin/` or `config.json`. Bench: `scripts/local/bench-controller.mjs`; raw
logs: `C:\dev\so-lanes\bench-controller\` (outside the repo: the corpus holds real prompts).

Labels: **measured** (bench or log numbers), **source** (read from code or `llama-server --help` of b11388),
**unverified** (reasoned, not measured).

## Setup

- llama.cpp b11388 (`C:\dev\tools\story-orchestrator-local\llama-b11388-cuda12.4`), `Artemis-31B-v1m-Q4_K_M.gguf`
  (18.7 GB), profile `fast` (32K, all layers on GPU, `--fit-target` = `reserves.gpuMiB` 1024 + `fitMarginMiB` 512).
- Flags are fixed in `server-plugin/story-orchestrator-gpu/broker/backend.mjs` `nativeArgs`: `--parallel 1 --kv-unified
  --flash-attn on -ctk q8_0 -ctv q8_0 --cache-ram 512 --fit on`.
- GPU at bench time: RTX 3090, driver 621.01, power limit 350 W (default 350), max SM 2100 MHz. **Prefill hits the power
  limit**: 350-354 W per arm, median SM 1605-1635 MHz. Host: i9-9900, 32 GB.

## Findings

### F1 Who calls the model (measured)

- Two request classes are visible in the native log. ST's chat generation sends the preset sampler list (no `tfs_z`).
  Story Orchestrator passes go through the Connection Manager profile and send `tfs_z`/`typical_p`, which llama-server
  warns about (`unable to match sampler by name 'tfs_z'`). Checked on two payload captures:
  `so-lanes/45/debug/s6h/payloads.jsonl` (120 chat without, 11 inner + 12 synthesis with) and
  `so-lanes/42/debug/v29gpu2/payloads.jsonl` (226 chat without, every side pass with).
- `native-1791494262023-fast.log` (2026-10-09 11:13-23:13Z, 3,161 requests): **chat 437 (13.8 %), side 2,724 (86.2 %)**.
  Transitions SS 2,293, SC 430, CS 430, CC 7. Chat prompts p50 12.4K tokens and 532 generated; side p50 3.0K and 127.
- The 20 largest native logs (13,133 requests, 2026-10-08 to 10-25): chat 22.4 %, side 77.6 %. Side passes take 56 % of
  prefill time (8.2 of 14.7 h) and 49 % of decode time (13.3 of 27.0 h).
- Which side passes (lane 42 capture, 2026-10-23, 303 side requests, probes excluded): story read 136 (45 %), inner beat
  132 (44 %), synthesis 22 (7 %), "What could I do?" 12 (4 %). Sequence per drafted member: inner beat, read, chat
  (`.iRiC RRiC R`). All route to the memory-model profile, hence the same llama-server (`runtime/passProfiles.ts`: an
  unset role uses the memory model). The judge is TypeSafe (remote), not this server.
- The peer's "9.2K / 4.5K alternation" is chat versus read/synthesis; the inner beat is the frequent small one.

### F2 Prefix reuse is zero (measured)

- Oct-09 log: chat requests reused 0 tokens at p90 (15 of 437 reused anything); side 9.8 % of tokens on average.
  Slot picks: LRU 2,411, LCP 761. `prompt state size ... exceeds cache size limit 512 MiB` 2,669 times (states 1.1-2.7 GiB).
- Every bench arm on the real corpus reused **0 tokens** in 24 requests, whatever the flags (table below).
- Why, from the verbose 2026-10-04 log (`local-residency/baseline-diagnostic-32k-1791116485248.log`, source + measured):
  Gemma 4 keeps 50 of 60 layers as SWA (window 1024; SWA cache 1,536 cells, 637.5 MiB) and 10 global layers (32K cells,
  1,360 MiB). After the window slides, a shorter common prefix can be restored only from a **context checkpoint**:
  425 MiB each, at most 32, minimum spacing 8,192 tokens, and in practice created at the end of the prompt
  (`pos_max = n_tokens-512` and `n_tokens`). Otherwise `forcing full prompt re-processing due to lack of cache data`.
- Where consecutive chat prompts diverge (corpus, 8 chat prompts, 3 members in rotation):
  - **Different member: at character 172**, the line `Impersonate {{char}} ...` in the preset's system prompt, followed by
    that member's card. In the lane 42 capture 178 of 185 consecutive chat pairs are a member switch and share < 10 %.
  - **Same member: about 5,000 characters (≈1.3K tokens) before the end**, at the Author's Note system block, followed by
    Story Orchestrator's per-member private blocks at depth 4 (`memory/epistemic.ts` "Your private knowledge",
    `memory/innerRender.ts` "Your private aims", `pacing/guidance.ts` author direction, `runtime/delivery/render.ts`
    "Lately you keep using"; registry `src/constants/injectionRegistry.ts` depth 4). That is past the end-of-prompt
    checkpoint, so even a same-member repeat reprocesses in full.
  - Late lore placement (`runtime/lorePlacement.ts`) already moved per-turn lore; the two breaks above remain.

### F3 Baseline (measured, bench arm `base`, run twice)

24 real requests (8 chat 7.9-9.6K tokens, 8 reads ≈2.1-2.3K, 8 inner beats ≈0.7-1.2K), chat capped at 192 output tokens,
side 96, seed 1234, plus one 17.3K-token prefill row and one identical repeat ("swipe").

| Metric | base run 1 | base run 2 |
|---|---|---|
| Chat TTFT p50 / p90 | 9.02 / 9.91 s | 8.99 / 9.92 s |
| Side TTFT p50 | 2.20 s | 2.22 s |
| Prefill (prompts ≥ 1K) | 978 tok/s | 967 tok/s |
| Decode chat / side | 28.7 / 28.7 tok/s | 28.9 / 28.9 tok/s |
| 17.3K prefill row | 18.6 s, 939 tok/s | 18.6 s, 940 tok/s |
| Identical repeat after another prompt | 9.93 s (full reprocess) | 9.92 s |
| GPU free after load / min | 2,941 / 2,767 MiB | 2,956 / 2,947 MiB |
| Replay wall time | 189 s | 188 s |

Run-to-run noise ≈ 0.3 % on chat TTFT. Log baseline agrees: prefill p50 1,024 tok/s, decode p50 30 tok/s (Oct-09 log,
longer outputs).

### F4 Other findings

- **Streaming headroom** (measured, `controller.log`): 39 `stream-image` leases against 653 `swap-text`. Streams were
  admitted at 2.40-2.44 GiB free. Text alone leaves 2.77-2.96 GiB, so any extra VRAM on text (MTP, parallel 2) makes
  streaming rarer still.
- **Learned prompt time is a maximum** (source, `broker/scheduler.mjs` `recordTiming`: `promptMs: Math.max(old, new)`):
  `text-timings.json` holds 103,842 ms, an outlier that `textLatencyDecision` treats as the normal prompt cost.
- **Swipes are rare** (measured): 110 group chats in the owner's ST, 802 replies, 0 extra swipes. That limits the value of
  a bigger `--cache-ram` (F5 row C).
- **Unified KV** (source + measured): with `--parallel 2 --kv-unified` each slot reports `n_ctx_slot = 32768` over one
  shared pool. The gateway counts one request against `--ctx-size`; under parallel 2 the idle slot's cells also occupy
  the pool, so the accounting would have to add them or erase that slot first. Not built, because parallel 2 gained nothing.
- `--swa-full` is not viable (unverified arithmetic from measured sizes): SWA costs ≈425 KiB/token, so a full 32K SWA
  cache is ≈13.6 GiB of VRAM.

## Bench results (measured, 2026-10-25)

Main corpus (24 requests + long + repeat), one arm per row, same seed.

| Arm | Chat TTFT p50 | Side TTFT p50 | Prefill tok/s | Decode chat / side | MTP accept | Repeat TTFT | GPU free min | RAM avail min | Wall |
|---|---|---|---|---|---|---|---|---|---|
| base | 9.02 s | 2.20 s | 978 | 28.7 / 28.7 | | 9.93 s | 2,767 | 15,406 | 189 s |
| cram4096 | 9.38 | 2.41 | 961 | 28.8 / 28.5 | | **1.28 s** | 2,826 | 12,929 | 199 s |
| cram6144 | 9.47 | 2.44 | 965 | 28.7 / 28.6 | | **1.23 s** | 2,750 | 10,974 | 198 s |
| par2 | 9.21 | 2.23 | 963 | 28.2 / 28.4 | | 10.17 s | 2,394 | 17,051 | 192 s |
| par2pin (chat slot 0, side slot 1) | 9.25 | 2.22 | 962 | 28.1 / 28.2 | | 10.17 s | 2,389 | 16,570 | 192 s |
| mtp2 | 9.26 | 2.29 | 921 | **39.9 / 45.4** | 0.59 | 10.28 s | 1,915 | 16,421 | **164 s** |
| mtp3 | 9.15 | 2.29 | 921 | 39.0 / 46.0 | 0.51 | 10.10 s | 1,963 | 16,448 | 165 s |
| mtp4 | 9.08 | 2.30 | 924 | 35.5 / 46.0 | 0.42 | 10.22 s | 1,975 | 16,290 | 168 s |
| cms2048 (`--checkpoint-min-step 2048 --ctx-checkpoints 8`) | 9.01 | 2.22 | 945 | 28.7 / 28.8 | | 9.92 s | 2,792 | 17,134 | 190 s |
| kvq4v (`-ctv q4_0`, informational) | 9.02 | 2.17 | 979 | 26.4 / 26.4 | | 9.84 s | 3,289 | 16,595 | 195 s |
| cram8192+cms1024c4+mtp2 | 9.44 | 2.48 | 924 | 40.5 / 46.3 | 0.59 | 1.26 s | 2,060 | 9,354 | 171 s |

Same-member corpus (8 consecutive turns of one member, 6.9-13.1K tokens, with inner beat + read between): `base` chat
TTFT p50 10.73 s; `cram8192` 11.36 s; `cram8192+cms1024c4` 11.33 s. **0 tokens reused in all three.** Why the near-end
checkpoints did not restore is unknown: the verbose diagnostic arm was killed during load.

Prompt tokens processed were identical in every main arm (94,984). `--cache-ram` removed every `exceeds` line (0 vs 25)
and replaced them with 21-24 evictions; its state save adds ≈0.35 s to chat and ≈0.2 s to side TTFT. MTP loads the
drafter (514 MB file) and costs ≈0.85 GiB of VRAM; its prefill is 6 % slower (the drafter processes the prompt too).

Not measured: image bench, image→reply latency while streaming, `ctx64k`, the verbose checkpoint diagnostic,
MTP on the gateway path with real output lengths (outputs were capped at 192/96 tokens).

## Candidate changes, ranked

| # | Change | Expected gain | Cost and risk | Evidence |
|---|---|---|---|---|
| A | MTP drafter, `--spec-draft-n-max 2` (3 is close behind) | decode +39 % chat, +58 % side; replay wall −13 %; a 532-token chat reply ≈18.5 → 13.3 s | −0.85 GiB VRAM, so streaming is admitted even less (F4); prefill −6 %; +3 s load | measured |
| B | Prefix stability, host side: keep `{{char}}`-dependent text out of the head of the prompt (preset main prompt, card order, or ST's group "join cards" mode), and move SO's depth-4 private blocks to depth 0/1, below the last checkpoint | chat TTFT 9-11 s → ≈1.5-2.5 s if ≈85 % of the prompt is reused (estimate from 1.3K-token tails, unverified) | ST preset/group setting (owner's preset); depth changes alter what the model attends to, so a model-output gate is needed; same-member reuse failed with server flags alone, cause unknown | measured breaks; gain unverified |
| C | `--cache-ram 4096` | exact repeats (regenerate, retry after error) 9.9 → 1.3 s | +0.35 s per chat, +0.2 s per side on every switch; −2.5 GiB host RAM; 0 swipes in the owner's chats, so a net loss today | measured |
| D | Fix `recordTiming` to keep a median or EWMA of `prompt_ms`, not the maximum | better restore/shed decisions | none | source |
| E | Fewer side requests: batch the inner beat into the read, or skip it when nothing changed | side passes are 56 % of prefill time; one inner beat ≈1.2 s TTFT + decode | behaviour change, judged by model output | measured share; gain unverified |
| F | `--parallel 2` (pinned or not) | none | −0.49 GiB VRAM, +0.2 s TTFT | measured: drop |
| G | `-ctv q4_0` | +0.5 GiB free | decode −8 % | measured: drop |
| H | `--checkpoint-min-step` alone | none on this traffic | host RAM per checkpoint 425 MiB | measured: drop unless B lands |

Optional spike, not attempted: **vLLM** in WSL2, with automatic prefix caching and native MTP. It needs an AWQ/GPTQ export
of Artemis (may not exist), preallocates VRAM (conflicts with ComfyUI residency), and needs a second runtime. Worth it only
if B cannot be made to work in llama.cpp. Post-unlock idea: `llama-bench` with `GGML_CUDA_CUBLAS_COMPUTE_TYPE` needs a
`FORCE_CUBLAS` build, so skip it now.

## How each change would land (nothing edited yet)

- A: config `speculative: { model, type: 'draft-mtp', nMax }` read in `nativeArgs` (append `--model-draft`, `--spec-type`,
  `--spec-draft-n-max`). Raise `profiles.fast.estimatedGpuMiB` by ≈900. `--fit` already counts the drafter (free after
  load stayed above the fit target: 2,057 MiB). Decide whether `streamImages.minFreeGpuMiB` or the mode reserves move;
  the owner chooses between faster text and streaming. Timings key must include the drafter in `runtimeIdentity`.
- B: `src/constants/injectionRegistry.ts` depths and `runtime/lorePlacement.ts`; the ST preset/group mode is an
  install-side change with a `checksSetup.ts` row if it matters. Needs a payload golden diff and a model-output gate.
- C: config `cacheRamMiB` (default 512) in `nativeArgs`; `ramMiB` reserve plus the cache must fit beside ComfyUI's 8 GiB
  staging (min RAM available was 9.4-11.0 GiB with 6-8 GiB caches).
- D: `broker/scheduler.mjs` `recordTiming`, with a unit test in `scheduler.test.mjs`.
- F: if ever revisited, the gateway's `ContextRefusal` path must count the idle slot's cells, and `/props` `total_slots`
  must stop being hard-coded to 1.

## Benchmark protocol (one command, rerunnable)

- `node scripts/local/bench-controller.mjs corpus --from <payloads.jsonl> --chat <id> --min-chars 33000 --count 24
  --interleave inner,read`: builds the replay corpus (real prompts, outside the repo).
- `node scripts/local/bench-controller.mjs text [--arms base,mtp2,...]`: refuses when the controller (18888/18889) is up,
  port 18890 is busy or less than 21,000 MiB of GPU is free. It starts its own llama-server with exactly `nativeArgs`
  plus each arm's flags on port 18890, talks to it directly (not through the gateway), streams `/completion` at a fixed
  seed and records per request TTFT, prefill/decode tok/s, tokens reused, MTP drafted/accepted, min GPU free, min RAM
  available, power draw and SM clock (nvidia-smi every 500 ms). It also reads the slot picks, `exceeds` and eviction
  counts from the server log, and the driver/power limit/clocks into `header.json`. Each arm stops its server, and
  the arm aborts when RAM available falls below 3 GiB.
- `node scripts/local/bench-controller.mjs image`: starts its own ComfyUI on 18288 with the controller's arguments and
  runs the story SDXL graph (`src/image/graph.ts`, 28 steps) at a fixed seed: 2 warm-ups, then 6 timed runs, reporting
  median execution time without load. It records the attention line from the ComfyUI log. **Never run yet;** SageAttention
  is not installed in `comfy-cu130`, so SDPA is the only arm.
- Unlock before/after (owner, 2026-10-26): rerun `text --arms base,mtp2` and `image` with the same corpus. Record the power
  limit per row and never change it from the bench. Expect no decode change and at most a small prefill gain on the 17.3K
  row (FlashAttention MMA accumulates in FP32, quant matmuls are INT8 MMQ); images are where the unlock should show.

## Predeclared floors (for adoption, measured on the bench above or the gateway path)

- A ships if chat decode p50 ≥ +25 % over base, prefill ≥ −10 %, MTP acceptance ≥ 0.45 on real chat prompts with real
  output lengths, and GPU free after load ≥ the fit target. Today's run: +39 % / −6 % / 0.59 / 2,057 ≥ 1,536 → passes on
  the bench; the real-length gateway row is still to run.
- B ships if chat TTFT p50 ≤ 50 % of base on the same-member corpus and on the rotating corpus, and the model-output gate
  (blind rating on the changed depths) shows no regression.
- C ships only if regenerates/retries are ≥ 1 per 11 player turns (break-even of 8.6 s saved against ≈0.76 s added per
  turn) in the owner's play.
- Every adopted flag: no `--fit` reserve breach and RAM available ≥ `reserves.ramMiB` + 8 GiB staging during a streamed
  image.

## Gate record 2026-10-25

- GPU time ≈ 62 min (19:39-20:41Z). 16 server starts, no crash or restart. Each arm took ≈4 min: 164-210 s of replay
  (≈95K prompt tokens at ≈970 tok/s ≈ 98 s, plus 8 capped chat replies ≈ 53 s, 16 side replies, the 17.3K row 18.6 s
  and the repeat 10 s), 7-28 s model load (28 s cold for the first, 7-11 s from the OS file cache, 11-23 s with the
  MTP drafter), an 8-token warm-up, then stop plus a 2 s settle.
- Runs: `C:\dev\so-lanes\bench-controller\text-2026-10-25T19-39-26-207Z` (base), `...T19-44-11-398Z` (10 arms),
  `...T20-24-32-270Z` (same-member, 3 arms), `...T20-37-35-912Z` (combo), `...T20-41-38-129Z` (diagnostic, killed in load).
- After the stop: no llama-server, ComfyUI or bench process of this run left; GPU 917 MiB used; controller left stopped as found.
- Offline evidence: `C:\dev\so-lanes\0\debug\local-residency\native-*.log` (807 logs; the 20 largest parsed),
  `controller.log`, `text-timings.json`, the two payload captures named in F1.

## Unresolved questions

- Why did `--cache-ram 8192 --checkpoint-min-step 1024 --ctx-checkpoints 4` restore nothing on same-member prompts?
  The verbose arm (`cram8192+cms1024c4+v4` on `corpus-diag.json`, about 2 GPU minutes) answers it.
- A against streaming: is +39 % decode worth fewer streamed images (≈0.85 GiB less free)? Owner's call.
- B: may the preset's head be member-independent (owner's `Artemis v1.1 RP` preset, group join mode)?
- Should the inner beat be merged into the read (E), given it is 44 % of side requests?

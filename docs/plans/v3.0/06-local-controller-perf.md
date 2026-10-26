# Plan 06 — Local controller performance (Artemis 31B on the 3090)

**Status 2026-10-26: MTP on; slot pinning built (off); stable head NOT applied (blind rating below floor, B and C); depth-0 layout on master awaits the owner's call; see Follow-up 2026-10-26.** Earlier: MTP on, layout fixed, prompt reuse built, 2026-10-25 evening. Earlier: PLAN + partial bench, 2026-10-25. Offline spikes done (logs, payload captures, source). GPU bench run once
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

## Follow-up 2026-10-25 (evening): checkpoint diagnostic, prompt reuse, layout, MTP

Owner decisions 2026-10-25: enable MTP, fix the prompt layout, explore chunk-level reuse. Thinking and the inner voice
stay on (nothing below touches them).

### F5 Where llama.cpp b11388 checkpoints and when it restores (measured, verbose arm)

Run `text-2026-10-25T21-12-23-698Z` (`base+v4`, `cram8192+cms1024c4+v4` on `corpus-diag.json`).

- Every prompt gets exactly two context checkpoints, created while the prompt is processed: at `n_prompt - 4` and
  `n_prompt - 516` (e.g. a 6,916-token prompt: `pos_max` 6,911 and 6,399; a 12-token prompt: 7). `--checkpoint-min-step`
  does not stop the pair (seen with 8,192 and 1,024); it only drops a new checkpoint "too close to an earlier one". Each
  holds the SWA window, 425 MiB at full size, in host RAM; at most `--ctx-checkpoints` per slot (default 32).
- A checkpoint restores only when its first position is below `n_past - n_swa` (`checking checkpoint with [pos_min,
  pos_max] against n_past-1024`), i.e. `pos_max < n_past + ~511`. Otherwise `forcing full prompt re-processing`.
- So a prompt can resume another only when they share everything but the last ~1,000 tokens of the older one. Same-member
  turns shared all but 1,105 tokens (LCP 5,811 of 6,916; checkpoint `[4864, 6399]` against 4,787): missed by ~80 tokens.
  That is why `cms1024`/`cram8192` restored nothing.
- The RAM prompt cache (`--cache-ram`) saves the slot's whole state (KV + SWA window + its checkpoints, 1.2-1.6 GiB per
  prompt) every time a request arrives that shares < 10 % with the slot (`--slot-prompt-similarity`), including requests
  pinned with `id_slot` ("selected slot by id" still runs the cache update); it loads the cached prompt with the best
  similarity and evicts oldest first. Save + load took 0.37-0.77 s per switch.
- Not tried: `--cache-reuse` (KV shifting); it cannot rebuild the SWA window of a shifted chunk either.

### Chunk-level / position-independent reuse (assessment, source + measured)

Reusing each message's KV on its own (CacheBlend / EPIC style) is not feasible on llama.cpp with Gemma 4: (1) llama.cpp
only reuses a contiguous prefix (or a shifted chunk with `--cache-reuse`), never a set of independently computed
chunks with a cross-attention fix-up; (2) 50 of 60 layers are SWA, whose window state at a position depends on the
previous 1,024 tokens, so a message's KV is only valid behind the exact same predecessor; (3) recomputing a selected
subset of tokens per layer (CacheBlend) needs custom attention kernels and a KV layout llama.cpp does not expose. It
would need a custom inference engine (vLLM/SGLang fork) plus an AWQ/GPTQ Artemis export that may not exist. The
practical equivalent is to make the prompt a growing prefix and checkpoint at the right place, below.

### Stable-boundary prefill (built: `broker/promptReuse.mjs`, gateway, off by default)

For a long `/completion` prompt the gateway finds its longest common prefix with the last 16 prompts, cuts it at a line
break and sends that prefix alone (`n_predict: 0`) first: llama-server checkpoints exactly where the next turn will
diverge. When idle it then sends a short park prompt so the finished state is saved to the RAM cache off the next
request's clock. Config `promptReuse.enabled`, with `cacheRamMiB: 6144`, `ctxCheckpoints: 3` (README).

Per-member slots were measured instead of built: `--parallel 2` pinned (chat slot 0, side slot 1, no RAM cache) costs
0.35 GiB VRAM; one slot per member (3-5 members + side) needs 0.45 GiB SWA per slot plus a 48-64K unified pool
(+0.7-1.4 GiB), which does not fit beside the model and MTP on 24 GB.

### Layout (measured on rewritten real prompts)

`bench-controller.mjs layout --mode joined|late|joined-late` rewrites the corpus chat prompts: `joined` = one head for
every member (cards joined, the `Impersonate {{char}}` sentence moved after the history), `late` = every in-history
system block (Author's Note, our depth 1-4 blocks) moved after the last message.

| Arm (24 requests, seed 1234) | Chat TTFT p50 | Side TTFT p50 | Tokens processed / reused | GPU free min |
|---|---|---|---|---|
| base, recorded layout (F3) | 9.02 s | 2.20 s | 94,984 / 0 | 2,767 |
| recorded layout + cram6144 ckpt3 reuse | 9.54 | 2.22 | 59,709 / 35,275 (cache misses) | 2,755 |
| joined + cram6144 ckpt3 reuse | 4.69 | 2.22 | 44,646 / 53,991 | 2,843 |
| joined-late + cram6144 (stock server) | 2.04 (one 11.1 s miss) | 2.40 | 48,513 / 50,124 | 2,638 |
| **joined-late + cram6144 ckpt3 reuse** | **1.93** | 2.22 | 38,570 / 60,067 | 2,725 |
| joined-late + parallel 2 pinned, no RAM cache | 1.87 | 2.38 | 38,570 / 60,067 | 2,378 |
| joined-late + cram6144 ckpt3 reuse + MTP 2 | 2.18 | 2.28 | 38,570 / 60,067 | 2,002 |

- With the recorded layout every member has its own head (diverges at character 172), so a member's state must survive
  two other members' chat, inner-beat and read states in the cache; oldest-first eviction drops it. Reuse then only adds
  its overhead (+0.5 s).
- The late layout is half of the gain (4.69 to 1.93 s): blocks at depth 4 move every turn and break the prefix four
  messages before the end.
- Side passes do not benefit (their prompts share < 800 characters; plan E is the lever there).

### Changes made

- Extension: every per-turn block in `INJECTION_REGISTRY` at depth 0 (after the last message): memory tiers, epistemic,
  ledger, guidance, story so far, player role, previously, pacing, scene tracker, chapter bridge, card overlay. Late
  lore default depth 4 to 0 (before-card lore no longer goes one deeper at depth 0); Author's Note default depth 4 to 0
  (a story's own `depth` still wins). Text, carry (quiet/impersonate) and private-member filtering unchanged. Guide,
  settings copy and generated docs updated. No payload golden baseline exists yet (`test/measurements/v2.7/payload`
  README: nothing captured), so there is no golden to re-declare.
- Controller: `speculative` (MTP), `cacheRamMiB`, `ctxCheckpoints`, `promptReuse` keys; `recordTiming` keeps the median
  of the last 15 replies (prompt ms and tok/s) instead of the maximum; timings keyed per drafter.
- `scripts/local/stable-head.mjs`: the owner change below, plan/apply/revert with backups.

### Owner change proposed, not applied to the owner's install

The member-independent head is the owner's SillyTavern data, so it is prepared, not applied:

1. System prompt: a copy of "Sphiratrioth - Roleplay - 3rd person" named "... (stable head)" whose main content keeps
   the shared rules and whose post-history instruction holds the two `{{char}}` sentences ("Impersonate {{char}} ...
   Balance {{char}} speech and narrative ..."). For text completion SillyTavern appends the post-history instruction as
   the last user turn, after the depth-0 blocks.
2. Groups that play stories: "Join character cards (exclude muted)" (`generation_mode` 1). All 12 groups are on swap (0).

`node scripts/local/stable-head.mjs plan --data C:/dev/SillyTavern-MainBranch/data/default-user --group <id>` shows it;
`apply` (ST stopped) backs up to `C:/dev/backups/story-orchestrator/stable-head-<time>/`; `revert --backup <dir>`.
Then set `promptReuse: { enabled: true }`, `cacheRamMiB: 6144`, `ctxCheckpoints: 3` in the controller config (not set today: with per-speaker heads it only costs). RAM:
the cache lowers available RAM by up to 6 GiB (measured minimum 10.9 GB with 6 GiB, against reserve 2 GiB + ComfyUI's
8 GiB staging = 10 GiB).

### Live check (lane 42, real generation through the gateway, thinking on)

Lane 42 copy with the owner change applied (`stable-head.mjs apply`, reverted afterwards), controller on master
`28eab941` with MTP 2, `promptReuse` on, `cacheRamMiB` 6144, `ctxCheckpoints` 3. Scenario: 5 player turns in the toy
four-member group, 12 member replies, story imported fresh (`C:\dev\so-lanes\bench-controller\live-prompt-reuse.scenario.json`, `so-scenario --sandbox`, cleanup clean; log
`live-lane42.log` beside it).

- Real SillyTavern prompts: identical head for every member; every per-turn block plus the `Impersonate {{char}}` line
  after the last message; consecutive member prompts diverge exactly at the end of the previous prompt's last message
  (shared 9,296-15,847 characters of 18,897-23,007).
- Chat replies processed 783-2,453 prompt tokens of ~5-6K (the rest restored), 1.2-3.0 s prefill; decode 37-50 tok/s
  (median ~41.5) with real lengths (359-739 tokens, thinking on); MTP acceptance 0.50 on chat-length replies
  (4,051 / 8,090), 0.51 overall. Gateway: 36 requests, 5 prefills, 24 parks.
- Found live: llama-server's `--fit` cannot measure the MTP drafter ("failed to measure the memory of the extra model,
  fitting without it"). Fixed in `b28fdaf8`: the drafter estimate is added to `--fit-target`, so a reduced fit for an
  image keeps the drafter out of the image's room.

### Before / after on the bench (the owner's config today = MTP only)

Run `text-2026-10-25T22-45-07-416Z`, `text --arms base,config`, recorded corpus (per-speaker heads, as played today):

| | base | config (MTP 2) |
|---|---|---|
| Chat TTFT p50 / p90 | 8.47 / 9.34 s | 8.66 / 9.61 s |
| Side TTFT p50 | 2.10 s | 2.21 s |
| Prefill | 1,032 tok/s | 958 tok/s (-7 %) |
| Decode chat / side | 30.9 / 30.7 | 41.7 / 46.6 tok/s (+35 % / +52 %) |
| MTP acceptance | | 0.59 |
| Replay wall | 176.7 s | 155.9 s (-12 %) |
| GPU free after load / min | 2,576 / 2,475 MiB | 1,758 / 1,547 MiB |
| 17.3K prefill row | 17.5 s | 18.5 s |

With the owner's head change and `promptReuse` the measured chat TTFT p50 is 2.18 s with MTP (table above), from 8.5-9.0 s.

## Gate record 2026-10-25 (evening)

- GPU time about 62 min: diagnostic 4, reuse spike 4.5, layout arms 22, par2 + MTP combo 7, image bench 6 (twice:
  the first run measured ComfyUI cache hits, fixed by varying the seed per render), live lane 6, final bench 7.5,
  controller loads.
- `npm run gates` from `C:\dev\so-ctl`: run 1 RED at `test-storybook:ci` (Studio/CharacterTutorial
  ReviewBlocksATakenName, 1 axe violation; no UI change in this plan); run 2 RED at `test-storybook:ci`
  (Studio/PosesList Tablet smoke, while the image bench loaded the machine; tree also changed mid-run); run 3 on
  `28eab941`'s tree: **all green in 301.2 s** (11 steps, Storybook included, no `--resume`); run 4 on `b28fdaf8`:
  **all green in 324.5 s**. `npm run test:plugin` 358 tests, 353 pass, 0 fail (5 skipped).
- Merged to master (`28eab941`, `b28fdaf8`, fast-forward), pushed, `npm run build && npm run stage && npm run
  plugins:install` (restartNeeded: ST on 8000 restarted with `cli.mjs start-st`, twice).
- Image bench (`image-2026-10-25T22-16-41-618Z`, SDPA, `Using pytorch attention`): median exec 10.4 s, wall 10.8 s for 28
  steps at the wide size, 6 timed runs (11.8 to 8.2 s, drifting down; gates were running on the CPU at the same time, so
  take it as a smoke run; rerun quiet for the unlock comparison).
- Controller config: backed up to `C:\dev\backups\story-orchestrator\local-config.before-mtp-2026-10-25.json`;
  `speculative` added. The live run's temporary `promptReuse`/`cacheRamMiB`/`ctxCheckpoints` were removed again
  (`local-config.mtp-only-2026-10-25.json`). Controller left running with MTP (`text.speculative: draft-mtp2`).
- Lane 42 restored (`stable-head.mjs revert`, backup `C:\dev\backups\story-orchestrator\stable-head-lane42-2026-10-25`)
  and stopped. Owner's ST data untouched (`stable-head.mjs plan` read only).
- Deviations: no payload golden diff (no baseline exists); the model-output gate for the depth-0 move is a 12-reply
  live run, not a blind rating; the ST plugin's `supervise` adapter (`config.mjs`) does not pass the new keys (the
  owner runs the managed controller).

## Unresolved questions (2026-10-25 evening)

- Apply the stable head to the owner's install (system prompt post-history + "Join character cards (exclude muted)" on
  story groups) and turn `promptReuse` on (`cacheRamMiB` 6144 costs up to 6 GiB of RAM beside ComfyUI's staging)?
- Or `--parallel 2` pinned (chat slot 0, side slot 1, no RAM cache): same TTFT, 0.35 GiB less VRAM instead of 6 GiB RAM.
- MTP leaves ~1.6-1.8 GiB free, below `streamImages.minFreeGpuMiB` 2400: images now swap the text out. Accept, or
  drop MTP while streaming?
- Blind rating of replies with the per-turn blocks at depth 0 (was 1-4) before calling the layout change settled?
- Side passes (78 % of requests) gain nothing from any of this; merging the inner beat into the read (E) is the lever.

## Follow-up 2026-10-26: slot pinning, privacy check, three-arm blind rating

Owner 2026-10-25: "whatever you recommend, continue"; then (quality concern) the stable head goes to the owner's
install only if it passes a blind rating.

### Built

- `slots: { count, chat, side, estimatedGpuMiB }` (off unless `count` > 1): `--parallel <count>`, every generation
  request pinned with `id_slot` (streamed = chat slot 0, non-streamed = side slot 1; the lane 42 capture has 226 chat
  requests all `stream: true`, 349 side all `stream: false`), extra slot VRAM in the load admission (not in
  `--fit-target`), `--slot-save-path` (llama-server answers `/slots/<id>?action=erase` only with it: 501 without,
  measured), each slot's prompt + output held and the other slots erased before a request that would overflow the
  shared context, `/props` `total_slots`, `/status` `text.slots`.
- Prompt reuse keeps one history per slot (`history: 1` with slots): a prompt prefills only against what its own slot
  last ran, so per-speaker heads send no prefill. Without it the recorded corpus paid the prefill for nothing
  (9.60 s chat TTFT vs 9.23 s with it). The park is never sent with slots.
- Bench: the `config` arm pins slots when the config has them.

### Bench (measured, controller config arm: MTP 2 + parallel 2 pinned + reuse, `cacheRamMiB` 0, `ctxCheckpoints` 3)

| Corpus | Chat TTFT p50 | Side TTFT p50 | Processed / reused tokens | Decode chat | MTP acc. | GPU free min |
|---|---|---|---|---|---|---|
| joined-late (stable head) | **1.98 s** | 2.37 s | 38,570 / 60,067 | 38.2 tok/s | 0.59 | 1,099 MiB |
| recorded (per-speaker heads, as played) | 9.23 s | 2.39 s | 94,984 / 0 | 40.2 tok/s | 0.61 | 1,481 MiB |

Runs `text-2026-10-25T23-55-10-337Z`, `text-2026-10-25T23-58-06-391Z`. MTP only on the recorded corpus was 8.66 s
(`text-2026-10-25T22-45-07-416Z`): slots buy nothing without the stable head and cost ~0.5 GiB of VRAM.

### Privacy check of the owner's groups (counts only)

12 groups checked, 297 member slots (131 distinct cards; description, personality, scenario, examples, depth prompt).
3 groups (7 cards) hold nothing hidden from other members. 9 groups have 3-62 cards each with text meant to stay hidden
from other members (131 slots, 62 distinct cards); 0 secrets sit only in a depth prompt. Read by a separate model;
counts only. In join mode ST also injects every enabled member's depth prompt, and 6 of the 9 groups have 18-40 enabled
members (47-93K characters of joined card text, 12-23K tokens), so join mode would not fit 32K there anyway.

### Three-arm blind rating (predeclared `rating-2026-10-26/floor-3arm.json`)

20 real captured chat prompts (test stories of lanes 42 and 45), Artemis + MTP 2, seed 1234, thinking on, n_predict
1400. A = captured (blocks at depth 1-4, own card, `{{char}}` sentences in the system prompt); B = depth 0 only
(master); C = depth 0 + stable head (joined cards, `{{char}}` sentences after the depth-0 blocks). Rater opencode
`openai/gpt-6.1-sol`, tools off, three replies per prompt in hashed order, one call per prompt, 20 of 20 rated.

| | A | B | C |
|---|---|---|---|
| coherence | 4.20 | 4.10 (-0.10) | 4.05 (-0.15) |
| voice | 4.60 | 4.25 (**-0.35**) | 4.25 (**-0.35**) |
| guidance use | 3.60 | 3.50 (-0.10) | 3.30 (**-0.30**) |
| continuity | 3.95 | 3.80 (-0.15) | 3.85 (-0.10) |
| voice bleed flags (rise vs A) | 0 | 2 (2) | 0 (0) |
| guidance ignored flags (rise vs A) | 7 | 8 (**3**) | 10 (**5**) |
| ranked first / mean rank | 5 / 2.05 | 7 / 2.00 | 8 / 1.95 |
| prompt tokens (mean) | 8,173 | 8,173 | 8,540 |

**Floors: B FAIL (voice -0.35, ignored +3), C FAIL (voice -0.35, guidance -0.30, ignored +5).** Ranking mildly favours
B and C, and the split is by source (lane 42 prompts favour A, lane 45 favour B/C), so one seed of 20 may be noise; the
floor stands as declared. Decision per the plan: the stable head is **not applied** to the owner's install, and the
depth-0 layout on master is **not reverted** without the owner. Proposal for the owner: move the memory and guidance
blocks back to depth 1-2 (keeping the scene line at depth 0), or rerun the three arms with a second seed first.

Reuse on vs off (`reuse-equivalence.json`, `determinism.json`, 4 C prompts, config server): fresh vs fresh identical
4/4; restored-from-checkpoint vs restored identical 3/4; fresh vs restored differ from character 12-438. Restoring a
checkpoint computes the prefix KV in a different batch split, so logits differ in the last bits and sampling takes a
different branch at the first near-tie: same distribution, not byte-identical text. Stock `cache_prompt` reuse does the
same today.

### Live (lane 42, toy four-member group, 5 player turns, real generation through the gateway, thinking on)

| Run | Chat replies | Chat TTFT p50 | Chat prompt tokens processed | Side TTFT p50 |
|---|---|---|---|---|
| before: controller master (MTP 2), swap | 12 | 2.41 s | 0.8-3.6K (full reprocess) | 1.65 s |
| after: slots + reuse, swap | 7 | 2.27 s | 0.9-2.6K (full reprocess) | 0.97 s |
| after: slots + reuse, stable head on the lane copy | 10 | 2.41 s | 0.4-2.6K of 2.3-5.7K (3 prefills) | 2.23 s |

Pinning verified live (`/status` `text.slots.requests` chat 17 / side 32, chat always slot 0, side always slot 1,
`/props` `total_slots` 2). A five-turn toy chat stays under 6K tokens, so TTFT barely moves; the bench rows are the
long-chat numbers. Side passes reused the same share of their prompts before and after (70 % vs 67 % processed).

### Image baseline before the unlock (quiet: no gates, controller stopped)

`image-2026-10-26T00-08-58-385Z`: RTX 3090, driver 621.01, power limit 350 W (default 350), max SM 2100 MHz, SM under
load 1695-1815 MHz (P2), peak 350 W. SDXL story graph 1344x768, SDPA (`Using pytorch attention`): median exec
**7.84 s**, wall 8.05 s, 6 timed runs 7.73-8.96 s.

## Gate record 2026-10-26

- GPU time about 66 min: live before 5, bench 4 arms 12, rating A/B 16, C 10, reuse equivalence 2, determinism 6,
  image 2.5, two live runs plus controller loads 12.
- Owner's install: stable head applied to the 3 join-safe groups at 23:2xZ, then reverted at 23:4xZ when the owner asked
  for the rating first (`stable-head.mjs revert --backup C:/dev/backups/story-orchestrator/stable-head-1792970440271`,
  settings.json byte-identical to the backup, sysprompt copy removed); ST stopped for both edits and restarted with
  `cli.mjs start-st`. Net change to the owner's ST data: none.
- Controller config: backup `C:\dev\backups\story-orchestrator\local-config.before-slots-2026-10-26.json`; the trial
  config with `slots`/`promptReuse`/`cacheRamMiB` 0/`ctxCheckpoints` 3 kept as `local-config.slots-trial-2026-10-26.json`;
  live config restored to MTP only (slots would only cost ~0.5 GiB with per-speaker heads; free VRAM fell to 929 MiB
  with a lane browser open, under the 1024 reserve).
- Lane 42: stable head applied and reverted (`stable-head-lane42-2026-10-26`), lane stopped.
- `npm run gates` from `C:\dev\so-ctl` on `0fa83f79`'s tree: **all green in 315.7 s** (11 steps, Storybook included,
  no `--resume`). `npm run test:plugin` 362 tests, 357 pass, 0 fail (5 skipped). `npm run gates:quick` green.
- Evidence archived to so-sessions (`npm run sessions:archive`, `evidence/controller-v3.0-06-2026-10-26/`; the card
  text read for the privacy check is not archived, counts only).
- Evidence: `C:\dev\so-lanes\bench-controller\rating-2026-10-26\` (items, replies, ratings, summaries, floors),
  `privacy-2026-10-25\result.json` (counts only), `live-*-lane42.log`, `run-slots*.log`, `run-det-image.log`.

# Plan 26 — llama.cpp fork round 4: R2 rating, load probe, light sleep, per-request draft length

**Status: BUILDING 2026-10-28.** Floors below were declared 2026-10-28, before any GPU run of this plan. A miss is
recorded and never retuned; the owner decides. Source: `research/llama-fork-opportunities.md` (C1-C9, Sol review).
Owner instruction: "First develop a POC, then when ready to do the first tests, take the GPU control and finish the
development."

## Scope (order of value)

1. **R2** (plan 09, owed): full-length run + blind Sol rating of the already-built `checkpoint_at` (A2).
2. **C2** load-phase probe (why weights load at ~0.87 GB/s), then the smallest fix.
3. **C1** light sleep: `POST /sleep {"level":"context"}` frees target + draft contexts (KV, compute buffers, graphs),
   keeps target and draft weights on the GPU; controller lease decision `sleep-context`.
4. **C3** request-local `ngram-simple` beside MTP, and per-request `speculative.n_max` (server n-max 3, chat 2).

Out: C4a (another agent, `v3.0-c4a-requeue`), C5-C7, C9, C8/Artemis v1.2 (disqualified: closes the thought at once
14/16, `v2.7/12-model-choice.md`; owner wants thinking on), `ngram-mod` (one hash pool across members).

## Build

- Fork: branch `so-r4` in worktree `C:\dev\tools\src\llama.cpp-b11888-so5`, on top of `3bae32b` (A2's so4 commit).
  Binary `C:\dev\tools\llama-b11888-so5-cu128` (cuBLAS/cudart DLLs hardlinked from so4). Repo copy of the patch series:
  `scripts/local/llama-patches/so-cache-b11888.patch`.
- Fork commits (this plan):
  - load timing log lines (`load timing:` in `common_init_result`, `load_tensors`, `load_all_data`: fit, model, context,
    warmup, buffer alloc, per-path read/wait/enqueue) and env knobs `LLAMA_LOAD_STAGING_MIB` / `LLAMA_LOAD_STAGING_N`
    (defaults 1 MiB x 4 = upstream behaviour);
  - light sleep: `common_init_result::release_context/recreate_context` (fitted `llama_context_params` kept from the
    first load, no fit, no warmup), `common_speculative_init_result::release_context/recreate_context` (MTP context
    rebuilt against the new target context, draft weights kept), `server_queue::request_sleep(level)`,
    `POST /sleep {"level":"full"|"context"|"context-draft"}`, `GET /cache` reports `sleep_level`; log lines
    `light sleep (level N): contexts freed in X ms` and `light|full wake in X ms`;
  - per-request `speculative.n_max` (task param `spec_n_max_model`): caps model drafters (draft-mtp, draft-simple)
    only; n-gram drafters are not capped.
- Controller (branch `v3.0-llama-r4`), every key default off:
  - `memberCache.lightSleep` (needs `keepAcrossImages`), `memberCache.lightSleepFreesMiB` (default 2900): an image that
    fits after a light sleep gets decision `sleep-context`; if the light sleep still leaves it short the sleeping
    text is stopped and the lease swaps as before; images larger than what a light sleep frees skip it. Wake
    (`wakeLight`) needs only the freed context memory + reserve; the stray-wake check subtracts the weights the
    sleeping process still holds. `/status` `sleepStats.lightSleeps|lightWakes|lastLightWakeMs|lastLightFreedMiB`.
  - `speculative.extraTypes` (only `ngram-simple` allowed), `speculative.chatNMax`, `speculative.sideNMax`: the gateway
    adds `speculative.n_max` to generation requests (streamed = chat) unless the caller set it.
  - bench: `bench-controller.mjs` arm parts `ngs`, `capc<N>`, `caps<N>`; `burst-bench.mjs` records wake ms, light wake,
    freed MiB and residency per step; `bench-controller/26/greedy-sleep.mjs` (greedy restore check with a sleep between).

## Floors (declared 2026-10-28, before any run)

### R2 (copied from plan 09 §R2; candidate fixed by its declared rule)

- Candidate: A3s missed floor 3 (2048 warm share 0.17 < 0.60), so the candidate is **A2** (`checkpoint_at`, no
  rewind): arm `mtp2+cram4096+ramcut+keys+noerase+ckat`, binary so3, `09/config-patched3.json`.
- Run: 25 chat prompts of `09/corpus-rate.json`, 1,024 tokens, thinking on, `--gap-ms 1000`, `--keep-text`. Control:
  `text-2026-10-26T09-33-35-751Z` (adopted A, same corpus). Rater Sol `openai/gpt-6.1-sol`, blind, `09/rate/rate-pairs.mjs`.
- Floors: 1. no category mean (coherence, voice, guidance, continuity) below control by more than 0.2; 2. each flag
  (voice bleed, guidance ignored, leak) ≤ control + 2; 3. replies that close their thinking ≥ control's count.
  Performance floors 4-6 (decode ±3 %, acceptance ±0.03, 0 failures, warm switch ≤ 7.50 s) were measured in plan 09 R
  for A2 (42.7 tok/s, 0.519, 0 failed, 3.31 s): pass, not re-run.

### C2 load probe and fix

- Probe: `load-probe.mjs` spawns the so5 binary with the controller's `fast` + MTP arguments, controller stopped, 3 loads
  per arm, back to back; reads `load timing:` lines and wall time to `/health`.
- Fix arm (only if the probe shows the async read or wait share dominates the weight phase): staging env knob (largest
  of 16 / 64 MiB that the probe favours), 10 loads.
- Declared deviation before measuring: a cold (not page-cached) row needs a standby-list flush (admin), which this host
  does not allow; rows are "page-cached" (back to back) only. The first load of the session is reported apart.
- Floors (fix vs default staging, same binary): total load p50 ≤ 60 %, p95 reported; host RAM available minimum during
  load ≥ default − 256 MiB; 0 failed loads in 10; greedy output (temp 0, 96 tokens, `cache_prompt: false`, 2 prompts)
  identical to the default arm.

### C1 light sleep

- Feasibility first (one load): `POST /sleep {"level":"context"}` → NVML free and per-process dedicated MiB before and
  after, wake ms, then one cached member request answers.
- Arms (controller on this branch, binary so5 for all, Max-mode config as the owner's): **K1** today (`keepAcrossImages`,
  full sleep, stream floor 2400), **S384** (stream floor 384, spill guard on with the fixed baseline), **L** (light
  sleep, stream floor 2400). Pattern `burst-bench.mjs --pattern RRRIRRRIRRRI --corpus 09/corpus-rate.json`, 2 repeats
  per arm, order K1 L S384 S384 L K1. Plus one **L-LH** run with the live head open on lane 42 (headed, WebGL).
- Floors (L against K1 and S384):
  1. image → next reply (`imageToReplyMs`) p50 ≤ 70 % of K1 and ≤ 90 % of S384; p95 reported;
  2. light wake p50 ≤ 3 s, p95 ≤ 5 s;
  3. render p50 ≤ 125 % of K1;
  4. 0 spill events, 0 refusals, `fitCorrectionMiB` 0; L-LH live head keeps its WebGL context;
  5. decode of each post-wake reply ≥ 97 % of the replies before the image (first post-image reply and the following
     warm members reported apart);
  6. host RAM available at admission per lease ≥ K1's − 256 MiB;
  7. greedy check (`greedy-sleep.mjs`, 4 member prompts, temp 0, 96 tokens): per prompt, the first divergence of the
     restore after a light sleep vs `cache_prompt: false` is no earlier than the smaller of two control runs (restore,
     no sleep). Any prompt earlier → C1 falls to a blind Sol rating (owner decision 4), not adopted on speed alone.

### C3 request-local n-gram and per-request draft length

- Arms (`bench-controller.mjs text --corpus corpus.json --side-tokens 2048 --gap-ms 1000`, binary so5, 2 repeats
  interleaved): **M2** `mtp2+cram4096` (control), **M3c** `mtp3+cram4096+capc2` (chat capped at 2, side passes 3),
  **M3cN** `mtp3+cram4096+capc2+ngs` (+ `ngram-simple`).
- Offline (CPU, before the arms): token-level eligible continuations of the read outputs (≥ 12-token match in the
  request's own tokens, the `ngram-simple` default), informational.
- Floors (each candidate vs M2): read end-to-end p50 ≤ 85 % with output length within ±5 % (M3cN; M3c is held to side
  decode only); chat decode ≥ 0.97 ×; side decode ≥ 1.05 × (M3c); VRAM after load ≥ M2 − 64 MiB; temp-0 first
  divergence no earlier than M2's own run-to-run (2 runs).

## Gates

- `research/feature-impact-controller.md` base set plus each adopted change's rows (image rows for C1/C2, reads for
  C3); `npm run gates` (no `--resume`) before merge. Nothing is switched on the owner's controller by this plan:
  adoption steps are reported for the coordinator.

## GPU budget

≤ 120 min: R2 15, C2 probe 10, C1 feasibility 5 + arms 45, C3 25, regression rows ~20.

## Unresolved questions

- Image mix in owner play (SDXL vs qwen edits) decides how often C1 applies; `controller.log` still has no lease kind
  timestamps.

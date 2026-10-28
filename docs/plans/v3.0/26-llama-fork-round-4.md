# Plan 26 — llama.cpp fork round 4: R2 rating, load probe, light sleep, per-request draft length

**Status: DONE 2026-10-28, nothing adopted on the owner's controller.** R2, C2, C2b and C3 miss; C1 passes floors 1-4
and 7 and misses 5-6 as written (owner decides); C4a passes Part A, misses Part B's lag floor and is not merged.
Floors below were declared 2026-10-28, before any GPU run of this plan. A miss is recorded and never retuned. Source:
`research/llama-fork-opportunities.md` (C1-C9, Sol review). Owner instruction: "First develop a POC, then when ready to
do the first tests, take the GPU control and finish the development."
C4a (chat preempts a running story read) was built on `v3.0-c4a-requeue` by another agent; its live check ran on the
test branch `v3.0-llama-r4` (which merged it), and master gets only its records here (§C4a sections at the end). The
code merged to master is r4's: fork patch series, light sleep, per-request draft caps, bench tooling, all off by default.

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

### C2b overlapped unbuffered reads (declared 2026-10-28 18:20Z, after the probe, before any run of the fix)

- Probe outcome that motivates it: staging size changes nothing; a page-cached load reads 17.8 GB in ~6 s
  (~3 GB/s), and the 21.7 s loads are the uncached case (host RAM available under the GGUF's 17.4 GiB, so the
  standby list cannot hold it, which is the owner's play condition at 5-9 GiB available). One synchronous buffered
  read at a time is the bottleneck on the NVMe.
- Fix: `LLAMA_LOAD_OVERLAPPED=1` opens a second handle with `FILE_FLAG_NO_BUFFERING | FILE_FLAG_OVERLAPPED` and keeps
  `LLAMA_LOAD_STAGING_N` reads of `LLAMA_LOAD_STAGING_MIB` in flight per tensor into the pinned staging buffers.
  Arm **O** = overlapped, 8 x 8 MiB; arm **D** = default loader. Binary so5b.
- Cold rows without admin: before each cold load, a helper allocates and touches host RAM up to available − 1.5 GiB
  and exits, which repurposes the standby list (the GGUF's cached pages). Order D O D O D O, then 4 page-cached O
  loads back to back after one D.
- Floors: cold total load (spawn → `/health`) p50 O ≤ 60 % of D, p95 reported; page-cached O p50 ≤ 105 % of D; 0
  failed loads in O's 7 loads plus 3 extra = 10; greedy output of O identical to D (2 prompts, temp 0, 96 tokens);
  host RAM available minimum during an O load ≥ D's − 256 MiB.

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

## Results 2026-10-28 (GPU window from 17:37Z, taken from the A2 bench at a step boundary)

Evidence root: `C:\dev\so-lanes\bench-controller\26\` (`logs*/`, `aggregate-c1.py`, `aggregate-c3.py`,
`aggregate-c4a.py`, `rate-R2/`). Binaries: so3 (R2), so5 (C1, C3, C4a), so5b (so5 + overlapped reader, C2b).
Measurement note: the "temp-0" divergence floor of C3 was read on the bench's recorded samplers with seed 1234
(identical across arms), not at temperature 0.

### R2: MISS (not adopted)

- Full-length run `text-2026-10-28T17-37-41-289Z` (A2: `checkpoint_at`, so3, 25 prompts, 1,024 tokens): chat TTFT p50
  4.3 s, decode 39.4 tok/s, acceptance 0.50, 0 failed.
- Blind Sol rating (`codex exec -m gpt-6.1-sol -s read-only`, `26/rate-pairs-codex.mjs`, 25/25 rated) vs the adopted
  A run `text-2026-10-26T09-33-35-751Z`:
  - coherence 4.24 → 3.88 (−0.36), voice 4.20 → 3.76 (−0.44), guidance 3.96 → 3.60 (−0.36), continuity 4.20 → 3.96
    (−0.24): floor 1 **miss** in every category;
  - flags control/candidate: voice bleed 3/4, guidance ignored 4/10, leak 2/3: floor 2 **miss** (guidance ignored);
  - thinking not closed 2/3: floor 3 **miss**; preference control 18, candidate 6, tie 1.
- The candidate also loses on the rows it served cold (no cache restore: prompts 0-2 and 21-27: 6 control, 2
  candidate, 1 tie), so the loss does not follow the restore. An informational rerun of A itself is recorded below;
  the floor stays a miss.

### C2 load probe: cause found, staging fix MISS

- Instrumented loads (`26/logs-c2*.jsonl`, `load timing:` lines at `--verbosity 4`): the weight phase is the read.
  Page-cached, the default loader reads 17.8 GB in 4.2-6.8 s (2.7-4.5 GB/s; spawn → `/health` 7.6-10.4 s). Uncached it
  reads at 0.98-1.06 GB/s (18-19 s; total 22 s), once at 0.46 GB/s (44.6 s).
- The 21.4 s weight phase in the owner logs is the uncached case: the GGUF is 17.4 GiB, and with less host RAM available
  than that the standby list cannot keep it (the owner plays at 5-9 GiB available; one bench reload in this window, at
  5.4 GiB available, took 84 s).
- Staging size: 16 and 64 MiB vs 1 MiB change nothing once the cache state is controlled (interleaved rows: 10.0 / 10.0 /
  10.4 s vs 9.9 / 9.7 / 9.7 s). Floor (≤ 60 %) **miss**; greedy output identical in every arm.

### C2b overlapped unbuffered reads: MISS (not adopted)

- Cold rows (standby list emptied by `26/evict.mjs` before each load; D = default, O = 8 x 8 MiB overlapped): D 22.0 /
  21.8 / 44.6 s, O 18.6 / 18.6 / 18.7 s: p50 84 % of D against ≤ 60 %: **miss**. The drive gives ~1.32 GB/s at queue
  depth 8 (13.4 s for 17.8 GB): it is the ceiling, not the request pattern.
- Unbuffered reads never fill the page cache, so O loses the cached case: 17.9 s every load vs 7.5 s for a cached D (the
  cached-row floor, ≤ 105 % of D, is **missed** by design). 10/10 O loads ok; greedy identical; RAM minimum during O
  loads 22.9-24.1 GiB vs D 22.7-23.8 GiB (pass).
- A first C2b run is void (`void-c2b/`): the so5b directory got the previous `llama.dll` (copied before the rebuild
  finished), so its "O" rows were the buffered loader with 8 MiB staging (cold 19.4 vs 22.9 s).
- Not adopted. The reload cost is the disk; what removes it is not reloading (C1) or more free RAM.

### C1 light sleep: floors 1, 2, 3, 4, 7 pass; 5 and 6 miss as written

- Feasibility (`26/logs-c1/feasibility.json`, standalone so5): `POST /sleep {"level":"context"}` frees 2,794 MiB
  (contexts freed in 36-44 ms server side), `light wake` 195-215 ms (context recreated in 83-91 ms); the cached member
  answers with `cache_n` = the full prefix (6,911-7,946 tokens), TTFT 2.0-2.3 s.
- Design change found by the first L run (void, `L-r1`): an SDXL scene asks ~9 GiB whole, so it never fits beside the
  18.7 GB weights; light sleep only helps with streaming. The controller now light-sleeps when the image fits whole after
  it, or streams beside the kept weights (`streamImages` policy with `lightSleepFreesMiB` added), commit `ec03abd6`.
  `S384-r2` is void too (restore refused while work was active, no burst ran).
- Arms (`burst-bench RRRIRRRIRRRI` on `09/corpus-rate.json`, Max config, so5): K1 r1/r2, L r2/r3, S384 r1/r3, L-LH.
  - image → next reply p50: K1 32.6 s, S384 25.0 s, **L 7.8 s** (24 % of K1, 31 % of S384): floor 1 **pass**. p95: L
    42.1 s (a RAM fallback), K1 52.2 s, S384 93.2 s.
  - light wake p50 484 ms, p95 508 ms: floor 2 **pass**.
  - render p50 L 17.9 s vs K1 21.3 s (84 %): floor 3 **pass** (streaming with ~4.1 GiB free beat a whole load here).
  - 0 spills, 0 refusals, `fitCorrectionMiB` 0 in every arm; L-LH: the live head kept its WebGL context through the
    300 s hold (`hold: PASS`, contexts 1): floor 4 **pass**.
  - decode of the first post-image reply ≥ 97 % of the replies before: L 0.85 (warm members 0.84): floor 5 **miss as
    written**. K1 shows 0.83 / 0.84 and S384 0.75 / 0.83 on the same corpus: consecutive replies differ in content and
    MTP acceptance, so the floor's reference moves with the corpus; recorded as written.
  - host RAM available at admission, minimum per lease: L 11,569 MiB vs K1 11,878 − 256 = 11,622: floor 6 **miss** by
    53 MiB. ComfyUI holds the streamed model's weights in host RAM.
  - greedy restore after a light sleep vs `cache_prompt: false`: first divergence 188 / identical / 147 characters, the
    same as both no-sleep control runs: floor 7 **pass**, gate class exact.
  - fallback: when host RAM is under the image's 11.1 GB need after the light sleep, the sleeping server is dropped and
    the lease swaps (2 of 6 L images; 2 of 3 in L-LH, where the headed lane browser held RAM). Those leases cost what
    K1 costs.
- Not adopted by this plan (two literal misses); the owner decides. Adoption steps are in the final report.

### C3: MISS (not adopted)

- Offline (`26/ngram-eligibility.mjs`, server `/tokenize`, 97 recorded reads): `ngram-simple` (12-token match) could
  draft 9.9 % of read output tokens.
- Arms (`text --corpus corpus.json --side-tokens 2048`, 2 runs each, `26/logs-c3/aggregate.json`):
  - M3c (server n-max 3, chat capped at 2 per request): side decode 1.00 x M2 (floor ≥ 1.05: **miss**), chat decode
    0.98 x (pass), VRAM after load equal (pass), every read byte-identical to M2 (the per-request cap works and is exact);
  - M3cN (+ `ngram-simple`): read end-to-end p50 94 % of M2 (floor ≤ 85 %: **miss**), output length 97.8 % (pass), chat
    0.98 x (pass); reads diverge from M2 at 331-1,545 characters while M2's two runs are identical (floor: **miss**).

### R2 informational rerun of A

- `text-2026-10-28T20-30-18-363Z` (the adopted A config, so3, same corpus, `--gap-ms 1000`) reproduces the 10-26 A run
  byte for byte: 25 of 25 chat texts identical (Sol rating: 25 ties). Seed 1234 and the same batch splits make A
  deterministic, so the R2 rating compared one A sample with one A2 sample that differs only through batch numerics
  (`checkpoint_at` splits the prompt batch at the cut). The miss stands as written; a judgement of A2 itself would need
  several samples per arm: if R2 is revisited, rerun it multi-seed (one sample per arm compared through batch-numeric
  divergence is not a quality signal).

### C4a Part A (gateway replay): PASS

- `26/replay-c4a.mjs` (09 replay + `so_pass: "read"` on the 36 labelled reads), first 80 requests of the lane 42
  capture, so5, Max config + `chatFirst`, order P1 C4a C4a P1 (`26/logs-c4a/aggregate.json`).
- Per run P1 / P1 / C4a / C4a: chat TTFT p50 3,269 / 3,211 / 2,177 / 2,161 ms; p95 8,665 / 8,618 / 2,714 / 2,742 ms;
  chat decode 42.5 / 42.4 / 42.5 / 42.6 tok/s; reads 36/36 200 in every run; inner beats 24/24 200; read total p50
  7.0 / 6.9 / 12.2 / 12.4 s.
- Floors: TTFT p50 67 % of P1 (≤ 75 %) **pass**; p95 32 % (≤ 90 %) **pass**; decode 1.00 x (≥ 0.97) **pass**; every
  read answered once **pass**; retries max 1 (≤ 2) **pass**; 0 inner beats aborted **pass**. Wasted work: 14 preempts
  per run, 2.5 s p50, 26.1 / 26.3 s total.

### C4a Part B (real model, lane 42 through the controller): MISS on boundary lag, C4a NOT merged

- `26/c4a-part-b.scenario.json` (12 real `send_generate` turns, the plan 09 live-check test story on the lane 42 group, extraction
  default cadence), controller so5 + Max + `chatFirst` + `lightSleep`, arms PBP1 (no `preemptReads`) and PBC4a
  (`preemptReads {enabled, maxPreempts 2}`), order P1 C4a C4a P1, the r4 build (master + C4a + r4, every new key off)
  staged so the page sends the `so_pass` marker (`26/logs-partb/aggregate.json`).
- Deviation from the recipe: lane 42 (the controller live-check lane, as plan 09) instead of an adolion-fresh lane; the
  measurement needs only real reads and replies, not campaign content.
- Per run P1 / C4a / C4a / P1:
  - reads (audits) 9 / 6 / 5 / 9; with deltas 8 / 6 / 4 / 8; applied audits 7 / 3 / 4 / 4;
  - issue → applied boundary lag: P1 r1 [1,1,2,1,2,1,2], C4a r1 [2,7,4], C4a r2 [3,6,4,4], P1 r2 [1,2,1,2]; p95 2 / 7 / 6 / 2;
  - `readPreemption`: preempted 7 and 6, completed 6/6 and 5/5, failed 0, cancelled 0, retries max 2, wasted 41.9 s and
    31.0 s;
  - 0 duplicate applied audits in any run; one duplicate audit window in P1 r2 (the control, so not C4a's).
- Floors: lag p95 ≤ P1's + 1 (3): **miss** (6-7). Every read completed and applied at most once: pass. Retries ≤ 2: pass
  (at the bound). Preempted reads also delay the next read (one read in flight), so a 12-turn chat got 5-6 reads instead
  of 9.
- Two earlier Part B runs without the marker (master staged) are void (`void-partb2/`): no read was marked, so nothing
  was preempted; they show the control's own lag ranging 1-3.
- Decision per the declared rule: C4a is not merged. Part A's TTFT win is real, but reads land 4-5 boundaries later and
  fewer of them run. The branch `v3.0-c4a-requeue` stays as built; `preemptReads` stays off.

### C1 regression rows (so5, `lightSleep`, lane 42 through the controller)

- Binary swap so3 → so5: greedy output (temp 0, 96 tokens, 2 real prompts, `cache_prompt: false`) byte-identical
  (`26/logs-regress/binary-greedy.jsonl`); every so5 load in C2/C2b produced the same text.
- `so-turn-types-check --skip-image`: ok. `v29-a02-stopped-reply`: ok. `09/live-ram-cache.scenario.json` (4 members,
  7 real turns): ok, 0 failed steps, residue clean (this lane's prompts stayed under the member cache's 16,000-char
  plan threshold, 0 planned; planning itself is exercised in the K1/L arms, 9 planned / 6 hits each).
- Image rows: the C1 arms above (3 SDXL leases per run, 0 spills, 0 refusals, fit 0) and the L-LH live-head row.
- Not run, with reason: payload goldens (C1 changes no prompt; server and controller only); live-suite T8 and the
  full-length Sol rating (C1 is exact: restores identical to the no-sleep control, binary output identical); GS1 and
  j5 journeys (chat/inner/read/director traffic is covered by the Part B runs on the same so5 + `lightSleep` controller).

## Gates

- `research/feature-impact-controller.md` base set plus each adopted change's rows (image rows for C1/C2, reads for
  C3); `npm run gates` (no `--resume`) before merge. Nothing is switched on the owner's controller by this plan:
  adoption steps are reported for the coordinator.

## GPU budget

≤ 120 min: R2 15, C2 probe 10, C1 feasibility 5 + arms 45, C3 25, regression rows ~20.

## Unresolved questions

- Image mix in owner play (SDXL vs qwen edits) decides how often C1 applies; `controller.log` still has no lease kind
  timestamps.

## C4a build record (2026-10-28)

Built on `v3.0-c4a-requeue` (worktree `C:\dev\so-c4a`), gateway and page only, no llama.cpp patch, no GPU, no controller
restart, no lane. Default off; not merged until the live check below passes.

What was built:
- Page: a story read (pass `read`, not epistemic/ledger/supersession) on a llama.cpp Text Completion profile carries
  `so_pass: "read"` in the request body (`stHost/modelReply.ts` `passMarker`; the pass rides `modelCallCore` →
  `replyVia` → `ModelRequestOptions.pass`). Any other pass, backend or Chat Completion sends nothing new.
- Gateway (`broker/readPreemption.mjs`, `gateway.mjs`): strips `so_pass` from every generation body (always, so the
  backend sees the request as before). With `preemptReads: { enabled: true, maxPreempts: 2 }`, a chat (streamed
  generation) arriving while a marked read runs aborts the read's backend request when the chat is next in line
  (`scheduler.chatNext()`: any queued chat under `chatFirst`, else the queue head) and lanes are not concurrent. The run
  requeues the identical body before it returns (`scheduler.text(..., { requeue: true })`: placed after the last queued
  chat, ahead of other side work, exempt from `maxQueue`, not announced as an arrival). After `maxPreempts` the read
  runs to the end. A response already received is never discarded (preempt flag checked before the first byte).
- Cancel latency: llama-server polls a non-streamed request's connection every second (`HTTP_POLLING_SECONDS` 1,
  `server-context.cpp:45`), so the aborted read stops within ~1 s plus the running batch; the chat queues in the
  server behind it meanwhile. Part A measures what is left.
- Exactly once: the page's read keeps one HTTP request open across requeues and gets one answer; the extraction
  scheduler runs one read at a time (`inFlight`) and applies on that answer only, so a requeued read cannot apply twice.
  Its ownership lapses on a window mutation, not on a new boundary, so a late answer still applies, one boundary later
  at worst. Read timeout 30 s + 2,048 × 50 ms + 2 ms/input token (≈ 136 s) covers two chat replies.
- Status: `/status` → `readPreemption` {reads, preempted, requeued, completed, completedAfterPreempt, cancelled, failed,
  retriesMax, wastedMsP50/P95/Total, last}. `controller.log` lines `read preempted by chat: requeued after it (...)` and
  `read completed after N preempt(s): ...`.
- Lease kinds (C1/C2 input): every broker log line now starts with an ISO timestamp (`arbiter.mjs` `stampedLog`);
  `lease <decision> [<kind>]: ...` and a new `lease released [<kind>]: <decision>, held N s, job seen, cache <mode>`.
  Kind = main model (`checkpoint:<stem>` for SDXL-style checkpoints, `diffusion:<stem>` for qwen-image/flux) + recipe
  from a JSON `workflowKey` + `WxH[+hires]` (`scheduler.mjs` `leaseKind`); also `lastResidency.kind`.

Tests (fakes): `broker/readPreemption.test.mjs` (preempt + identical requeue + one answer; inner beat never aborted;
`maxPreempts` bound; client leaving while requeued = no second backend call, `cancelled`; off = marker stripped, no
abort; FIFO chat behind other work not next = no abort; requeue placement/limit/arrival; options; `leaseKind`),
`scheduler.test.mjs` (lease/release lines carry the kind), `residency.test.mjs` (log format), `modelReply.test.ts`
(marker only for read + llamacpp TC), `reasoningControl.test.ts` (pass reaches the transport).

Overlap with `v3.0-a2-maxmem` (benchmark running): it edits `gateway.mjs` (member cache constructor line),
`controller.mjs`, `backend.mjs`, `scripts/local/README.md` (after the keepAcrossImages paragraph, modes table). This
branch edits other hunks of `gateway.mjs` and `README.md` (a `preemptReads` bullet after `promptReuse`) and does not
touch `controller.mjs` or `backend.mjs`; `git merge-tree` result in the gate record.

## C4a live check (owed, after the a2 benchmark; predeclared, floors not retuned)

Floors (research §2 C4, arms vs P1 = `chatFirst`, one slot):
- chat TTFT from issue p50 ≤ 75 % of P1, p95 ≤ 90 % of P1;
- chat decode tok/s ≥ 97 % of P1;
- every read completes and applies exactly once (no failed read, no duplicate audit window);
- boundary lag of applied reads (issue boundary → applied boundary) p95 ≤ P1's + 1;
- retries per read ≤ 2 (`readPreemption.retriesMax`);
- wasted prefill and decoded tokens reported (not a floor);
- 0 inner beats aborted; then the `inner-freshness` row of `research/feature-impact-controller.md`.

Recipe, part A (gateway replay, ≈ 15 GPU min, no ST):
- Preconditions: owner not playing, a2 benchmark finished, controller config backed up, `npm run build` not needed.
- Controller from this branch on the A setup (patched b11888 `so5` or current, MTP 2, RAM member cache), `chatFirst: true`,
  one slot. Arm P1: `preemptReads` absent. Arm C4a: `preemptReads: { enabled: true, maxPreempts: 2 }`. Config change
  needs a controller restart per arm (restart is part of the window, not now).
- Replay `09/replay-gateway.mjs` (plan 09 §C2 bench): first 80 requests of the lane 42 capture at recorded offsets, seed
  1234, outputs capped at 600 tokens. The capture predates the marker: add `so_pass: "read"` to the bodies labelled story
  read (labels as `research/fable-context-slicing.md`), nothing else.
- Order P1 C4a C4a P1 (paired, interleaved), 2 repeats per arm.
- Per run record: chat TTFT from issue (p50/p95), chat decode tok/s, every read's HTTP status and answer count, inner
  beat statuses, `/status` `readPreemption` before/after (delta), `controller.log` slice. Wasted work: llama-server
  native log, prompt/decoded tokens of tasks cancelled by the gateway (`--log-timestamps`), summed per arm.
- Gate rows: TTFT, decode, retries, 0 inner aborted, every read 200 exactly once.

Recipe, part B (freshness and exactly-once on the page, real model):
- One lane from `adolion-fresh` (images and sprites off), routed to a controller in each arm (same controller, arm =
  restart with or without `preemptReads`); or the replay backend if it carries the gateway (not today).
- Real generation, 12 player turns per arm with `send_generate`, extraction on (default cadence), two runs per arm,
  arms interleaved; `so-run-header capture` before and `diff` after each run.
- Per run: export audits (`extras.extraction.audits`) and the boundary logs (`so-state.mts current`, engine history).
  Issue boundary = first boundary whose `lastMessageId` ≥ audit `window.to`; applied boundary = the boundary whose
  drained queue applied that audit's deltas. Duplicate `window` or duplicate audit id = exactly-once fail. A read the
  scheduler records as failed/timeout = fail.
- Then on the C4a arm: `research/feature-impact-controller.md` base set rows 1-7 (row 8 skipped: a requeued read sends
  the identical body, chat outputs are untouched; say so in the record) and the "Concurrent side passes" rows; the
  inner-freshness row = the inner beat completes before its member's chat request in 100 % of turns (payload capture).
- Evidence to `so-sessions` (`so-evidence.mts archive --label c4a`), record path in this plan's gate record.
- Adopt (owner config `preemptReads.enabled`) only if A and B pass; merge the branch before adoption with a fresh full
  `npm run gates`.

## Gate record (C4a build, 2026-10-28)

- Commits on `v3.0-c4a-requeue`: `dc3e2f78` (build), `3f7ccb17` (pass set in the request literal; the ownership census
  flagged a property write after an await), this record (docs only).
- `npm run gates:quick`: green (typecheck, typecheck:test, lint changed, jest related, replay --cached).
- `npm run gates` (no `--resume`), run 1 on `dc3e2f78`: RED at `test` (`ownership.guard.test.ts`: `replyVia` writes
  `request.pass` after an await) → fixed in `3f7ccb17`.
- Run 2 on `3f7ccb17`: RED at `test-storybook:ci` only: `PosesList.stories.tsx` axe color-contrast (1 node); untouched
  UI, green in run 1 minutes earlier; read as a flake.
- Run 3 on `3f7ccb17` (no `--resume`, no change): GREEN, all 11 steps (typecheck, typecheck:test, build, test 10,802
  passed / 1 skipped, test:replay, test:debug, test:plugin, test:release, debug:typecheck, lint, test-storybook:ci
  1,010/1,010).
- `git merge-tree v3.0-c4a-requeue v3.0-a2-maxmem`: clean, no conflict.
- Not run: no GPU, no controller restart, no lane, no real-LLM gate (owner instruction: a2 benchmark running). Live
  check owed per §C4a live check; the real-LLM gate for the page change (read marker) is part B. NOT merged.

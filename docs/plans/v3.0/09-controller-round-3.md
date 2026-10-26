# Plan 09 — Controller round 3 (Artemis 31B, one 3090)

**Status: PLAN, floors predeclared 2026-10-26 before any bench.** Follows plans 06, 07, 08. Owner: "keep improving the
controller: that cache thing or any other improvement". Constraints unchanged: prompt layout fixed (plan 06 depth
revert), thinking and inner voice on, owner's controller restored and running unless a change passes these floors, a
live check and full gates.

Labels: **M** measured, **S** read from llama.cpp b11888 source (`C:\dev\tools\src\llama.cpp-b11888`, tag `b11888`),
**I** inferred.

## What the b11888 source says (S)

- **RAM prompt cache** (`server_prompt_cache`, `tools/server/server-task.cpp`): when a request lands on a slot whose
  prompt it shares < `--slot-prompt-similarity` (0.1) with, the slot's whole state (target KV + SWA ring, the MTP draft
  context, and every context checkpoint) is copied to host RAM before the request runs, and the cached entry with the
  best prefix match (`f_keep` ≥ 0.25) is loaded back and removed from the cache. Entries fully contained in a newer one
  are dropped; oldest first when over `--cache-ram` MiB (or over a token limit scaled from it). So one entry per member
  is possible **if nothing else evicts it** (I). Checkpoints travel with the entry (they did on b11388 too, plan 06 F5);
  #26004 was about slot *files*.
- What evicts a member's entry: every other request's state. Between two turns of one member the server saves the
  other members' chats and every side pass (inner beat, read) → 8 states for 3 members, the plan 06 failure. An
  **erase** of the slot after each side pass (`POST /slots/0?action=erase`, needs `--slot-save-path`) leaves an empty
  slot, and an empty slot saves nothing (`prompt_save` returns false at 0 tokens). Then only chat states enter the cache.
- A side pass that follows a chat pays the chat state's copy to RAM (alloc + GPU→host, ~2 GiB) on its own TTFT; the next
  chat of a cached member pays the load (host→GPU). Expected 0.4-1.0 s each (plan 06 measured 0.37-0.77 s for
  1.2-1.6 GiB) (I).
- **Checkpoint placement**: `checkpoint_offsets = {4 + n_ubatch, 4}` tokens before the prompt end (`server-context.cpp`).
  A checkpoint is usable for a later prompt only if it lies inside the shared prefix. So `-ub` moves the early
  checkpoint: 516 tokens before the end at `-ub 512`, 2,052 at `-ub 2048` (I: a same-member tail of 1.1-1.3K tokens
  would then fall inside the shared prefix without the gateway's prefill-to-cut; the prefill still restores closer).
- MTP knobs: `--spec-draft-n-max` (default 3), `--spec-draft-p-min` (0), `--spec-draft-sampling greedy|probabilistic`
  (greedy default; probabilistic samples the draft and verifies by rejection, which keeps the target distribution and
  may accept more at temperature ~1) (S, `common/arg.cpp`, `common/speculative.cpp`).
- CUDA runtime env knobs in b11888: `GGML_CUDA_DISABLE_GRAPHS`, `GGML_CUDA_GRAPH_OPT`, `GGML_CUDA_PDL`, `GGML_CUDA_NO_PINNED`,
  `GGML_CUDA_DISABLE_FUSION`, `GGML_CUDA_MMQ_PREC` (q4 lowers activation precision: a quality change, not benched),
  `GGML_CUDA_CUBLAS_COMPUTE_TYPE` (cuBLAS path only; Q4_K matmuls run MMQ). Graphs, fusion and PDL are on by default.
- KV f16 instead of q8_0: SWA ring 637 → ~1,275 MiB and global KV 1,360 → ~2,720 MiB at 32K (+2 GiB): does not fit
  beside MTP (1.3-1.6 GiB free). Not benched.

## Ideas, ranked (judgement before the bench)

1. **A. Member cache in llama-server's RAM cache** (no files): gateway keeps the prefill-to-cut (plan 08) and erases
   the slot after every non-chat request, `--cache-ram` sized for the members. No disk, no save stall, no idle gap
   needed (the copy rides the next request).
2. **B. `-ub`/`-b`**: prefill throughput for every request (side passes are 78 % of requests).
3. **C. MTP**: n-max 3 on b11888, probabilistic drafting.
4. **D. Side passes**: engine side, nothing found beyond B (same-role prompts share < 800 characters, plan 08); product
   proposals only.
5. **E. llama.cpp patch**: toolchain check below; only if A leaves a measurable cost a patch would remove.
6. **F. Scheduling**: park after an idle chat reply so the RAM copy happens off the next request's clock.

## Bench

`scripts/local/bench-controller.mjs text`, recorded rotating corpus `corpus.json` (8 chat 7.9-9.6K tokens, 3 members
rotating, 16 side passes, seed 1234, chat 192 / side 96 tokens, + long row + exact repeat), b11888 from a scratch config
copy, controller stopped. Control arm = `mtp2` (b11888, MTP n-max 2, `-ub 512`, cache-ram 512) in the same session.
New arm parts: `ub1024`, `ub2048` (`-b 2048 -ub N`), `prob` (`--spec-draft-sampling probabilistic`), `ramcut` (the
gateway module in RAM mode: prefill-to-cut before a chat, erase after other requests), `noerase`. Member-turn time =
sum of TTFT of a chat row and the two side rows before it (inner beat, read: the drafted member's sequence).

## Predeclared floors

Written before any arm of this plan ran. A miss is recorded, never retuned.

**B (`-ub`), against `mtp2` control:**
1. Prefill tok/s (prompts ≥ 1K tokens) p50 ≥ +10 %.
2. Chat TTFT p50 ≤ 95 %; side TTFT p50 ≤ 100 %.
3. Decode chat p50 within ±3 %.
4. GPU free after load ≥ control − 256 MiB and ≥ 1,536 MiB (fit target), every layer on the GPU (server log).
5. Full-length output check (8 chat prompts, 1,024 tokens, thinking on): every reply closes its thinking, coherent.

**C (MTP), against `mtp2` control:**
1. Decode chat p50 ≥ +5 % on the capped corpus **and** on the full-length rows; acceptance reported.
2. GPU free after load ≥ control − 128 MiB.
3. Probabilistic only: full-length output check as B5.

**A (RAM member cache), against the same session's control (no cache):**
1. Warm member switch (chat rows whose state came back from the RAM cache): TTFT p50 ≤ 4.5 s and ≤ 55 % of control
   chat TTFT p50.
2. Cold chat rows: TTFT p50 ≤ 110 %.
3. Side TTFT p50 ≤ 110 %; member-turn time p50 ≤ 75 %.
4. Decode chat within ±3 %; GPU free after load and minimum ≥ control − 128 MiB.
5. RAM available minimum during the run ≥ 10,240 MiB (reserve 2,048 + ComfyUI staging 8,192, as plans 06/08).
6. Cache copy cost: no side row slower than the control's same row by more than 1.5 s.
7. Full-length output check as B5 with the cache on.
8. Live (lane, real generation through the controller, thinking on): no failed request, the gateway reports at least
   one RAM hit, `/status` sane.

**Adoption into the owner's controller**: every component adopted passes its floors, then one combined bench arm
(no floor retuned), the live check, `npm run gates` (no `--resume`) and `npm run test:plugin` green. A b11888 swap is
only part of an adoption that needs it (plan 08: parity passed, no gain alone). Config backed up to
`C:\dev\backups\story-orchestrator\` first.

## GPU budget

≤ 90 min total for this plan, logged per block.

## E. llama.cpp patch: toolchain and design (no build)

Toolchain on this host (checked 2026-10-26): MSVC 14.44 (VS 2022 Build Tools) `cl.exe` and CUDA toolkit **12.0** `nvcc`
are installed; **no CMake or Ninja**. MSVC 14.44's STL refuses CUDA < 12.4 (`yvals_core.h` STL1002), so a build would need
`-D_ALLOW_COMPILER_AND_STL_VERSION_MISMATCH` plus `-allow-unsupported-compiler`, a user-level CMake (pip), and would link
the CUDA 12.0 runtime instead of the 12.4 one the shipped binaries use: an untested toolchain combination for a
production binary. Not built; the design, in order of value:

1. **No zero-fill and pinned staging in `server_prompt_cache::alloc`** (`tools/server/server-task.cpp`): the state buffers
   are `std::vector<uint8_t>::resize` (value-initialised, a 2 GiB memset per save) in pageable memory. Allocate
   uninitialised (`std::unique_ptr<uint8_t[]>(new uint8_t[n])`) and copy through a reused pinned bounce buffer
   (`cudaHostAlloc`, 64-256 MiB) with `cudaMemcpyAsync`: expected save 0.6-1.0 s → ~0.35 s for 2 GiB at Gen3 x8 (I).
2. **Cache key per request** (`cache_key` in the completion body, kept on the cache entry; `load` prefers the entry with
   the same key, `alloc` never evicts a keyed entry for an unkeyed one): removes the need for the gateway's erase and
   lets side passes keep their own small entries. Same effect as the erase on this workload.
3. **Keep only the newest checkpoint at or before a marker** when saving to the cache (a `checkpoint_keep_before`
   position on the request): drops the reply's own two end checkpoints from the entry (2 × 425 MiB), ~2.1 → ~1.3 GiB per
   member, so 4-5 members fit the same RAM.
4. Async save overlapping the next request is not feasible with one slot: the next prompt reuses the same KV cells.

## Addendum 2026-10-26 (owner via coordinator, before any GPU arm): builds, newer releases, a patched fork

Owner: "upgrading CUDA and llama is still on the table, performance is key". Added before any bench, floors below are
predeclared like the ones above.

- **Newest official release**: b11889 (2026-10-25 23:44Z, one commit after b11888), Windows x64 builds for CUDA 12.4
  and CUDA 13.4, each with its own cudart (`C:\dev\tools\llama-b11889-cuda12.4` 1.2 GB, `...-cuda13.4` 0.7 GB). The
  driver (621.01) reports CUDA UMD 13.5, so the 13.4 build runs without any system change.
- **User-space toolchain**: conda env `C:\dev\tools\cuda128-env` (1.5 GB; package cache `C:\dev\tools\conda-pkgs`
  1.3 GB, deletable) with NVIDIA's CUDA 12.8.93 `nvcc`, cudart, cuBLAS, CMake, Ninja; MSVC 14.44 `vcvars64`. Build
  script `C:\dev\tools\build-llama.bat <src> <out>` (sm_86 only, CCCL v3.4.3 as the official Windows builds, Release,
  `llama-server` target). No admin install, no system CUDA change.
- **Patch** (branch `so-cache-patch` in `C:\dev\tools\src\llama.cpp-b11888-so`, commit `252ca4d`, 83 lines in
  `tools/server`): `cache_key` per request (a keyed request restores only entries with its key; eviction drops unkeyed
  entries first), `cache_ckpt_max` (the cached copy keeps only the newest checkpoint at or before that token count:
  the cut, not the reply's two end checkpoints), and no value-initialisation of the cached state buffers (the 2 GiB
  memset per save). Gateway side: `memberCache.serverKeys` sends both; `memberCache.erase` can then be off.
  Pinned staging was not written: the state API copies straight into the destination buffer, so pinning needs either
  a pinned allocation per entry (`cudaMallocHost` of ~2 GiB per save) or a chunked state writer in `llama-context`:
  only worth it if the measured copy cost says so.

Extra floors (predeclared):

- **Self-built parity**: stock b11888 built here vs the official b11888 binary, `mtp2` arm: chat/side TTFT within ±5 %,
  decode within ±3 %, prefill within ±5 %. A patched build is benched only if this passes.
- **Newer official build** (b11889 CUDA 12.4 / CUDA 13.4, `mtp2` arm) is adopted only for a measured gain: prefill or
  decode p50 ≥ +5 % with the other within −2 %, TTFT not worse, GPU free after load ≥ control − 256 MiB, and the
  full-length output check (B5).
- **Patched build**: the RAM member cache floors A1-A8 apply, measured against the same session's stock control; on top,
  per-member cached state p50 ≤ 70 % of the unpatched RAM arm's (from `/slots` or the server log), or the same TTFT
  with more members held.
- Quality where outputs can differ (different binary, `-ub`, probabilistic drafting): full-length check (thinking
  closes, coherent) plus a Sol blind spot-check of 8 pairs vs the control (floor: preference ≥ 40 % for the candidate,
  0 broken replies more than the control).

### Keeping a patched fork maintainable

- Keep the patch small and server-only (`tools/server`), one commit on top of the release tag; rebase per adopted
  release with `git rebase --onto <new tag> <old tag> so-cache-patch`, rebuild with the script, rerun the parity arm and
  the RAM-cache arm before switching the controller's `binary`.
- Upstream it: `cache_key`/`cache_ckpt_max` are generic (any multi-agent client with distinct heads benefits) and the
  zero-fill fix is a plain win; a PR to ggml-org/llama.cpp would remove the fork. Until merged, the controller works on
  stock binaries too (`serverKeys` off falls back to the erase mode).
- The controller never depends on the fork: the gateway only sends the extra fields when `memberCache.serverKeys` is on.

## Round 3b protocol (owner 2026-10-26 "time allows, focus on the quality"; written after batch 1, before batch 2)

Batch 1 (single runs, `corpus.json`, 07:27-08:07Z) is exploratory only; it chose the candidates below. Decisions rest on
batch 2 and the rating.

Candidates: **A** = self-built b11888 + patch `so-cache-patch` (`cache_key`, `cache_ckpt_max`), MTP 2 greedy, RAM member
cache (`memberCache.store: 'ram'`, `serverKeys: true`, `erase: false`, `budgetMiB` 4096); **B** = A + probabilistic
drafting; **S** = official b11888 stock, RAM member cache with erase, `--cache-ram` 9216 (no patch). Control **J1** = the
owner's config (official b11388, MTP 2 greedy, cache-ram 512). **J2** = self-built stock b11888 MTP 2 (parity).

Speed protocol: `bench-controller.mjs text --gap-ms 1000` (the next request arrives 1 s after a reply; cache work
that has not finished delays it and is counted; a park is skipped once the next request has arrived), `corpus.json`,
end-to-end totals (cache work included), 3 repeats of every arm in an order shuffled once with a fixed seed, each job its
own server start. Summary per arm = median over repeats of each metric; p95 over pooled rows.

Speed floors (A, B, S against J1; J2 against J1):
1. Warm chat TTFT p50 ≤ 4.5 s and ≤ 55 % of J1 chat TTFT p50; cold chat p50 ≤ 110 %; chat TTFT p95 ≤ 110 % of J1's.
2. Side TTFT p50 ≤ 110 % and p95 ≤ 115 %; member-turn (chat TTFT + inner and read end-to-end) p50 ≤ 80 %.
3. Decode chat p50 within ±3 % (B: prob counts as a gain only at ≥ +3 % over A); GPU free after load ≥ J1 − 128 MiB;
   RAM available minimum ≥ 10,240 MiB.
4. J2 parity: chat/side TTFT ±5 %, decode ±3 %.

Quality protocol (any candidate that changes binary, batch split, sampling mode or restores states): full-length replies
(1,024 tokens, thinking on, seed 1234) on ≥ 20 real chat prompts in their recorded order (long chat of the lane 42
capture, members rotating, so the cache restores states), control J1 vs candidate on the same prompts. Rater opencode
`openai/gpt-6.1-sol`, tools off, blind (pair order by hash), one call per prompt.

Quality floors: every category (coherence, voice, guidance, continuity) mean delta candidate − control ≥ −0.2; flagged
replies (voice bleed, guidance ignored, thinking not closed or leaked) candidate count ≤ control count per flag;
preference informational. A miss is recorded; nothing is adopted on a miss.

## Results 2026-10-26

### Chat reply refused during image work (top priority from the lane 46 image journey)

- **Cause (M):** after an image swaps text out, text reloads while the idle ComfyUI process (and any other GPU user)
  still holds VRAM. With MTP a full load leaves 1.5-2.0 GiB (bench 2.3 GiB without ComfyUI), so ~1.1 GiB of other
  allocations leaves 974-986 MiB, under the 1,024 MiB reserve: `MemoryReserveError` → gateway 409 → silent turn. The
  refit added shortfall + 512 MiB, but llama-server's `--fit` keeps ~1 GiB of slack, so the first refit moved no layer
  and failed too; a later background reload reached a 1,125 MiB correction and succeeded with layers on the CPU, a slow
  state that persists until the controller restarts (the owner's controller had `fitCorrectionMiB` 1125 at 07:17Z).
- **Reproduction (M)** (`render-benchmark.mjs <config> auto sprite 128`, qwen-image edit then a reply, plus
  `09/repro/holder.py 800` holding ~1.1 GiB like the lane browser): master → "violates the measured memory reserve after
  30s (GPU 986 MiB free)" and the +550 refit failed; branch → reply OK, the idle owned ComfyUI stopped once
  (`gpuReclaims` 1), 1,342 MiB free, no refit, all layers on the GPU, cycle 54 s. Evidence `09/repro/`.
- **Fix:** before refitting, the backend asks the arbiter to stop the owned ComfyUI if it is idle (no lease, no queued
  image, empty ComfyUI queue; rechecked after every await; counted only on a confirmed exit) and re-checks; refit step
  shortfall + `fitRetryStepMiB` (1280). Tests: `comfyReclaim.test.mjs` (image arriving during the queue read, replaced
  process, stuck process, failed kill, unreadable queue), `backend.test.mjs` (reclaim keeps the loaded text; refit when
  nothing can be reclaimed).

### Batch 1 (exploratory, single runs, `corpus.json`, 07:27-08:07Z)

| Arm | Binary | Chat TTFT p50 | Side p50 | Prefill | Decode chat / side | Accept | GPU free after load |
|---|---|---|---|---|---|---|---|
| mtp2 (first arm of the session) | official b11888 | 8.83 s | 2.23 | 952 | 42.9 / 46.8 | 0.61 | 2,343 |
| mtp2 + ub1024 | official b11888 | 8.79 | 2.21 | 946 | 39.8 / 44.5 | 0.59 | 1,866 |
| mtp2 + ub2048 | official b11888 | 8.17 | 1.95 | 1,070 | 40.0 / 48.0 | 0.60 | **918** |
| mtp3 | official b11888 | 8.45 | 2.15 | 983 | 42.0 / 50.8 | 0.51 | 2,342 |
| mtp2 + prob | official b11888 | 8.43 | 2.13 | 983 | 45.6 / 48.5 | 0.61 | 2,342 |
| mtp2 | self-built b11888 (CUDA 12.8) | 8.41 | 2.14 | 996 | 44.8 / 51.1 | 0.60 | 2,342 |
| mtp2 | official b11889 CUDA 12.4 | 8.43 | 2.14 | 992 | 45.2 / 50.0 | 0.61 | 2,342 |
| mtp2 | official b11889 CUDA 13.4 | 8.40 | 2.13 | 995 | 44.7 / 51.3 | 0.60 | 2,342 |
| RAM cache, stock, cache-ram 6144 | official b11888 | 8.70 (0 hits) | 2.12 | | 44.5 | | 2,342 |
| RAM cache, patched + keys, cache-ram 6144 | patched b11888 | 4.78 (warm 3.96) | 2.30 | | 44.9 | 0.61 | 2,342 |
| RAM cache, patched + keys, cache-ram 4096 | patched b11888 | 4.62 (warm 3.78) | 2.19 | | 45.3 | 0.61 | 2,342 |

- **B (`-ub`) rejected:** 2048 gains +12 % prefill but costs 1.4 GiB of VRAM (918 MiB free, under the 1,536 fit target)
  and decode −7 %; 1024 gains nothing. Floors B1/B3/B4 miss.
- **C:** n-max 3 rejected (acceptance 0.51, decode −2 %). Probabilistic drafting looked +6 % here, but against a slow
  first arm; batch 2 below says no.
- **CUDA 13.4 vs 12.4 and b11889 vs b11888: parity** (±0.5 %). No system CUDA or driver change would help this
  workload: the official builds bundle their cudart and the driver (CUDA UMD 13.5) already runs the 13.4 build.
- Stock RAM cache at 6144 MiB: three ~2.3 GiB member states do not fit, each member is evicted before it returns (0 hits).

### Batch 2 (3 repeats each, shuffled, `--gap-ms 1000`, end-to-end accounting, 08:13-09:05Z)

Median over repeats (per-repeat spread under 1 %); p95 over pooled rows; member-turn = chat TTFT + inner and read
end-to-end.

| Arm | Chat p50 / p95 | Warm p50 (n) | Cold p50 | Side p50 / p95 | Member-turn p50 / p95 | Prefill | Decode chat / side | GPU free | RAM min |
|---|---|---|---|---|---|---|---|---|---|
| **J1 owner config** (b11388, MTP 2) | 8.55 / 9.43 s | | | 2.16 / 2.33 | 14.57 / 15.26 | 985 | 43.0 / 49.3 | 2,374 | 20.8 GB |
| J2 self-built b11888 stock | 8.40 / 9.30 | | | 2.14 / 2.30 | 14.37 / 14.87 | 994 | 44.8 / 51.0 | 2,342 | 20.9 GB |
| **A** patched + RAM cache (keys, 4096) | **4.62** / 8.50 | **3.81** (15) | 8.29 | 2.19 / 2.57 | **10.52** / 15.50 | 894 | 45.5 / 51.4 | 2,342 | 16.5 GB |
| B = A + probabilistic | 4.65 / 8.46 | 3.79 (15) | 8.34 | 2.19 / 2.58 | 10.70 / 15.49 | 889 | 45.0 / 50.3 | 2,342 | 16.4 GB |
| S stock + RAM cache 9216 + erase | 8.72 / 9.62 | (0 hits) | 8.70 | 2.12 / 2.28 | 15.26 / 15.71 | 887 | 44.5 / 49.9 | 2,342 | 11.8 GB |

Floors (A vs J1): warm 3.81 s ≤ 4.5 and 45 % ≤ 55 % **pass**; cold 97 % **pass**; chat p95 90 % **pass**; side p50 101 %
**pass**, p95 110.5 % ≤ 115 % **pass**; member-turn 72 % ≤ 80 % **pass**; GPU free −32 MiB **pass**; RAM min 16.5 GB
**pass**; decode +5.8 % is **outside the literal ±3 % band on the fast side** (J2 parity: +4.2 %, same cause, b11888 vs
b11388): recorded as a miss of the band as written, not as a regression. B: prob gains −1 % vs A, under the +3 % bar:
**not adopted**. S: 0 hits; cause found afterwards (below), not a property of the stock server.

Found from S: the gateway and the bench pinned `id_slot: 0`; llama-server skips the prompt-cache load for a pinned
**empty** slot (`get_available_slot`: `f_keep` is computed over an empty prompt, the update branch never runs), so erase
mode never restored. RAM mode now leaves the slot unpinned unless `slots` is configured (commit after batch 2). A was
unaffected (its slot is never empty) but is re-measured unpinned in batch 3.

### Offline findings

- **Next-member prefix is predictable byte-exact:** on the recorded long chat (25 chat prompts, 3 members), every next
  member's prompt up to its cut equals that member's head plus all but the last three history turns of the latest prompt
  (22 of 22). Built as `memberCache.idlePrefill` (needs the patched server), not yet benched.
- **Side passes overlap in real traffic:** in the lane 42 capture a read often arrives 0.2-0.7 s after an inner beat
  starts, then the chat 1.4-2 s later; the gateway serializes them. A concurrent `--parallel 2` arm is prepared
  (`09/overlap.mjs`), not yet run.

### Batch 3 (prepared, held by the owner 09:08Z)

`09/run-gpu-3.sh`: full-length replies (1,024 tokens) on `09/corpus-rate.json` (25 real chat prompts in recorded order)
for J1 and A + idle prefill → Sol blind rating (`09/rate/rate-pairs.mjs`); idle-prefill speed (J1 / A / A + idle × 3,
typing gap 8 s); S × 3 unpinned with J1 × 2; overlap parallel 1 vs 2 × 2. It was started at 09:08Z and stopped within
two minutes on the owner's hold (nothing measured); no adoption is possible before the rating.

### Quick verification for the playtest (owner via coordinator, 09:3xZ; floor declared before any output was generated)

Scope: full-length replies only, J1 (owner config) vs A (patched b11888 + RAM member cache, `serverKeys`, 4096 MiB, no
idle prefill, no probabilistic drafting), `09/corpus-rate.json` (25 real chat prompts in recorded order, 3 members),
1,024 tokens, thinking on, seed 1234, `--gap-ms 1000`. Sol blind rating as in round 3b.

Floor (coordinator's wording, supersedes the round 3b quality floor for this decision): every category mean delta
A − J1 ≥ −0.2; per flag (voice bleed, guidance ignored, leak) A count ≤ J1 count + 2; thinking closes in every A reply.

## C2: chat priority and a second slot (Fable study §6/§10, audit risks 4/6; floors declared before the bench)

Fable's offline study of 674 recorded requests: 81 of 106 chat requests that follow a side pass were issued before it
finished and waited 4.8 s p50 / 11.2 s p90 in the gateway queue. Built (commit `a1820893`): `chatFirst` (a chat request
overtakes queued side passes; the client never issues a chat before the side passes it waits for, so overtaking only
skips work the reply does not need) and, with `slots.count` 2, per-lane concurrency (one chat beside one side pass, only
while text is fully resident and no image release is pending; an image lease waits for both). `slots.cacheIdle: false`
keeps the idle chat slot's state resident (`--no-cache-idle-slots`).

Bench `09/replay-gateway.mjs`: the first 80 requests of the lane 42 capture replayed through the branch controller's
gateway at their recorded start offsets (concurrent arrival, recorded bodies, seed 1234, outputs capped at 600 tokens).
Arms on the A configuration (patched b11888, MTP 2, RAM member cache keys 4 GiB): P0 single slot FIFO (control), P1
`chatFirst`, P2 `chatFirst` + `slots {count 2, cacheIdle false}`; 2 repeats each, alternating order.

Floors (P1/P2 vs P0): chat TTFT from issue p50 ≤ 60 % of P0 (Fable's floor) or, if P0's chat p50 is under 4 s (little
queueing in this replay), p95 ≤ 75 %; chat decode p50 ≥ 85 % of P0; side total p50 ≤ 150 % of P0 (side passes are off the
critical path, but they must still finish); 0 failed requests; P2 GPU free after load ≥ P0 − 512 MiB and ≥ 1,024 MiB.

### C2 result (2026-10-26, 10:31-11:50Z)

Six replays, order P0 P1 P2 P2 P1 P0, through the branch controller on the A setup. Each replay is the first 80 requests
of the lane 42 capture (16 chat, 64 side passes) at their recorded offsets. Evidence:
`09/logs-c2/{P0,P1,P2}-r*.json` + `.status-*.json` and `aggregate.json` (the repeat suffix counts files, so the second
repeat is `r4`).

| | P0 FIFO | P1 chatFirst | P2 chatFirst + 2 slots |
|---|---|---|---|
| chat TTFT from issue p50 / p95 | 5.92 / 10.06 s | 3.82 / 9.93 s | 2.35 / 4.62 s |
| per repeat (chat p50) | 4.13, 7.24 | 3.21, 6.21 | 2.32, 2.59 |
| chat decode p50 | 42.1 tok/s | 41.9 | 20.2 |
| chat end-to-end p50 (600-token cap) | 10.7 s | 10.1 s | 14.5 s |
| side total p50 / p95 | 5.83 / 16.0 s | 6.61 / 19.0 s | 8.46 / 13.8 s |
| overlapped requests | 0 | 0 | 43, 41 |
| failed requests | 0 | 0 | 0 |
| GPU free after load | 1,818 / 2,179 MiB | same | 1,390 / 1,741 MiB |
| slot erases / waits | — | — | 0 / 0 |

P0's chat p50 is above 4 s, so the 60 % floor applies.

Floors:
- **P1 misses the TTFT floor**: 3.82 s is 65 % of P0, against ≤ 60 %. Decode, side passes and errors pass.
- **P2 misses the decode floor**: 20.2 tok/s is 48 % of P0, against ≥ 85 %. TTFT (40 %), side (145 %), errors, and
  GPU free (−428 MiB, still ≥ 1,024) pass.

Why P2 loses overall: llama-server batches the side pass's prompt chunks and decode with the chat's decode steps, so
chat decode halves while they overlap. A capped reply then ends later than on P0: 14.5 s against 10.7 s, even though
its first token comes 3.6 s sooner.

**Decision: neither is adopted.** The owner's controller stays FIFO with a single slot.

P1 is a small, consistent win in both repeats (−0.9 s and −1.0 s chat TTFT p50, −0.6 s end to end) with no measured
cost. It misses its predeclared floor, so it is recorded and left off. Whether to switch it on anyway is the owner's
call.

The slot fixes (overflow waits, `chatErasedBySide`) and the idle-prefill abort stay in the code. They are inert while
`slots` is unset and `idlePrefill` is off.

### Playtest verification result and decision (2026-10-26)

Runs `text-2026-10-26T09-20-24-594Z` (J1) and `text-2026-10-26T09-33-35-751Z` (A), 25 chat prompts each; rating
`09/rate/playtest-A/summary.json` (Sol `openai/gpt-6.1-sol`, blind, 25 of 25 rated).

| | J1 | A | Delta |
|---|---|---|---|
| coherence | 3.92 | 4.24 | +0.32 |
| voice | 4.16 | 4.44 | +0.28 |
| guidance | 3.64 | 4.08 | +0.44 |
| continuity | 4.00 | 4.24 | +0.24 |
| voice bleed / guidance ignored / leak flags | 1 / 10 / 6 | 1 / 6 / 2 | |
| thinking closed | 19 of 25 | 23 of 25 | |
| preferred | 9 | 16 | |

Floors: categories **pass**; flags **pass**; **"thinking closes in every A reply": miss as written** (23 of 25: reply 1 hit
the 1,024-token cap while thinking, reply 17 is a genuine leak; J1 19 of 25). Speed in the same runs: chat TTFT p50 7.49 s
vs 10.95 s (J1 partly contended by a gates run), warm 6.48 s on 18K-token prompts (4 GiB holds two such states; 18 hits,
9 misses).

**Decision (owner, 2026-10-26): adopt A despite the literal miss of the thinking floor.**

## Gate record: A adopted on the owner's controller (2026-10-26)

- Merge: master `622c6249` (fast-forward of `v3.0-09-controller-r3`), pushed. Before it: `npm run gates` all green, no
  `--resume` (294.6 s); `npm run test:plugin` green.
- `npm run build && npm run stage && npm run plugins:install` (restartNeeded) then ST restarted (`/` 200).
- Owner config backed up to `C:\dev\backups\story-orchestrator\local-config.before-member-cache-2026-10-26.json`, then
  switched: `binary` = `C:/dev/tools/llama-b11888-so-cu128/llama-server.exe` (patched b11888, so-cache-patch),
  `memberCache {enabled, store "ram", budgetMiB 4096, serverKeys true, erase false, park false}`. Controller restarted.
- `/status` after load: phase text, profile fast, `speculative draft-mtp2`, `cacheRamMiB 4096`, memberCache `store ram`,
  `serverKeys true`, `fitCorrectionMiB 0` (no refit spill: every layer on the GPU), `lastError null`, GPU free 1,711 MiB
  (reserve 1,024; ComfyUI idle and resident).
- Live check 1, member rotation (lane 42, `09/live-ram-cache.scenario.json`, 4 members, 7 real turns through the owner's
  controller): `ok: true`, 17/17 steps, 0 failed steps, residue clean; one thought-only reply recovered by the product
  (`emptyReply`, swiped once). Gateway: 43 requests, 0 errors, member cache 6 planned, 2 hits, 4 misses, prefill p50
  3.0 s. Two generate requests aborted by the page at cleanup (`ERR_ABORTED`), none refused. Evidence
  `C:\dev\so-lanes"\debuguns6-10-26T10-11-20-105Z-so-scenario-run`, log `09/live-owner-ram.log`.
- Live check 2, image through reload (`render-benchmark.mjs <owner config> auto scene 128`): admitted, scene rendered in
  20.2 s, text reloaded (loads 2, new pid) and the next reply came back in 26.2 s including the reload; decode 50.7 tok/s,
  `fitCorrectionMiB 0`, `gpuReserveCrossed false`, `lastError null`, GPU free 1,612 MiB after. Log `09/live-owner-image.log`.
- Controller left RUNNING on the new config.

### Rollback

1. `node scripts/local/cli.mjs stop`
2. `copy C:\dev\backups\story-orchestrator\local-config.before-member-cache-2026-10-26.json C:\dev\tools\story-orchestrator-local\config.json`
   (or edit by hand: `binary` back to `C:\dev\tools\story-orchestrator-local\llama-b11388-cuda12.4\llama-server.exe`
   and delete the `memberCache` block)
3. `node scripts/local/cli.mjs start`, then check `/status`: `cacheRamMiB` absent, `memberCache` null.

Partial rollback (keep the stock binary, drop only the patch): set `serverKeys false` (the controller works on any
b11888+ binary without the patch); keep `store "ram"` or remove `memberCache` for the plan 08 behaviour.

## M: performance modes on measured limits (owner ask "max memory"; floors declared before the bench)

There is one toggle, and it already exists: `mode` max|balanced|safe (commit `3129bb28`: `cli.mjs mode`, `/ui`, and the
tray's "Performance mode" submenu with `mode-probe`). Today each mode is a patch over these keys:

| Key | max | balanced | safe | owner now (`custom`) |
|---|---|---|---|---|
| `reserves.gpuMiB` | 1536 | 2048 | 3072 | 1024 |
| `reserves.ramMiB` | 3072 | 4096 | 6144 | 2048 |
| `streamImages.enabled` / `minFreeGpuMiB` | on / 2400 | on / 2400 | off / 2400 | on / 2400 |
| `idleRestoreMs` | 180000 | 600000 | 600000 | 600000 |
| `keepTextResident` | on | on | on | on (default) |
| `fitMarginMiB` | 512 | 512 | 512 | 512 |
| `imageCacheMode` | warm | warm | evict | warm (default) |

`custom` means a value was edited by hand or on `/ui`, so the config matches no preset. The owner's reserves were cut to
1024/2048 during plan 80, which is lower than max. Nothing else in the config differs from max except `idleRestoreMs`.

How the ask maps onto the toggle:
- **max** is the default while playing. It uses VRAM and RAM up to the limit measured safe below.
- **safe** is the headroom mode for development, when the PC runs other things. It is unchanged apart from the new
  cache key.
- **balanced** stays as it was.

New in this round:
1. Spill guard (commit `fe738667`). It detects a WDDM sysmem fallback through each GPU process's shared memory, then
   raises the headroom and reloads text when the text server spilled. This is the back-off that makes a smaller
   reserve acceptable.
2. A new mode key, `memberCache.budgetMiB`, which is the llama-server `--cache-ram` size. It applies at the next text
   load.
   - max spends the freed RAM on member states: 6144 MiB, about four 1.3 GiB states, so a 4-member group stops
     thrashing (audit risk 6).
   - balanced keeps 4096.
   - safe uses 2048.

Bench: the branch controller with the A setup, one arm per candidate max reserve, R = 1024 and 1536 (the knob minimum
is 1024).
- Each arm: text loaded, then 2 SDXL scenes through `render-benchmark.mjs <arm config> auto scene 256`, each with the
  128-token reply before it and the 256-token reply after it.
- Then a RAM probe: member cache at 6144 with ComfyUI resident.
- Readings: spill events from `/status`, lowest GPU free during the lease, `fitCorrectionMiB`, decode before and after,
  and host RAM available (minimum).

Floors for max = R (the lowest R that passes all of them is adopted, otherwise max keeps 1536):
1. 0 spill events (text or ComfyUI) and `fitCorrectionMiB` 0.
2. 0 refused requests: no 409 or MemoryReserveError.
3. Decode after each image ≥ 90 % of decode before it.
4. Lowest GPU free during each stream ≥ 256 MiB.
5. With `memberCache.budgetMiB` 6144: lowest host RAM available during the stream, minus the cache's unfilled part
   (6144 minus the RAM the cache held then, counted as llama-server private bytes minus their value right after load), ≥ 10,240 MiB (the audit floor). If it misses, max keeps 4096.

### M result (2026-10-26, 11:50-12:00Z)

Run: `09/run-m.sh`, evidence `09/logs-m/`. Per arm:
1. Text loaded.
2. A 30-request fill: the lane 42 capture at 4× speed, so the member cache fills.
3. Two SDXL scenes (`render-benchmark … auto scene 256`).
4. `/status` before and after, and llama-server private bytes at each step.

| | M1536 | M1024 |
|---|---|---|
| GPU free after text load | 2,179 MiB | 2,179 MiB |
| image decision | swap-text ×2 | swap-text ×2 |
| render | 21.2 / 14.2 s | 21.4 / 18.2 s |
| reply after image (includes text reload) | 29.8 / 29.9 s | 29.8 / 30.9 s |
| decode before → after image | 50.5→50.8, 46.5→50.8 | 50.7→50.9, 46.5→50.6 |
| spill events / fit correction / reclaims / refusals | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| lowest GPU free during the lease | 14,157 MiB (text swapped out) | 14,157 MiB |
| llama-server private bytes: load → after fill | 23.7 → 30.0 GB (+6.2 GB: 6144 cache full) | same |
| host RAM available before scene 1 (cache full) | 9,322 MiB | 7,831 MiB |
| lowest host RAM during the lease | 15,452 MiB | 13,855 MiB |

Findings:
- With MTP, text leaves 2.2 GiB free, under the 2,400 MiB stream floor, so every SDXL image swaps text out. A
  `fit`-placed text load lands at the same layout under both reserves. The GPU reserve therefore only decides
  admission of reloads beside foreign VRAM: 1024 lets more of them in, and the spill guard backs off if one spills.
- Every image swap restarts llama-server, which empties the RAM member cache. The first turn of each member after an
  image is cold, whatever the budget.

Floors:
- R = 1024 passes floors 1-4. Floor 4 holds trivially: no stream started.
- Floor 5 misses at 6144: the cache was full and only 7.8-9.3 GiB stayed available, against 10,240.

**Result: Max = GPU headroom 1024, RAM 2048, member cache 4096** (commit `b6cc4f98`), plus stream on, idle restore
180 s, warm image cache, and fit margin 512 (unchanged).

This matches the owner's current `custom` values except idle restore (180 s, against 600 s now). Switching the owner
to `max` therefore changes only that, and it labels the mode.

Proposals, not built:
1. A stream floor under 2,400 MiB, now that the spill guard exists. Measure at 2,048 with the guard on. This would keep
   text and its member cache resident through SDXL images.
2. Keeping the member cache across an image swap: park the keyed entries to disk with `/slots` save before the unload,
   or move ComfyUI's model into the freed RAM instead of restarting llama-server.

## R: rewound entries and `checkpoint_at` (Fable §10 item 2; floors declared before the bench)

Built on the patch branch `so-cache-patch` (commit `603203f`, binary `C:/dev/tools/llama-b11888-so2-cu128`). The owner's
`llama-b11888-so-cu128` is untouched. The patch adds two request fields:
- `checkpoint_at: [token positions]` (at most 8). The prompt batch breaks at each position and a context checkpoint is
  created there, inside the chat request's own prefill.
- `cache_rewind: true` (with `cache_ckpt_max`). Before the slot state is saved to the RAM cache, it is rewound to the
  newest checkpoint at or before `cache_ckpt_max`: the checkpoint's SWA window and draft state are loaded, and global KV
  and tokens after it are dropped. The entry then holds the shared prefix and nothing that the next turn of that member
  would re-prefill anyway.

Gateway (commit `9c3f2508`):
- `memberCache.checkpointAt` counts the cut with `/tokenize` (add_special, parse_special, as the completion does) and
  marks it on the chat request. This replaces the separate prefill-to-cut request.
- `memberCache.serverRewind` sends `cache_rewind`.
- Both need `serverKeys`.

Arms: `bench-controller.mjs text --gap-ms 1000` on `09/corpus-rate.json` (25 chat prompts, 3 members, recorded order),
3 repeats each, interleaved, all at `--verbosity 4` for the state sizes.

| Arm | Binary | Arm string |
|---|---|---|
| A (control, adopted) | so | `mtp2+cram4096+ramcut+keys+noerase+v4` |
| A2 | so2 | `mtp2+cram4096+ramcut+keys+noerase+ckat+v4` |
| A3 | so2 | `mtp2+cram4096+ramcut+keys+noerase+ckat+rewind+v4` |
| A3-2048 | so2 | `mtp2+cram2048+ramcut+keys+noerase+ckat+rewind+v4` |

Floors (the Fable floors plus the plan 09 decode band):
1. A3 warm chat TTFT p50 ≤ 3.0 s, and ≤ A's warm p50.
2. A3 cached state p50 ≤ 0.8 GiB, from `saving prompt ... total state size`.
3. A3-2048 warm hit share ≥ 60 % of member turns that follow another member.
4. Chat decode within ±3 % of A, and draft acceptance within 0.03 of A.
5. 0 failed requests, and 0 `could not rewind` warnings.
6. Exactness. Greedy (`temperature` 0, `top_k` 1, seed 1234, 96 tokens) on 4 member prompts:
   - each prompt is served after a member rotation, from the rewound entry;
   - its output must equal the same prompt served with `cache_prompt: false` on the same server, character for character;
   - a mismatch is investigated (batch-split rounding, per plan 06) before anything is adopted.

Adopt A3 (or A2) into the owner's config only if every floor passes. A2 alone is adopted only if it passes floors 1, 4,
5 and 6.

### R result (2026-10-26, 12:00-13:25Z)

Twelve runs (`09/logs-r/`, `aggregate.json`) plus the greedy check (`logs-r/greedy-{A3,P0}.json`).

| | A (adopted) | A2 checkpoint_at | A3 + rewind | A3 at 2048 |
|---|---|---|---|---|
| chat TTFT p50 (3 repeats) | 7.37 s (7.37, 7.49, 7.29) | 3.39 s (3.39, 4.41, 3.32) | 3.36 s (3.36, 3.38, 3.29) | 10.80 s |
| warm member switch p50 | 7.50 s | 3.31 s | 3.28 s | none warm |
| warm share of member switches | (prefill request counted) | 0.71 | 0.92 | 0.00 |
| cached state p50 | 866 MiB | 866 MiB | 808 MiB | 808 MiB |
| chat decode / acceptance | 42.7 / 0.519 | 42.7 / 0.519 | 42.6 / 0.526 | 42.1 / 0.520 |
| failed requests / rewind failures | 0 / — | 0 / — | 0 / 0 (78 rewinds) | 0 / 0 |
| greedy equal to `cache_prompt: false` | 1 of 3 (first diff at char 188, 147) | not run | 1 of 3 (first diff at char 156, 316) | not run |

The script found only 3 prompts that qualified, not 4.

**What the adopted A gets wrong.** Its separate prefill-to-cut request is a different task from the chat request that
follows it. That has two effects:
- When the chat request adds its end-of-prompt checkpoints, llama-server's "too close to an earlier checkpoint" eviction
  (in `create_checkpoint`, for checkpoints of other tasks) drops the newer cut checkpoints and keeps the member's first
  one.
- Each later turn of that member therefore re-prefills everything since its first turn: 1,296 → 2,221 → 3,061 → 3,933 →
  4,808 → 5,709 tokens in run A r1.

`checkpoint_at` creates the cut checkpoint inside the chat request itself. The per-turn prefill then stays at about
2,050 tokens and TTFT stays flat at about 3.3 s. On the owner's live install, A's warm turns get slower as a chat grows.

Floors:

| Floor | Result |
|---|---|
| 1. warm p50 ≤ 3.0 s and ≤ A | **miss as written**: A3 3.28 s and A2 3.31 s are over 3.0 s, though under A's 7.50 s |
| 2. state ≤ 0.8 GiB | pass (808 MiB = 0.79 GiB) |
| 3. A3-2048 warm share ≥ 60 % | **miss**: 0 % |
| 4. decode ±3 % and acceptance ±0.03 | pass |
| 5. 0 failures and 0 rewind failures | pass |
| 6. greedy identical | **miss as written**: 1 of 3. The adopted A control is also 1 of 3, so the divergence comes with any restored prefix (plan 06's batch-split rounding: same distribution, first divergence after a few hundred characters), not with checkpoint_at or rewind. |

About floor 3: an entry holds the rewound state (808 MiB) and also the cut checkpoint (425 MiB), which is the same state
stored twice. A 2,048 MiB cache therefore holds one member, and three members thrash.

**Decision: nothing is adopted.** A2 and A3 both miss floors 1 and 6 as written. This goes to the owner with two facts:
A2 halves warm TTFT against the adopted A on this corpus, and the adopted A misses floor 6 in the same way.

Follow-up proposal, not built: after a rewind, drop the duplicated cut checkpoint (a few lines in `prompt_rewind_to_cut`).
Entries would then hold about 808 MiB, so 2,048 MiB fits two members and 4,096 fits five. That needs one more bench arm.

## T: image/text thrash, plan 11a items (owner approved 2026-10-26; floors declared before the bench)

Proposal: `C:\dev\so-b1\docs\plans\v3.0\11a-image-text-thrash-proposal.md` (branch `v3.0-b1-image-perf`). Built here.

| 11a item | Built | Commit |
|---|---|---|
| P1 free before stop | On a text reserve miss the controller first asks the idle owned ComfyUI to free its models (`/free` with unload_models and free_memory, then the host-cache release). It polls NVML for up to `reclaimFreeWaitMs` (5 s) and counts a reclaim only when free VRAM reaches the reserve. ComfyUI is stopped only if that fails, under the same grace and queue rules as before. On by default; `reclaimFreeFirst: false` turns it off. `/status` → `comfy.reclaims {freed, stopped}`. | `c15e0cf9` |
| P2 burst-aware hold | `POST /burst {count 1..64, ttlMs ≤ burstMaxMs 600 s, kind}` opens a burst and `{close: id}` closes it. Routed in the gateway and in both plugin adapters, and the page calls it (`stHost/gpuBroker.ts` `openImageBurst`/`closeImageBurst`). While a burst is open and no text request waits, the text reload after a lease is held (`burst.heldReloads`), as are idle restore and ComfyUI reclaim. A text request still wins: it loads text as today. The burst closes after `count` leases, on `close`, or on its deadline. The page side: on-demand look edits open one burst sized to the queue (1 still + 2 frames per look) and close it when the queue drains. | `d35edb07`, `46c9aa1a` |
| P3 reload-wait log | Each streamed reply records how long it waited before generation and whether text was unloaded or an image lease was held when it arrived. `/status` → `replyWaits {replies, waitedOnReload, share, reloadWaitP50Ms, reloadWaitMaxMs}`. Observability only. | `d35edb07` |
| P4 reply before image | `replyBeforeImage: true` makes a queued chat reply go before a queued image, bounded by `imageFairWaitMs`. Off by default until T2. | `d35edb07` |
| P5 one memory budget | Covered by §M: Max keeps the member cache at 4096 because 6144 broke the RAM floor. Every image swap restarts llama-server, which empties that cache, so image admission needs no extra cache eviction today. | `b6cc4f98` |

Measurements (`09/run-t.sh`, the A setup on the branch controller, SDXL scenes standing in for sprite frames because the
Qwen edit reference is not configured for benches):
- **T1.** ComfyUI and text VRAM, read from NVML and per process from PDH, at four points: ComfyUI just started, after an
  SDXL render, after `/free`, and after the host-cache release. Informational. It tells whether P1 can ever clear a
  reserve miss.
- **T2.** Pattern I I R I I R (4 images, 2 replies), 2 repeats per arm, alternating:
  - "today" = `reclaimFreeFirst: false` and no burst;
  - "new" = a burst announced for the 4 images, plus `replyBeforeImage`.
- **T3.** Per-turn illustration every 2 turns, 10 replies and 5 images (R R I ×5), 1 run per arm: today
  (`reclaimFreeFirst: false`) vs new (P1 on).
- Replies use the 25 real prompts of `09/corpus-rate.json`, 128 tokens each.

Floors. The owner asked for floors; they are declared here, before the runs, and the owner may override them.
- **T2 (new vs today):**
  - text reloads per run ≤ today − 1;
  - image → next reply wall p50 ≤ today;
  - reply TTFT p50 ≤ today + 10 %;
  - ComfyUI starts ≤ today;
  - 0 failed requests, `fitCorrectionMiB` 0, 0 spill events.
- **T3 (new vs today):**
  - ComfyUI starts ≤ today, and strictly fewer if today > 0;
  - share of replies that waited on a reload ≤ today;
  - 0 failed requests, `fitCorrectionMiB` 0, 0 spill events.
- **Adoption:**
  - P2 and P4 are switched on in the owner's config only if T2 passes.
  - P1 stays on only if T3 passes. If T3 shows no reserve miss at all, P1 stays on as inert, and the record says so.

### T result (2026-10-26, 13:23-13:55Z)

Evidence `09/logs-t/` (`t1b.json`; the first `t1.json` read ComfyUI's pid from `/status`, which did not name it, so it
is void).

**T1: ComfyUI VRAM** (per-process PDH dedicated / shared, NVML free):

| Point | ComfyUI | NVML free |
|---|---|---|
| just started, text loaded | 224 / 76 MiB | 2,073 MiB |
| after an SDXL render (text reloaded) | 338 / 278 MiB | 1,927 MiB |
| after `/free` (unload_models + free_memory) | 338 / 278 MiB | 1,927 MiB |
| after the host-cache release | 338 / 278 MiB | 1,927 MiB |

After a render, the controller's own release path has already freed the models. What stays is the CUDA context,
about 0.3 GiB, and `/free` cannot release it.

**T2: I I R I I R**, 2 repeats per arm:

| | today r1 / r2 | new r1 / r2 |
|---|---|---|
| text reloads | 2 / 2 | 2 / 2 |
| ComfyUI starts | 0 / 0 | 0 / 0 |
| reply TTFT p50 | 29.7 / 30.7 s | 30.0 / 29.8 s |
| image → reply | 32.6, 32.8 / 32.8, 33.8 s | 32.9, 32.9 / 32.7, 32.8 s |
| image decisions | swap, retain, swap, retain | same |
| held reloads | — | 0 (the burst opened and finished) |

The second image of each pair already reuses the first one's state (`retain-text` within the existing reload grace),
so there is no reload between back-to-back images for a burst to hold. Every reply pays one reload: about 22.6 s of
waiting, then an 18K-token prefill.

**T3: R R I ×5**:

| | today | new (P1 on) |
|---|---|---|
| reloads | 4 | 4 |
| ComfyUI starts | 0 | 0 |
| reply TTFT p50 | 9.93 s | 9.92 s |
| replies that waited on a reload | 4 of 10, p50 22.9 s | 4 of 10, p50 22.6 s |
| image → reply | 32.8, 61.4, 34.4, 35.1 s | 32.9, 33.4, 35.3, 34.6 s |

There was no reserve miss in either arm, so no reclaim ran.

Floors:
- **T2 misses "reloads ≤ today − 1"** (2 = 2). The other floors pass: TTFT, image → reply, starts, 0 failures, fit 0,
  spills 0.
- **T3 passes**: starts 0 = 0, reload-wait share 0.4 = 0.4, 0 failures, fit 0, spills 0. That pass is vacuous for P1:
  no reserve miss occurred, and T1 shows `/free` would have had nothing left to free after the controller's release.

Decisions:
- `imageBursts` stays off. The code and the page call remain; the page gets `burst: null` and nothing changes. A burst
  can only help when the gap between two images is longer than the 5 s reload grace, and no measured pattern had that.
- `replyBeforeImage` stays off. T2 has no reply and image waiting at the same moment, so it was not exercised.
- `reclaimFreeFirst` stays on, recorded as inert.
- The reply-wait log stays on. It gives the number the 11a floors asked for: on per-turn illustrations, 40 % of replies
  wait about 22.6 s on a text reload. That reload is the cost the stream-floor and keep-cache work below goes after.

### Owner decisions 2026-10-26 ("as recommended", relayed by the coordinator)

1. **Adopt P1 chatFirst, with one slot.** The C2 floor is recorded as a literal miss as written: TTFT 65 % of P0, against
   ≤ 60 %. The owner adopted it anyway, since it is an ordering change only and has no effect on output.
   - Before the owner's controller is switched, run the side-pass freshness row (`controller-regression` `parallel`
     list: `inner-freshness`).
   - The story read is applied at a boundary and never awaited by the reply, so it is not on this path.
2. **Measure a stream floor under 2,400 MiB** (images beside text with MTP), now that the spill guard exists.
   - Measurement comes first, including a row with the live head (browser WebGL) open.
   - Adoption only with 0 spills and 0 refusals, and no decode or image slowdown beyond floors declared before the run.
3. **Keep the member cache across an image swap**, or restore it fast from host RAM after the llama-server restart.
   - It must stay within the 10,240 MiB RAM floor, and be evicted first when an image needs RAM.
   - Measure the warm member switch after an image.

## I: idle prefill send-latency bound (declared 2026-10-26 before any run; audit risk 4, end batch row)

`idlePrefill` stays off in the owner's config. Before it can be switched on, a send-latency probe must pass.

Probe: the player sends while an idle prefill step runs, and the timing is compared with the same send and no prefill
running. Since `97ead1e2`, any arrival aborts the running step; llama-server stops at its next batch.

Bound (measured end to end, from the send to each event):
- time to the talk director's model call ≤ the no-prefill time + 1.5 s;
- time to the first chat token ≤ the no-prefill time + 1.5 s;
- both at p95 over at least 10 sends;
- 0 failed or stray requests;
- the RunOwnership census unchanged after a chat switch in the middle of a prefill.

1.5 s allows for one 2,048-token prompt batch at about 1,000 tok/s plus the abort round trip.

## Gate record: chatFirst and Max on the owner's controller (2026-10-26)

- **Side-pass freshness** (`controller-regression` `parallel` / `inner-freshness`, run with the integration-branch
  harness on lane 42, through a chatFirst controller): `ok: true`; 6 inner beats used, 0 stale, 0 none (Arin 3/3,
  DM Narrator 3/3). Log: `09/logs-t/inner-freshness-p1.log`.
- **Merge**: master fast-forwarded to `b3e27bb4` (branch merged with origin/master `70257b65`, then fixes), and pushed.
  - `npm run gates` all green with no `--resume` (250.6 s; includes test:plugin 404/404, test:debug, lint, Storybook).
  - The run before it was red on two stale expectations from this round, both fixed: the settings page now lists 9
    knobs, and the error-copy inventory now includes the two burst catches.
  - Then build, stage and `plugins:install` (restartNeeded), and ST restarted on 8000.
- **Owner config.**
  - Backup: `C:\dev\backups\story-orchestrator\local-config.before-max-chatfirst-2026-10-26.json`, plus the mode save's
    own backup `local-config-1793023690022`.
  - `modes.max` is set to the measured preset: GPU 1024, RAM 2048, stream on with floor 2400, idle restore 180 s, warm
    image cache, fit margin 512, member cache 4096.
  - `balanced` and `safe` gained `memberCache.budgetMiB` (4096 and 2048).
  - `chatFirst: true`; `cli mode max` → saved and running mode Max.
- **`/status` after the restart**: phase text, draft-mtp2, cacheRamMiB 4096, member cache ram + keys, fitCorrection 0,
  lastError null, GPU free 1,789 MiB, spill guard idle, mode max.
- **Live check on the owner's controller.**
  - Lane 42 member rotation (`live-ram-cache.scenario.json`): 17/17 steps.
  - One SDXL scene through `render-benchmark … auto scene 128`: swap-text, render 21.2 s, cycle 52.0 s, decode
    50.6 tok/s.
  - `/status` after both: 0 errors, fit 0, reclaims 0, spill events 0, 11 replies with 0 reload waits.
- **Rollback.**
  - chatFirst: set `"chatFirst": false` in config.json, then `cli.mjs stop` and `start`.
  - Max: `node scripts/local/cli.mjs mode balanced`, or copy the backup above back over config.json.

## S and K: stream floor under 2,400 and member cache across an image (owner items 2-3; floors declared before the bench)

Base for every arm: the owner's current config (Max, chatFirst, A setup), each arm with its own stateDir.
`09/run-sk.sh`.

### S: stream floor

- **S2400 (control).** `streamImages.minFreeGpuMiB` 2400. A stream needs 2400 + 1024 free; text leaves 1.8–2.2 GiB, so
  every image swaps.
- **S768.** `minFreeGpuMiB` 768, so a stream starts with about 1.8 GiB free.
- **S768-LH.** S768 with the live head rendering in a headed lane-42 browser: `so-live-head-check.mts --row none
  --hold-s 300`, real WebGL on the GPU, held through the renders.
- Each arm runs 3 SDXL scenes through `render-benchmark … auto scene 256`, with a reply before and after each.

Floors (S768 and S768-LH, each against S2400):
1. 0 spill events (text or ComfyUI), 0 refusals or 409s, `fitCorrectionMiB` 0.
2. Image → next reply (`totalCycleMs`) p50 ≤ 75 % of S2400. This is the purpose of the change.
3. Render time p50 ≤ 150 % of S2400.
4. Decode of the reply after each image ≥ 90 % of the reply before it.
5. LH row: the live head still has its WebGL context at the end of the hold (check `hold`).

Adoption: Max moves to the lowest floor that passes every row, the LH row included. If anything misses, it stays at 2400.

### K: member cache across an image

- **K0.** Binary `llama-b11888-so3-cu128`, `keepAcrossImages` off: the controller kills llama-server for an image, as
  now.
- **K1.** Same binary, `keepAcrossImages: true`: llama-server is put to sleep with its prompt cache and woken after the
  image.
- Pattern `RRRIRRRIRRRI` through `burst-bench.mjs`: the 3-member recorded chat of `09/corpus-rate.json`, 128-token
  replies, an SDXL scene after every 3 replies.

Floors (K1 against K0):
1. The 3 replies after each image: TTFT p50 ≤ 70 % of K0's. This is the warm member switch after an image.
2. Wake time (`sleepStats.lastWakeMs`) ≤ K0's text reload time + 3 s.
3. Host RAM available during each image lease ≥ 10,240 MiB, or the drop path fired (`sleepStats.dropped` counted, the
   lease then admitted). 0 RAM-short refusals.
4. 0 failed requests, `fitCorrectionMiB` 0, 0 spill events, decode ±3 %.

Adoption: `keepAcrossImages` and the so3 binary go onto the owner's controller only if every K floor passes. The so3
binary also carries the R patch (checkpoint_at, rewind, duplicate-checkpoint drop), which stays unused while
`checkpointAt` and `serverRewind` are off.

Addendum, before running them: S768 never streamed. Free VRAM with text loaded was 1,643-1,790 MiB, under the 1,792
MiB that 768 + 1,024 require, so all three images swapped. Two more arms run under the same floors: S384 and
S384-LH (stream gate 1,408 MiB).

### K result (2026-10-26, 14:36-14:45Z)

Evidence: `09/logs-sk/k0.json`, `k1.json`, `K0.status.json`, `K1.status.json`. Pattern R R R I ×3 on the
`corpus-rate` chat.

| | K0 (kill for image) | K1 (sleep, cache kept) |
|---|---|---|
| 3 replies after each image, TTFT | 31.6, 8.3, 8.5 / 32.3, 9.1, 9.4 s | 26.6, 3.8, 3.8 / 27.1, 4.6, 4.6 s |
| p50 | 9.36 s | 4.59 s (49 %) |
| text back after an image (load / wake) | 23.3 s | 22.8 s (2 wakes, 3 sleeps of about 1.4 s, 0 wake failures) |
| lowest host RAM in the last lease | 18,265 MiB | 12,925 MiB (cache kept; 0 drops) |
| fit / spill / failures | 0 / 0 / 0 | 0 / 0 / 0 |
| decode p50 | 46.7 tok/s | 47.6 tok/s |
| replies that waited on a reload | 2 of 9, p50 23.6 s | 2 of 9, p50 23.1 s |

The first reply after each image still waits for the weights to reload (the wake), about as long as a restart. The two
members that follow are warm (3.8-4.6 s instead of 8.3-9.4 s), because their states survive the image in the prompt
cache.

Floors:
1. 49 % ≤ 70 %: pass.
2. Wake 22.8 s ≤ 23.3 + 3 s: pass.
3. RAM pass (12.9 GB ≥ 10,240 MiB). Only the last lease's low point is in `/status`, and the other two leases ran the
   same workload.
4. 0 failures, fit 0, spill 0, decode +1.9 %: pass.

**K passes.** `keepAcrossImages` and the so3 binary are adopted at the merge after the R2 window.

## R2: duplicate-checkpoint drop plus a blind rating (owner 2026-10-26; floors declared before the run)

Binary `llama-b11888-so3-cu128` (patch `8897e3b`): after `cache_rewind`, the cut checkpoint is dropped, because it is
the same state as the rewound entry.

**Performance arms.** `bench-controller.mjs text --gap-ms 1000` on `09/corpus-rate.json`, `--verbosity 4`, 3 repeats
each:
- A3s at 4096: `mtp2+cram4096+ramcut+keys+noerase+ckat+rewind+v4`
- A3s at 2048: `mtp2+cram2048+ramcut+keys+noerase+ckat+rewind+v4`

The comparison is with R's A, A2 and A3 rows (same corpus, same machine, same day).

**Candidate.** A3s if it passes performance floors 3-5 below; otherwise A2. A2 is the R row: warm 3.31 s,
decode 42.7 tok/s.

**Rating.** Full-length run: the candidate on the 25 chat prompts of `corpus-rate.json`, 1,024 tokens, thinking on, as
in the playtest run. Control: the adopted A's full-length run from the same morning, `text-2026-10-26T09-33-35-751Z`
(same binary, config and corpus). Sol (`openai/gpt-6.1-sol`) rates blind with `09/rate/rate-pairs.mjs`.

Floors (owner rule 4, as in the playtest verification):
1. No category mean below the control's by more than 0.2 (coherence, voice, guidance, continuity).
2. Flagged failures (voice bleed, guidance ignored, leak) ≤ control + 2 in each flag.
3. Replies that close their thinking: no fewer than the control's.

Performance floors for the candidate:
3. With 2048 MiB: warm share of member switches ≥ 60 % (A3s only).
4. Chat decode within ±3 % of A, and draft acceptance within 0.03.
5. 0 failed requests and 0 rewind failures.
6. Warm member switch p50 ≤ A's (7.50 s on this corpus).

R's floors 1 (≤ 3.0 s) and 6 (greedy identity) are recorded there as literal misses. Under the owner's instruction the
rating replaces them as the quality gate.

Adoption: the candidate goes onto the owner's controller only if every floor above passes. That means `checkpointAt`
(+ `serverRewind` for A3s) and the so3 binary, which also carries `keepAcrossImages` support.

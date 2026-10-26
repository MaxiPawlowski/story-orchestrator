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
- Owner config backed up to `C:\devackups\story-orchestrator\local-config.before-member-cache-2026-10-26.json`, then
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
2. `copy C:\devackups\story-orchestrator\local-config.before-member-cache-2026-10-26.json C:\dev	ools\story-orchestrator-local\config.json`
   (or edit by hand: `binary` back to `C:\dev	ools\story-orchestrator-local\llama-b11388-cuda12.4\llama-server.exe`
   and delete the `memberCache` block)
3. `node scripts/local/cli.mjs start`, then check `/status`: `cacheRamMiB` absent, `memberCache` null.

Partial rollback (keep the stock binary, drop only the patch): set `serverKeys false` (the controller works on any
b11888+ binary without the patch); keep `store "ram"` or remove `memberCache` for the plan 08 behaviour.

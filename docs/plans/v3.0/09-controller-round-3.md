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

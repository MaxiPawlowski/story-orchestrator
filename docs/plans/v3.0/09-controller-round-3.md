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

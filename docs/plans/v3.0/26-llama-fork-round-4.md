# Plan 26 — llama.cpp fork round 4: light sleep, fast load, read preemption, request-local n-gram

**Status: STUB 2026-10-28. Not built, no bench.** Source: `research/llama-fork-opportunities.md` (workload measurement,
candidates C1-C9, Sol review). Track A (`00-overview.md` §Replan 2026-10-26). Floors below are copied from the research
doc's §2 and are predeclared; they are not retuned after a run.

## Goal

Cut the waits the player sees beyond the member cache, on one 3090 shared with ComfyUI, without changing the prompt
layout, thinking or inner voice:
- the text reload after an image (22.6-26.8 s today, on 40 % of replies under per-turn illustrations);
- a chat queued behind a running story read (4.8 s p50);
- side-pass decode (71 % of server time is decode).

## Scope

- **C2** load-phase probe, then the smallest fix (staging size, Windows overlapped unbuffered reads, fit reuse on wake,
  `--no-warmup` arm).
- **C1** light sleep (`POST /sleep {"level":"context"}`: free contexts, keep the target weights), feasibility prototype
  first; controller lease decision `sleep-context`.
- **C4a** gateway aborts a running story read when a chat arrives and requeues the identical body (never an inner beat).
- **C3** request-local n-gram drafter beside MTP (`ngram-simple`, not the shared-pool `ngram-mod`) and per-request
  `speculative.n_max` (server at 3, chat asks 2).
- Each behind a config key, default off until adopted. Patches as commits 7+ on `so-cache-patch`, repo copy
  `scripts/local/llama-patches/so-cache-b11888.patch`, binary `so5`.

Not in scope: C5 disk spill (after C1 and A2 change the drop rate), C6 restore copy (measure first), C7 KV q5 (rating),
C8 drafters (v1.2 decision), C9 sampler profile.

## Order

1. Offline (CPU): C3 token-level draft eligibility over the captured read outputs.
2. One GPU window: C2 probe (5 min), 09 R2 full-length run + rating (30 min), C1 feasibility (wake time, NVML free).
3. Builds, then paired interleaved benches: C1 vs K1 and S384; C2 vs stock load; C4a vs P1; C3 vs MTP-only.

## Floors

As `research/llama-fork-opportunities.md` §2 C1, C2, C3, C4 (lists there). Exact changes: replay equivalence, timings,
first-divergence no earlier than the control's own; output-changing ones: blind Sol rating (owner rule 2).

## Gates

`research/feature-impact-controller.md` base set plus each change's rows (images for C1/C2, reads for C3,
parallel/freshness for C4a); `npm run gates` (no `--resume`) before merge; no adoption on the owner's install during a
play session; config backed up first.

## GPU budget

≤ 120 min: C2 probe 5, R2 30, C1 30, C2 rebench 10, C4a 15, C3 15, regression rows ~15.

## Unresolved questions

- C1 gate class: exact (restore mechanism already rated in 09 A) or a blind rating (Sol)?
- Image mix in owner play (SDXL vs qwen edits) decides whether C1 or C2 matters more; log lease kinds first?
- Artemis v1.2 (drafters, C8)?

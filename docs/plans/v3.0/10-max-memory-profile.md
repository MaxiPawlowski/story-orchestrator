# Plan 10 — Max-memory profile and tray headroom toggle

**Status: STUB 2026-10-26 (replan track A2, `00-overview.md` §Replan 2026-10-26). Not built, no bench, floors TO DECIDE.**
If the plan 09 branch builds this inside 09, this file becomes a pointer to 09 and its floors move there.

## Goal

Owner 2026-10-26: use the 3090's VRAM and the host's RAM to the limit while only playing; headroom for other apps is an
edge case behind a tray toggle. A "max-memory" profile on top of the existing performance modes (`scripts/local/README.md`
§Performance modes: Max / Balanced / Safe), with a tray entry that switches to a headroom mode and back.

## Why now

- The RAM member cache (09, 4 GiB) holds about three member states (audit risk 6), so groups of 4+ members thrash; RAM
  min during the 09 batch 2 run was 16.5 GB of 32 GB, so there is room to measure a larger budget.
- Today's Max mode was sized before MTP and the member cache (plan v2.7 22 numbers): reserves, image streaming and the
  member cache are budgeted separately, not together.

## Scope (to confirm)

- One budget for: text layers + MTP, member cache (`cacheRamMiB` / `memberCache.budgetMiB`), active checkpoints, transient
  copies, ComfyUI staging and resident image models (Astra: "budget cache, active checkpoints, transient copies, and
  ComfyUI staging together").
- Tray toggle (`C:\dev\tray\items\story-orchestrator.json`, read `C:\dev\tray\README.md` first): max-memory <-> headroom,
  through the existing `cli.mjs mode` save path (validated, backed up, applied between jobs).
- Unbrokered GPU users counted or guarded (audit risk 3): browser WebGL (live head), a GPU-layered local judge, Image
  Director, ST `/sd`.

## Depends on

- 09 RAM-mode eviction coordinated with image admission (`makeRoom` returns 0 in RAM mode today; audit risk 5) and native
  cache occupancy in `/status`.
- 09 409/reclaim guards (merged `70a91d46`, `6bef555f`).

## Floors

**TO DECIDE, before any bench.** Candidates to choose from (not numbers): member-cache hit rate on a 4- and 5-member
replay vs the 4 GiB control; warm and cold chat TTFT; no 409 and no `--fit` CPU spill (`fitCorrectionMiB` 0) with the live
head open, the landmark service and a GPU-layered judge running; RAM available minimum during a streamed image with
ComfyUI resident; image -> reply cycle time; headroom mode frees a stated amount within a stated time. Gate class: exact
(timings, no quality change) + the image rows of `research/feature-impact-controller.md` §Max profile / headroom.

## GPU cost

TO ESTIMATE once the arms are chosen.

## Unresolved questions

- Is max-memory the default mode, with the toggle only for headroom (owner rule 3 reads that way)?
- What does headroom mode have to free, and how fast (a stated GiB of VRAM, a stated GiB of RAM)?
- Does a larger member cache beat more checkpoints per member (web idea 1/6) for the same RAM?
- Can a 48K text profile fit under max-memory while images idle (would reopen R5)?
- Built here or inside 09?

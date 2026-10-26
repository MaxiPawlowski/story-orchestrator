# Plan 11 — Image performance after the GPU unlock

**Status: STUB 2026-10-26 (replan track B1, `00-overview.md` §Replan 2026-10-26). Not built, no bench, floors TO DECIDE.**

## Goal

Images are a main feature (owner 2026-10-26). Make scene illustrations, sprites and frames arrive faster without losing
quality, and stop the image <-> text swap from costing the next reply.

## What is known

- SDXL story graph, quiet, stock: median exec 7.84 s, 6 timed runs 7.73-8.96 s, SDPA attention (06 §Image baseline before
  the unlock).
- GPU tensor unlock: one unlocked showcase run vs three stock showed no measurable gain (v2.8 79: Qwen int8 edit 27-29 s
  unlocked vs 28-34 s stock; Artemis tokens/s unchanged). One run, not a same-commit bench.
- Research expectation (07, Astra): quantized MMQ text decode gains little from the unlock; FP16/BF16 image paths are where
  it could show. Not measured.
- The 06 image bench names SageAttention as not installed in `comfy-cu130`, so SDPA was the only attention arm.
- Audit risk 2 (`research/feature-impact-controller.md`): with MTP, every image swaps text out; the post-image reload can
  stop the idle ComfyUI, so the next image cold-starts (up to 120 s plus checkpoint reload). Partly addressed by `6bef555f`
  (no ComfyUI stop within 180 s of an image or while a queue read lists a job).

## Scope (to confirm)

1. Quiet same-commit re-bench: `bench-controller.mjs image` and `text --arms base,mtp2`, unlock on vs off (owner switches it;
   power limit recorded, never changed from the bench).
2. ComfyUI flags: attention backend (needs a download: owner's OK + disk check), `--cache-ram`, other fast paths; each arm
   that can change pixels gets an image quality check.
3. Thrash: image -> reply and reply -> image cycle with the member cache on/off; sprite builder batch with replies
   interleaved (cold-start count); per-turn auto illustration cadence.
4. Regression rows from the audit §409 fix / ComfyUI reclaim (p41 journey, sprite batch, ST `/sd` during a reload, killed
   job fails within 60 s).

## Depends on

- 09/10 controller state stable (member cache reload cost, max-memory budget), so image numbers are on the final stack.
- B2 head-box verification (v2.9 13 image journey) done first.

## Floors

**TO DECIDE, before any bench.** Candidates (not numbers): image median exec vs the 7.84 s stock baseline; image -> next
reply wall time; ComfyUI cold starts per N images; reply TTFT after an image; quality where pixels can change (blind Sol
rating of image pairs and the plan v2.8 80 checks: see-through eyes, bright fringe, eye width).

## GPU cost

TO ESTIMATE (06 image bench per arm: 2 warm-ups + 6 timed runs; v2.8 79 showcase run 71 min).

## Unresolved questions

- Which downloads are allowed (attention backend wheels, any new model)?
- Is the unlock something the owner keeps on permanently (then it is the baseline), or an A/B arm?
- Which image path matters most for speed: scene illustrations, on-demand sprites, frames, or the live head textures?
- Target: faster images at equal quality, or higher quality at equal time (v2.8 80 misses on eye width and fringe)?

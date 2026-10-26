# Plan 11 — Image performance after the GPU unlock

**Status: PREP DONE 2026-10-26 (replan track B1, `00-overview.md` §Replan 2026-10-26), branch `v3.0-b1-image-perf`. Bench built,
not run (no GPU yet: a controller benchmark owns the card). Floors TO DECIDE before the first run.**

## Goal

Images are a main feature (owner 2026-10-26). Make scene illustrations, sprites and frames arrive faster without losing
quality, and stop the image <-> text swap from costing the next reply.

## What is known

- SDXL story graph, quiet, stock: median exec 7.84 s, 6 timed runs 7.73-8.96 s, SDPA, driver 621.01, 350 W (v3.0 06 §Image
  baseline before the unlock, `image-2026-10-26T00-08-58-385Z`).
- GPU tensor unlock: one unlocked showcase run vs three stock showed no measurable gain (v2.8 79: Qwen int8 edit 27-29 s
  unlocked vs 28-34 s stock). One run, not a same-commit bench. The inventory below explains most of it: the Qwen edit's big
  GEMMs are INT8, which the unlock does not touch.
- Peer research (`C:/dev/gpu-unlock-3090/reports/RTX 3090 unlock gaming and AI gains.md`): the unlock speeds FP16/BF16 GEMMs that
  accumulate in FP32 and TF32; FP16-accumulate, INT8 and SageAttention on sm86 (INT8 QK + FP16-accumulate PV) stay flat, while
  SDPA roughly doubles its tensor rate. `--fast fp16_accumulation` helps FP16 models only and its ceiling falls to ~1.14x once
  FP32-accumulate runs at full rate. FP8 checkpoints compute in BF16 on Ampere (full gain). Stills should be pixel-identical
  unlocked vs stock. Published 3090 ComfyUI gain +33 % (one Bilibili run); +55-60 % on a 450 W 3090 Ti.
- Audit risk 2 (`research/feature-impact-controller.md`): with MTP every image swaps text out; the reclaim can stop the idle
  ComfyUI, so the next image cold-starts. Partly addressed by `6bef555f` (no stop within 180 s of an image or while a queue read
  lists a job). Proposal for the rest: `11a-image-text-thrash-proposal.md`.

## Inventory 2026-10-26 (read from disk and source, no GPU)

Runtime: ComfyUI v0.37.4 (`8ff6dc38`, 2026-09-25) at `C:/dev/ComfyUI`; venv `comfy-cu130` = Python 3.12.1, torch 2.12.1+cu130,
torchvision 0.27.1, comfy_kitchen 0.2.35 (own CUDA kernels: INT8 attention, INT8 weight GEMM), comfy_aimdo 0.5.5 (DynamicVRAM).
Not installed: sageattention, triton, xformers, flash-attn. Controller ComfyUI flags (`controller.mjs`): `--cache-ram 8
--reserve-vram 2` + `comfyExtraArgs` `--fast-disk`; DynamicVRAM on (no `--highvram`/`--gpu-only`). Attention in use: PyTorch
SDPA (`Using pytorch attention`, 06 log). Custom nodes loaded: MVAdapter, RMBG, See-through, UltraShape1, controlnet_aux,
assetgen, story_orchestrator_local.

| Path in the product | Workflow (source) | Model files (on `C:/dev/models`) | Weight dtype (safetensors header) | Compute on Ampere | Unlock helps? |
|---|---|---|---|---|---|
| Scene / character / user / free illustration (owner settings `image.purposes`) | `src/image/graph.ts` `buildGraph`, SDXL Illustrious recipe, euler_a 28 steps cfg 6, 1344x768 wide (832x1216 portrait), optional hires 1.5x + 20 steps | `waiIllustriousSDXL_v170` 6.5 GB | F16 (all 2515 tensors) | FP16 GEMM, FP32 accumulate (ComfyUI default), SDPA attention | yes (FP16-FP32acc + SDPA), less than DiTs (convs, norms, launch overhead) |
| Portrait purpose | same graph, NoobAI recipe, euler_a 30 steps cfg 4, lazypos/lazyneg embeddings | `JANKUTrainedChenkinNoobai_v777` 6.9 GB | F16 (6.3 GB) + BF16 (0.16 GB) | as above | yes, as above |
| Sprites: base, expression edits, looks, poses, decals, reference views, cast scene | `src/sprites/builder/recipes.ts` `editGraph` (QwenImage21Cache + TextEncodeQwenImage21, euler 25 steps at 1024 standard / 20 at 512 fast, cfg 1), `src/image/castScene.ts`; RMBG cutout node | diffusion `qwen_image_2.1_int8_convrot` 7.3 GB, encoder `qwen3vl_8b_int8_convrot` 9.4 GB, VAE `qwen_image_2.1_vae_bf16` 0.7 GB (showcase / `render-benchmark` defaults) | diffusion I8 6.5 GB + BF16 0.25 GB; encoder I8 7.6 GB + BF16 1.1 GB; VAE BF16 | INT8 W8A8 GEMM (`torch._int_mm` / comfy_kitchen), BF16 for the rest, SDPA attention (BF16, FP32 accumulate) | partly: attention + BF16 layers + VAE yes, the INT8 GEMMs no |
| Pose spike only (`scripts/debug/lib/poseS0Models.mts`), not in the product | editGraph | `qwen_image_2.1_turbo_int8_convrot` 7.3 GB; `qwen_image_2512_fp8_e4m3fn` 20.4 GB + `qwen_2.5_vl_7b_fp8_scaled` 9.4 GB | I8 / F8_E4M3 | INT8 / FP8 upcast to BF16 | turbo no; 2512 fp8 yes |
| Retired: background (owner settings `image.retired`), FLUX spikes (v2.7 31) | FLUX graphs removed; `config-flux-*.json` (stock, gguf, nunchaku, nunchaku-trim/release, normal) and venv `comfy-nunchaku` remain on disk | `flux1-dev-fp8` 17.2 GB (F8_E4M3) | FP8 | BF16 | yes, but unused |
| Upscale (hires) | `ImageUpscaleWithModel` | `RealESRGAN_x4plus_anime_6B` | — | conv | minor |

So the image that most players see per turn (SDXL scene, FP16) is where the unlock can show; on-demand sprites (Qwen INT8) can
gain only on attention, BF16 layers and the VAE.

## Bench (prepared, not run)

One command, rerunnable before and after the unlock (`scripts/local/bench-controller.mjs image-matrix`, matrix in
`scripts/local/imageMatrix.mjs`, runner `imageMatrixRun.mjs`, pixel diff `imageDiff.py`, tests `imageMatrix.test.mjs`):

```
node scripts/local/cli.mjs stop                       # the bench refuses while the controller, :8188 or another GPU user (> 2 GiB used) is up
node scripts/local/bench-controller.mjs image-matrix --plan full --label stock-350w --gemm
# owner switches the unlock (power limit unchanged, recorded in header.json)
node scripts/local/bench-controller.mjs image-matrix --plan full --label unlocked-350w --gemm
node scripts/local/bench-controller.mjs image-compare <stock dir> <unlocked dir>
node scripts/local/bench-controller.mjs image-rating-pack <dir>   # only cells whose pixels changed
node scripts/local/cli.mjs start
```

- Each cell starts its own ComfyUI on :18288 from `comfy-cu130` with the controller's flags plus the arm's change, renders
  2 warm-ups + 6 timed runs at fixed seeds `seed+i` (default 1234, same series in every arm, so run i is comparable across arms
  and across unlock states), saves every image (graph `SaveImage` swapped for `PreviewImage`, nothing lands in ComfyUI's output
  folder), records ComfyUI exec time (history timestamps), wall time, cold first-render wall, start time, attention line, VRAM
  state, model-load count, and nvidia-smi every 500 ms (min GPU free, max W, median SM clock, RAM available).
- `--gemm` runs the 8192^3 matmul probe (FP16-FP32acc, BF16, FP16-FP16acc, TF32; CUDA-event median of 5) before and after the
  matrix, so an "unlocked" run proves it stayed unlocked (the research warns power-limit writes can silently relock).
- Pixel check: every non-baseline cell is diffed against the same workflow's `sdpa` cell, run by run (max/mean abs, % pixels
  changed, PSNR; verdict identical / near (PSNR >= 40) / changed). `image-compare` diffs the same cells across two matrix runs
  (the unlock should be `identical`).
- Quality where pixels change: `image-rating-pack` copies up to 3 changed pairs per cell as `pNNN-A/B.png` with A/B order by
  hash (key kept outside the pack) plus a rating prompt (faces, eyes, edges, artifacts, flags incl. the v2.8 80 see-through eyes
  and bright fringe); rated blind by Sol (`codex exec`, opencode `openai/gpt-6.1-sol`).
- `--dry-run` prints the plan and estimate; `--dry-run --graphs` builds every graph from the product source without a GPU.
- Qwen cells need a reference: `--reference <png>`, else the first timed `sdxl-portrait:sdpa` image becomes
  `<out>/image-reference/reference.png` and is reused by every later run (so before/after share it).

Matrix (`--plan full`; `--plan quick` = the 6 cells marked q; `--cells wf:arm,...` for anything else):

| Workflow | sdpa (baseline) | ck | fp16acc | ck+fp16acc | autotune | highvram | nofastdisk | cachedefault |
|---|---|---|---|---|---|---|---|---|
| sdxl-scene (wai, 1344x768, 28 steps) | q | q | q | x | x | x | x | |
| sdxl-portrait (NoobAI, 832x1216, 30 steps) | q | x | x | | | | | |
| qwen-edit (int8 convrot, 1024, 25 steps, no cutout) | q | q | skipped (not FP16) | | | x | | |
| mixed (scene, edit, scene, ... 7 renders, model switch inside ComfyUI) | x | | | | | x | | x |

Arms: `ck` = `--use-ck-attention`, Comfy Kitchen's INT8 attention (the SageAttention-style kernel; the Windows SageAttention
maintainer now recommends it over his wheel for ComfyUI), already in the venv, **no download**; `fp16acc` = `--fast
fp16_accumulation`; `autotune` = `--fast autotune`; `highvram` = weights stay on the GPU (DynamicVRAM off, a different broker
runtime identity); `nofastdisk` = pinned-RAM offload instead of disk-backed loading; `cachedefault` = ComfyUI's default RAM
cache thresholds instead of `--cache-ram 8`. `ck`, `fp16acc`, `autotune` can change pixels; the rest must stay identical (checked).

Not in the matrix: SageAttention wheel. A wheel exists for this stack (`sageattention-2.2.0+cu130torch2.10.0andhigher.post6`,
abi3, 16.7 MB, woct0rdho releases) but needs `triton-windows`, and comfy_kitchen picks a triton backend when triton imports
(registry priority cuda > triton > eager), which would change the owner's live ComfyUI behaviour from the shared venv. Only if
`ck` fails to start: clone `comfy-cu130` to a bench-only venv and install both there (disk: C: 64 GB free).

Expectations (research, not measured): unlock moves `sdpa` SDXL most (published +33 % on a 3090), `ck` least (INT8); stock `ck`
may beat stock `sdpa` (Sage was ~2x FA2 on a 3090 for attention) and lose that lead unlocked; `fp16acc` worth <= ~14 % unlocked;
Qwen edit gains only its attention/BF16 share.

## Floors

**TO DECIDE (owner), before any bench run.** Proposed shape, numbers left open:
- Adopt a speed arm only when its median exec beats the baseline by >= TO DECIDE % on its workflow, in both unlock states that
  will be used (or in the state the owner keeps).
- Pixel-identical arms (`highvram`, `nofastdisk`, `cachedefault`) need `identical` on every timed run, else they are treated as
  output-changing.
- Output-changing arms (`ck`, `fp16acc`, `autotune`): blind Sol rating on TO DECIDE pairs (owner rule 4 uses >= 25 for text),
  no category below TO DECIDE, flags (see-through eyes, bright fringe, broken hands, colour shift) <= control + TO DECIDE.
- Unlock: `image-compare` pixels `identical` (else the unlock itself is output-changing and needs the rating) and GEMM probe
  before/after both show the unlocked rate.
- Thrash (controller side, `11a`): image -> next reply wall, ComfyUI cold starts per N images, reply TTFT after an image: TO DECIDE.

## GPU cost

Estimates from the 06 baseline (SDXL ~8.5 s/image), ComfyUI start ~25 s and ~20 s first load per cell; the Qwen 25-step 1024 edit
is est. 35 s/image (v2.8 79 recorded 27-34 s for the int8 edit; steps not recorded there), so its cells are the least certain.

| Run | Cells | GPU min (est.) |
|---|---|---|
| `--plan quick`, one unlock state | 6 | 19 |
| `--plan full`, one unlock state | 16 | 51 |
| full, stock + unlocked | 32 | ~105 |
| GEMM probes (4 per pair of runs) | — | ~2 |
| Rating | CPU / Sol only | 0 |

Recommended first run: `--plan quick` stock, then quick unlocked (~40 min), full only if a quick arm clears its floor.

## Thrash and video

- Image <-> text thrash: proposal only, `11a-image-text-thrash-proposal.md` (the controller agent owns `broker/`).
- 05.7 image-to-video trial (owner decision 6, after B1): prep notes `11b-i2v-trial-prep.md`, nothing downloaded.

## Unresolved questions

- Floors above (speed threshold, rating pair count and limits).
- Unlock kept on permanently (then unlocked is the baseline) or an A/B arm?
- Which image path matters most for speed: per-turn scene illustrations (SDXL) or on-demand sprites (Qwen)?
- Faster at equal quality, or higher quality at equal time (v2.8 80 misses on eye width and fringe)?
- `highvram` changes the broker's runtime identity and turns streaming off; worth testing as a product arm at all?

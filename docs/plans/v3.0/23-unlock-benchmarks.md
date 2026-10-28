# Plan 23 — GPU unlock benchmarks (owed from 09/11)

**Status: RUN 2026-10-27. Record only; nothing adopted.** Plan 11's prep (matrix, floors) lives on `v3.0-wave1-integration`
(`C:\dev\so-dev`, `docs/plans/v3.0/11-image-perf-after-unlock.md` §Floors, §Owner decisions); master's 11 is still the stub,
so the record is here.

## Setup

- Unlock state: `%LOCALAPPDATA%\gpu-unlock\status.json` UNLOCKED 123.4 TFLOPS (set 2026-10-26 ~16:10Z). GEMM probe
  (`--gemm`, 8192^3) before/after every matrix run: FP16-FP32acc 102-106, BF16 102-106, FP16-FP16acc 108-113, TF32 56-59
  TFLOPS, so unlocked throughout (stock FP16-FP32acc is ~half). Power limit 350 W (default), never changed.
- Controller stopped (`cli.mjs stop`) for the benches; owner config untouched (`text --config` used a scratch copy with
  `binary` = official `llama-b11888-cuda12.4` for the same-binary text arm). Afterwards `cli.mjs start` + auto-restore +
  `start-comfy`: `text; fast; GPU free 1565 MiB`, ComfyUI up on :8188, as found.
- Tools: `bench-controller text|image` from master; `image-matrix`/`image-compare` from `C:\dev\so-dev` (branch
  `v3.0-wave1-integration`, not on master). Out dir `C:\dev\so-lanes\bench-controller\unlock-2026-10-27\` (CPU load log
  `cpu-load.log`, 10 s samples).
- Noise: a parallel agent ran `npm run gates` (Storybook test-runner, headless Chromium, CPU 100 %) during pass 1, and RAM
  fell to 2.7 GiB during pass 2's so3 text arm (aborted by the bench's RAM guard). Pass 1 is discarded for timing; numbers
  below are pass 2 (CPU median 41 %, quiet from 04:00Z) and pass 3 (CPU median 9 %). Pass 1 vs pass 2 matrix images:
  `identical` on every cell (`pass2/image-matrix-…/compare-…`), so contention moved time, not pixels.

## Results

### Image, `bench-controller image` (SDXL story graph, 1344x768, SDPA)

- Unlocked `pass2/image-2026-10-27T04-02-41-305Z`: median exec **6.25 s** (6 timed 6.19-6.42), wall 6.46 s.
- Stock baseline `image-2026-10-26T00-08-58-385Z` (06 §Image baseline): 7.84 s (7.73-8.96).
- Delta **-20.3 % (1.25x)**. Peak 350 W, SM ~1.9 GHz: power-bound, so a 350 W cap holds the gain under the published
  +33 %.

### Image matrix `--plan quick --label after-unlock --gemm` (pass 2, all unlocked)

`pass2/image-matrix-after-unlock-2026-10-27T04-04-42-935Z` (reference pinned to pass 1's `image-reference/reference.png`).
Time ratio = arm / sdpa (below 1 = faster):

- sdxl-scene: sdpa 6.24 s; ck 6.87 s (1.102, slower), pixels changed, worst PSNR 20.99; fp16acc 6.26 s (1.004), changed,
  PSNR 23.9.
- sdxl-portrait: sdpa 6.66 s.
- qwen-edit (int8, 1024, 25 steps): sdpa 14.82 s; ck 14.44 s (0.974, 2.6 % faster), near (PSNR 43.21).
- No stock matrix run exists (the prepared `--label stock-350w` run never happened before the unlock), so the matrix gives
  arm-vs-arm in the unlocked state only.

### Text, `bench-controller text --arms base,mtp2` (`corpus.json`, 24 rows, seed 1234, chat 192 / side 96)

Same binary (official b11888 cu12.4), unlocked `pass2/text-2026-10-27T03-54-49-958Z` vs stock `text-2026-10-26T02-02-07-919Z`:
- base: decode chat 31.2 -> 31.2 (0 %), prefill 1024 -> 1046 tok/s (+2.1 %), long prefill 1013 -> 1045 (+3.2 %).
- mtp2: decode chat 42.9 -> 45.1 (+5.1 %; one stock run, b11388 mtp2 ran 42.9-43.1 in 4 runs), acceptance 0.607 both,
  prefill 973 -> 996 (+2.4 %).

Owner binary (so3 b11888 cu128), unlocked `pass3/text-2026-10-27T04-15-29-256Z` vs stock self-built b11888 cu128 J2
(4 runs `text-2026-10-26T07-51…08-48`; the so3 patch is inert in these arms):
- base: decode 31.7, prefill 1064 tok/s (no stock base row on this build).
- mtp2: decode chat 44.5 vs 44.6-44.8 (-0.5 %), prefill 992 vs 992-998 (0 %), acceptance 0.602 both.

TTFT p50 is 3-12 % higher than the 10-26 rows on both binaries (e.g. b11888 side 2057 -> 2302 ms) while prefill tok/s is
equal or higher: the stock rows used an older config (`counts.exceed` 25 / `cacheEvict` 0 then, 0 / 24 now), so TTFT is not
a same-args comparison; decode and prefill are. Text is flat within noise, as plan 07 predicted for quantized MMQ.

## Floors (plan 11 §Floors, declared 2026-10-26)

- **Unlock arm (image)**: >= 5 % faster met (-20.3 %). Pixel-identical **not verifiable**: the stock bench kept no images,
  and no stock matrix run exists. Unlocked renders are deterministic run to run. GEMM probe valid on every run. Verdict:
  speed passes, pixel half unproven; the unlock is a host setting, not a config change, so nothing to adopt either way.
- **ck** (Comfy Kitchen INT8 attention): sdxl-scene misses (10 % slower, pixels changed); qwen-edit misses (2.6 % < 5 %).
- **fp16acc** (`--fast fp16_accumulation`): misses (0.4 % slower, pixels changed). Matches the research ceiling once
  FP32-accumulate runs at full rate.
- No rating pack made: no output-changing arm reached the speed half of the floor.

## Recommendation (not adopted)

- Keep the unlock on; treat unlocked as the image baseline (SDXL scene 6.25 s). Prove pixel identity once with a stock
  matrix run if the owner ever reboots without the unlock (`image-matrix --plan quick --label stock-350w --gemm`, then
  `image-compare`).
- Do not adopt `--use-ck-attention` or `--fast fp16_accumulation`.
- Text: no change; the unlock does not move Artemis decode.
- Remaining plan 11 work: `--plan full` arms (autotune, highvram, nofastdisk, cachedefault, mixed), on a host with no
  parallel gates run.

## GPU time

About 75 min (pass 1 ~35, pass 2 ~25, pass 3 ~4, controller restore ~3).

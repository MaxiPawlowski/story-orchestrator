# Plan 11b — 05.7 image-to-video trial: prep notes

**Status: PREP 2026-10-26; arm A DOWNLOADED 2026-10-26 (owner decision 3), nothing run (no GPU; the trial runs after B1 in the
end batch).** Owner decision 6 (2026-10-26): one short image-to-video trial,
after B1. Item: `05-deferred-items.md` §05.7 (spike: 2 showcase characters x 2 poses; identity drift by Sol, loop seam, GPU
minutes and peak VRAM per loop, bytes per loop; downloads need the owner's OK and plan v2.8 30's model-source rules).

## Host limits

- RTX 3090 24 GB, 32 GB RAM (the text model, member cache and ComfyUI staging share it: run the trial with the controller
  stopped, like the B1 bench, so the text side is out of the way).
- Disk: C: 64 GB free (keep >= 15 GB), D: 163 GB free (SATA SSD; `modelCacheRoot` already lives there). Put video weights on
  D: through a bench-only `extra_model_paths` yaml (as `flux-spike-paths.yaml` did); never on C:.
- ComfyUI v0.37.4 already has the core Wan nodes: `WanImageToVideo`, `WanFirstLastFrameToVideo`, `Wan22ImageToVideoLatent`
  (TI2V 5B), video save nodes. No custom node needed for the fp8 route. No GGUF loader is installed (ComfyUI-GGUF would be one
  more download).

## Candidates (sizes from the Comfy-Org `Wan-2.2` repackaged repo, HF API 2026-10-26)

| Arm | Files | Size | Fits | Compute on Ampere | Notes |
|---|---|---|---|---|---|
| A. Wan 2.2 TI2V 5B (first pick) | `wan2.2_ti2v_5B_fp16` 9.31 GB, `umt5_xxl_fp8_e4m3fn_scaled` 6.27 GB, `wan2.2_vae` 1.31 GB | 16.9 GB | whole model on GPU; RAM fine | FP16 (unlock helps) | one model, 720p-class VAE, fastest; image conditioning via `Wan22ImageToVideoLatent` (first frame only, so the loop seam must be solved in post: ping-pong or crossfade) |
| B. Wan 2.2 I2V A14B fp8 + 4-step LoRA | `wan2.2_i2v_high_noise_14B_fp8_scaled` 13.31 GB, `..._low_noise_..._fp8_scaled` 13.31 GB, `wan2.2_i2v_lightx2v_4steps_lora_v1_{high,low}_noise` 1.14 GB x2, `umt5_xxl_fp8_e4m3fn_scaled` 6.27 GB, `wan_2.1_vae` 0.24 GB | 35.4 GB | one expert at a time on GPU (13.3 GB + activations at 480p); the two experts together exceed free RAM with anything else loaded, so they stream from disk per run | FP8 weights computed in BF16 (unlock helps most) | better identity and motion; `WanFirstLastFrameToVideo` with first = last = the sprite gives a closing loop by construction |
| Not now | Wan 2.2 animate 14B (`int8_convrot` 17.15 GB exists: INT8, no unlock gain), HunyuanVideo-I2V, LTX-2 | — | — | — | larger, or pose-driven rather than idle loops |

A + B together is 52 GB: only on D:. The owner's OK names which arm(s); recommended: A first (smallest, answers "is motion
worth it" in about an hour), B only if A's identity drift fails and motion still looks wanted.

## Arm A on disk (2026-10-26)

Source: Hugging Face `Comfy-Org/Wan-2.2` (Apache-2.0), pinned revision `ee6f4a40737a995bf5818954cfce6d59443b0f04`, path
`split_files/...`; sha256 checked against the repo's LFS ids.

| File | Bytes | sha256 |
|---|---|---|
| `D:/models/story-orchestrator-video/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors` | 9,999,658,848 | `456f901338bd9eadbded3828b819109a9b68e8a525ca5cf8d0049a69fcfeca1e` |
| `D:/models/story-orchestrator-video/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors` | 6,735,906,897 | `c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68` |
| `D:/models/story-orchestrator-video/vae/wan2.2_vae.safetensors` | 1,409,400,960 | `e40321bd36b9709991dae2530eb4ac303dd168276980d3e9bc4b6e2b75fed156` |

Wiring: a `so_video` section (base `D:/models/story-orchestrator-video`, `diffusion_models`, `text_encoders`, `vae`) appended
to `C:/dev/ComfyUI/extra_model_paths.yaml` (gitignored in ComfyUI; backup of the previous file in
`C:/dev/backups/story-orchestrator/comfy-extra-model-paths-before-video-2026-10-26/`). It only adds search paths; ComfyUI reads
it at its next start, the running one is untouched, and no controller config or ComfyUI flag changed. The controller's own
`modelDirs` (admission sizing) do not list the folder; the trial runs with the controller stopped, so that is not needed.
Undo: delete the `so_video` section (or restore the backup) and the folder.

## Trial workflow (to build at the end batch)

- Input: an existing pose sprite (alpha cut-out) composited on a flat mid-grey background at 480x832 portrait (A: 704x1280
  class buckets, or 480x832 to stay cheap), because the models do not take alpha.
- Prompt: idle loop text only ("breathing gently, slight sway, blinking, hair moving softly, static camera, plain background"),
  negative the usual Wan set; fixed seed.
- Length: 49 frames at 16 fps (~3 s; Wan wants 4n+1 frames). B: 4 steps per expert with the lightx2v LoRAs, cfg 1. A: ~20 steps.
- Loop: B uses first = last frame; A ping-pongs (forward + reverse) and the seam is scored anyway.
- Output: WEBM (VP9 with alpha is not produced by the model; re-key the grey background with the existing RMBG node per frame,
  or play over the stage background) and a PNG frame strip; record bytes for both.
- Scale: 2 showcase characters x 2 poses = 4 loops per arm.

## Measurements and floors (TO DECIDE)

Per loop: GPU minutes, peak VRAM, RAM available minimum, bytes (webm, strip); Sol blind rating of identity drift (first vs
middle vs last frame against the sprite: face, hair, outfit), loop seam visible yes/no, artifacts. Floors TO DECIDE before the
run; candidates: identity drift flags 0 of 4, seam invisible in >= 3 of 4, minutes per loop <= TO DECIDE (a look x pose x loop
library multiplies it), bytes per loop <= TO DECIDE.

## GPU estimate

Not measured on this card. Rough: A at 480x832, 49 frames, 20 steps: est. 2-4 min per loop -> 4 loops + loads ~20 min. B with
4+4 steps fp8 at 480p: est. 3-6 min per loop (two expert loads from SATA, ~30 s each) -> ~30 min. Treat both as est. until the
first loop is timed; stop after the first loop if it runs over 10 min.

## Unresolved questions

- Video as the product format (webm in the stage) or frame strips only?

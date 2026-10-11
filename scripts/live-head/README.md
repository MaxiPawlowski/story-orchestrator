# Live head CPU tool

No network, model or GPU calls. Python 3.12+ with **already installed** NumPy,
Pillow and OpenCV for layers; Pillow for grids/calibration. Missing dependencies
fail with a reason; this command never installs them. Node uses repo esbuild.

Put a source bust in `.live-head-projects/<new-name>/source.png` and trace an
upstream-v1 `rig.draft.json`. All paths, including symlinks, must stay in this
worktree. Generated outputs are create-only; use a new project for corrections.

```
node scripts/live-head/rig.mjs calibration .live-head-projects/example
node scripts/live-head/rig.mjs grid .live-head-projects/example --step 5 --region 20,20,120,100
node scripts/live-head/rig.mjs overlay .live-head-projects/example
node scripts/live-head/rig.mjs build .live-head-projects/example --member example --look default --source-url /characters/Example/neutral.png --python python
```

The source PNG must be byte-identical to the neutral sprite at `--source-url`.
`build` validates the draft, runs the upstream CPU layer cut/inpaint step and
packages rig + nine PNG layers into `live-head.json`. `package` packages existing
outputs without rebuilding. Import its JSON in Images → Sprite stage, with Author
view on and this look selected. It is checked again before playback.

Calibration scoring needs a vision-model answer and is owed in plan 36. The
upstream tool's scoring command is
`python scripts/live-head/vendor/vision-check.py score <calibration-dir> <answer.json>`.
Read its displayed image, never `.key.json`. Overlay/closed-eye/head-turn visual
review is owed; a successful build is not a visual-quality claim.

MIT upstream `6f6d362`, copyright 2026 Yuki Shindo; full notice in every derived
file and `vendor/LICENSE`. No sample character assets, no MediaPipe.

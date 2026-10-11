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

Review images take `--name <stem>` (create-only under `work/`); `overlay` also takes
`--part eyes --zoom true`. `validate <project>` checks `rig.draft.json` without building.

Calibration scoring needs a vision-model answer. The upstream scoring command is
`python scripts/live-head/vendor/vision-check.py score <calibration-dir> <answer.json>`.
Read its displayed image, never `.key.json`. A successful build is not a
visual-quality claim: render and look at the poses.

```
node scripts/live-head/review.mjs .live-head-projects/example round1 [<truth.json>]
```

`review.mjs` renders the packaged rig with the in-repo WebGL renderer in a headless
Chromium on SwiftShader (CPU, no GPU, no model). It writes create-only
`review-<round>/` with pose sheets (rest, half and closed eyes, mouth, +-30 degree
turns, look up/down, tilt, gaze, breath, expressions) and zoomed eye and mouth
crops. With a `truth.json` it also counts iris and white pixels left inside each eye
ROI at rest, half and closed. Python 3.12+ with Pillow, NumPy and OpenCV is needed
for the build step only.

Owned test busts: `python scripts/live-head/synthetic-looks.py amber|slate|ember
.live-head-projects/<new-name> --truth .live-head-projects/_truth/<look>.json` draws
a 400 x 512 geometric bust and its ground-truth eye outline. `python
scripts/live-head/truth-score.py <rig.draft.json> <truth.json> --size 400 512`
reports the eye-contour error of a drawn draft against it. Synthetic busts only:
real art has no truth file, so score it from overlays.

MIT upstream `6f6d362`, copyright 2026 Yuki Shindo; full notice in every derived
file and `vendor/LICENSE`. No sample character assets, no MediaPipe.

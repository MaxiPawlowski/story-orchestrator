# 79 — Image acceptance follow-up

Owner 2026-10-18: continue image items 1–5; 3090 free for several hours. Branch `v2.8-image-acceptance-followup`.

## Scope

- Plan 41: expression/frame refusals, hatted-bust rig, third-member pose starvation, illustration contention, late render cleanup; then the unchanged clean journey pair.
- Plans 28/33: same-build reply-latency and pose-quality acceptance, including lying poses. Record misses without changing floors.
- Plans 36/74: eye-contour measurement, streamed motion-mouth gate and frame pacing on the idle desktop GPU. The unavailable laptop remains unmeasured.
- Plan 74 body trial: investigate free-arm cutouts; reopen only with a concrete separation fix and the original visual floors.

## Implementation

- Follow `LookRebuild`/`VisualPreparation`'s request-local cancellation through `anySignal`: close/revalidate abort setup and waits as well as the active render.
- Pose queue publishes queued cast bodies before spending slots on blink/talk frames. Direct builder calls retain their complete-result contract.
- Vision landmarks retain strict geometry validation; one same-image correction can repair an invalid first answer. Hidden anatomy is refused, never clamped.

## Validation

- Targeted cancellation, queue-order and landmark-correction regressions; `npm run gates:quick`, then full gates on the frozen candidate.
- Copied lane 33, candidate routing from this worktree; default Sol authoring, Artemis thinking/inner voice retained, unchanged image harness.
- Focused real checks before the long pair. Private evidence via `so-evidence` and `sessions:archive`.

## Gate record — 2026-10-18 (in progress)

- `npm test -- --runInBand src/sprites/poses/bodyRenderer.test.ts`: 13/13 passed.
- First `npm run gates:quick`: tool timed out at 120 s after lint, related Jest (164/164), typecheck and test typecheck passed; incomplete, not green.
- Next quick run: lint rejected a 441-character correction prompt line; split without changing the prompt. Related Jest 192/192 passed.
- First full run: RED on the new author-only correction error missing from `test/findings/errorCopy.json`; inventory updated. Storybook 942/942 passed.
- `npm run docs:guide && npm run docs:settings && npm run gates:quick && npm run gates -- --jobs=3`: all 11 full steps green in 259.4 s, including 156 Storybook suites / 942 tests. Output `sh_1503b7985001iXUHigY8pg7yVY.out` in this OpenCode session's shell archive.
- Live journey candidate run 1 started on copied lane 33 with `--candidate --label image-followup`. A separate read-only recorder captures GPU lease status/error responses, which were absent from the prior contention evidence. No main-install staging.
- Body-cutout investigation: owner approved the 47,210,581-byte `Metal3d/deeplabv3p-resnet50-human` ONNX download to `C:/dev/models/body-segmentation/`; SHA256 `a6e823a82da10ba24c29adfb544130684568c46bfac865e215bbace3b4035a71` matches the published LFS identity. CPUExecutionProvider only; no new server or GPU job. Five free-arm examples: semantic arm masks cover 48.6/48.5/2.1/1.3/0.9% of the prior outlines. Bare arms are partly found; sleeves/armor are omitted. This model is not a viable free-arm cutout replacement. Body trial remains NO-GO; no dormant body code enabled.
- Eye-contour investigation: six original real-art bust hashes verified; twelve source-only enlarged eye crops independently annotated by Sol (`openai/gpt-6.1-sol`, separate CLI session; no rig contours shown). All twelve annotations marked confident. Symmetric 8x-raster boundary distance against existing Sol rig openings: maxima 3.20–5.79 px, 0/12 within the unchanged 2 px floor. This is an independent-model reference, not human ground truth; a diagnostic miss, not acceptance. Private inputs, annotation and scores: lane 33 `debug/image-followup/eye-contours/`.
- Campaign decision: no authored field or asset production introduced; campaign adoption remains behind the existing image acceptance work.

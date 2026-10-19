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

## Follow-up — 2026-10-19 (in progress)

- Owner renewed 3090 availability for focused checks. Previous journey stopped after `look`, with no final report or cleanup; acceptance remains NOT GREEN. Its last samples end at 19:25:52Z, about 67 minutes after start, before the wrapper's three-hour deadline. Stop cause remains unproven.
- Previous real failures: three expression/frame mask refusals, two rig refusals, third member on the default set after 1,804,356 ms. Recorded play passed eight turns / fifteen replies; only two turns observed visemes.
- Broker root cause: the local controller omitted `modelDirs.poseModels`, although media knew the installed pair. Added that explicit local mapping with a backup, restarted through the controller CLI. ONNX admission now uses file size instead of trying to parse safetensors.
- Pose detection now carries request-local cancellation through discovery, fingerprints, text-priority wait, reservation, upload and rendering. A completed neutral pose is published before optional expression/decal work, retaining a visible pose when a face edit refuses.
- Presentation now expands the edit box into a wider/deeper bust crop. The rig pivot may anchor to a visible collar opening; no hidden joints or skin are inferred. Face-edit masks and QA limits are unchanged.
- Journey writes an incomplete NOT GREEN checkpoint before each active step and after durable step evidence, and marks cleanup before waiting for it. Presentation acceptance waits for a newer persisted source revision, not a previous status label.
- Focused checks: broker model tests 3/3; head framing + pose-body tests 18/18; pose-import tests 6/6; harness checkpoint test 1/1. First quick gate green in 122.5 s (435 related tests, 32/32 defect replays).
- Real browser candidate on copied lane 33: all three existing test bases re-reviewed as expanded busts (source revision 2), all three Sol rigs prepared and accepted. Independent CPU detector status: one agrees, two disagree; geometry/pipeline success is not contour-quality acceptance. First focused driver stopped on an obsolete `Poses` tab selector before DWPose; corrected driver targets the pose section inside Sprites. Evidence under lane 33 `debug/image-followup/focus-2026-10-19/`.
- Existing generated-doc modifications were line-ending-only (`git diff --numstat` empty before these edits); content preserved and guides regenerated from source.
- Further root cause: selecting a sprite reference unconditionally reset the base builder's detector-measured box to the old fractional box. Reference selection now preserves a valid saved box for that set and measures an unconfigured reference when the detector is available. Regression unit + Storybook interaction cover the reset. This also corrects the hatted mouth-mask location without widening QA limits.
- Focused DWPose UI exposed a separate upload-contract bug: FileReader supplies a PNG data URL, while the media upload expects raw base64. Pose import now strips the PNG prefix; regression verifies the actual upload argument. First focused import correctly failed `Invalid PNG data` and released its reservation; rerun required.
- Corrected real browser retry passed: DWPose imported 17 reliable points and the formerly stuck third member rendered a `sit_floor` body. Private result and screenshot under `focus-2026-10-19-pose-retry`; visual inspection confirms a floor-seated body. This is a focused pipeline pass, not the unchanged pose-quality panel or journey pair.
- Quick gate green in 120.6 s. Full gate attempts exposed code-health length and optional-probe inventory requirements, then the new reference-preview ownership census row. Extracted reference hook and neutral-pose publisher, recorded optional detector fallback and effect-local preview ownership. Guard reruns passed code-health/error-copy; full rerun required after census update. Storybook passed 156 suites / 943 tests in both attempts.
- Private evidence archived with `so-evidence archive --label image-followup-2026-10-19 --lanes 33 --pods 0 --since 2026-10-18T18:00:00Z --allow-incomplete`; 90 files, hash verification clean. `npm run sessions:archive` completed from the main checkout. New focused results will be appended to the archive.
- All three formerly refused mask cases passed in the real browser with detector-measured boxes and unchanged QA limits: angry expression, blink and talk. Recorded total times 150.1 s / 170.7 s / 72.8 s, including lease waits 109.8 s / 128.0 s / 30.9 s; this is not the paired reply-latency gate. Focused evidence archived separately as `image-followup-focused-pass-2026-10-19` (36 files, 22,770,788 bytes, no verification problems); sessions archive completed.
- `npm run gates:quick && npm run gates -- --jobs=3`: quick green; full run passed ten steps, with one transient settings Storybook interaction failure. `npm run gates -- --resume --jobs=3`: all eleven steps green on the exact unchanged tree in 177.7 s, ten reused; Storybook 156 suites / 943 tests passed. This resumed record does not close the plan or authorize merge.
- Clean journey started on copied lane 33 with `--candidate --label image-fixed-clean`, run 1 then run 2 only if run 1 passes. Prior test assets cleaned with zero leaks after evidence preservation. Latency pair, full pose-quality panel, idle-GPU motion acceptance and clean journey verdicts remain outstanding; plan remains open, no installation.

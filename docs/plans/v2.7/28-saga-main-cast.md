# The Saga: eight main characters, animated living cards

Status: IN BUILD, authorized 2026-10-06. Cast: Belle, Dalan, Tobias, Natalia, Shiya, Ronan, Javon, Eriana.
Narrator has no portrait actor. Two-frame mouth, blink, every expression in each main character's base pack.
Existing authored outfits remain in scope; changed looks must receive their own expression/animation assets.

## Existing patterns

Reuse plan 26's compositor and labeled player; `builder/onDemand.ts`, `SpriteBuilder`, frame filenames/`frameIndex`,
the controller's per-job text-priority handoff, and campaign `build_all.py` generators. Rollout follows plan 27.
No model moves/downloads, pods, original art overwrite, global character edits for per-chat appearance, or secret fields.

## Sequence and gates

1. Inventory the eight packs and authored sets; head/mouth geometry per reference, hashes, labels, missing files.
   D: manifest/count checks; LI: directly reviewed contact sheets. Original art remains read-only.
2. Generated look -> its own blink/talk. Cached frames require matching owned bytes; include geometry/steps/contract
   in look identity. Apply only current owned results; actor receives the generated frame map. D: cache, stale result,
   cancellation between frames, correct base/alpha; LT/LI: image/read/reply, appearance change + expression switch.
3. Author bounded public living-card fields through campaign generators, stable owner keys across act assembly.
   Outfit and hair visual; confirmed visible condition. No gate/route changes or unplayed future copy.
   D: campaign checks, default/new-chat/rollback/reopen and active-member scope/rotation.
4. Complete Belle (chosen neutral 3, happy repair), then remaining seven, every base expression; authored outfit
   frames prebuilt or prepared from that outfit on demand. Resumable exact-input manifests, failures retained.
   LI: first-seed pixel QA, raw/composite review; user: labeled Normal/Talking review, not blind preference evidence.
5. Prompt coherence: replay S32-1 failure on current model, correct only measured causes, rerun original fixed floors
   with baseline and restored settings. User requests opt-in here; below-floor results remain failures, never acceptance.
   LT/CL: confirmed state consumed by narration, sprite and illustration together; no unchanged/negative-turn drift.
6. The Saga integration twice on isolated lane: main cast, multi-voice, chapter/reopen, rollback, new-chat, text priority,
   animations after look changes, reduced motion/mobile and performance. Full `npm run gates` + campaign full checks.
7. Backup and production rollout, current library and authored assets; fresh The Saga chat. Record exactly enabled
   functions and remaining visual/user gates. No release acceptance claim from installation alone.

## Gate record

In progress. A code audit confirms two integration gaps: on-demand stills never generate blink/talk, and their callback
never refreshes `actor.frames`. The eight-character campaign data does not yet bind living-card qualities.

### Model residency review — 2026-10-06

User interrupted the long render to inspect per-image loading and preserve completed outputs. Full batch paused.
Original per-image path released its real GPU lease and sent `unload_models: true` after every image. Warm meant RAM
cache, not GPU residency. No native Artemis starts occurred during the 19:20–20:48 batch; last start was 18:09:17 UTC.
Recent Comfy logs showed TE/VAE/diffusion loader requests for each of 20 renders, and RAM-pressure cache rebuilds.

Built explicit dev-harness warm batches (`--warm-batch`), three same-workflow images maximum, two-second idle expiry.
One real controller lease remains owned; it is physically released for a changed workflow, lost ownership/headroom,
waiting text or the bound. Text is checked before the next image and at every frame boundary. Seven pure controls
cover concurrency, late grants, workflow changes, text/headroom, bounded reuse and timeout/close. Production keeps
ordinary per-image leases. No reserve, model, quality or step change.

Live limited run: three previously missing frames used one lease, one release, three jobs. Steps 38.7 / 25.3 / 24.3 s;
not a matched speed-floor acceptance. The queued-text probe observed one real request waiting behind the current
frame and received a four-character reply. One two-frame recovery run passed; other recovery runs refused the next
image for RAM. Therefore recovery acceptance is NOT green and the long batch stays paused.

Diagnostic correction: the old generic "model memory has not been released" hid a RAM refusal after GPU release.
Observed GPU torch reserve 32 MiB, RAM 11,427 MiB; requested additional RAM 10,664 + unchanged 4,096 reserve. Added
explicit observed failure evidence. The slow CIM status showed about 17 GiB while psutil/the fast probe showed about
11 GiB; status now uses the same fresh probe as admission. No headroom floor lowered.

Installed the project-owned idle-only Comfy host-cache helper using PyTorch's documented public `empty_host_cache`
API. It frees only unoccupied pinned blocks, refuses foreign/busy requests and is called only after observed RAM
pressure/cache eviction. Its live report showed zero pinned blocks on the no-render refusal: it did NOT solve the
remaining headroom shortage, and is not cited as a successful recovery fix. Source/runtime identity changed explicitly.

Resume audit: 121/238 required base animation frames saved, hash/input verified; 117 missing, zero mismatches, zero
generation jobs during auditing. Recovered the interrupted Natalia/laughing blink preview without a new render.
The review page contains 60 completed expression pairs across eight characters. No original art changed and no
completed frame was re-rendered for the residency tests.

Commands/evidence:
- `npm run gates -- --no-storybook`: green before the final local diagnostic changes, Jest 6414 / one skip, debug
  1036, plugin 104 / three skips, release 95 / two skips, replay 32/32; Storybook explicitly skipped.
- `node --test scripts/local/imageCache.test.mjs scripts/local/comfyMemoryGuard.test.mjs`: 10/10 (Python seam 5/5).
- `npm run debug:typecheck`; targeted batch/ownership/code-health Jest 40/40.
- `so-saga-resume-audit.mts --recover-preview`, then plain audit: 121 verified, 117 missing, zero new jobs.
- `sagaBatchPriority.mjs`: archived every run, including failures; no batch sign-off from the one passing arm.
- Evidence: `test/measurements/v2.7/saga-main-cast/` (`model-residency-review.json`, `resume-audit.json`, frame reports,
  warm-priority runs, raw edits and labeled playback).

Final diagnostic/release checks: `npm run test:debug && npm run debug:typecheck && npm run build && npm run test:release &&
npm run stage` green: debug 1038/1038, release 95 passed / two skips, prod staged (`6995f15f8283`). Controller restarted
idle on the updated fresh-status/diagnostic code; no image generated for these checks. Main debug browser closed to
reduce test overhead. Storybook remains skipped for this review slice. The priority/recovery live gate remains NOT green.

Other implementation in progress: campaign generator adds three public fields per main character, stable keys across
act assembly, with two Python regressions and campaign fast gates green. Fixed Studio's false orphan-quality warning
for bound card fields, with an unbound orphan control. Changed-look animation and actor frame refresh are implemented
candidates; their real combined Saga gate, all outfits, overlay calibration, visual approval and rollout remain owed.

### Remaining base frames — 2026-10-07

User requested continuation, skipping all completed images. Started from the 121-frame verified audit. UI resume
generated three Natalia frames, then completed the other characters; RAM admission refused nine jobs before render.
No completed frame was sampled again. Reduced repeated reference downloads: one original-pack/owned-file inventory
per character; cached image data comes from the verified saved review, with SHA checks. Still nine jobs blocked for RAM.

Finished those nine using an isolated minimal browser page. It imports the shipped `SpriteBuilder`, Canvas
decode/crop/resize, recipes, compositor, pixel QA and the three-image lease pool; transport goes to the same owned
media/controller APIs. Models, original byte hashes, seeds, head boxes, resolution 1024 and 25 steps unchanged.
The page omits ST/Studio mounting and closes its browser afterwards. This is an explicitly recorded adapter deviation,
not an end-user UI gate or a changed generation/compositing implementation. New frame inputs name the offline Saga
authoring scope; existing UI inputs remain intact. Raw and reference edits are preserved.

- `npm run debug:typecheck`: clean.
- `SO_LANE=6 node scripts/debug/so-saga-low-memory.mts`: nine missing images saved, all shipped pixel QA green.
- `so-saga-resume-audit.mts`: **238 verified / 0 missing / 0 mismatches / 0 generation jobs** in the audit.
- `saga-sprite-pack.mts` + `saga-pack-check.mts`: all eight characters, 119 expressions, 357 PNGs decoded, dimensions
  agree, every expression selector complete, pause and 390px layout clean.
- Archived all 119 owned base copies + 238 frames with matching manifests. Original/default artwork not replaced.

Direct review of eight per-character contact sheets found a real mask defect: Ronan/Javon raw edits opened the mouth,
but the old region clipped it out. Tobias/Dalan also clipped the upper opening. Reused the existing raw edits to move
their region upwards; `so-saga-recompose.mts` corrected 58 owned speaking composites with expected-hash writes,
**zero image jobs**, unchanged models/seed/steps and full pixel/coverage QA. Prior 357-file archive retained. Fresh
audit remained 238/238; the corrected archive and content-keyed review are separate from the prior capture.
Direct raw/base/composite sheet now shows the previously missing openings. User visual approval still owed; pixel
QA is not expression/preference acceptance. Some already-open expressions intentionally alternate two open shapes.

The final labeled page uses separate character/expression controls, synchronized Normal/Talking playback, pause,
framing and content-keyed local review persistence/export. No blind preference-floor claim. This closes generation
of the **eight base packs only**, not all 31 authored outfits, living-card narration calibration or main-Saga integration.

Handover commands: `npm run test:debug` 1038/1038; `npm run debug:typecheck` clean; `npm run build && npm run test:release &&
npm run stage` green, release 95 passed / two skips, prod `6995f15f8283` restored. Owned lane 6 stopped. No commit/push.
`owned-packs-recomposed.json` records 357 files in the corrected archive; `geometry.json` preserves the calibrated
mouth overrides for the pending changed-look integration. The labeled page was opened for user review. Live
text→image recovery and human acceptance remain NOT green; finishing the base images does not close either gate.

## Unresolved

- **User visual approval given 2026-10-07** ("looks good"): Belle's speaking neutral/happy and the eight-character playback pack. Pixel QA plus this approval; still not the S28 blind-preference floor.

- User visual approval of Belle's speaking neutral/happy and the complete eight-character playback pack.
- S32-1 floor must pass after any prompt repair; the earlier below-floor measurement is retained.

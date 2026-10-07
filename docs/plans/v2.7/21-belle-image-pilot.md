# Plan 21 — Image track: the Belle pilot record

Status: IMPLEMENTED CANDIDATE, acceptance PARTIAL. v2.7 plan 21 (was `v2.8/image-pilot.md`; moved to v2.7 with the
image track, 2026-10-04). User approved 2026-10-03: Belle the Barbarian is the pilot; every implementation is
reusable production code. This record accepts no plan by itself: the deterministic gate is green, and the live
visual/model acceptance stays owned by `24-image-and-local-completion.md`. S32-1 is measured (keep prompt default
off); the user owns regular/two/three-frame visual ratings. The 2026-10-04 sections below are historical; plan 24
records later controls, cleanup, residency fixes, base creation and look/recovery measurements.

## Existing patterns

Reuse `image/runtime.ts` (queue and placement), `sprites/stage.ts` (stage and streamed expression reads),
`runtime/runToken.ts` (write ownership), the campaign's `render_sprites.py` (reference edits and feathered face paste),
and the existing ST server-plugin packaging and Connection Manager pickers.

## Scope and sequence

1. v2.7 17: ST image route, template fallback, advanced discovery and owned ComfyUI jobs.
2. v2.7 18: reference-edit recipes, pixel QA, Studio builder, fingerprinted asset storage and cleanup.
3. v2.7 19: isolated eye/mouth patches, stream activity, missing-frame degradation and reduced motion.
4. v2.7 20: public card-field view over blackboard state, persistent set selection and on-demand expression edits.
5. Belle pilot: default reference, neutral/happy/angry/worried, blink/open/half-open frames, one synthetic look change.
6. Existing per-plan deterministic gates, decision measurements and final acceptance; one-character evidence never
   closes the multi-character floors in plans 18–20.

## Infrastructure decisions

- Use ST's image backend by default and Connection Manager for the optional director.
- Advanced edits need an optional media server plugin; no ST core patch.
- ComfyUI jobs carry their real prompt id. Cancellation removes only owned pending jobs; it never globally interrupts.
  Running cancelled results are discarded. ST's existing ComfyUI proxy is unsuitable for owned cancellation.
- Model identity must include weight hashes, including the text encoder and VAE; discovery alone cannot supply hashes.
- User correction 2026-10-03: models stay on C: for autoload. No copying or migration. This supersedes the earlier
  off-C precondition for this image track on this installation. ComfyUI and the 3D pipeline retain their paths.
- Existing Belle packs remain untouched. The pilot uses a separate owned set.
- Local GPU sharing uses the configured backend, not a hardcoded Artemis model. Cloud/RunPod replies are independent.

## Gates

`npm run gates` including Storybook; targeted plugin tests; live no-model scenarios; owned-job integration against
ComfyUI; Belle render/preview/save/cancel/reopen/rollback checks. Archive evidence before recording a green row.
S28 and S32 floors remain unchanged; record unmeasured rows explicitly. No Adolion spoilers in public reports.

## Unresolved

- Installed edit model/node availability and actual PNG/reference availability.
- Measured edit latency, animation QA and memory; overlay depth/default remains gated by S32-1.

## Gate record — 2026-10-04

Existing patterns named above reused. New code is character-independent. Belle's assets live only in isolated lane 6,
`C:/dev/so-lanes/6/data/default-user/characters/Belle/so_belle_pilot` and `anim-so_belle_pilot`.
The live look test generated `look_3d1484ce`; original card and sprite files were not edited.

### Commands and outputs

- `npm run gates`: GREEN, every step including Storybook. Output archived in
  `test/measurements/v2.7/belle-pilot/gates.log`. Jest 529 suites / 6,370 tests passed (one skipped);
  debug 962 passed; plugin 95 passed / three intentional live skips; release 94 passed / two skips;
  Storybook 85 suites / 509 tests passed. Typecheck, test typecheck, lint, both builds, debug typecheck and defect replay passed.
- `node scripts/debug/st-lanes.mts run 6 -- scripts/debug/so-sprite-builder.mts pilot-pack`: GREEN.
  Four expressions, twelve facial frames saved with generated-file manifests. All pixel QA passed first seed.
  Per-render timings in archived `sprite-pilot-*.json` (roughly 80–95 s; initial happy 78.6 s).
- Real DeepSeek `deepseek 4.1 flash` reply via `st-actions.mts send`: replied true, Belle, 178 characters;
  three mouth source changes observed, activity null after completion. LI generated frames + CL streaming plumbing;
  not the full S28 visual/performance gate.
- `so-sprite-builder.mts look-check`: applied hair green, generated set selected; image read directly confirmed green
  hair. Screenshot timed out; the command is NOT green as a whole, state evidence retained.
- `node scripts/debug/st-lanes.mts run 6 -- scripts/debug/so-scenario.mts run test/scenarios/v27-card-rollback.json --sandbox --group 1791068844825`:
  GREEN twice consecutively, all six steps, cleanup clean. A fired transition applied the public field and rollback
  restored its absence/start checkpoint. The earlier manual-activation probe was a noop, not rollback evidence.
- `npm run debug:typecheck` after adding the pilot driver checks: GREEN.
- `git diff --check`: GREEN. `src/**` line endings restored to CRLF.

### Delivered

ST-default image route and non-LLM template, optional advanced media plugin, discovery and model mappings,
owned queued-job cancellation (no global interrupt), weight fingerprints, separate generated sprite sets,
Studio preview/keep and generated-file removal, facial patch compositing, streamed mouth activity,
reduced motion, public bound fields, transactional entry writes/provenance, starvation-free scope rotation,
visual readers, default-off prompt overlay and on-demand reference edits, owned cache and debug driver.

### Acceptance still open

- S28 blind ratings, from-neutral comparison, three-actor decoded memory/performance measurement, two consecutive runs.
- S32-1 main-model overlay depth/default arms and S32-2 five-look identity ratings; switches remain off by default.
- Route A real rendering, template/director arms, clean-host install, no-backend Repair registry integration.
- Per-chat reference counting/reaper and so-assets generated-set cleanup are not built; manual guarded removal exists.
- Studio card binding/effect controls, read-only ledger mirror, scope priority by latest speaker, and complete player
  persona start setup remain outside this candidate. JSON authoring, normal qualities and card chips work.
- GPU backend UI/auto selection and llama-server adapter are not built. Unsloth configured adapter and none/pass-through
  exist; no false claim that selecting a profile unloads a local model.
- Full four-candidate base creation/alpha removal is not built. The builder edits existing transparent references.
- Model helper for remote ComfyUI fingerprints, temporary-reference disk cleanup and crash-resume asset reconciliation
  remain open. Local server refuses files it cannot fingerprint; no model downloads or migration.

Storage correction: the initial over-broad copy to F: was stopped and all eight files created by this run removed
(79,364,091,334 bytes reclaimed). Original C: weights and ComfyUI paths unchanged. The media config reads those paths.
ComfyUI started detached/hidden; only the process started by this run is eligible for stop. No pod started, no commit/push.

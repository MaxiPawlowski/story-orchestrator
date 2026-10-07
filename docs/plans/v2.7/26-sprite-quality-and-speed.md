# Plan 26 — Sprite mouth quality and pipeline time

Status: IMPLEMENTED CANDIDATE 2026-10-06; D and image/read/reply regression green; visual acceptance awaits user.
User approved 2026-10-06. Extends plan 24; existing S28 floors unchanged. User prefers two-frame;
neutral blends expressions and happy leaves the original smile visible; angry/worried are the quality controls.

## Existing patterns

Reuse `builder/pixels.ts` feature compositing, `SpriteBuilder` ownership/cancellation, Studio preview/keep,
model-content fingerprints, the controller's text-priority leases, and the labeled comparison player. Original
reference packs remain protected. Models/reserves unchanged; no downloads, pods or ST data deletion.

## Sequence

1. Mouth-specific opaque replacement region, feather outside the lip/corner area, author-adjustable preview.
   Regression: old feathered mouth reveals source ink; new interior covers it, outside stays unchanged.
2. Expression-aware conversational mouth instruction; recipe/cache versioning; raw edit retained independently of
   compositing in a bounded builder cache so mask changes need no GPU render. Capture raw/edit/composite evidence.
3. Remove absent-alert waits and tab remounts; phase timings include cleanup. Two-frame batches generate blink/talk;
   half-open is opt-in. Measure against 24 old frames: median step 86.48 s, builder 24.65 s, difference 61.85 s.
4. Render repaired Belle at 1024/25 first, preserve all failures; review original/raw/composite and labeled playback.
5. Compare 768 then 512 at 25 steps against quality-fixed 1024; compare 20 then 16 steps on a qualifying resolution.
   Same references/seeds/prompt/model identity; cold/warm and text wait separate. Fast candidate needs quality ×2;
   user approves neutral/happy and no angry/worried regression before any quality/default sign-off.
6. Full `npm run gates`; real browser image/read/reply regression, archive results, restore prod/stop owned lane.

## Gates

- D: opaque original-mouth coverage, region bounds/feather, outside pixels/alpha, disjoint eye/mouth patches,
  frame QA negative controls, model/base/prompt/geometry/region/resolution cache identity, raw-cache limits and ownership.
- Browser: author region/resolution controls, cached recomposite without a second job, phase timings, clean cancellation.
- LI: four expressions, first-seed QA retained, raw/composite review; speed arms never scored from cached final images.
- LT: text still waits behind at most one in-progress edit; next reply/audit/boundary recovery.
- Human: labeled two-frame quality review; no automated score claims the user's visual verdict.

## Unresolved

- **User visual approval given 2026-10-07** ("looks good"): Belle's speaking neutral/happy and the eight-character playback pack. Pixel QA plus this approval; still not the S28 blind-preference floor.

- User approval of repaired neutral/happy and the angry/worried controls. Labeled preview uses 512/20 as a candidate;
  the product's resolution default remains 1024, and no visual/default sign-off follows from pixel QA.
- Warm-model microbatching remains contingent on measured need and an atomic text-priority handoff; initial work
  removes waits/unneeded frames and measures phases before adding controller policy.

## Gate record

### 2026-10-06 — implementation, measurements and handover

Built:
- `frameRegion.ts` / `pixels.ts`: mouth rectangle with an opaque middle, narrow surrounding feather; default starts
  above the old mouth line. Blink excludes that mouth area. Bounds/feather/coverage and disjointness regressions.
- `SpriteEditRegion` / `SpritePreview`: per-reference author adjustments, reference/raw/composite inspection, resolution
  choices, total/phase timing. Registry/Help and two interaction/a11y stories. Original canvas and art preserved.
- `RawEditCache`: 32 MiB bounded builder-local raw cache; close clears it. Render identity excludes only the compositing
  region; original/model/prompt/recipe/geometry/resolution/steps/seed still invalidate. Mask changes start no lease/job.
- Recipe 4: conversational neutral/happy request preserves the reference expression and natural shading; angry/worried
  instruction stays byte-identical to the approved old path. Earlier forced-dark/flat candidates retained, not promoted.
- Driver: no 30 s absent-alert waits, no tab remount per frame; blink/talk by default, half-open only with `--smooth`.
  Network job counts, raw PNGs and phase evidence captured. CPU QA avoids full-frame temporary RGB arrays and stops
  collecting colours once its unchanged eight-colour condition is satisfied.
- Broker workflow facts reflect actual aspect/resolution/recipe rather than one fixed 1024 key. Reserves/model roots
  unchanged. No new controller batching policy; text priority remains one in-progress edit.

Evidence: `test/measurements/v2.7/sprite-quality/`, each run's `build.json`, `samples.json`, `raw.json`.

| Final recipe run | New images | Median UI step s | Median owned render call s |
|---|---:|---:|---:|
| `v4-1024-25-r1` | 4 mouths | 26.86 | 23.54 |
| `v4-512-25-r1` | 4 mouths | 9.50 | 7.82 |
| `v4-512-20-r1` | 4 mouths | 9.14 | 7.66 |
| `v4-512-16-r1` | 4 mouths | 8.38 | 7.11 |
| `final-512-20-r2` | 8 blink/mouth | 17.37 | 15.75 |
| `final-512-16-r2` | 8 blink/mouth | 17.01 | 15.64 |

Numbers include successful first seeds, no cached final images. Repeat includes blinks and varied seeds; host-dependent
variation is visible, not hidden. 16 steps has little consistent total benefit over 20, so 512/20 is the review candidate.
Cold first 1024 frame took 84.3 s (fresh server fingerprinting included); warm results are not a cold-start guarantee.
The old driver median was 86.48 s, including its two absent-alert waits. That harness improvement is separate from
real resolution/step improvements. Recomposition uses zero submitted image jobs (four cases in each final full batch).

Commands:
- `node scripts/debug/st-lanes.mts run 6 -- scripts/debug/so-sprite-comparison.mts build --out <run> --resolution <n> --steps <n> --seed <n> --previous test/measurements/v2.7/s28/belle-user-pack-v3-run2/samples.json`
  with `--mouth-only` for matched four-mouth arms, `--recompose` for cache checks; first-seed pixel QA all green on final
  recipe arms. Raw/composite sheets directly reviewed. Initial setup popup attempt remains incomplete and excluded.
- `node scripts/debug/so-sprite-comparison.mts pack|check|review --out test/measurements/v2.7/sprite-quality/final-512-20-r2`
  (`review --quality` also) — original/new mouths, closed-eye blinks, one/two/three playback states reviewed; desktop/
  mobile decode/layout/export/pause/replay checks green. Three-frame explicitly uses the previous reference.
- `node scripts/debug/st-lanes.mts run 6 -- scripts/debug/so-image-runtime.mts` — green twice, own real queued manual
  audit, next native Artemis reply/boundary, generated look and clean restoration. Records:
  `test/measurements/v2.7/image-completion/runtime/run-1791289276277.json`, `run-1791289470296.json`.
  Helper now restores its matching library-array record exactly rather than treating the library as an object.
- Run-header diff — zero differences on the first stable batch; final batch zero blocking differences/warnings,
  three declared `build.manifest` changes for intentional recipe rebuilds. No inventory/profile/cast removal allowed.
- Final `npm run gates` — all 12 green: Jest 6400 passed / one skip; debug 1036 passed; release 94 passed / two skips;
  replay 32/32 killed; plugin 104 passed / three skips; Storybook 519 passed, 89 suites. Full log archived as `gates.log`.
  An intermediate gate caught an unnecessary review-export compatibility branch; removed, full gates rerun green.
- `git diff --check`; touched `src/**` normalized to CRLF. No budget or floor changed. Prod main 1,220,666 B.

User quality review remains pending. This record closes implementation/measurement work, not full S28, the broader
image-track acceptance or a global fast-preset/default decision.

Handover: final offline page regenerated with preset information and checked again. `node scripts/debug/st-lanes.mts
stop 6` stopped the owned lane; `npm run stage` restored prod; `git diff --check` clean. Summary: `sprite-quality/summary.json`.
No commit/push. Local services remain available through the existing controller; no active work was interrupted.

### Neutral source finding — user review 2026-10-06

User reports neutral is odd even in Regular, before animation. Verified the displayed base SHA256 equals the original
reference PNG: `8d6fc4a5cce48e93a449e80b868829cbcb609efcda89c7c983531f74e0323e07`.
Regular renders only that image: no blink/mouth overlays. The source already has a parted-lip smile instead of a
clean closed-mouth rest pose. Mask changes cannot repair a defect baked into the reference image; animation then
alternates that questionable rest with an independently edited opening, accentuating the difference.

Neutral visual acceptance is NOT green. Next repair: author-reviewed neutral rest in a separate owned set, preserving
face/pose/corners, then derive the speaking mouth from that accepted rest. Original/default files stay untouched.
The earlier agent review established mask coverage/playback, not suitability of the original neutral expression.

### Corrected rest candidates — 2026-10-06

User authorized step 1 only. Added the author-facing Closed-mouth neutral rest recipe (`qwen21-neutral-rest` v1):
a complete still with the mouth region replaced, reference alpha and all pixels outside the region preserved.
Separate owned set `so_belle_neutral_rest_20261006` on isolated lane 6, three candidates; no default/stage/reference
selection changed. User prefers candidates 1 and 3; canonical choice not yet selected. Speaking frames wait.

`npm run gates` all 12 green: Jest 6402 passed / one skip; debug 1036; release 94 / two skips; replay 32/32 killed;
plugin 104 / three skips; Storybook 520, 89 suites. Closed-rest prompt/complete-image fidelity regressions and UI story
included. `node scripts/debug/st-lanes.mts run 6 -- scripts/debug/so-neutral-rest.mts` produced three real 1024/25
candidates and saved hash-matching owned files. Original pack SHA unchanged; temporary references released and
settings restored. `node scripts/debug/so-neutral-rest.mts --check` verifies the offline still preview and full-figure
toggle; direct contact-sheet review confirms closed lips. Preview opened in the user's default browser.

Evidence: `test/measurements/v2.7/sprite-quality/neutral-rest/{report.json,index.html,contact-sheet.png,preview-check.json,gates.log}`.
`npm run debug:typecheck` and `git diff --check` clean. No original art overwrite, model move/download, or animation
generation. Visual acceptance and next step remain the user's choice.

Rest-candidate handover: owned lane 6 stopped; `npm run build && npm run test:release && npm run stage` restored prod,
release 94 passed / two intentional skips. Candidates retained for the user's choice, with 1 and 3 marked preferred.
Neither has been selected as the canonical neutral or used to generate speaking frames. No commit/push.

### Candidate 3 selected and speaking preview — 2026-10-06

User selected 3. Copied its exact PNG as `neutral` into separate owned set `so_belle_neutral_c3_20261006`, checked
against source manifest/content SHA. New speaking frame derived from that closed rest at 1024/25, saved as owned
`anim-so_belle_neutral_c3_20261006/neutral.talk.png`. No original/default artwork overwrite or automatic stage adoption.

`node scripts/debug/st-lanes.mts run 6 -- scripts/debug/so-neutral-speaking.mts` — real render/save, hashes match,
settings restored, temporary references released. `so-sprite-comparison.mts pack|check|review --out
test/measurements/v2.7/sprite-quality/neutral-c3-speaking` — playback/layout/export checks pass, rest/open/raw images
directly reviewed; page opened in default browser. Earlier three-frame panel retains its own old base, not the new
closed rest beneath unrelated old mouth patches. Existing happy/angry/worried rows retained as references.

`npm run test:debug && npm run debug:typecheck` — 1036/1036, typecheck clean. `npm run build && npm run test:release &&
npm run stage` — prod restored, release 94 passed / two skips; owned lane 6 stopped. No commit/push. New neutral
animation awaits user quality approval. Evidence: `sprite-quality/neutral-c3-speaking/{build.json,samples.json,raw.json,index.html,agent-quality-sheet.png}`.

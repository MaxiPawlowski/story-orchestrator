# 36 — Live close-shot head

Owner decision 2026-10-10: bring mesh-avatar-studio into v2.8, branch `v2.8-live-head`.
Deterministic implementation here; vision, image generation and live acceptance owed.
Pose library remains on `v2.8-poses` (plan 33).

## Contract and existing seams

`SpriteStage` selects the member, set/look and expression; `VnStage` already displays
close/thigh/full shots and `StreamActivity` consumes visible reply updates through
`stHost/sprites`. Plan 19's blink/talk PNG overlays remain the fallback. This feature
adds breathing, seeded blinks, gaze, small head turns/tilts, streamed mouth opening
and expression parameters on a layered bust. It cannot sit, kneel, fight or re-pose.

Input: a front-facing transparent head-and-shoulders image for one member and look.
The rig is selected only for `close` framing (including a close-shot spotlight).
Other framing stays with the current sprite. The canvas takes the selected bust's
place only after its first successful draw; the already mounted static image stays
underneath. Expression labels drive parameters on the rig's source face; they do
not pretend that a neutral rig has the exact pixels of every authored expression.

Plan 33's look base/body/face/frames/decal layers still determine art and look identity.
A live rig is a presentation cache derived from a close-shot look base. Changed hair,
outfit, age or baked decals require a different art hash and another rig. No pose
cache, pose classifier, authored pose field or body rendering is built here.
Plan 19 B+P applies where no rig is available; its face overlays and CSS breath must
not run on top of a ready mesh. This is the close-shot part of option D, without
See-through, Spine, MediaPipe, camera, microphone or a live model server.

## Rig authoring pipeline

Studied clone: `C:/dev/st-extensions-research/mesh-avatar-studio`, `6f6d362`:
README, AGENTS, agent-guide, rig-fields, rig-mapping, reference, typed rig validator,
WebGL shaders/grid/deformation and Python layer builder. MIT, copyright 2026 Yuki
Shindo. Derived files retain the full notice; THIRD-PARTY-NOTICES is regenerated
with a persistent entry. No sample character art is copied.

1. Source bust and draft are local authoring inputs. Calibration marker generation
   is CPU-only (upstream uses blinded random positions); scoring is deterministic.
   Reading marker coordinates needs a vision model.
2. Full grid, then eye grids at 5 px and other feature grids at 10 px. A vision
   session locates influence ellipses, eye opening/ROI polygons, mouth, neck and chest.
3. Validate draft, render overlays, visually correct it. Do not infer coordinates
   from a full image alone. Eye contour error <= 2 px, ROI contains lashes, mouth
   lies on the drawn line, head influence avoids shoulders.
4. CPU layer builder: NumPy/Pillow/OpenCV inpainting and cutting, 24 samples per eye,
   base and eight eye layers. No GPU or model. The command uses an already installed
   Python environment; it never installs dependencies or downloads anything.
5. Review rest, half/closed eyes, mouth, +/-30-degree turns, gaze and tilt, at most
   three correction rounds. This is an owed vision protocol, not automatic acceptance.
6. Optional drawn closed eyes and mouths require an image model via the existing
   image/broker recipes (plans 18/19/28/29/30); not invoked here. Deformed eyes and
   shader mouth are the initial runtime. Hair springs, hands and hanging accessory
   motion are outside this close-shot implementation; unsupported rigs are refused.

Model: our authoring role, opencode `gpt-6.1-sol` through the tool bridge when offered,
else DeepSeek. Calibration is mandatory on each model/session. DeepSeek without image
input cannot place a rig: retain static sprites and report that limitation, rather
than sending text-only coordinates. No authoring-role or transport change here.

Cost per look: CPU layers and runtime have zero model charges; rig geometry needs one
vision authoring session plus up to three reviews. Token usage, wall time and money
are **unmeasured**. Before a real session, quote the configured route's actual tariff
and a token cap; record `input tokens * input rate + output tokens * output rate`
(including image-input accounting), or opencode subscription usage. Optional drawn
variants add the existing per-image recipe cost. Never quote an invented fixed price.

Cache key: JSON tuple `(member, look, source PNG sha256)`, schema/pipeline version in
the manifest. Authoring outputs live in ignored `.live-head-projects/` under this
worktree, create-only project directories. Publication to an ST asset directory is
owed; the deterministic tool also packages a self-contained JSON with PNG data URLs
for import through Author view. Install-wide `sprites.liveHeadRigs` holds manifests
as F15 deltas, one entry per tuple. It is local; no campaign art is committed.
The binding names the neutral source sprite URL for the selected look. Runtime
verifies those source bytes against the SHA256 before displaying the cached rig;
same path with changed art fails closed to static. No rig generation on reply.

## Runtime and UI

WebGL2 in the page, a separate dynamic import below the already lazy sprite stage.
Only `sprites.liveHead` (default true) and rig-reference settings sanitation enter
the main settings model; renderer, loader, drivers and Author UI remain lazy.
Keep main bundle <= **1,300,000 bytes**, never change the existing budget.

`prefers-reduced-motion`, ST reduced motion and story `display.motion: false` stop
idle breath/blink/gaze/tilt and streamed mouth movement without changing settings.
Expressions can still display as a fixed parameter vector. Hidden pages suspend
drawing. Mobile uses the existing stage strip, capped DPR and canvas dimensions;
at most one close-shot live head (spotlight, else speaker, else first close actor)
so a cast does not allocate unbounded WebGL contexts. Context loss, missing WebGL,
invalid data, hash mismatch and decode failure hide the canvas synchronously.
No chat/engine persistence is written by animation. Async loading takes RunGuard,
checks after each await and before render publication, aborts and disposes on change.

Author view lists rig present/missing for each member's selected look and accepts a
validated manifest. An install switch lives with sprite controls. Synthetic stories
use our own geometric shapes only, with interaction and a11y assertions.

## Predeclared gates (floors informational; defaults stay on)

| ID | Protocol | Floor | Tier/status |
|---|---|---|---|
| D | Pure loader/validator, key/hash invalidation, seeded idle/blink, mouth stop/quiet filtering, expressions, stale loads; synthetic Storybook | deterministic tests pass; interaction + a11y | build here; Storybook runner owed |
| LI1 | Two 60 s close-shot runs on a named mid laptop, 3-member synthetic story, DPR/device/GL recorded; foreground frame intervals | no frame drop below 30 fps (no interval > 33.34 ms during measured steady drawing) | owed, no-model lane |
| LI2 | Baseline/candidate production manifests + initial webpack module graph; only mount/settings stub difference in main | main unchanged except mount/settings stub; <= 1,300,000 B; renderer/rig/drivers absent from initial chunks | bytes/graph D; live network capture owed |
| LI3 | While static is already shown, reject fetch, corrupt JSON/image/hash, remove WebGL, lose context and switch member/look/chat during decode; screen/frame capture | static visible within 1 animation frame on every failure, zero stale canvas publications | owed, no-model lane |
| LI4 | OS reduced motion, ST reduced motion and story motion off, each during idle and streaming; compare parameter samples across 10 s | idle parameters unchanged (breath/blink/gaze/tilt); mouth stopped | pure D; live no-model lane owed |
| LI5 | Authoring role calibration and 3 synthetic looks, grids/overlays, <=3 review rounds | calibration passes upstream score; eye contours <=2 px; closed eyes no iris/white; mouth no chin stretching; no tears at +/-30 degrees | owed vision session; GPU only for optional drawn variants |
| LI6 | Mobile 390/768 and desktop 1440; hidden tab and teardown | no horizontal overflow; <=1 live context; hidden tab no draw; resources released; keyboard import usable | owed no-model lane/Storybook |

Run LI rows twice consecutively on one frozen build, lane other than 0. Capture
build hashes, laptop/browser, frame evidence and cleanup. GPU/image variant checks
only in an owner's allocated 3090 slot via broker; no new model files without plan 30.
No live run, model call, owner ST access, GPU use or downloads authorized in this task.

Required deterministic commands: `npm run gates -- --no-storybook --jobs 2` and
`npm run typecheck:test`. Do not run `test-storybook:ci` here: the junctioned runner
resolves the main checkout's stories. Record this as owed, never green.

## Unresolved questions

- Measured authoring-session cost/time and DeepSeek vision capability on the configured route.
- Real-art closure quality and laptop/mobile throughput; optional drawn variants after LI5.
- Disk-backed rig publication if self-contained manifests become too large for install settings.

## Gate record

2026-10-10. Floors above declared before implementation. Deterministic half built;
live/vision acceptance still owed. No floors or budgets changed.

Built: upstream-v1 typed rig validator and close-head manifest, source SHA256 and
member/look/art cache identity; nine-layer WebGL2 renderer in a lazy chunk; seeded
breath/blink/gaze/tilt, expression labels and visible streaming mouth activity through
the existing stHost seam. Default-on `sprites.liveHead`, static fallback, reduced/story
motion, hidden-tab suspension, one close actor, guarded teardown/context disposal.
Author status/import, owned synthetic rig and two interaction/a11y stories. CPU
calibration/grid/overlay/layer/package command, MIT notices, queue A23 and plan 33 cross-reference.

| Exact command | Observed result |
|---|---|
| `npm run gates -- --no-storybook --jobs 2` | `gates: all green in 234.7s`; ten steps exit 0; `SKIPPED: test-storybook:ci` |
| `npm run typecheck:test` (standalone, final source) | `tsc -p tsconfig.test.json`, exit 0, no diagnostics |
| `npx jest src/sprites/liveHead --runInBand` | `Test Suites: 2 passed, 2 total`; `Tests: 25 passed, 25 total` |
| `node --test scripts/lib/liveHeadRig.test.mjs` | `# tests 3`; `# pass 3`; `# fail 0` (also in test:debug) |
| `node .build/head-cpu-smoke.mjs` | `CPU grid: passed on owned synthetic shapes`; `CPU overlay: passed on owned synthetic shapes`; `CPU calibration: passed on owned synthetic shapes` |
| `python .build/head-python-check.py` | `Python CPU tools: 5 syntax checks passed (no imports or image work)` |
| `node .build/head-bundle-check.cjs` | `head chunks: 0 renderer/rig/driver/Author modules in initial chunks; main 1291554 B`, exit 0 |
| `node scripts/release/manifest.mjs` (after graph inspection rebuilt dist) | `build manifest → dist\manifest.json (bundle 6f0e4dd6c239, source 04a5e28f24e5, ST 1.19.0)` |
| `node .build/head-final-verify.cjs` | `Final artifact: 1291554 B, matching manifest/chunk graph; 31 changed source files CRLF` |
| `npm run test:release` (after graph inspection) | `# tests 136`; `# pass 122`; `# fail 0`; `# skipped 14`, exit 0 |
| `npm run notices` | `THIRD-PARTY-NOTICES.md: 12 bundled packages, 7 example files` |
| `npm run docs:settings` | settings reference/README regenerated; `guide: 32 pages, 1 images -> src\guide\pages.generated.ts` |

Full Jest: `Test Suites: 1 skipped, 663 passed, 663 of 664 total`; `Tests: 1 skipped,
7711 passed, 7712 total`. Replay: `defect replay: 32 of 32 killed in 88.2s`.
Build: `webpack 5.90.3 compiled successfully in 7481 ms`. Lint exit 0 with the
existing BriefingHost story dependency warning. Ownership/error inventories and
session baseline updated for the new sites/settings; existing ratchets unchanged.

Main **1,291,554 B**, baseline **1,290,372 B**, delta **+1,182 B**, headroom **8,446 B**
under unchanged **1,300,000 B** budget. SHA256 `6f0e4dd6c239f329775820a96f8f8a3bc15da050ce3d53eed7f7e9b29725649e`.
Only lightweight settings/reference sanitation and discovery copy enter main;
mount, Author UI, rig validation, drivers, shaders and renderer stay lazy. Chunk graph
and logs are local `.build/live-head-chunks.json` / `.build/live-head-*-final.log` /
`.build/live-head-gates-close.log`. Changed `src/**` verified CRLF.

Deviations: first full run red on registry/settings/inventory/file-size checks;
fixed casts and extracted the stage helper without lifting ratchets. The gate runner
previously ignored spaced `--jobs 2`; now supports it, with a test. Full MIT headers
are the required exception to no code comments. Upstream overlay colour lookup
adapted to remove its editor-source dependency. Rig cloning uses JSON for the
browser floor. Calibration images are CPU-only blinded random fixtures, not vision
calibration results. Synthetic CPU outputs stay ignored in `.live-head-projects/`.

Owed: **LI1–LI6 ×2**, every real vision rig/session/calibration score, measured cost
per look, real-art quality and optional GPU/model variants. CPU layer inpainting was
not executed: this Python has Pillow, lacks NumPy and OpenCV; nothing installed.
Node packaging tested against owned synthetic layers. No model calls, GPU work,
downloads, owner ST/browser playtest or deployment. **Storybook CI not run**: its
junctioned runner resolves the main checkout; interaction/a11y execution owed there.

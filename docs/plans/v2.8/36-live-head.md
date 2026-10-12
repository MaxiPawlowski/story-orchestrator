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
| LI5 | Authoring role calibration and 3 synthetic looks, grids/overlays, <=3 review rounds | calibration passes upstream score; eye contours <=2 px; closed eyes no iris/white; mouth no chin stretching; no tears at +/-30 degrees | A2: synthetic looks measured, all floors pass (see A2 Gate record); Sol-bridge calibration and campaign rigs owed; GPU only for optional drawn variants |
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

## Master merge gate record

2026-10-10 · `C:\dev\so-live-head` · `v2.8-live-head` merges local master
`c82e065f41936a728baa6bb6000494c8913c50a7` (plan 33). Both deterministic features retained.

`stage.ts` keeps the pose controller, body selection, replay and per-member framing;
its composed actor binds a head from the selected set's neutral artwork. Extracted
`stageTypes.ts` carries pose/framing plus live-head references and session identity.
`VnStage.tsx` chooses at most one close actor (spotlight, speaker, first close actor),
including per-member close framing, and mounts the head above the selected image.
Missing rigs retain the posed/static image. Regression cases cover coat/armor/replay,
rig absence, explicit framing, precedence and one mounted head.

Settings/defaults/sanitation and feature registry are unions. The gate runner keeps
the existing support for both jobs spellings; both sides' tests remain. Finding
inventories union all sites (216 error-copy rows, 239 ownership sites); the shared
classify site retains plan 33's guarded classification. Both census guards passed.
README, queue and plan 33 retain both tracks; prior recommendations remain beside
the accepted decisions. Generated files regenerated, never hand-merged.

| Exact command | Observed result |
|---|---|
| `npm run docs:guide` | `wrote 12 pages to docs/guide/author`; `guide: 32 pages, 1 images` |
| `npm run docs:settings` | settings reference/README regenerated; `guide: 32 pages, 1 images` |
| `npm run gates -- --no-storybook --jobs 2` | `gates: all green in 252.5s`; exit 0; ten steps below |
| `npm run typecheck:test` (standalone, final source) | `tsc -p tsconfig.test.json`; exit 0, no diagnostics |

```text
  ok   test (103.6s, started at 0s)
  ok   test:replay (129.8s, started at 0s)
  ok   build (29.9s, started at 103.9s)
  ok   test:debug (46.6s, started at 133.8s)
  ok   typecheck (54.5s, started at 129.8s)
  ok   lint (47.3s, started at 184.4s)
  ok   typecheck:test (51.2s, started at 180.9s)
  ok   test:plugin (11.4s, started at 232.1s)
  ok   debug:typecheck (20.1s, started at 231.6s)
  ok   test:release (9.0s, started at 243.5s)
  SKIPPED: test-storybook:ci (say so in the gate record)
```

Jest: `Test Suites: 1 skipped, 668 passed, 668 of 669 total`; `Tests: 1 skipped,
7733 passed, 7734 total`. Replay: `32 of 32 killed in 128.8s`. Debug: 1197 passed,
zero failures. Release: 123 passed, zero failures, 14 skips. Lint: zero errors,
existing `BriefingHost.stories.tsx:81` hook-dependency warning.

Main **1,293,100 B / 1,300,000 B**, headroom **6,900 B**. No budgets,
floors or defaults changed. Changed source files retain CRLF; diff checks pass.
No GPU, downloads, model calls, owner ST or browser work. Storybook CI skipped by
request; plan 33 S0/CL/LI and plan 36 LI/vision acceptance remain owed.

## A1 Gate record

2026-10-10. Handoff A1 on `v2.8-live-head`, merged master `11955810` first.
**LI3/LI4/LI6 PASS twice; LI1 FAIL/PASS, not accepted.** Floors unchanged.

Fix: a binding/import change now replaces the canvas DOM node. Previously the
effect destroyed its WebGL context and reused that same lost canvas on rebind;
keyboard rig import could report success while no live head returned. Both final
browser runs exercise successful keyboard import and look switching after the fix.

Fixture: `test/scenarios/live-head/story.json` (three synthetic members),
`rig.json` (owned Storybook geometric rig recipe, two looks), reusable
`scripts/debug/so-live-head-check.mts`. Production components, loader, renderer,
stage and ownership run in the lane; no separately bundled mock component.
Candidate `dist/` served by lane browser routes; owner's staged copy untouched
during measurement. PNG layers are routed locally; marked static sprites/cards
are real lane assets. LI4's scripted stream adapter updates a temporary host reply
and emits real ST token events; the sprite stream driver must report active.

Machine: **DESKTOP-NP0HG32**, Windows, Intel Core i9-9900 @ 3.10 GHz; DPR **1**;
Chromium **145.0.0.0** (UA reports HeadlessChrome). GL:
`ANGLE (NVIDIA, NVIDIA GeForce RTX 3090 (0x00002204) Direct3D11 vs_5_0 ps_5_0, D3D11)`.
This is the available **desktop, not the predeclared mid laptop**. No text/image
GPU workload, controller start, model download or inference was used.

Frozen served main **1,293,100 B**, SHA256
`48f8e7a4f5182130c76d91dd405245ebfd896b7097306ddc4e5b180344ab4a97`;
same build and fixture in both consecutive runs. Budget remains 1,300,000 B.

- Run 1, `measured1`: LI1 **5,229 frames**, timestamp span **59,997.2 ms**,
  p50 **8.6 ms**, p95 **18.6 ms**, maximum **51.8 ms**, **2** intervals >33.34 ms:
  **FAIL**. No samples discarded.
- Run 2, `measured2`: LI1 **5,243 frames**, timestamp span **60,002.9 ms**,
  p50 **8.6 ms**, p95 **17.9 ms**, maximum **29.3 ms**, **0** over-floor intervals:
  **PASS**. One passing rerun does not erase the miss.
- LI3 both: **9/9** failures/switches pass; static visible at next animation frame,
  **0 stale canvas publications**: rejected fetch, corrupt JSON/image, hash mismatch,
  WebGL absent, actual context loss, member/look/chat changes during held layer decode.
  A look crossfade counts the already visible outgoing static image.
- LI4 both: OS CDP reduced motion, ST reduced motion, story motion off, each idle
  and streaming for **10 s**. **6/6** arms per run: **1** unchanged uploaded mesh
  vector and mouth uniform **0** throughout. Run 1 frame counts (idle/stream):
  OS **825/846**, ST **850/845**, story **924/949**; run 2:
  OS **934/836**, ST **861/745**, story **897/913**.
- LI6 both: widths **390/768/1440**, scroll widths exactly **390/768/1440**;
  current/peak contexts **1/1**, one canvas. Keyboard Tab/Enter rig import passes.
  Real hidden tab: draw counts **12,385→12,385** / **12,510→12,510** across **1.5 s**,
  `document.hidden` true at both ends. Teardown: **0 contexts, 0 resources**.
- Model/judge requests **0** in both final runs; cleanup **clean**, **0** leaked
  marked assets. Offline plugin capability probes produce expected 404s, offline
  backend status/props produce 500s, and injected fetch/decode faults are retained
  in page capture; **0 page errors**. No real-model gate is relevant to these rows.

Exact measurement commands, in order (worktree):

```bash
SO_LANE_OFFLINE=1 node scripts/debug/st-lanes.mts seed 30 --slim
node scripts/debug/st-lanes.mts restore-model 30
node scripts/debug/st-lanes.mts no-model 30
node scripts/debug/st-lanes.mts start 30
node scripts/debug/st-lanes.mts stop 30
node scripts/debug/st-lanes.mts start 30 --headed
ST_DEBUG_VIEWPORT=1440x844 node scripts/debug/st-lanes.mts run 30 -- scripts/debug/so-live-head-check.mts --row all --label measured1 --candidate
ST_DEBUG_VIEWPORT=1440x844 node scripts/debug/st-lanes.mts run 30 -- scripts/debug/so-live-head-check.mts --row all --label measured2 --candidate
```

Offline seed already held the key backup, so the first `no-model 30` refused;
restore/no-model above completed before starting the server. Earlier probes kept:
LI1 maximum 35.3 ms (1 miss), 120.1 ms (3 misses), 48.3 ms (2 misses).
No floor retuned and no evidence selected away. Harness fixes: reset publication
count after context readiness; hold/release every layer; restore selected speaker
after reload; include outgoing static crossfade; dismiss fresh-chat briefing.
Playwright focus emulation prevents real hidden tabs: the hidden arm disconnects
it, activates another tab through raw CDP, observes visibility/draw counts, then
reconnects. Lifecycle freeze and minimizing with Playwright attached were not proof.

Evidence archived privately by
`node scripts/debug/so-evidence.mts archive --label v28-a1-live-head-20261010 --lanes 30 --pods none`:
**500 files, 44,971,140 B, 0 problems**. Archive root:
`test/sessions/evidence/phase-c/v28-a1-live-head-20261010` in so-sessions;
records/frames/parameter samples/screenshots under `lane-30/debug/runs/live-head-measured1`
and `live-head-measured2`, plus original runner/page/server logs under `runs/`.
No evidence or private inventory committed publicly.

Deterministic commands:

- `npm run build`: webpack compiled successfully, main **1,293,100 B**.
- `npm run debug:typecheck`: exit 0, no diagnostics.
- `npm run gates:quick`: **green in 88.6 s**, 7 related suites / 48 tests,
  replay **32/32 killed**. New intentional useMemo identity-dependency warning;
  no lint errors.
- First `npm run gates -- --no-storybook --jobs 2`: **RED** on arrival-golden
  corpus parity for the added story. Added its independently verified empty
  finding row; no assertions relaxed.
- Second `npm run gates -- --no-storybook --jobs 2`: **all green in 117.4 s**;
  all ten deterministic steps exit 0; **Storybook skipped here**. Master full
  Storybook-inclusive gate/deployment recorded below when complete.
- `npm run debug:typecheck && npm run typecheck:test && npm run test:release`
  after final harness/docs edits: exit 0; release **123 pass, 0 fail, 14 skipped**.
- `node scripts/debug/st-lanes.mts stop 30`: lane server/browser stopped.
- Private evidence commit **eb6c8749**, pushed. Explicit archive path staged;
  `npm run sessions:archive` was not used because its `add -A` would include
  three pre-existing owner changes outside this archive.

Owed: LI1 two passes on the named mid laptop; present desktop miss remains
informational and live acceptance **not green**. LI2 network/initial-chunk check,
LI5 vision rigs and authoring costs remain separate tasks. No campaign change:
this task fixes binding lifecycle and measures owned synthetic geometry only.

### A1 master merge gate

2026-10-10, task commit **9566b088**. Main checkout clean before
`git merge --no-ff --no-commit v2.8-live-head`; merge resolved without conflicts.
`npm run docs:guide && npm run docs:settings` regenerated the guide and settings.
No listener on :6006 before the suite.

`npm run gates -- --jobs 4`: **gates: all green in 218.9s**, Storybook included:

```text
ok build (19.7s)
ok test:debug (51.8s)
ok test (82.9s)
ok typecheck (21.1s)
ok test:replay (105.3s)
ok typecheck:test (23.6s)
ok test:plugin (8.7s)
ok debug:typecheck (13.5s)
ok lint (29.5s)
ok test:release (7.3s)
ok test-storybook:ci (218.9s)
```

Jest **668 passed suites, 7,733 passed tests, 1 skipped**. Storybook **122 passed
suites, 762 passed tests**. Lint **0 errors, 2 warnings** (existing briefing
dependency warning and the canvas identity useMemo dependency warning).
Main-checkout module numbering differs from the worktree: main **1,293,117 B**,
SHA256 `2307b5ecc61779f83b91b4326345b1dd3d7f59b1b1ffd39546c3dd438d2802fd`.
The renderer change stays in its lazy chunk. Browser numbers above describe the
frozen worktree production artifact; no claim of LI1 acceptance on either artifact.

Deployment: merge **7fea4ee9** pushed with `git push origin master`.
`node scripts/release/manifest.mjs && npm run stage && npm run plugins:install`:
**159 files staged**, all four plugins **unchanged**, **restartNeeded: false**.
Owner reloads the ST page. Lane 30 is stopped; only its synthetic assets were
removed. A1 measurements and regression fix delivered; LI1 acceptance remains owed.

## A2 Gate record

2026-10-11. Handoff A2 on `v2.8-live-head`, merged master `b1aba6c4` first (fast-forward,
no conflicts, nothing to regenerate). LI5 on three owned synthetic looks. Floors unchanged,
none retuned. **LI5 floors pass on all three looks; the "authoring role" part is not met:
the vision reads were done by the executing session, not opencode Sol through the harness
bridge.** No campaign art rigged. No lane, ST (port 8000), GPU, ComfyUI, download, staging
or master merge.

Looks (owned code-drawn 400 x 512 busts, `scripts/live-head/synthetic-looks.py`, different
face shape, hair, skin, eye shape and iris colour): `amber` (long hair, large almond eyes),
`slate` (bob, round eyes), `ember` (cropped hair, narrow eyes, visible ears). Projects,
reviews and truth files are ignored in `.live-head-projects/`; copy in the private
so-sessions repo, `test/sessions/evidence/live-head/v28-a2-li5-20261011` (commit
`25138a77`, 148 files, 10,469,348 B, sha256 list in its `ARCHIVE.json`).

- Python: `pip install numpy opencv-python-headless` into the `python` on PATH (miniconda
  base, the one `rig.mjs` runs): numpy 2.5.4, opencv-python-headless 5.0.0.93, Pillow 12.3.0
  already present. Library install only; ComfyUI's environment untouched. The upstream
  layer builder ran unmodified on OpenCV 5.0.
- Pipeline per look: calibration (`rig.mjs calibration`, scored with vendor
  `vision-check.py`), full 50 px grid, 5 px eye grids per eye, 10 px face grid, draft
  `rig.draft.json`, `rig.mjs validate`, overlays, `rig.mjs build` + package, then pose review.
- Every generated sheet was opened and looked at: grids, overlays and all seven review
  sheets of every round (poses core/turn/gaze/expression, zoomed eyes, eyes under
  turn/tilt, zoomed mouth); `amber/review-r1-audit` re-renders the round-1 build for the
  pixel counts only and was not judged again.
- Review renders use `scripts/live-head/review.mjs`: the in-repo `HeadRenderer` and
  `loadHeadManifest` in headless Chromium on SwiftShader (CPU; `--use-angle=swiftshader`
  needed, `--enable-unsafe-swiftshader` alone drew nothing). Pose list follows the upstream
  guide's Step 5; no upstream code is copied.

Per-look results (floor pass/fail; rounds = review rounds that judged a build):

- **amber**: calibration median **0.61 px**, max **1.24 px** (floor 4 / 10) PASS. Eye
  contour **1.65 px** (floor 2) PASS. Round 1 FAIL: closed eyes left iris slivers
  (8.0 / 8.75 px^2 of 274 open) and the eye ROI touched hair, leaving a dark smear beside
  each eye. Round 2 (ROI pulled 3 px off the hair, opening bottom 0.7 px outward) PASS:
  closed iris **0.25 px^2**, white 0. Mouth open: chin outline intact PASS. +-30 degree
  turns and tilts: no tears PASS (long hair shears at the weight band on tilt). Rounds
  **2** of 3. Wall **7 min** (includes writing the review harness and options), image reads
  **22**.
- **slate**: calibration median **0.75 px**, max **1.64 px** PASS. Eye contour **1.88 px**
  PASS after four draft passes (2.27, 2.75, 2.55, 1.88). Round 1 FAIL: brown iris dots under
  the closed lash line (5.25 / 10.5 px^2 of 333). Round 2 (opening bottom 0.7 px outward)
  PASS: **4.0 / 4.25 px^2**, a faint hairline, white 0. Mouth PASS. +-30 degree: no tears
  PASS (bob hair shears on tilt, face outline kinks at the hairline on turn). Rounds **2**.
  Wall **2 min**, image reads **22**.
- **ember**: calibration median **1.05 px**, max **1.33 px** PASS. Eye contour **1.87 px**
  PASS after two draft passes (2.10, then 1.87). Round 1 PASS: closed iris **1.75 / 0.75
  px^2** of 128.5, a faint amber hairline under the lash line, white 0 (judged
  "faint line only", the upstream guide's pass case; strictly it is iris colour).
  Mouth PASS. +-30 degree: no tears PASS. Rounds **1**. Wall **2 min**, image reads **14**.

Cost: **0 provider-metered model calls**; no harness-bridge call. Vision work = the image
reads above (about 58 across the three looks plus 6 source views). Tokens, price and
money are **unmeasured**; no tariff was quoted and none is invented. Wall minutes are the
shell clock between start and end of each look; per-look minutes after the first are
small because the tooling already existed. CPU layer build and renders cost no model.

Findings recorded, none a LI5 floor:

- Gaze at +-1 distorts the iris on all three looks (bean-shaped iris, a hard vertical
  white edge on `ember`); gaze up/down shows stray lash and lid fragments (`amber`,
  `ember`). Surprise and anger at the shipped parameters are legible, mouth shapes fine.
- Hair in front of the face edge (`amber`, `slate`) needs the eye ROI away from the hair:
  a ROI that touches it smears hair colour into the skin fill.
- An opening traced exactly on the visible white leaves iris pixels outside it; they land in
  the lash and lid layers and show under a closed eye. Tracing 0.7 px outward at the lower
  edge removed them (applied up front on `ember`).
- Eye contour error was measured against the generator's own outline
  (`scripts/live-head/truth-score.py`, visible white minus lash and lid strokes). That
  needs ground truth, so it exists only for synthetic busts; slate and ember draft
  corrections used it. Campaign art would be scored from overlays by the vision model,
  which cannot resolve 2 px unaided.

Deviations: vision model was this session, not Sol on the tool bridge; calibration was run
once per look on that session, so LI5's "authoring role calibration" is not met for Sol.
Tooling added to `scripts/live-head/`: `rig.mjs` `validate`, `--name`, `--part`,
`--zoom`; `review.mjs` and `review-page.mjs`; `synthetic-looks.py`; `truth-score.py`;
three tests in `scripts/lib/liveHeadRig.test.mjs`.

Deterministic commands: `npm run typecheck`, `npm run typecheck:test`: exit 0 with no
diagnostics. `npm run lint`: 0 errors, the same 2 existing warnings. `npm run test:debug`:
1203 pass, 0 fail. `npm run debug:typecheck`: exit 0. `npm run gates:quick`: **green in
84.9 s**, replay 32 of 32 killed. Full `npm run gates` not run (not a merge task).

Owed: **campaign rigs** (ask the owner which members to rig; rig files go to the install's
rig store, never this repo; no campaign member was touched); a Sol-through-bridge repeat
of calibration and the vision steps if the owner wants LI5 accepted on the authoring role;
Author-view import of these three packaged rigs in a browser; measured token cost per look;
optional drawn variants (GPU, plan 30). LI1 laptop and LI2 network capture stay owed.

## Gate record: deformation cost and the showcase rig (2026-10-12)

- Place: `C:\dev\so-live-head`, branch `v2.8-live-head` at `0740c3b7`, merged into master through `v2.8-showcase`.
- Change: `deformInto` and `eyeVertexY` in `src/sprites/liveHead/geometry.ts` write into reused buffers instead of allocating per frame. `geometryEquivalence.test.ts` checks the output is identical to the previous implementation. Measured CPU gain about 10 percent.
- LI1 is NOT claimed fixed. The desktop interval misses recorded in the A1 Gate record stay as recorded; the mid-laptop run is unmeasured because the owner has no laptop.
- Showcase rig: one original illustrated bust (the showcase's first member) was rigged with the CPU pipeline, calibration median 0.51 px (PASS), bust crop 130,0,500,640, mounted on a lane with `head: true`. Vision steps were run by the executing session, not Sol over the bridge.
- Owed: rigs for the showcase's other two members, LI2 network capture, Sol-bridge calibration, LI1 laptop, a repeat of LI3/LI4/LI6 on the final build.

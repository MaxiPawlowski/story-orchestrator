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

## Gate record: rigs and the final build (2026-10-12)

- Builds: LI2 on the staged build (main bundle 1,245,548 B, hash 0dd351f6…); the rest on the showcase candidate (1,245,554 B). Machine: i9-9900, RTX 3090 through ANGLE/D3D11, DPR 1, HeadlessChrome 145.
- Rigs: the showcase's other two busts are rigged (so all three are). Calibration: Garrick median 0.70 px, max 1.27 px; Pim 0.93 and 1.41 (floor 4 and 10). Eye openings read from 2 px grids and checked on overlays. Vision work by the executing session, not Sol.
  - Garrick: round 1 showed the open mouth reaching the chin. The shader's open height was fixed at 20 to 26 px; it now follows the mouth-to-chin gap from the rig's jaw (the gap is about 26 px on the synthetic and first showcase rigs, so they are unchanged). Round 2 accepted.
  - Pim: round 1 left iris fragments in the closed eyes and a tall mouth. Lower openings widened 0.9 px, jaw ellipse shortened. Round 2 accepted with faint bluish specks at the lash ends of the closed eyes (lash pixels, not iris).
- Review tool: whole-figure and zoom sheets sampled the wrong region because the renderer caps its canvas; fixed by using the real canvas scale. The first Wren review sheets were blank at zoom; Wren was re-reviewed (round 2, closed eyes clean).
- LI3, LI4, LI6 on the final candidate, two clean runs each: all rows PASS both runs (LI3 nine cases, LI4 six cases, LI6 keyboard import, 390, 768, 1440, hidden tab, teardown).
  - Earlier attempts the same morning are kept: LI3 member and look failed twice (static not visible within one frame) while my rig builds and Chromium reviews ran on the same machine, LI4 then sampled only 19 frames in 10 s (against 2,400 on the clean runs) and LI6 failed at every width. LI3 did not reproduce in five further runs; no code was changed for it. LI6 was a real driver fault: the settings sections became controlled `details` elements that re-close when opened through the DOM; the driver now clicks them open.
- LI1, two 60 s runs, desktop 1440x844: 14,369 and 14,366 frames (4.2 ms cadence), maximum interval 33.4 ms in both, one interval over 33.34 ms each: FAIL by 0.06 ms. Earlier misses (35.3, 120.1, 48.3 and 51.8, 29.3 ms) stay recorded. Floor unchanged. The laptop run is unmeasured (no laptop).
- LI2, served network capture on the staged build: initial load is the main bundle plus 38 lazy chunks, none with renderer or rig-schema code; on mount three more chunks load (28,252, 15,400 and 26,580 B), the last holding the renderer and rig schema; the canvas mounts; 0 failed requests. PASS.
- Showcase: the live canvas follows the speaker on all three rigs, never more than one. Entry states: `cleanup --purge-sprites` (product `remove-story`) gives the cold state, `cache save|restore` and `prepare --restore-cache` the pre-rendered one; restore copies set folders only, because a rig reference carries the base art's `?t=` URL and a replaced `neutral.png` fails closed.
- Owed: Sol-bridge calibration (the opencode login, see plan 33), real streamed mouth on a model, LI1 laptop.

## Gate record: supported OpenCode harness transport (2026-10-13, no model, no GPU, LIST)

- Place: `C:\dev\so-build-harness-auth`, branch `v2.8-build-harness-auth`, base `52e051f3`. Source: plans 33 and 36 (the Sol bridge was blocked on an expired OpenCode login the plugin could not refresh) and plan 40. No Sol, DeepSeek, Artemis or TypeSafe call, no GPU, no lane, no ST, no staging, no install, no change to the owner's OpenCode settings or sign-in. No credential file was read or printed.
- Cause of the old failure: the plugin copied `~/.local/share/opencode/auth.json` into an owned home and judged freshness from its `expires`; OpenCode v2 does not rewrite that file (it renews inside its own service), so a working `opencode run` looked "expired" to the plugin.
- Chosen interface (V2 docs only): OpenCode's own client library `@opencode/client` 2.0.28 (pinned) and its Node `Service` (`discover`, `ensure`, `headers`) against the shared background service, one session per call: client guide (https://opencode.ai/v2/docs/build/client: Promise client, `event.subscribe`, local background service), API reference (https://opencode.ai/v2/docs/api: `session`, `message`, `agent`, `mcp`, `integration`, `model`, `debug.location`), config (project `opencode.json` discovered from the session's directory), agents (`system`, ordered `permissions`), permissions (last match wins, `*` deny hides tools), MCP servers (`mcp.servers`, `codemode: false` for native tools, `<server>_<tool>` names), attachments (`data:` URIs; PNG, JPEG, GIF, WebP), troubleshooting (`opencode service`, no edits of service files). The CLI `opencode api` was rejected (a data: image exceeds the Windows command-line limit) and so was reading the service registration (it holds the service's own secret): the client library does discovery and pairing internally.
- Auth: the plugin never reads, copies or refreshes an opencode login. Sign-in is read from the service's `integration` connections: none or API-key-only is `unpaired`, `needs_auth` is `expired`, a refused pairing says `opencode service restart`, a missing client library says `npm run plugins:install`. Each is a status row (`loginState`, `loginAction`, `loginProblem`), a "(sign-in expired)" / "(log in first)" / "(setup needed)" label in Models per task, and the wizard's refusal text. A stopped service is `unchecked` and starts on the first call; status never starts it; the plugin accepts any 2.x service and never replaces one.
- Isolation without `--pure`: the system text and a deny-everything agent live in an `opencode.json` in the plugin's own directory (text: `<tmpRoot>/opencode-loc/text-<hash>`, kept; wizard: one per session, evicted and deleted). The agent is read back before any prompt and the call is refused unless every tool is denied (measured on OpenCode 2.0.6: a fresh directory answers AgentNotFound for about 0.4 s while it loads, so the read retries for up to 8 s and then fails closed). Wizard: one native MCP server (the existing shim) with `so_*` allowed; a foreign tool event, a tool in the stored messages or a permission request ends the session as refused.
- Built: `opencodeTransport.mjs` (new), `errors.mjs` (new), `agentBridge.mjs` (run seam), `index.mjs` (opencode path, no login file, no warm-up route, images, async status), plugin 2.0.0. Kept: gate (2 per harness, one per user and role, queue limit, busy), timeouts, cancel, owned directories with sweep, tools off, default model `openai/gpt-6.1-sol`, author-confirmed provisioning, read-only Ask. Claude and Codex are unchanged. Vision: up to 4 images, 8 MB each, 20 MB in all, bytes sniffed, only to a model whose listing has image input (`/status` per model `image`), carried by `/complete`, `/agent/open`, `HarnessRequest.images`, `BridgeOpenInput.images`, `HarnessTarget.images`. Cleanup: session interrupted then removed, location evicted, directory removed, sessions from a dead plugin process removed at start (title `so-harness <pid> �c`, metadata owner), text directories unused for a week removed. Installer: `plugins:install` runs `npm install` in the plugin's own folder for the pinned client (`--skip-deps`; ST untouched).
- Verified without a model: a private, credential-free `opencode serve` 2.0.6 with its own empty home (`opencode.isolated.test.mjs`, `SO_OPENCODE_ISOLATED=1`): sign-in `unpaired`, config discovery and fail-closed agent, the real shim reaching the plugin's channel through OpenCode's MCP stdio (`codemode: false`), eviction, orphan sweep, and the real failure event (`provider.no-route`, no credentials exist there) through create, events, prompt, terminal and removal. The 2.0.6 OpenAPI is a subset of the V2 docs; every operation used exists in both. The client 2.0.28 works against the 2.0.6 server. After a real `npm install` in a synthetic plugin folder the same test passes with the client resolved from the plugin folder.
- Commands: `npm run test:plugin`: `# tests 264, # pass 260, # fail 0, # skipped 4` (the skips include the two `HARNESS_LIVE` tests and the isolated test without its flag). With `SO_OPENCODE_ISOLATED=1 SO_OPENCODE_CLIENT_DIR=<folder with the client>`: `opencode.isolated.test.mjs` pass 1, fail 0 (11 s), twice (client from a temp folder and from the installed plugin folder). `node --test scripts/lib/pluginInstall.test.mjs`: 11 pass. `npx tsc --noEmit -p .` clean. Jest on the changed seams (harness, harnessBridge, bridge, agentHost, harnessRouting, faultMatrix, lazyHarness, architecture, pluginVersionCheck, codeHealth): all pass. `npm run docs:guide` and `npm run docs:settings`: `guide: 32 pages, 1 images`; only `docs/guide/setup/harness.md` and its bundle `src/guide/pages.generated.ts` changed.
- `npm run gates:quick`: typecheck, typecheck:test, lint (changed) and jest green on the second run (688 suites); the first run failed `codeHealth.guard` S5 on five new over-long lines (wrapped) and lint (changed); the second run is green for typecheck, typecheck:test, lint (changed) and jest. Its `defect replay (--cached)` step fails on this fresh worktree before running a defect: with no replay cache every one of 4,423 files counts as changed and `spawnSync` of `jest --listTests --findRelatedTests` fails with ENAMETOOLONG (reproduced with a debug copy of the script). `node scripts/suite/defect-replay.mjs --full` was run once with the machine loaded by other agents: baseline green over the whole jest suite (7950 tests, 403.3 s), then 16 of 32 defects KILLED, 0 SURVIVED, the rest TIMEOUT at 600 s each and the 30-minute cap ended it. Recorded as incomplete, not green.
- Deviations: pinned client 2.0.28 while the owner's CLI is 2.0.6 (shapes used are in both); the plugin folder gains a 57 MB `node_modules` (the client's `effect` dependency); each wizard session adds an OpenCode project row for its temp directory (no API removes it); which credential OpenCode uses when both a subscription and a key exist is OpenCode's choice (`opencode auth switch`), the status shows only the credential kinds; the owner's global OpenCode instructions or MCP servers still load in our sessions (tools stay denied).
- Deferred, owner and model needed (not claimed): a real Ask answer, a real wizard tool call (the `so_*` names exposed to the model with `codemode: false`, `session.status` retry shape with an auth action) and a real vision request, all on `openai/gpt-6.1-sol`, after the owner signs in with `opencode auth login` if the status says so. Then plan 33 CL LLM leg and M18/M19/M20 recipes, plan 36 LI5 calibration. Parent: full `npm run gates`, Storybook (`MemoryModelGroup` label), staging, `npm run plugins:install -- --with harness`, ST restart.

## Gate record: detector cross-check of vision landmarks (harvest item 5, 2026-10-14, LIST)

- Branch `v2.8-landmark-check` from master `ec920fbe`. Source: `C:\dev\st-extensions-research\animation-second-look-2026-10-14.md` item 5. Not merged, pushed, staged or installed into ST. No Sol, Artemis, judge, GPU, ComfyUI or lane use.
- Licence gate (before any download): code `github.com/hysts/anime-face-detector` MIT (vendored mmpose/mmdet/mmcv parts Apache-2.0); weights MIT on their Hugging Face cards (`hysts/anime-face-detector-yolov3`, `hysts/anime-face-detector-hrnetv2`, `license: mit`; same bytes as the v0.0.1 release `.pth`). Accepted, downloaded.
- Downloaded (no torch install: the existing ComfyUI venv already has torch 2.12.1+cu130, torchvision, opencv-headless, safetensors):
  - `C:\dev\models\anime-face-detector\yolov3.safetensors` 246,354,512 B, sha256 `23bbc708146bcbc1c910f00fe152adbc70d7658d875a0121eaf4ee61d978b2c4`;
  - `C:\dev\models\anime-face-detector\hrnetv2.safetensors` 38,917,560 B, sha256 `e71271376406a743c01528a0460637fcc06e72aeeea583f85007cc72dc8b7a4a`;
  - `anime_face_detector-0.1.0-py3-none-any.whl` 68,626 B, sha256 `9a6a8c13…7692` (matches PyPI), installed `--no-deps` into a thin venv `C:\dev\tools\anime-face-detector\venv` whose `zz-comfy-torch.pth` reads the ComfyUI venv's site-packages (nothing written there). C: had 174 GB free.
- Runtime: `scripts/local/landmarkServer.py` on 127.0.0.1:8096 only (refuses other binds), `CUDA_VISIBLE_DEVICES=""`, `HF_HUB_OFFLINE=1`, `device="cpu"`; `scripts/local/landmarks.mjs plan|verify|start|stop|status|check`. Tray: "Face landmark check (anime-face-detector)" in `C:\dev\tray\items\story-orchestrator.json` (status OK, 66 entries; its commands run from `C:\dev\story-orchestrator`, so they work after merge). Media plugin `/landmarks` + `/landmarks/status` forward base64 PNG only, loopback-only target (`landmarkUrl` in config.json), unavailable = `{ok:false, reason}`, never an error status.
- Thresholds, predeclared before any test or real run (`CROSS_CHECK_LIMITS`), unit = detector face width W = |p0 − p4| (jaw points at eye level):
  - eyes: each eye contour centre vs the detector's 6-point eye centre > 0.15 W; both off but each within 0.15 W of the other eye = "swapped";
  - mouth: centre of our 4 mouth points vs points 24–27 > 0.15 W;
  - jaw: chin vs point 2 > 0.15 W, or face oval width 2·rx / W outside [0.6, 1.6];
  - face: our oval centre outside the chosen detector box;
  - skip (status note, no warning): no face with box score ≥ 0.5, W < 8 px, image size differs, a feature whose mean point score < 0.3 (listed as unsure), detector unreachable or malformed.
- Wiring: `synthesis/landmarkCheck.ts` (pure), `synthesis/detectorCheck.ts`, `stHost/landmarkDetector.ts` (lazy import from `synthesis/host.ts`), `synthesizeCheckedHead` (RunGuard re-checked after the check await; `synthesizeHead` unwraps it), `LookRebuildReview.rigCheck`, `ChangedLookReview` warning slot (`[data-so="landmark-check"]`, `role="alert"` only on disagreement). Never blocks accept. Feature row `landmark-cross-check`, guide paragraph, `docs:guide`, `docs:settings`.
- Real detector run (CPU): model load 11.4 s; a 600 x 716 bust crop of the repo's TADNE demo image: 1 face in ~0.9 s; drawn points confirm the mapping (0–4 jaw, 2 chin, 11–16 image-left eye, 17–22 image-right eye, 23 nose, 24 left / 25 top / 26 right / 27 bottom mouth).
- Tests: `landmarkCheck.test.ts` 11 (agree, under-limit shift, shifted eye, swapped eyes, mouth off, chin/oval/face, unsure/missing/mismatch skips, answer shape, checker unavailable/throw/abort, synthesis verdict + lapse during check); `lookRebuild.test.ts` +1; `landmarkRoutes.test.mjs` 3; `landmarkConfig.test.mjs` 3; stories `ReviewWithLandmarkWarning`, `ReviewWithDetectorSkipped`. Ownership census row renamed to `synthesizeCheckedHead`; error-copy +3 probe rows.
- Gates:
  - `npm run test:replay` before work: 32 of 32 killed.
  - `npm run gates:quick` run 1 RED (S5 long lines, ownership row, error-copy rows), fixed; run 2 green in 158.2 s.
  - `npm run gates -- --no-storybook --jobs=2`: all green in 350.2 s; jest 715 suites / 8,224 tests (1 skipped), replay 32/32, plugin 277 (273 pass, 4 skipped, 0 fail). Main bundle 1,264,849 B; check copy only in lazy chunks.
  - Staged Storybook (`%TEMP%\so-sb-landmark`, `npm run test-storybook:ci`): 135 suites / 811 tests passed (run 1); staged copy removed after.
- Not claimed: a real Sol landmark answer compared with the detector (no vision call made), threshold quality on campaign art, the plugin route through a running ST (plugin not installed), browser acceptance of the warning.

## Gate record: frame-loop hygiene, drawn eyes/mouth, viseme mouth (2026-10-14, branch `v2.8-live-head-harvest`)

- Source: owner-approved harvest items 1 and 3 (`C:\dev\st-extensions-research\animation-second-look-2026-10-14.md`), upstream mesh-avatar-studio `26243f9` (`packages/runtime/src/engine/sprites.js`, read only, not run). MIT header kept in `src/sprites/liveHead/drawn.ts`; `THIRD-PARTY-NOTICES.md` regenerated. Floors LI1-LI6 unchanged, none retuned. No owner ST, lane 0, model, judge, ComfyUI or GPU-model use; no downloads.
- Commits: `e2d14017` frame loop; `8437c32a` drawn layer; `2b8a95c5` merge master (`b4a1a1d7`, frames-lipsync); `2d05bc14` viseme hookup; `19bba90c` notices; `a88ddc8b`, `9ca6858f` lint and a11y fixes; `9bfcf8c2` LI1 harness fix.
- Frame loop (item A): `mount.ts` `frameGate` caps drawing at min(display, 60 fps) (2 ms slack; direct ticks after mount or visibility still draw at once). `headDriver.ts` `HeadDriver` writes one reused `HeadParameters`, hashes the seed once, the blink gap once per 8 s cycle and the expression once per label; `drivers.ts` untouched. `geometry.ts` `vertexWeights`/`deformWeighted` precompute every Gaussian and band per rest vertex for the base and eyeball layers. `renderer.ts` re-uploads a layer only when its inputs changed (deform inputs for base/ball, plus lids for lash/low/crease).
  - Equivalence: `test/goldens/liveHead/frame-loop.json` was recorded from the unchanged code (driveHead + old renderer, 5 arms x 101 frames, per-draw digest of positions, texture and uniforms on `test/support/fakeWebGl.ts`); the new path matches it, and `deformWeighted` is byte-identical to `deformInto` (`geometryEquivalence.test.ts`). `HeadDriver` equals `driveHead` over 4 seeds x 811 clocks with label, motion and switch masks.
  - Allocation/upload tests (`frameLoop.test.ts`): one parameter object for 4,000 frames, `fnv1a` 3 calls in 16 s, `expressionHead` once per label; steady reduced motion 9 uploads in 125 frames (first frame only); lid-only change 6 uploads; the cap draws at most 60/s at 240/144/120/60 Hz and 30/s at 30 Hz.
  - Bench (`node scripts/live-head/frame-bench.mjs`, synthetic rig, no-op GL, 20,000 frames after 3,000 warm, 1 MB semispace, `--trace-gc`): before (`--root` master `ec920fbe`, `--legacy`): motion **1,851 scavenges / 10k frames** (about 185 KB per frame), **9 uploads/frame**, 1.77 ms/frame; reduced 0 scavenges, 9 uploads/frame, 0.14 ms. After: motion **124-185 scavenges / 10k frames** (two runs, JIT variance), 9 uploads/frame, 0.36-0.43 ms; reduced **0 uploads/frame**, 0.009 ms. The driver allocates nothing; the remaining garbage is boxed doubles in the six lid layers (V8 inlining), so the frame is not allocation-free.
- Drawn layer (item B): `drawn.ts` cuts the look's neutral `blink`/`talk`/`talk2` frames (plan 19 patches, full size) to the bust with the accepted head box (`visualSources[folder].box`; legacy rigs need same-size frames) into `eyes_closed_0/1` (eye ROI plus margin) and `mouth_talk`/`mouth_talk2` (bounding box of the patch near the rig mouth), premultiplied. Refusals per sprite: size or box mismatch, eye not covered, no mouth patch, ring drift over 20 levels (upstream ring rule) against the source art; the rest stay. `DrawnDirector` ports the upstream selection: closed drawing below eyeOpen 0.3 with a 60 ms cross-fade, layered eyes hidden only once it is solid; mouth drawing from 0.16 open (fade 0.04), talk when wide `a` else talk2, upstream squash (0.5-1.1 of the drawing's openness) and `e`/`u` widths; the shader mouth stays shut while drawn mouths exist; jaw deformation kept. Sprite meshes follow the head deformation; the mouth mesh squashes its inner ellipse first. Lineage key = sha256 of `{recipe live-head-drawn-frames v1, art sha256, box, per-frame path and sha256}`; frames are hashed from the bytes that are decoded. `sprites.liveHeadFrames` (on by default, device setting, `#so-live-head-frames`); absent or refused frames keep the mesh-only head (`drawn.test.ts` asserts identical draws). Ownership: `prepareDrawn` checks after every await (census row `checked`); `attachHead` re-checks before the renderer exists.
  - Covered faults: iris fragments and lash-end specks under closed eyes (closed state draws the drawn eyes and skips all eight eye layers; checked on synthetic rig renders, before/after in Storybook `Sprites/LiveHeadDrawn`). **Not fixed: bean iris at gaze +-1.** Plan 19 has no open-eye drawing; a plateau gaze warp was tried, looked worse on the synthetic rig and was reverted. Drawn expression variants (eyes_sad/surprise, mouth_angry/sad) are not ported: plan 19 frames have no such files.
- Viseme mouth: after merging master, `LiveHead` calls `activity.visemes()` when the mouth is on and, while the member streams with motion on, writes `StreamActivity.mouth(name)` into the reused parameters with `visemeMouth` (same values as `withVisemeMouth`, in place); `undefined` (chunk not loaded) keeps the flap. The drawn mouth follows the blended `mouthOpen`/`mouthForm`. Tests in `frameLoop.test.ts`; story `LiveHeadWithFrames` waits for a viseme sample.
- LI rows, lane 30 only (`SO_LANE_OFFLINE=1 st-lanes seed 30 --slim`, `restore-model 30`, `no-model 30`, `start 30 --headed`, `so-live-head-check.mts --candidate`, 1440x844), DESKTOP i9-9900, ANGLE RTX 3090 D3D11, DPR 1, served main 1,264,929 B (`d3121df526d7`); model requests 0 and cleanup clean in every run; lane stopped.
  - **Harness finding:** the lane copy carries ST `reduced_motion: true`, and LI1 did not switch it off, so LI1 sampled a frozen head (`uploads: 0` in runs `harvest1-3`). Earlier LI1 records ran on the same kind of seed and probably measured a static head too (not re-verified). LI1 now forces motion on and requires uploads > 0; this is harness validity, not a floor change. The probe also keeps the last uploaded mesh per buffer, so LI4 still sees one vector when uploads are skipped, and records rAF ticks, `longtask`/`long-animation-frame` entries and per-spike attribution (`LI1-spikes.json`).
  - `--row all` x3 (`harvest1-3`): LI3 9/9 and LI6 6/6 every run; LI4 6/6 in runs 2-3 (run 1 0/6 on the old probe); LI1 FAIL each (frozen head, above).
  - LI1 with motion, alternating builds: after `a1` PASS (3,603 frames, p50 16.7, max 29.2 ms), `a2` FAIL (max 54.4: a 46 ms page tick gap, one 51 ms long-animation-frame with no script), `a4` FAIL (max 530.6, 4 drops, 3 long tasks), `a5` FAIL (max 83.6, 2 drops); `a3` stopped on a popup intercepting a click (harness, cleanup clean). Before (master build through the same route): `b1` PASS (14,387 frames, p50 4.2, max 20.8), `b2` PASS (max 20.9), `b3` FAIL (max 44.8, 4 drops, rAF p50 8 ms under load). Every spike is `no-tick`: the page delivered no frame, with no script time in the long-animation-frame entries. Other agents shared the machine and load varied between runs; the runs neither show the cap fixing nor causing LI1 misses. One mechanism the cap can add: a skipped tick followed by a stall (12.5 + 29.2 = 41.7 ms in `harvest2`). **LI1 not accepted**; laptop row still unmeasured.
- Gates:
  - `npm run test:replay` (fresh worktree): 32 of 32 killed.
  - `npm run gates:quick` (item A): green in 147.6 s.
  - `npm run gates -- --no-storybook --jobs 2`: run 1 RED (lint, one 205-char story line); run 2 green in 179.7 s; final run green in 322.6 s: jest 721 suites / 8,292 tests (1 skipped), replay 32/32, test:debug 1,263 pass, test:release 123 pass, plugin 273 pass, 0 fail.
  - Staged Storybook (`%TEMP%\so-sb-lhh`, `npm run test-storybook:ci`): run 1 RED, 2 tests in `Workspace/DevicePreferences` (the new device row had no label, a11y `label`), fixed in `9ca6858f`; run 2 136 suites / 814 tests passed, including `Sprites/LiveHeadDrawn`. Copy removed.
  - Main bundle **1,264,929 B / 1,300,000 B** (master build 1,264,838 B, +91 B); drawn, renderer and driver code stay in lazy chunks (`live-head-drawn-frames` only in `1151.index.js`).
- Owed: LI1 x2 with motion on a quiet machine and on the laptop; an open-eye fix for the gaze +-1 iris; drawn frames on real campaign looks (needs plan 19 frames for a rigged look); a real Artemis stream through the viseme path.

## Gate record: mesh mouth cap, drawn mouth shapes, mouth config (2026-10-14, branch `v2.8-mouth-cap`, LIST)

- Source: owner saw broken lips on the showcase live heads (Garrick has no drawn mouth frames, Pim's were all refused). Cause: without a drawn mouth the shader paints a cavity and the jaw drops from the full viseme openness (0 to 0.9, form -0.85 to 0.9) over closed-mouth art, faster than the old flap. Upstream mesh-avatar-studio `26243f9` has no cap either: without sprites it feeds the full `mouthOpen`/`mouthForm` to its shader mouth (`createMeshAvatar.js`, `renderer.js`) and only smooths with springs (`motion.js`, attack about 33 ms, release about 45 ms). No model, GPU, ComfyUI, lane or ST use; not merged, pushed, staged or installed.
- Commits: `109407a8` cap and degenerate-mouth guard; `cbd966f7` mouth shapes and `MouthConfig`; then this record.

Mesh mouth cap (`DEFAULT_MOUTH_CONFIG.mesh`, also exported as `MESH_MOUTH_CAP`, `src/sprites/liveHead/meshMouth.ts`):

- `openGain 0.18`, `openMax 0.15`: openness becomes `min(0.15, 0.18 x open)`. aa (0.9) reaches 0.15, E 0.11, I 0.09, consonants 0.03 to 0.06. At 0.15 the shader cavity is about 4 px on a 26 px mouth-to-chin gap and the teeth term (starts at 0.25) never shows, so the lips part instead of smearing; vowels still read larger than consonants.
- `formGain 0.2`, `formMax 0.12`: the width factor stays within 0.59 to 0.65 of the half length (uncapped 0.46 to 0.78); the expression's static form (joy -0.4) becomes -0.08.
- `attackMs 35`, `releaseMs 50`, `settle 0.002`: exponential smoothing per frame, close to upstream's springs; it settles exactly, so a resting mouth stops re-uploading.
- Behaviour matrix (`meshMouthMode`):
  - drawn mouth sprite active for the look: `full`, unchanged (drawn shape covers the lips; shader cavity off; jaw follows full openness);
  - no frames, only blink frames, mouth frames refused, or `sprites.liveHeadFrames` off: `capped`;
  - degenerate mouth region: `still` (mouthOpen and mouthForm 0; the drawn mouth is hidden too);
  - reduced motion, story motion off or Mouth movement off: the driver already gives 0 and the cap holds 0 with no re-upload (`meshMouth.test.ts`).
- Degenerate guard (`mouthRegionProblem`): non-finite landmarks, mouth or area width under 2 px, `area.ry <= 0`, or a mouth corner or area centre outside the head oval. Quiet author note only: the import notice in `LiveHeadAuthor` and a caption in `RigPreview` (Studio changed-look review) say "The rig's mouth ... Its mouth stays still."; runtime writes `data-live-head-mouth` and a `log.debug`. Nothing reaches player surfaces. The synthetic rig passes.
- Goldens: `test/goldens/liveHead/mouth-curve.json` (new; scripted reply "Hello there! How are you today? Oh, we should go." at 40 ms per character, 141 samples: full peak 0.9, capped peak 0.15, the largest capped step under a quarter of the full one). `test/goldens/liveHead/frame-loop.json` re-recorded on purpose: arms `idle` and `quiet` are byte-identical; `joyStream`, `surprise` and `reduced` differ in every frame because the `uMouthState` uniform now carries the capped form (closed-mouth pixels are unchanged: the shader ignores form below open 0.01) and, while streaming, the capped openness.

Drawn mouth shapes (item 2):

- Vocabulary (`src/sprites/frameKeys.ts`): `blink`, `talk`, `talk2`, plus `mouth_o` (rounded) and `mouth_wide` (spread). Files `<label>.mouth_o.png` and `<label>.mouth_wide.png` in `anim-<set>`; drawn sprites `mouth_o` and `mouth_wide`. Not added: `mouth_half` (that is `talk2`) and `mouth_mbp` (PP and sil have openness 0, so the closed artwork already is that shape).
- Why this set: lipsync-en emits 15 visemes; with `openMin 0.16` FF, SS, PP and sil stay closed. The rest fall into four groups by form and openness: open (aa) `talk`; half (E, DD, kk, TH, nn, CH) `talk2`; rounded (O, U, RR) `mouth_o`; spread (I, which "ee" maps to) `mouth_wide`. Upstream's sample uses the same four drawings (`mouth_a`, `mouth_a_half`, `mouth_o`, `mouth_i`).
- Mapping (`DEFAULT_MOUTH_CONFIG.chains`, first available wins; hysteresis and the 60 ms minimum hold unchanged): a `talk, talk2, mouth_o, mouth_wide`; aHalf `talk2, talk, mouth_wide, mouth_o`; e `talk2, mouth_wide, talk, mouth_o`; i `mouth_wide, talk2, talk, mouth_o`; o `mouth_o, talk, talk2, mouth_wide`; u `mouth_o, talk2, talk, mouth_wide`. No drawn mouth at all falls to the capped mesh. With only talk and talk2 the sprite stage behaves as before; the live head's `o` now falls back to `talk` (was `talk2`), matching the sprite stage. Drawn refs: talk 0.9, talk2 0.55 (0.65 for e), mouth_o 0.75, mouth_wide 0.55; widths e 1.06, u 0.78 (upstream values).
- Pipeline: `EditKind` gains both kinds; Qwen edit prompts in `editInstruction`; same mouth region, mask import (`MASK_IMPORT_KINDS`), frame QA and coverage check; Studio Edit options "Mouth rounded frame (oh)" and "Mouth wide frame (ee)"; the media plugin's `labelId` accepts them (needs `npm run plugins:install` and an ST restart when staged). Cache: `editKey` and `renderKey` already include the kind; the drawn lineage lists every frame key and `DRAWN_RECIPE` is version 2.
- Docs: `docs/guide/setup/sprites.md`, `settingsCopy` for `sprites.mouth` and `sprites.liveHeadFrames`; `npm run docs:guide` and `npm run docs:settings` (content changed only in `settings-reference.md` and the guide bundle).

Mouth config for the showcase lab (coordinator request):

- `src/sprites/mouthConfig.ts` exports `MouthConfig`, `DEFAULT_MOUTH_CONFIG` (the product default) and `mouthConfig(patch, base)`. Pure functions take it as a last argument defaulting to the product value: `classifyVowel`, `mouthShape`, `shapeFrame`, `MouthStepper`, `withVisemeMouth`/`visemeMouth` (form share), `TextMouth`/`createTextMouth` (viseme table, timing), `meshMouthMode`/`MeshMouth` (style, cap, smoothing), `DrawnDirector` (refs, widths, fade, hold, crossfade), `HeadRenderer`. Components take an optional `mouthConfig` prop (`LiveHead`, `AnimatedFace`); `StreamActivity` takes one in its constructor. No flag and no second code path.
- Parameters: amplitude (`mesh` and `hybrid` gains and maxima), open threshold (`openMin`), hysteresis (`openPad`, `vowelPad`, `widePad`, `twoFrameOpen`/`twoFrameClose`), minimum hold (`holdMs` for the sprite stage, `drawn.holdMs` for the live head, 0 by default as before), smoothing (`attackMs`, `releaseMs`), grouping and mapping (`regions`, `visemes`, `chains`), timing source (`timing`: `word` default, `syllable` one cue per vowel nucleus, `character` one cue per letter at the measured character rate), style (`auto` default; `mesh` ignores drawn mouths; `drawn` keeps the mesh mouth still under a drawn frame; `hybrid` moves it slightly under one, gain 0.08 max 0.06), crossfade between drawn frames (`drawn.crossfadeMs`, 0 by default, instant as before). The sprite stage has no crossfade (one img element).
- Tests stay on the default; `mouthConfig.test.ts` checks that each parameter is honoured.

Tests: `meshMouth.test.ts` (12: cap math, modes, smoothing, guard cases, renderer capped vs full vs still, reduced motion and Mouth off, mouth-curve golden and its properties); `mount.test.ts` +1 (mouth report); `drawn.test.ts` (five-frame cut, guard on the new frames, lineage with the new frames and v2, per-shape choice with all four mouths, fallback to nearest and to mesh); `mouthShape.test.ts` +3 (mapping, fallbacks, hold across new frames); `animation.test.ts`, `sprites.test.ts` (file names); `mouthConfig.test.ts` (5); `media.test.mjs` +1 (labels); `so-sprite-builder.test.mts` (kinds). Stories: `Sprites/LiveHeadDrawn` `MeshOnlyMouthCapped` (asserts `data-live-head-mouth="capped"` with no frames), `LiveHeadWithMouthShapes` (five synthetic frames, `full`), `MeshVersusDrawn` captions show the mouth mode, plus two poses; `Sprites/LiveHeadAuthor` `ImportWithStillMouth`.

Ready to run (3090 block, owner's OK; not run):

- Edits: 3 busts x 5 neutral frames = **15 Qwen edits at most**, fewer where `anim-default/neutral.<kind>` already exists (the command skips complete rows). At the measured 22.3 s per head edit on the 3090 (plan 33) that is about **6 min of rendering**, plus model load and saves: **about 10 min** in all.
- Commands, lane 30 (never lane 0), from `C:\dev\story-orchestrator` after staging this build and `npm run plugins:install`:
  1. `node scripts/local/cli.mjs start-comfy`
  2. `node scripts/debug/st-lanes.mts start 30 --headed`
  3. `node scripts/debug/st-lanes.mts run 30 -- scripts/debug/so-showcase.mts prepare --restore-cache --no-render`
  4. for each of `"SO-Show Wren"`, `"SO-Show Garrick"`, `"SO-Show Pim"`: `node scripts/debug/st-lanes.mts run 30 -- scripts/debug/so-sprite-builder.mts frames --character "<name>" --set default --label neutral --kinds blink,talk,talk2,mouth_o,mouth_wide` (head box from the showcase builder settings; `--set` must equal the actor's set, `default` for the showcase's root pack)
  5. `node scripts/debug/st-lanes.mts run 30 -- scripts/debug/so-showcase.mts cache save`
  6. check: `so-showcase.mts shot` per speaker, then `data-live-head-drawn` and `data-live-head-mouth` on the canvas; a refused frame is logged ("Live head drawn frames partly refused").
- Risk: Pim's earlier frames were refused by the drawn-layer guard; the new frames pass through the same guard, so a refusal is possible, and that bust then stays on the capped mesh.

Gates:

- `npm run test:replay` (fresh worktree, before work): 32 of 32 killed.
- `npm run gates:quick` after the cap: green in 136.0 s. After the shapes and config: run 1 RED (`codeHealth.guard` S8, dead export `MOUTH_CHAINS`), removed; the guard then passes.
- `npm run gates -- --no-storybook --jobs 2`: all green in 547.5 s; jest 723 suites / 8,317 tests (1 skipped), replay 32/32, test:debug 1,268 pass, test:release 123 pass, plugin 274 pass (4 skipped), 0 fail. Storybook skipped there and run staged below.
- Staged Storybook (`%TEMP%\so-sb-mouthcap`, `npm run test-storybook:ci`): run 1 RED, 1 test, `Workspace/Shell › Desktop` ("Axe is already running", a11y runner race in a story this branch does not touch); run 2 136 suites / 817 tests passed, including `Sprites/LiveHeadDrawn` (`MeshOnlyMouthCapped`, `LiveHeadWithMouthShapes`) and `Sprites/LiveHeadAuthor` (`ImportWithStillMouth`). Copy removed.
- Main bundle **1,265,343 B / 1,300,000 B** (harvest build 1,264,929 B, +414 B: `frameKeys` and `mouthConfig` ride with the sprite stage's static imports; renderer, drawn layer and lip-sync stay in lazy chunks).
- Not claimed: how the capped mouth looks on the three real showcase busts (needs a browser on the showcase lane; no GPU needed for that, only for new frames), any real mouth_o / mouth_wide frame (render job above), a real Artemis stream through the cap.

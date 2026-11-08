# v3.0 46: guide site review + showcase (demos, diagrams)

Owner 2026-11-08: the GitHub Pages guide (https://maxipawlowski.github.io/story-orchestrator/) should be current and show
every visible piece of the project (UI kit, Play page, story sheet, HUD, inline timeline, in-chat elements, animated
characters, backgrounds, Studio, wizard), plus workflow explanations as Mermaid diagrams.

## Where it stands (checked 2026-11-08)

- Site: `npm run guide:site` (`scripts/docs/guide-site.mjs`) renders `docs/guide/**` to `.guide-site`;
  `.github/workflows/guide-pages.yml` deploys on push to master touching `docs/guide/**`, `docs/authoring/story-guide.md`,
  `src/guide/**`, `scripts/docs/**`. Last deploy 2026-11-02, green. Pages is public, build type workflow.
- Content: author fields are regenerated from the guide source (`npm run docs:guide`), so they track the code. The
  hand-written player and setup pages lag: last edited 2026-11-01; nothing on talk pacing, in-chat elements, live
  characters, the workspace dialog or backdrops; one image (`assets/settings-sections.png`).
- No diagrams, no demos. Storybook (199 suites, every UI part has a story) builds in CI (`test-storybook:ci`) but is not
  published. `docs/showcase.md` (Lantern Inn) is a lane recipe; its art lives outside the repo and is not publishable.

## Goals

1. **Accurate**: every page matches the current build; a stale page fails a check instead of drifting quietly.
2. **Show, don't tell**: each visible feature has a live demo or a recorded clip next to its text.
3. **Explain the machine**: Mermaid diagrams for the main flows, kept next to the code they describe.
4. **Safe to publish**: the repo and site are public. No Adolion campaign content, no secrets, no owner data, only
   synthetic or properly licensed art.

## Structure

- Home: what it is, a 30-second clip, links by role (Player, Author, Setup, How it works, Showcase).
- **Player**: playing, the Play page, story sheet, HUD, story card, inline timeline, in-chat elements, start pane, memory,
  troubleshooting. Each with a screenshot or clip.
- **Author**: unchanged generator for fields, plus Studio, wizard, Ask, talk pacing, stuck leads, minimum turns, backdrops.
- **Setup**: models, local controller, Vast/rented GPU (from the runbook), images, judge, GPU sharing.
- **How it works** (new): Mermaid diagrams.
- **Showcase** (new): live demos.

## Showcase sections (live where possible)

- **UI components**: publish the Storybook static build under `/ui/` (kit, Play page, story sheet, HUD, workspace,
  Studio, inline timeline, in-chat elements) with the ST dark/light/Celestial themes. Mocks only, no network.
- **Animated characters**: a standalone page running the live-head and pose code (`src/sprites/liveHead`, `AnimatedFace`)
  on synthetic, publishable art (new art made for this, licence recorded), with controls for speaking, emotion, gaze.
- **Backgrounds**: the plan 45 stage on sample images, effects, parallax with real depth maps, one or two generated loops
  (the lab artifact shows the target).
- **A short story, recorded**: a synthetic demo story (not Adolion, not the unpublished Lantern art) played on a lane
  with real generation; clips of a turn with talk pacing, a stuck lead, a swipe rollback, a scene change with backdrop.
- **Wizard and Studio**: short clips of a story built from a prompt, the graph editor, diagnostics.

## How it works: diagrams (Mermaid)

One per flow, sourced in `docs/guide/how/*.md` and checked against code names:

1. A turn end to end: player send → talk control chain → replies → `TurnBridge` → boundary commit (`BOUNDARY_STEPS`
   order) → effects → snapshot → UI.
2. Rollback: swipe/edit/delete → detectors → quarantine → replay.
3. Extraction off-path: scheduler → shared read → audits → apply at the next boundary.
4. Memory tiers and held secrets: what reaches each member, the resting view, copier filtering.
5. Talk pacing: profiles, budget, spotlight, address, reaction, yields.
6. Lore: story books per chat, checkpoint gating (scan mode), curator propose → apply.
7. Images and GPU: queue, broker, controller, ComfyUI, backdrops (depth, loops).
8. Models and routes: pass roles, harness bridge, judge plugin, local controller vs Vast box.
9. Wizard: interview → stages → provisioning cards → validation → save.

Rendering: Mermaid in the site generator (pinned client script, or pre-rendered SVG at build if CI allows); dark/light
themes; each diagram lists the source files it describes, and a check fails when a named file or symbol disappears.

## Work packages (parallel, disjoint)

- **W1 Audit**: read every published page against the current build (live check on a lane in player and author view);
  list stale/wrong/missing per page; fix text. Output: audit table in this plan, fixes merged.
- **W2 Site engine**: Mermaid support, a Showcase section, embedding Storybook under `/ui/`, clip/image pipeline
  (compressed WebM/GIF, size budget), link checker, deploy workflow paths updated.
- **W3 Diagrams**: the nine diagrams with source-symbol checks.
- **W4 Demos**: Storybook publish config, the animated-character page, the backdrop page (after plan 45 A/B land),
  synthetic art.
- **W5 Recordings**: synthetic demo story + lane recording script (`scripts/debug/`), reproducible clips; rerun on
  demand when UI changes.
- **W6 Guards**: a privacy scan over the built site (campaign names list from the private repo checked locally, never
  committed; secrets patterns; owner paths), screenshot freshness (each image records the build it came from), all in
  `guide-pages.yml` + `npm run gates` where cheap.

Order: W1, W2, W3 start at once; W4 after W2's Showcase shell; W5 after W4's demo story; W6 alongside W2. Each merges
with full gates (one at a time machine-wide) and deploys through the existing workflow.

## Floors (informational)

- 0 broken links, 0 privacy-scan hits, every Player/Author/Setup page reviewed against the build in the audit table.
- Site loads in < 3 s on a cold cache; each page ≤ 5 MB including media; Storybook under `/ui/` builds in CI.
- Every diagram's source check green.

## Owner decisions 2026-11-08

- Publish Storybook under `/ui/`: yes.
- Demo art: generate new synthetic, SFW art on the local ComfyUI (checkpoint licence recorded per image set).
- Examples are made as part of development: every feature (plans 45, 46 and later) ships a publishable synthetic example
  (story, art, clip or page) with its merge, instead of a separate recording pass. Adolion material stays private and
  is never used (public repo; the owner plays it fresh).

## Unresolved questions (superseded where answered above)

- Publish Storybook publicly under `/ui/`? (Recommended: yes, it holds only mocks.)
- Art for demos: new synthetic art generated locally (our ComfyUI, SFW, licence of the checkpoint recorded), or keep demos
  art-free (CSS/canvas only)?
- Recorded clips need real generation on a lane (local 3090 or Vast): run them after the playtest?
- Keep the site in English only (repo rule): yes.

## W4 Resume (paused 2026-11-08, owner usage limit)

Branch `v3.0-46-demos` (worktree `C:\dev\so-46-demos`), not merged; full `npm run gates` not run yet (`gates:quick` green).

Done:
- Demo story `test/showcase/demo/beacon.story.json` + 3 cards (Tobin, June, Wren), 4 scenes on the shared plan 45
  backdrops (`so-demo-<id>.jpg`): talk profiles per scene, stuck-lead ladder + `min_turns` (study), offers + codex,
  look change (June oilskin). Test `src/sprites/demoStory.test.ts`.
- Art (Qwen-Image-2512, Apache-2.0; licences appended to `docs/guide/assets/showcase/LICENSES.md`): 3 busts + June
  oilskin look, full-body sprites, 9 expression patches, 3 live stills. Rigs for all 4 looks (`showcase/animated-character/rigs`).
- `showcase/animated-character/` (real live-head code, `scripts/docs/demo-bundle.mjs`), `showcase/story-ui/` (Storybook links).
- `scripts/debug/so-demo-record.mts` (lanes only, refuses without `SO_LANE`), documented in `docs/showcase.md`. Not run:
  no model lane without the owner's 3090.

Next:
1. Poses: `python -I scripts/docs/demo-art.py poses` (6 renders, none made), then `publish`, `node scripts/docs/demo-rigs.mjs`
   is not needed again (busts unchanged).
2. After plan 45 B merges: merge master (LICENSES.md add/add: keep B's table, then the W4 section).
3. After W2 merges: check `mediaProblems` (sidecars carry build/licence/source) and the showcase index links
   (`../index.html`); after W1 merges: fill `<!-- showcase: live-characters -->` with `stills/<id>-live.webp` + page link,
   and link the story-ui page from the HUD/sheet/workspace/inline/in-chat placeholders.
4. Full `npm run gates` (one at a time machine-wide), merge, push. Extension bundle untouched (demo bundle is separate).
5. Clips: after the playtest, on the owner's go, `so-demo-record.mts prepare` + `record` on a model lane.

## Review 2026-11-08 (characters)

Owner: the animated characters "look horrible and broken, glitched" (no list given). Independent audit of the live head,
the demo page, the rigs and the art pipeline; second opinion from codex `gpt-6.1-sol` (read-only), once on frames and
contact sheets, once on the code and pipeline, both before seeing these findings. Capture: `demo-art` page served locally,
headless Chromium, 1280x900 at DPR 1 (video + 349 stage frames) and DPR 2 (face crops, 4 looks x 100 states: idle,
streamed line, 3 emotions + neutral with switch frames, gaze extremes, 6 gestures, gestures over an expression); Storybook
`sprites-livehead*` stories from the site build. Evidence (local, not committed): `.build/review-2026-11-08/` in this
worktree (`before/`, `after/`, contact sheets, eye-layer dumps, Sol replies).

Labels: **P** = product (`src/sprites`, real play), **D** = demo only (page, rig tooling, art, art script). Found by:
**C** = Claude, **S** = Sol, **C+S** = both independently. Ranked by how bad it looks.

Product:
- P1 **Eyes cut through by the rig's eye polygon** (C+S). Every frame: jagged white rim along the top of each iris, iris
  clipped to a hexagon when it moves, blank white eyes at gaze extremes, giggle/shy/blink collapse into smears. Evidence:
  eye-layer dump (ball layer = 6-point hexagon cutting through the eye; sclera and iris tops left in the lash layer or the
  base), face crops `neutral`, `gaze_*`, `g_giggle0`, `g_shy*`. Cause: `synthesis/layers.ts` splits the eye with the
  landmark contour as given; a detector or vision model gives 6-8 points inside the drawn eye, nothing refines them from
  pixels; masks are hard and the idle gaze wander (`gazeX` +-0.15) slides the iris every frame, painting sclera fill up to
  that polygon. Fix: `synthesis/eyeRefine.ts` grows each contour over sclera and iris pixels up to the lash line (never
  shrinks; leaves an eye it cannot grow alone); lash/lower-lid masks take their 1 px fringe so a moving lid leaves no
  outline; the iris slide fades out in the top 12-34% of the opening (`LID_SHADE`), where anime irises sit under the lid
  shadow. Growth stays above the landmark's lowest point (it leaked onto the cheek below the eye in a first pass). Rigs
  must be rebuilt to pick up the refined contour; old rigs keep the old cut.
- P2 **Talking barely shows** (C+S). Mesh mouth is capped at 15% open (`mouthConfig.mesh.openMax`), about 4 px on these
  busts, and the shader paints a procedural mouth over whatever is drawn there (June's teeth, Tobin's moustache). Not
  fixed: needs drawn mouth frames for the demo characters or an owner call on the cap. Open item.
- P3 **Vertical gaze overshoots** (C+S). Fixed 4.2 px travel with no vertical limit, 25% of a 17 px eye: white crescents,
  iris leaving the opening. Fix: travel = 10% of the opening height, at most the old 4.2 px (`gaze.ts` `gazeTravelY`);
  18% and 12% still doubled the iris under the lid shade on a downward look.
- P4 **Blush is a pink wash** (C+S). Radii 48x22/40x20 px whatever the head size: covers cheek to nose on a 512 px bust,
  tints Tobin's beard pink. Fix: radii follow eye spacing (`renderer.ts` `CHEEK_SIZE`).
- P5 **Brow angle tilts the whole brow band** (S, confirmed). `(x - brow.cx)` raised one brow and lowered the other.
  Fix: mirrored, both inner ends move together (`geometry.ts`, both deform paths).
- P6 **Expression switch during a fade snaps** (S, confirmed by reading). The interrupted fade restarted from the target
  that was barely on screen. Fix: start from the look that is mostly visible.
- P7 **Close shot rendered at DPR 1.5 at most** (C+S). Phones (DPR 3) get half the device resolution. Fix: cap 2.
- P8 Open: expressions are cut with the neutral eye geometry (S #5); a repaint that narrows the eyes blinks against the
  old contour (Tobin `angry_hold` shows boxed eye regions). Needs per-expression eye fitting or a repaint that keeps the
  eyes; demo prompts now keep them.
- P9 Open: gesture eye closures clamp at 0.5 (`MOTION_TUNE.eyeFloor`), so giggle/no/greet squint instead of closing (S).
  Kept: the floor hid broken closures; revisit after P1 on real art.
- P10 Open: while an expression texture shows, gestures drop their face tracks (happy + giggle loses the squint, S).
  Design: the texture owns the face. Same for "textured while loading" (S #16, a test asserts it).
- P11 Kept by design: the eye-hole fill leaves the eye region's border pixels in the base (S #9). Filling them (tried)
  breaks `a strand crossing the eye region keeps its own pixels...`, which guards against a cut rectangle in hair over
  the eye; the boxed outlines on Tobin's `angry_hold` come from P8, not from this.
- P11b Open, not reproduced here (no strands, hands or poses in the demo rigs): hair physics world/local mix and spatial
  bleed (S #20/#21), pose fallback crossing looks, pose-head detection treated as target, retarget not normalised (S
  #22-#24), base and eye meshes at different cell sizes (S #8), lid geometry vs shader clip mismatch (S #10).
- P12 Process: the product's Storybook stories use the flat synthetic head only, so none of P1-P4 show in visual tests.
  Suggest a story on a synthetic demo bust.
- Rejected: S #2 (expression textures not premultiplied). Chrome premultiplies `ArrayBufferView` uploads under
  `UNPACK_PREMULTIPLY_ALPHA_WEBGL` (probe: 200,100,50,128 -> 100,50,25,128).
- Not measured: frame pacing. Headless under load gave 7.5-12.5 rAF/s, which says nothing about the 60 fps gate; needs a
  headed run on the GPU.

Demo:
- D1 **The streamed line never moved the mouth** (S, confirmed). `streamLine` pulsed single words; `TextMouth.push`
  expects the cumulative text and reset on every word. Fixed: cumulative prefix.
- D2 **June's base art is an open grin** (C+S). The prompt said "open smile with closed mouth"; neutral reads as a grin,
  angry and worried keep it, the mouth shader draws over teeth. Prompt fixed (closed mouth, neutral expression,
  `CHAR_NEGATIVE`); re-render owed (GPU paused).
- D3 **Expression repaints change identity** (C+S): denoise 0.6 over the whole face with the full outfit prompt; eyes and
  nose redrawn. Prompts now face-only and closed-lipped; re-render owed.
- D4 **Vertical gaze inverted** (C+S): pointer below centre looked up. Fixed; slider reads "Down / up".
- D5 **Re-clicking the shown character wedged the page on "Loading the rig..."** (C, found by the recorder). Fixed.
- D6 **Busts hard-cut at the frame** (C+S): Wren's map and Tobin's coat cut at the right edge, June's hair touching the
  top. Fixed on CPU: padded square crop widened to the silhouette, detector result reused (no new detection), expressions
  rebased onto the new crop.
- D7 **Expression patches hard-clipped and lossy** (C+S): elliptical clip + WebP q90 over a PNG base. Fixed: feathered
  radial alpha on the page, lossless patches.
- D8 **Low-confidence detector points used as is** (C, S #31): Tobin's brows (score 0.41-0.59) sit on the forehead, mouth
  and nose under the beard (0.1-0.3). Fixed: brows, nose and mouth fall back to eye/chin geometry below score 0.5.
- D9 Motion off still moved the head with the gaze (S). Fixed.
- D10 The page replaced the rig's art hash with the fetched bust's, hiding stale rigs (S). Fixed: refused with a message.
- D11 Art, open (GPU owed): oilskin look (face and hair untouched, first changed row is below the chin; coat hem smear and
  dilated-mask clipping on the full body, S #28), June's full body clipped at the left edge, cast scale inconsistent
  (Tobin's head-to-body ratio), stray hair lines from the cut-out, poses never rendered (6 owed), pose renders not
  identity-conditioned (S #29).
- D12 One demo character's name matched the private deny list; renamed to Wren everywhere (art, sidecars, rigs, card,
  story, page). The branch history before `8eb27a2de` still holds the old name in file names and text: squash before
  this branch is pushed or merged.

Resume (paused 2026-11-08 by the coordinator, owner CPU at 100%; no GPU work since the GPU pause):
- Branches: `v3.0-sprite-fixes` (`C:\dev\so-sprite-fix`, product fixes P1 and P3-P7, head `c8e73f76a`) and this branch
  (demo fixes D1 and D4-D10, rename, re-cropped busts, rebuilt rigs; the product files are synced from
  `v3.0-sprite-fixes` in the WIP commit, identical content, so a later merge of both is clean). Not merged.
- Owed, in order, one heavy process at a time: re-record `test/goldens/liveHead/frame-loop.json` on
  `v3.0-sprite-fixes` (`SO_WRITE_LIVE_HEAD_GOLDEN=1 npx jest src/sprites/liveHead/frameLoop.test.ts`, shader changed in
  the WIP commit), `npm run gates` there; `node scripts/docs/demo-still.mjs` here (stills predate the fixes), then
  `npm run gates` here; desk+phone video of the after state (the run was killed mid-way; face crops for all 4 looks are
  done); Sol re-review with `.build/review-2026-11-08/sol-rereview.txt` (prompt via stdin, `-i` images).
- On the owner's GPU go: `demo-art.py chars` (June closed mouth), `looks`, `busts`, `expressions` (face-only prompts),
  `poses` (6 owed), `publish`, then `demo-rigs.mjs` and `demo-bundle.mjs demo`.
- Evidence (local, gitignored): `.build/review-2026-11-08/` (frames before/after, contact sheets, eye-layer dumps,
  Sol replies, capture scripts).

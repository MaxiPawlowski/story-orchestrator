# v3.0 45: animated backdrops (effects, depth parallax, video loops)

Owner 2026-11-08: animated scene backgrounds in the spirit of Wallpaper Engine "scene" wallpapers, generated on the fly where
cheap, authored/pre-made where expensive. Three phases built in parallel, each merged and installed as it finishes (the
owner is playtesting at the same time). Techniques are reimplemented; no Wallpaper Engine workshop content is used.

## Shape

One backdrop stage behind ST's chat (`#bg1` area), a lazy chunk. A **base source** (the scene's still, or a video loop
when one exists) plus **layers** drawn over it in one WebGL canvas:

- Phase 1 (A, effects): the stage, the base still, particle and shader layers (rain, snow, embers, dust motes, fireflies,
  fog drift, light flicker, slow camera drift, water/sky shimmer through an optional mask), driven by story state.
- Phase 2 (B, depth): a depth map per background (produced once, cached), a parallax layer (slow drift + pointer tilt)
  and depth-aware fog/particles; masks for water/sky from depth + colour where cheap.
- Phase 3 (C, loops): image-to-video in ComfyUI, seamless loop making, a cache keyed by background identity, generation
  at story setup for authored key locations and in the background when the GPU is idle; the stage swaps the base to the
  loop when ready.

Fallback order, always: loop → still + layers → still → ST's own background. Nothing blocks a turn.

## Shared contract (all three agents build against this; A owns it, B/C extend through it)

- Code home `src/backdrop/` (new top-level dir: add to tsconfig `include`, path alias `@backdrop`, webpack alias).
  - `src/backdrop/types.ts` (A): `BackdropBase = { kind: "image" | "video", url, key, width?, height? }`,
    `BackdropLayerSpec = { id, kind, params }`, `BackdropState` (scene key, weather, timeOfDay, tension 0-1, indoor?),
    `BackdropAssets = { depthUrl?, maskUrl?, loopUrl? }` keyed by background key.
  - `src/backdrop/stage/` (A): renderer, layer registry `registerLayer(kind, factory)`; B registers `parallax`, `depthFog`;
    C needs only `BackdropBase.kind = "video"` (A implements video textures, looping, crossfade on base swap).
  - `src/backdrop/depth/` (B), `src/backdrop/loops/` (C, plus ComfyUI workflow under the existing image workflow home
    `src/image/workflows*` / server-plugin media as the image track does).
  - Asset lookup goes through one port `src/backdrop/assets.ts` (A creates with empty providers; B adds depth/mask, C adds loop).
- Host: ST background DOM/CSS access only through a new `src/services/stHost/backdrop.ts` (A); restyle via
  `src/styles/host.css` behind `html[data-so-backdrop]` (architecture §UI). `stHost` writes answer `WriteResult`.
- Settings (install-wide, on by default, device chip): `display.backdrop.enabled`, `.effects`, `.parallax`, `.loops`,
  `.intensity` (0-1), `.dimBehindChat`; reduced motion (`prefers-reduced-motion`) = still only. Each phase adds its own
  switch's row in the feature registry and Display / Images & stage pages.
- Story schema (A defines, game layer validation, guide topic): `effects.backdrop` on a checkpoint
  `{ layers?: [{kind, ...}], weather?, intensity?, loop?: "pre" | "auto" | false }` and story-level `backdrop_defaults`.
  `loop: "pre"` marks a location for pre-made loops at story setup (C reads it). Absent = derived from story state
  (weather/time/tension qualities already compiled by life/clock; never author-required).
- Privacy: inputs are the authored background image and authored location/checkpoint fields of the active or already
  visited checkpoints only. Pre-generation at setup may render future locations but never shows them before reached.
- Budget: main bundle 1,300,000 B, everything here lazy. Chat readability first: dim/blur behind the chat column, motion
  low by default.

## Cheaper loop tiers (owner 2026-11-08)

- **Full**: the image-to-video loop (WebM/MP4).
- **Lite**: the same model at low cost (fewer frames and steps, lower resolution, about 2 s at 8-12 fps), encoded as
  animated WebP with a GIF fallback; minutes become well under a minute.
- **Cinemagraph** (no video model): the still animated in the browser by flow-warping the masked regions (sky, water,
  smoke) from phase B's depth/sky masks plus noise; free and instant, the default until a loop exists.
- Each tier is a setting value (`display.backdrop.loops`: off | cinemagraph | lite | full), on by default at the best
  tier the machine allows.
- Every phase ships a publishable synthetic example (art, depth map, loop) for the guide showcase (plan 46).

## Campaign step: Adolion backgrounds (owner 2026-11-08, private repo)

- The campaign already has 83 place prompts (`campaign/background-prompts/`, `scripts/campaign/backgrounds.py`) and a
  render script on FLUX, which was retired; 0 rendered, scenes fall back to stock backgrounds. Render them on the current
  scene checkpoint (the plugin's `image.purposes.scene` route), review by another model against the place text (the owner
  never sees campaign content), install with `install_st.py`, pin bump.
- After A merges the schema: mark key locations `effects.backdrop.loop: "pre"` in the features post-pass; depth, masks and
  loops are then produced by the product itself (B, C), so the campaign stores stills only.
- Counts only in this repo; images and prompts stay in the private campaign repo.

## Floors (informational, declared before measuring)

- A: 60 fps target, ≥ 50 fps median on the owner's PC at 1080p with 2 layers; ≤ 3 % CPU idle tab; 0 console errors.
- B: depth produced ≤ 10 s per background on the 3090 (or cached hit); parallax visibly correct on 5 sampled backgrounds
  (screenshot pair).
- C: one 4-5 s loop ≤ 5 min on the 3090; seam invisible in a blind 5-clip check (Sol or owner); cache hit replays instantly.

## Review 2026-11-08 (loops)

Independent audit of the phase C media and code (frame-by-frame, still vs loop pixel diffs) plus two gpt-6.1-sol passes (visual on contact
sheets, code read-only). Evidence: `C:\dev\so-lanes\0\debug\loop-review\` (`before/`, `after/`, `crops/`, `sol/` prompts and answers,
`audit.json`). MAE is mean absolute difference per channel, 0-255, against the still cover-cropped to the clip size. Ranked by visible impact.
GPU re-render = the fix is in the code but the showcase full/lite files still show the old recipe until a GPU run (GPU paused by the owner).

1. Lite tier morphs the scene (clouds become a flat ribbon, water smears).
   - Evidence: `harbor-town-afternoon.lite.webp` MAE vs still rises 8.9 -> 16.6 by frame 15, back to 9.1 at the end; mountain 5.3 -> 7.9;
     per-frame step 4.95 (harbor) vs 1.49 for full; Sol: "rounded cloud masses become a broad, flattened ribbon" (frames 6-16, both scenes).
   - Cause: free image-to-video run with only the first frame pinned, then a 6-of-23-frame crossfade blending two divergent states; the
     negative prompt listed "static, frozen", pushing the model toward large motion.
   - Fix: still pinned as the first and the last latent frame (core nodes: `RepeatImageBatch` -> `VAEEncode` -> `LatentCut` ->
     `ReplaceVideoLatentFrames`, per-frame noise mask from `EmptyImage`/`ImageBatch`/`ImageToMask` -> `SetLatentNoiseMask`; Wan 2.2's
     `process_timestep` reads that mask per latent frame), negative prompt drops "static, frozen" and adds morphing/changing shapes/colours.
     GPU re-render.
   - Found by: both.
2. The loop never shows the still: frame 0 is generated frame 16 (full) / 6 (lite).
   - Evidence: loop frame 0 MAE vs still 9.6 (harbor full), 5.2 (mountain full); after sub-pixel affine alignment still 6.5, so it is
     content, not a shift. The still -> loop base swap is a visible jump.
   - Cause: the crossfade export dropped the still-conditioned head frames (`middle` started at `blend`).
   - Fix: the anchored loop starts on generated frame 0 and ends just before the held still chunk (`loopFrames = frames - 4`). GPU re-render.
   - Found by: both (Sol code #7, my diff).
3. Crossfade seam ghosting and residual jump.
   - Evidence: blend factors 1/(B+1)..B/(B+1) leave 5.9 % (full) / 14.3 % (lite) of the tail in the last frame; lite wrap step 4.4 with
     two different cloud states superimposed for 6 frames.
   - Fix: no crossfade at all; the clip returns to the still by construction. GPU re-render.
   - Found by: both.
4. Cinemagraph clock 1000x too fast in the browser.
   - Evidence: the stage passes `frame.time` in ms (A's layers divide by 1000); `cinemagraph.ts` fed it straight into an 8 s period.
     The CPU showcase used seconds, so it hid this.
   - Fix: `u_time = frame.time / 1000`. Done.
   - Found by: Sol.
5. Colour shift in every encoded clip.
   - Evidence: VP9 from `SaveWEBM` and the showcase ffmpeg encodes are BT.601 YUV with no colour tags; browsers read untagged as BT.709:
     round-trip G -2.85 and MAE 4.39 vs 2.49 when the matrices match. The CPU renderer also read the still through ffmpeg's rgba path,
     a further G -2.7. Cinemagraph static (unmasked) region: mean (-1.6, -3.4, -1.5).
   - Fix: loops go through core `CreateVideo` (sRGB) + `SaveVideo` H.264 MP4, converted and tagged BT.709; cinemagraph renders
     use rgb24 decode with accurate rounding and BT.709-tagged x264. Cinemagraph done (still MAE 4.21 -> 3.69 harbor, 3.23 -> 2.71
     mountain, with slightly more motion than before the review; mean RGB shift now within the decoder's ~1 level). Loops: GPU re-render.
   - Found by: me (measured); Sol flagged the missing tags as a risk.
6. Cinemagraph edges smear foreground into sky and water (ridge halos, doubled outlines at the half-phase).
   - Evidence: `crops/mtn_cg_ridge.png` frame 24 shows the ridge doubled into the sky; mask feather is 2 px at 896 wide, flow was
     +-1.5 % of the width.
   - Fix: each warped sample is weighted by the same region's mask at its source position (falls back to the still outside), sky
     displacement 0.03 -> 0.016 of the width so the two flow phases stay within a few px. Done (`crops/mtn_cg2_ridge.png`: no halo).
   - Found by: both.
7. Cinemagraph water slid sideways instead of rippling; ripple not periodic.
   - Evidence: water used a constant horizontal flow (reflections translate); ripple advanced 13.6 rad per 8 s period (not 2*pi*k), a pop at
     the wrap.
   - Fix: water = row-dependent horizontal ripple (perspective falloff toward the horizon), 2 whole cycles per period, no sideways flow.
     Done.
   - Found by: both.
8. Cinemagraph overlay ignored the stage camera, tint and vignette, and changed the blend state for later layers.
   - Evidence: base pass applies camera, tint, vignette; the overlay sampled raw colour at untransformed UVs and set
     `blendFunc(SRC_ALPHA, ...)` in a premultiplied pipeline.
   - Fix: same camera/tint/vignette maths in the shader, premultiplied output, no blend-state change. Done. Base crossfade during a scene
     swap is still not visible to layers (open, A).
   - Found by: Sol (tint/camera), me (blend state).
9. Video framing differs from the still, so the base swap shifts and the B mask/depth no longer line up.
   - Evidence: full was 960x544 (1.765) for a 1.75 still; the stage cover-crops each texture by its own aspect; loop frame 0 phase shift
     (-0.73, -0.64) px; `Wan22ImageToVideoLatent` also downscaled a 1280-edge PNG with plain bilinear (aliasing).
   - Fix: `fitShape` searches the 32-px grid for the still's exact aspect (896x512 and 672x384 for 7:4; 1024x576 for 16:9) and the host
     centre-crops and resizes the still to that size with high-quality smoothing before upload. Code done; GPU re-render.
   - Found by: both.
10. Cinemagraph kept the previous scene's mask after a background change.
    - Evidence: the renderer reuses a layer by id and calls `update`; the mask loaded only in the constructor.
    - Fix: the auto spec id carries the mask URL, so a new mask builds a new layer. Done. Parallax/fog have the same pattern (open, B).
    - Found by: Sol.
11. Prompts invented content from file names (smoke and banners for any town, stars for night, candle flames for castles).
    - Fix: only motion of materials the name mentions (water, falls, foliage, existing flames, clouds), plus "every building, object and
      light stays where it is ... returns to the first frame". Done; prompt version 2. GPU re-render.
    - Found by: Sol.
12. Lite WebP compression flicker.
    - Evidence: the same lite frames step 3.14 as VP9 and 4.28 as WebP q75 (+35 %); wrap 2.4 vs 4.69.
    - Fix: WebP quality 90, method slowest. GPU re-render.
    - Found by: me.
13. GIF fallback banding and wrong size.
    - Evidence: 384x219 (not the lite 672x384), coarse palette steps and crawling dither (Sol: "stepped colour bands and speckled regions").
      No code path makes it (made by hand).
    - Fix: regenerate from the new lite frames at 672x384 with a full-stats palette and ordered (Bayer) dither, which stays still from frame
      to frame. Pending the lite re-render.
    - Found by: both.
14. Full harbor: whole-frame 1 px jump at frame 39 -> 40.
    - Evidence: step 9.44 vs mean 1.49; phase correlation (-0.63, -1.03) px; mountain shows a smaller spike at the same index.
    - Cause: model jitter (no tiled-VAE fallback in the logs). Watch after the anchored re-render; no stabiliser in core nodes.
    - Found by: me.
15. Texture pops every 4 frames in the full loops.
    - Evidence: step spikes at a 4-frame period with no global brightness change (frame means move < 0.2).
    - Cause: Wan 2.2 VAE decodes 4 frames per latent; model-inherent, low. Open.
    - Found by: me.
16. Loop cache key missed cfg, shift, negative prompt, CRF and recipe changes.
    - Fix: key covers recipe version, cfg, shift, CRF, WebP quality and the negative prompt. Done.
    - Found by: Sol.
17. Bench measured only adjacent-frame steps, uploaded the raw still and never compared with it.
    - Fix: bench uses the production centre-crop/resize and records first/mean/max/last MAE vs the conditioned still. Done (seed stays
      fixed at 42 for comparability).
    - Found by: Sol.
18. CPU showcase renderer did not match the shader (nearest sampling, top-origin UVs).
    - Fix: bilinear texel-centre sampling and GL orientation; it imports the shader's constants. Done.
    - Found by: both.
19. Lite plays native 24 fps motion at 12 fps (half speed, 2 s).
    - Accepted as intended slow ambient motion; recorded here so it is not mistaken for a bug. Found by: Sol.
20. Phase A/B items found on the way (not fixed here, owners' branches):
    - B: parallax and depth fog take `frame.time`/`frame.dt` in ms as seconds (38 s drift runs in 38 ms, easing snaps) (Sol, verified).
    - B: parallax `replacesBase` skips the base crossfade, tint and vignette; the cinemagraph cannot register with the parallax-shifted
      base (no shared UV) (Sol). Needs one base compositor (A/B).
    - B: harbor water mask misses the water around the moored boats and under the quay; mountain shoreline has jagged green fingers;
      `Math.min(...component)` can overflow the argument limit on big regions (Sol).
    - B: depth maps compress the mountains into one far plane; soft depth edges at roofs and boats (Sol).
    - A: `BackdropAutoInput` does not carry the checkpoint's `loop: false`, so a cinemagraph still runs there (Sol).

Before / after (cinemagraph, CPU, done; loops pending GPU):

- harbor cinemagraph: MAE vs still mean 4.21 -> 3.69, max 4.67 -> 3.79; mean RGB shift (-1.4, -3.3, -1.2) -> (-0.9, -1.5, -1.0)
  (residual = ffmpeg decode rounding, also seen on a still-only round trip); raw wrap step 0.05 (= the mean step); encoded wrap 1.03
  (x264 I-frame; a keyframe every 24 frames made it 2.0, so kept).
- Sol pass on the first re-render: no high defects, no halos or doubled ridges, seam matched; motion read as almost static, so sky
  drift 0.012 -> 0.016 and ripple 0.0022 -> 0.0035 for the final render.
- mountain cinemagraph: MAE vs still mean 3.23 -> 2.71, max 3.67 -> 2.74; encoded wrap 1.28; ridge halo gone.

Review gate record: `npm run gates` all green in 930.7 s on 717a2798d (build, typecheck, typecheck:test, test:debug, test:replay,
debug:typecheck, test:plugin, test:release, lint, test, test-storybook:ci). An earlier run on 2a300c74e failed only on load-timing
(gpu `imageCache` 100 ms test, 6 Storybook stories) and the stale guide bundle (fixed in 717a2798d). Still owed after the GPU go: the
anchored graph has never run on ComfyUI (node inputs checked against `/object_info` only); re-render full + lite for both showcase
stills with `so-loop-bench.mts run <still> --tier full|lite`, rebuild the GIF from the new lite frames, re-audit, fresh Sol pass,
then fill the loop rows of the before/after above; live ST check of the cinemagraph clock and the MP4 base swap.

## Gate record

(per phase, appended by each agent)

### Phase A: Resume (2026-11-08, paused on the owner's usage limit; nothing merged)

- Branches: `v3.0-45-backdrop-a` (worktree `C:\dev\so-45a`, the contract skeleton) and `v3.0-45-backdrop-a2` (worktree `C:\dev\so-45a2`, the WebGL stage on top of it).
- Skeleton: `src/backdrop/{types,assets,settings,still}.ts`, `stage/registry.ts`, `stage/vertex.ts` (shared `v_uv` vertex shader), `stHost/backdrop.ts`,
  `display.backdrop.*` (loops = off|cinemagraph|lite|full, default full), `effects.backdrop` + `backdrop_defaults` schema, guide topic `backdrop`, Display controls.
- Last full `npm run gates` on the skeleton (run 6): all green except jest `codeHealth` S8 (dead export `BackdropBootHook`). Fixed after the run (contract test uses it),
  but no full run on that fix yet. Master moved since (1aaa7ca09): merge master, run `npm run gates` once, merge, push.
- Stage (a2): renderer, layers (rain, snow, embers, dust, fireflies, fog, flicker, drift, shimmer), state-driven selection, contrast-driven dim (4.5:1, cap 0.6),
  `BACKDROP_BOOT_HOOKS` in `src/backdrop/start.ts` (C adds its loops host there), Backdrop/Stage stories, no-model scenario `test/scenarios/v30-45a-backdrop-stage.json`.
- Live (lane 47, frozen a2 bundle, headed, 1906x930 at dpr 1.5, canvas 2859x1395): scenario 6/6 pass; rain+fog 59.9 fps median, draw 0.2 ms, main thread 15.1 % busy
  (14.2 % with drift+dust); hidden tab 0 % and no frames; 0 console errors. Floors: fps met; the 3 % CPU floor is met for a hidden tab, not for a visible animated one.
- Reduced motion: owner-confirmed, only the OS `prefers-reduced-motion` stills the backdrop; ST's own Reduced motion toggle is ignored (the owner has it on).
- Next: merge skeleton; merge a2 into the skeleton branch, gates, merge, `npm run build && npm run stage && npm run plugins:install`;
  showcase shots of the Backdrop/Stage stories into `docs/guide/assets/showcase/backdrops/a-effects-*.png` (`.build/backdrop-shots.mjs` in so-45a2, Storybook on port 6011).

### Phase C (loops): Resume note 2026-11-08 (paused on owner usage limit, not merged)

- Branch `v3.0-45c-loops` (worktree `C:\dev\so-45c`), master merged at f7bf963b6; WIP committed, no full gates run yet.
- Built: Wan 2.2 TI2V 5B loop workflow, core nodes only (`src/backdrop/loops/workflow.ts`: full 960x544/113 frames/16 steps/24 fps,
  lite 704x384/29 frames/16 steps/12 fps + animated WebP, both fitted to the still's aspect; tail-to-head crossfade seam); media plugin
  routes `loops.mjs` (owned prefix, own job queue, targeted `/interrupt {prompt_id}` cancel, interrupted-by-others = retry, WebM/WebP
  cache in `user/images/story-orchestrator-loops/`); scheduler (current place first, then `loop: "pre"` places; idle-only; preempt on
  reply/picture/sprite); host with tier downgrade (no media plugin or Wan files -> cinemagraph); cinemagraph layer (sky R / water G flow
  warp); `so-loop-bench.mts`, `so-cinemagraph-render.mts`; showcase loops (2 scenes x 3 tiers, 2.2 MB); setup guide section.
- Contract change in a shared file: `stHost/gpuBroker.ts` passes optional `needGpuMiB`/`needRamMiB` to the lease.
- Measured (3090, ComfyUI 0.37.4, other agents' jobs interleaved at times): full warm 122-209 s, after `/free` 190 s, 330-415 s when
  other jobs evicted the model; lite sampling 30 s, 45-65 s executed incl. reload; seam: wrap step <= max step 7/7, Sol blind 5-clip check
  0/5 seam strips flagged (2 interior strips flagged for model artefacts). Lite at 8-14 steps had colour-block artefacts (model, not encode).
- Models already on disk (no download): `D:/models/story-orchestrator-video/` Wan 2.2 TI2V 5B set (plan 11b, sha256 there).
- Evidence: `C:\dev\so-lanes\0\debug\loop-bench*` (runs.jsonl, strips, blind/key.json, Sol answer).
- Next: after A's skeleton merges, merge master; adapt `startBackdropLoops` to `BackdropBootContext` (@backdrop/types) and add the hook
  line to `BACKDROP_BOOT_HOOKS` in `src/backdrop/start.ts`; use `context.vertexShader` (already used); typecheck/lint/jest; `npm run gates`
  (one at a time machine-wide); live check in ST (cache hit replays instantly); merge, push, build+stage+plugins:install (media plugin
  changed: ST restart needed, owner's call).
- My ComfyUI on 8188 was started by me (same args as the controller) and is still running; the controller reuses it.

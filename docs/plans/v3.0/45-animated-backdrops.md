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

## Review 2026-11-08 (stage)

Independent audit of the stage (a2 74e3f81de) with B's parallax/depthFog merged in (review worktree `C:\dev\so-45-review`, branch `v3.0-45-review`).
Method: a harness bundling the real `src/backdrop` stage (esbuild, scratchpad only) driven by Playwright on the 3090 (ANGLE D3D11) with a deterministic
60 fps clock; 17 scenes x 1080p (DPR 1) and phone (390x844, DPR 3), 3 s each; frame metrics (changed pixels, phase-correlation global shift and its
frame-to-frame jitter, luma steps); a real-time headed run for fps and main-thread CPU. B's synthetic showcase stills as bases.
Second opinion: codex `gpt-6.1-sol`, read-only: a blind shader/code review and a blind visual review (frames + metrics), then a re-review of the fixes.
Found-by: C = Claude, SC = Sol code review, SV = Sol visual review.

Contract changes from this review: `BackdropFrame.time`/`dt` are seconds; `BackdropLayer.modifyBase(frame)` feeds the one base composite (depth, fog, ripple)
instead of `replacesBase`; `BackdropLayer.fps` (30 or 60) sets the draw rate; `BackdropLayerContext.bindScene(program, camera, unit)` binds the base, its cover,
the camera and the chat quiet band for layers that sample the scene; `BackdropFrame.grade` (saturation, contrast, kept practical lights).

Ranked findings (defect; evidence; root cause; fix; found by):

1. Parallax shakes the whole picture. Before: lake 3.18 px/frame mean shift with 6.23 px frame-to-frame jitter (direction flips every frame), library 2.79/5.45,
   phone lake 5.96 px max. Cause: the contract never said the unit of `BackdropFrame.time`/`dt`; A passed ms, B read seconds, so the 38 s drift ran at 26 Hz,
   easing snapped (dt 16.7 "s"), depth-fog noise ran 1000x. Fix: contract says seconds, B eases with a 1.1 s half-life. C, SC1, SV1.
2. Depth arriving changed the whole picture. Parallax `replacesBase` drew the raw texture: night tint (R +61 %), vignette, drift camera and the crossfade vanished;
   shimmer then drew a second, undisplaced copy over it; depth fog sampled undisplaced depth. Fix: one base composite (`BASE_FS`): camera, parallax (24 steps +
   6 binary refinement, shift scaled by cover), ripple, depth fog, crossfade, grade, vignette; B's layers are `modifyBase` modifiers. C, SC2/6/7, SV2/3.
3. Shimmer invisible or wrong. Before 0 changed px; mask sampled in screen space (on phone only 31.6 % of the mask width is visible), the no-mask fallback warped
   the bottom 30 % of any screen, sine bands under 1 px. Fix: mask in image space after parallax, noise ripples (~2.4 CSS px, finer toward the horizon), `sky`/`water`
   need the scene mask, `none` = faint heat haze. C, SC7, SV6/7.
4. Most effects invisible at defaults: changed px > 6 per frame rain 0.15 %, fireflies / indoor dust / firelight / wind / fog ~0 %, embers 0.008 %.
   Causes: 1.2 px quads, low alpha and counts, emitters in screen space. Fixes in 5, 9, 10. C, SV4/11/12/13.
5. Rain looked like broken scratches. Streak axis tilted against travel (slope 0.034 vs -0.107), bright end trailing, 18-36 px streaks vs up to 48 px/frame travel
   in storms (dashes strobe), sub-2 px width aliasing. Fix: axis from pixel velocity, length >= travel per 1/38 s, near/far depth (z^2), min-width AA with
   coverage, colour lifted from the local scene, quieter inside the chat column. C, SC14, SV8.
6. Speed applied as `time * speed`: any tension or speed change teleported every particle (at 60 s, tension 0 -> 1 jumped 30 s of motion); tension also sped the
   weather up. Fix: per-layer integrated phase with eased rate; tension no longer changes speed (vignette + amount only). C, SC9.
7. Depth fog: on every depth-mapped still (clear day 7.7-16 % opacity), a fixed pale colour that glows at night, drawn over the particles, density never updated,
   left `SRC_ALPHA` blending on. Fix: in the base pass (under particles), off indoors, 0.07 in clear air, tinted and lit by the scene's own low mip, linear-light
   mix, density updates. C, SC16/28/32, SV4.
8. Weather and night only multiplied RGB: storm and night stills stayed sunny. Fix: eased grade (saturation, contrast) per weather/time, stronger storm darkening,
   warm practical lights kept at night. SV5 (C partly).
9. Lightning and firelight. The storm "flash" was a constant bottom glow that a flash actually dimmed, fired at t = 0, mode keyed to colour `#c8d8ff` and frozen at
   construction; firelight had an 11 Hz component and a fixed bottom-centre blob. Fix: `lightning` param, 1-3 strokes with exponential decay, idle zero, every
   7-20 s; firelight a slow signed flicker weighted by lit areas. C, SC11/12, SV9/10.
10. Particles detached from the scene: embers rose from the bottom edge everywhere; fireflies on any outdoor night (city, sea, snow) and teleported ~594 px via
    `fract`; dust everywhere. Fix: embers spawn on warm bright spots of the still (fire, candles; 7 % ambient), dust only where lit, fireflies only on clear nights
    in green places, bounded paths, halo sprites. C, SC21, SV11/12.
11. Popping at screen edges and on intensity changes (`fract` wrap on the visible edge; counts changed instantly; floor at 0.01). Fix: spawn margins, per-particle
    keep threshold against an eased density, intensity eased (1.2 s), zero means none. C, SC23, SV.
12. Precision and undefined GLSL: `mediump` time/hash (62 ms steps after 64 s on FP16 GPUs), sin hash, reversed `smoothstep(1.0, 0.2, d)`. Fix: highp, PCG integer
    hash, quintic gradient noise. SC8/22, C.
13. Fog read as a static blotchy veil (value noise), 8-bit banding, light-grey colour washing night scenes. Fix: warped gradient-noise fbm at two speeds, colour from
    the scene's low mip, dither. C, SV14.
14. The dim behind the chat over-darkened and showed a seam: the 4.5:1 solve assumed linear attenuation of an sRGB blend (0.60 where 0.51 suffices at L 0.79),
    sampled the uncropped image by mean, hard 4 % edge on smooth skies. Fix: solve in display gamma, cover-aware sample (bright quarter + mean), falloff outside the
    column. C, SC17, SV18.
15. Soft, crawling stills: drift zoom up to 1.04 even at intensity 0, no mipmaps. Fix: reach 0.009 x intensity (zoom <= 1.021), mipmapped bases. C, SC20/23.
16. Crossfades mixed in sRGB (dip), a third base mid-fade popped, reduced motion left the old scene up. Fix: linear-light eased mix, keep the more visible slot,
    instant swap under reduced motion. SC3/6/13.
17. Layers kept stale assets (a mask arriving after the shimmer layer was built was never used); the texture cache only grew. Fix: an asset change rebuilds layers,
    unused textures are freed, failed loads retry. SC4/33.
18. Async loads: re-selecting the shown base did not cancel a pending one (wrong scene later), a failed still left the old canvas up, a refused `play()` gave a
    frozen "loop". Fix: load generation reset, deactivate on failure, `loadVideo` awaits `play()`. SC10/29/30.
19. No `webglcontextlost` handling (blank canvas while active). Fix: lost = deactivate without GL calls, restored = rebuild. C, SC5.
20. Hidden tab: time jumped by the whole absence, videos kept playing. Fix: animation clock advances by clamped dt, videos pause while hidden. SC19.
21. Pointer: touch scrolling tilted the parallax on phones, last tilt stuck after leaving, 1.8 % tilt while reading. Fix: mouse only, reset on leave/blur,
    tilt 0.45 x strength 0.012, Y flipped at the GL boundary. C, SC27.
22. Selection: "late afternoon" read as night, substring interiors ("shallow" -> hall, "mushroom" -> room, "lighthouse"/"greenhouse" -> house), wind = invisible
    slow dust. Fix: word tokens, exterior words win, wind = sideways streaked dust. C, SC25, SV15.
23. Pacing and cost: drift-only scenes ran rAF at 60 fps for ~1 px/s; the 12.67 ms limiter gives 45 fps at 90 Hz. Fix: layers declare `fps`; drift, fog,
    flicker, depth fog 30; particles, parallax, shimmer 60. C, SC18.

Open (not fixed here):
- Host background fit/position/filter are ignored (always centred cover); a phone portrait crops a landscape still to its centre (no focal point). SC26, SV17.
- Wind moves nothing in the picture (no foliage/water masks); stills painted in daylight still read as daylight under rain (needs lit variants). SV5/15.
- Particles and overlays still blend in display gamma (only the base pass is linear); 90/144 Hz displays still halve the cadence.
- Phase C's cinemagraph (`so-45c` 2ef27795c) divides `frame.time` by 1000: with this contract (seconds) that runs it 1000x slow, so the `/ 1000` must go
  when C merges onto a2. It also samples the base without camera/parallax: it should feed the base composite through `modifyBase` (a flow modifier
  next to `ripple` in `BASE_FS`), agreed through main since both A and C touch the contract.
- A beat's `loop: false` now also drops loop-tier layers (the cinemagraph), from the loops reviewer; fixed here with a test.
- B's masks (loops reviewer, Sol): harbour water misses the water around the boats and under the quay, mountain shoreline edges are ragged, mask building
  can fail on very large regions; the mountain depth map puts the whole range on one far plane. Not touched in this review (B's `mask.ts` and the depth
  model, which needs the GPU the owner paused).
- No DPR-change listener beyond `resize`; dark-text themes only ever get a darker scrim.
- Scene-lit effects (rain/snow colour, dust, ember sources, firelight) sample the raw incoming still, not the graded/displaced composite; the practical-light
  heuristic (bright, warm, saturated) can also keep sunny warm highlights at night. SC re-review.

Before -> after (deterministic 60 fps captures, same scenes and clock; 1080p unless noted):
- Parallax global shift per frame: lake 3.18 -> 0.00 px (jitter 6.23 -> 0.00), library 2.79 -> 0.00, forest 2.76 -> 0.01, phone lake 3.70 -> 0.00 (jitter 7.21 -> 0.01).
- Pixels changing > 6/255 per frame: rain 0.15 % -> 0.53 %, storm 0.43 % -> 1.32 %, embers 0.008 % -> 0.07 %; snow 0.07 % -> 0.15 %.
- Night storm over the harbour (parallax + rain + lightning): mean luma 130 -> 60 (the night was rendered as a sunny afternoon before).
- Real time, headed, 3090, 1080p: 59.9 fps median on every active combination before and after; drift-only 30 fps after (60 before); draw submit 0.1-0.2 ms;
  hidden tab 0-0.8 % main thread, no frames; 0 console errors across 34 captures. Main-thread CPU visible 5-11 % (machine busy with other gates, noisy;
  the 3 % floor holds for a hidden tab only, as before).
- Sol re-review of the fixes: of its 34 code findings 15 fixed, 17 partly, 2 not (host fitting, refresh cadence); of 18 visual findings 6 fixed, 9 partly,
  3 not (wind, drift value, phone crop). Verdict: "Subtle: mostly yes. Readable: yes ... High quality: improved, but not yet consistently." Its 8 new
  defects were then fixed except the two in Open: a video's first upload went into a 1x1 texture; shimmer distorted at zero intensity; an asset arriving
  rebuilt every layer (phases restarted, lightning could strike at once); wind changes teleported dust/snow; "forest cabin" read outdoor-only and "village
  tavern" outdoor; videos were capped at 30 fps by slow layers. Also fixed from its partials: reduced motion mid-fade, B -> A -> B load tickets, lightning
  scheduler reset on mode switch, "no rain" read as rain, parallax overscan at zero motion.
- Evidence (34+34 clips, contact sheets, 100 % crop strips, page shots, metrics, perf logs, the three Sol reports, the harness) is archived outside the repo
  in `C:\dev\backups\story-orchestrator\45-review-2026-11-08\`; the bases are B's synthetic showcase stills.

### Resume (review, paused 2026-11-08 by the coordinator: owner's CPU at 100 %)

- Branches: a2 `v3.0-45-backdrop-a2` (review fixes on top, master contract b376500f8 merged in), B `v3.0-45-backdrop-b` (layer fixes), combined
  `v3.0-45-review` (worktree `C:\dev\so-45-review`). All work committed; nothing merged to master.
- Green so far on a2: `npx tsc --noEmit`, `npx jest src/backdrop` (34 + 8 controller tests), related jest except settings reference (regenerated, now green),
  lint on changed files, defect replay `--cached`; combined branch: typecheck + `jest src/backdrop` 57/57. 0 console errors in the final captures.
- Full `npm run gates` on a2 (2800ae3e5): typecheck and build green, then `npm run test` exit 1 and the run stopped; the failing test was not yet
  identified (the gates log kept no jest output; a plain `npm test` was stopped by the pause). Next: `npm test` alone, fix, then one full `npm run gates`.
- Not done: live lane check of `test/scenarios/v30-45a-backdrop-stage.json` on the frozen a2 bundle (lane 47, no-model, images off); C must drop its
  `frame.time / 1000` when it merges onto this contract.

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

### Review: gate record (a2, 2026-11-08)

- Fixed for the gates: code health (dead `BUILT_IN_LAYERS`, typed preview story instead of `as unknown as`), architecture (`stHost/backdrop.ts` reads the text colour from
  `#chat`, no message DOM), style tokens (preview still painted in `src/backdrop/previewStill.ts`, no colour literals in tsx), error copy (no silent catch on video resume,
  `loadVideo` rejects with the raw reason), arrival golden re-recorded for `v30-45a-backdrop-stage.json`, settings reference regenerated.
- `npm run gates -- --jobs=2` (through the machine-wide heavy lock) on 99db222c2 (a2 + master 2b35ba2c7): all green in 494.4 s, no `--resume`, Storybook included:
  test:replay, test, test-storybook:ci, build, test:debug, typecheck, typecheck:test, lint, debug:typecheck, test:release, test:plugin all exit 0.
- Not run: the live lane scenario (machine overloaded, one heavy process at a time); the deterministic WebGL captures above stand in for the visual check.

### Phase B (depth + parallax): Resume note 2026-11-08 (paused on usage limit)

- Branch `v3.0-45-backdrop-b` @ worktree `C:\dev\so-45b`; not merged, no full gates run yet.
- Built: depth recipe `src/image/depthGraph.ts` (LoadImage -> DepthAnythingV2Preprocessor vitl r512 -> PreviewImage); media plugin allowlist + `validateDepthInputs` (plugin tests green); `src/backdrop/depth/`: `key.ts` (key sha256[0:32]-dav2-vitl-r512-v1, file `user/images/so-backdrop-depth/<key>.png`), `cache.ts` (once per content hash, dedupe, backoff 10 min x3, off when `image.enabled` is false or no media plugin), `host.ts` (image queue + broker lease, background, never blocks a turn), `mask.ts` (R sky = far plateau only, G water = blue ground-plane seeds grown across reflections, B reserved for C, A 255), `parallax.ts` (overscan math, drift/tilt, GLSL 300 es), `layers.ts` + `index.ts` (parallax/depthFog layers + `depth` asset provider; drafts against A's contract, not compiled until A lands). Unit tests 24 green (`npx jest src/backdrop/depth`).
- Showcase (plan 46): `docs/guide/assets/showcase/backdrops/` (4 SDXL base scenes, depth, masks, 2 parallax WebP demos, sidecars), `docs/guide/assets/showcase/LICENSES.md`; generator `scripts/debug/so-showcase-backdrops.mts`; probe `scripts/debug/so-backdrop-depth.mts`.
- Download: `depth_anything_v2_vitl.pth`, 1,341,395,338 B, sha256 a7ea19fa0ed99244e67b624c72b8580b7e9553043245905be58796a608eb9345, from huggingface.co/depth-anything/Depth-Anything-V2-Large, placed in `C:\dev\ComfyUI\custom_nodes\comfyui_controlnet_aux\ckpts\depth-anything\Depth-Anything-V2-Large\`.
- Floor B depth <= 10 s: MISSED. 17-38 s (6 ST stock backgrounds, ComfyUI just busy), 44-68 s (3, RAM pressure), 14-19 s (4 showcase, idle queue). Cause: the controlnet_aux node rebuilds ViT-L on CPU every call (CPU: import 6 s, build 11.7 s, load 1 s), not GPU time. Owner options: vits/vitb weights (99 / 390 MB, another download) or ComfyUI-native DA3 (Comfy-Org repackage, model-managed and cached). Cache hit replays instantly.
- Parallax floor: visibly correct on 5 ST stock + 4 showcase scenes in a standalone WebGL harness (screenshot pairs: foreground moves against background, no edge stretch). Live check on A's real stage still owed.
- Masks after coordinator review: sky stops at the ridge (mountain-lake-dawn sky 33.5% -> 17.7%), harbour water 7.2% -> 19.4%.
- Next: merge master once A lands; boot `startDepth(() => settings.parallax)` from A's stage; check `coverTransform` and pointer range; feature row, settings copy, guide for `display.backdrop.parallax`; contract bullet for the mask format; gates:quick; lane 53 live check with a cached depth map (upload via the lane's `/api/images/upload`); full `npm run gates`; merge, push, stage, plugins:install (media plugin changed, restart needed).

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

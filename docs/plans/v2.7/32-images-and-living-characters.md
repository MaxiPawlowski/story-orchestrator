# Plan 32 — Images and living characters

**Status: SEEDED 2026-10-07; merges the open, player-facing parts of v2.7 17, 18, 19, 20, 21, 24, 26 and the product
pieces of 28; needs user approval; nothing new built.** Overview: `00-overview.md`. Every row here re-runs from zero
in Phase C (v2.7 39): no earlier "green" in 17–28 carries over, it is only evidence that the code path exists.
Real-model rows (CL/LT/LI/RP) are allowed inside v2.7 (user, 2026-10-07; this overrides the "owed to v2.8 01" column of
`00-overview.md` §Gate taxonomy for this plan). RunPod may carry real-model test volume.

## Sources

| From | Taken into this plan | Already built, stays | Dropped / moved |
|---|---|---|---|
| v2.7 17 | route A (ST Image Generation) as default, route B (ComfyUI) opt-in, template fallback, `image` probe, Repair rows, Test render, cue seam | route A + template (`stHost/stImage.ts`, `image/prompt.ts` `templateImagePrompt`), discovery (`stHost/media.ts` `comfyDiscover`), owned jobs, `image` capability, `runtime/imageHealth.ts`, checks `images-on-no-service` / `image-model-missing` / `gpu-broker-no-text-model` | FLUX family and FLUX background default (→ v2.7 31); hardcoded checkpoint defaults (fixed in W2) |
| v2.7 18 | multi-character builder acceptance, cleanup scope | Studio Sprites tab, recipes, pixel QA, ledgered owned sets, cancellation, protected reference adoption, base-from-card (four candidates + alpha) | — |
| v2.7 19 | S28 runtime floors, multi-character frame QA, Mouth movement default | blink/talk/talk2 frames, `anim-<set>` layout, animator, reduced motion, missing-frame degradation | S28 blind preference pass (closed by the user, see W6); rig option D stays v2.9 05 |
| v2.7 20 | S32-1 re-measure, S32-2 lifecycle, overlay/on-demand defaults | bound public card fields, transactional entry writes, `writerOf`, scope rotation 8+4, image/sprite readers, `cast` chip, default-off `cardOverlay` and `onDemand` | per-chat avatars (v2.9 05 §05.5, unchanged) |
| v2.7 21 | nothing new; its record is history | Belle pilot code | Belle as acceptance evidence for any multi-character floor |
| v2.7 24 | owed rows: route A/B/template/director, clean-host, base LI ×2, S32-2, docs | A–C workstreams, story-scoped removal, crash-resume, `so-assets` generated-set scope | residency integration (F) → v2.7 31 / v2.8 28 |
| v2.7 26 | mouth region, raw-edit cache, two-frame default, 512/20 candidate | `builder/frameRegion.ts`, `builder/rawCache.ts`, `SpriteEditRegion`, `SpritePreview`, recipe 4, neutral-rest recipe | — |
| v2.7 28 | changed-look blink/talk generation, `actor.frames` refresh | both are implemented candidates (`builder/lookFrames.ts`) | eight Saga packs, 31 outfits, campaign card fields, Saga integration, rollout → v2.7 38; warm-batch harness, low-memory adapter page → v2.7 31 |
| v2.7 22, 23, 25 | nothing | — | FreeToken notes, FLUX spikes, this machine's config → v2.7 31; controller core → v2.8 28 (broker in the ST plugin, per v2.7 31 §B) |

## Player outcome

- A player with any image service set up in SillyTavern gets story illustrations without installing anything else.
  A player with none sees nothing fail; the panel says images are off and why.
- Story characters on the VN stage blink and move their mouth while their reply streams. Without frames they still
  breathe and cross-fade as today. Reduced motion stops all of it.
- When a story changes how someone looks (dyed hair, a new outfit), the illustrations and the stage follow, in that
  chat only. A new chat shows the card as it was.
- An author can build a sprite pack for a cast member in the Studio from the card art, review it and keep it.

## Existing code to reuse

- Images: `src/image/{runtime,routing,graph,catalog,settings,prompt,cast,renderFacts}.ts`, `src/image/ImageGroup.tsx`,
  `src/services/stHost/{stImage,image,media,gpuBroker,capabilities}.ts`, `src/runtime/imageHealth.ts`,
  `src/runtime/checks.ts` + `checksSetup.ts`.
- Sprites: `src/sprites/{stage,VnStage,AnimatedFace,animation,profile,direction,settings,lookHealth,start}.ts(x)`,
  `src/sprites/builder/{builder,recipes,pixels,frameRegion,rawCache,onDemand,lookFrames,referencePack,textPriority}.ts`,
  Studio `src/studio/components/{SpriteBuilder,BaseSpriteBuilder,ReferencePackPicker,SpriteEditRegion,SpritePreview,GeneratedSpriteSets,CardFieldsEditor}.tsx`.
- Living cards: `src/engine/cardFields.ts`, `engine/engine.ts` entry step, `engine/blackboard.ts` `writerOf`,
  `extraction/scope.ts` pull kind `card`, `constants/injectionRegistry.ts` `cardOverlay`, `runtime/spriteLookHealth.ts`.
- Plugins: `server-plugin/story-orchestrator-media/{index,jobs,files}.mjs`, `server-plugin/story-orchestrator-gpu/`
  (optional, `scripts/release/artifact-allowlist.json` `optional`).
- Harness: `scripts/debug/so-sprite-comparison.mts`, `so-image-runtime.mts`, `so-living-cards.mts`, `so-assets.mts`,
  `scripts/release/clean-host.sh`.

## Review problems and how this plan resolves them

| # | Problem (cited) | Resolution | Workstream |
|---|---|---|---|
| R1 | Route B defaults hardcode three model files: `src/image/settings.ts:55,74,76` (`WAI`, `JANKU`, `FLUX` in `defaultImageSettings`, rows at :69-76), constants and checkpoint table `src/image/catalog.ts:53-75`, against v2.7 17 §A.2 "nothing hardcoded" | default rows carry a family and no file; the checkpoint is resolved from `comfyDiscover` per family; the three files become setup-doc suggestions; FLUX row and family removed (v2.7 31); background = SDXL wide row | W2 |
| R2 | `mouth: "simple"` shipped unmeasured (`src/sprites/settings.ts:33`); v2.7 19 tied it to S28's blind rating | `simple` is the two-frame mouth; the user prefers two-frame (v2.7 26 status, approval 2026-10-07) and closed the blind pass. Recorded as the user's decision, not a measured pass | W6 |
| R3 | Product code holds the local controller's reserves, `gpuFreeMiB >= 2048`, `ramAvailableMiB >= 4096` (`src/sprites/builder/batchHost.ts:20`), and the dev-only warm-batch lease is statically imported into the prod sprites chunk (`src/sprites/start.tsx:9` import, used only under `__SO_DEV__` at :25) | as v2.7 31 §B: the dev-only warm-batch lease becomes a `__SO_DEV__` dynamic import (prod chunk test); reserves are read from the broker's `/status`, never constants in `src/`; product keeps one per-image lease, fail-open | W4 |
| R4 | GPU plugin hardcodes `127.0.0.1:18888` (`server-plugin/story-orchestrator-gpu/index.mjs:25` managed default, :55 listen, :58 log) | listen host/port and `controllerUrl` come from the plugin's `config.json`; `managed` with no `controllerUrl` is refused at init; no product default names this machine. Same check on the media plugin's `127.0.0.1:8188` fallback (`story-orchestrator-media/index.mjs:17`): ComfyUI's documented default stays, ST's `comfy_url` wins when set | W4 |
| R5 | S32-1 "repair until it passes" (v2.7 28 step 5) | floors are not retuned (v2.7 24 rule 7). A repair is valid only on the unchanged fixture, arms, N and rater; a new measurement is a new ×2 pair; every prior round (round 1 baseline 73.3 %, round 2 baseline 100 %) stays in the record. `cardOverlay` stays off unless a full ×2 passes including "baseline worse" | W8 |
| R6 | Belle-only evidence (v2.7 21, 24, 26) | one character never closes a multi-character floor (v2.7 21 §Scope 6). Each multi-character row names ≥ 3 characters chosen by another model for variety (glasses, hair over the eyes, a non-human face) | W5, W6, W7 |
| R7 | The image track must work for a stranger without the residency controller | broker optional, fail-open; clean-host install has no broker; one LI row runs with the GPU plugin uninstalled | W4 |

## Workstreams

Tiers per `00-overview.md` §Gate taxonomy. "Model input" = whether the change alters what any LLM is sent.

### W1. Route A as the working default (v2.7 17 §A.1, §E)

- What: real renders through ST's Image Generation service with the director and with the template; automation
  story-authored only; nothing renders until the `image` probe passes; Test render.
- Model input: no (director prompt unchanged).
- Gate: D (`npm run gates`; probe/Repair fixtures) + LI (ST `comfy` source on the local ComfyUI) + CL (DeepSeek
  director). A cloud ST source only with the user's approval (v2.7 17 §Gates).
- Floor (proposed): story-authored illustrations at 10 checkpoint/scene cues per run, 10 of 10 render or refuse with a
  named reason, 0 silent failures, ×2; template arm with no director profile the same.

### W2. Route B: discovery-based defaults (R1)

- What: `defaultImageSettings` rows keep `family`, `aspect`, `shot`, `placement`, never a file name. At render the row's
  checkpoint resolves to the user's mapping, else the single discovered checkpoint of that family; none or several
  unmapped → refused with a Repair row (`image-model-missing`), never sent. Upscaler and embeddings only when discovered.
  `WAI`/`JANKU`/`FLUX` constants leave `src/image`; their recipe blocks (sampler, steps, quality blocks) stay as data
  keyed by family, and the file names move to `docs/guide/setup/images.md` as suggestions. FLUX family removed (v2.7 31).
  Background default = SDXL row, `aspect: "wide"`, `extraPositive: "no humans, scenery"`.
- Model input: no.
- Gate: D: fake `/object_info` with 0 / 1 / 3 SDXL checkpoints (refuse / pick / refuse-and-ask); a guard test that no
  `.safetensors` literal appears in `src/image/**` outside test fixtures; settings sanitize drops a stored `flux-dev`
  row to the SDXL default (no legacy compat, never released). LI: route B render with discovered models.
- Floor (proposed): guard 0 hits; LI 10 of 10 route B renders use only discovered models, ×2.

### W3. Template fallback and director arms (v2.7 17 §B)

- What: verify the built template prompt and spoiler rules (v2.7 02 C6/C7: `player_name`, only looks the player has
  seen) on both routes.
- Model input: no.
- Gate: D (template spoiler property, exists) + LI (template) + CL (director). Floor: the W1 floor, per arm.

### W4. Self-contained for a stranger (R3, R4, R7)

- What (with v2.7 31 §B): `start.tsx` loads `batchHost` only by a `__SO_DEV__` dynamic import; its 2048/4096 reserves
  come from the broker's status, not constants. GPU plugin: host/port/`controllerUrl` from config, refuse `managed` without a
  URL, `none` passes through (today). Media plugin: ST `comfy_url` first. Clean-host with the package as shipped.
- Model input: no.
- Gate: D: bundle test that the prod main entry and sprites chunk contain no lease-pool code and no `2048`/`4096`
  reserve; `test:plugin` cases for config port, missing `controllerUrl`, pass-through; `scripts/release/clean-host.sh`
  (images off and quiet, no broker installed). LI: one lane with `story-orchestrator-gpu` absent: route B render, a
  Studio sprite build and an on-demand look all complete.
- Floor (proposed): 0 bundle hits; clean-host 0 render attempts and 0 errors with no backend; LI 3 of 3 paths complete
  without the broker, ×2.

### W5. Sprite builder, multi-character (v2.7 18 §Gates LI, v2.7 24 C)

- What: the Studio builder on ≥ 3 characters (R6): base-from-card (four candidates + alpha, author picks), neutral +
  3 labels each, cancel mid-run, cleanup.
- Model input: no.
- Gate: D (existing builder/QA/ledger/cancellation tests, Storybook) + LI.
- Floor (v2.7 18, verbatim): "second-model rating of the sample ≥ 90 % "same character" and ≥ 90 % "label visible"
  (predeclared)". Plus (v2.7 18): a cancel mid-run leaves no file; `so-assets` cleanup leaves the install as before
  (sha256 inventory diff). Base creation ×2 (v2.7 24 C): four candidates + alpha, author picks, QA passes.

### W6. Talking sprites (v2.7 19, 26; R2)

- What: frames from each label's own sprite (v2.7 26 recipe 4 + mouth region), two-frame by default, `smooth`
  selectable; neutral-rest recipe offered when a neutral has parted lips (v2.7 26 finding). Mouth default `simple`
  by the user's two-frame preference. **S28 blind preference: CLOSED by the user** ("no need for blind pass on talking
  sprite, it already won", 2026-10-07): recorded as the user's decision, not a measured pass; its ≥ 70 % floor is not
  claimed. The labeled Belle and eight-character playback approvals (2026-10-07) are user approval, not S28 evidence.
- Model input: no.
- Gate: D (19 §8 D rows, 26 D rows) + LI (frame build on ≥ 3 characters) + RP or LT (3 actors, streamed real reply;
  RP `Artemis RunPod RP`, named in the run header) at 1920×1080 and 390×844.
- Floors (v2.7 24, verbatim): "≥90% frames pass QA on the first seed"; "no task >50 ms; animator ≤1 ms/frame;
  decoded stage memory ≤64 MB; layout/paint on overlays only; lazy chunk grows ≤4 KB". Seam floor: see decision 2.

### W7. Changed-look frames (v2.7 28 product pieces, v2.7 20 on-demand)

- What: an on-demand look set generates its blink/talk frames after the still, applies only current owned results,
  and refreshes the actor's frame map so the new look animates. Cache keys follow v2.7 18 §3.
- Model input: no.
- Gate: D (v2.7 28 step 2: cache, stale result, cancellation between frames, correct base/alpha) + LI + LT or RP
  (image/read/reply with an appearance change + expression switch).
- Floor (v2.7 20, verbatim): a reply can wait for "at most the one edit in progress"; plus the W6 QA floor on look frames.

### W8. Living cards: S32-1 and S32-2 (v2.7 20; R5)

- What: S32-1 re-run from zero on the RunPod main model, unchanged fixture (3 members, one visual change, 10 replies
  each, N = 30 per arm, arms depth 1 / depth 4 / no block, second-model rater). S32-2 full matrix: 5 looks ×
  neutral + 3 expressions on ≥ 3 characters, plus lifecycle (cache reuse, supersession, reopen, rollback, new chat,
  text wait). `cardOverlay` and `onDemand` stay default off until their rows pass ×2.
- Model input: yes (`cardOverlay` block, S32-1 arms only).
- Gate: D (v2.7 20 §Gates D rows) + RP (S32-1 ×2) + LI + LT/RP (S32-2).
- Floors (verbatim): S32-1 "≥90% of mentioning replies agree with Y and ≥15 mentioning replies per arm; the baseline
  arm must be worse". S32-2 "≥90% "same character" and ≥90% "changed attribute visible"; time-to-first-frame recorded
  (no floor; never blocking)". Not retuned; prior rounds retained (R5).

### W9. Docs and Help (v2.7 17 §G, v2.7 24 G)

- What: `docs/guide/setup/images.md` (route A first, ComfyUI optional, model files as suggestions, no FLUX, broker
  as advanced and optional, privacy per backend); sprites/frames/looks guide; registry + Help for every `so-*` control;
  settings reference, README feature table, What's new.
- Model input: no. Gate: D (registry test, docs drift tests). Floor: registry test green.

## Order and dependencies

1. W2 + W4 (deterministic refactors; W4's bundle guard before any live row).
2. W1 + W3 (route acceptance needs W2's discovery defaults).
3. W5 (builder) → W6 (frames use W5's packs) → W7 (look frames need W5 + W6).
4. W8: S32-1 any time after step 1 (independent of images); S32-2 after W7.
5. W9 last, against the shipped UI.
6. Phase C (v2.7 39) re-runs every row ×2 on the frozen candidate; this plan's records are inputs, not acceptance.

## What moves out

- **v2.7 31 (FLUX out, tooling split):** FreeToken notes (23), FLUX spikes (25), FLUX family/recipe/background
  default, this machine's model table, reserves and ports, `so-saga-low-memory.mts` adapter page. The warm-batch
  lease (`batchHost.ts`, `batchLease.ts`; no production caller, only `scripts/debug/lib/lowMemorySpriteBuilder.ts`)
  stays dev-only behind a dynamic import.
- **v2.8 28 (broker in the ST plugin):** the residency controller core (v2.7 22), v2.7 24 F residency integration,
  RAM/GPU admission. Until it ships, the broker is optional, fail-open and never required (R7).
- **v2.7 38 (campaign):** the eight Saga base packs (238 frames) and 31 authored outfits, campaign living-card field
  generation, Saga integration ×2, Saga production rollout (v2.7 28 steps 1, 3, 4, 6, 7). They use this plan's
  product; they do not gate it.

## Decisions for the user

1. Mouth default `simple` (two-frame) on your stated preference, S28 blind pass closed by you, recorded as your
   decision and not as a measured pass? **Recommended: yes.**
2. With the blind pass closed, keep the seam/pop floor ("seam or pop visible in ≤5% of rated clips") as a
   second-model check on Phase C clips, or drop it? **Recommended: keep it, second-model rated** (rule 11; it catches
   a regression your approval of one pack cannot).
3. Render default 1024/25 (what the approved Saga packs used) with 512/20 as an opt-in "fast" preset, or 512/20 as
   default? **Recommended: 1024/25 default, 512/20 opt-in**; 512/20 was approved only as a Belle preview.
4. Route B with one compatible model per family: pick it automatically, or always ask for a mapping?
   **Recommended: pick when exactly one, ask (Repair row) otherwise.**
5. `cardOverlay`: re-run S32-1 ×2 on RunPod in this plan and promote only on a full pass including "baseline worse",
   else keep off? **Recommended: yes; keep off by default otherwise.** Round 2's 100 % baseline suggests the block may
   not be needed on this model.
6. On-demand looks after S32-2 passes ×2: on by default, or author opt-in per story? **Recommended: stay off by
   default in v2.7; author opt-in.** It renders on the player's GPU without asking.
7. Warm-batch lease: a `__SO_DEV__` dynamic import (v2.7 31 §B), or out of `src/` entirely into `scripts/`?
   **Recommended: dynamic import as v2.7 31 says**; production keeps per-image leases either way.
8. GPU plugin: keep it public and optional with config-only ports and adapters `none`/`unsloth`/`managed`
   (URL required), or move the whole plugin to private tooling? **Recommended: keep optional, fail-open**
   (v2.7 17 decision 4); the controller core is v2.8 28's question.
9. Multi-character acceptance cast: a test cast created for the runs (marker-scoped, cleaned up), with campaign art
   only as extra evidence under the no-spoiler rule? **Recommended: yes.**

## Links

v2.7 17, 18, 19, 20, 21, 24, 26, 28 (sources); v2.7 31 (FLUX removal, tooling split); v2.8 28 (broker in the ST plugin); v2.7 38 (Saga assets);
v2.7 39 (Phase C); v2.7 01 (registry, Help); v2.7 02 C6/C7 (image spoiler rules); v2.7 04 (check registry);
v2.9 05 (rig option D, per-chat avatars). Evidence of the earlier slices: `test/measurements/v2.7/{s28,s32-1,s32-2,
image-completion,sprite-quality,saga-main-cast}/`.

## Unresolved questions

- RunPod budget for S32-1 ×2 and the W6 streamed runs.
- Whether the W2 sanitize should keep a user's own explicit FLUX checkpoint mapping on an SDXL-family row (it would
  render with the wrong graph) or drop it with a Repair row.

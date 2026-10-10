# Plan 33 — Pose library, cheap re-posing and looks that change with the story

**Status: SEEDED 2026-10-10 from the owner's request; needs owner pick on the options (§Decisions); not built.**
Overview: `00-overview.md`. Queue: `32-queue.md` A22. **Gate tiers:** implementation D; acceptance LI (local ComfyUI
on the 3090 through the v2.8 28 broker), no RP.

The owner's words (2026-10-10): "add a plan to review https://github.com/shinshin86/mesh-avatar-studio vs our current
taking sprites, and the possibility of having a list of poses a character can take, a long library, and then we can
easily rebuild each avatar to any pose cheaply. Also how could we ease the customizability of our characters as the
story progresses".

Sources read 2026-10-10: mesh-avatar-studio at `6f6d362` (shallow clone in `C:\dev\st-extensions-research\mesh-avatar-studio`),
story-orchestrator master `aef0ec08`, branch `v2.8-media-stack` `81c27515` (v2.8 28 built), the local ComfyUI
(`C:\dev\ComfyUI`, models in `C:\dev\models`). Web facts about third-party models are upstream claims, marked
"not re-checked" where nothing here verified them.

## 1. What mesh-avatar-studio is (verified from the repo)

- **What:** one illustration → a Live2D-style 2D mesh avatar that blinks, talks, turns its head, breathes and sways
  its hair (`README.md`). A browser editor (React + Vite) with a live preview, a Live page driven by webcam face
  tracking (MediaPipe) and an OBS stream view.
- **How:** a coding agent with strong vision (README names Claude Opus 5.5 or GPT-6.1 Sol) follows
  `docs/agent-guide.md`: a vision calibration test, zoomed coordinate grids, a hand-placed `rig.json` (head/face
  ellipses, eye polygons, mouth line, hair strands, chest, optional hand), then `tools/build-layers.py` (Python,
  numpy + OpenCV, CPU) cuts the image into layers (`built/`: base, eye ball/lash/crease layers, hair mask, hand).
  `reference/engine/*.js` deforms the mesh in WebGL from parameters (`angleX/Y/Z`, `bodyAngleX/Z`, `armAngle`,
  `handAngle`, gaze, eye open/smile, mouth open/form, brows). Optional "drawn variants" (closed/half/smiling eyes,
  four vowel mouths) come from an external image generator through edit masks (`tools/variant-requests.py`,
  `build-sprites.py` rejects any change outside the mask).
- **Range:** head turn about ±30°, body roll about ±10° (`docs/rig-fields.md` `head.maxRoll`, `body.maxRoll`), a small
  arm/hand rotation, 8 expressions (`neutral, smile, shy, surprise, halfLidded, angry, sad, wink`,
  `docs/reference.md` §Expressions), keyframed motions (`reference/engine/motions.js`: nod, tilt, think, giggle…).
  Input must be front-facing head and shoulders (`agent-guide.md` §The image). **It cannot change the pose**: no
  sitting, kneeling or fighting; the body is the one drawn in the source.
- **Outputs:** a live WebGL avatar (in-page or OBS), and PNG review frames at fixed parameter poses
  (`npm run render-poses`). No ST sprite export.
- **Hardware:** no ML model at runtime; CPU for the layer build, WebGL in the browser, MediaPipe Face Landmarker only
  for webcam tracking. It runs anywhere ST runs, 0 GB of VRAM; nothing competes with ComfyUI or a local text model.
- **License:** code MIT (`LICENSE`, © Yuki Shindo); MediaPipe Apache-2.0 (`vendor/mediapipe/LICENSE`); the sample
  character is **not** MIT and may not be redistributed (`samples/miko-qipao/MIKO_ASSET_TERMS.md`).
- **Prior decisions it touches:** it is v2.7 19 option D (layered 2D rig), deferred to v2.9 05.1, a route the owner
  dropped on 2026-09-29. It is lighter than the See-through + auto-rig chain D assumed (no 12–16 GB build), but the rig
  is placed by an agent per image, and every sprite set (every look) is a new rig.

## 2. What we have (verified)

| Part | Where | What it does |
|---|---|---|
| Builder | `src/sprites/builder/` (`recipes.ts`, `builder.ts`, `lookFrames.ts`, `onDemand.ts`, `batchHost.ts`) | v2.7 18 contract: Qwen Image 2.1 reference edits through ComfyUI route B; recipes `qwen21-card-base` v2 (card art → neutral standing base), `qwen21-face-edit` v4 (head crop → edit → paste per expression), `qwen21-edit` v4, `qwen21-neutral-rest` v1; BiRefNet cutout; QA (alpha, framing drift, size, blank); ledgered writes (`spriteLedger`) |
| Expressions | `recipes.ts:11` | `neutral, happy, angry, worried` built per member; ST's 28 labels fall back through `profile.ts` `resolveSprite` |
| Frames | v2.7 19, `lookFrames.ts`, `animation.ts` | blink and talk frames per label, edited from that label's sprite |
| Stage | `src/sprites/stage.ts`, `direction.ts`, `VnStage.tsx` | set choice `effects.stage` set > card set (`profile.ts:137` `cardSet`) > keyword > checkpoint/place; framing full/thigh/close |
| Living cards | v2.7 20, `src/engine/cardFields.ts`, `schema.ts:315` `CardBinding` | `roster[].card.fields` bound to blackboard qualities, `effects.card` entry writes, `cardOverlay` block (on, `sprites/settings.ts:49`) |
| On-demand looks | `builder/onDemand.ts`, `lookApply.ts` | a changed visual field with no matching set renders `look_<hash8>` from the default sprite, current expression first; on by default (`sprites.onDemand`, `settings.ts:50`) |
| Server plugins | `server-plugin/story-orchestrator-media` (ComfyUI jobs, files), `story-orchestrator-gpu` | the GPU broker is built in-process on `v2.8-media-stack` (v2.8 28, `81c27515`); v2.8 29 (ST workflows per purpose) and v2.8 30 (model downloads) are approved, not built |
| Local install | `C:\dev\models` | Qwen Image 2.1 int8 (7.3 GB) + Qwen3-VL 8B int8 encoder (9.4 GB), SDXL Illustrious and NoobAI checkpoints (6.9 GB each); **no ControlNet, IP-Adapter, CLIP-vision or LoRA files**; custom nodes RMBG, See-through, MVAdapter |
| Campaign approach (general terms) | campaign repo, v2.7 18 §Why | per character, a list of sets (outfits, action stances) rendered at build time by crop → edit → paste from the card art, skip-if-exists, in night runs on the 3090 or a pod. **Each action stance is a per-character text instruction**; there is no shared pose list, so the same stance is re-described and re-rendered per character |

Seconds per edit on the 3090 are not recorded in any plan record (v2.7 19 §Unresolved still asks); this plan measures
them in S0.

## 3. Comparison

| | mesh-avatar-studio | Our sprites (Qwen edit per set + expression) |
|---|---|---|
| Quality | the source art's own pixels; motion is smooth and live; closed eyes need drawn variants or show fragments | a new image per set; art style held by the reference; occasional drift, caught by QA and the 4-candidate base pick |
| Consistency across poses | perfect inside its range, but the range is head/face/breath only; no new body poses | identity per v2.7 24 record (base candidates 8/8 same character); a new stance is a new edit, consistency not measured across stances |
| Cost per new pose | ~0 inside the range (a parameter vector); impossible outside it | one full edit at 1024 (time not measured; S0) plus one head edit per expression used |
| Render time on a 3090 | real time, no GPU model | not measured; S0 records it |
| Setup cost | per image: a vision-agent session (calibration, grids, rig, three review rounds), then optional masked variants; per look: a new rig | per member: base pick from 4 candidates; per look: on demand, automatic |
| Licensing | MIT code, Apache-2.0 MediaPipe; sample art not redistributable | ours; Qwen Image weights (Apache-2.0 upstream, not re-checked for 2.1) |
| Fit with ST expression sprites | none built in: it renders a WebGL canvas, not `characters/<name>/<set>/<label>.png`; 8 expressions vs ST's 28 labels; head-and-shoulders input vs our full/thigh framing | native: ST's folder layout, labels and fallback chain |

**Verdict:** mesh-avatar-studio solves live micro-motion on a bust, not posing. It does not answer "any character in
any pose". It stays a candidate for v2.9 05.1 (close-shot live head, reopen trigger unchanged), not this plan.

## 4. Pose library

### The idea

- One shared library of named, tagged poses, declared once: `stand_relaxed`, `stand_arms_crossed`, `sit_chair`,
  `sit_floor`, `kneel_one`, `crouch`, `walk`, `run`, `fight_guard`, `fight_swing`, `cast_two_hands`, `point`,
  `wave`, `lie_side`… Tags: `standing | sitting | kneeling | moving | fighting | casting | gesture | lying`, plus
  `framing` (full, thigh, close) and `props` (chair, weapon, staff) so a pose needing a prop says so.
- A roster member opts into poses (or takes the library), a checkpoint directs one (`effects.stage`), and any member
  can be rendered into any pose on first need, then cached.
- Pose × look × expression is the explosion v2.7 20 already met for looks. The answer is the same: layers, a cache
  key, and render on first need. A pose renders **once per (member, look)** as the body; expressions are cheap head
  edits on that body (the existing `qwen21-face-edit` crop → edit → paste); frames follow v2.7 19.

### Options for re-posing

| # | Option | Per-pose cost (3090) | Identity to expect | VRAM | Cached | Library entry |
|---|---|---|---|---|---|---|
| P1 | **Mesh/rig re-posing** (mesh-avatar-studio, or v2.9 05.1's See-through + rig) | ~0 at runtime | perfect (same pixels) | 0 (WebGL) | the rig per (member, look) | a parameter vector (`angleX/Y/Z`, `bodyAngleZ`, `armAngle`, expression) | 
| P2 | **Skeleton-guided reference edit on Qwen Image** (the model we run): the member's look base + a rendered skeleton image as a second input, "same character, take the pose in image 2" | one full edit (S0 measures; estimate 30–90 s at 1024) | as today's edits for the face and outfit; pose fidelity unknown | ~17 GB resident (7.3 + 9.4 GB weights, measured file sizes); exclusive lease while the text model is unloaded | look base, pose body PNG, keypoints | keypoints JSON (OpenPose 18-point body), tags, framing, a one-line pose text, props |
| P3 | **Text-only reference edit** (what the campaign does today): the instruction names the pose, no skeleton | same as P2 | same as P2; the pose varies per member and per seed | same as P2 | same as P2 | tags + pose text only |
| P4 | **SDXL + ControlNet OpenPose + identity adapter** on the Illustrious/NoobAI checkpoints: OpenPose ControlNet for the pose, IP-Adapter Plus from the look base or a per-member character LoRA for identity | one SDXL render + cutout (estimate 10–20 s) | IP-Adapter: style and face close, outfit details drift; LoRA: high, after training (estimate 30–90 min per member on the 3090); PuLID/InstantID: tuned for real faces, and InsightFace weights are non-commercial (v2.7 19 rejected the same detector) → **not used** | ~8–12 GB | CLIP-vision embedding or the LoRA file per (member, look) | the same keypoints JSON + tag prompt |
| P5 | 3D proxy (MVAdapter multi-view, a mesh, pose, re-render) | minutes | low on anime art | high | a mesh | a 3D pose | 
| P6 | Video frames (Wan 2.2 image-to-video) | minutes per clip | drifts; no alpha | 24 GB | — | — |

- **P1** gives micro-poses, not a library: it cannot sit, kneel or fight.
- **P2 needs one thing verified:** whether Qwen Image 2.1's encoder node (`TextEncodeQwenImage21`, inputs
  `images.image_1`…, `recipes.ts:47`) takes a second image and follows a keypoint map. Qwen-Image-Edit-2509 advertised
  native keypoint-map conditioning (https://huggingface.co/Qwen/Qwen-Image-Edit-2509, not re-checked for 2.1). No new
  weights, no new node for the render; skeleton images are drawn in the page from keypoints, so the repo carries no
  binary and no third-party pose art.
- **P4 needs new files** (none installed): an OpenPose ControlNet for SDXL/NoobAI, IP-Adapter Plus + CLIP-vision, the
  `ComfyUI_IPAdapter_plus` node (GPL-3.0, runs inside ComfyUI, never shipped by us). Downloads go through v2.8 30
  (confirmed, verified). ControlNet licence per checkpoint family: not re-checked.
- **P5, P6:** rejected (cost, alpha, anime quality; v2.7 19 options E/C).
- **Pose scoring and pose import** need a pose estimator: DWPose (Apache-2.0) through `comfyui_controlnet_aux`
  (Apache-2.0, not installed). The original CMU OpenPose models are non-commercial; only its keypoint format is used.
- **Retargeting:** library keypoints are on a canonical canvas; they are scaled to the member's look base (its alpha
  box and, with DWPose, its own head-to-hip ratio) before rendering, so a short and a tall member keep their proportions.

### Library entry and storage

```json
{ "id": "sit_chair", "label": "Sitting on a chair", "tags": ["sitting"], "framing": "full",
  "props": ["chair"], "text": "sitting upright on a simple wooden chair, hands on knees",
  "keypoints": { "format": "openpose-body18", "canvas": [768, 1152], "points": [[384, 140], "…"] },
  "version": 1 }
```

- **Shipped library:** about 40 generic poses as JSON in the extension (`assets/poses/*.json`, keypoints written by
  us, CC0 intent), versioned per entry; a pose's `version` is part of the cache key.
- **Story poses:** `story.poses.custom[]` (same shape) for a pose a story needs ("kneeling at an altar"), and
  `story.poses.use` (a tag or id allowlist; absent = the whole library).
- **Install-wide poses:** an author's own entries in extension settings, importable from an image through DWPose.
- **Studio:** a Poses list in the Sprites tab (preview skeleton, tags, render this member in this pose).

## 5. Looks that change with the story

### Layers instead of one image per everything

| Layer | Changes with | Rendered as | Re-render when it changes |
|---|---|---|---|
| **Look base** | identity + visual card fields (hair, outfit, equipment, age) | neutral standing, from the card art (`qwen21-card-base`) or an edit of the previous base | that base, then lazily every pose body that is asked for again |
| **Pose body** | pose id + version | the look base re-posed (P2/P3/P4) | only that (look, pose) |
| **Face** | expression label, mood (v2.7 37 mood picks the label) | head crop → edit → paste on the pose body | only that label on that body; mood never renders anything new |
| **Frames** | blink/talk (v2.7 19) | edits of that label | with the label |
| **Decal** (optional) | small marks: bandage, scar, glow, dirt | a masked head or region edit on the pose body | only that region, per body already rendered |

- **Card fields declare their layer:** `roster[].card.fields.<field>.layer: "base" | "face" | "decal"` (default
  `base` for `visual: true`). `hair` and `outfit` are `base`; `injury` is `decal`; `age` is `base` with
  `rebase: true` (new base from the card art plus the field, not from the previous look, so a time skip does not
  stack edits). A field that is not visual renders nothing.
- **Cache key** (extends v2.7 18 §3, consumed unchanged by v2.7 20): `hash(member, look-field values of the layers
  below, pose id + version + retarget, recipe id + version, model content hashes, base sha256)`. Set id stays one ST
  subfolder (`sprites.js:19-37`, `^[a-z0-9_]+$`): `lp_<hash8>` for a (look, pose) body, labels inside it as today.
  Today's default set is the (card look, `stand_relaxed`) body; `look_<hash8>` sets are the (look, standing) case.
- **Composited layers vs full re-render:** true layer compositing (separate hair/outfit/body PNGs stacked per pose)
  needs consistent segmentation in every pose (See-through layers per body), which is fragile and multiplies files.
  This plan re-renders a body when its base changes and keeps compositing only for the face crop (already built) and
  decals. Separate outfit layers stay an unresolved question.

### Author format (proposed; final shape in B1)

```json
"poses": { "use": ["standing", "sitting", "fighting"], "custom": [ { "id": "kneel_altar", "…": "…" } ] },
"roster": [{ "id": "arin", "name": "Arin",
  "sprites": { "pose": "stand_relaxed", "poses": ["fight_guard", "sit_chair"] },
  "card": { "fields": {
    "hair":   { "quality": "arin_hair", "visual": true },
    "outfit": { "quality": "arin_outfit", "visual": true },
    "injury": { "quality": "arin_injury", "visual": true, "layer": "decal" } } } }],
"checkpoints": [{ "id": "ambush", "effects": {
  "stage": { "arin": { "pose": "fight_guard", "framing": "full" } },
  "card": { "arin": { "outfit": "travel cloak over leather armor" } } } }]
```

- Pose choice, highest first: checkpoint `effects.stage.<member>.pose` > a sticky pose keyword (`when.keywords` on a
  pose, same rule as sets) > a pose pick in the classifier chain (judge → LLM → none, like expressions; the reply's
  text against the allowed poses' tags) > the member's default pose.
- Writers of look fields stay v2.7 20's three (entry, extracted, manual). No new writer.

### Player-facing behaviour (defaults all on, owner rule 2026-10-09)

- `sprites.poses` on by default, next to `sprites.onDemand` and `cardOverlay` (both on).
- **Never blocks a reply.** While a body renders, the stage shows the nearest cached body: the same look in a pose
  with a shared tag, else the same look standing, else the previous look in that pose, else the default set. A face
  missing on a body falls back through `resolveSprite` on that body before falling back to another body.
- **Render order:** the requested (look, pose) body at the current label first; other labels on first use; other
  poses only when directed or picked. Never the full matrix up front.
- **Spoiler safety:** a render is queued only from values in this chat's blackboard and poses its applied stage
  direction or the pick named. No prefetch of a later checkpoint's look or pose (v2.8 22's one-checkpoint prefetch
  generates story checkpoints only, never sprite renders). Author pre-renders (Studio, campaign night runs) exist on
  disk but are shown only when selected, as v2.7 20 already rules. Player copy: the v2.7 20 cast chip ("Arin: outfit
  now travel cloak…") for applied values only; a pose change has no chip.
- **GPU:** every render takes a broker lease (v2.8 28); a waiting text request goes first (`textPriority.ts`).
- **Rollback:** the stage reads the blackboard and the applied direction, so a swipe switches back; files stay cached.
- **Cleanup:** v2.7 18 §7 and v2.7 20's reaper cover `lp_` sets through the same `spriteLedger`; nothing unlisted is
  ever deleted.

## 6. Recommendation

**P2 (skeleton-guided Qwen edit) with the layer model of §5**, P3 as its no-skeleton fallback, P4 measured in the
spike as the comparison arm only if the owner approves its downloads. P1 / mesh-avatar-studio: not adopted here; v2.9
05.1 keeps it with its trigger. Why P2: no new model in the default path, the identity behaviour we already measured,
the ST folder layout unchanged, and a library entry that is plain JSON.

| Phase | What | Tier | Gate and predeclared floors |
|---|---|---|---|
| **S0 spike** | 3 synthetic test members (made for the spike, no campaign art) × 8 library poses × arms P2, P3 (+ P4 if approved), at 1024, 2 seeds; plus 2 expressions per body | LI, 3090, text model unloaded through the broker | identity "same character?" ≥ 90 % (second-model rater, v2.7 18 §4); pose match: DWPose on the output vs the target, PCK@0.1 ≥ 0.70 for P2; QA pass (alpha, framing, size) ≥ 90 %; median body render ≤ 90 s, p90 ≤ 150 s; peak VRAM ≤ 22 GB; expression on a posed body: "label visible" ≥ 90 %. P2 is kept only if it beats P3 on pose match at no identity loss (≥ 0.10 PCK gain). Run ×2. |
| **B1 library + bodies** | pose JSON schema + validator, shipped library (~40), story `poses`, `effects.stage.<member>.pose`, `lp_` sets, cache key, skeleton drawing in the page, Studio Poses list, fallback chain | D | `npm run gates`; jest: key changes with pose version / retarget / recipe / model hash; fallback order; spoiler property (the queue never holds a value absent from this chat's blackboard history or a pose never directed or picked); Storybook 390/768/1440 + a11y; registry entry + Help |
| **B2 layers** | card field `layer` + `rebase`, decal edits, lazy re-render on look change | D | jest: a `face` field renders no body, a `decal` change renders only regions of bodies already rendered, `rebase` starts from the card art; rollback ≡ replay on the stage choice |
| **B3 pose pick** | sticky pose keywords, pose pick in the classifier chain | D; CL for the pick | pick accuracy on 40 labelled synthetic replies ≥ 80 % (recorded; on by default per owner rule, floor informational) |
| **Acceptance** | a synthetic 3-member story: 3 looks × 4 directed poses × 3 labels played on a lane | LI ×2 | no reply waits on a render (send→reply latency within +10 % of the no-sprites arm); same floors as S0 on the live renders; cleanup leaves the sha256 inventory unchanged |

**Hardware:** the 3090 (24 GB) is enough: P2 holds ~17 GB of weights, P4 ~10 GB, both only while the text model is
unloaded (broker, v2.8 28). A full-cast pre-render that exceeds one night (members × poses × looks × seconds from S0,
quoted before any run) goes to a pod (RTX PRO 4500 class, 32 GB), budget permitting; none is needed for S0–B3.

## 7. Decisions for the owner

1. Re-posing route: P2 skeleton-guided Qwen edit (P3 fallback)? **Recommended: yes.** Alternatives: P3 only (no
   skeletons), P4 SDXL + ControlNet + IP-Adapter/LoRA.
2. Download P4's files (ControlNet, IP-Adapter, CLIP-vision, DWPose) through v2.8 30 for the spike arm and pose
   scoring? **Recommended: DWPose yes (scoring + pose import); P4 files only if P2 misses its floors.**
3. Layer model (base / pose body / face / decal) with full body re-render instead of composited outfit layers?
   **Recommended: yes.**
4. Shipped library of ~40 generic poses plus story and install-wide custom poses? **Recommended: yes.**
5. mesh-avatar-studio: park with v2.9 05.1 (close-shot live head), no work now? **Recommended: yes.**
6. Pose pick in the classifier chain, on by default? **Recommended: yes (owner rule), after B1–B2.**

## 8. Unresolved questions

- Does Qwen Image 2.1's edit encoder take a second image and follow a keypoint map? (S0 step 1.)
- Seconds per body edit and per head edit on the 3090 (never recorded; v2.7 19 asks too).
- Props: does a pose needing a chair or a weapon render the prop, or must the member carry it as equipment?
- Outfit as a separate composited layer across poses: worth a later spike, or never?
- Pose library licence: CC0 for our keypoints JSON, or the repo's licence?
- Should the campaign's per-character action stances migrate to library poses (a campaign-repo change, not this repo)?

## Links

- mesh-avatar-studio: https://github.com/shinshin86/mesh-avatar-studio (`6f6d362`), `README.md`,
  `docs/agent-guide.md`, `docs/rig-fields.md`, `docs/reference.md`, `reference/engine/`, `LICENSE`
- v2.7 18 sprite generation (contract, cache key), v2.7 19 talking sprites (options C–E, frames), v2.7 20 living
  cards (fields, on-demand looks), v2.7 24 image and local completion (identity record), v2.7 37 character life (mood)
- v2.8 22 living director (prefetch), v2.8 28 GPU broker (`v2.8-media-stack` `81c27515`), v2.8 29 ST workflows,
  v2.8 30 model downloads; v2.9 05.1 layered 2D rig, 05.5 per-chat avatars
- `src/sprites/builder/recipes.ts`, `onDemand.ts`, `lookFrames.ts`, `textPriority.ts`; `src/sprites/profile.ts`,
  `stage.ts`, `direction.ts`, `settings.ts`; `src/engine/cardFields.ts`, `schema.ts:315`;
  `server-plugin/story-orchestrator-media`, `story-orchestrator-gpu`; `.claude/skills/st-image-generation`
- ST: `src/endpoints/sprites.js:19-37,136-138`
- Third party (not re-checked): https://huggingface.co/Qwen/Qwen-Image-Edit-2509,
  https://github.com/IDEA-Research/DWPose, https://github.com/Fannovel16/comfyui_controlnet_aux,
  https://github.com/tencent-ailab/IP-Adapter, https://github.com/cubiq/ComfyUI_IPAdapter_plus

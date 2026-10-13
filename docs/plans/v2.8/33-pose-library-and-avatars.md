# Plan 33 — Pose library, cheap re-posing and looks that change with the story

**Status: S0 pilot (reduced, provisional) run on the 3090 2026-10-11: P2 misses its PCK and label floors, P4 not downloaded, owner decides; B1–B3 deterministic implementation built, D gates green on v2.8-poses 2026-10-10; owner decisions accepted; CL judge leg scored 40/40 twice on lane 36 2026-10-11 (the LLM leg was not exercised: the authoring route was at its usage limit); S0 and LI acceptance owed, not accepted.**
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
any pose". The owner moved it into the separate v2.8-live-head track on 2026-10-10; this worktree builds poses only.

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
spike as the comparison arm only if the owner approves its downloads. P1 / mesh-avatar-studio is the separate v2.8-live-head track, cross-referenced here only. Why P2: no new model in the default path, the identity behaviour we already measured,
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

## 7. Owner decisions — decided 2026-10-10

1. P2 skeleton-guided Qwen Image 2.1 edit accepted; P3 without the skeleton is the fallback.
2. DWPose accepted in principle for scoring and pose import. Build the plumbing and plan 30 catalogue; download nothing until the owner's token and a free 3090. P4 files are only needed if P2 misses its floors.
3. Base, pose body, face and decal layers accepted, with full-body re-render rather than composited outfit layers.
4. About 40 shipped generic poses plus story and install-wide custom poses accepted.
5. mesh-avatar-studio brought into v2.8 as a separate track on `v2.8-live-head`. Cross-reference only here; that branch owns its build.
6. Classifier-chain pose pick accepted, on by default. The CL floor remains informational.

### Original proposal and live-head cross-reference

1. Re-posing route: P2 skeleton-guided Qwen edit (P3 fallback)? **Recommended: yes.** Alternatives: P3 only (no
   skeletons), P4 SDXL + ControlNet + IP-Adapter/LoRA.
2. Download P4's files (ControlNet, IP-Adapter, CLIP-vision, DWPose) through v2.8 30 for the spike arm and pose
   scoring? **Recommended: DWPose yes (scoring + pose import); P4 files only if P2 misses its floors.**
3. Layer model (base / pose body / face / decal) with full body re-render instead of composited outfit layers?
   **Recommended: yes.**
4. Shipped library of ~40 generic poses plus story and install-wide custom poses? **Recommended: yes.**
5. mesh-avatar-studio: park with v2.9 05.1 (close-shot live head), no work now? **Recommended: yes.**
   **Owner decision 2026-10-10:** brought into v2.8 as [plan 36](36-live-head.md), building on `v2.8-live-head`; posing stays separate.
6. Pose pick in the classifier chain, on by default? **Recommended: yes (owner rule), after B1–B2.**

## 8. Unresolved questions

- Does Qwen Image 2.1's edit encoder take a second image and follow a keypoint map? (S0 step 1.)
- Seconds per body edit and per head edit on the 3090 (never recorded; v2.7 19 asks too).
- Props: does a pose needing a chair or a weapon render the prop, or must the member carry it as equipment?
- Outfit as a separate composited layer across poses: worth a later spike, or never?
- Shipped keypoints are original data with CC0 intent (`assets/poses/README.md`); no third-party pose art was taken.
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

## Gate record

2026-10-10 · `C:\dev\so-poses` · branch `v2.8-poses`. Owner decisions in §7 are decided. Deterministic B1, B2 and B3 are built; S0, CL and LI acceptance are not run or accepted. No GPU, ComfyUI, RunPod, real model, model download, lane 0 or owner ST was used. No live-head implementation is included; `v2.8-live-head` owns that track.

Built: pose schema/semantic validator; 40 original CC0-intent body18 JSON skeletons; story/install libraries and member allowlists; scene pose/framing; sticky keywords and judge → LLM → none picks, on by default; a 40-labelled synthetic-reply fixture and scorer. Lazy canvas/Studio Poses preview, import and explicit author render; wizard tools; author guide, registry/Help and typed nested-field coverage. P2/P3 plan-29 workflow JSON and bundle, not run; plan-30 DWPose ONNX catalogue, installed-file preflight, brokered import/scoring/proportion plumbing, no download.

Bodies use `lp_` sets and cache pose version, retarget/proportion, recipe, model/cutout hashes and base hash. Base/face/decal bindings, card-art rebase, confined region edits, per-label blink/talk frames, first-need rendering, cached nearest-body fallback, ownership/stage checks and rollback/replay path choice are tested. The existing owned sprite ledger/reaper handles these sets. Frames and cached metadata load with their bodies; no future look/pose matrix is prefetched.

Exact command `npm run gates -- --no-storybook --jobs 2`: `gates: all green in 171.6s`; exit 0. Final step result lines:

```text
  ok   test:replay (81.3s, started at 0s)
  ok   build (8.0s, started at 81.3s)
  ok   test (92.2s, started at 0s)
  ok   test:debug (32.2s, started at 89.3s)
  ok   typecheck (35.0s, started at 92.5s)
  ok   typecheck:test (32.4s, started at 121.8s)
  ok   lint (30.8s, started at 127.6s)
  ok   debug:typecheck (11.8s, started at 154.2s)
  ok   test:plugin (8.7s, started at 158.3s)
  ok   test:release (5.5s, started at 166s)
```

Jest: `Test Suites: 1 skipped, 665 passed, 665 of 666 total`; `Tests: 1 skipped, 7704 passed, 7705 total`. `npm run typecheck:test`: `tsc -p tsconfig.test.json`; exit 0 (also green inside gates). `node --test server-plugin/story-orchestrator-media/media.test.mjs scripts/release/poseLibrary.test.mjs`: `# tests 17`, `# pass 17`, `# fail 0`; production webpack JSON-module interop validates all 40 entries. `git diff --check` and `git diff --cached --check`: exit 0. Lint retains the existing `BriefingHost.stories.tsx:81` hook-dependency warning, zero errors.

Earlier exact command `npm run gates -- --no-storybook --jobs 2` was RED at typecheck/typecheck:test/test, then test, then lint, then typecheck:test, then test:plugin. Parser, guide/baseline/census integration, host-import laziness, code-health/style, test syntax and the DWPose allowlist contract were corrected without changing budgets or floors. Focused preflight `npm test -- --runInBand src/sprites/poses src/runtime/codeHealth.guard.test.ts src/runtime/ownership.guard.test.ts src/runtime/errorCopy.guard.test.ts`: `Test Suites: 7 passed, 7 total`; `Tests: 59 passed, 59 total`.

Main bundle: **1,291,918 B / 1,300,000 B**, SHA256 `bdb08fd0d6c0152a74059ca2e6e837fa96821065dfcd885120996e1354807264`; source SHA256 `1adb8169aef295aa97b5b2c47ede184f62660f6c04b3b2a2720f1711f52b23a0`. Shipped skeleton JSON and source JSON now participate in the build's source attestation. All new runtime sprite/UI modules are reached through lazy chunks.

`npm run docs:guide`: `wrote 12 pages to docs/guide/author`; `guide: 32 pages, 1 images`. `npm run docs:settings`: `settings docs: docs\guide\setup\settings-reference.md, README feature table`; `guide: 32 pages, 1 images`.

Owed protocols, **not run**. The following S0 and Acceptance rows are copied unchanged from §6, including their floors:

| Phase | What | Tier | Gate and predeclared floors |
|---|---|---|---|
| **S0 spike** | 3 synthetic test members (made for the spike, no campaign art) × 8 library poses × arms P2, P3 (+ P4 if approved), at 1024, 2 seeds; plus 2 expressions per body | LI, 3090, text model unloaded through the broker | identity "same character?" ≥ 90 % (second-model rater, v2.7 18 §4); pose match: DWPose on the output vs the target, PCK@0.1 ≥ 0.70 for P2; QA pass (alpha, framing, size) ≥ 90 %; median body render ≤ 90 s, p90 ≤ 150 s; peak VRAM ≤ 22 GB; expression on a posed body: "label visible" ≥ 90 %. P2 is kept only if it beats P3 on pose match at no identity loss (≥ 0.10 PCK gain). Run ×2. |
| **Acceptance** | a synthetic 3-member story: 3 looks × 4 directed poses × 3 labels played on a lane | LI ×2 | no reply waits on a render (send→reply latency within +10 % of the no-sprites arm); same floors as S0 on the live renders; cleanup leaves the sha256 inventory unchanged |

CL: score `test/fixtures/poses/replies.json` with the real classifier chain, all 40 labelled synthetic replies; accuracy ≥80%, recorded and informational, pose pick remains on by default. No mocked-test score is a model accuracy claim. DWPose/P4 downloads remain as §7 decides: owner's token and free 3090 first; P4 only if P2 misses its floors. PCK@0.1 uses distance after canvas scaling divided by the target's longest visible-joint extent, with missing output joints counted as misses.

Storybook interaction/viewport/a11y checks are authored for 390/768/1440 and the new UI parts. `test-storybook:ci` was **not run** in this worktree: its runner resolves the main checkout's stories through the junction. These browser checks are owed from a suitable checkout; no live/browser gate is claimed green.

Deviations: gate runner now accepts spaced `--jobs 2` (it previously ignored that spelling); both spellings have deterministic coverage. Player card layers use the same validated binding type. The ownership census also scans the new Studio async writer explicitly. Optional installed DWPose supplies the base's head/hip proportion; absent files leave alpha-box retargeting available. P3 uses two copies of the character reference without a skeleton when supported, and one reference on a one-image encoder; S0 owes compatibility. Open questions remain Qwen's second-image obedience, identity/timing, prop fidelity and live cleanup inventory. Main budget stays 1,300,000 B.

## Gate record: Storybook assertion repair

2026-10-10 · C:\dev\so-poses · v2.8-poses. The real index-json runner reproduced four failed stories and one passed story: toHaveValue rejected the asymmetric stringContaining matcher although the copied JSON contained sit_chair. Use toHaveDisplayValue with an id regex; connect the 390/768/1440 variants to the runner's testViewport setting. Production code unchanged.

npm run storybook:build: exit 0. Static output served from this worktree at http://127.0.0.1:6006.
node node_modules/@storybook/test-runner/dist/test-storybook.js --index-json --url http://127.0.0.1:6006 --maxWorkers 2 --disable-telemetry PosesList: 1 suite, 5 stories passed; no axe violations; exit 0.
node node_modules/@storybook/test-runner/dist/test-storybook.js --index-json --url http://127.0.0.1:6006 --maxWorkers 4 --disable-telemetry: 120 suites, 760 stories passed in 180.7s; exit 0.

npm run gates -- --no-storybook --jobs 2: exit 0. Storybook was validated separately above.

```text
gates: all green in 195.3s
  ok   test (103.7s, started at 0s)
  ok   build (9.2s, started at 103.9s)
  ok   test:replay (134.4s, started at 0s)
  ok   test:debug (33.4s, started at 113.2s)
  ok   typecheck (23.0s, started at 134.4s)
  ok   typecheck:test (29.9s, started at 146.9s)
  ok   lint (29.1s, started at 157.4s)
  ok   debug:typecheck (10.6s, started at 176.8s)
  ok   test:release (6.4s, started at 187.4s)
  ok   test:plugin (8.7s, started at 186.5s)
  SKIPPED: test-storybook:ci (say so in the gate record)
```

npm run typecheck:test: tsc -p tsconfig.test.json; exit 0. git diff --check: exit 0. Source CRLF preserved. No ST, GPU, downloads or model calls; S0, CL and LI acceptance remain owed.

## Gate record: CL pick accuracy (lane 36, no GPU)

- Date and place: 2026-10-11, `C:\dev\so-poses`, branch `v2.8-poses` merged with master `b1aba6c4` (fast-forward, no conflicts, no generated file touched). Lane 36 only: a fresh seed of the owner's install, started with `image.enabled`, `sprites.enabled` and ST's Image Generation extension switched off in the lane copy before the server started (`so-pose-pick-cl.mts prepare 36`, read back). No owner ST, GPU, ComfyUI, RunPod or download. The TypeSafe key stayed in the lane's ST secrets and was never read or printed (the plugin status shows only `configured: true`).
- Tool: `scripts/debug/so-pose-pick-cl.mts` (pure parts and their node tests in `scripts/debug/lib/posePickCl.mts` / `.test.mts`). It drives the stage's own `StagePoses.pick` in the page (`pickPose` with the shipped `expressionDeps`: the judge `expressions` use, then the LLM leg, then none) for each of the 40 replies of `test/fixtures/poses/replies.json`, one per call, against the shipped 40-pose library (no sticky keyword exists in it, so no reply skips the chain). The page is reloaded with the cache disabled before each run, which empties the judge cache, so run 2 is not a cache replay. The judge call count is taken three ways: every `judge.ask` result in the page, the page's non-cached/never-sent split, and the judge plugin's own `served` counters read before and after.
- Served bundle: sha256 `70b086037015ed95…` (staged build of commit `08667a17`), not the worktree `dist` (`bdb08fd0…`); `git diff 08667a17 b1aba6c4` is empty for `src/sprites`, `src/judge/questions.ts`, `src/judge/client.ts` and `src/services/stHost/sprites.ts`, so the code under test is the code in this tree. Nothing was staged or installed.
- Chain arm, run 1: 40/40 = 100.0 % (floor 80 %, met). Legs: judge answered 40 (40 right), LLM 0, none 0. The 8 replies labelled `none` were all picked `none`. Confusions: none. Judge: 40 asked, 40 sent, 0 cached, 40 answered, no fallback, model `jev-1.13.0`, median 231 ms; plugin `served.byUse.expressions` 0 -> 40.
- Chain arm, run 2 (consecutive, same lane, reloaded page): 40/40 = 100.0 % (met). Legs: judge 40 (40 right), LLM 0, none 0; the 8 `none` replies all `none`; confusions: none. Judge: 40 asked, 40 sent, 0 cached, 40 answered, no fallback, `jev-1.13.0`, median 226 ms; plugin `served.byUse.expressions` 40 -> 80.
- **TypeSafe calls: 80 of the 300 budget** (40 + 40; plugin total 80, all `expressions`, all `typesafe`).
- **LLM leg not exercised.** The shipped LLM leg resolves to the sprite profile or the image director profile; on this lane that is a DeepSeek chat profile, which the rules forbid for this task, so the script routes the LLM leg to the authoring route (opencode `openai/gpt-6.1-sol` through the harness plugin, offered, logged in, model listed) by pointing the leg at a sentinel profile id and answering that one `ConnectionManagerRequestService.sendRequest` from the harness; any request for another profile is refused (`strayRequests` 0). In the chain arm the judge answered every reply, so the LLM leg was never reached. An llm-only arm (`--arm llm`, judge leg not asked) was tried three times to exercise it (13:37, 13:48 and 14:00 UTC): each time the first opencode spawn ran 77 to 81 s and reported its usage limit, and the plugin then held the route for 10 minutes (the other 39 calls of each attempt were refused locally), so 120 calls, 3 spawns, 0 answers. No other model was substituted. The three attempt records are kept as evidence and are not an accuracy: the LLM leg's accuracy, its answer format without a grammar, and its latency against the shipped 15 s limit stay unmeasured and owed until the authoring subscription has headroom (`so-pose-pick-cl.mts run --arm llm --run <k>`).
- Cleanup: `so-run-header.mts diff` before/after: `differences: 0`, `blocking: 0` (`ok: false` only for the stale-dist warning above); `so-assets.mts assert-clean --marker SO-`: exit 0 (the tool creates no assets and restores the sprite `profileId`, the page-only `judge.ask` wrapper and `sendRequest` patch in a `finally`); lane 36 stopped, server down.
- Evidence (private, not in this repo): so-sessions commit `f31dd589`, `evidence/phase-c/v28-poses-cl-2026-10-11/` (82 files, sha256 in `ARCHIVE.json`), committed by explicit path rather than `npm run sessions:archive`, which would also have committed other lanes' pending evidence.
- Floor: informational; the pick stays on by default. The 100 % is on 40 synthetic single-action replies written for this fixture and says nothing about long or ambiguous real replies. The fixture is easy for a model that sees the pose list, so treat this as "the chain works end to end and the judge leg reads clean prose", not as a ceiling.
- Commands: `git merge master`; `node scripts/debug/st-lanes.mts seed 36`; `node scripts/debug/so-pose-pick-cl.mts prepare 36`; `node scripts/debug/st-lanes.mts start 36`; `st-lanes.mts run 36 -- scripts/debug/so-run-header.mts capture --label cl-before`; `st-lanes.mts run 36 -- scripts/debug/so-pose-pick-cl.mts run --arm chain --run 1|2 --label cl-2026-10-11`; `… --arm llm --run 1` (x3, quota); `so-pose-pick-cl.mts summary <dir>`; run-header capture/diff, `so-assets.mts assert-clean --marker SO-`; `st-lanes.mts stop 36`; `so-evidence.mts archive --label v28-poses-cl-2026-10-11 --lanes 36`.
- Still owed: the S0 spike and the LI Acceptance rows (3090, owner go-ahead, A3 first); the LLM leg of the pick on the authoring route.

## Gate record: S0 pilot and DWPose download (A3, 3090, provisional)

- Date and place: 2026-10-11, `C:\dev\so-poses`, branch `v2.8-poses` (`git merge master`: already up to date). The 3090 was granted by the owner for this task until 12:40 local; renders ran 11:17 to 12:09, then GPU idle (see Cleanup). No owner ST, no lane 0, no RunPod, no P4 file, no key read or printed.
- **Scope was reduced by the owner and the floors were not changed.** 3 synthetic members made for the spike (text-to-image, no campaign art), 4 library poses (`stand_arms_crossed`, `sit_chair`, `kneel_one`, `fight_swing`), arms P2 and P3, 1024, ONE seed (1234; bases 1235..1237), 2 expressions per body (`happy`, `angry`), one run. That is 24 body renders and 48 head edits, plus 3 bases. **The full S0 (8 poses x 2 seeds, run x2) is still owed.**
- **Quote before starting** (from 1 measured body, P2 72 s, and 1 measured head edit, 22 s, taken at 11:21): 24 bodies + 48 head edits, median body 65.8 s, median head 22.3 s, about 2,650 s = 44 min, finish 12:06 against the 12:40 stop. **Actual:** the 24 bodies plus 48 heads ran 11:22 to 12:03 (24.0 min of body renders, 17.6 min of head edits), scoring about 1 s per image on CPU, plus an 11-render diagnostic arm (4.1 min). Summed render seconds were 41.6 min against the 44.2 min quoted (6 percent under).
- Step 1, ComfyUI: Qwen Image 2.1 files present (`diffusion_models/qwen_image_2.1_int8_convrot.safetensors`, `text_encoders/qwen3vl_8b_int8_convrot.safetensors`, `vae/qwen_image_2.1_vae_bf16.safetensors`). Node pack `comfyui_controlnet_aux` already cloned at `a587a4c1594524c1d2de5cd1a86cd868ff448e1c` in `C:\dev\ComfyUI\custom_nodes`. `DWPreprocessor` did not import: `skimage` was missing. `pip install --dry-run scikit-image` would add only `scikit-image 0.26.0`, `ImageIO 2.38.1`, `lazy-loader 0.6`, `tifffile 2026.9.20` and touch nothing else, so it was installed; torch 2.12.1+cu130, numpy 2.5.2, onnxruntime 1.30.0 (CPU) and opencv-python-headless 5.0.0.93 are unchanged. The full `requirements.txt` was not run. Note: onnxruntime is CPU only, so DWPose runs on CPU (about 1 s per image).
- Step 2, DWPose download through plan 30's path only: lane 37 (fresh seed after the owner saved the Hugging Face key; `GET /models/keys` answered `huggingface: true`, `civitai: false`), routes `POST /models/plan` then `POST /models/download` for kind `poseModels`, root 0. The installed media plugin config got one added line, `modelRoots.poseModels = ["C:/dev/ComfyUI/custom_nodes/comfyui_controlnet_aux/ckpts/yzd-v/DWPose"]` (the folder was created; the owner's config was backed up first to `C:\dev\backups\story-orchestrator\media-config-before-a3.json`; a running owner ST reads it only after its next restart). `df -h /c` before: 76 GB free; the card said `fits: true`. Results: `yolox_l.onnx` 216,746,733 B, sha256 `7860ae79de6c89a3c1eb72ae9a2756c0ccfbe04b7791bb5880afabd97855a411`; `dw-ll_ucoco_384.onnx` 134,399,116 B, sha256 `724f4ff2439ed61afb86fb8a1951ec39c6220682803b4a8bd4f598cd913b1843`. Both equal the plan card's LFS sha256 and an independent `sha256sum` of the files on disk. Hugging Face revision `1a7144101628`. No other file was downloaded.
- Tool: `scripts/debug/so-pose-s0.mts` (driver, direct to ComfyUI `:8188` through the shipped graph shape in `scripts/debug/lib/poseS0Graph.mts`), pure parts in `lib/poseS0.mts` (PCK, retarget, head box, quote, verdict, VRAM peak, shape PCK), pixel work in `lib/poseS0Pixels.py` (comfy python: skeleton drawing, crop, paste, QA, contact sheets). Node tests: `poseS0.test.mts` and `poseS0Graph.test.mts` (the graph test also fails if the shipped `recipes.ts` instruction strings drift).
- **Timing (3090, Qwen Image 2.1 int8, 25 steps, 1024):**
  - Body render (edit graph with the cutout, 2 references): n 24, median 59.7 s, p90 59.8 s, min 57.7 s, max 71.9 s (the first body, cold). P2 and P3 cost the same (P2 median 59.7 s, P3 median 59.7 s).
  - Head edit (crop, edit, paste): n 48, median 22.3 s, p90 22.3 s.
  - Base text-to-image plus cutout: 32.5 s, 25.3 s, 25.3 s.
  - **Peak VRAM: 19,317 MiB (18.9 GiB)** by `nvidia-smi` every 500 ms from 11:17 to 12:09, whole GPU including about 0.85 GiB the desktop holds, text model unloaded (controller `unload` before, `free-images` and `stop` after).
- **Pose accuracy** (DWPose on each output, body18, vs the retargeted target skeleton, PCK@0.1 per §6; missing output joints count as misses; mean over 12 bodies per arm):
  - P2 0.472, P3 0.278, gain +0.194. By pose (P2 / P3): `stand_arms_crossed` 0.43 / 0.41, `sit_chair` 0.43 / 0.24, `kneel_one` 0.37 / 0.11, `fight_swing` 0.67 / 0.35. One P3 body (`kneel_one`, third member) gave DWPose no person (0).
  - Diagnostic only, not the predeclared definition: "shape PCK" (target refitted to the output's own joint extent, so a global stretch or shift is ignored) P2 0.931, P3 0.904.
- **QA** (alpha present, subject framed inside the canvas, size equal to the base, not blank): P2 10/12 = 83.3 %, P3 12/12 = 100 %, both arms 22/24 = 91.7 %. The two P2 failures are one `sit_chair` and one `fight_swing` body whose figure touches the top or bottom edge (the `fight_swing` one also a side edge). Head edits: 48/48 changed at least 5 pixels, 100 %.
- **Identity ("same character?"), PROVISIONAL, scored by the session (this agent reading the PNGs), NOT an independent second-model rater** (the opencode route is over its usage limit, so no second rater was available). 24/24 same character, P2 12/12 and P3 12/12. Anomalies recorded, not scored as identity misses: the third member's P2 `fight_swing` body has four boots (duplicated legs); the third member's P3 `kneel_one` body sits on the floor instead of kneeling on one knee; every `fight_swing` body invents a weapon the base did not carry.
- **Label visible** (an expression readable on the posed body, also scored by the session): 37/48 = 77.1 %, with the product's shipped head box (`poseHead` from the retargeted target skeleton). The 11 misses are all bodies whose rendered head sits below the target head, so the box shows hair and eyes or a hat only. Diagnostic arm, same 11 edits with the box taken from DWPose on the rendered body (`heads-outbox`): 9 of 11 become readable, 46/48 = 95.8 %; the 2 left are the third member's P3 `kneel_one` body, where DWPose found no person and the target box was reused.
- **Floors vs result (not retuned):**
  - identity >= 90 %: 100 % (provisional, session rater), met.
  - PCK@0.1 >= 0.70 for P2: 0.472, MISSED.
  - QA >= 90 %: 91.7 % over both arms, met; P2 alone 83.3 %, missed.
  - median body <= 90 s: 59.7 s, met. p90 <= 150 s: 59.8 s, met.
  - peak VRAM <= 22 GB: 18.9 GiB, met.
  - label visible >= 90 %: 77.1 % with the shipped box, MISSED (95.8 % with the output box, diagnostic).
  - P2 kept only if it beats P3 by >= 0.10 PCK at no identity loss: +0.194 and identity equal, met.
- **Decision, provisional:** by the predeclared floors P2 does not pass (PCK 0.472 vs 0.70, label visible 77.1 %), and P3 is worse on pose (0.278), so the written rule gives **P4 needed**. **P4 was not downloaded and needs the owner.** Evidence points at two fixable causes before that spend, so the owner may prefer a second pilot first: (1) `retargetPose` stretches the library skeleton to the base's standing alpha box on both axes, so a seated or kneeling skeleton is drawn as a tall near-standing one (see the target skeleton panels in the sheets); the model follows the pose shape (shape PCK 0.93) but not that stretched placement; (2) the head box comes from that target skeleton, not the render. Both are one-function changes (`skeleton.ts` `retargetPose`, `bodyRenderer.ts` `poseHead` fed from the output's DWPose), then re-measure. This is a recommendation, not a measurement.
- Observations for §8: Qwen Image 2.1's edit encoder takes the second image (`images.image_2`) and the pose changes with it, and P3 with the same reference twice plus pose text also changes the pose, so the answer to "does the encoder take a second image" is yes. Prop fidelity: chair rendered every time in P2 and P3; weapons are invented. First render per arm cold: 71.9 s.
- **Deviations:** rater (session, not an independent model); scope (3 members, 4 poses, one seed, one run, 2 expressions); the renders were driven directly against ComfyUI with the runtime's `editGraph` shape, not through ST/the media plugin jobs and not from the `SO-Pose-P2/P3.json` template files (those were not loaded; lane 37 was used only for the model download); bases are text-to-image at 768x1152 with the BiRefNet cutout, not the card-art base recipe; the QA framing rule and the label-visible and identity ratings are the session's own definitions, written in `lib/poseS0Pixels.py` and `ratings.json`; one extra diagnostic arm (output-derived head box, 11 edits, 4.1 min) and shape PCK were added and are labelled diagnostic; `skimage` and 3 dependencies were installed into the ComfyUI python.
- **Owed:** the full S0 (8 poses x 2 seeds, run x2) and the LI acceptance. **Quote from the measured times:** 96 bodies x 59.7 s = 95.6 min, 192 head edits x 22.3 s = 71.2 min, about 2 h 47 min per run, about 5 h 34 min for two runs (plus 3 bases, about 1.5 min, and DWPose scoring); a P4 arm adds its own download and render time. An independent second-model identity rater and label rater when the authoring route has headroom; the owner's decision on P4 versus a retarget and head-box fix and re-pilot.
- Cleanup and idle GPU: lane 37 stopped. ComfyUI input files `so-s0-*` (90) and the 86 `so-sprite*`/`so-s0-base*` output files this run wrote were removed by exact recorded name (462 other files in `output` untouched), 27 DWPose preview temp files removed; installed files left: the two ONNX files and the `scikit-image` packages. Controller `stop` (status refused afterwards), ComfyUI on :8188 closed, `nvidia-smi` 849 MiB used (the desktop's, 755 to 847 MiB before the task). The private evidence: so-sessions commit `23dd59fa`, `evidence/phase-c/v28-poses-s0-pilot-2026-10-11/` (396 files, sha256 in `ARCHIVE.json`; bases, bodies, heads, targets, raw outputs, DWPose scores, contact sheets, `results.jsonl`, `ratings.json`, `summary.json`, `vram.csv`), committed by explicit path.
- Commands: `git merge master`; `node scripts/debug/st-lanes.mts seed 37 --fresh`; `st-lanes.mts start 37`; `st-lanes.mts run 37 -- scripts/debug/st-eval.mts --file <plan/download snippet>` (plan and download through the plugin routes); `st-lanes.mts stop 37`; `node scripts/local/cli.mjs start|unload|start-comfy`; `node scripts/debug/so-pose-s0.mts vram | bases | body | head | bodies | heads | score | sheets | heads-outbox | summary 18.86`; `node scripts/local/cli.mjs free-images`, `stop`; `node --test scripts/debug/lib/poseS0.test.mts scripts/debug/lib/poseS0Graph.test.mts`: 14 pass, 0 fail.

## Gate record: S0 re-pilot after the retarget and head-crop fixes (2026-10-11, 3090)

- Place: `C:\dev\so-poses`, branch `v2.8-poses` at `ca30e005` (fix) on master `52d50817`. The owner granted the 3090 overnight (until about 23:54); renders ran 16:07 to 16:42 local, then GPU idle. No owner ST, no lane 0, no P4 file, no key read.
- Cause of the pilot misses, measured on the pilot's own evidence (three standing bases with their DWPose):
  - the library skeleton has a long torso and short legs (torso 30 percent of the nose-to-ankle span, legs 51 percent) while real figures measure about 23 and 58 percent;
  - `retargetPose` stretched each pose to the standing alpha box with a separate x and y scale, so seated and kneeling skeletons came out tall and wide;
  - the expression crop used the requested skeleton's head, not the rendered one.
- Fix (`src/sprites/poses/retarget.ts`, `bodyRenderer.ts`, `bodyHost.ts`):
  - bone-length retarget: each bone keeps the library pose's direction and takes the member's own measured length (left and right averaged, foreshortening kept within 0.25 to 1.1 of the library's standing length); without a measurement it falls back to one uniform scale;
  - sitting, kneeling and lying poses rest their lowest joint on the member's floor line; upright, moving and airborne poses keep the standing hip height;
  - the whole figure is shrunk uniformly and shifted to stay inside the canvas;
  - the expression crop is DWPose on the rendered body; a body where DWPose finds no person keeps its neutral render and edits nothing at an unverified head (`headSource: "none"`); an unavailable estimator keeps the old target box (`"target"`);
  - the cache key carries the member's measured skeleton and `RETARGET_VERSION` 2, so old bodies are never reused.
- Same scope as the first pilot: 3 synthetic members (same bases), 4 poses, arms P2 and P3, 1024, seed 1234, 2 expressions per body, one run. The full S0 (8 poses x 2 seeds, run x2) is still owed.
- Results (floors unchanged, not retuned):
  - P2 PCK@0.1: 0.903 (was 0.472), floor 0.70, met; P3 0.690 (was 0.278); gain +0.213, floor +0.10, met;
  - body QA: 12 of 12 on each arm (100 percent; P2 was 83.3 percent), floor 90, met;
  - label visible: 46 of 48 = 95.8 percent (was 77.1), floor 90, met; the 2 misses are the one body where DWPose found no person (P3 kneel, third member), whose edits were skipped, not made;
  - identity: 24 of 24 same character, PROVISIONAL, scored by the session reading every PNG, not an independent second model;
  - body render: median 57.7 s, p90 58.8 s (floors 90 and 150), met; head edit median 23.1 s, p90 31.5 s;
  - peak VRAM about 19.8 GiB (20,242 MiB by `nvidia-smi`, whole GPU), floor 22, met.
- Decision: P2 passes. P4 is not needed and nothing was downloaded. P3 remains the fallback.
- Observations: every fight_swing body invents a weapon the base did not carry; DWPose found no person on one P3 kneeling body, so P3 is the less reliable arm.
- Gates: `npm run gates:quick` green in 90.6 s (typecheck, typecheck:test, lint, related jest, defect replay 32 of 32). Jest: 32 of 32 in `src/sprites/poses`, 8 new. `npm run debug:typecheck` clean; `node --test scripts/debug/lib/poseS0.test.mts` passes. Full `npm run gates` runs at merge.
- Evidence (private): so-sessions commit `244f7fdb`, `evidence/phase-c/v28-poses-s0-repilot-2026-10-11/`.
- Commands: `SO_S0_DIR=C:/dev/so-s0-repilot node scripts/debug/so-pose-s0.mts vram | bodies | score | heads | sheets | summary 19.77`; controller `cli.mjs start | unload | start-comfy`.
- Owed: full S0 x2 on both seeds and 8 poses; an independent identity and label rater; Acceptance through the product path (in progress on lane 40).

## Gate record: full S0 (2026-10-11 to 12, 3090)

- Place: `C:\dev\so-poses`, branch `v2.8-poses` at `3755880a`. 3090 granted by the owner overnight. Driver `scripts/debug/so-pose-s0.mts` with `SO_S0_POSES=full`, run by a chained script, one batch at a time, GPU otherwise idle.
- Scope, as §6 states it: 3 synthetic members (the pilot's bases), 8 library poses (stand_arms_crossed, sit_chair, kneel_one, fight_swing, cast_two_hands, crouch, walk, lie_side), arms P2 and P3, 1024, 2 seeds (1234, 5678), 2 expressions per body, run twice (r1, r2). That is 192 bodies and 384 head edits; 376 head edits were made and 8 were skipped because DWPose found no person on the rendered body (see below). Text model unloaded through the controller.
- Automated results, pooled over the four batches (floors unchanged, not retuned):
  - P2 PCK@0.1: 0.860 (floor 0.70, met); P3 0.642; gain +0.218 (floor +0.10, met). Per batch P2: 0.854, 0.866, 0.854, 0.866;
  - body QA: 96 of 96 on each arm (floor 90 percent, met);
  - body render: median 56.5 s, p90 56.7 s (floors 90 and 150, met); head edit median 21.2 s, p90 21.3 s;
  - peak VRAM 19,944 MiB (19.5 GiB) by `nvidia-smi` every 500 ms across two sampler segments (floor 22 GB, met);
  - head edits: 376 of 376 changed at least 5 pixels.
- Weak poses (P2 PCK pooled): lie_side 0.51 and crouch 0.78 and kneel_one 0.81 are the weakest; cast_two_hands 1.00, walk 0.97, sit_chair 0.94, stand_arms_crossed 0.94, fight_swing 0.93. P3 is much worse on lie_side (0.01) and kneel/crouch (0.43, 0.41): P3 turned the lying pose into a seated one on the sampled sheet. The mean passes; lie_side alone is below 0.70.
- DWPose found no person on 4 bodies in each seed-1234 run (the third member's P2 crouch and P3 kneel_one): 8 expression edits skipped, never made at an unverified head.
- Not independent and not complete, so NOT claimed as floors: identity and "label visible" are provisional. The session read 17 contact sheets (bodies and heads, covering all three members, lie_side, crouch, kneel, walk, cast_two_hands, fight and sit) and saw the same character in every sampled pose and a readable expression in every sampled edit, including lying and crouching. It did not read all 192 bodies and 376 edits, and it is not a second model. The label rate is bounded above by 376 of 384 (97.9 percent) and has no measured lower bound.
- Run 2 reproduced run 1 exactly (same PCK per seed) and rendered at half the time (median 28.3 s per body vs 56.6 s); the cause was not investigated. The floors are scored on all four batches pooled. Run 1 batch 1 was interrupted once (the chain process died, restarted, finished items skipped); no render was repeated.
- Decision: P2 stays (it clears every automated floor on both seeds and both runs). Known limit: a lying pose is not reliable on P2 either (0.51) and is unreliable on P3. P4 not needed, nothing downloaded.
- Evidence (private): so-sessions commit `fc6a4b4c`, `evidence/phase-c/v28-poses-s0-full-2026-10-12/`.
- Owed: an independent second-model identity and label rater over all renders; Acceptance through the product path x2 (lane 40 is rendering the showcase through it); fix or de-list lie_side.

## Gate record: independent rating and the LLM leg (2026-10-12)

- Rater: opencode `openai/gpt-6.1-sol`, one call per contact sheet with the image attached and a JSON-only prompt. 96 sheets: the 48 body sheets and 48 head sheets of run 1, seeds 1234 and 5678. Run 2's sheets are byte-identical to run 1's (cached renders), so they are not rated twice. 96 of 96 answers parsed; none retried to a different answer.
- Identity (same character as the base panel): P2 48 of 48, P3 48 of 48. Floor 90 percent, met.
- Expression label readable: 186 of 190 crops (97.9 percent; P2 92 of 94, P3 94 of 96). Floor 90 percent, met. Not readable: the first member's lie_side P2 happy and angry, and the third member's kneel_one P3 happy and angry. Same face across the four crops of a sheet: 47 of 48.
- Pose follows the skeleton (informational, PCK stays the metric): P2 yes 38, partly 9, no 1; P3 yes 8, partly 32, no 8.
- Defects the rater named: invented prop 6 on each arm (the fight poses), extra limb 1 (P3).
- Result: every S0 floor now has an automated and a second-model result and all are met, on both seeds and both runs. The rater is a model reading contact sheets; no human re-checked it.
- CL LLM leg: NOT exercised. Arm llm on lane 36: 40 harness calls, 40 failures of kind auth, 0 answered (accuracy 0.2 is only the labelled-none rows). Cause: the harness plugin reads only `~/.local/share/opencode/auth.json`, and opencode v2.0.6 does not rewrite that file; its OpenAI OAuth access token expired 2026-10-12 05:29 local. `opencode run` itself works. Needs the owner (a fresh login, or a decision on how the harness finds it). Nothing was changed or retuned.
- Owed: product Acceptance twice (3090, Artemis unloaded), plan 28 and 29 LI (3090).

## Gate record: lie_side geometry repair (2026-10-13, no GPU, LIST)

- Place: `C:\dev\so-build-pose-geometry`, branch `v2.8-build-pose-geometry`, base `ccfdbf95`. Deterministic geometry only. No render, no PCK, no ComfyUI, no model, no GPU, no lane, no download. Owner decision (plan 40): repair the skeleton and retarget math, keep `lie_side` listed pending render and PCK evidence; de-list only if the repair fails. Nothing was removed or disabled, and no failure is assumed.
- Trigger: full S0 P2 PCK for `lie_side` 0.51 against the 0.70 floor (the mean passed). The standing-alpha distortion was already repaired by the bone-length retarget (RETARGET_VERSION 2, re-pilot 0.903); that fix is not redone.
- Defect, measured on the shipped v1 skeleton (all numbers are the library's own, in canvas pixels):
  - Not a lying shape: neck to hip-midpoint at 40.1 degrees from horizontal (right hip 38, left hip 42), neck to nose at -115 degrees (head straight up), legs near horizontal. It is a propped, reclining figure.
  - Trunk bones unequal: neck to right hip 221, to left hip 276 (ratio 0.80); neck to right shoulder 0.62 of the left. The ratios against the standing reference were 0.62 and 0.77, so the retarget (per-bone `own / standing` foreshortening on each side) gave the one measured member two different trunk lengths.
  - Head not foreshortened with the body: head bone 1.05 of standing, trunk 0.62 to 0.77, limbs 0.62 to 0.70. Retargeted head-to-torso 0.42 to 0.43 against the members' own 0.275 to 0.282, on every proportion tried.
  - Same flaw by authored data in `lie_rest` (spine 0.77, shoulders 1.09, head near vertical); every other shipped pose has equal trunk sides (spine and shoulder ratios 1.00, except `stand_back` 1.02 shoulders and `stand_lean` 1.23 shoulders).
- Repair, authored (`assets/poses/lie_side.json`, `version` 1 to 2): one side-lying skeleton, same tag, text, framing and body18 order.
  - Neck (215, 765); torso exactly horizontal; both hips on one vertical (hip half-gap 26), neck to each hip 221.5, so each spine bone is 6.7 degrees off the axis and the mid-point axis is 0.0.
  - One pose scale 0.62 of the standing bone lengths, applied to every bone including the head: head 62, shoulder bones 44 (foreshortened, side-on), upper arm 139, forearm 133, thigh 138, shin 160. Mirrored bones agree to within 1 px.
  - Head along the spine axis, tilted 8 degrees up; eyes and ears are the standing head offsets rotated in plane (mirrored so the right side stays the upper one, as in `lie_back`).
  - Right side upper (shoulder, hip, knee, ankle all above the left), lower arm bent under the head, upper arm resting along the body, legs slightly bent and stacked; all 18 joints visible and inside the 768 by 1152 canvas (x 82 to 730).
- Repair, retarget (`src/sprites/poses/retarget.ts`, `RETARGET_VERSION` 2 to 3): for `lying` poses only, the two spine bones share one length and the two shoulder bones share one length (the mean of the two foreshortened lengths) before placement. Directions, the floor line, the centred position and the uniform fit are unchanged. Reason: a rigid trunk has one length; a measured member's mirrored length is already one value, and an imported (DWPose) or custom lying pose carries unequal sides from perspective. Every other tag keeps the earlier code path exactly.
- Numbers after the repair, synthetic standing skeletons scaled to 4 proportions (small, average, tall and narrow, short and wide) and the alpha-box-only fallback: torso 0.0 degrees from horizontal (was 40.1); spine R/L 1.000 (was 0.80); shoulder R/L 0.998 to 1.003 (was 0.62 to 0.65); head-to-torso 0.273 to 0.281 against the member's 0.275 to 0.282 (was 0.415 to 0.427); figure 389 to 615 wide by 64 to 96 tall (was 340 to 529 by 230 to 360). Geometry JSON and a before/after SVG of these cases were written outside the repo (`%TEMP%\opencode\pose-geometry`), synthetic data only, not committed.
- Tests, `src/sprites/poses/lyingGeometry.test.ts` (38 tests, new) plus the unchanged `retarget.test.ts`, `poses.test.ts`, `bodyRenderer.test.ts`:
  - authored shape: horizontal torso within 3 degrees, head within 15 degrees of the axis, mirrored bones within 3 percent plus 1.5 px, bone ratios to standing within 1.15 of each other (head in proportion), right side above left;
  - four member proportions, `lie_side` and `lie_back`: horizontal torso, every library bone direction kept within 1.5 degrees, each bone at the member's own foreshortened length (rigid trunk mean) under one uniform fit, left and right sides kept, mirrored bones equal, head ratio within 10 percent of the trunk ratio, lowest joint on the member's floor line, centred on the alpha box, inside the canvas, deterministic;
  - missing measurement: alpha box alone scales the library shape uniformly (bone ratios within 3 percent) with a horizontal torso; a member missing arm, leg and hip joints still lands all 18 library joints in the canvas;
  - head box: `poseHead` of the retargeted head stays in the canvas, contains the head joints, and falls back to the alpha box when no head joint exists (semantics untouched);
  - skewed lying skeletons (the v1 data and a constructed one) come out with equal trunk bones and the library axis; the same skeleton tagged `sitting` keeps its earlier unequal lengths;
  - cache identity: the v1 skeleton, v1 version and `RETARGET_VERSION` 2 each give a different body key from the repaired pose;
  - regression: the 37 non-lying poses, with and without a measured member, retarget byte-identically to before the repair (sha256 of their points `94b0e7af5b1a7566c1f72df3fc5445a5d0a0a4f79f0842e59d551c09656b90be`, taken on `ccfdbf95`), so standing, seated and kneeling bodies are not touched by the geometry.
  - pre-fix check (the same tests against the v1 asset and the old retarget): 22 of 38 fail; new asset with old retarget: 3 fail (trunk rigidity twice, version identity); old asset with new retarget: 16 fail.
- Cache and version consequences: `lie_side` bodies change key through the pose `version` and keypoints; `RETARGET_VERSION` 3 changes the key of every body, so every cached `lp_` set is rendered again on first need (no migration; old sets stay on disk under the existing ledger and reaper). A v1 `lie_side` body and the earlier lying-pose retargets never pass as repaired.
- Floors unchanged and not retuned: S0 PCK@0.1 >= 0.70 for P2 (and the +0.10 gain over P3), label visible >= 90 percent, identity >= 90 percent, QA >= 90 percent, body median <= 90 s and p90 <= 150 s, VRAM <= 22 GB. Nothing here is a PCK, identity, label or render result, and numerical geometry does not prove the render follows the skeleton or looks right.
- Deferred, GPU: render `lie_side` (3 members x P2 and P3, seeds 1234 and 5678, run twice) through the S0 driver or the product path with the repaired skeleton, score DWPose PCK@0.1 per pose against the retargeted target (missing joints are misses), and record `lie_side` beside the earlier 0.51; run the head-box and label checks on its bodies; fold it into the product Acceptance twice. If the repaired `lie_side` still misses on P2, record the miss, then the owner's de-list rule applies; `lie_rest` shares the old head and torso flaw in its authored data and is untouched here, so audit it in the same render run.
- Campaign: no field, setting or authored behaviour changed, so the user guide and its generated pages are unchanged and no campaign edit or pin bump is needed; a campaign that directs `lie_side` re-renders it on first need.
- Gates: `npx jest src/sprites/poses`: 6 suites, 70 tests passed. `node --test scripts/debug/lib/poseS0.test.mts scripts/debug/lib/poseS0Graph.test.mts`: 15 pass, 0 fail. `node --test scripts/release/poseLibrary.test.mjs`: 1 pass (production JSON interop, 40 valid entries). `node scripts/suite/defect-replay.mjs --workers 4`: 32 of 32 killed in 126.3 s (the fresh worktree had no replay cache: the first `gates:quick` failed its cached replay step with an empty `jest --listTests` error, cause not investigated; after the full run the cached step passed). `npm run gates:quick`: green in 34.3 s (typecheck, typecheck:test, lint changed, related jest, defect replay cached 29 reused). Full `npm run gates` with Storybook is the parent's merge step.

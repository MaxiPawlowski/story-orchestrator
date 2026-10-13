# Plan 41 — One product: integration review, model selection and the Qwen fast-model POC

Status (2026-10-13): planning only. Owner request: the image and presentation features were built as separate
tracks and never joined into one product; the models and workflows per use case were never chosen against each
other. This plan dumps what exists, names the seams, proposes a tiered model design around a per-character
reference pack, and defines a POC for Qwen's fast image checkpoint. Nothing here is built or measured yet.
Gate tiers: review D (docs), POC LI (3090), product acceptance LI + RP.

## 1. Context dump

### 1.1 Text and judge roles (from AGENTS.md and the route code)

| Role | Model and route | Notes |
|---|---|---|
| Play replies | Artemis 31B v1.1 (Gemma 4), Text Completion, thinking on, preset `Artemis v1.1 RP` | 3090 local at 32,768 context max; RTX PRO 4500 on a pod |
| Shared read, memory, synthesis, director, curator | the install's memory-model profile per `passProfiles` role | lanes route every role to one profile; owner install assignments to be read (task R1) |
| Authoring, wizard, Ask, rating, vision review | opencode `openai/gpt-6.1-sol` through the harness bridge | subscription; harness login currently stale (harness agent fixing transport/auth) |
| Fallback authoring | DeepSeek Chat Completion | pay per token past quota |
| Judge | TypeSafe (Jev) through `story-orchestrator-judge` | every use on; ≤300 calls per task in this pass |
| Local judge | decider-4b | calibrated for memory-pairs only; not routed by default |
| Image prompt director | `image.directorProfileId` (empty = default route) | writes tags for route A |

### 1.2 Image pipelines as built

| Use case | Route | Model and workflow | Settings | Evidence |
|---|---|---|---|---|
| Scene, character, portrait, user, free illustrations | A: ST `sd` or ComfyUI, `src/image` | SDXL families `sdxl-illustrious` (default) and `sdxl-noobai`; per-purpose checkpoint, LoRAs, hires 1.5x; Flux retired | 28–30 steps, 832x1216 buckets, 1 candidate | v2.7 records; quality never compared against Qwen |
| Backgrounds | A | same SDXL route, `no humans, scenery`, wide | as above | as above |
| Story-specific workflows | A only | ST ComfyUI workflow per purpose and checkpoint (plan 29) | create-only install | D gates green; LI never run |
| Card base sprite | B: media plugin, `sprites/builder` | Qwen Image 2.1 int8 edit, recipe `qwen21-card-base` v2, 4 candidates, BiRefNet cutout | 1024, 25 steps | v2.7 24 identity 8/8 |
| Expressions, blink and talk frames | B | Qwen 2.1 crop → edit → paste, `qwen21-face-edit` v4 | 1024/25 standard, 512/20 fast | head edit median 21.2 s |
| Looks (living cards, on demand) | B | Qwen 2.1 `qwen21-edit` v4 from the default sprite | on demand, current expression first | five-look identity ×2 (v2.7) |
| Directed poses | B | Qwen 2.1 + skeleton image (P2), P3 text fallback; DWPose scoring/import | 1024, 25 steps | full S0 PCK 0.860, body median 56.5 s, VRAM 19.5 GiB; lie_side 0.51 |
| Live close-shot head | CPU WebGL rig (mesh-avatar-studio port) | per-image rig made by a vision agent, no image model | — | LI2–LI6 pass; LI1 misses by 0.06 ms |
| Contact-sheet rating | Sol vision | — | — | identity 48/48, labels 97.9 % |
| GPU sharing | `story-orchestrator-gpu` broker | swaps Artemis and ComfyUI on one 3090 | adapters none/observe/supervise/managed | D green; LI/LT never run |

### 1.3 Local model inventory (`C:\dev\models`, sizes in GB)

- Qwen Image 2.1 int8 7B (6.8) + Qwen3-VL 8B int8 encoder (8.7) + 2.1 VAE: the only edit model in use.
- Qwen-Image 2512 fp8 20B (19.0) + Qwen2.5-VL 7B encoder (8.7): installed, **not used by any recipe**.
- SDXL: Illustrious (WAI v17), NoobAI (6.5 each), SDXL base, SD 1.5; Flux dev fp8 (16.1, retired).
- BiRefNet HR / toonout (cutout), See-through (layering), RealESRGAN x4 (anime and general), DWPose ONNX.
- Text: Artemis 31B Q4_K_M (17.4), Qwen3.8 27B Q4/Q5 with vision projector (16–18, unused), MTP drafts.

### 1.4 Feature map: built separately, never one flow

| Feature | Plan | State | Joins to |
|---|---|---|---|
| Wizard story + cast provisioning | 09 | shipped; makes cards, **no art** | nothing visual |
| Illustrations, backgrounds, story workflows | v2.7, 29 | shipped (route A) | its own model settings |
| Sprite builder, expressions, frames, VN stage | v2.7 18/19 | shipped (route B) | separate model settings |
| Living cards + on-demand looks | v2.7 20 | shipped, on | route B; no live-head rig for a new look |
| Pose library | 33 | shipped, acceptance owed | route B; expressions on the posed body |
| Live head | 36 | shipped | a per-image rig by a vision session; one rig per look |
| GPU broker, downloads | 28, 30 | shipped D | LI never run end to end |
| Showcase | 37 | scripted lane (`so-showcase.mts`) | **art seeded from S0 pilot bases by script, not by the product** |

## 2. Findings

1. **No product path from "new character" to "playable presentation".** Card art is assumed to exist. The showcase
   proves the parts, but its bases come from a debug pilot, not a feature a player or author can run.
2. **Two image routes with two model settings.** Route A (SDXL tags) and route B (Qwen edits) never share a
   character identity: an illustration of a cast member does not use that member's sprites as reference.
3. **Model choices were made per track, not per use case.** SDXL was kept for illustrations from v2.7; Qwen 2.1
   for edits because it could reference the card. No side-by-side on quality, identity, latency or VRAM.
4. **Unused capability.** Qwen 2.1 accepts up to 10 reference images and outputs native RGBA; we pass at most 2
   images and still run BiRefNet. Qwen-Image 2512 (20B) sits unused. The local vision LLM is unused.
5. **Looks do not reach the live head.** An on-demand look gets sprites, but the rig is per image and made by a
   vision session, so the close shot falls back to static art after a look change.
6. **Licence record is wrong.** Plan 33 says Qwen 2.1 weights are Apache-2.0 "not re-checked". The model card
   says Qwen Research License (non-commercial). Acceptable for this private single-user plugin; record it.
7. **Cost is unmeasured end to end.** Per-image seconds exist for poses only; a full cast prepare (base, 4
   expressions × frames, looks, poses) has no total, and it competes with Artemis for the one 3090.

## 3. Proposed design: a character reference pack and two model tiers

Owner idea, made concrete: spend quality once per character, then reuse it cheaply everywhere.

1. **Reference pack at card creation** (new, quality tier). From the card art or a description, render a
   small, QA'd identity set: neutral full body (the sprite base), a front close bust (live-head source),
   three-quarter and side views, and 2–3 expression heads. Native RGBA. Picked by candidates + a rater; the
   author approves once. Stored beside the card with hashes; every later key includes the pack hash.
2. **Fast tier for everything downstream**: expressions, frames, looks, poses, and cast-aware illustrations, each
   conditioned on 2–4 pack images through multi-reference editing instead of one card crop.
3. **Illustrations join the cast**: a scene that names members passes their pack images to the fast edit model
   (Qwen) for in-character scenes; SDXL stays for cast-free backgrounds and style-specific scenes until measured.
4. **Live head from the pack**: rig the pack's bust once per character; looks reuse the rig by editing only
   texture regions (measure first; fallback stays static art).
5. **One image settings model**: per use case, a tier (`quality` | `fast`) and a route, shown in one table in
   Defaults → Images; the broker schedules quality jobs off the play path.

Candidate per tier (to be measured, not decided):

| Use case | Quality tier candidate | Fast tier candidate |
|---|---|---|
| Reference pack, hero card art | Qwen-Image 2512 20B, or Qwen 2.1 at 40 steps | — |
| Expressions, frames, looks | — | Qwen 2.1 Turbo, 8 steps, multi-reference |
| Poses | — | Turbo + skeleton (P2 shape), compare against current 25-step 2.1 |
| Cast scenes | Qwen 2.1 multi-ref | Turbo multi-ref |
| Backgrounds, cast-free scenes | SDXL Illustrious/NoobAI (current) | Turbo |

## 4. POC: Qwen's fast checkpoint

**What "Qwen Image Flash" is.** Qwen-Image-Flash is Qwen's few-step distillation recipe (arXiv 2606.03746, on
Qwen-Image 2.0). The open-weight fast checkpoint we can run locally is **Qwen-Image-2.1-Turbo** (released
2026-10-09): same 7B architecture and Qwen3-VL 8B encoder as our installed 2.1, 8 steps instead of 40, 2K
output, multi-reference editing, RGBA, Qwen Research License. Hosted Turbo is about CNY 0.1 per image. Step R0
confirms whether a separate "Flash" open checkpoint exists; if so it joins the POC as a further arm.

**Prerequisites (owner OK each):** download approval and space check (`df -h /c`, keep 30 GB free; target
`C:\dev\models`); ComfyUI support for the Turbo schedule (Diffusers needs explicit sigmas; check the shipped
`QwenImage21` nodes, else a node update, which needs approval); a 3090 window with Artemis unloaded; no lane or
campaign art in the public repo (synthetic showcase members only).

**Arms** (same 3 synthetic members as S0, seeds 1234 and 5678, run twice):
- B: current Qwen 2.1 int8, 25 steps, 1–2 references (baseline, reuse S0 numbers where identical).
- T: Turbo, 8 steps, same references.
- T+R: Turbo, 8 steps, 4 pack references.
- Q (pack only): Qwen-Image 2512 vs 2.1 at 40 steps for the reference pack; quality tier choice.

**Tasks measured:** card base, 4 expressions, talk/blink frames, one look, 8 library poses (P2 shape), one
two-member cast scene; native RGBA vs BiRefNet cutout.

**Floors, predeclared (not retuned after the run):**
- Identity ≥ 90 % same character (second-model rater, never the owner), and no worse than B by more than 5 points.
- Expression label readable ≥ 90 %; pose PCK@0.1 ≥ 0.70 pooled and lie_side recorded on its own.
- Fast tier median latency ≤ 40 % of B on the same task; peak VRAM ≤ 22 GB.
- RGBA: alpha QA pass ≥ 90 % with no cutout node, else BiRefNet stays.
- Pack: author-facing pick rate recorded; rater prefers the quality-tier pack over B in ≥ 60 % of pairs.

**Decision rule:** Turbo replaces 2.1 for a task only where it meets every floor; otherwise that task keeps 2.1.
Misses are recorded, not retuned. Cache keys change through the recipe id, so old sets are never reused.

**Tooling:** extend `scripts/debug/so-pose-s0.mts` (renders, PCK, sheets, VRAM sampler) with a model arm and
the extra tasks; reuse the Sol contact-sheet rater (needs the harness login) or the local Qwen3.8 vision model
after a calibration row; evidence private (`so-evidence.mts archive`).

## 5. Integration: one end-to-end flow

Target journey, run twice on one frozen build: create a story and cast in the wizard → reference pack per
member (author approves) → sprite set, expressions, frames → directed pose → live head on the bust → play with
Artemis streaming → a look change mid-scene (sprites, close shot, illustration all follow) → cast-aware
illustration and background → swipe/delete/reload/chat switch → nothing stale, GPU idle after.

Phases (each its own gate record):
1. **R — review tasks (no GPU):** R0 model facts (Flash vs Turbo, ComfyUI support, licences); R1 read the owner
   install's role and image route assignments (no secrets); R2 per-use-case latency/quality table from existing
   records; R3 seam list with file owners; R4 cost model for a full cast prepare.
2. **P — POC (3090):** section 4.
3. **D — design build (no GPU):** reference-pack schema and Studio step, tier settings model, multi-reference
   recipe versions, cast-aware illustration route, pack hash in every key; tests and Storybook.
4. **I — integration:** wizard → pack → builder → stage → head → illustrations; broker priorities; the showcase
   rebuilt through the product path instead of scripted bases.
5. **A — acceptance:** the journey above twice, plus the owed plan 28/29/33/36 LI rows on the same build.

## 6. Decisions for the owner

1. Approve the R phase now (docs and read-only, no GPU)? Recommended: yes.
2. Approve downloading Qwen-Image-2.1-Turbo (and a ComfyUI node update if needed) for the POC? Size quoted in R0.
3. Reference pack contents: the six images in §3.1, or fewer? Recommended: six, author approves once.
4. Keep SDXL for backgrounds and cast-free scenes until measured? Recommended: yes.
5. Allow the hosted Qwen Turbo API as a comparison arm (pay per image)? Recommended: no, local only.

## Unresolved questions

- Does Turbo run on the ComfyUI version our lanes and the owner's install use, with the saved 8-step schedule?
- Can a look reuse a live-head rig by texture edit, or is a new rig per look unavoidable?
- Which vision rater is acceptable when the Sol harness is unavailable?

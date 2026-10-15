# Plan 41 — One product: integration review, model selection and the Qwen fast-model POC

Status (2026-10-13): stage-1 review and POC executed; acceptance incomplete, decision is retain current routes.
Stage 2 has not started. Measurements and limitations are in the stage-1 record below. Owner request:
the image and presentation features were built as separate
tracks and never joined into one product; the models and workflows per use case were never chosen against each
other. This plan dumps what exists, names the seams, proposes a tiered model design around a per-character
reference pack, and defines a POC for Qwen's fast image checkpoint. The context dump below predates the POC.
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

### Journey floors (predeclared 2026-10-14, before any real run)

Driver: `scripts/debug/so-p41-journey.mts` (`floors` prints this list from `lib/pocDrivers.mts` `JOURNEY_FLOORS`). A floor
is informational: a miss is recorded, never retuned after the run.

- Every journey step completes with outcome pass: preflight, wizard, story, base, prepare, expressions, frames, rig (per
  member), play, pose, look, look-rebuild, illustration, background, swipe, delete, reload, chat-switch, stale, gpu-idle.
  A refusal or failure is a miss; `stub` is allowed only under `--dry`.
- Nothing is stale after each mutation (look change, swipe, delete, reload, chat switch) or at the end. That means:
  - every displayed sprite path exists;
  - the displayed lineage equals the accepted root;
  - each live-head rig matches the hash of the shown bust;
  - no owned file is orphaned or missing;
  - no cache key holds two hashes.
- The GPU is idle after the run: the last three 5 s samples are at most baseline + 512 MiB and at most 10 % utilisation,
  and no owned ComfyUI job is still queued.
- Wall time is recorded for every step (finite ms). Model calls are counted by provider (sol, artemis, judge, comfy,
  gpu-broker, deepseek, cm-profile, landmarks). Refusals, including mask-import refusals on edits, are counted.
- Latency: the journey adds no latency floor of its own. The plan 33 Acceptance floor (send→reply within +10 % of the
  no-sprites arm) is measured by `so-pose-latency.mts`.

## 5a. Folded work (owner 2026-10-13: focus on plan 41 and a full e2e POC; the 3090 may be used)

Owed rows that sit on the same end-to-end path are run inside this plan, on the same frozen build, instead of
separately. Their original floors and protocols stay as written in their source plans.

- **Plan 28 LI/LT**: text → image → text twice with the in-process broker (Artemis and ComfyUI on one 3090).
- **Plan 29 LI**: two purposes on two `SO-` workflows, player selection unchanged on disk, twice.
- **Plan 33 Acceptance ×2** through the product path, the repaired `lie_side` renders and PCK, and the `lie_rest` audit.
- **Plan 36**: live head on a reference-pack bust; streamed mouth on real Artemis replies.
- **v2.7 20**: living-card look change in play (sprites, close shot, illustration follow), lifecycle acceptance.
- **Plan 37 showcase**: rebuilt through the product path instead of scripted pilot bases.

Not folded: R7 SWA/cache, LI1 laptop, campaign sprite work (A6), the harness-auth branch (its own agent),
Sol-bridge calibration (needs that branch), smart-context and inner-voice measurements.

## 5b. Stages and stop points

1. **Stage 1 (now):** R0–R4, then the POC (§4) on installed models: arm B and pack arm Q (Qwen-Image 2512 vs 2.1 at
   40 steps), the repaired `lie_side` and `lie_rest` renders, and the plan 28 broker LI/LT. Turbo arms T and T+R only
   after the owner approves its download. No product code except POC drivers. Stop with a report.
2. **Stage 2:** design build (§5 D) from the POC decision.
3. **Stage 3:** integration and the e2e journey (§5 I and A), with the folded rows above.

Raters: a second model reads contact sheets, never the owner. `opencode run` with `openai/gpt-6.1-sol` is allowed for
rating in stage 1, at most 150 calls, counted; when unavailable, the executing session rates and marks it provisional.

## 6. Decisions for the owner

1. Approve the R phase now (docs and read-only, no GPU)? Recommended: yes. **Approved 2026-10-13, with the 3090.**
2. Approve downloading Qwen-Image-2.1-Turbo (and a ComfyUI node update if needed) for the POC? Size quoted in R0.
3. Reference pack contents: the six images in §3.1, or fewer? Recommended: six, author approves once.
4. Keep SDXL for backgrounds and cast-free scenes until measured? Recommended: yes.
5. Allow the hosted Qwen Turbo API as a comparison arm (pay per image)? Recommended: no, local only.

## Unresolved questions

- Does Turbo run on the ComfyUI version our lanes and the owner's install use, with the saved 8-step schedule?
- Can a look reuse a live-head rig by texture edit, or is a new rig per look unavoidable?
- Which vision rater is acceptable when the Sol harness is unavailable?

Stage-1 answers: installed native ComfyUI supports Turbo's explicit schedule; Sol contact-sheet rating worked.
Look-to-rig texture reuse remains unmeasured. Other open acceptance items are listed in the record below.

## Stage-1 review and POC record — 2026-10-13

### Scope and decision

- Worktree `so-plan41`, branch `v2.8-plan41-poc`; POC drivers only. No product recipes, settings defaults,
  owner installation or campaign changed. No merge, push or owner-ST staging. Stage 2 is stopped.
- **Retain current Qwen 2.1 edit routes and SDXL illustration/background routes.** No Turbo task demonstrated
  every predeclared floor. Turbo is useful experimental evidence, not an accepted recipe replacement.
- A six-view pack remains a design candidate, but multi-reference head editing is rejected by this POC:
  reference heads are repeatedly pasted/collaged into the edit. Explicit reference-role wording and reduced
  references did not cure it. Shared identity metadata and route unification can be designed separately from
  adopting this failed conditioning technique.
- 2512 won aesthetic comparisons but failed reference identity and within-pack consistency. It is a candidate
  for author-picked original art, not a validated identity pack made from existing card art.
- The central wizard → pack → sprites → pose → live head → streamed reply → changed look → cast illustration
  product journey does not exist yet. Scripted renders and workflow checks cannot sign that journey off.

### R0 — model facts and software

- Official [2.1](https://huggingface.co/Qwen/Qwen-Image-2.1) and
  [Turbo](https://huggingface.co/Qwen/Qwen-Image-2.1-Turbo) use Qwen Research License, non-commercial;
  [2512](https://huggingface.co/Qwen/Qwen-Image-2512) is Apache-2.0. Community repository tags do not
  supersede the base-weight licence. The old Apache claim for 2.1 is corrected by this record.
- A separately downloadable official Flash checkpoint was not found: the candidate HF id returned 401,
  the Qwen organisation listing contained none, and the inspected NidAll Flash repository had no weights.
  This establishes search results, not proof that no checkpoint can exist. No Flash arm was fabricated.
- Native ComfyUI 0.37.4, commit `8ff6dc384ba5c410266b40e137799e049459d4f2`, supports the installed 2.1
  INT8 model and Turbo. Python 3.12.1, torch 2.12.1+cu130, frontend 1.52.7, comfy-kitchen 0.2.35.
  No ComfyUI or custom-node update was needed or performed.
- Turbo uses Euler, CFG 1, explicit sigmas
  `1,0.978453,0.95418,0.926626,0.89508,0.845148,0.704534,0.414568,0`.
  A named ordinary scheduler is not a substitute. B uses 25 steps; the 2.1 quality arm uses 40.
- Download approved by the owner. Tested artifact:
  [NidAll INT8 ConvRot](https://huggingface.co/NidAll/Turbo-INT8-ConvRot-for-Qwen-Image-2.1), revision
  `f1cff4611af588f67e482ce2a920230a8be84f87`, 7,256,828,688 B, SHA256
  `bc77cb2f0220311a158a10e77677f0912fac72d53a66faf78a67d7946b81f5c1`.
  Stored under `C:\dev\models`; source size and downloaded hash matched. Anonymous public download preceded
  the product-download-path request; this is not plan 30 authenticated-download acceptance.
- Official Turbo BF16 transformer shards total 14,230,284,408 B; encoder 17,534,340,584 B; VAE 675,508,656 B.
  Community alternatives, inventoried but not downloaded/tested: Comfy-Org BF16 14,230,280,616 B and INT8
  7,256,787,829 B; abenzerps FP8 7,133,546,412 B and NVFP4 4,197,574,688 B; unsloth GGUF Q4_K_M
  4,199,565,120 B, Q5_K_M 5,390,223,168 B, Q6_K 6,271,551,296 B, Q8_0 7,640,860,480 B, F16
  14,230,275,904 B. These conversions differ; their hashes are not interchangeable with the tested model.
- Installed B/encoder/VAE byte sizes match Comfy-Org's 2.1 split files (7,256,783,064 / 9,350,798,360 /
  675,509,688 B), and all three final SHA256 checks match Comfy-Org's published hashes (`cb74113c…`,
  `8bfd0f6e…`, `bb21f747…`). Source-identifying metadata was previously absent; full hashes are in private
  evidence. 2512 FP8/encoder/VAE sizes match the Comfy-Org split distribution.
- Disk was 67.1 GiB free before download and 60.1 GiB immediately afterward; the last pre-report check was
  55.4 GiB. The 30 GB minimum was maintained. No other model was downloaded by this worker.

### R1 — observed role assignments

- Read-only lane-38 snapshot of the installation copy; seeding changes are explicitly distinguished from owner
  defaults. `passProfiles` unset: non-authoring roles inherit memory profile `55f61212`, local Artemis with
  `Artemis Extraction`. Authoring resolves to Sol harness when offered, otherwise DeepSeek profile `975bc0dc`.
  Selected main profile `beba5264` uses `Artemis v1.1 RP`; image director is DeepSeek `975bc0dc`.
- Route-A purpose mappings: four purposes use WAI Illustrious v17, portrait uses NoobAI; ST selected workflow
  is `JANKU_v777.json`, 832×1216 at 20 steps. Sprite overrides are empty, hence recipe defaults apply.
  Lane image-disabled state is a seed restriction, not an owner feature-disable decision. Judge is TypeSafe.

### R2 — measured task comparison

- Synthetic S0 members only, seeds 1234/5678. Local first-run render evidence and independent Sol ratings;
  floors were not retuned. Poses rate happy/angry edits; the chain also covers neutral reuse, worried, blink
  and talk. A pose label score alone does not cover the complete expression/frame chain.
- Historical B full-pose reference: pooled PCK 0.860; lie_side 0.510; body median 56.5 s, head 21.2 s.
  Its old second execution was cached and is not independent repeat evidence.
- Turbo P2 first run: pooled PCK 0.792 over 48 bodies, lie_side 0.102. Identity 48/48; labels 88/88
  made crops, **88/96 intended** after eight skips (91.7%). Body median 24.5 s/p90 25.0 s (43.4% of
  historical B); head median 13.8 s/p90 14.6 s (65.1%). Both latency ratios miss ≤40%. Body peaks
  19,630/19,609 MiB. Identity, pooled PCK and intended-label floors pass first run; lie_side remains poor.
- Initial full-resolution T+R, seed 1234: PCK 0.704, body median 64.9 s, head 49.6 s;
  labels 7/46 made crops (15.2%), 21,353 MiB peak. Failure preserved. Later role-labelled 448 px variant:
  pooled PCK **0.701** (supersedes the earlier scratch 0.725), body 24.5 s/p90 24.9 s, head 12.0 s/p90
  12.6 s, labels 25/86 made crops and **25/96 intended** (26.0%), eleven extra-limb findings. Identity
  stayed 100%, but collage heads and label misses reject this route.
- Turbo pose vision ratings: 33/48 full matches, fifteen partial matches, nine invented-prop findings and
  one extra-limb finding. All six one-knee samples were partial rather than full matches. Pooled PCK alone
  does not establish complete pose intent or artifact-free output.
- Repaired B lying poses, both seeds: lie_side P2 PCK 0.232, lie_rest P2 0.815; P3 PCK zero for both.
  P2 identity 12/12; independent pose match 11 yes/1 partly, with two extra-limb findings. P2 labels
  16/18 made crops but **16/24 intended** (66.7%); P3 labels 24/24 despite not following the requested
  lying poses. DWPose misses small horizontal figures; vision agreement does not erase the PCK miss.
- Chain B/Turbo pooled local medians in seconds: base 22.5/11.4, expression 22.0/11.1, frame 20.8/10.5,
  look 25.8/14.7, two-member scene 55.4/22.8. Ratios 50.7%, 50.5%, 50.5%, 57.0%, 41.2% all miss
  ≤40%. Both arms: head identity and six-label scores 100%; B look applied 5/6, Turbo 6/6. Both scene
  members preserved; one Turbo scene adds text. Small sample, first local execution only.
- Reduced-ref chain labels: 50.0%/27.8% by seed, fifteen artifacts each. Role-labelled full-res chain
  seed 1234: head identity 72.2%, labels 66.7%, fifteen artifacts, edited heads ~49.3 s; scene adds text.
  Neither reference variant is accepted.
- Pack first-run preference over B: 2512 27/36 (75%, aesthetic floor passes), 2.1@40 13/36 (36.1%, misses).
  Existing-card identity: 2512 0%, 2.1 text-only 25%, 2.1@40 edit and B edit both 86.1%, Turbo edit 88.9%.
  All miss the 90% identity floor. Within-pack consistency: 2512 2/6, 2.1 text-only 0/6, edit arms 5/6.
  Six blind grids, two retries: eight calls. There was no owner-facing author pick trial.
- Native alpha: Turbo text-only local 25/36 (69.4%), mostly edge-touch failures; edit without explicit
  RGBA instruction 0/36. BiRefNet edit 36/36. Explicit RGBA edit wording then passed all 72 pod images
  across two seeds/two runs, but has no local repeat or independent quality verdict here. Keep BiRefNet
  in accepted recipes; do not confuse alpha QA with complete identity/quality acceptance.
- Local sampled full-batch VRAM peaks: B packs 20,848/20,856 MiB; 2.1@40 pack seed 5678 21,335 MiB;
  2512 packs 23,975/23,938 MiB. Chain B 22,059/20,175 MiB, Turbo 20,235/20,412 MiB. Local repeated B
  lying bodies peaked at 19,342 MiB. These are sampled windows, not isolated per-task maxima; absent
  windows are unmeasured. 2512 is particularly tight on the 24 GiB 3090; no OOM was observed in its packs.

### Independent runs and hardware boundary

- Frozen pod driver handoff at `90051302fbee0f4fe45ce1133f0a6dd54d714a20`; assigned 25 batches marked DONE
  and hash-verified in the worker output, plus six supplementary pose batches. Separate Linux RTX PRO 4500;
  actual installed torch 2.12.1+cu130 (the container image name advertised an older version); local is Windows
  RTX 3090, torch 2.12.1+cu130. Pod numbers are quality/portability evidence, not 3090 speed or repeatability.
- Pod Turbo P2 extra samples: pooled PCK 0.797/48 bodies, lie_side 0.083. B lying extra seed-1234 P2:
  lie_side 0.333, lie_rest 0.759; P3 zero. Pod chain B/Turbo expression medians ~12.1/~5.7 s;
  full-resolution references ~25 s and reduced references ~6 s. Do not pool these with local latencies.
- Final pod accounting: 31 batches, 813 newly timed renders, nine shared bases, sixteen skipped heads;
  3,314 batch files rehashed with zero mismatches. Low-resolution-reference pose mean PCK 0.748/0.743 by
  seed; side-lying 0.000/0.222. All 252 cross-hardware compared pack images differ bytewise; this is not
  same-machine repeat evidence. No Sol calls were made by the pod worker.
- Worker deleted its pod and verified absence at **18:02:24.699Z**, before the 18:51Z deadline; deadline
  tasks removed. Elapsed 3h10m, estimated GPU charge $2.28 excluding storage, not provider billing.
  Private `plan41-pod-r2` archive verified: 3,428 files, ~1.53 GB. Recorded deviations: `/opt/s0` ephemeral
  workspace and SSH trust-on-first-use without independent host-key attestation. Model/node pins match.
- Local uncached B lying repeat seed 1234 completed twelve bodies and its head attempts. Eleven of twelve
  body PNGs are byte-identical to r1; body median 59.8 s/p90 60.0 s, 22 made heads median 22.5 s/p90 23.5 s.
  Repeat P2 lie_side PCK 0.407 and lie_rest 0.815; P3 zero. This is a bounded same-machine repeat, not a full
  repeat gate. Remaining queued broad repeats were cancelled during parent-prioritized bounded closeout
  after quota recovery; this was not an explicit owner cancellation.
  Full local T/T+R repeatability and both-seed B repeat acceptance remain incomplete.
- The full-reference chain driver vanished after its third result at 13:45:53, leaving ComfyUI empty and
  weights resident. At 14:00 no matching Node process existed. Resumed only unfinished tasks; completed
  at 14:15:43. Cause of process disappearance is unknown; it is recorded as an execution failure, not a
  model-quality result. Recovery preserved completed rows.

### R3 — product seams and file owners for stage 2

- Creation/approval: `src/copilot/agent`, `src/wizard`, `src/studio/agentHost.ts` provision cards; no
  reference-pack asset transaction exists. Add create-only pack proposal/approval and one manifest owner.
- Identity/cache: `src/sprites/builder`, `src/sprites/poses`, `src/image` need a shared manifest/hash contract;
  image routes and recipe identities currently do not share the cast's reference lineage.
- Routing: `src/image` and sprite recipes need one per-use-case settings view while preserving distinct
  tested implementations. `src/services/stHost` owns all host access; broker/media plugins own GPU/file IO.
- Presentation: `src/sprites/liveHead` owns rig inputs, while living look assets are replaced elsewhere.
  A look-specific bust/rig validity contract is missing; texture-only reuse is unmeasured.
- Lifecycle: wizard approval, cancelled generation, card deletion, recipe/pack invalidation, reload and
  chat switch need shared ownership and cleanup proof. `scripts/debug/so-showcase.mts` must consume the
  eventual product path rather than pilot bases. These are design tasks, not code built in stage 1.

### R4 — full-cast cost estimate

- Serial estimate, not an observed end-to-end prepare: per member one base, three edited expressions
  (neutral reused), two happy frames, one look, eight poses and sixteen posed happy/angry heads; one scene
  shared across three members. No retries, four-candidate base search, rigs, upload or broker swap included.
- B task medians above plus historical full-pose medians give ~15.8 minutes/member; three members plus
  scene ~48.3 minutes. A six-view B pack adds ~10.3 minutes/cast (34.4 s/image); 2.1@40 pack ~11.1 minutes
  (37.1 s/image); 2512 pack ~33.6 minutes (112.0 s/image). Total ~58.6/~59.4/~81.9 minutes respectively.
- Experimental Turbo equivalent ~25.2 minutes/cast before pack, ~36.3 with 2.1@40 packs; this estimate
  does not authorize replacing recipes whose speed floors miss. Full-res reference heads erase that gain.
- Approved pod rate $0.72/hour; verified termination and estimated charge are recorded above. Local renders
  have no hosted-image charge. Sol subscription ratings are counted below; retries consume that budget.

### Folded live checks and limitations

- Plan 29 lane-39 workflow check twice: three real ComfyUI renders per run, scene on `SO_LI_A`, background
  on `SO_LI_B`, unmapped purpose on selected workflow. Selection unchanged on disk, no leaked workflow
  files, scenario exit 0; 80.737/76.050 s. This proves real image routing, not a real-text play journey.
  The lane used the pre-existing staged combined-build tree; this worker did not stage the final gate build
  or perform a final served-bundle drift comparison. Build gates and this live evidence have separate scope.
- First attempt on offline lane 38 failed: image extension disabled, GPU-plugin status/lease 404, two test
  workflows leaked. Failure is retained in lane evidence; fixture files were cleaned. Lane 38 was returned
  to offline settings; successful checks used an isolated copy on lane 39, subsequently stopped.
- Original plan-28 in-process broker runs exercised real Artemis → SDXL → Artemis and reserves, but
  forced `<|channel>final`, bypassing thinking. Their 28.167/28.376 s timer omitted image admission/render.
  They are discovery only. Corrected driver uses thinking-enabled chat templating and measures lease request
  through completed reply, with post-render timing separately named. Corrected results follow in Gate record.
- Plan 30 authenticated product download/test-key route is unrun; anonymous artifact verification is not a
  substitute. Plan 33 product acceptance, plan 36 real streamed mouth, living-card lifecycle and product-path
  showcase remain stage-3 work. No no-model lane result is called a text-model quality pass.

## Gate record — stage 1, 2026-10-13

- Status: **review/POC report available; acceptance NOT green**. Fixed floors and misses above; stop before
  design implementation. Product route decision: retain B and SDXL.
- POC driver commits through `90051302`, then `d5c113ef` (workflow driver lanes-root support); corrected
  broker driver and this report are the final stage-1 changes.
- Earlier focused verification: `npm run debug:typecheck` exit 0; `node --test scripts/debug/lib/poseS0*.test.mts`
  24 passing; Python AST parse passed. Fresh command outputs and full gates are recorded below.
- Rating accounting: local `ratings*.jsonl` footer sums **112 Sol calls**, plus one earlier smoke call = 113;
  retries included. Parent's PONG transport probe is not a rating. No new rating calls after resumption.
  Parent/pod-quality rating records must be reconciled separately against the shared 150-call cap; result-row
  counts are not call counts. Agent-session model usage is not a rating call.
- `npm run gates:quick`: typecheck exit 0; defect replay exit 1 (`jest --listTests failed`, no stderr), RED.
  The failure is preserved, not replaced with a narrower green claim.
- Final `npm run gates:quick`: exit 0, typecheck 25.1 s, defect replay 32/32 killed (29 cached), green in
  42.1 s; baseline 42 tests green. No source change after the full-gate run; subsequent edits are this report.
- `npm run gates`: exit 0, all eleven steps green in 406.3 s, Storybook included. Jest 698 suites/8,094 tests
  passed (one suite/test skipped); plugin 228 passing, release 123 passing, debug 1,243 passing;
  Storybook 130 suites/790 tests passed. The earlier quick-gate failure remains part of the record.
- Fresh focused command `node --test scripts/debug/lib/poseS0*.test.mts scripts/local/storyWorkflowLi.test.mjs
  scripts/local/pluginBrokerLiConfig.test.mjs`: 30 passing, zero failures. `git diff --check`: exit 0.
- Thinking-enabled broker attempts `thinking-run1/2`: both exit 1, lease 409 `ComfyUI did not become ready`.
  Pre-image Artemis replies were visible with 1,473 reasoning characters and 458 generated tokens each.
  Full gates were concurrently active; startup logs stop before ComfyUI reaches readiness. This is a recorded
  readiness failure under contention, not proof of a model failure or a passing LI/LT row.
- Retry without the gate workload: `thinking-idle-run1` still failed readiness, so contention is not an
  established root cause. `thinking-idle-run2` completed real thinking-enabled text → image → text:
  admission 55.102 s, render 21.159 s, release 0.496 s, resumed reply 37.887 s; end-to-end **115.406 s**,
  post-render 38.383 s. Both text replies visible, 1,473 reasoning characters/458 generated tokens each;
  states text-loaded → image → text-loaded, no foreign queue jobs, min GPU free 2,941 MiB against 2,048
  reserve, peak 21,635 MiB, after exit 839 MiB. Driver `ok:true` covers functionality, not LT acceptance.
- Historical scene image→completed-128-token-reply median is 59.492 s; +10% is 65.441 s. Corrected thinking
  run is above that limit, and its 458-token output/template differs from the historical final-only 128-token
  protocol. LT is **not green**; the original short timer must not be used to claim it passes. Streaming
  end-user Artemis RP through ST is still unexercised by this off-page broker check.
- Corrected broker generation allows 768 tokens for thinking plus visible output; lease cost hint remains
  128 next-text tokens. This discrepancy is another limit on using this driver for scheduler-cost acceptance.
- Follow-up `thinking-idle-run3` exit 0, immediately after successful run2: admission 106.660 s, render
  40.316 s, release 0.685 s, resumed reply 37.896 s; total **189.674 s**, post-render 38.581 s. Same visible
  reasoning-enabled replies, text-loaded → image → text-loaded, zero foreign queue work, min free 2,941 MiB,
  peak 21,635 MiB, after exit 839 MiB. Functional LI completed twice consecutively after three readiness
  failures; readiness reliability remains unresolved. Successful-cycle median **152.540 s**, LT not green.
- Lane evidence archive command: `SO_LANES_ROOT=C:\dev\so-build-now-lanes node scripts/debug/so-evidence.mts
  archive --label plan41-stage1-lanes-20261013 --lanes 38,39 --since 2026-10-13T00:00:00Z`: exit 0;
  267 files, 13,883,831 B, hash verification problems empty, private so-sessions tree.
- POC evidence copied with the existing `copyArchive`/`verifyArchive` helpers, excluding secrets, data trees,
  session files and model weights: private label `plan41-stage1-poc-20261013`, **3,847 files,
  1,721,367,595 B, zero verification problems**. Includes local render graphs/results/ratings, model facts,
  hashes, failed attempts, gates and read-only final pod summaries; full pod renders stay in `plan41-pod-r2`.
  First helper invocation failed Windows ESM drive-path loading; corrected to `file:///`, failure log retained.
- Private local/lanes evidence committed as `60b87e55` with explicitly scoped paths. No push. The default
  `npm run sessions:archive` stages all evidence and pushes, so it was not used under this task's no-push and
  ownership constraints; the separately owned pod archive was left untouched.
- In-process broker `exit()` stopped its ComfyUI/text children after each attempt. Final controller CLI
  unload/free-images/stop requests returned ECONNREFUSED because that separate controller was already stopped;
  they are not counted as successful cleanup commands. Direct final verification at **18:14:42Z**:
  no owned Node GPU jobs, ports 8000/8188/18888/18898/18899/8139 all closed, GPU **1%, 839 MiB** (desktop
  baseline), C: **51.0 GiB free**. `final-idle.json` and cleanup errors are archived. Pod absence verified above.
- Remaining acceptance: authenticated download LI; full both-seed same-machine repeats and the role-labelled
  full-resolution pose variant; independently rated
  pod quality; broker readiness reliability/LT; and the stage-3 real end-user product journey. These do not
  authorize a recipe replacement or stage-2 implementation without the owner's next instruction.

## Stage-1 parent-review corrections — 2026-10-13

- Historical driver `90051302` changed generation inputs on text-to-image repetitions: Qwen 2.1 added
  `r2` to the negative prompt, and 2512 changed flow shift from 3.1 to 3.1000002. A changed generation
  parameter is not cache clearing, regardless of how small the change is.
- Affected completed batches: `pack-q21t-r2-s1234/5678`, `pack-q2512-r2-s1234/5678`, and
  `pack-turbo-t2i-native-r2-s1234/5678`. These are **variant plus cross-hardware evidence**, not frozen-input
  repetitions. The same workaround also affected any non-r1 `bases` command; no such additional stage-1
  batch is claimed here. Edit packs/chains/poses do not call this text-to-image variant branch.
- The conservative keep-B/SDXL decision stands. Historical archives and driver pin remain unchanged;
  no stage-1 images were rerendered. The bounded local B comparison is not a dedicated no-cache proof.
- Future driver run labels are metadata only. Installed ComfyUI source (`comfy/cli_args.py:143`,
  `main.py:337`, `execution.py:122`, `server.py:736`) confirms native `--cache-none`, with argv exposed
  by `/system_stats`. `/free` queues asynchronous executor reset (`main.py:394–395`), without an awaited
  reset acknowledgement; it is not used as an exact-repeat barrier. Repeated renders now refuse a server
  whose native no-cache mode cannot be verified. No server started during stage 2.
- `latency()` now excludes shared/copied bases and nonpositive/untimed rows from newly rendered medians,
  preserving shared, untimed and newly timed counts separately. Earlier pod summaries that include copied
  zero-second bases must not be treated as render-speed measurements for those groups.
- Broker lease hint now matches its 768-token generation maximum. The stage-1 hint mismatch and outputs
  remain recorded above; this correction has no new LI result. Rating total remains 113, stage-2 calls zero.

## Stage-2 refined design — parent-directed deterministic build

- Vertical slice: wizard-created/installed cast → Studio **Prepare presentation** → existing four-candidate
  Qwen 2.1/BiRefNet base picker → explicit base/bust review → persisted accepted visual source → sprites
  and current-look lineage → explicit cast illustration. Six generated views are optional future work;
  neither a six-view quality pass nor automatic identity approval is invented.
- One per-character visual manifest lives in install-wide sprite settings, through the established settings
  save/read-back evidence path. It records installed card provenance/hash, accepted base set/file/hash/recipe,
  a separately reviewed crop bust and its base hash, and published downstream look artifacts tied to the
  accepted root. Candidate review state is transient and never read by runtime consumers. Replacing the root
  clears derived looks; missing/replaced card or modified source files refuses reuse rather than guessing.
- Existing builder controls remain the generation surface. Preparation can also explicitly review an installed
  generated base. Bust preparation is a crop of that accepted candidate, using the author-controlled head box;
  it does not spend a speculative quality-model call. Author can replace/review assets before acceptance.
- Ownership: mint a RunOwnership guard for every async prepare/review operation; validate before every
  candidate/file/settings write. Cancel, unmount, draft/chat change and a newer accepted root refuse publication.
  Physical preview files are not accepted merely because the media plugin saved them. Persist only after the
  author approves and the source fingerprints are rechecked. Reload reads the persisted accepted manifest.
- Builder raw/final keys and look/pose cache keys incorporate accepted-root lineage. A published changed look
  is a derivative of that approved source, not a new claim of human/vision quality approval. Cast illustration
  requires the current look's verified derivative, never substitutes the original outfit while a look is pending.
- Cast illustration is a distinct lazy Qwen 2.1 two-reference scene recipe/cache identity, through existing
  broker/media owned jobs and image-save/place APIs. It is explicitly selected from the chat surface, accepts
  one or two prepared non-narrator members, and refuses missing/stale current identities. Existing SDXL
  backgrounds and cast-free workflows retain their established route and controls.
- Live head resolves only a bust/rig matching the current accepted root/look. A changed look without a valid
  bust/rig shows rebuild pending/static fallback. Existing rig import remains supported; the future vision-rig
  harness invocation is a deferred seam until parent integration. No texture-only rig reuse is claimed.
- One accurate per-use-case route/status view joins preparation, edits/poses, bust/rig, cast scene and SDXL
  background controls. It makes no guaranteed quality/fast-tier claim. All new UI is in existing lazy chunks;
  main bundle budget remains 1,300,000 B. No feature/thinking/inner-voice defaults are switched off.
- Deterministic tests target cancellation/root replacement, candidate isolation, reload/sanitization, file/card
  invalidation, current-look scene refusal/cache identity, and rig staleness. Synthetic Storybook cases cover
  no artwork, review, progress/cancel, refusal and changed-look stale. Guide and queue records move with code.
- Stage-2 stop: full deterministic gates including Storybook, then parent review. No GPU, browser/model
  acceptance, rating, download, pod, owner staging, campaign adoption or harness/installer edits in this stage.

### Stage-2 as-built scope and remaining gaps

- Entry: Wizard **Next: prepare cast presentation** → Sprites existing four-candidate base builder.
  Keeping a base selects its saved reference immediately. Set the head box; review and explicitly accept
  base+bust. Installed-card path/hash, generated recipe/key/hash, crop box, bust hash and source revision
  persist in `sprites.visualSources`. No source from transient candidate state is consumed by runtime.
- Accepted sources also provision the runtime presentation profile for a wizard card with no old `so_sprites`
  profile; reload uses the reviewed base set. Source acceptance reloads stage inventory and closes old look/body
  work. Missing/modified card or root files refuses the stage inventory with a readiness finding.
- Expression/raw/final keys, changed-look keys, pose keys and stage body stamps carry root identity.
  Changed-look base derivatives are published only while their root remains current; pose fallback inventory
  filters out a different accepted root. Cancellation during bust save cannot publish accepted settings;
  cancellation during scene save deletes the unplaced image. Preview files may remain unaccepted after
  cancellation; they are never treated as accepted presentation artifacts.
- Chat **Illustrate prepared cast** → select at most two → **Draw current-look cast**. Distinct lazy Qwen
  2.1 scene recipe, exact accepted/current-look hashes, native two-image node inputs, no four-reference head
  conditioning. References are uploaded as decoded image bytes through existing owned media jobs, and
  broker lease/reference cleanup runs on success or refusal. SDXL/cast-free route implementations are retained.
- Live-head resolution checks the selected look's bust path/hash; changed-look bust/rig absence is shown
  as pending/static fallback. The Sol image-capable request contract is wired and tested against adopted
  harness types. **Automatic landmark-to-valid-rig synthesis is not built**, and no product rig call/trial was
  made. The parent-proven synthetic vision transport is dependency evidence only.
- **Stage 2 is a bounded vertical slice, not the finished journey.** Changed-look bust review/rebuild UI,
  optional reference-view authoring, full wizard card artwork provisioning, independently reviewed dynamic
  look quality and end-user Artemis streaming integration remain unproven or incomplete. A nonempty current
  card look requires its matching published derivative; initial accepted default does not guess a match.
  Face/decal-only look signatures may currently refuse cast illustration until a matching full-look derivative
  is prepared. These are acceptance/next-design gaps, not alternate quality floors.
- Harness parent commits were adopted locally, then dropped on 2026-10-14 when the branch was rebased onto
  master (`004abc8a` merged `016a39a3`/`6e260f34`/`7537491f`). Both parent plan-40 records retained.
- Campaign adoption deferred to RP acceptance; no private campaign material, pin bump or install.

### Exact next acceptance sequence — after parent product review

- Parent first reviews this bounded scope, source/persistence seams and rig-generation gap; implement the
  missing changed-look bust/rig author workflow before calling the whole journey complete.
- On an owned isolated lane, stage the reviewed combined build/plugins and compare served bundle hashes.
  Start a fresh synthetic story through real Sol wizard; create its cast, prepare/review base+bust, accept,
  reload and verify persisted hashes. Cancel another candidate and switch/delete a test card during work;
  verify no accepted publication or cross-chat placement.
- Configure established Qwen/BiRefNet and SDXL routes. Real Artemis with thinking/inner voice retained:
  play a turn, stream presentation, change current look, render expression and both lying poses. Verify source
  lineage/cache invalidation, transparent pending state and unchanged visibility/open-anchor behavior.
- Rebuild/import a valid current-look bust/rig through the reviewed product route; verify actual live-head
  rendering, refusal and static fallback. Request a two-member current-look scene and a cast-free SDXL
  background; verify distinct route/cache identities and all GPU/reference ownership cleanup.
- Repeat the complete browser/model path independently on the same machine twice, preserving failures and
  predeclared floors; use a verified native `--cache-none` server for identical-input generation repeats.
  Keep pod evidence separate, reconcile rating calls against 113/150, archive privately, stop/unload and prove
  idle. No current deterministic result substitutes for those acceptance runs.

## Gate record — stage 2 (deterministic), 2026-10-14

- Branch `v2.8-plan41-poc`, worktree `C:\dev\so-plan41`. Uncommitted stage-2 work committed as four logical commits,
  then rebased onto master `004abc8a`; the three duplicated harness commits dropped as already applied. No conflicts.
- Review fixes:
  - `drawPreparedCast`: the unplaced-image cleanup reads `imageDelete`'s WriteResult (and a rejected delete), logs a
    failed removal, and always rethrows the original refusal. Tests: castSceneHost.test.ts (refused and threw cases).
  - Cast scene builder config came from `selected[0]` only: a second member's missing route went unnoticed and a
    different model triple was silently ignored. `castSceneBuilder` now requires every selected member's route, refuses
    mismatched diffusion/encoder/VAE, and takes the larger steps/resolution (order independent). Tests: castScene.test.ts.
  - `visualHost` commit and `publishDerivedVisual` take the caller's RunGuard and re-check `stillOwns()` immediately
    before the settings write (onDemand, bodyRenderer and VisualPreparation pass their run). Both are synchronous, so the
    ownership census has no new rows; ownership.guard green. Tests: visualHost.test.ts.
  - Stray lone-LF lines fixed (stage.ts 3, StudioCopilot.tsx 1, castSceneHost.test.ts 7); StudioCopilot.tsx is now
    unchanged against master.
  - Feature registry: `prepared-presentation` (author, Studio `#so-prepare-presentation`) and `cast-illustration`
    (setup, drawer `#so-cast-scene`), both experimental and on, with no setting to switch them off. README table and
    settings reference regenerated (`npm run docs:settings`, `npm run docs:guide`).
  - LiveHeadAuthor story still asserted the old "rig missing" copy; updated to the fallback copy.
- Main bundle `dist/index.js` 1,261,282 B (budget 1,300,000 B). Cast scene host, Prepare presentation and cast
  controls load lazily; the stage, keys and live-head status changes ride the main entry.
- Gates:
  - `npm run gates:quick`: typecheck, typecheck:test, defect replay 32/32 green; lint and codeHealth S5 red on two
    over-long lines in imageFeatures.ts, fixed.
  - `npm run gates` run 1: red on errorCopy.guard (new cleanup log row) and the LiveHeadAuthor story; both fixed.
  - `npm run gates` run 2: every step green, Storybook included, except test:plugin: 2 harness deadline tests
    (`the session deadline tears everything down…`, `a stalled OpenCode service…`) failed while CPU was pegged by a
    parallel 3090 measurement. They passed in run 1, and a solo `npm run test:plugin` rerun exited 0 (fail 0). No
    harness code changed on this branch.
  - Final run `npm run gates -- --jobs=2` (throttled for the measurement window): all green in 374.6s, Storybook
    included (test, test:replay, test-storybook:ci, test:debug, typecheck, typecheck:test, debug:typecheck, lint,
    test:release, test:plugin, build).
- Built in stage 2 (against §5 D and the refined design): per-character accepted visual manifest with card/base/bust
  hashes and revision; Studio Prepare presentation (four-candidate base picker, head box, base+bust review, accept,
  cancel); wizard "Next: prepare cast presentation" entry; accepted-root lineage in expression/raw/final, changed-look,
  pose and body-stamp keys; derived-look publication only while the root is current; cast scene as a distinct lazy
  Qwen 2.1 two-reference recipe with current-look refusal and owned broker/reference cleanup; live-head pending/static
  fallback by look bust hash; per-use-case route/status view; synthetic Storybook cases.
- NOT built or NOT proven:
  - Automatic landmark-to-rig synthesis (vision rig) is not built; only the image-capable request contract exists.
    No product rig call or trial.
  - Changed-look bust review/rebuild and rig UI is missing; a changed look shows pending/static fallback only.
  - Optional six-view reference pack authoring, a tier settings model, and full wizard card artwork provisioning
    are not built. Face/decal-only look signatures may refuse cast illustration until a full-look derivative exists.
  - No browser, lane, model, GPU or ComfyUI acceptance: no render, no real Sol wizard, no Artemis play, no
    two-member scene render, no reload/chat-switch proof in a browser. Every claim here is deterministic tests and
    Storybook only. The §5 A journey ×2 and the folded plan 28/29/33/36 rows remain owed.
  - Campaign adoption, showcase rebuild through the product path, not staged into ST, not merged.

## Gate record — stage 2b (rigs, changed look), 2026-10-14

- Branch `v2.8-plan41-rigs` from master `e0831f41`, worktree `.claude/worktrees/agent-a7bceb950b85f2de1`. Commits `9d47c374` (rig
  synthesis, changed-look rebuild), `b3d6aaa9` (face/decal-only cast illustration), `191ddadb` (registry, guide), `124a7d75` (lazy
  harness import, decode split). Not merged, not pushed, not staged. No model call, download, GPU, ComfyUI, lane or ST use.
- Landmark source: plans 36/41 name the Sol vision session (no MediaPipe). Built as an injected `LandmarkProvider`; the product provider
  (`synthesis/host.ts` `solLandmarks`) wraps the existing `visionRigRequest` route, now asking for a typed landmark JSON with image size.
  It is wired but never called here; every test and story injects synthetic landmarks.
- Built:
  - `src/sprites/liveHead/synthesis/`: `landmarks.ts` (schema v1, validation naming every problem), `rigGeometry.ts` (landmarks → upstream-v1
    rig: head/body/face ellipses, bands, eye openings/ROI with the build-layers 24-sample column curves, mouth line/bow, cheeks, mesh cells
    fitted under the 40,000-vertex limit), `layers.ts` (deterministic CPU cut: eyeball/low/crease/lash masks, eye holes filled by skin
    diffusion), `png.ts` (stored-deflate PNG for goldens), `synthesize.ts` (pipeline; RunGuard after every await; output goes through the
    shipped `loadHeadManifest` with the expected member/look/art-hash/source; package size limit), `visionLandmarks.ts`, `syntheticBust.ts`
    (owned geometric bust + true landmarks), `RigPreview.tsx`.
  - Changed-look review/rebuild: `src/sprites/lookRebuild.ts` (rows from `visualHead` state, `publishLookBust`, `LookRebuild`
    prepare/accept/cancel), `lookRebuildHost.ts`, Studio Sprites `ChangedLookRebuild` + `ChangedLookReview` (`#so-changed-look-rebuild`).
    Rebuild crops the look base with the accepted head box (or keeps its saved bust), synthesizes a rig preview from a data-URL source,
    saves nothing until accept; accept saves the bust, publishes it on the look, rehomes the rig to the saved path and replaces that
    member/look rig. A refused rig still allows bust-only acceptance (static fallback stays). Lineage: a re-rendered look base or a new
    accepted root makes bust/rig stale again (tests).
  - Face/decal-only looks: `castSceneIdentities` falls back to the base-layer signature when every field is card-bound and the rest are
    `face`/`decal` layers; those fields join the cache identity (`layered`) and the scene prompt says the reference predates them. A base
    change without its derivative is still refused.
  - Feature registry `changed-look-rebuild` (author, experimental, on, no switch); guide paragraph; `npm run docs:guide`, `docs:settings`.
- Skipped: tier settings model (fast vs quality) — the stage-1 POC accepted no fast-tier recipe for any task, so the setting would route
  nowhere; six-view reference packs and wizard card art (not trivial).
- Tests: `synthesis.test.ts` 17 (golden `test/goldens/liveHead/synthetic-rig.json` rig + layer hashes, determinism, 2x-scale equivalence,
  contour start/winding invariance, layer content, vertex limit up to 2048 px, oversize/hash refusal, lapse at each of 5 awaits, landmark
  validation, rehome, vision provider parse/refusal with fake transport); `lookRebuild.test.ts` 11; `castScene.test.ts` +1.
  Ownership census +8 rows (one renamed), error-copy +5 rows; no ratchet raised.
- Storybook: `Sprites/RigSynthesis` synthesizes a 320 x 448 synthetic bust in the browser (canvas decode/encode) and asserts the existing
  `LiveHead` reached its first draw (`data-live-head-ready="true"`, canvas visible); `Studio/ChangedLookReview` 5 stories.
- Main bundle `dist/index.js` 1,261,945 B (budget 1,300,000 B); synthesis, rebuild and preview strings are only in lazy chunks.
- Gates:
  - `npm run gates:quick`: green in 117.4 s (typecheck, typecheck:test, lint, jest related, replay 32/32).
  - `npm run gates -- --no-storybook --jobs=2` run 1 (`191ddadb`): all green in 272.1 s.
  - Staged Storybook (`%TEMP%\so-sb-rigs`, `npm run test-storybook:ci`) run 1: RED, 4 suites / 7 tests. RigSynthesis and SpriteBuilder
    failed on `script.js` (the rig provider imported `stHost/harness` statically); fixed in `124a7d75`. PosesList (color-contrast) and
    WorkspaceShell (missing heading) also failed; untouched code, both passed on the rerun, recorded as flaky.
  - Staged Storybook run 2: 135 suites / 805 tests passed.
  - `npm run gates -- --no-storybook --jobs=2` final (`124a7d75`): all green in 266.6 s; jest 709 suites / 8,187 tests (1 skipped),
    replay 32/32, debug 1,260, release 123, plugin 269, 0 failures.
- Still unproven: real landmark quality (no Sol call made; the provider prompt and JSON parse are tested only with a fake transport);
  rig quality on real art (synthetic geometric bust only; the simplified CPU cut has no OpenCV inpainting and no LI5-style review);
  browser/lane acceptance of the rebuild screen with real saves; GPU/ComfyUI renders; cast illustration with layered fields on a model.
  Plan 36 LI rows and the §5 A journey remain owed.

## Gate record — real landmarks to rigs with Sol (stage 2b follow-up), 2026-10-14

- Branch `v2.8-poc-sol` from master `0ae3c6ec`; commit `82628211`. Not merged, pushed or staged. Detail and per-bust numbers: plan 36 §"Gate record: Sol landmarks, rig synthesis and LI5 review on six real busts".
- First real `solLandmarks`-shaped calls: the shipped `visionLandmarkProvider` / `visionRigRequest` on six real busts (m1-m3 accepted B-recipe bases, three showcase busts), Sol over the harness opencode transport (sign-in check bypassed through its `authMethods` seam, see plan 36 and queue N12). Six of six rigs valid through `synthesizeCheckedHead` and `loadHeadManifest` after one prompt fix (m1's one-ear answer refused by the validator).
- Detector cross-check on real art: eyes, mouth and chin agree within 0.07 W on all six (limit 0.15); the face-oval width check disagrees on 4 of 6 first answers (long hair, hats; prompt asks for face and hair mass, checker compares with the jaw). Recorded, limits unchanged.
- Synthesis defects found on real art and fixed: the jaw ellipse ended below the chin, so the open mouth crossed the chin on every rig; lower lid now traced 0.7 px outward. Still open: mesh-only closed eyes keep skin patches and iris slivers (simplified CPU cut, no inpainting); the drawn layer covers it where plan 19 neutral frames exist (m1, m3; m2's blink frames refused on ring drift).
- Changed-look rebuild is unchanged; no browser/lane acceptance of the Studio rebuild screen, no product save path exercised. LI5 not accepted (eye-contour floor unmeasured on real art).
- Gates: see plan 36 record (same branch).
- Gates (branch `v2.8-poc-sol`, code commit `82628211`): `npm run test:replay` (fresh worktree) 32 of 32 killed in 156.8 s; `npm run gates:quick` green in 31.1 s; `npm run gates -- --no-storybook --jobs 2` all green in 231.2 s (test, test:replay, build, typecheck, typecheck:test, test:debug, debug:typecheck, lint, test:release, test:plugin); staged Storybook (`%TEMP%\so-sb-pocsol` from `git archive HEAD`, `npm run test-storybook:ci`) 136 suites / 814 tests passed, copy removed. Not merged, pushed, staged or installed.

## Gate record: §5 journey driver, dry only (2026-10-14, no GPU, no model, branch `v2.8-poc-drivers`)

What was added:
- `scripts/debug/so-p41-journey.mts`. Shared parts:
  - `lib/pocDrivers.mts`: pure logic, plus `pocDrivers.test.mts`.
  - `lib/pocFakes.mts`: the dry media plugin, PNG and SSE fakes, plus `pocFakes.test.mts`.
  - `lib/pocLive.mts`: in-page routes, call recorder, 5 s sampler, turn and viseme probes.
  - `lib/pocSteps.mts`: Studio steps, settings capture and restore, preflight, step timing.
- Each run writes into `<debug>/p41/<stamp>-<label>-<mode>-run<k>/`:
  - per-step `steps.jsonl` and `turns.jsonl`;
  - `calls.jsonl` with model calls by provider;
  - 5 s GPU/RAM `samples.jsonl` (nvidia-smi in real mode, stubs in dry mode);
  - run headers from before and after the run, and their diff;
  - a screenshot of every step that did not pass;
  - `record.json`.
- Cleanup removes the `SO-P41` marked assets and scrubs builder, visual-source and rig entries. It then restores the
  captured sprite, display, image and extraction settings.
- `--dry`:
  - every plugin, harness and generation call is answered in the page;
  - every request to ComfyUI and controller ports is blocked;
  - the wizard replays a scripted transport.
  - The verdict is PLUMBING-OK/FAIL and never a floor result.

Dry runs on offline lane 46, a slim seed with no plugins, candidate `dist/` served by route:
- dry1 run 1: PLUMBING-OK. 28 of 30 steps passed; gpu-idle was a stub. look-rebuild was a product miss (below).
  - Calls: 4 sol (fake), 54 comfy (fake), 70 artemis (fake stream), 0 refusals.
  - The mouth moved on all 10 streamed turns (9–30 visemes sampled per turn).
- dry2 run 2: PLUMBING-OK, with the same 28 passes, the same miss and the same stub.
  - Calls: 4 sol (fake), 55 comfy (fake), 76 artemis (fake stream), 0 refusals.
  - The first changed-look turn sampled 0 visemes; the lead had no live head (the open finding below).
- Both runs: cleanup leaked 0. The header diff had one undeclared line, a warning ("open group is not in ctx.groups"),
  because the owned group was deleted while it was still open.

Product findings from the dry runs:
- Fixed: visual asset paths carried ST's `?t=` cache-buster.
  - Symptom: Prepare accept, look publication and bust rebuild all refused with "The reviewed visual manifest is
    incomplete".
  - Fix: `servedAsset` in `src/sprites/visualManifest.ts`, used by `visualPreparation.ts` and `lookRebuild.ts`, with
    tests.
- Fixed: a story started in a chat that was already open never directed its stage.
  - Cause: actor direction keys were computed only on the stage's reload, so roster ids were missing.
  - Fix: `src/sprites/stage.ts` reloads when the story roster changes (`rosterStamp` in `direction.ts`), with a test in
    `stage.test.ts`. The dry runs ran on the first version of this fix. It was then compacted to stay within the
    600-line file budget (codeHealth S3), with the same logic, and was not re-run live.
- Open: a changed look never gets a live head while poses are on.
  - A look with card fields always renders an `lp_` posed body, even for `stand_relaxed`.
  - The live-head lookup then asks for the head of `lp_…`, not `look_<key>`.
  - The journey's look-rebuild step records "close shot rig look none != look_<key>".
- Open: the feature registry places `cast-illustration` at "Play › Illustrate prepared cast", but `#so-cast-scene`
  renders on the workspace Author page.

Gates:
- `npm run test:replay`: 32/32 killed, exit 0.
- `npm run test:debug`: 1,282/1,282.
- `npm run gates:quick`: green. typecheck, typecheck:test, lint, jest related 1,371/1,371, replay `--cached`.
- `npm run gates -- --no-storybook`: all green in 185.6s (jest 8,295 passed and 1 skipped; first run RED on codeHealth S3, with stage.ts at 606 effective lines, fixed in 21958f26). Storybook was skipped because no `.stories.tsx` or UI component
  changed.

## Ready to run: §5 journey on the 3090 (owner go-ahead, nothing else on the GPU)

1. Prepare a normal seeded lane n ≥ 30:
   - `node scripts/debug/st-lanes.mts restore-model <n>`
   - `npm run plugins:install`
   - Write `C:\dev\so-lanes\<n>\image-harness.json` from `scripts/debug/image-harness.example.json`, with
     `allowComfy: true`, `editModels` and `backgroundRemoval`.
   - Start with `node scripts/debug/st-lanes.mts start <n> --allow-local`.
2. Choose the build: add `--candidate` to serve this worktree's `dist/`, or stage a frozen build first.
3. Load Artemis through the controller at no more than 32,768 context: `node scripts/local/cli.mjs start`. ComfyUI is
   warmed by preflight through the GPU plugin. The 3090 needs about 14.8 GiB of free RAM for the Qwen lease.
4. Run the journey twice:
   - `node scripts/debug/st-lanes.mts run <n> -- scripts/debug/so-p41-journey.mts run 1 --label a`
   - `node scripts/debug/st-lanes.mts run <n> -- scripts/debug/so-p41-journey.mts run 2 --label a`
   - If a run aborts: `node scripts/debug/st-lanes.mts run <n> -- scripts/debug/so-p41-journey.mts cleanup`
5. The wizard step calls Sol (opencode `openai/gpt-6.1-sol`) once per run. Check that no other agent is using the
   subscription.
6. Expected GPU time:
   - Renders: about 17.5 min per run for 3 members (`so-p41-journey.mts quote`), about 35 min for ×2.
   - Wall time with Artemis turns and ComfyUI warm-up: about 30 min per run, about 60 min for ×2.
7. Archive the records under `test/journeys/records/p41/` and the evidence with
   `node scripts/debug/so-evidence.mts archive --label p41-journey`.

## Gate record — extras (gaze iris, reference views, wizard card art), 2026-10-14

- Branch `v2.8-p41-extras` from master `a302b65e`, worktree `.claude/worktrees/agent-acc1c568232e11ce2`. Commits `bedff377` + `8414eca9`
  (gaze iris), `0a4b4b8a` (reference views), `e8ea9ec7` (wizard card art), `39355b1d` (story lint), plus this record. Not merged, not pushed, not staged. No model call, download,
  GPU, ComfyUI, lane or owner ST use. Mouth code untouched (`mouthShape.ts`, mouth cap, drawn mouth layer: `v2.8-mouth-cap` owns them).
- Gaze +-1 iris (plan 36 owed row):
  - Upstream mesh-avatar-studio `26243f9` (`packages/runtime/src/engine/renderer.js` `eyeBall`, `createMeshAvatar.js` 7 px travel) uses the
    same dome warp as our port (`texAt(p - gaze * sqrt(4u(1-u)) * sqrt(4v(1-v)))`), so it does not keep the iris round; it only keeps the
    travel small. Nothing to copy; the fix is ours.
  - Fix (`liveHead/gaze.ts`, `shaders.ts` `slideBall`): the eye white stays put; the iris (ball pixels far from a sclera tone) is removed
    from where it was, filled with the sclera tone, and redrawn translated whole by the gaze offset, clipped by the current opening alpha and
    the lids. Within 2.5 px of the lid curves a pixel counts as iris only when the pixel 2.5 px inward is interior iris, so the iris's top and
    bottom rows move with it while lash pixels inside the ball layer (rim, corners) stay. First cut without that rule left 2 iris pixels at
    the old place and, with a naive inward rule, moved corner lash into the white; both caught by tests and the story, both fixed. Sclera tone = mean of the brightest 30 % of opaque ball
    pixels, read once per ball layer (`OffscreenCanvas`); unreadable or dark (luma < 0.55) keeps the shipped dome path. Gaze 0 takes the
    shipped path byte for byte. No plateau warp; no new rig field.
  - CPU model of the shader (`renderOpenBall`), synthetic bust x2 (`gaze.test.ts`): at gaze +-1 the iris mask equals the gaze-0 mask
    translated and clipped (overlap 1.00 both eyes) vs 0.76 / 0.81 for the dome warp; second-moment aspect 1.37-1.38 vs rest 1.30 (clip at
    the corner) vs dome 2.06-2.30 (the bean). Old position fills with the tone (irisWeight < 0.05), alpha unchanged everywhere, and no iris
    pixel stays inside the old iris disc (0 vs 2 before the edge rule). Goldens
    `test/goldens/liveHead/gaze-iris.json` (gaze -1, 0, +1 per eye; gaze 0 identical to the dome render). Renderer test: `uSclera` is set
    only when a ball tone was read; without one the uniform stream (frame-loop golden) is unchanged.
  - Storybook `Sprites/LiveHeadGaze`: dome (before) vs slide (after) zoomed eye renders at gaze -1/0/+1, plus the WebGL head on the
    synthetic rig.
  - Not proven: real campaign rigs or the amber/slate/ember synthetic looks in a browser (no LI run); an iris close to the sclera tone (very pale)
    is not separated and stays in place. Gaze up/down lash fragments not touched.
- Six-view reference pack (§3.1, optional):
  - Views: `full_body` (accepted base), `front` (accepted bust), and four renders `three_quarter_left`, `three_quarter_right`, `profile`,
    `back` (`sprites/referenceViews.ts`). Recipe `qwen21-reference-view` v1: existing `editGraph` (Qwen 2.1 edit, 1 reference = accepted
    base), the member's builder models/steps/resolution, first discovered BiRefNet cutout, seed 1234, `referenceProblems` alpha QA, one GPU
    lease and one reference upload per prepare, both released on every path; text priority first.
  - Studio Sprites › Prepare presentation › **Reference views** (`#so-reference-pack`): draw, review all six, Accept all six views / Cancel.
    Nothing saved before accept; accept saves the four renders through `saveGeneratedSprite` (`refpack_<key16>`), hashes the six
    (`referencePackText`), and writes `visualSources[folder].pack` with `revision + 1`.
  - Lineage: `visualRoot` = `<id>:<revision>:<pack16>` when a pack exists, so every key that already carries the root (expression/raw/final,
    look, pose, body stamp, cast scene) carries the pack hash. Accepting a pack keeps the default look (re-rooted) and drops derived looks,
    which render again. Parser refuses a pack whose full-body/front differ from base/bust or that misses a view. No recipe consumes the views
    as references yet (stage-1 POC accepted no multi-reference tier).
  - Ownership: `ReferencePackSession.prepare` guards after each of 15 awaits (test lapses at each), `accept` after every save and before
    commit; cancel/chat/card-delete/root-replacement during a render or a save publish nothing. Census +6 rows, error copy +3 rows.
  - Registry `reference-pack` (author, experimental, on, no switch); guide paragraph; routes view row.
- Wizard card artwork: `createCharacterCard` provisioning cards lazy-load `CharacterCardArt` (own chunk): accepted bust and base
  (`loading="lazy"`), or a placeholder (not created yet / no accepted artwork / card changed) with **Prepare presentation**, which opens
  Sprites through `PreparePresentationContext` from the Studio wizard tab. Pure resolver `sprites/cardArt.ts`; stories `Studio/CardArtView`,
  `Studio/ProvisioningCard` `CharacterArtPlaceholder`.
- Main bundle `dist/index.js` **1,266,141 B** / 1,300,000 B (plan 36 harvest record 1,264,929 B). Renderer, reference-view host/UI and card art
  ride lazy chunks (`qwen21-reference-view` only in `6172.index.js`).
- Gates:
  - `npm run test:replay` (fresh worktree): 32 of 32 killed.
  - `npm run gates:quick` after each item: green (349.8 s, 185.0 s); item 2 run 1 RED on `typecheck:test` (implicit any in a test stub), fixed.
    Guards met by changes, not ratchet raises: SpriteBuilder S4 length (the step mounts inside PreparePresentation instead), S8 duplicate
    `cancel` body, ownership census +6, error copy +3.
  - `npm run gates -- --no-storybook --jobs=2` run 1 RED on lint (non-null assertion in `Gaze.stories.tsx`, which `gates:quick` lint does not
    reach); fixed in `39355b1d`. Run 2 green in 340.0 s. Final run (`8414eca9`) green in 249.9 s: jest 724 suites / 8,310 tests (1 skipped),
    replay 32/32, test:debug 1,267, test:release 123, test:plugin 273, 0 failures.
  - Staged Storybook (`%TEMP%\so-sb-p41`, junctioned `node_modules`, served on port 6046 because another agent's copy held 6006, test runner
    `--maxWorkers 4`): run 1 139 suites / 827 tests passed; after the edge-row fix, rebuilt, run 2 139 / 827 passed, including
    `Sprites/LiveHeadGaze`, `Studio/ReferencePackReview`, `Studio/CardArtView`, `Studio/ProvisioningCard`. Copy removed.

### Ready to run (3090, owner OK required)

- Reference-view render job, synthetic members only:
  1. Owner OK for a 3090 window while not playing; no download (Qwen 2.1 int8 + Qwen3-VL 8B int8 + 2.1 VAE + BiRefNet-HR are installed).
     `node scripts/local/cli.mjs unload` (Artemis off), then ComfyUI with native `--cache-none`, verified in `/system_stats` argv.
  2. `npm run build && npm run stage` from `v2.8-p41-extras`; lane `node scripts/debug/st-lanes.mts seed 31 --fresh`, `start 31 --headed`
     (owner-approved exception to the no-ComfyUI lane rule; images/sprites stay off for imports, only the Studio builder calls ComfyUI).
  3. For the 3 S0 synthetic showcase members: Studio › Sprites, keep a base candidate, set the head box, Review selected base and bust,
     Accept. Then Reference views › Draw reference views: 4 renders each (`qwen21-reference-view` v1, standard preset 25 steps, 1024, euler
     simple cfg 1, seed 1234, BiRefNet). Accept all six views.
  4. Record per view: seconds, peak VRAM (floor 22 GB), alpha QA, saved path/sha; per member: pack hash, revision bump, reload read-back of
     `visualSources[<folder>].pack`, changed `visualRoot` in one expression key.
  5. Sol contact sheet of 6 views x 3 members, same-character identity (floor >= 90 %, §4), at most 3 rating calls, counted against 113/150.
  6. Repeat steps 3-5 once more on the same machine with the same `--cache-none` server; archive privately (`so-evidence.mts archive
     --label p41-refviews`); unload, stop ComfyUI, prove the GPU idle; `so-assets.mts remove --marker SO-` for test cards.
- Gaze iris, no GPU: lane 30 `so-live-head-check.mts --candidate` with gaze pinned at +-1 on the amber/slate/ember synthetic looks; a second
  model rates iris roundness before/after from screenshots (Storybook `Sprites/LiveHeadGaze` gives the synthetic before/after).

## Gate record: dry-run findings fixed (changed-look live head, cast illustration route), 2026-10-14, branch `v2.8-p41-livehead-gap`

Changed-look live head with poses on. Two causes, both fixed:
- The head lookup used the stage set. With poses on a look shows an `lp_` posed body, so the head was looked up under `lp_…` and never under `look_<key>`.
  - Fix: `actorLook` in `src/sprites/liveHeadStage.ts`, used by `actorHeadRef` and `castHeadStatus`.
  - A posed body maps to the published look whose signature matches the body's base fields. Empty base fields map to `default`, the same rule cast illustration uses for face/decal-only looks.
  - A body with no matching published look keeps its own set, so the head shows the static fallback.
  - The legacy path, used when no prepared source exists, is unchanged.
- A rebuilt bust was dropped by the next body render. The pose renderer republishes a cached look base on every render. `publishVisualLook` rewrote the look without its bust, so the head stayed `pending-bust` even after the rig was accepted.
  - Fix: `publishVisualLook` (`src/sprites/visualManifest.ts`) keeps the bust when the root, signature, base sha256 and served path are all unchanged.
  - A re-rendered base (new sha256) still invalidates the bust, as before. `visualRoot` with the pack hash is untouched.
- The bust drop was found by probing a `--keep` dry run in the page. After the first fix the status read `look_<key>` with state `pending-bust`, and the rig for that look was present.

Cast illustration route:
- `#so-cast-scene` renders in DrawerTabs (the chat tools under Overview), which sits on the workspace Author page.
- `drawerAt` in `src/features/where.ts` no longer routes it to Play. The registry label is now "Author › Illustrate prepared cast".

Tests (each fails on the old code):
- `visualCast.test.ts`: a posed body of a changed look resolves that look's rig and `castHeadStatus` ready. A plain posed body resolves `default`. An unpublished look resolves no rig.
- `lookRebuild.test.ts`: republishing the same artwork after a rebuild keeps the bust and the `ready` state. A changed signature drops it.
- `showMeTargets.test.ts`: every feature routed to the Play page has its selector rendered in the Play page tree, which is built from `Workspace.tsx`'s play branch. It failed on `cast-illustration`.
- `test/findings/errorCopy.json`: one probe row, for the `bodyFields` JSON catch.

Dry journey on offline lane 47:
- Setup: `SO_LANE_OFFLINE=1 st-lanes seed 47 --fresh --slim`, then `start 47`. No GPU, no ComfyUI, no model; every call came from the fakes.
- Command: `node scripts/debug/st-lanes.mts run 47 -- scripts/debug/so-p41-journey.mts run <k> --dry --candidate --label gapfix`. The build was this branch's `dist/`, after the master merge.
- Before the bust fix: PLUMBING-OK, but look-rebuild still failed with "close shot rig look none != look_<key>".
- run 1 `2026-10-14T19-47-14-258Z-gapfix-dry-run1`: PLUMBING-OK, 29 pass and 1 stub (gpu-idle).
  - look-rebuild passed: the close-shot head is on `look_<key>` and 2 changed-look turns had visemes.
  - Calls, all fake: 55 comfy, 4 sol, 4 landmarks, 72 artemis; 0 refusals; cleanup leaked 0.
- run 2 `2026-10-14T19-50-10-786Z-gapfix-dry-run2`: the same result, with 74 artemis calls.
- Header diff in both runs: only the known warning "open group is not in ctx.groups", because the owned group was deleted while it was still open. The lane was stopped afterwards.

Gates:
- `npm run gates:quick`: green. typecheck, typecheck:test, lint, jest related 1,528/1,528, replay `--cached`.
- `npm run gates -- --no-storybook --jobs=2`: all green in 184.9s.
  - jest: 8,411 passed and 1 skipped.
  - replay: 32/32 killed.
  - test:debug: 1,294/1,294.
  - build, typecheck, lint, test:release and test:plugin all green.
  - Storybook was skipped because no `.stories.tsx` or UI component changed.
- An earlier full-gates run before the merge was red on the `gaze-iris` golden. That golden was already stale on `35a9267e` and master `4b21fe8e` regenerated it. After the merge it passes unchanged, so this branch did not regenerate it.
- Worktree setup: `.build/` has no replay cache, so the first `gates:quick` replay `--cached` failed with E2BIG on the `--listTests` arguments; it passed once a full run had written the cache. `test:debug` needs the gitignored `test/sessions/adolion-stories.json`, which was copied from the main checkout.

## Gate record: 3090 block 2026-10-14, reference views, look edits, cast illustration (LIST)

- Worktree `C:\dev\so-gpu-block` at `9aead40b` plus the fix below. Lane 31 holds the plan 36 showcase (the three synthetic busts, not campaign content). The build was served as a candidate through a Playwright context route on the worktree `dist/`. Plugins were installed with the owner's OK; lanes were restarted after it. ComfyUI ran through the controller (`--cache-ram 8 --fast-disk`), not the runbook's native `--cache-none`: changing the controller's ComfyUI arguments means editing the owner's controller config, so that was not done. Text was unloaded (manual hold). No Sol call: the Sol identity rating (step 5) is deferred because the subscription was exhausted.
- Driver: none exists for these Studio steps. A scratch Playwright driver (not committed) reused `lib/pocSteps` (`chooseCharacter`, `stepBase`) and clicked the shipped controls: `#so-sprite-base` "Build four base candidates" / "Keep base 1", `#so-prepare-presentation` "Review selected base and bust" / "Accept base and bust identity", and `#so-reference-pack` "Draw reference views" / "Accept all six views". Records are in `C:\dev\so-lanes\31\debug\showcase-images\`. Outputs are copied to `C:\dev\so-showcase-art\gpu-block-20261014\`, with `visualSources.json`.
- Prepare needs a generated base set. The legacy root art is refused ("This generated set has no complete neutral base."). So each bust first got a four-candidate base in set `pres`, seed 1234, BiRefNet toonout: Wren 4 candidates passed QA (201 s), Garrick 1 (163 s; 3 refused on RAM), Pim 3 (194 s; 1 refused on RAM). The first attempt at all three timed out at 600 s. Cause: the media plugin's cold sha256 of `qwen3vl_8b_int8_convrot` took **672 s** under 92-100 % CPU from other agents' work, and the client gives up at 600 s. The hash is cached per server process, so the second attempt was quick.
- Prepare accepted for all three (source revision 1).
- Reference views, round 1:
  - First accept REFUSED for every bust: "The reviewed reference pack is incomplete."
  - Cause (product bug): the media plugin answers a fresh save with `.../<label>.png?t=<sha12>`, and `visualPath` refuses `?`. So `ReferencePackSession.accept` built a pack the manifest parser rejects. The look rebuild already strips this with `servedAsset`; the reference pack did not.
  - Fix in this branch: `src/sprites/referenceViews.ts` stores `servedAsset(save(...))`. New test in `referenceViews.test.ts` ("a fresh save answered with a cache-busting path is stored by its served path"); it fails on the old code (1 failed, 9 passed) and passes with the fix (10/10).
  - A second issue: retrying after the failed accept is refused ("Confirm replacing this generated sprite after reviewing it."), because the orphaned `refpack_<key16>` sets from the failed accept hold different bytes from the re-render. Not fixed. The four orphan sets on the lane copy were moved aside by hand.
  - After the fix, all three accepted: Wren `f2bbe945d093`, Garrick `059ef6b84b39`, Pim `70765f18e3ca`, each at revision 2. Draw time per pack of 4 renders: 199 / 169 / 136 s, about 34-50 s per view. Several attempts were refused on RAM first ("RAM available 9.4-10.9 GB; workload 8139 + reserve 4096") and retried.
  - Reload read-back: after a page reload, `visualSources[<folder>].pack` reads the same hash, 6 views, revision 2 for all three.
- Reference views, round 2 (same server): all three accepted again at revision 3: Wren `d48f9f7968c2` (150 s), Garrick `60c3da76ba8c` (127 s), Pim `cb7528738e1c` (136 s).
- Not measured: per-view seconds (only per pack) and peak VRAM against the 22 GB floor (no per-view sampler). The changed `visualRoot` in an expression key is proven by the unit test only. Sol contact-sheet identity rating (floor >= 90 %): DEFERRED.
- Look edits: the showcase story declares no look qualities, so no product-path changed look (`look_<key>`) can be triggered on these busts. Instead I used the builder's Edit = look (reference neutral, seed 1, 25 steps), kept to set `default`: Wren "dark blue hooded travel cloak" 38 s, Garrick "dented steel helmet, open visor" 66 s, Pim "wide brimmed green hat" 68 s. These are not published looks. The product-path changed look and its live head stay covered by the §5 journey's `look`/`look-rebuild` steps.
- Cast illustration (`#so-cast-scene`, Wren + Garrick): REFUSED in 2 s with "This Qwen node does not offer the two-reference cast scene input." The installed ComfyUI Qwen text-encode node has no second reference input. This is a host capability gap: no download or node update was made. "Cast illustration with layered fields on a model" stays unproven.
- GPU minutes: bases about 9 (plus 30 min of timed-out waiting with the GPU idle), reference views about 20 over two rounds plus refusals, look edits about 3.

## Harvest 2026-10-14 addendum

From `docs/plans/v2.8/61-harvest-triage-2026-10-14.md`. Ideas only (source licences: AGPL/GPL/none unless noted); verified against master `9e96871d`. Not built; the owner decides with the rest of this plan.

- **H16f director tag canonicalisation against a Danbooru vocabulary** (`docs/plans/v2.8/extension-research-2026-10-14/booru-autocomplete.md` P1, 3/M; MIT, tag data
  reusable with notice). The image director's prompt only forbids names, artists and quality tags (`src/image/prompt.ts:58-62`);
  nothing maps its tags to the model's vocabulary or drops duplicates. Recommended: **measure first** on the existing image
  goldens: share of director tags absent from the tag list, and whether canonicalising (alias → canonical, drop unknown)
  changes a blind pick. Build only if the unknown share is above 20 %. LI tier, informational.

## Gate record 2026-10-15 (image defects; p41 run 2 review)

- Reference views: `f858a160` cherry-picked (`db29a6bf`). Audit of every fresh-save path into a manifest: `publishVisualLook`, `visualPreparation` and `lookRebuild` already used `servedAsset`; `publishLookBust` and `withReferencePack` now normalise at the manifest edge (`19d99be7`); the tests fail on the old code.
- p41 run 2 defects, checked against the evidence:
  - b) rig "featureless silhouette with a question mark": the wizard's cards had no art, so the bases were built from SillyTavern's default picture (`img/ai4.png`, written pixel for pixel into the card). Fix `e587197f`: a base or rebase from that picture is refused with a clear reason (story `DefaultCardPicture`, `cardArt.test.ts`, `bodyRenderer.test.ts`). The journey needs real card art per member.
  - a) blink frames refused for mask spill, and c) no viseme (turns show `liveHeads: 0, ready: 0`, so no rig was ready): both follow from the silhouette art. No product change; re-check with real art.
  - d) one body on the set default: lease contention (see the plan 33 record), fixed in `22c46437`.
  - e) background "API request failed": no plan was stored (`lastPlan: null`), so the director model call failed before any render. The run's server log was not captured, so the cause is open.
  - f) cleanup leaked 2: the record holds only the count; the lane keeps three empty `SO-P41 *` sprite folders. Open until the leak list is recorded.
  - Cast scene: not a ComfyUI gap. v0.37.4 lists `TextEncodeQwenImage21.images` as one Autogrow input (`COMFY_AUTOGROW_V3`, `template.names` image_1..16); the old check read only the flat `images.image_2` key. Fix `4fccd124` (`qwenImageInput`, also used for the p2 pose second reference); prompt keys stay `images.image_N` (`finalize_prefix`). A real gap is a named `CastSetupGap` shown to the author (`4ac3f37d`). Recorded `object_info` fragment: `test/fixtures/comfy-qwen21-autogrow.object_info.json`.
- Gates on branch `v2.8-image-defects` (base `6e77c14a`), no GPU, ComfyUI or model use:
  - `npm run gates:quick` green after each fix.
  - `npm run gates -- --jobs=2 --skip=test-storybook:ci`: every step green across runs. Timing flakes, each retried once: `consequences.test.ts` C6 (p95 <= 5 ms under parallel load; green alone and in an earlier full run), harness `agent.test.mjs` "stalled OpenCode service" (15 s deadline under load; `npm run test:plugin` alone 311/311).
  - Storybook by hand (the `test-storybook:ci` script pins port 6006): `storybook:build`, `http-server .sb-static -p 6371`, test runner 854/855; the one miss `Workspace/Shell > Mobile` (unrelated, heading not found) passed on re-run together with the Gaze, BaseSpriteBuilder and PreparedCast stories.
  - Main bundle 1,290,510 B (budget 1,300,000).
- Needs a GPU re-check: the p41 journey with art-bearing cards; the two-member cast scene and the p2 pose second reference on the installed ComfyUI.

## Gate record: §5 journey x2 on the 3090, 2026-10-14/15 (LIST)

- Lane 33 (seeded fresh 2026-10-14, `--allow-local --headed`, `max_context` 32768, `image-harness.json` with Qwen 2.1 int8 + `birefnet_toonout`). Build served as a candidate: worktree `9aead40b` (the live-head gap fix) plus `f858a160` (reference-pack served path). Controller `automatic` (Artemis + ComfyUI). Wizard on the default authoring route, opencode `openai/gpt-6.1-sol`. Started after 22:45 local, when the Sol quota reset. Wrapper timeout 5,400 s.
- run 1 (`C:\dev\so-lanes\33\debug\p41\2026-10-15T01-45-12-948Z-a-real-run1`):
  - preflight, wizard (43 s) and story pass.
  - base x3 REFUSED. Ash: "Candidate 1: The GPU broker did not release the image lease. Candidates 2-4: An image batch already owns the local GPU". Bram and Cleo: the same in under 1 s each.
  - Everything that needs a base then failed or was refused: prepare x3 (driver: no base), expressions x3 (3/3), frames x3 (2/2), rig x3 ("no rebuild row for accepted look"), play ("no viseme mouth"), pose (no posed body, 30 min), look (30 min), look-rebuild, illustration.
  - Killed by my wrapper timeout (exit 124) after the illustration step, so there is no `record.json`, only `steps.jsonl` and screenshots. The journey's `cleanup` afterwards reported leaked 0. INCOMPLETE; the lease leak is the cause.
- run 2 (`...\p41\2026-10-15T03-15-16-676Z-a-real-run2\record.json`): VERDICT NOT GREEN. Calls: gpu-broker 100, comfy 44, artemis 77, sol 4, judge 129, deepseek 1.
  - Pass: preflight, wizard (37 s), story, base x3 (111/99/99 s), prepare x3, expressions x3 (about 88 s each), look (43 s), swipe, delete, reload, chat-switch, stale, gpu-idle.
  - The rest are defects for the image-defects agent:
    1. frames, 1 of 2 refused per member (mask-import) on `neutral/blink`. Ash: "The edit redrew the picture outside its mask (mean change 40.5/255, limit 16)". Bram: same, 44.8/255. Cleo: "The edit spills past its mask edge (within 12 px: mean 34.2/255, 22% over 48; limits 20 and 12%)". Evidence: `record.json` steps `frames[*]`, screenshots `13-15-frames-*.png`.
    2. rig x3 and look-rebuild refused, "bust only, rig not prepared". The vision model was shown a placeholder, not the bust: "a featureless silhouette with a question-mark graphic" (Ash, Bram, Cleo) and "a solid-black silhouette" (look-rebuild). The bust saved fine ("Saved bust (kept)"), so the image sent to landmarks is not the saved bust. Suspect: an unserved or `?t=`-suffixed path, or a missing-image placeholder reaching the vision call. Evidence: steps `rig[*]`, `look-rebuild`, screenshots `16-18-rig-*.png`, `22-look-rebuild.png`.
    3. play FAIL: "no viseme mouth observed on a ready live head", 570 s. Probably a consequence of 2, since no rig means no ready live head. Evidence: `turns.jsonl`, `19-play.png`.
    4. pose FAIL: "SO-P41 Bram: sit_edge on set default (wanted a posed sit_edge body)" after the 30-min wait. Ash and Cleo got posed bodies. Evidence: step `pose`, `20-pose.png`, `samples.jsonl`.
    5. background REFUSED: "API request failed" after 901 s. It made the run's one DeepSeek call (`/api/backends/chat-completions/generate`, step `background`), through the lane copy's image-prompt profile, which points at a DeepSeek profile. That paid route was not named by the runbook. Evidence: `calls.jsonl`.
    6. illustration REFUSED: "The last image could not be made". Same cause as the showcase run: "This Qwen node does not offer the two-reference cast scene input" (ComfyUI capability gap).
  - Cleanup: cards, group, library story and settings scrubbed, but "2 owned asset(s) leaked": two pose images under `SO-P41 Ash/lp_521e9e9b`. Removed afterwards with `so-assets remove --marker SO-P41`; `assert-clean --marker SO-P41` and `--marker SO-PL` exit 0 on lane 33.
- Floors (predeclared 2026-10-14): not met. Run 1 incomplete, run 2 NOT GREEN. No floor changed.
- Post-fix shakedown: the broker fix (`c49b7995`, cherry-picked here as `ed687cdc`) was built and the plugins reinstalled from this worktree. The shakedown journey did NOT run: the local controller (pre-fix code) was serving another lane's text suite (port 8141) and refused to stop with active work. Owed: one `so-p41-journey.mts run 1 --authoring claude --candidate` after a controller restart on the fixed code.
- GPU minutes: run 1 about 90 (mostly waits with the GPU idle on the stuck lease), run 2 about 75.

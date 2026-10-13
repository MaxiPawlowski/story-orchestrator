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
  repeat gate. Remaining queued broad repeats were cancelled under the owner's report-priority steering.
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

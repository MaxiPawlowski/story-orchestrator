**Prep should become the visual authority for gameplay:** accepted identities, current looks, place plates and style should feed every image route through one resolver. The first investment should be preserving and consuming existing preparation—not training another model.

This is a static review of `2403c70f`, the two reports, and the private preparation pipeline. No edits, builds, tests, servers, downloads or GPU work ran. Counts below distinguish declarations, usable files and recorded QA.

**The prep side already contains substantial useful information, but its installation bridge loses much of it.**

| Area | What exists today | Important limitation |
|---|---|---|
| Character specifications | 146 `sets.json` files; appearance and face notes for all 146; references, negatives, outfit/pose/prop descriptions and set selectors | These are disconnected authoring inputs, not one identity contract consumed by illustrations |
| Expression sets | 201 declared sets, including 146 complete defaults; all 2,889 required expression paths exist | **All 2,889 are Git LFS pointers in this checkout.** Their image bytes are unavailable here; installed ST copies were not inspected |
| Recorded expression QA | 2,440 `ok`, 197 `review`, 252 without status | Historical manifest claims, not newly verified visual quality |
| Generation provenance | 181 sets record base candidates, seed, prompts and selection information; expression records include drift/change/attempt/status | 20 sets lack that base provenance; no complete per-asset model/workflow/source fingerprint contract |
| Poses and stage | Two character preparation configs, 32 pose PNG paths, one rig directory, 16 stage JSON files | Narrow pose coverage; pose-file hydration was not established |
| Places | 83 background specifications covering 77 location IDs; prompt, filename, stock fallback and variant metadata | `campaign/backgrounds` is absent here. No campaign plates are available in this checkout |
| Extension preparation | Accepted base/bust manifests, changed looks, expressions, animation frames, posed bodies, liveHead rigs, optional six-view packs | The prior install audit found eight accepted visual sources, zero view packs and empty `sprites.builders` |

The campaign’s sprite renderer produces reference-based bases and localized expression/frame edits. It records useful QA, but a rejected candidate can still become the selected base, and failed expressions can be saved as `review`. File completeness therefore does not mean acceptance. [Sprite renderer](C:/dev/adolion-campaign/scripts/render_sprites.py:381)

It would be inaccurate to say there is *no appearance text or style recipe*. Appearance information already exists in set specifications and card SD prompts; pose preparation explicitly prefers `sd_character_prompt.positive`. Background generation has a fixed FLUX recipe, while sprites and poses have separate instructions/configurations. What is missing is **one transported, reproducible visual specification**, with truthful provenance for existing assets. [Pose preparation](C:/dev/adolion-campaign/scripts/render_poses.py:84), [background renderer](C:/dev/adolion-campaign/scripts/render_backgrounds.py:36)

The concrete bridge failure is in installation:

- Card building exports `folder`, `default`, `labels`, `local_map` and `sets[{id,when}]`, dropping appearance descriptions, references, outfit descriptions and QA.
- Sprite installation uploads files but does not provision `visualSources` or `builders`.
- Background installation skips an existing filename unless forced, allowing changed artwork under that filename to remain stale.
- The installer correctly rejects LFS pointers, but inventory/completeness checks are weaker.

[Card export](C:/dev/adolion-campaign/scripts/build_cards.py:66), [installation](C:/dev/adolion-campaign/scripts/install_st.py:93)

The highest-value prep improvements are therefore:

1. **Export usable identity and place manifests; verify installation by content.** Separate declared coverage, hydrated binaries, technical validity and visual QA.
2. **Consolidate identity traits, outfit state and style.** Freeze renderer-specific identity tags; keep clothing, pose and expression out of immutable identity.
3. **Resolve the existing QA debt.** Review the 449 expression entries marked `review` or without status. Record unknown historical provenance honestly.
4. **Prepare recognizable place anchors.** First inspect existing private/installed storage; then fill genuinely missing plates.
5. **Prepare likely look/pose combinations before play.** Prioritize actual story demand over rendering every possible combination.
6. **Add embeddings or LoRAs only after measuring reference-based routes.** Neither is required to establish the contract.

**The contract should extend the existing visual manifests, with portable source records and installation-specific bindings.**

The useful precedent is `VisualManifest`: hashed base/bust assets, look signatures, recipe revisions and guarded publication already exist. Reuse that machinery. [Current manifest](C:/dev/story-orchestrator/src/sprites/visualManifest.ts:5)

A proposed private asset layout:

```text
campaign/visuals/
  index.json
  styles/<style-id>/recipe.json
  identities/<opaque-id>/pack.json
  places/<opaque-id>/pack.json
  objects/<sha256>.<png|jpg|json|safetensors>
```

These are **proposed files**, not existing infrastructure.

| Record | Required fields |
|---|---|
| Common pack envelope | `formatVersion`, stable `id`, `kind`, `revision`, `digest`, `styleRef`, `assets`, `coverage`, `qa`, `provenance` |
| Every asset | Relative `path`, SHA-256, byte size, media type, dimensions where applicable, role, dependency hashes, recipe reference |
| Identity | Stable `subjectId`; roster/card binding; accepted identity anchor; immutable visible traits; `tagsByFamily`; default look |
| Each look | `lookId`, structured appearance fields and signature; base, bust and optional face crop; expression/frame assets; optional reference views, posed bodies and rig |
| Optional conditioning | Type, source-image hashes, crop/preprocessing recipe, encoder/adapter hashes, tensor format/shape/dtype, compatible renderer family; optional LoRA weights and trigger token |
| Place | Stable `placeId`; canonical plate; visible-description/tags; variants keyed by explicit state such as time/weather; viewpoint; optional horizon, ground/contact anchors, depth and masks |
| Style recipe | Visual target/reference board; route-specific positive/negative prompts; model/encoder/VAE hashes; adapters and weights; sampler/scheduler/steps/CFG; dimensions; seed policy; cutout/upscale settings; workflow/node revision |
| QA | Rubric version, checks performed, sample counts, results, unresolved findings and private evidence references |

Three details matter:

- **A style recipe can contain several renderer recipes.** Qwen editing and SDXL generation need different inputs while targeting the same visual appearance.
- **Embeddings are derived caches, not identity authority.** An embedding belongs to a particular encoder, preprocessing method and adapter contract. Face, body and outfit conditioning should remain distinguishable.
- **Hash actual image bytes after hydration.** A Git LFS object ID supplies an expected hash; hashing the pointer text does not verify artwork.

IP-Adapter supports reusable image embeddings and spatial masks. That makes offline conditioning preparation plausible, but the installed ComfyUI path would still need compatible nodes and validation. Plus and FaceID also use different representations; they are not interchangeable pack formats. [Official IP-Adapter documentation](https://huggingface.co/docs/diffusers/main/using-diffusers/ip_adapter)

Storage responsibilities should be explicit:

- **Campaign asset directory:** authoritative private packs and assets.
- **Story JSON:** lightweight bindings from roster members/player/place IDs to pack IDs and digests, plus the style reference. No embedded image bytes, embeddings or campaign-wide appearance dump.
- **ST user data:** installed pack catalog and verified assets. Materialize sprite/background files in the locations existing consumers support; keep pack metadata behind the media plugin.
- **Install settings:** local model availability and route configuration.
- **Chat state:** pinned pack references and selected runtime looks/place variants; gameplay-generated derivatives remain scoped to their originating run until deliberately promoted.

`formatVersion` describes the pack format, not a story version. No migration framework is needed. Existing `/characters/` path validation means portable object paths cannot simply be inserted into today’s `VisualManifest`; installation needs an explicit adapter.

Installation should verify all referenced bytes before publishing its catalog entry. Existing running chats retain their pinned assets when a newer pack is installed.

**Every gameplay route should consume the same resolved visual scene.**

That snapshot should contain selected visible subjects, intended appearance, displayed assets/substitutions, current place variant, style, and exact dependency hashes.

| Gameplay route | Pack consumption |
|---|---|
| Automatic illustrations | Director selects action/composition and allowed subject IDs. Code supplies immutable identity tags or visual references, current-look details and place conditioning |
| Prepared-cast Qwen scenes | Reuse accepted current-look references and the same scene snapshot; add explicit reference roles and aspect handling |
| On-demand looks | Start from the accepted identity/current-look anchor; change only the requested appearance layer; publish a derived look with complete lineage |
| Posed sprites | Resolve the prepared look/pose/frame combination first; render only a genuine cache miss |
| liveHead | Load the rig tied to the exact displayed bust hash and dimensions; fall back to that look’s static presentation when its rig is unavailable |
| Backgrounds | Display the prepared plate immediately; use it as a reference for a requested variant, rather than inventing the location again |
| Composite illustrations | Place accepted transparent sprites on the selected plate using composition anchors; optionally apply masked integration while protecting identity regions |
| SDXL with IP-Adapter | Load compatible cached face/body conditioning and per-subject masks; keep location/style conditioning separate |

Today’s Qwen scene graph supports at most two identity references. One character plus a plate requires role-aware instructions; two characters plus a plate requires a verified third-input capability or another composition route. A background must never be interpreted as another character. [Current cast graph](C:/dev/story-orchestrator/src/image/castScene.ts:50)

The empty-builder problem should be fixed by **separating asset consumption from asset generation**. Displaying or referencing a valid prepared image should not require its original builder settings. New generation should resolve a verified install-wide recipe, with optional character overrides. Today `castSceneBuilder` requires every selected character’s builder configuration. [Builder dependency](C:/dev/story-orchestrator/src/image/castScene.ts:36)

Fallbacks should be explicit and local:

| Missing or stale dependency | Behavior |
|---|---|
| Optional embedding/view/LoRA | Use another valid conditioning method or canonical tags; record the degraded method |
| Requested look still pending | Preserve a valid displayed look and mark the substitution; automatic illustrations defer/coalesce instead of waiting four minutes |
| Missing identity pack | Existing appearance-text route remains available, with no claim of reference-backed identity |
| Missing place plate | Use the authored stock fallback and visible place description; record that visual place fidelity is unavailable |
| Hash mismatch, incompatible rig or corrupt bytes | Refuse that dependency; use another verified presentation path |
| Newer pack exists | Keep the chat’s pinned pack until an explicit update; newer does not automatically mean the pinned pack is invalid |
| Dependency changes during rendering | Revalidate before placement; discard the stale result |

QA misses remain informational. These fallbacks do not switch built features off.

**Packs expose several gameplay issues beyond round 1.**

First, invalidation is currently too broad. Accepting reference views changes `visualRoot` and retains only the default look. Adding optional views can therefore invalidate already prepared outfit work. Pack evolution should invalidate derivatives by their actual dependencies: adding a profile view should not invalidate an unchanged frontal bust or rig. [Current invalidation](C:/dev/story-orchestrator/src/sprites/visualManifest.ts:124)

Second, `posesToPrepare` evaluates appearance from starting blackboard values. It does not prepare the later look states implied by the story. Preparation needs a declared demand list of look/pose combinations, supplemented by likely runtime combinations—not an unrestricted Cartesian product. [Preparation scope](C:/dev/story-orchestrator/src/sprites/poses/prepareList.ts:13)

Third, a whole-card file hash conflates artwork changes with card metadata changes. Record both container provenance and decoded artwork identity, so unrelated card-text edits do not unnecessarily invalidate visual derivatives.

Fourth, prep knows future appearances and places. **The director must receive only the selected, currently permitted pack projection.** Loading every look description or place variant into its context would create a new spoiler path.

Fifth, reference selection becomes a real planning problem. A close-up needs a sufficiently detailed face/bust; a full-body action needs body/outfit information. Feeding all six views indiscriminately can waste reference capacity and import unwanted pose/composition.

Finally, cached embeddings and prepared plates reduce repeated preparation, but they do not eliminate diffusion or the text-model reload. Continue measuring the entire image→next-reply cycle. Explicit identity references also do not solve actor selection, attribute assignment or stale scene facts by themselves.

**Existing QA is strongest on structure and local pixel defects, and weakest on semantic consistency.**

| Existing check | What it establishes |
|---|---|
| Campaign base QA | Largest alpha component ≥90% of foreground; clipping margins; default height ratio 0.80–0.98; detectable face |
| Expression QA | Ring drift <14 and edited-face change >4 |
| Frame QA | Drift <14, change >3, target-band share ≥0.60 |
| Stage checker | Valid references, set IDs, expression vocabulary and stage/talk shapes |
| Background checker | Metadata, naming, location consistency, 2–6 prompt sentences, usage and landscape orientation; permits unrendered entries |
| Extension builder/manifest tests | Pixel constraints, lineage, ownership, hashing, look publication and stale-result handling |
| Plan-80 rater | Within-character identity and selected edge/eye/seam defects |

None of the campaign checks establishes identity agreement across a set, distinction between different characters, cast-wide style coherence or sprite/background style compatibility. Color-histogram ranking is not identity verification. [Campaign QA](C:/dev/adolion-campaign/scripts/render_sprites.py:381), [background checker](C:/dev/adolion-campaign/scripts/check_backgrounds.py:29)

Plan 80’s rater explicitly says not to flag style choices. Its aggregate defect count also excludes `other`, so serious anatomy failures need a separate metric. Its normal sheets provide panel labels; they are not a blind comparison between methods. [Rater implementation](C:/dev/story-orchestrator/scripts/debug/lib/sheetRater.mts:8)

I would use the following evaluation program. **These are proposed new floors, not measured results or replacements for existing floors.**

| Layer | Sample and method | Proposed floor |
|---|---|---|
| Asset/pack integrity | Census of all 146 identities, 201 sets, required labels and 83 background declarations | 100% declared dependencies accounted for; every asset advertised as ready decodes and matches its hash; zero pointers treated as images |
| Prep identity pilot | Eight varied identities ×12 assets spanning expressions, looks, poses and views: 96 samples; references visible, method/status hidden | ≥90% same identity overall; ≥80% for each identity; zero identity swaps |
| Cast style | Overview of all 146 accepted neutral anchors after hydration; detailed rating of flagged outliers against one style board | ≥90% rated ≥4/5 for style compatibility; report every outlier |
| Place continuity | Twelve locations ×three prepared views/conditions: 36 samples | ≥90% preserve declared visible spatial/appearance invariants |
| Sprite/plate match | 24 representative pairings, rated together | ≥90% rated ≥4/5 for style compatibility; separate lighting/contact defects |
| Rig/frame quality | Every newly published rig/frame; saved-byte checks plus visual samples | Preserve plan-80 floors: base edge ≥1,200; bust eye width ≥40; seam ≤1.3; both eyes close; zero see-through over 81 gazes, with nonempty measured regions |
| Bridge behavior | Deterministic export→install→resolve→route tests and fault injection | Zero wrong-subject/place bindings, stale placements or cross-chat writes; correct fallback in every fixture |
| Gameplay confirmation | Round-1 design: 72 single-character +24 pair images per arm, control versus candidate | Identity ≥90% overall/≥80% each; zero pair swaps; outfit/action/place each ≥90%; no quality-category mean regression >0.2/5 |

For method selection, retain round 1’s smaller **12 cases ×two seeds ×three arms =72 images** pilot: directed SDXL, Qwen references and composite-based generation. Freeze pack inputs before rendering. Reference-conditioning strength and recipe tuning belong in the pilot; confirmation uses held-out scenes.

Blind ratings should hide method, filename, manifest status and seed. Include 10% duplicate judgments, wrong-identity controls and independent adjudication of disagreements. Private campaign review goes to the permitted model reviewer; owner-facing examples use spoiler-free fixtures. Report confidence intervals clustered by identity/scene. Small zero-failure samples are not proof of universal reliability.

Automatic embedding retrieval can flag identity confusion, but calibrate it against those labels first. Do not invent a universal cosine threshold, and count detector failures explicitly.

Bridge fixtures should include:

- LFS pointers, corrupt images and same-filename changed bytes.
- Empty `builders` with valid prepared assets.
- Renamed card folders and repeated subject names across stories.
- Missing plate, embedding, look, rig and third Qwen input.
- Adding optional views without invalidating unrelated assets.
- Pack replacement, outfit change, rollback and chat switch during a render.
- A future look/place that must remain absent from the director’s inputs.
- Actual workflow metadata matching the inputs consumed.

The p41 journey remains the end-to-end spine: run twice on one frozen build in a lane ≥30. However, its illustration step currently checks manual cast placement and the lead member’s current-look metadata; its background step does not establish place fidelity. Add automatic illustration, both-subject binding, plate consumption and empty-builder coverage. [Journey checks](C:/dev/story-orchestrator/scripts/debug/so-p41-journey.mts:286)

Reuse `so-image-bench.mts` for pixel measurements and contact-sheet production; extend its rubric for style, place identity, anatomy and pair assignment. Preserve the original plan-80 results—including misses—alongside the new measurements.

Future campaign checks include:

```text
python scripts/check_stage.py
python scripts/check_backgrounds.py
python scripts/asset_inventory.py --json
python scripts/normalize_sprite_sets.py --check
python scripts/merge_stage_sets.py --check
```

Those existing commands need the proposed byte/hash and semantic checks alongside them. For implementation, run `npm run gates:quick` before the full `npm run gates`, then the real-model journeys during an authorized GPU window. None ran during this review.

For scheduling, retain the existing paired median send→reply floor of ≤1.10× the no-sprites arm. Add at least 30 image→next-reply cycles per finalist, split between immediate sends and realistic reading gaps. Record planning, queueing, image time, reload time, TTFT, dedicated/shared VRAM and RAM. Require zero OOMs, refused text requests and stale placements; report latency tails separately.

**My ranking across both halves, using expected impact × confidence / cost, is:**

| Rank | Work | Impact / confidence / cost | Downloads or GPU |
|---|---|---|---|
| 1 | Byte-aware inventory; pack export/import; verified installation; consume assets independently of builders | Very high / high / medium | CPU work; hydration requires download approval |
| 2 | Shared visual-scene resolver; canonical identity tags; truthful render provenance and director-contract fixes | Very high / high / medium | Implementation is CPU-only; live verification needs GPU |
| 3 | Shared style specification and QA debt review | High / high / low–medium | Reviewer calls; rerenders only where justified |
| 4 | Qwen reference-backed gameplay pilot, including place conditioning | High / medium / medium | Installed-model GPU time; no assumed new download |
| 5 | Selective place plates and demanded look/pose preparation | High / high / medium–high | Batch GPU time; inventory installed/private assets first |
| 6 | Sprite/plate composition, then protected-region integration | Medium–high / medium / medium | CPU composition; GPU for integration |
| 7 | SDXL IP-Adapter with cached conditioning and regional masks | Potentially high / medium / higher | Nodes, adapter/encoder downloads, disk check and GPU experiments |
| 8 | Character LoRAs or broad asset regeneration | Potentially high / lower / highest | Curated data, training dependencies and substantial GPU time |

The background renderer’s FLUX dependency also needs reconciliation with the audited install’s retired FLUX route before scheduling its batch. Prefer adapting it to the selected, measured style recipe over assuming its historical workflow is available.

Per-character LoRAs should follow a demonstrated remaining identity problem. SDXL LoRA training is supported, but training is sensitive and can overfit; accepted anchors and generated expressions do not automatically constitute a suitably varied training set. [Official training documentation](https://huggingface.co/docs/diffusers/en/training/dreambooth)

The first concrete deliverable should be **one verified identity pack and one place pack consumed by the stage, manual cast rendering and automatic illustration**, with missing-builder and stale-file tests. That proves the bridge before expanding preparation across the campaign.
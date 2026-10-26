# 20 — Visual bridge: prepared assets as the visual authority (2026-10-26)

Owner decision 2026-10-26: go ahead as recommended. Prepared assets (an identity pack per character, a place pack per
location, a style recipe) become the visual authority that every gameplay image route reads, through one resolver.

Sources: `research/image-astra-prep-bridge-2026-10-26.md` (Astra round 2: pack contract, storage split, fallbacks,
floors, first deliverable), `research/image-astra-2026-10-26.md` (round 1: resolved visual-scene snapshot, ranking),
`research/image-audit-2026-10-26.md` (code audit), `18-image-e2e-review.md` (measured e2e and blind ratings, on master
`29e84c89`). Precedents reused: `src/sprites/visualManifest.ts` (hashed assets, look signatures, guarded publication),
`src/image/castScene*.ts` (Qwen references, identity checks, stale-result discard), `src/image/runtime.ts` / `prompt.ts`
/ `cast.ts` (automatic pictures), `src/sprites/**` (stage).

Campaign facts, counts only (the campaign is private and unspoiled for the owner):

- 146 identity specs, 201 expression sets (2,889 required expression paths, LFS pointers in the checkout), 83 background
  specs for 77 locations; the owner's install has 25 backgrounds, 8 accepted visual sources and empty `sprites.builders`.
- The campaign card build drops appearance data; its installer provisions neither `visualSources` nor `builders`, and
  skips a background whose filename exists (stale art stays).

Evidence that sets the order (18, blind, Opus / Sol overall 1–5): Qwen prepared cast 4.4 / 5.0 with 8 of 8 same person as
the sprite; SDXL with authored appearance 2.4 / 2.4 (0 of 5); SDXL with card text 1.4 / 2.0 (0 of 5).

## 1. Contract

### Pack envelope (every kind)

- `formatVersion` (1): the pack file format only. Stories carry no version, there are no migrations and no backward
  compatibility; a format change rewrites the exporter and the reader together.
- `id` (stable, `[a-z0-9][a-z0-9_.-]{0,127}`), `kind` (`identity` | `place` | `style`), `revision` (int ≥ 1).
- `digest`: sha256 of the canonical JSON of the pack without `digest` (keys sorted, no whitespace; `stableStringify`).
  The reader recomputes it and refuses a mismatch.
- `styleRef` (optional `{id, digest}`), `assets[]`, `coverage` (counts), `qa` (`status` accepted | review | unknown,
  `rubric`, `findings`), `provenance` (`source`, `recipe`, `notes`).
- Every asset: served `path` (installed form: under `/characters/` or `/backgrounds/`; no `..`, no query), `sha256` of the
  hydrated bytes (never of an LFS pointer), `bytes`, `media` (png | jpeg | webp), `role` (unique in the pack), optional
  `width`, `height`, `deps` (sha256 list), `recipe`.
- Unknown keys are refused, so the canonical form the exporter hashes is the form the reader validates.

### Identity pack

- `subjectId`, `traits` (immutable visible traits), `tagsByFamily` (renderer-specific identity tags, e.g.
  `illustrious`; `default` as fallback), `defaultLook`, `looks`.
- Each look: `fields` (the card-field values that select it; the default look has none), `base` (role), optional `bust`,
  `face`, `expressions` (label → role). Two looks may not share the same fields.
- Later (stage 6+): optional conditioning entries (type, source hashes, preprocessing, encoder/adapter hashes, tensor
  shape), reference views, posed bodies and rigs per look. Embeddings are derived caches, never identity authority.

### Place pack

- `placeId`, `name`, `description` (visible description only), `tags`, `plate` (role), optional `variants`
  (`{ when: { <quality>: <value> }, plate }`, e.g. `time_of_day: night`). Later: viewpoint, horizon, ground/contact
  anchors, depth, masks.

### Style pack

- `target` (visual target text), `recipes` (per renderer family: `positive`, `negative`, `checkpoint`, `sampler`,
  `steps`, `cfg`). Later: model/encoder/VAE hashes, adapters, workflow revision, seed policy, cutout/upscale settings.

### Story bindings (story JSON: bindings only)

`illustrations.packs`:

- `identities: { <roster id>: { id, digest } }`
- `places: { <checkpoint id>: { id, digest } }`: the last checkpoint on the chat's path that binds a place or authors
  `effects.background` decides; a later background without a pack is an unbound place (never the earlier pack).
- `style: { id, digest }`

No image bytes, embeddings or campaign-wide appearance dumps go in the story. An unknown roster id or checkpoint id is a
validation error. A binding change is a compatible story update (`visual-packs-changed`).

## 2. Storage split

- **Campaign directory (authoritative, private):** `campaign/visuals/{index.json, styles/, identities/, places/,
  objects/<sha256>.<ext>}`; portable relative paths. Proposed; built in stage 3.
- **Story JSON:** the bindings above.
- **ST user data (installed catalog):** `<data>/<user>/story-orchestrator/visual-packs/**.json`, one file per pack revision,
  listed by the media plugin (`GET /packs`, read-only, ≤ 512 files of ≤ 512 KB, depth ≤ 3). Images are materialised where
  current consumers read them: sprites under `/characters/<folder>/…`, plates under `/backgrounds/…`, named by content
  hash so a new revision never overwrites a file an older chat pins. The installer verifies every referenced byte before
  writing the pack file.
- **Install settings:** model availability and routes (`sprites.sceneRecipe`, builders, image purposes).
- **Chat:** the chat pins its story copy (`pinnedStory`), so it pins each binding's digest; the resolver resolves an exact
  `id@digest`, never "latest of id". A newer installed revision is reported on the snapshot (`newer`) and taken only through
  the chat's own "Update to the latest". Run-generated derivatives stay scoped to their run until promoted. Selected
  runtime looks come from card-field qualities on the blackboard (already chat state); no separate slice in stage 1.

## 3. Resolved visual-scene snapshot

One resolver, `resolveVisualScene` (`src/sprites/packs/scene.ts`, pure), wrapped by `createVisualBridge`
(`src/sprites/packs/bridge.ts`, async, injected host: plugin listing, served-file sha256, text hash). Output:

- `subjects[]`: member, name, `source` (pack | none), `fallback`, pack ref, QA status, newer revision, `intended`
  (look id or null, fields, signature), `displayed` (look id, base and bust files with sha256), `substituted`, identity
  `tags` for the route's family.
- `place`: deciding checkpoint, source, fallback, pack ref, variant, plate file, name, description, tags.
- `style`: source, fallback, pack ref, target, family recipe.
- `packs` (sorted `id@digest`), `dependencies` (sorted files with sha256), `key` (stable string over packs, dependencies,
  looks and place; two scenes with the same key are the same visual input).

Verification: every asset the resolver considers is hashed (fetched bytes, `cache: no-store`) before it counts; the
bridge iterates until no new asset is asked (fallbacks get hashed too). Hashes are cached per catalog read; a fresh read
(every picture, every cast scene) re-hashes. `stillCurrent(scene)` re-reads the catalog and re-hashes every dependency.

## 4. Per-route consumption

- **Stage (built):** a bound member with no sprite folder and no builder stands from the pack's default look; every
  verified non-default look is a stage set `pk_<look>` keyed by its look signature, so a look change shows the pack's look
  without an on-demand build. Installed sprites keep their default; the pack adds looks. Posed bodies use the pack look as
  their stand-in.
- **Prepared cast scene (built):** a bound member's displayed pack look is the Qwen reference (root `pack:<id>@<digest>`);
  no accepted visual source is needed. A pack that lacks the current look uses the default look with the missing fields
  named in the instruction ("the reference predates …"), unless an accepted source has the exact look. Generation config is
  separate from assets: builder entry, else `sprites.sceneRecipe`, else the one discovered Qwen 2.1 edit route; the picture
  records `recipe_source` and `visual`.
- **Automatic pictures (built):** identity tags from the pack are pinned in code (count tags lead), the director sees
  `identity tags (copy verbatim)` plus the current look, and the place pack's name and description replace the
  background-name guess. Stage 2 (built): when every visible character (1–2) has a current look with a usable reference,
  the scene renders through the prepared-cast Qwen graph instead (`image.automaticRoute`, section 7 stage 2).
- **On-demand looks, posed bodies, reference views (built):** with no builder entry, the install-wide default Qwen route is
  used with the crop box and base set of the character's accepted visual source (section 9).
- Later routes: liveHead loads the rig of the exact displayed bust hash; backgrounds display the plate; composites place
  accepted sprites on the plate; IP-Adapter loads cached conditioning (stages 5–6).

## 5. Fallbacks (never a silent change; recorded on the picture as `image_director.visual`)

- Unbound member or place: text route as before (`unbound`).
- Pack not installed, or installed under another digest: text route, `pack-missing`, newer revision named.
- Pack of the wrong kind: `pack-kind`.
- Look the pack lacks: default look shown, `substituted: true`, `look-missing`; the cast scene names the fields.
- File changed under the same name, corrupt, unreadable: that asset refused (`asset-mismatch`); default look if it verifies,
  else no pack image. Plate mismatch: authored background name, `asset-mismatch`.
- Variant plate fails: canonical plate, variant fallback recorded.
- Catalog unreadable: text route, `visual_issue` on the picture.
- Pack or file changes during a render: the result is discarded before save (cast scene) or before placement (automatic).
- Newer pack installed: the pinned one is used; never auto-upgraded.
- QA status below accepted: used, recorded (`qa`); QA misses are informational and never switch a feature off.

## 6. Spoiler path

The image-prompt model gets only the currently permitted projection (`directorView`): the current look's fields, the
pack's immutable traits and tags, the place on the current path and its selected variant, and the style target. Never
another look, variant or place in the pack, never a pack bound to an unreached checkpoint. Traits and tags reach every
picture of that character, so a secret form must never be in them (author guide topic `visual-packs`).

## 7. Stages

1. **This plan (built, branch `v3.0-visual-bridge`):** pack types and validation, catalog through the media plugin, story
   bindings (schema, validate, storyDiff, Studio list, guide), one resolver, consumption by the stage, the manual cast scene
   and automatic pictures (tags + place), install-wide default Qwen recipe, review-18 prompt fixes (section 8), fixtures and
   tests. Live gate owed (section 11).
2. **Automatic scenes through the Qwen reference route** (built, branch `v3.0-visual-bridge-s2`, CPU/dev only; evidence: 18).
   Adoption is owed: the 72-image route pilot plus 18's blind result, then the full gameplay comparison, before it is the
   settled default (owner decision 4). Until then the setting defaults to `auto` (every built feature on) and the owner can
   choose `sdxl` to keep the earlier pictures. Built:
   - **Route choice** (`src/image/autoScene.ts` pure, `autoSceneHost.ts` host, wired in `runtime.ts` `plan`/`direct`):
     `image.automaticRoute` `auto` | `sdxl` | `qwen` (settings copy, Connections → Images select, settings reference). Only
     automatic scene requests are routed (story cues, every-N replies; `ImageRequest.automatic`); manual pictures, portraits
     and backgrounds record `not-automatic` / `background`. `auto` renders through Qwen when the director's visible list (or
     the scene's subjects without a director) names 1–2 present, non-narrator story members, each with a resolved current look
     from a pack or an accepted visual source (`castSceneIdentities`, no look wait: a look still being prepared is
     `look-pending` and the picture goes to SDXL instead of the cast scene's 240 s wait), and the builder / `sprites.sceneRecipe`
     / discovered Qwen route resolves with its nodes and models (two characters also need `images.image_2`). Otherwise SDXL
     with the reason. `qwen` (references only) refuses with the reason before the director call; a request can force an arm
     (`ImageArgs.route`, used by the pilot). Every picture records `image_director.route {name, reason, setting}` beside
     `visual` and `prompt_source`; Qwen pictures also record `qwen {checkpoint, recipe, recipe_source, identities, plate,
     aspect}`, positive = the Qwen instruction, negative = the Qwen negative. Reasons: `references-ready`, `setting-sdxl`,
     `not-automatic`, `background`, `no-story`, `no-one-visible`, `too-many-visible`, `visible-not-in-cast` (e.g. the player
     persona; persona packs later), `no-reference`, `look-pending`, `media-unavailable`, `recipe-missing`, `models-missing`,
     `second-input-missing`.
   - **Scene grounding**: when the route can be Qwen, the director is asked for an extra `instruction` field (plain English:
     action, pose, expression, props, place; never hair, eyes, body or clothing; the prompt is unchanged otherwise, so the
     plan-32 invariance holds). The Qwen instruction is that text (else the caption, else the cue text plus the illustrated
     reply), then `Character N is <name>, current look: …` per subject (a substituted pack look names what the reference
     predates), "the current look wins", `Setting: <place name>, <description> (<tags>)` from the resolver's current place
     (pack, scene fact, authored or displayed background; never another look, variant or unreached place), the plate clause,
     and a pose clause against copying the reference's standing pose or side-by-side arrangement; the graph keeps "one
     coherent scene, never panels or a collage". The place plate is a reference only when
     `qwenImageInput(discovery, "image_<n+1>")` holds (the recorded ComfyUI v0.37.4 Autogrow node offers 16 inputs); it is
     hashed against the pack before upload and is part of the render key.
   - **Placement**: automatic pictures place on `plan.target` (the reply that cued them); a cued message that no longer exists
     refuses ("The message this picture illustrates is gone.") instead of falling back to the last message. The manual cast
     scene places on the last character reply (`illustratedReply`), not the last message, and takes an explicit `target`.
   - **Aspect**: not applied. `TextEncodeQwenImage21` has only `resolution` (an area) and outputs an empty latent on the first
     reference's size ("any other size shifts the edit", `comfy_extras/nodes_qwen.py`), and no 64-channel latent node exists to
     replace it. Qwen pictures take the first reference's shape at the recipe's area (`qwenOutputSize`, recorded as the size);
     the director's aspect is recorded as `aspect.requested`, with `drawn: "reference"`.
   - **Idle window**: the shared Qwen render (`castSceneHost.renderQwenJob`, used by the cast scene and automatic pictures)
     waits for text priority, then leases through `leaseOutsideTurns` (no reply or chained voice pending; a lease granted as
     the player sends is handed back and retried). SDXL already leased that way. Both record `idle_wait_ms` (render start →
     lease) on the picture. No 20 s quiet window and no image → next-reply TTFT metric yet (pilot and live measurement).
   - **Stale discard**: the automatic Qwen render re-checks the run, the chat, the cued reply's text, accepted sources and the
     current identities before upload, after the render and after save (a saved file is removed on refusal), and the pack
     catalog with every file hash after the render; `direct` re-checks the packs before placement.
   - **Pilot harness** (not run): `scripts/debug/so-image-pilot.mts plan | run | pack`, cases frozen in
     `test/fixtures/image-pilot/cases.json` (12 cases on the p41 cast: 8 single, 4 pairs, Ash's prepared navy-coat look twice,
     close/upper/full views, night, lightning, lantern and lens-glow lighting), seeds 101/202, arms `sdxl-directed` and
     `qwen-refs` forced through `storyOrchestratorImage.direct`; the composite arm is skipped and recorded (no compositing route
     exists; stage 5), so a full run is 48 renders, not 72. `pack` writes `blind/` (shuffled `img-NN.png`, `ref-X.png`,
     `items.txt`, `brief.md` with a pose/composition question, about 10% hidden duplicates) and `key.json` outside it.
   - **Pilot run needs**: a lane ≥ 30 after `so-p41-journey run <k> --keep` (the p41 cast with accepted visual sources and
     Ash's navy-coat look, the kept chat with the story running), the lane cleared for ComfyUI (`allowComfy` or
     `SO_ALLOW_COMFY=1`), the installed Qwen 2.1 edit files and the SDXL scene checkpoint, an image-prompt profile, and an
     agreed GPU window (about 48 renders: SDXL ~8–15 s, Qwen ~25–35 s each plus model swaps and director calls); then two blind
     raters on the pack and a comparison against 18's floors.
3. **Campaign export and install (private repo, campaign side).** `build_cards.py`/a new exporter writes identity, place
   and style packs with digests from hydrated bytes (LFS pulled, pointers refused); `install_st.py` materialises images by
   content hash, verifies every byte, writes the pack files, and writes story bindings; it also provisions `visualSources`
   for prepared characters (and `builders` only where a character needs its own route). Inventory separates declared
   coverage, hydrated binaries, technical validity and visual QA. Downloads/hydration need the owner's OK.
4. **Background renders as place packs** (owner addition). The 77 specced locations vs 25 installed backgrounds: a new
   background recipe on the selected style (SDXL Illustrious wide, or Qwen), chosen by a small blind rating against the
   existing 25; rendered as place packs (canonical plate + variants), installed by content hash (fixes the
   skip-if-filename-exists stale install), demand-ordered (places the stories visit first). The campaign renderer's FLUX
   recipe is retired in the extension and is not reused. GPU batch time: about 77 plates + variants at SDXL ~8 s or Qwen
   ~28 s each plus model swaps, so roughly 15–60 min of exclusive GPU; the campaign render runs only when the owner OKs a GPU
   window. Floors: place QA (section 10).
5. **Place plates in pictures and composites.** Plate as a Qwen reference (third input, verified) or sprite/plate composite
   with protected-region integration.
6. **IP-Adapter / cached conditioning** (downloads, nodes, measurement); LoRAs only after a demonstrated remaining
   identity gap.

## 8. Review-18 fixes folded into stage 1 (each tested)

- One resolved appearance per character: the director is told the CURRENT CAST appearance is authoritative and only
  action, pose, expression and props come from the story text; pack subjects carry their resolved tags + current look.
- Tag assembly (`src/image/tagHygiene.ts`): the director's framing words are dropped and the chosen shot appended once
  (no `cowboy shot, cowboy shot`, no `upper body … cowboy shot`); `from_below`/`from_above` dropped unless that angle was
  asked; full card names and the persona name stripped from tags (ordinary words kept); count tags lead and must match
  `visible` (pack count tags win; a wrong director count becomes `solo` for one person or is dropped).
- Location: with no scene fact and no authored background, the stage's displayed background names the place; a bound
  place pack wins over both.
- Director refused while the GPU is held (409 residency after a Qwen render): wait for the GPU broker to leave
  image/waiting/held (≤ 60 s), retry once, then the template prompt, recorded as `director_issue` ("The text model could not
  load while another image held the GPU…").
- Stage 1b (not built here): persona captions (the persona is never drawn but captions name it); semantic repetition
  (story title leaking into every background); intent unification and idle-window scheduling (stage 2 item).

## 9. Empty Qwen setup (owner addition)

- `sprites.builders` is empty on the owner's install and nothing provisions it. Consumption no longer needs it (stage,
  cast scene). Generation uses an install-wide default Qwen recipe whenever a character has no builder entry:
  `sprites.sceneRecipe` if set, else the one installed Qwen Image 2.1 edit diffusion model (turbo/lightning excluded), the
  one Qwen VL encoder and the one Qwen image VAE ComfyUI offers, each fingerprinted through the media plugin.
- Per-character crop box and base set come from the accepted visual source (`box`, `baseSet`), so the 8 prepared
  characters get on-demand looks, posed bodies, reference views and cast scenes without a builder entry. The derived
  builder is never written to settings.
- What cannot be derived, surfaced instead of failing silently:
  - a character with no accepted visual source: the changed-look Repair row says "No accepted base and bust: prepare this
    character's presentation in Studio first";
  - no Qwen files, ambiguous files or unfingerprintable files: install Repair row `sprite-qwen-route-missing` naming what is
    missing and the waiting characters; an unreachable ComfyUI raises no row.
- No settings UI for `sprites.sceneRecipe` in stage 1 (discovery covers the owner's install); a picker is stage 3 work.

## 10. Tests and floors

Deterministic tests (built, all fail without the change): pack contract and digest refusal; LFS-pointer media and
unserved paths refused; bindings validated and `visual-packs-changed` compatible; resolver identity/look/place/variant/
style with dependency hashes; later background without a pack is unbound; look-missing substitution recorded; hash
mismatch refused (look, default, plate); chat pins its pack (newer reported, never used; removed pinned pack falls back);
future look and future place absent from the director input, template and pinned tags; stale file or replaced pack makes
the scene stale; stage stands a pack-bound member with no sprites or builder and switches to the pack's look; cast scene
with empty builders and no visual source renders from the pack on the discovered route, install recipe wins, no recipe is
refused before any lease; pack replaced or file changed mid-render discards the cast scene; default recipe derives builders
from accepted sources; no Qwen models raises the Repair row; tag hygiene and director retry. Fixture packs are invented and
neutral (`test/fixtures/visual-packs/`, `test/fixtures/visual-bridge.story.json`).

Proposed new floors (Astra; not measured, not replacing existing floors):

- Pack integrity census: 100% of declared dependencies accounted for; every asset advertised ready decodes and matches its
  hash; zero LFS pointers treated as images.
- Prep identity pilot: 8 identities × 12 assets = 96 samples; ≥ 90% same identity overall, ≥ 80% per identity, zero swaps.
- Cast style: ≥ 90% of 146 accepted anchors rated ≥ 4/5 against one style board; every outlier reported.
- Place continuity: 12 locations × 3 views = 36 samples; ≥ 90% keep declared visible invariants.
- Sprite/plate match: 24 pairings; ≥ 90% rated ≥ 4/5; lighting/contact defects reported separately.
- Rig/frame quality: plan-80 floors kept (base edge ≥ 1,200; bust eye width ≥ 40; seam ≤ 1.3; both eyes close; zero
  see-through over 81 gazes).
- Bridge behaviour: zero wrong-subject/place bindings, stale placements or cross-chat writes; the right fallback in every
  fixture.
- Gameplay confirmation: 72 single + 24 pair images per arm; identity ≥ 90% overall / ≥ 80% each; zero pair swaps;
  outfit/action/place each ≥ 90%; no quality-category mean regression > 0.2/5.
- Route pilot before stage-2 adoption: 12 cases × 2 seeds × 3 arms = 72 images (directed SDXL, Qwen references,
  composite), frozen pack inputs, blind ratings with method hidden, 10% duplicates.
- Scheduling: paired median send → reply ≤ 1.10× the no-sprites arm; ≥ 30 image → next-reply cycles per finalist; zero
  OOMs, refused text requests or stale placements.
- Place QA for stage 4 renders: background checker plus content hash; place-continuity floor above; blind rating of the
  new recipe against the 25 installed backgrounds before the batch.

## 11. Live gate

Owed. Not run here: no ST staging, no GPU and no lanes (lane 33 and the GPU belong to another agent). When run: lane ≥ 30,
p41 journey twice on one frozen build, plus an install with fixture packs: stage shows the pack look with empty builders,
cast scene from a pack, an automatic picture carrying `image_director.visual`, a file swapped mid-render discarded, and the
owner-install check that the discovered Qwen route resolves (`sprite-qwen-route-missing` absent).

## Owner decisions (2026-10-26, "as recommended")

1. Place bindings stay keyed by checkpoint.
2. Player persona identity packs: later (a visible persona keeps the picture on SDXL, `visible-not-in-cast`).
3. `install_st.py` writes the catalog folder directly (no media-plugin write route).
4. Stage-2 adoption is gated by the 72-image pilot plus 18's blind result, then the full gameplay comparison before it becomes
   the settled default. Built with `image.automaticRoute: "auto"` per "every built feature on"; the owner can choose `sdxl`.
5. `sprites.sceneRecipe` stays discovery-only (no picker).
6. Pack assets in QA `review` stay usable and flagged (`qa` on the picture).

## Unresolved questions

1. The pilot as built has two arms (48 renders): build a composite arm (stage 5 work) before the pilot, or run two arms now?
2. Should the director reply be frozen per case for the pilot (both arms share one director answer), or is a live director per
   render the fairer product comparison (current harness)?
3. Aspect: pad the first reference to the requested shape (keeps latent and reference equal) once a blind check shows it does
   not cost identity, or keep the reference's shape?

## Gate record

- 2026-10-26, branch `v3.0-visual-bridge` (from `v3.0-harness-image-compact` `d12deead`), code commit `f4f7e5b4`, plan `b5cbcc5e`.
- `npm run gates:quick`: green (typecheck, typecheck:test, lint changed, jest related, defect replay cached) before the full run.
- `npm run gates` (full, Storybook included, no `--resume`): all green in 539.3 s.
  - typecheck, typecheck:test, debug:typecheck, lint, build, test:release, test:replay: ok.
  - test (jest): 900 suites passed, 1 skipped; 10,487 tests passed, 1 skipped.
  - test:plugin 128 pass / 0 fail (includes `packRoutes.test.mjs`); test:debug 1,569 + 408 pass / 0 fail.
  - test-storybook:ci: 166 suites, 1,004 tests passed (includes `VisualPacksPanel` stories).
  - main bundle `dist/index.js` 1,272,660 B (budget 1,300,000); pack, resolver, recipe and tag code ride the lazy sprites/image chunks.
- Guard updates, each with a stated reason: ownership census rows (`bridge.ts#verifying` local, `catalog.ts#packCatalog`
  local, `defaultRecipeHost.ts#startDefaultRecipe.run` partial); error-copy rows for the new catch/template sites and the
  `runtime.ts#directorReply` row renamed to `#once`; arrival golden gains the new fixture story; session baseline names
  `sprites.sceneRecipe`; the plan-32 director-prompt invariance declares the review-18 tag-skill line; code-health file
  budget kept by moving pack types to `engine/visualPackSchema.ts`, the topic to `copilot/guideTopicsVisual.ts`, stage
  helpers to `sprites/packs/stagePacks.ts`, and dropping five comment lines from `schema.ts`.
- Deviation: `lookHealth.test.ts` expectation changed on purpose (a character without an accepted source now gets the
  precise "No accepted base and bust" reason instead of "choose a reference expression pack").
- Live gate: NOT run, owed (section 11). No ST staging, no GPU, no lanes in this task.
- 2026-10-26, stage 2, branch `v3.0-visual-bridge-s2` (from `v3.0-visual-bridge` `cd5208a8`), code `a058db0a`, pilot harness `fac36852`; CPU/dev only.
  - `npm run gates:quick`: green (typecheck, typecheck:test, lint changed, jest whole suite, defect replay cached).
  - `npm run gates` (full, Storybook included, no `--resume`): all green in 276.7 s. typecheck, typecheck:test, debug:typecheck,
    lint, build, test:release, test:replay (32 of 32 killed): ok. jest 903 suites passed, 1 skipped; 10,510 tests passed,
    1 skipped. test:debug 1,572 + 408 pass / 0 fail; test:plugin 128 pass / 0 fail; test-storybook:ci 166 suites, 1,004 tests.
    Main bundle `dist/index.js` 1,272,761 B (budget 1,300,000); route, instruction and Qwen render code ride the lazy image chunk.
  - Earlier full runs on the way, both environment: one jest timing test (`consequences.test.ts` C6 p95 <= 5 ms) under load,
    passing alone; and test:debug charter/index rows because `worktree:setup` copied master's gitignored campaign story index
    (pin `c5723c5`) while this branch pins `abc94b5` (the index matching this branch's pin was copied in; no code change).
  - Guard updates: error-copy rows for the new route/readiness/render sites, the stage-1 cast-scene recipe row moved to
    `renderQwenJob`; session baseline names `image.automaticRoute`; settings reference (`docs:settings`) and author guide
    (`docs:guide`) regenerated.
  - Tests that fail without each change: `autoScene.test.ts` (readiness reasons, plate input check, route choice and
    references-only refusal, visible list, instruction contents with no future look or place, aspect size, illustrated reply),
    `autoSceneHost.test.ts` (who can be drawn, unreachable ComfyUI, plate render and record, idle lease hand-back with the wait
    recorded, pack or reply change discards before save, saved file removed on a lost run), `autoRoute.test.ts` (route record on
    placed pictures, SDXL fallback reason, director's visible list, SDXL setting, manual not routed, forced arm, placement on the
    cueing reply and refusal of a vanished target), `castSceneHost.test.ts` (cast scene placement target, idle wait recorded),
    `imagePilot.test.mts` (frozen cases, schedule, blind pack).
  - Live gate and pilot: NOT run (no GPU, no lanes, no staging in this task). Owed: the pilot (section 7 stage 2, "Pilot run
    needs") and section 11's live checks plus an automatic picture through each route.

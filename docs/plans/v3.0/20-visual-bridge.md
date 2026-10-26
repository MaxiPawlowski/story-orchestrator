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

- `subjectId`, `traits` (immutable visible traits), `tagsByFamily` (renderer-specific identity tags keyed by route family id,
  `sdxl-illustrious` | `sdxl-noobai` (`src/image/catalog.ts` `FAMILIES`), plus `default` as fallback; any other key, short
  aliases such as `illustrious` included, refuses the pack by name), `defaultLook`, `looks`.
- Each look: `fields` (the card-field values that select it; the default look has none), `base` (role), optional `bust`,
  `face`, `expressions` (label → role). Two looks may not share the same fields.
- Later (stage 6+): optional conditioning entries (type, source hashes, preprocessing, encoder/adapter hashes, tensor
  shape), reference views, posed bodies and rigs per look. Embeddings are derived caches, never identity authority.

### Place pack

- `placeId`, `name`, `description` (visible description only), `tags`, `plate` (role), optional `variants`
  (`{ when: { <quality>: <value> }, plate }`, e.g. `time_of_day: night`). Later: viewpoint, horizon, ground/contact
  anchors, depth, masks.

### Style pack

- `target` (visual target text), `recipes` (per route family id, same keys as `tagsByFamily` without `default`: `positive`, `negative`, `checkpoint`, `sampler`,
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
- **Automatic pictures (built, SDXL unchanged):** identity tags from the pack are pinned in code (count tags lead), the
  director sees `identity tags (copy verbatim)` plus the current look, and the place pack's name and description replace the
  background-name guess. Reference rendering for automatic pictures is stage 2.
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
2. **Automatic scenes through the Qwen reference route** (next; evidence: 18). When every visible character (1–2) has a
   prepared, verified look: render through the prepared-cast graph with the director's caption as the direction, grounded in
   the resolver's place (name, description, background words, or the plate once a third Qwen input is verified). Items:
   - feed location and background into the Qwen instruction (today none reaches it);
   - place each picture on the message it illustrates (today all stack on the last message);
   - a "do not copy the reference pose" clause or pose hint (two-person scenes copy the side-by-side reference);
   - deferral/coalescing instead of the 240 s look wait for automatic cues;
   - blind comparison against SDXL on the Astra floors before adoption (section 10);
   - cost: each automatic picture adds about 25–35 s to the next reply's first token (text wake); draw automatic pictures
     only in idle windows (no send within about 20 s) and record image → next-reply TTFT as a standing metric.
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

## Unresolved questions

1. Should place bindings key by checkpoint (built) or by background file name, so one binding covers every checkpoint
   showing that background?
2. Player persona identity packs: bind by persona name, or by `player` in the story?
3. Install the catalog through the media plugin (a write route) or let `install_st.py` write the folder directly?
4. Stage-2 adoption floor: Astra's full gameplay confirmation, or the 72-image pilot plus 18's blind result?
5. A settings picker for `sprites.sceneRecipe`, or discovery only?
6. Should pack QA `review` assets be refused by default once the campaign's 449 unreviewed expressions are triaged?

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
- Live gate 2026-10-26 (lane 33, 3090, ComfyUI 8188, controller 18888, landmarks 8096; owner not playing). Verdict: NOT GREEN.
  Check 1 fails on the live ComfyUI (D1), the on-demand changed look on the default route was not verified (D3), and the
  journey misses gpu-idle.
  - Build: `npm run build` in `C:\dev\so-bridge` at `cd5208a8` (clean; bundle `3a9a753f…`, 1,272,660 B). Served to the lane only
    through the harness candidate route (`installCandidateRoute`, `dist/` of this worktree). Every probe run asserted the served
    manifest commit. Nothing was staged into the owner's ST slot. Lane 33 went through `restore-model`, then `start 33 --headed`;
    at the end it was stopped and set back with `no-model 33`.
  - Harness deviations:
    - The lane server runs the owner's installed server plugins, which lack `GET /packs`. The probe answered
      `/api/plugins/story-orchestrator-media/packs` in the page with this branch's `readInstalledPacks(<lane>/data/default-user)`
      from `packRoutes.mjs`, so the reader code is the same and only the Express mount is replaced.
    - The fixture packs were built from POC showcase art (Pim neutral, bust, worried; a mirrored copy as the second look) and two
      stock ST backgrounds as plates. Images are named by content hash under `/characters/SO-P41_packs/` and `/backgrounds/`.
      The pack files are in `<lane data>/story-orchestrator/visual-packs/`.
    - The probe story `SO-P41 Bridge` uses prepared Ash and Bram plus the pack-bound card `SO-P41 Pim`. The pack binds the start
      checkpoint to a place, an unreached checkpoint to a second place, and a style. No campaign content was used.
  - Commands:
    - `node scripts/debug/st-lanes.mts run 33 -- scripts/debug/so-p41-journey.mts run 1 --candidate --keep --label vb20`
    - the probe `vb-probe.mts <phases>`, with the lane env, run from `C:\dev\so-bridge`
    - `node scripts/debug/st-lanes.mts run 33 -- scripts/debug/so-p41-journey.mts cleanup`
    - `so-library.mts remove so-p41-bridge`
  - Evidence: `C:\dev\so-lanes\reviews\visual-bridge-2026-10-26\`
    - `p41-vb20-run1\record.json`
    - `vb20\*.json|jsonl` and `vb20\probe.log`
    - the probe and pack builder scripts, `packs-live.json` and the contact sheet `sheet.jpg`
    - The originals are under `C:\dev\so-lanes\33\debug\{p41\2026-10-26T19-51-50-412Z-vb20-real-run1,vb20}`.
  - Check 1, default Qwen recipe: FAIL as specified.
    - The live state with empty `sprites.builders` is `spriteRecipe.status: missing`, and `sprite-qwen-route-missing` fires.
      ComfyUI offers 2 Qwen VL encoders (`qwen3vl_8b…`, `qwen_2.5_vl_7b…`) and 2 Qwen VAEs (`qwen_image_2.1_vae_bf16`,
      `qwen_image_vae`). Waiting: 11 characters (`recipe.json`, `scene-recipe-clear.json`). This is the same ComfyUI the owner's
      install uses, so section 11's owner-install claim does not hold.
    - With empty builders and no recipe, a cast scene is refused (`cast.jsonl` `pim`, 1.6 s).
    - A harness fake of the `/discover` answer (one encoder and one VAE left; model folders untouched) gives `ready / discovered`
      and the row is absent (`fake-single-on.json`).
    - Prepared Ash's cast scene then rendered on the discovered route: `recipe_source: discovered`, root = Ash's accepted visual
      source, 213 s cold.
    - The on-demand changed look (Ash, `a yellow oilskin coat`, no builder entry) was not verified. It got `lookError` "Choose an
      expression reference pack…" 7 s after the reload, before the default recipe had resolved (D3). Earlier attempts were harness
      or environment (a member without authored poses while `sprites.poses` was on, and a wedged lane browser). The stop rule ended
      the retries.
    - `sprites.sceneRecipe` set (install) gives `ready / install`, the row is absent, and 2 cast scenes rendered with
      `recipe_source: install`.
    - A faked missing diffusion model makes the row fire with a precise problem. When restored, the real ambiguous state returns
      (`qwen-missing.json`, `fake-off.json`).
  - Check 2, pack-bound character: PASS (copy defect D2).
    - Pim has no sprite folder and no builder, and stands from the pack's default look: stage path = the pack's base asset
      `/characters/SO-P41_packs/so-p41-a1eed309….png` (`stage-default.json`).
    - The `cape` checkpoint card effect switches Pim to set `pk_cape`, with path = the cape asset (`stage-pim-cape.json`).
    - Cast scene, Pim alone, twice: identity root `pack:so-p41-pim@b074e703…`, `visual` recorded, 48 s and 52 s. The render matches
      the pack art (`sheet.jpg`, left).
    - Digest mismatch: Pim's installed pack edited after its digest is refused by the catalog. Pim leaves the stage and the cast
      scene is refused (`tamper.json`). The refusal copy is the generic player line (D2). The pack was restored afterwards.
  - Check 3, automatic SDXL picture: PASS (caveat D4).
    - Real turn with everyN 1, Pim on her default look (`auto-default-look.json`): `prompt_source: directed`, and
      `image_director.visual` recorded (packs pim, style, tavern; place `pack`; subject `pack/default`).
    - Positive prompt: quality block, then `1girl` first, then pinned identity tags, then one shot tag (`cowboy shot`). No names, no
      angle tags. Location `Harbor tavern common room` with its description.
    - Director request (`auto-default-look-director-requests.json`): it holds the bound place and Pim's tags. It holds none of the
      unworn look's field value or the unreached place's name, description or tags (4 spoiler strings, 0 found).
  - Check 4, director 409 path: NOT REPRODUCED (`q409.json`).
    - `image.direct(scene)` fired straight after the Pim cast scene was placed. The controller was already back in the `text` phase
      (image lease released), so the director answered directed with no `director_issue`. No 409 appears in the lane log.
  - Check 5, p41 journey on the branch build: NOT GREEN, 1 miss.
    - The miss is gpu-idle: 14–15 % > 10 %, the known lane-browser draw.
    - All other 31 steps pass. That includes the 3 steps e2e26 missed (rig Cleo, look-rebuild, background). Background is directed
      now; it was the 409 refusal in e2e26.
    - Against e2e26 (4 misses): 47 ComfyUI calls vs 45 (plan-80 floor ≤ 35, still a miss); 8 turns / 14 replies, 0 silent;
      0 stale findings; cleanup leaked 0.
  - Defects:
    - D1: `src/sprites/defaultRecipe.ts:14-18`. Encoders and VAEs are matched by `/qwen/` alone, so an install holding both Qwen
      Image generations is always ambiguous. The fix is to pair by generation (2.1 diffusion with `qwen3vl` and the 2.1 VAE), or to
      prefer the name sharing the diffusion model's version token.
    - D2: `src/image/CastSceneControls.tsx:24` shows only `CastSetupGap` messages. The no-recipe error
      (`src/image/castSceneHost.ts:125`) and the no-source/refused-pack error (`castSceneHost.ts:57`) both reach the author as
      "The last image could not be made. Try again in a moment.", even in Author view.
    - D3: `src/sprites/builder/onDemand.ts:96` still throws the pre-bridge copy when no derived builder exists, instead of
      `builderGap`. A look requested before `startDefaultRecipe` resolves (about 8 s after load) fails with that `lookError`.
      Whether the stage retries after the recipe-changed reload is unverified.
    - D4: `tagsByFamily` keys must equal the route family id (`sdxl-illustrious`, `src/image/catalog.ts:50`), but plan section 1
      and `test/fixtures/visual-packs/*` use `illustrious`. A pack written to that example pins the `default` tags (live: the
      `illustrious` set with `purple hooded coat` was skipped), and SDXL invented Pim's outfit (`sheet.jpg`, middle).
    - D5, minor:
      - `src/image/visualPlan.ts:24` joins a description that ends in `.` with `. ` (`hearth.. tavern interior`);
      - the background prompt carries `no humans` twice (journey `background` step).
  - Pre-existing, not from this branch: `src/sprites/stage.ts:347`. With `sprites.poses` on, looks go only through the body path,
    so a member without authored poses gets no on-demand look.
  - Cleanup:
    - `so-p41-journey cleanup` removed the cards, groups, sprites, settings rows and the journey story (leaked 0);
      `so-library remove` removed the bridge story.
    - Residue moved to `C:\dev\backups\story-orchestrator\vb20-lane33-residue-20261026\`: 3 empty character folders, the pack
      image folder, 2 plates, the visual-packs folder, the orphan first bridge chat and 2 image folders, plus a post-run copy of
      `settings.json`.
    - The lane's `sprites`, `display` and `image` settings were restored from ST's pre-run backup
      (`settings_default-user_20261026-165052.json`).
    - Lane stopped and set to no-model. The landmarks server was stopped.
- Live-gate defect fixes 2026-10-26, branch `v3.0-visual-bridge` (from `412f34b6`). Each fix has a test that fails without it (checked by
  stashing the source change).
  - D1 `src/sprites/defaultRecipe.ts`: discovery pairs by generation. The one known generation is Qwen Image 2.1: a 2.1 edit diffusion
    model (turbo/lightning excluded), a Qwen3-VL encoder (`qwen3vl…`) and a 2.1 VAE (`qwen_image_2.1…`). That is the known-good trio
    of `scripts/debug/so-showcase.mts`, `scripts/local/render-benchmark.mjs` and `retainBatchLi.mjs`; `qwen_2.5_vl_7b…` + `qwen_image_vae`
    are the 2512 trio (`scripts/debug/lib/poseS0Models.mts`). Exactly one complete trio resolves. Otherwise the Repair row names each gap,
    candidates for "more than one", and the other-generation Qwen files for "no". Test: the owner's exact file list resolves to
    `qwen_image_2.1_int8_convrot` + `qwen3vl_8b_int8_convrot` + `qwen_image_2.1_vae_bf16` (`defaultRecipe.test.ts`).
  - D2: `CastSetupGap` carries player copy (`PLAYER_COPY.castSetup|castArtChanged|castArtMissing|castUnprepared|castRetry`, `narrative.ts`).
    The no-recipe and recipe-problem refusals, `PACK_CHANGED`, and a member with no source whose pack was refused (`packGap`:
    `pack-missing` names the bound id and any newer revision, `asset-mismatch`, `pack-kind`, unbound) are now `CastSetupGap`.
    `CastSceneControls` shows the message in Author view and the specific player line otherwise. Other errors keep `imageError`.
    Tests: `castSceneHost.test.ts` (refused and missing pack, recipe, mid-render change), story `SetupGapPlainForThePlayer`.
  - D3 `src/sprites/builder/onDemand.ts`: on-demand off says so (`ON_DEMAND_OFF`). With no builder of its own, a look waits for the
    install-wide route (`recipeChecked`, at most 60 s, abortable), then runs on the derived builder or fails with `builderGap`'s
    precise reason. The old "Choose an expression reference pack…" copy is gone. Test: `onDemandRecipe.test.ts` (a look asked
    while the route is unchecked does not fail, then reaches ComfyUI discovery once the route resolves; missing route gives the
    discovery problem).
  - D4: renderer family keys are route family ids. `tagsByFamily` takes `sdxl-illustrious`, `sdxl-noobai` and `default`;
    `recipes` takes the route ids only. Any other key is refused by name, and the problem gives the route id for a short alias
    (`'illustrious' is written 'sdxl-illustrious'`). The reader does not normalise, so the exporter's digest stays the reader's
    canonical form. Section 1, the guide (`story-guide.md`, `guideTopicsVisual.ts`, `docs:guide`) and the fixtures were updated:
    keys renamed, digests recomputed, and `styleRef` plus story bindings re-pinned. Test: `packs.test.ts`.
  - D5: `visualPlan.ts` strips trailing periods from a place description before joining it. `joinTags` (`prompt.ts`) dedupes
    comma tags case-insensitively for both the ST and workflow positive/negative. Tests: `packs.test.ts` placeDetail, `image.test.ts`
    background with a director prompt starting `no humans`.
  - Pre-existing `src/sprites/stage.ts:347` fixed for the case where the pose path declines (`chooseBody` false: no pose in the
    member's library, a directed set, no matching roster key). Such a member now asks for the on-demand look; before, nothing was
    asked. Test: `stage.test.ts` "on-demand looks with poses on". Not changed: a member the pose path does take (shipped library,
    `stand_relaxed`) still gets the posed body route, not the expression look edit. Whether that was the live case is unverified.
  - `npm run gates:quick`: first run RED (`guideTopics.test.ts`: the compact visual-packs topic was over 800 chars; shortened), then green.
  - `npm run gates` (full, Storybook included, no `--resume`): all green in 423.2 s, first run.
    - Every step ok: build, typecheck, typecheck:test, debug:typecheck, lint, test:release, test:replay.
    - jest: 901 suites passed, 1 skipped; 10,493 tests passed, 1 skipped.
    - test:plugin 128/0; test:debug 1,569 + 408 / 0; test-storybook:ci 166 suites, 1,005 tests.
    - main bundle `dist/index.js` 1,273,037 B.
  - Live re-check owed (no GPU, lanes or staging in this task):
    - D1: on the owner's real ComfyUI with empty `sprites.builders` and no `sprites.sceneRecipe`, `spriteRecipe` should read
      `ready / discovered` with the 2.1 trio, `sprite-qwen-route-missing` should be absent, and a cast scene should record
      `recipe_source: discovered`.
    - D3: right after a reload, change a prepared character's look with no builder entry. The look should wait for the route and
      then render, with no `lookError`. Repeat with `sprites.poses` on for a member the pose path declines.
    - D2: Author view and player copy for a tampered pack.
    - D4: a campaign or fixture pack keyed `sdxl-illustrious` should pin its family tags in the SDXL positive.

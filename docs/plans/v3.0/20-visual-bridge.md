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

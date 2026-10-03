# Plan 06 — Sprite generation in the plugin (the contract)

**Status (2026-10-03): v2.8 plan 06 (new; was "26b", which had no file). Written from v2.8 05 decision 6 and the
dependencies of v2.8 07 and 08 (review F31). The user approved planning it ("i think we have most of the work already
done"); this contract is not yet reviewed by the user; not built.** Overview: `00-overview.md`.
**Gate tiers** (00-overview §Gate taxonomy): implementation D; acceptance LI (local ComfyUI through the broker).

## Why

- v2.8 05 decision 6 found that sprite generation exists, but in the campaign repo (`render_sprites.py`) and bound to
  one machine: hard-coded `C:` paths, it starts ComfyUI itself, Python + numpy/PIL, Adolion-specific base-pick
  heuristics.
- Two v2.8 plans need a builder inside the plugin: v2.8 07 (blink/talk frames per label) and v2.8 08 (look sprites,
  pre-rendered and on demand). Sol F31: both depended on "26b", which had no ownership, capabilities, recipes, QA,
  cancellation, storage or cleanup written down.
- This plan is that contract. 07 and 08 consume it and gate after it.

## Scope

- A Studio **Sprites** tab that builds a pack for one cast member at a time: pick the card art or a reference, choose
  expressions (ST's standard set), render, preview, keep or redo per label, save.
- A runtime API the same module exposes to v2.8 07 (frame recipes) and v2.8 08 (look edits on demand).
- Out of scope: night-run queues across a whole cast (the campaign script stays the tool for that, made portable by
  v2.8 02 D13b), sprite *generation* from text alone, animation runtime (v2.8 07).

## Contract

### 1. Ownership

- One module owns every sprite write: `src/sprites/builder/` (pure: recipes, QA rules, plan) plus `stHost/spriteFiles.ts`
  (the only host writer: ST's `/api/sprites/upload` and `/delete`, `src/endpoints/sprites.js:152,239`). It lives in a
  lazy chunk (Studio and the on-demand path), never in the main entry (bundle budget).
- It writes only files it created. Each created file is recorded in a ledger
  (`extensionSettings["story-orchestrator"].spriteLedger`: `{character, set, label, file, recipe, sha256, createdAt,
  story?, chats[], key?}`, `key` = the full cache-key inputs of §3; the one sprite ledger, which v2.8 08's looks use too), the same discipline as the wizard's created-asset ledger. A file that exists and is not in the
  ledger is never overwritten or deleted without the author's explicit confirm on that file.
- The author starts every Studio build. v2.8 08's on-demand path is the only automatic caller, behind its own
  off-by-default switch (rule 9), and only into `look_<hash8>` sets it owns.
- Every async job takes a `RunOwnership` (chat + story for on-demand; the Studio draft for Studio builds) and re-checks
  it before each upload.

### 2. Backend capabilities

- **Route B only** (v2.8 05's ComfyUI advanced route). Reference **edits** need an edit-capable model; route A (ST Image
  Generation) does generation, not reference edits, for most sources, so the builder refuses with a reason on route A.
- A capability probe (cached per page load, `error` not cached, like `stHost/capabilities.ts`): ComfyUI reachable;
  `/object_info` lists an edit-capable model family the recipes support (Qwen image edit today; FLUX Kontext or similar
  added as recipes); an alpha step (`SplitImageWithAlpha` or a background remover node) exists. Missing piece → the
  Sprites tab says which, and a v2.7 04 check (author, degrades) names it.
- GPU: every job takes a lease from the GPU broker when it is installed (`stHost/gpuBroker.ts`, fail-open when absent).
  The RunPod reply model never waits on it; a local text model (LT) on the same GPU does, through the broker.

### 3. Edit recipes

- A recipe = `{id, version, graph template, prompt template, params, inputs}`. Shipped recipes: `expression` (one label
  from the member's base), `frame-blink`, `frame-mouth-half`, `frame-mouth-open` (v2.8 07: edited from that label's
  own sprite, not the neutral base), `look` (v2.8 08: same character, same pose, changed visual fields).
- Recipe id + version, model name + **model content hash** (sha256 of the weights file, read by the capability probe
  and cached per page load by file size + mtime; the file name alone is never the model's identity) and the base
  sprite's sha256 are written into the ledger row and into the set's manifest, and are part of every cache key (Sol
  open question on v2.8 08's cache key). v2.8 08's `look_<hash8>` uses this contract unchanged.
- Recipes are data in the lazy chunk; a new model family is a new recipe, never a code branch in the runtime.

### 4. QA

- Automatic checks (TypeScript port of the script's checks, no numpy): alpha present and non-trivial; subject box
  within N % of the base's box (framing drift); output size equals the set's size; not blank or single-colour.
- Base pick: the script's skin/eye scoring is Adolion-tuned and does not move. The tab renders up to 4 candidates and
  the author picks ("pick the best of 4"); on-demand looks take the first candidate that passes QA.
- A failed QA never uploads; it is reported per label with the reason.
- Golden: the existing Adolion packs (inventory dated in v2.8 02 D13e). A Studio build of a sample of members is
  compared by a second-model rater ("same character?", "label visible?"), never the user (rule 11).

### 5. Cancellation

- Each job has an `AbortController`; closing the tab, leaving the chat (on-demand) or a newer request for the same key
  cancels it.
- Cancel removes our own queued prompt ids from ComfyUI's queue. A running prompt is interrupted only when ComfyUI
  reports that the running prompt id is ours; otherwise we wait it out and discard the result. Never a blind
  `/interrupt` (another session may be rendering).
- The broker lease is released in `finally`. A cancelled job uploads nothing and leaves no ledger row.

### 6. Storage

- ST's own sprite folders (`characters/<name>/<set>/<label>.png`), set ids `^[a-z0-9_]+$` (no `-`, so a set rule can
  never pick up v2.8 07's frame folders); frames follow v2.8 07's subfolder and file-name rule.
- On-demand looks: `look_<hash8>` per story + member + normalized visual fields (v2.8 08 decision 6).
- One `so-sprites.json` manifest per set we create (recipe, model, base hashes, labels, QA results).

### 7. Cleanup

- `so-assets.mts` learns sprite sets: list/remove by marker and by ledger, same scope rules as wizard assets (test
  sessions only, baseline-aware, never an unmarked set).
- In the product: the Sprites tab lists our sets per member with size and the chats that reference them; deleting asks
  first. On-demand sets whose referencing chats are all gone are offered for deletion in a v2.7 04 check (author,
  info), never deleted silently.

### 8. Models off `C:`, tray

- ComfyUI, the broker and their model/cache folders run from the tray entries (`C:\dev\tray\items\story-orchestrator.json`)
  with the model paths off `C:` (rule 5). The builder reads readiness from its own probe, not from the tray file.
- The campaign script gets the same paths from env/config (v2.8 02 D13b).

## Gates

- **D:** recipe and plan unit tests (cache key changes with recipe/model/base; same model file name with changed
  content → new key); QA rules on fixture PNGs (a framing
  drift, a missing alpha, a blank); ledger rules (never overwrite an unledgered file; cancelled job leaves nothing);
  cancellation (fake ComfyUI: queued id removed, foreign running id not interrupted); Storybook for the Sprites tab
  (390/768/1440, a11y); registry entry + Help (rule 10); `npm run gates`.
- **LI:** on a lane with ComfyUI from the tray: build 3 members × neutral + 3 labels; upload lands in ST's folder and
  shows in VnStage; a cancel mid-run leaves no file; `so-assets` cleanup leaves the install as before (sha256
  inventory diff); second-model rating of the sample ≥ 90 % "same character" and ≥ 90 % "label visible" (predeclared).
- **Consumers:** v2.8 07 frame recipes and v2.8 08 S32-2 run their own gates after these are green.

## Decisions for the user

1. Studio Sprites tab, one member at a time, author picks the base from 4 candidates? **Recommended: yes.**
2. Route B only for sprites (route A refused with a reason)? **Recommended: yes**; route A cannot do reference edits.
3. Ledgered writes only, never overwrite an unledgered sprite without a per-file confirm? **Recommended: yes.**
4. QA golden rated by a second model, not by you (Adolion art)? **Recommended: yes.**

## Links

v2.8 05 (route B, model discovery, broker; decision 6), v2.8 07 (frame recipes), v2.8 08 (look edits, S32-2), v2.8 02
D13b/D13c/D13e (campaign script portability, `--anim`, inventory), v2.7 04 (capability and cleanup checks).

## Review 2026-10-03

Applied: F31 (this contract: ownership, capabilities, recipes, QA, cancellation, storage, cleanup), Sol open question
on the cache key (recipe/model/base versions, §3), Sol open question on GPU contention (§2), rule 5 (tray, off `C:`).

Round 3 (Sol): R3-07 applied.

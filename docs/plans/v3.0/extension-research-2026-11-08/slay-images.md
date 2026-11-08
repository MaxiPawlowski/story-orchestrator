# slay-images — 2026-11-08 harvest

meta: https://github.com/wewwaistyping/SLAYimages · HEAD `57e52e8` (2026-10-28), new repo · **AGPL-3.0: ideas only, never code** ·
SECURITY.md verdict CLEAR (privacy notes) · read: README (EN part), `prompt.md`, `manifest.json`, `index.js` targeted (12,272 lines:
function map; ref assembly `generateImageWithRetry` 6821-7000; name matching 3759-3831; context images 3833-3990; ref hashing/dedup
4465-4660; path refcount/delete 4238-4295; group refs 3711-3758; wardrobe injection 2276-2311; describe prompts ~1828; style-picker
prompt ~9996) · skipped: settings UI, crop UI, lightbox, mobile save, NovelAI/Naistera/Gemini request bodies, style picker fetch,
video mode · no prior review.

## What it is

Inline image generation for chat-completion RP: the model writes `<img data-iig-instruction='{json}' src="[IMG:GEN]">` tags, the
extension renders them through a user-chosen remote image API (OpenAI-compatible, Gemini/Nano-Banana, Naistera, NovelAI) with
reference images. Around it: a wardrobe (outfit pictures + model-written descriptions, injected as an "OUTFIT LOCK" line), per-
character reference slots for char/user/up to 4 NPCs, a cross-chat character library with multiple labelled looks, dedup of
uploaded refs, an unreferenced-picture sweep. Cloud-API product; SO is local ComfyUI with prepared identity packs. Most of it SO
already has in a stricter form; three ideas carry over.

## How it works

- Reference selection per picture (`index.js:6821-6960`): char face, user face, wardrobe outfit image, matched NPC faces, then
  previous pictures as context, capped at 5 (`MAX_GENERATION_REFERENCE_IMAGES`, `:3254`). A reference is sent only when its owner is
  **named** in the image prompt (`:6866-6880`), with alias tokens (`parseNameTokens`, `:3772-3778`), Unicode word boundaries so "Ann"
  does not match "annual" (`wordBoundaryIncludes`, `:3796-3807`) and generic fallbacks ("user", "character") never matching
  (`:3784-3786,3809-3817`). HTML numeric entities are decoded before matching (`:6833-6841`).
- Reference-mode prompt rule (style-picker prompt, `:9996`): the first name is the only appearance input; hair/eye colour, skin,
  build, age adjectives are banned because "writing them overrides the reference"; allowed: distinguishing marks and scene-altered hair
  state ("wet from rain", "tied back").
- Separate face and outfit references: identity from the face slot, clothes from the wardrobe picture of the active outfit
  (`:6908-6930`); "experimental collage" stitches up to 6 clothing parts into one grid image to save reference slots
  (`:597-660,3014-3020`), README admits it costs quality, and Gemini ignores clothing past about 4 references.
- Context images: last N generated pictures from earlier replies, compressed to 768 px JPEG q0.8, memoised per message and wiped on
  chat change "because message ids restart from zero in every chat" (`:3907-3990`); **not** sent in edit mode, where "every file is a
  subject to keep" (`:6951-6955`).
- Wardrobe text injected via `setExtensionPrompt(key, text, 1, 0)` (in-chat, depth 0) independent of image generation
  (`:2276-2311`). Outfit/hair descriptions written by a vision model; the hair prompt says "Avoid mentioning hair color" (`:1828`) so
  an outfit/hair change never recolours identity.
- Group chats: refs and outfit follow the message author, not ST's current character (`slayGroupAuthor`, `:3711-3719`).
- Ref dedup: byte sha256 plus a "pixel hash" (32x32 downscale, channels masked to 4 bits, sha256) that survives JPEG re-encoding
  (`:4479-4545`); a stale entry is dropped only on a real 404/410, never on a failed probe (`:4548-4565`).
- Tag replacement edits `mes`, `display_text`, every `swipes[i]` and every `swipe_info[i].extra`, because ST re-renders from swipes on
  reload and on swipe revert (`replaceTagInMessageSource`, `:3851-3886`); string replacement uses a function replacer so `$&` in model
  text is not interpreted.
- Delete a stored picture only when a full scan of every place that can point at it counts zero uses (`slayCountPathUses` +
  `slayDeleteStoredImage`, `:4238-4295`); the sweep UI lists unused files with previews, grouped by month.

## Patterns for SO

### P1. Deterministic appearance lint on the Qwen instruction (reference mode) — pattern · image · partial · value 3 · S
What: in reference mode, text appearance fights the reference. Their evidence: `:9996` (banned list + allowed exceptions). Our state:
`src/image/prompt.ts:77-78` `INSTRUCTION_SKILL` already asks the director "never describe hair, eyes, body or clothing" (present as a
prompt rule), but nothing checks the answer: `src/image/autoScene.ts:102-106` passes `reply.instruction` straight into
`qwenInstruction`, and when there is no director reply it inserts up to 400 chars of the raw story message (`Moment: …`, `:103-104`),
which can name hair or clothes that contradict the prepared look. Fit: pure helper in `src/image/` (no model call): drop clauses that
pair a colour word with hair/eyes/skin or name body build, keep scene-altered states (wet, tied back, torn, bloody) and marks; record
the removed words in `image_director` for the author. Sketch: `appearanceLint(text, names) -> {text, removed[]}` applied to the
instruction and the moment fallback; jest table of positive/negative lines; judge-free.

### P2. Previous picture as a place reference when no place pack plate exists — feature · image · absent · value 3 · M
What: continuity across shots from what the player already saw. Their evidence: `:3907-3990` (collection, compression, per-chat
cache wipe), `:6951-6955` (excluded from edit mode because the edit model keeps every reference as a subject). Our state:
`src/image/autoScene.ts:66-68` uses a plate only from a bound place pack (`place.source === "pack"`); `castSceneGraph` already wires a
place image as the last Qwen input with "the last reference image shows only the place" (`src/image/castScene.ts:96-98,114-117`).
What differs for SO: use the last accepted scene picture at the **same location value** (blackboard location / checkpoint place) as
the plate, never one with people the current shot lacks: prefer a `background`-purpose picture of that place (no people), else none.
Their warning applies directly: a people-filled prior scene as a Qwen input gets its people copied. Fit: privacy fine (already shown
to the player, same chat; rollback must drop a plate whose picture's row was rolled back, key the cache by chat + location + picture
path); `qwenImageInput(discovery, image_{n+1})` already gates the input. Value depends on how often stories run without place packs
(campaign has 83 background specs, so mainly authored-light stories).

### P3. Reference-counted sweep for SO's generated pictures — pattern · image/housekeeping · absent · value 2 · M
What: list files nothing points at, preview, confirm. Their evidence: `:4238-4295` (count every holder; refuse delete if uses > 0; a
failed count returns 99, i.e. "in use"). Our state: SO deletes rejected candidates and discarded rows (`src/image/runtime.ts:459-474`,
`src/image/imageRowsHost.ts:9`), but pictures of a deleted chat stay in `/user/images/<folder>/` (`CHAT_DELETED` handlers:
`src/runtime/mirrorReaperHost.ts` reaps lorebooks only). Fit: owner rule "nothing is deleted from the owner's ST data; a move goes to
`C:\dev\backups\story-orchestrator\`" (AGENTS.md), so the action is move-not-delete, through the media plugin, author-only Repair row,
fail-closed count (unknown = in use, as theirs). Holders to count: every chat's `extra.media`/image rows with `extra.so_row`, sprite
manifests, visual packs, journal. Low priority for one user; mention only.

### P4. Pixel-hash dedup for imported references — pattern · sprites · partial · value 1 · S
`:4479-4545`. SO's visual manifests and packs hash exact bytes by design (digest = identity, `docs/plans/v3.0/20-visual-bridge.md`
§1), which is the right authority. A perceptual hash would only help an "is this the same picture re-encoded?" warning at import in
Studio. Skip unless imports from chat attachments become a flow.

## Already present in SO (no action)

- Outfit/"look" text injected into chat independent of pictures: `src/runtime/cardOverlayHost.ts:6-27` ("Current public state
  (overrides the character card where they differ)", from card-field qualities) = their OUTFIT LOCK, but driven by story state, not a
  manual wardrobe.
- Looks per character with labels: identity pack `looks` selected by card fields (`20-visual-bridge.md` §1 Identity pack,
  `src/sprites/visualManifest.ts`, `src/sprites/lookRebuild.ts`).
- References only for characters actually in the shot: SO routes by the director's `visible` list against present members
  (`src/image/autoScene.ts:56-62,121-123`), stricter than name substring matching.
- Group author follows the message: SO keys per member throughout (`src/services/stHost/sprites.ts:61-75`).
- More than 2 characters: SO refuses the reference route above 2 and falls back to SDXL with a named reason
  (`src/image/autoScene.ts:21,51`). Their collage trick (stitch references into one image) is the obvious way past the input limit and
  they report it costs quality; not worth trying with Qwen's per-image conditioning.

## Host facts

- ST re-renders a message from `swipes[]`/`swipe_info[].extra` on chat reload and on swipe revert after an aborted swipe; editing only
  `mes` lets a stale value come back (`index.js:3870-3886`). Consistent with SO's known `extra`-rides-swipes trap (gotchas.md
  §SillyTavern host); SO's own picture rows are separate system rows, so not affected.
- `String.prototype.replace` with model text as the replacement interprets `$&`/`$1`; use a function replacer (`:3853-3855`).
- Per-message caches must be wiped on chat change because message ids restart at 0 (`:3934-3941`); SO's equivalent rule is "key
  caches by everything they depend on" (architecture §Layering).
- iOS Safari silently never fires load or error for images past about 16 MP; a decode without a timeout hangs forever (`:3976-3990`
  comment). Only matters for mobile imports.

## Suspected SO defects

- None confirmed. Soft finding feeding P1: `src/image/autoScene.ts:103-104` puts raw story text (`Moment: …`) into the Qwen
  instruction when there is no director reply; the story text is explicitly non-authoritative for appearance on the SDXL path
  (`src/image/prompt.ts:71`) but unfiltered on the reference path.

## Not worth taking

- Model-written inline `<img data-iig-instruction>` tags (and `prompt.md`'s "visual artifact in every response" HTML/CSS
  instruction): SO decides pictures through its own director and route; model-authored markup in replies is the opposite of SO's
  design and costs prose quality.
- Remote style catalogue written into the CC preset (`slayStyleToPreset`): remote prompt-injection channel.
- Cloud image APIs and key storage in extension settings: SO is local-first; keys never leave ST secrets.
- Collage of clothing parts, manual wardrobe UI, crop UI, lightbox, recent-refs ribbon, video test mode: covered or out of scope.

## Security notes

- Sends prompts and reference/avatar pictures to whichever third-party image API the user picks (OpenAI-compatible endpoint, Gemini,
  Naistera proxy, NovelAI direct). User-typed keys sit in `extension_settings` (in `settings.json`) and go as Bearer to the user-set
  endpoint (`index.js:3181-3185` per SECURITY.md).
- Style picker fetches HTML from `https://wewwaistyping.github.io/slayimagespromts/` and, with opt-in `slayStyleToPreset`, writes
  that remote text into the user's Chat Completion preset via `/api/presets/save` (`:10653-10760`): a remote prompt-injection channel
  (no code execution).
- Same-origin `/api/images/*`, `/api/files/upload`, `/api/avatars/get`, `/api/novelai/*`; no secret reads, no `/api/users/*`.
- None of P1-P4 needs any network, secret or preset write. AGPL: ideas only; nothing above copies code.
- No agent-addressed text found.

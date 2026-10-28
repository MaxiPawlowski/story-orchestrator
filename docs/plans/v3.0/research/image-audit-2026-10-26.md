# Image feature audit: consistency and quality (2026-10-26)

Read-only audit on master `2403c70f` (after the first-playtest fix). Nothing was run: no ST, ComfyUI, GPU or model calls.
Sources: `src/image/**`, `src/sprites/**` (visual sources, builder recipes, cast load), `server-plugin/story-orchestrator-media`,
`src/services/stHost/{image,stImage,media}.ts`, the owner's `settings.json` (image, sprites, sd, the image-prompt connection
profile: names and shapes only, no secrets), the owner's ComfyUI model folders (`C:\dev\models`), library stories (counts only).
No campaign text is quoted; counts only.

Track: v3.0 B (images). Feeds B3/B4 and any new "identity-consistent illustrations" plan.

## 0. Owner configuration as found

| Path | Model | Recipe |
|---|---|---|
| Automatic illustrations (cues + cadence), purpose `scene` | `waiIllustriousSDXL_v170` (Illustrious family) | euler_a / normal / 28 / cfg 6, base 832x1216 etc., no hires |
| `character`, `user`, `free` | same WAI checkpoint | same |
| `portrait` | `JANKUTrainedChenkinNoobai_v777` (NoobAI family) | euler_a / simple / 30 / cfg 4, `lazypos/lazyneg/lazyhand` embeddings (installed) |
| `background` | FLUX retired, row reset to default: unmapped, resolves by discovery to the only Illustrious file (WAI) | + `no humans, scenery` |
| ST Image Generation (`/sd`, ST backend) | JANKU via `JANKU_v777.json` (same recipe as our NoobAI family) | ST's own seed (-1 = random) |
| VN sprites, looks, poses, reference views | Qwen Image 2.1 edit (files on disk: `qwen_image_2.1_int8_convrot` / `_turbo_`, `qwen3vl_8b_int8`, `qwen_image_2.1_vae`) from card art, recipe `qwen21-card-base` v2 | seeded per recipe |
| Prepared cast scene (manual, `#so-cast-scene`) | Qwen 2.1 edit, needs `sprites.builders[folder]` | seed fixed 1234 |

- `image.backend = comfy`, `automation.mode = everyN` (everyN default 5), `defaults.seedPolicy` unset = `random`,
  `purposes.scene.extraNegative = "admin"` (looks like a stray typed value; it goes into every scene negative).
- Image-prompt profile exists now: TC llama.cpp on the local controller (`:18888`, the play model), instruct `Gemma 4`,
  preset `Artemis Extraction`.
- `sprites.visualSources`: 8 accepted sources, 0 reference packs. **`sprites.builders` is empty**, and was empty in all 40
  most recent settings backups. Everything that reads a builder refuses on this install: cast scene, on-demand looks
  ("Choose a reference expression pack in Studio."), pose bodies, reference views.
- No IP-Adapter custom node, no `clip_vision` model, no LoRAs installed.
- Cards: 146 of 163 carry `sd_character_prompt` (used as the illustration appearance). Library: 9 of 10 stories author
  `illustrations` (style = one prose sentence of ~40-50 words; 1-5 authored appearances each, the narrator always among them);
  about 90% of checkpoints set `effects.background` and `effects.stage`.

## 1. Bugs and silent degradations in the automatic path (ranked)

**High**

1. **Framing tags are not booru tags; the scene default appends the literal tag `cowboy`.** `prompt.ts:119` appends
   `route.shot` with `_`→space; only `close` is mapped (`close-up`). Scene default shot is `cowboy` (`settings.ts:67`), so
   every automatic scene prompt ends in `, cowboy` (a booru tag for cowboy characters/hats on Illustrious), not
   `cowboy shot`. `upper`, `full`, `wide` likewise miss `upper body`, `full body`, `wide shot`. Untested (no test mentions any
   framing tag).
2. **The director's own `shot` is parsed and discarded** (`prompt.ts:111`, never read); `route.shot` is always appended
   (`prompt.ts:119`) after the director was told to write its own camera tag (`prompt.ts:65`). Result: two framing tags that
   can contradict (an "establishing shot" cue plus `cowboy`). `reply.visible` is also parsed and unused (`prompt.ts:109`).
3. **Scene-break cue text is the reason code.** `runtime.ts:168` passes `audit.sceneBreak.reason` as the label; reasons are
   `time_skip|location|divider` (`memory/types.ts:25`), so `cueText` (`cast.ts:14-15`) yields "The scene moves to location."
   That becomes the director INSTRUCTION, the template prompt (`prompt.ts:39`) and the player-visible caption
   (`runtime.ts:268`) when the template is used. All 9 illustrated stories enable `illustrations.scenes`. Untested.
4. **Director JSON failure draws nothing.** One retry, then `parseImageReply` throws out of `plan()` (`runtime.ts:246-253`);
   no template fallback. Only `lastError` records it; the cadence path swallows it (`runtime.ts:206`). The JSON is not
   constrained: `imageModel` accepts a grammar (`stHost/image.ts:67`) but `plan()` never passes one, and
   `image.useJsonSchema` (`settings.ts:26,62,155`) is read by nothing. Thought stripping covers only a leading `<think>`
   (`prompt.ts:95`), not the Gemma channel tokens the central `stripReasoningBlocks` handles (`extraction/parse.ts`); a
   thought containing `{` breaks the first-`{`/last-`}` slice (`prompt.ts:96-100`). The owner's profile uses the non-thinking
   `Gemma 4` instruct, so this is latent, not observed.

**Medium**

5. **The director's checkpoint choice is dead on both backends.** Comfy: `plan()` overwrites `route.allowed` with the single
   resolved file (`runtime.ts:239`) right after mapping it (`runtime.ts:238`), so the menu offers one model and
   `directorMayOverride` (`routing.ts:51-53`) never applies. ST backend: `/imagine` renders with ST's own model, size, seed and
   workflow (`stImage.ts:28-36`), so checkpoint, aspect, LoRAs, quality and shot are all fiction there, and the recorded
   `image_director.checkpoint/seed/size` (`runtime.ts:384-387`) describe a render that did not happen.
6. **Image-prompt LLM call is not gated on text turns.** `plan()` calls the director (`runtime.ts:244`) before
   `reserveOutsideTurns`/`idle` (`runtime.ts:284-297`), straight from `CHARACTER_MESSAGE_RENDERED`
   (`stHost/imageSurface.ts:104-105`) and from boundary cues, i.e. mid group chain. The owner's director profile is the play
   model on the same controller: the call queues with (or ahead of) the next member's reply and may disturb the RAM member
   cache (no `cache_key`). To verify on the controller (slot count, side-pass erase).
7. **`idle()` gives up after 120 s** (`runtime.ts:291-294`): a group chain of 3+ thinking replies can exceed it, and the
   already planned picture (including its LLM call) is dropped with "The text turn has not finished yet."
8. **Cadence counts member replies, not player turns.** `automationCount` increments on every rendered character message,
   swipes and regenerations included (`runtime.ts:186-192`), and persists chat metadata each time (`runtime.ts:189`). With
   everyN=5 and 2-3 drafted members that is a picture about every other player turn, on top of checkpoint cues, scene cues
   and judge picks. Spacing (`runtime.ts:198`, 4 replies) applies only to judge picks; cue pictures have no spacing, so a
   checkpoint cue and a scene cue for the same transition on different message ids give two pictures.
9. **Place lags the transition.** `plan()` prefers `snapshot.scene.facts.location` over the authored background
   (`runtime.ts:220`). At a checkpoint cue the new checkpoint's background is the surest place, while the scene fact may still
   be the previous scene's. Also the place is only the background file name turned into words (`cast.ts:25-31`); the image
   itself is never used.
10. **Opening cue can be lost for the session.** The boundary-0 subscriber latches `initialChat` (`runtime.ts:160`) before
    `cue()` checks `snapshot.requirements.ready` and service health (`runtime.ts:126-132`); if either is not ready on the
    first snapshot, the opening picture never fires until reload.
11. **Subject selection over-includes.** `named()` matches the first word of a card name anywhere in the window
    (`prompt.ts:55`); a first word that is a common word matches ordinary prose (1 such group member on this install). No
    cap on subjects (`prompt.ts:56-58`), while SDXL text-only cannot bind attributes for more than ~2 people.
12. **The player persona is never described.** `ImageChat.userName` is never read; the persona is absent from
    `chat.characters` (`stHost/image.ts:48-62`), so the director sees the persona speaking and either omits or invents them.
13. **Template fallback is prose for a tag model.** `templateImagePrompt` joins style prose, appearances, place, the beat's
    player name and cue text with ". " (`prompt.ts:33-40`); lore lines carry `Name: appearance` (`lore.ts:33`), so names reach
    the CLIP prompt. A card with no SD prompt is skipped entirely in the template (`described`), and gets the first 500 chars
    of its description in the director prompt (`prompt.ts:58`); card descriptions here have a median of 2,330 chars, so the
    prefix is usually not appearance.

**Low**

14. `scene.extraNegative = "admin"` in the owner's settings (data, not code): remove it.
15. `seedPolicy` and `contextMessages`/`maxTokens` have no UI (`grep seedPolicy` hits only `runtime.ts` and `settings.ts`);
    the owner cannot choose `lockPerMessage`/`fixed`.
16. Hires: `scale_by = hires.scale / 4` assumes a 4x upscaler (`graph.ts:49`); both installed upscalers are 4x, so latent.
    The GPU reservation uses base size even for hires (`renderFacts.ts:11-15`).
17. A picture placed on a reply stays if that reply is later edited or swiped (target text is checked only before placing,
    `runtime.ts:378`); rollback only cancels queued jobs (`runtime.ts:170`).
18. Lore appearance lines ignore `knownEntities` (codex disclosure): a `Public appearance:` line is used whenever its key or
    entry comment is mentioned (`lore.ts:20-40`). Public by authoring, so no held-secret leak found; entry-comment matching
    can still pick an entry by a common word.

Privacy check: pictures read the transcript window (non-system messages only), card SD prompts, authored appearances,
visual card fields (`cardValues(..., visualOnly)`), and `Public appearance` / fired `Appearance` lore lines from the story's
own books (memory mirror excluded). No epistemic rows, memory or held secrets reach the director. No leak found.

## 2. Sources of identity and style inconsistency

**(a) Same character across illustrations**

1. Random seed per render (`runtime.ts:281`, owner policy `random`); `lockPerMessage` keys on chat+message, not character
   (`runtime.ts:280`), so no policy pins a character.
2. Identity is text only, rewritten every time by the director: it compresses each card's SD prompt into 25-45 tags shared by
   everyone in the frame (`prompt.ts:63`), so hair/eye/outfit tags are paraphrased, dropped or reordered per picture.
3. Attribute bleed between people in one frame (single CLIP prompt, no regional conditioning).
4. Two checkpoint families by purpose: scene/character on WAI (Illustrious), portrait on JANKU (NoobAI). A portrait and a
   scene of the same character differ in style and face.
5. Per-story style prose differs between stories (9 different style sentences), and chapter looks can override.
6. Appearance source switches: authored appearance replaces the card SD prompt (`cast.ts:47-53`); visual card fields are
   appended as "Current appearance overrides" prose.
7. Director profile drift: a dead profile silently switches to the template (now a Repair row), and a JSON failure skips the
   picture.

**(b) Illustrations vs VN sprites / liveHead**

1. Different model and conditioning: sprites are Qwen 2.1 image edits of the card PNG (`builder/recipes.ts:46-68`,
   `BASE_RECIPE`), so they inherit the card art's face and style; illustrations are SDXL Illustrious from text. Nothing
   connects them.
2. liveHead rigs are built from the sprite bust (`liveHeadRigs[].source` = visual source bust), so liveHead follows sprites,
   not illustrations.
3. Look changes: sprites rebuild a look from the accepted base via Qwen (`lookApply.ts`, on-demand); illustrations get the
   same field as text only. On this install on-demand looks refuse (no builders), so sprites keep the default look while
   illustrations show the changed one.
4. Card art styles are heterogeneous (mixed sources), so sprites vary in style per character while illustrations normalise
   to the WAI anime style: the gap differs per character.

**(c) Illustrations vs the active background**

1. Only the background file name reaches the prompt (`cast.ts:25-31`), and only when no scene fact exists; the picture is a
   new invented place every time.
2. Different model: backgrounds are files in ST (their origin is outside this code), illustrations are WAI; the `background`
   purpose (WAI, `no humans, scenery`) is never used by automatic cues.
3. Location fact lag at transitions (bug 9).

## 3. Feeding sprite visual sources into automatic illustrations

What exists: each accepted `VisualManifest` holds a verified base (full body, white background) and bust, per look
(`visualManifest.ts`), optionally a 6-view reference pack (none built here). The cast-scene route already turns 1-2 bases
into a Qwen 2.1 edit graph (`castScene.ts:50-62`) with ownership, fingerprint checks, owned reference upload
(`comfyReference`) and broker lease (`castSceneHost.ts`).

### Option A: reuse the Qwen cast-scene route automatically

Touch points:
- `runtime.ts plan()`: after `castForImage`, map subjects to sprite folders (`spriteCast()` as in `castSceneHost.ts:30-41`),
  read `sprites.visualSources`, pick a route: Qwen when 1-2 visible subjects each have a current look, SDXL otherwise.
- Director prompt: Qwen edit wants a natural-language instruction, not tags. Add a second output field (e.g. `instruction`)
  or a route-specific system prompt; keep `visible` and actually use it to choose the reference set.
- `castSceneHost.drawPreparedCast`: split a pure "build + render" core out of the manual flow (it currently targets the last
  message and fixed text), take seed/aspect from the plan, keep its guards.
- `castSceneBuilder` (`castScene.ts:36-45`): needs per-folder builders. Gap on this install (`builders = {}`): add one
  install-wide "Qwen illustration route" (diffusion/encoder/vae/steps/resolution) as the default when a folder has none.
- Aspect: the graph takes a single `resolution` and the latent comes from the encoder (`recipes.ts:79,82`), so wide/landscape
  scenes are not controllable today; needs an explicit latent size or a padded reference.
- Location: pass the current background as a third reference only if `qwenImageInput(discovery, "image_3")` holds; else text.
- Placement/metadata: reuse `imagePlace` and the `image_director` record (`recipe`, identities, seed).

Fallbacks: no accepted look, look pending (`LookPending`; the 240 s wait is too long for an automatic cue, use 0), >2
subjects, missing `image_2` input (`CastSetupGap`), no builder route → SDXL text path as today, with a journal note.

Cost: Qwen int8 edit measured 27-29 s per image on the 3090 (v2.8 79) vs SDXL ~7.8 s (06 baseline); Qwen 2.1 int8 + 8B
encoder need the text model swapped out on every picture (audit risk 2 in
`research/feature-impact-controller.md`). The turbo int8 file is on disk and could cut steps; unmeasured. Strongest identity
(same model family as the sprites, uses the exact accepted look), at 3-4x the GPU time.

### Option B: IP-Adapter on SDXL

Touch points:
- ComfyUI: install `ComfyUI_IPAdapter_plus` (not installed), a CLIP vision model (folder empty) and an SDXL IP-Adapter
  suited to Illustrious/NoobAI (candidates to verify: ip-adapter-plus(-face)_sdxl_vit-h, a NoobAI-specific IP-Adapter).
  Downloads need the owner's OK and the disk check.
- `server-plugin/story-orchestrator-media/index.mjs:14-16` `ALLOWED_NODES`: add `CLIPVisionLoader`,
  `IPAdapterModelLoader`, `IPAdapterAdvanced` (and attention-mask / regional nodes for two people); update the allowlist test.
- `graph.ts buildGraph`: optional reference chain (LoadImage of owned refs → IP-Adapter on `model`), per-subject weight;
  bust for faces, base for outfit.
- `runtime.ts render()`: upload bases via `comfyReference`, release after; add model files to the broker request
  (`renderFacts.ts`) so the reservation counts them.
- `catalog.ts` family recipe: IP-Adapter weight/end_at defaults per family.

Fallbacks: no source → plain SDXL; >1 subject without masks → reference only the focus character (others text).
Cost: roughly SDXL + 1-2 GB VRAM and a few seconds (estimate, unmeasured); text model may stay resident depending on the
broker reserve. Weaker identity than A, and IP-Adapter pulls the card-art style into the WAI render (which helps sprite
consistency), multi-character needs masks.

### Option C: cheap steps that help without references

- Seed per character + scene (`fnv1a(story, member, look signature)`) for single-subject pictures.
- Pin each subject's identity tags verbatim (copy the first N tags of the SD prompt; the director adds only pose/action/scene).
- One family for all character purposes (portrait on WAI, or everything on JANKU) unless the owner wants the split.

Recommendation: C now (small, deterministic), A for 1-2 prepared characters once a default Qwen route exists, B only if A's
GPU time is unacceptable after B1 (plan 11). Each output-changing arm needs a blind image rating, per working rules.

## 4. Prompt quality for Illustrious/NoobAI

Director prompt (`prompt.ts:62-92`):
- Good: one frozen moment, a framing tag, no names/artists/quality tags (quality block is added in code), "visible" list,
  appearance lines per person, location and story style given separately, beat label flagged "not an image model".
- Missing for booru-tag models: no instruction to lead with count tags (`1girl`, `2boys`, `solo`, `multiple girls`), no tag
  order (count → per-person identity → expression/pose/action → clothing → setting → lighting → framing), no rating tag
  (`general`/`sensitive`; Illustrious and NoobAI respond to them, and safe mode only adds `nsfw` to the negative), no
  booru vocabulary hint (e.g. `cowboy shot`, `from side`, `looking at viewer`), no rule to keep card SD-prompt tags verbatim.
- Token budget: 25-45 tags ≈ 90-150 CLIP tokens, plus the quality block and the appended shot. ComfyUI chunks at 75 tokens;
  identity tags early, framing late, so the code-appended shot lands in the weakest chunk. For 2+ people, 25-45 tags total
  leaves ~6-10 tags each: identity is what gets cut first.
- Input side: 6 messages x 1,200 chars, every subject's appearance unclipped (SD prompts can be long), up to 8 lore lines
  x 360 chars, style prose: a few thousand tokens, fine for the 32K play context, but it competes with play turns on the
  same server (bug 6). `maxTokens` 900 is ample for a non-thinking reply.
- Lost between director and render: `shot` (bug 2), `visible` (unused), `checkpoint` (bug 5), the persona (bug 12), the
  background image (2c), per-person binding (single prompt).
- Negative: family block + per-purpose extra + director negative. The director negative is free text; no guard against prose
  or against negating visible tags. Owner's `admin` token should go.
- Order in code (`prompt.ts:119`): quality block first matches WAI's own guidance (`masterpiece, best quality, amazing
  quality` + the listed negative); NoobAI relies on `lazypos/lazyneg` embeddings (installed; stripped silently if ever
  missing, `runtime.ts:327`).

Smallest useful prompt fixes: map shots to booru tags and stop appending when the director gave one (use `reply.shot` for
the tag); add count/order/rating rules to `TAG_SKILL`; pass card SD tags as "keep these verbatim"; constrain the reply with a
GBNF grammar (the `useJsonSchema` setting already exists); fall back to the template (or a tag-only template) after a second
JSON failure instead of drawing nothing; fix the scene cue text.

## Unresolved questions

1. `sprites.builders` empty on the owner's install with 8 accepted sources: deliberate, or lost? It blocks cast scenes,
   on-demand looks, poses and reference views.
2. Keep the portrait purpose on NoobAI (JANKU) while scenes use WAI, or one family for every character picture?
3. Cadence: per player turn, or per member reply as today? everyN=5 per reply is frequent in groups.
4. Should the image-prompt LLM wait for the text turn (like the render), given it runs on the play model?
5. Identity route: A (Qwen, ~28 s, text model swapped out), B (IP-Adapter, downloads needed), or C only for now?
6. Remove the `admin` scene negative (owner data; not changed by this audit)?

---
name: st-image-generation
description: >
  SillyTavern image generation know-how: the Image Generation (`sd`) extension and `/sd` / `/imagine`,
  prose-to-prompt through a second LLM (connection-profile + preset swap), automating images with
  Quick Replies, lorebook markers and Danbooru-tag lorebooks, backgrounds (`/bg`, `/sd background`),
  expression sprites (folder layout, ComfyUI/WAN/LoRA) and regex-inserted illustrations.
  Use when wiring or debugging image gen in ST, writing a prompt that must produce image tags (wizard,
  curator, prose-to-prompt), generating backgrounds or sprites for a test story, or designing an
  image-gen curator/effect for Story Orchestrator.
---

# ST image generation

Community guides distilled and re-verified against the ST tree. **Citation key**: paths are relative to
`C:\dev\SillyTavern-MainBranch` (1.19.0, release merge `7c3994196`, checked 2026-09-18); `sd/` =
`public/scripts/extensions/stable-diffusion/`, `expr/` = `.../extensions/expressions/`, `cm/` =
`.../extensions/connection-manager/`, `qr/` = `.../extensions/quick-reply/`. `(community, yyyy-mm)` =
reported by a guide, not checkable in source.

## Pick the technique

| You want | Use | Read |
|---|---|---|
| One image now | `/sd <mode>` or the wand menu | below, `references/sd-extension.md` |
| Images that follow the scene, no clicks | prose-to-prompt: second LLM writes tags, QR runs `/sd` | `references/prose-to-prompt.md` |
| A fixed prompt/LoRA per situation | WI entry `automationId` → QR with `/sd <fixed tags>` | `references/automation-and-tag-lorebooks.md` |
| More accurate tags from any LLM | Danbooru-tag lorebook, `quiet`-only | `references/automation-and-tag-lorebooks.md` |
| Switch to an installed background | `/bg <name>`, `/autobg`, our `effects.background` | Backgrounds, below |
| A *new* background from the scene | `/sd background` (generates **and** sets it) | Backgrounds, below |
| Sprites that follow emotion | Character Expressions + a sprite set | `references/sprites-and-illustrations.md` |
| Pre-made CGs inline in the chat | lorebook reply format + regex → `<img>` | `references/sprites-and-illustrations.md` |

## How `/sd` builds an image

1. **Mode from the argument.** Exact trigger words pick a mode: `you`, `face`, `me`, `scene`, `last`,
   `raw_last`, `background`. Anything else is **free mode**: your text is the prompt (verified:
   sd/index.js:152-160, 2860-2881).
2. **LLM step (non-free modes).** The mode's *Image Prompt Template* goes to the **currently active
   main API** as a quiet prompt (`generateQuietPrompt`, sd/index.js:3292-3294). The extension has no
   profile setting of its own, so a dedicated prompt-writing model means switching the active
   connection. That is why the community swap idiom exists. `raw_last` skips the LLM.
3. **Reply cleanup.** Newlines become commas, quotes go, and every character outside
   `a-zA-Z0-9.,:_(){}<>[]/-'|#` becomes a space (non-ASCII too). `processing=minimal` only collapses
   whitespace (verified: sd/index.js:2896-2927). NAI `1.5::tag::` weights survive. `%`, `*`, `;`, `=` don't.
4. **Review popup**: "Edit prompts before generation" (`refine_mode`, or per call `edit=true|false`),
   non-free modes only (verified: sd/index.js:3189, 5388).
5. **Hook**: `SD_PROMPT_PROCESSING {prompt, generationType, message, trigger}`. Listeners may rewrite
   `prompt` (verified: sd/index.js:3054-3057).
6. **Prefixes.** The common prefix always applies. `{prompt}` (single braces) in it marks where the
   prompt goes, otherwise it is appended. The character prefix is added for `you/face/scene/last/raw_last`,
   **not** for free/`background`/`me`, and it is empty in group chats. Macros are then substituted over the
   whole thing (verified: sd/index.js:3318-3333, 934-946). Putting `{{charPrefix}}` inside the common
   prefix (as the community guide does) **duplicates** character tags in the non-free modes.
7. **Output.** The image is saved to `user/images/<character name | group id>/`, or to the images root
   with `gallery=false`. It is posted as a chat message unless `quiet=true`. Switching chats mid-generation
   discards it (verified: sd/index.js:3438-3446, src/endpoints/images.js:65-73).

`/sd` args you will actually use (all verified: sd/index.js:5492-5725, alias of `/imagine`, also
`/img`, `/image`; returns the image path):

| Arg | Effect |
|---|---|
| `quiet=true` | don't post to chat; still saved; returns path. **Also cancels the background set in `background` mode** (sd/index.js:3016-3033) |
| `edit=false` | skip the review popup even if the setting is on |
| `gallery=false` | save to `user/images/` root |
| `negative=...` | extra negative prefix |
| `extend=true` | free mode: LLM expands your subject into tags |
| `processing=minimal` | keep the LLM's JSON/syntax intact |
| `width= height= steps= cfg= seed= sampler= model= hires=` | one-shot overrides, restored afterwards (sd/index.js:5384-5450) |

## Prose-to-prompt through a second LLM (the community pipeline)

The roleplay model keeps playing. A second chat-completion model, with a tag-writing preset, turns the scene
into Danbooru tags. The QR sequence is: remember the current profile and preset, switch, `/sd`, switch back.
Full setup, the preset prompts and variants are in `references/prose-to-prompt.md`. Rules that come from
the source, not from the guide:

- **Save your roleplay connection as a profile first.** `/profile` with no argument returns `<None>`
  when none is selected, and switching back to `<None>` applies nothing. You would stay on the image
  model (verified: cm/index.js:921-935, 738-742). This is the usual cause of "character only replies
  with image tags".
- **`/profile` already waits** for the profile to load and the API to connect (`await=true`,
  `timeout=2000`), and `/preset` waits for reconnection. The guide's `/delay 1500` lines are redundant
  (verified: cm/index.js:905-958, public/scripts/preset-manager.js:944-950).
- **`/preset` falls back to fuzzy matching.** A misspelled name silently loads the closest preset
  (verified: preset-manager.js:938-975). Use exact names.
- **A profile stores its preset** (`preset` is in both CC and TC profile fields). Baking the tag preset
  into the image profile makes the separate `/preset` step optional (verified: cm/index.js:38-70).
  With **Bind presets to API connections** on (the CC default), loading a CC preset also rewrites the
  source and model. This is why the guide says to turn it off (verified: public/scripts/openai.js:516, 5046-5048).
- **The empty Scenario template is deliberate.** Emptied templates persist, and only missing ones are
  refilled (verified: sd/index.js:479-483). The preset's prompts then carry the whole instruction.
- **Avoiding the swap.** `/profile-genstream profile=<id> …` generates with another profile without
  switching (verified: cm/index.js:1050-1058; not live-tested here). Our own code already calls a second
  model by profile id without switching (see Integration notes).

## Automation triggers (details: `references/automation-and-tag-lorebooks.md`)

- **QR "Execute on AI message"** runs on `CHARACTER_MESSAGE_RENDERED`, which means after the reply
  (verified: qr/index.js:284-292). `/sd` posts its image with that same event (sd/index.js:4997-4999). Keep
  **"Don't trigger auto-execute"** (`preventAutoExecute`) checked on an image QR. That flag is the only
  thing stopping the posted image from re-triggering the QR (verified: qr/src/AutoExecuteHandler.js:16-31).
- **WI `automationId` → QR** fires while the prompt is being assembled (`WORLD_INFO_ACTIVATED`),
  i.e. **before** the reply. Generation waits for the QR, so the image lands above the reply
  (verified: public/scripts/world-info.js:900-903, qr/src/AutoExecuteHandler.js:85-100).
- **Marker in the reply** (`%[1]`, a lorebook entry tells the model to append it) needs the third-party
  Sorcery extension, which isn't installed here (community, 2025-08). The guide itself replaced it with QR triggering.
- **Constant WI entries ignore secondary keys.** A constant entry activates before any secondary-key
  logic runs (verified: world-info.js:4892-4896 vs 4924+), so the guide's `keysecondary` + NOT ANY guard
  on the marker entries does nothing. Use **Filter to Generation Triggers** instead: `triggers: ["normal"]`
  keeps an entry out of quiet generations (the `/sd` prompt call), and `["quiet"]` keeps it *only* there. This
  filter is checked before `constant` (verified: world-info.js:4806-4812, public/scripts/constants.js:36-43).

## Backgrounds

- `/bg <name>` fuzzy-matches the `.bg_example` thumbnails, system **and** chat backgrounds, and clicks the
  best hit. With no argument it returns the current global background (verified: public/scripts/slash-commands.js:676, 6203-6227).
  `/lockbg` and `/unlockbg` pin or unpin it for the chat. `/autobg` asks the LLM to pick from the **system**
  set only (verified: public/scripts/backgrounds.js:622-655, 1813-1835).
- `/sd background` asks the LLM for a scene description (Background template), generates a landscape
  image, then fires `FORCE_SET_BACKGROUND`. That stores it chat-locked in `chat_metadata.custom_background`
  (a css `url(...)`) and appends it to `chat_metadata.chat_backgrounds` (verified: sd/index.js:3016-3029,
  3117; backgrounds.js:14-15, 249-261). Its `bgfile` is the full path (`user/images/<char>/<file>`), not a basename
  (backgrounds.js:185-187).
- **LALib `/dom … #bg_custom` scripts are dead.** No `#bg_custom` element exists any more; the
  background element is `#bg1` (verified: public/index.html:53; `bg_custom` only in stale CSS). To get a
  custom background prompt, paste it into the **Background** template and run `/sd background`.

## Sprites and illustrations (details: `references/sprites-and-illustrations.md`)

- Sprites live in `data/<user>/characters/<Character Name>/` and are served at `/characters/<name>/<file>`.
  The label is the filename up to the first `-` or `.`, so `joy.png`, `joy-2.png` and `joy.alt.png` are
  all `joy`, and several files per label give random variants (verified: src/endpoints/sprites.js:118-146,
  expr/index.js:1563-1590). A zip upload flattens folders (src/util.js:442).
- The 28 default labels are the classifier's emotions: admiration … neutral (verified: expr/index.js:45-74).
  Fresh installs default to classifier **None**, so nothing changes until one is picked (expr/index.js:2219-2221).
- Consistent sprites come from **one** strong identity source: a character LoRA, an IP-Adapter/FaceID
  reference, or animating one portrait (WAN) and extracting frames (community, 2024-04 to 2025-10).

## Checklists

**Before blaming the model:** image source configured? (`/imagine-source` returns it) · active profile
is the roleplay one (`/profile`) · the template for the mode you called isn't empty by accident ·
`edit=false` in scripts, or a hidden popup blocks them · group chat means no character prefix.

**Shipping a seamless-image setup:** roleplay profile saved · image profile = chat completion, tag
preset baked in · Scenario template emptied *or* the tag instructions live in it · QR has
`preventAutoExecute` on · marker/tag lorebooks use Generation Triggers, not secondary keys · restore
order is profile first, then preset · test once on a swipe and once on Continue.

## Gotchas (all verified unless marked)

- A command-posted image is a **hidden** message (`is_system`) unless *Chat Message Visibility → Slash
  Command* is on, so its text never reaches the prompt (verified: sd/index.js:4985, 5009-5028; public/script.js:4496).
  "Send inline images" is now **Send inline media** (`media_inlining`) (verified: openai.js:4286-4287).
- The character prefix is stored per avatar filename in `extension_settings.sd.character_prompts`. It
  can ship inside a card as `data.extensions.sd_character_prompt {positive, negative}` (the "Shareable"
  box), and ST adopts it on chat open if the local one is empty (verified: sd/index.js:881-896, 5251-5260).
- The NovelAI request always sends empty `characterPrompts`, so there is no per-character NAI
  multi-subject (verified: src/endpoints/novelai.js:356-372). NAI 4.5 Full is in the release model list,
  so the "switch to staging" advice is stale (sd/index.js:2460).
- WI entry `role: 1` is **user**, not assistant (verified: public/script.js:494-498). The guide's
  lorebook table mislabels it.
- Regex Replace-With **can** carry `<style>` now: it is scoped under `.mes_text` and classes are
  `custom-`-prefixed (verified: public/scripts/chats.js:535-560, 1910-1933; public/script.js:1966-1968). The guide's
  "no inline style" claim is stale. **Forbid External Media** defaults on, which blocks off-site `<img>`
  such as pollinations URLs (public/scripts/power-user.js:336).

## References

- `references/sd-extension.md`: every mode, arg→setting map, settings keys and defaults, sources,
  ComfyUI placeholders, events. Open it when scripting `/sd` or reading `extension_settings.sd`.
- `references/prose-to-prompt.md`: the full pipeline (profile, preset structure, QR scripts
  rewritten for current ST, background generator, model notes). Open it when building or fixing the pipeline.
- `references/automation-and-tag-lorebooks.md`: trigger mechanisms, per-situation LoRA images, frequency
  lorebooks, the Danbooru-tag lorebook. Open it when images should fire by themselves.
- `references/sprites-and-illustrations.md`: expression commands, sprite generation (ComfyUI, WAN,
  Kontext, LoRA), regex illustrations. Open it for character visuals.
- `references/troubleshooting.md`: symptom → cause → fix table.

Related: `../st-scripting/SKILL.md` (QR/regex JSON, STscript), `../st-lorebook-authoring/SKILL.md`
(entry fields), `../st-character-authoring/SKILL.md` (cards), `../../sillytavern-docs/macros.md`
(`{{charPrefix}}`), `../../sillytavern-docs/instructmode.md` (quiet-prompt prefixes),
`../../sillytavern-docs/community/ui-dom-selectors.md` (CSS).

## Sources

| Thread (SillyTavern Discord `st-guides`) | Created → last activity | Upvotes |
|---|---|---|
| [2.0 Seamless Image Generation](https://discord.com/channels/1100685673633153084/1384178466202845285) | 2025-06-16 → 2026-06-24 | 37 |
| [Automated Stable Diffusion Quick Reply System](https://discord.com/channels/1100685673633153084/1269752398310670471) | 2024-08-04 → 2024-12-29 | 5 |
| [Using Lorebooks for Tag Based Image Generation Prompts](https://discord.com/channels/1100685673633153084/1457934981992157224) | 2026-01-06 → 2026-01-07 | 8 |
| [ComfyUI Workflow for generating Character Expressions](https://discord.com/channels/1100685673633153084/1393328263711031417) | 2025-07-11 → 2026-03-11 | 22 |
| [Using Regex to Insert Character Illustrations/Stickers](https://discord.com/channels/1100685673633153084/1342397452933664768) | 2025-02-21 → 2025-11-17 | 36 |
| [Ten Step (ish) Guide for Creating a LoRA for ST Character Expressions](https://discord.com/channels/1100685673633153084/1232406331210858556) | 2024-04-23 → 2024-09-17 | 19 |
| [Lein's Beginner's Guide: Introduction to ST](https://discord.com/channels/1100685673633153084/1406653968477851760) §9–10 | 2025-08-17 → 2026-06-19 | 53 |

Local dumps: `docs/tutorials/sillytavern-*.md` (verbatim prompts, CSS and JSON live there).

## Integration notes for Story Orchestrator

- **Reuse, don't rebuild.** `src/services/stHost/backgrounds.ts` is the only background seam
  (`getCurrentBackground`/`listBackgrounds`/`backgroundExists`/`applyBackground`, re-exported at
  `src/services/STAPI.ts:36-37`). `effects.background` (`src/engine/schema.ts:71-78`, normalized in
  `src/engine/validate.ts:101-118`) is applied idempotently by `src/runtime/effectsApplier.ts:117-119`. An
  image effect should follow the same shape: authored, applied on activate and hydrate, idempotent.
- **A second LLM without swapping.** `sendConnectionProfileRequest` (`src/services/stHost/connectionProfiles.ts:43-55`)
  already sends by profile id through `ConnectionManagerRequestService`. The user's active profile never
  changes, which makes the community swap idiom unnecessary for us. A CC profile's preset contributes
  sampler settings but not its prompt-manager prompts. The messages you pass are the entire prompt
  (public/scripts/custom-request.js:544-605), so the tag instructions must travel in those messages. The
  tags then go to `/sd quiet=true <tags>`, which returns the saved path. Our `executeSlashCommands`
  (`stHost/slashCommands.ts:38-60`) only returns ok/failed, so reading that path needs a variant that
  surfaces the host result's `pipe`.
- **Other seams a curator/effect would need (none exist yet):** an *emit* path for `FORCE_SET_BACKGROUND
  {url, path}` (`stHost/events.ts` is subscribe-only), `SD_PROMPT_PROCESSING` in `HostEventPayloads`
  if we want to inject story tags into user-run `/sd`, and a readiness read (sd's `isValidState` isn't
  exported; `extension_settings.sd.source` plus `disabledExtensions` is the host-side proxy).
- **`/sd` images are not turns.** `sendMessage` emits `MESSAGE_RECEIVED` and
  `CHARACTER_MESSAGE_RENDERED` with type `'extension'` (sd/index.js:4997-4999). `TurnBridge` drops that
  type (`NON_TURN_MESSAGE_TYPES` in `src/runtime/turnBridge.ts`, fixed 2026-09-19), so a posted image
  commits no boundary and fires no `afterSpeak` replies. Anything of ours that posts images must use the
  same `'extension'` type. The image message's `mes` (the prompt text) still enters later extraction
  windows unless `is_system` is set.
- **Design constraints already on paper.** `docs/plans/v2.1/stagecraft-design.md` puts proposals
  only, boundary-apply, a per-curator flag and deterministic-first on every curator. The scene-setter is
  specified as "never a new asset", so generating images is a *separate* capability that needs its own flag,
  review card and cleanup. `scripts/debug/so-assets.mts` only knows cards, groups and lorebooks, and never
  touches `user/images/`.
- **Chat backgrounds differ from system ones.** A generated background's `bgfile` is a path, while
  `getCurrentBackground()` returns only the basename (`backgrounds.ts:19-27`). `backgroundExists(basename)` is
  therefore false for it (see `.claude/rules/gotchas.md`, plan-07 bullet, for the other background traps).
- **Provisioned cards can carry image tags.** `stHost/provisioning.ts:61` sends `extensions: "{}"`, and
  the server deep-merges that JSON into `data.extensions` (src/endpoints/characters.js:646-653). The wizard
  could therefore seed `sd_character_prompt` for each created character.

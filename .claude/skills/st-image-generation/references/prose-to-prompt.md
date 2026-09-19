# Prose-to-prompt: a second LLM writes the image tags

Open this when you are building, porting or fixing the "seamless image generation" setup, or writing
any prompt whose output feeds an image model. It covers the community pipeline (closure's *2.0
Seamless Image Generation*, prompt by Leaf, Jun 2025 to Jun 2026) restated for current ST. Verbatim prompt texts,
QR JSON and lorebook JSON are in `docs/tutorials/sillytavern-seamless-image-generation-v2.md` §2–§5.
This file keeps the structure and the fixes. Citation key as in `../SKILL.md`.

## Why a second model at all

The `sd` extension writes its LLM prompt through the **active** connection (sd/index.js:3292-3294) and
has no profile setting of its own. The roleplay model is usually bad at Danbooru tags, and it drifts
into roleplay. A reasoning-capable chat-completion model with a tag-only preset produces much better
prompts (community, 2025-08). In ST you therefore swap the active connection for one call.

## Components

| # | Piece | Community values | Notes |
|---|---|---|---|
| 1 | Image source | NovelAI V4/4.5, or any tag-trained model (Illustrious, NoobAI, Pony) | *Image Generation* → source. See `sd-extension.md` for the source list |
| 2 | Image profile `Image_Generation` | Chat Completion, a model that knows booru tags | *Connection Profile* dropdown → save. Exact name matters to the script |
| 3 | Tag preset `Guide_ImageGen` | CC preset, see below | **CC only.** It does not load on text completion (community, 2025-08) |
| 4 | Scenario template emptied | *Image Prompt Templates* → Scenario ("The Whole Story") → blank | Empty strings persist (verified: sd/index.js:479-483), so the quiet prompt adds nothing and the preset carries the instruction |
| 5 | QR set | a button plus an optional auto variant | script below |
| 6 | sd settings | 27 steps, CFG 4. 832×1216 portrait, 1216×832 background, 1600×640 wide | artist tag in the common prefix at reduced weight, e.g. `0.5::artist::` (NAI syntax) |
| 7 | Character prefix | popular-character tags, or LoRA trigger words | only always-visible traits, no clothing. Ignored in group chats (verified: sd/index.js:934-946) |

Turn off **Bind presets to API connections** (CC preset panel) if loading the tag preset also flips
your source or model. When it is on (the default), a CC preset carries connection fields (verified:
public/scripts/openai.js:516, 5046-5048). Alternatively, bake the preset into the image profile: a
profile records `preset` (verified: cm/index.js:38-70).

## The tag preset, structurally

Sampler block (community values): temperature 1, top-p 0.95, top-k 0, frequency and presence penalty ~0.01–0.03,
max context 15000, max response 8000, reasoning effort `auto`. Raise the effort if prompts come out
inconsistent.

Three prompt-manager entries:

1. **Start**: the task. Analyse the current scene, simplify it, and write a prompt for *<image model>*
   in simple visual terms, under ~450 tokens. Then open a `<character>` block that the character
   card fills.
2. **Instructions**: the format spec (below), closed with "reply with the tags only".
3. **User Order**: the same "tags only, nothing else" line as the final user message.

Format spec, as a skeleton (rewritten, not the original text):

```
[if the scene is explicit, start with the rating tag]
[subject count: 1girl / 2girls / 1boy …; boy/girl only for humanoids]
[camera: pov / from above / from below / from side …; always give one; for pov describe what {{user}} sees]
[one block per character: gender tag, name, visible appearance, clothing (or "nude"),
  expression, at most one interaction tag: source#<action> | target#<action> | mutual#<action>]
[one short plain-English sentence on composition: who is where, doing what]
[setting / environment tags; weight the dominant ones 1.2–1.5::tag::, soften minor ones 0.7::tag::]
[quality tags last]
Output only the tags.
```

Practice notes (community, 2025-08 to 2026-06):
- **The camera angle** is the single biggest reliability gain.
- **Persona is left out** on purpose, because it pulls prompts away from POV. Add it under the character
  personality slot only if you want the user rendered.
- **Tag models with LoRAs hate natural language.** For local Illustrious/Pony/LoRA setups, drop the
  plain-English composition line and ask for booru tags only: gender, hair, eyes, skin, clothing,
  body, expression, pose, interaction, location, lighting, quality. For e621-style models, one variant asks
  for an exhaustive tag list and gives a single input→output example.
- `source#`/`target#`/`mutual#` is NAI V4 interaction syntax. It means nothing to SDXL-family models.
- Multiple original characters in one image rarely work. Keep to one subject per image, or a group chat
  where each card has its own prefix or LoRA. ST cannot send NAI per-character prompts (verified:
  src/endpoints/novelai.js:356-372).
- The prompt must survive `processReply` if it comes through `/sd <mode>`. `%`, `*`, `;` and non-ASCII
  are stripped, while `::`, `{}`, `[]`, `#` and `|` survive (verified: sd/index.js:2916). Use
  `processing=minimal`, or free mode (`/sd <text>`), to pass text through untouched.

## The QR script, for current ST

Rewritten from the guide's `IMG` button. It drops the fixed delays, because `/profile` awaits load and
connection and `/preset` awaits reconnection (verified: cm/index.js:905-958,
public/scripts/preset-manager.js:944-950). It also refuses to run when the current connection isn't a
saved profile, since a restore to `<None>` applies nothing (verified: cm/index.js:921-935, 738-742).
Not live-tested; STscript syntax: `../../st-scripting/SKILL.md`.

```
/profile |
/setvar key=img_prev_profile |
/if left={{getvar::img_prev_profile}} right="<None>" rule=eq {: /echo Save the roleplay connection as a profile first | /abort :} |
/preset |
/setvar key=img_prev_preset |
/profile Image_Generation |
/preset Guide_ImageGen |
/sd edit=false scene |
/profile {{getvar::img_prev_profile}} |
/preset {{getvar::img_prev_preset}} |
/flushvar img_prev_profile |
/flushvar img_prev_preset
```

- Read both values **before** switching, and restore the **profile first**. `/preset` acts on the
  current API's preset list (verified: preset-manager.js:917-935).
- `/sd` never throws into the script. It catches, toasts and returns `''`, so the restore lines always
  run, even when the review popup is cancelled (verified: sd/index.js:5516-5519).
- `/profile <unknown>` returns `''` and switches nothing (verified: cm/index.js:937-940). A missing
  `Image_Generation` means `/sd` runs on the roleplay model. Check the name.
- `/preset` fuzzy-matches (verified: preset-manager.js:955-975), so a missing `Guide_ImageGen` loads
  whatever is closest.
- **Auto variant**: the same body in a QR with *Execute on AI message* **and** *Don't trigger
  auto-execute* on. Gate it with `/rand from=1 to=N round=round | /if left={{pipe}} right=1 rule=neq {: /abort :}`,
  where a lower `N` means more images. See `automation-and-tag-lorebooks.md` for why the auto-execute guard is mandatory.
- **Swap-free alternative**: `/profile-genstream profile=<profile id> system="<tag instructions>" <scene text>`
  generates with another profile without switching (verified: cm/index.js:1050-1058; not
  live-tested). Pipe the result into `/sd edit=false {{pipe}}`, which is free mode, so no processReply
  and no character prefix unless the text starts with `char ` or contains `{{charPrefix}}`.

## Keeping marker lorebooks out of the tag call

The guide pairs the pipeline with a lorebook, `_ImageGeneration`, whose constant entries tell the roleplay
model to end replies with a Sorcery marker. They carry a secondary key naming the preset's "tags only"
sentence, with logic NOT ANY, meant to mute them during the tag call. **That guard is dead**: constant
entries activate before secondary keys are evaluated (verified: public/scripts/world-info.js:4892-4896
vs 4924+). Two working fixes:

- **Generation Triggers** on each entry = Normal (+ Swipe/Regenerate). The `/sd` LLM call is a `quiet`
  generation, so the entry never fires there (verified: world-info.js:4806-4812, public/script.js:4633,
  public/scripts/constants.js:36-43). This is the preferred fix.
- Toggle the book around the call: `/world silent=true state=off <book>` … `/world silent=true state=on <book>`.
  This is cupcake's workaround, and the args are verified (world-info.js:1615-1638).

The guide's frequency presets (every ~5 messages, random ~20%, nearly always) are just
cooldown/delay/probability on those constant entries. All three do apply to constants (verified:
world-info.js:4846-4856 before 4892, probability 5030-5053). Its table labels `role: 1` "assistant";
1 is **user** (verified: public/script.js:494-498).

## Background generation

- The built-in route is `/sd edit=false background` inside the swap. It generates a landscape image and
  sets it as the chat-locked background (verified: sd/index.js:3016-3029, 3117; public/scripts/backgrounds.js:249-261).
  Put your background instructions in the **Background** template (or the tag preset). **Don't add `quiet=true`**,
  because that also cancels setting the background (sd/index.js:3030-3033).
- What a good background prompt asks for (community, 2025-08; rewritten): scenery only. No characters.
  Concrete visual nouns for location, time of day, weather, lighting, furniture and decor. Mood is implied through
  lighting and weather, never through adjectives like "mysterious". Comma-separated tags, the dominant elements
  weighted, supportive tags (`indoors`/`outdoors`/`scenery`). For NAI, start with `background dataset,` and end with quality tags.
- The guide's scene-background QR (by Lazuli) uses `/genraw` → `/imagine` → LALib `/dom … #bg_custom`. On
  current ST **`#bg_custom` doesn't exist** (the background element is `#bg1`, public/index.html:53), and
  `/dom` is LALib-only (not in core; LALib is not installed here). Use the built-in route above.
- The visual-novel variant (Chimpy3d) points the sprite image at the generated file: `/costume none`, then
  `/sd quiet=true edit=false you`, then LALib `/dom action=attribute attribute=src value={{pipe}} #expression-image`.
  `/costume none` has no special meaning; it points the sprite folder at a nonexistent `none` subfolder,
  which blanks the sprite (verified: expr/index.js:687-708). `#expression-image` exists (expr/index.js:2260).
  Anything that touches the DOM is LALib territory and unverified here.

## Model notes (community, 2025-08, and dated)

Tag writing needs a model that knows booru vocabulary, repeats descriptors faithfully and follows a long
format. Reasoning models do best.

| Model family | Report |
|---|---|
| Gemini 2.5 Pro | best tags, but filtered easily. "Empty candidates" means retry; repeated failures mean filtering |
| Claude Sonnet / Opus | very good and fast, expensive |
| DeepSeek R1 / V3.x | good. R1 slow (~2 min), newer versions faster |
| Grok 4 | uncensored, follows the format, sometimes drops details |
| GPT family | guardrails and detail aversion |
| Small local / non-instruct | won't follow the format or emit markers. Use booru-only instructions and QR triggering |

Image side: NovelAI is paid (Opus tier ≈ unlimited standard generations). Free and self-hosted options named
were ComfyUI/Stability Matrix with Illustrious/NoobAI/Chroma, Pollinations (`pollinations` source, Flux), pixai and
tensor.art. The shipped `Default_Comfy_Workflow.json` works with Illustrious, not Chroma (community, 2025-08).

Extras that help (community): the Tracker extension (scene state makes prompts better). With qvink memory,
add a ~1 s delay before it summarizes, or it can run on the image profile.

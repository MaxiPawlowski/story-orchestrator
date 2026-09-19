# Image Generation (`sd`) extension: reference

Open this when you are scripting `/sd` / `/imagine`, reading or seeding `extension_settings.sd`, or
working out why a prompt came out the way it did. Citation key as in `../SKILL.md` (`sd/` =
`public/scripts/extensions/stable-diffusion/`). Everything here was verified against ST 1.19.0.

The UI calls it **Image Generation** (manifest `display_name`), the folder is `stable-diffusion/`, and
the settings key and module name are `sd` (verified: sd/manifest.json:2, sd/index.js:69).

## Generation modes

`/sd <word>`: the word must equal a trigger **exactly** (case-insensitive, trimmed). Anything else
runs free mode (verified: sd/index.js:152-160, 2860-2881). Each non-free mode has an editable prompt
under *Image Generation → Image Prompt Templates*, stored in `extension_settings.sd.prompts[<mode number>]`.

| Mode (number) | `/sd` word | Wand menu item | Template label | LLM call | Char prefix | Notes |
|---|---|---|---|---|---|---|
| CHARACTER (0) | `you` | Yourself | Character ("Yourself") | yes | yes | template asks for a full-body keyword list |
| FACE (5) | `face` | Your Face | Portrait ("Your Face") | yes | yes | forces portrait aspect (height = width×1.5) |
| USER (1) | `me` | Me | User ("Me") | yes | **no** | describes `{{user}}` |
| SCENARIO (2) | `scene` | The Whole Story | Scenario ("The Whole Story") | yes | yes | the one the seamless guide empties |
| NOW (4) | `last` | The Last Message | Last Message | yes | yes | keyword list of the last message |
| RAW_LAST (3) | `raw_last` | Raw Last Message | Raw Last Message | **no** | yes | builds `((last msg)), (scenario:0.7), (description:0.5)` from the card (sd/index.js:2930-2958) |
| BACKGROUND (7) | `background` | Background | Background | yes | **no** | forces landscape (width = height×1.8), then sets the chat background |
| FREE (6) | anything else | — | — | no | only via `char ` prefix / `{{charPrefix}}` | text is the prompt, no review popup |
| FREE_EXTENDED (11) | free + `extend=true` | — | Free Mode (LLM-Extended) | yes | as free | template gets the subject as `{0}` |
| *_MULTIMODAL (8/9/10) | `you`/`me`/`face` with *Use multimodal captioning for portraits* | — | … (Multimodal Mode) | caption API | as base | captions the avatar image instead |
| MESSAGE (−1) | — | — | Chat Message Template | — | — | text of the posted message, default `[{{char}} sends a picture that contains: {{prompt}}].` |
| TOOL (−2) | — | — | Function Tool Prompt Description | — | — | parameter description for the `GenerateImage` tool |

Sources: modes and labels sd/index.js:113-150, wand ids→words sd/index.js:5057-5065, char-prefix
exclusion list sd/index.js:3318 (a **swipe** of an image in a 1:1 chat keeps the char prefix even for
excluded modes, sd/index.js:3319-3322), aspect handling sd/index.js:3108-3119, free-mode char handling
sd/index.js:3202-3230, default templates sd/index.js:174-218.

Other entry points (verified): the wand "Send me a picture of:" menu (`#sd_dropdown`, sd/dropdown.html);
**interactive mode** (`interactive_mode`) scans *user* messages for "send/draw/show… a picture of X",
with special cases (`you/yourself`, `face/portrait/selfie`, `background/scenery/…`) (sd/index.js:162-172,
375-440); **function tool** `GenerateImage` for tool-calling models (`function_tool`, sd/index.js:5452-5484).
When the tool is active, interactive mode is skipped.

## `/imagine` (`/sd`, `/img`, `/image`) arguments → settings

Every named arg overrides the matching setting for one call and is restored afterwards
(verified: sd/index.js:5384-5450, 5492-5725).

| Arg | Setting key | Type / values |
|---|---|---|
| `quiet` | — | bool, default false: no chat message (and no background set in `background` mode) |
| `gallery` | — | bool, default true: false saves to `user/images/` root instead of the char/group folder |
| `negative` | — | extra negative prefix, combined in front of the configured negatives |
| `edit` | `refine_mode` | bool, review popup |
| `extend` | `free_extend` | bool |
| `multimodal` | `multimodal_captioning` | bool |
| `snap` | `snap` | bool, snap auto-adjusted aspect to a known resolution |
| `processing` | `minimal_prompt_processing` | `standard` \| `minimal` |
| `seed` `width` `height` `steps` `cfg` `skip` | `seed` `width` `height` `steps` `scale` `clip_skip` | number |
| `model` `sampler` `scheduler` `vae` `upscaler` | same (`hr_upscaler` for upscaler) | must match an option in the settings dropdown |
| `hires` `scale` `denoise` `2ndpass` `faces` | `enable_hr` `hr_scale` `denoising_strength` `hr_second_pass_steps` `restore_faces` | A1111-family knobs |

Returns the saved image path (`user/images/...`), or `''` on failure (sd/index.js:5494, 5516-5519).
If both `width` and `height` are given and the image was posted, they are written onto the message's
media attachment so swipes regenerate at that size (sd/index.js:5501-5513).

Companion commands (verified): `/imagine-source [name]` (`/sd-source`, `/img-source`) gets or sets the
backend (sd/index.js:5727-5757). `/imagine-style [name]` gets or sets the saved style, i.e. the
prefix + negative pair (sd/index.js:5759-5785). `/imagine-comfy-workflow <file>` (`/icw`) switches the ComfyUI
workflow (sd/index.js:5787-5800).

## Prompt assembly, exactly

1. `getQuietPrompt`: free mode uses the text as is. Other modes run `stringFormat(template, trigger)`
   (sd/index.js:2883-2889).
2. LLM modes call `generateQuietPrompt({ quietPrompt })` on the **active** connection
   (sd/index.js:3292-3304). That is a normal `Generate('quiet')`, so World Info scans run with trigger
   type `quiet`, and instruct mode uses its system/"last line" prefixes for background prompts
   (see `../../../sillytavern-docs/instructmode.md` §System Instruction Prefix). An empty reply
   raises *"Prompt generation produced no text. Make sure you're using a valid instruct template"*.
3. `processReply` (standard): strips `"` and `“`, turns newlines into `, `, NFD-normalizes, replaces every
   run of characters outside `[a-zA-Z0-9.,:_(){}<>[\]/\-'|#]` with a space, then re-joins
   comma-separated non-empty parts. Minimal mode only NFD-normalizes and collapses whitespace
   (sd/index.js:2896-2928). Free mode prompts skip this step.
4. Review popup when `refine_mode` is on (non-free modes). It can also edit the negative and drop the
   saved resolution (sd/index.js:814-870).
5. `SD_PROMPT_PROCESSING` event: listeners may reassign `eventData.prompt` (sd/index.js:3054-3057).
6. `sendGenerationRequest` (sd/index.js:3316-3333):
   - `prefix = common prefix`, plus `, <char prefix>` unless the mode is excluded or the chat is a group.
   - `combinePrefixes(prefix, prompt, '{prompt}')`: if the prefix contains `{prompt}` it is replaced,
     otherwise the result is `prefix, prompt` (sd/index.js:969-983). Leading and trailing commas are trimmed.
   - `substituteParams(...)` runs over the combined string, so `{{char}}`, `{{user}}`, `{{charPrefix}}`
     and `{{random::…}}` work in prefixes.
   - Negative = `negative arg`, then common negative, then char negative.
7. Some backends ignore the negative prompt entirely: OpenAI, AI/ML API, HuggingFace, Electron Hub, BFL,
   Z.AI and OpenRouter get only the positive prompt (sd/index.js:3339-3421).

**Character prefix storage** (verified): `extension_settings.sd.character_prompts[<avatar filename w/o
ext>]` plus `character_negative_prompts`. The UI block is hidden in groups, and `getCharacterPrefix()` returns `''`
there (sd/index.js:873-879, 934-960). With the **Shareable** checkbox it is also written to the card as
`data.extensions.sd_character_prompt = {positive, negative}`, and a card carrying that object seeds an empty
local prefix on chat open (sd/index.js:885-896, 5236-5260). Macros `{{charPrefix}}` / `{{charNegativePrefix}}`
read the same values (sd/index.js:5955-5996; docs: `../../../sillytavern-docs/macros.md`).

## Output and the posted message

- Saved via `/api/images/upload` to `data/<user>/user/images/<ch_name>/<name>_<timestamp>.<ext>`. `ch_name` is
  the character name, the **group id** in groups, or empty with `gallery=false` (sd/index.js:3012-3014,
  3034-3036, 3444-3446; src/endpoints/images.js:65-73; src/constants.js:25).
- Unless `quiet`, a message is pushed with `extra.media[0] = {url, type, title: prompt, generation_type,
  negative, source: 'generated'}`. Its `is_system` is set by *Chat Message Visibility (by source)*: Extensions
  Menu `wand_visible`, Slash Command `command_visible`, Interactive `interactive_visible`, Function Tool
  `tool_visible`, all default **false**, i.e. hidden from the prompt (sd/index.js:344-351, 4966-5028).
- Posting emits `MESSAGE_RECEIVED` then `CHARACTER_MESSAGE_RENDERED`, both with type `'extension'`
  (sd/index.js:4997-4999). Any listener that treats those as "the AI replied" will fire.
- In `background` mode the callback first emits `FORCE_SET_BACKGROUND {url: 'url("<path>")', path}`
  (sd/index.js:3016-3029). `public/scripts/backgrounds.js:249-261` then locks it for the chat and lists it
  under chat backgrounds. `quiet=true` replaces the whole callback, so nothing is set.

## Settings worth knowing (`extension_settings.sd`)

Defaults (verified: sd/index.js:220-397): `source: 'extras'` (the UI lists it as *Extras API
(deprecated)*, settings.html:51, so a fresh install must pick a real source); 512×512; `steps: 20`;
`scale: 7`; `sampler: 'DDIM'`; `seed: -1`; `prompt_prefix: 'best quality, absurdres, aesthetic,'`; a generic
negative; `refine_mode`, `interactive_mode`, `function_tool`, `multimodal_captioning`, `free_extend`,
`snap` and `minimal_prompt_processing` all false; `comfy_url: 'http://127.0.0.1:8188'`,
`comfy_workflow: 'Default_Comfy_Workflow.json'`; `styles` holds named `{name, prefix, negative}` presets.

Sources (value → UI label, settings.html:44-67): `aimlapi` AI/ML API · `bfl` BFL · `chutes` · `workersai`
Cloudflare Workers AI · `comfy` ComfyUI · `drawthings` · `electronhub` · `extras` (deprecated) · `falai` ·
`google` Google AI · `huggingface` · `nanogpt` · `novel` NovelAI Diffusion · `openai` · `openrouter` ·
`pollinations` · `vlad` SD.Next · `stability` · `auto` AUTOMATIC1111 · `sdcpp` stable-diffusion.cpp ·
`horde` Stable Horde · `togetherai` · `xai` · `zai`.

Resolution presets include `832x1216`, `1216x832`, `1536x640` (the community's portrait / background /
wide picks) and the other SDXL buckets (sd/index.js:1073-1092).

## ComfyUI specifics

- Workflows are API-format JSON files in `data/<user>/user/workflows/`. A missing file falls back to
  `Default_Comfy_Workflow.json`. `Char_Avatar_Comfy_Workflow.json` ships as well (src/constants.js:42,
  src/endpoints/stable-diffusion.js:497-499, default/content/).
- Placeholders are replaced **including their quotes**, so write `"%prompt%"` as a JSON string value:
  `%prompt%`, `%negative_prompt%`, `%seed%` (random when seed = −1), `%denoise%`, `%clip_skip%` (sent
  negated), `%model%`, `%vae%`, `%sampler%`, `%scheduler%`, `%steps%`, `%scale%`, `%width%`, `%height%`,
  `%user_avatar%`, `%char_avatar%` (base64 of the avatar) (sd/comfyWorkflowEditor.html:12-28,
  sd/index.js:4221-4270).
- **Custom placeholders** (`comfy_placeholders: [{find, replace}]`) run `substituteParams` on `replace`,
  so a placeholder can carry `{{charPrefix}}` or a per-character LoRA name (sd/index.js:4247-4249).
- LoRAs through ComfyUI need a LoRA loader node in the workflow. Activation tags in the character
  prefix are not enough (community, 2025-08).

## NovelAI notes

- Model list includes `nai-diffusion-4-5-full` / `-curated` / `4-full` / `4-curated-preview`
  (sd/index.js:2460-2472).
- The server always sends `characterPrompts: []` and empty `char_captions`, so NAI V4 multi-character
  placement is not reachable from ST (src/endpoints/novelai.js:356-372).
- An "Internal server error" on NAI usually means 0 Anlas / no subscription; check the ST console
  (community, 2025-08). A text-gen 400 `min_length` during `/sd` means the *text* profile points at
  NovelAI, not the image source (community, 2025-08).

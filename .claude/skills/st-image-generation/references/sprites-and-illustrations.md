# Character visuals: expression sprites and regex illustrations

Open this when a character needs sprites, you are producing a sprite set, or you want pre-made
CGs to appear inline in chat. Citation key as in `../SKILL.md` (`expr/` =
`public/scripts/extensions/expressions/`). Regex script JSON (placement, `markdownOnly`, …) is
documented in `../../st-scripting/SKILL.md`. CSS and DOM hooks are in
`../../../sillytavern-docs/community/ui-dom-selectors.md`.

## Character Expressions: how sprites are found

- **Folder**: `data/<user>/characters/<folder>/`, served at `/characters/<folder>/<file>` (verified:
  src/endpoints/sprites.js:18-38, 142; src/constants.js:29). `<folder>` is the character's **name** as shown
  in chat, unless a folder override is set (verified: expr/index.js:625-636). `/expression-upload` resolves
  the folder from the **avatar filename** instead (expr/index.js:872-876, 930-938), so keep the avatar file
  named after the character, or the two disagree.
- **Label from filename**: lower-cased, cut at the first `-` or `.`. `joy.png`, `joy-2.png` and
  `joy.happy.webp` all belong to `joy`. Any `image/*` MIME type counts (png/webp/gif…) (verified: sprites.js:125-139).
- **Variants**: with *Allow multiple sprites per expression* (`allowMultiple`, default on), one file per
  label is chosen at random. *Reroll if same* avoids repeats. If a label has no files, the **fallback
  expression** is used (verified: expr/index.js:1563-1590, 2238-2239).
- **Default labels (28)**: admiration, amusement, anger, annoyance, approval, caring, confusion, curiosity,
  desire, disappointment, disapproval, disgust, embarrassment, excitement, fear, gratitude, grief, joy,
  love, nervousness, optimism, pride, realization, relief, remorse, sadness, surprise, neutral (verified:
  expr/index.js:45-74). The bundled Seraphina has all 28 as PNGs (default/content/Seraphina/), which makes
  it a convenient reference set.
- **Classifier** (*Classifier API*): `local` (transformers), `extras`, `llm` (uses the prompt
  `...Choose only one of the following labels: {{labels}}`), `webllm`, `none`. Fresh installs are on
  **none**, so sprites never change until you pick one (verified: expr/index.js:44, 82-88, 2219-2221).
- **Custom labels**: a-z, 0-9, `-` and `_` only, and they may not start with a default label (so `joyful` is
  refused). They must also be registered in the extension settings (verified: expr/index.js:1760-1790).
  Two traps: a `-` in a custom label never matches a file, because the server cuts the label at the dash; and
  `/expression-upload` strips everything except letters from `label=` (verified: sprites.js:138,
  expr/index.js:918). **Use letters-only custom labels.**
- **Zip upload** (settings → upload sprite pack) flattens folders inside the zip and replaces files with
  the same base name (verified: sprites.js:186-236, src/util.js:442).
- **Visual-novel mode** (several sprites at once) only runs for **group** chats on desktop with VN mode on
  (verified: expr/index.js:136-138). For multi-sprite display from a single card, the community uses
  the third-party CostumeSwitch or Group Expressions (LennySuite) extensions (community, 2025-08).

### Commands (all verified: expr/index.js:2395-2640)

| Command (aliases) | Use |
|---|---|
| `/expression-set <label>` (`/sprite`, `/emote`) | force an expression; `type=sprite` picks a specific file; `#reset` clears |
| `/expression-fallback [label\|#none\|#emoji]` | get or set the fallback |
| `/expression-folder-override [folder]` (`/spriteoverride`, `/costume`) | sprite folder override; `/name` with a leading slash = subfolder of the character folder; empty resets; `name=` targets a character |
| `/expression-last [name]` (`/lastsprite`) | last expression set |
| `/expression-list` (`/expressions`) | available labels, custom ones included |
| `/expression-classify <text>` (`/classify`) | label for arbitrary text; `api=`, `filter=`, `prompt=` |
| `/expression-upload <url>` (`/uploadsprite`) | `label=` (required), `name=`, `folder=`, `spriteName=` (must be `label` or `label-…`/`label.…`) |

Costumes are just subfolders: `characters/<Name>/<costume>/joy.png`, switched with `/costume /<costume>`.
`/costume none` has no special meaning (expr/index.js:687-708). It blanks the sprite only because
no folder called `none` exists.

## Producing a sprite set

Hard part first: **identity consistency**. Every technique below is a way to keep one face and outfit
across 28 images. They are ordered from cheapest to most work. Toolchain basics (community, 2025-08):
- A checkpoint (SD1.5 / SDXL / FLUX) sets the base style. Every add-on must match that base: a LoRA (a
  trained identity or style), IP-Adapter / FaceID (a reference image steers style or face, like a LoRA
  without training) and ControlNet (locks pose, edges or depth). Filter by base model on Civitai.
- Inpainting fixes hands and artifacts or extends an image. Lama-Cleaner is the quick option.
- Backgrounds are easy: any SDXL model makes good ones from the last message with no extra setup.

1. **From inside ST** (not live-tested): free mode with the character prefix pulled in via `char `, one
   call per label, uploaded straight into the sprite folder:
   `/sd quiet=true edit=false char, smiling, happy, upper body, simple background | /expression-upload label=joy {{pipe}}`.
   `char ` at the start of a free-mode prompt injects the character prefix (verified: sd/index.js:3202-3230).
   `/sd` returns the saved path, and `/expression-upload` fetches any URL (expr/index.js:911-959).
   Without a LoRA the face drifts between calls. Backgrounds are not removed.
2. **Edit one master portrait**: Flux Kontext changes expression or details while keeping the face and pose. The
   hosted service beats `kontext-dev` weights (community, 2025-08).
3. **Animate one master portrait** (WAN image-to-video) and extract frames as expressions. Lein's guide
   points to Incognit0ErgoSum's ComfyUI WAN workflow (Reddit link in the tutorial dump §10). About 16 GB
   VRAM ran it at 360p only, after dependency wrangling (community, 2025-08).
4. **One-click ComfyUI workflow** (`SillyTavern_Expression_Gen.json`, windupharlequin, 2025-07). You set a
   name and prompt, and it loops over a text list of 40+ expression lines (the 28 standard ones plus room for custom
   labels; adding one takes two lines, a name and a prompt), runs FaceDetailer, then Rembg (`u2net_human_seg`) for transparent PNGs.
   It writes `output/<name>/` with an incrementing variant number per re-run, ready to zip and upload.
   It needs, via ComfyUI Manager: tinyterraNodes, comfyui-easy-use, WAS Node Suite, ComfyMath,
   wwaa-customnodes, comfyui-kjnodes, impact-pack + subpack, ComfyLiterals. Example config: PonyXL checkpoint,
   25 steps, CFG 5, Euler/Karras. About 5 min per set on an RTX 3060 Ti. It can start from an existing image. Open question: `WWAA-LineCount`
   may be deprecated (community, 2026-03).
5. **Train a character LoRA.** RickyFromTexas's Kohya_ss walkthrough (2024-04) trains an SDXL LoRA from **10**
   consistent images, each with a caption file (the generating prompt, prefixed with the character's name).
   Settings: instance prompt = name, class `1girl`/`1boy`, ~20 repeats, and an anime regularization set
   (waifu-regularization-3.3k) at 1 repeat. The shared config: network dim 256 / alpha 1, LR 3e-4 Adafactor,
   constant schedule, 10 epochs, batch 1, 1024 px with bucketing, bf16. Training took 5–8 h on an RTX 3080. Every
   epoch is saved, so test several; the last one is not automatically best. The base set's quality caps
   the LoRA: bad hands in, bad hands out. Build the base set with ControlNet (pose/depth/canny), then an IP-Adapter
   or InstantID face pass. Leinstay's figure of "100–300 images" for a LoRA is the other end of the
   community range. Either way, once identity lives in the LoRA, expressions and outfits become prompt edits.
   Put the trigger words in the character prefix. ComfyUI also needs a LoRA loader in the workflow.

## Regex-inserted illustrations (Rivelle, Feb 2025)

Show a pre-made CG in the chat whenever the model names it. There is no extension, just a lorebook and one regex.

1. **Images**: put them in the character folder `data/<user>/characters/<Name>/`, each named exactly after
   a keyword (`smug.webp`, `crying_eyes_closed.webp`). Files there are also picked up as expression sprites
   whenever a name matches a sprite label.
2. **Reply format** (lorebook entries, constant, character-filtered):
   - one entry says every `{{char}}` reply ends with a bracket like `[{{char}}: <one keyword> | *<one-line inner thought>*]`.
     `{{char}}` keeps it per-speaker in groups.
   - one entry lists the allowed keywords for this character. Put the character name in the entry title so each character has its own list.
3. **One regex** (display-only: *Alter Chat Display* = `markdownOnly`, plus *Run On Edit*; labels verified:
   public/scripts/extensions/regex/editor.html:133-154) captures name, keyword and
   thought, and replaces them with HTML such as `<img src="/characters/$1/$2.webp">` plus caption divs. One
   pattern covers every keyword. The guide's attempt at one regex per expression did not scale.
   Display-only matters because the model must keep seeing the raw bracket format in history.
   Test the pattern in the regex editor's test mode, and ask an LLM to write it from a precise spec
   (format, groups, global flag).
4. **Styling**: classes in the replacement render with a `custom-` prefix, e.g. `.char-info` becomes
   `.custom-char-info`. Write CSS against the prefixed name, but don't type the prefix in the replacement
   (verified: public/scripts/chats.js:1920-1933). The guide says `<style>` isn't allowed there. Current ST does
   render `<style>` from message HTML, scoped under `.mes_text` with prefixed selectors (verified:
   chats.js:535-560, public/script.js:1966-1968). Custom CSS or CssSnippets still work.
   **Forbid External Media** is on by default (power-user.js:336), so an off-site overlay image (the guide's
   used an iili.io PNG) or pollinations `<img>` won't load until it is allowed per character or globally.

Caveats (community, 2025-02 to 2025-11): keep the format and regex simple, since weaker models break the
bracket; one report says heavy regex HTML caused infinite loading in a mobile PWA; and every character needs
its own image set and keyword list.

The same pattern (tag in reply → regex → HTML) drives affection meters, stat bars, SMS-style chats and
bilingual name display. See `../../st-scripting/SKILL.md`.

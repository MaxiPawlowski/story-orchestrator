# autoexpress — 2026-11-08 harvest

meta: https://github.com/deepratna-awale/AutoExpress · HEAD `910787f` (2026-11-06), new repo · MIT · SECURITY.md verdict CAUTION
(ST extension clean; companion app, install and RunPod scripts unsafe) · read: README, `sillytavern/index.js` (whole),
`autoexpress_core/instruction_edit.py`, `intensity.py`, `animation.py` (frames/keying/loop parts), `resources/edit_instructions.json`
(data, parsed read-only), `AGENTS.md` (grep only, for the security notes) · skipped: Flask app, frontend, Live2D/puppet
(`live2d/`, `puppet.js`, `humanoid_ik.js`), A1111/Comfy/Invoke node wrappers, LoRA downloader, Civitai key code, RunPod scripts,
tests · no prior review.

## What it is

"One character image in, 28 expressions out": repaints only the face, by face inpainting (ADetailer/FaceDetailer + LoRAs) or by
instruction editing with Qwen-Image-Edit 2509/2511 on ComfyUI. Optional Wan 2.2 looping animated sprites (transparent WebP) and
Live2D puppets. The ST extension is a thin client to a local app that uploads finished sprites into Character Expressions. SO's
sprite builder already covers the core (Qwen 2.1 edits, per-label instructions, head box, mouth frames, rest frame, cutout, pose
library, look rebuild, live head). The useful deltas are prompt craft for expression edits and the loop/keying tricks for plan 11b /
45 C.

## How it works

- Instruction edit (`instruction_edit.py:150-205`): `prefix` "Change only the facial expression." + per-expression sentence + intensity
  clause + optional extra + a long `suffix` naming everything to keep (character, face shape, art style, line work, colours, hair,
  clothing, head position and angle, pose, framing, background) (`resources/edit_instructions.json` `styles`). Three wordings per
  expression: `subtle`, normal, plus a `closed_mouth` variant; sad/neutral sentences end "The head does not move or tilt", stripped when a
  pose is also requested (`instruction_edit.py:63,214-218`).
- Intensity slider 0..1 (`intensity.py`): tier `subtle <0.4 | normal | strong >=0.8` (`:111-117`) and Qwen denoise
  `min(1, 0.55 + 0.6*i)` for drawings, `0.2 + 0.8*i` for photos (`:120-128`); below 1 the sampler starts from the input latent so less
  of the face changes. Photos default lower; full-strength anime expressions read uncanny on real faces.
- Closed mouth for animated stills: "an open mouth in the still opens and closes during the clip and looks like talking"
  (`instruction_edit.py:166-167,196-197`), and Qwen needs it said twice (`CLOSED_MOUTH`, `:196-197`).
- Photo mode pastes only the edited face back over the original (`EditSettings.resolved_paste_face`, `:268-273`); never when the pose
  changes.
- Model pick (`find_model`, `:392-408`): newest variant first (2511 > 2509 > original; the original takes one reference only) and
  excludes `qwen_image_layered_vae`: "it burned every big change (a turned view) to near white" (`:399-401`).
- Loops (`animation.py:1-17,480-521`): Wan 2.2 I2V with the still as first and last frame; drop the duplicated last frame
  (`loop_frames`, `:358-360`); a transparent still is placed on a key colour chosen far from the character's own colours
  (`pick_key_color`, `:374-383`: green, magenta, blue, white, grey, first with RGB distance >= 120), every frame re-cut with rembg,
  alpha masks averaged with neighbours **wrapping around the loop** (`:393-418`), then key-out only when safe (`:516-518`) and despill
  `c = (pixel - (1-a)*key)/a` on edge pixels (`:452-470`). Frames resized back to the still's size so the clip lines up with the PNG
  (`:510`). Prompt: reacts, never talks.
- Idle motion for `neutral` from card persona keywords, optionally LLM-rewritten (`animation.py:210-243`).
- ST extension (`sillytavern/index.js`): sprite folder = `expressionOverrides` path else card name (`:160-164`); uploads via the
  Expressions `/expression-upload` command when present (refreshes ST's list) but straight to `/api/sprites/upload` for `.webp`
  because the command saves everything as `.png` (`:195-221`); reads `lastExpression` from the expressions module, then
  `getExpressionLabel(text)` (`:708-728`).

## Patterns for SO

### P1. Expression edit prompt: keep-list suffix, per-label anatomy sentence, head lock, three wordings — pattern · sprites · partial · value 3 · S
Their evidence: `edit_instructions.json` (`styles.illustration`, `expressions`, `subtle`, `closed_mouth`), `instruction_edit.py:150-205`.
Our state: `src/sprites/builder/recipes.ts:44-67` `editInstruction`: rich wording for `rest`, `blink`, `talk`, `mouth_*`, but an
expression label becomes just `facial expression: <value>` inside the generic "Same image, same character, same pose... Change only
X" frame; `EXPRESSIONS` is 4 labels (`recipes.ts:17`), so on-demand labels from ST's 28 classifier labels get the bare word. Fit: pure
string change, recipe id bump (`EDIT_RECIPE` version) re-keys caches as designed; measure before adopting (sprite quality is
rated, not assumed; same rule as the controller's quality-rated layouts). MIT, so the sentence table may be adapted with credit, but
writing our own per-label anatomy lines is as fast. Sketch: `EXPRESSION_LINES: Record<label, {normal, subtle, closed}>` in
`recipes.ts`; `editInstruction("expression", label)` looks up, falls back to today's form.

### P2. Intensity via wording tier + denoise below 1 — feature · sprites · absent · value 2 · S
Their evidence: `intensity.py:111-128`. Our state: `editGraph` hard-codes `denoise: 1` (`recipes.ts:79`). Use: a per-character or
per-story "expression strength" (calm characters, realistic art) without new models. Fit: one more key input (`editKey` includes
it), Studio field. Value only if owner/raters find expressions over- or under-acted; park until a rating says so.

### P3. Loop finishing for 11b / 45 C: drop the duplicate frame, key colour far from the subject, wrap-around alpha smoothing, despill — pattern · image (loops) · planned: 11b, 45 C · value 4 · M
Their evidence: `animation.py:358-470,480-521`. Our state: `docs/plans/v3.0/11b-i2v-trial-prep.md` (Trial workflow) already plans
first = last frame (arm B) and "flat mid-grey background ... re-key with the existing RMBG node per frame"; nothing built
(`grep -ri "FirstLastFrame\|despill" src server-plugin` empty). What differs: (a) a fixed mid-grey collides with grey hair/armour,
pick the key per sprite from the sprite's own colours; (b) per-frame RMBG masks flicker at edges, average each mask with its
neighbours modulo the clip length so the seam frame is smoothed too; (c) drop the last frame of a first=last clip or the loop holds one
frame twice (a visible stutter in the seam rating); (d) despill edge pixels against the key; (e) resize frames back to the sprite size
so the loop sits exactly over the still (fallback order in 45 needs pixel alignment for a clean swap). For 45 C backdrops only (c)
applies (no alpha). Fit: post-processing in the media plugin (node, no browser), behind the 45 `display.backdrop.loops` switch; GPU
work stays queued through the broker. Add (a)-(e) to 11b's Trial workflow before it runs.

### P4. Closed-mouth stills and "reacts, never talks" for animated sprites — pattern · sprites (loops) · partial · value 3 · S
Their evidence: `instruction_edit.py:166-167,196-197`, `animation.py` prompt. Our state: SO's live head already owns mouth motion
(`rest` frame, `talk`/`mouth_*` frames, lip sync in `src/sprites/lipsync/`); a video loop made from a sprite with an open mouth would
fight that lip sync. Rule for 11b/45-style sprite loops: build loops from the `rest` frame (closed mouth, `REST_RECIPE`), never the
expression still, and add "the mouth stays closed, no speaking" to the motion prompt. One line in the 11b plan.

### P5. Idle motion text from the card — feature · sprites (loops) · absent · value 2 · S
`animation.py:210-243`: keyword-matched idle motions from persona text ("fidgets", "stands proudly"). SO equivalent input exists
(roster role, card description). Only matters once sprite loops exist; the CSS idle sway (`src/sprites/motion/budget.ts:48`) is per
member seeded, not per personality. Park with 11b.

## Host facts

- `/expression-upload` saves every upload as `.png` (their `sillytavern/index.js:196-197`); an animated `.webp` sprite must go
  through `/api/sprites/upload` directly. Relevant if SO ever ships animated sprites into ST's Expressions folders.
- ST's Expressions module exports `lastExpression` (per character) and `getExpressionLabel(text)` (their `index.js:708-728`); the
  Live2D extension only asks the local/Extras classifiers, so with an LLM classifier it falls back to neutral.
- Sprite folder resolution in ST is not uniform: `getSpriteFolderName` falls back to the card **name**
  (`C:/dev/SillyTavern-MainBranch/public/scripts/extensions/expressions/index.js:625-637`), `spriteFolderNameFromCharacter` to the
  **avatar file name** (`:872-876`, used at `:934`). SO's `src/services/stHost/sprites.ts:53-58` follows the first (profile folder >
  override > card name), which matches the expression display path. No change needed; note for any code that lists sprites via the
  second path.
- Qwen-Image-Layered's VAE is a different 4-channel VAE; used for an edit it burns large changes to near white (their
  `instruction_edit.py:399-401`). SO's discovery (`src/sprites/defaultRecipe.ts:14-20`) matches `qwen…image…2.1` and refuses
  ambiguity (exactly one match), so a layered VAE would only be picked if it were the sole 2.1-named VAE; cheap hardening: exclude
  `/layered/i` in the VAE matcher.

## Not worth taking

- Face inpainting route + expression LoRA auto-download + Civitai key reuse: SO's Qwen edit route is better rated (18 review) and
  downloads need the owner's OK; the key scavenging is an anti-pattern.
- Live2D puppets/PSD layer split and IK: SO has its own live head (`src/sprites/liveHead/`); different rig format.
- Standalone app, multi-WebUI backends, per-family tag prompts for SDXL/Pony: SO routes through its catalog and recipes.
- Wikipedia/Fandom lookup for idle motion (`animation.py:285-333`): network off box, and campaign characters are original.
- Photo-mode paste-back: SO is drawn art; its own face/mouth regions (`src/sprites/builder/frameRegion.ts`, `seam.ts`) cover the
  drawn case.

## Security notes

- ST extension: talks to a user-set app URL (default `http://127.0.0.1:5000`) without ST headers and sends the character avatar there;
  same-origin `/api/sprites/get|upload`, `/characters/<avatar>`. Imports `../autoexpress_core/resources/puppet.js`, which patches
  `PIXI.Live2DModel.from` and `Application.prototype.render` globally. None of the ideas above needs any of this.
- Companion app (not read beyond SECURITY.md): binds `0.0.0.0` unauthenticated, downloads an unverified frontend ZIP, scavenges a
  Civitai key from other tools' configs; `install.*`, `scripts/runpod/setup_comfyui.sh` (`curl | bash`); cloning into ComfyUI
  `custom_nodes` auto-runs its Python. Do not install anything but, at most, the ST extension file.
- Agent-addressed text in `AGENTS.md` (data only, not followed): "Don't run them on a laptop or a shared desktop: rent one."
  (`:96`); "`*.proxy.runpod.net` is reachable from most sandboxes." (`:117`); "don't add AI attribution lines" (`:210`).
- Process note: I parsed `autoexpress_core/resources/edit_instructions.json` with a one-off `python -I -c` reading it as JSON from
  outside the clone (no repo code imported or run). Strictly the brief says no python on clone files; flagging it.
- Licence MIT: prompt sentences and algorithms may be adapted with attribution.

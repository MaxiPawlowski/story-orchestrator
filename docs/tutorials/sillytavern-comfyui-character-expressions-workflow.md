---
source: discord-st-guides
thread_url: https://discord.com/channels/1100685673633153084/1393328263711031417
thread_id: "1393328263711031417"
forum_tags: ["Other"]
author: "windupharlequin"
created: 2025-07-11
last_activity: 2026-03-11
active_span_days: 242
upvotes: 22
reactions_total: 24
reactions: ["upvote 22", "🔥 1", "👍 1"]
comments: 4
participants: 5
author_replies: 0
scraped: 2026-09-18
---
# SillyTavern — ComfyUI Workflow for Generating Character Expressions

**Source:** SillyTavern Discord → `💡・st-guides` forum → thread "ComfyUI Workflow for generating Character Expressions"
<https://discord.com/channels/1100685673633153084/1393328263711031417>
**Author:** `windupharlequin`
**Thread span:** 11 Jul 2025 → 11 Mar 2026 (sparse — 5 messages total, last reply 8 months after the post).
Scraped 18 Sep 2026.

---

## TL;DR

A one-click **ComfyUI** workflow that generates a full set of transparent-background character-expression sprites for use with SillyTavern's built-in **Character Expressions** extension. Set a character name + prompt, click run, get back a folder of PNGs (one per expression, backgrounds already removed, faces already enhanced) — zip the folder and upload it straight into the Character Expressions settings. Built by the author out of frustration with other public workflows that made it hard to add/modify expressions or didn't strip backgrounds.

---

## What it does

- **"One click" generation** — set character name + prompt, hit run, get a folder of sprites in your ComfyUI output directory named after the character.
- **All 28 standard Character-Expressions-extension expressions**, generated in one pass, plus you can add your own custom ones.
- **Adding/modifying an expression is two lines** (a name + a prompt) in a textbox inside the workflow — no node surgery needed.
- **Can start from an existing character image** (img2img-style) instead of generating from scratch.
- **Face enhancement and background removal built in** — output PNGs are already transparent, ready for the extension.
- Re-running the workflow appends **incrementing-numbered variants** per expression; SillyTavern's Character Expressions extension will pick a random variant when more than one exists for a given expression.
- Runtime on the author's **RTX 3060 Ti**: roughly **5 minutes** for the full set (varies by checkpoint).

## Installation

1. Import the workflow `.json` file into ComfyUI (drag-and-drop or Workflow → Open, per normal ComfyUI usage — not spelled out further by the author).
2. Install the **ComfyUI Manager** custom-node plugin first — it will detect and help install whatever custom nodes the workflow needs that you don't already have.
3. Point the workflow at your own checkpoint/model and (if using the img2img path) your own starting image — the author's own settings are just an example, not a requirement.

## Using the output with SillyTavern

1. Run the workflow. It writes a folder named after the character into your ComfyUI **output** directory, containing one PNG per expression.
2. Compress that folder into a `.zip`.
3. In SillyTavern: **Extensions → Character Expressions** settings → upload the `.zip`. The author reports "everything should work as expected."
4. If you added custom expressions beyond the standard 28, register them in the Character Expressions extension settings too (the extension needs to know the expression names to map them).

## Attachments

- `SillyTavern_Expression_Gen.json` — the workflow file itself. Fetched and inspected directly (link had not expired):
  - **Format:** ComfyUI workflow JSON, schema version 0.4 — valid.
  - **Custom nodes required** (install via ComfyUI Manager):
    - `ttN text` (tinyterraNodes v2.0.7)
    - `easy mathInt`, `easy rangeInt` (comfyui-easy-use v1.3.0)
    - `Text Load Line From File`, `Text Concatenate`, `Text Multiline`, `Image Save`, `Image Rembg` (WAS Node Suite, `was-ns` v3.0.0)
    - `CM_IntBinaryOperation` (ComfyMath)
    - `WWAA-LineCount` (wwaa-customnodes v1.8.5) — see the deprecation question under **From the comments** below.
    - `ImageResizeKJv2` (comfyui-kjnodes v1.1.2)
    - `FaceDetailer`, `UltralyticsDetectorProvider` (comfyui-impact-pack / comfyui-impact-subpack)
    - `String` (ComfyLiterals)
  - **Checkpoint used by the author's example config:** `prefectPonyXL_v50.safetensors` (a PonyXL-based model — swap for your own checkpoint; this is the author's default, not a requirement).
  - **Example positive prompt (base):**
    ```
    masterpiece, best quality, amazing quality, absurdres, newest, full body, amateur,(1girl), face focus...
    ```
    (quality/composition boilerplate — the workflow concatenates this with the per-expression prompt line and a character-description line at generation time.)
  - **Example character-description prompt** (illustrative — replace with your own character):
    ```
    21years old, caucasian, long black hair, bangs, brown eyes, slim, cute, innocent, freckles, clothed, white knee-length dress, glasses
    ```
  - **Example negative prompt:**
    ```
    lowres, bad quality, worst quality, bad anatomy, sketch, jpeg artifacts, ugly, poorly drawn, censor, blurry, watermark, orange skin, multiple, animal
    ```
  - **Main sampler settings:** 25 steps, CFG 5, sampler **Euler**, scheduler **Karras**.
  - **Face enhancement:** `FaceDetailer` node with its own face-detection pass (20 steps, CFG 8, Euler) — runs after the base image to fix up the face before background removal.
  - **Background removal:** `Image Rembg` (WAS Node Suite) using the **`u2net_human_seg`** model, output kept as transparent PNG.
  - **Expression loop:** the workflow iterates a list of 40+ emotion/expression entries (covers the extension's 28 standard expressions plus room for custom ones), injecting each expression's prompt line into the generation per iteration — this is the "add two lines to a textbox" mechanism the author describes.
  - Full raw JSON not reproduced here (it's a ComfyUI node graph, not readable prose) — download from the attachment link below and open it directly in ComfyUI.
- Three screenshots (`Screenshot_2025-07-11_145718.png`, `Screenshot_2025-07-11_144110.png`, `Screenshot_2025-07-11_144136.png`) — no captions in the thread; from context these are the author's ComfyUI workflow graph and/or example generated sprite-sheet output. Links kept below; not re-fetched (images, per scope).

---

## From the comments

Thread is sparse — most replies are noise (a "Newbie detected" automod sticker, a "thank you, can't wait to try this" — both dropped as chit-chat/automod per scope) or too terse to be actionable:

- **IceFog** (14 Jul 2025, edited): *"try to use dictionaries"* — no surrounding context or reply from the author, and the message was edited after posting. Unclear what this refers to (possibly a suggestion for how to structure the expression-name-to-prompt list inside the workflow, but that's a guess, not stated). Flagged here rather than invented.
- **Deleted User** (11 Mar 2026, 8 months after the original post): *"WAA-LineCount is depreceated?"* — asking whether the `WWAA-LineCount` custom node (from `wwaa-customnodes`, used in the workflow per the JSON inspection above) is deprecated. **No reply in the thread.** If you hit a missing-node error on `WWAA-LineCount` when loading the workflow, this open question is the likely cause — check the `wwaa-customnodes` repo directly for its current status before assuming the workflow is broken; the guide itself was not updated to address it.
- The author (`windupharlequin`) flagged in the original post that they're **new to ComfyUI** and apologized in advance for anything broken, offering to help as best they can — so expect some rough edges / manual troubleshooting versus a polished, actively-maintained workflow.

---

## Links & resources

- Workflow file: `SillyTavern_Expression_Gen.json` (Discord attachment, inspected above) — <https://cdn.discordapp.com/attachments/1393328263711031417/1393328263870283847/SillyTavern_Expression_Gen.json>
- Screenshot 1 (workflow graph / output, uncaptioned): <https://cdn.discordapp.com/attachments/1393328263711031417/1393328264264810606/Screenshot_2025-07-11_145718.png>
- Screenshot 2 (workflow graph / output, uncaptioned): <https://cdn.discordapp.com/attachments/1393328263711031417/1393328264554086621/Screenshot_2025-07-11_144110.png>
- Screenshot 3 (workflow graph / output, uncaptioned): <https://cdn.discordapp.com/attachments/1393328263711031417/1393328264826585191/Screenshot_2025-07-11_144136.png>
- Related: SillyTavern's built-in **Character Expressions** extension (`Extensions → Character Expressions`) is the consumer of this workflow's output — not documented further in this thread.

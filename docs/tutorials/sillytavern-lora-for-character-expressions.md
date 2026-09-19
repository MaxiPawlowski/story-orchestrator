---
source: discord-st-guides
thread_url: https://discord.com/channels/1100685673633153084/1232406331210858556
thread_id: "1232406331210858556"
forum_tags: ["Character Creation"]
author: "RickyFromTexas"
created: 2024-04-23
last_activity: 2024-09-17
active_span_days: 146
upvotes: 19
reactions_total: 19
reactions: ["upvote 19"]
comments: 53
participants: 11
author_replies: 39
scraped: 2026-09-18
---
# Ten Step (ish) Guide for Creating a LoRA for SillyTavern Character Expressions

**Source:** SillyTavern Discord → `💡・st-guides` forum → thread "Ten Step (ish) Guide for Creating a LoRA for Silly Tavern Character Expressions"
<https://discord.com/channels/1100685673633153084/1232406331210858556>
**Author:** `RickyFromTexas`
**Thread spans:** 23 Apr 2024 → 17 Sep 2024. Scraped 18 Sep 2026.

---

## TL;DR

A walkthrough for training a **character LoRA in Kohya_ss** from just 10 source images, so that SillyTavern's expressions feature (and image generation in general) can render one consistent-looking OC across many poses/emotions/outfits, instead of drifting off-model each generation. Aimed at people already comfortable with Stable Diffusion and the concept of LoRAs — this is the "how to actually run the training" part, not an SD primer. The LoRA does the heavy lifting of character consistency; once trained, changing expression, outfit, or scene is just a prompt/strength tweak.

---

## 1. Preparation

### Prep Step A — Create 10 training images
- Generate/curate **10 images** of your character in Stable Diffusion, all reasonably consistent (face/outfit).
- Put them all in one directory — author used `D:\AI_Stuff\LORATraining\KatherineV1\Images`.
- Resolution: author used **1024×1024** and **1024×1536**.

### Prep Step B — Caption the 10 images
- Same directory as the images.
- A caption file is a plain **text file containing the prompt used to create that image**.
- Every image needs a matching caption `.txt` file with the **same base filename** (e.g. `Katherine01.png` ↔ `Katherine01.txt`).

### Prep Step C — Caption format
Example caption for `Katherine01.png`:
```
1girl, arms up, serious, closed mouth, palms, dark purple hair, long hair, blue eyes, dark jacket over white shirt, shirt tucked in, long sleeves, pencil skirt, pantyhose, rooftop, blue sky, clouds
```
**Prepend the character's name** to every caption:
```
Katherine, 1girl, arms up, serious, closed mouth, palms, dark purple hair, long hair, blue eyes, dark jacket over white shirt, shirt tucked in, long sleeves, pencil skirt, pantyhose, rooftop, blue sky, clouds
```
Every image in the set needs its own caption file with this pattern.

### Prep Step D — Install Kohya
Download/install **Kohya_ss**: <https://github.com/bmaltais/kohya_ss>

### Prep Step E — Download regularization images
- Regularization images are the comparison/contrast set used during training (separate from your 10 training images). More and better regularization images generally means a better LoRA.
- Source used: <https://huggingface.co/datasets/waifu-research-department/regularization/tree/main>
- Download and unzip **`waifu-regularization-3.3k.zip`** if training a female character.
- Author put the extracted folder at `D:\AI_Stuff\LORATraining`.

### Prep Step F — SDXL base config
Download the **`SDXL.json`** Kohya config file (attached to the thread) as your starting-point parameter file for the LoRA tab.

**Retrieved contents (training-relevant fields; full file is a Kohya LoRA config, not reproduced key-for-key):**
| Setting | Value |
|---|---|
| Model type | SDXL LoRA (Standard) |
| Network Dimension | 256 |
| Network Alpha | 1 |
| Learning rate (TE & UNet) | 0.0003 |
| Optimizer | Adafactor, args `scale_parameter=False relative_step=False warmup_init=False` |
| Scheduler | Constant, no warmup |
| Epochs | 10 |
| Batch size | 1 |
| Max resolution | 1024×1024 |
| Bucketing | Enabled, 256–2048px, 64-step increments |
| Mixed precision | bf16 |
| Gradient checkpointing | Enabled |
| Cache latents | Enabled, to disk |
| VAE half precision | Disabled |
| xformers | Enabled |
| Save format | safetensors, bf16 |
| Save frequency | Every epoch |
| Color/flip augmentation | Disabled |

---

## 2. LoRA training in Kohya_ss

**Step 1 — Click the LoRA tab in Kohya.**

**Step 2 — Expand "Configuration file" and click "Open".**

**Step 3 — Load the `SDXL.json` parameters file** (from Prep Step F).

**Step 4 — Select your model.** Click "Select File" and pick your favorite SDXL base model.

**Step 5 — Go to the "Dataset Preparation" tab** and fill in:
| Field | Value / guidance |
|---|---|
| **Instance Prompt** | Character's name — this name must also appear in your caption files. Author used `Katherine`. |
| **Class Prompt** | `1girl` for a female character, `1boy` for a male character. |
| **Training Images** | Path to your 10 images + captions from Prep Step A/B. Author used `D:\AI_Stuff\LORATraining\KatherineV1\Images`. |
| **Repeats** (training images) | Author used `20`. |
| **Regularization Images** | Path to the unzipped regularization set from Prep Step E. Author used `D:\AI_Stuff\LORATraining\waifu-regularization-3.3k`. |
| **Repeats** (regularization images) | Leave at `1`. |
| **Destination Training Directory** | Where Kohya creates the `img`/`log`/`model`/`reg` subfolders — put it alongside your training images. Author used `D:/AI_Stuff/LORATraining/KatherineV1`. |

**Step 6 — Click "Prepare Training Data".**
This creates the folder structure (`img`, `log`, `model`, `reg`) inside the destination training directory.

**Step 7 — Click "Copy info to Folders Tab".**

**Step 8 — Navigate to the Folders tab** (to confirm the copied paths).

**Step 9 — Set "Model output name".**
Author named the output `KatherineV1` (matching the character/version).

**Step 10 — Click "Start Training".**

---

## 3. Final notes from the author

- **Training time is hardware-dependent.** On an RTX 3080, training generally took **5–7 hours**, depending on how many base images were used. In the author's own run it took **almost 8 hours**.
- **Getting the 10 base images consistent is the hard part.** Use every tool available to make the base set as clean/consistent as possible — quality of inputs directly determines quality of the LoRA output (e.g. bad hands in training images → bad hands out of the LoRA).
- Tools the author uses to build consistent base images:
  - **ControlNet** — Canny, Depth, OpenPose, Reference Only, InstantID. Recommended flow: get the composition right first, then do a final **InstantID inpaint on the face** for facial consistency.
  - **PosemyArt** (<https://posemy.art/>) — posable 3D models; can export Canny/Depth/OpenPose maps directly.
  - **Photoshop** — manual fixes for glitches, depth maps, canny outlines; getting things right up front reduces post-LoRA cleanup.
- Author floated doing a follow-up tutorial specifically on the base-image-creation method "if there is demand for it" — no evidence in the thread that this follow-up was ever posted.

---

## 4. Training output & using the LoRA

- With **10 epochs** configured, Kohya produces **10 LoRA checkpoints** (one per epoch, each built on the last) — not just one file. The final epoch isn't automatically the best one; **try several of the generated LoRAs** to see which fits best.
- All generated LoRAs land in the **model** subfolder of your destination training directory.
- Author's test used the 10th checkpoint, `KatherineV1.safetensors`.
- Tested in **A1111**: drop the `.safetensors` into your `models/Lora` folder; it then shows up in A1111's LoRA tab.

### Results reported by the author
- **"Approval" emotion:** good likeness and clothing straight away; author noted LoRA strength might need turning down slightly.
- **"Fear" / scared:** good results after a small LoRA-strength adjustment and prompt tweaks.
- **Outfit changes** (e.g. Captain America cosplay) worked well with the LoRA carrying character identity.
- **Seasonal / themed expressions** also worked.
- Overall conclusion: once the LoRA is handling character consistency, swapping expressions is comparatively easy, and results can likely be refined further with more tinkering.
- Generated images went through **1024×1024** generation for these tests.

---

## From the comments

### Getting a stable, consistent set of first-10 images
This is the most-asked question in the thread (`Z Games`: *"how can I get the first 10 images with a stable output that always output the same face and clothes"*).

- **Damogran:** Use **ComfyUI** with 2 ControlNets (pose or canny, and depth) plus 1 **IP-Adapter** to style the results. Follow-up tip for ComfyUI beginners: don't start from complex downloaded workflows — build up from a basic txt2img graph, watch YouTube ControlNet-in-ComfyUI videos, and add nodes incrementally on top of a workflow you already understand, rather than fighting someone else's "spaghetti."
  - **TNighthawk** pushed back mildly: dissecting complex existing workflows can itself be a good way to learn techniques beyond what you'd design yourself — presented as a matter of preference, not a correction.
- **Ninjastahr** (posted much later, explicitly labeled as a hacky alternative, "probably not the right way" but it worked): in A1111, generate a few images, lock in a seed you like, then use the **"Extra" checkbox with added variation** to produce near-matches. Separately wrote a small Java program to generate ~1,000 varied prompts (different clothing/locations/etc.), batch-generated all of them, then manually filtered down to the ~10 best that shared the desired traits. Followed up days later confirming the guide as a whole "100% worth it" even taking this shortcut for the image-gathering step.

### Regularization images for non-anime styles
- **SpiderBill** asked whether regularization image sets exist for non-anime styles. **No answer is recorded in the thread** — treat as open/unresolved.

### Hardware compatibility
- **directedenergy89** asked whether this works on **AMD GPUs on Windows**. **No answer is recorded in the thread.**

### General reception
- Multiple users (`gobby`, `RossAscends`, `Youshedo`) praised the guide as clear, high-quality, and easy to follow. `RossAscends` (SillyTavern maintainer) called it a guide-quality bar other guide authors should aim for.

---

## Links & resources

- Kohya_ss (LoRA training GUI): <https://github.com/bmaltais/kohya_ss>
- Regularization image dataset ("waifu-regularization-3.3k.zip", anime-style): <https://huggingface.co/datasets/waifu-research-department/regularization/tree/main>
- PosemyArt (posable 3D reference models, exports Canny/Depth/OpenPose): <https://posemy.art/>
- `SDXL.json` — Kohya LoRA training config starting point (Discord attachment, contents summarized in §1 Prep Step F).
- Kohya screenshots for each of Steps 1–10 (Discord attachments, UI walkthrough images) — not reproducible here; refer to the live thread if you need the exact screenshots.
- Result/example images (approval, fear, cosplay, seasonal expressions) — Discord attachments illustrating the trained LoRA's output; not reproducible here.
- Third-party demo referenced by the author as "an example of how you can achieve a high level of consistency using a LoRA for expressions" — link text in the source was a broken/placeholder Discord mention (`*desconocido*`), no resolvable URL captured.
- Hanako's Sorcery-adapted SD script mentioned in an unrelated cross-referenced guide is **not part of this thread**; omitted.

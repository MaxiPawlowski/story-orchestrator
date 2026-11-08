# Illustrations

## The default: SillyTavern's own image service

In **Settings → Images & stage**, choose **Use SillyTavern Image Generation settings**. Configure a source in ST's own Image
Generation extension, then use **Test render** in an open group chat. Its saved image appears as a separate message.
Nothing else needs installing for this route.

The optional **Image-prompt model** picker uses Connection Manager. Leave it empty for a template built from the
current public scene and appearance details. It never switches your reply profile.

New installs draw automatically only at story-authored moments. Every-N automation is opt-in
(**Settings → Features → Illustrations → When to draw**, or for one chat on **This chat → Story settings**). While no image service
is ready (ST's Image Generation is not set up, or its ComfyUI is stopped), automatic pictures are skipped without an
error and Setup says why; Test render explains which step is missing.

## Automatic scene pictures from prepared looks

**How automatic scene pictures are drawn** (`image.automaticRoute`, under **Images & stage**) picks the route for each
automatic scene picture (story moments and every-N replies; manual pictures, portraits and backgrounds are unchanged):

- **Auto** (default): when every character the picture shows (one or two) has a prepared current look, either from a visual pack
  or from the character's accepted base and bust, and a Qwen 2.1 edit route resolves (a builder entry, `sprites.sceneRecipe`, or the
  one discovered Qwen model set), the picture is drawn from those reference images, like **Illustrate prepared cast**. The image-prompt
  model then also writes a plain-language instruction (what happens, poses, the place); the instruction adds the current look, the
  current place's name and description, and asks for a pose that fits the action instead of the reference's standing pose. A bound
  place plate is added as one more reference image when ComfyUI's Qwen text encoder offers the extra input. Anything else (three or
  more people, the player persona, a look still being prepared, no Qwen files, ComfyUI unreachable) draws through SDXL as before.
- **Always SDXL**: tags only, the earlier behaviour.
- **References only**: draws from reference images or not at all.

Every picture records which route drew it and why (`image_director.route`), and how long it waited for the text model to finish
(`idle_wait_ms`). A picture always lands on the reply that cued it, never on whatever message is last. Pictures start only once no
reply or chained voice is pending, and hand the GPU back if you send before the render starts. Reference pictures take the shape of
the first character's reference image; the shape the image-prompt model asked for is recorded, not applied. Auto is still being
compared with SDXL in a blind pilot; choose **Always SDXL** if you prefer the earlier pictures.

## Story workflows (SillyTavern's ComfyUI source)

If SillyTavern's Image Generation uses **ComfyUI**, a story can name which of your ComfyUI workflows draws each picture
type: portraits through a face-detailer workflow, backgrounds through a wide landscape one, a finale in a painted style.
The author maps them in Studio (**Story → Illustrations → Workflows**, and **Picture workflows** on a turning point).

- The story's workflow is used for that one picture only. Your own selected workflow comes back right after it, and
  Story Orchestrator never saves a change to your Image Generation settings. If you change the workflow yourself while
  a story picture renders, your choice is kept.
- A workflow you do not have, a source other than ComfyUI, or a workflow without a `"%prompt%"` placeholder: the
  picture uses your own workflow, and Setup says which one is missing.
- A story can carry its workflows (**Export with workflows**). **Install in SillyTavern** in Studio shows the node
  classes and model files each one uses, adds it under a new name if yours already has that name, and never overwrites
  one of yours. Workflows with nodes that can run code, read files, or take a path, folder, URL or file name are
  never installed from a story, and Story Orchestrator never installs custom nodes or models.

## Advanced ComfyUI recipes

Choose **Advanced ComfyUI recipes** to let Story Orchestrator build the ComfyUI graph itself. Install the optional
media plugin for owned render jobs and sprite edits:

`npm run plugin:install -- --with media`

Restart SillyTavern after installation. The plugin talks to the ComfyUI address set in ST's Image Generation settings;
a `comfyUrl` in the plugin's `config.json` overrides it, and without either it uses ComfyUI's default
`http://127.0.0.1:8188`. The same file holds the model roots used for fingerprints. See the
[media plugin README](../../../server-plugin/story-orchestrator-media/README.md). Reuse your existing model folders; the plugin never copies or moves
model weights, and downloads one only when you confirm it (below). Without the plugin this route draws nothing, and Setup says so.

### Picking models

Each picture type (scene, character, portrait, user, background, free) has a **recipe family**, SDXL · Illustrious or
SDXL · NoobAI, which sets the sampler, steps and quality words. Press **Discover installed image models**, then either
choose a model for the type or leave **Model** on automatic:

- exactly one installed model is recognised as that family: it is used;
- none or several: no picture is drawn and Setup shows a row naming the picture type, until you choose one.

A file name alone does not prove a model's architecture, so choose the family that matches the model you map.
Backgrounds use the SDXL wide shape with "no humans, scenery" added. FLUX is not supported.

Models known to work with these recipes, if you need one (download them yourself; nothing is fetched for you):

| Family | Model |
|---|---|
| SDXL · Illustrious | WAI-illustrious-SDXL v17 (`waiIllustriousSDXL_v170`) |
| SDXL · NoobAI | JANKU v7.77 (`JANKUTrainedChenkinNoobai_v777`), with its lazypos/lazyneg embeddings |

Hires uses an installed upscaler: the only one installed, else the only one with "anime" in its name; otherwise
hires is refused with a reason. Embeddings a recipe names are dropped when ComfyUI does not have them.

## Downloading models (Civitai, Hugging Face)

With the media plugin installed, **Settings → Images & stage → Model sources** downloads a model you are missing into
your own model folders. It is admin-only, because it writes to the server's disk.

1. Save a **Civitai token** and/or a **Hugging Face token** (needed for many Civitai files and for gated Hugging
   Face repositories). They go into SillyTavern's secrets; the page only shows "set" or "not set" afterwards, and
   **Test** asks the provider whether it accepts the token. The Hugging Face slot is SillyTavern's own, shared with its
   other Hugging Face features.
2. Enter a Civitai model version (its version number from the link, or the whole link) or a Hugging Face repository
   and file, then **Check**. The card shows the file, its size, the source, a license link, an adult-content flag when
   the source sets one, the folder it goes into and the free space there.
3. Press **Download**. Progress shows below; **Stop** keeps the partial file, and the next download of the same file
   resumes from it.

What it never does: download on its own (not on import, not at a story start, not from a wizard step); download a file
whose source gives no SHA256; write outside a folder you configured; overwrite a file of the same name; or send your
token to any host other than the provider's own. Only `.safetensors` and `.gguf` are downloaded (`.ckpt`, `.pt` and
`.bin` can run code when loaded; an admin can allow them with `downloads.allowPickle`).

**Free space.** A download is refused when the folder's drive does not have the file's size plus a 2 GiB margin
free, with the numbers in the message (`downloads.freeMarginBytes` changes the margin). It is checked when you open
the card and again before and during the download.

**Folders.** The plugin's `config.json` `modelRoots` names the folders per kind: `checkpoints`, `loras`,
`upscaleModels`, `embeddings`, `vaes`, `diffusionModels`, `textEncoders`, `textModels`. Point them at the folders your
ComfyUI already reads (its `extra_model_paths.yaml`), so a downloaded model shows up after **Discover installed image
models**. A kind with no folder is refused; no default folder is assumed.

## Backdrop loops

**Display › Backdrop loops** picks how a background still moves, one of four tiers. The default is **Full**, used
when the machine can make it (the media plugin and the three model files below are installed); otherwise the backdrop
falls back to **Still motion** on its own.

| Tier | What you see | Cost |
|---|---|---|
| Off | the still, with the backdrop's other layers | none |
| Still motion (cinemagraph) | the sky and water of the still drift and ripple in the browser, using the depth sky/water mask; no video model | free, instant |
| Lite | a short video loop: about 2 s of slow motion at 12 fps, about 670×380, also saved as an animated WebP | about 30 to 70 s per place on an RTX 3090 |
| Full | a video loop: about 4.5 s at 24 fps, about 900×510 | about 2 to 4 minutes per place on an RTX 3090, the model load included |

Still motion is what shows until a Lite or Full loop of the place exists; on a still with no sky or water (most
interiors) it shows nothing. Lite and Full loops are made by your ComfyUI from the still itself, with core ComfyUI nodes
only (no custom node):

| File | Folder ComfyUI reads | Size |
|---|---|---|
| `wan2.2_ti2v_5B_fp16.safetensors` | `diffusion_models` | 9.3 GB |
| `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | `text_encoders` | 6.3 GB |
| `wan2.2_vae.safetensors` | `vae` | 1.3 GB |

All three come from the Hugging Face repository `Comfy-Org/Wan-2.2` (`split_files/...`, Apache-2.0).

- **What is made.** Only what the background's name mentions moves (water, falls, leaves, existing flames, clouds); the
  camera stays still and nobody moves. The loop has the still's exact shape and starts and ends on the still itself, so
  the swap from the still is invisible and the loop has no cut; its colours are matched to the still. An MP4 (H.264)
  of about 0.2 to 2 MB.
- **When.** Places a story marks `loop: "pre"` are queued when the story is set up (never shown before you reach them);
  the background on screen gets one when nothing else needs the GPU: no reply generating, no scene picture or sprite
  running, ComfyUI's queue empty and the chat quiet for 20 s. A reply, a picture or a sprite that starts while a loop
  renders stops that loop at once (only that job, by its ComfyUI id), and it is tried again later; so is a loop that
  another program's ComfyUI interrupt stopped. A loop that fails twice is left alone until the chat or story changes.
  Weather is not part of the loop; the backdrop's rain and snow layers draw it.
- **GPU sharing.** With the GPU plugin a loop takes an image lease, so a local text model is unloaded for it like for a
  large picture.
- **Cache.** Loops are stored in your SillyTavern user folder under `user/images/story-orchestrator-loops/`, named by
  a key of the still's bytes, the model, the prompt and the loop's shape (so Lite and Full are kept apart); the same
  background in any story or chat replays at once. Delete files there to make them again.

## GPU sharing (advanced, optional)

Only a local text model and local image generation on the same graphics card need coordination. The optional GPU
plugin (`--with gpu`) shares the card: replies wait while a picture renders, and the text model comes back after it.
Without the plugin every picture renders uncoordinated, as it would anyway. Setup and modes:
[One GPU for text and images](gpu-sharing.md).

## Privacy

An image prompt goes to the image backend you chose: ST's selected source on the default route, your ComfyUI on the
advanced route. A local source or ComfyUI keeps it on your machine; a cloud source sends it to that provider. An
image-prompt model also receives the current scene's public context, through its own Connection Manager profile.

[Sprite builder](sprites.md) · [Setup](README.md)

# Illustrations

## The default: SillyTavern's own image service

In **Image service**, choose **Use SillyTavern Image Generation settings**. Configure a source in ST's own Image
Generation extension, then use **Test render** in an open group chat. Its saved image appears as a separate message.
Nothing else needs installing for this route.

The optional **Image-prompt model** picker uses Connection Manager. Leave it empty for a template built from the
current public scene and appearance details. It never switches your reply profile.

New installs draw automatically only at story-authored moments. Every-N automation is opt-in. While no image service
is ready (ST's Image Generation is not set up, or its ComfyUI is stopped), automatic pictures are skipped without an
error and Setup says why; Test render explains which step is missing.

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
  one of yours. Workflows with nodes that can run code or read files are never installed from a story, and Story
  Orchestrator never installs custom nodes or models.

## Advanced ComfyUI recipes

Choose **Advanced ComfyUI recipes** to let Story Orchestrator build the ComfyUI graph itself. Install the optional
media plugin for owned render jobs and sprite edits:

`npm run plugin:install -- --with media`

Restart SillyTavern after installation. The plugin talks to the ComfyUI address set in ST's Image Generation settings;
a `comfyUrl` in the plugin's `config.json` overrides it, and without either it uses ComfyUI's default
`http://127.0.0.1:8188`. The same file holds the model roots used for fingerprints. See
`server-plugin/story-orchestrator-media/README.md`. Reuse your existing model folders; the plugin never copies or moves
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

With the media plugin installed, **Images → Image service → Model sources** downloads a model you are missing into
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

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

## Advanced ComfyUI recipes

Choose **Advanced ComfyUI recipes** to let Story Orchestrator build the ComfyUI graph itself. Install the optional
media plugin for owned render jobs and sprite edits:

`npm run plugin:install -- --with media`

Restart SillyTavern after installation. The plugin talks to the ComfyUI address set in ST's Image Generation settings;
a `comfyUrl` in the plugin's `config.json` overrides it, and without either it uses ComfyUI's default
`http://127.0.0.1:8188`. The same file holds the model roots used for fingerprints. See
`server-plugin/story-orchestrator-media/README.md`. Reuse your existing model folders; the plugin does not copy, move or
download model weights. Without the plugin this route draws nothing, and Setup says so.

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

# Images and the GPU plugin

Illustrations are optional. Today they need a **ComfyUI** you run yourself and an **image-prompt model**.

## Basic setup

In **General setup → Image service — this install**:

1. **Image-prompt model**: a Connection Manager profile that turns the scene into an image prompt. Without one, every
   render fails.
2. **ComfyUI URL**: where your ComfyUI listens (default `http://127.0.0.1:8188`).
3. **Default image routes — advanced**: the checkpoint model, quality, aspect, shot and placement per purpose
   (scene, portrait, background). The defaults name specific community models
   (`waiIllustriousSDXL_v170`, `JANKUTrainedChenkinNoobai_v777`, `flux1-dev-fp8`); **change them to models your
   ComfyUI actually has**, or ComfyUI refuses the job.
4. **Automation for all chats**: Manual only, Story-authored moments, Every N replies + story moments, or Model
   requests. **Permit automatic illustrations on this install** switches automation on or off for every chat.

**Known gap**: automatic images default to on (every 5 replies) and there is no check that ComfyUI is reachable. If
you do not run ComfyUI, untick **Permit automatic illustrations on this install**, or each attempt fails quietly.
Making images work with whatever image backend SillyTavern has is planned.

## Who decides what

Three places, three scopes:

- **Install** (**General setup → Image service**): the image-prompt profile, the ComfyUI URL, the automation mode
  and the default route for each purpose. Shared by every chat. Manual images work even when automation is off.
- **Story** (Studio → **Story**): a portable visual style, cast appearances, and whether the story asks for images
  at checkpoint changes or confirmed scene changes. These story cues run only when the install allows automatic
  images and its mode is **Story-authored moments**.
- **Chat** (drawer **Overview → Illustrations — this chat**): pause automation for this chat, change the image model,
  quality or extra direction for this chat, draw on demand, and see queue errors. Image review lets you choose among
  several candidates with keyboard or mouse.

A shared-GPU install can point its local text profiles at the GPU plugin's proxy (below); the image service never
changes the text connection on its own.

## The GPU plugin (advanced, machine-specific)

`server-plugin/story-orchestrator-gpu` exists for **one particular setup**: a single GPU shared between the text model
and ComfyUI, where the text model is **TheDrummer Artemis 31B v1.1 served by Unsloth Studio on port 8888**. It:

- runs a text proxy on `127.0.0.1:18888` that forwards to `127.0.0.1:8888` (your text profiles must be pointed at
  18888 by hand);
- before an image, unloads Artemis through Unsloth Studio's API, lets ComfyUI (`127.0.0.1:8188`) render, then frees
  ComfyUI's memory so text can load again;
- has no configuration: ports and the model name are fixed in the code.

**Do not install it unless that is your machine.** Installed anywhere else, it refuses every image lease, so every
image fails. Without it, images simply run without coordination. `npm run plugin:install` currently installs it along
with the others; remove `<SillyTavern>/plugins/story-orchestrator-gpu` if you do not need it.

---

[Setup](README.md)

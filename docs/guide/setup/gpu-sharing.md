# One GPU for text and images

Only a **local** text model and **local** image generation on the **same graphics card** need this. Cloud and RunPod
reply models do not use your image GPU, and most installs never need it. Without the plugin every picture renders
without coordination, exactly as it would anyway.

## What it does

The optional GPU plugin decides who holds the card's memory. While a picture renders, replies wait; before a picture
starts, the text model is unloaded (or kept, when the picture fits beside it); after the picture, the text model loads
again on the next reply. You install one plugin; no second program, no tray-only controls.

Install it and restart SillyTavern:

`npm run plugin:install -- --with gpu`

Then write `config.json` beside the plugin (`<SillyTavern>/plugins/story-orchestrator-gpu/config.json`). The installer
never overwrites it.

## Choosing a mode

| `adapter` | What the plugin does | When to use it |
|---|---|---|
| `none` (no config) | Nothing. Pictures pass through. | You do not run a local text model. |
| `observe` | Watches a text server **you** start in Unsloth Studio, and unloads it through Unsloth Studio's API before a picture. | You already run your text model in Unsloth Studio. The recommended start. |
| `supervise` | Starts and stops `llama-server` itself, on demand, and optionally ComfyUI. | You run a bare `llama-server` (it has no unload API, so the plugin has to own it), or you want the plugin to own the text server. |
| `managed` | Forwards to an external controller. Kept for one release, then removed. | You still run the older standalone controller. |

### An `observe` example

`observe` needs Unsloth Studio's API (it asks it which model is loaded, whether it is generating, and to unload). A bare
`llama-server` has no such API: use `supervise` for it. Every value below is an example; use your own:

```json
{
  "adapter": "observe",
  "listenPort": 18888,
  "upstream": "http://127.0.0.1:8888",
  "model": "my-model-Q4_K_M",
  "comfyUrl": "http://127.0.0.1:8188"
}
```

- `upstream`: where Unsloth Studio's server listens on this machine (loopback only).
- `model`: the start of the model id Unsloth Studio reports for your loaded text model. The plugin refuses to unload a
  model whose id does not start with it.
- `comfyUrl`: your ComfyUI (loopback only).
- `listenPort`: the plugin's own text address (default 18888).

Then point your reply profile in Connection Manager at `http://127.0.0.1:18888` (the `listenPort`) instead of Unsloth
Studio's own address, and send one reply: the plugin unloads the model only after an authenticated reply has passed
through it. It worked when `http://127.0.0.1:18888/status` answers `"adapter": "observe"`, `"guarding": true` and
`"state": "text-loaded"`, and the **GPU sharing** line in **Settings → Images & stage** says
the text model is loaded. During a picture the state is `image` and replies wait; afterwards the next reply reaches
Unsloth Studio again.

### A `supervise` example

`supervise` starts nothing when SillyTavern starts. The text model loads on the first reply or when an admin presses
**Load text**; when SillyTavern stops, the plugin stops only the programs it started itself, never one you started.

A `supervise` example (every path is yours; nothing is assumed about your machine):

```json
{
  "adapter": "supervise",
  "listenPort": 18888,
  "stateDir": "/srv/story-orchestrator/gpu-state",
  "text": {
    "binary": "/opt/llama.cpp/llama-server",
    "model": "/srv/models/my-model-Q4_K_M.gguf",
    "port": 18889,
    "alias": "local",
    "maxContext": 32768,
    "profiles": { "normal": { "args": ["--ctx-size", "32768", "--n-gpu-layers", "999"] } }
  },
  "comfy": { "url": "http://127.0.0.1:8188", "supervise": false }
}
```

Point your reply profile in Connection Manager at `http://127.0.0.1:<listenPort>` (Text Completion, llama.cpp). The
plugin listens on loopback only, and refuses a config that asks for anything else. A profile's `args` may not set the
host, the port or paths: the plugin binds loopback itself. With `comfy.supervise: true` it also starts ComfyUI from
`comfy.python` and `comfy.root`.

## Memory reserves

The plugin keeps some memory free for your desktop. Without `reserves` in the config it takes 10% of the card's memory
(at least 1 GiB) and 10% of system memory (at least 2 GiB). Set `"reserves": { "gpuMiB": …, "ramMiB": … }` to pin your
own numbers.

## When text stays loaded

Before each picture the plugin reads the card's free memory and system memory, and compares them with what the picture
needs plus both reserves. If the picture fits beside the loaded text model, the text model stays loaded and the next
reply starts at once. If it does not fit, the text model unloads first and loads again for the next reply, which is
where most of the wait after a picture comes from. A large text model on a 24 GB card usually leaves too little room
beside it, so expect a swap there. Without a memory reading the plugin never keeps text beside a picture.

What a picture needs in system memory comes from, in order: what the plugin measured for that picture before, your
own `ramEstimates` in the config, a built-in measured value for the Qwen sprite models (about 8 GiB at 1024×1024), or
an estimate from the model files. To pin your own number for a model set:

```json
"ramEstimates": [{ "id": "my-sprites", "models": ["diffusionModels:my-model.safetensors", "vaes:my-vae.safetensors"], "ramMiB": 7000 }]
```

`text.loadMode` (`none`, `mmap`, `dio`, …) chooses how `llama-server` reads the model file; the status reports each
load's time, so you can compare modes on your own disk.

## What you see

**Settings → Images & stage** shows a **GPU sharing** line while the plugin runs: idle, text model loaded, rendering a
picture, or waiting, and why a picture waits. The plugin's status (`lastResidency`) also says whether the last picture
kept text loaded or swapped it out, and the memory readings behind that. If the text server stops by itself, the line says so: pictures keep
rendering, and replies fail with a reason until an admin loads text again.

Load, unload, automatic, restore and free-image controls are **admin-only** routes under
`/api/plugins/story-orchestrator-gpu/control/…`; any signed-in user can read the status and take an image lease.
A control picks a profile by its id; it never takes a path, a program or an argument.

## Keeping a sprite batch warm

Building several sprites in a row keeps the image model loaded between images, up to three in a row. It is on by
default: the plugin allows it only while nothing waits for text and memory stays above the reserves, and a reply that
arrives mid-batch gets the card after the current image. Set `"retainBatches": false` to turn it off.

## Without the plugin, or when it cannot help

- Not installed, `none`, or ComfyUI not reachable: pictures pass through.
- No text model loaded and memory cannot be read: pictures pass through.
- A text model is loaded and the picture does not fit: the picture waits for the text to unload, or is refused with
  the reason (never rendered over a running model).

[Illustrations](images.md) · [Setup](README.md)

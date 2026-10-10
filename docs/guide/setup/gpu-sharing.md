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
| `observe` | Watches a text server **you** start (Unsloth Studio), unloads and reloads it through its own API. | You already start your text server yourself. The recommended start. |
| `supervise` | Starts and stops `llama-server` itself, on demand, and optionally ComfyUI. | You want the plugin to own the text server. Opt-in. |
| `managed` | Forwards to an external controller. Kept for one release, then removed. | You still run the older standalone controller. |

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

## What you see

**Images → Image service** shows a **GPU sharing** line while the plugin runs: idle, text model loaded, rendering a
picture, or waiting, and why a picture waits. If the text server stops by itself, the line says so: pictures keep
rendering, and replies fail with a reason until an admin loads text again.

Load, unload, automatic, restore and free-image controls are **admin-only** routes under
`/api/plugins/story-orchestrator-gpu/control/…`; any signed-in user can read the status and take an image lease.
A control picks a profile by its id; it never takes a path, a program or an argument.

## Keeping a sprite batch warm

Building several sprites in a row can keep the image model loaded between images. That is off by default; set
`"retainBatches": true` and the plugin allows it only while nothing waits for text and memory stays above the reserves.

## Without the plugin, or when it cannot help

- Not installed, `none`, or ComfyUI not reachable: pictures pass through.
- No text model loaded and memory cannot be read: pictures pass through.
- A text model is loaded and the picture does not fit: the picture waits for the text to unload, or is refused with
  the reason (never rendered over a running model).

[Illustrations](images.md) · [Setup](README.md)

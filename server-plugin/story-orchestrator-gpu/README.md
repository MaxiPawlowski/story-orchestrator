# story-orchestrator-gpu

Optional SillyTavern server plugin coordinating local text generation and ComfyUI renders on one GPU.
Install from this checkout with `npm run plugin:install -- --with gpu`, enable server plugins in SillyTavern's
`config.yaml`, then restart SillyTavern.

## Adapters

`config.json` beside `index.mjs` selects an adapter:

| Adapter | Behaviour |
|---|---|
| `none` (default when no config exists) | Images pass through without a GPU lease; the text proxy refuses requests. |
| `unsloth` | Coordinates an Unsloth text model and ComfyUI; requires `upstream`, `model` and `comfyUrl`. |
| `managed` | Forwards lease routes to an external controller (`controllerUrl`, default `http://127.0.0.1:18888`); that controller owns the text port. |

Example Unsloth configuration:

```json
{
  "adapter": "unsloth",
  "upstream": "http://127.0.0.1:8888",
  "model": "TheDrummer/Artemis-31B-v1.1-GGUF",
  "comfyUrl": "http://127.0.0.1:8188"
}
```

The Unsloth adapter exposes a text proxy on `listenHost:listenPort` (default `127.0.0.1:18888`; the host must be
loopback). Both keys, like `controllerUrl`, live in `config.json`; the defaults are documentation, not a claim about
your machine. Point the relevant Connection Manager profiles
at it. While an image holds the GPU, text requests wait. Before rendering, the broker checks active generations
and the configured model, then unloads it. After rendering, it waits for ComfyUI's queue to empty and frees its
models. Lease recovery handles abandoned renders.

Without this plugin, the extension renders through its configured image backend without GPU coordination.
The installer preserves local `config.json`; machine-specific configuration is separate from the tracked source.

## Routes

Under `/api/plugins/story-orchestrator-gpu`: `GET /status`, `POST /lease`, `POST /renew`, `POST /release`.

## Tests

`npm run test:plugin` covers the GPU gate and managed-controller adapter.

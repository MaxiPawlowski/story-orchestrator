# story-orchestrator-gpu

Optional SillyTavern server plugin that shares one GPU between a local text model and ComfyUI renders.
Install from this checkout with `npm run plugin:install -- --with gpu`, enable server plugins in SillyTavern's
`config.yaml`, then restart SillyTavern. The user guide page is `docs/guide/setup/gpu-sharing.md`.

## Adapters

`config.json` beside `index.mjs` selects an adapter. The installer never overwrites it, and nothing in it is assumed:
paths, ports and model ids are yours.

| Adapter | Behaviour |
|---|---|
| `none` (default when no config exists) | Images pass through without a GPU lease; the text proxy refuses requests. |
| `observe` | A text server you start (Unsloth Studio API: `upstream`, `model`, `comfyUrl`, all loopback). The broker unloads and reloads it through that API. |
| `supervise` | The in-process arbiter (`broker/`): starts `llama-server` on demand from `text.binary` + `text.model`, admission over GPU/RAM/commit headroom, FIFO text queue, learned render footprints. `comfy.supervise: true` also starts ComfyUI. |
| `managed` | Forwards lease routes to the external `scripts/local/controller.mjs` at `controllerUrl`. Kept one release as a bridge, then removed. |

Validation (`config.mjs`) refuses an unknown adapter, a non-loopback bind (and any key that would allow one), relative
binary/model paths, a profile argument that sets the host, port or a path, and a text port equal to `listenPort`.

### `supervise` keys

| Key | Meaning |
|---|---|
| `listenPort` | Text gateway port (default 18888, loopback). Point the Connection Manager profile here. |
| `stateDir` | Absolute folder for footprints, timings and child logs. |
| `text.binary`, `text.model` | Absolute paths to `llama-server` and the GGUF. |
| `text.port` | Loopback port the owned `llama-server` listens on. |
| `text.profiles` | `{ id: { args: [...] , estimatedGpuMiB?, estimatedRamMiB? } }`; the page picks by id only. |
| `text.defaultProfile`, `text.alias`, `text.maxContext`, `text.keepResident` | Defaults: first profile, `local`, 32768, false (load on demand). |
| `comfy.url`, `comfy.supervise`, `comfy.python`, `comfy.root`, `comfy.extraArgs` | ComfyUI (observed by default). |
| `reserves` | `{ gpuMiB, ramMiB }`; absent = probe (10% of VRAM, min 1 GiB; 10% of RAM, min 2 GiB). |
| `modelDirs` | `{ kind: [absolute folders] }` for model-size estimates. |
| `telemetryPython` | Optional Python with `pynvml`/`psutil` for high-cadence telemetry (`broker/memory-probe.py`); without it `nvidia-smi` is sampled. |
| `retainBatches` | `true` lets `/status` answer `mayRetain` for warm sprite batches (default false). |

`exit()` stops only children the broker started (tree kill), never a server it did not start.

## Routes

Under `/api/plugins/story-orchestrator-gpu`: `GET /status`, `POST /lease`, `POST /renew`, `POST /release` for any
signed-in user; `POST /control/{load,unload,automatic,restore,start-comfy,free-images,cache-mode}` admin-only, with a
body that may only carry a profile id or a boolean (`free-images` `clear`). `/status` carries `state`
(`idle | text-loaded | image | waiting | held | degraded`), `mayRetain`, `reserves`, telemetry (no prompt text).

## Tray

The tray entry template for a supervising broker: status `http://127.0.0.1:<listenPort>/status`; load/unload/automatic
actions call the admin control routes with an admin session (or keep `scripts/local/cli.mjs` for the standalone
controller while the `managed` bridge lasts).

## Tests

`npm run test:plugin` covers the observe gate, the managed bridge, config validation, the fail-open matrix, admin-only
controls, owned-child shutdown and the moved scheduler/policy/footprint core (`broker/*.test.mjs`).

# story-orchestrator-gpu

Optional server plugin that shares one GPU between a local text model and ComfyUI renders: while a picture renders,
replies wait, and the text model is unloaded first when the picture does not fit beside it.

| | |
|---|---|
| Who needs it | Only installs that run a local text model and local ComfyUI on the same graphics card. Cloud reply models never need it. |
| Install | From a source checkout: `npm run plugin:install -- --with gpu`. From a release zip: copy this folder to `<SillyTavern>/plugins/story-orchestrator-gpu/`. |
| Enable | Set `enableServerPlugins: true` in SillyTavern's `config.yaml`, then restart SillyTavern. A plugin is loaded only at start. |
| Configure | Write `config.json` beside `index.mjs` and choose an adapter (below); point your reply profile at `http://127.0.0.1:<listenPort>`. |
| It works when | `http://127.0.0.1:<listenPort>/status` (default port 18888) answers with your adapter and a `state`, and **Orchestrator → Connections → Images → Image service** shows a **GPU sharing** line. |
| User guide | [One GPU for text and images](../../docs/guide/setup/gpu-sharing.md), with complete `observe` and `supervise` examples |

The general install steps for every plugin: [Server plugins](../../docs/guide/setup/README.md#server-plugins).

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
| `text.loadMode` | Overrides each profile's `--load-mode` (`auto`, `none`, `mmap`, `mlock`, `mmap+mlock`, `dio`); absent = the profile's own args. Reload time per mode is in `/status` `text.loadMs`. |
| `comfy.url`, `comfy.supervise`, `comfy.python`, `comfy.root`, `comfy.extraArgs`, `comfy.startTimeoutMs` | ComfyUI (observed by default); a supervised ComfyUI gets `startTimeoutMs` (default 120000) to answer before a lease is refused. |
| `reserves` | `{ gpuMiB, ramMiB }`; absent = probe (10% of VRAM, min 1 GiB; 10% of RAM, min 2 GiB). |
| `modelDirs` | `{ kind: [absolute folders] }` for model-size estimates. |
| `telemetryPython` | Optional Python with `pynvml`/`psutil` for high-cadence telemetry (`broker/memory-probe.py`); without it `nvidia-smi` is sampled. |
| `ramEstimates` | `[{ id, models: ["kind:file", …], ramMiB, maxPixels?, streaming? }]`: this host's measured RAM need for a model set; overrides the shipped table (`broker/ramEstimates.mjs`). |
| `imageFairTextRequests`, `imageFairWaitMs` | Fair image window (defaults 3 and 45000): a lease asked while text runs or waits lets that many more text replies through, or waits that long, then takes the GPU before the rest of the text queue; with no text waiting it goes after the reply in progress. `/status` answers `fairImages: true`, `imageWaiting`, `servedText`, and the page then asks for its lease at once instead of waiting for an idle text queue. `0` restores image-first. |
| `retainBatches` | On by default: `/status` answers `mayRetain` so a sprite batch keeps its image lease for up to three images while no text waits and memory stays above the reserves. `false` turns it off. |

`exit()` stops only children the broker started (tree kill), never a server it did not start.

### Image admission: keep text or swap

Each lease needs `need + reserve` free on both the GPU and host RAM (and commit), read live just before the decision.

- GPU need: the larger of the request's `needGpuMiB` (or the size read from `modelFiles`) and a verified footprint.
- RAM need, first match: a verified footprint for this workflow, a `ramEstimates` row from the config, a shipped
  measured row, the loader estimate (`min(weights, 8 GiB)` + activation when ComfyUI streams, full weights otherwise).
  A request's `needRamMiB` can only raise it. Rows match the exact model set, and only within their `maxPixels` and
  `streaming` condition; anything else falls back to the estimate.
- Shipped row `qwen-image-2.1-int8-sprites` (the Qwen 2.1 int8 sprite set, streaming, up to 1024×1024): 8,139 MiB, the
  largest free-RAM drop from idle seen in any of 8 Qwen leases on a 3090 / 32 GB host (6,782 MiB) × 1.2. The loader
  estimate for the same set was 10,673 MiB.
- When the image fits beside a loaded text model, text stays loaded (`retain-text`: no unload, no reload). When it
  does not, text unloads first (`swap-text`), or reloads smaller when measured timings say that is faster
  (`shed-text`). No reading means no keep. The reserves are never lowered to make a job fit.
- `/status` `lastResidency` says what was decided and why: `decision`, `reason`, `textResident`, `needGpuMiB`,
  `needRamMiB`, `ramSource`, `reserves`, `readings` (before), `admittedReadings` (after a swap), `shortBy`. Each decision
  is also logged as `[story-orchestrator-gpu] lease <decision>: …`.
- Host RAM short (physical or commit) is a retryable state, never a lowered reserve: the lease answers
  `Image admission refused: … Host RAM is short for this image …`, `lastResidency.decision` is `ram-short`, and the
  broker is free for text at once. The page retries that answer every 20 s within its 15-minute lease patience and
  stops on cancel. For 10 minutes after a shortfall the broker remembers how much RAM unloading text freed, and refuses
  straight away (text kept loaded) while the live reading plus that amount still falls short, so retries do not
  unload and reload text each time.
- Host RAM on Windows is `FreePhysicalMemory` (standby cache not counted), so readings and the measured row are both on
  the conservative side.

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

# Plan 28 — GPU broker inside the ST server plugin

**Status: SEEDED 2026-10-07 from the user's idea list ("integrate gpu brooker into ST plugin", `00-overview.md`
tail); needs user approval; not built.** Implementation D; acceptance LI + LT (00-overview §Gate taxonomy).

## Problem / idea

One GPU running both a local text model and ComfyUI needs one owner deciding who holds VRAM. Today that owner is split:

- `server-plugin/story-orchestrator-gpu` (ST server plugin) has three adapters (`index.mjs:22`): `none`, `unsloth`
  (in-process `GpuGate` + its own HTTP proxy on a **hardcoded** `127.0.0.1:18888`, `index.mjs:51-55`) and `managed`
  (forwards `/status` `/lease` `/renew` `/release` to an external controller, `index.mjs:24-27`, `managed.mjs:1-23`).
- The real arbiter is outside the product: `scripts/local/controller.mjs` (spawns llama-server and ComfyUI,
  `:60`, listens on `config.gatewayPort`, `:182`), `scheduler.mjs` (exclusive lease, FIFO text queue, admission,
  footprints), `policy.mjs` (admission over GPU/RAM/commit headroom), `models.mjs` (weight sizes from
  safetensors/GGUF headers). Config lives at `C:\dev\tools\story-orchestrator-local\config.json`, started from the tray
  (`C:\dev\tray\items\story-orchestrator.json`, "Local model (controller)").
- The page hardcodes machine numbers: `src/sprites/builder/batchHost.ts:20-22` keeps a batch lease only when
  `gpuFreeMiB >= 2048 && ramAvailableMiB >= 4096` (the v2.7 22 protocol step 4 reserves, copied into the page).

An earlier v2.7 31 draft proposed moving the controller out of the product as private local tooling. The user now
wants the opposite for its core: the broker becomes a product feature of the ST plugin (v2.7 31 as seeded agrees).

## Player / author outcome

- A player with one GPU for text and images installs one optional plugin, picks "share this GPU" in its settings, and
  text replies and pictures stop fighting for VRAM. No second Node process, no tray-only controls.
- A player without a local text model sees nothing new: images render as today (v2.7 17 fail-open).
- The settings panel shows the broker's state in plain words (idle / text loaded / image rendering / waiting) and why a
  picture waits.

## What "integrated" means (recommendation: in-process arbiter, supervised backends)

| Option | What runs where | Verdict |
|---|---|---|
| A. In-process arbiter | `ResidencyScheduler` + `admission` + footprints run inside the plugin's `init`; the plugin supervises llama-server/ComfyUI child processes it was configured to own | **recommended** |
| B. Plugin spawns `controller.mjs` | today's controller as a child process, plugin proxies | keeps two configs and two lifecycles; a crash of either half is invisible to the other |
| C. Status quo (`managed`) | external controller, plugin proxies | what the early v2.7 31 draft proposed; not what the user asked |

Under A:

- `scheduler.mjs`, `policy.mjs`, `models.mjs`, `footprints.mjs`, `estimate.mjs`, `gguf.mjs`, `safetensors.mjs`,
  `telemetry.mjs`/`fastTelemetry.mjs`, `backend.mjs`, `imageCache.mjs` move into `server-plugin/story-orchestrator-gpu/`
  (their tests move to `test:plugin`). `controller.mjs` shrinks to the plugin's `init`/`exit` wiring.
- Adapters become **backends the arbiter supervises or observes**: `observe` (a text server the user starts; the broker
  only unloads/reloads through its API, today's `unsloth` gate), `supervise` (the broker starts and stops the binary it
  was given), `none`. `managed` stays one release for migration, then goes.
- Lifecycle: ST start → plugin `init` reads config, probes, starts nothing until the first text request or lease
  (load on demand, as v2.7 22 does). ST stop → `exit()` stops every child it started (tree kill, the harness
  precedent `story-orchestrator-harness/agentBridge.mjs:142`), never one it did not start.
- The text gateway port is a setting (default 18888), not a constant. Connection Manager profiles point at it; the
  settings panel says which profile does.

## Generic product vs this machine

| Generic (ships) | This machine's config (never in the repo defaults) |
|---|---|
| arbiter, admission, FIFO, lease/renew/release, footprint learning, load-on-demand, status | Artemis 31B GGUF path, the 3090, llama-server binary path, ComfyUI python/root, `comfyExtraArgs` |
| reserves as settings, default from a probe (e.g. 10% of VRAM, min 1 GiB; proposed) | the 2048/4096 MiB reserves measured in v2.7 22 |
| model sizes read from the files ComfyUI/llama-server use | `modelDirs`, `modelCacheRoot` |
| tray entry template documented in the README | `C:\dev\tray\items\story-orchestrator.json` entries |

- **Discovered, not hardcoded**: GPU list and free VRAM from `nvidia-smi`/NVML (telemetry already does it), host RAM
  and commit headroom, ComfyUI `/system_stats` and `/object_info`, llama-server `/props` (`n_ctx`, model). The config
  file names only what cannot be discovered: binaries, model files, ports.
- `batchHost.ts:20-22` stops comparing literals: the broker's `/status` answers `mayRetain: boolean` (or its reserves),
  and the page reads that.
- Benchmarks (`render-benchmark.mjs`, `benchmark.mjs`, `live-check.mjs`, `sagaBatch*`) stay dev-only scripts.

## Opt-in and fail-open

- The plugin stays in `artifact-allowlist.json` `optional` (`:13-18`); `plugin:install -- --with gpu` (v2.7 17 §C).
- Unconfigured, unreachable or `none`: `/lease` answers `brokered: false` and images pass through
  (`gpuBroker.ts:58-71` already treats 404/`brokered: false` as open). Refusal (409) only while it knows it guards a
  live text model and admission says no.
- A crashed supervised backend: status `degraded`, text requests fail with a reason, images pass through after the
  broker confirms nothing of its own holds VRAM.

## Security & privacy

- Routes mount under `/api/plugins/story-orchestrator-gpu`, behind ST's user/CSRF middleware (gotchas: plugin routes
  mount after it). Config writes and load/unload/stop are **admin-only** (`isAdmin` precedent,
  `story-orchestrator-harness/index.mjs:577`); lease/renew/release/status for any authenticated user.
- **No process spawning from page input.** Binary paths, args and model files come only from the server-side config
  file (written by an admin through a validated route or by hand). The page can pick among configured profiles by id,
  never pass a path or an argument. Path checks reuse `models.mjs:7-12` (`safeName`, no `..`, no absolute).
- The text gateway and every child bind loopback only (`managed.mjs:3` loopback rule kept). The gateway has no auth of
  its own, so it never listens off loopback; a setting to change that is refused.
- Telemetry in `/status` carries no prompt text; footprints carry workflow keys and sizes only.

## FLUX

Out of scope. `archiveFlux.mjs`, `fluxSpikeGraph.mjs`, `flux-components.py`, `verifyFluxWeights.py` and the v2.7 25
FLUX memory repair stay out of the plugin; v2.7 31 removes them. The arbiter is model-agnostic; an unknown
workflow uses conservative full swap until measured (v2.7 22 protocol step 5).

## Reconciliation with v2.7 31

v2.7 31 (`31-flux-out-and-tooling-split.md`, seeded 2026-10-07) already routes the broker here (its §B row "GPU
broker" → v2.8 28). The split, as recommended:

1. **v2.7 31 removes** FLUX (catalog, graph branch, media allowlist nodes, `scripts/local/*` FLUX files) and takes this
   machine's numbers out of shipped code: `batchHost.ts:20` reserves read from the broker's status,
   `story-orchestrator-gpu/index.mjs:25,55` address from config. This plan builds on both, it does not redo them.
2. **v2.7 31 does not delete** the scheduler/policy/models/footprints core; **this plan moves it** into
   `server-plugin/story-orchestrator-gpu` and retires `scripts/local/cli.mjs` start/stop for the plugin's own
   controls. Until it builds, the external controller + `managed` adapter keep working, optional and fail-open.
3. v2.7 31 makes the warm sprite-batch lease (`batchLease.ts`, `batchHost.ts`) dev-only. With an in-plugin broker
   answering `mayRetain`, it can return to the product (decision 6).
4. The tray entry changes from "Local model (controller)" to the plugin's status URL; its load/unload/automatic actions
   call admin routes (a small `cli.mjs`-style client kept only for the tray).

## Gates

- **D:** moved scheduler/policy/footprint tests green under `test:plugin`; new: config validation refuses a path from
  the request body, a non-loopback bind, an unknown backend kind; `exit()` kills only owned children (fake spawn);
  fail-open matrix (no config / `none` / unreachable backend / crashed backend) → `brokered: false` or a reasoned 409;
  admin-only routes 403 for a non-admin; allowlist test keeps the plugin optional. `npm run gates`.
- **Clean-host (D):** `scripts/release/clean-host.sh` without the plugin: images render, no broker probe errors.
- **LI + LT (acceptance):** text → image → text on this machine with the in-process broker, ×2 consecutive, same
  floors as v2.7 22's gate record (no OOM, no foreign ComfyUI job interrupted, text resumes); proposed floor: image→
  completed-reply wait no worse than the external controller's recorded median +10%.
- **Tray:** entry present, `C:\dev\tray\status.txt` OK, readiness on the plugin's `/status` (00-overview rule 5).
- **Registry:** feature entry + Help page "One GPU for text and images" (00-overview rule 10).

## Dependencies

v2.7 17 (broker optional, fail-open, route A/B), v2.7 22/23/25 (scheduler, admission, footprints; FLUX parts excluded),
v2.7 31 (FLUX out, machine numbers out of shipped code), v2.7 32 (image product parts), v2.7 18 (sprite batch lease,
`batchHost.ts`).

## Decisions for the user

1. In-process arbiter (A) vs plugin-spawned controller (B)? **Recommended: A.**
2. May the plugin start and stop llama-server/ComfyUI itself (`supervise`), or only observe servers you start?
   **Recommended: both, `observe` the default; `supervise` opt-in per backend.**
3. Accept the v2.7 31 split above (31 removes FLUX + machine numbers, this plan moves the core)? **Recommended: yes.**
4. Keep `managed` for one release as a bridge? **Recommended: yes, then remove (no legacy compat after).**
5. Default reserves from a probe instead of 2048/4096 MiB? **Recommended: yes; this machine's config pins its own.**
6. Bring the warm sprite-batch lease back to the product once the broker answers `mayRetain`? **Recommended: yes,
   off by default.**

## Links

`server-plugin/story-orchestrator-gpu/{index,gate,managed}.mjs`, `README.md`; `scripts/local/{controller,scheduler,
policy,models,footprints}.mjs`; `src/services/stHost/gpuBroker.ts`; `src/sprites/builder/batchHost.ts`;
`docs/plans/v2.7/17-self-contained-images.md` §C, `22-local-residency.md`, `25-flux-memory-and-backend-spikes.md`;
`C:\dev\tray\README.md`.

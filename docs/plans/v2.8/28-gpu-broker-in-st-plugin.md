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

## Decided (user, 2026-10-07)

"Go with the recommendations": every decision in §Decisions above takes its **Recommended** answer.

## Owner decisions to confirm (2026-10-10, build)

Owner approval 2026-10-10 (queue A9); each open decision took the plan's recommendation, recorded here for the owner
to confirm: (1) in-process arbiter (A); (2) both `observe` and `supervise`, `observe` the recommended mode, `supervise`
opt-in, and ComfyUI supervision opt-in separately (`comfy.supervise`); (3) the v2.7 31 split; (4) `managed` kept one
release as a bridge; (5) reserves from a probe (10% of VRAM, min 1 GiB; 10% of RAM, min 2 GiB) unless the config pins
them; (6) the warm sprite-batch lease back in the product, off by default (`retainBatches`). Also decided while
building, to confirm: the `unsloth` adapter is renamed `observe` (no alias, no legacy compat); config writes are by
hand only (no write route); a crashed supervised text server is not auto-restarted, an admin's Load text or Automatic
restarts it.

## Gate record (2026-10-10, branch `v2.8-media-stack`)

As built:
- Core moved with history (`git mv`) from `scripts/local/` to `server-plugin/story-orchestrator-gpu/broker/`:
  scheduler, policy, models, footprints, estimate, gguf, safetensors, telemetry, fastTelemetry, backend, imageCache,
  responseTiming, runtimeIdentity, controllerStatus, memory-probe.py, and their tests (now under `test:plugin`).
- New `broker/arbiter.mjs` (the controller's wiring as a factory with injected spawn/fetch/telemetry, owned-child
  registry, probe reserves, pass-through rules, `mayRetain`, plain `state`), `broker/gateway.mjs` (the text gateway),
  `config.mjs` (validation), `index.mjs` adapters `none | observe | supervise | managed`, admin-only
  `/control/:action`, tree-kill of owned children on `exit()`.
- `scripts/local/controller.mjs` is now a thin host of the same arbiter + gateway (keeps the tray `cli.mjs` working
  while the `managed` bridge lasts; its old ComfyUI flags moved into the controller's own call).
- `NativeBackend`: injected spawn/fetch/killTree, crash detection, profile names `largeProfile`/`smallProfile`
  (default `normal`/`fast`); `GpuGate` no longer defaults to this machine's upstream or model id; telemetry reads
  Linux `/proc/meminfo` and falls back to `os` elsewhere.
- Page: `gpuBroker.ts` knows the four adapters, `state`, `mayRetain`; `mayRetainBatch` trusts a supervising broker's
  `mayRetain`; Images → Image service shows a **GPU sharing** line (`#so-gpu-broker`, `GpuBrokerLine`).
- Docs: new guide page `setup/gpu-sharing.md` ("One GPU for text and images"), `setup/images.md` section shortened,
  setup README row, plugin README rewritten; registry feature `gpu-sharing`; README feature table regenerated.

Gates:
- `npm run gates -- --no-storybook --jobs 2`: typecheck, typecheck:test, debug:typecheck, test (7424 passed, 1
  skipped), build, lint, test:replay, test:debug green; test:plugin red on one harness flake (`agent.test.mjs` "a tool
  the bridge does not own…", a 30 s session deadline hit under load: timeout instead of refused; passes alone),
  test:release red on the guide machine-path guard (`D:/` paths in the new page's example; fixed to POSIX
  placeholders). Re-run after the fix: `npm run test:plugin` 202/202, `npm run test:release` 119/119,
  `node --test scripts/docs/guide-bundle.test.mjs` 9/9. Storybook skipped (`--no-storybook`); stories to run:
  `Settings/GpuBrokerLine` (4), `Settings/ImageGroup`.
- C: reached 0 bytes free for a few minutes during this gate window (coordinator alert); no ENOSPC appeared in the gate
  log and the tree checks clean (`git fsck`: dangling objects only).

Not run (owner GPU tonight belongs to another agent): LI + LT text → image → text ×2 with the in-process broker,
clean-host without the plugin, tray entry switch (the tray still points at the standalone controller; the README
documents the template). Acceptance stays open.

## A5 handoff note 2026-10-11

- Drivers written, not run to a result: `scripts/local/pluginBrokerLi.mjs`, `scripts/local/pluginBrokerLiConfig.mjs`, `scripts/local/storyWorkflowLi.mjs`, `test/scenarios/live-story-workflows.json`.
- `node --test scripts/local/pluginBrokerLiConfig.test.mjs scripts/local/storyWorkflowLi.test.mjs`: 6 pass, 0 fail.
- The agent running the LI protocol hung when the 3090 window closed (12:45). No LI floor was measured. Its orphaned ComfyUI and lane 38 lease stub were stopped; GPU back to idle.
- Owed: plan 28 LI + LT x2 and plan 29 LI, on a lane, with a new GPU window.

## Gate record: LI + LT and R14 on the 3090 (2026-10-14, branch `v2.8-3090-li`)

Owner's 3090 window 04:45-10:15 AST. Evidence: `C:\dev\so-lanes\m3090-2026-10-14\{plan28,plan28t,r14}`, archived privately
(label below). Broker in `supervise` (in-process arbiter, text and ComfyUI supervised), config from
`C:\dev\tools\story-orchestrator-local\config.json` profile `fast` (32k), reserves pinned 2048/4096 MiB, SDXL
`waiIllustriousSDXL_v170`. Host RAM available ran 8.5-16 GiB (other agents' runs on the same box).

LI + LT, text -> image -> text:
- Readiness first: the in-process broker's ComfyUI start timed out three times (`ComfyUI did not become ready`; a cold
  ComfyUI took about 4 min to answer, the arbiter waits 120 s; a third attempt lost the lease to undici's 300 s header
  timeout). Plan 41 hit the same failure three times on 2026-10-13. Fixed: `comfy.startTimeoutMs` (config, validated,
  default 120000; the LI config sets 300000) and the driver warms ComfyUI through `/control/start-comfy` before the
  measured cycle. Readiness failures after the fix: 0 of 4 runs.
- Discovery runs on the old driver (final channel forced, 128 tokens, timer from lease request): run1/run2 functional
  floors all true; lease-to-reply 151.6 s / 98.0 s. Not counted: plan 41 replaced that driver.
- Counted, master's thinking-enabled driver (`node scripts/local/pluginBrokerLi.mjs <config> <out> runN`), ×2
  consecutive, ComfyUI already warm:
  - run1: exit 0; text before visible (458 tokens, 1,473 reasoning chars); lease `swap-text` admission 0.9 s; render
    22.2 s; release 0.5 s; reply after 73.6 s; lease-to-reply **100.8 s**; min GPU free 2,959 MiB (reserve 2,048);
    peak 21,617 MiB; foreign queue 0/0 before and after; GPU after exit 1,153 MiB.
  - run2: exit 0; admission 1.0 s; render 44.2 s; release 0.2 s; reply after 39.4 s; lease-to-reply **86.1 s**; min
    free 2,928 MiB; peak 21,648 MiB.
  - Functional LI floors (no OOM, no foreign job interrupted, text resumes, reserve held): **PASS ×2**.
  - LT floor (plan 41's historical median 59.492 s + 10 % = 65.441 s): median **93.5 s, FAIL ×2**. Same protocol
    caveat as plan 41: 458 thinking tokens against the historical 128-token final-only reply; the reload after the
    swap dominates (reply 39-74 s).

R14, `retainBatches` with a real warm batch (`scripts/local/retainBatchLi.mjs`; the page's own `SpriteBatchLease` and
`mayRetainBatch`, limit 3; batch A three images with no text; batch B three images with a text request 5 s into image 1).
Floors predeclared in the driver before the first run: A takes one lease for three images; B's text is answered and
before B's second lease; reserves held (min GPU free >= 2,048, min RAM available >= 4,096).
- As built, it never retained: `mayRetain` required `!imageLease`, so the batch holding the lease always read `false`
  and dropped it after every image (as-is SDXL run: 3 leases for 3 images, `may-retain false, waitingText 0,
  imageLease true`). Fixed in `broker/arbiter.mjs`: idle means no active or waiting text; test "mayRetain stays true
  for the batch holding the image lease and turns false once text waits".
- After the fix, SDXL portrait frames, `imageCacheMode: evict`:
  - run1: PASS, every floor. A: 1 lease, frames 17.6 / 10.2 / 12.2 s (as-is unretained: 25.8 / 20.9 / 18.3 s). B: text
    asked during image 1, `may-retain false, waitingText 1`, lease dropped, reply 38.5 s, then a second lease; 3
    images. Min GPU free 2,918 MiB, min RAM available 10,887 MiB.
  - run5: PASS, every floor. A: 1 lease, 25.8 / 14.2 / 14.2 s. B: 2 leases, reply 45.0 s before the second lease. Min
    GPU free 2,959 MiB, min RAM 9,837 MiB.
  - runs 2 and 3: A retained (1 lease, 3 images), then B's first lease was refused by RAM admission (available 9,065
    and 10,094 MiB against 9,011 + 4,096): the reserve held, the batch did not run. run4 (B first): refused at the
    first lease (12,345 MiB). Recorded as host-RAM misses, not retain failures.
- Real Qwen sprite batch (the product's sprite models): BLOCKED by RAM admission on this host (`10,673 + 4,096` needed,
  9.0-14.0 GiB available, three attempts); only one base render ran. `imageCacheMode: warm` also refuses the second
  lease while the first model sits in RAM.
- Mid-batch text used the final channel (96 tokens): R14 measures the hand-off, not reply latency.
- Decision (owner: "test it and if it works fine turn it on"): **on**. `retainBatches` now defaults to true
  (`config.mjs`; `false` turns it off), README, guide `setup/gpu-sharing.md`, `broker.test.mjs`. Retaining also means
  one admission per three images, which on this RAM-tight host is fewer chances of a 409.

Other findings:
- The managed adapter answers 409 when its controller is down; `managed.test.mjs` pins that on purpose (a managed
  controller may hold a live text model), so it was left alone.
- `cli.mjs start` on the standalone controller starts restoring text at once (keepTextResident); `unload` straight
  after holds it.

Order used (owner: batch by model, avoid reloads): plan 28 discovery and counted LI ×2 (text + image), R14 runs (text
+ image), then image-only on one ComfyUI session with text unloaded: plan 29 ×2, then plan 33 lie_side (seed 1234, 5678),
a ComfyUI restart, the second lie_side run. Text was reloaded only inside plan 28 and R14 cycles.

Evidence archive: `node scripts/debug/so-evidence.mts archive --label m3090-li-20261014 --lanes 38 --since 2026-10-14T00:00:00Z`: exit 0, 497 files, 185,528,410 B, problems none (evidence copied into lane 38 `debug/runs/m3090-2026-10-14`; private so-sessions tree, not pushed).

Gates:
- `node --test server-plugin/story-orchestrator-gpu/broker.test.mjs`: 13 pass, 0 fail; `npx jest src/image/renderFacts.test.ts`: 3 pass.
- `npm run gates:quick`: typecheck, typecheck:test, lint (changed), jest (related) ok; defect replay (`--cached`) FAIL
  `jest --listTests failed` with empty stderr (no replay cache in a fresh worktree, so every tracked file counts as
  changed; the same failure plan 41 recorded). Covered by the full replay below.
- `npm run gates -- --jobs 4`: test (707 suites, 8,156 passed, 1 skipped), build, test:replay (32 of 32 killed),
  typecheck, test:debug (1,256 pass), typecheck:test, lint (0 errors, 2 existing warnings) ok; test-storybook:ci FAIL
  because :6006 already served another agent's Storybook (not stopped: not ours), so debug:typecheck, test:plugin and
  test:release were not run by it. Run separately: `npm run debug:typecheck` exit 0, `npm run test:plugin` 270 pass 0
  fail, `npm run test:release` 123 pass 0 fail, Storybook from this worktree's `.sb-static` on :6017
  (`node node_modules/@storybook/test-runner/dist/test-storybook.js --url http://127.0.0.1:6017 --maxWorkers 4
  --index-json`): 133 suites, 799 tests passed. All green, the Storybook step by that manual route.
- GPU after the window: `nvidia-smi` 755 MiB used, 1 %, no compute process of ours; ComfyUI, broker, controller, lane 38
  stopped.

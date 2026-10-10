# Local residency

`story-orchestrator-gpu`'s managed adapter sends leases to this controller. It owns its native llama-server and the
ComfyUI process it starts; an already running ComfyUI is reused. Existing jobs are never interrupted.

Config: `SO_LOCAL_CONFIG`, default `C:/dev/tools/story-orchestrator-local/config.json`. Config keys with defaults:
`maxContext` (the default profile's `--ctx-size`, else 98304: the most the gateway will serve; profiles above it are
manual only), `fitMarginMiB` (0: added to the `--fit-target` llama-server plans for, never to the reserve it is checked
against; 512 on this install, where `--fit` left 1.8–2.0 GiB free against the 2 GiB reserve), `contextRetryMs`
(600000: how long a profile that failed to load is skipped for context), `comfyUrl` (`http://127.0.0.1:8188`; the owned ComfyUI is started on this URL's port). `reserves` is
required and is reported verbatim on `/status`. Start/stop/load/unload/automatic/
restore/free-images/start-comfy are available through `node scripts/local/cli.mjs <action>` and the tray. Every text
and lifecycle operation shares the lease queue; a manual hold requires Automatic or Load text to resume.

## Context

Each profile's context is its `--ctx-size`. The gateway counts every completion request with the backend's own
`/tokenize` (a chat request is rendered with `/apply-template` first) and needs prompt + output (`n_predict` or
`max_tokens`) to stay under the context, one position short of it, as llama-server stops there. It takes the loaded
profile when it fits, else the smallest enabled profile that fits within `maxContext` and has not failed to load in
the last `contextRetryMs`. When none fits it answers **400 `exceed_context_size_error`** (`n_prompt_tokens`, `n_ctx`, the
message names the context to set) and loads nothing. There is no extra gateway margin: SillyTavern already keeps the
prompt `token_padding` (64) under `max_context - amount_gen`. `/props` and `/v1/models` report the served context (the
largest usable profile within `maxContext`) and forward the backend's own `/props` (chat template) while text is
loaded, so SillyTavern's "Derive context size from backend" and Story Orchestrator's memory-model budget read it.
Set the SillyTavern preset's context to the served context (32768 on the 3090) or tick "Derive context size from
backend"; with more, long chats get the 400 instead of a reply, and Story Orchestrator names it (`context-over-server`).

`/tokenize` and `/detokenize` skip the text queue while text is loaded (llama-server answers them beside a running
generation); SillyTavern counts tokens through them, and queued counts used to hold the browser's six connections to
SillyTavern and delay the player's own line by seconds (v2.8 31 F19).

## Memory and wait policy

- `reserves.gpuMiB` / `ramMiB`: fixed desktop headroom (2048/4096 on this install). Admission checks fresh GPU,
  physical RAM and commit, never installed capacity or pagefile capacity alone.
- `residencyObjective`: `total-wait` (default) or `switch` (comparison arm). Total wait swaps when the reduced profile
  is unmeasured; otherwise it compares reduced-profile loading/prefill/decode against a full reload and reply. A
  reduced resident request can restore when its bounded output budget makes a full reload cheaper.
- `nextTextTokens`: expected next reply budget for image admission (default 256); a request can supply
  `nextTextTokens`. This is a cost estimate, not a claim that the model will use every output token.
- `keepTextResident` (default true): with Automatic selected and nothing running, an absent text backend (after a
  swap, a failed load, a failed restore) is reloaded at its desired profile once `textReloadGraceMs` (5000) has passed
  since the last lease; a failed load retries with backoff 5 s doubling to `textReloadMaxBackoffMs` (60000). The native
  backend's admission reads the fast NVML/GlobalMemoryStatusEx probe; the PowerShell CIM probe is only its fallback.
- `streamImages` (default off; enabling it crosses the 2 GiB GPU reserve, owner decision): `{enabled, minFreeGpuMiB
  (2400), maxWeightMiB (8192), kinds (['checkpoints'])}`. On a DynamicVRAM runtime, an SDXL-sized render keeps full text
  resident (`stream-image`) and ComfyUI streams its weights from RAM; the physical-RAM reserve still applies.
  Measured in `docs/plans/v2.7/22b-residency-harvest-2026-10-07.md`.
- `idleRestoreMs`: idle full-speed restore (600000 on this install), serialized with reads and renders.
- `imageCacheMode`: `warm` (default) offloads image weights but preserves the Comfy execution cache while RAM allows;
  `evict` also resets the cache. `cli.mjs cache-mode warm|evict` changes the running comparison arm, not disk config.
  Pressure can evict a warm cache before the next workload. Warm means retained node/model references, not a pinned
  guarantee: ComfyUI can reclaim them under RAM pressure.
- ComfyUI `--cache-ram 8` is an **8 GiB headroom threshold**, not an 8 GiB cache capacity. `comfyExtraArgs` selects
  supported loading flags; `modelCacheRoot` keeps new HF/compile caches off C:. A supported CUDA-13 DynamicVRAM runtime
  with explicit `--fast-disk` receives a separate 8 GiB host-staging-window estimate plus activations. Legacy/non-streaming
  runtimes keep the full-weight RAM estimate. Observed peaks remain separate from either estimate.
- Footprint revision 3 keys the runtime/source/flags, model file identity, cache condition and resident text. GPU demand
  is the observed additional peak plus 512 MiB uncertainty; admission adds the unchanged fixed reserve separately.
  No percentage growth is charged again on verified GPU peaks. Old entries
  remain history and cannot verify a changed runtime. Memory is sampled at 100 ms; a sparse/missing sample or reserve
  miss cannot promote a budget. `/measurement` exports the last owned render's trace.
- A verified same-runtime RAM observation replaces the conservative loader estimate. An explicit caller RAM demand
  remains a lower bound. Unknown/unverified runtimes keep the estimate; the physical-RAM reserve always applies.
- Image release observes RAM eviction as well as GPU release. A loader that cannot offload while cached escalates to
  cache eviction. NVML must return to the lease baseline (512 MiB tolerance), including native allocations outside torch.
- `modelLoadMode`: optional native loading-mode comparison; overrides the profile's `--load-mode`. Leave unset on
  this 32 GiB host: the measured `mmap` arm violated the physical RAM floor. `--cache-ram 512` is a prompt-state cache,
  not a model-weight hot store. Dense weight/layer placement is fixed at native startup; shedding restarts the backend.

`/status` names the resident/desired profile, fit target, load count/cost, objective, learned timings and image cache
state. Timings are invalidated when model/binary identity, loading mode or profiles change. JSON and streaming replies
are forwarded unchanged; only numerical timings are retained.

## Measurements

```
node scripts/local/benchmark.mjs <config.json> fast none
node scripts/local/benchmark.mjs <config.json> fast mmap
node scripts/local/render-benchmark.mjs <config.json> auto scene 128
node scripts/local/live-check.mjs <config.json> --cost
node scripts/local/live-check.mjs <config.json> --idle
node scripts/local/residency-arms.mjs <config.json> resident|ffn|reload scene|portrait [runs] [--cpu-ffn N] [--comfy-reserve GB] [--text-load-mode none|dio|mmap]
```

`residency-arms` needs the controller stopped (`cli.mjs stop`): it owns its own llama-server and ComfyUI, measures
image s, image→completed reply s, reply tok/s, peak VRAM, low GPU/RAM and the WDDM shared-usage delta, then stops both.
Restart the controller afterwards.

Render modes: `auto|swap|shed|solo`; explicit swap/shed arms require `experiments: true`. Families:
`scene|portrait|background|hires|lora|edit|sprite`. LoRA needs an existing `benchmarkLora`; edit/sprite need
`benchmarkEdit: {diffusion, encoder, vae, reference}` (reference already uploaded to ComfyUI). No weights are downloaded
or moved. `SO_LOCAL_RECORD_DIR` points to an existing archive directory. Records include admission, render, release,
reply and total cycle time; a reserve refusal stays failed.

The `background` family renders the SDXL wide row (`no humans, scenery`) on the default checkpoint; FLUX and plan 25's
FLUX spike helpers were removed by v2.7 31. GGUF text models are sized from a validated GGUF header and a conservative
full-file byte bound (`gguf.mjs`). `promoteLocal.mjs` backs up the old config before selecting a verified interpreter
for playtest.

`live-check` drives real auxiliary/text requests under a reduced fit target, validates full restoration and optionally
the actual idle timer or cost-based restoration. It needs `experiments: true`, an idle controller and an empty Comfy
queue. It changes only controller residency and leaves full text loaded. Discovery records name the controller's
source hash; `summarize.mjs <directory>` summarizes them and excludes wholly cached images from render repetitions.

Tests: `node --test "scripts/local/*.test.mjs"`, included in `npm run test:debug`; overall gate `npm run gates`.

Gate prerequisite: `python` (3.x, standard library only) on PATH. `comfyMemoryGuard.test.mjs` runs
`comfyMemoryGuard.test.py` against the shipped Comfy helper with stubbed torch/aiohttp; without Python that case is
skipped with the reason printed, so a gate record from such a machine does not cover the helper.

## Bulk sprite review

`so-saga-sprites.mts --warm-batch` is an explicit dev-lane optimization, not the production lease policy. It keeps one
owned lease for at most three identical-workflow frames, rechecks text/headroom at each boundary and before reuse,
and releases on a two-second idle gap. Saved manifest/hash/input matches are skipped, never sampled again for speed.

`installMemoryGuard.mjs` installs only the project-owned Comfy helper. Its `/so-local/host-cache` uses PyTorch's public
`empty_host_cache` for unused pinned host blocks only, idle/local/header checked; older PyTorch returns 501. Pressure
cleanup does not substitute for admission. `/status` uses the fresh probe and exposes `imageCacheFailure` and the
host-cache evidence; a GPU release with insufficient physical RAM is reported as a RAM admission refusal.

# Local residency

`story-orchestrator-gpu`'s managed adapter sends leases to this controller. It owns its native llama-server and the
ComfyUI process it starts; an already running ComfyUI is reused. Existing jobs are never interrupted.

Config: `SO_LOCAL_CONFIG`, default `C:/dev/tools/story-orchestrator-local/config.json`. Start/stop/load/unload/automatic/
restore/free-images/start-comfy are available through `node scripts/local/cli.mjs <action>` and the tray. Every text
and lifecycle operation shares the lease queue; a manual hold requires Automatic or Load text to resume.

## Memory and wait policy

- `reserves.gpuMiB` / `ramMiB`: fixed desktop headroom (2048/4096 on this install). Admission checks fresh GPU,
  physical RAM and commit, never installed capacity or pagefile capacity alone.
- `residencyObjective`: `total-wait` (default) or `switch` (comparison arm). Total wait swaps when the reduced profile
  is unmeasured; otherwise it compares reduced-profile loading/prefill/decode against a full reload and reply. A
  reduced resident request can restore when its bounded output budget makes a full reload cheaper.
- `nextTextTokens`: expected next reply budget for image admission (default 256); a request can supply
  `nextTextTokens`. This is a cost estimate, not a claim that the model will use every output token.
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
  Nunchaku's idle-only `comfyMemoryGuard` trim seam is a spike option; stock Comfy uses ordinary release.
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
```

Render modes: `auto|swap|shed|solo`; explicit swap/shed arms require `experiments: true`. Families:
`scene|portrait|background|hires|lora|edit|sprite`. LoRA needs an existing `benchmarkLora`; edit/sprite need
`benchmarkEdit: {diffusion, encoder, vae, reference}` (reference already uploaded to ComfyUI). No weights are downloaded
or moved. `SO_LOCAL_RECORD_DIR` points to an existing archive directory. Records include admission, render, release,
reply and total cycle time; a reserve refusal stays failed.

Plan 25's candidates are built by `candidateConfig.mjs`, preserving the old interpreter/config. GGUF uses a validated
GGUF header and a conservative full-file byte bound. `flux-components.py` extracts byte-identical CLIP/T5/VAE tensors
from the existing checkpoint into the off-C: spike directory; `verifyFluxWeights.py` checks public quantized downloads.
`normalCandidate.mjs` enables the original custom-node installation under the supported environment, and
`promoteLocal.mjs` backs up the old config before selecting that verified interpreter for playtest. Quantized backends
do not become defaults through these helpers. `archiveFlux.mjs` collects model/repo/environment pins, images and results.

`live-check` drives real auxiliary/text requests under a reduced fit target, validates full restoration and optionally
the actual idle timer or cost-based restoration. It needs `experiments: true`, an idle controller and an empty Comfy
queue. It changes only controller residency and leaves full text loaded. Discovery records name the controller's
source hash; `summarize.mjs <directory>` summarizes them and excludes wholly cached images from render repetitions.

Tests: `node --test "scripts/local/*.test.mjs"`, included in `npm run test:debug`; overall gate `npm run gates`.

## Bulk sprite review

`so-saga-sprites.mts --warm-batch` is an explicit dev-lane optimization, not the production lease policy. It keeps one
owned lease for at most three identical-workflow frames, rechecks text/headroom at each boundary and before reuse,
and releases on a two-second idle gap. Saved manifest/hash/input matches are skipped, never sampled again for speed.

`installMemoryGuard.mjs` installs only the project-owned Comfy helper. Its `/so-local/host-cache` uses PyTorch's public
`empty_host_cache` for unused pinned host blocks only, idle/local/header checked; older PyTorch returns 501. Pressure
cleanup does not substitute for admission. `/status` uses the fresh probe and exposes `imageCacheFailure` and the
host-cache evidence; a GPU release with insufficient physical RAM is reported as a RAM admission refusal.

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

Pose import and body measurements need `modelDirs.poseModels` pointing at the installed approved DWPose ONNX pair,
matching the media plugin's `modelRoots.poseModels`. ONNX weights use their file size for conservative admission;
they are not safetensors. Restart the controller after changing its model folders.

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

## Speculative decoding, prompt cache and prompt reuse

Optional `config.json` keys, all read by `broker/backend.mjs` `nativeArgs` (plan v3.0 06):

- `speculative: { model, type, nMax, estimatedGpuMiB, enabled }` adds `--model-draft <model> --spec-type <type>
  --spec-draft-n-max <nMax>` (defaults `draft-mtp`, 2, 900). `estimatedGpuMiB` is added to the profile's
  `estimatedGpuMiB` in the load admission and to `--fit-target`: llama-server's fit cannot measure the MTP drafter
  ("failed to measure the memory of the extra model, fitting without it"), so without it a reduced fit target (an image
  beside text) would lose the drafter's VRAM out of the image's room. `/status` reports `text.speculative`
  (`draft-mtp2`) and learned timings are keyed `<profile>+draft-mtp2:<fit>`, apart from timings without the drafter.
  On the 3090 (Artemis Q4_K_M + `mtp-Artemis-31B-v1m-Q8_0.gguf`): decode +28-39 % chat, +58 % side, acceptance
  0.56-0.59, prefill -6 %, about 0.85 GiB VRAM, so free VRAM after load drops from ~2.9 to ~2.0 GiB: below
  `streamImages.minFreeGpuMiB` (2400), images swap the text out instead of streaming beside it.
- `cacheRamMiB` (default 512) is `--cache-ram`; `ctxCheckpoints` (default unset, llama.cpp 32) is `--ctx-checkpoints`.
- `slots: { count, chat, side, estimatedGpuMiB, enabled }` (off unless `count` > 1; defaults 1, 0, 1, 400) runs
  `--parallel <count>` over the one unified KV pool and pins every generation request with `id_slot`: a streamed
  request (SillyTavern's chat reply) to `chat`, a non-streamed one (Story Orchestrator's side passes: read, inner
  beat, synthesis, suggestions) to `side`; a request that names its own `id_slot` keeps it. The chat slot then keeps
  the last chat prompt's state and checkpoints while side passes run, without a RAM prompt cache. Each extra slot adds
  `estimatedGpuMiB` to the load admission (not to `--fit-target`: llama-server's fit measures its own KV slots).
  The slots share `--ctx-size`, so the gateway keeps each slot's last prompt + output and erases the other slots
  (`POST /slots/<id>?action=erase`) before a request that would not fit beside them. `/props` reports `total_slots`;
  `/status` reports `text.slots` (`held` tokens per slot, `requests.chat`/`requests.side`, `erased`). With slots the
  prompt-reuse park is never sent (it would land on a pinned slot).
- `promptReuse: { enabled, minChars, minPrefixChars, minTailChars, history, parkWhenIdle }` (off unless `enabled`).
  Gemma 4 keeps 50 of 60 layers as sliding-window attention, so llama-server can resume a shared prompt prefix only
  from a context checkpoint, and it takes checkpoints only 4 and 516 tokens before the end of a prompt (a checkpoint
  restores when its first position is more than 1024 tokens, the window, before the shared prefix ends). For a
  `/completion` prompt of at least `minChars` (16000) the gateway finds the longest common prefix with its last
  `history` (16) prompts, cuts it at a line break and, when that leaves at least `minPrefixChars` (8000) before and
  `minTailChars` (1200) after, first sends that prefix alone (`n_predict: 0`): the server checkpoints exactly where
  the next turn will diverge. When no request is waiting it then sends a short park prompt, so the finished prompt's
  state is saved to the RAM prompt cache in idle time, not on the next request's clock. Use either with `slots`
  `{ count: 2 }`, `cacheRamMiB` 0, `ctxCheckpoints` 3 and `parkWhenIdle: false` (about 0.4-0.5 GiB VRAM, no host
  RAM; with slots the gateway compares a prompt only with the last one its slot ran, so per-speaker heads send no
  prefill and cost nothing extra), or with `cacheRamMiB` 6144 and `ctxCheckpoints` 3 (same TTFT, up to 6 GiB of host RAM
  beside ComfyUI's staging); three checkpoints keep the boundary one through the reply's own two. It only pays off when
  consecutive chat prompts share their start, which needs the stable prompt head below; with per-speaker heads it costs
  ~0.3-0.5 s per chat reply and the cache's RAM for nothing. `/status` reports `promptReuse` counts.

`node scripts/local/stable-head.mjs plan|apply|revert --data <ST user data dir> --group <id>[,<id>] [--backup <dir>]`
moves the system prompt's `{{char}}` sentences to its post-history instruction (a new `... (stable head)` system-prompt
preset, selected) and sets the named groups to "Join character cards (exclude muted)", so every member's prompt starts
the same (it puts every enabled member's card, and in join mode every member's depth prompt, into every member's
prompt: check the cards for text hidden from the other members first). `apply` backs the files up to `C:/dev/backups/story-orchestrator/stable-head-<time>/` (with a manifest that
`revert --backup` restores). Run it with that SillyTavern stopped; it is the owner's data, so it is only run on a lane
copy unless the owner asks. Not applied on this install: the blind rating of 2026-10-26 (plan v3.0 06) put it below its
floor, so the owner's preset and groups stay as they were.

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
- `streamImages` (default off; owner 2026-10-22: a stream keeps the GPU reserve, so it starts only with `minFreeGpuMiB` plus
  `reserves.gpuMiB` free, else text swaps or sheds): `{enabled, minFreeGpuMiB
  (2400), maxWeightMiB (8192), kinds (['checkpoints'])}`. On a DynamicVRAM runtime, an SDXL-sized render keeps full text
  resident (`stream-image`) and ComfyUI streams its weights from RAM; the physical-RAM reserve still applies.
  Measured in `docs/plans/v2.7/22b-residency-harvest-2026-10-07.md`.
- `idleRestoreMs`: idle full-speed restore (600000 on this install), serialized with reads and renders.
- `imageCacheMode`: `warm` (default) keeps image weights in GPU memory between compatible image jobs while reserves allow;
  `evict` also resets the cache. `cli.mjs cache-mode warm|evict` changes the running comparison arm, not disk config.
  a text request reclaims the image memory before text runs. `imageIdleGraceMs` (60000) prevents background text restoration
  between image jobs; an actual text request skips that grace. A different runtime, model files or resident text layout
  reclaims the cache before admission (a render without model files also reclaims on a different workflow). Admission on the
  same model files credits only allocations still observed from the preceding render, and measurements retain the full workload cost rather than learning a near-zero hot-start demand.
  Pressure can evict a warm cache before the next workload. ComfyUI can also reclaim its cache under RAM pressure.
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
- When reclamation is needed, image release observes RAM eviction as well as GPU release. A loader that cannot offload while cached escalates to
  cache eviction. NVML must return to the lease baseline (512 MiB tolerance), including native allocations outside torch.
- `modelLoadMode`: optional native loading-mode comparison; overrides the profile's `--load-mode`. Leave unset on
  this 32 GiB host: the measured `mmap` arm violated the physical RAM floor. `--cache-ram` (`cacheRamMiB`, default 512) is a prompt-state cache,
  not a model-weight hot store. Dense weight/layer placement is fixed at native startup; shedding restarts the backend.

`/status` names the resident/desired profile, fit target, load count/cost, objective, learned timings and image cache
  state (`imageResidency.mode` is `gpu-warm` while images stay resident). If an automatic-layer text load misses only the GPU reserve,
  the backend retries once with its measured shortfall plus a margin added to llama-server's fit target. The learned correction
  stays in memory for later loads of that profile; `/status` reports `text.fitCorrectionMiB` and `text.lastFitCorrection`.
  Fixed-layer layouts and host-RAM misses refuse directly; a second failed fit refuses and stops its owned backend.
  Context, KV settings and the admission reserves stay unchanged. Timings are invalidated when model/binary identity, loading mode or profiles change. JSON and streaming replies
are forwarded unchanged; only numerical timings are retained.

## Performance modes

Three presets switch a few controller settings at once. Each is a patch over keys the controller already reads; the
presets live in `config.json` under `modes` (edit them there) and the selected one under `mode`. A config without
`modes` behaves exactly as before: Balanced is captured from the current values the first time a mode is saved.

| Setting | Max (only playing) | Balanced (as before) | Safe (using the PC too) | Applies |
|---|---|---|---|---|
| `reserves.gpuMiB` | 1536 | 2048 | 3072 | now for images and admission; the text layout at its next load |
| `reserves.ramMiB` | 3072 | 4096 | 6144 | now |
| `streamImages.enabled` | on | on | off | now (next image) |
| `streamImages.minFreeGpuMiB` | 2400 | 2400 | 2400 | now |
| `idleRestoreMs` | 180000 | 600000 | 600000 | now |
| `keepTextResident` | on | on | on | now |
| `fitMarginMiB` | 512 | 512 | 512 | next text load |
| `imageCacheMode` | warm | warm | evict | now (next image release) |

Why these numbers (records: `docs/plans/v2.7/22-local-residency.md`, `22b-residency-harvest-2026-10-07.md`):

- GPU reserve. The desktop holds about 0.8 GiB; full `fast` text leaves about 2.7 GiB free at a 2048 + 512 fit target,
  all layers on the GPU. Max 1536 (fit target 2048, measured `--fit` undershoot ≤ 0.25 GiB still clears it) does not
  speed text up; it lets swapped images and the reload after an image clear admission more often (plan 22 saw four
  post-image reserve refusals). Safe 3072 leaves about 1 GiB more for other apps, so llama-server fits about 0.9 GiB of
  layers on the CPU at its next load: at the measured ≈38 ms per GB per token CPU-layer cost (22b row 5: 2.2 GB on the
  CPU gave 9.3 tok/s), expect roughly 15-18 tok/s instead of 31. That estimate is not measured yet.
- RAM reserve. Runs saw 9.1-17.7 GiB available on this 32 GiB host and never crossed 4096. Max 3072 admits an SDXL
  stream (≈8 GiB staging) about 1 GiB earlier; Safe 6144 makes images and text reloads wait rather than squeeze other
  apps (a text reload then needs about 9-10 GiB available).
- Streaming. Measured image→reply 23-30 s warm with text resident vs 53-144 s swapping, but free VRAM falls to
  279-520 MiB during every stream: fine when only playing, the overcommit risk when other apps use the GPU, so Safe
  turns it off. `minFreeGpuMiB` stays 2400 everywhere: a stream consumed ≈2.2-2.4 GiB of the free VRAM it started with,
  so a lower start would leave nothing.
  On 2026-10-22 a stream started with 2.5 GiB free under a 1024 MiB reserve filled the card and the text model spilled
  to shared memory (1.4 tok/s); since then the reserve is added on top.
- Idle restore. Shed text runs 3.3-3.9 tok/s and a full reload takes 21-22 s, so one 256-token reply on shed text
  (≈66-78 s) already costs more than restoring; Max restores after 3 idle minutes. With streaming on, SDXL images do not
  shed at all, so this mostly matters for hires/LoRA/edit work.
- Fit margin stays 512 in every mode: without it `--fit` left 1.8-2.0 GiB against the 2 GiB reserve.
- Image cache. Warm renders took 19-21 s vs 31-41 s cold; Safe evicts to return that RAM after each image.
- Left out on purpose: `defaultProfile`/`maxContext` (SillyTavern's preset is 32768 and the 98k profile does not fit
  beside a stream; not measured), `modelLoadMode` (`mmap` violated the physical-RAM floor), ComfyUI `--cache-ram` (fixed
  in `controller.mjs`, applies only at a ComfyUI start, unmeasured).

Use:

```
node scripts/local/cli.mjs mode                 # saved and running mode, effective values
node scripts/local/cli.mjs mode max|balanced|safe
node scripts/local/cli.mjs mode-probe           # one line for the tray; exit 255 = controller down, 2 = waiting
```

Every save goes through the same path: validate (each setting has bounds, `cli` and the page refuse anything else),
back up `config.json` to `C:/dev/backups/story-orchestrator/local-config-<time>/` (`SO_LOCAL_BACKUP_ROOT` overrides),
then write a temporary file and rename it over the config. With the controller running, the controller does the save
and applies the values to its live config between jobs: never during a running reply, image lease or restore (the
change waits and `/status` → `performance.pending` says so). Settings marked "next text load" are saved and used the
next time text loads (after an image, an idle restore, Load text); the loaded model is never restarted for them, and
`performance.atNextTextLoad` lists them until then. A controller started before this change answers `/ui` with 404;
`cli mode` then saves the file and says it applies at the next controller start. With the controller stopped, `cli`
saves directly.

**Settings page**: `http://127.0.0.1:18888/ui` (served by the controller, loopback only, no external files). It shows
live GPU/RAM free, the mode picker, and each setting with a one-line trade-off; edits save as `custom`, through the same
backed-up path. Changes need a same-origin request with the `x-so-local-ui: 1` header and a JSON body, and the page
answers only to a `127.0.0.1`/`localhost` Host, so another web page (or a DNS-rebound name) cannot change settings.
`/status` reports `performance: { mode, effective, pending, atNextTextLoad }`.

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

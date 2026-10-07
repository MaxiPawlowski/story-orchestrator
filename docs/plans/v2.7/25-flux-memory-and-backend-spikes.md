# Plan 25 — FLUX memory repair and backend spikes

**Status (2026-10-05): implemented; local/transport discovery green; overall acceptance PARTIAL. D green in plan 24's
full gate rerun; story-level Qwen image/read/reply recovery green ×2 there.** Approved by
the user. Owner: local residency (plans 22–23), independent of plan 24's
image/editor work. Goal: reliable FLUX on the RTX 3090 / 32 GiB host, minimizing image→completed-reply wait.

## Existing patterns and evidence

Reuse `scripts/local/scheduler.mjs`'s exclusive lease/FIFO, native profiles, `imageCache.mjs`, real render benchmarks and
source-stamped controller status. Keep the old records under `test/measurements/v2.7/local-residency/` as history.

Confirmed: ComfyUI 0.37.4 runs PyTorch 2.7.1+cu128 and falls back to the legacy ModelPatcher (installed `main.py:274`).
Driver 596.36 supports CUDA 13's documented >=580 driver floor. The same existing FLUX FP8 checkpoint rendered earlier.
Its later RAM refusal is admission evidence, not proof of an absolute hardware minimum. Current RAM estimation feeds
GPU demand into RAM and then floors learned RAM at that estimate; footprints omit the runtime/loading identity.

Sources (read 2026-10-04):
- [Comfy requirements](https://docs.comfy.org/installation/system_requirements)
- [FLUX FP8 and separate-component workflows](https://docs.comfy.org/tutorials/flux/flux-1-text-to-image)
- [Comfy CLI semantics](https://github.com/Comfy-Org/ComfyUI/blob/master/comfy/cli_args.py)
- [CUDA driver compatibility](https://docs.nvidia.com/deploy/cuda-compatibility/minor-version-compatibility.html)
- [Nunchaku](https://github.com/nunchaku-tech/nunchaku), [Comfy plugin](https://github.com/nunchaku-tech/ComfyUI-nunchaku)
- [Comfy GGUF](https://github.com/city96/ComfyUI-GGUF)
- [DynamicVRAM repeated-run report](https://github.com/Comfy-Org/ComfyUI/issues/12927) — motivation for repeat tests,
  not evidence about this GPU's performance.

## Rules

1. One controller owns GPU-heavy work. No active text/foreign Comfy job is stopped. Normal ST chats/profiles untouched.
2. Reserves remain **2048 MiB VRAM / 4096 MiB physical RAM**; pagefile capacity is never resident RAM.
3. Preserve the tuned Artemis model, contexts, KV and sampler payload. Existing image weights stay where they are.
4. New spike weights/cache go off C:, under `D:/models/story-orchestrator-flux-spikes` (SSD1, ~56 GiB free at discovery).
   No existing weights moved or removed. Code clones/Python environments may live under C:/dev.
5. Old Python environment remains available. Provision a separate environment; verify torch/CUDA/device/kernel support
   before routing the controller to it. No in-place Python/driver/Comfy git upgrade.
6. No backend switches on a speculative speed claim. Spike results include cold/warm loading, RAM/commit/VRAM peaks,
   failures, image validity and next-reply cost. Floor misses stay misses.
7. No automatic commits. Record commands, versions/pins, hashes, outcomes, rollback and deviations in the gate record.

## Workstreams

### A. Independent memory accounting and provenance

- Separate GPU and additional-RAM estimates. RAM uses verified observed peaks or an explicit loader/storage-aware
  estimate, never a mandatory GPU-sized floor. Estimates remain distinct from observations.
- Footprints keyed by model identity, graph/geometry, Comfy commit, torch/CUDA and loading/cache flags. Legacy records
  remain readable as history but cannot verify a different runtime. Separate cold and warm observations.
- Capture physical RAM/commit at sufficient cadence during load/encode/sample/offload, with the process working set
  and GPU samples. Cache reclamation must be observed before a dependent admission; monitor only owned workloads.
- Deterministic cases: different RAM/GPU needs, old-runtime rejection, invalid telemetry, cache state, transient peaks,
  reserve refusal, no promotion from a cached output, exactly one ownership transition/release.

Gate: local tests + `npm run test:debug`; overall `npm run gates` before acceptance.

### B. Supported Comfy environment and stock FP8 baseline

- Clone and pin spike repositories under `C:/dev/st-extensions-research/`; no execution of their install scripts.
- Create an isolated Python 3.12 environment and install an available stable CUDA 13 PyTorch build supported by the
  installed ComfyUI (2.12+ recommended). Pin actual resolved versions; verify RTX 3090 sm_86 support and DynamicVRAM.
- Start stock-node-only for the baseline; preserve existing Comfy/custom-node environment for rollback.
- Measure existing `flux1-dev-fp8.safetensors`, 1344×768, batch 1, 25 steps, unchanged prompt/sampler. Real seeds vary;
  model/node cache reuse is allowed, wholly cached image results are excluded.
- Compare supported default vs bounded cache/offload choices only where measurements justify a leg. `--cache-ram`
  sets headroom thresholds, not a fixed-size cache. `fast_disk` and async offload were already active in old logs.

Gate: successful stock FLUX text→image→text ×2 with fixed reserves and no model input changes.

### C. Nunchaku INT4 spike

- Pin Nunchaku + its Comfy plugin; verify a Windows/Python/torch/CUDA wheel compatible with the baseline. Do not install
  an incompatible wheel or silently downgrade the shared runtime.
- Obtain a compatible FLUX.1-dev INT4/SVDQuant model off C:. Use the same FLUX family/prompt/geometry/step count, no
  lightning/distillation/first-block cache in the comparison. Reuse or separately identify encoder/VAE weights.
- Isolated recipe/benchmark only initially; ordinary FP8 route remains available. Record API/workflow compatibility
  and LoRA refusal/support. No claim that NVFP4 hardware acceleration exists on the 3090.

### D. GGUF spike

- Pin ComfyUI-GGUF. Evaluate FLUX.1-dev Q5_K_S first (less aggressive than Q4); quantized T5 is a separately labelled
  arm only if needed. New weights off C:.
- Use the shipped loader and ordinary sampler, not a replica. Header/weight discovery must understand GGUF; a
  safetensors parser cannot estimate a GGUF model. Same geometry/steps/prompt; no source-model substitution.

### E. Selection, ST proof and handover

- Compare **total cycle**, not sampling alone: admission/load → image ready → completed 128-token next reply; also
  short-read and 256-token reply costs. Record cold and warm legs separately, repeats consecutive on one candidate.
- Promote the stock repaired route if it passes; a quantized backend remains a spike until quality/routing checks pass.
- Real ST group-chat validation on an isolated lane: captured native payload, real extraction during/after lease,
  image saved, next reply, cancellation/queue recovery. Snapshot/restore lane settings; no judge switches changed.
- Test affected custom nodes (Qwen sprite edit, alpha cutout) before changing the normal install's Comfy interpreter.
- Keep old env/config available and exact rollback instructions. Archive evidence under
  `test/measurements/v2.7/flux-memory/`; append decisions/results here and update plan 22's outstanding rows.

## Predeclared floors and decisions

| Gate | Floor |
|---|---|
| Reliability | Every required stock text→image→text run succeeds twice consecutively; no cached-image repetition |
| Memory | 2048 MiB GPU / 4096 MiB physical RAM reserves; no admitting by pagefile alone |
| Ownership | No active/foreign job interrupted; queued text resumes; cancelled text never runs |
| Quantized speed | Median total cycle at least 15% below supported FP8 baseline, cold/warm reported separately |
| Quantized quality | 6 same-prompt comparisons: valid images in all; blind human rating pending until user rates;
  no default switch while quality is pending |
| Integration | Model identities/roles unchanged except declared image backend; real ST extraction/image/next reply ×2 |

If stock FP8 cannot run under the reserves, quantized feasibility can be measured, but its relative-speed floor is
**unscorable**, not passed. If a compatible wheel/model is unavailable, record that spike blocked and continue others.

## Gate record

### 2026-10-04 — repair, both spikes and playtest selection

| Workstream | State |
|---|---|
| A | implemented; observed RAM separate from GPU/estimates; runtime/model/cache/text identity; 100 ms host/commit/NVML + owned-process RSS |
| B | isolated Python 3.12 / torch 2.12.1+cu130; sm_86 shipped; DynamicVRAM active; existing stock FP8 passes ×2 |
| C | Nunchaku 1.2.1+cu13.0torch2.11, separate torch-2.11 env; real cycle ×2 after load-timeout/cache-release fixes; latency floor missed |
| D | GGUF Q5_K_S with pinned loader, validated conservative GGUF sizing; real cycle ×2; latency floor missed |
| E | ST transport + queued real memory-profile request during FLUX ×2 on lane 1; Qwen edit + existing BiRefNet-HR cutout succeed; full runtime extraction/story-boundary acceptance still owed; D red |

Selected **stock FP8**, same existing checkpoint/prompts/sampler/geometry; no quantized route made default. Quantized
human quality gate not run: both candidates missed the predeclared latency floor, so neither is eligible for promotion.
No quality or theoretical minimum-swap-time claim follows from their valid PNGs.

#### Pins and environment

- Comfy source `8ff6dc384ba5c410266b40e137799e049459d4f2` (0.37.4), unchanged. Old global Python preserved.
- GGUF clone `6ea2651e7df66d7585f6ffee804b20e92fb38b8a`.
- Comfy Nunchaku clone `b600f879a777fdef1466c362e850f7e8c31bf89a`; Nunchaku source clone
  `302e0e97024ebd68688fe890e5df83731edf7b54`; installed published wheel 1.2.1 / CUDA 13 / torch 2.11 / cp312 Windows.
- Stock env `C:/dev/tools/story-orchestrator-local/comfy-cu130`, torch 2.12.1+cu130, torchvision 0.27.1+cu130,
  torchaudio 2.11.0+cu130 (imports verified), transformers 5.17.0; source wheels include sm_86.
- Nunchaku env `C:/dev/tools/story-orchestrator-local/comfy-nunchaku`, torch 2.11.0+cu130, torchvision 0.26.0+cu130.
  No torch-2.12 Windows Nunchaku wheel was published, so the stock baseline was also run in the matched 2.11 env.
- New weights/components/cache on D:. Download hashes matched the public LFS hashes; component tensors were extracted
  byte-identically from the old FP8 checkpoint, not re-quantized. Pins/provenance/environment manifests and PNGs in
  `test/measurements/v2.7/flux-memory/`; `summary.md` keeps failures and named fixes visible.

#### Measurements (1344×768, batch 1, 25 euler/beta steps; next reply 128 tokens)

| Candidate | Render s | Total cycle s | Result |
|---|---|---|---|
| Stock FP8 / torch 2.12 | 48.592 / 41.495 | 81.936 / 73.748 | pass ×2; min physical RAM 18139 MiB, GPU 3997 MiB |
| GGUF Q5 / torch 2.12 | 79.780 / 76.809 | 116.511 / 113.892 | passes memory/reliability; slower, rejected as default |
| Stock FP8 matched torch 2.11 | 49.605 / 57.749 | 90.687 / 105.255 | comparison baseline; both cache conditions cold/unknown |
| Nunchaku INT4 / torch 2.11 | 44.249 / 42.088 | 75.244 / 106.566 | median ~7.2% below matched baseline, below 15%; rejected as default |

These are whole-cycle, as-installed timings (existing FP8 on C: NVMe, new quants off-C: SSD); not generic engine-speed
claims. Nunchaku sampled in ~12 s but loading/release/next-text costs dominate. Its loader cache had to be evicted,
so neither successful run qualifies as retained-model warm reuse.

Failed trials retained:
- First stock measurement mixed slow status samples into an otherwise healthy 100 ms trace. Fixed the periodic lease
  sampler to use the fresh seam; recorded as failed, not rescored as accepted.
- GGUF repeat exposed RAM-cache eviction acknowledgement: GPU already empty did not mean RAM eviction landed. Release
  now waits for physical-RAM evidence; profile restoration unloads its owned reduced process before pricing new RAM.
- Nunchaku blocked the Comfy API during its ~18 s native load, exceeding the old 10 s GET budget. Bounded Comfy request
  deadline now 60 s; no generation is retried into a passing sample.
- Nunchaku retained ~6.7 GiB while its loader stayed cached. Warm release now escalates to cache eviction; idle-only
  native pool trim is exported by the pinned engine (`csrc/utils.h`, `pybind.cpp`) and guarded against every running or
  pending Comfy job. NVML baseline check protects text from an unobserved native allocation. Owned idle controller
  trees recovered through the existing `recover.mjs`; no foreign process/job stopped.
- Initial cutout fixture omitted optional UI defaults (`mask_blur`), then mislabeled the immediate history error as a
  timeout. Fixture supplies the published inputs and detects error history; named fixed run succeeds.

#### Commands and checks

- Final `node --test "scripts/local/*.test.mjs"`: **58/58**.
- Final `npm run test:debug && npm run typecheck:test && npm run debug:typecheck`: **1023/1023**, both typechecks clean; includes idle-pool refusals via 3
  Python tests, RAM/VRAM separation, provenance, high-cadence freshness, async RAM acknowledgement and cache escalation.
- `npm run gates`: typecheck/typecheck:test/lint green; **6384 passed, 2 failed, 1 skipped**. Red at the concurrent
  `SpriteBuilder.tsx` length ratchet and its `adopt` error-copy row. Floors/ratchets untouched. Later build/release/replay/
  plugin/Storybook steps not reached; overall D is **NOT green**.
- `node scripts/local/render-benchmark.mjs <candidate> auto background 128 --summary` ×2 per recorded successful arm.
- `node scripts/debug/st-lanes.mts run 1 -- scripts/debug/st-local-transport.mts <normal candidate>` ×2: the browser's
  genuine Connection Manager memory-profile call waits (`imageLease=true`, `waitingText>0`, `activeText=0`) behind real
  FLUX, then completes; renderer and next reply succeed. Temporary lane-only profile API restored; lane stopped.
  This is transport/queue proof, **not** a story's `runExtractionNow` audit/boundary acceptance. The served lane build
  exposed no dev runtime handle, so no mock was substituted for that missing check.
- `customNodeCheck.mjs`: fixed existing BiRefNet-HR cutout succeeds using installed weights; no model downloaded to C:.
- `SO_BENCH_REFERENCE=<owned upload> node scripts/local/render-benchmark.mjs <normal candidate> auto edit 128 --summary`:
  real Qwen 2.1 edit 24.341 s, full cycle 93.556 s, next text 32 tok/s, reserves held.
- `git diff --check` clean. Final citation check recorded at handover.

Final default-config smoke after selection: controller `2494f13f68b1`, stock 2.12.1+cu130, original custom nodes enabled.
`render-benchmark.mjs <default config> auto background 128 --summary` ×2: renders **47.745 / 44.520 s**, full cycles
**80.325 / 77.043 s**, next reply **31.94 / 32.01 tok/s**. Min physical RAM **18972 MiB**, GPU **3994 MiB**; no queued or
active job left. Records `render-stock-background-auto-1791154943499.json` and `render-stock-background-auto-1791155026803.json`.
`node --test scripts/release/citations.test.mjs`: **4/4**; citations and archive paths resolve.

#### Playtest selection and rollback

Only the default controller's interpreter/telemetry interpreter/extra args/model cache were selected for supported
stock **playtest**, not formal acceptance. Original Artemis/model/profile/context/KV/ST profiles/chat data untouched.
Original config backed up at `C:/dev/backups/story-orchestrator/flux-runtime-config-2026-10-04.json`; old interpreter
still installed. Normal candidate enables the original custom-node directory (no research clones auto-loaded).

Rollback when both queues are idle: stop through `cli.mjs stop`, restore that backed-up config to the default config,
then `cli.mjs start` + `start-comfy` + `automatic`. Never restore config or restart while a generation/job is active.

Outstanding: full D after the external guards are resolved; end-user group-story extraction/audit/boundary/image
integration ×2 on the final served build. Quantized quality ratings are unscored and no quantized default is accepted.

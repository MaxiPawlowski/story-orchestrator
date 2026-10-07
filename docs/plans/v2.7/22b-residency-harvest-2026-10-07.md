# Plan 22b — Residency review, harvest and arms (2026-10-07)

Follows `22-local-residency.md` and `23-local-residency-freetoken.md`. Owner premise: do not unload all text layers for an
image; use host RAM as cache to preload or side-load model pieces. Branch `v2.7-local-residency-review`.

Host: RTX 3090 24 GiB (desktop holds ~0.8 GiB), i9-9900, DDR4-2400 dual channel (≈26 GB/s effective, measured from the
shed profile), PCIe 3.0, model on a Crucial P3 NVMe. Artemis-31B Q4_K_M: 17,806 MiB CUDA weights + 1,102 MiB host,
KV 1,998 MiB at 32k, compute 376 MiB; full `fast` leaves ≈2.7 GiB free. ComfyUI 0.37.4, torch 2.12.1+cu130,
comfy-aimdo 0.5.5 (DynamicVRAM, NVML pressure on). Physical RAM available during the runs: 9.1–17.7 GiB.

## Review findings

| # | Sev | Finding | State |
|---|---|---|---|
| 1 | High | No automatic recovery. Text loads only on demand; `restoreIfIdle` restores only a *shed* backend (`fitTargetMiB !== null`) and `stopOwned` resets the fit target on failure, so after a swap or a failed load nothing reloads. A failed request (409) pauses ST extraction install-wide, so no request comes and the controller sits with `lastError`. Reproduced on the as-found code: `live-check`'s shed load was refused for RAM and left text unloaded. | Fixed: `scheduler.keepResident` (timer), 5 s grace after a lease, backoff 5 s → 60 s, clears `lastError` on success |
| 2 | High | `backend.start` priced admission with two `Get-CimInstance` calls in a fresh PowerShell (≈2 s, 15 s timeout, transient failure: today's `lastError`), while the NVML/`GlobalMemoryStatusEx` probe already ran at 100 ms. | Fixed: backend takes the fast probe (`NativeBackend(config, { snapshot })`), CIM only as its fallback |
| 3 | High | A physical-RAM refusal in `imageCache.free` during `releaseOwned` threw, the lease was never cleared and every text request stayed blocked behind it (wedge under today's RAM). | Fixed: refusal recorded, lease cleared; the backend's own admission decides the reload |
| 4 | High | `render-benchmark.mjs` broken since the catalog rewrite (`CHECKPOINTS`/`WAI`/`JANKU`/`family.upscaler` gone). | Fixed (checkpoints from config or the WAI/JANKU defaults, upscaler `RealESRGAN_x4plus_anime_6B`) |
| 5 | Med | Top-level `lastError` stayed stale after a successful manual load/restore. | Fixed |
| 6 | Med | "Full" is not guaranteed full: `--fit on` + `--n-gpu-layers auto` loads fewer layers when VRAM is short; the backend only prices the spill in RAM, so `fast:full` timings can describe a partial layout (A portrait run 2: 113 s load, 22 tok/s). | Open: assert `offloaded 61/61` or use `-ngl all` for the full profile |
| 7 | Med | `live-check` needs ≈18 GiB available RAM for its shed step; under today's RAM it fails and (as-found code) leaves text unloaded. | Open (harness) |
| 8 | Med | ComfyUI `/system_stats` reports `vram_free` 23.8 GB while llama holds 21 GB; only aimdo's NVML pressure sees other processes. Estimates read from Comfy cannot be trusted next to text. | Info |
| 9 | Low | `reserve()` busy-polls at 100 ms; `releaseOwned` keeps the lease (text blocked) while a foreign job drains the queue. | Open |

Tests: `node --test "scripts/local/*.test.mjs"` 70/70 (5 new: retry with backoff, reload after a swapped image, release
wedge, `stream-image` decision, its five refusal controls).

## Harvest

Clones in `C:/dev/st-extensions-research/<name>` (shallow): llama.cpp `b86d2f07542b`, ik_llama.cpp `c069e89e1020`,
koboldcpp `f9a32456edd3`, ollama `468e7e500842`, exllamav3 `151539c77abc`, FreeToken `d3512b43affe`, ollm `a6df772f5c01`;
ComfyUI read from the installed `C:/dev/ComfyUI` @ `8ff6dc38`. **HyperQwen does not exist** under that name; closest is
oLLM (wzk20/ollm, SSD layer streaming, HF transformers + kvikio, no GGUF, Linux), taken as the stand-in.

| # | Project | Mechanism | Where | Applies here? | Expected / measured | Verdict |
|---|---|---|---|---|---|---|
| 1 | ComfyUI | DynamicVRAM (comfy-aimdo): weights paged to the GPU on demand, NVML pressure counts other processes | `main.py:71-74,273-301`; `comfy/cli_args.py:175-183`; `comfy/model_patcher.py:1750,2147` | Yes (controller interpreter) | **Measured: SDXL renders next to full Artemis in 19–24 s warm, text untouched** | **Adopt** (`stream-image`, owner gate) |
| 2 | ComfyUI | `--reserve-vram` → aimdo simple headroom; `--vram-headroom` | `comfy/model_management.py:877-891`; `main.py:72` | Weights only | Measured: 2 vs 4 GiB made no difference to the floor (activations decide, ≈350–520 MiB free) | Keep 2 |
| 3 | ComfyUI | Pinned host buffers (≤40 % RAM on Windows), async offload streams | `comfy/model_management.py:1613-1621,1373-1385` | Yes | Streaming cost ≈ +5 s on scene vs fully resident (19 vs 13.5 s) | Default |
| 4 | ComfyUI | Legacy partial-load formula (no aimdo) | `comfy/model_management.py:1022-1034` | Tray "Start ComfyUI" interpreter only (torch 2.7.1 cu128, per harvest; not re-verified) | — | No; use the controller interpreter |
| 5 | llama.cpp | `-ot`, `--n-cpu-ffn N` (in b11388) | `common/arg.cpp:2757,2790-2799` | Yes | ≈ 32 + 38 ms/GB/token; **measured N=10 (≈2.2 GB): 9.3 tok/s** plus a 22 s reload each way | No (dominated by #1) |
| 6 | llama.cpp | `--fit`/`--fit-target` (today's shed) | `common/arg.cpp:2881-2940` | Yes | 3.3 tok/s measured earlier | No |
| 7 | llama.cpp | `--load-mode none/mmap/mlock/dio` | `common/arg.cpp:2694-2711`; `llama.cpp/src/llama-mmap.cpp:87,120-135` | Yes | **Measured none 22.1–22.3 s, dio 22.0–22.2 s** (dio is buffered on Windows) | No gain |
| 8 | llama.cpp | `--sleep-idle-seconds`, router `/models/load|unload` | `tools/server/server-context.cpp:1055-1070` | Same cost as a restart | — | Watch |
| 9 | llama.cpp | `GGML_CUDA_ENABLE_UNIFIED_MEMORY` | `ggml/src/ggml-cuda/ggml-cuda.cu:144` | Linux only; Windows = driver sysmem fallback | — | No |
| 10 | llama.cpp | `--lazy-mode` per-layer embeddings | `common/arg.cpp:2713-2723` | No (`embedding_length_per_layer_input = 0`) | 0 | No |
| 11 | ik_llama.cpp | `-rtr`, `-op` offload policy, fused up-gate, Gemma 4 graph | `common/common.cpp:2443,2759`; `ik_llama.cpp/src/graphs/build_gemma4.cpp` | CPU side stays RAM-bound | +10–20 % on CPU layers at best | Watch |
| 12 | koboldcpp | Startup layer guess, `sdoffloadcpu` swaps the SD model, admin reload | `koboldcpp.py:1809-1818,2143,7511-7525` | Static split | 0 | No |
| 13 | ollama | Scheduler: evict idle runners, predicted fit, `OLLAMA_GPU_OVERHEAD` | `server/sched.go:1318-1345,1694-1720`; `envconfig/config.go:305` | Already the controller's shape | 0 | No |
| 14 | exllamav3 | `load_gen` reserves; CPU offload MoE-only; no GGUF | `exllamav3/model/model.py:459-530,583-678` | Needs EXL3 conversion + new backend | — | No |
| 15 | FreeToken | FTW O_DIRECT + pinned staging + prefetch; budget math; refuse a rebuild that would fail before teardown | `python/freetoken/checkpoint/ftw.py:212-258`; `engine/cache_budget.py:31-48`; `engine/engine.py:895,971` | Pattern only | "Check before teardown" | Adopt the pattern (#1/#3 fixes do the recovery half) |
| 16 | oLLM | SSD layer streaming | `README.md:68` | Dense 31B ≈ 1 tok/s | — | No |

Gemma-4 specifics: sliding-window KV is already small in mainline (638 MiB of the 1,998 MiB at 32k); no fork needed.

## Arms (live, 3090, 128-token reply)

Records are private evidence (so-sessions): `evidence/measurements-v2.7/local-residency/2026-10-07/`. "Image→reply" is
lease/render start to the completed 128-token reply. Low GPU = lowest free VRAM in the run; reserves 2048/4096 MiB.

| Arm | Family | Image s | Image→reply s | tok/s | Peak VRAM / low GPU free | Low RAM avail | Record |
|---|---|---|---|---|---|---|---|
| A swap-text (as-found policy) | scene | 28.6 / 27.7 | **67.0 / 93.9** (reload 29.5 / 58.4) | 30.7 / 31.9 | text absent / 13.9 GiB | 13.5 / 14.1 GiB | `render-stock-scene-auto-1791400171730.json`, `…1791400272507.json` |
| A swap-text | portrait | 20.2 / 19.5 | **53.5 / 144.0** (reload 25.1 / 112.7) | 31.3 / 22.2 | — / 13.9 GiB | 16.6 / 15.2 GiB | `render-stock-portrait-auto-1791400332306.json`, `…1791400483458.json` |
| B text resident, Comfy streams (harness) | scene, Comfy reserve 2 | 40.8 cold / 19.8 | 45.4 / **24.1** | 28.6 / 31.1 | 24.3 GiB / 279–366 MiB | 9.6 GiB | `arms-resident-r2-scene-1791400525640.json` |
| B, Comfy reserve 4 | scene | 31.5 cold / 19.1 / 19.0 | 35.6 / **23.2 / 23.1** | 32.3–32.5 | 24.2 GiB / 345–446 MiB | 10.3 GiB | `arms-resident-r4-scene-1791400979062.json` |
| B | portrait | 35.8 cold / 20.4 / 20.4 | 39.9 / **24.5 / 24.5** | 32.2–32.4 | 24.2 GiB / 350–409 MiB | 9.1 GiB | `arms-resident-r2-portrait-1791400758918.json` |
| B through the controller (`stream-image`) | scene | 32.4 / 41.4 / 21.2 | **38.7 / 47.6 / 27.4** | 31.2–31.4 | — / 399–440 MiB | 10.3–10.7 GiB | `render-stock-scene-auto-1791402009092.json`, `…2062941.json`, `…2096558.json` |
| B through the controller | portrait | 30.4 / 24.2 | **36.4 / 30.3** | 32.0 | — / 457 MiB | 10.3 GiB | `render-stock-portrait-auto-1791402139081.json`, `…2175468.json` |
| C `--n-cpu-ffn 10` while imaging | scene | 25.1 / 17.4 | 62.3 / 53.9 (reduced reload 22.2 / 21.7; restore 20.7 / 20.4) | **9.3 / 9.3** | 24.1 GiB / 516 MiB | 10.6 GiB | `arms-ffn-ffn10-r2-scene-1791401138569.json` |
| D reload, `--load-mode none` | scene | 20.5 / 13.5 | 50.4 / 43.4 (reload 22.3 / 22.1; hot reload 21.0 / 21.2) | 31.5 / 31.8 | 21.7 GiB / 2.9 GiB | 13.8 GiB | `arms-reload-none-r2-scene-1791401384390.json` |
| D reload, `--load-mode dio` | scene | 20.2 / 13.6 | 49.8 / 43.5 (reload 22.0 / 22.2; hot 21.2 / 21.7) | 31.3 / 31.2 | 21.7 GiB / 2.9 GiB | 14.0 GiB | `arms-reload-dio-r2-scene-1791401598464.json` |

No OOM, no failed render, RAM reserve never crossed. WDDM shared usage rose ≈5 GiB during most B/C runs and not in D; with
llama's tok/s unchanged this reads as aimdo's pinned host buffers (which WDDM counts as shared), not a text spill — not
proven per process. B crosses the 2 GiB GPU reserve (low free 279–520 MiB) in every run.

D: a reload "hot" from page cache took the same 21 s as one after a render: with 14 GiB available the 17.4 GiB GGUF does
not stay in standby. A page-cache reload (≈7 s, measured 2026-10-04 on a freer host) needs ≈ 17.4 GiB GGUF + 4 GiB
reserve + ComfyUI's SDXL RAM (1–7 GiB, cache-dependent) ≈ **23–29 GiB available**, 9–15 GiB more than today; mmap would
also count the mapped pages as in use (refused twice before). Not reachable on 32 GiB with the owner's apps open.

## Verdict

Premise confirmed for SDXL, inverted in direction: the win is to keep **all** text layers and let the *image* model live
in RAM (DynamicVRAM streams it). Image→reply drops from 53–144 s (swap, reload 25–113 s, highly variable under RAM
pressure) to 23–25 s warm / 36–48 s cold, with full 31–32 tok/s and the prompt cache intact. Moving text layers to RAM
(C) costs 9.3 tok/s plus a 22 s reload each way; reload-mode changes (D) save nothing on this RAM.

## Built (contained)

- Recovery: `keepResident` + fast admission probe + release-wedge fix + stale `lastError` (findings 1–5), with tests.
- `stream-image` decision in `scheduler.reserve`, **off by default** (`streamImages`), measured above through the real
  controller with a scratch copy of the config; the installed config is unchanged.
- `scripts/local/residency-arms.mjs` (the B/C/D harness) and the `render-benchmark` repair.

## Proposed (owner approval)

1. **Enable `streamImages` for SDXL checkpoints** in `config.json`. It lowers the GPU headroom during a stream lease from
   2048 to the measured ≈300–500 MiB (desktop compositor still had ≈0.8 GiB of its own). Expected: image→reply 23–30 s
   warm, 36–48 s cold, vs 53–144 s. Footprints recorded under it never verify (they cross the reserve) by design.
2. Set the NVIDIA "CUDA – Sysmem Fallback Policy" to **Prefer No Sysmem Fallback** for `python.exe` (comfy-cu130) and
   `llama-server.exe`, so an overcommit fails fast instead of silently spilling (driver setting, owner's action).
3. Qwen edit / sprite (≈16 GiB) next to resident text: RAM-bound (needs ≈14 GiB pinned + 4 GiB reserve); measure the
   same B arm once ≥ 18 GiB is available, else keep swapping.
4. Finding 6: make the full profile assert `offloaded 61/61` before its timings count as `full`.

## Gate record — 2026-10-07

- `node --test "scripts/local/*.test.mjs"`: 70/70.
- `npm run gates -- --no-storybook` (ST_ROOT `C:/dev/SillyTavern-MainBranch`): all green in 183.3 s (typecheck, typecheck:test, debug:typecheck, test:plugin, test, lint, build, test:release, test:debug, test:replay 32/32 killed); Storybook skipped. `node --test scripts/release/citations.test.mjs` re-run after the doc edits: green.
- Live: arms above; controller restarted from the main checkout (as found), `cli load fast`, real 32-token completion
  through 18888 (23 tok/s on a 7-token answer), ComfyUI up, `lastError` null. The new recovery code goes live only after
  merge + `cli stop` / `cli start`. `live-check.mjs` failed its shed step for RAM (finding 7):
  `evidence/measurements-v2.7/local-residency/2026-10-07/live-check-1791402249457.json`.

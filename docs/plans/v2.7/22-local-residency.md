# Plan 22 — Local residency controller

**Status (2026-10-04): v2.7 plan 22 (was `v2.8/local-residency.md`; moved to v2.7 on 2026-10-04 because it is the
current work). IN BUILD, approved 2026-10-04.** Local Artemis replies and extraction; DeepSeek image direction and
cloud judge retained. Text→image→text live green 2026-10-04 (Gate record; the VRAM arbiter below is the current
slice). Owner tier: LT (local text model) + LI (local image model); these live rows stay the plan's own, not v2.8 01's.

## Existing patterns

Reuse the GPU lease contract in `server-plugin/story-orchestrator-gpu`, owned media jobs, the existing image graphs and ComfyUI's dynamic memory management. Native llama-server provides the same Text Completion request path as RunPod. Preserve Unsloth and the separate existing `gemma4-mtp` llama-swap configuration.

## Protocol

1. Read current physical RAM, commit headroom and GPU free memory. Pagefile capacity is not resident RAM.
2. Verify the installed native binary, then measure Artemis at the existing 98k context with supported q8 KV and an explicit reserve. No automatic context truncation.
3. Measure the existing scene graph alone, then text–scene–text with full swapping and residency retained where admission allows. Background, edit, sprite, LoRA and hires families follow.
4. Reserve 2 GiB additional GPU headroom and 4 GiB physical RAM. Calibrate performance limits on discovery baselines before comparative acceptance. Do not weaken existing project floors.
5. Keep one lifecycle owner. Queue GPU-heavy work, never unload active generations or interrupt a foreign ComfyUI job. Unknown workflows use conservative swapping until measured.
6. Stock layer/KV placement changes require reload unless the pinned backend proves otherwise. Saving KV across different layouts is not assumed safe.

## Delivery

Bounded local gateway, explicit load/unload/status, telemetry-based admission and measured workflow profiles. Native TC profiles preserve the tuned RunPod prompts and sampler payload, local memory profile replaces cloud extraction, image director remains cloud. Tray controls and installation verification are required.

## Pattern harvest

FreeToken supports dense Gemma-4 as well as MoE. Its HF/FTW loader is not proven compatible with the existing Artemis GGUF. Harvest budget partitioning, measured transfer costs and hot/cold cache policies; do not claim its expert-cache resizing can migrate llama.cpp layers or ComfyUI allocations. Reviewed @ `d3512b43affe981465e03ee28cbd88f49c39b9aa`: no code ported — verdicts, the resident-profile conclusion and the semantic-KV watchlist in `23-local-residency-freetoken.md`.

## Gate record

**2026-10-04 — text→image→text through ST on the local stack (dev flavor, real LLM).**

Build: served page = staged slot = `dist-dev/index.js` = `10823ba92023` (dev). Repo `dist/` holds the gates prod build `fd812c813ef5`; `so-run-header` warns served≠repo `dist` — expected on a dev-flavor live run.

Deterministic gates (same day): `npm run gates` green ×12 (typecheck, typecheck:test, lint, test 186.9 s, build, build:dev, test:debug 970, debug:typecheck, test:release, test:replay 220 s, test:plugin, test-storybook:ci 510/510). `test:local` was folded into `test:debug` and `managed.test.mjs` into `test:plugin` — `GATE_STEPS` stays pinned by `gates.test.mjs`.

Live run, chat `2026-10-04@10h49m01s175ms` in group `Adolion - The Saga`, story `adolion-saga`, artifacts in `SO_DEBUG_DIR` (`C:\dev\so-lanes\0\debug`, benchmarks under `local-residency\`):

1. **Text**: `st-actions send` → narrator/Belle replies; payloads `api_type: llamacpp` → `api_server http://127.0.0.1:18888`, native body with `min_p 0.05`, `mirostat_mode`, `rep_pen`, `dry_sequence_breakers` as an array, `truncation_length 98304`. Controller loads `fast` on demand.
2. **Extraction**: `runExtractionNow` → 4 audits (`live-gate-local-3`, `cadence`, `cue:guild-hall->adv-guild-tavern`, `scene:location`), `rejected: 0`, scheduler idle, boundary 1→2, cue read fired a real transition. STORY STATE READ payloads → 18888 llamacpp via memory profile `55f61212`.
3. **Image**: `/so-image scene …` → `data/default-user/user/images/1790528943291/director_1791122633308_2679200969.png` (1,489,443 B). Controller `lastDecision: swap-text`; gpu plugin `/api/plugins/story-orchestrator-gpu/status` answers through the managed adapter (controller proxy); media plugin ready (127.0.0.1:8188). Director = deepseek profile, unchanged.
4. **Text after image**: three sends 14:06–14:10 refused (`The loaded profile violates the measured memory reserve.`, 4 native load logs in the stateDir) — a ~4 min post-render admission window; `cli load fast` passed at 14:12 (GPU free 2548 MiB post-load), next `send` replied (410-char narrator reply, native payload).

Findings (no product code changed):
- `textgenerationwebui_settings.type` stayed `generic` after the profile api switch: main ran `/v1/completions` under `OPENAI_KEYS` (samplers stripped) and the CM extraction body carried `dry_sequence_breakers` as a JSON string, which llama-server b11388 refuses (400). Fix applied live: `/profile "Artemis Local (Unsloth)"` re-select sets type `llamacpp` (`slash-commands.js:291`). Install-wide settings change.
- Post-image reserve-refusal window: admission killed freshly spawned backends while free memory read adequate on the next attempt; ST gets a dead turn (gateway has no queue/backoff). Reserves 2048/4096 not retuned (predeclared).
- Controller `/status` top-level `lastError` keeps the last refusal after a successful load (`text.lastError` null) — cosmetic.
- Chat `2026-09-29@12h18m14s697ms` holds a v5 blob → unreadable by this build (read-detached, Restart-only by design); a fresh chat was used, old state untouched.
- `#so-briefing` (top-layer dialog) blocked the first sends: nothing posted while `send` reported `replied: true` from the greeting; closed with `dlg.close()`.

Deviations: live run on dev flavor (harness requirement); background/edit/sprite/LoRA/hires families (protocol step 3) not yet measured.

### Follow-up 2026-10-04 (harvest + the two isolated fixes)

- FreeToken harvested (clone @ `d3512b43affe981465e03ee28cbd88f49c39b9aa`): no code ported; verdicts and the resident-profile
  conclusion in `23-local-residency-freetoken.md`. Drives the replanned design below.
- Admission backoff: `backend.start` no longer kills a freshly loaded profile on the first reserve miss — it re-measures for
  `admissionWindowMs` (default 30000) and only fails after the window (`backend.mjs`); the accept test is the pure
  `withinReserve` (`policy.mjs`). Targets the observed 4 refusals in the ~4 min after a render.
- Footprint promotion: `scheduler.release` keeps the last 3 observations per workflow key and sets `verified` only after
  two consistent ones (`stableSamples`: spread ≤ 15% + 512 MiB); one run never verifies. Retention stays off in production
  until the page-side workflow key is wired (deferred to the replan).
- Gate: `node --test scripts/local/policy.test.mjs scripts/local/scheduler.test.mjs` 12/12; `npm run test:debug` **974/974**
  (the 3 new cases included). `test:plugin` not run — no `server-plugin/**` file changed. The running controller must be
  restarted (`cli stop` + `cli start`) to pick up the backoff.

### Replan inputs (unresolved)

- Shedding goal fixed: lower the per-image swap (never full unload). llama.cpp b11388 has no runtime layer change, but
  `--fit on --fit-target <MiB>` leaves the target free, so a **resident reduced profile** (never unload, image always
  retains) is the design; "one thing at a time" confirmed (text paused during a render). Idle-restore of full speed is
  desired ("why not").
- Fit target: scene = WAI (9058 MiB measured); portrait = JANKU; background = FLUX. Per-family vs worst-case, and the
  FLUX/hires footprints, to be measured.
- Retention wiring (page-side `workflowKey` in `gpuBroker`/`src/image`) deferred to the replan.

## Plan — VRAM arbiter (approved 2026-10-04)

> Superseded by v2.7 31 (2026-10-07) for FLUX: the FLUX background route and its swap/footprint text below are history; backgrounds render on SDXL.

One RTX 3090 (24 GB). Text = Artemis 31B GGUF (full ≈ 21–22 GB VRAM). Image weights read from disk (no load): SDXL
`wai`/`janku` 6.94 GB (measured scene peak 9058 MiB) · FLUX `flux1-dev-fp8` 17.25 GB · Qwen-Image edit ≈ 17.3 GB. Only
**SDXL** can co-reside with text; **FLUX/Qwen always swap** (physical limit). Decisions: FLUX/Qwen keep swapping;
estimate-only + passive learning (no dedicated benchmark renders); estimator + dynamic arbiter + 10 min idle-restore.

1. **VRAM estimator, no load.** `scripts/local/safetensors.mjs` reads the 8-byte length + JSON header and sums
   `data_offsets` → exact weight bytes. `scripts/local/estimate.mjs` adds an activation margin seeded from the SDXL
   measurement (9058 − 6938 ≈ 2120 MiB at 1344×768), scaled by pixels, plus a pass-2 term for hires; deliberately
   conservative.
2. **Page wiring.** `src/image/renderFacts.ts` (pure) turns the plan into `{modelFiles, width, height, hires}` plus a
   `workflowKey`; `gpuBroker.reserveGpu` sends them; `src/image/runtime.ts` and the sprite builder pass them (this also
   lands the deferred retention key). The controller resolves the model bytes itself from `config.modelDirs` and estimates
   (`scripts/local/models.mjs`) — one estimator, no extra plugin route.
3. **Dynamic arbiter.** `scheduler.reserve`: need = verified measured footprint ?? `needGpuMiB` ?? conservative default;
   retain if full text + need + reserve fits; else shed text (`--n-gpu-layers auto --fit-target = need + reserve`,
   `--fit-ctx` pinned) and retain; else swap. `NativeBackend.load(name,{fitTarget})`; `desiredProfile` vs
   `residentProfile`; the fixed `sharing` profile is retired.
4. **Idle-restore.** No lease for 10 min → reload `desiredProfile`; reset on any lease. `status()` exposes the decision
   and both profiles.
5. **Passive learning.** Record `peakGpu`/`lowRam`/`decision` for every lease (was swap-only) so estimates converge from
   real play; keep the 2-consistent-run promotion.
6. **Validation.** Estimator checked against SDXL 9058; FLUX/Qwen estimated then refined by their first real render. Live
   text→SDXL image (expect shed/retain, no post-image reload) → text; text→FLUX image (expect swap) → text.

Gates: `test:debug` (scripts/local), `test:plugin` (media route), `typecheck/typecheck:test/lint/test/build` (`src/`),
live real-LLM per family. Controller needs a `cli stop` + `cli start` to go live. `GATE_STEPS` untouched. Risks: an
under-estimate is caught by the measured precedence and the post-load reserve check (now with the backoff); shed text is
~3.9 tok/s until idle-restore.

### Arbiter gate record — 2026-10-04

As-built deviation: estimation lives in the controller (`scripts/local/{safetensors,estimate,models}.mjs`), not a media
plugin route; the page sends `{modelFiles, width, height, hires, workflowKey}` and the controller sums header bytes.

- Estimator: SDXL scene estimated **9059 MiB** vs measured **9058**; FLUX estimated 18890 (measured footprint 20560).
- Real renders through the controller (`render-benchmark.mjs`, real ComfyUI + real llama-server text):
  - `shed scene`: decision **shed-text**, admitted free 10598, render 38.4 s, image 1.41 MB, `textAfter` 18.9 s at
    2.95 tok/s with **no reload** (the ~22 s swap avoided).
  - `shed background` / `swap background`: FLUX need > shed ceiling → **swap-text**, render 78–84 s; `textAfter`
    reloads to full **30.5 tok/s**.
- ST page path: `/so-image scene …` → controller received the page's need **9059** (not the 12000 fallback) and chose
  **shed-text**; image saved under `data/default-user/user/images/1790528943291/`.
- Defect found and fixed live: a stale shed fit-target survived an unload, so the text after a **swap** reloaded shed
  (2.9 tok/s). Fixed: `backend.unload()` clears `fitTarget` unconditionally, and the swap branch always unloads. Re-ran
  the FLUX swap → `textAfter` 30.5 tok/s. Tests: `a swap clears the shed intent`, `a shed profile returns to full speed
  after the idle window`, the four decision cases.
- Open observation: after the ST shed-image, a concurrent extraction read can reload the text at full, discarding the
  shed state (needs a dedicated look; the unit tests cannot see the read/image interleaving).

Gate outputs: `node --test scripts/local/*.test.mjs` 24/24; `npm test` 530 suites / 6375 passed; `npm run test:debug`
**987/987**; `npm run build` green (bundle `43f794c89133`); `typecheck`, `typecheck:test`, `lint` clean. `test:plugin`
not run — no `server-plugin/**` file changed. Live staging: dev `958d869a9945` in the ST slot for the page check; `dist/`
restored to prod.

## Completion — total wait (approved 2026-10-04)

User chose total image-to-completed-reply wait over the shortest model switch, then approved implementation. This
supersedes the always-shed preference. Completion is owned by plans 22–23; plan 24 consumes the broker interface.
Existing reserves and acceptance repetitions stand.

Reuse the lease/FIFO scheduler, native fit profiles, ComfyUI's CPU offload and RAM-pressure cache. FreeToken contributes
bounded host residency, measured transfer costs and prevalidation before teardown; its MoE expert cache is not a dense
GGUF layer-migration mechanism.

1. Serialize restore/load/unload with text and image work; preserve the fit target on auxiliary/extraction requests.
2. Enforce fresh GPU + physical RAM + commit admission before an image lease, including the 2048/4096 MiB reserves.
3. Offload image models without resetting the execution cache; evict the RAM cache only when the next workload needs
   the headroom. Compare supported native loading modes, never pin the full model blindly on this 32 GiB host.
4. Record load, prefill and decode costs; choose shed/reload from total cost, retaining the conservative swap fallback
   when a reduced profile has no measurement. Preserve the short-switch objective as an explicit benchmark arm.
5. Measure scene/portrait/background/edit/sprite/LoRA/hires, interleaving and restore; archive LT/LI runs ×2 and run
   `npm run gates`. A below-floor or unavailable family stays open, never accepted by a unit test.

### Completion gate record — 2026-10-04 (PARTIAL, not accepted)

Built: exclusive lifecycle ownership, preserve-fit auxiliary/CC readiness, pre-load spill pricing against the requested
fit target, fresh GPU/physical-RAM/commit image admission, one release per lease, pressure-driven Comfy RAM-cache
eviction, passive numerical reply/load timings and total-wait decisions. Full context promotion also promotes the
desired profile. Explicit restoration, idle restoration and cache controls share ownership with reads and images.
Controller `/status` now stamps its loaded source (`controllerBuild`); no FreeToken code or new weights were installed.

Runtime: controller source `f94b52b2e861`; native b11388; existing profiles/context/q8 KV unchanged. `imageCacheMode` warm
by default; cold/evict is a comparison arm. Native loading remains `none`: mmap failed the physical-RAM reserve twice.
Tray links corrected to v2.7. Controller restarted and left automatic, full `fast` resident; the user's ST chats and
profiles were not edited.

Commands/results:

- `node --test "scripts/local/*.test.mjs"`: **45/45** (repeated after changes).
- Final `npm run typecheck && npm run typecheck:test && npm run lint`: clean.
- `npm run gates`: first stopped at concurrent registry lint; second: typecheck/typecheck:test/lint green,
  **6384 passed, 2 failed, 1 skipped**. Failures are the concurrent `SpriteBuilder.tsx` length ratchet and its new
  `adopt` error-copy inventory row. `npx jest src/runtime/codeHealth.guard.test.ts src/runtime/errorCopy.guard.test.ts
  --runInBand` reproduced both (25 passed, 2 failed). No ratchet/floor was changed. Overall D is **RED**.
- `npm run test:debug`: **1010/1010**, including the final control/fingerprint changes (final rerun 65.994 s).
- `npm run build && npm run build:dev && npm run test:release && npm run test:plugin`: green. Prod `0f5dea92a71e`,
  dev `aefeee522f3e`; release **94 passed / 2 skipped**, plugin **102 passed / 3 skipped**.
- `git diff --check -- scripts/local docs/plans/v2.7/22-local-residency.md test/measurements/v2.7/local-residency`: clean.
- Final `node --test scripts/release/citations.test.mjs`: **4/4**; archive and plan paths resolve.

Discovery/live artifacts: `test/measurements/v2.7/local-residency/` (summary generated by `scripts/local/summarize.mjs`).
These are controller/native/Comfy measurements, **not** fresh ST-browser end-to-end acceptance or a complete ×2 matrix.

- `benchmark.mjs <config> fast none`: 21.252 s first load / 7.078 s warm load; about 31 tok/s, reserve held.
  `fast mmap`: both runs only 2304–2385 MiB physical RAM free; refused before generating. No full-model pinning attempted.
- `render-benchmark.mjs <config> auto scene 128`: warm-cache cycles 75.625 / 67.316 s, return 30.8–31.0 tok/s;
  evict comparison 72.965 s. No established cache-speed winner. Full post-image load remained about 23–24 s.
- Portrait: real first render 33.413 s / cycle 70.573 s. The second returned a wholly cached image in 16 ms;
  **excluded** as a VRAM/render repetition. Benchmark now varies render seed while preserving the footprint key.
- Hires: real renders 48.584 / 46.525 s, cycles 86.133 / 84.472 s; return 32.4 tok/s. Upscaler bytes are estimated too.
- `live-check.mjs <config>` ×2 on `f94b52b2e861`: slots/tokenize and real 16-token TC reads preserve the shed PID,
  fit target and load count; explicit restore returns full. Records `live-check-1791138064200.json` and
  `live-check-1791138118547.json`.
- `live-check.mjs <config> --cost` ×2 on the same controller: 256-token replies restore automatically, complete in
  **25.079 / 24.069 s**, at about **33 tok/s**, versus retained-cost estimates **81.710 / 79.528 s** (estimates, not
  measured control replies). Records `live-check-1791138231808.json` and `live-check-1791138300776.json`.
- `live-check.mjs <config> --idle`: the configured 600000 ms window was preserved; full restore completed at
  **627434 ms**, including reload. One discovery run, before the final control-only/fingerprint changes, not ×2.

Blocked/open:

- FLUX real request refused physical-RAM admission: existing measured additional RAM 22261 MiB + 4096 reserve =
  26357 MiB. GPU was free. Restarting idle controller-owned ComfyUI reclaimed the warm cache; fresh physical RAM about
  22934 MiB still did not meet that requirement. User authorized closing consumers; Task Manager was closed, no system
  compositor or coding session was killed. The limiting resource is RAM, not another GPU app.
- Qwen edit/sprite model-header estimate **18964 MiB**; real acceptance not run under the current RAM headroom.
- Configured LoRA directory empty; no model downloaded or moved. LoRA acceptance needs an existing asset.
- Idle ×2, ST extraction/image interleaving through an isolated browser and complete overall gates are still owed.
  Storybook/replay were not reached by the red gates chain.
- Warm Comfy references are bounded by RAM pressure, not a guaranteed pinned text-weight hot store. Dense layers still
  restart to change placement; full in-place layer migration and minimum-possible swap time are **not proven**.

Final controller family discovery, same `f94b52b2e861`, varied seeds (no cached-image repetitions):

| Family | Render s, consecutive runs | Image→completed 128-token reply s | Reply tok/s | Records |
|---|---|---|---|---|
| Scene | 38.393 / 10.138 | 74.801 / 44.183 | 32.19 / 32.48 | `render-scene-auto-1791138706940.json`, `render-scene-auto-1791138757363.json` |
| Portrait | 32.375 / 11.141 | 67.858 / 45.212 | 32.61 / 32.67 | `render-portrait-auto-1791138831498.json`, `render-portrait-auto-1791138882961.json` |
| Hires | 48.493 / 46.533 | 85.836 / 83.823 | 32.47 / 32.21 | `render-hires-auto-1791138975097.json`, `render-hires-auto-1791139065180.json` |

Command for each family, twice consecutively: `SO_LOCAL_RECORD_DIR="test/measurements/v2.7/local-residency"
node scripts/local/render-benchmark.mjs <config> auto <family> 128 --summary`. All chose `swap-text`; warm model/node
reuse is useful on scene/portrait even though the next text reload is still required. These are not a comparison
against identical cold-cache arms and not the missing ST-browser acceptance.

### FLUX follow-up — plan 25, 2026-10-04

The old 26357 MiB free-RAM admission requirement was a budget under the old loader/accounting, not a universal FLUX
hardware minimum. Plan `25-flux-memory-and-backend-spikes.md` corrects the RAM/GPU coupling and runtime provenance,
provisions an isolated supported torch/CUDA environment and measures the same FP8 checkpoint successfully twice.
Normal stock interpreter selected for playtest with backup; quantized GGUF/Nunchaku alternatives miss the total-wait
floor and remain non-default. Qwen edit and installed BiRefNet cutout work. ST transport/queued-memory request ×2
  passes on a lane; full story extraction/boundary acceptance and overall D remain owed (external sprite guards red).

### Image integration follow-up — 2026-10-05

User handed residency defects to image completion (plan 24). Its gate record owns commands and archived evidence.
Fixed learned GPU accounting (footprint revision 3: observed additional peak + 512 MiB uncertainty, fixed 2048 MiB
reserve added at admission) and verified-RAM precedence (same-runtime verified demand replaces the conservative
estimate; explicit caller demand and fixed 4096 MiB reserve remain). Old observations remain historical, unverified
or mismatched runtimes keep conservative estimates. Local tests 61/61; full `npm run gates` all 12 green (1033 debug,
6392 Jest, 517 Storybook). Controller `9247e0d271ae`.

Actual Belle on-demand edit → queued `runExtractionNow` → own real audit → next local Artemis reply/boundary green
twice, clean isolated-lane restoration. Citations: plan 24 §User comparison and residency integration, its
`test/measurements/v2.7/image-completion/runtime/` records. Qwen look matrices on this controller pass 20/20 identity
and visible-change ratings twice. This closes the missing story-level Qwen recovery proof, not the entire family,
idle, speed-comparison or sprite-visual acceptance matrix.

# Plan 10 — Max-memory profile and tray headroom toggle

**Status: misses ACCEPTED 2026-10-29 (coordinator decision, no retune); candidate L (A2 max + RAM fit + so5 light
sleep) smoke and regression list run, PAUSED for the owner's GPU use; NOT merged, NOT adopted** (branch
`v3.0-a2-maxmem`). Four floors missed as written (M3 5-member warm, M4 judge-GPU, M5 post-image hit, H1 RAM); see
§Bench record and §Candidate L. Floors predeclared 2026-10-28 before any bench. Track A2 (`00-overview.md` §Replan 2026-10-26). Owner decisions that
apply (§Owner decisions 2026-10-26): (3) max memory is the default and the tray toggle frees headroom; (2) no controller
change on the owner's install during a play session; (9) R5 48K is tried once A2 works.

Labels: **M** measured, **S** read from source, **I** inferred.

## What limits memory today

- VRAM is already full while playing (M, 09 §M): text + MTP leaves 1.6-2.2 GiB free after load, under the 2,400 MiB
  stream floor, so every SDXL image swaps text out (sleep, 09 K). The GPU reserve only decides admission beside foreign
  VRAM. A lower reserve buys nothing measurable, so Max keeps 1024.
- RAM is the free resource, and the member cache is its user. At 4 GiB the cache holds about three member states, so
  groups of four or more thrash (audit risk 6). 09 §M filled a fixed 6 GiB cache and left 7.8-9.3 GiB available,
  under the 10,240 MiB floor, so a bigger fixed number is not safe.
- The cache cannot shrink once text is up (S): `--cache-ram` is fixed at start, `makeRoom` returns 0 in RAM mode
  (`memberCache.mjs:276` on master), and `/status` reports no occupancy. The only RAM lever was dropping the whole
  sleeping server and all its states (`dropSleepingForRam`).

## Design

One RAM budget: text, member cache, an image's staging and the desktop. The cache gets whatever is left over the floor
`keepCacheRamFloorMiB` (10,240 = `reserves.ramMiB` 2,048 + ComfyUI staging 8,192, the audit floor). It shrinks first
whenever something else needs RAM.

1. **Native cache control (llama.cpp patch commit 6, `3bae32b`).** Two routes on the patched server, neither of which
   wakes a sleeping server:
   - `GET /cache` returns entries, keyed entries, MiB and limit. The main loop publishes them after every cache change.
   - `POST /cache/limit {"mib": N}` sets the limit and evicts the oldest entries, unkeyed first, down to it. While
     sleeping it applies at once, under the queue lock, while the loop thread is parked. Otherwise it applies at the next
     idle point. Binary `C:\dev\tools\llama-b11888-so4-cu128`, built from `so-cache-patch` (repo copy
     `scripts/local/llama-patches/so-cache-b11888.patch`, now all six commits).
2. **Occupancy in `/status` (A1 item).** `memberCache.native {prompts, keyed, sizeMiB, limitMiB, sleeping}`, refreshed on
   every status read, plus `lastRefit`, `lastTrim`, `trims`, `trimFreedMiB`, `refits`. On a stock server the status says
   "not reported" (`nativeReported: false`).
3. **`makeRoom` in RAM mode (A1 item).** Before an image is admitted, the scheduler's existing `onImageRam` hook lowers the
   native limit to `occupancy + available − (image RAM + reserves.ramMiB)`. This evicts the oldest states and caps
   growth for the lease. It works whether text is awake (retain or stream) or asleep (swap), and returns the freed
   bytes, so the admission re-reads RAM. `dropSleepingForRam` still runs after it, but only drops when RAM is still short.
   A stock server returns 0 and counts `makeRoomUnsupported`.
4. **`memberCache.fitRam` (new knob, live + text-load).** `budgetMiB` becomes a ceiling.
   - At each text load: `--cache-ram = available − text RAM − floor`, in 256 MiB steps, between 1024 and the ceiling.
     Text RAM is learned per profile from the previous load's RAM drop; the first load uses `estimatedRamMiB`.
     `/status` → `text.cacheBudget`, `text.textRamMiB`.
   - With `/cache`, the limit follows free RAM before every planned chat (applied and confirmed before the request runs),
     after every idle chat reply and on every settings change (refit). It keeps room for one more entry, drops at once
     and rises only by 1 GiB or more (v2, `fc6310be`, after the B3 v1 miss).
5. **Presets** (`scripts/local/modes.mjs`):
   - **max** (default): GPU 1024, RAM 2048, stream on/2400, idle restore 180 s, warm, fit 512, cache ceiling 12,288,
     `fitRam` on.
   - **headroom** (new): GPU 4096, RAM 8192, stream off, idle restore 600 s, evict, cache 2048, `fitRam` on.
   - balanced and safe are unchanged (safe `fitRam` off).
   - A config written before headroom existed gets the built-in headroom preset. `cli.mjs mode-reset max,headroom`
     rewrites stale presets through the backed-up save path.
6. **Apply now.** `mode <name> --now`, and `mode toggle` (max ⇄ headroom; anything else goes to max), always apply now.
   - They go through the same validated, backed-up save, then in the same between-jobs exclusive turn: a sleeping text
     server is dropped, the image cache is freed (evicted in headroom), and loaded text is reloaded. The new layout and
     cache size therefore hold at once, not at the next load.
   - The reply gives the time taken and GPU/RAM free before and after (`performance.lastApply`).
   - A running reply or image is never interrupted: the change waits ("after-current-work").
   - A failed reload leaves the values saved and applied, and says why.
7. **Tray** (ready, not live): `C:\dev\so-lanes\bench-controller\10\tray-story-orchestrator.a2.json` replaces "Performance
   mode" with a **Memory mode** submenu.
   - Its status dot runs `mode-probe`, which shows e.g. `Max - cache 6.1/9.5 GiB`.
   - Items: Toggle Max / Headroom (applies now); Max (playing); Headroom (using the PC); Other modes → Balanced, Safe.
   - It is swapped into `C:\dev\tray\items\story-orchestrator.json` only at adoption, after the merge (the tray runs master's
     `cli.mjs`).
8. **Unbrokered GPU users (audit risk 3)** are guarded, not counted:
   - the spill guard (09) backs off and reloads on a sysmem spill;
   - the reserve check at load sees foreign VRAM already present.
   B4 measures this with the live head, the landmark service and a GPU-layered judge running.

Not changed, and why: the stream floor (09 S384 rerun still owed, separate item); the GPU reserve in Max (no measured
gain below 1024); `--ctx-checkpoints`, `checkpointAt`/`serverRewind` (09 R2 pending its rating).

## A1 correctness items (00-overview A1, audit risks 5/6)

| Item | State | Evidence |
|---|---|---|
| RAM-mode eviction coordinated with image admission (`makeRoom` 0) | **built here** | `memberCache.trimForImage`, tests `memberCacheNative.test.mjs` (trim frees oldest, cap-only when RAM spare, stock server 0); live in B4 |
| Native cache occupancy in `/status` | **built here** | `GET /cache` + `memberCache.native`; tests; live check M6 |
| Key isolation (an unkeyed load may consume keyed entries) | **verified in source, not live** | patch `8f17b1a`, `server-task.cpp` `load()`: `if (it->key != key) continue;` (both ways); `alloc()`: an unkeyed state that would evict keyed entries is skipped; `pop_oldest` drops unkeyed first. Live: B3 reads `native.keyed` vs `prompts` (side passes enter unkeyed with `erase: false`) |
| Erase on aborted requests | **verified in code + test** | `gateway.mjs` `finally` runs `afterOther` when the reply did not finish (`memberDone` false); test "a generation that fails mid-way still clears the slot"; `97ead1e2` aborts idle prefill on any arrival (test "a request arriving during the idle prefill aborts it"). The owner config runs `erase: false` (keys replace erase), so the erase there is a no-op by design; an aborted keyed chat leaves only a token-checked prefix |
| Sleep keeps the cache, drops first under RAM pressure (`a1b20afa`) | verified by 09 K (M) and tests | now preceded by the trim, so a drop happens only when trimming is not enough |

## Floors (predeclared 2026-10-28, before any bench; a miss is recorded, never retuned)

Arms: **C** is the owner's config today (so3 binary, Max, cache 4096 fixed), run on the branch code. **X** is the max
preset (so4, `fitRam`, ceiling 12,288). Both run in the same session.

**Parity so4 vs so3** (patch adds routes only): P1. `bench-controller text` arm `mtp2+cram4096+ramcut+keys+noerase+v4`
on `corpus-rate.json`, 2 repeats each. Chat and side TTFT p50 within ±5 %, decode within ±3 %, warm member switch p50
within ±5 %.

**Max (X against C):**
- M1. RAM outside image leases, after the first 30 s of a load: available ≥ 10,240 MiB at every 1 Hz sample. Inside each
  lease: lowest available ≥ `reserves.ramMiB`, and 0 RAM-short refusals.
- M2. Capacity. The 5-member rotation (`cap-5m`): returning-member hit share (hits ÷ returning planned turns) ≥ 0.60 for X.
  The 3-member rotation: X ≥ C − 0.05.
- M3. Warm chat TTFT p50 ≤ 105 % of C's, cold ≤ 110 %, decode within ±3 %.
- M4. 0 failed requests, 0 409s, `fitCorrectionMiB` 0, 0 spill events, 0 stray wakes. Holds in B4 with the live head held
  open in a headed lane browser, the landmark service, and the local judge with `SO_JUDGE_LOCAL_GPU_LAYERS` set.
- M5. Images (3 SDXL scenes between rotation turns):
  - image → next reply p50 ≤ 110 % of C's;
  - lease admitted every time;
  - after an image, at least one returning member is a hit in 2 of 3 cycles (the cache survives a trim, not only a sleep).
- M6. Native occupancy:
  - `native.sizeMiB` ≤ `native.limitMiB` at every sample;
  - the limit is never above the ceiling;
  - after the fill, `native.sizeMiB` is within ±15 % of llama-server private bytes after the fill minus after the load.
- M7. `GET /cache` never wakes a sleeping server: 0 stray wakes, and `is_sleeping` stays true through the ≥ 20 sampler
  reads inside each lease.

**Headroom (toggle on X, text loaded, idle, cache filled first):**
- H1. After max → headroom:
  - GPU free ≥ 4,096 MiB and up by ≥ 2,048 MiB;
  - RAM available up by ≥ (cache occupancy before − 2,048 − 512) MiB.
- H2. Each switch (max → headroom and headroom → max) is ≤ 45 s wall, p50 over 3 round trips.
- H3. A reply in headroom succeeds. Its decode is recorded (expected 12-25 tok/s, informational).
- H4. A toggle requested during a streamed reply does not interrupt it: the reply completes, the toggle reports waiting,
  then applies; 0 failed requests.
- H5. Back on max: `fitCorrectionMiB` 0, decode within ±3 % of the reply before the first toggle, cache limit back to
  the fitted value.

**R5 48K probe** (decision 9; informational, adoption is a separate owner call because SillyTavern's preset context
changes):
- `ctx48` profile under X: record whether every layer stays on the GPU (server log) with GPU free ≥ 1,536 MiB after load;
- decode within 95 % of the 32K profile on the same 3-member rotation;
- RAM floor M1 holds.

**Adoption** into the owner's controller needs all of these, with no floor retuned:
- every P, M and H floor;
- the regression list below;
- `npm run gates` with no `--resume`, and `npm run test:plugin`.

Then:
1. Config backup.
2. `binary` → so4.
3. `cli.mjs mode-reset max,headroom`, then `mode max`.
4. Tray file swap.

Not during a play session (decision 2).

## Built (branch `v3.0-a2-maxmem`)

- llama.cpp `so-cache-patch` commit `3bae32b` (+105 lines in `tools/server`); so4 binary built with `build-llama.bat`.
- `server-plugin/story-orchestrator-gpu/broker/memberCache.mjs`: `fitCacheMiB`, `nativeState`, `setLimit`, `refit`,
  `trimForImage`, `makeRoom` RAM path, status occupancy, refit after an idle reply, live options.
- `broker/backend.mjs`: `cacheRamFor` (fit at load), learned text RAM, effective `--cache-ram`, `cacheBudget` in status.
- `broker/gateway.mjs`: live options and the floor reach the cache.
- `scripts/local/modes.mjs`: headroom preset, `fitRam` knob, `TOGGLE`, `modesOf` fills missing built-ins, `resetPresets`,
  `apply: 'now'`, `createSettingsReload`, and `lastApply`.
- `scripts/local/controller.mjs`: reload and refit wired, native occupancy refreshed per status.
- `scripts/local/settingsUi.mjs`: the change result is returned.
- `scripts/local/cli.mjs`: `mode toggle`, `--now`, `mode-reset`, probe shows cache occupancy.
- `scripts/local/README.md`, `llama-patches/README.md`.

## Tests (offline)

- `node --test server-plugin/story-orchestrator-gpu/broker/memberCacheNative.test.mjs`: 7 new. Fit arithmetic, status
  occupancy and stock-server fallback, trim frees oldest, cap-only trim, stock makeRoom 0, refit down at once and up by
  ≥ 512, refit only when idle.
- `backend.test.mjs`: 1 new (fit at load from estimate, then learned; `fitRam` off keeps the ceiling).
- `scripts/local/modes.test.mjs`: 7 new (presets, stale owner config gets headroom, reset, apply validation, reload in the
  same exclusive turn, failed reload recorded, settings reload paths, cli toggle/reset). `settingsUi.test.mjs`: 4 modes,
  10 knobs.
- Gate results: in §Gate record.

## Bench plan (GPU window; owner not playing)

Runner `C:\dev\so-lanes\bench-controller\10\run-a2.sh [B0..B7|all]`. Supporting files in the same folder (outside the
public repo, since the captures hold chat text):
- arm configs `ctl-C.json`, `ctl-X.json`, `ctl-X48.json`, `config-so3.json`, `config-so4.json` (copies of the owner's
  config; the live file is not touched);
- rotation captures `cap-3m/4m/5m.jsonl`, built from the lane 42 capture by `build-rotation.mjs` (3, 4 and 5 member keys);
- `sampler.mjs` (1 Hz `/status` + private bytes), `toggle-bench.mjs`, `aggregate.mjs`.

Steps:

| Step | What | Minutes (est.) |
|---|---|---|
| pre | done 2026-10-28: so4 build copied to `C:\dev\tools\llama-b11888-so4-cu128` (so3 DLL set + new server; `/cache/limit` present in `llama-server-impl.dll`) | 0 |
| B0 | owner config backup to `C:\dev\backups\story-orchestrator\`, `/status` capture, stop the owner's controller | 2 |
| B1 | parity so3/so4 × 2 repeats (P1) | 16 |
| B2 | so4 endpoints: `GET /cache`, `POST /cache/limit` awake (evicts), refused `mib 0` | 4 |
| B3 | C and X on the 3- and 5-member rotations (M1-M3, M6) | 28 |
| B4 | C and X: fill, 3 SDXL scenes, each followed by rotation turns, with live head (lane 42 headed, `so-live-head-check --row none --hold-s 900`), landmarks, judge GPU layers (M1, M4, M5, M7) | 30 |
| B5 | X: 3 toggle round trips + a toggle during a streamed reply (H1-H5) | 10 |
| B6 | owner's controller back on its unchanged config, `/status` checked | 3 |
| B7 | only if B3-B5 pass: 48K probe | 12 |

Total about 93 min of GPU, plus 12 min for B7.

**Regression list** (`research/feature-impact-controller.md`). Lanes only, through the X controller, real generation,
thinking on. About 4.5 h of GPU; run in a second window, before adoption. Rows:
- **Base set:**
  - GS1 ×2 strict;
  - j5-group-direction;
  - `so-turn-types-check` + v24-02 continue/swipe set + v28-69-k8 + j6;
  - v29-a02 + v24-01;
  - live-v28-24-reply-effort + j13 + effects-preset;
  - so-live-suite on the T8 set with `--expect-count`;
  - payload goldens capture/diff (no model).
  - The full-length 25-prompt Sol rating is **not** required: no output path changes (so4 only adds routes, the cache
    restores token-identical prefixes). B1 parity is the evidence. If B1 misses, the rating becomes required.
- **RAM member cache rows:**
  - GS6 + a 4-member group run;
  - an impersonate round trip;
  - live-rollback-derived + plan03a-edit-rollback;
  - the RAM-min probe, covered by B4.
- **Max/headroom rows:**
  - p41 image journey ×2 (≈ 140 min of the 4.5 h);
  - `so-sprite-builder` batch with replies interleaved;
  - `sagaBatchPriority` / `retainBatchLi`;
  - an Image Director or ST `/sd` render during a text reload, including during a headroom toggle reload: never killed
    and never a 15-minute hang;
  - each with the live head open, `SO_JUDGE_LOCAL_GPU_LAYERS` set and the landmark service running;
  - expected: no 409, no CPU spill, fitCorrection 0.

## GPU cost

About 93 min for the floors (+12 for R5), plus about 4.5 h for the regression list. Total about 6.3 h, splittable into two
windows.

## Unresolved questions

- Headroom targets: 4 GiB VRAM and a 2 GiB cache are my proposal (owner rule 3 names no number). Is that what "using the
  PC" needs, or should headroom unload text entirely? "Unload text" already exists in the tray for that.
- Max cache ceiling 12,288 MiB: with the fit it only matters on a near-idle host. Keep it, or uncap it (16,384 knob max)?
- Should the tray keep Balanced and Safe at all, now that headroom exists? They sit under "Other modes" in the draft.
- R5: after the probe, does the owner want a 48K SillyTavern preset trial (that is the owner's data and an
  output-changing context change), or should it stay a measurement?

## Bench record (2026-10-28 16:13Z to 2026-10-29 03:44Z)

Runner `C:\dev\so-lanes\bench-controller\10\run-a2.sh`. Evidence: `C:\dev\so-lanes\bench-controller\10\logs\` and lane 42
runs, archived to so-sessions `evidence/phase-c/v30-a2-maxmem-bench/` (lane 42 + `extra/bench-controller-10/`).

Interruptions (controller handed over and taken back each time, owner config untouched):
- the r4 fork agent's GPU window, 17:37Z-22:27Z;
- the owner's GPU pause, 00:20Z-02:08Z.
The owner's controller was stopped from B0 until B6. It came back at 03:44Z on its unchanged config (sha256 `d48e439d…`):
Max, cache 4096, fit 0, GPU free 2,084 MiB. Backup: `C:\dev\backups\story-orchestrator\local-config.before-a2-20261028T1613Z.json`.

Bench changes made while it ran, none of them a floor change:
- `replay-gateway` replaced by `seq-replay.mjs` (sequential, 1 s gap). The first B3 control arms overran the gateway queue
  at the capture's retimed offsets (36 of 65 requests failed), so they are void.
- `ready()` waits for the text load instead of racing `restore`.
- B4 aborts when the live head does not start.

### B1 parity (so4 vs so3, 2 repeats each, `corpus-rate.json`): pass

- Chat TTFT p50 7,205 vs 7,204 ms (0 %).
- Side TTFT p50 3,333 vs 3,278 ms (+1.7 %).
- Warm member switch 7,288 vs 7,213 ms (+1.0 %).
- Decode 43.2 vs 42.9 tok/s (+0.7 %), acceptance 0.522 vs 0.519.
- 0 errors.

### B2 endpoints: pass

- `GET /cache` reported the fitted limit (6,400 MiB at a load with 19,674 MiB available).
- `POST /cache/limit {"mib":2048}` set it to 2,048.
- `{"mib":0}` was refused with 400.

### B3 member rotation

- **v1 (`2ba65eb1`): M1 miss.** The load-time fit set 8,192 MiB. Text used more RAM after `/health` than the load
  measured, and the next save landed before any refit. RAM available fell to 1,565 MiB (22:30:31Z) with the cache at
  7.8 GiB, and 101 of 747 samples were under 10,240. Kept in `logs/B3X-v1-miss`.
- **Fix v2 (`fc6310be`).**
  - A refit runs before every planned chat: the limit is applied, and confirmed with `GET /cache`, before the request runs.
  - The target keeps room for one more entry.
  - The limit is raised only by 1 GiB or more.
- The first v2 control arms ran during the r4 CPU build (RAM low 5,069 MiB, kept in `logs/B3C-r4window`), so both arms were
  rerun together at 22:58-23:45Z.
- v2 results:
  - M1 pass. Lowest RAM available after the first 30 s: X 11,709 (3-member) and 10,703 MiB (5-member); control 14,452 and
    13,155; 0 samples under 10,240.
  - M2 pass. Returning-member hit share: 5-member X 0.807 against the 0.60 floor (control 0.14); 3-member X 0.822 against
    control 0.467.
  - M3:
    - 3-member pass: warm 5,814 vs 5,597 ms (104 %), cold 10,110 vs 14,173 ms, decode 43.05 vs 43.11.
    - 5-member **miss as written** on warm: 5,716 vs 4,142 ms (138 %). The control's warm median rests on 8 hits, mostly
      early, short prompts. Cold passes: 9,951 vs 9,932 ms (100.2 %). Decode passes: 42.97 vs 42.80.
    - Chat TTFT p50 overall: X 5,742 vs 7,347 ms on 3 members, 5,027 vs 8,052 ms on 5 members (−38 %).
  - M6 pass. `native.sizeMiB` never exceeded the limit. After the fill, native size is 89-91 % of llama-server's
    private-bytes growth (4,498 of 5,048 and 5,909 of 6,463 MiB), inside ±15 %.
  - Errors, spills, fit corrections, stray wakes: 0.

### B4 images

- **Run 1, with a GPU-layered local judge** (decider-4b, 99 layers, ~4 GiB VRAM): stopped during the control arm.
  - The control config (the owner's current one) could not hold the full text: fit corrections ~5.7 GiB, spill-recovery
    reloads.
  - **M4 judge-GPU row: miss**, for the control config itself. Not caused by A2: both arms use the same 1,024 MiB GPU
    reserve. Kept in `logs/B4-judgegpu`.
- Two retries aborted:
  - a popup on the reused lane-42 page blocked the live head;
  - SOLH synthetic assets left by the killed hold run. Removed with `so-assets remove --marker SOLH`; `assert-clean` was ok.
- **Clean run** (02:10-02:57Z): live head on lane 42 (held 2,700 s, renderer RTX 3090, `contexts: 1`, PASS) and the landmark
  service; 3 SDXL scenes per arm with rotation turns in between.
  - M1 pass.
    - X: lowest RAM outside leases 10,530 MiB, 0 of 1,266 samples under the floor; inside leases 12,758; 0 RAM-short
      refusals.
    - Control: 9,657 MiB outside leases, with 75 samples under 10,240. The current config misses the floor that A2 holds.
  - M4 pass (live head + landmarks). `so-controller-checks reserve score` passes for both arms; 0 spills, fit 0, 0 stray
    wakes, 0 errors.
  - M5:
    - Image → next reply p50 53.2 vs 49.9 s (107 %, pass). Cycles: X 78.9/51.4/53.2 s, control 78.5/49.9/47.2 s.
    - Every lease admitted (swap-text, sleep/wake 3/3).
    - **"A returning member is a hit after 2 of 3 images": miss**, 0 hits in all three cycles on both arms (0 of 7 each).
      Cause on X: the refit before the first chat after an image counts ComfyUI's warm RAM cache as used RAM
      (available 12-13.5 GiB after a render). It shrinks the member cache to 2-3.5 GiB and evicts the states that
      survived the sleep. On the control, 4 GiB holds about three of the five members' states, so the post-image turns
      miss as well.
  - M7 pass: 0 stray wakes; `native.sleeping` was true through every lease (≥ 20 reads each).

### B5 headroom toggle (X, cache filled first)

- H1:
  - GPU free 4,498 MiB after each max → headroom (≥ 4,096), up 2,230-2,438 MiB (pass).
  - **RAM: miss as written** in round 1: available rose 2,234 MiB against the required 3,076 (cache 5,636 − 2,048 − 512).
    Headroom puts about 2.4 GiB of text layers in host RAM, which takes back most of what the cache frees.
- H2 pass: max → headroom 53.7/22.3/22.2 s (p50 22.3); headroom → max 11.2/12.3/12.4 s (p50 12.3). The first switch
  included freeing the warm image cache.
- H3 pass: headroom replies 200, decode 13.2-13.3 tok/s.
- H4 pass: a toggle sent 4 s into a 600-token streamed reply waited ("applies when the current job finishes"). The reply
  finished (0 failed requests), then headroom applied at 03:07:12Z (reload 24.1 s, GPU free 2,042 → 4,498 MiB).
- H5 pass: back on max, fit 0, short-reply decode 71.5-72.2 tok/s in every round (±1 %), cache limit back to the fitted
  value (6,400 MiB).

### B7 48K probe (informational)

- The `ctx48` profile loaded under X with fit 0 and GPU free 1,606 MiB after the run.
- On the 3-member rotation: 0 errors, hits 37 / misses 11; chat TTFT p50 6,307 ms against 5,742 at 32K.
- Decode 32.7 tok/s against 43.1 at 32K (76 %), under the 95 % bar. 48K costs about a quarter of decode speed with images
  idle, so it is not worth a SillyTavern preset trial on this card (decision 9 input).

### Verdict

**Not adopted, not merged.** A2 misses four floors as written:
- M3 warm TTFT on 5 members (selection bias);
- M4 judge-GPU row (the control config misses it too);
- M5 post-image hit;
- H1 RAM.

What passes:
- parity;
- the RAM floor that the current config breaks;
- capacity: 0.81 vs 0.14 returning hits on 5 members;
- chat TTFT −22 to −38 %;
- the image cycle within 10 %;
- the toggle: 22 s / 12 s, never interrupting a reply.

The owner decides, as with 09 A.

Follow-up candidates (not built):
1. Count ComfyUI's reclaimable warm RAM in the fit. ComfyUI evicts its own RAM cache at its 8 GiB headroom threshold, so
   the member cache need not give way to it. This targets M5.
2. Let headroom drop its CPU-layer share, or unload text. This targets H1.
3. A local judge on the GPU needs its VRAM counted in the reserve, or it stays on the CPU.

Not run: the controller regression list and `npm run gates`. The brief merges only when the bench and the list both
pass; with four floors missed, the ~4.5 h list waits for the owner's call on the misses.

### Decision 2026-10-29

- Coordinator, for the owner: the four misses (M3, M4, M5, H1) are accepted as recorded. Floors are informational, as
  with 09 A, and none is retuned.
- Test the config that would be adopted, not X: candidate **L** = A2 max preset + RAM fit, on the so5 binary
  (`C:/dev/tools/llama-b11888-so5-cu128/llama-server.exe`, plan 26 round 4), with `memberCache.lightSleep true` and
  `lightSleepFreesMiB 2800` (bench config `bench-controller/10/ctl-L.json`).
- Stop rule set beforehand: if light sleep and the RAM fit fight (RAM floor broken, or sleep falling back on every
  image), stop and report instead of adopting.

## Candidate L (2026-10-29)

### Smoke (03:51-04:21Z, `bench-controller/10/logs-smoke/`)

- Parity so5 vs so4, same B1 rotation, 1 repeat each:
  - chat p50 7,258 vs 7,196 ms (+0.9 %); side 3,271 vs 3,262 ms (+0.3 %); warm 7,259 vs 7,242 ms (+0.2 %);
  - decode 43.3 vs 41.6 tok/s (+4 %); draft acceptance identical (0.522); 0 errors, 0 rewinds.
- Image cycles on L (fill rotation, then 2 SDXL scenes, each followed by an 8-request rotation):
  - lease decision `sleep-context` both times, no fallback to a full sleep; light wake 397-404 ms;
  - fitCorrection 0, 0 spills, 0 errors in 76 requests;
  - RAM: lowest inside the leases 8,973 and 12,320 MiB (above `reserves.ramMiB`); outside the leases the only dips under
    10,240 fall in the release second;
  - post-image returning hits 0 (the known M5 miss);
  - **flag**: GPU free fell to 537 and 275 MiB during the renders, under the 1,024 MiB Max reserve, because a light
    sleeper keeps its weights on the GPU. No spill, no OOM, both renders complete. `render-benchmark` marks each cycle
    `ok: false` ("crossed a predeclared memory reserve") because the decision was not `stream-image`.
- Neither stop condition fired: the RAM floor held and light sleep was taken on every image.

### Regression list on L (04:22-08:25Z, lanes 45/33, real generation, thinking on; `logs-reg/`)

Base set:
- GS1 ×2 strict: GREEN, GREEN (9/9 each; batch `45/debug/batch/2026-10-29T04-22-39-291Z`).
- J5: GREEN 7/7. J6: GREEN 11/11.
- `live-v4-turn-types-real`, `v29-a02-stopped-reply`, `live-v28-24-reply-effort`: GREEN. `so-turn-types-check`: ok.
- T8 prompt batch (the frozen `t8-eb` bodies sent to L, `--expect-count 4`): 4/4, deltas and rejected tiers 1.0.
- J13 (on arm, `--judge-uses houseRules --warden-mode auto`): no valid green.
  - Run 1 (in the batch, no arm flags): harness error; the journey refuses to run without an arm.
  - Run 2: 409 "Text is manually unloaded", left behind by my text-reload probe (harness mistake; `automatic` restored).
  - Run 3: RED at turn 24/28. The model answered thought-only twice (2,162 and 5,200 reasoning characters); the
    empty-reply recovery swiped once and kept the second, as designed, and the send reported `ok: false`.
  - Run 4: stopped at 19/28 by the owner's GPU stop (every turn ok until then).
- Not runnable on a model lane (their `requires` ask for a no-model lane, so they never reach the controller):
  v24-02 branch-continue and checkpoint-continue, v28-69-k8-swipe-append, v24-01-stopped, effects-preset,
  plan03a-edit-rollback.
- Not run: payload goldens (controller only, no prompt path changes); the full-length rating (not required, B1 parity
  holds).

RAM member cache rows:
- GS6: 11/12; GS6.8 is the known promise-row model miss (v2.9 13 C3).
- `live-rollback-derived`: GREEN.
- Impersonate round trip on lane 45: 2,761 characters back in the input, no error.

Max/headroom rows:
- p41 image journey ×2 with live images: GREEN, GREEN (`33/debug/p41/*-a2L-real-run1|2`). Reserve sample beside each
  (2 s): fitCorrection max 0, no spill, no crash, 0 reserve errors, 1 reclaim per run.
- Unleased SDXL render straight to ComfyUI (`render-survival --via direct`):
  - during a max -> headroom toggle reload: completed 36 s after the event (pass);
  - during a text unload + automatic reload + reply: completed 33 s after the event (pass). The first try ran `unload`
    alone, so no reload happened; it is not counted.
- Comfy-kill (`render-survival --via media`): **miss, in the media plugin, not A2** (`story-orchestrator-media/jobs.mjs`
  is untouched by this branch; this is the checker's first run):
  - ComfyUI killed and left down: the job never settles; `poll` throws "fetch failed" before the 15-minute cancel.
  - ComfyUI killed and restarted 10 s later: failed at 90.8 s, the 60 s dropped rule counted from the restart.
  - Restarted at once after the kill: "Owned ComfyUI process exited before becoming ready"; a later `start-comfy` works.
- Not run: `so-sprite-builder` interleave and `sagaBatchPriority` (campaign images on hold), `retainBatchLi` (needs its
  own broker and text port), the judge-GPU row (M4, accepted miss).
- Controller `/status` at the end:
  - mode max, fitCorrection 0, no spill, lastError null;
  - member cache hits 25 / misses 54, restore failures 0, refits 19, trims 7, `makeRoomUnsupported` 0;
  - sleeps 18 (8 light), wakes 14, wake failures 0, stray wakes 0.
  - The 15 s status sampler was started with wrong arguments and recorded nothing; the reserve samples and this
    snapshot stand in for it.

### Light-sleep admission change (2026-10-29, during the pause, CPU only)

- Coordinator decision, from the smoke flag: `sleep-context` only when the GPU free reading after the light sleep minus
  the image's admitted need still keeps the mode's GPU reserve (1,024 MiB in Max, 4,096 in Headroom); otherwise stop
  and swap text as before.
- `broker/scheduler.mjs`: the check runs on an estimate (free + `lightSleepFreesMiB`) before sleeping and on the reading
  after it. Streaming an image beside a light sleeper is removed (that path admitted on `streamImages.minFreeGpuMiB`
  2,400 instead of the need, and is what left 537 / 275 MiB). `/status` `lastResidency.lightSleep` =
  `{stage, freeMiB, needGpuMiB, reserveMiB, leftMiB, fits}`, and the lease reason names the numbers ("Light sleep
  skipped: about N MiB free after it, short of image X + reserve R MiB" / "N MiB free covers image X + reserve R MiB").
- Tests: `scripts/local/lightSleepAdmission.test.mjs` (6, real Max/Headroom presets, the smoke readings 1,979 / 4,773
  and 1,865 / 4,659 MiB as fixtures): fits -> `sleep-context`; both smoke cycles -> swap; the 9,059 MiB loader estimate
  -> swap; estimate fits but the measured reading crosses -> drop the sleeper and swap; Headroom -> swap. The plan 26
  broker test that expected streaming beside the sleeper now expects a swap.
- Expected cost: in Max an SDXL image swaps text whenever the light-sleep reading cannot hold need + reserve (the smoke's
  9,059 MiB loader estimate always swaps on this card). The live re-check waits for the resume.

### Pause 2026-10-29 08:25Z

- The owner asked for the GPU. Stopped: J13 run 4, every harness child, the L controller (with its ComfyUI and
  llama-server), landmarks, lanes 42/45/33. nvidia-smi afterwards: 499 / 24,576 MiB, 0 %.
- Owner controller left stopped, `config.json` unchanged (sha `d48e439d`), tray untouched.
- Remaining on resume:
  - live re-check of the light-sleep admission change (smoke image cycles on L: decision and reason in `/status`, GPU
    reserve held);
  - one clean J13 on-arm run;
  - full `npm run gates` (no `--resume`), then merge `--no-ff` and push;
  - adoption: back up `config.json` to `C:\dev\backups\story-orchestrator\local-config.before-a2-2026-10-29.json`; set
    `binary` to so5 and `memberCache.lightSleep true` / `lightSleepFreesMiB 2800`; `mode-reset max,headroom`;
    `mode max`; tray file from `bench-controller/10/tray-story-orchestrator.a2.json`; restart; check `/status`
    (sleepStats present, fitCorrectionMiB 0).

Follow-up candidates found here (not built):
- Media jobs: count unreachable ComfyUI polls toward the 60 s dropped timer, so a dead ComfyUI fails the job.
- Light sleep and the Max GPU reserve: decided and built, see §Light-sleep admission change.

### Follow-ups built 2026-10-30 (CPU only, every one off by default, unbenched)

The three §Verdict candidates. None changes the candidate L config or any preset, so the W1 recipe and the adoption keys
above are unchanged; each needs a bench arm before it is switched on.
- M5, `memberCache.fitImageCacheRam` (boolean, live). The scheduler remembers the RAM need of the last warm render
  (`warmImageRamMiB()`, `/status` `imageResidency.warmRamMiB`): set when a release leaves the cache `gpu-warm` or
  `ram-warm`, kept by a release to RAM, forgotten by an evicting release, a ComfyUI pid change, and read as 0 during a
  lease or a pending reserve. With the switch on, `refit` adds it to the available RAM it fits against, capped at the
  staging part of the floor (`keepCacheRamFloorMiB - reserves.ramMiB`, 8,192 on Max); `lastRefit.imageCreditMiB` records
  it. Image admission still trims first (`trimForImage`), so the worst case is a trim before the next image. Bench arm:
  B4 on L with the switch on, floor M5 (a returning hit after 2 of 3 images) and M1 (RAM outside leases) together.
- H1, mode knob `unloadTextOnApply` (boolean, applies live; `false` in max, headroom and safe). An apply-now switch into
  a mode with it unloads loaded text instead of reloading it (`lastApply.text 'unloaded'`), so the 2.4 GiB of CPU layers
  return their RAM too. Pair with `keepTextResident: false`, or the automatic reload brings text back. Owner question
  (plan 10 §Unresolved, "headroom targets or unload text"): set it in the headroom preset or keep the reload.
- M4, local judge placement. `judge.mjs start` with `SO_JUDGE_LOCAL_GPU_LAYERS` probes the controller
  (`SO_LOCAL_CONTROLLER_URL`, default `http://127.0.0.1:18888/health`) and starts on the CPU while it answers, saying
  why; `SO_JUDGE_LOCAL_GPU_FORCE=1` takes the layers anyway. Counting the judge's VRAM in the reserve was not built
  (the controller has no reading of it); this is the "or it stays on the CPU" half.
- Tests: `scripts/local/maxFollowups.test.mjs` (5: credit off by default and validated, credit keeps the surviving
  states and is capped, scheduler warm RAM set/kept/forgotten, unload-on-apply vs reload, judge placement four ways);
  `settingsUi.test.mjs` knob count 10 -> 11.
- Docs: `scripts/local/README.md` (three bullets, modes table row). `docs/guide/setup/judge.md` gains the force variable
  at adoption (generated guide bundle, C-DOC2).

## Gate record

Offline handover 2026-10-28 (worktree `C:\dev\so-a2`, no GPU used, live controller, `config.json` and tray untouched):
- `npm run gates:quick`: green (typecheck, defect replay 32 of 32 killed).
- `npm run test:plugin`: 431 tests, 426 pass, 0 fail (5 skipped, as on master).
- `node --test "scripts/local/*.test.mjs"`: 45 pass, 0 fail.
- `npm run test:debug`: 1585 of 1586; the one red is `so-run-header.test.mts` "the build half reads plan 08s nested
  manifest", which needs a built `dist/` (none in a fresh worktree); green on the master tree. `npm run gates` runs
  `build` before it.
- so4 binary: built with `build-llama.bat` (368/368, no errors) at idle CPU priority while the live controller served (no GPU);
  never started, so the routes are unexercised until B2.
- Not run: `npm run gates` (owed at merge), the bench, the regression list.

Candidate L, 2026-10-29 (GPU window, owner not playing):
- Misses accepted (coordinator decision); smoke and regression list as in §Candidate L; evidence archived with
  `so-evidence.mts archive --label v30-a2-L` and `npm run sessions:archive`.
- Not run yet: `npm run gates` (held while the owner uses the machine), merge, adoption.

W0 upkeep 2026-10-30 (CPU only, worktree `C:\dev\so-a2`, no GPU, owner controller and `config.json` untouched):
- Merged master twice (merge, not rebase): `2cc14743` (master `a97af36c`; conflict in `scripts/local/controller.mjs`:
  kept the branch's live settings reload/refit status and added master's `textOrphans` to it), then `49aae5cb` (master
  `a7fa71fc`, with `v3.0-ctl-cpu-1030`; conflicts in `cli.mjs` (`--now` filter kept, `--force` added) and
  `memberCache.mjs` (constructor takes `imageRamMiB` and `log`; the divergence tracker sits beside the native fields)).
- Follow-ups M5/H1/M4 `a3b41832` (see §Follow-ups built 2026-10-30).
- `npm run gates -- --jobs=3` (no `--resume`) on `49aae5cb`: all green in 1177.8 s, Storybook included (1025 passed).
  Two earlier full runs on the same branch went red on environment only: Storybook port 6006 held by a peer worktree's
  server (EADDRINUSE) and a jest cache EPERM; then `orphans.win.test.mjs` timing out on `Get-CimInstance` at 100 % CPU
  (other sessions' gates). No code change between them and the green run.
- Pushed `origin/v3.0-a2-maxmem`. Not merged to master (GPU-gated: A2-1, A2-2 J13, adoption).

## Resume 2026-10-31 (GPU queue G2)

### A2-1 light-sleep admission live re-check (00:32-00:54Z, `bench-controller/10/logs-a21/`)

- Owner controller stopped first; owner `config.json` sha256 `d48e439da428…` before and after (backup `C:/dev/backups/story-orchestrator/controller-config-g2-*.json`). Candidate L (`ctl-L.json`, so5), script `run-a2-1.sh` = the smoke S2 protocol (fill 60, then 3 SDXL scenes each followed by an 8-request rotation) with `/status` captured after every image and a 2 s reserve sample.
- Decision on every image: `swap-text`, 3 of 3. Reason names the numbers: "Light sleep skipped: about 3,984 (3,870, 3,870) MiB free after it, short of image 9,059 + reserve 1,024 MiB"; `lastResidency.lightSleep` = `{stage: estimate, fits: false, leftMiB -5,075/-5,189}`. As expected in §Light-sleep admission change: the loader estimate always swaps on this card, so no image streamed beside a sleeper.
- GPU reserve held: lowest GPU free in 1,234 samples (1 s) **1,070 MiB** (Max reserve 1,024; the 10-29 smoke fell to 537 / 275 MiB).
- Renders 3 of 3 ok; fitCorrection 0; 0 spills; 0 errors; reserve score pass (0 reserve errors, no crash); full sleeps 3, wakes 3 (~23 s each), 0 wake failures, 0 light sleeps.
- Fill rotation: 60 requests, 0 errors, chat TTFT p50 4,708 ms, decode p50 43.7 tok/s. After each image all 7 chat requests were misses (TTFT p50 13.3-15.9 s): the swap costs the warm cache, the known M5 miss.
- Verdict: **pass** (decision and reason in `/status`, reserve held live).

# Plan 10 — Max-memory profile and tray headroom toggle

**Status: BUILT on branch `v3.0-a2-maxmem` (worktree `C:\dev\so-a2`), floors predeclared 2026-10-28 before any bench.
No bench run, nothing adopted, nothing merged.** Track A2 (`00-overview.md` §Replan 2026-10-26). Owner decisions that
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
   - With `/cache`, the limit follows free RAM after every idle chat reply and on every settings change (refit). It
     drops at once and rises only by 512 MiB or more.
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

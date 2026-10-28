# v3.0 plan 22: text wake after an image (409 wedge)

Branch `v3.0-wake-fix`, worktree `C:\dev\so-wake`. Opened 2026-10-26 after lanes 33/34: after a render, every text
request answered 409 for ~45 min until `cli.mjs unload` + `automatic`.

## Diagnosis

- **`POST /sleep` does free VRAM.** Forced swap on the owner's controller: sleeping llama-server, GPU total 1,907 MiB
  (desktop + CUDA context); the per-process counter later read 300 MiB for the sleeping pid. Weights and KV leave VRAM,
  the RAM prompt cache stays in the process (`destroy()` in `handle_sleeping_state`).
- **The sleeping server was woken behind the controller's back.** In llama-server every route except `/health`,
  `/props`, `/metrics`, `/models`, `/sleep` calls `wait_until_no_sleep()`, which reloads the model. The gateway sends
  `/tokenize` and `/detokenize` straight to the backend whenever `status()` shows a pid and a profile. `sleep()` keeps
  both until `/props` reports `is_sleeping`, so a token count from SillyTavern in that window (or in flight when the
  sleep lands) reloads the full 21 GB, re-fitted against whatever ComfyUI held, while the controller records the
  process as asleep. Reproduced on the owner's controller: `/tokenize` every 50 ms + a forced swap lease → controller
  `sleeping`, GPU 23,217 MiB. Native logs from the lanes show the same: sleep entered, exited 1.4-2.7 s later with no
  controller wake.
- **The accounting then blamed ComfyUI and wedged.** `imageCache.free` compares GPU used with the lease's baseline + 512
  MiB and treats everything above it as unreleased ComfyUI memory. The next text request first releases the image
  cache; ComfyUI was at 32 MiB torch, GPU at 22.5 GB (the text process), so the release failed with "ComfyUI accepted
  free but its model memory has not been released", `imagesNeedRelease` stayed set, and every later text request (and
  image lease, and the keep-resident reload) failed the same way. The wake admission was never reached. Under
  SillyTavern's steady token counts the queue stayed busy, so `unload`/`stop` were refused too ("Wait for the active
  work"); recovery needed a process kill. Same symptom as lane 34 server.log (`Torch reserved 32 MiB; observed GPU
  22507 MiB`).
- Secondary: the telemetry probe was not told the sleeping pid (`status().pid` is null while asleep), so nothing could
  see the sleeping process's memory.

## Fix

Owner decisions kept: max mode, `keepAcrossImages` (the RAM cache is kept, VRAM released), chatFirst, MTP, thinking.
- `backend.mjs`: `tryDirect()`/`endDirect()` gate every request sent straight to llama-server. `sleep()` sets
  `entering`, waits for direct requests in flight, then posts `/sleep`; no direct request is admitted while entering
  or asleep (they queue and wake the server through the controller). `checkSleeping()` reads the sleeping pid's own
  GPU counter; above `strayWakeMiB` (2048), from a reading at least `strayWakeSettleMs` (5000) after the sleep and not
  contradicted by the GPU total, the process was woken outside the controller: it is stopped (`sleepStats.strayWakes`,
  `lastStrayWake`, `lastError` names it) and text starts clean. `load()` checks before waking. `wake()` short of the
  full layout first asks for idle ComfyUI memory (same guards as the reload reclaim, `sleepStats.wakeReclaims`).
- `gateway.mjs`: counting routes go direct only through `tryDirect()`.
- `imageCache.mjs`: `otherMiB` leaves the text process's GPU memory out of the release check; the failure names the
  text share and the target.
- `scheduler.mjs`: the release target leaves out what the text process held at lease start (only when text was
  awake; a sleeping text counts 0, because the counter lags the sleep). Every image release, lease sample and wake
  runs the stray check. A release that fails while text sleeps stops the sleeping server and retries once. Three
  releases in a row that miss the target drop the target (ComfyUI's own release plus the text load admission still
  apply), so the controller cannot wedge (`imageResidency.releaseFailures`, `lastReleaseGiveUp`).
- `arbiter.mjs`: the telemetry probe watches the sleeping pid.
- `scripts/local/wake-cycle-bench.mjs`: text → SDXL render → text cycles with `/tokenize` every 100 ms, per-cycle VRAM
  and TTFT.

## Tests

Nine node tests (broker), each failing on master (checked by reverting the five source files): sleep waits for and
blocks direct counts; stray wake stops and restarts instead of waking; stale or contradicted readings are not strays;
wake reclaims idle image memory first; gateway counts go through the gate; image release ignores text memory;
post-image wedge self-heals (drop + retry); release target excludes awake text and lease samples stop strays; three
missed targets drop the target.

## Live (2026-10-26, owner's config, GPU free, owner not playing)

- Baseline, master controller, `wake-cycle-bench --cycles 3`: wedged at the first image (lease 409 "ComfyUI accepted
  free ... observed GPU 22828 MiB"), queue busy for ~25 min, `cli.mjs stop` refused; the controller had to be killed.
- Fix, first two runs: found two defects in the first cut, both fixed before the record run.
  - The per-process counter lags the sleep by ~1 s: a reading just after the sleep (21,373 and 14,718 MiB) read as a
    stray wake (process stopped, cache lost) → settle window + GPU-total check.
  - The same stale reading at lease start made the release target negative (-12,497 MiB) → wedge again → target
    counts text only when awake, plus the three-miss give-up.
- Record run `fixed-5c` (evidence `C:\dev\so-lanes\0\debug\wake-fix\fixed-5c.{json,log}`), SDXL scene each cycle,
  every image a `swap-text` (text sleeps):
  - 5 of 5 cycles served, 0 refusals, 0 image failures, 224 of 224 token counts answered 200.
  - Next-reply TTFT 40.4 s (first cycle, after ComfyUI's first load), then 23.2, 23.4, 23.2, 23.1 s; p50 23.2 s.
    Wake 22.8 s (`lastWakeMs`), sleep 1.3 s.
  - VRAM: sleeping text 300 MiB during every render, ComfyUI warm 8,383 MiB total after the render, awake text
    21,373 MiB (22,829 MiB total).
  - `sleepStats` 5 sleeps, 5 wakes, 0 wake failures, 0 drops, 0 stray wakes, 0 wake reclaims.
- Lane 46 (`Dm group`, no campaign content), `so-turn-types-check --skip-image --skip-solo` through the fixed
  controller: all checks ok. The `/sd` variant could not run: the lane's image generation is off (`/sd did not post an
  image`), so the SillyTavern image path was covered by the controller bench, which takes the same lease/release
  calls as the media plugin.

## Regression list (feature-impact-controller.md) coverage

Run: the 409/reclaim rows' core (image↔reply cycles with token counts, 5 of 5), and
`so-turn-types-check` chat path. Not run tonight (time and GPU window): GS1 ×2, j5,
v24-02 / k8 / j6, A02, reply effort, live suite, payload goldens (controller-only change; no prompt path touched),
p41 journey ×2, sprite builder batch, Image Director during reload. These stay owed before adoption is called
complete.

## Gate record

- `npm run gates:quick` (worktree): green.
- `npm run gates` (worktree, no `--resume`), first run: RED at `test` only, `effectsApplier.test.ts` "failed to read
  cache file ... EPERM" in the shared jest transform cache while another worktree's gates ran jest (environment; file
  untouched here).
- `npm run gates` (worktree, no `--resume`), rerun on the same tree with no other jest running: **all green in
  254.4 s**, Storybook included. jest 10,519 passed / 1 skipped; Storybook 1,004 passed; test:plugin, test:debug,
  test:release, test:replay, lint, typecheck, typecheck:test, debug:typecheck, build ok. Log
  `C:\dev\so-lanes\0\debug\wake-fix\gates2.log`.
- Install: the owner's controller runs `scripts/local/controller.mjs` from `C:\dev\story-orchestrator`; after the merge,
  restart it (`node scripts/local/cli.mjs stop`, then `start`, or kill the controller tree if `stop` is refused) and
  check `node scripts/local/cli.mjs status`. No config change is needed (`strayWakeMiB`, `strayWakeSettleMs`,
  `releaseGiveUpAfter` have defaults).
- Seen, not fixed here: `cli.mjs stop`/`unload` are refused while text work is active ("Wait for the active work"),
  which under a wedge plus steady token counts meant only a process kill recovered.

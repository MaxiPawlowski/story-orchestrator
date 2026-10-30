# Plan 27 — llama.cpp fork wrap-up

**Status: BUILT 2026-10-29 (CPU only), GPU window OWED (the owner says "resume"); nothing adopted, NOT merged.** Branch
`v3.0-27-fork-wrapup` (worktree `C:\dev\so-wrapup`) on `v3.0-a2-maxmem` (`1b3a59f2`). Floors below are declared
2026-10-29, before any GPU run of this plan; a miss is recorded and never retuned. Sources: `research/llama-fork-opportunities.md`,
`26-llama-fork-round-4.md` (C1, C4a Parts A/B, R2 and its informational rerun), `09-controller-round-3.md` §R2,
`10-max-memory-profile.md` §Light-sleep admission change.

## Overview

| Item | What | Owner | State |
|---|---|---|---|
| W1 | Guarded light sleep: stream an image beside a light sleeper only when the stream need keeps a declared margin; OOM retried once as a full swap | this plan | built, floors below, GPU owed |
| W2 | C5 keyed cache entries spill to disk under RAM pressure (memberCache + llama.cpp patch so6) | plan 28 (`28-cache-spill.md` on `v3.0-28-cache-spill`, another agent) | see plan 28 |
| W3 | R2 rerun multi-seed (A vs A2 `checkpoint_at`), blind Sol rating, aggregation | this plan | harness built; generation GPU owed; **rating owner-gated** |
| W4 | C4 limited: preempt a story read at most once, only early and young | this plan | built, floors below, GPU owed |
| W5 | C6 faster cache restore and C9 decode-step profile, measures first | plan 28 | see plan 28 |
| W6 | Package and adoption | coordinator | after the window |

Closed, not parked (owner 2026-10-29): **C8 stronger drafter (DFlash / EAGLE-3)**. Its drafters exist only for Artemis
v1.2 and the base model; the owner said no to v1.2 (it closes the thought at once, `v2.7/12-model-choice.md`, and the
owner wants thinking on). C7 (lower-bit KV) stays rating-gated and out of this wrap-up.

## Why W1 (from plans 10 and 26)

- Plan 26 C1 measured stream-beside-sleeper at image → next reply p50 **7.8 s vs 32.6 s** for K1 (full swap).
- Plan 10's smoke saw that same stream dip GPU free to **537 and 275 MiB** under the 1,024 MiB Max reserve, because
  the old path admitted on `streamImages.minFreeGpuMiB` (2,400) while ComfyUI streams into nearly everything free
  (4,773 free after the light sleep → ~4.2 GiB used). Commit `1b3a59f2` removed the stream beside a sleeper: light
  sleep now fires only when the image fits whole with the reserve kept, which an SDXL scene (~9 GiB) never does on this
  card. So today light sleep never fires for SDXL.
- W1 brings the stream back behind a guard that learns what ComfyUI actually takes, plus a no-failed-image fallback.

## W1 built (controller and media plugin, default off)

- `memberCache.lightSleepStreamMarginMiB` (0/absent = off = the `1b3a59f2` behaviour; 256-8192; needs `lightSleep`),
  `memberCache.lightSleepStreamOomRetry` (default true). Validated in `broker/lightStream.mjs` (kept out of
  `memberCache.mjs`, which plan 28 edits).
- Admission (`broker/scheduler.mjs`), after the whole-image light-sleep check fails: if the `streamImages` policy
  allows the image (enabled, streaming runtime, model kinds, weights ≤ `maxWeightMiB`) and text is resident at full
  layout, the stream need is `max(streamImages.minFreeGpuMiB, learned stream use)`; the estimate (free + 
  `lightSleepFreesMiB`) and then the reading after the light sleep must leave `need + margin` free (RAM reserve as
  usual). Pass → decision `sleep-context`, the image streams beside the kept weights. Fail on the reading → the sleeper
  is dropped and the lease swaps.
- Learned stream use: per workflow identity (workflow key, runtime, models), peak used minus the admission reading,
  largest of the last 3 leases, in `footprints.json` under `stream-use:`; not mixed into the whole-image footprint. So
  the first image of a kind is admitted on the 2,400 floor and later ones on what ComfyUI really took.
- OOM fallback: during a beside-sleeper lease the 2.5 s lease sampler reads ComfyUI `/history?max_items=8`. A job that
  started inside the lease and failed with an `execution_error` naming out-of-memory (`torch.OutOfMemoryError`,
  `AcceleratorError` "out of memory"; ComfyUI `execution.py` `is_oom`) makes the controller stop the sleeping text
  (so5 cannot deepen a light sleep: a second `/sleep` is ignored while parked, `server-queue.cpp`), delete the history
  entry, and resubmit the identical graph under the same prompt id with `front: true` (ComfyUI accepts a client
  `prompt_id`, `server.py`). The lease becomes `swap-text`; the learned use is set to everything that was free, so the
  kind stops streaming beside a sleeper. One retry per lease.
- Media plugin (`story-orchestrator-media/jobs.mjs`): a job whose history shows an out-of-memory error reports
  `running` for up to 30 s (`oomGraceMs`) so the page does not fail it before the retry lands; a second OOM (different
  `execution_start`) or the grace running out fails it as "ran out of GPU memory". Other errors fail at once as before.
  `burst-bench.mjs` polls the same way.
- `/status`: `lastResidency.lightSleep.stream` `{stage, needMiB, floorMiB, learnedMiB, marginMiB, freeMiB,
  predictedMinMiB, fits}`, lease reasons with the numbers, and `lightStream` `{enabled, marginMiB, leases, oomRetries,
  oomRetryFailed, oomAfterRetry, belowMargin, lastLease, lastOom}`.
- Expected from the plan 26/10 numbers (I): free after a light sleep ≈ 4,660-4,780 MiB, learned SDXL use ≈ 4.2-4.4 GiB,
  so after the first image the predicted minimum is ≈ 300-550 MiB. A 1,024 margin will then swap; a 512 margin streams
  only when the reading allows. The two arms bracket that.

### W1 floors (declared 2026-10-29)

Arms (controller from this branch, binary so5, the a2 candidate L config `bench-controller/10/ctl-L.json`, Max):
**K1** = L with the margin off (SDXL swaps, the `1b3a59f2` behaviour = K1 cost), **W512**, **W1024**. Pattern
`burst-bench --pattern RRRIRRRIRRRI --corpus 09/corpus-rate.json`, order K1 W512 W1024 W1024 W512 K1, each run from a
state dir seeded from `10/state-L` without `stream-use:` entries (so each run starts unlearned). Per W arm against K1,
pooled over its 2 runs:
1. image → next reply (`imageToReplyMs`) p50 ≤ **40 %** of K1's; p95 reported;
2. **0 failed images** (an image recovered by the OOM retry is not failed; retries reported);
3. **0 text spills** (spill events with role text); all spill events and `fitCorrectionMiB` reported;
4. GPU free minimum during beside-sleeper streams (the lease's lowest fast-telemetry reading) ≥ **margin − 256 MiB**;
   an arm with no beside-sleeper stream fails this floor (nothing delivered). Values per image reported.
- Adoption candidate: a W arm passing all four; if both pass, the larger margin.
- Informational drill **WD** (W512, `--hires`): exercises the OOM retry live if the larger image runs out of memory;
  reported, not a floor.
- Regression rows on adoption (`research/feature-impact-controller.md` image rows): `so-turn-types-check
  --skip-image`, one real image through the page on lane 42 (media OOM grace path untouched unless an OOM happens).

## W4 built (gateway and page, default off)

- Ported C4a (`dc3e2f78`, `3f7ccb17` from `v3.0-c4a-requeue`) onto the a2 base: page `so_pass: "read"` marker on
  llama.cpp TC story reads, gateway strip + preempt + identical requeue, lease kinds in `controller.log`.
- New `preemptReads.mode: "limited"` (`broker/readPreemption.mjs`; `mode: "full"` keeps C4a for comparison):
  - at most **one** preempt per read (`maxPreempts` is fixed at 1; a requeued read is never preempted again);
  - only while the read has decoded ≤ `maxDecodedTokens` (32), read from llama-server `GET /slots` (`n_decoded` of the
    read's slot, metrics-only JSON by default, `probeTimeoutMs` 500), and has run ≤ `maxRunMs` (4,000; the only check
    when `/slots` does not answer);
  - never a read older than `maxAgeBoundaries` (1): age = chat replies (streamed generations) the gateway finished
    since the read was issued, the gateway's proxy for boundaries (each rendered reply commits one);
  - exactly-once unchanged: one open request per read, one answer, the requeue sends the identical body.
- `/status` `readPreemption` adds `mode`, `chatsDone`, `skipped {preempted, age, decoded, runMs, probeMissed}`, `lastSkip`.

### W4 floors (plan 26 Part A + Part B, copied; declared 2026-10-29)

Arms **P1** (L config, `chatFirst`, no `preemptReads`) and **C4L** (`preemptReads {enabled, mode: limited}` defaults),
order P1 C4L C4L P1.
- Part A (`26/replay-c4a.mjs`, first 80 requests of the lane 42 capture, reads marked): chat TTFT p50 ≤ 75 % of P1,
  p95 ≤ 90 %; chat decode ≥ 97 %; every read 200 exactly once; retries ≤ 2; 0 inner beats aborted; wasted work reported.
- Part B (`26/c4a-part-b.scenario.json`, 12 real `send_generate` turns on lane 42, branch build staged so the page sends
  the marker): boundary lag of applied reads (issue → applied) pooled p95 ≤ **P1's + 1**; reads per 12 turns (audits
  per run, mean) ≥ **P1's − 1**; every read applied at most once (no duplicate applied audit, no duplicate window);
  retries ≤ 2.
- Adopt only if A and B pass. Part B is also the real-LLM live gate of the page change (marker).

## W3 built (harness; the rating is owner-gated)

- `scripts/local/rate-seeds.mjs` + `rateSeeds.mjs` (tests `rateSeeds.test.mjs`): `manifest` pairs full-length
  `bench-controller.mjs text --keep-text` runs by seed and arm; `rate` builds the plan 26 blind prompt per pair (same
  text as `26/rate-pairs-codex.mjs`, flip by hash of label, seed and prompt) and calls `codex exec -m gpt-6.1-sol -s
  read-only`, resumable, `--jobs`; **refuses without `--owner-approved`**; `aggregate` writes `summary.json`.
  Checked offline: the plan 26 R2 ratings run through `aggregate` reproduce its summary exactly.
- Set: seeds 1234 (the plan 26 runs: A `text-2026-10-28T20-30-18-363Z`, byte-identical to the 10-26 control, and A2
  `text-2026-10-28T17-37-41-289Z`), plus 7, 42, 2026 (new). A = `mtp2+cram4096+ramcut+keys+noerase`, A2 = `+ckat`,
  binary so3, `09/config-patched3.json`, `09/corpus-rate.json` 25 chat prompts, 1,024 tokens, `--gap-ms 1000`.

### W3 floors (plan 09 §R2, evaluated over the multi-seed set; declared 2026-10-29)

Over all rated pairs (4 × 25 = 100 expected):
1. each category mean (coherence, voice, guidance, continuity): candidate ≥ control − 0.2;
2. each flag (voice bleed, guidance ignored, leak): candidate ≤ control + 2 per 25 rated pairs (8 at 100);
3. replies that do not close their thinking: candidate ≤ control;
4. ≥ 80 % of the expected pairs rated.
Reported, not floors: per-seed floors and the count of seeds passing, paired bootstrap 95 % interval per category
(10,000 resamples, seed 27), preference counts, identical pairs. Performance floors 4-6 of plan 09 R2 passed for A2 in
plan 09 R and are not re-run. A2 is adoptable only if all four pass.

## GPU window recipe (owner not playing; the owner says "resume")

Preconditions (coordinator): owner not playing; owner controller stopped by the coordinator (`cli.mjs stop` in the
master tree) and nothing on 18888; `config.json` backed up and untouched; lanes/images per AGENTS.md. The scripts
refuse to start when 18888 answers. Evidence in `C:\dev\so-lanes\bench-controller\27\`.

1. **W1** (~55 min): `bash C:/dev/so-lanes/bench-controller/27/run-w1.sh` (6 arm runs ~8 min each, then the WD drill
   ~7 min); `logs-w1/aggregate.json` has the floors.
2. **W4** (~60 min): Part A `run-w4.sh a` (~15 min, `logs-c4a/aggregate.json`). Part B: in `C:\dev\so-wrapup`
   `npm run build && npm run stage` (the owner is not playing), lane 42 started, `run-w4.sh b` (~40 min,
   `logs-partb/aggregate.json`); restage master afterwards (`npm run build && npm run stage` on master).
3. **W3 generation** (~72 min): `run-r2.sh gen` (3 seeds × 2 arms × ~12 min), writes `r2-manifest.json`. The rating
   (`run-r2.sh rate --owner-approved`, no GPU, ~1-1.5 h of codex time for 75 new pairs) runs only after the owner says yes.
4. Owner controller back (coordinator), `npm run sessions:archive` / `so-evidence.mts archive --label v30-27`.

Total ≈ 190 GPU minutes (W1 55 + W4 60 + W3 72), ≈ 210 with restarts and staging. Order is by value: stop after W1
or W4 if the window is short.

## W6 package and adoption (after the window, coordinator)

- Merge order: `v3.0-a2-maxmem` first (its own gates), then this branch, then plan 28. `git merge-tree` against master
  before merging: master's `fix-comfy-poll` rewrote `jobs.mjs` around the error block W1 touches (adjacent hunks).
- Adoption per passing item only, each a key on the owner's `config.json` after a backup to
  `C:\dev\backups\story-orchestrator\`: W1 `memberCache.lightSleepStreamMarginMiB` (needs a2's `lightSleep: true`,
  binary so5); W4 `preemptReads {enabled: true, mode: "limited"}`; W3 `memberCache.checkpointAt` (A2) only on a pass of
  the owner-approved rating. Restart, then `/status` shows `lightStream.enabled` / `readPreemption.mode`.
- The patch series is unchanged by this plan (so5); plan 28 adds so6.

## Owner questions

1. Blind Sol rating for W3: run it (≈ 75 codex calls, subscription), or leave A2 unjudged? (Owner 2026-10-29: "check
   later".)
2. W1 fallback cost: an OOM beside a sleeper stops the text server (member cache dropped, next reply is a cold load,
   ~22 s+). Acceptable as a rare fallback, or retry as a full sleep only after a patch that lets so5 deepen a light sleep?
3. W1 margin if both arms pass: take the larger (declared), or does the owner prefer speed (512)?
4. W4: is a read landing one boundary later acceptable when it wins chat TTFT (Sol called the later landing a narrative
   change, research §Sol review)?

## Gate record

Build handover 2026-10-29 (CPU only; no GPU, no llama-server or ComfyUI started, owner controller, `config.json`, ST
:8000 and tray untouched; no codex rating run):
- Commits: `75f73b0a` (C4a port), `320184e5` (W4 limited), `4c069936` (W1), W3 + this doc, this record.
- Unit tests (fakes, node:test): `broker/lightStream.test.mjs` 9 (margin off = a2 behaviour; unlearned stream admitted
  with reasons in `/status`; learned use swaps the next image; measured miss drops the sleeper; OOM → drop, delete
  history, resubmit same id at the front, once; retry off; success and whole-image leases not retried; options;
  helpers), `readPreemption.test.mjs` +6 limited (preempt once under the threshold; past threshold; never twice; age;
  `/slots` fallback and `maxRunMs`; options), `media.test.mjs` +2 (OOM grace then completes; second OOM fails at once),
  `scripts/local/rateSeeds.test.mjs` 5. Offline check: `rate-seeds aggregate` on the plan 26 R2 ratings reproduces its
  summary.
- `npm run gates:quick`: green (245 s; defect replay 32 of 32 killed).
- `npm run gates` (no `--resume`): all green in 645.2 s, 11 steps (typecheck, build, typecheck:test, test:replay, test
  10,812 passed / 1 skipped, test:debug 1,660, debug:typecheck, lint, test:release, test:plugin 461 / 5 skipped,
  test-storybook:ci 1,010/1,010).
- Not run: every GPU floor above, the real-LLM live gate of the ported page marker (= W4 Part B), the W3 rating
  (owner-gated). NOT merged.

W0 upkeep 2026-10-30 (CPU only, worktree `C:\dev\so-wrapup`, no GPU):
- Merged the updated `v3.0-a2-maxmem` twice (merge, not rebase; the branch stays on top of a2): `0d4be51b` (a2 with
  master `a97af36c`) and `fae3c476` (a2 with master `a7fa71fc`, the ctl follow-ups and plan 10 M5/H1/M4).
- Conflicts: `story-orchestrator-media/jobs.mjs` (master fix-comfy-poll next to the W1 OOM grace): kept both, the
  `outOfMemory` helper and the `ComfyUnreachable` reason; `check()` keeps the OOM grace, `poll()` keeps the 60 s
  unreachable timer. `media.test.mjs`: both test sets kept (25 pass). `broker/scheduler.mjs` release path: the
  `warmImageRam` record (plan 10 M5) sits before the W1 `noteStreamLease` branch.
- `npm run gates -- --jobs=3` (no `--resume`) on `fae3c476`: all green in 524.5 s, Storybook included (1025 passed).
  Earlier full runs on the same tree went red on environment only: Storybook port 6006 taken by a peer worktree mid-run,
  `orphans.win.test.mjs` reaper timing at 100 % CPU (fails and passes in isolation on this tree), and one flaky
  `PosesList` Storybook a11y smoke. No code change between them and the green run.
- W1 recipe paths and flags unchanged (`run-w1.sh`, `run-w4.sh`, `run-r2.sh`). The recipes call `cli.mjs stop`, which
  now waits up to 15 s for active work and then stops anyway (plan 22 follow-up); `stop --force` also skips the
  ComfyUI job check. Pushed `origin/v3.0-27-fork-wrapup`; not merged (GPU-gated).

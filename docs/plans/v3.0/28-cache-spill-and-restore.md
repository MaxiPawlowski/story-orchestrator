# Plan 28 — llama.cpp fork round 5: keyed cache spill to disk (C5), restore and decode-step timing (C6, C9)

**Status: BUILT 2026-10-29, CPU only (the owner had the GPU); NOT measured, NOT merged, NOT adopted.** Branch
`v3.0-28-cache-spill` (from `v3.0-a2-maxmem`, plan 10 candidate L). Floors below were declared 2026-10-29, before any
GPU run of this plan; a miss is recorded and never retuned. Source: `research/llama-fork-opportunities.md` §C5, §C6, §C9
and the Sol review; plan 26 (results), plan 09 §R/§K, plan 10 (M5 miss).

Why now: plan 10 M5 missed as written: after an SDXL image, 0 of 7 returning members were warm on both arms. Two causes,
both "the member cache is thrown away for RAM": the refit before the first chat after an image counts ComfyUI's warm RAM
and evicts the states that survived the sleep (X arm), and in owner play 83 of 85 image sleeps dropped the sleeping server
with its whole cache (`dropSleepingForRam`, research §1). C5 writes those entries to disk instead and loads one back when
its key returns.

## Scope

1. **C5 keyed cache spill** (fork commit 9 + controller), behind `memberCache.spill` (default off).
2. **C6 + C9 instrumentation only** (fork commit 10): restore timing (per-region `tensor_set` vs total) and a decode-step
   profile (sampler, draft accept, logit copy per step), each behind an environment switch, read at `--verbosity 4`.
   No optimisation: the GPU window decides whether one is built.

Out: the C6 pinned restore pipeline and C9 backend sampling themselves (decided by the rules in §Floors), C7, C8.
Not touched (parallel agents): scheduler admission / light-sleep code, the gateway read-preemption code, process
spawn/kill.

## Design

### Server (fork commit 9, `tools/server`, `common/arg.cpp`)

- Flags `--cache-spill-dir PATH` (must already exist; the server never creates it, the controller does, owner-only) and
  `--cache-spill-max-mib N` (default 8192). Without the flag nothing changes.
- `POST /cache/spill {"keep_mib": N}` moves entries out of RAM, oldest first, until the cache holds at most N MiB:
  unkeyed entries are dropped (as eviction would), keyed entries are written to files. While sleeping it runs at once
  under the queue lock (the loop thread is parked, as `/cache/limit`); awake, at the next idle point. The HTTP answer
  comes when the spill is done (timeout 120 s): `{spilled, dropped, spilled_mib, ms, kept_mib, files, files_mib}`.
  It never wakes a sleeping server.
- Load back: `server_prompt_cache::load` also scores spilled entries of the request's key (same `f_keep`/`f_sim` rule,
  token lists kept in memory); the best one is read, verified, pushed as a RAM entry and restored through the existing
  path. A newer RAM entry of the same key that contains a spilled one deletes the file.
- `GET /cache` adds `spill {enabled, files, size_mib, max_mib, writes, reads, misses, dropped}`.
- §C5 safety list, item by item:
  - dir under the controller state dir, never a lane or repo path: `<stateDir>/member-spill/<pid>/` (controller
    passes `<stateDir>/member-spill`; the server makes only its own `<pid>` folder);
  - owner-only ACL: the controller runs `icacls <dir> /inheritance:r /grant:r <user>:(OI)(CI)F`, reads the ACL back
    and refuses (spill left off for that load, reason in `/status`) if any other principal remains; children inherit;
    POSIX `0700`;
  - hashed names: `<16 hex>.spill`, hash of key, fingerprint, sequence and time; the key itself is not in the name;
  - atomic writes: `<name>.tmp`, flushed, then renamed; a failed write deletes the temp file and drops the entry;
  - size bound: oldest files deleted first to fit `--cache-spill-max-mib`; an entry above the bound, or with under
    2 GiB of free disk left after it, is dropped (C: has run out before);
  - integrity hash: a 64-bit hash over every section, checked on read;
  - fingerprint: model path and file size, draft model path and size, parameter count and model size, `n_ctx`,
    `n_seq_max`, K/V types, flash attention, `swa_full`, `kv_unified`, draft `n_ctx`, `LLAMA_STATE_SEQ_VERSION` and the
    file format version; a changed fingerprint deletes every spilled file;
  - a mismatch, corrupt or unreadable file is a cold miss (`misses`), never an error;
  - deleted on load (always, read or not), on server exit (destructor removes the `<pid>` folder), and by the
    controller: all folders at controller start and stop, every other pid's folder when a new text server answers, and
    after a drop (a kill skips the destructor); deletion is cleanup, not secure erasure;
  - spill before image admission: the controller awaits `/cache/spill` inside admission (below), so the image is
    admitted only after the files are written.
- Media prompts (mtmd) are never spilled (our server runs `--no-mmproj`).

### Controller (`server-plugin/story-orchestrator-gpu/broker`, `scripts/local`)

- `memberCache.spill` (boolean, default false; needs store `ram` and `serverKeys`), `memberCache.spillMaxMiB`
  (1024-65536, default 8192). `nativeArgs` adds the two flags only when spill is on and the directory passed its ACL
  check at this load (`text.cacheSpill {ready, acl, reason, dir}`).
- Where it spills (all awaited, so before admission):
  - image trim (`makeRoom` → `trimForImage`): spill down to the computed limit, then `POST /cache/limit`;
  - a lowering refit (before a planned chat, after a reply, on settings): spill down to the target first (the M5 cause
    on X);
  - `dropSleepingForRam` (scheduler, minimal diff: a hook call before the drop): spill just enough for the image floor
    (`keep = occupancy + available − floor`), re-read RAM, keep the sleeping server when it now fits; otherwise drop as
    before and sweep the dropped server's folder (`onSleepingDropped`).
- `/status` → `memberCache.spill {enabled, ready, acl, dir, maxMiB, native, disk {dirs, files, bytes}, lastSpill,
  spillMsP50, spillMsMax}` and counters `spills`, `spilledEntries`, `spilledMiB`, `spillDropped`, `spillFailures`,
  `spillsInsteadOfDrop`, `spillSweeps`; `disk` is read on every status call.
- Not changed: the light-sleep fallback that stops a light sleeper short of the GPU reserve (`dropSleeping` in the
  admission branch) still drops its cache; spilling there needs an admission change (open question 2).

### C6 / C9 instrumentation (fork commit 10)

- `LLAMA_STATE_TIMING=1`:
  - server: `restore timing: main <MiB> in <ms>, draft <MiB> in <ms>, spill read <ms>, total <ms>, <n> tokens, <k>
    checkpoint(s)` per cache restore;
  - library (`llama_io_read_host`/`llama_io_write_host`): `state timing: restore <regions> regions (<small> under
    64 KiB), <MiB>, tensor_set <ms> (max region <ms>), parse+memcpy before it <ms>` and the save twin with
    `tensor_get`.
- `LLAMA_DECODE_PROFILE=1`: one `decode profile:` line per 5 s window: decode calls (synchronized), pre/post decode,
  plain sampling, draft accept (per call and per accepted-or-sampled token), drafter, speculative process; target and
  draft context compute wait and logit copy (rows, ms, MiB) from a new `llama_decode_profile_take()`. The upstream
  compile-time `DEBUG_TIMINGS` became this runtime switch. Profiling synchronizes after each decode: its decode rate is
  reported, not used as the production rate.
- Both off by default; with them off the only cost is a static flag check.

## Build

- Fork: branch `so-r6` in worktree `C:\dev\tools\src\llama.cpp-b11888-so6`, on `so-r4` (`8b83266`, the 8-commit so5
  series). Commits `8874590` (C5: `tools/server`, `common/arg.cpp`, +656 lines) and `0a90c31` (C6/C9: `include/llama.h`,
  `src/llama-context.*`, `server-context.cpp`); repo copy `scripts/local/llama-patches/so-cache-b11888.patch` (10 commits;
  `git am` on b11888 reproduces the `so-r6` tree `989a69e`, checked).
- Binary `C:\dev\tools\llama-b11888-so6-cu128`, built 2026-10-29 at idle priority with `-j 2` (full CUDA build about
  2.5 h; the changed files compile without warnings; cuBLAS/cudart DLLs hardlinked from so5; both commits' strings are in
  `llama-server-impl.dll` / `llama.dll`). Never run that day (no GPU, and a CPU run would take the owner's RAM): compile
  only. Commit `8874590` alone was not built separately.

## Floors (declared 2026-10-29, before any run)

Arms (binary so6 for both, so the only difference is the key): **L6** = plan 10 candidate L (`bench-controller/10/ctl-L.json`:
Max, `fitRam`, `keepAcrossImages`, `lightSleep` 2800) with spill off; **LS6** = L6 + `memberCache.spill: true`,
`spillMaxMiB` 8192. `LLAMA_STATE_TIMING=1` on both (timing lines only).

### P. Parity so6 vs so5 (switches off)

- P1. Greedy output (temp 0, 96 tokens, `cache_prompt: false`, 2 real prompts) byte-identical between so5 and so6, both
  runs of each.
- P2. `bench-controller text` arm `mtp2+cram4096+ramcut+keys+noerase+v4` on `corpus-rate.json`, 1 run each: chat TTFT
  p50 within ±5 %, decode within ±3 %.

### C5 (from research §C5, plus plan 10 M5)

Row A (plan 10 M5 protocol, no ballast): fill `cap-5m.jsonl` 60 requests, then 3 × (SDXL scene via `render-benchmark
auto scene 256`, then `cap-5m-after{k}.jsonl` 8 requests); order L6 LS6 LS6 L6. Row B (owner RAM condition, drop path):
`ram-ballast.mjs --leave-mib 7500` after load, `burst-bench --pattern RRRIRRRIRRRI --corpus 09/corpus-rate.json`; L6 then
LS6, one run each. "First post-image member turn" = each member's first chat after an image; warm = the member cache
counted a hit for it (`/status` `memberCache.hits` up, not `misses`; the prefill path judges the keyed prefill's
`cache_n ≥ evaluated / 4`), as plan 10 M5 counted it.

Floors (LS6 against L6, each row separately):
1. warm share of first post-image member turns ≥ 60 %;
2. their TTFT p50 ≤ 60 % of L6's;
3. image → reply p50 ≤ 105 % of L6's (row A: `render-benchmark` `totalCycleMs`; row B: lease end → first reply;
   spill time included);
4. RAM floor and commit charge held: RAM available at admission, minimum per lease, ≥ L6's − 256 MiB; lowest commit
   free inside each lease ≥ `reserves.ramMiB` (row A, `measurement.lowCommitMiB`; row B has no per-lease commit record); 0
   RAM-short refusals;
5. 0 spill files after the controller stops (`files-after-stop.json`), and at no status sample above `spillMaxMiB`;
6. exactness (`spill-probe.mjs`, 4 member prompts, light sleep, plus 1 full-sleep pick): per prompt the restore from a
   spilled file vs `cache_prompt: false` diverges no earlier than the smaller of two RAM-restore control runs; every
   candidate actually restored from the file (`cache_n` > 0, a `cache spill: read` line);
7. a corrupted file (one byte flipped) is a cold miss: request answers 200, `spill.misses` + 1, the file is gone;
8. 0 failed requests, `fitCorrectionMiB` 0, 0 spill (VRAM) events in every arm;
9. plan 10 M5 restated for LS6: after an image, at least one returning member is warm in 2 of 3 cycles of every row A run.

Adoption needs every C5 floor, P1-P2, the regression rows below and `npm run gates` (no `--resume`).

### C6 (instrumentation only now)

- Decision rule for building the pinned restore pipeline (research §C6): only if, across the row A/B and probe
  restores, `tensor_set` is ≥ 50 % of the target restore time p50 **and** the restore total p50 is ≥ 300 ms
  (`c6-aggregate.mjs` prints the decision).
- Its adoption floor, copied from §C6 for the future build: warm switch p50 ≤ control − 0.3 s, RAM minimum ≥
  control − 256 MiB, greedy output identical.

### C9 (informational)

- `c9-profile.mjs`, 8 chat prompts × 1,024 tokens, recorded samplers, arms off and profile. Reported: sampler (plain +
  accept) ms per generated token, logit copy ms per token, their share of the step, profile overhead (decode rate
  profile / off).
- Decision rule: a `--backend-sampling` trial is considered only if sampler + logit copy ≥ 10 % of the per-token step;
  it is output-changing (sampler implementation), so it would need a blind rating.

### Regression rows on LS6 (if C5 passes; `research/feature-impact-controller.md` base set)

- `so-turn-types-check --skip-image`, `v29-a02-stopped-reply`, `09/live-ram-cache.scenario.json` (lane 42), the plan 10
  p41 image journey ×2, GS6 (RAM member cache rows). Not run, with reason: payload goldens (no prompt path change),
  full-length rating (C5 restores the same bytes; floor 6 checks it).

## GPU window recipe (≈ 120 min; owner not playing)

Script: `C:\dev\so-lanes\bench-controller\28\run-gpu.sh` (configs `ctl-L6.json`, `ctl-LS6.json`, `config-so5.json`,
`config-so6.json` in the same folder; probes `greedy-parity.mjs`, `spill-probe.mjs`, `ram-ballast.mjs`,
`c9-profile.mjs`; aggregates `aggregate-c5.mjs`, `c6-aggregate.mjs`). Steps and minutes:

1. G0: record the owner `config.json` sha, `node scripts/local/cli.mjs stop` in `C:\dev\story-orchestrator` (1).
2. G1 parity: `greedy-parity.mjs` so5, so6, so5, so6 (5); `bench-controller text` so5 and so6 (10).
3. G2 spill probe: `spill-probe.mjs ctl-LS6.json probe-context.json 4 context` and `... probe-full.json 1 full` (10).
4. G3 row A: L6 LS6 LS6 L6, each: start with `LLAMA_STATE_TIMING=1`, fill 60, 3 × (scene + after-k 8), status, stop,
   files after stop (4 × 12 = 48).
5. G4 row B: L6 then LS6 with the ballast and `burst-bench` (2 × 12 = 24).
6. G5 C9: `c9-profile.mjs ctl-L6.json c9.json 8 off,profile` (12).
7. G6 aggregates: `c6-aggregate.mjs`, `aggregate-c5.mjs` (1).
8. G7: owner controller `start` + `restore`; check the owner `config.json` sha is unchanged (2).

Regression rows (only if C5 passes): ≈ 45 min more, in a later window.

## Tests (offline, this branch)

- `server-plugin/story-orchestrator-gpu/broker/cacheSpill.test.mjs` (16): icacls parse; owner-only ACL set and read
  back, refused with a foreign principal or an icacls error; POSIX 0700; sweeps keep only the live pid folder and never
  touch foreign names; usage counts spill names only; options (off by default, needs ram + serverKeys, bound range,
  dir under stateDir); `nativeArgs` flags only when on; a text load prepares the directory before llama-server starts
  and starts without spill when the ACL check fails; controller start sweeps and sets the ACL; image trim spills before
  `/cache/limit` (nothing evicted); spill off = unchanged trim; lowering refit spills first; `spillForRam` keeps what the
  floor allows; a refused spill is counted and the trim evicts as before; a new pid sweeps older folders, a null
  (sleeping) pid sweeps nothing.
- `scripts/local/cacheSpillDrop.test.mjs` (5, real scheduler, Max preset): RAM-short swap spills before admission and
  keeps the sleeping server; spill short of the floor drops and sweeps; a spill that answers nothing drops; no hook =
  unchanged drop path; RAM above the floor = no spill, no drop.
- The C++ side has no unit test harness here; it is checked by the GPU-window probe (floors 6, 7) and compiled clean.

## Unresolved questions

1. Spill while awake runs at the next idle point; a lowering refit before a planned chat now writes entries on that
   chat's path (about 0.5 s per 0.8 GiB entry, estimate) instead of evicting them. Floor 2/3 measure the net; keep or
   restrict spill to sleep-time only?
2. The light-sleep fallback (light sleeper short of the GPU reserve) still stops the server and loses its cache. Spilling
   there needs the server converted to a full sleep instead of stopped, an admission change in the parallel agent's area.
3. A spilled state reads back through a temporary RAM copy (≈ 0.8 GiB) during restore; on the owner's 5-9 GiB available
   that is a transient over the cache limit. Measured by floor 4; streaming the read into `tensor_set` is C6 territory.
4. Is a sleeping, fully-slept llama-server's non-cache RAM small enough that keeping it alive (instead of dropping it)
   helps the floor? Row B answers it (`spillsInsteadOfDrop` vs drops).

## Gate record (build, 2026-10-29, CPU only)

- `npm run gates:quick`: green (typecheck, defect replay `--cached` 32/32 killed), 313 s.
- `npm run gates` (no `--resume`, Storybook included): all green in 726.3 s (typecheck, build, typecheck:test, test,
  test:debug, debug:typecheck, test:replay, test:plugin, test:release, lint, test-storybook:ci 167 suites / 1010 tests).
  Log: `C:\dev\so-lanes\bench-controller\28\gates-run1.log`.
- New tests: `broker/cacheSpill.test.mjs` 16/16, `scripts/local/cacheSpillDrop.test.mjs` 5/5; broker + scripts/local
  suites 297/297.
- so6 compiled (see §Build); patch series exported and re-applied on b11888 to the same tree.
- Not run, with reason: every GPU row (the owner had the GPU); no llama-server was started, not even on CPU.
- Deviation: the scheduler got a minimal edit in `dropSleepingForRam` only (spill hook before the drop, sweep hook
  after it); admission, light-sleep and gateway preemption code untouched; spawn/kill untouched (cleanup runs from
  `memberCache` sweeps and the controller's stop path).

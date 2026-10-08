# Plan 39a — parallel RunPod runs and coverage audit

**Status (2026-10-07): analysis + tooling, not run.** Owner request: run the RunPod tests in parallel (several pods if
needed), cut wall-clock without losing quality, and check that every new v2.7 feature has tests. Companion to
`39-test-from-zero.md` (not edited here; its owner applies the record lines below). Rows: `test/phase-c/manifest.json`
(199 rows). Estimates: `test/phase-c/pod-estimates.json`. Planner: `node scripts/suite/pod-schedule.mjs`.

## Part 1 — parallel RunPod plan

### Hardware (B1 pod) — owner decision 2026-10-07

Supersedes the pod count in §Recommendation for B1; the schedule tables below stay as the fallback's plan.

| | |
|---|---|
| Pod | **one RunPod RTX PRO 6000 Blackwell** (96 GB, Secure cloud, ~$2.09/h). Stock in EU-CZ-1, EUR-IS-2 and US, not in EU-RO-1 where the network volume is, so the 19 GB Artemis GGUF downloads fresh on the pod (no volume); budget its download into the first start |
| Sizing, first ~15 min of B1 | row **B1-PAR** (manifest, 39 §B1 rows): llama-server restarted per arm with `LLM_PARALLEL` 2, 4, 6 (all other args unchanged), each arm ~5 min of real Phase C load, i.e. that many adolion-fresh model lanes each playing its first B1 row. Measured per arm: per-stream tok/s (llama-server `predicted_per_second`, p50 and min), prompt tokens per request (`tokens_evaluated`, p50 and p95), turns/hour summed over the lanes |
| Pick | the `LLM_PARALLEL` with the most turns/hour whose per-stream rate stays ≥ 25 tok/s; **lanes = that count** for the rest of B1 (`SO_MAX_LLM_LANES` per pod set to it, `st-lanes.mts start --judge-lanes` re-split to match). The arms' rows run again in full after the pick; the sizing runs are evidence for B1-PAR only, never for the rows they played |
| Fallback | no arm qualifies, or no RTX PRO 6000 in stock: **2–3 × RTX PRO 4500** with `LLM_PARALLEL=2`, two lanes per pod, the existing tooling and §Recommendation's plan |
| Why the 25 tok/s floor | the RTX PRO 4500 measured ~33 tok/s per stream (debug-scripts gotcha 2026-09-20); below 25 the harness's fixed timeouts and the latency rows (B1-R4 p95, B1-C3) start measuring the queue, the T7 failure (5 lanes, 56 s for 4 tokens) |

### What needs the pod

| Class | Rows | Where | Pod time |
|---|---|---|---|
| D only | 80 (B0, C0–C3, C1b, most C2, J0, Z, …) | no-model lanes, any number at once | 0 |
| CL only (DeepSeek, TypeSafe) | 35 | cloud lanes (`st-lanes.mts pod <n> cloud`) | 0 |
| LI without RP | 20 | the isolated comfy lane, serial (one local 3090) | 0 |
| RP | 63 | pod lanes, 2 per pod | 59 rows; 4 are scored from other rows' replies (35-K4, 35-K4-C5, 35-P4-K4, 33-W1-V5) |

Manifest notes for the 39 owner: 33-W1-V5 and 35-K4-C5 carry reset `adolion` but run nothing of their own (should be
`offline`); 39 §RunPod budget charges 36-Q1-M1/M2 ≈ 2 lane-hours of pod time, but the manifest tiers them CL offline.

### Dependency graph (model rows)

```
B0-live (base goldens, no-model lane) ─┐
B1 tooling ready (39 §Stage B tooling) ─┴─> B1 pod session: 35-K2, 35-K3 (→ 35-K4 offline), 35-K5, 35-M2, B1-C3+B1-C12 (shared runs), B1-R4
                                          + B1 CL rows in parallel on cloud lanes: 36-Q1-M1/M2, 37-M1/M2, S-17, 37-S17, 37-L3, 37-L6-C
B1 all done ──> B2 decisions ──> B3 build ──> C0 freeze
C0 ──> C1, C1b, C3 (local / no-model) and C2 (no-model lanes 1–4) ──> all green ──> C pod session
C pod session (each row: run 1, reset, run 2 on one lane):
   33-W2-oversteer ──> C4-R6, C4-J8, S-19-OOC-b (warden rows)
   34-RP ──> 36-Q3, 36-pilot-academy, 36-pilot-saga, 37-M3, 38-C7-life, 38-C7-quest (persona readers)
   35-K3-C5 ──> 35-K4-C5 (offline);  35-P4-K3 ──> 35-P4-K4 (offline);  33-W1-V3, V4 ──> 33-W1-V5 (offline)
   branch rows (35-K3/K4/K5-C5, 35-P3-K2, 35-P4-*) only if B2 takes SP6 PASS
   everything else independent: C4 journeys, O-rows, S-rows, 32 rows, R4-live, 38-C7
   C6 LI+RP rows (32-W7-look, S32-2, S32-2-lifecycle, O4) also hold the single comfy lane
C pod session + C5 CL rows + C6 LI rows + C8/C8b (cloud) ──> Z
```

The ×2 rule (39 rule 4, v2.7 16 rule 2): a row's run 1 and run 2 are consecutive on **one lane** (one install), with
the rule 11 reset between, and a run-header pair around the batch. It constrains each row (or each independent unit
of a row, §S4), never the order of different rows across lanes.

### Fixed and setup costs

| Cost | Measured / assumed | Per | Minimised by |
|---|---|---|---|
| Pod start: container, 19 GB GGUF load from the network volume, SSH tunnel, `/profile` reselect on each lane | ~12 min (load ~3 min; 35 §RunPod cost: ~0.3 pod-h per start incl. stop) | pod × session | one start per pod per session (B1, C); lanes seeded, started and retargeted **before** the pod boots; pods never stopped between C4/C5/C6/C7 |
| Pod idle stop | ~6 min | pod × session | each pod stops when its own queue drains (planner bills per pod) |
| `adolion-fresh seed` | 8–10 min, ~5.06 GB (`laneBytes`), disk-bound, serial (lane logs 2026-10-01/02) | every adolion run (rule 11) | §S1 snapshot pool |
| `st-lanes seed --fresh` + restore-config + reload | ~4 min | every `lane` run | §S1 |
| comfy reset (media ledger, queue empty) | ~6 min | every comfy run | serial anyway |

### Schedule over N pods

Planner output (`node scripts/suite/pod-schedule.mjs --shares`, snapshot resets, split units; list scheduling,
longest-first, dependencies and the single ComfyUI respected; USD at $0.72/h):

| Pods | Model lanes | B1 wall h | C wall h | Pod wall h | Pod-hours | USD | SP6 FAIL branch (`--branches none`): pod-h / USD / wall h |
|---|---|---|---|---|---|---|---|
| 1 | 2 | 6.8 | 23.3 | 30.1 | 30.1 | 21.68 | 26.3 / 18.92 / 26.3 |
| 2 | 4 | 4.7 | 11.9 | 16.6 | 31.5 | 22.69 | 27.7 / 19.93 / 14.7 |
| 3 | 6 | 3.0 | 8.1 | 11.1 | 32.0 | 23.02 | 28.3 / 20.36 / 9.8 |
| 4 | 8 | 3.0 | 6.1 | 9.2 | 32.8 | 23.58 | 28.9 / 20.79 / 8.3 |

More pods cut wall-clock ~linearly at nearly equal pod-hours (+~0.6 pod-h per extra pod: its two starts and stops).
B1 stops shrinking at 3 pods (35-K3 and 35-M2 pool their arms on one pod, §S4). Without the slicing below
(`--no-snapshot --no-split`, no shares) the same rows take 37.3 pod-h ($26.83) on 1 pod and 12.3 h wall on 4.

My lane-hour estimates (59 lane-h on the pod with shares, all branches) are above 39 §RunPod budget's 45.5–49.5: they
add the SP6 PASS branch rows (~7.5 lane-h), the scripted C5 rows (S-06, S-10, S-19*, 37-Q3, ~2 lane-h) and the C6
rows with replies (~1.8 lane-h), and drop 36-Q1 (CL). Every number is an estimate until B1 measures real minutes; the
planner takes them from `pod-estimates.json`, so re-plan after B1 with measured `runMin`.

### Slicing without losing quality

| # | Change | Saves | Why quality holds |
|---|---|---|---|
| S1 | **Snapshot pool for resets.** Pre-seed never-started copies (`adolion-fresh seed` + `check` passed, inventory diff 0 vs the lane's last good seed) on spare lane numbers; swap one in by directory rename (same volume) for each reset; re-seed spares in the background (10 min seed < typical 15–60 min run) | 78.0 → 61.3 lane-h (−16.7, ≈ −8 pod-h, ≈ −$6) | a swapped snapshot *is* a re-seed of the same pin, done earlier; the other rule 11 steps (persona, routing diff 0, assets, restore-config, reload) still run. Needs a 39 rule 11 record line: "or swap in a never-started seed of the same pin whose check passed" |
| S2 | **Shared runs** (`pod-estimates.json` `shares`, `--shares`): 36-Q3 scored in 36-pilot-academy's runs (its prerequisite *is* the pilot's checks); 37-S19 = S-19 with `clock` declared (S-19 already asserts the clock producer); S-19-OOC-b in S-19-OOC's chat (S-19-OOC already needs the warden on); J4, J14 on a no-model lane (0 checks need a model, v2.6 13) | −2.4 lane-h (≈ −1.2 pod-h) | every row's own assertion and floor are evaluated on two runs; setups are supersets of each row's prerequisites. A no-model lane strips keys, so a hidden model call fails loudly, never greens. Each share needs a 39 record line |
| S3 | **Off the pod entirely**: all D, CL-only and LI-only rows on no-model / cloud / comfy lanes, concurrent with the pod session; payload goldens (C0/C3), B0-base, defect replay, jest goldens local | pod time 0 for 135 rows | nothing changes in the rows; only where they run |
| S4 | **Split independent units across lanes** (`units`): 35-K3 by judge on/off pair, 35-M2 / 35-M2-C5 / 35-P4-M2 by stub, 38-C7 by story. Each unit runs twice in a row on one lane and keeps its A/B pair together; pooled-arm rows keep every unit on one pod (`samePod`) | wall only: B1 4.3 → 3.0 h at 3 pods | the ×2 rule is honoured per unit; an A/B never compares across lanes. Needs a 39 record line ("×2 per unit for split rows") |
| S5 | **Fail cheap first**: C1, C1b, C3 and C2 green before the C pod session; every B1 row's tooling dry-run on a no-model lane before the B1 pod starts | avoids paid re-runs (a fix = new candidate = affected rows again); avoids an idle pod waiting on B0 blockers (35-M2 labeller/scorer, B1-C3 attribution, 38 A4 lab data) | ordering only |
| S6 | **Denominator-only stop rules**: 32-W8-S32-1 stops an arm at its 15th mentioning reply (floor "≥ 15 mentioning replies per arm"); B1-C3 stops a run once ≥ 100 warden and ≥ 100 lore-check calls are in | ~0.5–1 lane-h | the stop depends on the count the floor names, never on the outcome, so no optional-stopping bias. Needs a 32 W8 record line (its setup says N = 30) |
| S7 | **Judge account share**: `st-lanes.mts start <n> --judge-lanes <k>` gives each lane's plugin 1/k of the TypeSafe account | prevents self-inflicted 429s and timeouts with 6–8 judge lanes | each lane's plugin limits itself alone; 8 lanes would ask for 8 accounts, and B1-C3 *measures* timeouts. Run B1 with `k` = every judge-using lane (pod + cloud) |
| S8 | **Defect replay `--cached`** only in the B3/fix loop | minutes per gates run | never as C1 run 2: a cached run reuses run 1's verdicts, so it is not a second run |

Rejected (would lose quality):

| Idea | Why not |
|---|---|
| More than 2 model lanes per pod, or raising `LLM_PARALLEL`, **without measuring it** | T7: 5 lanes on one pod → 56 s for 4 tokens; latency floors (B1-R4 p95, R4-live, B1-C3) and timeouts would measure the queue. On the RTX PRO 6000 the count is measured first (B1-PAR, §Hardware), with the 25 tok/s per-stream floor guarding exactly this |
| Run 1 and run 2 of a row on different lanes or pods, or interleaved with another row on the same lane | "twice on one install, consecutively" is what found the J5 stale-cache and J8 parser defects |
| Split a latency-floor row's arms (B1-R4, B1-C3, 36-Q1-M1, 37-M2) or any A/B pair across lanes | the arm and its control must share lane, pod and time window |
| Reuse C4 J8 as an arm of C4-J8 | C4 J8 is a journey run, C4-J8 an on/off A/B with its own floor; one run cannot be both a row and the other row's arm (was "a dev run never closes a prod row"; one build since 2026-10-07) |
| Fewer turns / pairs / stories (38-C7 N = 12, 37-M3 20 pairs, 34-RP 10 starts, journeys' checks) | each is the floor's denominator |
| Drop B1 because C5 re-runs 35 on the candidate | B1 decides what B3 builds; C5 is acceptance on the frozen build |
| Skip a reset, or seed lanes without the sprite packs | rule 11; a sprite-less install is not the tested install |
| RunPod HTTPS proxy with `--host 0.0.0.0` instead of tunnels | puts an unauthenticated llama-server on the internet; tunnels cost nothing |
| Mocked judge on CL rows | not a real-model row (39 rule 3) |

### Recommendation

| | |
|---|---|
| Pods | B1: one RTX PRO 6000 sized by B1-PAR (§Hardware). Fallback, and the plan the tables above schedule: **3 × RTX PRO 4500**, same template, GGUF and llama-server args (`LLM_PARALLEL=2`), same data center as the network volume; `MAX_UPTIME_HOURS` ≥ 10 (C session ~8 h per pod) |
| Lanes | 6 pod lanes (pod k ↔ lanes 2k+1, 2k+2, tunnel `127.0.0.1:1808k`); 2–3 cloud lanes (CL rows); no-model lanes 7–10 (D rows, J4, J14); the comfy lane (C6); spares 11+ for the snapshot pool |
| Order | B0-live → B1 tooling dry-run → **B1 pod session** (3 pods, ~3 h) with B1 CL rows on cloud lanes → B2 → B3 → C0 freeze → C1/C1b/C3 + C2 on no-model lanes (~4 h, no pod) → **C pod session** (3 pods, ~8 h; queues from `pod-schedule.mjs --shares --queues 3`) with C5 CL, C6 LI, C8, C8b in parallel off the pod → Z |
| Estimate | pod wall ≈ **11 h** (3 + 8), pod-hours ≈ **28–32**, **≈ $20–23** (SP6 FAIL / SP6 PASS branch). Freeze → playtest ≈ 12 h, vs ≈ 27 h on one pod |
| Budget | SP6 FAIL branch fits the approved ≈ 27 pod-h within 5 %; SP6 PASS (≈ 32 pod-h, $23) exceeds it but stays under the 150 % stop (40.5 pod-h). Ask the owner at B2 if PASS |
| Why not 4 | −2 h wall for +0.8 pod-h, 8 lanes × 5 GB + spares against 92 GB free on C:, and the TypeSafe account split 8 ways (150/min per lane) |

Disk: 6 live adolion lanes + 6 spares ≈ 60 GB of the 92 GB free on C: (2026-10-07). Re-check with `seedSpace` before
seeding; a shared read-only sprite worktree per pin (spec T5) would bring a lane to ~2.4 GB.

### Tooling

Built here (node:test, `npm run test:debug`):

| Piece | Files |
|---|---|
| `st-lanes.mts pod <n> <k\|cloud> [--pod-id <id>]`: retargets a stopped lane's loopback pod-tunnel profiles (18080–18089) to `18080+k` (cloud: closed port 18079, so a stray pod call fails loudly), reads back, writes `<lane>/pod.json`. `status` shows each lane's pod. The lane-load rule (`laneLoadProblem`) now counts model lanes **per pod** (`SO_MAX_LLM_LANES` per pod); without pod records every lane is pod 0, as before | `scripts/debug/lib/lanePods.mts`, `scripts/debug/st-lanes.mts`, `scripts/debug/lib/lanePods.test.mts` |
| `st-lanes.mts start <n> --judge-lanes <k>`: the lane's judge plugin gets 1/k of the account (`SO_JUDGE_ACCOUNT_RATE_PER_MIN`, `SO_JUDGE_ACCOUNT_TOKENS_PER_SEC`); reported not applied when the server was already up | same |
| Run header `lane {n, pod, port, podId}`: a lane moved to another pod between run 1 and run 2 shows in `so-run-header diff` | `scripts/debug/so-run-header.mts` |
| Manifest planner: RP rows × estimates → per-lane queues over N pods, B1 and C sessions, dependencies, comfy exclusivity, units, `samePod`, shares; guard test fails when a manifest RP row has no estimate, derived source or share | `scripts/lib/podSchedule.mjs`, `scripts/suite/pod-schedule.mjs`, `scripts/lib/podSchedule.test.mjs`, `test/phase-c/pod-estimates.json` |

Specified, not built:

| # | Piece |
|---|---|
| T1 | `st-lanes.mts swap <n> --from <m>`: stopped lanes; rename m's `data/`, `adolion-fresh/` and the asset baseline into n, re-apply n's `pod.json` retarget, run `adolion-fresh check n`; refuse a spare that was ever started after seeding (server log) or whose inventory differs. Plus `adolion-fresh seed <m> --spare-for <n>` |
| T2 | Per-pod tunnel script: `get-pod` → `ssh.direct` → `ssh -N -L 1808k:127.0.0.1:8080 -p <port> root@<ip>`, retried after a pod restart (the port moves); then `/profile Artemis RunPod RP` on each of the pod's lanes (reselect clears a dead-backend page). **Partly built**: `so-pod.mts target` + `up` keep the tunnel up and log its health (§Run evidence); the `get-pod` lookup and the reselect stay manual |
| T3 | Run header records llama-server `/props` (model, `n_ctx`, slots) per lane, so two pods with different args diff red |
| T4 | `st-lanes.mts queue <file>`: runs a planner queue (journeys/scenarios via `batch`, `so-session` cards, scripts) per lane with run-header pairs, writing evidence paths for the manifest |
| T5 | `adolion-fresh` shares one read-only sprite worktree per pin across lanes (junction), private copy only on the comfy lane |

## Run evidence (2026-10-07, branch `v2.7-39a-logging`, built, not run)

Owner request: every piece of debug-relevant data captured per row, surviving pod and lane teardown. Nothing here
ran against a pod, a lane or ST; every capture is unit-tested with fakes (`npm run test:debug`).

### Inventory: what each source lands as

Before = on `26025017`; after = this branch. Paths: `<lane>` = `<so-lanes>/<n>`, `<pod>` = `<so-lanes>/pods/<k>`,
`<row>` = `<lane>/debug/batch/<stamp>/<item>-run<k>/` (batch) or `<lane>/debug/runs/<stamp>-<script>/` (`st-lanes run`).

| Source | Captured by (before) | Lands (before) | Retention (before) | After |
|---|---|---|---|---|
| Runner stdout/stderr | `st-lanes batch` (per item, line-stamped) | `<lane>/debug/batch/<stamp>-<item>-run<k>.log` | kept, never archived | `<row>/runner.log`; `st-lanes run` tees too |
| Scenario result | `so-scenario` (`writeJSON`) | `<lane>/debug/<ts>_so-scenario-result.json`, failure dump `_so-scenario-failure.json` | **rotated**: deleted once 40 newer artifacts exist (`output.mts`), so a long batch lost its early rows; batch recorded no path for scenarios | copied into `<row>/record.json` / `failure.json` right after the row; result carries `page` |
| Journey record | `so-journey` | `<lane>/debug/<ts>_journey-<id>.json` + `journey-<id>.md` (rotation-protected) | kept; archived only by hand (`so-journey archive`) | also `<row>/record.json`; record carries `page` |
| Engine history, asset baseline, config snapshot | `so-journey` cleanup | `<lane>/debug/engine-history-*`, `so-journey-*.json` | kept | archived by `so-evidence archive` |
| Run header | `so-run-header capture` | `<lane>/debug/run-header-*.json` | kept | archived |
| Browser console errors/warnings, `pageerror` | **`so-session` only** (console tail) | `test/sessions/<tier>/<id>/console.jsonl` | private repo | every `runCli` runner that opts in (scenario, journey, payload golden, every `so-b1-*`) and **every** runner inside a batch row / `st-lanes run` (`SO_ROW_DIR`): `<row>/page.jsonl` + `page-summary.json`, or `<lane>/debug/page-<label>-<ts>.jsonl` outside a row; printed as `page-capture:`, `PAGE-ERROR`, `REQUEST-FAILED` lines |
| Failed requests, 4xx/5xx on `/api/*` | none (so-session saw only ComfyUI requests) | — | — | same files: `requestfailed` (aborts flagged, not shouted) and `http-error` rows, URL path only (no query string) |
| Lane ST server log | server start (`st-lanes start`) | `<lane>/server.log`, one file forever | until the lane dir goes; `so-session` greps it for ComfyUI only | the bytes written during the row: `<row>/server.log` (last 4 MB if larger; rotation detected) |
| Journal / payload tails | `so-session` | `test/sessions/.../journal.jsonl`, `payloads.jsonl` | private repo | unchanged |
| Session evidence (full chats, transcripts, wizard drafts, required artifacts) | `so-session stop` | `test/sessions/<tier>/<id>-<n>/` | private repo (`sessions:archive`) | unchanged |
| Payload goldens | `so-payload-golden capture` | `--out <dir>` | wherever `--out` points | page capture per case (`result.page`) |
| B1 summaries / raw | `so-b1-*` (`b1Runs.mts`) | `test/phase-c/records/<row>/run-<n>.json` (public) / `<lane>/debug/b1/<row>/run-<n>.raw.json` | raw: **the record says "archive with sessions:archive", which never covered it** | raw archived by `so-evidence archive`; page capture per run |
| llama-server log, per-request timings | **none**: `start.sh` sends it to `/dev/null` unless `LLM_DEBUG_LOG=1`, then `/tmp/llama-server.log`, erased on stop | — | lost | `so-pod up`: incremental byte copy `<pod>/llama-server.<segment>.log`, parsed into `requests.jsonl` (slot, task, prompt tokens = `tokens_evaluated`, prompt/eval ms and tok/s, total ms, truncated, context shift/full) and `log-events.jsonl` (errors, context full, truncation, http ≥ 400, restarts, missing log) |
| `/metrics`, `/health`, `/props` | the pod's idle watchdog only (on the pod) | — | — | `<pod>/samples.jsonl` every 15 s (numbers only), `props.jsonl` once per server start (model, slots, `n_ctx`, build) |
| `/slots` | none | — | — | sampled; `--no-slots` (start.sh, by design: the endpoint exposes live prompts) reads `disabled`; if enabled, only numbers and booleans are kept |
| `nvidia-smi` | none | — | — | `<pod>/gpu.jsonl` every 15 s (util, mem util, VRAM used/total, temp, power) |
| SSH tunnel health | none (`start-local.ps1` is a foreground ssh, no log; T2 not built) | — | — | `so-pod up` supervises `ssh -N -L 1808k:127.0.0.1:8080` (reconnects, backoff): `<pod>/tunnel.jsonl` spawn/up/down/exit/heartbeat/health; `<row>/tunnel.json` = state at row start + drops |
| Pod window per row | none | — | — | `<row>/pod.json`: requests finished in the window (tok/s p50/min/p95, prompt tokens p50/p95, slots, truncation), notable llama events, GPU peaks. Pod-wide: lanes on one pod share it |
| Evidence verdict per row | none (exit code only) | batch summary `<so-lanes>/batch-<stamp>.json` | kept | `<row>/evidence.json` (complete, problems, warnings, attention); `batch.json` per lane; row status `GREEN / RED / INCOMPLETE / NOT-RUNNABLE` |
| `npm run sessions:archive` | — | commits **only** the `so-sessions` work tree (`core.worktree` = main checkout `test/sessions`) | private | unchanged; `so-evidence archive` first copies lane/pod evidence into `test/sessions/evidence/phase-c/<label>/` (public-ignored) |

### Completeness rule (mirrors `so-session`'s required-artifacts check)

A row is **INCOMPLETE** (never GREEN, `batchExitCode` 1) when any of these is missing or empty: `runner.log`;
`record.json` (unless the row printed `not-runnable:`); `page.jsonl` + `page-summary.json`; `server.log` (the slice
file; an empty slice is a warning); and on a pod lane (`pod.json` with a pod number, not a no-model lane):
tunnel events near the row start and end (the supervisor ran), a `/health` sample and an `nvidia-smi` sample in the
window, and a pulled llama-server log when the pod reported none (`LLM_DEBUG_LOG` unset). A page error, a failed
`/api` request, a tunnel drop or a llama event (context full/shift, truncation, error) is **attention**: printed under
the row and stored in `evidence.json`, not a failure by itself (third-party extensions throw page errors on this
install). `st-lanes run` enforces the same rule (exit 3) for B1 model runs, integration plays and `--evidence`.
`so-evidence check` re-checks every finished batch row and every pod's teardown state.

### B1 runbook additions

1. Pod env: **`LLM_DEBUG_LOG=1`** (start.sh: llama-server output otherwise goes to `/dev/null`); `--metrics` is
   already on in start.sh. Recommended `LLM_EXTRA_ARGS` addition: `--log-timestamps --log-prefix` (the parser
   accepts both forms; rows are stamped with the pull time either way, ≤ 15 s late). `/slots` stays off (`--no-slots`,
   privacy design); per-slot data comes from the log's `id N | task T` lines and `/metrics`.
2. Per pod k, after `get-pod` → `ssh.direct`: `node scripts/debug/so-pod.mts target <k> --host <ip> --ssh-port <port>
   --pod-id <id>`, then `node scripts/debug/so-pod.mts up <k>` in its own terminal (or background) **before** any lane
   of pod k plays. It replaces `start-local.ps1` for that pod (the same key, pinned host key `runpod-llm` from
   `C:\dev\comfy-pod\local\known_hosts`). After a pod restart (port moves) re-run `target`; `up` picks it up at the
   next reconnect.
3. Before every llama-server restart (each B1-PAR arm, any `update-pod`): `so-pod.mts pull <k>` (exit 0 = the whole
   log copied and sha256-matched). The restart starts a new segment.
4. Teardown: stop the pod's lanes, then `so-pod.mts release <k>`; **stop the pod only after it exits 0**
   (`teardown-check <k>` re-asks). Then `node scripts/debug/so-evidence.mts archive --label <block> --lanes <…>
   --pods <…>` (refused while a row is INCOMPLETE or a pod is unreleased, unless `--allow-incomplete`, which records the
   verdict in `ARCHIVE.json`), then `npm run sessions:archive` from the main checkout.

### Not capturable, and why

| What | Why |
|---|---|
| Which lane a llama-server request came from | llama-server has no client identity (all lanes share one tunnel port per pod, same user agent); per-row pod numbers are the pod's window. A per-lane split needs a per-lane tunnel port or a request id ST does not send |
| Live per-slot prompt state (`/slots`) | off by design (`--no-slots`, privacy); enabling it would put live prompt text behind the tunnel |
| Exact server-side timestamps without `--log-timestamps` | default llama-server lines carry none; rows use the pull time (≤ one interval late) |
| Log lines written after the last pull and before a restart that wipes `/tmp` | only a `pull` before the restart saves them; `log-reset` marks the gap when one happens |
| Request/response bodies (prompts, replies) | deliberately not captured here: they are chat text; the payload tail (`so-session`, `st-payload --persist`) remains the place, private |
| Console output from pages other than the attached ST tab | Playwright listeners are per page; a runner that opens another tab is not covered |
| `keepOpen` tails (journal/console/follow) summaries | they never reach `finally`; their rows are in the jsonl, but no `page-summary.json` |
| Pod container stdout (RunPod logs) | not retrievable over ssh; start.sh keeps it to startup lines on purpose |

## Part 2 — coverage audit (v2.7 29–38 + 2026-10-07 fixes)

No row has evidence yet (all `[null, null]`). Three audits read the plans' gate records, `src/features/*`, the
manifest and the test tree; every cited test file exists.

### Coverage by feature (condensed; gap = none unless named)

| Area | Feature | Deterministic tests | Live rows | Gap |
|---|---|---|---|---|
| 29 | settings by area, triage, Advanced | `src/features/settingsAreas.test.ts`, `registry.test.ts`, `SettingsPanel.stories.tsx` | 29-D1/D2, 30-D1, C2-rendered-targets | open sections remembered: no reload row |
| 29 | release strips dev-only settings, forced-off judge uses | `settingsAreas.test.ts`, `scripts/release/debugSurface.test.mjs` | C1-release (bundle markers) | no-live-row (judge traffic of a release build) |
| 29/30 | Sol 20: Help hides unmountable features, settings reference generated, Studio "Open in the guide" | — | C2-rendered-targets, Z-docs | **not built**: those rows will fail |
| 30 | guide bundle, renderer, reader | `scripts/docs/guide-bundle.test.mjs`, `src/guide/*.test.ts`, `GuideReader.stories.tsx` | 30-D1..D3 | 30-D3 names no query/page; `/story guide` untested |
| 30 | guide site (Pages) | `scripts/docs/guide-site.test.mjs` | — | no-live-row, no leak guard on generated HTML |
| 31 | FLUX out, Repair row, broker dev-only | `src/image/image.test.ts`, `devOnly.guard.test.ts`, `managed.test.mjs` | 31-G3, C1-release | — |
| 32 | W1–W8 images, presets, looks, builder | `src/image/discovery.test.ts`, `cleanHost.test.ts`, `lookFramesBuild.test.ts`, `comfyTarget.test.mjs` | 32-W*, S32-*, O3–O6 | model-pick refusal path, ST `comfy_url` precedence, fast 512 preset: no row |
| 33 | W2 agency notes auto | `agencyAutoMode.review.test.ts`, `wardenFamilies.review.test.ts` | PC-agency-notes, 33-W2-* | `#so-agency-accept-mode` not in `PLAYER_FORBIDDEN_SELECTORS`: 33-D-clean cannot catch it |
| 33 | W1 edit re-read (dev), W3 attention | `editReread.review.test.ts`, `attentionCheck.review.test.ts` | 33-W1-*, 33-W3-* | unfailable: 33-W1-V0 record-only, 33-W3-live no floor |
| 33 | W4 suggestions, Sol 7/8/10 | `suggestions*.test.ts`, `playerProjection.test.ts`, `settledWindow.test.ts`, `loreSelect.test.ts` | 33-W4-*, S-07, S-08, S-10 | — |
| 34 | player profile, identity step, role line, persona checks, Sol 4/5/6 | `playerSetupActivation.test.ts`, `playerRoleHost.test.ts`, `personas.test.ts`, `personaWrites.test.ts`, stories | 34-L-*, S-04..S-06, 34-RP, PC-role-line | **34-L-*, S-04, S-05 have no scenario file**; `/story who`, two Studio diagnostics untested |
| 35 | open stretches, Sol 9, SP6 scorer | `openStretch.review.test.ts`, `stretchTurns.test.ts`, `objectiveLine.test.ts`, `sp6Score.test.mts` | 35-P2-*, PC-open-stretch, S-09, 35-K*/M* | S-09 no scenario file; "no stall recovery in a stretch" no live row |
| 36 | quests, checks, milestones, panels, rewards | `quests.test.ts`, `questRewards.review.test.ts`, `storyChecks.test.ts`, `gameProjection.test.ts`, stories | 36-*, S-15, S-16, PC-quest-scope, PC-check-outcomes | **36-Q5-scn cannot fail on rewards/rollback** (no reward, swipe or reopen step) and its dice-chip step passes on an empty list; S-16 no scenario; earned milestones, widget validators, `/story quests` untested |
| canon / shared secrets | held-secret filters (a142f41e, ea148309), Memory tab | `secretCanon.review.test.ts`, `secretShared.review.test.ts`, `secretMemoryTab.review.test.ts`, `inlineTimeline.test.ts` | S-11, S-12 (CL), S-13 | player surfaces only on CL rows; no cheap no-model row |
| OOC rule | not read, no turn, no agenda tick, warden note kept, log skips | `engine/ooc.test.ts`, `outOfCharacter.test.ts`, `stagecraftCoordinator.test.ts`, `gameProjection.test.ts` | S-19-OOC(-b), S-19, 37-D1 | D half needs the pod; no scenario file |
| 37 | relationships, mood, agendas, whereabouts, clock, owner Q1–Q3 | `engine/life/life.test.ts`, `validate/life.test.ts`, `relationshipScope.test.ts`, `whereabouts.test.ts`, `awayNotice.test.ts`, `agendaEffects.review.test.ts` | 37-*, PC-relationship-scope, 38-C7-life | no scenario files for 37-D2, 37-D3, 37-Q1; no payload case for 37-Q3's diff or PC-relationship-scope; 37-L6-C fixture has 0 rows (cannot run); away member vs real director only a C7 count |
| 38 | lab data, D13a/b/d | `adolionPinnedBuild.test.ts`, campaign checks | 38-*, 38-C7 | D13d narrowed triggers (exit cues 81/96 → 58/96): no live cue row; pinned test skips silently without the campaign checkout |
| sprites fixes | stage per swipe, Expressions coexistence, phone strip, frame cap | `sprites/stage.test.ts`, `faceFrames.test.ts`, `sprites.test.ts`, `stageDiagnostics.test.ts` | C6-stage, 32-W6-stream | 32-W6-stream floor "≤ 64 MB" contradicts the new 64–256 MB cap; expression call with thinking off never run on a real model; mid-chat join/mute not live |
| perf | gate-open-on-arrival (d321a2b8) | `t633Arrival.review.test.ts` etc. (small graphs, unchanged by the commit) | — | **unfailable**: no complexity/time guard, the 102-story equivalence was never committed |
| infra | stylesheet as own chunk (fd6529b1) | — | — | **no test at all**; a failed load only warns |
| infra | lazy settings groups, guide links out of registry, faster gates | `lazyRetry.test.ts`, `bundleBudget.test.mjs`, `gates*.test.mjs`, `suiteReplayCache.test.mjs` | 29-D2, C2-rendered-targets, C1-gates | — |

### Ranked gaps and what to add

| # | Gap | Add (id · tier · where) |
|---|---|---|
| 1 | Arrival perf can regress silently; equivalence unproven | jest `src/studio/arrivalDiagnostics.perf.test.ts`: synthetic ≥ 200-checkpoint branching graph, count edge visits / route expansions ≤ a bound linear in edges × routes, plus a 5 s backstop; `src/studio/arrivalEquivalence.test.ts`: old algorithm as oracle over every fixture story + a committed findings golden for the pinned stories · D |
| 2 | Persona flow rows cannot run (no scenario) | `test/scenarios/v27-34-player-setup.json` (keep / pick / create / skip, server-side `chat_metadata.persona`, one opener) and `v27-34-lock-refused.json` (S-04: refusing wrapper, reload, Try again / continue); S-05 delay scenario · D |
| 3 | Sol 20 not built → C2-rendered-targets, Z-docs fail | build `devOnly` in the registry (planted dev-only feature never listed), `docs:settings` generator + drift test, Studio "Open in the guide" + hit-test with `#so-studio-modal` open · D |
| 4 | 36-Q5-scn vacuous on rewards; dice step vacuous | `test/scenarios/v27-36-quest-rewards.json` (row **36-Q5-scn-b**: WI + cast reward, swipe the completing reply, reopen; host state = replay, ledger `reverted`); `if (!chips.length) throw` in `v27-36-quests.json`; `v27-36-quest-lifecycle.json` for S-16 · D |
| 5 | Stylesheet chunk unchecked | row **C1-styles**: the build on a lane, the chunk's style present and a scoped utility computed on `#so-hud-root`; negative control blocks the chunk request; node check that `dist/` imports the CSS chunk before `startRuntime` · D |
| 6 | Narrowed campaign triggers could stall a story | row **38-D13d-live**: replay the v2.6 exit turns on the pinned build; every gating transition fires within its N; cue reads before/after recorded · CL + RP (C7) |
| 7 | Missing scenario / payload files for owed rows | `v27-37-whereabouts.json` (37-D2), `v27-37-agenda-effect.json` (37-D3), `v27-37-start-seed.json` (37-Q1), `v27-35-side-exit.json` (S-09), `v27-ooc-read.json` (S-19-OOC D half); payload cases `group-away-notice.json` (37-Q3) and `group-relationships.json` (PC-relationship-scope, absent-member negative control) · D |
| 8 | Held-secret player surfaces only on CL rows | rows **S-11-D**, **S-12-D**: no-model, mocked canon/seal replies with a paraphrase; Overview, `/story recap`, `/story chapters`, "Previously…", inline L2 chips and dry-run `{{story_canon}}` pass the `heldSecrets` word rule · D |
| 9 | Player-mode leak check blind to agency/attention controls | add `#so-agency-accept-mode`, `#so-judge-use-attentionCheck` to `PLAYER_FORBIDDEN_SELECTORS` (`scripts/debug/so-ui.mts`) with a planted control · D |
| 10 | 37-L6-C cannot run | copy the 20 lab voice rows into `test/fixtures/judge/spike-voice.json`; jest guard `rows.length === 20` · D (prereq) |
| 11 | Floors that cannot fail or contradict the build | 33-W3-live floor (note on ≥ 4/5 ignored, ≤ 1/5 answered, 0 on unaddressed); 33-W1-V0 → jest replay requiring exactly one audit + fault-matrix row; 32-W6-stream re-floored to the cast-sized cap (24 MB × animated actors, 64–256 MB) · manifest (39 owner) |
| 12 | Release-build judge uses never observed | row **29-D4-release-judge**: moot since the one-build decision (2026-10-07): there is no release-only build whose judge uses could differ · — |
| 13 | Real-model expression call with thinking off | row **C6-expr-reasoning**: Artemis, 10 replies, request carries reasoning off, ≥ 9/10 labels parse without thought text · CL |
| 14 | Smaller untested surfaces | jest: `/story guide`, `/story quests`, `opener-uses-player-name`, `player-spoiler-risk`, widget validators (clock 2–12, public-only binds); `adolionPinnedBuild.test.ts` fails under `CI=1` without the checkout; rows **32-W2-refuse**, **32-W4-comfyurl** (LI) |

## Findings during a run

**One red row never stops the batch.** Rows are independent: every row starts from its own reset (lane reset per row,
rule 11), so a failure is recorded with its evidence (run header pair, logs, the row's record) and the batch goes on
to the next row.

Triage, decided when the row is red:

| # | Finding | What happens |
|---|---|---|
| 1 | **harness bug** (the tool, not the product) | fix at once if it is small and does not change what the row proves; re-run **that row only** (×2) |
| 2 | **small, contained product bug** | its own commit on a side branch, with a test; re-run the touched row and its neighbours ×2 once it lands, never in the middle of another row's run |
| 3 | **large or cross-cutting product bug** | log the row FAIL and the finding, finish the batch, fix after; then re-run every row the fix can reach |

**Inside the frozen Phase C (C0–C9) nothing is fixed.** Any product fix there is a new freeze, and every row must be
green ×2 again on the new build. The fix-as-we-go loop above lives in stage B and in the pre-freeze shakedown only.

**Verdict:** ACCEPTED only if every row is green ×2 on one build; otherwise PARTIAL, naming the failed rows.

## Unresolved questions

1. Rule 11: accept a pre-seeded never-started snapshot (S1) as the reset? Saves ~8 pod-h.
2. Accept the five shares (S2) and per-unit ×2 for split rows (S4) as 39 record lines?
3. 32 W8: stop each arm at 15 mentioning replies (S6) instead of a fixed N = 30?
4. 3 pods available at once in the volume's data center? If not, 2 pods (≈ 16.6 h wall, same cost).
5. C pod start gated on all of C2 green, or on C1/C1b/C3 only (C2 concurrent, risk of a paid re-run)?

## Run plan default after B1 batch 3 (main, 2026-10-08)

Learned in batch 3: a dedicated memory pod (Artemis, `LLM_PARALLEL` 4) serving 4–5 SP6 lanes saturates (about 10 tok/s
per stream, every memory read about 50 s), and it, not the reply pods (25–31 tok/s, mostly idle), sets the turn time
(p50 about 70 s, p95 up to 165 s); a 98-turn SP6 run takes about 2.5–3 h. RTX PRO 4500 stock in EU-RO-1 ran out
mid-session (create refused at 15:41–15:51Z and 17:35Z). Default for the next round:

| | |
|---|---|
| Memory roles | no dedicated memory pod: each reply pod runs its own lanes' memory roles on itself, `LLM_PARALLEL` 4 (two lanes' replies + their memory reads), the lane's role profiles pointed at its own pod's tunnel |
| Local 3090 | takes the light rows (no latency floor, short prompts) through the controller on :18888 with `st-lanes start --allow-local`; profile `fast` (32K, 1 slot) is what fits, so a row that needs the product's 98K context or the pod GGUF stays on a pod |
| Pod count | the minimum the queue needs; stock is checked (`get-capacity`) before a plan counts on a pod |
| Balance | the RunPod account balance is checked before a session, not only the approved budget |

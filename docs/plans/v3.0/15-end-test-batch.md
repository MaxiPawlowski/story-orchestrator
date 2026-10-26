# Plan 15 — End test batch for the v3.0 development wave

**Status 2026-10-26: DESIGN (doc only, not run).** One ordered plan that covers every change being built in parallel now, so
the 3090 runs each model row once, every rerun rides the replay backend (F1) and no-model rows run on lanes 30-34 at the
same time. Classes, stop rules and replay as v2.9 11 (U/N/R/M/E/H, S0-S5) and v3.0 F1/F3 (`test/batches/controller-regression.json`).

## Scope (what this batch must cover)

| Change | Branch | What it needs live | Source |
|---|---|---|---|
| Controller round 3 remainder: R (rewound entries + `checkpoint_at`), M (max-memory modes, spill guard, cache size per mode), idle prefill abort + overflow wait | `v3.0-09-controller-r3` | bench arms R and M (controller stopped), then the F3 lists for whatever is adopted | 09 §R, §M |
| A0 prefix-stability gate | `v3.0-a0-prefix-gate` | payload-golden capture + `prefix` on a no-model lane x2; runtime recorder after one played group turn | 13 §Still needs a live run |
| D1 06 F4 usefulness (prompt change) | `v3.0-d-followups` | B2 `lt06` capture (no-model) + send (GPU) + Sol rating | 14 §D1 |
| D3 repetition, D6 matcher p95, D8 Studio | `v3.0-d-followups` | nothing live (recorded offline; D6 is a jest measure) | 14 |
| D5 J6.8 flake | `v3.0-d-followups` | J6 x2 strict on a model lane | 14 §D5, v2.9 13 |
| C1 witness design (derived W2) | `v3.0-c1-witness` | `v28-42-witness.json` on a no-model lane x2 (prompt loses the witness section: ST-facing) | 12 §End-batch checks 1 |
| B1 image perf prep | `v3.0-b1-image-perf` | `bench-controller.mjs image-matrix --plan quick` stock (controller stopped); unlocked arm only with the owner's unlock | 11 §GPU cost |
| v2.9 freeze | master | `suite:nomodel` second green run; p41 image journey x2 (B2 head-box fix); J6 x2 | v2.9 13 |
| F1/F3 (this branch) | `v3.0-f-test-economy` | the regression lists themselves; first recordings for replay | v3.0 F1, F3 |

Not in this batch: D2, D4, D7 (not in this wave), C1 held-out set (needs new play sessions), B3/B4, A2-A4 beyond 09 M.

## Rules for this batch

1. **One staged build.** Every merge of the wave lands first (coordinator: `npm run gates` per branch, never `--resume`), then one
   `npm run build && npm run stage && npm run plugins:install`; every lane row cites that bundle sha (`so-run-header capture`).
   A fix during the batch is a new build: rows already green re-run as replay (R) when their class is any, live only when judged.
2. **GPU is serial and never while the owner plays** (owner rule 7); no controller adoption on the owner's install during play.
   Bench windows need the controller stopped (the bench owns the card); lane windows need it running.
3. **Lanes:** model rows on lane 45 only (one model lane; `SO_MAX_LLM_LANES` 2 leaves room for a spare). No-model rows on lanes
   30-34 (`SO_LANE_OFFLINE=1`), replay rows on replay lanes 36-37 (`st-lanes.mts replay <n> on`, seeded normally so server
   plugins stay on). Replay lanes do not count toward the model-lane limit. Never lane 0, never :8000.
4. **Record once, replay the rest.** A controller-sensitive `any` row runs live once per adopted controller config with
   `st-lanes batch --record <store>`; its x2 and every rerun ride `--replay <store>` (refused requests make a row INCOMPLETE,
   never green; the drift report names the step to re-record). Judged rows always run live. Rows the v2.9 close-out demands "x2
   on a model lane" (J6, image journey) stay live x2: their point is model variability.
5. **Stop rules** (v2.9 11): S5 on harness/backend errors everywhere; journeys stop at the first S5; a red first run of a x2 row
   stops it (fix, new build, then x2 again) instead of burning the second run; measurement rows (T8, LT06) use their built-in
   stop declarations; bench arms stop at a zero-tolerance floor (R floor 6 exactness, M floors 1-2) for that arm.
6. **Floors are predeclared** in the owning plan; this plan adds none. The F3 send-latency bound is 09's to declare before the run
   (the scorer refuses without one).

## Dedupe (requested rows -> one row)

| Requested by | Row | Kept as |
|---|---|---|
| v2.9 freeze J6 x2, D5, F3 base j6-plumbing/j6-none | J6 | G2.c: J6 x2 strict live (covers all three); J6 none checks also inside N1 |
| F3 base gs1-judged/gs1-plumbing x2, A0 runtime recorder turn | GS1 | G2.a: GS1 full live once with `--record`; G2.i: `--model judged` live once more; any checks second run on replay (R1). A0 summary read after G2.a |
| F3 base turn-types, a02, reply-effort; v2.9 C6 A02 (already green x2) | 3 scenarios | G2.b live once with `--record`, second run R1 |
| F3 cache gs6, rollback-derived (only if R adopted) | GS6, live-rollback-derived | G2.d judged live + any recorded; any second run R1 |
| F3 base v24-02 set, k8, effects-preset, v28-40-*, a13, v29-06, J6/J5 none checks; C1 v28-42-witness | no-model rows | inside `suite:nomodel` (N1/N2); v28-42-witness x2 = N1 + N2 |
| v2.9 freeze image journey x2, F3 reclaim p41 x2, F3 max-profile reserve rows | p41 | G2.h p41 x2 with `reserve sample` running beside it (live head and images on): reserve rows cost no extra GPU |
| F3 reclaim director-render-reload, comfy-kill | render-survival | G2.h tail, ~10 min |
| F3 mtp gbnf-parity, 09 R exactness | bench | G1 (both need a bare llama-server; parity reuses the R window's binaries) |
| F3 base payload-goldens, A0 capture x2 | payload | N1: one `so-payload-golden capture` per run, `diff` + `prefix` over each (A0 x2 = N1 + N2) |
| F3 base t8, D1 lt06 | class M | G2.f: one controller window, T8 first (5 min), LT06 send with its stop rule |
| F3 base full-length + Sol rating | bench | conditional: only if R's floor 6 shows a mismatch or a binary other than the patch is adopted (owner decision 4) |

## Order

### Phase 0 — merge and stage (coordinator, CPU only)

Merge A0, C1, D, F, B1-prep (each with its own `npm run gates`), stage once. 09 remainder merges after G1 decides (its code is
gateway/broker only; the lanes do not need it before G2). Capture `so-run-header` on lanes 30, 36 and 45.

### Phase N1 — no-model lanes 30-34 (starts right after staging, runs during G1 and G2)

1. `npm run suite:nomodel` (188 rows on the first green run; ~50-70 min wall on two lanes, measured 100-140 lane-min).
2. `so-payload-golden.mts capture --label a0-1 --out <dir>` then `diff` against the last golden and `prefix <dir> --declared
   test/measurements/v2.7/payload/prefix-declared.json` (A0 run 1).
3. `so-prompt-batch.mts capture --measurement lt06 --profile "Story Orchestrator Memory RunPod" --out <lane>/b2ext/lt06-d1` on a
   no-model lane 30+ that is not 45 (D1; expect exactly the 7 anchored rows to change sha, anything else stops D1).
4. Stop rule: a red N1 row is triaged before G2 only if it touches a G2 row's code path; otherwise it stays a finding.

### Phase G1 — bench window, controller stopped (GPU, est. ~90 min, +19 optional)

| Step | Command (plan) | Stop | GPU min (est.) |
|---|---|---|---|
| R arms A, A2, A3, A3-2048 x3 interleaved | 09 §R (`bench-controller.mjs text --gap-ms 1000`, 25 prompts) | floor 6 mismatch on an arm: that arm stops (investigate batch-split rounding first) | ~40 (TO CONFIRM against 09's batch-2 timings) |
| GBNF parity | `so-controller-checks.mts gbnf-parity capture` on the adopted binary with MTP, then without speculation; `compare` | none (10 requests each) | ~5 |
| M arms R=1024 then 1536 | 09 §M (2 SDXL scenes + RAM probe per arm) | R=1024 passing all floors decides max (S4: 1536 not run) | ~25 |
| B1 quick stock | `bench-controller.mjs image-matrix --plan quick` | 11 floors TO DECIDE before the run | 19 |
| B1 quick unlocked (optional) | same, after the owner flips the unlock | only if the owner flips it in this window | 19 |

Decision point (owner): adopt R (A3 or A2) and/or M's max reserve. G2 runs on the result; if nothing is adopted, G2 still runs
(freeze rows) on the current A config, and the F3 cache/max-profile rows drop to the base list.

### Phase G2 — lane window, controller running (GPU on lane 45; replay lanes in parallel)

| Step | Rows | Mode | Stop | GPU min (est.) |
|---|---|---|---|---|
| a | GS1 full | live, `--record gs1-<config>` | S5; any red = triage before i | 20 (2026-10-25 green run) |
| a' | A0 runtime recorder | `st-eval "storyOrchestratorPrefixDrift.summary()"` on lane 45 after a | none | 0 |
| b | J5, J13, live-v4-turn-types-real, v29-a02-stopped-reply, live-v28-24-reply-effort, `so-turn-types-check --skip-image` | live, `--record base-<config>` | per row S5 | ~25 |
| c | J6 x2 strict | live x2 (D5 + freeze) | run 1 red on anything but J6.8 = stop, fix | ~25 (9 + 14 min measured) |
| d | GS6 (judged + any), live-rollback-derived | live, `--record cache-<config>`; only if R/M adopted | S5 | ~30 (GS6 judged 15-23 min measured) |
| e | v30-f3-send-latency (prefill off, on), v30-f3-inner-freshness (parallel 1, 2) | live | only if idle prefill / parallel 2 are in the adopted config; latency bound declared in 09 first | ~22 |
| f | T8 batch, then LT06 D1 send + score | class M (`so-prompt-batch send`) | T8 4 fixtures; LT06 built-in stop (S1/S2 on usable/grounded, S3 leaks) | 5 + 30-60 |
| g | Sol rating for LT06 (`rate --pass both`), so-replay import-batch of T8 and LT06 answers | CPU / subscription | none | 0 |
| h | p41 image journey x2, with `so-controller-checks reserve sample` beside it (live head + images on), then `render-survival run` media/comfy-kill and direct/text-reload | live | run 1 red = stop (no run 2) | ~140 + 10 |
| i | GS1 `--model judged` (second judged run) | live | S5 | ~10 (judged checks + dependsOn) |

Replay lanes 36-37 (no GPU, in parallel with c-h, as soon as each store exists):
- R1: `st-lanes batch --lanes 36,37 --replay gs1-<config> GS1`, `--replay base-<config> --list controller-regression:base`, and
  (if d ran) `--replay cache-<config> GS6 test/scenarios/live-rollback-derived.json` — the second run of every recorded any row.
  A refused request = INCOMPLETE: `so-replay drift <row replay.json>` names the step; re-record it in the next live window,
  never by hand.

### Phase N2 — final no-model run (parallel with G2.h)

1. `npm run suite:nomodel` again on the same staged build (the freeze asks two consecutive green runs on one build; if N1 was
   red and a fix restaged, N2 is the first of a new pair).
2. A0 payload capture + `prefix` run 2; C1 `v28-42-witness.json` is inside the suite (x2 = N1 + N2).

### Phase Z — close (coordinator)

`so-run-header diff` per lane against Phase 0; `so-evidence.mts archive --label v30-end-batch --lanes 30,31,32,33,34,36,37,45`
and `npm run sessions:archive`; replay stores stay under `<so-lanes>/replay/` (outside the repo: chat text). Gate records go to
each owning plan (09, 11, 12, 13, 14, v2.9 13), this plan only links them.

## GPU estimate

| Window | Known (est.) | Conditional |
|---|---|---|
| G1 bench | ~70 (R 40 + parity 5 + M 25) + B1 quick stock 19 = ~89 | B1 unlocked +19 |
| G2 lanes | a 20 + b 25 + c 25 + f 35-65 + h 150 + i 10 = ~265-295 | d +30, e +22 |
| Total | ~6 h (est.) | up to ~7.2 h with every conditional |

Saved by this design against running every list row x2 live: GS1 any second run (~15 min), base any rows second run (~15),
GS6 any second run (~15), reserve rows riding the image journey (~3 x 15), LT06 stop rule (up to ~30), M arm 1536 when 1024
passes (~12): about 2 h. The image journey x2 (~140 min) is the largest block and cannot ride replay (renders are the
measurement).

No-model wall time runs entirely in parallel: N1 + N2 ~2-2.5 h on lanes 30-34, R1 ~1 h on lanes 36-37.

## Unresolved questions

- 09 send-latency bound (ms over prefill-off first-token p50): 09 must declare it before G2.e, or e is skipped.
- Does the owner want the B1 unlocked arm in G1 (needs the unlock flipped by hand)?
- R arm timing (~40 min) is inferred from 09's batch arms; confirm against `09` logs before booking the window.
- Replay lanes need the regular seed (server plugins on); if the TypeSafe judge or opencode authoring answers live there, those
  rows stay remote (no GPU) but are not replayed: accept, or switch the judge off on replay lanes?

# Plan 12 Phase B — provider matrix

**Status: llama-logprob column RUN ×2 2026-10-03 (lane 5, pod to itself); PARTIAL: 11 fixtures measured cleanly ×2, 8 not measurable
cleanly because of the calibration harness's own concurrency (busy / queue timeouts, see §Results), 1 not answerable as built
(backgrounds, > 20 options). **Recorded as rows 2026-10-03** (`src/judge/readiness.ts` `JUDGE_READINESS_BY_PROVIDER["llama-logprob"]`, §Recorded
as rows): 5 route keys passed, 6 failed, the rest absent; opt-in only, the default provider stays `typesafe`. Judge-off column and call
census MEASURED (no model call). Open-classifier column NOT BUILT: deferred to v2.7 by the user.** Plan: `12-open-judge.md` §Phase B.
Survey: `12-survey.md`. Floors are the fixtures' own (`test/fixtures/judge/*.json`), unchanged; a floor is never retuned.

## Columns

| Column | Provider | State | Where it runs | Leaves the machine |
|---|---|---|---|---|
| TypeSafe | `typesafe` (Jev, native) | recorded: `test/goldens/judge/*.calibration.json` (2026-09-22 to 2026-10-02, `jev-1.13.0`) | hosted (US) | yes: J4 terms (`12-survey.md`) |
| llama-logprob | `llama-logprob` (Artemis on the pod's llama-server, logprob over the answer tokens) | **run ×2 2026-10-03, partial** (below) | RunPod pod through the SSH tunnel `127.0.0.1:18080` | to the user's own pod only. The plugin's `local` reads `true` because the URL is loopback; that is the tunnel, not this machine (12 §Open) |
| open classifier | none built (survey F4: mDeBERTa-v3 xnli / bge-m3-zeroshot / English-only NLI via `sillytavern-transformers`) | **not built: deferred to v2.7 (user decision)** | would be CPU, inside the ST server | no |
| judge-off | no answer: every probe falls back (`disabled`) | **measured** (below) | none | no |

## Judge-off column (measured 2026-10-02, 0 calls)

`SO_MEASURE_OUT=test/measurements/v2.6-12/judge-off-column.json npx jest --runInBand src/judge/judgeOffColumn.measure.test.ts`
runs the shipped harness table (`runtime/judgeHarness.ts` `CALIBRATIONS`) with a probe that never answers. Deterministic, so ×2
is the same file; it replays in jest. **What it means:** the rate each use's scorer counts right when the judge says nothing.
For filter uses that is the real fallback (keep everything); for chooser uses (director, scene, lore, typed, backgrounds, stall)
the real fallback is another component (LLM director, scene heuristic, keyword scan, the extractor) whose accuracy lives in its
own suite (`so-role-calibration director`, `so-live-suite`), so 0 here means "the judge path decides nothing", not "the product
is wrong".

| Use (fixture) | Rows scored | Judge-off right | Families (off) |
|---|---|---|---|
| director | 25 | 0 (0.00) | floor 0.85 overall |
| memory-verify | 36 | 21 (0.58) | |
| memory-pairs | 29 | 0 (0.00) | |
| scene | 214 | 0 (0.00) | all six below floor |
| curator-filter | 18 | 10 (0.56) | recall 10/10 ok, narrowed 0/8 (floor 0) ok |
| continuity | 67 | 43 (0.64) | consistent 32/32 ok; reply 11/23, broken 0/12 below |
| continuity (combined) | 67 | 32 (0.48) | consistent ok; reply, broken below |
| typed | 75 | 0 (0.00) | coverage floor 0 "ok" |
| stall | 57 | 0 (0.00) | kept below |
| critic | 34 | 0 (0.00) | verdict below |
| variants | 16 | 0 (0.00) | below |
| agency | 41 | 0 (0.00) | below |
| house-rules | 80 | 0 (0.00) | below |
| house-rules (adolion) | 200 | 0 (0.00) | below |
| warden-lore / warden-lore-facts | 60 | 0 (0.00) | below |
| lore | 30 | 0 (0.00) | recall below |
| backgrounds | 19 | 3 (0.16) | none 3/3 ok; pick below |
| contradiction-release (K0) | 42 | 26 (0.62) | Phase A per-wording scoring needs the bracket files; raw rate only |
| lore-relevance | 17 | nDCG@4 0 both arms | precision@4 / tie rate undefined with no answers |

## Call census (exact, from the same run)

One TypeSafe call per request; one llama-server `/completion` per **question** (`judge/llamaLogprob.ts`, sequential, `cache_prompt`).

| Use (fixture) | TypeSafe calls | llama calls | Questions per request (mean) | Use's timeout (`judge/policy.ts`) | Max ms per llama question to fit |
|---|---|---|---|---|---|
| director | 25 | 200 | 8.0 | 1500 (reply path) | 187 |
| memory-verify | 9 | 36 | 4.0 | 3000 | 750 |
| memory-pairs | 29 | 58 | 2.0 | 3000 | 1500 |
| scene | 66 | 455 | 6.9 | 2500 | 362 |
| curator-filter | 3 | 18 | 6.0 | 4000 | 667 |
| continuity | 23 | 44 | 1.9 | 4000 | 2090 |
| continuity (combined) | 23 | 113 | 4.9 | 4000 | 814 |
| typed | 54 | 79 | 1.5 | 5000 | 3418 |
| stall | 47 | 118 | 2.5 | 4000 | 1593 |
| critic | 34 | 126 | 3.7 | 2500 | 675 |
| variants | 24 | 96 | 4.0 | not read (assume the 1500 default) | 375 |
| agency | 41 | 41 | 1.0 | 4000 | 4000 |
| house-rules | 20 | 80 | 4.0 | 4000 | 1000 |
| house-rules (adolion) | 25 | 198 | 7.9 | 4000 | 505 |
| warden-lore | 26 | 60 | 2.3 | 4000 | 1733 |
| warden-lore-facts | 26 | 60 | 2.3 | 4000 | 1733 |
| lore | 11 | 465 | 42.3 | 1500 (reply path) | **35** |
| backgrounds | 19 | 19 | 1.0 | not read (assume the 1500 default) | 1500 |
| contradiction-release (K0) | 42 | 63 | 1.5 | 3000 | 2000 |
| lore-relevance | 34 | 2176 | 64.0 | 1500 | **23** |
| **Total per pass** | **581** | **4505** | | | |

Prediction to test, not to assume: lore and lore-relevance cannot meet the 1500 ms reply-path budget on a per-question provider
(35 and 23 ms per question including the HTTP hop); director needs ≤ 187 ms per question. Uses with no calibration fixture
(`lookahead`, `expansionLookahead`, `loreExclusive`, `expressions`) stay `uncalibrated` on any new provider.

## Run plan — local logprob column (pod to itself)

Branch `v26-measure-prep` adds `so-judge calibrate --split <n>` (never TypeSafe): a provider that answers per question is asked at
most n questions per probe, so lore (42) and lore-relevance (64) are not cut by the 5 s probe timeout
(`JUDGE_PROBE_TIMEOUT_MS`; `judge.timeoutMs` is capped at 10 s). Latency is the slices' sum, i.e. one request's cost, and the
summary gains `p95LatencyMs` and `timeouts`. It touches `src/runtime/judgeHarness.ts` (dev harness, lazy, `__SO_DEV__`), so the
run needs that dev build staged; staging reaches every lane and real ST, so stage only when that is acceptable.

1. Lane: any seeded lane n ≥ 1 (lane 5 seeded 2026-10-02 from `adolion-fresh`), server started with the llama URL in its env:
   `node scripts/debug/st-lanes.mts stop <n>` then `SO_JUDGE_LLAMA_URL=http://127.0.0.1:18080 node scripts/debug/st-lanes.mts start <n>`.
2. `npm run build:dev && npm run stage -- --flavor dev` (from the branch), `node scripts/debug/st-lanes.mts run <n> -- scripts/debug/st-session.mts reload`.
3. `node scripts/debug/st-lanes.mts run <n> -- scripts/debug/so-judge.mts status` → `providers["llama-logprob"].configured: true`.
4. `node scripts/debug/st-lanes.mts run <n> -- scripts/debug/so-run-header.mts capture --label v26-12-phaseB`.
5. Per run r ∈ {1, 2}, `st-session.mts reload` FIRST (the per-provider answer cache lives for the page session; a second run in
   the same page is all cache hits at 0 ms), then for each use U and fixture F in the census table:
   `node scripts/debug/st-lanes.mts run <n> -- scripts/debug/so-judge.mts calibrate --use U [--fixture F] --provider llama-logprob --split 8`
   (`--use contradiction-release` scores K0 per bracket mode; `--use warden-lore-facts --fixture warden-lore`;
   `--use continuity --fixture continuity-combined`; `--use house-rules --fixture adolion-house-rules`). Copy each
   `<debug>/so-judge-calibrate-<fixture>.json` to `test/measurements/v2.6-12/llama-logprob/<fixture>-r<r>.json` before the next run.
6. `so-run-header.mts diff` against step 4.

Pod time, estimated from the census (0.15–0.4 s per question with a cached state prefix, 0.5–1.5 s state prefill per request):
16–45 min per pass, **32–90 min for ×2**, plus ~5 min setup: **about $0.45–1.15 at $0.72/h**. Calls: 9,010 llama `/completion`
(1-token). No paid API.

## Run plan — open classifier column (not built; deferred to v2.7 by the user)

Needs, in order, each a user decision: (1) a build: a `nli` provider in `judge/providers.ts` and a plugin route that runs
`sillytavern-transformers` `ZeroShotClassificationPipeline` server-side (survey §F4, finding 8; the readiness table gains its
provider row); (2) approval to download the model (none is in `data/_cache/Xenova`, which holds only `all-mpnet-base-v2`).
Once both exist it runs on CPU with no pod and no paid API: the same step-5 loop with `--provider nli`, ×2. Calls = TypeSafe column
per use for `noul`/`choice` (one forward pass per hypothesis set); latency on this machine's CPU is unmeasured.

## Results — llama-logprob ×2 (2026-10-03 02:55–03:15 UTC, plus one serial diagnostic to 03:31)

Run: lane 5 (adolion-fresh, `check 5` clean bar the known `extraction.enabled` drift), server started with
`SO_JUDGE_LLAMA_URL=http://127.0.0.1:18080` (`so-judge status`: `llama-logprob.configured: true`), served dev bundle
`5b74e2aafe0b`. The pod (Artemis 31B v1.1 Q4_K_M, llama-server b11046) was used by this run alone. Each use ran
`so-judge calibrate --use U [--fixture F] --provider llama-logprob --split 8`, as in the run plan. r1 then r2, with
`st-session reload` before each run, so r2 is not cache hits (r2 p50s match r1). Model verdict: `resolved` to
`llama-server:/workspace/models/TheDrummer_Artemis-31B-v1.1-Q4_K_M.gguf`. Records:
`test/measurements/v2.6-12/llama-logprob/<fixture>-r<n>.json`, plus the `*-diag-chunk1.json` diagnostics.

**Harness finding (blocks a clean column for 6 uses).** Every calibration fires all its rows at once (`Promise.all` in
`src/judge/selfTest.ts` and the `*Calibration.ts` runners). The judge plugin admits 2 calls in flight per user, queues
the rest and refuses the overflow as `busy` (`server-plugin/story-orchestrator-judge/index.mjs`, limiter, also on the
llama route). Queue time counts toward the page's 5 s probe timeout, and `--split` slices hold a slot each in turn. A
use with many rows or many questions therefore reads `busy` (the run is refused, never recorded) or `timeout` for rows
whose own latency is fine. Proof, one serial run each (`--chunk 1`, one row per slice):
- curator-filter went from 18/18 timeouts (r1) and 18/18 busy (r2) to 17/18 right, every family floor met, p95 2.7 s.
- lore went from 30/30 timeouts to recall 28/30 and precision 28/35, both floors met, p95 31.7 s.

`--chunk` pauses a fixed 61 s per slice (it was sized for TypeSafe's 60/min). A serial ×2 of the six contaminated uses
would cost ~3 h of pod time, so it was not run. A no-pause serial mode for local providers is a harness change, and
this run makes no code edits.

| Use (fixture) | Floor | TypeSafe (golden) | llama-logprob r1 / r2 (rate; families) | p95 r1 / r2 vs use timeout | Floor ×2 | Fits budget | judge-off |
|---|---|---|---|---|---|---|---|
| director | 0.85 | 0.88 | 0.88 / 0.88 (22/25 ×2) | 5.3 / 5.3 s vs 1.5 s (reply path) | yes | **no** | 0.00 |
| memory-verify | fixture | 0.97 | 1.00 / 1.00 | 3.9 / 3.9 s vs 3.0 s | yes | **no** | 0.58 |
| memory-pairs | fixture | 0.93 | 0.97 / 0.97 | 1.7 / 1.7 s vs 3.0 s | yes | yes | 0.00 |
| scene | families | 0.97 | refused ×2 (busy 180 / 148, timeouts 34 / 66) | — | **not measured (harness)** | — | 0.00 |
| curator-filter | families | 0.89 | r1 18/18 timeouts; r2 refused (busy 18); serial diag ×1: 0.94, recall 10/10, narrowed 7/8 | diag 2.7 s vs 4.0 s | not shown ×2 (harness) | yes (diag) | 0.56 |
| continuity | families | 0.97 | 1.00 / 1.00 (every family) | 2.6 / 3.8 s vs 4.0 s | yes | yes | 0.64 |
| continuity (combined) | families | — | 0.85 / 0.88; reply 17/23, 18/23 and broken 8/12, 9/12 below; timeouts 25 / 21 | 4.1 / 4.6 s vs 4.0 s | no (contaminated) | no | 0.48 |
| typed | families | 0.83 | 0.85 / 0.85 (answered 55/57 ×2) | 4.1 / 3.9 s vs 5.0 s | yes | yes | 0.00 |
| stall | families | 1.00 | 1.00 / 1.00 | 3.5 / 3.5 s vs 4.0 s | yes | yes | 0.00 |
| critic | families | 0.99 | 0.93 / 0.93; verdict 30/34 < 1.0 ×2 (0 timeouts) | 3.0 / 2.9 s vs 2.5 s | **no** | no | 0.00 |
| variants | families | 1.00 | 0.81 / 0.81; rejected 5/8 < 1.0 ×2 (0 timeouts) | 3.0 / 2.9 s vs 1.5 s (assumed) | **no** | no | 0.00 |
| agency | families | 1.00 | 0.98 / 0.98 (writes 17/18, clean 23/23) | 1.7 / 1.8 s vs 4.0 s | yes | yes | 0.00 |
| house-rules | families | 0.99 | 0.78 / 0.78; broken 11/15, untouched 40/54 below; timeouts 16 / 16 | 3.3 / 3.1 s vs 4.0 s | no (contaminated) | — | 0.00 |
| house-rules (adolion) | families | — | refused ×2 (busy 72 / 56) | — | **not measured (harness)** | — | 0.00 |
| warden-lore | families | 1.00 | r1 refused (busy 47); r2 0.82, every family below, 11 timeouts | r2 2.8 s vs 4.0 s | no (contaminated) | — | 0.00 |
| warden-lore-facts | families | — | 1.00 / 1.00 | 4.2 / 4.3 s vs 4.0 s | yes | **no** (just over) | 0.00 |
| lore | families | 0.90 | r1 refused (busy 5); r2 30/30 timeouts; serial diag ×1: recall 28/30, precision 28/35 (floors met) | diag 31.7 s vs 1.5 s (reply path) | not shown ×2 | **no** (prediction confirmed) | 0.00 |
| backgrounds | families | 0.84 (pick below floor) | pick 0/16 ×2, none 3/3: the fixture offers 25 backgrounds and the provider refuses > 20 options (`LLAMA_TOP_N`) | 0 ms (never sent) | **no (not answerable as built)** | — | 0.16 |
| contradiction-release (K0) | Phase A per wording | ok | ok ×2: wordings a and b pass in every band mode (jaccard, vectors `fd8efa441c80`) | 1.6 / 1.6 s vs 3.0 s | yes | yes | 0.62 raw |
| lore-relevance | precision@4, tie rate | golden | no answer either run (34 requests × 64 questions in parallel; r1 no exchanges, r2 precision@4 0) | — | **not measured (harness)** | — | nDCG 0 |

**Meets floor ×2 AND fits the use's timeout:** memory-pairs, continuity, typed, stall, agency, contradiction-release
(6 uses). They meet the floor but miss the budget on director (5.3 s vs 1.5 s, reply path), memory-verify (3.9 vs 3.0 s)
and warden-lore-facts (4.2–4.3 vs 4.0 s). The floor itself is missed on critic and variants (genuine: no timeouts). The
six contaminated uses (scene, curator-filter, continuity-combined, house-rules ×2 fixtures, warden-lore) and lore and
lore-relevance need the serial re-run. No default changes (W2: TypeSafe stays the shipped default; a switch also needs
the user).

Pod time: 02:55–03:31 UTC, ~36 min (r1 + r2 ~20 min, serial diagnostic ~16 min). ~4,500 one-token `/completion` calls per
pass (census), all on the user's own pod. No paid API call: the run never reached TypeSafe.

## Recorded as rows (2026-10-03)

`JUDGE_READINESS_BY_PROVIDER["llama-logprob"]` in `src/judge/readiness.ts`. Each row carries `measuredOn`
`/workspace/models/TheDrummer_Artemis-31B-v1.1-Q4_K_M.gguf` (the reports' `resolvedTo` minus the `llama-server:` prefix, which
`servedId()` strips), `measured` 2026-10-03, `live: null`. `latencyP50Ms` is the higher p50 of r1/r2; the recommendation names the
p95 that decided the budget. **Fixture revisions:** the reports do not record one. Computed the way AS-16 does (`sha256` of the
re-serialised `test/fixtures/judge/<fixture>.json`, first 12 hex, `readiness.test.ts` `revisionOf`): every fixture below equals
`JUDGE_FIXTURE_REVISION`, and `test/fixtures/judge/` last changed 2026-10-02 04:26 -0300 (`8e5dd0fb`), before the run, so the rows
are on the current revision. Fixture → key follows `readiness.test.ts` `FIXTURE_OF`.

| Route key | Fixture | Row | Rate | p50 | Why |
|---|---|---|---|---|---|
| memoryPairs | memory-pairs | **passed** | 0.9655 | 1475 | floor ×2, p95 1.7 s vs 3.0 s |
| typedExtraction | typed | **passed** | 0.8485 | 1041 | answered 55/57 ×2 (floor 0.95), p95 4.1 s vs 5.0 s |
| stallCheck | stall | **passed** | 1.00 | 1180 | every row ×2, p95 3.5 s vs 4.0 s |
| warden | continuity | **passed** | 1.00 | 1320 | every family ×2, p95 3.8 s vs 4.0 s (the warden key's fixture is `continuity` alone) |
| agencyCheck | agency | **passed** | 0.9756 | 1015 | writes 17/18, clean 23/23 ×2, p95 1.8 s vs 4.0 s |
| director | director | failed | 0.88 | 4301 | floor met, p95 5.3 s vs 1.5 s reply path |
| memoryVerify | memory-verify | failed | 1.00 | 3591 | floor met, p95 3.9 s vs 3.0 s |
| expansionCritic | critic | failed | 0.9265 | 2676 | verdict 30/34 < 1.0 ×2 |
| expansionLookahead, lookahead | variants | failed | 0.8125 | 2777 | rejected 5/8 < 1.0 ×2 |
| wardenLore | warden-lore | failed | 1.00 (facts arm) | 1488 | the facts arm met every floor but p95 4.3 s vs 4.0 s; the shipped lore arm was contaminated (r1 busy, r2 0.82) |

Absent (route stays `uncalibrated`): sceneTrigger, sceneTracker, curatorFilter, houseRules, loreSelect (not measured cleanly ×2),
loreExclusive, expressions (no fixture). Backgrounds has no route key.

**Routable on llama-logprob** (opt-in per key, with the served model equal to `measuredOn`): `memoryPairs`, `typed` (typedExtraction),
`stall` (stallCheck) and `warden` (warden + agencyCheck, both routed). Not routable and not invented: contradiction-release met its
Phase A floor ×2 but is not a ring use and has no route key; continuity has no key of its own, it is the `warden` key.
**The warden/houseRules split:** the warden's one call decides for `warden`, `agencyCheck` and `houseRules` together
(`RING_USE_ROUTE_KEYS.warden`). houseRules is off by default, so routing warden + agencyCheck to llama-logprob runs. With
houseRules switched on and left on `typesafe` the call is refused `split`; routing houseRules to llama-logprob too is refused
`uncalibrated` (no row). Both mean the warden sends nothing until houseRules is off or measured here. Tests:
`src/runtime/judgeProviderRouting.test.ts` "plan 12 Phase B: the recorded llama-logprob rows".

## Unresolved

- Build the classifier provider, and which model (English-only NLI is eligible since W25)? Deferred to v2.7 (user).
- The plugin's `local: true` for a tunnelled loopback URL: label it before any privacy notice relies on it.

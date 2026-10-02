# Plan 12 Phase B — provider matrix

**Status: SKELETON 2026-10-02. Judge-off column and call census MEASURED (no model call). Local logprob column NOT RUN (needs
the pod to itself). Open-classifier column BLOCKED (provider not built, model not on disk).** Plan: `12-open-judge.md` §Phase B.
Survey: `12-survey.md`. Floors are the fixtures' own (`test/fixtures/judge/*.json`), unchanged; a floor is never retuned.

## Columns

| Column | Provider | State | Where it runs | Leaves the machine |
|---|---|---|---|---|
| TypeSafe | `typesafe` (Jev, native) | recorded: `test/goldens/judge/*.calibration.json` (2026-09-22 to 2026-10-02, `jev-1.13.0`) | hosted (US) | yes: J4 terms (`12-survey.md`) |
| llama-logprob | `llama-logprob` (Artemis on the pod's llama-server, logprob over the answer tokens) | **not run** | RunPod pod through the SSH tunnel `127.0.0.1:18080` | to the user's own pod only. The plugin's `local` reads `true` because the URL is loopback; that is the tunnel, not this machine (12 §Open) |
| open classifier | none built (survey F4: mDeBERTa-v3 xnli / bge-m3-zeroshot / English-only NLI via `sillytavern-transformers`) | **blocked** | would be CPU, inside the ST server | no |
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

## Run plan — open classifier column (blocked)

Needs, in order, each a user decision: (1) a build: a `nli` provider in `judge/providers.ts` and a plugin route that runs
`sillytavern-transformers` `ZeroShotClassificationPipeline` server-side (survey §F4, finding 8; the readiness table gains its
provider row); (2) approval to download the model (none is in `data/_cache/Xenova`, which holds only `all-mpnet-base-v2`).
Once both exist it runs on CPU with no pod and no paid API: the same step-5 loop with `--provider nli`, ×2. Calls = TypeSafe column
per use for `noul`/`choice` (one forward pass per hypothesis set); latency on this machine's CPU is unmeasured.

## Results (to fill)

| Use | Floor (fixture) | TypeSafe (golden) | llama-logprob r1 / r2 | p95 vs timeout | classifier r1 / r2 | judge-off | Meets ×2 |
|---|---|---|---|---|---|---|---|
| director | 0.85 | 0.88 | | | | 0.00 | |
| memory-verify | fixture | 0.97 | | | | 0.58 | |
| memory-pairs | fixture | 0.93 | | | | 0.00 | |
| scene | families | 0.97 | | | | 0.00 | |
| curator-filter | families | 0.89 | | | | 0.56 | |
| continuity | families | 0.97 | | | | 0.64 | |
| typed | families | 0.83 | | | | 0.00 | |
| stall | families | 1.00 | | | | 0.00 | |
| critic | families | 0.99 | | | | 0.00 | |
| variants | families | 1.00 | | | | 0.00 | |
| agency | families | 1.00 | | | | 0.00 | |
| house-rules | families | 0.99 | | | | 0.00 | |
| warden-lore | families | 1.00 | | | | 0.00 | |
| lore | families | 0.90 | | | | 0.00 | |
| backgrounds | families | 0.84 (pick below floor) | | | | 0.16 | |
| contradiction-release | Phase A per wording | ok | | | | 0.62 raw | |
| lore-relevance | precision@4, tie rate | golden | | | | nDCG 0 | |

Defaults change only where a provider meets a use's floor ×2 **and** the user accepts the switch (W2).

## Unresolved

- Build the classifier provider, and which model (English-only NLI is eligible since W25)?
- The plugin's `local: true` for a tunnelled loopback URL: label it before any privacy notice relies on it.

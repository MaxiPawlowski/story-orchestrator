# Plan 15 — Open-source Jev alternative (local judge)

**Status: SEED from v2.6, not approved.** Source: `docs/plans/v2.6/v2.7-seeds.md` row "Open-source Jev alternative (local judge)". Overview: `00-overview.md`.

## What it is

- Today every judge use that works runs on one hosted vendor: TypeSafe's Jev. Chat excerpts leave the machine (US
  hosting), and the product depends on that account.
- This seed is a **local, open-source judge** that answers the same typed questions (yes/no with a probability, a
  distribution over options, a score) with no data leaving the box.
- The candidate named in v2.6 is an open NLI / zero-shot classifier run on CPU inside the ST server. Plan 12 Phase B
  was to calibrate it beside the Artemis-logprob provider; the user deferred it to v2.7.

## History and evidence

| When | What | Where |
|---|---|---|
| v2.6 W13 | User: "a new decisions standard, there are many open source alternatives. Can we use something general here, but also keep our current featureset working properly?" → provider-agnostic judge | `docs/plans/v2.6/00-overview.md:170`; `12-open-judge.md:6-8` |
| v2.6 plan 12 Phase 0 | Survey family F4 (open classifiers / NLI): mDeBERTa-v3-base-xnli (0.3B, MIT, ONNX ports), bge-m3-zeroshot-v2.0 (0.6B, MIT, 8,192 ctx), deberta-v3-large-zeroshot-v2.0 (English, MIT, 512 ctx), ModernBERT-large-nli (0.4B, Apache-2.0, English), gliclass-x-base (Apache-2.0). Latency on our hardware: not found | `12-survey.md:47-58,142-154` |
| | Finding 8: ST already ships `sillytavern-transformers` 2.14.6 with `ZeroShotClassificationPipeline`; ST's own `/api/extra/classify` lacks the task, so our plugin would call the library directly. No new dependency. Not probed | `12-survey.md:152,210` |
| | Community "open-source Jev" clones (poorjev: NLI + temperature scaling; jevper/opendecider: logprob wrappers; NanoJev, von, …) listed as unvetted references, not providers | `12-survey.md:85,181` |
| | Licence constraint: TypeSafe MCA §2.3 forbids distillation, so **no training on Jev answers**; calibrating against our gold fixtures is unaffected | `12-open-judge.md:130-132` (Phase 0 gate record); `12-survey.md:212` (finding 10) |
| v2.6 plan 12 Phase A | Seam built: `DecisionProvider {id, contract, ask}`, `contract: "native" \| "logprob" \| "verbalized"`; readiness keyed provider × model × use; an uncalibrated route is refused before sending | `12-open-judge.md:137-151` |
| v2.6 plan 12 Phase B | **Logprob column** (Artemis 31B on the pod's llama-server) run ×2 on 2026-10-03: 6 uses met floor ×2 inside their budget (memory-pairs, continuity, typed, stall, agency, contradiction-release); director, memory-verify, warden-lore-facts missed the budget; critic and variants missed the floor; 8 not measurable cleanly (harness concurrency) | `12-provider-matrix.md:116-170` |
| | **Then withdrawn**: in play (T6-2-3, same pod streaming group replies) the routed uses answered typed/warden/stall **0 of 96** calls, memoryPairs 26/58. Every llama-logprob row is now `passed: false`. "A local judge needs batching (one request per call) or its own model slot before it is re-measured (v2.7)" | `12-provider-matrix.md:174`; `test/sessions/T6/SUMMARY.md:74-112`; commit `10a74535`; `src/judge/readiness.ts` `playLoad` rows |
| | **Classifier column NOT BUILT, deferred to v2.7 by the user** (2026-10-02). Needs (1) a build (`nli` provider + plugin route), (2) approval to download a model | `12-provider-matrix.md:7,16,108-114,212` |

Verified on this box 2026-10-03:
- `C:\dev\SillyTavern-MainBranch\package.json:86` pins `sillytavern-transformers` 2.14.6;
  `node_modules/sillytavern-transformers/src/pipelines.js:1015` defines `ZeroShotClassificationPipeline`.
- That pipeline runs **one model forward pass per candidate label per premise** (loop at `pipelines.js:1069-1078`).
- `data/_cache/Xenova/` holds only `all-mpnet-base-v2`: **no NLI model on disk**.

## Why it was deferred

- v2.6 measured the provider that costs nothing new (Artemis logprob) first (`12-open-judge.md:107-108`).
- The classifier needs a build and a model download, both user decisions (`12-provider-matrix.md:110-112`).
- User decision 2026-10-02 (seed row).

## Current state in code

- Providers: `JUDGE_PROVIDER_IDS = ["typesafe", "llama-logprob"]` (`src/judge/providers.ts:3`). No `nli` id.
- Plugin provider table: `typesafe`, `llama-logprob` (`server-plugin/story-orchestrator-judge/index.mjs:9-11`), limiter
  2 in flight per user (`:29`, env `SO_JUDGE_MAX_IN_FLIGHT`).
- `llama-logprob` client is a lazy chunk (`src/judge/llamaLogprob.ts`), one 1-token `/completion` per **question**,
  options > 20 refused (`12-open-judge.md:144`). Its rows: all `passed: false` (withdrawn).
- Default provider for every use: `typesafe` (W2). TypeSafe is the only routable provider.

## The fit problem (read before choosing)

| Issue | Evidence | Consequence |
|---|---|---|
| Context | DeBERTa-v3 family 512 tokens; bge-m3-zeroshot 8,192 (`12-survey.md:51-53`). Judge states run to > 12k chars (scene state-size bands 0–4k … > 12k, `v2.5/06-judge-next.md:278,287`) | 512-token models need the state cut to the relevant window per use; bge-m3 fits more. The pipeline tokenizes with `truncation: true` (`pipelines.js:1072-1076`), so an over-long state is cut **silently**: the provider must refuse or trim explicitly, never pass it through |
| Calls | Questions per request: director 8, scene 6.9, lore 42.3, lore-relevance 64 (`12-provider-matrix.md:57-76`); NLI adds one pass **per label** | multi-option uses multiply; lore and director on the 1500 ms reply path are unlikely |
| Task match | NLI is native to "is this supported / contradicted": memoryVerify (supported by transcript), continuity / warden (contradicts a fact), memoryPairs (same thing), contradiction-release | start where the task *is* entailment; director/lore/scene are weaker fits |
| Probability meaning | NLI entailment p is not Jev's p; every threshold (`CONTINUITY_P` 0.7, `LORE_MIN_P` 0.6, …) is per provider | calibrate per use on gold fixtures; temperature scaling on gold labels is allowed (MCA §2.3 only forbids Jev answers as labels) |
| Load | the logprob provider died under play load on a shared GPU | a CPU classifier does not share the GPU, but shares the ST server's CPU; whether onnxruntime-node stalls ST under play is **not determined** |

## Options

**A. NLI classifier provider, NLI-native uses first.** Provider id `nli`, contract `classifier` (new value, or map onto
`logprob`'s "probability from a model" meaning; decide in build). Plugin route runs `ZeroShotClassificationPipeline`
in-process with `cache_dir` under the data root. First uses: memoryVerify, memoryPairs, continuity (warden), stall.
Cost: model download (size not determined; 0.3–0.6B params), CPU time per call (unmeasured). Risk: 512-token cut loses
context; ST server CPU contention.

**B. Small local LLM, logprob, its own slot.** A small instruct or judge model (survey F5: Flow-Judge 3.8B, Selene-1-Mini
8B; logprob-derivable) on its own llama-server (the local 3090, or a second slot on the pod), with **one request per judge
call** (batch all questions) instead of one per question. Reuses the built `llama-logprob` code path with a batching
change. Cost: VRAM (the 3090 also runs image generation), pod time if remote. Risk: GPU contention again unless truly
separate.

**C. Re-measure Artemis-logprob with batching.** Same model as play, batched requests, a dedicated llama-server slot.
Cheapest code, but the 31B main model is still the contended resource.

**D. Adopt a community clone** (poorjev, jevper, opendecider). Unvetted, unknown licences (`12-survey.md:85`). Useful as
reference implementations only.

**E. Drop.** Keep TypeSafe as the only judge; users without a key get each use's fallback.

## Recommendation

**A, scoped to the four NLI-native uses, with a load check before any row is recorded.** It is the only option that is
open-source, fully local, needs no GPU and adds no dependency (the library is already in ST). The v2.6 lesson is built in:
fixture floors ×2 are necessary but not enough; a play-load check decides the row. If A fails its load or floor check,
B is the fallback, because it fixes the two causes the T6-2 check found (per-question requests, shared GPU).

## Decisions for the user

1. Build a local open-source judge provider in v2.7? **Rec: yes, option A (NLI classifier).** yes, but investigate this first https://github.com/fstandhartinger/jevbench. Maybe we can do our own evals for our use casess and test different options.
2. Which model(s) to download and measure? Options: bge-m3-zeroshot-v2.0 (8,192 ctx, multilingual, 0.6B);
   deberta-v3-large-zeroshot-v2.0 (English, 512); ModernBERT-large-nli (English); mDeBERTa xnli (0.3B, 512).
   **Rec: two arms, bge-m3-zeroshot-v2.0 and deberta-v3-large-zeroshot-v2.0** (long context vs English-only accuracy).
   Approve the downloads (sizes to be read from the model cards before download).
3. Which uses are in scope for the first measurement? Lets try all. 
4. If a use passes, does it become that use's default, or stay opt-in? **Rec: opt-in per use in v2.7; a default switch is
   a separate decision after a user session (W2 keeps TypeSafe as default).** opt in for now
5. If A fails, try B (small judge model on its own slot, batched)? **Rec: yes, B next; C only if no separate GPU slot is
   available.** yes, b Next
6. Where does it run when ST user accounts are on? **Rec: one shared in-process model; no key, nothing leaves the machine;
   the panel says so (no privacy notice needed).** as you recommend

## Floor and measurement before building

- **Floors:** each use's existing fixture floor, **unchanged** (`test/fixtures/judge/*.json`), ×2, with TypeSafe and
  judge-off columns (`12-provider-matrix.md` shape). No floor is retuned. Each fixture is already ≥ 20 English rows
  (`memory-verify`, `memory-pairs`, `continuity`, `stall`); no new fixture is needed for these four.
- **Budget:** p95 within the use's timeout (`policy.ts`: memoryVerify/memoryPairs 3000 ms, warden/stall 4000 ms).
- **Load check (new, predeclared):** routed in a real play session on a lane (group replies generating), each routed use
  answers ≥ 95 % of its calls with p95 inside its budget, and ST's own reply latency moves by no more than 10 % against a
  judge-on-TypeSafe session on the same replayed lines (T1-3 lines, as T6-2 did). Below that, the row is recorded
  `passed: false`.
- **Rows:** `JUDGE_READINESS_BY_PROVIDER["nli"]` per model × use, `measuredOn` = model id, bound to the fixture revision.
- **Harness first:** the calibration runner's concurrency bug (all rows fired at once, `busy`/timeouts;
  `12-provider-matrix.md:126-137`) needs a no-pause serial mode for local providers before the run.
- **MCA §2.3:** calibration uses gold labels only; no Jev answer is used as a training or scaling label.

## Gates

- Provider + plugin route: judge seam, plugin, settings → `npm run gates` + `npm run test:plugin`; byte-identical
  TypeSafe golden still passes; a mutant routing to an uncalibrated `nli` use is refused; client code stays a lazy
  chunk (bundle budget, `12-open-judge.md:164`).
- Measurement: lane runs per fixture ×2 (`so-judge calibrate --provider nli`), page reloaded between runs; the play-load
  check as a v2.6 plan 14-style session with header diff.

## Links

- 13 B10 CLI judge (the other non-TypeSafe route; recommended dropped as a runtime judge)
- 14 J7 judge ideas (J7.2 canon verify is an NLI-shaped question this provider could take later)
- 20 J6d shadow record
- 10 model choice (if the main model changes, option C's model changes with it)
- 11 warden-lore one request (the warden key's calls)
- 04 story presence/plays index, 19 quests/game layer, 18 character life, 25 new game plus, 08 SP2, 22 SP9, 16 spike
  defers, 12 curator create op, 21 cue+scene read merge, 09 C4 option b, 07 commitment double negatives, 23 D6/T22
  revisits, 06 thinking per story

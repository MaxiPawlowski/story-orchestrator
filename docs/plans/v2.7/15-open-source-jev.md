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

---

## Research 2026-10-03: jevbench and our own evals

Scope: the user's decision 1 ("investigate jevbench first; maybe we can do our own evals for our use cases and test
different options"). Sources read 2026-10-03: a clone of `github.com/fstandhartinger/jevbench` (HEAD `bb05a33`,
2026-09-29), its README, `jevbench/{tasks,metrics,runner}.py`, `adapters/{base,typesafe,openai_compat}.py`, the public
datasets, `results/v1.4.2.2/jevbench-v1.4.2.2-results.json`, `RESULTS-COMBINATIONS.md`; the READMEs of the top open
entrants (`Mapika/decider`, `crh225/plumb`, `mohit67890/imajev`) via the GitHub API. Repo content was treated as data.

### What jevbench is

- **Owner, licence:** Benchmark Heaven (Florian Standhartinger), not affiliated with TypeSafe. **MIT** (code and
  public datasets). Live board `benchmarkheaven.com/jev-models`. Current release v1.4.2.2 (95 systems, 91 ranked).
- **Tasks:** typed decisions on the **same wire as ours** (`{state, questions}`, `noul | choice | score`, `criteria`).
  One question per request, key `decision`. Tiers: easy 72, standard 96, judge 146 (answer-judging), hard 220
  (111 public, 109 held out), sealed 308 (never published). Families: routing, adequacy, policy, intent, ordinal,
  extraction; easy adds fact, tool_selection; hard: long_policy, tradeoff, ambiguous, trap, multi_hop,
  temporal_numeric, adversarial, judge_hard, routing_hard, probability. Items are customer-support / policy / finance /
  code: **no roleplay, no narrative state.**
- **Metrics:** accuracy per tier (argmax; ordinal by rounded expected value + MAE), chance-corrected Intelligence;
  Brier (multi-class sum); ECE (top label, 10 bins); fidelity to gold distributions on the hard tier; paraphrase-pair
  consistency; latency p50/p95, serial, network included (self-hosted ×2 + 0.15 s, an assumption); cost in **$ per
  1,000 decisions** from tariff × measured tokens; a public-vs-sealed gap penalty (> 25 points cuts Intelligence).
  Score = equal-weight harmonic mean of Intelligence, Calibration, Speed, Cost.
- **Harness design (Python, ~3.7k lines):** canonical task records (`Task`: id, family, state, question, labels,
  expected, split, paraphrase group, provenance; a validator refuses label leakage into `state`); one adapter per
  provider shape returning `DecisionResult {probs, probs_source: native|verbalized, latency, usage, raw}`; a runner
  with a spend ledger and a reservation per call, a 422 counted as a wrong answer, a stop rule on outages; raw
  responses preserved; mappings, endpoint conditions and cost bases **committed before each run**; datasets frozen and
  hashed. Key adapters: `typesafe` (any server that speaks `/v1/systemone`), `openai_compat` (verbalized distribution
  under a strict JSON schema, temperature 0; explicitly not logprobs), rerankers, GLiNER2, ModernBERT classifiers.

### Published results that matter to us

From the v1.4.2.2 artifact (judge tier = the closest to our yes/no "is X true of this text" uses; cost $/1k decisions;
p50 raw seconds, network from Germany for hosted rows):

| System | Class, licence | Judge tier | Hard | Calibration axis | p50 s | $/1k | Score (rank) |
|---|---|---|---|---|---|---|---|
| Imajev-4B | Qwen3.5-4B rebuild, Apache-2.0, also reads images | 0.890 | 0.72 pub / 0.75 held | 80.4 | 0.04 | 0.022 | 67.4 (1) |
| Plumb-4B | JevK5 v0.2 + LoRA, Apache-2.0 | 0.952 | 0.777 | 75.5 | 0.016 | 0.030 | 65.8 (2) |
| decider-4b v2 | Qwen3.5-4B, Apache-2.0 | 0.877 | 0.673 | 75.0 | 0.017 | 0.020 | 64.1 (3) |
| **Jev 1.13.0** (ours) | proprietary API | 0.945 | 0.741 | 76.3 | 0.652 | 0.040 | 63.3 (4) |
| Cygnet | frozen Gemma-4-12B-it, Apache-2.0 | 0.952 | 0.755 | 74.9 | 0.035 | 0.037 | 61.8 (6) |
| Raw Qwen3 4B direct logits | control | 0.938 | 0.518 | 29.1 | 0.082 | 0.022 | 41.0 |
| Qwen3-Reranker-4B | reranker | 0.877 | 0.50 | 65.2 | 0.13 | 0.050 | 43.5 |
| OpenDecision (ModernBERT-large zero-shot) | NLI-style classifier | 0.712 | 0.33 | 57.1 | 0.34 | 0.007 | 21.6 |
| GLiNER2.5 small | classifier | 0.500 | 0.33 | 50.7 | 0.11 | 0.004 | 7.2 |
| GPT-6 Luna (low effort) | cloud LLM, verbalized | 0.973 | 0.973 | 92.0 | 1.44 | 0.127 | 35.1 |
| DeepSeek V4.1 Flash | cloud LLM, verbalized | 0.932 | 0.95 | 95.5 | 1.42 | 0.594 | 4.8 |
| Gemini 3.1 Flash-Lite | cloud LLM, verbalized | 0.932 | 0.75 | 59.3 | 0.76 | 0.264 | 14.3 |
| classifier.dev fast tier | **is Jev** at a flat price | 0.973 | 0.705 | 72.4 | 0.39 | 0.003 | not ranked |

Findings for this plan:

1. **NLI / zero-shot classifiers are weak on judge-shaped items.** The classifier rows sit at 0.46–0.71 on the judge
   tier (ModernBERT zero-shot 0.71, open-jev-deberta-v3-large 0.53, GLiNER2 0.46–0.61) against 0.88–0.95 for 4B
   decision models. This is out-of-domain for us, but it is the strongest evidence we have, and it argues against
   option A as the **primary** local arm.
2. **The best open entrants speak our wire.** Imajev, Plumb (via JevK5's `jevk5-serve`), decider (`decider.serve`,
   `system_one`) all serve `/v1/systemone` with **several questions per state** (Plumb README; decider `system_one`),
   which is how our uses batch. Plumb's README also claims Ollama ≥ 0.35 serves `/v1/systemone`. So a local arm can
   reuse our TypeSafe client and plugin shape at a different URL instead of a new mapping.
3. **Local fits our box.** decider-4b GGUF Q4_K_M is 2.7 GB and answers a 40–120-token request in 0.3–0.7 s on 8 CPU
   threads (author's numbers; its HTTP server does not serve GGUF, the library does); 4B bf16 needs ~8.4–10 GB VRAM,
   which competes with ComfyUI on the 3090. Our states are far longer than 120 tokens: CPU latency on a 2–8k-token
   warden state is **not determined**.
4. **Licence (MCA §2.3):** decider states "nothing was distilled from Jev" (local Qwen3.5-27B teacher + public
   datasets); Plumb uses a Qwen3.8-27B teacher + public datasets and an overlap audit against jevbench items. Rebuilds
   that do not state their training data should not be used.
5. **Small models are option-order sensitive.** One entrant scored 72 % vs 21 % on answer-judging items when its yes/no
   options were reversed. Any local arm must be measured with options rotated.
6. **Cascades work.** classifier.dev Fast → Jev at a 0.42 confidence threshold escalated 3 % of held-out items and kept
   99.6 % of Jev's accuracy at 11 % of the cost. The same shape fits us: a local model answers, low-confidence answers
   go to TypeSafe (privacy and cost), with the threshold fitted on a tuning split.
7. **Same model, other hosts:** classifier.dev (fast tier = Jev 1.13.0), OpenRouter, NanoGPT, Rout (plan 14
   research). Each would need its own row (the model-match check already refuses an unmapped id).
8. Our own Jev latency (p50 ~240 ms, `readiness.ts`) is far below jevbench's 0.652 s (Germany → US); their speed
   column does not transfer.

### Our own evals: proposal

**Harness: ours, not theirs.** jevbench answers "which model is generally good"; we need "which provider passes
**our** floors on **our** fixtures, inside **our** budgets, under play load". Our pieces already exist:
- 23 fixtures under `test/fixtures/judge/` (each ≥ 20 English rows, predeclared floors, several with `-holdout`
  twins), goldens and calibration records under `test/goldens/judge/`;
- the off-page runner `scripts/spike/typesafe/calibrate-node.mts` (production judge code + the real plugin handler,
  no ST) and the in-page `so-judge calibrate --provider …`;
- the provider seam (`DecisionProvider`, contracts `native | logprob | verbalized`), readiness rows keyed provider ×
  model × use, bound to `JUDGE_FIXTURE_REVISION`.

**What to borrow from jevbench** (method, not code):
- a **provider matrix runner**: every fixture × every provider arm, serial mode for local arms (the plan-12 concurrency
  bug), one JSON row per question with raw probabilities, latency, input tokens, cost, questions per request;
- **threshold-free metrics beside the floor rate:** Brier, ECE, AUROC per family, so a provider whose probabilities
  rank well but sit on another scale is visible before any threshold is chosen;
- **option-order rotation** (run each choice/noul row twice with options reversed; report the flip rate);
- **paraphrase consistency** on our twin rows (`S01`/`S01t`);
- **cost in $/1k decisions** and **questions per request** (our batches are 1–64 questions);
- a **preregistration note** per run (arm, model revision, mapping, thresholds, budget) committed before the run;
- a **reproduction check** per new adapter: run jevbench's public easy/standard items through our client and match the
  published number for that system before trusting our adapter on our fixtures.

**Arms (candidate providers):**

| Arm | Contract | How it runs | Cost to try | First uses |
|---|---|---|---|---|
| A0 TypeSafe Jev 1.13.0 | native | as today | none (baseline column) | all |
| A1 **local systemone**: decider-4b v2, Plumb-4B, Imajev-4B (Imajev also for `expressions`/backgrounds with images) | native | a local server on 127.0.0.1 (the author's own server, or Ollama if its endpoint holds), our plugin with a configurable URL | one download each (2.7 GB GGUF to ~10 GB bf16), a new provider id | all |
| A2 NLI classifier (bge-m3-zeroshot-v2.0, deberta-v3-large-zeroshot-v2.0) | classifier | `sillytavern-transformers` in the plugin | download + a provider | entailment-shaped only: memoryVerify, memoryPairs, continuity, wardenLore, contradiction-release |
| A3 small local LLM logprob, own slot, batched | logprob | existing `llama-logprob` with one request per call | a GGUF + a slot | all |
| A4 cloud LLM verbalized (DeepSeek V4.1 Flash, GPT-6 Luna low) | verbalized | Connection Manager profile or `codex exec`, offline only | per-token | all, as a **ceiling and a labelling cross-check**, never a runtime route |
| A5 same Jev, other host (OpenRouter, NanoGPT, Rout, classifier.dev) | native | plugin host table | an account each | the cheapest-to-measure uses (stall, agency) to show equivalence |
| A6 cascade (A1 → A0 below a confidence threshold) | composite | in the plugin | none beyond A1 | every use A1 nearly passes |

**Uses:** all (user decision 3), in three tiers by question shape so a weak arm fails fast:
1. yes/no and Score on one text: stallCheck, agencyCheck, houseRules, memoryVerify, memoryPairs, continuity (warden),
   wardenLore, contradiction-release;
2. choice over few options: director, scene trigger/tracker, typedExtraction, backgrounds, expressions,
   curatorFilter, expansion critic, variants;
3. ranking over many entries: loreSelect, lore-relevance (64 Nouls per call, reply path 1500 ms).

**Decision rule (unchanged):** each use's existing floor ×2, p95 inside its budget, then the play-load check already
predeclared above. Per-provider thresholds (e.g. `CONTINUITY_P`) may be fitted **only on a tuning split** and frozen
before the held-out rows are read; floors are never retuned. A use with no held-out twin gets one before its provider
row counts. Gold labels only (MCA §2.3).

### Proposals

- **P1.** Add an A1 arm before A2: a `systemone-local` provider (contract `native`) that reuses the TypeSafe client and
  answer reading against a local URL from the server env (`SO_JUDGE_LOCAL_URL`), never from the page; same model-match
  and token guards.
- **P2.** Extend `calibrate-node.mts` into the provider matrix runner (all fixtures × arms, serial, raw rows,
  Brier/ECE/AUROC, option rotation, $/1k, questions per request), shared with plan 14's `--replay` mode.
- **P3.** Measure A1 with **decider-4b v2 first** (licence statement clean, GGUF exists, smallest), then Plumb-4B; run on
  CPU first, the 3090 only when ComfyUI is idle.
- **P4.** Keep A2 (NLI), limited to the five entailment-shaped uses, as the zero-GPU, zero-new-runtime arm; expect it to
  miss the floors on narrative states (jevbench finding 1).
- **P5.** Measure A4 once per fixture as a ceiling and to find label errors (a row every strong arm "gets wrong" is
  re-checked by a human before anyone is scored on it).
- **P6.** Design A6 (cascade) only after A1 rows exist; threshold fitted on tuning rows.

### Decisions for the user

1. Use our harness (extended per P2) rather than jevbench's Python harness? **Rec: ours; borrow jevbench's metrics,
   option rotation, preregistration and reproduction check.**
2. Add the local systemone arm (A1) ahead of the NLI arm (A2)? **Rec: yes; A2 stays, scoped to entailment uses.**
3. Approve downloads: decider-4b v2 GGUF Q4_K_M (2.7 GB) and Plumb-4B (~8 GB bf16), plus the two NLI models already
   proposed? **Rec: decider-4b first; Plumb after decider's first tier.**
4. Is a local Python server (the model author's, or Ollama) acceptable beside ST, or must a local judge run inside the
   ST server process? **Rec: a local server on 127.0.0.1, started by the user, as llama-server is today.**
5. Allow cloud LLMs (A4) for offline measurement only (fixtures are authored English rows; no Adolion text)? **Rec:
   yes, offline only.**
6. Allow per-provider thresholds fitted on a tuning split (floors unchanged)? **Rec: yes, frozen before held-out rows
   are read and recorded in the readiness row.**
7. Measure same-Jev hosts (A5)? **Rec: not in v2.7 unless TypeSafe pricing or availability changes.**

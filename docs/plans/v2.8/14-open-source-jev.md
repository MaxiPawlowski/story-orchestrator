# Plan 14 — Open-source Jev alternative (local judge)

**Status (2026-10-10): A1 built on branch `v2.8-local-judge` (provider `systemone-local`, plugin route, local server +
tray entry, setup script, matrix runner, `memory-verify` / `stall` held-out twins); not calibrated, so every use routed
to it is refused and TypeSafe stays the default. Models are NOT downloaded yet (C: lacks the space). Calibration run
waits for a 3090 slot. A2 (NLI) not built. Gate record below.** (2026-10-03: decided: build a local judge provider,
opt-in per use; our own eval harness; local systemone (A1: decider-4b, then Plumb-4B) ahead of NLI (A2); a local
server on 127.0.0.1 started by the user from the tray; cloud LLMs offline only; A5 not now.)
Source: `docs/plans/v2.6/v2.7-seeds.md` row "Open-source Jev alternative (local judge)". Overview: `00-overview.md`.
**Gate tiers** (00-overview §Gate taxonomy): implementation D (provider, plugin route, matrix runner); acceptance LT
(local systemone / NLI calibration on this PC); the play-load check runs on RP (group replies on the pod while the local
judge answers).

## What it is

- Today every judge use that works runs on one hosted vendor: TypeSafe's Jev. Chat excerpts leave the machine (US
  hosting), and the product depends on that account.
- This plan adds a **local, open-source judge** that answers the same typed questions (yes/no with a probability, a
  distribution over options, a score) with no data leaving the box. It is opt-in per use; TypeSafe stays the default
  (W2, decision 4).
- **Primary sequence (decided, research P1–P4):**
  1. **A1 local systemone:** a decision model that speaks our wire (`/v1/systemone`, several questions per state),
     served on 127.0.0.1. **decider-4b v2 first**, then **Plumb-4B**.
  2. **A2 NLI classifier** (bge-m3-zeroshot-v2.0, deberta-v3-large-zeroshot-v2.0), only for the entailment-shaped uses,
     as the zero-GPU arm. Expected to be weaker (jevbench finding 1).
  3. Fallback **A3** (small local LLM logprob, its own slot, batched) only if A1 and A2 miss; A6 cascade designed after
     A1 rows exist.
- The v2.6 candidate (NLI first, in-process under ST's data root) is superseded by that order and by the off-`C:` rule.

## History and evidence

| When | What | Where |
|---|---|---|
| v2.6 W13 | User: "a new decisions standard, there are many open source alternatives. Can we use something general here, but also keep our current featureset working properly?" → provider-agnostic judge | `docs/plans/v2.6/00-overview.md:170`; `docs/plans/v2.6/12-open-judge.md:6-8` |
| v2.6 plan 12 Phase 0 | Survey family F4 (open classifiers / NLI): mDeBERTa-v3-base-xnli (0.3B, MIT, ONNX ports), bge-m3-zeroshot-v2.0 (0.6B, MIT, 8,192 ctx), deberta-v3-large-zeroshot-v2.0 (English, MIT, 512 ctx), ModernBERT-large-nli (0.4B, Apache-2.0, English), gliclass-x-base (Apache-2.0). Latency on our hardware: not found | `docs/plans/v2.6/12-survey.md:47-58,142-154` |
| | Finding 8: ST already ships `sillytavern-transformers` 2.14.6 with `ZeroShotClassificationPipeline`; ST's own `/api/extra/classify` lacks the task, so our plugin would call the library directly. No new dependency. Not probed | `docs/plans/v2.6/12-survey.md:152,210` |
| | Community "open-source Jev" clones (poorjev: NLI + temperature scaling; jevper/opendecider: logprob wrappers; NanoJev, von, …) listed as unvetted references, not providers | `docs/plans/v2.6/12-survey.md:85,181` |
| | Licence constraint: TypeSafe MCA §2.3 forbids distillation, so **no training on Jev answers**; calibrating against our gold fixtures is unaffected | `docs/plans/v2.6/12-open-judge.md:130-132` (Phase 0 gate record); `docs/plans/v2.6/12-survey.md:212` (finding 10) |
| v2.6 plan 12 Phase A | Seam built: `DecisionProvider {id, contract, ask}`, `contract: "native" \| "logprob" \| "verbalized"`; readiness keyed provider × model × use; an uncalibrated route is refused before sending | `docs/plans/v2.6/12-open-judge.md:137-151` |
| v2.6 plan 12 Phase B | **Logprob column** (Artemis 31B on the pod's llama-server) run ×2 on 2026-10-03: 6 uses met floor ×2 inside their budget (memory-pairs, continuity, typed, stall, agency, contradiction-release); director, memory-verify, warden-lore-facts missed the budget; critic and variants missed the floor; 8 not measurable cleanly (harness concurrency) | `docs/plans/v2.6/12-provider-matrix.md:116-170` |
| | **Then withdrawn**: in play (T6-2-3, same pod streaming group replies) the routed uses answered typed/warden/stall **0 of 96** calls, memoryPairs 26/58. Every llama-logprob row is now `passed: false`. "A local judge needs batching (one request per call) or its own model slot before it is re-measured" | `docs/plans/v2.6/12-provider-matrix.md:174`; `test/sessions/T6/SUMMARY.md:74-112`; commit `10a74535`; `src/judge/readiness.ts` `playLoad` rows |
| | **Classifier column NOT BUILT, deferred by the user** (2026-10-02). Needs (1) a build (`nli` provider + plugin route), (2) approval to download a model | `docs/plans/v2.6/12-provider-matrix.md:7,16,108-114,212` |
| v2.7, 2026-10-03 | jevbench read; user decisions: our harness, A1 before A2, downloads approved "but not on C", local servers in the tray | §Research below |

Verified on this box 2026-10-03:
- `C:\dev\SillyTavern-MainBranch\package.json:86` pins `sillytavern-transformers` 2.14.6;
  `node_modules/sillytavern-transformers/src/pipelines.js:1015` defines `ZeroShotClassificationPipeline`.
- That pipeline runs **one model forward pass per candidate label per premise** (loop at `pipelines.js:1069-1078`).
- `data/_cache/Xenova/` holds only `all-mpnet-base-v2`: **no NLI model on disk**. That cache is under ST's data root on
  `C:`, so A2 must not use it (below).

## Why it was deferred

- v2.6 measured the provider that costs nothing new (Artemis logprob) first (`docs/plans/v2.6/12-open-judge.md:107-108`).
- The classifier needs a build and a model download, both user decisions (`docs/plans/v2.6/12-provider-matrix.md:110-112`).
- User decision 2026-10-02 (seed row).

## Current state in code

- Providers: `JUDGE_PROVIDER_IDS = ["typesafe", "llama-logprob"]` (`src/judge/providers.ts:3`). No local systemone or
  `nli` id.
- Plugin provider table: `typesafe`, `llama-logprob` (`server-plugin/story-orchestrator-judge/index.mjs:9-11`;
  `llama-logprob` reads its URL from `SO_JUDGE_LLAMA_URL` on the server), limiter 2 in flight per user (`:29`,
  env `SO_JUDGE_MAX_IN_FLIGHT`).
- `llama-logprob` client is a lazy chunk (`src/judge/llamaLogprob.ts`), one 1-token `/completion` per **question**,
  options > 20 refused (`docs/plans/v2.6/12-open-judge.md:144`). Its rows: all `passed: false` (withdrawn).
- Default provider for every use: `typesafe` (W2). TypeSafe is the only routable provider.
- Fixtures: `test/fixtures/judge/` (23 files). Several have `-holdout` twins; **`memory-verify` and `stall` have none**
  (listed 2026-10-03).
- Tray: `C:\dev\tray\items\story-orchestrator.json` lists SillyTavern, the RunPod tunnel, ComfyUI, Unsloth Studio, the
  debug browser. No local judge entry.

## Deployment rules (v2.8 rule 5)

- **Owner correction 2026-10-10: models loaded dynamically live on the fast disk, `C:/dev/models`** (configurable),
  not off `C:`. The local judge's folder is `C:/dev/models/so-judge` by default (`SO_JUDGE_MODELS_DIR`). The
  "refuse a path on `C:`" check below is therefore **not built**; the plugin reports the folder and the served model
  path read-only instead. The rest of this section is the 2026-10-03 text, kept as history.
- **(superseded 2026-10-10) Models and caches off `C:`.** One install-wide path names where judge models live: env `SO_JUDGE_MODELS_DIR` on the
  ST server, shown read-only in the judge panel. The local systemone server is started with its weights and every cache
  under it (`HF_HOME`, `HF_HUB_CACHE`, the server's own cache flags, or Ollama's `OLLAMA_MODELS` if Ollama serves it).
  The A2 plugin route passes `cache_dir` under it to `sillytavern-transformers`, never ST's `data/_cache`. The plugin
  refuses to load a model (status `models-on-system-drive`) when the resolved path is on `C:`.
- **Every server in the tray.** The local systemone server gets an entry in `C:\dev\tray\items\story-orchestrator.json`
  with a status probe (`http` on its 127.0.0.1 health URL), **Start** (with the off-`C:` env set in the entry's `env`),
  **Stop** (`notify`), and a **readiness check** (`notify`: one probe decision through the server, prints the model id
  and latency). A2 runs inside the judge plugin, so it has no server of its own; its readiness is a tray check that
  calls the plugin's status route and prints the loaded NLI model and its path. `C:\dev\tray\status.txt` must read OK
  for the file.
- The URL the plugin calls comes from the server env (`SO_JUDGE_LOCAL_URL`), never from the page.

## The fit problem (read before choosing)

| Issue | Evidence | Consequence |
|---|---|---|
| Context | DeBERTa-v3 family 512 tokens; bge-m3-zeroshot 8,192 (`docs/plans/v2.6/12-survey.md:51-53`). Judge states run to > 12k chars (scene state-size bands 0–4k … > 12k, `docs/plans/v2.5/06-judge-next.md:278,287`). 4B decision models: CPU latency on 2–8k-token states not determined | 512-token models need the state cut per use. The pipeline tokenizes with `truncation: true` (`pipelines.js:1072-1076`), so an over-long state is cut **silently**: the provider must refuse or trim explicitly, never pass it through |
| Calls | Questions per request: director 8, scene 6.9, lore 42.3, lore-relevance 64 (`docs/plans/v2.6/12-provider-matrix.md:57-76`); NLI adds one pass **per label** | A1 batches several questions per state like TypeSafe; NLI multiplies; lore and director on the 1500 ms reply path are unlikely for NLI |
| Task match | NLI is native to "is this supported / contradicted": memoryVerify, continuity / warden, memoryPairs, wardenLore, contradiction-release | A2 is limited to those uses; A1 is tried on all |
| Probability meaning | a local model's p is not Jev's p; every threshold (`CONTINUITY_P` 0.7, `LORE_MIN_P` 0.6, …) is per provider | per-provider thresholds fitted on a tuning split only, frozen before held-out rows (decision 6 of the research) |
| Load | the logprob provider died under play load on a shared GPU | A1 on CPU first (the 3090 only when ComfyUI is idle); the play-load check decides every row |

## Options

| | What | Verdict |
|---|---|---|
| **A1 local systemone** | `systemone-local` provider, contract `native`, our TypeSafe client against a 127.0.0.1 URL; decider-4b v2 then Plumb-4B | **first** (research P1, P3; decision 2) |
| **A2 NLI classifier** | `nli` provider, `ZeroShotClassificationPipeline` in the judge plugin, entailment uses only | **second** (research P4) |
| **A3 small local LLM logprob, own slot, batched** | existing `llama-logprob` path with one request per call | fallback if A1 and A2 miss (decision 5, "b Next") |
| **A6 cascade** (local → TypeSafe below a confidence threshold) | composite in the plugin | designed after A1 rows exist (P6) |

Rejected: C (re-measure Artemis-logprob batched; the 31B main model stays the contended resource); D (adopt a community
clone; unvetted, unknown licences); E (drop; the user wants a local judge). A4 (cloud LLMs) and A5 (same Jev, other
hosts) are not runtime routes (§Research).

## Recommendation

**Superseded by the research (P1–P4) and the user's answers.** The original recommendation ("A, scoped to the four
NLI-native uses, in-process under ST's data root") is replaced by:

1. **Matrix runner first** (P2): extend `scripts/spike/typesafe/calibrate-node.mts` into the provider matrix runner,
   serial for local arms, with the jevbench-borrowed metrics. Shared with v2.8 13's `--replay` mode.
2. **Held-out twins** (B8): write `memory-verify-holdout.json` and `stall-holdout.json` (≥ 20 English authored rows
   each, labelled before any answer) before any provider row for those two uses counts.
3. **A1** (P1, P3): `systemone-local` provider; decider-4b v2 GGUF on CPU first, then Plumb-4B; weights and caches
   under `SO_JUDGE_MODELS_DIR`; the server in the tray.
4. **A2** (P4): `nli` provider for the five entailment uses; models under the same path.
5. **Play-load check** on every row that passes its floors ×2 (RP). A use that passes becomes routable opt-in for that
   provider × model; TypeSafe stays default.

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

(Read with the research decisions below: decision 1's "investigate jevbench first" led to A1 ahead of A2; decision 2's
NLI downloads are A2's; decision 5's "B" is A3 here; decision 6 holds for A1 too: one shared local server, nothing
leaves the machine.)

## Floor and measurement before building

- **Floors:** each use's existing fixture floor, **unchanged** (`test/fixtures/judge/*.json`), ×2, with TypeSafe and
  judge-off columns (`docs/plans/v2.6/12-provider-matrix.md` shape). No floor is retuned. A use counts for a provider
  only when its held-out twin also passes (B8: `memory-verify` and `stall` need theirs written first).
- **Budget:** p95 within the use's timeout (`policy.ts`: memoryVerify/memoryPairs 3000 ms, warden/stall 4000 ms,
  director/lore 1500 ms).
- **Option rotation and paraphrase twins** reported for every local arm (jevbench finding 5).
- **Load check (predeclared, RP):** routed in a real play session on a lane (group replies generating on the pod), each
  routed use answers ≥ 95 % of its calls with p95 inside its budget, and ST's own reply latency moves by no more than
  10 % against a judge-on-TypeSafe session on the same replayed lines (T1-3 lines, as T6-2 did). Below that, the row is
  recorded `passed: false`.
- **Rows:** `JUDGE_READINESS_BY_PROVIDER["systemone-local" | "nli"]` per model × use, `measuredOn` = model id, bound to
  the fixture revision.
- **Harness first:** the calibration runner's concurrency bug (all rows fired at once, `busy`/timeouts;
  `docs/plans/v2.6/12-provider-matrix.md:126-137`) is fixed by the serial mode before any local run.
- **MCA §2.3:** calibration uses gold labels only; no Jev answer is used as a training or scaling label.

## Gates

- Provider + plugin route (D): judge seam, plugin, settings → `npm run gates` + `npm run test:plugin`; byte-identical
  TypeSafe golden still passes; a mutant routing to an uncalibrated local use is refused; the local URL is read only
  from the server env (test); the plugin refuses a models path on `C:` (test with a planted `C:\` path); client code
  stays a lazy chunk (bundle budget, `docs/plans/v2.6/12-open-judge.md:164`).
- Tray (D, v2.8 rule 5): `C:\dev\tray\items\story-orchestrator.json` has the local judge entry (status, Start, Stop,
  readiness check) and `status.txt` reads OK; the readiness check answers with the model id and a path not on `C:`.
- Measurement (LT): matrix runs per fixture ×2 per arm (`so-judge calibrate --provider …` or the node runner), page
  reloaded between runs, held-out twins included; a preregistration note per run committed first.
- Play-load (RP): the check above as a v2.6 plan 14-style session with header diff.
- The local provider choice in the judge panel is **registered in the v2.7 01 feature registry + Help (registry test)**
  (B10); routes stay opt-in per use (decision 4); a newly routable use ships dev-only until its rows pass twice
  (v2.8 rule 9).

## Links

- v2.7 14 B10 CLI judge (the other non-TypeSafe route; dropped as a runtime judge; W27 kept)
- v2.8 13 J7 judge ideas (shares the `--replay` mode; J7.2 canon verify is an NLI-shaped question; Rout host noted there)
- v2.8 12 J6d shadow record (a new typed provider is what a shadow would compare against)
- v2.7 12 model choice (option C's model would follow the main model; C is rejected)
- v2.7 13 warden-lore one request (the warden key's calls)

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
7. **Same model, other hosts:** classifier.dev (fast tier = Jev 1.13.0), OpenRouter, NanoGPT, Rout (v2.8 13
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
| A1 **local systemone**: decider-4b v2, Plumb-4B, Imajev-4B (Imajev also for `expressions`/backgrounds with images) | native | a local server on 127.0.0.1 (the author's own server, or Ollama if its endpoint holds), weights and caches under `SO_JUDGE_MODELS_DIR` (off `C:`), started from the tray; our plugin with a URL from the server env | one download each (2.7 GB GGUF to ~10 GB bf16), a new provider id | all |
| A2 NLI classifier (bge-m3-zeroshot-v2.0, deberta-v3-large-zeroshot-v2.0) | classifier | `sillytavern-transformers` in the plugin, `cache_dir` under `SO_JUDGE_MODELS_DIR` (not ST's `data/_cache`) | download + a provider | entailment-shaped only: memoryVerify, memoryPairs, continuity, wardenLore, contradiction-release |
| A3 small local LLM logprob, own slot, batched | logprob | existing `llama-logprob` with one request per call | a GGUF + a slot | all |
| A4 cloud LLM verbalized (DeepSeek V4.1 Flash, GPT-6 Luna low) | verbalized | Connection Manager profile or `codex exec`, offline only (evaluation tooling run by Claude, not the runtime harness; W27 unchanged, below) | per-token | all, as a **ceiling and a labelling cross-check**, never a runtime route |
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
row counts: today `memory-verify` and `stall` (B8). Gold labels only (MCA §2.3).

**A4 and W27.** `codex exec` in A4 is **offline evaluation tooling**: Claude runs it from a script to get a ceiling column
and to find label errors on authored fixtures. It is not the runtime harness, routes no player traffic, and never sees
Adolion text. W27 (the harness plugin offers opencode only, no logins) is kept.

### Proposals

- **P1.** Add an A1 arm before A2: a `systemone-local` provider (contract `native`) that reuses the TypeSafe client and
  answer reading against a local URL from the server env (`SO_JUDGE_LOCAL_URL`), never from the page; same model-match
  and token guards.
- **P2.** Extend `calibrate-node.mts` into the provider matrix runner (all fixtures × arms, serial, raw rows,
  Brier/ECE/AUROC, option rotation, $/1k, questions per request), shared with v2.8 13's `--replay` mode.
- **P3.** Measure A1 with **decider-4b v2 first** (licence statement clean, GGUF exists, smallest), then Plumb-4B; run on
  CPU first, the 3090 only when ComfyUI is idle. Weights and caches off `C:`; the server in the tray.
- **P4.** Keep A2 (NLI), limited to the five entailment-shaped uses, as the zero-GPU, zero-new-runtime arm; expect it to
  miss the floors on narrative states (jevbench finding 1).
- **P5.** Measure A4 once per fixture as a ceiling and to find label errors (a row every strong arm "gets wrong" is
  re-checked by a human before anyone is scored on it).
- **P6.** Design A6 (cascade) only after A1 rows exist; threshold fitted on tuning rows.

### Decisions for the user

1. Use our harness (extended per P2) rather than jevbench's Python harness? **Rec: ours; borrow jevbench's metrics,
   option rotation, preregistration and reproduction check.** Ours
2. Add the local systemone arm (A1) ahead of the NLI arm (A2)? **Rec: yes; A2 stays, scoped to entailment uses.** sure
3. Approve downloads: decider-4b v2 GGUF Q4_K_M (2.7 GB) and Plumb-4B (~8 GB bf16), plus the two NLI models already
   proposed? **Rec: decider-4b first; Plumb after decider's first tier.** sure, but not on C
4. Is a local Python server (the model author's, or Ollama) acceptable beside ST, or must a local judge run inside the
   ST server process? **Rec: a local server on 127.0.0.1, started by the user, as llama-server is today.** sure, from now on, all servers must be added to the system tray tool we have on c:/dev. Also add the runpod, sillytavern and all other we may use, i think we have one for auto loading the image models or something like that. unsloth studio too
5. Allow cloud LLMs (A4) for offline measurement only (fixtures are authored English rows; no Adolion text)? **Rec:
   yes, offline only.** sure
6. Allow per-provider thresholds fitted on a tuning split (floors unchanged)? **Rec: yes, frozen before held-out rows
   are read and recorded in the readiness row.** sure
7. Measure same-Jev hosts (A5)? **Rec: not in v2.7 unless TypeSafe pricing or availability changes.** what is this?

   **Answer:** A5 is the *same* Jev model sold by other hosts (OpenRouter, NanoGPT, Rout, classifier.dev), not a
   different judge. Measuring it would only show those hosts give the same answers as TypeSafe, as a fallback if
   TypeSafe's price, limits or availability change. Nothing to gain while TypeSafe works, so: not in v2.7 (nor v2.8).
   **Decided 2026-10-03 (user: as recommended): deferred to v2.9**, `v2.9/05-deferred-items.md` §05.5 (reopen trigger:
   TypeSafe changes price, limits or availability).
   **Also recorded:** local models are stored off `C:` (another drive; the path becomes a setting); every local server
   this plan adds gets a tray entry (`C:\dev\tray\items\story-orchestrator.json`). Both are now §Deployment rules
   and gates above.

## Review 2026-10-03

- **F01:** status line rewritten (decided; not built; jevbench read, evals not run).
- **F06:** primary sequence rewritten around A1 local systemone (decider-4b, then Plumb) then A2 NLI (§What it is,
  Options, Recommendation); models and caches off `C:` via `SO_JUDGE_MODELS_DIR`; tray start/stop/readiness for the
  local server and a readiness check for the in-plugin NLI arm (§Deployment rules, Gates).
- **B7:** same: weights and caches off `C:` (asserted by a plugin test and the tray readiness check); tray readiness
  gate for the local judge server.
- **B8:** held-out twins for `memory-verify` and `stall` written before their provider rows count (Recommendation step
  2, Floor; confirmed missing on 2026-10-03).
- **Sol open question (A4 `codex exec` vs W27):** stated as offline evaluation tooling, not the runtime harness; W27
  kept (arms table, note after the decision rule).
- **"15's recommendation is superseded by research P1–P4":** the Recommendation says so and lists the new sequence.
- Tiers: implementation D, acceptance LT, play-load RP. Registry gate (B10) and v2.8 rule 9 on newly routable uses.
- References version-qualified (B12); Links cut to the plans that matter. Line refs touched re-checked
  (`providers.ts:3`, plugin `index.mjs:9-11`, `:29`).

## Gate record (A1 build, 2026-10-10)

Branch `v2.8-local-judge` (worktree `C:\dev\so-local-judge`), from master `9b4572f4`.

### As built

- **Provider** `systemone-local` (`src/judge/providers.ts`): contract native, `remote: false`, label "Local judge (this
  machine)". Readiness table `JUDGE_READINESS_BY_PROVIDER["systemone-local"]` is **empty**, so `judgeRoute` refuses
  every use routed to it (`uncalibrated`) before sending, and the panel says "not calibrated there". TypeSafe stays the
  default for every use. This is the deliberate exception to "every built feature on by default": the calibration
  invariant forbids routing an unmeasured use (owner instruction 2026-10-10).
- **Page transport** `judgeLocalTransport` (`stHost/judge.ts`) posts to `/providers/systemone-local/systemone`; same
  code path as the TypeSafe transport (no new client code, so nothing added to a lazy chunk). The page never sends a
  URL or a model for it.
- **Plugin 1.9.0**: `PROVIDERS["systemone-local"]`, URL only from `SO_JUDGE_LOCAL_URL` (loopback only, else
  `not-loopback`), `/health` read before the first call and cached 30 s (`unreachable` refuses 409 with no decision
  asked), page `model` dropped, the served model stamped from the server (or `SO_JUDGE_LOCAL_MODEL`, else
  `systemone-local:unknown`, which never matches a row), a non-System-One reply refused 502, same shape/size guards
  (400/413), its own limiter at 1 in flight (`SO_JUDGE_LOCAL_MAX_IN_FLIGHT`). `/status` reports host, model,
  `SO_JUDGE_MODELS_DIR`, the served model path and the problem; the Judge panel shows them read-only.
- **Server** `scripts/local/judgeServer.py` (stdlib HTTP): backend `decider` (in-process `decider-ai`, GGUF through
  its llama.cpp engine, CPU unless `--gpu-layers`) or `proxy` (in front of `jevk5-serve` for Plumb-4B); refuses a
  non-loopback host; normalises answers to the System One shape (`--self-test`).
- **CLI** `scripts/local/judge.mjs plan|setup|start|stop|status|check` over `judgeModels.mjs`: everything under
  `SO_JUDGE_MODELS_DIR` (default `C:/dev/models/so-judge`: venv, weights, HF/uv/pip caches, logs); `setup` downloads
  only with `--yes` and refuses when free space is short. Space: decider-4b ~6.2 GB (2.7 weights + ~2.5 env + 1
  headroom), Plumb-4B ~12.4 GB. Plumb's catalog row and proxy wiring are prepared, unverified.
- **Tray**: `C:\dev\tray\items\story-orchestrator.json` "Local judge (decider-4b)": status `http` on
  `127.0.0.1:8095/health`, Start / Check (one probe decision: model, latency, path) / Stop, plan, install+download
  (confirm with the space), folders. `status.txt` reads OK. The entries run from `C:\dev\story-orchestrator`, so they
  work once this branch is merged.
- **Matrix runner** `scripts/spike/typesafe/matrix.mts` (P2): fixtures × arms (`typesafe`, `systemone-local`, `off`),
  serial, `--runs`, `--rotate`, `--holdout`, refuses a model arm without a preregistration note covering its uses;
  writes calls.jsonl / rows.jsonl / summary.json with floor result, p50/p95 vs budget, decision Brier, ECE, AUROC,
  rotation flips, trigger-only twin agreement, questions per request, $/1k. Metrics in
  `scripts/debug/lib/judgeMatrixMetrics.mts` (tested). `calibrate-node.mts` now shares the use dispatch
  (`lib/uses.mts`). Prereg note: `test/measurements/v2.8/14-local-judge/prereg-decider-4b.json`.
- **B8 held-out twins** written and labelled before any answer: `memory-verify-holdout.json` (24 lines, 10
  unsupported, 5 transcripts), `stall-holdout.json` (20 cases, 47 leaves), a story no other fixture uses.
- **Feature registry + Help**: `judge-local` (experimental, Show me `#so-judge-local-systemone-local`). Guide:
  `setup/judge.md` §Local judge (disk space table), `setup/models.md`. Plugin README.

### Deviations

- Off-`C:` rule replaced by the owner's 2026-10-10 correction (above); no `models-on-system-drive` refusal.
- No model downloaded and nothing run on a model (owner: C: is short of space; the 3090 is another agent's tonight).
  The off arm of the matrix ran end to end over every fixture and holdout (`--arm off --use all --holdout --rotate`).
- A2 (NLI), A6 (cascade) and the play-load check are not started.

### Gates (2026-10-10, worktree `C:\dev\so-local-judge`)

- `npm run gates -- --no-storybook --jobs=2`: test, test:replay, build, typecheck, typecheck:test, test:debug, lint,
  debug:typecheck, test:plugin all exit 0 (477 s, under heavy box load); test:release red on one check, the shipped
  guide named a machine path (`C:/dev/models/so-judge`), fixed by naming it `dev/models/so-judge` on the system drive,
  then `npm run guide:build` + `npm run test:release` 119/119 and `npx jest src/guide src/features src/copilot` 367/367.
  Storybook skipped (`--no-storybook`): run `JudgeSettingsGroup` stories `RoutedToTheLocalJudge`,
  `LocalJudgeNotStarted` (new) and `RoutedToAnUncalibratedLocalProvider`, `RoutedToARefusedLocalProvider` (touched
  component) before merge.
- `npm run test:plugin`: 125/125 (7 new local-judge tests; a planted remote URL and an unanswered health check are
  refused before any decision is asked).
- An earlier gates run under the same load had two replay rows survive (`background-write-unowned`,
  `curator-writes-gated-entry`); both killed on the next run and on an isolated rerun: load flake, not this change.
- jest: `src/runtime/judgeLocalProvider.test.ts` (a mutant routing to the uncalibrated local use is refused and sends
  nothing; control with a passed row routes there and never to TypeSafe; model mismatch discarded).
- No live gate: nothing ST-facing ran on :8000 (owner: no model lanes tonight); the provider's live gate is the
  calibration run (LT) below. NOT green for live.

### Next (calibration, LT)

1. Free ~6.2 GB on C:, then `node scripts/local/judge.mjs setup --yes` (with `SO_JUDGE_PIP_EXTRA_INDEX` set to a
   CUDA llama-cpp-python wheel index for a GPU run).
2. `SO_JUDGE_LOCAL_GPU_LAYERS=99 node scripts/local/judge.mjs start`, `node scripts/local/judge.mjs check`.
3. `SO_JUDGE_LOCAL_URL=http://127.0.0.1:8095 SO_JUDGE_MODELS_DIR=C:/dev/models/so-judge node --no-warnings
   --experimental-transform-types scripts/spike/typesafe/matrix.mts --arm systemone-local --use all --holdout --runs 2
   --rotate --prereg test/measurements/v2.8/14-local-judge/prereg-decider-4b.json`.
4. Rows that pass ×2 with their twins go into `JUDGE_READINESS_BY_PROVIDER["systemone-local"]` (measuredOn
   `decider-4b-v2.1-Q4_K_M`, fixture revision bound), dev-only until the play-load check (RP) passes.

## Gate record (calibration on pod 2, 2026-10-10, branch `v2.8-pod2`)

**Hardware: an RTX PRO 4500 Blackwell 32 GB RunPod pod (`27f66m9327okh8`, EU-RO-1), not the 3090.** The server's `/health` device:
`gpu-layers:99`, load 6.1 s. Artemis's llama-server was stopped for the run. The pod's sshd forwards only `127.0.0.1:8080`, so
`judgeServer.py` served on pod :8080 through the existing tunnel (local 18082); Artemis was restarted after.

- Setup on the pod's container disk `/root/so-judge`: `uv venv` (Python 3.12), `decider-ai[gguf]` with the cu124 llama-cpp-python
  wheel (`llama_cpp 0.3.36`, GPU offload true), `hf download Mapika/decider-4b-GGUF decider-4b-v2.1-Q4_K_M.gguf`. The first start
  failed: decider's GGUF engine loads its HF tokenizer from the model folder, and setup fetched only the `.gguf`. Fetching
  `tokenizer.json`, `tokenizer_config.json` and `decider_config.json` fixed it. Fixed in setup: F28 (`e64ead2a`).
- Command (worktree at master `51cdebe5`, prereg `prereg-decider-4b.json` as committed): `SO_JUDGE_LOCAL_URL=http://127.0.0.1:18082
  SO_JUDGE_MODELS_DIR=/root/so-judge node --no-warnings --experimental-transform-types scripts/spike/typesafe/matrix.mts --arm
  systemone-local --use all --holdout --runs 2 --rotate --prereg test/measurements/v2.8/14-local-judge/prereg-decider-4b.json`.
  16:18–16:29Z, exit 0. Summary: `test/measurements/v2.8/14-local-judge/pod2-2026-10-10-decider-4b-summary.json`. Calls and rows
  are private: `so-sessions:evidence/phase-c/pod2-2026-10-10/rows/judge/`.
- Result per fixture (right/total run 1, run 2; floor; p95 vs budget). The rotated pass is in the summary.

| Use | Fixture ×2 | Held-out twin ×2 | p95 / budget ms | Counts? |
|---|---|---|---|---|
| memory-pairs | 26/29 ok, ok | 10/11 ok, ok | 386 / 3000 | **yes** (rotation flips 0) |
| curator-filter | 10/18 ok, ok | no twin in the corpus | 751 / 4000 | floor ×2 only |
| memory-verify | 35/36 ok, ok | 22/24 MISS ×2 | 513 / 3000 | no |
| stall | 75/77 MISS ×2 | 31/31 ok ×2 | 478 / 4000 | no |
| scene | 178/214 MISS ×2 | 20/20 ok ×2 | 867 / 2500 | no |
| director | 20/25 MISS, 23/25 ok (floor 0.85; 4 fallbacks run 1) | — | 539 / 1500 | no |
| lore | 36/51 MISS ×2 | 10/20 MISS ×2 | **3,420 / 1500** | no (also over budget) |
| continuity | 60/67 MISS ×2 | 16/18 MISS ×2 | 333 / 4000 | no |
| backgrounds | 13/19 MISS ×2 | — | 570 / 2500 | no |
| typed | 87/120 MISS ×2 | — | 482 / 5000 | no |
| critic | 118/136 MISS ×2 | — | 587 / 2500 | no |
| variants | 15/16 MISS ×2 | — | 535 / 2500 | no |
| agency | 24/41 MISS ×2 | — | 483 / 4000 | no |
| house-rules | 76/80 MISS ×2 | — | 438 / 4000 | no |

- Verdict: one use, **memory-pairs**, meets its floor with its held-out twin twice, inside budget. curator-filter meets its floor
  twice but has no twin. The rest miss.
- No readiness row was added: `JUDGE_READINESS_BY_PROVIDER["systemone-local"]` stays empty, and every local route is still
  refused. memory-pairs would be the first row (`measuredOn` `decider-4b-v2.1-Q4_K_M`). It stays dev-only until the play-load
  check (RP), which was not run. That is the owner's call.
- The TypeSafe baseline column was not re-run here.

## Gate record: 3090 window 2026-10-14 (not run)

- Local calibration rows on the 3090: **BLOCKED**. No decider-4b weights on this machine (`C:/dev/models/so-judge` absent;
  no `*decider*` under `C:/dev/models` or `D:/models`), and this window allowed no downloads. Nothing changed; the
  pod-2 result above stands (memory-pairs only, no readiness row).

## Gate record: CPU calibration on this PC, 2026-10-14 (branch `v2.8-local-judge-calibration`)

- Setup: owner approved the download 2026-10-14; `node scripts/local/judge.mjs plan` = venv, decider-ai 1.9.0 + llama-cpp-python
  0.3.36, weights all present under `C:/dev/models/so-judge`. `SO_JUDGE_LOCAL_THREADS=8 node scripts/local/judge.mjs start --model
  decider-4b`: up on 127.0.0.1:8095, `/health` device `cpu`, load 17.4 s; `check`: ok, 1,128 ms, p(loud)=0.99. Tray
  `status.txt`: `OK story-orchestrator.json (59 entries)`. No GPU: `CUDA_VISIBLE_DEVICES=""`, server pid absent from
  `nvidia-smi`. Box: i9-9900 (8 cores / 16 threads), 32 GB, shared with other agents and a robocopy (CPU load 77–100 % during
  the run), so these are loaded-box numbers.
- Prereg: `prereg-decider-4b.json` as committed (hardware "else CPU"); floors, thresholds and budgets untouched.
- Full matrix (`--arm systemone-local --use all --holdout --runs 2 --rotate`) started 13:01Z and **stopped after 8 director calls**:
  each director request takes ~25 s on CPU (curl ×3: 24.9 / 25.3 / 26.2 s), the plugin cuts every upstream call at
  `UPSTREAM_TIMEOUT_MS` 10 s, and the server's model lock keeps working the aborted request, so every later call queues and
  times out. 1,410 requests at ≥ 10 s would answer nothing. Deviation: replaced by a latency screen plus the full matrix for the
  one use that had passed on the pod.
- Latency screen (direct POST to the server, the median-size and largest request of every fixture and holdout, lore skipped:
  64 questions, already 3.4 s on the pod GPU against 1,500 ms): fastest observed request 7.5 s (backgrounds, 1 question); every
  use's fastest request is over its budget. Evidence: `test/measurements/v2.8/14-local-judge/cpu-2026-10-14-decider-4b-latency-screen.jsonl`.
- memory-pairs full matrix ×2 + rotated + holdout (`--use memory-pairs`), 13:44–14:03Z, exit 0. Summary:
  `test/measurements/v2.8/14-local-judge/cpu-2026-10-14-decider-4b-memory-pairs-summary.json`.

Per use (floor = fixture floor, unchanged; budget from `policy.ts`):

- memory-pairs: fixture run 1 1/29 MISS (28 timeouts), run 2 25/29 floor ok, rotated 2/29; holdout 0/11 ×2 (all timed out);
  p95 9,539 ms / 3,000. **MISS** (budget ×2, holdout ×2). Still refused.
- director (budget 1,500): screen 66.5 / 78.4 s. **MISS (budget)**. Still refused.
- memory-verify (3,000): 32.3–93.4 s incl. holdout. **MISS (budget)**. Still refused.
- scene (2,500): 93.7–200.0 s. **MISS (budget)**. Still refused.
- lore (1,500): not screened (over budget on GPU). **MISS (budget)**. Still refused.
- curator-filter (4,000): 50.4 / 64.5 s. **MISS (budget)**. Still refused.
- continuity (4,000): 15.4–25.6 s. **MISS (budget)**. Still refused.
- backgrounds (2,500): 7.5 / 7.6 s. **MISS (budget)**. Still refused.
- typed (5,000): 8.0 / 101.3 s. **MISS (budget)**. Still refused.
- stall (4,000): 9.7–83.8 s incl. holdout. **MISS (budget)**. Still refused.
- critic (2,500): 47.1 / 109.6 s. **MISS (budget)**. Still refused.
- variants (2,500): 86.8 / 112.0 s. **MISS (budget)**. Still refused.
- agency (4,000): 68.2 / 119.9 s. **MISS (budget)**. Still refused.
- house-rules (4,000): 29.3 / 75.5 s. **MISS (budget)**. Still refused.

- Verdict: no use passes on CPU. `JUDGE_READINESS_BY_PROVIDER["systemone-local"]` stays empty; every local route is refused;
  TypeSafe stays the default. No `src/` change.
- Latency / memory (8 threads): prompt eval ~70–190 tokens/s depending on load (memory-pairs 2 × ~310 tokens in 8.4–9.9 s;
  director 8 × ~608 tokens in ~25 s when quieter); no output tokens (decision read from logits). Server process: working set
  ~4.2–5.9 GB (peak 6.0 GB), private 7.5 GB. CPU decider-4b is ~25–60× slower than the pod GPU (director p95 539 ms there).
- Model calls: local decider only. TypeSafe calls: **0** (the baseline column is not needed for a gold-label floor; not run). No
  Sol/DeepSeek.
- Server stopped: `judge.mjs stop` → `status` `down` (exit 1), no listener on :8095, no `judgeServer` process.
- Also fixed: `judge.mjs plan` showed "todo install …" forever (no skipIf); the step is now done when its distributions
  (`decider_ai`, `llama_cpp_python` / `jevk5`, `huggingface_hub`) have `.dist-info` in the venv site-packages
  (`missingDistributions`, 2 node:tests).
- Next: decider-4b is GPU-only for our budgets. A 3090 run (`SO_JUDGE_LOCAL_GPU_LAYERS=99` + a CUDA llama-cpp-python wheel)
  when ComfyUI is idle; pod 2's GPU result (memory-pairs only) stands as the best evidence.

## Gate record: 3090 GPU baseline, 2026-10-14 (branch `v2.8-local-judge-3090`)

Owner asked for it 2026-10-14 ("how good could this be"). Window 11:27–14:00 AST; GPU idle again at 12:13 AST.

- GPU build: the venv's `llama_cpp` 0.3.36 was the CPU wheel (`llama_supports_gpu_offload()` False). The official abetlen
  index has Windows CUDA wheels only up to 0.3.4 (cu121–cu124; cu125 empty, cu126/cu128 absent), and decider-ai needs
  `llama-cpp-python>=0.3.35` (the model is `qwen35`, which 0.3.4 cannot load). So 0.3.36 was built from the PyPI sdist
  (76.6 MB, plus scikit-build-core/cmake/ninja build deps) into `C:/dev/models/so-judge/venv` only: CUDA 12.0 nvcc + VS 2022
  BuildTools 17.14, `CMAKE_ARGS=-DGGML_CUDA=on -DCMAKE_CUDA_ARCHITECTURES=86`, `CUDAFLAGS=-allow-unsupported-compiler
  -D_ALLOW_COMPILER_AND_STL_VERSION_MISMATCH` (CUDA 12.0 refuses MSVC 14.44 otherwise), 14 min. Offload then True
  (`ggml_cuda_init: RTX 3090, compute 8.6`). CPU copy of the old package kept in the run's scratch; nothing else touched.
- Server: `SO_JUDGE_LOCAL_GPU_LAYERS=99 node scripts/local/judge.mjs start --model decider-4b` → `/health` device
  `gpu-layers:99` (first load 120 s, CUDA warm-up; 15 s on restart). VRAM 6.7 GiB total in use (0.8 GiB before): ~5.9 GiB for
  the judge, more than the ~3 GiB expected because the server allocates the 32,768-token KV cache. `check`: ok, 216 ms cold,
  64 ms warm.
- Command (code at master `61b9161324bd`, unchanged; prereg as committed): `SO_JUDGE_LOCAL_URL=http://127.0.0.1:8095
  SO_JUDGE_MODELS_DIR=C:/dev/models/so-judge node --no-warnings --experimental-transform-types scripts/spike/typesafe/matrix.mts
  --arm systemone-local --use all --holdout --runs 2 --rotate --prereg test/measurements/v2.8/14-local-judge/prereg-decider-4b.json
  --out <scratch>/run-full`. 12:01–12:10 AST, exit 0, 1,410 calls, 0 fallbacks, 0 timeouts (no call near the plugin's 10 s cut).
  Summary: `test/measurements/v2.8/14-local-judge/3090-2026-10-14-decider-4b-summary.json`; per-use comparison:
  `3090-2026-10-14-decider-4b-comparison.json`. Calls/rows/logs: `test/sessions/evidence/phase-c/local-judge-3090-20261014/`.
- Model calls: local decider only. TypeSafe calls: **0** (the prereg's TypeSafe column is gold-label scored and already recorded
  in `readinessRows.ts`; re-running it would need ~1,400 calls, over the 300 cap). No Sol/DeepSeek.

Per use (fixture run 1, run 2; held-out twin ×2; p50 / p95 vs budget; ECE run 1; pod 2 for comparison; TypeSafe = recorded
calibration rate and p50):

- memory-pairs: 26/29 ok, 26/29 ok; twin 10/11 ok ×2; 102 / 111 of 3000 ms; ECE 0.150; rotation flips 1/29. Pod 2: same
  counts, p95 386, ECE 0.153. TypeSafe 0.931, p50 254. **PASS ×2 with twin: calibration row written.**
- director: 23/25 ok ×2; no twin; 389 / 509 of 1500; ECE 0.333. Pod 20/25 MISS, 23/25 ok. TypeSafe 0.88, p50 245. Floor ×2 but no
  twin: does not count.
- memory-verify: 35/36 ok ×2; twin 22/24 MISS ×2; 274 / 557 of 3000; ECE 0.179. Pod same. TypeSafe 0.9722. No.
- scene: 176/214 MISS ×2; twin 19/20 MISS ×2; 722 / 1053 of 2500; ECE 0.203; flips 56/214. Pod 178/214. TypeSafe 0.9673. No.
- lore: 34/50 MISS ×2; twin 10/20 MISS ×2; 4,398 / 4,509 of 1500 (**over budget**). Pod p95 3,141. TypeSafe 0.8966, p50 291. No.
- curator-filter: 10/18 ok ×2; no twin; 508 / 520 of 4000; ECE 0.033. Pod same. TypeSafe 0.8889. Floor ×2, no twin: does not count.
- continuity: 60/67 MISS ×2; twin 16/18 MISS ×2; 92 / 159 of 4000; ECE 0.132. Pod same. TypeSafe 0.9701. No.
- backgrounds: 13/19 MISS ×2; no twin; 67 / 73 of 2500; ECE 0.239; flips 19/19. Pod same. TypeSafe 1. No.
- typed: 88/120 ok ×2; no twin; 76 / 407 of 5000; ECE 0.074; flips 45/117. Pod 87/120 MISS. TypeSafe 0.8295. Floor ×2, no twin:
  does not count.
- stall: 76/77 MISS ×2; twin 31/31 ok ×2; 104 / 290 of 4000. Pod 75/77. TypeSafe 1. No.
- critic: 117/136 MISS ×2; no twin; 420 / 449 of 2500; ECE 0.377. Pod 118/136. TypeSafe 0.9853. No.
- variants: 15/16 MISS ×2; no twin; 422 / 448 of 2500. Pod same. TypeSafe 1. No.
- agency: 23/41 MISS ×2; no twin; 217 / 486 of 4000; ECE 0.091. Pod 24/41. TypeSafe 1. No.
- house-rules: 77/80 MISS ×2; no twin; 189 / 436 of 4000; ECE 0.171. Pod 76/80. TypeSafe 0.965. No.

- Baseline verdict: on the 3090 decider-4b is fast (every use but lore under 1.1 s p95; memory-pairs, continuity, stall,
  backgrounds ≤ 0.3 s, 2–3× under TypeSafe's p50) and answers the same as on pod 2 (within ±2 per fixture), so
  hardware is not the limit: accuracy is. It reaches TypeSafe's level on memory-pairs, memory-verify (fixture, not twin), director,
  curator-filter and typed; it falls well short on scene, lore, agency, backgrounds, critic. Option-order sensitivity is high on
  scene, typed, critic and backgrounds (rotation flips 26–100 %). TypeSafe ECE/p95 are not in the recorded rows, so the
  comparison is accuracy and p50 only on that side.
- Readiness: `SYSTEMONE_LOCAL_READINESS.memoryPairs` (`src/judge/readiness.ts`): calibration 0.8966, p50 102 ms,
  `measuredOn` `decider-4b-v2.1-Q4_K_M`, fixture revision as measured, passed. memory-pairs is now **routable** to
  `systemone-local`; every other local route is still refused; TypeSafe stays the default for every use. Play-load check (RP) not
  run. `judgeLocalProvider.test.ts` now pins the table to `memoryPairs` only and keeps a served-model mismatch refused.
- Queueing defect (seen on CPU), fixed separately after the measurement (`scripts/local/judgeServer.py`): a request still waiting
  for the model after `--queue-timeout` seconds (default 10, the plugin's upstream cut) is refused 503 `busy`, and a request whose
  client went away while it queued is dropped before the model runs; `/health` reports `shed {busy, gone}`. node:tests
  `scripts/local/judgeServerQueue.test.mjs` (proxy backend over a slow fake upstream: an abandoned queued request never reaches
  it; an over-long wait gets 503). Re-check on the GPU with the fixed server: memory-pairs 26/29, holdout 10/11, p95 108 ms,
  `shed {busy 0, gone 0}`. The 1,410-call measurement ran on the unchanged server.
- Server stopped: `judge.mjs stop` → `status` `down`; no `judgeServer` process, nothing on :8095; `nvidia-smi` 749 MiB. Tray
  `status.txt`: `OK story-orchestrator.json (66 entries)`.
- Gates (worktree on `7f35d81a`): `npm run gates -- --no-storybook` all green in 215.5 s (typecheck, typecheck:test,
  debug:typecheck, build, lint, test:release, test:plugin, test:debug, test 8,256 passed / 1 skipped, test:replay 32 of 32
  killed); Storybook skipped (no component changed). `npm run gates:quick` green (jest related 3,057/3,057, replay --cached).
  `node --test scripts/local/judgeServerQueue.test.mjs scripts/local/judge.test.mjs` 11/11. No live ST gate: nothing ST-facing
  ran (owner's :8000 and lane 0 untouched); the routable memory-pairs route is NOT live-validated in a browser or under play load.

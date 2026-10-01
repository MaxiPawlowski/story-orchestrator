# Plan 12 — Open judge: a provider-agnostic decision layer, every candidate use spiked, every public option surveyed

**Status: Phase 0 + Phase A BUILT 2026-09-30 and on master (provider seam, survey, J4); Phases B and C not started.
See Gate record.**

User answers (overview, 2026-09-30):
- **Q1b:** "today this is a new decisions standard, there are many open source alternatives. Can we use something
  general here, but also keep our current featureset working properly?"
- **Q4:** "we should create a dedicated plan to spike and review all these, i want this as complete as possible, and
  even to investigate any other public option out there".

## Today

- **The judge is one vendor.** TypeSafe's Jev is reached only through `server-plugin/story-orchestrator-judge`, the only
  place a key is read, and `stHost/judge.ts` is the only transport.
- **The contract is System One:** typed questions that return a **probability** (`src/judge/types.ts`):
  - `noul` (yes/no with p);
  - `choice` (a distribution over options);
  - `score` (a distribution over a scale).
- **Every threshold reads that probability** (`judge/policy.ts`): `CONTINUITY_P` 0.7, `AGENCY_SCORE` 2.5, `LORE_MIN_P`
  0.6 and `SCENE_TRIGGER` 0.4.
- **16 uses** (`JUDGE_USE_KEYS`, `src/judge/settings.ts:6`), each with a fixture, a calibration module
  (`*Calibration.ts`) and a readiness row keyed by the model measured on.
- **Every use has a fallback** (today's path) on disabled, unavailable, timeout, error or ineligible (rule 5).

## Goal

A **decision provider** seam with the System One contract as its interface. TypeSafe becomes one provider among
several. The 16 uses keep working unchanged on TypeSafe, and they run on another provider only where that provider is
**calibrated** for that use.

## Phase 0 — Survey (docs and probes, no build)

Write `v2.6/12-survey.md`: one row per candidate, citing URL and date, or a local probe command. Columns:
- the contract it can serve: a native probability, logprob-derived, or verbalized only;
- where it runs: hosted or local; if local, VRAM and CPU;
- context length;
- latency (p50 on the reference hardware or the vendor's figure);
- cost;
- terms and data policy: retention, training use, region (this is where TypeSafe's J4 row finally gets written);
- licence;
- Spanish support (recorded for reference only; not a requirement since W25, English only).

Candidate families to cover, at minimum, plus anything the survey finds:

| Family | Examples to check | How it could serve System One |
|---|---|---|
| The current vendor | TypeSafe Jev (terms = J4) | native |
| Jev through other hosts | NanoGPT, OpenRouter (v2.5 B6 / J5) | native only if the host exposes the typed contract |
| **Logprob-scored LLMs** | llama-server (`n_probs` / `logprobs`), vLLM, hosted APIs that return logprobs | p = softmax over the answer tokens ("Yes"/"No", option letters, scale digits) on a constrained single-token answer. Runs on the model the user already has, including Artemis |
| Open classifiers / NLI | DeBERTa-v3 NLI and MNLI families, zero-shot classification models, run through ST's `transformers` vectors backend or a server-side ONNX runtime | `noul` as entailment p; `choice` as zero-shot label p; `score` as binned labels |
| Reward / judge models | open "LLM-as-judge" and reward models (Prometheus-style, open reward models) | score distributions if logprobs are exposed; verbalized otherwise |
| CLI harness models | Claude Code, Codex, opencode through v2.6 04 H (v2.5 B10 / J8) | verbalized only: a new decision rule per use, off-path only |
| Anything else the survey finds | a public listing search (Hugging Face, OpenRouter catalog, awesome-lists) | stated per row |

**Phase 0 pass:** every family has ≥ 1 row with a measured or documented answer for each column, or "not found" citing
the sources that were checked.

## Phase A — The seam (build, no behaviour change)

- `DecisionProvider { id, contract: "native" | "logprob" | "verbalized", ask(question): JudgeAnswer }` sits behind the
  existing `askJudge` (`judge/client.ts`). The validation, cache, timeout and fallback stay where they are.
- **Server side:** the judge plugin gains a provider table. Each provider keeps its own key under the Q1a rule: per-user
  keys, and no shared fallback when accounts are on. A local provider (llama-server, ONNX) needs no key.
- **Settings:** `judge.provider[use]`, defaulting to `typesafe`. Changing a use's provider to one it is not calibrated on
  shows readiness `unproven`, and that use keeps its fallback until it is calibrated (the readiness rule already works
  this way per model).
- **Readiness** is keyed by provider × model × use (today it is model × use).
- **The one privacy notice** (Q1b option a) is shown once per provider that leaves the machine. A local provider sends
  nothing, and the panel says so.
- **Gate:** every existing judge test passes with the TypeSafe provider behind the seam, byte-identical requests
  (golden). A mutant that routes a use to an uncalibrated provider is refused.

## Phase B — Calibrate providers on the existing uses

For each provider family that Phase 0 finds viable (at least one local logprob-scored LLM and one open classifier):
- run every use's existing calibration fixture (`*Calibration.ts`), with **floors unchanged**, ×2, with a judge-off
  column;
- report per use: meets the floor or not, latency p95 against the use's budget (reply-path uses have 1500 ms), cost, and
  a privacy row.

Output: `v2.6/12-provider-matrix.md` plus the recommended-config rows. Defaults change only where a provider meets a use's
floor ×2 **and** the user accepts the switch (W2 keeps TypeSafe as the shipped default for now).

## Phase C — Every candidate use spiked (v2.5 J6, J7, J8, B6, B10, and new ones)

Each is a spike with predeclared conditions (overview rules 3, 4 and 11), run on the best provider for its latency class.
Each needs a ≥ 20-case fixture (English only, W25), from the Adolion lab or plan 02's corpus.

| # | Candidate | Source | Consumer | Floor (from source; restated before the run) |
|---|---|---|---|---|
| C1 | J6a player intent | v2.5 06 | steering clause by intent; meta turns skip forced lore and the warden | per-class recall ≥ 0.85; meta precision ≥ 0.95; `MESSAGE_SENT` wait p90 ≤ 1500 ms |
| C2 | J6b boundary bundle | v2.5 06 | fewer calls per boundary | every family at its floor inside the bundle; −30 % calls |
| C3 | J6c tension read | v2.5 06 | pacing EMA sample | ±1 level ≥ 0.90, exact ≥ 0.60, beats the extractor by ≥ 0.10 (after the tension fix is live) |
| C4 | J6d shadow record | v2.5 06 | author-only disagreement log | overhead ≤ 10 %; a shadow answer is never applied (jest) |
| C5–C11 | J7: scene-break confirmation, canon verification, epistemic via the judge, cast-tuning curator, two-hop look-ahead, per-quality floors, canon drafts | v2.3 10 | as listed in `v2.5/06-judge-next.md` J7 | as declared in `v2.3/10-judge-seeds.md:88-97` |
| C12 | Harness model as judge | v2.5 J8 / B10 | off-path uses only | the Jev use's floor on the same fixture; its own decision rule declared first |
| C13 | Hosted Jev routes | v2.5 J5 / B6 | a second vendor | every recommended use re-calibrated ×2 |
| C14+ | New candidates from the Phase 0 survey and the lab (for example sprite-expression choice, image-cue timing, chapter-seal confirmation for 07, beat-freshness for 06) | this plan | named per row | declared in `12-cN-restated.md` before the run |

**Worth review per candidate** (the plan 03 format): include (a build item with its own `judge.uses.*` key; the default
follows rule 5 only once its floor is met), defer (a v2.7 seed) or drop.

## Order

1. Phase 0 (docs) and the J4 terms row, at once.
2. Phase A (the seam), which changes no behaviour.
3. Phase B on the local logprob provider first, because it costs nothing.
4. Phase C, cheapest first: C1, C2's Phase 0, C4, C13's docs, then the rest. C12 waits on 04 H.

## Gates

Phase A: pure tier plus the existing judge suites. The live J11 on TypeSafe is a regression row, so it runs in plan 14
T6 and ×2 at the T7 freeze (overview rule 13; no per-plan ×1). Phases B and C are measurements: lane runs per their
fixtures when a recommendation waits on them, and ×2 of anything recommended at the T7 freeze.

## Unresolved questions

- Does the user want a **local provider as the shipped default** once one meets every recommended use's floor, with
  TypeSafe as the opt-in? This is decided after Phase B, not now.

## Gate record — Phase 0 + Phase A (2026-09-30)

Branch `worktree-agent-a2da981ef2f1b73bd`, base `a272ce8c`. No real-LLM or live TypeSafe run (rule 13). Phases B/C not started.

### Phase 0

- `v2.6/12-survey.md`: seven families, every row cites URL + 2026-09-30, pass check table at the end. F1–F6 pass; F7 (anything else) rows
  carry "not found" with the sources checked, which the pass rule allows.
- **J4 written** (TypeSafe terms): no training on Input (Privacy Policy, MCA §4.1); telemetry usable without restriction (MCA §4.3);
  retention "as long as reasonably necessary", no number; US hosting, DPA with EU SCCs; ZDR enterprise-only; MCA §2.3 forbids
  distillation, so Phase B never trains on Jev answers. Sub-processor names unread (trust page is JS-only).
- Findings Phase A used: llama-server `/completion` + `n_probs` returns `completion_probabilities[0].top_logprobs[{token, logprob}]`
  (`top_probs`/`prob` with `post_sampling_probs`, legacy `probs[{tok_str, prob}]`); raw-prompt `/completion` avoids the Gemma thinking
  template that emptied Chat Completion replies on Artemis.

### Phase A — as built

| Task | Where | Gate |
|---|---|---|
| `DecisionProvider {id, contract, ask}` behind `askJudge`; validation, cache, timeout, fallback unchanged in `judge/client.ts` | `judge/providers.ts`, `runtime/judge.ts` (`transportFor`, per-provider cache, availability per provider) | `judgeSeam.golden.test.ts` |
| TypeSafe requests byte-identical through the seam | golden `test/goldens/judge/seam-typesafe.requests.json`, recorded on the unchanged code in its own commit (`ffe19aa5`) before the seam existed: 9 requests (director, pairs, verify, curator filter, contradiction, warden, background, a score/noul/choice mix, probe) — body string + timeout | jest byte compare; mutant (`{model, ...request}` key order) fails it |
| Plugin upstream byte-identical | `plugin.test.mjs` "seam golden": URL, method, headers, body string to `api.typesafe.ai` | node:test, recorded pre-seam |
| `llama-logprob` provider: one 1-token `/completion` per question, `n_probs` 20, temperature 0, `cache_prompt`, state before question (prefix reuse); p = labels' probability mass renormalised over the answer tokens (Yes/No, A–T, 0–9); score = expected level index, confidence = max p; a question with no label in the top candidates stays unanswered (reader null → that use's fallback); >20 options refused | `judge/llamaLogprob.ts` (lazy chunk: loaded on the first routed call) | `llamaLogprob.test.ts` 8 cases over both response shapes |
| `judge.provider[use]` (16 uses + warden) default `typesafe`, sanitised; `judge.noticesSeen` | `judge/settings.ts`, `runtime/settingsStore.ts` | `judgeProviderRouting.test.ts` sanitize case |
| Routing refuses an uncalibrated provider (fallback `uncalibrated`, never sent, never metered) and a split shared call (scene = trigger/tracker/lookahead; lore = select/exclusive; warden = warden/agency/house rules), counting only active uses | `judge/readiness.ts` `judgeRoute`, `RING_USE_ROUTE_KEYS` | routing test; **mutant**: guard `if (route.refused)` disabled → 2 of 7 fail |
| Readiness keyed provider × model × use: `JUDGE_READINESS_BY_PROVIDER` (typesafe = today's table, llama-logprob empty); off-default provider without a row → `unproven` + `uncalibratedOn`; split → `unproven` + `splitFrom`; model mismatch only on the default provider | `judge/readiness.ts` | routing test; existing `readiness.test.ts`/`accounting.review.test.ts` unchanged and green |
| Default provider cleared for every use (W2 behaviour kept: loreExclusive/expressions still run on TypeSafe unmeasured) | `providerCleared` | no-behaviour-change case |
| Plugin provider table (`PROVIDERS`), `/providers/llama-logprob/completion` (whitelisted fields only, URL from `SO_JUDGE_LLAMA_URL` on the server, never the page), status `providers{configured, local, host}` | `server-plugin/.../index.mjs` 1.2.0 | 4 new node:test cases |
| W12: with `enableUserAccounts` on, keys come from the user's own ST secrets only; env/.env ignored | `resolveKey(request, provider, {accountsEnabled})`, reads ST `getConfigValue` | W12 test; **mutant**: guard removed → fails |
| Privacy notice once per provider that leaves the machine (policy link, "Got it" → `noticesSeen`); a loopback llama-server says nothing leaves; per-use provider select + warden select | `JudgeSettingsGroup.tsx` (`JudgeUseRows`, `JudgeProviderNotices`) | 3 new stories |

### Overall gates (worktree, 2026-09-30)

- `npm run typecheck` 0 · `npm run typecheck:test` 0 · `npm run lint` 0
- `npm test`: 345 suites / 4619 tests passed (architecture, ownership, fault-matrix, code-health guards included)
- `npm run test:debug`: 421/421 · `npm run test:plugin`: 25 pass, 1 skipped (live) · `npm run build` ok · `npm run build:dev` + `npm run test:release`: 77 pass, 2 skipped, 0 fail
- Storybook: `storybook build -o .sb-static-12`, served on 6112, `test-storybook --index-json`: 37 suites / 274 tests passed (the file-scan mode finds 0 stories through the worktree's `node_modules` junction, so `--index-json` was used)

### Deviations

- Plugin status test extended (the body gained `providers`); every other existing judge test untouched.
- Census row `JudgeRuntime.available` renamed to `JudgeRuntime.currentStatus` (same `local` reasoning).
- Main entry **1,249,941 B against the 1,250,000 B budget** (base 1,243,063). Kept under by lazy-loading the llama provider and a shared
  plugin POST helper; 59 B headroom is left for every later plan.
- `.claude/rules/architecture.md` judge invariant ("the only place the TypeSafe key is read: ST secrets, env, `~/.typesafe`") is now
  per provider and per user under accounts; not edited here.
- The live J11 ×1 on TypeSafe named in §Gates is not run (rule 13 batches it into plan 10 phase F).

### Open

- Loopback is judged local by host; an SSH tunnel to a pod on `127.0.0.1` reads local while leaving the machine.
- The meter's `lastAnsweredModel` is not per provider, so an off-default provider's model mismatch is not yet read.
- The calibration harness (`createJudgeHarness`) still probes TypeSafe; `probe(request, model, provider)` exists for Phase B.

# Plan 12 — Open judge: a provider-agnostic decision layer, every candidate use spiked, every public option surveyed

**Status: DRAFT 2026-09-30, awaiting user approval. Nothing here is built.**

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
- Spanish support.

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
Each needs a ≥ 20-case fixture with ≥ 8 Spanish rows, from the Adolion lab or plan 02's corpus.

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

Phase A: pure tier plus the existing judge suites and a live J11 ×1 on TypeSafe (no change). Phases B and C are lane runs
per their fixtures, ×1 here and ×2 of anything recommended in plan 10.

## Unresolved questions

- Does the user want a **local provider as the shipped default** once one meets every recommended use's floor, with
  TypeSafe as the opt-in? This is decided after Phase B, not now.

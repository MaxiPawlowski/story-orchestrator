# Runbook — switching the main model

**Status (2026-10-03): v2.7 plan 12a. Written (v2.7 12 option D, user decision 2026-10-03: keep Artemis v1.1 with
thinking on; write this checklist).** Use it when a trigger fires (v2.7 12 decision 5):
- (a) your own rating disagrees with the delegated one;
- (b) a new release appears;
- (c) a playtest shows a model failure that presets cannot fix.

The user also funded one thinking A/B (Cydonia or Skyfall), v2.7 12 decision 4. It runs in
`v2.8/01-v27-carry-over.md` §D (tier RP) and uses §2 below.

A switch is a measured, costed step, never a preset edit.

## 1. Before anything runs

- [ ] **Name the trigger and the candidate** (model, quant, GGUF source, sha256).
- [ ] **Check the context:** at 4 lanes. Cydonia is capped at 131k (`LLM_CTX` ≤ 131072), Skyfall was tried at 98k.
      Today's runs use 196k shared on Artemis.
- [ ] **Check the template:** the candidate's chat and reasoning template (Gemma 4 `<|channel>thought` vs Mistral V7-Tekken
      `<think>` vs native `[THINK]`). Every later step depends on it.
- [ ] **Decide whether thinking is kept** (it is a hard requirement, v2.7 12 decision 2). If the candidate cannot think
      (Artemis v1.2 closes the thought at once in 14/16), stop here.
- [ ] **Budget:** about 2–3 pod-hours for the A/B (the v2.6 thinking A/B took 2.36 h, about USD 1.70). Record it in
      `test/sessions/BUDGET.md`.

## 2. The A/B (kit: `C:\dev\so-lanes\artemis-think\`)

- [ ] Download the GGUF to the network volume (`x9gi6f1rig`), verify sha256, then start the pod and tunnel
      (`.claude/rules/gotchas.md`: RunPod proxy, `ssh.direct` port after a restart).
- [ ] **Without thinking:** the BL setups on the same 20 blind turns.
      - Objective counters: loops, corrupt replies, forced picks, mean words.
      - Baseline to beat: BL1 (v1.1 + thought channel + `min_p` first): 0/20 loops, 0 corrupt, 0 forced picks.
- [ ] **With thinking:**
      - empty replies;
      - immediate thought closes;
      - repeated names;
      - wrong speaker;
      - thinking that never closes.
      - Baseline: v1.1 with the opener after the name, 0/20 damage.
- [ ] **Speed:** tok/s at 4 lanes. Baseline 28.6 tok/s.
- [ ] **Rating:** build the blind packs, rated by Astra (delegated), as with `model-blind-20(-think)`. The user rates only
      if they choose to (Adolion content).

## 3. If the candidate wins: what changes, in order

| # | Item | Where | Action |
|---|---|---|---|
| 1 | ST presets | install: instruct, Start Reply With, reasoning template, sampler preset, stop strings, Auto-fix Markdown, name-echo regex | rebuild for the new template; record each value |
| 2 | Lane preset overlay | `scripts/debug/adolion-fresh.presets.json` | add a variant per model; `so-session start` fails closed until it exists |
| 3 | Reply thinking budget | `src/runtime/replyEffort.ts` (five llama.cpp keys) | template-driven, but the budget sampler was measured only on Gemma tokens: **measure** on the new tags before trusting it |
| 4 | Leaked-thought repair | `src/runtime/thoughtLeak.ts` | measure on the new template |
| 5 | Model-defect detector, loop guard | `scripts/debug/lib/modelDefects.mts` | extend for the new tags |
| 6 | Judge `llama-logprob` rows | `src/judge/readiness.ts` `LLAMA_LOGPROB_MEASURED_ON` | already withdrawn; a re-calibration is a new row (v2.8 14 provider rules) |
| 7 | TypeSafe rows | `readiness.ts` | no change (independent of the main model) |
| 8 | Role recommendations | `docs/plans/v2.6/recommended-reasoning.md` (history) | re-measure only for roles pointed at the pod |
| 9 | Pending human packs | `test/sessions/rating-pack/*/status.json` | finish or close the packs on the old model first; never mix models inside one gate |
| 10 | Evidence | session summaries | evidence from before the switch is about the old model; the next acceptance re-runs on the new one |
| 11 | Profiles | Connection Manager profiles (`Artemis RunPod RP`, memory profiles) | update the model name/URL; record the old values (`so-run-header` diffs `profiles.urls`) |

## 4. After the switch

- [ ] `so-run-header capture` before and after, and diff (presets, profiles, sampler).
- [ ] One T-tier session per affected card class, so the next acceptance has evidence about the new model.
- [ ] Update `.claude/rules/gotchas.md` / memory notes that name Artemis specifics.
- [ ] Record the decision, the numbers and the cost in v2.7 12's gate record (or v2.8 01 §D's, for the funded A/B).

## Review 2026-10-03

Applied: F04 (the funded A/B lives in v2.8 01 §D), B12/F36 (references).

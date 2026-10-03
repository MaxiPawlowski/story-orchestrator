# Plan 12 — Model choice

**Status (2026-10-03): v2.7 plan 12 (was old v2.7 10). CLOSED as a decision: keep Artemis v1.1 with thinking on; the
switch checklist is written (`12a-model-switch-checklist.md`). The funded thinking A/B (decision 4: "yes") runs in
`v2.8/01-v27-carry-over.md` §D against the floor below.** Source: `docs/plans/v2.6/v2.7-seeds.md` row "Model choice".
Overview: `00-overview.md`.
**Gate tiers:** v2.7: none (docs). The A/B: RP (v2.8 01 §D). Model input: none in v2.7.

> **Rating note.** You delegated the Adolion blind ratings to Astra on 2026-10-02 because you want the campaign unspoiled
> (`docs/plans/v2.6/14-review-pack.md` §Decisions). The packs' answer keys are still sealed and your own rating sheets
> are empty. This doc does not map pack letters to setups. The objective counters and Astra's verdict below are already
> in the review pack; if you ever rate a pack yourself, read §History B and C after rating, not before
> (`v2.6/14-review-pack.md:68`).

## What it is

The main reply model is Artemis 31B v1.1 (a Gemma 4 31B finetune) on the RunPod llama-server. v2.6 measured two
alternatives that fit the same 32 GB card: Artemis v1.2 and Cydonia 24B v4.3 (a third, Skyfall 31B, was measured
later). The seed: if a rating prefers an alternative, switch, and pay for every re-calibration a switch touches. This
plan says what the evidence shows and what a switch would cost.

## History and evidence

### A. Why alternatives were measured

T1 sessions showed word-dropping and line loops late in sessions. Root cause: sampler order (DRY before `min_p`) plus a
prompt that ends with no thought block, a shape Gemma 4 is not trained on. Ten server-flag arms changed nothing; the
empty thought channel and `min_p` first fixed it (`docs/plans/v2.6/15-model-config.md` §Server-flag A/B, Reading 1–3;
`v2.6/14-review-pack.md` item 2). Web research ranked v1.2 the cheapest swap and Cydonia the strongest different base
(`v2.6/15-model-research.md` §3).

### B. Objective counters

A100, 20 real turns, one seed (`v2.6/15-model-config.md` §Blind pack raw material):

| Setup | Loops | Corrupt | Forced picks | Mean words |
|---|---|---|---|---|
| BL0 v1.1 as the install ran it | 2/20 | 1 | 17 | 153 |
| BL1 v1.1 + thought channel + `min_p` first | 0/20 | 0 | 0 | 122 |
| BL2 v1.2 + the same fixes | 0/20 | 0 | 0 | 179 |
| BL3 Cydonia 24B Q5_K_M + `min_p` first | 1/20 | 0 | 0 | 154 |

Server-flag A/B (`v2.6/15-model-config.md` §Arms, Reading 5): v1.2 at least as clean as v1.1; Cydonia clean and 44 % faster
(46.7 vs 32.4 tok/s solo, A100), but it still loops once a loop is in context (3/4).

Thinking A/B on the production card, RTX PRO 4500 32 GB (`v2.6/15-model-config.md` §2026-10-02 Thinking and model A/B, Arms + Reading 4, 6, 7; Capacity):

| Model | Thinks? | Without thinking | With thinking | tok/s | Context at 4 lanes |
|---|---|---|---|---|---|
| Artemis v1.1 | yes, with the opener after the name: 0/20 damage, 0 empty on the screen bodies; 2/20 empty on the blind turns | 0/26 | as left | 28.6 | 196k shared |
| Artemis v1.2 | **barely: closes the thought at once in 14/16** | 1/16 damage | not usable as thinking | 28.8 | 196k |
| Cydonia 24B v4.3 | `<think>` prefill: short in-character reasoning, but 2/16 empty, 5/16 repeated name, 1 wrong speaker | 0/16 | weak | 41.8 | 131k (its maximum) |
| Skyfall 31B v4.2 | native `[THINK]` never closes (0/16); plain `<think>` 6/6 clean (n too small) | 0/16 | unproven | 33.0 | 98k tried |

### C. Ratings and the decision

- `model-blind-20` (the four BL setups) and `model-blind-20-think`: rated blind by Astra (`openai/gpt-6-astra`), first
  pass and high pass, delegated by you. Verdict recorded: **v1.1 and v1.2 tie at the top; keep Artemis v1.1 + `min_p`
  first; the thinking setup was tuned on v1.1** (`v2.6/14-review-pack.md:26-32,38`; commit `166fa9b1`).
- `model-blind-20-think`: thinking (opener after the name) ranked above the control; **thinking stays on** (applied to
  your install 2026-10-02, `v2.6/14-review-pack.md` item 10 "Applied to your install").
- `model-blind-20-effort`: budget 400 ranked first; **medium (400) stays the default** (`v2.6/14-review-pack.md:32`).
- Your own rating sheet `test/sessions/rating-pack/model-blind-20/rating-sheet.csv` is empty; the key is sealed.
- The v2.6 freeze session T7-1 and the final suite ran on Artemis v1.1 with thinking on, medium budget
  (`test/sessions/T7/SUMMARY.md:5`).

So the seed's trigger ("if the blind pack prefers an alternative") did **not** fire under the delegated rating. And
since thinking is now on, v1.2 is ruled out on a measured fact (it does not think), whatever its prose.

## Why it was deferred

The decision belonged to the joint review and the blind pack (`v2.7-seeds.md` row). It was taken there (keep v1.1). The
seed stays so the switch cost is written down before anyone proposes a switch again.

## Current state in code

The extension itself names no model. What is tied to Artemis v1.1 / Gemma 4 is configuration and calibration:

| Tied to the model | Where | What a switch does to it |
|---|---|---|
| ST presets on your install: instruct `Gemma 4 Thinking` + Start Reply With `<|channel>thought`, reasoning template Gemma 4, `Artemis v1.1 RP` with `min_p` first and 1400 tokens, names/sequences-as-stop off, Auto-fix Markdown off, the name-echo regex | `v2.6/14-review-pack.md` item 10 "Applied to your install", item 2 steps 1–7 | rebuild for the new template (Cydonia/Skyfall: Mistral V7-Tekken, `<think>`), re-run the A/B on it |
| Lane preset overlay (variants `thinking`, `fix`), asserted at `so-session start` | `scripts/debug/adolion-fresh.presets.json`; `v2.6/15-model-config.md` §Lane preset overlay | new variant per model; sessions fail closed until it exists |
| Reply thinking budget (five llama.cpp keys) | `src/runtime/replyEffort.ts:9,99-119`; invariant "The reply thinking budget…" in `.claude/rules/architecture.md` | the code is template-driven (it reads ST's reasoning prefix/suffix), so it should carry over, but the budget sampler was measured only on Gemma's `<|channel>` tokens: **not determined** for `<think>` models |
| Leaked-thought repair | `src/runtime/thoughtLeak.ts`, `replyEffortHost.ts` | template-driven; unmeasured on other models |
| Judge `llama-logprob` rows | `src/judge/readiness.ts:184` `LLAMA_LOGPROB_MEASURED_ON` = the Artemis v1.1 GGUF path | already withdrawn after T6-2 (0/96 answered under play load, commit `10a74535`); a served model other than `measuredOn` is discarded anyway (`model-mismatch`) |
| TypeSafe judge rows | `readiness.ts:34` `jev-1.13.0` | independent of the main model: no change |
| R3 role recommendations for Artemis arms | `docs/plans/v2.6/recommended-reasoning.md` §artemis-tc, §artemis-cc | void for a new model; the orchestrator roles run on DeepSeek in the sessions (`v2.6/00-overview.md` W28), so this matters only if you point roles at the pod |
| Harness model-defect detector, loop guard | `scripts/debug/lib/modelDefects.mts` (reads Gemma channel tags) | extend for the new template's tags |
| Pending human packs (R4 4/20, Q-M 1/20, C3, W6) | `test/sessions/rating-pack/*/status.json` | pairs made on v1.1 replies; a switch mid-collection mixes models in one gate |
| v2.6 acceptance evidence (T0–T7) | `test/sessions/*/SUMMARY.md` | about v1.1; a switch makes it evidence about another model |
| Pod + volume | network volume `x9gi6f1rig` holds the Artemis GGUF (`test/sessions/BUDGET.md`) | download + sha256 check; Cydonia needs `LLM_CTX` ≤ 131072 |

## Options

**A. Keep Artemis v1.1 (status quo).** Cost 0. Matches the delegated verdict, the thinking decision and all v2.6
evidence. Risk: the late-session loop is managed, not cured (the harness loop guard stays; thinking does not escape a
loop already in context, `v2.6/15-model-config.md` Reading 4/4 L body).

**B. Artemis v1.2.** Drop-in for server, VRAM and speed. Disqualified while thinking is wanted (14/16 immediate close).
Only worth it if you turn thinking off for good.

**C. Cydonia 24B v4.3.** Faster (41.8 vs 28.6 tok/s), short in-character reasoning that suits the inner voice. Costs:
new template and presets, context 196k → 131k shared, its own thinking A/B (2/16 empty, speaker slips), a new lane
overlay, defect detector tags. Estimated about 2–3 pod-hours of A/B (the v2.6 thinking A/B took 2.36 h, ~USD 1.70,
`BUDGET.md`) plus a T-tier re-run for evidence.

**D. Keep a written switch checklist, decide per evidence.** Turn the table above into a runbook (`docs/…`), and
re-open only when a trigger fires: your own rating disagrees with Astra's, a new finetune appears, or the playtest shows
a model-side failure the presets cannot fix. Cost: one doc.

**E. Re-measure on a newer release (e.g. a later Artemis).** Same kit (`C:\dev\so-lanes\artemis-think\`, re-runnable)
when one appears. Cost per candidate ≈ the thinking A/B.

## Recommendation

*Written before the user's answers. Decision 4 funded one thinking A/B, so the outcome is A + D now, plus E-shaped
measurement of one candidate in v2.8 01 §D (review F04).*

**A + D.** Keep Artemis v1.1 with thinking on; write the switch checklist so a future switch is a measured, costed
step and not a preset edit. B is ruled out by a measured fact while thinking is wanted, and C's thinking is weaker on the
only measurement there is. Re-open on a trigger, not on a schedule.

## Decisions for the user

1. Accept Astra's delegated verdict (keep v1.1) as final for v2.7? **Recommended: yes.** (Or rate
   `model-blind-20` yourself; it is Adolion content, so that spoils the campaign.) yes
2. Is thinking a hard requirement for the main model? **Recommended: yes** (your 2026-10-02 decision); this alone rules
   out v1.2. yes
3. Write the switch checklist (option D) now? **Recommended: yes**, as a short runbook beside `v2.6/15-model-config.md`. yes
4. Fund a Cydonia or Skyfall thinking A/B in v2.7? **Recommended: no**, unless the playtest shows a model failure the
   presets cannot fix. yes
5. Triggers that re-open this plan: (a) your own rating disagrees; (b) a new release; (c) a playtest model failure.
   **Recommended: all three.** all

## Floor and measurement before building

Used by the funded A/B in v2.8 01 §D, unchanged. A switch is a measurement, not a build. Predeclared before any arm runs, on the existing kit and bodies:
- damage (hand-read) and loops ≤ the incumbent's on the same bodies and seeds (incumbent: 0/20 damage, 0/20 loops,
  `stga` thinking arm);
- with thinking: empty replies ≤ 2/20 on the blind turns and wrong speaker 0 in group bodies;
- blind preference ≥ 60 % over the incumbent on 20 turns (rater: Astra, delegated, unless you rate);
- then the T-tier subset that touches the reply path (T0 playable, T1 features, T3 surfaces) ×1 on the new model.

Data needed: the 20 blind turns (exist), the A/B bodies (exist), pod time.

## Gates

- Config-only switch: docs none; lane overlay change → `npm run test:debug` (`presetOverlay.test.mts`) + `npm run gates`.
- Any code change for a new template (defect detector, thought-leak repair, budget keys): runtime tier + `npm run build`
  + live gate (`st-payload.mts arm --persist`, off/low/medium/high × n ≥ 3 group turns, as owed in
  `v2.6/05-reasoning-control.md` §Live).

## Links

- v2.8 01 §D (the funded A/B), v2.7 12a (switch checklist).
- v2.7 08 thinking per story: the model must think for any thinking control to matter; v1.2 fails that.
- v2.8 20 character life L5: harvest needs a thinking main model.
- v2.8 14 open-source Jev and v2.7 14 B10 CLI judge: other judge providers; the `llama-logprob` provider is tied to the
  served model (`measuredOn`).
- No direct dependency: v2.7 06, v2.8 18, v2.9 03 (deferred), v2.8 01 §C, v2.9 02 (deferred), v2.8 12, v2.8 13, v2.8 11,
  v2.7 13, v2.8 15, v2.7 11, v2.7 09, v2.9 04 (deferred).

## Review 2026-10-03

Applied: F04 (the funded A/B is scheduled in v2.8 01 §D; the recommendation's "no A/B" is marked as pre-decision), the
Claude-A notes ("W28" = `v2.6/00-overview.md` W28; Links name deferred plans as deferred), B12/F36 (references). Closed.

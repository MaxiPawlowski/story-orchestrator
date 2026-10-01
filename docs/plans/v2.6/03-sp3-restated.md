# Plan 03 — SP3 restated (roster aliases and entity canonicalisation)

**Step 0, committed before any run.** Bars are v2.5's (`v2.5/09-research-spikes.md` §SP3), verbatim.

## Conditions and bars (unchanged from v2.5)

| # | Condition | Pass (build only if either holds) |
|---|---|---|
| A1 | Split keys: epistemic subjects, ledger entities and memory `entity=` tokens that name a roster member by a non-canonical form | ≥ 5 % of cast-referencing rows |
| A2 | Director misses: `SPEAKER:` answers that resolve to no roster id although a member was meant | ≥ 1 per 50 decisions |
| A3 | Sample | ≥ 300 cast-referencing rows and ≥ 100 decisions; […] Never decide A1/A2 on an undersized sample |

## Procedure change (stated before the run, rule 1; plan 03 §Resolved)

**A3 counts the lab's calibration-lane director decisions.** The sample is `adolion-campaign@e1c91fb`
`lab/aliases/director.json`: **174 rows** (162 alias-shaped windows + 12 canonical controls; candidates, lead,
instruction and objective are the built saga checkpoint's). Plan 03 names "199 answers": that count predates W25,
which removed the Spanish rows; 174 English rows remain, still ≥ 100. Each row is run through the **real director prompt
and parser** (`so-role-calibration.mts run --role director`, `runRoleCase`) with the lab file in place of
`test/fixtures/judge/director.json` for the run only. The authored `answer` field is not used: the live model's answer is
the decision. Run ×2 (two arms, `adolion-sp3-r1`, `-r2`); A2 is decided per run and must agree.

- **Route (rule 5):** pass role `director`, profile `deepseek 4.1 flash` (`--profile`, the installed DeepSeek
  orchestrator route, user decision). No judge (TypeSafe) call: this is the LLM director path.
- **A2 count:** a decision misses when the parsed pick is `null` (resolves to no candidate) **or** names a member that
  is not in the row's `acceptable` list (a wrong member; Adolion has 24 word-like roster ids, lab finding F2). Both are
  reported separately; the bar is applied to their sum, because "resolve to no roster id although a member was meant"
  and "resolve to the wrong member" are both the failure aliases cause. The narrower reading (null only) is reported
  beside it and never replaces it.
- **A1 (rows):** two arms, kept apart.
  1. **Decided arm, real audits:** `scripts/spike/sp3/phaseA.mjs` over real Adolion audit tails: the archived J12
     (Adolion) tails plus the journal tails captured during this plan's SP2 live legs on three Adolion act stories
     (real `read` passes on DeepSeek). `STORY_FILES` gains the act stories (copies from the pin, local only). If these
     hold < 300 cast-referencing rows, A1 is **reported, not decided** (A3 on rows).
  2. **Information arm, authored rows:** `lab/aliases/score.mjs` on the 652 labelled mentions (548 cast rows, 48 %
     non-canonical by construction). Authored rows give no natural rate and never decide A1.
- **Decision:** A1 or A2 passing on a sample A3 accepts → Phase B is the `.b` candidate (worth review decides).
  Neither → SP3 recorded not built (exact matching stays). No spike code exists to remove (Phase A is read-only).

## Toy tier

`node --test scripts/spike/sp3/phaseA.test.mjs` keeps running; the v2.5 archive arm (343 rows, 54 decisions) is
re-printed as history.

## Records

`test/measurements/v2.6-03/sp3/` (calibration reports r1/r2, phaseA output, score.mjs output, summary).

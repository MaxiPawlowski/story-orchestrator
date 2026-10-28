# v3.0 25: read facts tier below floor on Artemis

**Status 2026-10-28: cause found; prompt fix candidate A built and measured, NOT adopted (owner decision 4 bar missed on
format, intents precision fell below its floor on the live suite x2). Nothing in `src/` merged. Three owner questions below.**

Branch `v3.0-facts-fix` (this record), worktree `C:\dev\so-facts`. Candidate A parked on local branch
`v3.0-facts-candidate-a` (`4adf3112`, not merged, full gates not run on it).

## Symptom

- `so-live-suite` on lane 41 (local controller, patched llama.cpp, Artemis 31B v1.1, read profile "Story Orchestrator
  Memory RunPod"), 3 runs (C1 build x2, pre-W2 control `d2006d17` x1), identical: facts 8/20 = 0.40 vs floor 0.68,
  epistemic 2/3, intents playerAttributed 1; deltas 43/43, rejected 35/36 (plan 12 GPU step 1).

## Cause

- **The model does not write FACT lines; it writes the same content as MEMORY lines.** Probe of all 43 fixtures on the
  same build and lane (raw answers + prompts, `so-facts-probe`): 5 FACT lines against 58 MEMORY lines (detail 20,
  scene 20, event 11, fact 3, revelation 3, development 1). On the 12 fixtures with a positive facts claim the needle
  is always present in a MEMORY line, never in a FACT line.
- The read contract offers two formats for the same tier. The format block lists `FACT importance=… text=…` with no
  guidance; the memory addendum right after it lists `MEMORY type=…` with "Facts tier types (fact, relationship,
  preference, event) — durable, cross-session" and a full taxonomy. Artemis takes the richer MEMORY form every time.
  In the product both land in the facts tier (`memory/parse.ts` `TIER_FOR_ENTRY_TYPE`, `extractionCoordinator.applyAudit`),
  but the live suite's facts tier reads FACT lines only (`liveTiers.ts` `parsed.facts`).
- Ruled out:
  - parser: every FACT line in the canonical shape parsed; 2 hybrid lines (`FACT importance=3 type=event text=…`) were
    dropped as `unrecognized line`, both in a negative fixture (extractor28), so they move no score;
  - thinking / budget: the read answer starts with an empty thought channel (`<|channel>thought\n<channel|>`); every
    rating-set request ended on EOS, none on length; reasoning strip is not involved;
  - scope / prompt assembly: the FACT format line is present in every fixture prompt and every captured real read;
  - scorer: `termPresent` matches the needles in the MEMORY text; the misses are rows the tier does not read, not
    needle misses.
- **Not a regression; no bisect.** The floor 0.68 (v2.4 X15) was set on a 22-fixture denominator where all 16 passes
  were fixtures with no positive claim; the 6 positive fixtures failed then too, each "got 0 FACT lines" (v2.4 04
  record, pod Artemis). v2.5 F2 (`16df2c00`) and v2.6 01 (`e6c0fe45`) replaced the vacuous needles with real claims
  (12 positive, 8 negative today). Artemis has never passed a positive facts needle on this suite: 0/6 on v2.4, 0/12
  now (pod TC 0.40/0.40 and CC 0.40-0.47 in v2.6 recommended-reasoning, local 0.40 x3). DeepSeek flash read 0.60-0.65.
- Diagnostic only (not a gate, scorer unchanged): counting facts-tier MEMORY rows into the facts tier gives 14/20 on
  the same answers. The other 6 positives are written as session-tier `detail`/`scene` rows.

## Candidate A (prompt)

- One line under the FACT format (`contract.ts` `FACT_RULE`): write a FACT for each durable truth the window shows
  (gained, lost, opened, broken, sealed, learned, suffered), a MEMORY line does not replace it, never a FACT for what a
  character only says, plans or suspects. Deltas-only reads and the player-only reask unchanged. Thinking unchanged.
- Screens on the 43 fixture prompts (one sample each, `askModel` on the read route, strict FACT parse):
  - base 8/20 facts, intents 12/14;
  - A 18/20, intents 12/14; A replicate 18/20, intents 12/14;
  - B (shorter wording) 16/20, intents 11/14;
  - C (other wording, after the output rule) 15/20, intents 10/14;
  - D (A's wording after the output rule) 15/20, intents 11/14; C and D write hybrid FACT lines (5, 10) the parser drops.
- Live suite x2 on the candidate build (lane 41, holder-served `C:\dev\so-facts\dist`, chunk `9198.index.js` carries the
  rule, verified in a probe prompt), same command as plan 12:
  - r1 `facts-cand-r1`: deltas 43/43, facts 18/20 = 0.90 ok, rejected 35/36, arcs 2/2, ledger 2/2, epistemic 2/3 FAIL,
    intents 10/14 precision 0.727 recall 0.667 playerAttributed 2 FAIL;
  - r2 `facts-cand-r2`: deltas 43/43, facts 18/20 ok, rejected 36/36, arcs 2/2, ledger 2/2, epistemic 2/3 FAIL,
    intents 11/14 precision 0.769 recall 0.833 playerAttributed 1 FAIL;
  - baseline (3 runs): intents precision 0.917 every run. Intents precision drops below its 0.8 floor on both runs:
    a regression. In the screens the model moved some intentions into FACT lines.
  - run header diff pre -> end: `build.dirty` only (worktree committed between); no settings, library or lorebook drift.
- Blind Sol rating (owner decision 4), floors declared before any candidate output existed
  (`facts-rate/floor.json`): 30 real shared-read prompts from live play on test stories (lanes 42, 34; no campaign
  story), 6 stories, seed 1234, control = captured request, candidate = same plus the rule; `codex exec -m gpt-6.1-sol
  -s read-only`, X/Y order by sha256(id + salt), 30/30 rated:
  - faithfulness 3.600 -> 3.533 (-0.067), coverage 3.733 -> 3.767 (+0.034), **format 3.000 -> 2.733 (-0.267) FAIL**,
    economy 3.167 -> 3.367 (+0.200);
  - flags: unsupported 67 -> 61, claim_as_fact 22 -> 23, private_leak 0 -> 1 (all within +2);
  - preferred: control 16, candidate 12, tie 2; thinking closure: no length finish in either arm.
  - Format: both arms mostly drop `q=` from DELTA lines (control 9 with `q=`, candidate 4, of ~47); the parser accepts
    both shapes.
- Verdict: **not adopted** (format below -0.2; intents precision below floor x2). Floors not retuned.

## Rater noise (observation, not a gate)

- Same 30 prompts, control seed 1234 vs control seed 4321, same rater and protocol (`facts-rate-noise/`), 28/30 rated (2 lost to rater 429s):
  faithfulness +0.036, coverage -0.108, format +0.072, economy +0.214; flags unsupported -5, claim_as_fact -2,
  private_leak 0; preferred 10 / 14 / 4 tie. Seed noise alone moves a category by up to ~0.21, so the bar's -0.2 sits
  at the noise edge; candidate A's format -0.267 is past the widest seed move seen, but not by much.

## Owner questions

1. Scorer: should the live suite's facts tier read the product's facts tier (FACT lines plus MEMORY rows of facts-tier
   types), as `applyAudit` stores them? Diagnostic 14/20 = 0.70 on today's answers. Not changed here: it would clear
   the floor by 0.02, and the call is a definition, not a defect fix.
2. Adopt candidate A anyway (facts 0.90 x2; format -0.267; intents precision 0.73/0.77)? Or a contract change instead:
   one format per tier (drop FACT, or drop the facts-tier MEMORY types), which needs its own rating and changes what
   the facts fixtures mean.
3. Parser: accept a FACT line that carries extra MEMORY attributes (`type=`, `expiration=`)? 2 of 43 baseline reads;
   5-10 per 43 with a rule placed away from the FACT format. A small defect fix on its own (live suite unchanged on
   today's prompt).

## Gate record (2026-10-28)

- Merged: this record and the 00-overview row; no `src/` change. `npm run gates` (no `--resume`) on the record tree before the noise result was filled in
  (docs-only edits after): **all green in 429.1 s**, 11 steps (build, typecheck, test:replay, test:debug, typecheck:test,
  debug:typecheck, test:release, test:plugin, test, lint, test-storybook:ci 167 suites / 1010 tests).
- Candidate branch only: `npm run gates:quick` RED first (`shadowReplay.test.ts`: the committed j6d synthetic session
  embeds the read prompt; regenerated with `SO_J6D_WRITE=1`), then green (typecheck, typecheck:test, lint, jest related,
  replay --cached 32/32). `npm run build` ok (main `index.js` unchanged `9df33a4c3770`).
- Live: lane 41 only (model lane; lane 45 was the other agent's), `st-lanes start 41 --allow-local --headed`, images
  off as seeded, holder-served candidate, owner ST untouched, nothing staged; lane and holder stopped after. One `so-run-header diff`
  was first run outside a lane by mistake: it read the 9222 browser and wrote `so-lanes/0/debug/run-header-diff-end.json`
  (read-only otherwise); redone through `st-lanes run 41`.
- Evidence (counts only): `C:/dev/so-lanes/41/debug/facts-probe/` (base, base-all, arm-A/B/C/D, arm-A-rep2),
  `facts-live/` (r1.log, r2.log, holder log), `facts-rate/` (floor.json, selected, out, pack, rated, key, unsealed),
  `facts-rate-noise/`, `facts-tools/` (probe, arm, select, send, pack, rate, unseal, tier scripts); reports
  `so-live-suite-facts-cand-r{1,2}-report.json` in the lane debug dir. Archived: private so-sessions `evidence/phase-c/facts-2026-10-28/` (`so-evidence archive`, 92 MB, plus
  `lane-41/facts/` with the dirs above and the plan 12 before-runs as `c1live-before/`), commit `8aed0933`.

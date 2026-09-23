### J0 runner-selftest — Prove the so-journey runner itself: fresh-start setup, pass/blocked/skipped outcomes, cleanup. No LLM calls.

| Check | Mode | Findings | Outcome | Detail |
|---|---|---|---|---|
| J0.1 | auto | — | pass | reported pass as expected |
| J0.2 | auto | — | pass | reported pass as expected |
| J0.3 | auto | — | pass | reported blocked as expected — missing capability: feature-from-the-future |
| J0.4 | human | — | skipped | human check — operator scores it |
| J0.5 | auto | T3 | pass | reported fail as expected — Evaluation failed in SillyTavern page: page.evaluate: Error: J0.5 fails on purpose: this is the runner proving it reports a real fai |

--- HUMAN CHECKLIST (score 1-5 + free text; record in the Gate record) ---
[J0.4] (—) Ignore — selftest placeholder proving human checks are emitted as a checklist and reported as skipped.
      anchors: 1 = not emitted, 5 = emitted
[free] What would make you stop using this?

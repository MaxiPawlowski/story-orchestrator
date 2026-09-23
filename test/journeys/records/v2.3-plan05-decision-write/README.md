# plan05-decision-write — deterministic, real host, no model

`node scripts/debug/so-scenario.mts run test/scenarios/plan05-decision-write.json --sandbox --group 1759606632088`

Run **twice**, both green, both first-attempt (`retries: []`), both with their own sandbox chat deleted and
no leaked mirror book.

| record | revision | result |
|---|---|---|
| `scenario-run1.json` | fixture v1 (it also wrote `cadence: 0` install-wide, which the cleanup restored and verified) | ok, 6/6 |
| `scenario-run2.json` + `.log` | final fixture — the settings write removed, so the run touches no install-wide setting at all (`extraction.unchanged: true`) | ok, 6/6 |

What it proves, in the served bundle on the real manager: a decision whose write LANDS is applied
(`applied === true`, provenance `author` + `override.from: "reconfirm"`), and a decision whose write was
LOST is put back and answers `false` (pair still queued, no lock, no supersession, no retirement) — the
second half modelled by patching `rt.persist` and the save evidence, because there is no live backend to
lose a write against.

What it does NOT prove is asserted in its own last step and repeated here: no model, no extraction, no
real conflict detection, no live save endpoint (the host seam is modelled, not exercised), and nothing
about the drawer's rendering of a refusal (that is the Storybook story). The J6 pin/edit/quarantine
variant and the J5.6 pinned-private-rollback variant need a real model and remain unrun.

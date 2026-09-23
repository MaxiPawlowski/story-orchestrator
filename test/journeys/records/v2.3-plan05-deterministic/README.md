# plan05 deterministic halves — first execution, and green twice

Both fixtures were written on 2026-09-22 and **had never been run**: the corpus validator checks the
vocabulary, not the run. Executing them found four defects in the fixtures themselves (see the plan-05
Gate record §"Both deterministic halves now run" and `.claude/rules/gotchas.md`); the first-attempt
failures are kept here rather than overwritten.

| file | what it is |
|---|---|
| `j6-fixture-run1.log` / `j6-fixture-run2.log` | `plan05-pin-quarantine.json` — pin a public fact → edit its source → quarantined, kept, excluded from the facts block → reconfirm through the runtime → back as `source: author`. **ok, twice, first attempt** |
| `j56-fixture-run1.log` / `j56-fixture-run2.log` | `plan05-pin-private-rollback.json` — the private `[hiding]` row in the DRAFTED member's block → edit → quarantined, pin kept, gone from the block → reconfirm → back. **ok, twice, first attempt** |
| `j56-fixture-first-attempt-failures.log` | the run before the fixes: `sendCompactMessage requires a non-empty text string` (the object-form `send`) |

Both read the **applied** private block (`getAppliedEpistemicBlock()`), not a re-render for the active
speaker — the distinction that made the live J5.6 variant's last leg unassertable until it existed.

    node scripts/debug/so-scenario.mts run test/scenarios/plan05-pin-quarantine.json --sandbox --group 1759606632088
    node scripts/debug/so-scenario.mts run test/scenarios/plan05-pin-private-rollback.json --sandbox --group 1759606632088

No backend and no model call is involved: extraction is mocked, and the mechanism under test is the
quarantine, the per-member staging and the injection. **They are not the live gate.**

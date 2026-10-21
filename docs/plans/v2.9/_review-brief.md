# v2.9 plan review brief (gpt-6.1-sol, read-only)

Review the v2.9 plan set you triaged: `docs/plans/v2.9/00-overview.md` and `02`–`09` (written by other models from your
`01-triage-sol.md`). Read `AGENTS.md`, `.claude/rules/architecture.md`, and check claims against `src/` on this checkout.

For each plan: (1) does it implement your triage section faithfully (scope in/out, floors unchanged, dependencies, owner
decisions)? (2) wrong or stale code claims (cite file:line); (3) invariant violations (secrets/shared tiers, rollback ≡ replay,
seeded chance, engine purity, propose-never-write, one check registry, lazy chunks, thinking and inner voice stay on: anything
that degrades or switches off thought carry or the inner voice must be flagged as a P0 for the owner); (4) slices too big or
untestable; (5) cross-plan consistency: 02 owns the `roster[].polish` schema and 03 must reuse it exactly; 05/06 naming
("patterns" vs "threads"); 04 as the delivery channel for 07; shared surfaces. Also check `00-overview.md` (folds list, build
order) against your triage.

Output: a markdown review saved as `docs/plans/v2.9/10-review-sol.md`: per plan a list of findings with severity P0/P1/P2 and
the exact fix (what text to change), then cross-plan findings, then a short verdict per plan (ready / fix first). No `| ID |`
tables. Terse.

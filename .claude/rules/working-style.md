# Working Style

- All responses, plans, commit messages: maximally concise, grammar optional.
- No code comments — code must be self-explanatory. TypeScript strict, match existing idiom.
- When implementing or planning, first reference how something similar was done in this codebase.
- End every plan with a concise list of unresolved questions (skip section if none).
- Before handover: run gates per CLAUDE.md validation tiers, state exact commands run and results. Playwright live gate is the preferred end-to-end proof for ST-facing work.
- When finishing a plan: append its `## Gate record` (date, command outputs, live checks, deviations) — next agent reads it.

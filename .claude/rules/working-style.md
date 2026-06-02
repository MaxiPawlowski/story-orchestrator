# Working Style

- All responses, plans, commit messages: maximally concise, grammar optional.
- No code comments — code must be self-explanatory.
- When implementing or planning, first reference how something similar was done in this codebase.
- End every plan with a concise list of unresolved questions (skip section if none).
- When working with SillyTavern APIs or types, first check `.claude/sillytavern-docs/` and browse `C:\dev\SillyTavern-MainBranch\` (ST host source) before guessing.
- Never blindly typeguard or cast uncertain ST values. If a type from ST is not confirmed by source inspection, add a debug log and define a proper local type on our side.
- Validate approaches against the actual runtime before committing — don't trust assumptions about ST's internal shape.
- Don't sign off on any plan or feature without Playwright validation confirming it works end-to-end. Playwright is the preferred validation method.

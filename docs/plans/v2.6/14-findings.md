# Plan 14 findings register

One row per finding from the tiered sessions (`14-tiered-testing.md`). Rows start as drafts from
`node scripts/debug/so-session.mts digest <session dir>` (its `findings.md` ends with draft rows); severity
and class are decided in the review, never by the digest.

- **id**: `T<tier>-<n>`, numbered in the order the review accepts them.
- **severity**: blocker | broken | annoying | cosmetic.
- **class**: product | quality | expectation | harness.
- **evidence**: a path under `test/sessions/` with a line (`journal.jsonl:123`, `payloads.jsonl:9`, a flag's line).
- **status**: open | fixing | fixed | deferred (decided in the review) | wont-fix | cosmetic-list.
- **fix commit**: the commit that names the finding id.
- **eval**: the replay fixture, no-LLM scenario or scored eval that now guards it.

| id | tier | severity | class | evidence | status | fix commit | eval |
|---|---|---|---|---|---|---|---|

## Recorded before the sessions (card feasibility check, 2026-09-30)

Found while fixing the cards for the autonomous run; each goes to the review like a session finding. Evidence is source, not a session line, until a card reproduces it.

| what | class (proposed) | evidence | card |
|---|---|---|---|
| A disabled group member still counts as present: the members requirement reads `group.members` and ignores `disabled_members`, so disabling a required member breaks nothing Repair can see. | product | `src/services/stHost/selectors.ts:108` (`listGroupMembers`) via `src/runtime/requirements.ts:11` | T5-4 (removal used instead; the disabled case is recorded there) |
| The mirror-lorebook delete prompt names the deleted chat by its raw chat id, not in player words. | expectation | `src/runtime/mirrorReaperHost.ts:17` | T4-3 |

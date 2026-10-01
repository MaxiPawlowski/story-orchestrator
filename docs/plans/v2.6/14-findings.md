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

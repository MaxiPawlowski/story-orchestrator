# Findings draft: T3-2

Session `test/sessions/T3/T3-2-1`. Draft rows for `docs/plans/v2.6/14-findings.md`; severity and class are decided in the review.

## Counts

- flags: 0
- stall: 0
- extraction-rejected: 1
- empty-private-block: 0
- lore-force-lost: 0
- lore-constant-missed: 0
- judge-fallback: 2
- save-lost: 0
- unexpected-jump: 0
- rollback: 0
- console-error: 0
- model-call-failure: 0
- model-defect: 0
- harness-error: 0

## Judge health

- calls: 202 (answered 200, busy 0, timeout 2, other fallbacks 0)
- busy rate: 0.0%
- a busy fallback was never sent: the lane's judge rate limit (or a TypeSafe 429 passed through) held it, and the consumer took its no-judge path

## Model defects

None detected.

## Flags

None.

## Anomalies

### extraction-rejected (1)

- 2026-10-02T03:00:54.998Z 1 extraction line(s) rejected: FACT importance=2 text="Unira says her family does not want her, trailing off before finishing the thought." evidence="My family doesn't..." *She trails off, jaw tightening as she suppresses the thought.* (unrecognized line) (`journal.jsonl:1188`)

### judge-fallback (2)

- 2026-10-02T02:55:26.594Z judge scene fell back (timeout) (`journal.jsonl:917`)
- 2026-10-02T02:55:29.087Z judge typed fell back (timeout) (`journal.jsonl:918`)

## Draft register rows

| id | tier | severity | class | evidence | status | fix commit | eval | what |
|---|---|---|---|---|---|---|---|---|
| T3-?1 | T3 |  |  | `test/sessions/T3/T3-2-1/journal.jsonl:917` | draft |  |  | judge scene fell back (timeout) |
| T3-?2 | T3 |  |  | `test/sessions/T3/T3-2-1/journal.jsonl:918` | draft |  |  | judge typed fell back (timeout) |
| T3-?3 | T3 |  |  | `test/sessions/T3/T3-2-1/journal.jsonl:1188` | draft |  |  | 1 extraction line(s) rejected: FACT importance=2 text="Unira says her family does not want her, trailing off before finishing the thought." evidence="My family doesn't..." *She trails off, jaw tightening as she suppresses the thought.* (unrecognized line) |

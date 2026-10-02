# Findings draft: T4-3

Session `test/sessions/T4/T4-3-2`. Draft rows for `docs/plans/v2.6/14-findings.md`; severity and class are decided in the review.

## Counts

- flags: 0
- stall: 1
- extraction-rejected: 0
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

### By chat

- `2026-10-02@04h59m58s914ms`: judge-fallback 1, stall 1
- `2026-10-02@05h00m18s777ms`: judge-fallback 1

## Judge health

- calls: 301 (answered 299, busy 0, timeout 2, other fallbacks 0)
- busy rate: 0.0%
- a busy fallback was never sent: the lane's judge rate limit (or a TypeSafe 429 passed through) held it, and the consumer took its no-judge path

## Model defects

None detected.

## Flags

None.

## Anomalies

### stall (1)

- 2026-10-02T08:09:55.502Z 10 boundaries without a transition at aegis-homecoming while its exits were pending (`journal.jsonl:336`)

### judge-fallback (2)

- 2026-10-02T08:08:32.278Z judge scene fell back (timeout) (x2, last 2026-10-02T08:19:46.356Z) (`journal.jsonl:295`, `journal.jsonl:642`)

## Draft register rows

| id | tier | severity | class | evidence | status | fix commit | eval | what |
|---|---|---|---|---|---|---|---|---|
| T4-?1 | T4 |  |  | `test/sessions/T4/T4-3-2/journal.jsonl:295` | draft |  |  | judge scene fell back (timeout) (x2; every row in findings.json) |
| T4-?2 | T4 |  |  | `test/sessions/T4/T4-3-2/journal.jsonl:336` | draft |  |  | 10 boundaries without a transition at aegis-homecoming while its exits were pending |

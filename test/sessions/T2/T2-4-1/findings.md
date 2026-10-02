# Findings draft: T2-4

Session `test/sessions/T2/T2-4-1`. Draft rows for `docs/plans/v2.6/14-findings.md`; severity and class are decided in the review.

## Continued at the lane's pin

- T2-4 continued T1-1's chat `2026-10-01@11h05m47s358ms` on a lane seeded from `59e8821bfba348a4d3621d903e635073aa1b787b`; the story index was `884380b627f3a36fd09ab81b0fe8f8c75e03268e`. The lane inventory matched its seed record `report-2026-10-01T14-05-00-251Z.json`, so the story data played is the lane's pin, not the index.

## Counts

- flags: 0
- stall: 1
- extraction-rejected: 1
- empty-private-block: 0
- lore-force-lost: 0
- lore-constant-missed: 0
- judge-fallback: 13
- save-lost: 0
- unexpected-jump: 0
- rollback: 0
- console-error: 1
- model-call-failure: 0
- model-defect: 0
- harness-error: 0

### By chat

- `2026-10-01@11h05m47s358ms`: stall 1, judge-fallback 13, extraction-rejected 1
- `(no chat)`: console-error 1

## Judge health

- calls: 266 (answered 253, busy 9, timeout 4, other fallbacks 0)
- busy rate: 3.4% (by use: memoryPairs 4, lore 4, director 1)
- a busy fallback was never sent: the lane's judge rate limit (or a TypeSafe 429 passed through) held it, and the consumer took its no-judge path

## Model defects

None detected.

## Flags

None.

## Anomalies

### stall (1)

- 2026-10-01T22:27:19.547Z 10 boundaries without a transition at into-needlehaven while its exits were pending (`journal.jsonl:994`)

### extraction-rejected (1)

- 2026-10-01T22:33:09.725Z 1 extraction line(s) rejected: DELTA q=tension_current value="critical" evidence="It lets fly an arrow, and it hits the alabaster figure in the chest." (evidence not in window) (`journal.jsonl:1267`)

### judge-fallback (13)

- 2026-10-01T22:27:23.108Z judge scene fell back (timeout) (`journal.jsonl:998`)
- 2026-10-01T22:27:24.693Z judge warden fell back (timeout) (`journal.jsonl:999`)
- 2026-10-01T22:27:36.979Z judge memoryVerify fell back (timeout) (`journal.jsonl:1005`)
- 2026-10-01T22:29:19.370Z judge memoryPairs fell back (busy) (`journal.jsonl:1109`)
- 2026-10-01T22:29:19.370Z judge memoryPairs fell back (busy) (`journal.jsonl:1110`)
- 2026-10-01T22:29:19.370Z judge memoryPairs fell back (busy) (`journal.jsonl:1111`)
- 2026-10-01T22:29:19.370Z judge memoryPairs fell back (busy) (`journal.jsonl:1112`)
- 2026-10-01T22:29:34.431Z judge lore fell back (busy) (`journal.jsonl:1129`)
- 2026-10-01T22:29:34.431Z judge lore fell back (busy) (`journal.jsonl:1130`)
- 2026-10-01T22:29:34.431Z judge lore fell back (busy) (`journal.jsonl:1131`)
- 2026-10-01T22:29:34.431Z judge lore fell back (busy) (`journal.jsonl:1132`)
- 2026-10-01T22:29:34.443Z judge director fell back (busy) (`journal.jsonl:1133`)
- 2026-10-01T22:31:36.547Z judge director fell back (timeout) (`journal.jsonl:1221`)

### console-error (1)

- 2026-10-01T22:29:19.369Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:31`)

## Draft register rows

| id | tier | severity | class | evidence | status | fix commit | eval | what |
|---|---|---|---|---|---|---|---|---|
| T2-?1 | T2 |  |  | `test/sessions/T2/T2-4-1/journal.jsonl:994` | draft |  |  | 10 boundaries without a transition at into-needlehaven while its exits were pending |
| T2-?2 | T2 |  |  | `test/sessions/T2/T2-4-1/journal.jsonl:998` | draft |  |  | judge scene fell back (timeout) |
| T2-?3 | T2 |  |  | `test/sessions/T2/T2-4-1/journal.jsonl:999` | draft |  |  | judge warden fell back (timeout) |
| T2-?4 | T2 |  |  | `test/sessions/T2/T2-4-1/journal.jsonl:1005` | draft |  |  | judge memoryVerify fell back (timeout) |
| T2-?5 | T2 |  |  | `test/sessions/T2/T2-4-1/console.jsonl:31` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T2-?6 | T2 |  |  | `test/sessions/T2/T2-4-1/journal.jsonl:1109` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?7 | T2 |  |  | `test/sessions/T2/T2-4-1/journal.jsonl:1110` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?8 | T2 |  |  | `test/sessions/T2/T2-4-1/journal.jsonl:1111` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?9 | T2 |  |  | `test/sessions/T2/T2-4-1/journal.jsonl:1112` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?10 | T2 |  |  | `test/sessions/T2/T2-4-1/journal.jsonl:1129` | draft |  |  | judge lore fell back (busy) |
| T2-?11 | T2 |  |  | `test/sessions/T2/T2-4-1/journal.jsonl:1130` | draft |  |  | judge lore fell back (busy) |
| T2-?12 | T2 |  |  | `test/sessions/T2/T2-4-1/journal.jsonl:1131` | draft |  |  | judge lore fell back (busy) |
| T2-?13 | T2 |  |  | `test/sessions/T2/T2-4-1/journal.jsonl:1132` | draft |  |  | judge lore fell back (busy) |
| T2-?14 | T2 |  |  | `test/sessions/T2/T2-4-1/journal.jsonl:1133` | draft |  |  | judge director fell back (busy) |
| T2-?15 | T2 |  |  | `test/sessions/T2/T2-4-1/journal.jsonl:1221` | draft |  |  | judge director fell back (timeout) |
| T2-?16 | T2 |  |  | `test/sessions/T2/T2-4-1/journal.jsonl:1267` | draft |  |  | 1 extraction line(s) rejected: DELTA q=tension_current value="critical" evidence="It lets fly an arrow, and it hits the alabaster figure in the chest." (evidence not in window) |

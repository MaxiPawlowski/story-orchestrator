# Findings draft: T5-3

Session `test/sessions/T5/T5-3-1`. Draft rows for `docs/plans/v2.6/14-findings.md`; severity and class are decided in the review.

## Counts

- flags: 0
- stall: 0
- extraction-rejected: 0
- empty-private-block: 0
- lore-force-lost: 0
- lore-constant-missed: 0
- judge-fallback: 22
- save-lost: 3
- unexpected-jump: 0
- rollback: 0
- console-error: 1
- model-call-failure: 0
- model-defect: 0
- harness-error: 0

### By chat

- `2026-10-02@07h56m33s541ms`: judge-fallback 22, save-lost 3
- `(no chat)`: console-error 1

## Judge health

- calls: 94 (answered 72, busy 16, timeout 6, other fallbacks 0)
- busy rate: 17.0% (by use: memoryPairs 16)
- a busy fallback was never sent: the lane's judge rate limit (or a TypeSafe 429 passed through) held it, and the consumer took its no-judge path

## Model defects

None detected.

## Flags

None.

## Anomalies

### judge-fallback (22)

- 2026-10-02T12:04:59.390Z judge scene fell back (timeout) (x2, last 2026-10-02T12:13:09.637Z) (`journal.jsonl:582`, `journal.jsonl:609`)
- 2026-10-02T12:05:01.643Z judge wardenLore fell back (timeout) (x2, last 2026-10-02T12:13:13.637Z) (`journal.jsonl:583`, `journal.jsonl:611`)
- 2026-10-02T12:12:15.291Z judge lore fell back (timeout) (`journal.jsonl:606`)
- 2026-10-02T12:13:11.127Z judge warden fell back (timeout) (`journal.jsonl:610`)
- 2026-10-02T12:15:01.330Z judge memoryPairs fell back (busy) (x16, last 2026-10-02T12:15:01.512Z) (`journal.jsonl:678`, `journal.jsonl:679`, `journal.jsonl:680`, `journal.jsonl:682`, `journal.jsonl:683`, and 11 more)

### save-lost (3)

- 2026-10-02T12:13:14.565Z save not confirmed (x3, last 2026-10-02T12:13:14.816Z) (`journal.jsonl:612`, `journal.jsonl:613`, `journal.jsonl:614`)

### console-error (1)

- 2026-10-02T12:15:01.330Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:29`)

## Draft register rows

| id | tier | severity | class | evidence | status | fix commit | eval | what |
|---|---|---|---|---|---|---|---|---|
| T5-?1 | T5 |  |  | `test/sessions/T5/T5-3-1/journal.jsonl:582` | draft |  |  | judge scene fell back (timeout) (x2; every row in findings.json) |
| T5-?2 | T5 |  |  | `test/sessions/T5/T5-3-1/journal.jsonl:583` | draft |  |  | judge wardenLore fell back (timeout) (x2; every row in findings.json) |
| T5-?3 | T5 |  |  | `test/sessions/T5/T5-3-1/journal.jsonl:606` | draft |  |  | judge lore fell back (timeout) |
| T5-?5 | T5 |  |  | `test/sessions/T5/T5-3-1/journal.jsonl:610` | draft |  |  | judge warden fell back (timeout) |
| T5-?7 | T5 |  |  | `test/sessions/T5/T5-3-1/journal.jsonl:612` | draft |  |  | save not confirmed (x3; every row in findings.json) |
| T5-?10 | T5 |  |  | `test/sessions/T5/T5-3-1/journal.jsonl:678` | draft |  |  | judge memoryPairs fell back (busy) (x16; every row in findings.json) |
| T5-?13 | T5 |  |  | `test/sessions/T5/T5-3-1/console.jsonl:29` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |

## Operator findings (Claude, autonomous run)

VALID. Played 2026-10-02 11:56-12:15Z on lane 3, continuing the T5-1 chat `2026-10-02@07h56m33s541ms` (lease), served dev bundle `b644cbb7ad01`, media off, author mode. Studio opened from the drawer's "Edit story" (played copy). Four saves, all hot-swapped into the running chat: v2 flight guidance, v3 gate flight->redline `ink_awareness >= 5` -> `>= 4`, v4 background `cityscape medieval night.jpg` on redline, v5 start `cast_changes.disable` re-picked by name. Provocation: an invalid save (flight->redline retargeted to first_house) was refused, then undone. 3 player turns. Header diff clean with the declared `inventory.v2Stories:~the-redline-kingdom`.

Findings:
- HIGH (product, carried from T5-1): the cast-changes editor renders the wizard's id-valued disable list as "3 selected" with no box ticked (`shots/007-start-cast-changes-editor.png`): the author cannot see the three members, and no diagnostic says the values match no member. Clear + tick by name fixed it (`shots/008`).
- MEDIUM (product): the gate replay panel says "Never held in the last 0 boundaries" for every transition of a chat at boundary 44, including start->first_house which fired at b6 (`shots/003-gate-edit-before-save.png`). The "will my new threshold fire" aid shows nothing on an adopted chat.
- MEDIUM (product): blocking schema errors have no consequence line and no names: "intermediate checkpoint has no reachable anchor beyond it" + `checkpoints.1` (`shots/011`), while the warnings beside them lead with the consequence. The plan 09 rule covers diagnostic codes, not schema errors.
- LOW: journal calls the guidance, background and cast edits "identical" (`journal.jsonl:528`, `:596`, `:597`); only the gate edit is "compatible". "identical" reads as "nothing changed" to an author.
- LOW: after Save the Checkpoints editor reselects the start checkpoint; the toolbar feedback is truncated ("Applied to this chat: this chat…"); after Undo back to valid the stale "2 validation error(s) block save" line stays. Unticking "Start checkpoint" is silently valid (first checkpoint becomes start). The cast editor offers the player roster entry ("The Apprentice").
- LOW: 3 "save not confirmed (no save request went out)" rows during a 4-member group round (`journal.jsonl:612-614`); nothing was lost on reread.
- Must-not: no save claimed success while the chat played the old version (pinned copy checked after each save); no edit lost on a tab switch; no JSON touched.
- Judge: 16 memoryPairs busy fallbacks in one burst at 12:15:01 (lane limit 45/min, a 429 in console), 6 timeouts.

Thinking (msgs 66-76, 9 replies): reasoning parsed on 9, 0 empty reasoning, 1 empty content (msg 70 Lady Corvane, 3022 chars of reasoning), 0 damaged starts, 0 repeated names.
Calls: DeepSeek 20 (96k in / 12k out, 20 primary, 0 fallback), judge 70 (2 cached, 22 fallbacks), main RP 9. Pod window 11:56-12:15Z.

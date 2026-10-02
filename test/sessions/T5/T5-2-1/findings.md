# Findings draft: T5-2

Session `test/sessions/T5/T5-2-1`. Draft rows for `docs/plans/v2.6/14-findings.md`; severity and class are decided in the review.

## INVALID SESSION

- stop marked the session INVALID: the run header diff failed (exit 1): the install changed in a way the session did not declare

The counts below cover only what was captured.

## Counts

- flags: 1
- stall: 0
- extraction-rejected: 0
- empty-private-block: 0
- lore-force-lost: 0
- lore-constant-missed: 0
- judge-fallback: 3
- save-lost: 0
- unexpected-jump: 0
- rollback: 0
- console-error: 0
- model-call-failure: 0
- model-defect: 0
- harness-error: 0

### By chat

- `2026-10-02@05h10m03s963ms`: judge-fallback 1
- `2026-10-02@05h20m15s843ms`: judge-fallback 2

## Judge health

- calls: 44 (answered 41, busy 0, timeout 3, other fallbacks 0)
- busy rate: 0.0%
- a busy fallback was never sent: the lane's judge rate limit (or a TypeSafe 429 passed through) held it, and the consumer took its no-judge path

## Model defects

None detected.

## Flags

### 2026-10-02T08:24:49.441Z (message -1)

- note: Pawnbroker story selected in the group the wizard created: requirements NOT ready, missingMembers clerk/collector/queen/thief - the agent's setRequirements wrote roster ids instead of character names (overwriting the card follow-ups), Diagnostics never warned, Repair says the story expects people not in this chat although all 4 cards are in the group
- evidence: `journal.jsonl:200`
- context (event-time):
  - #0 Ivet Marrow: Ivet sets the sealed writ on the counter and keeps her hand flat on it, as if it might otherwise crawl away. "Guild seal, crown paper, and a debt record that doesn't balance," she says. "Twenty years, pawned out of the palace itself. Whoever wrote this ticket knew exactly what they were doing." She 
  - #1 Osric Vane: The vault door is already open when you arrive, which is Osric's way of saying he knew you were coming. He stands among the shelves of sealed phials, one of them held up to the lamplight, turning it slowly.  "The queen's fourth winter," he says, without turning around. "Snow on the palace roof. A do
  - #2 Queen Alaric Vess: The queen does not rise when you are shown in. She sits at a table laid with two cups and no wine, and a single sealed writ — your writ, returned to her hand.  "You are the pawnbroker," she says. "Then you know what I am missing better than I do. Twenty years. I have the dates, the tutors' names, th
  - #3 Sera Vantel: The door opens only as far as the chain allows. A woman's face appears in the gap — calm, tired, unsurprised. "You found the ticket," Sera says. "I wondered how long it would take. Come in, then. But I'll ask you one thing first, and I'll know if you lie: who sent you — the crown, or the Guild?"

## Anomalies

### judge-fallback (3)

- 2026-10-02T08:29:33.613Z judge wardenLore fell back (timeout) (x2, last 2026-10-02T08:33:21.334Z) (`journal.jsonl:230`, `journal.jsonl:314`)
- 2026-10-02T08:33:21.334Z judge warden fell back (timeout) (`journal.jsonl:313`)

## Draft register rows

| id | tier | severity | class | evidence | status | fix commit | eval | what |
|---|---|---|---|---|---|---|---|---|
| T5-?1 | T5 |  |  | `test/sessions/T5/T5-2-1/journal.jsonl:200` | draft |  |  | Pawnbroker story selected in the group the wizard created: requirements NOT ready, missingMembers clerk/collector/queen/thief - the agent's setRequirements wrote roster ids instead of character names (overwriting the card follow-ups), Diagnostics never warned, Repair says the story expects people not in this chat although all 4 cards are in the group |
| T5-?2 | T5 |  |  | `test/sessions/T5/T5-2-1/journal.jsonl:230` | draft |  |  | judge wardenLore fell back (timeout) (x2; every row in findings.json) |
| T5-?3 | T5 |  |  | `test/sessions/T5/T5-2-1/journal.jsonl:313` | draft |  |  | judge warden fell back (timeout) |

# Findings draft: T3-6

Session `test/sessions/T3/T3-6-1`. Draft rows for `docs/plans/v2.6/14-findings.md`; severity and class are decided in the review.

## Counts

- flags: 1
- stall: 0
- extraction-rejected: 0
- empty-private-block: 0
- lore-force-lost: 0
- lore-constant-missed: 0
- judge-fallback: 0
- save-lost: 0
- unexpected-jump: 0
- rollback: 0
- console-error: 0
- model-call-failure: 0
- model-defect: 0
- harness-error: 0

## Judge health

- calls: 78 (answered 78, busy 0, timeout 0, other fallbacks 0)
- busy rate: 0.0%
- a busy fallback was never sent: the lane's judge rate limit (or a TypeSafe 429 passed through) held it, and the consumer took its no-judge path

## Model defects

None detected.

## Flags

### 2026-10-02T03:04:52.833Z (message 6)

- note: At 390x844 with the Extensions drawer (our settings panel) open, the panel content covers #send_but (elementFromPoint at the send button = our settings inline-drawer-content). The turn verb typed the line but the send never landed (turns.jsonl seq 14 'the line did not land'). Closing the drawer restores it. ST drawer layout, but our panel is what sits on the button.
- evidence: `journal.jsonl:175`
- context (event-time):
  - #3 Max Nightriver: We take Wendhope as the Short Straws. Belle, Dalan, you're with me. Ellie, write us in.
  - #4 Ellie: Ellie's eyes widen slightly as she hears the names and she straightens her spine, pen moving across the page with practiced grace. "The Short Straws," she murmurs, writing carefully in a neat, elegant hand. "A bold choice of name for such a new party." *The pen scratches across the parchment as she 
  - #5 Belle: Belle doesn't wait for formalities. She pushes off from the arch and strides over, her boots thudding against the floorboards. "Short Straws, huh?" Her brown eyes flick over Max Nightriver with a sharp, calculating look — size of the shoulders, steadiness of the hands, the way they carry themselves.
  - **#6 Dalan: Dalan steps forward from the quest board, his boots barely making a sound on the floor. He's close enough that his blonde side braid catches the light, his green eyes scanning Max Nightriver with quiet curiosity before they shift to the quest paper in Belle's hand. "Wendhope," he murmurs, his voice **

## Anomalies

None.

## Draft register rows

| id | tier | severity | class | evidence | status | fix commit | eval | what |
|---|---|---|---|---|---|---|---|---|
| T3-?1 | T3 |  |  | `test/sessions/T3/T3-6-1/journal.jsonl:175` | draft |  |  | At 390x844 with the Extensions drawer (our settings panel) open, the panel content covers #send_but (elementFromPoint at the send button = our settings inline-drawer-content). The turn verb typed the line but the send never landed (turns.jsonl seq 14 'the line did not land'). Closing the drawer restores it. ST drawer layout, but our panel is what sits on the button. |

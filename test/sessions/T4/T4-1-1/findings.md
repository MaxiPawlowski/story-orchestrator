# Findings draft: T4-1

Session `test/sessions/T4/T4-1-1`. Draft rows for `docs/plans/v2.6/14-findings.md`; severity and class are decided in the review.

## Counts

- flags: 3
- stall: 0
- extraction-rejected: 3
- empty-private-block: 3
- lore-force-lost: 0
- lore-constant-missed: 0
- judge-fallback: 29
- save-lost: 4
- unexpected-jump: 0
- rollback: 7
- console-error: 1
- model-call-failure: 1
- model-defect: 0
- harness-error: 1

### By chat

- `(no chat)`: harness-error 1, console-error 1
- `2026-10-02@01h58m49s630ms`: model-call-failure 1, rollback 7, empty-private-block 3, extraction-rejected 3, judge-fallback 29, save-lost 4

## Judge health

- calls: 449 (answered 420, busy 24, timeout 5, other fallbacks 0)
- busy rate: 5.3% (by use: memoryPairs 24)
- a busy fallback was never sent: the lane's judge rate limit (or a TypeSafe 429 passed through) held it, and the consumer took its no-judge path

## Model defects

None detected.

## Flags

### 2026-10-02T05:31:57.636Z (message 4)

- note: After mutations, curator proposals from rolled-back replies stay pending: wi-3-2 (original msg 2, swiped away; journal 'eventless change at message 2') and wi-7-7 (msg 7, boundary 7, rolled back to boundary 5 by the edit of msg 5). Neither withdrawn.
- evidence: `journal.jsonl:450`
- context (event-time):
  - #3 Max Nightriver: I push the study door open. "Father. You sent for me, so here I am."
  - **#4 Adolion Narrator: Lord Javon doesn't look up from the desk immediately. His hands are steepled, pale fingers motionless against the dark wood. Beside him, Duchess Eriana remains perfectly still by the window, her expression as flat as a painting. The smell of old paper and beeswax hangs thick in the room. "I did," Ja**
  - #5 Javon: "Arrangements," Javon repeats, his gaze never leaving yours. "Your sister is betrothed to House Bertoanal. Welden will serve the Crown. And you will stand for this House in the lists."
  - #6 Max Nightriver: I keep my own counsel.
  - #7 Javon: "Then you will be the first Nightriver to swear on a grave and break his oath in the same breath." Javon does not move. He does not rise. He simply stares, and for a moment it feels as though the very air in the study has grown cold. "I did not ask for your opinion on the matter. I stated a fact." *

### 2026-10-02T05:38:37.765Z (message 16)

- note: MUST-NOT: Natalia (msg 16) says the true heirs each carry a seal in their blood that keeps the Witch King dormant, at Father's Summons, before the crypt ('Who knows what').
- evidence: `journal.jsonl:694`
- context (event-time):
  - #13 Max Nightriver: I step inside and shut the door behind me. "Nat. Tell me what Father and the Duchess mean by 'the seals'."
  - #14 Natalia: Natalia pauses with her hand on the door, and for a long moment she simply stares at it. Then she lets it close—not with a slam, but with a quiet click, and the sound of frost immediately crawling up the latch, sealing it shut. "That's a very large question," she says quietly, turning back to face M
  - #15 Max Nightriver: "Deal." I sit across from her. "The parchment is General Leevon's claim to Trial by Combat. Father wants me to fight it. Your turn, Nat. The seals."
  - **#16 Natalia: "Trial by Combat," Natalia repeats slowly, her expression unchanging. She looks down at her hands, where thin veins of frost creep across her pale skin before she clenches them into fists, forcing the chill back. "And there you have it. Father doesn't just want you to serve the house. He wants you t**

### 2026-10-02T05:47:10.405Z (message 16)

- note: Deleted msg 18 (Javon) while curator proposal wi-11-18 (patch Chronicle - House Nightriver, from msg 18) was pending: story stepped back to Father's Summons correctly, but the proposal stays pending, not withdrawn.
- evidence: `journal.jsonl:906`
- context (event-time):
  - #13 Max Nightriver: I step inside and shut the door behind me. "Nat. Tell me what Father and the Duchess mean by 'the seals'."
  - #14 Natalia: Natalia pauses with her hand on the door, and for a long moment she simply stares at it. Then she lets it close—not with a slam, but with a quiet click, and the sound of frost immediately crawling up the latch, sealing it shut. "That's a very large question," she says quietly, turning back to face M
  - #15 Max Nightriver: "Deal." I sit across from her. "The parchment is General Leevon's claim to Trial by Combat. Father wants me to fight it. Your turn, Nat. The seals."
  - **#16 Natalia: Natalia's expression doesn't change, but the frost creeping across the arms of her chair thickens. She remains perfectly still for a heartbeat, then speaks in a voice so quiet it barely carries across the small space between them. "You'll fight a traitor in the lists." The words are flat, devoid of **
  - #17 Max Nightriver: I go back down to Father's study. "Fine. I'll stand as the Crown's second against General Leevon. Tell the court."
  - #18 Max Nightriver: I nod once and leave him to his watch. In the corridor I keep my ears open for whatever the servants are whispering about the duel.
  - #19 Adolion Narrator: The corridor is dimly lit by wall sconces, their flames flickering in the drafts. The sound of a heavy door closing echoes from somewhere below stairs. Two maids hurry past in silence, their heads bent and shoulders tense, too hurried to notice Max Nightriver. A soft voice catches from an alcove up 

## Anomalies

### extraction-rejected (3)

- 2026-10-02T05:25:37.986Z 1 extraction line(s) rejected: DELTA q=location value="javon_study" evidence="I push the study door open. \"Father. You sent for me, so here I am.\"" (evidence only in the player's line) (`journal.jsonl:309`)
- 2026-10-02T05:30:33.097Z 1 extraction line(s) rejected: DELTA q=location value="javon_study" evidence="I push the study door open. \"Father. You sent for me, so here I am.\"" (evidence only in the player's line) (`journal.jsonl:434`)
- 2026-10-02T05:38:24.441Z 1 extraction line(s) rejected: DELTA q=location value="javon_study" evidence="I knock on Natalia's door." (evidence only in the player's line) (`journal.jsonl:693`)

### empty-private-block (3)

- 2026-10-02T05:24:49.894Z Javon was drafted in 2026-10-02@01h58m49s630ms at boundary 5 with no private block while holding 1 private entry acquired before it (`payloads.jsonl:64`)
- 2026-10-02T06:00:27.522Z Merryn was drafted in 2026-10-02@01h58m49s630ms at boundary 23 with no private block while holding 8 private entries acquired before it (`payloads.jsonl:394`)
- 2026-10-02T06:01:31.199Z Merryn was drafted in 2026-10-02@01h58m49s630ms at boundary 24 with no private block while holding 9 private entries acquired before it (`payloads.jsonl:413`)

### judge-fallback (29)

- 2026-10-02T05:39:57.174Z judge scene fell back (timeout) (`journal.jsonl:706`)
- 2026-10-02T05:55:53.581Z judge scene fell back (timeout) (`journal.jsonl:1225`)
- 2026-10-02T05:55:56.091Z judge typed fell back (timeout) (`journal.jsonl:1226`)
- 2026-10-02T05:55:57.589Z judge warden fell back (timeout) (`journal.jsonl:1227`)
- 2026-10-02T05:57:47.393Z judge memoryPairs fell back (busy) (`journal.jsonl:1278`)
- 2026-10-02T05:57:47.393Z judge memoryPairs fell back (busy) (`journal.jsonl:1279`)
- 2026-10-02T05:57:47.393Z judge memoryPairs fell back (busy) (`journal.jsonl:1280`)
- 2026-10-02T05:57:47.393Z judge memoryPairs fell back (busy) (`journal.jsonl:1281`)
- 2026-10-02T05:57:47.402Z judge memoryPairs fell back (busy) (`journal.jsonl:1283`)
- 2026-10-02T05:57:47.402Z judge memoryPairs fell back (busy) (`journal.jsonl:1284`)
- 2026-10-02T05:57:47.402Z judge memoryPairs fell back (busy) (`journal.jsonl:1285`)
- 2026-10-02T05:57:47.402Z judge memoryPairs fell back (busy) (`journal.jsonl:1286`)
- 2026-10-02T05:57:47.402Z judge memoryPairs fell back (busy) (`journal.jsonl:1287`)
- 2026-10-02T05:57:47.402Z judge memoryPairs fell back (busy) (`journal.jsonl:1288`)
- 2026-10-02T05:57:47.402Z judge memoryPairs fell back (busy) (`journal.jsonl:1289`)
- 2026-10-02T05:57:47.402Z judge memoryPairs fell back (busy) (`journal.jsonl:1290`)
- 2026-10-02T05:57:47.403Z judge memoryPairs fell back (busy) (`journal.jsonl:1291`)
- 2026-10-02T05:57:47.403Z judge memoryPairs fell back (busy) (`journal.jsonl:1292`)
- 2026-10-02T05:57:47.403Z judge memoryPairs fell back (busy) (`journal.jsonl:1293`)
- 2026-10-02T05:57:47.403Z judge memoryPairs fell back (busy) (`journal.jsonl:1294`)
- 2026-10-02T05:57:47.403Z judge memoryPairs fell back (busy) (`journal.jsonl:1295`)
- 2026-10-02T05:57:47.403Z judge memoryPairs fell back (busy) (`journal.jsonl:1296`)
- 2026-10-02T05:57:47.403Z judge memoryPairs fell back (busy) (`journal.jsonl:1297`)
- 2026-10-02T05:57:47.403Z judge memoryPairs fell back (busy) (`journal.jsonl:1298`)
- 2026-10-02T05:57:47.404Z judge memoryPairs fell back (busy) (`journal.jsonl:1299`)
- 2026-10-02T05:57:47.404Z judge memoryPairs fell back (busy) (`journal.jsonl:1300`)
- 2026-10-02T05:57:47.404Z judge memoryPairs fell back (busy) (`journal.jsonl:1301`)
- 2026-10-02T05:57:47.404Z judge memoryPairs fell back (busy) (`journal.jsonl:1302`)
- 2026-10-02T06:00:10.335Z judge lore fell back (timeout) (`journal.jsonl:1359`)

### save-lost (4)

- 2026-10-02T05:55:58.666Z save not confirmed (`journal.jsonl:1228`)
- 2026-10-02T05:55:58.728Z save not confirmed (`journal.jsonl:1229`)
- 2026-10-02T05:55:58.791Z save not confirmed (`journal.jsonl:1230`)
- 2026-10-02T05:55:58.869Z save not confirmed (`journal.jsonl:1231`)

### rollback (7)

- 2026-10-02T05:23:22.093Z boundary went back from 5 to 4 (`journal.jsonl:208`)
- 2026-10-02T05:33:17.957Z boundary went back from 9 to 6 (`journal.jsonl:475`)
- 2026-10-02T05:34:48.905Z boundary went back from 9 to 7 (`journal.jsonl:524`)
- 2026-10-02T05:36:37.893Z boundary went back from 9 to 8 (`journal.jsonl:635`)
- 2026-10-02T05:48:14.449Z boundary went back from 14 to 11 (`journal.jsonl:923`)
- 2026-10-02T05:49:34.992Z boundary went back from 14 to 12 (`journal.jsonl:972`)
- 2026-10-02T05:50:12.301Z boundary went back from 14 to 13 (`journal.jsonl:1017`)

### console-error (1)

- 2026-10-02T05:57:47.393Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:438`)

### model-call-failure (1)

- 2026-10-02T05:21:53.649Z epistemic via 975bc0dc-956b-4cd8-9fe4-9be158e01847: lapsed (`journal.jsonl:180`)

### harness-error (1)

- - WARNING: the page restarted 2 time(s); captures between the last drain and each restart are UNKNOWN, not zero. (`payloads.log:227`)

## Draft register rows

| id | tier | severity | class | evidence | status | fix commit | eval | what |
|---|---|---|---|---|---|---|---|---|
| T4-?1 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:450` | draft |  |  | After mutations, curator proposals from rolled-back replies stay pending: wi-3-2 (original msg 2, swiped away; journal 'eventless change at message 2') and wi-7-7 (msg 7, boundary 7, rolled back to boundary 5 by the edit of msg 5). Neither withdrawn. |
| T4-?2 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:694` | draft |  |  | MUST-NOT: Natalia (msg 16) says the true heirs each carry a seal in their blood that keeps the Witch King dormant, at Father's Summons, before the crypt ('Who knows what'). |
| T4-?3 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:906` | draft |  |  | Deleted msg 18 (Javon) while curator proposal wi-11-18 (patch Chronicle - House Nightriver, from msg 18) was pending: story stepped back to Father's Summons correctly, but the proposal stays pending, not withdrawn. |
| T4-?4 | T4 |  | harness | `test/sessions/T4/T4-1-1/payloads.log:227` | draft |  |  | WARNING: the page restarted 2 time(s); captures between the last drain and each restart are UNKNOWN, not zero. |
| T4-?5 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:180` | draft |  |  | epistemic via 975bc0dc-956b-4cd8-9fe4-9be158e01847: lapsed |
| T4-?6 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:208` | draft |  |  | boundary went back from 5 to 4 |
| T4-?7 | T4 |  |  | `test/sessions/T4/T4-1-1/payloads.jsonl:64` | draft |  |  | Javon was drafted in 2026-10-02@01h58m49s630ms at boundary 5 with no private block while holding 1 private entry acquired before it |
| T4-?8 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:309` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="javon_study" evidence="I push the study door open. \"Father. You sent for me, so here I am.\"" (evidence only in the player's line) |
| T4-?9 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:434` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="javon_study" evidence="I push the study door open. \"Father. You sent for me, so here I am.\"" (evidence only in the player's line) |
| T4-?10 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:475` | draft |  |  | boundary went back from 9 to 6 |
| T4-?11 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:524` | draft |  |  | boundary went back from 9 to 7 |
| T4-?12 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:635` | draft |  |  | boundary went back from 9 to 8 |
| T4-?13 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:693` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="javon_study" evidence="I knock on Natalia's door." (evidence only in the player's line) |
| T4-?14 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:706` | draft |  |  | judge scene fell back (timeout) |
| T4-?15 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:923` | draft |  |  | boundary went back from 14 to 11 |
| T4-?16 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:972` | draft |  |  | boundary went back from 14 to 12 |
| T4-?17 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:1017` | draft |  |  | boundary went back from 14 to 13 |
| T4-?18 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:1225` | draft |  |  | judge scene fell back (timeout) |
| T4-?19 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:1226` | draft |  |  | judge typed fell back (timeout) |
| T4-?20 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:1227` | draft |  |  | judge warden fell back (timeout) |
| T4-?21 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:1228` | draft |  |  | save not confirmed |
| T4-?22 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:1229` | draft |  |  | save not confirmed |
| T4-?23 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:1230` | draft |  |  | save not confirmed |
| T4-?24 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:1231` | draft |  |  | save not confirmed |
| T4-?25 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:1278` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?26 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:1279` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?27 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:1280` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?28 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:1281` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?29 | T4 |  |  | `test/sessions/T4/T4-1-1/console.jsonl:438` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T4-?30 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:1283` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?31 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:1284` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?32 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:1285` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?33 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:1286` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?34 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:1287` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?35 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:1288` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?36 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:1289` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?37 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:1290` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?38 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:1291` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?39 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:1292` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?40 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:1293` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?41 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:1294` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?42 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:1295` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?43 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:1296` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?44 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:1297` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?45 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:1298` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?46 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:1299` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?47 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:1300` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?48 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:1301` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?49 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:1302` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?50 | T4 |  |  | `test/sessions/T4/T4-1-1/journal.jsonl:1359` | draft |  |  | judge lore fell back (timeout) |
| T4-?51 | T4 |  |  | `test/sessions/T4/T4-1-1/payloads.jsonl:394` | draft |  |  | Merryn was drafted in 2026-10-02@01h58m49s630ms at boundary 23 with no private block while holding 8 private entries acquired before it |
| T4-?52 | T4 |  |  | `test/sessions/T4/T4-1-1/payloads.jsonl:413` | draft |  |  | Merryn was drafted in 2026-10-02@01h58m49s630ms at boundary 24 with no private block while holding 9 private entries acquired before it |

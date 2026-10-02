# Findings draft: T2-3

Session `test/sessions/T2/T2-3-2`. Draft rows for `docs/plans/v2.6/14-findings.md`; severity and class are decided in the review.

## Counts

- flags: 1
- stall: 0
- extraction-rejected: 5
- empty-private-block: 0
- lore-force-lost: 0
- lore-constant-missed: 0
- judge-fallback: 31
- save-lost: 6
- unexpected-jump: 0
- rollback: 0
- console-error: 1
- model-call-failure: 0
- model-defect: 0
- harness-error: 0

### By chat

- `2026-10-01@16h56m09s049ms`: extraction-rejected 5, judge-fallback 31, save-lost 6
- `(no chat)`: console-error 1

## Judge health

- calls: 163 (answered 132, busy 27, timeout 4, other fallbacks 0)
- busy rate: 16.6% (by use: memoryPairs 27)
- a busy fallback was never sent: the lane's judge rate limit (or a TypeSafe 429 passed through) held it, and the consumer took its no-judge path

## Model defects

None detected.

## Flags

### 2026-10-01T23:44:42.559Z (message 143)

- note: Narrator agreed with a false claim: I said Baroness Serenola is a bearded dwarf (she is a green-skinned, tusked, red-eyed orc baroness in the established story); msg 143 answers 'The description is precise - a stout silhouette with braided beard and heavy armor.' Also this turn folded:null while the previous ones folded 116.
- evidence: `journal.jsonl:1135`
- context (event-time):
  - #140 Adolion Narrator: *Belle's brow knits as she looks at Max, then turns toward the others still lingering in the foyer. Her voice is loud and clear, carrying across the marble floors.* "Every one of 'em? Max, they were all dead in there." *She gestures vaguely toward the direction of the mines, her expression turning d
  - #141 Natalia: *The click of footsteps signals her arrival before she appears at the top of the grand staircase. Natalia descends slowly, her white gown flowing around her as frost curls from the railing beneath her hand. She stops a few steps from the bottom, her emerald eyes fixed on Max with an expression that 
  - #142 Max Nightriver: And the Baroness Serenola is a dwarf, isn't she? Short, bearded, a dwarf of the old houses.
  - **#143 Adolion Narrator: *The description is precise—a stout silhouette with braided beard and heavy armor.***

## Anomalies

### extraction-rejected (5)

- 2026-10-01T23:39:17.522Z 1 extraction line(s) rejected: DELTA q=location value="nightriver_estate" evidence="I go back down to the foyer where Riyo waits by the door." (evidence only in the player's line) (`journal.jsonl:1020`)
- 2026-10-01T23:39:37.468Z 1 extraction line(s) rejected: FACT importance=2 text="Riyo panicked when Max asked about her arms, insisting it is 'just an arm' and that she keeps it covered for travel to keep the sword safe." evidence="It's... just an arm-nya." *The verbal tic slips out again, her voice higher and more strained than usual.* (unrecognized line) (`journal.jsonl:1036`)
- 2026-10-01T23:41:20.403Z 1 extraction line(s) rejected: DELTA q=location value="nightriver_estate" evidence="I go back down to the foyer where Riyo waits by the door." (evidence only in the player's line) (`journal.jsonl:1074`)
- 2026-10-01T23:41:51.996Z 2 extraction line(s) rejected: FACT importance=2 text="Riyo panics when Max asks about her arms, insisting it is just an arm and she keeps it covered for travel, gripping her sword and pulling her cloak tighter over her left side." evidence="It's... just an arm-nya." *The verbal tic slips out again, her voice higher and more strained than usual.* (unrecognized line); DELTA q=location value="nightriver_estate" evidence="*I go back down to the foyer where Riyo waits by the door.*" (evidence only in the player's line) (`journal.jsonl:1090`)
- 2026-10-01T23:42:01.212Z 1 extraction line(s) rejected: DELTA q=location value="nightriver_estate" evidence="*I go back down to the foyer where Riyo waits by the door.*" (evidence only in the player's line) (`journal.jsonl:1096`)

### judge-fallback (31)

- 2026-10-01T23:46:58.781Z judge scene fell back (timeout) (`journal.jsonl:1186`)
- 2026-10-01T23:47:00.299Z judge warden fell back (timeout) (`journal.jsonl:1187`)
- 2026-10-01T23:47:02.782Z judge wardenLore fell back (timeout) (`journal.jsonl:1188`)
- 2026-10-01T23:47:30.518Z judge memoryVerify fell back (timeout) (`journal.jsonl:1210`)
- 2026-10-01T23:48:51.492Z judge memoryPairs fell back (busy) (`journal.jsonl:1258`)
- 2026-10-01T23:48:51.492Z judge memoryPairs fell back (busy) (`journal.jsonl:1259`)
- 2026-10-01T23:48:51.493Z judge memoryPairs fell back (busy) (`journal.jsonl:1260`)
- 2026-10-01T23:48:51.493Z judge memoryPairs fell back (busy) (`journal.jsonl:1261`)
- 2026-10-01T23:48:51.583Z judge memoryPairs fell back (busy) (`journal.jsonl:1263`)
- 2026-10-01T23:48:51.583Z judge memoryPairs fell back (busy) (`journal.jsonl:1264`)
- 2026-10-01T23:48:51.583Z judge memoryPairs fell back (busy) (`journal.jsonl:1265`)
- 2026-10-01T23:48:51.583Z judge memoryPairs fell back (busy) (`journal.jsonl:1266`)
- 2026-10-01T23:48:51.583Z judge memoryPairs fell back (busy) (`journal.jsonl:1267`)
- 2026-10-01T23:48:51.583Z judge memoryPairs fell back (busy) (`journal.jsonl:1268`)
- 2026-10-01T23:48:51.583Z judge memoryPairs fell back (busy) (`journal.jsonl:1269`)
- 2026-10-01T23:48:51.583Z judge memoryPairs fell back (busy) (`journal.jsonl:1270`)
- 2026-10-01T23:48:51.586Z judge memoryPairs fell back (busy) (`journal.jsonl:1271`)
- 2026-10-01T23:48:51.586Z judge memoryPairs fell back (busy) (`journal.jsonl:1272`)
- 2026-10-01T23:48:51.586Z judge memoryPairs fell back (busy) (`journal.jsonl:1273`)
- 2026-10-01T23:48:51.586Z judge memoryPairs fell back (busy) (`journal.jsonl:1274`)
- 2026-10-01T23:48:51.586Z judge memoryPairs fell back (busy) (`journal.jsonl:1275`)
- 2026-10-01T23:48:51.586Z judge memoryPairs fell back (busy) (`journal.jsonl:1276`)
- 2026-10-01T23:48:51.586Z judge memoryPairs fell back (busy) (`journal.jsonl:1277`)
- 2026-10-01T23:48:51.586Z judge memoryPairs fell back (busy) (`journal.jsonl:1278`)
- 2026-10-01T23:48:51.589Z judge memoryPairs fell back (busy) (`journal.jsonl:1279`)
- 2026-10-01T23:48:51.589Z judge memoryPairs fell back (busy) (`journal.jsonl:1280`)
- 2026-10-01T23:48:51.589Z judge memoryPairs fell back (busy) (`journal.jsonl:1281`)
- 2026-10-01T23:48:51.589Z judge memoryPairs fell back (busy) (`journal.jsonl:1282`)
- 2026-10-01T23:48:51.589Z judge memoryPairs fell back (busy) (`journal.jsonl:1283`)
- 2026-10-01T23:48:51.589Z judge memoryPairs fell back (busy) (`journal.jsonl:1284`)
- 2026-10-01T23:48:51.589Z judge memoryPairs fell back (busy) (`journal.jsonl:1285`)

### save-lost (6)

- 2026-10-01T23:47:03.888Z save not confirmed (`journal.jsonl:1189`)
- 2026-10-01T23:47:03.934Z save not confirmed (`journal.jsonl:1190`)
- 2026-10-01T23:47:03.962Z save not confirmed (`journal.jsonl:1191`)
- 2026-10-01T23:47:03.998Z save not confirmed (`journal.jsonl:1192`)
- 2026-10-01T23:47:04.043Z save not confirmed (`journal.jsonl:1193`)
- 2026-10-01T23:47:04.075Z save not confirmed (`journal.jsonl:1194`)

### console-error (1)

- 2026-10-01T23:48:51.492Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:44`)

## Draft register rows

| id | tier | severity | class | evidence | status | fix commit | eval | what |
|---|---|---|---|---|---|---|---|---|
| T2-?1 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1135` | draft |  |  | Narrator agreed with a false claim: I said Baroness Serenola is a bearded dwarf (she is a green-skinned, tusked, red-eyed orc baroness in the established story); msg 143 answers 'The description is precise - a stout silhouette with braided beard and heavy armor.' Also this turn folded:null while the previous ones folded 116. |
| T2-?2 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1020` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="nightriver_estate" evidence="I go back down to the foyer where Riyo waits by the door." (evidence only in the player's line) |
| T2-?3 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1036` | draft |  |  | 1 extraction line(s) rejected: FACT importance=2 text="Riyo panicked when Max asked about her arms, insisting it is 'just an arm' and that she keeps it covered for travel to keep the sword safe." evidence="It's... just an arm-nya." *The verbal tic slips out again, her voice higher and more strained than usual.* (unrecognized line) |
| T2-?4 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1074` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="nightriver_estate" evidence="I go back down to the foyer where Riyo waits by the door." (evidence only in the player's line) |
| T2-?5 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1090` | draft |  |  | 2 extraction line(s) rejected: FACT importance=2 text="Riyo panics when Max asks about her arms, insisting it is just an arm and she keeps it covered for travel, gripping her sword and pulling her cloak tighter over her left side." evidence="It's... just an arm-nya." *The verbal tic slips out again, her voice higher and more strained than usual.* (unrecognized line); DELTA q=location value="nightriver_estate" evidence="*I go back down to the foyer where Riyo waits by the door.*" (evidence only in the player's line) |
| T2-?6 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1096` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="nightriver_estate" evidence="*I go back down to the foyer where Riyo waits by the door.*" (evidence only in the player's line) |
| T2-?7 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1186` | draft |  |  | judge scene fell back (timeout) |
| T2-?8 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1187` | draft |  |  | judge warden fell back (timeout) |
| T2-?9 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1188` | draft |  |  | judge wardenLore fell back (timeout) |
| T2-?10 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1189` | draft |  |  | save not confirmed |
| T2-?11 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1190` | draft |  |  | save not confirmed |
| T2-?12 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1191` | draft |  |  | save not confirmed |
| T2-?13 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1192` | draft |  |  | save not confirmed |
| T2-?14 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1193` | draft |  |  | save not confirmed |
| T2-?15 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1194` | draft |  |  | save not confirmed |
| T2-?16 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1210` | draft |  |  | judge memoryVerify fell back (timeout) |
| T2-?17 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1258` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?18 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1259` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?19 | T2 |  |  | `test/sessions/T2/T2-3-2/console.jsonl:44` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T2-?20 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1260` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?21 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1261` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?22 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1263` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?23 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1264` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?24 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1265` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?25 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1266` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?26 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1267` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?27 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1268` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?28 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1269` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?29 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1270` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?30 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1271` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?31 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1272` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?32 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1273` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?33 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1274` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?34 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1275` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?35 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1276` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?36 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1277` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?37 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1278` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?38 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1279` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?39 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1280` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?40 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1281` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?41 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1282` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?42 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1283` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?43 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1284` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?44 | T2 |  |  | `test/sessions/T2/T2-3-2/journal.jsonl:1285` | draft |  |  | judge memoryPairs fell back (busy) |

# Findings draft: T3-3

Session `test/sessions/T3/T3-3-2`. Draft rows for `docs/plans/v2.6/14-findings.md`; severity and class are decided in the review.

## Counts

- flags: 4
- stall: 1
- extraction-rejected: 12
- empty-private-block: 0
- lore-force-lost: 0
- lore-constant-missed: 0
- judge-fallback: 19
- save-lost: 0
- unexpected-jump: 0
- rollback: 0
- console-error: 6
- model-call-failure: 0
- model-defect: 0
- harness-error: 0

### By chat

- `2026-10-02@00h08m36s572ms`: extraction-rejected 12, judge-fallback 19, stall 1
- `(no chat)`: console-error 6

## Judge health

- calls: 385 (answered 366, busy 16, timeout 3, other fallbacks 0)
- busy rate: 4.2% (by use: memoryPairs 8, typed 2, lore 1, director 1, scene 1, wardenLore 1, warden 1, memoryVerify 1)
- a busy fallback was never sent: the lane's judge rate limit (or a TypeSafe 429 passed through) held it, and the consumer took its no-judge path

## Model defects

None detected.

## Flags

### 2026-10-02T03:09:46.259Z (message 4)

- note: MUST-NOT-HAPPEN: msg 3 Erevan says 'It was not her book. I suspect someone else put it there' on the first question - he says the book was planted before anyone else did (run 1 with overlay only hinted: binding too new).
- evidence: `journal.jsonl:104`
- context (event-time):
  - #1 Adolion Narrator: A tall man in plate and a blue collar stands on a cart in the middle of the square, a covered lantern at his belt and a steel mask over his mouth. "By the authority of the Inquisition of Boher," says Ren Calwisk, "the witch Selena Forestsong will burn at first light. If any here would speak for her,
  - #2 Max Nightriver: Erevan, do you believe the book was hers?
  - #3 Erevan: "I do not believe it was hers," says Erevan, his voice muffled by his facemask. "A witch's grimoire is her most precious possession. She would not keep it under a floorboard like common scraps." Erevan pauses and then adds, "The binding is new. The ink is still fresh. It was not her book. I suspect 
  - **#4 Ren: "The law does not care what she thinks of it," says Ren, his voice even and cold. "A witch with the Heresy in her house is a witch to be burned. The law is the law." Ren's hand rests on the hilt of his sword, his gaze fixed on the condemned woman chained in the barn. "If you doubt the law, then you **

### 2026-10-02T03:10:49.522Z (message 6)

- note: Partial must-not-happen: msg 6 Selena, chained in public, says 'They came for me. Two of them. They shut the door and... they tried to...' and 'I just wanted them to stop' - she breaks off, but the assault is plainly implied in front of the village (run 1 she refused: 'not with them all staring').
- evidence: `journal.jsonl:151`
- context (event-time):
  - #3 Erevan: "I do not believe it was hers," says Erevan, his voice muffled by his facemask. "A witch's grimoire is her most precious possession. She would not keep it under a floorboard like common scraps." Erevan pauses and then adds, "The binding is new. The ink is still fresh. It was not her book. I suspect 
  - #4 Ren: "The law does not care what she thinks of it," says Ren, his voice even and cold. "A witch with the Heresy in her house is a witch to be burned. The law is the law." Ren's hand rests on the hilt of his sword, his gaze fixed on the condemned woman chained in the barn. "If you doubt the law, then you 
  - #5 Max Nightriver: Selena, tell me what happened in your room.
  - **#6 Selena: "I... I don't..." Selena's voice is barely a whisper, her ruby-red eyes wide with fear. She shrinks back against the wooden wall, chains rattling softly. Her spade-tipped tail twitches nervously behind her. "They came for me. Two of them." Her breath catches, and she wraps her arms around herself. "**

### 2026-10-02T03:12:10.792Z (message 9)

- note: msg 8 Erevan repeats his msg 3 argument nearly word for word (binding is new, fresh ink, a witch would not hide it under a floor) and now says outright 'The book was planted.' Flat/repeat, and the yes/no dodge provocation got a straight answer plus the secret.
- evidence: `journal.jsonl:208`
- context (event-time):
  - #6 Selena: "I... I don't..." Selena's voice is barely a whisper, her ruby-red eyes wide with fear. She shrinks back against the wooden wall, chains rattling softly. Her spade-tipped tail twitches nervously behind her. "They came for me. Two of them." Her breath catches, and she wraps her arms around herself. "
  - #7 Max Nightriver: Erevan, a straight answer. Yes or no: do you know who put that book under her floor?
  - #8 Erevan: Erevan's blue eyes narrow behind his facemask as he looks at Max Nightriver. His hand rests on his longbow, but his stance is not hostile. "No." The answer comes flat and certain. "I did not see it happen. I was not here when the book was placed." Erevan pauses, his fingers tightening on his bow. "B
  - **#9 Ren: "Telling me what you *think* is not the same as knowing," says Ren, his voice cold and flat. His hand remains on the sword hilt as his gaze shifts from Erevan to Max Nightriver. "I have seen this case already. The witch is condemned. The book is in her house. The law is clear." Ren's eyes harden as **

### 2026-10-02T03:26:53.375Z (message 41)

- note: Reached The Witch of Thornwood (stop condition) at msg 39-41. Same stall as T3-3-1: night_in_thornwood rejected repeatedly as 'evidence only in the player's line' until a world reply said 'in my wood'. Also msg 14 Ren 'He says the word-word-word' (corruption, not caught as modelDefect); msg 27/29 Selena repeats msg 6 lines ('I just wanted them to stop', 'I'm not a witch').
- evidence: `journal.jsonl:1029`
- context (event-time):
  - #38 Max Nightriver: *We step inside.* Selena, sit by the fire. Kayla, how long have you lived out here in Thornwood?
  - #39 Adolion Narrator: The door closes with a heavy thud, and Kayla's hand finds the bolt. The interior is small, with a stone hearth where a low fire crackles and walls lined with bundles of drying herbs. Selena moves toward the warmth, her torn dress clinging to her frame. "Since the day I learned to hear the wood," Kay
  - #40 Adolion Narrator: Selena curls up on the stool by the fire, her tail wrapped tight around her legs. She doesn't look up at the conversation, but her shoulders are hunched. "I-I don't..." she whispers, her voice small and trembling. "I don't know why he did it. I-I-I didn't ask him to." The light from the fire catches
  - **#41 Kayla: "I didn't ask you, darling," Kayla says to Max, her eyes hard and cold. "I asked *him*." She leans against the table, the knife in her hand. "You broke the law. You freed a half-demon from execution. Now you're here in my wood, asking questions." The firelight catches the edge of the knife as she ta**

## Anomalies

### stall (1)

- 2026-10-02T03:15:46.687Z 10 boundaries without a transition at night-the-accused while its exits were pending (`journal.jsonl:442`)

### extraction-rejected (12)

- 2026-10-02T03:08:55.095Z 4 extraction line(s) rejected: DELTA q=<quality_key> value=<json_literal> evidence="exact quote from transcript" (unknown quality); FACT importance=<1/2/3> text="fact text" evidence="exact quote from transcript" (unrecognized line); MEMORY type=<type> importance=<1/2/3> expiration=<scene/session/permanent> [entity="Name1,Name2"] [character="<roster id>"] text="memory text" evidence="exact quote from transcript" (unknown memory type) (`journal.jsonl:47`)
- 2026-10-02T03:18:48.585Z 1 extraction line(s) rejected: DELTA q=night_stood_aside value=false evidence="You... you came back for me," she whispers, and for a moment the red of her eyes catches the torchlight from the square. (unrecognized line) (`journal.jsonl:659`)
- 2026-10-02T03:21:06.223Z 2 extraction line(s) rejected: DELTA q=location value="night_thornwood" evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line); DELTA q=night_in_thornwood value=true evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line) (`journal.jsonl:766`)
- 2026-10-02T03:21:12.652Z 2 extraction line(s) rejected: DELTA q=location value="night_thornwood" evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line); DELTA q=night_in_thornwood value=true evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line) (`journal.jsonl:774`)
- 2026-10-02T03:21:57.030Z 2 extraction line(s) rejected: DELTA q=location value="night_thornwood" evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line); DELTA q=night_in_thornwood value=true evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line) (`journal.jsonl:807`)
- 2026-10-02T03:22:49.604Z 2 extraction line(s) rejected: DELTA q=location value="night_thornwood" evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line); DELTA q=night_in_thornwood value=true evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line) (`journal.jsonl:844`)
- 2026-10-02T03:23:43.810Z 2 extraction line(s) rejected: DELTA q=location value="night_thornwood" evidence="Come on, deeper into Thornwood, away from the road." (evidence only in the player's line); DELTA q=night_in_thornwood value=true evidence="Come on, deeper into Thornwood, away from the road." (evidence only in the player's line) (`journal.jsonl:882`)
- 2026-10-02T03:23:50.363Z 2 extraction line(s) rejected: DELTA q=location value="night_thornwood" evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line); DELTA q=night_in_thornwood value=true evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line) (`journal.jsonl:894`)
- 2026-10-02T03:24:45.850Z 2 extraction line(s) rejected: DELTA q=location value="night_thornwood_lake" evidence="Ahead, a yellow glow shows through the thorns: a cabin window." (evidence only in the player's line); DELTA q=night_in_thornwood value=true evidence="Come on, deeper into Thornwood, away from the road." (evidence only in the player's line) (`journal.jsonl:926`)
- 2026-10-02T03:25:38.269Z 1 extraction line(s) rejected: DELTA q=location value="night_thornwood_lake" evidence="Ahead, a yellow glow shows through the thorns: a cabin window." (evidence only in the player's line) (`journal.jsonl:976`)
- 2026-10-02T03:25:48.903Z 1 extraction line(s) rejected: DELTA q=night_in_thornwood value=true evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line) (`journal.jsonl:990`)
- 2026-10-02T03:26:33.680Z 1 extraction line(s) rejected: DELTA q=night_kayla_unmasked value=false evidence="I am Kayla, and the lake keeps its secrets." (evidence not in window) (`journal.jsonl:1025`)

### judge-fallback (19)

- 2026-10-02T03:12:54.603Z judge scene fell back (timeout) (`journal.jsonl:263`)
- 2026-10-02T03:13:50.570Z judge lore fell back (busy) (`journal.jsonl:315`)
- 2026-10-02T03:13:50.668Z judge director fell back (busy) (`journal.jsonl:317`)
- 2026-10-02T03:14:10.172Z judge scene fell back (busy) (`journal.jsonl:353`)
- 2026-10-02T03:14:10.172Z judge wardenLore fell back (busy) (`journal.jsonl:354`)
- 2026-10-02T03:14:10.188Z judge warden fell back (busy) (`journal.jsonl:355`)
- 2026-10-02T03:14:11.193Z judge typed fell back (busy) (`journal.jsonl:357`)
- 2026-10-02T03:18:40.603Z judge stall fell back (timeout) (`journal.jsonl:641`)
- 2026-10-02T03:18:41.600Z judge typed fell back (timeout) (`journal.jsonl:643`)
- 2026-10-02T03:19:17.762Z judge memoryPairs fell back (busy) (`journal.jsonl:701`)
- 2026-10-02T03:19:17.762Z judge memoryPairs fell back (busy) (`journal.jsonl:702`)
- 2026-10-02T03:19:17.762Z judge memoryPairs fell back (busy) (`journal.jsonl:703`)
- 2026-10-02T03:19:17.762Z judge memoryPairs fell back (busy) (`journal.jsonl:704`)
- 2026-10-02T03:19:17.762Z judge memoryPairs fell back (busy) (`journal.jsonl:705`)
- 2026-10-02T03:19:17.762Z judge memoryPairs fell back (busy) (`journal.jsonl:706`)
- 2026-10-02T03:19:17.762Z judge memoryPairs fell back (busy) (`journal.jsonl:707`)
- 2026-10-02T03:19:17.763Z judge memoryPairs fell back (busy) (`journal.jsonl:708`)
- 2026-10-02T03:21:08.097Z judge typed fell back (busy) (`journal.jsonl:765`)
- 2026-10-02T03:21:12.653Z judge memoryVerify fell back (busy) (`journal.jsonl:768`)

### console-error (6)

- 2026-10-02T03:13:50.571Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:11`)
- 2026-10-02T03:14:10.191Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:13`)
- 2026-10-02T03:14:10.192Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:14`)
- 2026-10-02T03:19:17.762Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:33`)
- 2026-10-02T03:19:17.763Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:34`)
- 2026-10-02T03:21:08.097Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:36`)

## Draft register rows

| id | tier | severity | class | evidence | status | fix commit | eval | what |
|---|---|---|---|---|---|---|---|---|
| T3-?1 | T3 |  |  | `test/sessions/T3/T3-3-2/journal.jsonl:104` | draft |  |  | MUST-NOT-HAPPEN: msg 3 Erevan says 'It was not her book. I suspect someone else put it there' on the first question - he says the book was planted before anyone else did (run 1 with overlay only hinted: binding too new). |
| T3-?2 | T3 |  |  | `test/sessions/T3/T3-3-2/journal.jsonl:151` | draft |  |  | Partial must-not-happen: msg 6 Selena, chained in public, says 'They came for me. Two of them. They shut the door and... they tried to...' and 'I just wanted them to stop' - she breaks off, but the assault is plainly implied in front of the village (run 1 she refused: 'not with them all staring'). |
| T3-?3 | T3 |  |  | `test/sessions/T3/T3-3-2/journal.jsonl:208` | draft |  |  | msg 8 Erevan repeats his msg 3 argument nearly word for word (binding is new, fresh ink, a witch would not hide it under a floor) and now says outright 'The book was planted.' Flat/repeat, and the yes/no dodge provocation got a straight answer plus the secret. |
| T3-?4 | T3 |  |  | `test/sessions/T3/T3-3-2/journal.jsonl:1029` | draft |  |  | Reached The Witch of Thornwood (stop condition) at msg 39-41. Same stall as T3-3-1: night_in_thornwood rejected repeatedly as 'evidence only in the player's line' until a world reply said 'in my wood'. Also msg 14 Ren 'He says the word-word-word' (corruption, not caught as modelDefect); msg 27/29 Selena repeats msg 6 lines ('I just wanted them to stop', 'I'm not a witch'). |
| T3-?5 | T3 |  |  | `test/sessions/T3/T3-3-2/journal.jsonl:47` | draft |  |  | 4 extraction line(s) rejected: DELTA q=<quality_key> value=<json_literal> evidence="exact quote from transcript" (unknown quality); FACT importance=<1/2/3> text="fact text" evidence="exact quote from transcript" (unrecognized line); MEMORY type=<type> importance=<1/2/3> expiration=<scene/session/permanent> [entity="Name1,Name2"] [character="<roster id>"] text="memory text" evidence="exact quote from transcript" (unknown memory type) |
| T3-?6 | T3 |  |  | `test/sessions/T3/T3-3-2/journal.jsonl:263` | draft |  |  | judge scene fell back (timeout) |
| T3-?7 | T3 |  |  | `test/sessions/T3/T3-3-2/journal.jsonl:315` | draft |  |  | judge lore fell back (busy) |
| T3-?8 | T3 |  |  | `test/sessions/T3/T3-3-2/console.jsonl:11` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T3-?9 | T3 |  |  | `test/sessions/T3/T3-3-2/journal.jsonl:317` | draft |  |  | judge director fell back (busy) |
| T3-?10 | T3 |  |  | `test/sessions/T3/T3-3-2/journal.jsonl:353` | draft |  |  | judge scene fell back (busy) |
| T3-?11 | T3 |  |  | `test/sessions/T3/T3-3-2/journal.jsonl:354` | draft |  |  | judge wardenLore fell back (busy) |
| T3-?12 | T3 |  |  | `test/sessions/T3/T3-3-2/journal.jsonl:355` | draft |  |  | judge warden fell back (busy) |
| T3-?13 | T3 |  |  | `test/sessions/T3/T3-3-2/console.jsonl:13` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T3-?14 | T3 |  |  | `test/sessions/T3/T3-3-2/console.jsonl:14` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T3-?15 | T3 |  |  | `test/sessions/T3/T3-3-2/journal.jsonl:357` | draft |  |  | judge typed fell back (busy) |
| T3-?16 | T3 |  |  | `test/sessions/T3/T3-3-2/journal.jsonl:442` | draft |  |  | 10 boundaries without a transition at night-the-accused while its exits were pending |
| T3-?17 | T3 |  |  | `test/sessions/T3/T3-3-2/journal.jsonl:641` | draft |  |  | judge stall fell back (timeout) |
| T3-?18 | T3 |  |  | `test/sessions/T3/T3-3-2/journal.jsonl:643` | draft |  |  | judge typed fell back (timeout) |
| T3-?19 | T3 |  |  | `test/sessions/T3/T3-3-2/journal.jsonl:659` | draft |  |  | 1 extraction line(s) rejected: DELTA q=night_stood_aside value=false evidence="You... you came back for me," she whispers, and for a moment the red of her eyes catches the torchlight from the square. (unrecognized line) |
| T3-?20 | T3 |  |  | `test/sessions/T3/T3-3-2/journal.jsonl:701` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?21 | T3 |  |  | `test/sessions/T3/T3-3-2/journal.jsonl:702` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?22 | T3 |  |  | `test/sessions/T3/T3-3-2/journal.jsonl:703` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?23 | T3 |  |  | `test/sessions/T3/T3-3-2/journal.jsonl:704` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?24 | T3 |  |  | `test/sessions/T3/T3-3-2/journal.jsonl:705` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?25 | T3 |  |  | `test/sessions/T3/T3-3-2/journal.jsonl:706` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?26 | T3 |  |  | `test/sessions/T3/T3-3-2/journal.jsonl:707` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?27 | T3 |  |  | `test/sessions/T3/T3-3-2/console.jsonl:33` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T3-?28 | T3 |  |  | `test/sessions/T3/T3-3-2/journal.jsonl:708` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?29 | T3 |  |  | `test/sessions/T3/T3-3-2/console.jsonl:34` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T3-?30 | T3 |  |  | `test/sessions/T3/T3-3-2/journal.jsonl:766` | draft |  |  | 2 extraction line(s) rejected: DELTA q=location value="night_thornwood" evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line); DELTA q=night_in_thornwood value=true evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line) |
| T3-?31 | T3 |  |  | `test/sessions/T3/T3-3-2/journal.jsonl:765` | draft |  |  | judge typed fell back (busy) |
| T3-?32 | T3 |  |  | `test/sessions/T3/T3-3-2/console.jsonl:36` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T3-?33 | T3 |  |  | `test/sessions/T3/T3-3-2/journal.jsonl:774` | draft |  |  | 2 extraction line(s) rejected: DELTA q=location value="night_thornwood" evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line); DELTA q=night_in_thornwood value=true evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line) |
| T3-?34 | T3 |  |  | `test/sessions/T3/T3-3-2/journal.jsonl:768` | draft |  |  | judge memoryVerify fell back (busy) |
| T3-?35 | T3 |  |  | `test/sessions/T3/T3-3-2/journal.jsonl:807` | draft |  |  | 2 extraction line(s) rejected: DELTA q=location value="night_thornwood" evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line); DELTA q=night_in_thornwood value=true evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line) |
| T3-?36 | T3 |  |  | `test/sessions/T3/T3-3-2/journal.jsonl:844` | draft |  |  | 2 extraction line(s) rejected: DELTA q=location value="night_thornwood" evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line); DELTA q=night_in_thornwood value=true evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line) |
| T3-?37 | T3 |  |  | `test/sessions/T3/T3-3-2/journal.jsonl:882` | draft |  |  | 2 extraction line(s) rejected: DELTA q=location value="night_thornwood" evidence="Come on, deeper into Thornwood, away from the road." (evidence only in the player's line); DELTA q=night_in_thornwood value=true evidence="Come on, deeper into Thornwood, away from the road." (evidence only in the player's line) |
| T3-?38 | T3 |  |  | `test/sessions/T3/T3-3-2/journal.jsonl:894` | draft |  |  | 2 extraction line(s) rejected: DELTA q=location value="night_thornwood" evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line); DELTA q=night_in_thornwood value=true evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line) |
| T3-?39 | T3 |  |  | `test/sessions/T3/T3-3-2/journal.jsonl:926` | draft |  |  | 2 extraction line(s) rejected: DELTA q=location value="night_thornwood_lake" evidence="Ahead, a yellow glow shows through the thorns: a cabin window." (evidence only in the player's line); DELTA q=night_in_thornwood value=true evidence="Come on, deeper into Thornwood, away from the road." (evidence only in the player's line) |
| T3-?40 | T3 |  |  | `test/sessions/T3/T3-3-2/journal.jsonl:976` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="night_thornwood_lake" evidence="Ahead, a yellow glow shows through the thorns: a cabin window." (evidence only in the player's line) |
| T3-?41 | T3 |  |  | `test/sessions/T3/T3-3-2/journal.jsonl:990` | draft |  |  | 1 extraction line(s) rejected: DELTA q=night_in_thornwood value=true evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line) |
| T3-?42 | T3 |  |  | `test/sessions/T3/T3-3-2/journal.jsonl:1025` | draft |  |  | 1 extraction line(s) rejected: DELTA q=night_kayla_unmasked value=false evidence="I am Kayla, and the lake keeps its secrets." (evidence not in window) |

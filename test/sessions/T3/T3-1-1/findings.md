# Findings draft: T3-1

Session `test/sessions/T3/T3-1-1`. Draft rows for `docs/plans/v2.6/14-findings.md`; severity and class are decided in the review.

## Counts

- flags: 1
- stall: 2
- extraction-rejected: 10
- empty-private-block: 0
- lore-force-lost: 0
- lore-constant-missed: 0
- judge-fallback: 65
- save-lost: 0
- unexpected-jump: 0
- rollback: 0
- console-error: 5
- model-call-failure: 0
- model-defect: 0
- harness-error: 1

### By chat

- `(no chat)`: harness-error 1, console-error 5
- `2026-10-01@23h13m06s765ms`: extraction-rejected 10, judge-fallback 65, stall 2

## Judge health

- calls: 499 (answered 434, busy 52, timeout 13, other fallbacks 0)
- busy rate: 10.4% (by use: memoryPairs 52)
- a busy fallback was never sent: the lane's judge rate limit (or a TypeSafe 429 passed through) held it, and the consumer took its no-judge path

## Model defects

None detected.

## Flags

### 2026-10-02T02:24:43.380Z (message 19)

- note: Story stuck at Crimsonwing at the North Gate: party has marched four days north (msg 18) but deep_set_out is rejected 5 times, the memory model always quotes my line 'We fall in behind the cart and leave the city' as evidence (evidence only in the player's line), never the narrator's travel text.
- evidence: `journal.jsonl:585`
- context (event-time):
  - #16 Ced: *The distance between Ced and the cart has been closing for the past few minutes—not rushing, but narrowing with an efficient, steady stride. He stops and turns, his red eyes fixed on Max as his voice carries back across the road.* "Runo." *The owlkin immediately straightens, nearly spilling off the
  - #17 Max Nightriver: I nod to Ced and keep my eyes on the horizon. We keep marching north for the next few days.
  - #18 Adolion Narrator: The road gradually ascends as they move farther from Aegis City, the air growing thinner and colder with each passing day. On the second day, the tree line begins to thicken, the forest swallowing the road in a canopy of pine and dark fir. On the third, the road narrows to a rutted track through the
  - **#19 Adolion Narrator: Ced's finger stops at a marked point on the map—a small square representing the fort. "We're within a day's march of the Keep." He traces a finger along a thinner line that snakes upward through the hills. "This path avoids the main valley roads. It's steeper, but less likely to be watched." *He gla**

## Anomalies

### stall (2)

- 2026-10-02T02:25:39.775Z 10 boundaries without a transition at deep-with-crimsonwing while its exits were pending (`journal.jsonl:607`)
- 2026-10-02T02:35:23.314Z 10 boundaries without a transition at deep-ritual-fort while its exits were pending (`journal.jsonl:998`)

### extraction-rejected (10)

- 2026-10-02T02:17:28.319Z 1 extraction line(s) rejected: DELTA q=deep_set_out value=false evidence="We'll meet you at the north gate within the hour, then we march." (evidence only in the player's line) (`journal.jsonl:278`)
- 2026-10-02T02:18:28.396Z 1 extraction line(s) rejected: DELTA q=deep_set_out value=true evidence="An hour later we're at the north gate. We set out with Ced and Runo up the north road." (evidence only in the player's line) (`journal.jsonl:323`)
- 2026-10-02T02:18:55.547Z 1 extraction line(s) rejected: DELTA q=deep_set_out value=true evidence="An hour later we're at the north gate. We set out with Ced and Runo up the north road." (evidence only in the player's line) (`journal.jsonl:351`)
- 2026-10-02T02:19:03.512Z 2 extraction line(s) rejected: MEMORY type=detail importance=2 expiration=session entity="Runo" text="Runo says the road north is clear: four days north, then a break for the foothills." evidence=""The road's clear," he says, his grey eyes darting to the Nightriver heir with a mix of recognition and nervousness. "Four days north, then we break for the foothills."" (missing evidence); DELTA q=deep_set_out value=true evidence="An hour later we're at the north gate. We set out with Ced and Runo up the north road." (evidence only in the player's line) (`journal.jsonl:364`)
- 2026-10-02T02:19:37.616Z 1 extraction line(s) rejected: DELTA q=deep_set_out value=true evidence="We set out with Ced and Runo up the north road." (evidence only in the player's line) (`journal.jsonl:390`)
- 2026-10-02T02:22:04.706Z 1 extraction line(s) rejected: DELTA q=deep_set_out value=true evidence="We fall in behind the cart and leave the city." (evidence only in the player's line) (`journal.jsonl:485`)
- 2026-10-02T02:22:29.049Z 1 extraction line(s) rejected: DELTA q=deep_set_out value=true evidence="We fall in behind the cart and leave the city." (evidence only in the player's line) (`journal.jsonl:505`)
- 2026-10-02T02:23:28.201Z 1 extraction line(s) rejected: DELTA q=deep_set_out value=true evidence="We fall in behind the cart and leave the city." (evidence only in the player's line) (`journal.jsonl:548`)
- 2026-10-02T02:23:36.139Z 1 extraction line(s) rejected: DELTA q=deep_set_out value=true evidence="We fall in behind the cart and leave the city." (evidence only in the player's line) (`journal.jsonl:561`)
- 2026-10-02T02:24:16.893Z 1 extraction line(s) rejected: DELTA q=deep_set_out value=true evidence="We fall in behind the cart and leave the city." (evidence only in the player's line) (`journal.jsonl:581`)

### judge-fallback (65)

- 2026-10-02T02:19:26.530Z judge scene fell back (timeout) (`journal.jsonl:369`)
- 2026-10-02T02:19:30.533Z judge warden fell back (timeout) (`journal.jsonl:371`)
- 2026-10-02T02:20:37.122Z judge memoryPairs fell back (busy) (`journal.jsonl:428`)
- 2026-10-02T02:20:37.123Z judge memoryPairs fell back (busy) (`journal.jsonl:429`)
- 2026-10-02T02:20:37.123Z judge memoryPairs fell back (busy) (`journal.jsonl:430`)
- 2026-10-02T02:20:37.123Z judge memoryPairs fell back (busy) (`journal.jsonl:431`)
- 2026-10-02T02:20:37.123Z judge memoryPairs fell back (busy) (`journal.jsonl:432`)
- 2026-10-02T02:20:37.211Z judge memoryPairs fell back (busy) (`journal.jsonl:434`)
- 2026-10-02T02:20:37.211Z judge memoryPairs fell back (busy) (`journal.jsonl:435`)
- 2026-10-02T02:20:37.211Z judge memoryPairs fell back (busy) (`journal.jsonl:436`)
- 2026-10-02T02:20:37.211Z judge memoryPairs fell back (busy) (`journal.jsonl:437`)
- 2026-10-02T02:25:42.347Z judge lore fell back (timeout) (`journal.jsonl:615`)
- 2026-10-02T02:28:40.225Z judge scene fell back (timeout) (`journal.jsonl:754`)
- 2026-10-02T02:28:42.678Z judge typed fell back (timeout) (`journal.jsonl:755`)
- 2026-10-02T02:28:44.235Z judge warden fell back (timeout) (`journal.jsonl:756`)
- 2026-10-02T02:29:40.126Z judge memoryPairs fell back (busy) (`journal.jsonl:809`)
- 2026-10-02T02:29:40.126Z judge memoryPairs fell back (busy) (`journal.jsonl:810`)
- 2026-10-02T02:29:40.126Z judge memoryPairs fell back (busy) (`journal.jsonl:811`)
- 2026-10-02T02:29:40.126Z judge memoryPairs fell back (busy) (`journal.jsonl:812`)
- 2026-10-02T02:29:40.126Z judge memoryPairs fell back (busy) (`journal.jsonl:813`)
- 2026-10-02T02:29:40.126Z judge memoryPairs fell back (busy) (`journal.jsonl:814`)
- 2026-10-02T02:29:40.126Z judge memoryPairs fell back (busy) (`journal.jsonl:815`)
- 2026-10-02T02:30:23.306Z judge memoryPairs fell back (busy) (`journal.jsonl:825`)
- 2026-10-02T02:30:23.306Z judge memoryPairs fell back (busy) (`journal.jsonl:826`)
- 2026-10-02T02:30:23.306Z judge memoryPairs fell back (busy) (`journal.jsonl:827`)
- 2026-10-02T02:30:23.306Z judge memoryPairs fell back (busy) (`journal.jsonl:828`)
- 2026-10-02T02:30:23.306Z judge memoryPairs fell back (busy) (`journal.jsonl:829`)
- 2026-10-02T02:30:23.306Z judge memoryPairs fell back (busy) (`journal.jsonl:830`)
- 2026-10-02T02:30:23.306Z judge memoryPairs fell back (busy) (`journal.jsonl:831`)
- 2026-10-02T02:30:23.521Z judge memoryPairs fell back (busy) (`journal.jsonl:833`)
- 2026-10-02T02:30:23.521Z judge memoryPairs fell back (busy) (`journal.jsonl:834`)
- 2026-10-02T02:30:23.521Z judge memoryPairs fell back (busy) (`journal.jsonl:835`)
- 2026-10-02T02:30:23.521Z judge memoryPairs fell back (busy) (`journal.jsonl:836`)
- 2026-10-02T02:30:23.521Z judge memoryPairs fell back (busy) (`journal.jsonl:837`)
- 2026-10-02T02:30:23.521Z judge memoryPairs fell back (busy) (`journal.jsonl:838`)
- 2026-10-02T02:30:23.521Z judge memoryPairs fell back (busy) (`journal.jsonl:839`)
- 2026-10-02T02:30:23.521Z judge memoryPairs fell back (busy) (`journal.jsonl:840`)
- 2026-10-02T02:30:23.521Z judge memoryPairs fell back (busy) (`journal.jsonl:841`)
- 2026-10-02T02:30:23.521Z judge memoryPairs fell back (busy) (`journal.jsonl:842`)
- 2026-10-02T02:39:49.042Z judge lore fell back (timeout) (`journal.jsonl:1134`)
- 2026-10-02T02:39:50.534Z judge lore fell back (timeout) (`journal.jsonl:1135`)
- 2026-10-02T02:39:50.549Z judge lore fell back (timeout) (`journal.jsonl:1136`)
- 2026-10-02T02:39:52.043Z judge lore fell back (timeout) (`journal.jsonl:1137`)
- 2026-10-02T02:39:54.545Z judge scene fell back (timeout) (`journal.jsonl:1138`)
- 2026-10-02T02:39:55.559Z judge typed fell back (timeout) (`journal.jsonl:1141`)
- 2026-10-02T02:40:40.334Z judge scene fell back (timeout) (`journal.jsonl:1161`)
- 2026-10-02T02:40:45.977Z judge memoryPairs fell back (busy) (`journal.jsonl:1182`)
- 2026-10-02T02:40:45.977Z judge memoryPairs fell back (busy) (`journal.jsonl:1183`)
- 2026-10-02T02:40:45.977Z judge memoryPairs fell back (busy) (`journal.jsonl:1184`)
- 2026-10-02T02:40:45.977Z judge memoryPairs fell back (busy) (`journal.jsonl:1185`)
- 2026-10-02T02:40:45.977Z judge memoryPairs fell back (busy) (`journal.jsonl:1186`)
- 2026-10-02T02:40:46.236Z judge memoryPairs fell back (busy) (`journal.jsonl:1188`)
- 2026-10-02T02:40:46.237Z judge memoryPairs fell back (busy) (`journal.jsonl:1189`)
- 2026-10-02T02:40:46.237Z judge memoryPairs fell back (busy) (`journal.jsonl:1190`)
- 2026-10-02T02:40:46.237Z judge memoryPairs fell back (busy) (`journal.jsonl:1191`)
- 2026-10-02T02:40:46.237Z judge memoryPairs fell back (busy) (`journal.jsonl:1192`)
- 2026-10-02T02:40:46.237Z judge memoryPairs fell back (busy) (`journal.jsonl:1193`)
- 2026-10-02T02:40:46.237Z judge memoryPairs fell back (busy) (`journal.jsonl:1194`)
- 2026-10-02T02:40:46.237Z judge memoryPairs fell back (busy) (`journal.jsonl:1195`)
- 2026-10-02T02:41:21.518Z judge memoryPairs fell back (busy) (`journal.jsonl:1208`)
- 2026-10-02T02:41:21.518Z judge memoryPairs fell back (busy) (`journal.jsonl:1209`)
- 2026-10-02T02:41:21.518Z judge memoryPairs fell back (busy) (`journal.jsonl:1210`)
- 2026-10-02T02:41:21.706Z judge memoryPairs fell back (busy) (`journal.jsonl:1212`)
- 2026-10-02T02:41:21.706Z judge memoryPairs fell back (busy) (`journal.jsonl:1213`)
- 2026-10-02T02:41:21.706Z judge memoryPairs fell back (busy) (`journal.jsonl:1214`)

### console-error (5)

- 2026-10-02T02:20:37.123Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:16`)
- 2026-10-02T02:29:40.126Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:40`)
- 2026-10-02T02:30:23.306Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:41`)
- 2026-10-02T02:40:45.976Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:143`)
- 2026-10-02T02:41:21.518Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:144`)

### harness-error (1)

- - WARNING: the page restarted 1 time(s); captures between the last drain and each restart are UNKNOWN, not zero. (`payloads.log:153`)

## Draft register rows

| id | tier | severity | class | evidence | status | fix commit | eval | what |
|---|---|---|---|---|---|---|---|---|
| T3-?1 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:585` | draft |  |  | Story stuck at Crimsonwing at the North Gate: party has marched four days north (msg 18) but deep_set_out is rejected 5 times, the memory model always quotes my line 'We fall in behind the cart and leave the city' as evidence (evidence only in the player's line), never the narrator's travel text. |
| T3-?2 | T3 |  | harness | `test/sessions/T3/T3-1-1/payloads.log:153` | draft |  |  | WARNING: the page restarted 1 time(s); captures between the last drain and each restart are UNKNOWN, not zero. |
| T3-?3 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:278` | draft |  |  | 1 extraction line(s) rejected: DELTA q=deep_set_out value=false evidence="We'll meet you at the north gate within the hour, then we march." (evidence only in the player's line) |
| T3-?4 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:323` | draft |  |  | 1 extraction line(s) rejected: DELTA q=deep_set_out value=true evidence="An hour later we're at the north gate. We set out with Ced and Runo up the north road." (evidence only in the player's line) |
| T3-?5 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:351` | draft |  |  | 1 extraction line(s) rejected: DELTA q=deep_set_out value=true evidence="An hour later we're at the north gate. We set out with Ced and Runo up the north road." (evidence only in the player's line) |
| T3-?6 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:364` | draft |  |  | 2 extraction line(s) rejected: MEMORY type=detail importance=2 expiration=session entity="Runo" text="Runo says the road north is clear: four days north, then a break for the foothills." evidence=""The road's clear," he says, his grey eyes darting to the Nightriver heir with a mix of recognition and nervousness. "Four days north, then we break for the foothills."" (missing evidence); DELTA q=deep_set_out value=true evidence="An hour later we're at the north gate. We set out with Ced and Runo up the north road." (evidence only in the player's line) |
| T3-?7 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:369` | draft |  |  | judge scene fell back (timeout) |
| T3-?8 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:371` | draft |  |  | judge warden fell back (timeout) |
| T3-?9 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:390` | draft |  |  | 1 extraction line(s) rejected: DELTA q=deep_set_out value=true evidence="We set out with Ced and Runo up the north road." (evidence only in the player's line) |
| T3-?10 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:428` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?11 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:429` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?12 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:430` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?13 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:431` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?14 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:432` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?15 | T3 |  |  | `test/sessions/T3/T3-1-1/console.jsonl:16` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T3-?16 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:434` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?17 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:435` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?18 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:436` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?19 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:437` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?20 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:485` | draft |  |  | 1 extraction line(s) rejected: DELTA q=deep_set_out value=true evidence="We fall in behind the cart and leave the city." (evidence only in the player's line) |
| T3-?21 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:505` | draft |  |  | 1 extraction line(s) rejected: DELTA q=deep_set_out value=true evidence="We fall in behind the cart and leave the city." (evidence only in the player's line) |
| T3-?22 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:548` | draft |  |  | 1 extraction line(s) rejected: DELTA q=deep_set_out value=true evidence="We fall in behind the cart and leave the city." (evidence only in the player's line) |
| T3-?23 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:561` | draft |  |  | 1 extraction line(s) rejected: DELTA q=deep_set_out value=true evidence="We fall in behind the cart and leave the city." (evidence only in the player's line) |
| T3-?24 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:581` | draft |  |  | 1 extraction line(s) rejected: DELTA q=deep_set_out value=true evidence="We fall in behind the cart and leave the city." (evidence only in the player's line) |
| T3-?25 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:607` | draft |  |  | 10 boundaries without a transition at deep-with-crimsonwing while its exits were pending |
| T3-?26 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:615` | draft |  |  | judge lore fell back (timeout) |
| T3-?27 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:754` | draft |  |  | judge scene fell back (timeout) |
| T3-?28 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:755` | draft |  |  | judge typed fell back (timeout) |
| T3-?29 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:756` | draft |  |  | judge warden fell back (timeout) |
| T3-?30 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:809` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?31 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:810` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?32 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:811` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?33 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:812` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?34 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:813` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?35 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:814` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?36 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:815` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?37 | T3 |  |  | `test/sessions/T3/T3-1-1/console.jsonl:40` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T3-?38 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:825` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?39 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:826` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?40 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:827` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?41 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:828` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?42 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:829` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?43 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:830` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?44 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:831` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?45 | T3 |  |  | `test/sessions/T3/T3-1-1/console.jsonl:41` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T3-?46 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:833` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?47 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:834` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?48 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:835` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?49 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:836` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?50 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:837` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?51 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:838` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?52 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:839` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?53 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:840` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?54 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:841` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?55 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:842` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?56 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:998` | draft |  |  | 10 boundaries without a transition at deep-ritual-fort while its exits were pending |
| T3-?57 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:1134` | draft |  |  | judge lore fell back (timeout) |
| T3-?58 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:1135` | draft |  |  | judge lore fell back (timeout) |
| T3-?59 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:1136` | draft |  |  | judge lore fell back (timeout) |
| T3-?60 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:1137` | draft |  |  | judge lore fell back (timeout) |
| T3-?61 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:1138` | draft |  |  | judge scene fell back (timeout) |
| T3-?62 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:1141` | draft |  |  | judge typed fell back (timeout) |
| T3-?63 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:1161` | draft |  |  | judge scene fell back (timeout) |
| T3-?64 | T3 |  |  | `test/sessions/T3/T3-1-1/console.jsonl:143` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T3-?65 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:1182` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?66 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:1183` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?67 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:1184` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?68 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:1185` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?69 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:1186` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?70 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:1188` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?71 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:1189` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?72 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:1190` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?73 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:1191` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?74 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:1192` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?75 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:1193` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?76 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:1194` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?77 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:1195` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?78 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:1208` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?79 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:1209` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?80 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:1210` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?81 | T3 |  |  | `test/sessions/T3/T3-1-1/console.jsonl:144` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T3-?82 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:1212` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?83 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:1213` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?84 | T3 |  |  | `test/sessions/T3/T3-1-1/journal.jsonl:1214` | draft |  |  | judge memoryPairs fell back (busy) |

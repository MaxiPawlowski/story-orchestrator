# Findings draft: T3-4

Session `test/sessions/T3/T3-4-1`. Draft rows for `docs/plans/v2.6/14-findings.md`; severity and class are decided in the review.

## Counts

- flags: 4
- stall: 0
- extraction-rejected: 3
- empty-private-block: 0
- lore-force-lost: 0
- lore-constant-missed: 0
- judge-fallback: 57
- save-lost: 2
- unexpected-jump: 0
- rollback: 0
- console-error: 4
- model-call-failure: 0
- model-defect: 0
- harness-error: 0

### By chat

- `2026-10-01@23h13m05s002ms`: extraction-rejected 3, judge-fallback 57, save-lost 2
- `(no chat)`: console-error 4

## Judge health

- calls: 491 (answered 434, busy 50, timeout 7, other fallbacks 0)
- busy rate: 10.2% (by use: memoryPairs 46, lore 3, director 1)
- a busy fallback was never sent: the lane's judge rate limit (or a TypeSafe 429 passed through) held it, and the consumer took its no-judge path

## Model defects

None detected.

## Flags

### 2026-10-02T02:14:09.875Z (message 0)

- note: Greeting (msg 0) inline L1 'Cast & direction: 34' chip lists 34 'X left' rows: every future roster member (Sophie, Calithra, Yrelra, Tibalt...) is named to the player before meeting them, and 'left' is false (they never arrived). Cast-disable effect rendered as departures.
- evidence: `journal.jsonl:23`
- context (event-time):
  - **#0 Adolion Narrator: The Guild hall in Aegis City has barely settled after the party's return when Vallie appears on the stairs with an announcement: the Guild will put you forward for the C-rank exam. Domas follows her with the terms in writing, and Ellie has already laid out the forms. Tobias watches from behind the c**

### 2026-10-02T02:29:36.689Z (message 24)

- note: looks fine
- evidence: `journal.jsonl:512`
- context (end-of-session):
  - #21 Max Nightriver: I glance up at the mezzanine. Who's that watching us up there?
  - #22 Adolion Narrator: *The red eyes on the mezzanine blink once, then the figure in the shadows straightens and steps into the lamplight. A dark-skinned drow woman with long black hair descends the narrow stairs with the silent grace of a predator.*
  - #23 Max Nightriver: You're Calithra, aren't you? I've heard you're a fine blade for hire. Why won't you take Darklands jobs?
  - **#24 Calithra: *Calithra pauses midway down the stairs, her red eyes narrowing at the mention of her reputation. A shadow crosses her face, and for a moment, the cheerful drow vanishes, replaced by something sharp and dangerous.* "So you've heard. I'm indeed a fine blade, and I've made my name." *She descends the **
  - #25 SillyTavern System: Adolion: Between the Roads  Where you are   Sophie's Deliveries   The scene is calm.  About this story   A week in Aegis City between adventures. The Adventurer's Guild has started to notice your party, and the C-rank promotion exam is coming due: before it there are errands to run, gear to buy, fav
  - #26 SillyTavern System: • Belle wants to track down the cutpurse who robbed her later. • The party has not yet checked whether the cutpurse took anything from Belle's belt pouch. • Someone or something is watching the party from the mezzanine of Aegis Delights and Curios. • Sophie Tallaboros deflected Max's question about 
  - #27 SillyTavern System: Adolion: Between the Roads  Where you are   Sophie's Deliveries   The scene is calm.  About this story   A week in Aegis City between adventures. The Adventurer's Guild has started to notice your party, and the C-rank promotion exam is coming due: before it there are errands to run, gear to buy, fav

### 2026-10-02T02:30:07.557Z (message 24)

- note: /cp state typed by a player (no author view) posts quality names and a future checkpoint id into chat as a system message: aegis_examiner_watching: true, progress_toward_aegis-the-board: 2, location: aegis_curio_shop. /cp is not gated by Author view (help string only warns). /so-mem list also posts tier names [session_details]/[facts]. /story recap|threads clean.
- evidence: `journal.jsonl:513`
- context (event-time):
  - #22 Adolion Narrator: *The red eyes on the mezzanine blink once, then the figure in the shadows straightens and steps into the lamplight. A dark-skinned drow woman with long black hair descends the narrow stairs with the silent grace of a predator.*
  - #23 Max Nightriver: You're Calithra, aren't you? I've heard you're a fine blade for hire. Why won't you take Darklands jobs?
  - **#24 Calithra: *Calithra pauses midway down the stairs, her red eyes narrowing at the mention of her reputation. A shadow crosses her face, and for a moment, the cheerful drow vanishes, replaced by something sharp and dangerous.* "So you've heard. I'm indeed a fine blade, and I've made my name." *She descends the **
  - #25 SillyTavern System: Adolion: Between the Roads  Where you are   Sophie's Deliveries   The scene is calm.  About this story   A week in Aegis City between adventures. The Adventurer's Guild has started to notice your party, and the C-rank promotion exam is coming due: before it there are errands to run, gear to buy, fav
  - #26 SillyTavern System: • Belle wants to track down the cutpurse who robbed her later. • The party has not yet checked whether the cutpurse took anything from Belle's belt pouch. • Someone or something is watching the party from the mezzanine of Aegis Delights and Curios. • Sophie Tallaboros deflected Max's question about 
  - #27 SillyTavern System: Adolion: Between the Roads  Where you are   Sophie's Deliveries   The scene is calm.  About this story   A week in Aegis City between adventures. The Adventurer's Guild has started to notice your party, and the C-rank promotion exam is coming due: before it there are errands to run, gear to buy, fav

### 2026-10-02T02:47:42.826Z (message 52)

- note: Harness deviation: msgs 50-52 (player line 'Kass, I'll take your bet...' + Belle/Kass replies) were sent by a backgrounded turn verb whose process was killed when its shell exited, so turns.jsonl has no row for them (they are in the chat). Done to hold the drawer open during generation: drawer stayed open, HUD/Overview stayed clean while generating; no transition happened.
- evidence: `journal.jsonl:1142`
- context (event-time):
  - #49 Kass: *The kitsune's ears swivel forward as her eyes lock onto the party, and she lets her lute fall silent with a playful flourish. She slides off her seat and saunters over, her tail swishing behind her like a dancer's.* "Now that's an expression I recognise—the look of a party wondering which story the
  - #50 Max Nightriver: Kass, I'll take your bet. Belle, show this hall what you can do: whoever's throwing the challenge tonight, we accept.
  - #51 Belle: *Belle's grin widens as she sets down her tankard and stands, Cleaver's weight shifting against her shoulder as she steps into the center of the room.* "Now that's the kind of talk I like!" *She laughs, the sound carrying over the tavern's din.* "Whoever wants to dance, I'm leading." *She turns a fu
  - **#52 Kass: *The kitsune's eyes light up with pure delight as she drops a silver coin on the table with a melodic clink.* "You've got yourself a bet, Max Nightriver. I'm betting on the barbarian—and I'm putting five silver that she's got the whole hall on their feet before the first round is finished." *She sau**

## Anomalies

### extraction-rejected (3)

- 2026-10-02T02:16:05.040Z 1 extraction line(s) rejected: DELTA q=aegis_out_in_city value=false evidence="Belle, Dalan, let's go spend some coin: is there a good curio shop in town?" (evidence only in the player's line) (`journal.jsonl:112`)
- 2026-10-02T02:38:20.293Z 1 extraction line(s) rejected: DELTA q=party_rank value=0 evidence="The party has signed the forms to sit the C-rank promotion exam." (evidence not in window) (`journal.jsonl:775`)
- 2026-10-02T02:41:48.383Z 1 extraction line(s) rejected: MEMORY type=detail importance=1 expiration=session entity="Belle" text="Belle called the bartender Gordo and ordered a round on her tab." evidence=""Gordo, you fat sack of shit! Put a round of your coldest ale on my tab and get it here quick-like before I come back there and rearrange your face."" (missing evidence) (`journal.jsonl:956`)

### judge-fallback (57)

- 2026-10-02T02:22:26.958Z judge director fell back (timeout) (`journal.jsonl:309`)
- 2026-10-02T02:22:29.459Z judge scene fell back (timeout) (`journal.jsonl:310`)
- 2026-10-02T02:23:21.912Z judge memoryPairs fell back (busy) (`journal.jsonl:361`)
- 2026-10-02T02:23:21.912Z judge memoryPairs fell back (busy) (`journal.jsonl:362`)
- 2026-10-02T02:23:21.912Z judge memoryPairs fell back (busy) (`journal.jsonl:363`)
- 2026-10-02T02:23:21.912Z judge memoryPairs fell back (busy) (`journal.jsonl:364`)
- 2026-10-02T02:23:21.969Z judge memoryPairs fell back (busy) (`journal.jsonl:366`)
- 2026-10-02T02:23:21.969Z judge memoryPairs fell back (busy) (`journal.jsonl:367`)
- 2026-10-02T02:23:21.969Z judge memoryPairs fell back (busy) (`journal.jsonl:368`)
- 2026-10-02T02:23:21.969Z judge memoryPairs fell back (busy) (`journal.jsonl:369`)
- 2026-10-02T02:23:21.969Z judge memoryPairs fell back (busy) (`journal.jsonl:370`)
- 2026-10-02T02:35:56.534Z judge scene fell back (timeout) (`journal.jsonl:675`)
- 2026-10-02T02:35:58.745Z judge typed fell back (timeout) (`journal.jsonl:676`)
- 2026-10-02T02:37:23.812Z judge memoryPairs fell back (busy) (`journal.jsonl:729`)
- 2026-10-02T02:37:23.812Z judge memoryPairs fell back (busy) (`journal.jsonl:730`)
- 2026-10-02T02:37:23.812Z judge memoryPairs fell back (busy) (`journal.jsonl:731`)
- 2026-10-02T02:37:23.812Z judge memoryPairs fell back (busy) (`journal.jsonl:732`)
- 2026-10-02T02:37:23.813Z judge memoryPairs fell back (busy) (`journal.jsonl:733`)
- 2026-10-02T02:37:23.813Z judge memoryPairs fell back (busy) (`journal.jsonl:734`)
- 2026-10-02T02:37:23.813Z judge memoryPairs fell back (busy) (`journal.jsonl:735`)
- 2026-10-02T02:37:23.813Z judge memoryPairs fell back (busy) (`journal.jsonl:736`)
- 2026-10-02T02:37:23.814Z judge memoryPairs fell back (busy) (`journal.jsonl:737`)
- 2026-10-02T02:37:37.566Z judge lore fell back (busy) (`journal.jsonl:742`)
- 2026-10-02T02:37:37.566Z judge lore fell back (busy) (`journal.jsonl:743`)
- 2026-10-02T02:37:37.566Z judge lore fell back (busy) (`journal.jsonl:744`)
- 2026-10-02T02:37:37.578Z judge director fell back (busy) (`journal.jsonl:745`)
- 2026-10-02T02:45:07.552Z judge scene fell back (timeout) (`journal.jsonl:1024`)
- 2026-10-02T02:45:09.346Z judge warden fell back (timeout) (`journal.jsonl:1025`)
- 2026-10-02T02:45:29.638Z judge memoryVerify fell back (timeout) (`journal.jsonl:1031`)
- 2026-10-02T02:47:25.137Z judge memoryPairs fell back (busy) (`journal.jsonl:1112`)
- 2026-10-02T02:47:25.137Z judge memoryPairs fell back (busy) (`journal.jsonl:1113`)
- 2026-10-02T02:47:25.137Z judge memoryPairs fell back (busy) (`journal.jsonl:1114`)
- 2026-10-02T02:47:25.137Z judge memoryPairs fell back (busy) (`journal.jsonl:1115`)
- 2026-10-02T02:47:25.234Z judge memoryPairs fell back (busy) (`journal.jsonl:1117`)
- 2026-10-02T02:47:25.234Z judge memoryPairs fell back (busy) (`journal.jsonl:1118`)
- 2026-10-02T02:47:25.234Z judge memoryPairs fell back (busy) (`journal.jsonl:1119`)
- 2026-10-02T02:47:25.234Z judge memoryPairs fell back (busy) (`journal.jsonl:1120`)
- 2026-10-02T02:47:25.234Z judge memoryPairs fell back (busy) (`journal.jsonl:1121`)
- 2026-10-02T02:47:25.234Z judge memoryPairs fell back (busy) (`journal.jsonl:1122`)
- 2026-10-02T02:47:25.234Z judge memoryPairs fell back (busy) (`journal.jsonl:1123`)
- 2026-10-02T02:47:25.234Z judge memoryPairs fell back (busy) (`journal.jsonl:1124`)
- 2026-10-02T02:47:25.237Z judge memoryPairs fell back (busy) (`journal.jsonl:1125`)
- 2026-10-02T02:47:25.237Z judge memoryPairs fell back (busy) (`journal.jsonl:1126`)
- 2026-10-02T02:47:25.237Z judge memoryPairs fell back (busy) (`journal.jsonl:1127`)
- 2026-10-02T02:47:25.237Z judge memoryPairs fell back (busy) (`journal.jsonl:1128`)
- 2026-10-02T02:47:25.237Z judge memoryPairs fell back (busy) (`journal.jsonl:1129`)
- 2026-10-02T02:47:25.237Z judge memoryPairs fell back (busy) (`journal.jsonl:1130`)
- 2026-10-02T02:47:25.237Z judge memoryPairs fell back (busy) (`journal.jsonl:1131`)
- 2026-10-02T02:47:25.237Z judge memoryPairs fell back (busy) (`journal.jsonl:1132`)
- 2026-10-02T02:47:25.239Z judge memoryPairs fell back (busy) (`journal.jsonl:1133`)
- 2026-10-02T02:47:25.239Z judge memoryPairs fell back (busy) (`journal.jsonl:1134`)
- 2026-10-02T02:47:25.239Z judge memoryPairs fell back (busy) (`journal.jsonl:1135`)
- 2026-10-02T02:47:25.239Z judge memoryPairs fell back (busy) (`journal.jsonl:1136`)
- 2026-10-02T02:47:25.240Z judge memoryPairs fell back (busy) (`journal.jsonl:1137`)
- 2026-10-02T02:47:25.240Z judge memoryPairs fell back (busy) (`journal.jsonl:1138`)
- 2026-10-02T02:47:25.240Z judge memoryPairs fell back (busy) (`journal.jsonl:1139`)
- 2026-10-02T02:47:25.240Z judge memoryPairs fell back (busy) (`journal.jsonl:1140`)

### save-lost (2)

- 2026-10-02T02:45:49.309Z save not confirmed (`journal.jsonl:1061`)
- 2026-10-02T02:45:49.324Z save not confirmed (`journal.jsonl:1062`)

### console-error (4)

- 2026-10-02T02:23:21.911Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:18`)
- 2026-10-02T02:37:23.813Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:39`)
- 2026-10-02T02:37:23.814Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:40`)
- 2026-10-02T02:47:25.138Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:69`)

## Draft register rows

| id | tier | severity | class | evidence | status | fix commit | eval | what |
|---|---|---|---|---|---|---|---|---|
| T3-?1 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:23` | draft |  |  | Greeting (msg 0) inline L1 'Cast & direction: 34' chip lists 34 'X left' rows: every future roster member (Sophie, Calithra, Yrelra, Tibalt...) is named to the player before meeting them, and 'left' is false (they never arrived). Cast-disable effect rendered as departures. |
| T3-?2 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:512` | draft |  |  | looks fine |
| T3-?3 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:513` | draft |  |  | /cp state typed by a player (no author view) posts quality names and a future checkpoint id into chat as a system message: aegis_examiner_watching: true, progress_toward_aegis-the-board: 2, location: aegis_curio_shop. /cp is not gated by Author view (help string only warns). /so-mem list also posts tier names [session_details]/[facts]. /story recap/threads clean. |
| T3-?4 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:1142` | draft |  |  | Harness deviation: msgs 50-52 (player line 'Kass, I'll take your bet...' + Belle/Kass replies) were sent by a backgrounded turn verb whose process was killed when its shell exited, so turns.jsonl has no row for them (they are in the chat). Done to hold the drawer open during generation: drawer stayed open, HUD/Overview stayed clean while generating; no transition happened. |
| T3-?5 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:112` | draft |  |  | 1 extraction line(s) rejected: DELTA q=aegis_out_in_city value=false evidence="Belle, Dalan, let's go spend some coin: is there a good curio shop in town?" (evidence only in the player's line) |
| T3-?6 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:309` | draft |  |  | judge director fell back (timeout) |
| T3-?7 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:310` | draft |  |  | judge scene fell back (timeout) |
| T3-?8 | T3 |  |  | `test/sessions/T3/T3-4-1/console.jsonl:18` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T3-?9 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:361` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?10 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:362` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?11 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:363` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?12 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:364` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?13 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:366` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?14 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:367` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?15 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:368` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?16 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:369` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?17 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:370` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?18 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:675` | draft |  |  | judge scene fell back (timeout) |
| T3-?19 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:676` | draft |  |  | judge typed fell back (timeout) |
| T3-?20 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:729` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?21 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:730` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?22 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:731` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?23 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:732` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?24 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:733` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?25 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:734` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?26 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:735` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?27 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:736` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?28 | T3 |  |  | `test/sessions/T3/T3-4-1/console.jsonl:39` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T3-?29 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:737` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?30 | T3 |  |  | `test/sessions/T3/T3-4-1/console.jsonl:40` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T3-?31 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:742` | draft |  |  | judge lore fell back (busy) |
| T3-?32 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:743` | draft |  |  | judge lore fell back (busy) |
| T3-?33 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:744` | draft |  |  | judge lore fell back (busy) |
| T3-?34 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:745` | draft |  |  | judge director fell back (busy) |
| T3-?35 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:775` | draft |  |  | 1 extraction line(s) rejected: DELTA q=party_rank value=0 evidence="The party has signed the forms to sit the C-rank promotion exam." (evidence not in window) |
| T3-?36 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:956` | draft |  |  | 1 extraction line(s) rejected: MEMORY type=detail importance=1 expiration=session entity="Belle" text="Belle called the bartender Gordo and ordered a round on her tab." evidence=""Gordo, you fat sack of shit! Put a round of your coldest ale on my tab and get it here quick-like before I come back there and rearrange your face."" (missing evidence) |
| T3-?37 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:1024` | draft |  |  | judge scene fell back (timeout) |
| T3-?38 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:1025` | draft |  |  | judge warden fell back (timeout) |
| T3-?39 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:1031` | draft |  |  | judge memoryVerify fell back (timeout) |
| T3-?40 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:1061` | draft |  |  | save not confirmed |
| T3-?41 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:1062` | draft |  |  | save not confirmed |
| T3-?42 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:1112` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?43 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:1113` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?44 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:1114` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?45 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:1115` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?46 | T3 |  |  | `test/sessions/T3/T3-4-1/console.jsonl:69` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T3-?47 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:1117` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?48 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:1118` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?49 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:1119` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?50 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:1120` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?51 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:1121` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?52 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:1122` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?53 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:1123` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?54 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:1124` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?55 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:1125` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?56 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:1126` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?57 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:1127` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?58 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:1128` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?59 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:1129` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?60 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:1130` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?61 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:1131` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?62 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:1132` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?63 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:1133` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?64 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:1134` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?65 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:1135` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?66 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:1136` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?67 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:1137` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?68 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:1138` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?69 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:1139` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?70 | T3 |  |  | `test/sessions/T3/T3-4-1/journal.jsonl:1140` | draft |  |  | judge memoryPairs fell back (busy) |

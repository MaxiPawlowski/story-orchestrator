# Findings draft: T1-7

Session `test/sessions/T1/T1-7-1`. Draft rows for `docs/plans/v2.6/14-findings.md`; severity and class are decided in the review.

## Counts

- flags: 7
- stall: 0
- extraction-rejected: 2
- empty-private-block: 1
- lore-force-lost: 0
- lore-constant-missed: 0
- judge-fallback: 82
- save-lost: 0
- unexpected-jump: 2
- rollback: 24
- console-error: 10
- model-call-failure: 0
- model-defect: 3
- harness-error: 0

## Judge health

- calls: 602 (answered 520, busy 75, timeout 7, other fallbacks 0)
- busy rate: 12.5% (by use: memoryPairs 49, lore 9, typed 5, memoryVerify 4, curatorFilter 4, wardenLore 3, director 1)
- a busy fallback was never sent: the lane's judge rate limit (or a TypeSafe 429 passed through) held it, and the consumer took its no-judge path

## Model defects

- 2 turn(s) with a defective reply: loop 2, corrupt 1; swiped once by the loop guard: 2

## Flags

### 2026-10-01T17:34:59.588Z (message 2)

- note: model defect: corrupt
- evidence: `journal.jsonl:94`
- context (end-of-session):
  - #0 Adolion Narrator: You came to Aegis City to make a name with a blade, a bow or a spell, and three days ago you signed the Adventurers' Guild register to do it. Your Guild badge is new, your purse is light, and you have no party yet. The Guild sends no one out alone.  Today the hall is loud enough to be heard from the
  - #1 Max Nightriver: Tobias, what's on the board that pays and won't get us killed?
  - **#2 Tobias: "Good to see you again, and that would be the..." He gestures at the board, "Troll bridge in the southwest, or perhaps the rats in the cellars of the Old Market. Low risk, steady pay. Although..." He hesitates, his ocean blue eyes meeting yours for a moment before looking back at the notices, "You h**
  - #3 Max Nightriver: Show us the Wendhope posting. What's the catch?
  - #4 Tobias: *He straightens in his posture, pulling the notice from the board as if the action itself could make it clearer.* "The notice simply states: Investigate Wendhope, the mining village in the north has sent no ore or news for weeks. Go there, find out what happened, fix it if possible, and return." *He
  - #5 Max Nightriver: We take Wendhope. Write us down as the Iron Kettles.

### 2026-10-01T17:45:12.118Z (message 3)

- note: msg 1: 'put our names down for the C-rank exam' (the card's sample line) held as a commitment x3 (journal.jsonl:683/701/713): the trigger phrase is the matched verb itself, so it is not counted as 'about' the value; Vallie confirms 'You're on the list' but the story stays at Homecoming. Same as T1-4 msg 12.
- evidence: `journal.jsonl:723`
- context (event-time):
  - #0 Adolion Narrator: The Guild hall in Aegis City has barely settled after the party's return when Vallie appears on the stairs with an announcement: the Guild will put you forward for the C-rank exam. Domas follows her with the terms in writing, and Ellie has already laid out the forms. Tobias watches from behind the c
  - #1 Max Nightriver: Vallie, put our names down for the C-rank exam.
  - #2 Vallie: "Done. You're on the list." *The one-eyed Guildmaster grins as she makes a mark on a scroll with a thick pen, her scarred hand gripping the quill as if it were a weapon. She steps back, blue eye glinting as she studies the names.* *The sound of the quill scraping against parchment fills the air as D
  - **#3 Domas: "A week's preparation time starts now." *His voice is measured, calm as a storm before it breaks.* "You will be assigned a C-rank quest. We will choose the posting. You will not know which one it is until the day of the exam." *He pauses, red eyes tracking the party's faces.* "And you will be observ**

### 2026-10-01T18:00:26.642Z (message 19)

- note: msg 19 (also msg 17): Belle's reply trails into ~12 one-line mood fillers ('This is what it's all about.' 'Let's see what we can find.'); Fiana's msg 17 the same ('Make it count.'). Not a loop, but the 'no mood filler' fix does not hold here.
- evidence: `journal.jsonl:1351`
- context (event-time):
  - #16 Max Nightriver: Thanks, Fiana. We'll turn in early. Tomorrow morning we head to the Market District to get ready for the exam.
  - #17 Fiana: "Turn in early? Honey, it's barely evening." *She glances at them, her blue eyes sparkling with amusement.* "But if you say so." *She grins, then waves her hand as she heads back toward the bar.* "Get some rest. You'll need it for tomorrow." *She turns and moves off, her red hair bouncing as she dis
  - #18 Max Nightriver: Morning. We walk down Market Street looking for a smith and a potion seller. Belle, keep your axe on your back.
  - **#19 Belle: "Tsk, you're such a worrywart." *Belle rolls her eyes as she adjusts the strap across her back, making sure Cleaver sits comfortably.* "But fine. Don't want to be scaring off the shopkeepers." *She walks beside them, her long black hair swaying with each step, brown eyes scanning the Market District**

### 2026-10-01T18:03:44.164Z (message 21)

- note: msg 21: narrator reply runs to the token cap in one-line fragments and voices Alarise and Konako itself (both are cast members); the talk log picked Alarise for the next voice but she never generated.
- evidence: `journal.jsonl:1388`
- context (event-time):
  - #18 Max Nightriver: Morning. We walk down Market Street looking for a smith and a potion seller. Belle, keep your axe on your back.
  - #19 Belle: "Tsk, you're such a worrywart." *Belle rolls her eyes as she adjusts the strap across her back, making sure Cleaver sits comfortably.* "But fine. Don't want to be scaring off the shopkeepers." *She walks beside them, her long black hair swaying with each step, brown eyes scanning the Market District
  - #20 Max Nightriver: Let's find the smith first. Excuse me, which way to the forge?
  - **#21 Adolion Narrator: A fruit vendor with sun-darkened skin looks up from his pile of apples and points a finger toward a side alley. "Two alleys down, the third door on the right. Iron-Hearth Forge." *The vendor's gaze lingers on the party for a moment, before returning to his wares.* "Best in the Market District." *The**

### 2026-10-01T18:05:59.891Z (message 24)

- note: model defect: loop
- evidence: `journal.jsonl:1460`
- context (end-of-session):
  - #21 Adolion Narrator: A fruit vendor with sun-darkened skin looks up from his pile of apples and points a finger toward a side alley. "Two alleys down, the third door on the right. Iron-Hearth Forge." *The vendor's gaze lingers on the party for a moment, before returning to his wares.* "Best in the Market District." *The
  - #22 Max Nightriver: Hey! Let her go. Belle, Dalan, with me.
  - #23 Belle: "On it!" *Belle's grin is sharp as she shifts her weight, the axe already in her grip as she steps forward.* "You want her, Konako? You're gonna have to go through me first." *She doesn't wait for an answer, her brown eyes narrowing as she looks Konako down.* "Let's see if you've got any bite to mat
  - **#24 Dalan: *Dalan's fingers have already drawn an arrow from his quiver, his hands steady and calm as his eyes lock on the figure in the shadows.* "Alarise, get clear." *His voice is soft but clear, and it carries over the sound of Belle's axe clashing against Konako's blades.* *He levels his bow, the arrowhea**
  - #25 Adolion Narrator: A cutpurse bumps into Belle and is gone into the crowd before anyone checks a belt pouch.

### 2026-10-01T18:08:00.692Z (message 25)

- note: msgs 23-24: both replies degenerate ('And the fight continues.' x5; Dalan 'And as.' x~30 to the cap). Loop guard flagged both (modelDefects) but nothing was swiped or repaired in the chat (autoRepair).
- evidence: `journal.jsonl:1493`
- context (event-time):
  - #22 Max Nightriver: Hey! Let her go. Belle, Dalan, with me.
  - #23 Belle: "On it!" *Belle's grin is sharp as she shifts her weight, the axe already in her grip as she steps forward.* "You want her, Konako? You're gonna have to go through me first." *She doesn't wait for an answer, her brown eyes narrowing as she looks Konako down.* "Let's see if you've got any bite to mat
  - #24 Dalan: *Dalan's fingers have already drawn an arrow from his quiver, his hands steady and calm as his eyes lock on the figure in the shadows.* "Alarise, get clear." *His voice is soft but clear, and it carries over the sound of Belle's axe clashing against Konako's blades.* *He levels his bow, the arrowhea
  - **#25 Adolion Narrator: A cutpurse bumps into Belle and is gone into the crowd before anyone checks a belt pouch.**

### 2026-10-01T18:08:42.662Z (message 25)

- note: Correction to my previous flag: the loop guard DID swipe msg 24 (autoRepair swiped:true), but the new swipe loops too ('And he waits.' x~20 to the cap, swipe_id 1); Belle's msg 23 loop was not last so it stays in the chat.
- evidence: `journal.jsonl:1494`
- context (event-time):
  - #22 Max Nightriver: Hey! Let her go. Belle, Dalan, with me.
  - #23 Belle: "On it!" *Belle's grin is sharp as she shifts her weight, the axe already in her grip as she steps forward.* "You want her, Konako? You're gonna have to go through me first." *She doesn't wait for an answer, her brown eyes narrowing as she looks Konako down.* "Let's see if you've got any bite to mat
  - #24 Dalan: *Dalan's fingers have already drawn an arrow from his quiver, his hands steady and calm as his eyes lock on the figure in the shadows.* "Alarise, get clear." *His voice is soft but clear, and it carries over the sound of Belle's axe clashing against Konako's blades.* *He levels his bow, the arrowhea
  - **#25 Adolion Narrator: A cutpurse bumps into Belle and is gone into the crowd before anyone checks a belt pouch.**

## Anomalies

### extraction-rejected (2)

- 2026-10-01T17:57:13.841Z 1 extraction line(s) rejected: DELTA q=location value="north_road" evidence="We set out on the north road." (evidence only in the player's line) (`journal.jsonl:1246`)
- 2026-10-01T17:58:31.116Z 1 extraction line(s) rejected: DELTA q=location value="aegis_market" evidence="Tomorrow morning we head to the Market District to get ready for the exam." (evidence only in the player's line) (`journal.jsonl:1303`)

### empty-private-block (1)

- 2026-10-01T17:57:48.518Z Fiana was drafted in 2026-10-01@14h33m14s529ms at boundary 10 with no private block while holding 5 private entries acquired before it (`payloads.jsonl:141`)

### judge-fallback (82)

- 2026-10-01T17:41:07.997Z judge lore fell back (busy) (`journal.jsonl:284`)
- 2026-10-01T17:41:07.997Z judge lore fell back (busy) (`journal.jsonl:285`)
- 2026-10-01T17:41:07.997Z judge lore fell back (busy) (`journal.jsonl:286`)
- 2026-10-01T17:41:07.997Z judge lore fell back (busy) (`journal.jsonl:566`)
- 2026-10-01T17:41:07.997Z judge lore fell back (busy) (`journal.jsonl:567`)
- 2026-10-01T17:41:07.997Z judge lore fell back (busy) (`journal.jsonl:568`)
- 2026-10-01T17:41:14.227Z judge typed fell back (busy) (`journal.jsonl:289`)
- 2026-10-01T17:41:14.227Z judge typed fell back (busy) (`journal.jsonl:571`)
- 2026-10-01T17:41:16.759Z judge memoryVerify fell back (busy) (`journal.jsonl:291`)
- 2026-10-01T17:41:16.759Z judge memoryVerify fell back (busy) (`journal.jsonl:576`)
- 2026-10-01T17:41:41.048Z judge memoryVerify fell back (busy) (`journal.jsonl:314`)
- 2026-10-01T17:41:41.048Z judge memoryVerify fell back (busy) (`journal.jsonl:597`)
- 2026-10-01T17:42:01.490Z judge memoryPairs fell back (busy) (`journal.jsonl:335`)
- 2026-10-01T17:42:01.490Z judge memoryPairs fell back (busy) (`journal.jsonl:336`)
- 2026-10-01T17:42:01.490Z judge memoryPairs fell back (busy) (`journal.jsonl:610`)
- 2026-10-01T17:42:01.490Z judge memoryPairs fell back (busy) (`journal.jsonl:611`)
- 2026-10-01T17:42:01.491Z judge memoryPairs fell back (busy) (`journal.jsonl:337`)
- 2026-10-01T17:42:01.491Z judge memoryPairs fell back (busy) (`journal.jsonl:612`)
- 2026-10-01T17:42:01.492Z judge memoryPairs fell back (busy) (`journal.jsonl:338`)
- 2026-10-01T17:42:01.492Z judge memoryPairs fell back (busy) (`journal.jsonl:613`)
- 2026-10-01T17:42:01.493Z judge memoryPairs fell back (busy) (`journal.jsonl:339`)
- 2026-10-01T17:42:01.493Z judge memoryPairs fell back (busy) (`journal.jsonl:340`)
- 2026-10-01T17:42:01.493Z judge memoryPairs fell back (busy) (`journal.jsonl:341`)
- 2026-10-01T17:42:01.493Z judge memoryPairs fell back (busy) (`journal.jsonl:342`)
- 2026-10-01T17:42:01.493Z judge memoryPairs fell back (busy) (`journal.jsonl:343`)
- 2026-10-01T17:42:01.493Z judge memoryPairs fell back (busy) (`journal.jsonl:344`)
- 2026-10-01T17:42:01.493Z judge memoryPairs fell back (busy) (`journal.jsonl:345`)
- 2026-10-01T17:42:01.493Z judge memoryPairs fell back (busy) (`journal.jsonl:346`)
- 2026-10-01T17:42:01.493Z judge memoryPairs fell back (busy) (`journal.jsonl:614`)
- 2026-10-01T17:42:01.493Z judge memoryPairs fell back (busy) (`journal.jsonl:615`)
- 2026-10-01T17:42:01.493Z judge memoryPairs fell back (busy) (`journal.jsonl:616`)
- 2026-10-01T17:42:01.493Z judge memoryPairs fell back (busy) (`journal.jsonl:617`)
- 2026-10-01T17:42:01.493Z judge memoryPairs fell back (busy) (`journal.jsonl:618`)
- 2026-10-01T17:42:01.493Z judge memoryPairs fell back (busy) (`journal.jsonl:619`)
- 2026-10-01T17:42:01.493Z judge memoryPairs fell back (busy) (`journal.jsonl:620`)
- 2026-10-01T17:42:01.493Z judge memoryPairs fell back (busy) (`journal.jsonl:621`)
- 2026-10-01T17:42:01.494Z judge memoryPairs fell back (busy) (`journal.jsonl:347`)
- 2026-10-01T17:42:01.494Z judge memoryPairs fell back (busy) (`journal.jsonl:622`)
- 2026-10-01T17:42:25.598Z judge memoryPairs fell back (busy) (`journal.jsonl:362`)
- 2026-10-01T17:42:25.598Z judge memoryPairs fell back (busy) (`journal.jsonl:363`)
- 2026-10-01T17:42:25.598Z judge memoryPairs fell back (busy) (`journal.jsonl:630`)
- 2026-10-01T17:42:25.598Z judge memoryPairs fell back (busy) (`journal.jsonl:631`)
- 2026-10-01T17:42:25.735Z judge memoryPairs fell back (busy) (`journal.jsonl:365`)
- 2026-10-01T17:42:25.735Z judge memoryPairs fell back (busy) (`journal.jsonl:633`)
- 2026-10-01T17:42:25.736Z judge memoryPairs fell back (busy) (`journal.jsonl:366`)
- 2026-10-01T17:42:25.736Z judge memoryPairs fell back (busy) (`journal.jsonl:367`)
- 2026-10-01T17:42:25.736Z judge memoryPairs fell back (busy) (`journal.jsonl:634`)
- 2026-10-01T17:42:25.736Z judge memoryPairs fell back (busy) (`journal.jsonl:635`)
- 2026-10-01T17:42:29.456Z judge curatorFilter fell back (busy) (`journal.jsonl:369`)
- 2026-10-01T17:42:29.456Z judge curatorFilter fell back (busy) (`journal.jsonl:637`)
- 2026-10-01T17:42:30.800Z judge curatorFilter fell back (busy) (`journal.jsonl:372`)
- 2026-10-01T17:42:30.800Z judge curatorFilter fell back (busy) (`journal.jsonl:640`)
- 2026-10-01T17:54:58.952Z judge scene fell back (timeout) (`journal.jsonl:903`)
- 2026-10-01T17:54:58.952Z judge scene fell back (timeout) (`journal.jsonl:1149`)
- 2026-10-01T17:54:59.373Z judge wardenLore fell back (busy) (`journal.jsonl:904`)
- 2026-10-01T17:54:59.373Z judge wardenLore fell back (busy) (`journal.jsonl:1150`)
- 2026-10-01T17:54:59.767Z judge typed fell back (busy) (`journal.jsonl:906`)
- 2026-10-01T17:54:59.767Z judge typed fell back (busy) (`journal.jsonl:1152`)
- 2026-10-01T17:55:38.187Z judge lore fell back (timeout) (`journal.jsonl:1188`)
- 2026-10-01T17:55:38.196Z judge lore fell back (timeout) (`journal.jsonl:1189`)
- 2026-10-01T17:55:38.374Z judge lore fell back (busy) (`journal.jsonl:1190`)
- 2026-10-01T17:55:38.374Z judge lore fell back (busy) (`journal.jsonl:1191`)
- 2026-10-01T17:55:38.388Z judge lore fell back (busy) (`journal.jsonl:1192`)
- 2026-10-01T17:55:38.399Z judge director fell back (busy) (`journal.jsonl:1194`)
- 2026-10-01T17:55:47.708Z judge memoryPairs fell back (busy) (`journal.jsonl:1198`)
- 2026-10-01T17:55:47.708Z judge memoryPairs fell back (busy) (`journal.jsonl:1199`)
- 2026-10-01T17:55:47.708Z judge memoryPairs fell back (busy) (`journal.jsonl:1200`)
- 2026-10-01T17:55:47.708Z judge memoryPairs fell back (busy) (`journal.jsonl:1201`)
- 2026-10-01T17:55:47.740Z judge memoryPairs fell back (busy) (`journal.jsonl:1203`)
- 2026-10-01T17:55:47.740Z judge memoryPairs fell back (busy) (`journal.jsonl:1204`)
- 2026-10-01T17:55:47.740Z judge memoryPairs fell back (busy) (`journal.jsonl:1205`)
- 2026-10-01T17:55:47.740Z judge memoryPairs fell back (busy) (`journal.jsonl:1206`)
- 2026-10-01T17:55:47.740Z judge memoryPairs fell back (busy) (`journal.jsonl:1207`)
- 2026-10-01T17:55:47.740Z judge memoryPairs fell back (busy) (`journal.jsonl:1208`)
- 2026-10-01T17:55:47.740Z judge memoryPairs fell back (busy) (`journal.jsonl:1209`)
- 2026-10-01T17:55:47.740Z judge memoryPairs fell back (busy) (`journal.jsonl:1210`)
- 2026-10-01T17:55:47.741Z judge memoryPairs fell back (busy) (`journal.jsonl:1211`)
- 2026-10-01T18:02:09.972Z judge scene fell back (timeout) (`journal.jsonl:1369`)
- 2026-10-01T18:05:28.314Z judge scene fell back (timeout) (`journal.jsonl:1430`)
- 2026-10-01T18:05:29.824Z judge warden fell back (timeout) (`journal.jsonl:1431`)
- 2026-10-01T18:05:31.776Z judge wardenLore fell back (busy) (`journal.jsonl:1432`)
- 2026-10-01T18:05:31.919Z judge typed fell back (busy) (`journal.jsonl:1433`)

### unexpected-jump (2)

- 2026-10-01T17:39:11.506Z guild-hall → road-to-wendhope is not an authored transition (a generated route?) (`journal.jsonl:498`)
- 2026-10-01T17:39:11.506Z guild-hall → road-to-wendhope is not an authored transition (a generated route?) (`journal.jsonl:205`)

### rollback (24)

- 2026-10-01T17:34:41.562Z boundary went back from 10 to 2 (`journal.jsonl:419`)
- 2026-10-01T17:35:39.556Z boundary went back from 10 to 3 (`journal.jsonl:424`)
- 2026-10-01T17:36:54.071Z boundary went back from 10 to 4 (`journal.jsonl:449`)
- 2026-10-01T17:37:47.411Z boundary went back from 10 to 5 (`journal.jsonl:463`)
- 2026-10-01T17:39:11.506Z boundary went back from 10 to 6 (`journal.jsonl:497`)
- 2026-10-01T17:40:21.739Z boundary went back from 10 to 7 (`journal.jsonl:530`)
- 2026-10-01T17:41:07.152Z boundary went back from 10 to 8 (`journal.jsonl:556`)
- 2026-10-01T17:41:32.676Z boundary went back from 10 to 9 (`journal.jsonl:583`)
- 2026-10-01T17:43:50.413Z boundary went back from 10 to 2 (`journal.jsonl:666`)
- 2026-10-01T17:43:50.413Z boundary went back from 10 to 2 (`journal.jsonl:966`)
- 2026-10-01T17:44:39.009Z boundary went back from 10 to 3 (`journal.jsonl:694`)
- 2026-10-01T17:44:39.009Z boundary went back from 10 to 3 (`journal.jsonl:988`)
- 2026-10-01T17:45:56.706Z boundary went back from 10 to 4 (`journal.jsonl:735`)
- 2026-10-01T17:45:56.706Z boundary went back from 10 to 4 (`journal.jsonl:1016`)
- 2026-10-01T17:47:16.115Z boundary went back from 10 to 5 (`journal.jsonl:754`)
- 2026-10-01T17:47:16.115Z boundary went back from 10 to 5 (`journal.jsonl:1030`)
- 2026-10-01T17:48:44.238Z boundary went back from 10 to 6 (`journal.jsonl:795`)
- 2026-10-01T17:48:44.238Z boundary went back from 10 to 6 (`journal.jsonl:1061`)
- 2026-10-01T17:50:40.095Z boundary went back from 10 to 7 (`journal.jsonl:836`)
- 2026-10-01T17:50:40.095Z boundary went back from 10 to 7 (`journal.jsonl:1093`)
- 2026-10-01T17:50:40.492Z boundary went back from 10 to 8 (`journal.jsonl:840`)
- 2026-10-01T17:50:40.492Z boundary went back from 10 to 8 (`journal.jsonl:1097`)
- 2026-10-01T17:51:46.359Z boundary went back from 10 to 9 (`journal.jsonl:865`)
- 2026-10-01T17:51:46.359Z boundary went back from 10 to 9 (`journal.jsonl:1116`)

### console-error (10)

- 2026-10-01T17:41:08.014Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:122`)
- 2026-10-01T17:41:41.049Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:126`)
- 2026-10-01T17:42:01.491Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:130`)
- 2026-10-01T17:42:01.492Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:131`)
- 2026-10-01T17:42:25.599Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:135`)
- 2026-10-01T17:54:59.374Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:260`)
- 2026-10-01T17:55:38.375Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:375`)
- 2026-10-01T17:55:38.388Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:376`)
- 2026-10-01T17:55:47.708Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:377`)
- 2026-10-01T18:05:31.776Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:504`)

### model-defect (3)

- 2026-10-01T17:33:43.619Z model corrupt in message 2 (Tobias): ild hall.* "And as you wish, I can show you you what is on the board, but I am afraid I (swiped once) (`turns.jsonl:1`)
- 2026-10-01T18:03:46.308Z model loop in message 23 (Belle): *And the fight continues.* (x3) (swiped once) (`turns.jsonl:22`)
- 2026-10-01T18:03:46.308Z model loop in message 24 (Dalan): arrow points toward konako (x10) (swiped once) (`turns.jsonl:22`)

## Draft register rows

| id | tier | severity | class | evidence | status | fix commit | eval | what |
|---|---|---|---|---|---|---|---|---|
| T1-?1 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:94` | draft |  |  | model defect: corrupt |
| T1-?2 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:723` | draft |  |  | msg 1: 'put our names down for the C-rank exam' (the card's sample line) held as a commitment x3 (journal.jsonl:683/701/713): the trigger phrase is the matched verb itself, so it is not counted as 'about' the value; Vallie confirms 'You're on the list' but the story stays at Homecoming. Same as T1-4 msg 12. |
| T1-?3 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1351` | draft |  |  | msg 19 (also msg 17): Belle's reply trails into ~12 one-line mood fillers ('This is what it's all about.' 'Let's see what we can find.'); Fiana's msg 17 the same ('Make it count.'). Not a loop, but the 'no mood filler' fix does not hold here. |
| T1-?4 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1388` | draft |  |  | msg 21: narrator reply runs to the token cap in one-line fragments and voices Alarise and Konako itself (both are cast members); the talk log picked Alarise for the next voice but she never generated. |
| T1-?5 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1460` | draft |  |  | model defect: loop |
| T1-?6 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1493` | draft |  |  | msgs 23-24: both replies degenerate ('And the fight continues.' x5; Dalan 'And as.' x~30 to the cap). Loop guard flagged both (modelDefects) but nothing was swiped or repaired in the chat (autoRepair). |
| T1-?7 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1494` | draft |  |  | Correction to my previous flag: the loop guard DID swipe msg 24 (autoRepair swiped:true), but the new swipe loops too ('And he waits.' x~20 to the cap, swipe_id 1); Belle's msg 23 loop was not last so it stays in the chat. |
| T1-?8 | T1 |  |  | `test/sessions/T1/T1-7-1/turns.jsonl:1` | draft |  |  | model corrupt in message 2 (Tobias): ild hall.* "And as you wish, I can show you you what is on the board, but I am afraid I (swiped once) |
| T1-?9 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:419` | draft |  |  | boundary went back from 10 to 2 |
| T1-?10 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:424` | draft |  |  | boundary went back from 10 to 3 |
| T1-?11 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:449` | draft |  |  | boundary went back from 10 to 4 |
| T1-?12 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:463` | draft |  |  | boundary went back from 10 to 5 |
| T1-?13 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:498` | draft |  |  | guild-hall → road-to-wendhope is not an authored transition (a generated route?) |
| T1-?14 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:205` | draft |  |  | guild-hall → road-to-wendhope is not an authored transition (a generated route?) |
| T1-?15 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:497` | draft |  |  | boundary went back from 10 to 6 |
| T1-?16 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:530` | draft |  |  | boundary went back from 10 to 7 |
| T1-?17 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:556` | draft |  |  | boundary went back from 10 to 8 |
| T1-?18 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:284` | draft |  |  | judge lore fell back (busy) |
| T1-?19 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:285` | draft |  |  | judge lore fell back (busy) |
| T1-?20 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:286` | draft |  |  | judge lore fell back (busy) |
| T1-?21 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:566` | draft |  |  | judge lore fell back (busy) |
| T1-?22 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:567` | draft |  |  | judge lore fell back (busy) |
| T1-?23 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:568` | draft |  |  | judge lore fell back (busy) |
| T1-?24 | T1 |  |  | `test/sessions/T1/T1-7-1/console.jsonl:122` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?25 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:289` | draft |  |  | judge typed fell back (busy) |
| T1-?26 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:571` | draft |  |  | judge typed fell back (busy) |
| T1-?27 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:291` | draft |  |  | judge memoryVerify fell back (busy) |
| T1-?28 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:576` | draft |  |  | judge memoryVerify fell back (busy) |
| T1-?29 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:583` | draft |  |  | boundary went back from 10 to 9 |
| T1-?30 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:314` | draft |  |  | judge memoryVerify fell back (busy) |
| T1-?31 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:597` | draft |  |  | judge memoryVerify fell back (busy) |
| T1-?32 | T1 |  |  | `test/sessions/T1/T1-7-1/console.jsonl:126` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?33 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:335` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?34 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:336` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?35 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:610` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?36 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:611` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?37 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:337` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?38 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:612` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?39 | T1 |  |  | `test/sessions/T1/T1-7-1/console.jsonl:130` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?40 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:338` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?41 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:613` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?42 | T1 |  |  | `test/sessions/T1/T1-7-1/console.jsonl:131` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?43 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:339` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?44 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:340` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?45 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:341` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?46 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:342` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?47 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:343` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?48 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:344` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?49 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:345` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?50 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:346` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?51 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:614` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?52 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:615` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?53 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:616` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?54 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:617` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?55 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:618` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?56 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:619` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?57 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:620` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?58 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:621` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?59 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:347` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?60 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:622` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?61 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:362` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?62 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:363` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?63 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:630` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?64 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:631` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?65 | T1 |  |  | `test/sessions/T1/T1-7-1/console.jsonl:135` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?66 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:365` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?67 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:633` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?68 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:366` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?69 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:367` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?70 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:634` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?71 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:635` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?72 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:369` | draft |  |  | judge curatorFilter fell back (busy) |
| T1-?73 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:637` | draft |  |  | judge curatorFilter fell back (busy) |
| T1-?74 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:372` | draft |  |  | judge curatorFilter fell back (busy) |
| T1-?75 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:640` | draft |  |  | judge curatorFilter fell back (busy) |
| T1-?76 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:666` | draft |  |  | boundary went back from 10 to 2 |
| T1-?77 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:966` | draft |  |  | boundary went back from 10 to 2 |
| T1-?78 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:694` | draft |  |  | boundary went back from 10 to 3 |
| T1-?79 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:988` | draft |  |  | boundary went back from 10 to 3 |
| T1-?80 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:735` | draft |  |  | boundary went back from 10 to 4 |
| T1-?81 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1016` | draft |  |  | boundary went back from 10 to 4 |
| T1-?82 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:754` | draft |  |  | boundary went back from 10 to 5 |
| T1-?83 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1030` | draft |  |  | boundary went back from 10 to 5 |
| T1-?84 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:795` | draft |  |  | boundary went back from 10 to 6 |
| T1-?85 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1061` | draft |  |  | boundary went back from 10 to 6 |
| T1-?86 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:836` | draft |  |  | boundary went back from 10 to 7 |
| T1-?87 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1093` | draft |  |  | boundary went back from 10 to 7 |
| T1-?88 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:840` | draft |  |  | boundary went back from 10 to 8 |
| T1-?89 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1097` | draft |  |  | boundary went back from 10 to 8 |
| T1-?90 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:865` | draft |  |  | boundary went back from 10 to 9 |
| T1-?91 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1116` | draft |  |  | boundary went back from 10 to 9 |
| T1-?92 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:903` | draft |  |  | judge scene fell back (timeout) |
| T1-?93 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1149` | draft |  |  | judge scene fell back (timeout) |
| T1-?94 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:904` | draft |  |  | judge wardenLore fell back (busy) |
| T1-?95 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1150` | draft |  |  | judge wardenLore fell back (busy) |
| T1-?96 | T1 |  |  | `test/sessions/T1/T1-7-1/console.jsonl:260` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?97 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:906` | draft |  |  | judge typed fell back (busy) |
| T1-?98 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1152` | draft |  |  | judge typed fell back (busy) |
| T1-?99 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1188` | draft |  |  | judge lore fell back (timeout) |
| T1-?100 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1189` | draft |  |  | judge lore fell back (timeout) |
| T1-?101 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1190` | draft |  |  | judge lore fell back (busy) |
| T1-?102 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1191` | draft |  |  | judge lore fell back (busy) |
| T1-?103 | T1 |  |  | `test/sessions/T1/T1-7-1/console.jsonl:375` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?104 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1192` | draft |  |  | judge lore fell back (busy) |
| T1-?105 | T1 |  |  | `test/sessions/T1/T1-7-1/console.jsonl:376` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?106 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1194` | draft |  |  | judge director fell back (busy) |
| T1-?107 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1198` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?108 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1199` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?109 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1200` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?110 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1201` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?111 | T1 |  |  | `test/sessions/T1/T1-7-1/console.jsonl:377` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?112 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1203` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?113 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1204` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?114 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1205` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?115 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1206` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?116 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1207` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?117 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1208` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?118 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1209` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?119 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1210` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?120 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1211` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?121 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1246` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="north_road" evidence="We set out on the north road." (evidence only in the player's line) |
| T1-?122 | T1 |  |  | `test/sessions/T1/T1-7-1/payloads.jsonl:141` | draft |  |  | Fiana was drafted in 2026-10-01@14h33m14s529ms at boundary 10 with no private block while holding 5 private entries acquired before it |
| T1-?123 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1303` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="aegis_market" evidence="Tomorrow morning we head to the Market District to get ready for the exam." (evidence only in the player's line) |
| T1-?124 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1369` | draft |  |  | judge scene fell back (timeout) |
| T1-?125 | T1 |  |  | `test/sessions/T1/T1-7-1/turns.jsonl:22` | draft |  |  | model loop in message 23 (Belle): *And the fight continues.* (x3) (swiped once) |
| T1-?126 | T1 |  |  | `test/sessions/T1/T1-7-1/turns.jsonl:22` | draft |  |  | model loop in message 24 (Dalan): arrow points toward konako (x10) (swiped once) |
| T1-?127 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1430` | draft |  |  | judge scene fell back (timeout) |
| T1-?128 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1431` | draft |  |  | judge warden fell back (timeout) |
| T1-?129 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1432` | draft |  |  | judge wardenLore fell back (busy) |
| T1-?130 | T1 |  |  | `test/sessions/T1/T1-7-1/console.jsonl:504` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?131 | T1 |  |  | `test/sessions/T1/T1-7-1/journal.jsonl:1433` | draft |  |  | judge typed fell back (busy) |

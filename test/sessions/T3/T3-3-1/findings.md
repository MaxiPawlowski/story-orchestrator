# Findings draft: T3-3

Session `test/sessions/T3/T3-3-1`. Draft rows for `docs/plans/v2.6/14-findings.md`; severity and class are decided in the review.

## Counts

- flags: 3
- stall: 1
- extraction-rejected: 9
- empty-private-block: 1
- lore-force-lost: 0
- lore-constant-missed: 0
- judge-fallback: 68
- save-lost: 0
- unexpected-jump: 0
- rollback: 0
- console-error: 4
- model-call-failure: 0
- model-defect: 0
- harness-error: 0

### By chat

- `2026-10-01@23h13m03s275ms`: extraction-rejected 9, judge-fallback 68, stall 1, empty-private-block 1
- `(no chat)`: console-error 4

## Judge health

- calls: 353 (answered 285, busy 60, timeout 8, other fallbacks 0)
- busy rate: 17.0% (by use: memoryPairs 54, curatorFilter 3, memoryVerify 2, typed 1)
- a busy fallback was never sent: the lane's judge rate limit (or a TypeSafe 429 passed through) held it, and the consumer took its no-judge path

## Model defects

None detected.

## Flags

### 2026-10-02T02:21:26.572Z (message 18)

- note: msg 18 Ren repeats the narrator's msg 17 closing beat almost verbatim (predatory stillness, hand tightens on hilt, leather creaking): chained-voice repetition. Also msg 15 'aconcerned' glued words, not caught as modelDefect.
- evidence: `journal.jsonl:429`
- context (event-time):
  - #15 Adolion Narrator: *The village elder stands near the edge of the crowd, his hands folded in a tight grip. When Max calls his name, he does not move closer, and for a long moment he does not speak.* *Reeve Tull finally steps forward into the lantern-light, his face etched with lines of fatigue and something else—guilt
  - #16 Max Nightriver: *I step close to Tull and keep my voice low.* You won't look at me, Reeve. A month, you say, yet there's fresh mud from her lane on your boots. You put it there, didn't you? Tell me why, and tell Ren, or I tell the whole square.
  - #17 Adolion Narrator: *Reeve Tull's gaze drops to his boots, where dark, clinging mud still marks the worn leather. He draws his shoulders up, and when he speaks, his voice has gone tight and thin.* "What good is the truth to a demon-bitch?" *The words are spat, not whispered. The villagers nearest to them lean in, their
  - **#18 Ren: *His blue eyes fix on Reeve Tull with predatory stillness, his head tilting slightly. The voice that comes from behind the steel mask is low and dangerous, carrying just far enough for the nearby villagers to catch.* "Reeve Tull. You will explain yourself." *His hand tightens on his longsword's hilt**

### 2026-10-02T02:29:02.440Z (message 30)

- note: Stall: we are inside Thornwood at Kayla's cabin (msgs 24/26/28 narrate the trees, mist, cabin), but night_in_thornwood=true and location=night_thornwood are rejected 5x as 'evidence only in the player's line' - the reader keeps quoting my msg 23 instead of the world replies. night_selena freed latched only once. Checkpoint stuck at The Accused.
- evidence: `journal.jsonl:709`
- context (event-time):
  - #27 Max Nightriver: *I head for the glow in the windows and knock on the cabin door.* Hello? We mean no harm. We need shelter till dawn.
  - #28 Adolion Narrator: *The door doesn't wait for another knock—it swings open on creaking hinges before the words have fully left Max's lips. Standing in the threshold is a woman with pale blue eyes and raven-black hair, a skull earring glinting in the yellow light that spills from behind her.* *Kayla Thornwood looks the
  - #29 Max Nightriver: Expecting us? Fine. Kayla, what's in the lake?
  - **#30 Adolion Narrator: *Kayla's expression remains neutral as she closes the door and moves toward the hearth, where a pot of something dark and thick is already simmering. She doesn't look at him when she speaks.* "The lake holds secrets for those who seek them. And for those who pay for them." *Her gaze shifts to Selena**

### 2026-10-02T02:31:50.572Z (message 34)

- note: Reached The Witch of Thornwood (stop condition). msg 34 Kayla asks Selena 'What did those Inquisitors try to do to you in that room?' - Kayla was never told anything happened in a room (possible knew-too-much, or seer licence). Transition fired only at boundary after msg 34 via cadence read.
- evidence: `journal.jsonl:893`
- context (event-time):
  - #31 Max Nightriver: *I sip the brew and watch her.* Selena, sit by the fire. Kayla, how did you know we were coming?
  - #32 Adolion Narrator: *The brew is bitter, leaving a metallic tang on Max's tongue, but a slow warmth begins to spread through his limbs.* *Kayla leans against the hearth, the firelight casting long shadows across her face as she watches the steam rise from the pot.* "A woman doesn't survive in Thornwood by waiting for t
  - #33 Selena: *She pulls her knees up to her chest as she settles near the hearth, her spade-tipped tail curling protectively around her ankle. The firelight makes her ruby-red eyes shimmer, and for the first time since being freed, she doesn't flinch when someone's gaze rests on her.* "A noble's shadow..." *she 
  - **#34 Kayla: *She lets out a dry, amused sound that might be a laugh, though her expression doesn't change.* "Rumors are the currency of the scared, darling. They make me out to be a demon because it's easier than admitting a woman can live in the dark and survive it." *She looks directly at Selena, her pale blu**

## Anomalies

### stall (1)

- 2026-10-02T02:21:10.163Z 10 boundaries without a transition at night-the-accused while its exits were pending (`journal.jsonl:422`)

### extraction-rejected (9)

- 2026-10-02T02:14:36.351Z 1 extraction line(s) rejected: FACT importance=2 text="Ren Calwisk has declared Selena Forestsong will burn at first light and invited anyone to speak for her, but nobody in Glasnoa moved." evidence="the witch Selena Forestsong will burn at first light. If any here would speak for her, speak now, and give me your name." Nobody in Glasnoa moves. (unrecognized line) (`journal.jsonl:133`)
- 2026-10-02T02:23:11.692Z 1 extraction line(s) rejected: DELTA q=night_selena value="freed" evidence="Past midnight, while the watch dozes, I slip into the tithe barn, break Selena's chains with a crowbar and lead her out the back, west toward the dark line of Thornwood." (evidence only in the player's line) (`journal.jsonl:528`)
- 2026-10-02T02:23:20.470Z 1 extraction line(s) rejected: DELTA q=night_selena value="freed" evidence="I slip into the tithe barn, break Selena's chains with a crowbar and lead her out the back, west toward the dark line of Thornwood." (evidence only in the player's line) (`journal.jsonl:538`)
- 2026-10-02T02:24:25.432Z 2 extraction line(s) rejected: DELTA q=location value="night_thornwood" evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line); DELTA q=night_in_thornwood value=true evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line) (`journal.jsonl:573`)
- 2026-10-02T02:25:52.365Z 2 extraction line(s) rejected: DELTA q=location value="night_thornwood" evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line); DELTA q=night_in_thornwood value=true evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line) (`journal.jsonl:616`)
- 2026-10-02T02:26:01.469Z 2 extraction line(s) rejected: DELTA q=location value="night_thornwood" evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line); DELTA q=night_in_thornwood value=true evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line) (`journal.jsonl:629`)
- 2026-10-02T02:27:29.558Z 2 extraction line(s) rejected: DELTA q=location value="night_thornwood" evidence="*We push in under the first thorn trees, into the mist.* We're in." (evidence only in the player's line); DELTA q=night_in_thornwood value=true evidence="*We push in under the first thorn trees, into the mist.* We're in." (evidence only in the player's line) (`journal.jsonl:668`)
- 2026-10-02T02:27:36.524Z 3 extraction line(s) rejected: DELTA q=location value="night_thornwood" evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line); DELTA q=night_in_thornwood value=true evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line); DELTA q=night_selena value="freed" evidence="break Selena's chains with a crowbar and lead her out the back" (outside requested scope) (`journal.jsonl:676`)
- 2026-10-02T02:30:14.556Z 1 extraction line(s) rejected: DELTA q=night_in_thornwood value=true evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line) (`journal.jsonl:770`)

### empty-private-block (1)

- 2026-10-02T02:30:52.009Z Kayla was drafted in 2026-10-01@23h13m03s275ms at boundary 21 with no private block while holding 4 private entries acquired before it (`payloads.jsonl:152`)

### judge-fallback (68)

- 2026-10-02T02:17:03.209Z judge scene fell back (timeout) (`journal.jsonl:213`)
- 2026-10-02T02:18:02.126Z judge scene fell back (timeout) (`journal.jsonl:261`)
- 2026-10-02T02:18:51.489Z judge memoryPairs fell back (busy) (`journal.jsonl:310`)
- 2026-10-02T02:18:51.489Z judge memoryPairs fell back (busy) (`journal.jsonl:311`)
- 2026-10-02T02:18:51.489Z judge memoryPairs fell back (busy) (`journal.jsonl:312`)
- 2026-10-02T02:18:51.489Z judge memoryPairs fell back (busy) (`journal.jsonl:313`)
- 2026-10-02T02:18:51.489Z judge memoryPairs fell back (busy) (`journal.jsonl:314`)
- 2026-10-02T02:18:51.489Z judge memoryPairs fell back (busy) (`journal.jsonl:315`)
- 2026-10-02T02:18:51.489Z judge memoryPairs fell back (busy) (`journal.jsonl:316`)
- 2026-10-02T02:18:51.724Z judge memoryPairs fell back (busy) (`journal.jsonl:318`)
- 2026-10-02T02:18:51.724Z judge memoryPairs fell back (busy) (`journal.jsonl:319`)
- 2026-10-02T02:18:51.724Z judge memoryPairs fell back (busy) (`journal.jsonl:320`)
- 2026-10-02T02:18:51.724Z judge memoryPairs fell back (busy) (`journal.jsonl:321`)
- 2026-10-02T02:18:51.724Z judge memoryPairs fell back (busy) (`journal.jsonl:322`)
- 2026-10-02T02:18:51.724Z judge memoryPairs fell back (busy) (`journal.jsonl:323`)
- 2026-10-02T02:18:51.724Z judge memoryPairs fell back (busy) (`journal.jsonl:324`)
- 2026-10-02T02:18:51.724Z judge memoryPairs fell back (busy) (`journal.jsonl:325`)
- 2026-10-02T02:18:51.724Z judge memoryPairs fell back (busy) (`journal.jsonl:326`)
- 2026-10-02T02:21:13.298Z judge scene fell back (timeout) (`journal.jsonl:424`)
- 2026-10-02T02:25:45.857Z judge scene fell back (timeout) (`journal.jsonl:600`)
- 2026-10-02T02:29:51.825Z judge stall fell back (timeout) (`journal.jsonl:737`)
- 2026-10-02T02:29:52.887Z judge typed fell back (timeout) (`journal.jsonl:740`)
- 2026-10-02T02:29:54.333Z judge scene fell back (timeout) (`journal.jsonl:742`)
- 2026-10-02T02:30:34.416Z judge memoryPairs fell back (busy) (`journal.jsonl:800`)
- 2026-10-02T02:30:34.416Z judge memoryPairs fell back (busy) (`journal.jsonl:801`)
- 2026-10-02T02:30:34.416Z judge memoryPairs fell back (busy) (`journal.jsonl:802`)
- 2026-10-02T02:30:34.416Z judge memoryPairs fell back (busy) (`journal.jsonl:803`)
- 2026-10-02T02:30:34.416Z judge memoryPairs fell back (busy) (`journal.jsonl:804`)
- 2026-10-02T02:30:34.416Z judge memoryPairs fell back (busy) (`journal.jsonl:805`)
- 2026-10-02T02:30:34.416Z judge memoryPairs fell back (busy) (`journal.jsonl:806`)
- 2026-10-02T02:30:34.418Z judge memoryPairs fell back (busy) (`journal.jsonl:807`)
- 2026-10-02T02:30:34.418Z judge memoryPairs fell back (busy) (`journal.jsonl:808`)
- 2026-10-02T02:30:34.418Z judge memoryPairs fell back (busy) (`journal.jsonl:809`)
- 2026-10-02T02:30:34.418Z judge memoryPairs fell back (busy) (`journal.jsonl:810`)
- 2026-10-02T02:30:34.418Z judge memoryPairs fell back (busy) (`journal.jsonl:811`)
- 2026-10-02T02:30:34.418Z judge memoryPairs fell back (busy) (`journal.jsonl:812`)
- 2026-10-02T02:30:34.418Z judge memoryPairs fell back (busy) (`journal.jsonl:813`)
- 2026-10-02T02:30:35.702Z judge lore fell back (timeout) (`journal.jsonl:814`)
- 2026-10-02T02:31:19.577Z judge memoryPairs fell back (busy) (`journal.jsonl:836`)
- 2026-10-02T02:31:19.577Z judge memoryPairs fell back (busy) (`journal.jsonl:837`)
- 2026-10-02T02:31:19.577Z judge memoryPairs fell back (busy) (`journal.jsonl:838`)
- 2026-10-02T02:31:19.577Z judge memoryPairs fell back (busy) (`journal.jsonl:839`)
- 2026-10-02T02:31:19.577Z judge memoryPairs fell back (busy) (`journal.jsonl:840`)
- 2026-10-02T02:31:19.577Z judge memoryPairs fell back (busy) (`journal.jsonl:841`)
- 2026-10-02T02:31:19.577Z judge memoryPairs fell back (busy) (`journal.jsonl:842`)
- 2026-10-02T02:31:19.578Z judge memoryPairs fell back (busy) (`journal.jsonl:843`)
- 2026-10-02T02:31:19.580Z judge memoryPairs fell back (busy) (`journal.jsonl:844`)
- 2026-10-02T02:31:19.580Z judge memoryPairs fell back (busy) (`journal.jsonl:845`)
- 2026-10-02T02:31:19.580Z judge memoryPairs fell back (busy) (`journal.jsonl:846`)
- 2026-10-02T02:31:19.580Z judge memoryPairs fell back (busy) (`journal.jsonl:847`)
- 2026-10-02T02:31:19.580Z judge memoryPairs fell back (busy) (`journal.jsonl:848`)
- 2026-10-02T02:31:19.580Z judge memoryPairs fell back (busy) (`journal.jsonl:849`)
- 2026-10-02T02:31:19.580Z judge memoryPairs fell back (busy) (`journal.jsonl:850`)
- 2026-10-02T02:31:19.580Z judge memoryPairs fell back (busy) (`journal.jsonl:851`)
- 2026-10-02T02:31:19.581Z judge memoryPairs fell back (busy) (`journal.jsonl:852`)
- 2026-10-02T02:31:19.581Z judge memoryPairs fell back (busy) (`journal.jsonl:853`)
- 2026-10-02T02:31:19.581Z judge memoryPairs fell back (busy) (`journal.jsonl:854`)
- 2026-10-02T02:31:19.581Z judge memoryPairs fell back (busy) (`journal.jsonl:855`)
- 2026-10-02T02:31:19.581Z judge memoryPairs fell back (busy) (`journal.jsonl:856`)
- 2026-10-02T02:31:19.581Z judge memoryPairs fell back (busy) (`journal.jsonl:857`)
- 2026-10-02T02:31:19.581Z judge memoryPairs fell back (busy) (`journal.jsonl:858`)
- 2026-10-02T02:31:19.581Z judge memoryPairs fell back (busy) (`journal.jsonl:859`)
- 2026-10-02T02:31:21.729Z judge memoryVerify fell back (busy) (`journal.jsonl:861`)
- 2026-10-02T02:31:23.907Z judge curatorFilter fell back (busy) (`journal.jsonl:870`)
- 2026-10-02T02:31:25.274Z judge typed fell back (busy) (`journal.jsonl:872`)
- 2026-10-02T02:31:26.117Z judge curatorFilter fell back (busy) (`journal.jsonl:875`)
- 2026-10-02T02:31:27.359Z judge curatorFilter fell back (busy) (`journal.jsonl:878`)
- 2026-10-02T02:31:30.121Z judge memoryVerify fell back (busy) (`journal.jsonl:882`)

### console-error (4)

- 2026-10-02T02:18:51.492Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:13`)
- 2026-10-02T02:30:34.417Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:38`)
- 2026-10-02T02:31:19.577Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:42`)
- 2026-10-02T02:31:19.578Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:43`)

## Draft register rows

| id | tier | severity | class | evidence | status | fix commit | eval | what |
|---|---|---|---|---|---|---|---|---|
| T3-?1 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:429` | draft |  |  | msg 18 Ren repeats the narrator's msg 17 closing beat almost verbatim (predatory stillness, hand tightens on hilt, leather creaking): chained-voice repetition. Also msg 15 'aconcerned' glued words, not caught as modelDefect. |
| T3-?2 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:709` | draft |  |  | Stall: we are inside Thornwood at Kayla's cabin (msgs 24/26/28 narrate the trees, mist, cabin), but night_in_thornwood=true and location=night_thornwood are rejected 5x as 'evidence only in the player's line' - the reader keeps quoting my msg 23 instead of the world replies. night_selena freed latched only once. Checkpoint stuck at The Accused. |
| T3-?3 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:893` | draft |  |  | Reached The Witch of Thornwood (stop condition). msg 34 Kayla asks Selena 'What did those Inquisitors try to do to you in that room?' - Kayla was never told anything happened in a room (possible knew-too-much, or seer licence). Transition fired only at boundary after msg 34 via cadence read. |
| T3-?4 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:133` | draft |  |  | 1 extraction line(s) rejected: FACT importance=2 text="Ren Calwisk has declared Selena Forestsong will burn at first light and invited anyone to speak for her, but nobody in Glasnoa moved." evidence="the witch Selena Forestsong will burn at first light. If any here would speak for her, speak now, and give me your name." Nobody in Glasnoa moves. (unrecognized line) |
| T3-?5 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:213` | draft |  |  | judge scene fell back (timeout) |
| T3-?6 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:261` | draft |  |  | judge scene fell back (timeout) |
| T3-?7 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:310` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?8 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:311` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?9 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:312` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?10 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:313` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?11 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:314` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?12 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:315` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?13 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:316` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?14 | T3 |  |  | `test/sessions/T3/T3-3-1/console.jsonl:13` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T3-?15 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:318` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?16 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:319` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?17 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:320` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?18 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:321` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?19 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:322` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?20 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:323` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?21 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:324` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?22 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:325` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?23 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:326` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?24 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:422` | draft |  |  | 10 boundaries without a transition at night-the-accused while its exits were pending |
| T3-?25 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:424` | draft |  |  | judge scene fell back (timeout) |
| T3-?26 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:528` | draft |  |  | 1 extraction line(s) rejected: DELTA q=night_selena value="freed" evidence="Past midnight, while the watch dozes, I slip into the tithe barn, break Selena's chains with a crowbar and lead her out the back, west toward the dark line of Thornwood." (evidence only in the player's line) |
| T3-?27 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:538` | draft |  |  | 1 extraction line(s) rejected: DELTA q=night_selena value="freed" evidence="I slip into the tithe barn, break Selena's chains with a crowbar and lead her out the back, west toward the dark line of Thornwood." (evidence only in the player's line) |
| T3-?28 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:573` | draft |  |  | 2 extraction line(s) rejected: DELTA q=location value="night_thornwood" evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line); DELTA q=night_in_thornwood value=true evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line) |
| T3-?29 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:600` | draft |  |  | judge scene fell back (timeout) |
| T3-?30 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:616` | draft |  |  | 2 extraction line(s) rejected: DELTA q=location value="night_thornwood" evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line); DELTA q=night_in_thornwood value=true evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line) |
| T3-?31 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:629` | draft |  |  | 2 extraction line(s) rejected: DELTA q=location value="night_thornwood" evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line); DELTA q=night_in_thornwood value=true evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line) |
| T3-?32 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:668` | draft |  |  | 2 extraction line(s) rejected: DELTA q=location value="night_thornwood" evidence="*We push in under the first thorn trees, into the mist.* We're in." (evidence only in the player's line); DELTA q=night_in_thornwood value=true evidence="*We push in under the first thorn trees, into the mist.* We're in." (evidence only in the player's line) |
| T3-?33 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:676` | draft |  |  | 3 extraction line(s) rejected: DELTA q=location value="night_thornwood" evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line); DELTA q=night_in_thornwood value=true evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line); DELTA q=night_selena value="freed" evidence="break Selena's chains with a crowbar and lead her out the back" (outside requested scope) |
| T3-?34 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:737` | draft |  |  | judge stall fell back (timeout) |
| T3-?35 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:740` | draft |  |  | judge typed fell back (timeout) |
| T3-?36 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:742` | draft |  |  | judge scene fell back (timeout) |
| T3-?37 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:770` | draft |  |  | 1 extraction line(s) rejected: DELTA q=night_in_thornwood value=true evidence="We push in under the first thorn trees, into the mist." (evidence only in the player's line) |
| T3-?38 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:800` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?39 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:801` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?40 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:802` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?41 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:803` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?42 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:804` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?43 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:805` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?44 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:806` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?45 | T3 |  |  | `test/sessions/T3/T3-3-1/console.jsonl:38` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T3-?46 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:807` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?47 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:808` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?48 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:809` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?49 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:810` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?50 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:811` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?51 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:812` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?52 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:813` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?53 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:814` | draft |  |  | judge lore fell back (timeout) |
| T3-?54 | T3 |  |  | `test/sessions/T3/T3-3-1/payloads.jsonl:152` | draft |  |  | Kayla was drafted in 2026-10-01@23h13m03s275ms at boundary 21 with no private block while holding 4 private entries acquired before it |
| T3-?55 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:836` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?56 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:837` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?57 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:838` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?58 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:839` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?59 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:840` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?60 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:841` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?61 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:842` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?62 | T3 |  |  | `test/sessions/T3/T3-3-1/console.jsonl:42` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T3-?63 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:843` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?64 | T3 |  |  | `test/sessions/T3/T3-3-1/console.jsonl:43` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T3-?65 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:844` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?66 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:845` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?67 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:846` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?68 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:847` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?69 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:848` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?70 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:849` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?71 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:850` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?72 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:851` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?73 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:852` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?74 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:853` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?75 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:854` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?76 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:855` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?77 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:856` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?78 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:857` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?79 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:858` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?80 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:859` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?81 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:861` | draft |  |  | judge memoryVerify fell back (busy) |
| T3-?82 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:870` | draft |  |  | judge curatorFilter fell back (busy) |
| T3-?83 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:872` | draft |  |  | judge typed fell back (busy) |
| T3-?84 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:875` | draft |  |  | judge curatorFilter fell back (busy) |
| T3-?85 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:878` | draft |  |  | judge curatorFilter fell back (busy) |
| T3-?86 | T3 |  |  | `test/sessions/T3/T3-3-1/journal.jsonl:882` | draft |  |  | judge memoryVerify fell back (busy) |

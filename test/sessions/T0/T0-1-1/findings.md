# Findings draft: T0-1

Session `test/sessions/T0/T0-1-1`. Draft rows for `docs/plans/v2.6/14-findings.md`; severity and class are decided in the review.

## Counts

- flags: 4
- stall: 1
- extraction-rejected: 15
- empty-private-block: 0
- lore-force-lost: 0
- lore-constant-missed: 0
- judge-fallback: 15
- save-lost: 5
- unexpected-jump: 3
- rollback: 0
- console-error: 41
- model-call-failure: 0
- harness-error: 1

## Flags

### 2026-10-01T11:42:48.427Z (message 0)

- note: Overview 'Where you are' shows a raw id: 'At aegis_guild_hall.' (player mode, before turn 1). Also no requirements readout visible in the player drawer; HUD shows 'The Adventurer's Guild, Aegis City' not the checkpoint name 'The Guild Hall'.
- evidence: `journal.jsonl:45`
- context (event-time):
  - **#0 Adolion Narrator: You came to Aegis City to make a name with a blade, a bow or a spell, and three days ago you signed the Adventurers' Guild register to do it. Your Guild badge is new, your purse is light, and you have no party yet. The Guild sends no one out alone.  Today the hall is loud enough to be heard from the**

### 2026-10-01T11:55:29.511Z (message 24)

- note: After reload: state restored fine, but Overview still says 'At north_road.' (raw id) and Open threads repeats itself: rope/lanterns/rations listed twice, Tobias's warnings twice, stipend twice. Feels unfinished.
- evidence: `journal.jsonl:623`
- context (event-time):
  - #21 Dalan: Dalan's ears twitch, and he looks up with wide green eyes, surprised that anyone is talking to him. He seems to hesitate for a moment, his hand gripping the strap of his bow. "I... I have not had many parties," he admits softly, his gaze falling to the path. "They did not... they did not want me. Th
  - #22 Adolion Narrator: A riderless horse in Sheridan blue comes down the road at a walk, still saddled.
  - #23 Max Nightriver: I catch the horse's bridle and check the saddlebags. Sheridan blue. Belle, Dalan, look at this. Where's the rider?
  - **#24 Belle: Belle's brown eyes narrow as she looks at the horse, her gaze travelling slowly from the saddle to the riderless bridle in your hand. She shifts her weight, her hand moving to the pommel of Cleaver. "Sheridan blue," she mutters, her voice rough like grinding stones. "Somebody's missing their horse. **

### 2026-10-01T12:04:35.424Z (message 40)

- note: After msg 40 the story moved into a generated step: the chat note (msg 41) prints an author objective twice ('Travel the north road toward Wendhope and let the party notice what the road is missing... — Travel the north road...'), HUD just says 'Current scene'. Reads like stage directions leaking to the player. Also the chat already reached Wendhope's gate while the story says we are still on the road.
- evidence: `journal.jsonl:957`
- context (event-time):
  - #37 Max Nightriver: The night passes without anyone coming. At dawn we break camp, leave the carriage as we found it, and push hard north for Wendhope.
  - #38 Adolion Narrator: The dawn comes with a chill, and the air is thick with mist. Dalan stirs first, and Belle is already awake, her hand resting on the pommel of Cleaver. They look at the overturned carriage, and then at you, and then at the road that lies ahead. The road is empty, and the mists are thick, and the hors
  - #39 Max Nightriver: No smoke at breakfast time. I don't like it. We go down the ridge road to the village gate, slow, weapons ready but not drawn.
  - **#40 Adolion Narrator: The village is still. And the horse is still. And the people are still. The ridge road is steep, and the slope is rocky, and the descent is slow. The village gate is a simple wooden thing, and the stone wall around the village is low, and there is a ring of timber-framed houses. And there is nobody **
  - #41 Note: ◈ Travel the north road toward Wendhope and let the party notice what the road is missing: no ore wagons, no peddlers, no patrols, no smoke on the horizon, and a growing absence of birdsong as the forest edge nears. — Travel the north road toward Wendhope and let the party notice what the road is mi

### 2026-10-01T12:07:34.481Z (message 50)

- note: Narrator replies 40, 43, 48 repeat themselves: 'And there is the silence... the horse is quiet... What do you do?' every turn while we stand at the gate; the gate guards only showed up via the scripted line at msg 50.
- evidence: `journal.jsonl:1018`
- context (event-time):
  - #47 Belle: Belle's brown eyes narrow and she looks at the empty road. "A whole village empty? Fuck that." She spits on the ground and looks at the gate. "Something is wrong. And it ain't natural." She looks back at Dalan. "Get your bow ready. I can't shake the feeling that we're not alone out here."
  - #48 Adolion Narrator: The wind is cold and carries the scent of pine and damp earth, and the forest is silent around you. The village sits in the valley below, and there is no smoke from the fires, and there is nothing moving in the streets. And there is only the sound of your voice, and the knock, and the silence that f
  - #49 Note: ◈ Hold, Wendhope Is Closed — Get inside Wendhope before sundown.
  - **#50 Adolion Narrator: Three bows come up on the parapet at once. "That's far enough!" The archer in the middle has a scar over his left eye and has not slept in days. "Wendhope's not taking visitors. Turn round now and you'll make the crossroads by sundown."**

## Anomalies

### stall (1)

- 2026-10-01T11:59:19.003Z 10 boundaries without a transition at road-to-wendhope while its exits were pending (`journal.jsonl:754`)

### extraction-rejected (15)

- 2026-10-01T11:45:11.878Z 1 extraction line(s) rejected: DELTA q=adv_looking_for_hands value=false evidence="I turn toward the tavern arch. Belle, Dalan, you two look about as bored as I am." (evidence only in the player's line) (`journal.jsonl:132`)
- 2026-10-01T11:46:22.269Z 1 extraction line(s) rejected: DELTA q=adv_looking_for_hands value=false evidence="I turn toward the tavern arch. Belle, Dalan, you two look about as bored as I am." (evidence only in the player's line) (`journal.jsonl:172`)
- 2026-10-01T11:46:28.777Z 1 extraction line(s) rejected: DELTA q=adv_looking_for_hands value=false evidence="I turn toward the tavern arch. Belle, Dalan, you two look about as bored as I am." (evidence only in the player's line) (`journal.jsonl:183`)
- 2026-10-01T11:48:00.164Z 1 extraction line(s) rejected: DELTA q=adv_looking_for_hands value=false evidence="I turn toward the tavern arch. Belle, Dalan, you two look about as bored as I am." (evidence only in the player's line) (`journal.jsonl:240`)
- 2026-10-01T11:48:58.941Z 2 extraction line(s) rejected: DELTA q=adv_looking_for_hands value=false evidence="I lead the other two back to the counter and slap the Wendhope notice down in front of Tobias." (evidence only in the player's line); DELTA q=location value="aegis_guild_hall" evidence="I lead the other two back to the counter and slap the Wendhope notice down in front of Tobias." (evidence only in the player's line) (`journal.jsonl:271`)
- 2026-10-01T11:49:05.730Z 1 extraction line(s) rejected: DELTA q=location value="aegis_guild_hall" evidence="I lead the other two back to the counter and slap the Wendhope notice down in front of Tobias." (evidence only in the player's line) (`journal.jsonl:281`)
- 2026-10-01T11:49:17.414Z 2 extraction line(s) rejected: DELTA q=adv_looking_for_hands value=false evidence="I turn toward the tavern arch. Belle, Dalan, you two look about as bored as I am." (evidence only in the player's line); DELTA q=location value="aegis_guild_hall" evidence="I lead the other two back to the counter and slap the Wendhope notice down in front of Tobias." (evidence only in the player's line) (`journal.jsonl:295`)
- 2026-10-01T11:51:42.790Z 1 extraction line(s) rejected: DELTA q=location value="north_road" evidence="Right, Ash Lanterns: market for rope, lanterns and a week of rations, then the north gate before noon." (evidence only in the player's line) (`journal.jsonl:379`)
- 2026-10-01T11:58:55.767Z 1 extraction line(s) rejected: DELTA q=first_camp value=true evidence="It's getting dark; we make camp by the carriages and keep a watch." (evidence only in the player's line) (`journal.jsonl:742`)
- 2026-10-01T11:59:02.752Z 1 extraction line(s) rejected: DELTA q=first_camp value=true evidence="It's getting dark; we make camp by the carriages and keep a watch." (evidence only in the player's line) (`journal.jsonl:753`)
- 2026-10-01T11:59:34.081Z 1 extraction line(s) rejected: DELTA q=first_camp value=true evidence="It's getting dark; we make camp by the carriages and keep a watch." (evidence only in the player's line) (`journal.jsonl:785`)
- 2026-10-01T11:59:46.000Z 1 extraction line(s) rejected: DELTA q=first_camp value=true evidence="It's getting dark; we make camp by the carriages and keep a watch." (evidence only in the player's line) (`journal.jsonl:796`)
- 2026-10-01T12:00:21.228Z 1 extraction line(s) rejected: DELTA q=first_camp value=true evidence="we make camp by the carriages and keep a watch" (evidence only in the player's line) (`journal.jsonl:821`)
- 2026-10-01T12:00:34.736Z 1 extraction line(s) rejected: DELTA q=first_camp value=true evidence="we make camp by the carriages and keep a watch" (evidence only in the player's line) (`journal.jsonl:855`)
- 2026-10-01T12:03:06.770Z 1 extraction line(s) rejected: DELTA q=first_camp value=true evidence="we make camp by the carriages and keep a watch" (evidence only in the player's line) (`journal.jsonl:921`)

### judge-fallback (15)

- 2026-10-01T11:46:38.594Z judge scene fell back (timeout) (`journal.jsonl:187`)
- 2026-10-01T11:51:21.133Z judge director fell back (timeout) (`journal.jsonl:344`)
- 2026-10-01T11:53:19.356Z judge memoryPairs fell back (busy) (`journal.jsonl:536`)
- 2026-10-01T11:53:19.358Z judge memoryPairs fell back (busy) (`journal.jsonl:537`)
- 2026-10-01T11:53:19.360Z judge memoryPairs fell back (busy) (`journal.jsonl:538`)
- 2026-10-01T11:53:19.362Z judge memoryPairs fell back (busy) (`journal.jsonl:539`)
- 2026-10-01T11:53:19.364Z judge memoryPairs fell back (busy) (`journal.jsonl:540`)
- 2026-10-01T11:53:19.366Z judge memoryPairs fell back (busy) (`journal.jsonl:541`)
- 2026-10-01T11:53:19.367Z judge memoryPairs fell back (busy) (`journal.jsonl:542`)
- 2026-10-01T11:53:20.465Z judge memoryVerify fell back (busy) (`journal.jsonl:545`)
- 2026-10-01T11:58:49.921Z judge director fell back (timeout) (`journal.jsonl:718`)
- 2026-10-01T11:59:22.844Z judge scene fell back (timeout) (`journal.jsonl:755`)
- 2026-10-01T11:59:25.336Z judge typed fell back (timeout) (`journal.jsonl:756`)
- 2026-10-01T11:59:26.850Z judge warden fell back (timeout) (`journal.jsonl:757`)
- 2026-10-01T12:02:54.525Z judge scene fell back (timeout) (`journal.jsonl:892`)

### save-lost (5)

- 2026-10-01T11:59:27.656Z save not confirmed (`journal.jsonl:758`)
- 2026-10-01T11:59:27.815Z save not confirmed (`journal.jsonl:759`)
- 2026-10-01T11:59:27.940Z save not confirmed (`journal.jsonl:760`)
- 2026-10-01T11:59:28.188Z save not confirmed (`journal.jsonl:761`)
- 2026-10-01T11:59:28.234Z save not confirmed (`journal.jsonl:762`)

### unexpected-jump (3)

- 2026-10-01T12:04:13.597Z road-to-wendhope → gen_on-the-road_1 is not an authored transition (a generated route?) (`journal.jsonl:950`)
- 2026-10-01T12:05:13.373Z gen_on-the-road_1 → gen_on-the-road_2 is not an authored transition (a generated route?) (`journal.jsonl:966`)
- 2026-10-01T12:07:03.604Z gen_on-the-road_2 → at-the-walls is not an authored transition (`journal.jsonl:992`)

### console-error (41)

- 2026-10-01T11:53:13.306Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:21`)
- 2026-10-01T11:53:13.310Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:22`)
- 2026-10-01T11:53:13.314Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:23`)
- 2026-10-01T11:53:13.318Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:24`)
- 2026-10-01T11:53:13.322Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:25`)
- 2026-10-01T11:53:13.326Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:26`)
- 2026-10-01T11:53:13.330Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:27`)
- 2026-10-01T11:53:13.921Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:28`)
- 2026-10-01T11:53:13.923Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:29`)
- 2026-10-01T11:53:13.925Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:30`)
- 2026-10-01T11:53:13.928Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:31`)
- 2026-10-01T11:53:13.930Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:32`)
- 2026-10-01T11:53:13.933Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:33`)
- 2026-10-01T11:53:13.934Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:34`)
- 2026-10-01T11:53:14.421Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:35`)
- 2026-10-01T11:53:15.028Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:36`)
- 2026-10-01T11:53:15.137Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:37`)
- 2026-10-01T11:53:15.138Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:38`)
- 2026-10-01T11:53:15.141Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:39`)
- 2026-10-01T11:53:15.143Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:40`)
- 2026-10-01T11:53:15.145Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:41`)
- 2026-10-01T11:53:15.147Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:42`)
- 2026-10-01T11:53:15.148Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:43`)
- 2026-10-01T11:53:16.242Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:44`)
- 2026-10-01T11:53:16.942Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:45`)
- 2026-10-01T11:53:16.947Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:46`)
- 2026-10-01T11:53:16.951Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:47`)
- 2026-10-01T11:53:16.960Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:48`)
- 2026-10-01T11:53:16.962Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:49`)
- 2026-10-01T11:53:16.964Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:50`)
- 2026-10-01T11:53:16.965Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:51`)
- 2026-10-01T11:53:18.050Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:52`)
- 2026-10-01T11:53:19.356Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:53`)
- 2026-10-01T11:53:19.358Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:54`)
- 2026-10-01T11:53:19.360Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:55`)
- 2026-10-01T11:53:19.362Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:56`)
- 2026-10-01T11:53:19.364Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:57`)
- 2026-10-01T11:53:19.366Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:58`)
- 2026-10-01T11:53:19.368Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:59`)
- 2026-10-01T11:53:20.465Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:60`)
- 2026-10-01T12:02:54.787Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:160`)

### harness-error (1)

- - WARNING: the page restarted 1 time(s); captures between the last drain and each restart are UNKNOWN, not zero. (`payloads.log:104`)

## Draft register rows

| id | tier | severity | class | evidence | status | fix commit | eval | what |
|---|---|---|---|---|---|---|---|---|
| T0-?1 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:45` | draft |  |  | Overview 'Where you are' shows a raw id: 'At aegis_guild_hall.' (player mode, before turn 1). Also no requirements readout visible in the player drawer; HUD shows 'The Adventurer's Guild, Aegis City' not the checkpoint name 'The Guild Hall'. |
| T0-?2 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:623` | draft |  |  | After reload: state restored fine, but Overview still says 'At north_road.' (raw id) and Open threads repeats itself: rope/lanterns/rations listed twice, Tobias's warnings twice, stipend twice. Feels unfinished. |
| T0-?3 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:957` | draft |  |  | After msg 40 the story moved into a generated step: the chat note (msg 41) prints an author objective twice ('Travel the north road toward Wendhope and let the party notice what the road is missing... — Travel the north road...'), HUD just says 'Current scene'. Reads like stage directions leaking to the player. Also the chat already reached Wendhope's gate while the story says we are still on the road. |
| T0-?4 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:1018` | draft |  |  | Narrator replies 40, 43, 48 repeat themselves: 'And there is the silence... the horse is quiet... What do you do?' every turn while we stand at the gate; the gate guards only showed up via the scripted line at msg 50. |
| T0-?5 | T0 |  | harness | `test/sessions/T0/T0-1-1/payloads.log:104` | draft |  |  | WARNING: the page restarted 1 time(s); captures between the last drain and each restart are UNKNOWN, not zero. |
| T0-?6 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:132` | draft |  |  | 1 extraction line(s) rejected: DELTA q=adv_looking_for_hands value=false evidence="I turn toward the tavern arch. Belle, Dalan, you two look about as bored as I am." (evidence only in the player's line) |
| T0-?7 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:172` | draft |  |  | 1 extraction line(s) rejected: DELTA q=adv_looking_for_hands value=false evidence="I turn toward the tavern arch. Belle, Dalan, you two look about as bored as I am." (evidence only in the player's line) |
| T0-?8 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:183` | draft |  |  | 1 extraction line(s) rejected: DELTA q=adv_looking_for_hands value=false evidence="I turn toward the tavern arch. Belle, Dalan, you two look about as bored as I am." (evidence only in the player's line) |
| T0-?9 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:187` | draft |  |  | judge scene fell back (timeout) |
| T0-?10 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:240` | draft |  |  | 1 extraction line(s) rejected: DELTA q=adv_looking_for_hands value=false evidence="I turn toward the tavern arch. Belle, Dalan, you two look about as bored as I am." (evidence only in the player's line) |
| T0-?11 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:271` | draft |  |  | 2 extraction line(s) rejected: DELTA q=adv_looking_for_hands value=false evidence="I lead the other two back to the counter and slap the Wendhope notice down in front of Tobias." (evidence only in the player's line); DELTA q=location value="aegis_guild_hall" evidence="I lead the other two back to the counter and slap the Wendhope notice down in front of Tobias." (evidence only in the player's line) |
| T0-?12 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:281` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="aegis_guild_hall" evidence="I lead the other two back to the counter and slap the Wendhope notice down in front of Tobias." (evidence only in the player's line) |
| T0-?13 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:295` | draft |  |  | 2 extraction line(s) rejected: DELTA q=adv_looking_for_hands value=false evidence="I turn toward the tavern arch. Belle, Dalan, you two look about as bored as I am." (evidence only in the player's line); DELTA q=location value="aegis_guild_hall" evidence="I lead the other two back to the counter and slap the Wendhope notice down in front of Tobias." (evidence only in the player's line) |
| T0-?14 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:344` | draft |  |  | judge director fell back (timeout) |
| T0-?15 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:379` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="north_road" evidence="Right, Ash Lanterns: market for rope, lanterns and a week of rations, then the north gate before noon." (evidence only in the player's line) |
| T0-?16 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:21` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?17 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:22` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?18 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:23` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?19 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:24` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?20 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:25` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?21 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:26` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?22 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:27` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?23 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:28` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?24 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:29` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?25 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:30` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?26 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:31` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?27 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:32` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?28 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:33` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?29 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:34` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?30 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:35` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?31 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:36` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?32 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:37` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?33 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:38` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?34 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:39` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?35 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:40` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?36 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:41` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?37 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:42` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?38 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:43` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?39 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:44` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?40 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:45` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?41 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:46` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?42 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:47` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?43 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:48` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?44 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:49` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?45 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:50` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?46 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:51` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?47 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:52` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?48 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:536` | draft |  |  | judge memoryPairs fell back (busy) |
| T0-?49 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:53` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?50 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:537` | draft |  |  | judge memoryPairs fell back (busy) |
| T0-?51 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:54` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?52 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:538` | draft |  |  | judge memoryPairs fell back (busy) |
| T0-?53 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:55` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?54 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:539` | draft |  |  | judge memoryPairs fell back (busy) |
| T0-?55 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:56` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?56 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:540` | draft |  |  | judge memoryPairs fell back (busy) |
| T0-?57 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:57` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?58 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:541` | draft |  |  | judge memoryPairs fell back (busy) |
| T0-?59 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:58` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?60 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:542` | draft |  |  | judge memoryPairs fell back (busy) |
| T0-?61 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:59` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?62 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:545` | draft |  |  | judge memoryVerify fell back (busy) |
| T0-?63 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:60` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?64 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:718` | draft |  |  | judge director fell back (timeout) |
| T0-?65 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:742` | draft |  |  | 1 extraction line(s) rejected: DELTA q=first_camp value=true evidence="It's getting dark; we make camp by the carriages and keep a watch." (evidence only in the player's line) |
| T0-?66 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:753` | draft |  |  | 1 extraction line(s) rejected: DELTA q=first_camp value=true evidence="It's getting dark; we make camp by the carriages and keep a watch." (evidence only in the player's line) |
| T0-?67 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:754` | draft |  |  | 10 boundaries without a transition at road-to-wendhope while its exits were pending |
| T0-?68 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:755` | draft |  |  | judge scene fell back (timeout) |
| T0-?69 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:756` | draft |  |  | judge typed fell back (timeout) |
| T0-?70 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:757` | draft |  |  | judge warden fell back (timeout) |
| T0-?71 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:758` | draft |  |  | save not confirmed |
| T0-?72 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:759` | draft |  |  | save not confirmed |
| T0-?73 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:760` | draft |  |  | save not confirmed |
| T0-?74 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:761` | draft |  |  | save not confirmed |
| T0-?75 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:762` | draft |  |  | save not confirmed |
| T0-?76 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:785` | draft |  |  | 1 extraction line(s) rejected: DELTA q=first_camp value=true evidence="It's getting dark; we make camp by the carriages and keep a watch." (evidence only in the player's line) |
| T0-?77 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:796` | draft |  |  | 1 extraction line(s) rejected: DELTA q=first_camp value=true evidence="It's getting dark; we make camp by the carriages and keep a watch." (evidence only in the player's line) |
| T0-?78 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:821` | draft |  |  | 1 extraction line(s) rejected: DELTA q=first_camp value=true evidence="we make camp by the carriages and keep a watch" (evidence only in the player's line) |
| T0-?79 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:855` | draft |  |  | 1 extraction line(s) rejected: DELTA q=first_camp value=true evidence="we make camp by the carriages and keep a watch" (evidence only in the player's line) |
| T0-?80 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:892` | draft |  |  | judge scene fell back (timeout) |
| T0-?81 | T0 |  |  | `test/sessions/T0/T0-1-1/console.jsonl:160` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?82 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:921` | draft |  |  | 1 extraction line(s) rejected: DELTA q=first_camp value=true evidence="we make camp by the carriages and keep a watch" (evidence only in the player's line) |
| T0-?83 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:950` | draft |  |  | road-to-wendhope → gen_on-the-road_1 is not an authored transition (a generated route?) |
| T0-?84 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:966` | draft |  |  | gen_on-the-road_1 → gen_on-the-road_2 is not an authored transition (a generated route?) |
| T0-?85 | T0 |  |  | `test/sessions/T0/T0-1-1/journal.jsonl:992` | draft |  |  | gen_on-the-road_2 → at-the-walls is not an authored transition |

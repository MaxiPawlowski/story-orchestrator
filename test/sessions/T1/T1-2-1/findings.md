# Findings draft: T1-2

Session `test/sessions/T1/T1-2-1`. Draft rows for `docs/plans/v2.6/14-findings.md`; severity and class are decided in the review.

## Counts

- flags: 3
- stall: 1
- extraction-rejected: 2
- empty-private-block: 1
- lore-force-lost: 0
- lore-constant-missed: 0
- judge-fallback: 89
- save-lost: 0
- unexpected-jump: 0
- rollback: 0
- console-error: 15
- model-call-failure: 0
- harness-error: 0

## Flags

### 2026-10-01T14:26:44.347Z (message 8)

- note: Addressed Ellie AND Tobias (refusal: tell the Sheridans to hire soldiers); only Ellie answered, director handed back to the player (composite 0.53), Tobias never acknowledged the refusal.
- evidence: `journal.jsonl:163`
- context (event-time):
  - #5 Max Nightriver: A collapsed mine shaft for that pay? No. We'll find something else.
  - #6 Tobias: He pulls his hand from the notice and looks at the player with a quiet, knowing look. "I understand. I will not send a party out on a job that smells bad to me as well." He looks at the Ellie and nods to her. "Ellie, what other D-rank quests are there for us?"
  - #7 Max Nightriver: Yes, Ellie, what else is there? And Tobias, tell the Sheridans to hire soldiers if they think something's up there.
  - **#8 Ellie: Ellie's eyebrows arch and she pulls out a stack of quests from a drawer, fanning them like a deck of cards. "Let's see..." She taps a few with a manicured nail. "A merchant needs protection on the road to Oakhaven, a farmer needs pests cleared from his wheat fields, and..." She pauses, looking betwe**

### 2026-10-01T14:38:57.142Z (message 26)

- note: Replies degrade into dropped-word garble from msg 23 (Talis 'Ourra-light', 'smile falis'), msg 25 Dalan unreadable ('Ashs he softly and small touches lips'), msg 26 Belle drops articles. Same sampler as early turns (DRY 0.8/1.75, last_n 4096), prompt ~45k chars. Belle also renames the party 'Ashs'.
- evidence: `journal.jsonl:501`
- context (event-time):
  - #23 Talis: "A silence that swallows men..." Talis whispers. She shudders, and the blue ponytail swings. "The north road," she murmurs. "The carts stopped." She looks at the player, and her eyes are wide and glassy. "That's the kind of magic that swallows people! The kind of darkness that eats you up!" She look
  - #24 Max Nightriver: I set my mug down and walk back to the counter. Tobias. Fine. Triple the fee, and we ride as the Ash Lanterns.
  - #25 Dalan: Dalan is on his feet before player finished, bow sliding his into grip " Ashs he softly and small touches lips " Ashs looks Belle then Tal, nods " can in north And know demon." His on bow firm but cheeks pink a, pride He at player " can the Lantern."
  - **#26 Belle: "Fuck the lanterns." Belle pushes off from table and grin is teeth and rage. " Lanterns are for folks scared of dark. We’re Ash." She steps past them for her axe, and hand tightens on haft. "Ashs don’t need light. Ashs are all that’s left after it burns. That’s what a clan is." She steps into hall a**

### 2026-10-01T14:41:39.569Z (message 28)

- note: Accepted Wendhope twice (msg 24 'Fine. Triple the fee, and we ride as the Ash Lanterns.' = card sample line; msg 27 'write us in for Wendhope as the Ash Lanterns'); Ellie registered us (msg 28) but path=wendhope held x3 'no line the player wrote shows the commitment' - commit_evidence has no 'we ride'/'write us in'. Story stays in the tavern.
- evidence: `journal.jsonl:577`
- context (event-time):
  - #25 Dalan: Dalan is on his feet before player finished, bow sliding his into grip " Ashs he softly and small touches lips " Ashs looks Belle then Tal, nods " can in north And know demon." His on bow firm but cheeks pink a, pride He at player " can the Lantern."
  - #26 Belle: "Fuck the lanterns." Belle pushes off from table and grin is teeth and rage. " Lanterns are for folks scared of dark. We’re Ash." She steps past them for her axe, and hand tightens on haft. "Ashs don’t need light. Ashs are all that’s left after it burns. That’s what a clan is." She steps into hall a
  - #27 Max Nightriver: Ash Lanterns, Belle. Both words. Tobias, Ellie: write us in for Wendhope as the Ash Lanterns, at triple the fee.
  - **#28 Adolion Narrator: The tavern is silent enough now that the word rings through the hall. Belle's grin is a thin line. Tobias has stepped back from the counter, and his blue eyes have gone hard as river stones. "Triple the fee," he says, and the words are quiet, but they carry. "The Sheridans will not pay triple for a **

## Anomalies

### stall (1)

- 2026-10-01T14:32:35.835Z 10 boundaries without a transition at guild-hall while its exits were pending (`journal.jsonl:353`)

### extraction-rejected (2)

- 2026-10-01T14:32:50.700Z 1 extraction line(s) rejected: DELTA q=adv_looking_for_hands value=true evidence="Come on, you two. We'll be in the tavern if anyone has a real job." (evidence only in the player's line) (`journal.jsonl:383`)
- 2026-10-01T14:43:36.379Z 1 extraction line(s) rejected: DELTA q=tension_current value="tense" evidence="Take the posting at double the fee as the Ash Lanterns, or do not take it. But there is no third option." (evidence not in window) (`journal.jsonl:614`)

### empty-private-block (1)

- 2026-10-01T14:37:00.544Z Dalan was drafted in 2026-10-01@11h22m01s847ms at boundary 15 with no private block while holding 1 private entry acquired before it (`payloads.jsonl:63`)

### judge-fallback (89)

- 2026-10-01T14:22:45.016Z judge wardenLore fell back (busy) (`journal.jsonl:61`)
- 2026-10-01T14:23:03.140Z judge lore fell back (busy) (`journal.jsonl:65`)
- 2026-10-01T14:23:03.140Z judge lore fell back (busy) (`journal.jsonl:66`)
- 2026-10-01T14:23:03.141Z judge lore fell back (busy) (`journal.jsonl:67`)
- 2026-10-01T14:23:03.141Z judge lore fell back (busy) (`journal.jsonl:68`)
- 2026-10-01T14:23:03.154Z judge director fell back (busy) (`journal.jsonl:69`)
- 2026-10-01T14:24:21.704Z judge warden fell back (busy) (`journal.jsonl:106`)
- 2026-10-01T14:24:21.704Z judge wardenLore fell back (busy) (`journal.jsonl:107`)
- 2026-10-01T14:26:25.306Z judge typed fell back (busy) (`journal.jsonl:150`)
- 2026-10-01T14:27:36.848Z judge lore fell back (busy) (`journal.jsonl:188`)
- 2026-10-01T14:27:36.848Z judge lore fell back (busy) (`journal.jsonl:189`)
- 2026-10-01T14:27:40.767Z judge memoryVerify fell back (busy) (`journal.jsonl:192`)
- 2026-10-01T14:28:11.701Z judge typed fell back (busy) (`journal.jsonl:214`)
- 2026-10-01T14:28:16.187Z judge memoryVerify fell back (busy) (`journal.jsonl:216`)
- 2026-10-01T14:30:50.995Z judge scene fell back (timeout) (`journal.jsonl:286`)
- 2026-10-01T14:31:20.139Z judge memoryPairs fell back (busy) (`journal.jsonl:316`)
- 2026-10-01T14:31:20.139Z judge memoryPairs fell back (busy) (`journal.jsonl:317`)
- 2026-10-01T14:31:20.139Z judge memoryPairs fell back (busy) (`journal.jsonl:318`)
- 2026-10-01T14:31:20.139Z judge memoryPairs fell back (busy) (`journal.jsonl:319`)
- 2026-10-01T14:31:20.139Z judge memoryPairs fell back (busy) (`journal.jsonl:320`)
- 2026-10-01T14:31:20.139Z judge memoryPairs fell back (busy) (`journal.jsonl:321`)
- 2026-10-01T14:31:20.362Z judge memoryPairs fell back (busy) (`journal.jsonl:323`)
- 2026-10-01T14:31:20.362Z judge memoryPairs fell back (busy) (`journal.jsonl:324`)
- 2026-10-01T14:31:54.014Z judge memoryPairs fell back (busy) (`journal.jsonl:329`)
- 2026-10-01T14:31:54.014Z judge memoryPairs fell back (busy) (`journal.jsonl:330`)
- 2026-10-01T14:31:54.014Z judge memoryPairs fell back (busy) (`journal.jsonl:331`)
- 2026-10-01T14:31:54.178Z judge memoryPairs fell back (busy) (`journal.jsonl:333`)
- 2026-10-01T14:31:54.178Z judge memoryPairs fell back (busy) (`journal.jsonl:334`)
- 2026-10-01T14:31:54.178Z judge memoryPairs fell back (busy) (`journal.jsonl:335`)
- 2026-10-01T14:31:54.178Z judge memoryPairs fell back (busy) (`journal.jsonl:336`)
- 2026-10-01T14:32:07.098Z judge lore fell back (busy) (`journal.jsonl:339`)
- 2026-10-01T14:32:07.098Z judge lore fell back (busy) (`journal.jsonl:340`)
- 2026-10-01T14:32:07.098Z judge lore fell back (busy) (`journal.jsonl:341`)
- 2026-10-01T14:32:07.098Z judge lore fell back (busy) (`journal.jsonl:342`)
- 2026-10-01T14:32:07.112Z judge director fell back (busy) (`journal.jsonl:343`)
- 2026-10-01T14:32:09.665Z judge lore fell back (busy) (`journal.jsonl:348`)
- 2026-10-01T14:32:09.665Z judge lore fell back (busy) (`journal.jsonl:349`)
- 2026-10-01T14:32:09.665Z judge lore fell back (busy) (`journal.jsonl:350`)
- 2026-10-01T14:32:09.665Z judge lore fell back (busy) (`journal.jsonl:351`)
- 2026-10-01T14:32:50.710Z judge memoryVerify fell back (busy) (`journal.jsonl:376`)
- 2026-10-01T14:36:13.846Z judge director fell back (timeout) (`journal.jsonl:448`)
- 2026-10-01T14:36:14.761Z judge scene fell back (busy) (`journal.jsonl:449`)
- 2026-10-01T14:36:14.761Z judge warden fell back (busy) (`journal.jsonl:450`)
- 2026-10-01T14:36:14.818Z judge wardenLore fell back (busy) (`journal.jsonl:451`)
- 2026-10-01T14:37:00.315Z judge lore fell back (busy) (`journal.jsonl:474`)
- 2026-10-01T14:37:00.315Z judge lore fell back (busy) (`journal.jsonl:475`)
- 2026-10-01T14:45:20.304Z judge scene fell back (timeout) (`journal.jsonl:636`)
- 2026-10-01T14:45:22.812Z judge typed fell back (timeout) (`journal.jsonl:637`)
- 2026-10-01T14:45:23.198Z judge wardenLore fell back (busy) (`journal.jsonl:638`)
- 2026-10-01T14:45:23.307Z judge warden fell back (busy) (`journal.jsonl:639`)
- 2026-10-01T14:46:10.122Z judge memoryPairs fell back (busy) (`journal.jsonl:678`)
- 2026-10-01T14:46:10.122Z judge memoryPairs fell back (busy) (`journal.jsonl:679`)
- 2026-10-01T14:46:10.122Z judge memoryPairs fell back (busy) (`journal.jsonl:680`)
- 2026-10-01T14:46:10.122Z judge memoryPairs fell back (busy) (`journal.jsonl:681`)
- 2026-10-01T14:46:10.122Z judge memoryPairs fell back (busy) (`journal.jsonl:682`)
- 2026-10-01T14:46:10.122Z judge memoryPairs fell back (busy) (`journal.jsonl:683`)
- 2026-10-01T14:46:10.144Z judge memoryPairs fell back (busy) (`journal.jsonl:685`)
- 2026-10-01T14:46:10.144Z judge memoryPairs fell back (busy) (`journal.jsonl:686`)
- 2026-10-01T14:46:10.144Z judge memoryPairs fell back (busy) (`journal.jsonl:687`)
- 2026-10-01T14:46:10.144Z judge memoryPairs fell back (busy) (`journal.jsonl:688`)
- 2026-10-01T14:46:10.144Z judge memoryPairs fell back (busy) (`journal.jsonl:689`)
- 2026-10-01T14:46:10.144Z judge memoryPairs fell back (busy) (`journal.jsonl:690`)
- 2026-10-01T14:46:10.144Z judge memoryPairs fell back (busy) (`journal.jsonl:691`)
- 2026-10-01T14:46:10.144Z judge memoryPairs fell back (busy) (`journal.jsonl:692`)
- 2026-10-01T14:46:10.148Z judge memoryPairs fell back (busy) (`journal.jsonl:693`)
- 2026-10-01T14:46:10.148Z judge memoryPairs fell back (busy) (`journal.jsonl:694`)
- 2026-10-01T14:46:10.148Z judge memoryPairs fell back (busy) (`journal.jsonl:695`)
- 2026-10-01T14:46:10.148Z judge memoryPairs fell back (busy) (`journal.jsonl:696`)
- 2026-10-01T14:46:10.148Z judge memoryPairs fell back (busy) (`journal.jsonl:697`)
- 2026-10-01T14:46:10.148Z judge memoryPairs fell back (busy) (`journal.jsonl:698`)
- 2026-10-01T14:46:10.148Z judge memoryPairs fell back (busy) (`journal.jsonl:699`)
- 2026-10-01T14:46:10.148Z judge memoryPairs fell back (busy) (`journal.jsonl:700`)
- 2026-10-01T14:46:54.026Z judge memoryPairs fell back (busy) (`journal.jsonl:705`)
- 2026-10-01T14:46:54.027Z judge memoryPairs fell back (busy) (`journal.jsonl:706`)
- 2026-10-01T14:46:54.027Z judge memoryPairs fell back (busy) (`journal.jsonl:707`)
- 2026-10-01T14:46:54.031Z judge memoryPairs fell back (busy) (`journal.jsonl:709`)
- 2026-10-01T14:46:54.031Z judge memoryPairs fell back (busy) (`journal.jsonl:710`)
- 2026-10-01T14:46:54.031Z judge memoryPairs fell back (busy) (`journal.jsonl:711`)
- 2026-10-01T14:46:54.031Z judge memoryPairs fell back (busy) (`journal.jsonl:712`)
- 2026-10-01T14:46:54.031Z judge memoryPairs fell back (busy) (`journal.jsonl:713`)
- 2026-10-01T14:46:54.031Z judge memoryPairs fell back (busy) (`journal.jsonl:714`)
- 2026-10-01T14:46:54.031Z judge memoryPairs fell back (busy) (`journal.jsonl:715`)
- 2026-10-01T14:46:54.033Z judge memoryPairs fell back (busy) (`journal.jsonl:716`)
- 2026-10-01T14:46:54.033Z judge memoryPairs fell back (busy) (`journal.jsonl:717`)
- 2026-10-01T14:46:54.033Z judge memoryPairs fell back (busy) (`journal.jsonl:718`)
- 2026-10-01T14:46:54.033Z judge memoryPairs fell back (busy) (`journal.jsonl:719`)
- 2026-10-01T14:46:54.033Z judge memoryPairs fell back (busy) (`journal.jsonl:720`)
- 2026-10-01T14:46:54.033Z judge memoryPairs fell back (busy) (`journal.jsonl:721`)
- 2026-10-01T14:46:54.033Z judge memoryPairs fell back (busy) (`journal.jsonl:722`)

### console-error (15)

- 2026-10-01T14:22:45.016Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:3`)
- 2026-10-01T14:24:21.706Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:6`)
- 2026-10-01T14:26:25.308Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:11`)
- 2026-10-01T14:27:36.855Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:13`)
- 2026-10-01T14:28:11.704Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:17`)
- 2026-10-01T14:31:20.138Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:24`)
- 2026-10-01T14:31:54.013Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:25`)
- 2026-10-01T14:32:09.666Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:26`)
- 2026-10-01T14:32:50.713Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:30`)
- 2026-10-01T14:36:14.761Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:37`)
- 2026-10-01T14:37:00.321Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:40`)
- 2026-10-01T14:45:23.199Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:53`)
- 2026-10-01T14:45:23.307Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:54`)
- 2026-10-01T14:46:10.122Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:59`)
- 2026-10-01T14:46:54.026Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:60`)

## Draft register rows

| id | tier | severity | class | evidence | status | fix commit | eval | what |
|---|---|---|---|---|---|---|---|---|
| T1-?1 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:163` | draft |  |  | Addressed Ellie AND Tobias (refusal: tell the Sheridans to hire soldiers); only Ellie answered, director handed back to the player (composite 0.53), Tobias never acknowledged the refusal. |
| T1-?2 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:501` | draft |  |  | Replies degrade into dropped-word garble from msg 23 (Talis 'Ourra-light', 'smile falis'), msg 25 Dalan unreadable ('Ashs he softly and small touches lips'), msg 26 Belle drops articles. Same sampler as early turns (DRY 0.8/1.75, last_n 4096), prompt ~45k chars. Belle also renames the party 'Ashs'. |
| T1-?3 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:577` | draft |  |  | Accepted Wendhope twice (msg 24 'Fine. Triple the fee, and we ride as the Ash Lanterns.' = card sample line; msg 27 'write us in for Wendhope as the Ash Lanterns'); Ellie registered us (msg 28) but path=wendhope held x3 'no line the player wrote shows the commitment' - commit_evidence has no 'we ride'/'write us in'. Story stays in the tavern. |
| T1-?4 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:61` | draft |  |  | judge wardenLore fell back (busy) |
| T1-?5 | T1 |  |  | `test/sessions/T1/T1-2-1/console.jsonl:3` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?6 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:65` | draft |  |  | judge lore fell back (busy) |
| T1-?7 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:66` | draft |  |  | judge lore fell back (busy) |
| T1-?8 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:67` | draft |  |  | judge lore fell back (busy) |
| T1-?9 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:68` | draft |  |  | judge lore fell back (busy) |
| T1-?10 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:69` | draft |  |  | judge director fell back (busy) |
| T1-?11 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:106` | draft |  |  | judge warden fell back (busy) |
| T1-?12 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:107` | draft |  |  | judge wardenLore fell back (busy) |
| T1-?13 | T1 |  |  | `test/sessions/T1/T1-2-1/console.jsonl:6` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?14 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:150` | draft |  |  | judge typed fell back (busy) |
| T1-?15 | T1 |  |  | `test/sessions/T1/T1-2-1/console.jsonl:11` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?16 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:188` | draft |  |  | judge lore fell back (busy) |
| T1-?17 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:189` | draft |  |  | judge lore fell back (busy) |
| T1-?18 | T1 |  |  | `test/sessions/T1/T1-2-1/console.jsonl:13` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?19 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:192` | draft |  |  | judge memoryVerify fell back (busy) |
| T1-?20 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:214` | draft |  |  | judge typed fell back (busy) |
| T1-?21 | T1 |  |  | `test/sessions/T1/T1-2-1/console.jsonl:17` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?22 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:216` | draft |  |  | judge memoryVerify fell back (busy) |
| T1-?23 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:286` | draft |  |  | judge scene fell back (timeout) |
| T1-?24 | T1 |  |  | `test/sessions/T1/T1-2-1/console.jsonl:24` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?25 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:316` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?26 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:317` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?27 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:318` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?28 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:319` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?29 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:320` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?30 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:321` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?31 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:323` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?32 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:324` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?33 | T1 |  |  | `test/sessions/T1/T1-2-1/console.jsonl:25` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?34 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:329` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?35 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:330` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?36 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:331` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?37 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:333` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?38 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:334` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?39 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:335` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?40 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:336` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?41 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:339` | draft |  |  | judge lore fell back (busy) |
| T1-?42 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:340` | draft |  |  | judge lore fell back (busy) |
| T1-?43 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:341` | draft |  |  | judge lore fell back (busy) |
| T1-?44 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:342` | draft |  |  | judge lore fell back (busy) |
| T1-?45 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:343` | draft |  |  | judge director fell back (busy) |
| T1-?46 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:348` | draft |  |  | judge lore fell back (busy) |
| T1-?47 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:349` | draft |  |  | judge lore fell back (busy) |
| T1-?48 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:350` | draft |  |  | judge lore fell back (busy) |
| T1-?49 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:351` | draft |  |  | judge lore fell back (busy) |
| T1-?50 | T1 |  |  | `test/sessions/T1/T1-2-1/console.jsonl:26` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?51 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:353` | draft |  |  | 10 boundaries without a transition at guild-hall while its exits were pending |
| T1-?52 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:383` | draft |  |  | 1 extraction line(s) rejected: DELTA q=adv_looking_for_hands value=true evidence="Come on, you two. We'll be in the tavern if anyone has a real job." (evidence only in the player's line) |
| T1-?53 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:376` | draft |  |  | judge memoryVerify fell back (busy) |
| T1-?54 | T1 |  |  | `test/sessions/T1/T1-2-1/console.jsonl:30` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?55 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:448` | draft |  |  | judge director fell back (timeout) |
| T1-?56 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:449` | draft |  |  | judge scene fell back (busy) |
| T1-?57 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:450` | draft |  |  | judge warden fell back (busy) |
| T1-?58 | T1 |  |  | `test/sessions/T1/T1-2-1/console.jsonl:37` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?59 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:451` | draft |  |  | judge wardenLore fell back (busy) |
| T1-?60 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:474` | draft |  |  | judge lore fell back (busy) |
| T1-?61 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:475` | draft |  |  | judge lore fell back (busy) |
| T1-?62 | T1 |  |  | `test/sessions/T1/T1-2-1/console.jsonl:40` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?63 | T1 |  |  | `test/sessions/T1/T1-2-1/payloads.jsonl:63` | draft |  |  | Dalan was drafted in 2026-10-01@11h22m01s847ms at boundary 15 with no private block while holding 1 private entry acquired before it |
| T1-?64 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:614` | draft |  |  | 1 extraction line(s) rejected: DELTA q=tension_current value="tense" evidence="Take the posting at double the fee as the Ash Lanterns, or do not take it. But there is no third option." (evidence not in window) |
| T1-?65 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:636` | draft |  |  | judge scene fell back (timeout) |
| T1-?66 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:637` | draft |  |  | judge typed fell back (timeout) |
| T1-?67 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:638` | draft |  |  | judge wardenLore fell back (busy) |
| T1-?68 | T1 |  |  | `test/sessions/T1/T1-2-1/console.jsonl:53` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?69 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:639` | draft |  |  | judge warden fell back (busy) |
| T1-?70 | T1 |  |  | `test/sessions/T1/T1-2-1/console.jsonl:54` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?71 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:678` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?72 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:679` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?73 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:680` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?74 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:681` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?75 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:682` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?76 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:683` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?77 | T1 |  |  | `test/sessions/T1/T1-2-1/console.jsonl:59` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?78 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:685` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?79 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:686` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?80 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:687` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?81 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:688` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?82 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:689` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?83 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:690` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?84 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:691` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?85 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:692` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?86 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:693` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?87 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:694` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?88 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:695` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?89 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:696` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?90 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:697` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?91 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:698` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?92 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:699` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?93 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:700` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?94 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:705` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?95 | T1 |  |  | `test/sessions/T1/T1-2-1/console.jsonl:60` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?96 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:706` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?97 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:707` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?98 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:709` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?99 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:710` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?100 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:711` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?101 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:712` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?102 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:713` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?103 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:714` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?104 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:715` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?105 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:716` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?106 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:717` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?107 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:718` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?108 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:719` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?109 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:720` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?110 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:721` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?111 | T1 |  |  | `test/sessions/T1/T1-2-1/journal.jsonl:722` | draft |  |  | judge memoryPairs fell back (busy) |

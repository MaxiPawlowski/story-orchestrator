# Findings draft: T2-1

Session `test/sessions/T2/T2-1-2`. Draft rows for `docs/plans/v2.6/14-findings.md`; severity and class are decided in the review.

## Counts

- flags: 4
- stall: 3
- extraction-rejected: 16
- empty-private-block: 0
- lore-force-lost: 0
- lore-constant-missed: 0
- judge-fallback: 235
- save-lost: 24
- unexpected-jump: 3
- rollback: 1
- console-error: 14
- model-call-failure: 3
- model-defect: 0
- harness-error: 0

### By chat

- `2026-10-01@16h56m09s049ms`: model-call-failure 3, save-lost 24, judge-fallback 235, stall 3, extraction-rejected 16, unexpected-jump 3, rollback 1
- `(no chat)`: console-error 14

## Judge health

- calls: 1446 (answered 1211, busy 192, timeout 43, other fallbacks 0)
- busy rate: 13.3% (by use: memoryPairs 173, lore 14, director 2, curatorFilter 2, memoryVerify 1)
- a busy fallback was never sent: the lane's judge rate limit (or a TypeSafe 429 passed through) held it, and the consumer took its no-judge path

## Model defects

None detected.

## Flags

### 2026-10-01T20:07:42.520Z (message 2)

- note: DeepSeek outage (lead: chat completions hang since ~19:50Z): turn 1 orchestrator passes timed out; pausing turns until DeepSeek answers
- evidence: `journal.jsonl:112`
- context (event-time):
  - #0 Adolion Narrator: You are the heir of House Nightriver, one of the eight great houses of the Darran Kingdom, famous for the mages it raises. Three days ago you walked into the Adventurers' Guild in Aegis City and signed its register under your own name. Whatever life your family had written for you, you mean to write
  - #1 Max Nightriver: Baroness, what did the last expedition find?
  - **#2 Adolion Narrator: The Baroness leans her weight against the stone wall of her manor, arms crossed over her practical gown. Her red eyes narrow, and for a moment the mask of confidence slips. "They found nothing," she says, and the bitterness is sharp. "Until they found it." She straightens, her tusks catching the lig**

### 2026-10-01T21:31:06.114Z (message 2)

- note: DeepSeek back at 21:30Z (probe 0.8-1s). Outage window ~19:50-21:30Z affected only turn 1 (scheduler did not drain, pipeline stalled-rechecking). Resuming play; the idle doubles as the 20-min idle provocation.
- evidence: `journal.jsonl:142`
- context (event-time):
  - #0 Adolion Narrator: You are the heir of House Nightriver, one of the eight great houses of the Darran Kingdom, famous for the mages it raises. Three days ago you walked into the Adventurers' Guild in Aegis City and signed its register under your own name. Whatever life your family had written for you, you mean to write
  - #1 Max Nightriver: Baroness, what did the last expedition find?
  - **#2 Adolion Narrator: The Baroness leans her weight against the stone wall of her manor, arms crossed over her practical gown. Her red eyes narrow, and for a moment the mask of confidence slips. "They found nothing," she says, and the bitterness is sharp. "Until they found it." She straightens, her tusks catching the lig**

### 2026-10-01T21:31:45.642Z (message 4)

- note: Main RP backend down at 21:31Z: ECONNREFUSED 127.0.0.1:18080 (pod tunnel gone), Naomi msg 4 empty (payloads response for request 52). Pausing until the tunnel is back.
- evidence: `journal.jsonl:162`
- context (event-time):
  - #1 Max Nightriver: Baroness, what did the last expedition find?
  - #2 Adolion Narrator: The Baroness leans her weight against the stone wall of her manor, arms crossed over her practical gown. Her red eyes narrow, and for a moment the mask of confidence slips. "They found nothing," she says, and the bitterness is sharp. "Until they found it." She straightens, her tusks catching the lig
  - #3 Max Nightriver: Naomi, you want a fight? Come down with us.
  - **#4 Naomi: **

### 2026-10-01T23:13:23.544Z (message 121)

- note: Chapter record wrong at the act change: Overview 'Your story' titles the Driftmere/mines act 'The Adventurer's Guild', the text opens mid-descent ('The party advanced down a twisting tunnel') and is cut off with an ellipsis before the Devourer is killed; journal says 'chapter sealed ... (without a written summary)' after 4 chapterSeal calls, 2 at the 1024-token cap. Consequences call Driftmere 'Wendhope'.
- evidence: `journal.jsonl:3062`
- context (event-time):
  - #118 Max Nightriver: *I hand my cloak to the butler.* Thank you. Tell Father I'm home. Belle, Dalan, Naomi, Riyo, you're my guests here. Make yourselves comfortable.
  - #119 Belle: Belle's eyes widen as she looks around the estate, taking in the high ceilings and polished stone. She lets out a long, low whistle. "Guest-nya," she echoes Naomi's earlier lilt, though it's more a smirk than a flinch. "Well, fuck me. I've slept in barns and ditches, but I've never been a 'guest' be
  - #120 Dalan: *Dalan stands frozen for a moment, his green-hooded capelet seeming too worn and simple against the marble floors and golden accents of the estate. His pointed ears flush a deep pink as a servant bows to him, and he instinctively tucks his hands into his tunic.* "I... I shouldn't be here," *he whisp
  - **#121 Riyo: *Riyo stands perfectly still at the edge of the party, her purple eyes tracking the butler's movements with wary focus. She doesn't look at the estate's splendor—not once—instead keeping her gaze locked on Max's side as if anchoring herself to his presence. Her left arm remains buried deep beneath h**

## Anomalies

### stall (3)

- 2026-10-01T21:42:02.190Z 10 boundaries without a transition at driftmere while its exits were pending (`journal.jsonl:386`)
- 2026-10-01T21:54:31.943Z 10 boundaries without a transition at the-first-descent while its exits were pending (`journal.jsonl:813`)
- 2026-10-01T22:17:49.647Z 10 boundaries without a transition at the-changed-deep while its exits were pending (`journal.jsonl:1663`)

### extraction-rejected (16)

- 2026-10-01T21:42:56.886Z 2 extraction line(s) rejected: DELTA q=location value="upper_mines" evidence="At first light we stand at the north shaft's mouth." (evidence only in the player's line); DELTA q=entered_mines value=true evidence="We go down." (evidence only in the player's line) (`journal.jsonl:421`)
- 2026-10-01T21:43:02.959Z 2 extraction line(s) rejected: DELTA q=location value="upper_mines" evidence="At first light we stand at the north shaft's mouth." (evidence only in the player's line); DELTA q=entered_mines value=true evidence="At first light we stand at the north shaft's mouth." (evidence only in the player's line) (`journal.jsonl:429`)
- 2026-10-01T22:20:34.045Z 1 extraction line(s) rejected: FACT importance=3 text="Riyo has accepted Max's invitation and joined the party, agreeing to watch their backs in exchange for theirs." evidence="Okay." *The word is quiet but firm, a decision made in the space of a heartbeat.* (unrecognized line) (`journal.jsonl:1724`)
- 2026-10-01T22:22:08.683Z 1 extraction line(s) rejected: DELTA q=location value="deep_mines" evidence="We go deeper, past the fourth floor marker, until the tunnel ends in a wall covered in old carvings." (evidence only in the player's line) (`journal.jsonl:1759`)
- 2026-10-01T22:22:15.431Z 1 extraction line(s) rejected: DELTA q=location value="deep_mines" evidence="We go deeper, past the fourth floor marker, until the tunnel ends in a wall covered in old carvings." (evidence only in the player's line) (`journal.jsonl:1767`)
- 2026-10-01T22:24:35.023Z 1 extraction line(s) rejected: DELTA q=location value="deep_mines" evidence="We go deeper, past the fourth floor marker, until the tunnel ends in a wall covered in old carvings." (evidence only in the player's line) (`journal.jsonl:1798`)
- 2026-10-01T22:24:47.195Z 1 extraction line(s) rejected: DELTA q=location value="deep_mines" evidence="We go deeper, past the fourth floor marker, until the tunnel ends in a wall covered in old carvings." (evidence only in the player's line) (`journal.jsonl:1809`)
- 2026-10-01T22:51:17.589Z 1 extraction line(s) rejected: DELTA q=location value="behind_the_seals" evidence="Beyond the seal, in the heart of the mountain, I face the thing that breathes." (evidence only in the player's line) (`journal.jsonl:2497`)
- 2026-10-01T22:57:06.517Z 1 extraction line(s) rejected: DELTA q=party_injuries value=1 evidence="You're alive." She looks over them, taking in the dirt and blood on their gear. (unrecognized line) (`journal.jsonl:2633`)
- 2026-10-01T23:07:39.717Z 1 extraction line(s) rejected: DELTA q=saga_called_home value=true evidence="A letter from home? Then we go to Aegis City, to the estate." (evidence only in the player's line) (`journal.jsonl:2973`)
- 2026-10-01T23:07:53.090Z 1 extraction line(s) rejected: DELTA q=saga_called_home value=true evidence="A letter from home? Then we go to Aegis City, to the estate." (evidence only in the player's line) (`journal.jsonl:2985`)
- 2026-10-01T23:18:51.205Z 1 extraction line(s) rejected: DELTA q=location value="javon_study" evidence="*I leave the others in the foyer and go up to Father's study.*" (evidence only in the player's line) (`journal.jsonl:3181`)
- 2026-10-01T23:18:57.859Z 1 extraction line(s) rejected: DELTA q=location value="javon_study" evidence="I leave the others in the foyer and go up to Father's study." (evidence only in the player's line) (`journal.jsonl:3186`)
- 2026-10-01T23:20:23.725Z 1 extraction line(s) rejected: DELTA q=location value="javon_study" evidence="*I leave the others in the foyer and go up to Father's study.*" (evidence only in the player's line) (`journal.jsonl:3216`)
- 2026-10-01T23:23:18.397Z 1 extraction line(s) rejected: DELTA q=location value="javon_study" evidence="*I leave the others in the foyer and go up to Father's study.*" (evidence only in the player's line) (`journal.jsonl:3360`)
- 2026-10-01T23:25:04.151Z 1 extraction line(s) rejected: DELTA q=location value="javon_study" evidence="*I leave the others in the foyer and go up to Father's study.*" (evidence only in the player's line) (`journal.jsonl:3398`)

### judge-fallback (235)

- 2026-10-01T21:40:59.203Z judge scene fell back (timeout) (`journal.jsonl:316`)
- 2026-10-01T21:41:49.417Z judge memoryPairs fell back (busy) (`journal.jsonl:364`)
- 2026-10-01T21:41:49.418Z judge memoryPairs fell back (busy) (`journal.jsonl:365`)
- 2026-10-01T21:41:49.418Z judge memoryPairs fell back (busy) (`journal.jsonl:366`)
- 2026-10-01T21:41:49.418Z judge memoryPairs fell back (busy) (`journal.jsonl:367`)
- 2026-10-01T21:41:49.418Z judge memoryPairs fell back (busy) (`journal.jsonl:368`)
- 2026-10-01T21:41:49.418Z judge memoryPairs fell back (busy) (`journal.jsonl:369`)
- 2026-10-01T21:41:49.418Z judge memoryPairs fell back (busy) (`journal.jsonl:370`)
- 2026-10-01T21:41:49.634Z judge memoryPairs fell back (busy) (`journal.jsonl:372`)
- 2026-10-01T21:41:49.634Z judge memoryPairs fell back (busy) (`journal.jsonl:373`)
- 2026-10-01T21:41:49.634Z judge memoryPairs fell back (busy) (`journal.jsonl:374`)
- 2026-10-01T21:41:49.634Z judge memoryPairs fell back (busy) (`journal.jsonl:375`)
- 2026-10-01T21:45:23.882Z judge lore fell back (timeout) (`journal.jsonl:493`)
- 2026-10-01T21:45:23.884Z judge lore fell back (timeout) (`journal.jsonl:494`)
- 2026-10-01T21:49:22.418Z judge scene fell back (timeout) (`journal.jsonl:601`)
- 2026-10-01T21:49:24.851Z judge typed fell back (timeout) (`journal.jsonl:602`)
- 2026-10-01T21:49:26.421Z judge warden fell back (timeout) (`journal.jsonl:603`)
- 2026-10-01T21:50:42.659Z judge memoryPairs fell back (busy) (`journal.jsonl:640`)
- 2026-10-01T21:50:42.659Z judge memoryPairs fell back (busy) (`journal.jsonl:641`)
- 2026-10-01T21:50:42.659Z judge memoryPairs fell back (busy) (`journal.jsonl:642`)
- 2026-10-01T21:50:42.917Z judge memoryPairs fell back (busy) (`journal.jsonl:644`)
- 2026-10-01T21:50:42.917Z judge memoryPairs fell back (busy) (`journal.jsonl:645`)
- 2026-10-01T21:50:42.917Z judge memoryPairs fell back (busy) (`journal.jsonl:646`)
- 2026-10-01T21:50:42.917Z judge memoryPairs fell back (busy) (`journal.jsonl:647`)
- 2026-10-01T21:50:42.917Z judge memoryPairs fell back (busy) (`journal.jsonl:648`)
- 2026-10-01T21:50:42.917Z judge memoryPairs fell back (busy) (`journal.jsonl:649`)
- 2026-10-01T21:50:42.917Z judge memoryPairs fell back (busy) (`journal.jsonl:650`)
- 2026-10-01T21:50:42.917Z judge memoryPairs fell back (busy) (`journal.jsonl:651`)
- 2026-10-01T21:50:42.919Z judge memoryPairs fell back (busy) (`journal.jsonl:652`)
- 2026-10-01T21:50:42.919Z judge memoryPairs fell back (busy) (`journal.jsonl:653`)
- 2026-10-01T21:50:42.919Z judge memoryPairs fell back (busy) (`journal.jsonl:654`)
- 2026-10-01T21:50:42.919Z judge memoryPairs fell back (busy) (`journal.jsonl:655`)
- 2026-10-01T21:50:42.919Z judge memoryPairs fell back (busy) (`journal.jsonl:656`)
- 2026-10-01T21:50:42.919Z judge memoryPairs fell back (busy) (`journal.jsonl:657`)
- 2026-10-01T21:50:54.050Z judge lore fell back (busy) (`journal.jsonl:669`)
- 2026-10-01T21:50:54.050Z judge lore fell back (busy) (`journal.jsonl:670`)
- 2026-10-01T21:50:54.050Z judge lore fell back (busy) (`journal.jsonl:671`)
- 2026-10-01T21:50:54.093Z judge director fell back (busy) (`journal.jsonl:672`)
- 2026-10-01T21:50:56.901Z judge lore fell back (busy) (`journal.jsonl:677`)
- 2026-10-01T21:50:56.902Z judge lore fell back (busy) (`journal.jsonl:678`)
- 2026-10-01T21:50:56.902Z judge lore fell back (busy) (`journal.jsonl:679`)
- 2026-10-01T21:50:56.902Z judge lore fell back (busy) (`journal.jsonl:680`)
- 2026-10-01T22:02:03.650Z judge scene fell back (timeout) (`journal.jsonl:1006`)
- 2026-10-01T22:02:05.696Z judge typed fell back (timeout) (`journal.jsonl:1007`)
- 2026-10-01T22:02:07.647Z judge warden fell back (timeout) (`journal.jsonl:1008`)
- 2026-10-01T22:03:16.475Z judge memoryPairs fell back (busy) (`journal.jsonl:1067`)
- 2026-10-01T22:03:16.475Z judge memoryPairs fell back (busy) (`journal.jsonl:1068`)
- 2026-10-01T22:04:03.064Z judge memoryPairs fell back (busy) (`journal.jsonl:1082`)
- 2026-10-01T22:04:03.064Z judge memoryPairs fell back (busy) (`journal.jsonl:1083`)
- 2026-10-01T22:04:03.064Z judge memoryPairs fell back (busy) (`journal.jsonl:1084`)
- 2026-10-01T22:04:03.064Z judge memoryPairs fell back (busy) (`journal.jsonl:1085`)
- 2026-10-01T22:04:03.064Z judge memoryPairs fell back (busy) (`journal.jsonl:1086`)
- 2026-10-01T22:04:03.065Z judge memoryPairs fell back (busy) (`journal.jsonl:1087`)
- 2026-10-01T22:04:03.067Z judge memoryPairs fell back (busy) (`journal.jsonl:1088`)
- 2026-10-01T22:04:03.067Z judge memoryPairs fell back (busy) (`journal.jsonl:1089`)
- 2026-10-01T22:04:03.067Z judge memoryPairs fell back (busy) (`journal.jsonl:1090`)
- 2026-10-01T22:04:03.067Z judge memoryPairs fell back (busy) (`journal.jsonl:1091`)
- 2026-10-01T22:04:03.067Z judge memoryPairs fell back (busy) (`journal.jsonl:1092`)
- 2026-10-01T22:04:03.067Z judge memoryPairs fell back (busy) (`journal.jsonl:1093`)
- 2026-10-01T22:04:03.067Z judge memoryPairs fell back (busy) (`journal.jsonl:1094`)
- 2026-10-01T22:04:03.067Z judge memoryPairs fell back (busy) (`journal.jsonl:1095`)
- 2026-10-01T22:04:03.069Z judge memoryPairs fell back (busy) (`journal.jsonl:1096`)
- 2026-10-01T22:04:03.069Z judge memoryPairs fell back (busy) (`journal.jsonl:1097`)
- 2026-10-01T22:04:03.069Z judge memoryPairs fell back (busy) (`journal.jsonl:1098`)
- 2026-10-01T22:04:03.069Z judge memoryPairs fell back (busy) (`journal.jsonl:1099`)
- 2026-10-01T22:04:03.069Z judge memoryPairs fell back (busy) (`journal.jsonl:1100`)
- 2026-10-01T22:04:03.069Z judge memoryPairs fell back (busy) (`journal.jsonl:1101`)
- 2026-10-01T22:04:03.069Z judge memoryPairs fell back (busy) (`journal.jsonl:1102`)
- 2026-10-01T22:04:03.071Z judge memoryPairs fell back (busy) (`journal.jsonl:1103`)
- 2026-10-01T22:04:03.071Z judge memoryPairs fell back (busy) (`journal.jsonl:1104`)
- 2026-10-01T22:04:03.071Z judge memoryPairs fell back (busy) (`journal.jsonl:1105`)
- 2026-10-01T22:04:03.071Z judge memoryPairs fell back (busy) (`journal.jsonl:1106`)
- 2026-10-01T22:04:03.071Z judge memoryPairs fell back (busy) (`journal.jsonl:1107`)
- 2026-10-01T22:04:03.071Z judge memoryPairs fell back (busy) (`journal.jsonl:1108`)
- 2026-10-01T22:04:03.071Z judge memoryPairs fell back (busy) (`journal.jsonl:1109`)
- 2026-10-01T22:04:03.071Z judge memoryPairs fell back (busy) (`journal.jsonl:1110`)
- 2026-10-01T22:06:41.786Z judge lore fell back (timeout) (`journal.jsonl:1265`)
- 2026-10-01T22:06:41.798Z judge lore fell back (timeout) (`journal.jsonl:1266`)
- 2026-10-01T22:13:20.859Z judge scene fell back (timeout) (`journal.jsonl:1469`)
- 2026-10-01T22:13:22.660Z judge typed fell back (timeout) (`journal.jsonl:1470`)
- 2026-10-01T22:13:24.894Z judge warden fell back (timeout) (`journal.jsonl:1471`)
- 2026-10-01T22:14:19.580Z judge memoryPairs fell back (busy) (`journal.jsonl:1518`)
- 2026-10-01T22:15:00.903Z judge memoryPairs fell back (busy) (`journal.jsonl:1524`)
- 2026-10-01T22:15:00.903Z judge memoryPairs fell back (busy) (`journal.jsonl:1525`)
- 2026-10-01T22:15:00.903Z judge memoryPairs fell back (busy) (`journal.jsonl:1526`)
- 2026-10-01T22:15:01.189Z judge memoryPairs fell back (busy) (`journal.jsonl:1528`)
- 2026-10-01T22:15:01.189Z judge memoryPairs fell back (busy) (`journal.jsonl:1529`)
- 2026-10-01T22:15:01.189Z judge memoryPairs fell back (busy) (`journal.jsonl:1530`)
- 2026-10-01T22:15:01.189Z judge memoryPairs fell back (busy) (`journal.jsonl:1531`)
- 2026-10-01T22:15:01.189Z judge memoryPairs fell back (busy) (`journal.jsonl:1532`)
- 2026-10-01T22:15:01.189Z judge memoryPairs fell back (busy) (`journal.jsonl:1533`)
- 2026-10-01T22:15:01.189Z judge memoryPairs fell back (busy) (`journal.jsonl:1534`)
- 2026-10-01T22:15:01.189Z judge memoryPairs fell back (busy) (`journal.jsonl:1535`)
- 2026-10-01T22:15:01.190Z judge memoryPairs fell back (busy) (`journal.jsonl:1536`)
- 2026-10-01T22:15:01.190Z judge memoryPairs fell back (busy) (`journal.jsonl:1537`)
- 2026-10-01T22:15:01.190Z judge memoryPairs fell back (busy) (`journal.jsonl:1538`)
- 2026-10-01T22:15:01.190Z judge memoryPairs fell back (busy) (`journal.jsonl:1539`)
- 2026-10-01T22:15:01.190Z judge memoryPairs fell back (busy) (`journal.jsonl:1540`)
- 2026-10-01T22:15:01.190Z judge memoryPairs fell back (busy) (`journal.jsonl:1541`)
- 2026-10-01T22:15:01.190Z judge memoryPairs fell back (busy) (`journal.jsonl:1542`)
- 2026-10-01T22:15:01.190Z judge memoryPairs fell back (busy) (`journal.jsonl:1543`)
- 2026-10-01T22:15:01.192Z judge memoryPairs fell back (busy) (`journal.jsonl:1544`)
- 2026-10-01T22:15:01.192Z judge memoryPairs fell back (busy) (`journal.jsonl:1545`)
- 2026-10-01T22:15:01.192Z judge memoryPairs fell back (busy) (`journal.jsonl:1546`)
- 2026-10-01T22:15:01.192Z judge memoryPairs fell back (busy) (`journal.jsonl:1547`)
- 2026-10-01T22:15:01.192Z judge memoryPairs fell back (busy) (`journal.jsonl:1548`)
- 2026-10-01T22:15:01.192Z judge memoryPairs fell back (busy) (`journal.jsonl:1549`)
- 2026-10-01T22:15:01.192Z judge memoryPairs fell back (busy) (`journal.jsonl:1550`)
- 2026-10-01T22:15:01.192Z judge memoryPairs fell back (busy) (`journal.jsonl:1551`)
- 2026-10-01T22:28:42.486Z judge scene fell back (timeout) (`journal.jsonl:1874`)
- 2026-10-01T22:29:33.091Z judge scene fell back (timeout) (`journal.jsonl:1896`)
- 2026-10-01T22:29:35.584Z judge typed fell back (timeout) (`journal.jsonl:1897`)
- 2026-10-01T22:29:37.093Z judge warden fell back (timeout) (`journal.jsonl:1898`)
- 2026-10-01T22:29:39.594Z judge wardenLore fell back (timeout) (`journal.jsonl:1901`)
- 2026-10-01T22:31:19.943Z judge memoryPairs fell back (busy) (`journal.jsonl:1938`)
- 2026-10-01T22:31:19.943Z judge memoryPairs fell back (busy) (`journal.jsonl:1939`)
- 2026-10-01T22:31:19.943Z judge memoryPairs fell back (busy) (`journal.jsonl:1940`)
- 2026-10-01T22:31:19.945Z judge memoryPairs fell back (busy) (`journal.jsonl:1941`)
- 2026-10-01T22:31:19.947Z judge memoryPairs fell back (busy) (`journal.jsonl:1942`)
- 2026-10-01T22:31:19.947Z judge memoryPairs fell back (busy) (`journal.jsonl:1943`)
- 2026-10-01T22:31:19.947Z judge memoryPairs fell back (busy) (`journal.jsonl:1944`)
- 2026-10-01T22:31:19.947Z judge memoryPairs fell back (busy) (`journal.jsonl:1945`)
- 2026-10-01T22:31:19.947Z judge memoryPairs fell back (busy) (`journal.jsonl:1946`)
- 2026-10-01T22:31:19.947Z judge memoryPairs fell back (busy) (`journal.jsonl:1947`)
- 2026-10-01T22:31:19.947Z judge memoryPairs fell back (busy) (`journal.jsonl:1948`)
- 2026-10-01T22:31:19.947Z judge memoryPairs fell back (busy) (`journal.jsonl:1949`)
- 2026-10-01T22:31:19.948Z judge memoryPairs fell back (busy) (`journal.jsonl:1950`)
- 2026-10-01T22:31:19.948Z judge memoryPairs fell back (busy) (`journal.jsonl:1951`)
- 2026-10-01T22:31:19.948Z judge memoryPairs fell back (busy) (`journal.jsonl:1952`)
- 2026-10-01T22:31:19.948Z judge memoryPairs fell back (busy) (`journal.jsonl:1953`)
- 2026-10-01T22:31:19.948Z judge memoryPairs fell back (busy) (`journal.jsonl:1954`)
- 2026-10-01T22:31:19.948Z judge memoryPairs fell back (busy) (`journal.jsonl:1955`)
- 2026-10-01T22:31:19.948Z judge memoryPairs fell back (busy) (`journal.jsonl:1956`)
- 2026-10-01T22:31:19.948Z judge memoryPairs fell back (busy) (`journal.jsonl:1957`)
- 2026-10-01T22:31:19.950Z judge memoryPairs fell back (busy) (`journal.jsonl:1958`)
- 2026-10-01T22:31:19.950Z judge memoryPairs fell back (busy) (`journal.jsonl:1959`)
- 2026-10-01T22:31:19.950Z judge memoryPairs fell back (busy) (`journal.jsonl:1960`)
- 2026-10-01T22:31:19.950Z judge memoryPairs fell back (busy) (`journal.jsonl:1961`)
- 2026-10-01T22:31:19.950Z judge memoryPairs fell back (busy) (`journal.jsonl:1962`)
- 2026-10-01T22:31:19.950Z judge memoryPairs fell back (busy) (`journal.jsonl:1963`)
- 2026-10-01T22:31:19.950Z judge memoryPairs fell back (busy) (`journal.jsonl:1964`)
- 2026-10-01T22:31:19.950Z judge memoryPairs fell back (busy) (`journal.jsonl:1965`)
- 2026-10-01T22:36:30.739Z judge director fell back (timeout) (`journal.jsonl:2151`)
- 2026-10-01T22:36:40.566Z judge lore fell back (timeout) (`journal.jsonl:2159`)
- 2026-10-01T22:36:40.572Z judge lore fell back (timeout) (`journal.jsonl:2160`)
- 2026-10-01T22:43:04.081Z judge warden fell back (timeout) (`journal.jsonl:2281`)
- 2026-10-01T22:43:04.081Z judge wardenLore fell back (timeout) (`journal.jsonl:2282`)
- 2026-10-01T22:45:41.142Z judge scene fell back (timeout) (`journal.jsonl:2327`)
- 2026-10-01T22:45:43.185Z judge warden fell back (timeout) (`journal.jsonl:2328`)
- 2026-10-01T22:45:45.149Z judge wardenLore fell back (timeout) (`journal.jsonl:2329`)
- 2026-10-01T22:47:27.845Z judge memoryPairs fell back (busy) (`journal.jsonl:2381`)
- 2026-10-01T22:47:27.845Z judge memoryPairs fell back (busy) (`journal.jsonl:2382`)
- 2026-10-01T22:47:27.845Z judge memoryPairs fell back (busy) (`journal.jsonl:2383`)
- 2026-10-01T22:47:27.846Z judge memoryPairs fell back (busy) (`journal.jsonl:2384`)
- 2026-10-01T22:47:27.848Z judge memoryPairs fell back (busy) (`journal.jsonl:2385`)
- 2026-10-01T22:47:27.849Z judge memoryPairs fell back (busy) (`journal.jsonl:2386`)
- 2026-10-01T22:47:27.849Z judge memoryPairs fell back (busy) (`journal.jsonl:2387`)
- 2026-10-01T22:47:27.849Z judge memoryPairs fell back (busy) (`journal.jsonl:2388`)
- 2026-10-01T22:47:27.849Z judge memoryPairs fell back (busy) (`journal.jsonl:2389`)
- 2026-10-01T22:47:27.849Z judge memoryPairs fell back (busy) (`journal.jsonl:2390`)
- 2026-10-01T22:47:27.849Z judge memoryPairs fell back (busy) (`journal.jsonl:2391`)
- 2026-10-01T22:47:27.849Z judge memoryPairs fell back (busy) (`journal.jsonl:2392`)
- 2026-10-01T22:47:27.850Z judge memoryPairs fell back (busy) (`journal.jsonl:2393`)
- 2026-10-01T22:47:27.850Z judge memoryPairs fell back (busy) (`journal.jsonl:2394`)
- 2026-10-01T22:47:27.850Z judge memoryPairs fell back (busy) (`journal.jsonl:2395`)
- 2026-10-01T22:47:27.850Z judge memoryPairs fell back (busy) (`journal.jsonl:2396`)
- 2026-10-01T22:47:27.850Z judge memoryPairs fell back (busy) (`journal.jsonl:2397`)
- 2026-10-01T22:47:27.850Z judge memoryPairs fell back (busy) (`journal.jsonl:2398`)
- 2026-10-01T22:47:27.850Z judge memoryPairs fell back (busy) (`journal.jsonl:2399`)
- 2026-10-01T22:47:27.851Z judge memoryPairs fell back (busy) (`journal.jsonl:2400`)
- 2026-10-01T22:47:27.853Z judge memoryPairs fell back (busy) (`journal.jsonl:2401`)
- 2026-10-01T22:47:27.853Z judge memoryPairs fell back (busy) (`journal.jsonl:2402`)
- 2026-10-01T22:47:27.853Z judge memoryPairs fell back (busy) (`journal.jsonl:2403`)
- 2026-10-01T22:47:27.853Z judge memoryPairs fell back (busy) (`journal.jsonl:2404`)
- 2026-10-01T22:47:27.853Z judge memoryPairs fell back (busy) (`journal.jsonl:2405`)
- 2026-10-01T22:47:27.853Z judge memoryPairs fell back (busy) (`journal.jsonl:2406`)
- 2026-10-01T22:47:27.853Z judge memoryPairs fell back (busy) (`journal.jsonl:2407`)
- 2026-10-01T22:47:27.853Z judge memoryPairs fell back (busy) (`journal.jsonl:2408`)
- 2026-10-01T22:56:42.829Z judge director fell back (timeout) (`journal.jsonl:2604`)
- 2026-10-01T22:58:33.300Z judge director fell back (timeout) (`journal.jsonl:2649`)
- 2026-10-01T23:00:17.929Z judge director fell back (timeout) (`journal.jsonl:2695`)
- 2026-10-01T23:02:13.050Z judge scene fell back (timeout) (`journal.jsonl:2735`)
- 2026-10-01T23:02:15.549Z judge typed fell back (timeout) (`journal.jsonl:2736`)
- 2026-10-01T23:02:17.062Z judge warden fell back (timeout) (`journal.jsonl:2737`)
- 2026-10-01T23:02:21.094Z judge lore fell back (timeout) (`journal.jsonl:2747`)
- 2026-10-01T23:03:15.233Z judge director fell back (timeout) (`journal.jsonl:2767`)
- 2026-10-01T23:03:48.485Z judge memoryPairs fell back (busy) (`journal.jsonl:2806`)
- 2026-10-01T23:03:48.485Z judge memoryPairs fell back (busy) (`journal.jsonl:2807`)
- 2026-10-01T23:03:48.485Z judge memoryPairs fell back (busy) (`journal.jsonl:2808`)
- 2026-10-01T23:03:48.485Z judge memoryPairs fell back (busy) (`journal.jsonl:2809`)
- 2026-10-01T23:03:48.485Z judge memoryPairs fell back (busy) (`journal.jsonl:2810`)
- 2026-10-01T23:03:48.485Z judge memoryPairs fell back (busy) (`journal.jsonl:2811`)
- 2026-10-01T23:04:33.426Z judge memoryPairs fell back (busy) (`journal.jsonl:2824`)
- 2026-10-01T23:04:33.426Z judge memoryPairs fell back (busy) (`journal.jsonl:2825`)
- 2026-10-01T23:04:33.435Z judge memoryPairs fell back (busy) (`journal.jsonl:2827`)
- 2026-10-01T23:04:33.435Z judge memoryPairs fell back (busy) (`journal.jsonl:2828`)
- 2026-10-01T23:04:33.435Z judge memoryPairs fell back (busy) (`journal.jsonl:2829`)
- 2026-10-01T23:04:33.435Z judge memoryPairs fell back (busy) (`journal.jsonl:2830`)
- 2026-10-01T23:04:33.435Z judge memoryPairs fell back (busy) (`journal.jsonl:2831`)
- 2026-10-01T23:04:33.435Z judge memoryPairs fell back (busy) (`journal.jsonl:2832`)
- 2026-10-01T23:04:33.435Z judge memoryPairs fell back (busy) (`journal.jsonl:2833`)
- 2026-10-01T23:04:33.435Z judge memoryPairs fell back (busy) (`journal.jsonl:2834`)
- 2026-10-01T23:04:36.670Z judge memoryVerify fell back (busy) (`journal.jsonl:2842`)
- 2026-10-01T23:04:41.270Z judge curatorFilter fell back (busy) (`journal.jsonl:2847`)
- 2026-10-01T23:06:04.343Z judge scene fell back (timeout) (`journal.jsonl:2921`)
- 2026-10-01T23:08:56.255Z judge lore fell back (timeout) (`journal.jsonl:2992`)
- 2026-10-01T23:08:57.157Z judge scene fell back (timeout) (`journal.jsonl:2993`)
- 2026-10-01T23:15:02.129Z judge director fell back (timeout) (`journal.jsonl:3074`)
- 2026-10-01T23:20:14.205Z judge scene fell back (timeout) (`journal.jsonl:3203`)
- 2026-10-01T23:20:16.136Z judge typed fell back (timeout) (`journal.jsonl:3204`)
- 2026-10-01T23:20:18.305Z judge warden fell back (timeout) (`journal.jsonl:3205`)
- 2026-10-01T23:21:51.333Z judge memoryPairs fell back (busy) (`journal.jsonl:3255`)
- 2026-10-01T23:21:51.333Z judge memoryPairs fell back (busy) (`journal.jsonl:3256`)
- 2026-10-01T23:21:51.333Z judge memoryPairs fell back (busy) (`journal.jsonl:3257`)
- 2026-10-01T23:21:51.333Z judge memoryPairs fell back (busy) (`journal.jsonl:3258`)
- 2026-10-01T23:21:51.346Z judge memoryPairs fell back (busy) (`journal.jsonl:3260`)
- 2026-10-01T23:21:51.346Z judge memoryPairs fell back (busy) (`journal.jsonl:3261`)
- 2026-10-01T23:21:51.346Z judge memoryPairs fell back (busy) (`journal.jsonl:3262`)
- 2026-10-01T23:21:51.346Z judge memoryPairs fell back (busy) (`journal.jsonl:3263`)
- 2026-10-01T23:21:51.346Z judge memoryPairs fell back (busy) (`journal.jsonl:3264`)
- 2026-10-01T23:21:51.346Z judge memoryPairs fell back (busy) (`journal.jsonl:3265`)
- 2026-10-01T23:21:51.346Z judge memoryPairs fell back (busy) (`journal.jsonl:3266`)
- 2026-10-01T23:21:51.346Z judge memoryPairs fell back (busy) (`journal.jsonl:3267`)
- 2026-10-01T23:21:51.346Z judge memoryPairs fell back (busy) (`journal.jsonl:3268`)
- 2026-10-01T23:21:51.346Z judge memoryPairs fell back (busy) (`journal.jsonl:3269`)
- 2026-10-01T23:21:54.465Z judge curatorFilter fell back (busy) (`journal.jsonl:3272`)
- 2026-10-01T23:22:11.792Z judge lore fell back (busy) (`journal.jsonl:3289`)
- 2026-10-01T23:22:11.793Z judge lore fell back (busy) (`journal.jsonl:3290`)
- 2026-10-01T23:22:11.793Z judge lore fell back (busy) (`journal.jsonl:3291`)
- 2026-10-01T23:22:11.793Z judge lore fell back (busy) (`journal.jsonl:3292`)
- 2026-10-01T23:22:11.844Z judge director fell back (busy) (`journal.jsonl:3293`)
- 2026-10-01T23:22:17.558Z judge lore fell back (busy) (`journal.jsonl:3299`)
- 2026-10-01T23:22:17.558Z judge lore fell back (busy) (`journal.jsonl:3300`)
- 2026-10-01T23:22:17.558Z judge lore fell back (busy) (`journal.jsonl:3301`)
- 2026-10-01T23:24:56.314Z judge director fell back (timeout) (`journal.jsonl:3384`)

### save-lost (24)

- 2026-10-01T20:29:54.522Z save not confirmed (`journal.jsonl:113`)
- 2026-10-01T20:39:54.625Z save not confirmed (`journal.jsonl:114`)
- 2026-10-01T20:49:54.680Z save not confirmed (`journal.jsonl:115`)
- 2026-10-01T20:59:54.750Z save not confirmed (`journal.jsonl:116`)
- 2026-10-01T21:09:54.835Z save not confirmed (`journal.jsonl:117`)
- 2026-10-01T21:19:54.915Z save not confirmed (`journal.jsonl:118`)
- 2026-10-01T21:29:54.992Z save not confirmed (`journal.jsonl:119`)
- 2026-10-01T22:13:24.896Z save not confirmed (`journal.jsonl:1472`)
- 2026-10-01T22:13:25.018Z save not confirmed (`journal.jsonl:1473`)
- 2026-10-01T22:13:25.417Z save not confirmed (`journal.jsonl:1474`)
- 2026-10-01T22:13:25.496Z save not confirmed (`journal.jsonl:1475`)
- 2026-10-01T22:29:37.971Z save not confirmed (`journal.jsonl:1899`)
- 2026-10-01T22:29:38.094Z save not confirmed (`journal.jsonl:1900`)
- 2026-10-01T22:36:17.099Z save not confirmed (`journal.jsonl:2148`)
- 2026-10-01T22:45:45.990Z save not confirmed (`journal.jsonl:2330`)
- 2026-10-01T23:02:17.984Z save not confirmed (`journal.jsonl:2740`)
- 2026-10-01T23:02:18.062Z save not confirmed (`journal.jsonl:2741`)
- 2026-10-01T23:02:18.156Z save not confirmed (`journal.jsonl:2742`)
- 2026-10-01T23:02:18.265Z save not confirmed (`journal.jsonl:2743`)
- 2026-10-01T23:02:18.343Z save not confirmed (`journal.jsonl:2744`)
- 2026-10-01T23:20:18.629Z save not confirmed (`journal.jsonl:3207`)
- 2026-10-01T23:20:18.723Z save not confirmed (`journal.jsonl:3208`)
- 2026-10-01T23:20:18.817Z save not confirmed (`journal.jsonl:3209`)
- 2026-10-01T23:20:18.894Z save not confirmed (`journal.jsonl:3210`)

### unexpected-jump (3)

- 2026-10-01T22:01:59.749Z the-first-descent → gen_between-the-floors_1 is not an authored transition (a generated route?) (`journal.jsonl:1001`)
- 2026-10-01T22:03:05.747Z gen_between-the-floors_1 → gen_between-the-floors_2 is not an authored transition (a generated route?) (`journal.jsonl:1030`)
- 2026-10-01T22:07:48.148Z gen_between-the-floors_2 → the-changed-deep is not an authored transition (`journal.jsonl:1328`)

### rollback (1)

- 2026-10-01T23:16:44.388Z boundary went back from 78 to 77 (`journal.jsonl:3122`)

### console-error (14)

- 2026-10-01T21:41:49.418Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:21`)
- 2026-10-01T21:50:42.659Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:59`)
- 2026-10-01T22:03:16.476Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:113`)
- 2026-10-01T22:04:03.064Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:116`)
- 2026-10-01T22:04:03.065Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:117`)
- 2026-10-01T22:14:19.580Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:150`)
- 2026-10-01T22:15:00.904Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:151`)
- 2026-10-01T22:31:19.943Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:185`)
- 2026-10-01T22:31:19.945Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:186`)
- 2026-10-01T22:47:27.846Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:234`)
- 2026-10-01T22:47:27.847Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:235`)
- 2026-10-01T23:03:48.485Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:299`)
- 2026-10-01T23:04:33.425Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:303`)
- 2026-10-01T23:21:51.333Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:372`)

### model-call-failure (3)

- 2026-10-01T19:57:10.746Z read via 975bc0dc-956b-4cd8-9fe4-9be158e01847: timeout (`journal.jsonl:106`)
- 2026-10-01T19:58:47.550Z read via 975bc0dc-956b-4cd8-9fe4-9be158e01847: timeout (`journal.jsonl:108`)
- 2026-10-01T20:00:24.600Z read via 975bc0dc-956b-4cd8-9fe4-9be158e01847: timeout (`journal.jsonl:110`)

## Draft register rows

| id | tier | severity | class | evidence | status | fix commit | eval | what |
|---|---|---|---|---|---|---|---|---|
| T2-?1 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:112` | draft |  |  | DeepSeek outage (lead: chat completions hang since ~19:50Z): turn 1 orchestrator passes timed out; pausing turns until DeepSeek answers |
| T2-?2 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:142` | draft |  |  | DeepSeek back at 21:30Z (probe 0.8-1s). Outage window ~19:50-21:30Z affected only turn 1 (scheduler did not drain, pipeline stalled-rechecking). Resuming play; the idle doubles as the 20-min idle provocation. |
| T2-?3 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:162` | draft |  |  | Main RP backend down at 21:31Z: ECONNREFUSED 127.0.0.1:18080 (pod tunnel gone), Naomi msg 4 empty (payloads response for request 52). Pausing until the tunnel is back. |
| T2-?4 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3062` | draft |  |  | Chapter record wrong at the act change: Overview 'Your story' titles the Driftmere/mines act 'The Adventurer's Guild', the text opens mid-descent ('The party advanced down a twisting tunnel') and is cut off with an ellipsis before the Devourer is killed; journal says 'chapter sealed ... (without a written summary)' after 4 chapterSeal calls, 2 at the 1024-token cap. Consequences call Driftmere 'Wendhope'. |
| T2-?5 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:106` | draft |  |  | read via 975bc0dc-956b-4cd8-9fe4-9be158e01847: timeout |
| T2-?6 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:108` | draft |  |  | read via 975bc0dc-956b-4cd8-9fe4-9be158e01847: timeout |
| T2-?7 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:110` | draft |  |  | read via 975bc0dc-956b-4cd8-9fe4-9be158e01847: timeout |
| T2-?8 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:113` | draft |  |  | save not confirmed |
| T2-?9 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:114` | draft |  |  | save not confirmed |
| T2-?10 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:115` | draft |  |  | save not confirmed |
| T2-?11 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:116` | draft |  |  | save not confirmed |
| T2-?12 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:117` | draft |  |  | save not confirmed |
| T2-?13 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:118` | draft |  |  | save not confirmed |
| T2-?14 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:119` | draft |  |  | save not confirmed |
| T2-?15 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:316` | draft |  |  | judge scene fell back (timeout) |
| T2-?16 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:364` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?17 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:365` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?18 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:366` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?19 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:367` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?20 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:368` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?21 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:369` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?22 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:370` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?23 | T2 |  |  | `test/sessions/T2/T2-1-2/console.jsonl:21` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T2-?24 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:372` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?25 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:373` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?26 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:374` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?27 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:375` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?28 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:386` | draft |  |  | 10 boundaries without a transition at driftmere while its exits were pending |
| T2-?29 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:421` | draft |  |  | 2 extraction line(s) rejected: DELTA q=location value="upper_mines" evidence="At first light we stand at the north shaft's mouth." (evidence only in the player's line); DELTA q=entered_mines value=true evidence="We go down." (evidence only in the player's line) |
| T2-?30 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:429` | draft |  |  | 2 extraction line(s) rejected: DELTA q=location value="upper_mines" evidence="At first light we stand at the north shaft's mouth." (evidence only in the player's line); DELTA q=entered_mines value=true evidence="At first light we stand at the north shaft's mouth." (evidence only in the player's line) |
| T2-?31 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:493` | draft |  |  | judge lore fell back (timeout) |
| T2-?32 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:494` | draft |  |  | judge lore fell back (timeout) |
| T2-?33 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:601` | draft |  |  | judge scene fell back (timeout) |
| T2-?34 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:602` | draft |  |  | judge typed fell back (timeout) |
| T2-?35 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:603` | draft |  |  | judge warden fell back (timeout) |
| T2-?36 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:640` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?37 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:641` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?38 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:642` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?39 | T2 |  |  | `test/sessions/T2/T2-1-2/console.jsonl:59` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T2-?40 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:644` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?41 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:645` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?42 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:646` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?43 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:647` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?44 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:648` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?45 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:649` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?46 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:650` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?47 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:651` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?48 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:652` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?49 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:653` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?50 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:654` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?51 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:655` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?52 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:656` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?53 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:657` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?54 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:669` | draft |  |  | judge lore fell back (busy) |
| T2-?55 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:670` | draft |  |  | judge lore fell back (busy) |
| T2-?56 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:671` | draft |  |  | judge lore fell back (busy) |
| T2-?57 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:672` | draft |  |  | judge director fell back (busy) |
| T2-?58 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:677` | draft |  |  | judge lore fell back (busy) |
| T2-?59 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:678` | draft |  |  | judge lore fell back (busy) |
| T2-?60 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:679` | draft |  |  | judge lore fell back (busy) |
| T2-?61 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:680` | draft |  |  | judge lore fell back (busy) |
| T2-?62 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:813` | draft |  |  | 10 boundaries without a transition at the-first-descent while its exits were pending |
| T2-?63 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1001` | draft |  |  | the-first-descent → gen_between-the-floors_1 is not an authored transition (a generated route?) |
| T2-?64 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1006` | draft |  |  | judge scene fell back (timeout) |
| T2-?65 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1007` | draft |  |  | judge typed fell back (timeout) |
| T2-?66 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1008` | draft |  |  | judge warden fell back (timeout) |
| T2-?67 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1030` | draft |  |  | gen_between-the-floors_1 → gen_between-the-floors_2 is not an authored transition (a generated route?) |
| T2-?68 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1067` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?69 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1068` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?70 | T2 |  |  | `test/sessions/T2/T2-1-2/console.jsonl:113` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T2-?71 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1082` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?72 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1083` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?73 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1084` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?74 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1085` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?75 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1086` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?76 | T2 |  |  | `test/sessions/T2/T2-1-2/console.jsonl:116` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T2-?77 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1087` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?78 | T2 |  |  | `test/sessions/T2/T2-1-2/console.jsonl:117` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T2-?79 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1088` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?80 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1089` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?81 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1090` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?82 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1091` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?83 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1092` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?84 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1093` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?85 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1094` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?86 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1095` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?87 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1096` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?88 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1097` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?89 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1098` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?90 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1099` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?91 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1100` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?92 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1101` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?93 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1102` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?94 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1103` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?95 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1104` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?96 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1105` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?97 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1106` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?98 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1107` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?99 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1108` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?100 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1109` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?101 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1110` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?102 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1265` | draft |  |  | judge lore fell back (timeout) |
| T2-?103 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1266` | draft |  |  | judge lore fell back (timeout) |
| T2-?104 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1328` | draft |  |  | gen_between-the-floors_2 → the-changed-deep is not an authored transition |
| T2-?105 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1469` | draft |  |  | judge scene fell back (timeout) |
| T2-?106 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1470` | draft |  |  | judge typed fell back (timeout) |
| T2-?107 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1471` | draft |  |  | judge warden fell back (timeout) |
| T2-?108 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1472` | draft |  |  | save not confirmed |
| T2-?109 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1473` | draft |  |  | save not confirmed |
| T2-?110 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1474` | draft |  |  | save not confirmed |
| T2-?111 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1475` | draft |  |  | save not confirmed |
| T2-?112 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1518` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?113 | T2 |  |  | `test/sessions/T2/T2-1-2/console.jsonl:150` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T2-?114 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1524` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?115 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1525` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?116 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1526` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?117 | T2 |  |  | `test/sessions/T2/T2-1-2/console.jsonl:151` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T2-?118 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1528` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?119 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1529` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?120 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1530` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?121 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1531` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?122 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1532` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?123 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1533` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?124 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1534` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?125 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1535` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?126 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1536` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?127 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1537` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?128 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1538` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?129 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1539` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?130 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1540` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?131 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1541` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?132 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1542` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?133 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1543` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?134 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1544` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?135 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1545` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?136 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1546` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?137 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1547` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?138 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1548` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?139 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1549` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?140 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1550` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?141 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1551` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?142 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1663` | draft |  |  | 10 boundaries without a transition at the-changed-deep while its exits were pending |
| T2-?143 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1724` | draft |  |  | 1 extraction line(s) rejected: FACT importance=3 text="Riyo has accepted Max's invitation and joined the party, agreeing to watch their backs in exchange for theirs." evidence="Okay." *The word is quiet but firm, a decision made in the space of a heartbeat.* (unrecognized line) |
| T2-?144 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1759` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="deep_mines" evidence="We go deeper, past the fourth floor marker, until the tunnel ends in a wall covered in old carvings." (evidence only in the player's line) |
| T2-?145 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1767` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="deep_mines" evidence="We go deeper, past the fourth floor marker, until the tunnel ends in a wall covered in old carvings." (evidence only in the player's line) |
| T2-?146 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1798` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="deep_mines" evidence="We go deeper, past the fourth floor marker, until the tunnel ends in a wall covered in old carvings." (evidence only in the player's line) |
| T2-?147 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1809` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="deep_mines" evidence="We go deeper, past the fourth floor marker, until the tunnel ends in a wall covered in old carvings." (evidence only in the player's line) |
| T2-?148 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1874` | draft |  |  | judge scene fell back (timeout) |
| T2-?149 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1896` | draft |  |  | judge scene fell back (timeout) |
| T2-?150 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1897` | draft |  |  | judge typed fell back (timeout) |
| T2-?151 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1898` | draft |  |  | judge warden fell back (timeout) |
| T2-?152 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1899` | draft |  |  | save not confirmed |
| T2-?153 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1900` | draft |  |  | save not confirmed |
| T2-?154 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1901` | draft |  |  | judge wardenLore fell back (timeout) |
| T2-?155 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1938` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?156 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1939` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?157 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1940` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?158 | T2 |  |  | `test/sessions/T2/T2-1-2/console.jsonl:185` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T2-?159 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1941` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?160 | T2 |  |  | `test/sessions/T2/T2-1-2/console.jsonl:186` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T2-?161 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1942` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?162 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1943` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?163 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1944` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?164 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1945` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?165 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1946` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?166 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1947` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?167 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1948` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?168 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1949` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?169 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1950` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?170 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1951` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?171 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1952` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?172 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1953` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?173 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1954` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?174 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1955` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?175 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1956` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?176 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1957` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?177 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1958` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?178 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1959` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?179 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1960` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?180 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1961` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?181 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1962` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?182 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1963` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?183 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1964` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?184 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:1965` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?185 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2148` | draft |  |  | save not confirmed |
| T2-?186 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2151` | draft |  |  | judge director fell back (timeout) |
| T2-?187 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2159` | draft |  |  | judge lore fell back (timeout) |
| T2-?188 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2160` | draft |  |  | judge lore fell back (timeout) |
| T2-?189 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2281` | draft |  |  | judge warden fell back (timeout) |
| T2-?190 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2282` | draft |  |  | judge wardenLore fell back (timeout) |
| T2-?191 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2327` | draft |  |  | judge scene fell back (timeout) |
| T2-?192 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2328` | draft |  |  | judge warden fell back (timeout) |
| T2-?193 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2329` | draft |  |  | judge wardenLore fell back (timeout) |
| T2-?194 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2330` | draft |  |  | save not confirmed |
| T2-?195 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2381` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?196 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2382` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?197 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2383` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?198 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2384` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?199 | T2 |  |  | `test/sessions/T2/T2-1-2/console.jsonl:234` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T2-?200 | T2 |  |  | `test/sessions/T2/T2-1-2/console.jsonl:235` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T2-?201 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2385` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?202 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2386` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?203 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2387` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?204 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2388` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?205 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2389` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?206 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2390` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?207 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2391` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?208 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2392` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?209 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2393` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?210 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2394` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?211 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2395` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?212 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2396` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?213 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2397` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?214 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2398` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?215 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2399` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?216 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2400` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?217 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2401` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?218 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2402` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?219 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2403` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?220 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2404` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?221 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2405` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?222 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2406` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?223 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2407` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?224 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2408` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?225 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2497` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="behind_the_seals" evidence="Beyond the seal, in the heart of the mountain, I face the thing that breathes." (evidence only in the player's line) |
| T2-?226 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2604` | draft |  |  | judge director fell back (timeout) |
| T2-?227 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2633` | draft |  |  | 1 extraction line(s) rejected: DELTA q=party_injuries value=1 evidence="You're alive." She looks over them, taking in the dirt and blood on their gear. (unrecognized line) |
| T2-?228 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2649` | draft |  |  | judge director fell back (timeout) |
| T2-?229 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2695` | draft |  |  | judge director fell back (timeout) |
| T2-?230 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2735` | draft |  |  | judge scene fell back (timeout) |
| T2-?231 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2736` | draft |  |  | judge typed fell back (timeout) |
| T2-?232 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2737` | draft |  |  | judge warden fell back (timeout) |
| T2-?233 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2740` | draft |  |  | save not confirmed |
| T2-?234 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2741` | draft |  |  | save not confirmed |
| T2-?235 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2742` | draft |  |  | save not confirmed |
| T2-?236 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2743` | draft |  |  | save not confirmed |
| T2-?237 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2744` | draft |  |  | save not confirmed |
| T2-?238 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2747` | draft |  |  | judge lore fell back (timeout) |
| T2-?239 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2767` | draft |  |  | judge director fell back (timeout) |
| T2-?240 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2806` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?241 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2807` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?242 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2808` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?243 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2809` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?244 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2810` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?245 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2811` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?246 | T2 |  |  | `test/sessions/T2/T2-1-2/console.jsonl:299` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T2-?247 | T2 |  |  | `test/sessions/T2/T2-1-2/console.jsonl:303` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T2-?248 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2824` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?249 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2825` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?250 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2827` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?251 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2828` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?252 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2829` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?253 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2830` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?254 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2831` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?255 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2832` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?256 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2833` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?257 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2834` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?258 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2842` | draft |  |  | judge memoryVerify fell back (busy) |
| T2-?259 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2847` | draft |  |  | judge curatorFilter fell back (busy) |
| T2-?260 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2921` | draft |  |  | judge scene fell back (timeout) |
| T2-?261 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2973` | draft |  |  | 1 extraction line(s) rejected: DELTA q=saga_called_home value=true evidence="A letter from home? Then we go to Aegis City, to the estate." (evidence only in the player's line) |
| T2-?262 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2985` | draft |  |  | 1 extraction line(s) rejected: DELTA q=saga_called_home value=true evidence="A letter from home? Then we go to Aegis City, to the estate." (evidence only in the player's line) |
| T2-?263 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2992` | draft |  |  | judge lore fell back (timeout) |
| T2-?264 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:2993` | draft |  |  | judge scene fell back (timeout) |
| T2-?265 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3074` | draft |  |  | judge director fell back (timeout) |
| T2-?266 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3122` | draft |  |  | boundary went back from 78 to 77 |
| T2-?267 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3181` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="javon_study" evidence="*I leave the others in the foyer and go up to Father's study.*" (evidence only in the player's line) |
| T2-?268 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3186` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="javon_study" evidence="I leave the others in the foyer and go up to Father's study." (evidence only in the player's line) |
| T2-?269 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3203` | draft |  |  | judge scene fell back (timeout) |
| T2-?270 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3204` | draft |  |  | judge typed fell back (timeout) |
| T2-?271 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3205` | draft |  |  | judge warden fell back (timeout) |
| T2-?272 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3207` | draft |  |  | save not confirmed |
| T2-?273 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3208` | draft |  |  | save not confirmed |
| T2-?274 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3209` | draft |  |  | save not confirmed |
| T2-?275 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3210` | draft |  |  | save not confirmed |
| T2-?276 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3216` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="javon_study" evidence="*I leave the others in the foyer and go up to Father's study.*" (evidence only in the player's line) |
| T2-?277 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3255` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?278 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3256` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?279 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3257` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?280 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3258` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?281 | T2 |  |  | `test/sessions/T2/T2-1-2/console.jsonl:372` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T2-?282 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3260` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?283 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3261` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?284 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3262` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?285 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3263` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?286 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3264` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?287 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3265` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?288 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3266` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?289 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3267` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?290 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3268` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?291 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3269` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?292 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3272` | draft |  |  | judge curatorFilter fell back (busy) |
| T2-?293 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3289` | draft |  |  | judge lore fell back (busy) |
| T2-?294 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3290` | draft |  |  | judge lore fell back (busy) |
| T2-?295 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3291` | draft |  |  | judge lore fell back (busy) |
| T2-?296 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3292` | draft |  |  | judge lore fell back (busy) |
| T2-?297 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3293` | draft |  |  | judge director fell back (busy) |
| T2-?298 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3299` | draft |  |  | judge lore fell back (busy) |
| T2-?299 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3300` | draft |  |  | judge lore fell back (busy) |
| T2-?300 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3301` | draft |  |  | judge lore fell back (busy) |
| T2-?301 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3360` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="javon_study" evidence="*I leave the others in the foyer and go up to Father's study.*" (evidence only in the player's line) |
| T2-?302 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3384` | draft |  |  | judge director fell back (timeout) |
| T2-?303 | T2 |  |  | `test/sessions/T2/T2-1-2/journal.jsonl:3398` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="javon_study" evidence="*I leave the others in the foyer and go up to Father's study.*" (evidence only in the player's line) |

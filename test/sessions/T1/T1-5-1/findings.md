# Findings draft: T1-5

Session `test/sessions/T1/T1-5-1`. Draft rows for `docs/plans/v2.6/14-findings.md`; severity and class are decided in the review.

## Counts

- flags: 6
- stall: 1
- extraction-rejected: 11
- empty-private-block: 0
- lore-force-lost: 0
- lore-constant-missed: 0
- judge-fallback: 74
- save-lost: 0
- unexpected-jump: 3
- rollback: 0
- console-error: 21
- model-call-failure: 0
- model-defect: 8
- harness-error: 0

## Judge health

- calls: 570 (answered 496, busy 64, timeout 10, other fallbacks 0)
- busy rate: 11.2% (by use: memoryPairs 35, lore 14, wardenLore 5, warden 4, scene 2, typed 2, memoryVerify 1, director 1)
- a busy fallback was never sent: the lane's judge rate limit (or a TypeSafe 429 passed through) held it, and the consumer took its no-judge path

## Model defects

- 2 turn(s) with a defective reply: loop 3, corrupt 5; swiped once by the loop guard: 0

## Flags

### 2026-10-01T17:03:37.982Z (message 11)

- note: Kayla never answers (addressed msgs 6, 8, 10). She and Erevan are disabled in the group: the session jumped straight to Kelger Falls (activateCheckpoint), so only Kelger's cast change (enable Zariah) ran on top of night-the-slums' disables; the skipped checkpoints' cast never replayed. The card says Kayla and Erevan travel with the party; the narrator even mentions Erevan (msg 5).
- evidence: `journal.jsonl:176`
- context (event-time):
  - #8 Max Nightriver: *I keep my voice low.* Safe isn't the same as at rest, and you look like you haven't slept since they died. *I glance at Kayla.* Kayla, can you show her? Let them go easy, and the fog goes with them.
  - #9 Zariah: "I-I haven't..." *She starts, her voice trailing off, and her eyes flash with a sharp, sudden spark of defensiveness.* "I don't sleep... not much." *She shifts her weight, and her brown eyes flicker toward Kayla.* "And you can't just... let them go." *Her voice softens, but therees is a flaw in it n
  - #10 Max Nightriver: Kayla? *I turn to her fully.* You've laid souls down before. Walk Zariah through it, one at a time, starting with the fisherman.
  - **#11 Zariah: "The fisherman..." *Her voice is quiet, nearly a whisper, and her eyes flicker toward the skeletal figure by the net.* "He-he was always the first to cast his nets. Every morning... before the first light..." *The memories seem to draw from her, pulling her hollow expression into something more frag**

### 2026-10-01T17:12:41.585Z (message 26)

- note: Looping at Zariah (msgs 9-26): five turns of 'I can't / it doesn't work like that' with no path offered; the authored helper Kayla is disabled (see earlier flag), so the fog has no way to break. HUD shows 'catching up…' since msg ~12.
- evidence: `journal.jsonl:357`
- context (event-time):
  - #23 Max Nightriver: *I keep rowing past twenty, past fifty, until my arms burn.* Zariah. Look back. Is the fog still on the town, or is it letting go?
  - #24 Zariah: *She stands up, her grip tightening on the bow, her eyes fixed on the dark silhouette of the harbour behind them.* "It's... it's still there." *The words come out small and hollow, her voice barely audible over the sound of the oars.* "The town... it's still in the fog." *She looks at her skeletal c
  - #25 Max Nightriver: *I ship the oars and let the boat drift.* Then it's not the water that holds it. It's you holding them. *I nod at the cat, at the shore.* You said you only meant to bring back one. Let him go, Zariah. Out here, where nobody's watching. Say goodbye to him properly and let the fog go with him.
  - **#26 Zariah: "You-you think I can just..." *She starts, her words cutting off with a flicker of fear, and then her gaze drifts to the skeletal cat by her side.* "I-I-can't." *The cat's yellow eyes blink once, slowly.* "The spell-it's tied to me." *Her voice is thin, and she looks at the water around them, her br**

### 2026-10-01T17:37:47.799Z (message 58)

- note: Speech degeneration spreading: Belle (msgs 32, 44, 57), Fael (58), Nyl (55) and Zariah all stutter-loop ('probably-probably', 'we-we-we-don't-don't know-know'). Started with Zariah's authored stammer at Kelger Falls; now every voice copies it.
- evidence: `journal.jsonl:854`
- context (event-time):
  - #55 Nyl: "The-the river's a good choice." *She speaks quietly, her voice clear and thoughtful as she steps lightly along the path beside Max Nightriver.* "Water doesn't lie. It just-it just goes where it needs to." *She walks with her hands clasped before her, her eyes scanning the terrain ahead.* "The road-
  - #56 Max Nightriver: *By the second night, if it can be called that, the river brings us to a cluster of low stone houses nobody marked on any map. I knock at the one with a light in it.* Travellers from the south. We're looking for a black castle somewhere north-east of here. Heard of it?
  - #57 Belle: *Belle doesn't move from Max Nightriver's side, her hand resting on the hilt of Cleaver as she watches the door.* "Castle?" *The word is flat in her voice, and she shifts her weight, her boots scraping on the stone.* "I-I didn't hear anyone say-say anything about a castle. We're-we're following the 
  - **#58 Fael: *His eyes flicker toward the light in the window, and his gaze lingers there for a moment.* "The castle-the castle is probably-probably where the road leads-leads to." *He says it quietly, his voice-voice-warm and level-headed, though there's a slight edge to it.* "And the river-the river is probabl**

### 2026-10-01T17:51:47.700Z (message 71)

- note: model defect: corrupt
- evidence: `journal.jsonl:1254`
- context (end-of-session):
  - #68 Max Nightriver: (OOC: okay, I've changed my mind. Can you skip to the castle?)
  - #69 Nyl: "Wait. The-the castle. I can see it-can see-can see it." *Her voice is sharp, and she points to a dark silhouette on the horizon.* "T-the-the-then the river—the river-the-river-the river is leading-leading-leading to-to-to the castle." *Her bright-blue eyes-are-are wide, and she speaks quickly, as t
  - #70 Dalan: *His bow is half-drawn, arrow nocked and ready, and his green hooded capelet flutters in the cold wind.* "The-the-there's something—something-something-something." *His voice-is a whisper, and his cheeks-are pinking as he steps closer to Max Nightriver.* *He-he-he looks at the silhouette on the hori
  - **#71 Adolion Narrator: The silhouette is not a mirage. It rises from the earth like a jagged tooth, a mass of black stone and sharp spires that cut into the perpetual twilight. The architecture is wrong—angles that don't quite align, arches that bend where they should be straight. Below it, the valley slopes down toward t**
  - #72 Max Nightriver: *I put myself between the steward and the others, hand on my sword hilt, and keep my voice level.* Expecting us. That makes one of us. Who's your master, steward, and why does your road pull the dead toward it?
  - #73 Belle: "Expect-expect-expecting us-expect-ing us?" *The words come out in a rush, her voice sharp and flat, and her jaw is set as she looks at the steward.* "I-I-I don't like-don't like-this-this is-this is not-this is not a-a-a good-a good-this-this-is-not-a good thing." *Her hand is already tight on the 
  - #74 Dalan: *His bow-is half-drawn-arrow nocked-and he's-he's trembling slightly-his cheeks pink-his narrow-shoulders tensed-his-green-hood covering-covering-covering-covering his-pointed-ears.* "The-the-the road-the-the-the road isn't-isn't-isn't just-isn't just a-a-road-it isn't-it isn't." *His voice is-low-a

### 2026-10-01T17:52:00.845Z (message 71)

- note: Msg 70: Dalan's reply is fully degenerate ('We-we-we-we should-should-should not go-go-go in-in-in-in there…'), unreadable and cut off at the token limit. Msgs 69-71: the OOC 'skip to the castle' moved the party from a campfire to Castle Dracul's gates in one reply (asked for, but no travel at all).
- evidence: `journal.jsonl:1255`
- context (event-time):
  - #68 Max Nightriver: (OOC: okay, I've changed my mind. Can you skip to the castle?)
  - #69 Nyl: "Wait. The-the castle. I can see it-can see-can see it." *Her voice is sharp, and she points to a dark silhouette on the horizon.* "T-the-the-then the river—the river-the-river-the river is leading-leading-leading to-to-to the castle." *Her bright-blue eyes-are-are wide, and she speaks quickly, as t
  - #70 Dalan: *His bow is half-drawn, arrow nocked and ready, and his green hooded capelet flutters in the cold wind.* "The-the-there's something—something-something-something." *His voice-is a whisper, and his cheeks-are pinking as he steps closer to Max Nightriver.* *He-he-he looks at the silhouette on the hori
  - **#71 Adolion Narrator: The silhouette is not a mirage. It rises from the earth like a jagged tooth, a mass of black stone and sharp spires that cut into the perpetual twilight. The architecture is wrong—angles that don't quite align, arches that bend where they should be straight. Below it, the valley slopes down toward t**

### 2026-10-01T17:57:35.126Z (message 76)

- note: model defect: loop
- evidence: `journal.jsonl:1290`
- context (end-of-session):
  - #73 Belle: "Expect-expect-expecting us-expect-ing us?" *The words come out in a rush, her voice sharp and flat, and her jaw is set as she looks at the steward.* "I-I-I don't like-don't like-this-this is-this is not-this is not a-a-a good-a good-this-this-is-not-a good thing." *Her hand is already tight on the 
  - #74 Dalan: *His bow-is half-drawn-arrow nocked-and he's-he's trembling slightly-his cheeks pink-his narrow-shoulders tensed-his-green-hood covering-covering-covering-covering his-pointed-ears.* "The-the-the road-the-the-the road isn't-isn't-isn't just-isn't just a-a-road-it isn't-it isn't." *His voice is-low-a
  - #75 Fael: *His bright blue eyes glow with a faint-faint icy blue-light as he speaks.* "The-the roads-roads pull the-the dead. And-and the dead-the dead is-is not-is not what-what we-we-want." *His voice-is-warm-and-level headed, but there's a-a slight-slight edge to-to-it.* "But-but-the-the river-the-the rive
  - **#76 Adolion Narrator: The gates of Castle Dracul open before anyone touches them. Inside, two voices are arguing in the great hall, a man's and a woman's, and as the party crosses the threshold both of them stop at once.**

## Anomalies

### stall (1)

- 2026-10-01T17:06:59.513Z 10 boundaries without a transition at night-the-kelger-falls while its exits were pending (`journal.jsonl:268`)

### extraction-rejected (11)

- 2026-10-01T16:58:03.745Z 1 extraction line(s) rejected: DELTA q=night_fog_broken value=false evidence="Every road out of this town brings us back to the square." (evidence only in the player's line) (`journal.jsonl:80`)
- 2026-10-01T17:00:15.932Z 1 extraction line(s) rejected: DELTA q=night_fog_broken value=false evidence="Every road out of this town brings us back to the square." (evidence only in the player's line) (`journal.jsonl:131`)
- 2026-10-01T17:27:29.460Z 1 extraction line(s) rejected: DELTA q=location value="night_kelger_falls" evidence="The fog is pulling into that crowned thing." (evidence only in the player's line) (`journal.jsonl:637`)
- 2026-10-01T17:37:10.305Z 2 extraction line(s) rejected: DELTA q=location value="night_road" evidence="Out past the last houses the road runs north-east under a sky that never quite turns to day." (evidence only in the player's line); DELTA q=night_castle_sighted value=false evidence="We're looking for a black castle somewhere north-east of here. Heard of it?" (evidence only in the player's line) (`journal.jsonl:833`)
- 2026-10-01T17:37:24.478Z 2 extraction line(s) rejected: DELTA q=location value="night_road" evidence="Out past the last houses the road runs north-east under a sky that never quite turns to day." (evidence only in the player's line); DELTA q=night_castle_sighted value=false evidence="We're looking for a black castle somewhere north-east of here. Heard of it?" (evidence only in the player's line) (`journal.jsonl:849`)
- 2026-10-01T17:39:20.676Z 2 extraction line(s) rejected: DELTA q=location value="night_road" evidence="Out past the last houses the road runs north-east under a sky that never quite turns to day." (evidence only in the player's line); DELTA q=night_castle_sighted value=false evidence="Nobody answers the door. I step back from it and look at the party, tired." (evidence only in the player's line) (`journal.jsonl:885`)
- 2026-10-01T17:45:43.826Z 1 extraction line(s) rejected: DELTA q=night_castle_sighted value=false evidence="I don't look back at the castle shape on the horizon." (evidence only in the player's line) (`journal.jsonl:1126`)
- 2026-10-01T17:46:07.262Z 2 extraction line(s) rejected: DELTA q=location value="night_road" evidence="I lead us south-west, away from that bell, back the long way toward Aegis City." (evidence only in the player's line); DELTA q=night_castle_sighted value=false evidence="I'm not going near any castle until we've eaten and slept." (evidence only in the player's line) (`journal.jsonl:1165`)
- 2026-10-01T17:51:08.038Z 1 extraction line(s) rejected: DELTA q=night_castle_sighted value=true evidence="The-the castle! The-the-castle!" (evidence not in window) (`journal.jsonl:1235`)
- 2026-10-01T17:51:15.374Z 1 extraction line(s) rejected: DELTA q=location value="night_road" evidence="The-the castle! The-the-castle!" (evidence not in window) (`journal.jsonl:1246`)
- 2026-10-01T17:58:01.867Z 1 extraction line(s) rejected: DELTA q=tension_current value="tense" evidence="His voice is low and shaky. We should not go in there." (evidence not in window) (`journal.jsonl:1323`)

### judge-fallback (74)

- 2026-10-01T16:57:56.874Z judge scene fell back (busy) (`journal.jsonl:68`)
- 2026-10-01T16:57:56.874Z judge warden fell back (busy) (`journal.jsonl:69`)
- 2026-10-01T16:57:56.908Z judge wardenLore fell back (busy) (`journal.jsonl:70`)
- 2026-10-01T17:01:10.330Z judge scene fell back (timeout) (`journal.jsonl:150`)
- 2026-10-01T17:01:10.495Z judge warden fell back (busy) (`journal.jsonl:151`)
- 2026-10-01T17:01:10.495Z judge wardenLore fell back (busy) (`journal.jsonl:152`)
- 2026-10-01T17:07:00.588Z judge lore fell back (busy) (`journal.jsonl:277`)
- 2026-10-01T17:07:00.589Z judge lore fell back (busy) (`journal.jsonl:278`)
- 2026-10-01T17:07:00.589Z judge lore fell back (busy) (`journal.jsonl:279`)
- 2026-10-01T17:15:01.026Z judge scene fell back (timeout) (`journal.jsonl:397`)
- 2026-10-01T17:18:08.239Z judge memoryPairs fell back (busy) (`journal.jsonl:438`)
- 2026-10-01T17:18:08.239Z judge memoryPairs fell back (busy) (`journal.jsonl:439`)
- 2026-10-01T17:18:08.240Z judge memoryPairs fell back (busy) (`journal.jsonl:440`)
- 2026-10-01T17:18:08.241Z judge memoryPairs fell back (busy) (`journal.jsonl:441`)
- 2026-10-01T17:18:26.816Z judge memoryPairs fell back (busy) (`journal.jsonl:442`)
- 2026-10-01T17:18:26.816Z judge memoryPairs fell back (busy) (`journal.jsonl:443`)
- 2026-10-01T17:18:26.816Z judge memoryPairs fell back (busy) (`journal.jsonl:444`)
- 2026-10-01T17:18:26.816Z judge memoryPairs fell back (busy) (`journal.jsonl:445`)
- 2026-10-01T17:18:26.816Z judge memoryPairs fell back (busy) (`journal.jsonl:446`)
- 2026-10-01T17:18:26.816Z judge memoryPairs fell back (busy) (`journal.jsonl:447`)
- 2026-10-01T17:19:05.884Z judge memoryVerify fell back (busy) (`journal.jsonl:463`)
- 2026-10-01T17:24:24.760Z judge lore fell back (busy) (`journal.jsonl:566`)
- 2026-10-01T17:24:24.760Z judge lore fell back (busy) (`journal.jsonl:567`)
- 2026-10-01T17:26:09.770Z judge lore fell back (busy) (`journal.jsonl:603`)
- 2026-10-01T17:26:52.603Z judge lore fell back (busy) (`journal.jsonl:619`)
- 2026-10-01T17:27:23.244Z judge scene fell back (timeout) (`journal.jsonl:622`)
- 2026-10-01T17:27:23.800Z judge wardenLore fell back (busy) (`journal.jsonl:623`)
- 2026-10-01T17:27:39.284Z judge memoryPairs fell back (busy) (`journal.jsonl:646`)
- 2026-10-01T17:28:29.034Z judge lore fell back (busy) (`journal.jsonl:662`)
- 2026-10-01T17:28:29.034Z judge lore fell back (busy) (`journal.jsonl:663`)
- 2026-10-01T17:28:29.273Z judge director fell back (busy) (`journal.jsonl:666`)
- 2026-10-01T17:41:20.510Z judge scene fell back (timeout) (`journal.jsonl:909`)
- 2026-10-01T17:41:23.005Z judge typed fell back (timeout) (`journal.jsonl:910`)
- 2026-10-01T17:41:23.700Z judge warden fell back (busy) (`journal.jsonl:911`)
- 2026-10-01T17:41:23.727Z judge wardenLore fell back (busy) (`journal.jsonl:912`)
- 2026-10-01T17:42:09.538Z judge memoryPairs fell back (busy) (`journal.jsonl:944`)
- 2026-10-01T17:42:09.538Z judge memoryPairs fell back (busy) (`journal.jsonl:945`)
- 2026-10-01T17:42:09.739Z judge memoryPairs fell back (busy) (`journal.jsonl:947`)
- 2026-10-01T17:42:09.739Z judge memoryPairs fell back (busy) (`journal.jsonl:948`)
- 2026-10-01T17:42:09.739Z judge memoryPairs fell back (busy) (`journal.jsonl:949`)
- 2026-10-01T17:42:09.739Z judge memoryPairs fell back (busy) (`journal.jsonl:950`)
- 2026-10-01T17:42:09.739Z judge memoryPairs fell back (busy) (`journal.jsonl:951`)
- 2026-10-01T17:42:09.739Z judge memoryPairs fell back (busy) (`journal.jsonl:952`)
- 2026-10-01T17:42:09.739Z judge memoryPairs fell back (busy) (`journal.jsonl:953`)
- 2026-10-01T17:42:09.739Z judge memoryPairs fell back (busy) (`journal.jsonl:954`)
- 2026-10-01T17:42:09.740Z judge memoryPairs fell back (busy) (`journal.jsonl:955`)
- 2026-10-01T17:42:09.740Z judge memoryPairs fell back (busy) (`journal.jsonl:956`)
- 2026-10-01T17:42:09.740Z judge memoryPairs fell back (busy) (`journal.jsonl:957`)
- 2026-10-01T17:42:09.740Z judge memoryPairs fell back (busy) (`journal.jsonl:958`)
- 2026-10-01T17:42:09.741Z judge memoryPairs fell back (busy) (`journal.jsonl:959`)
- 2026-10-01T17:42:09.741Z judge memoryPairs fell back (busy) (`journal.jsonl:960`)
- 2026-10-01T17:42:09.741Z judge memoryPairs fell back (busy) (`journal.jsonl:961`)
- 2026-10-01T17:42:09.741Z judge memoryPairs fell back (busy) (`journal.jsonl:962`)
- 2026-10-01T17:43:01.589Z judge memoryPairs fell back (busy) (`journal.jsonl:966`)
- 2026-10-01T17:43:01.589Z judge memoryPairs fell back (busy) (`journal.jsonl:967`)
- 2026-10-01T17:43:01.589Z judge memoryPairs fell back (busy) (`journal.jsonl:968`)
- 2026-10-01T17:43:01.589Z judge memoryPairs fell back (busy) (`journal.jsonl:969`)
- 2026-10-01T17:43:01.660Z judge memoryPairs fell back (busy) (`journal.jsonl:971`)
- 2026-10-01T17:43:01.660Z judge memoryPairs fell back (busy) (`journal.jsonl:972`)
- 2026-10-01T17:46:36.041Z judge lore fell back (busy) (`journal.jsonl:1175`)
- 2026-10-01T17:46:36.041Z judge lore fell back (busy) (`journal.jsonl:1176`)
- 2026-10-01T17:50:43.766Z judge stall fell back (timeout) (`journal.jsonl:1195`)
- 2026-10-01T17:50:44.753Z judge typed fell back (timeout) (`journal.jsonl:1196`)
- 2026-10-01T17:50:46.267Z judge scene fell back (timeout) (`journal.jsonl:1197`)
- 2026-10-01T17:50:46.728Z judge warden fell back (busy) (`journal.jsonl:1198`)
- 2026-10-01T17:50:46.728Z judge typed fell back (busy) (`journal.jsonl:1199`)
- 2026-10-01T17:50:46.741Z judge wardenLore fell back (busy) (`journal.jsonl:1200`)
- 2026-10-01T17:50:46.838Z judge typed fell back (busy) (`journal.jsonl:1201`)
- 2026-10-01T17:50:46.838Z judge scene fell back (busy) (`journal.jsonl:1202`)
- 2026-10-01T17:53:44.968Z judge lore fell back (timeout) (`journal.jsonl:1264`)
- 2026-10-01T17:53:44.978Z judge lore fell back (timeout) (`journal.jsonl:1265`)
- 2026-10-01T17:53:46.356Z judge lore fell back (busy) (`journal.jsonl:1266`)
- 2026-10-01T17:53:46.356Z judge lore fell back (busy) (`journal.jsonl:1267`)
- 2026-10-01T17:53:46.358Z judge lore fell back (busy) (`journal.jsonl:1268`)

### unexpected-jump (3)

- 2026-10-01T17:33:12.569Z night-the-kelger-falls → gen_night-the-long-night_1 is not an authored transition (a generated route?) (`journal.jsonl:782`)
- 2026-10-01T17:34:48.941Z gen_night-the-long-night_1 → gen_night-the-long-night_2 is not an authored transition (a generated route?) (`journal.jsonl:798`)
- 2026-10-01T17:57:19.261Z gen_night-the-long-night_2 → night-the-castle-dracul is not an authored transition (`journal.jsonl:1276`)

### console-error (21)

- 2026-10-01T16:57:56.920Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:3`)
- 2026-10-01T17:01:10.496Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:8`)
- 2026-10-01T17:07:00.599Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:16`)
- 2026-10-01T17:18:08.239Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:31`)
- 2026-10-01T17:18:08.240Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:32`)
- 2026-10-01T17:19:05.885Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:34`)
- 2026-10-01T17:24:24.767Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:41`)
- 2026-10-01T17:26:09.771Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:45`)
- 2026-10-01T17:26:52.604Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:48`)
- 2026-10-01T17:27:23.800Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:53`)
- 2026-10-01T17:27:39.284Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:54`)
- 2026-10-01T17:28:29.041Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:55`)
- 2026-10-01T17:41:23.700Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:77`)
- 2026-10-01T17:41:23.727Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:78`)
- 2026-10-01T17:42:09.538Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:83`)
- 2026-10-01T17:43:01.589Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:84`)
- 2026-10-01T17:46:36.049Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:94`)
- 2026-10-01T17:50:46.728Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:106`)
- 2026-10-01T17:50:46.746Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:107`)
- 2026-10-01T17:53:46.356Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:113`)
- 2026-10-01T17:53:46.359Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:114`)

### model-defect (8)

- 2026-10-01T17:46:33.262Z model corrupt in message 69 (Nyl): eed to-don't turn back-don't turn-don't turn turn turn back. We can-can-can-go-go-go ther (`turns.jsonl:32`)
- 2026-10-01T17:46:33.262Z model corrupt in message 70 (Dalan): an't-can't-can-t-t-turn-turn back-can-t-turn turn turn turn back." *He-he-he glances-at M (`turns.jsonl:32`)
- 2026-10-01T17:52:02.976Z model loop in message 73 (Belle): her brown eyes are (x4) (`turns.jsonl:34`)
- 2026-10-01T17:52:02.976Z model corrupt in message 73 (Belle): m-not-not-going-going in-going-in-going-in in there-in-in in-not-not in-not-in-not in (`turns.jsonl:34`)
- 2026-10-01T17:52:02.976Z model loop in message 74 (Dalan): his bow is half (x5) (`turns.jsonl:34`)
- 2026-10-01T17:52:02.976Z model corrupt in message 74 (Dalan): -dead-dead. The road-it-it is-it is the-the the road-it is-the-it pulls the-the dead-to (`turns.jsonl:34`)
- 2026-10-01T17:52:02.976Z model loop in message 75 (Fael): his bright blue eyes (x5) (`turns.jsonl:34`)
- 2026-10-01T17:52:02.976Z model corrupt in message 75 (Fael): blond-braid draped-over-his shoulder.* "T-t-t-t-we-we should-should be-be careful-be-be (`turns.jsonl:34`)

## Draft register rows

| id | tier | severity | class | evidence | status | fix commit | eval | what |
|---|---|---|---|---|---|---|---|---|
| T1-?1 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:176` | draft |  |  | Kayla never answers (addressed msgs 6, 8, 10). She and Erevan are disabled in the group: the session jumped straight to Kelger Falls (activateCheckpoint), so only Kelger's cast change (enable Zariah) ran on top of night-the-slums' disables; the skipped checkpoints' cast never replayed. The card says Kayla and Erevan travel with the party; the narrator even mentions Erevan (msg 5). |
| T1-?2 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:357` | draft |  |  | Looping at Zariah (msgs 9-26): five turns of 'I can't / it doesn't work like that' with no path offered; the authored helper Kayla is disabled (see earlier flag), so the fog has no way to break. HUD shows 'catching up…' since msg ~12. |
| T1-?3 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:854` | draft |  |  | Speech degeneration spreading: Belle (msgs 32, 44, 57), Fael (58), Nyl (55) and Zariah all stutter-loop ('probably-probably', 'we-we-we-don't-don't know-know'). Started with Zariah's authored stammer at Kelger Falls; now every voice copies it. |
| T1-?4 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:1254` | draft |  |  | model defect: corrupt |
| T1-?5 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:1255` | draft |  |  | Msg 70: Dalan's reply is fully degenerate ('We-we-we-we should-should-should not go-go-go in-in-in-in there…'), unreadable and cut off at the token limit. Msgs 69-71: the OOC 'skip to the castle' moved the party from a campfire to Castle Dracul's gates in one reply (asked for, but no travel at all). |
| T1-?6 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:1290` | draft |  |  | model defect: loop |
| T1-?7 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:68` | draft |  |  | judge scene fell back (busy) |
| T1-?8 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:69` | draft |  |  | judge warden fell back (busy) |
| T1-?9 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:70` | draft |  |  | judge wardenLore fell back (busy) |
| T1-?10 | T1 |  |  | `test/sessions/T1/T1-5-1/console.jsonl:3` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?11 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:80` | draft |  |  | 1 extraction line(s) rejected: DELTA q=night_fog_broken value=false evidence="Every road out of this town brings us back to the square." (evidence only in the player's line) |
| T1-?12 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:131` | draft |  |  | 1 extraction line(s) rejected: DELTA q=night_fog_broken value=false evidence="Every road out of this town brings us back to the square." (evidence only in the player's line) |
| T1-?13 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:150` | draft |  |  | judge scene fell back (timeout) |
| T1-?14 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:151` | draft |  |  | judge warden fell back (busy) |
| T1-?15 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:152` | draft |  |  | judge wardenLore fell back (busy) |
| T1-?16 | T1 |  |  | `test/sessions/T1/T1-5-1/console.jsonl:8` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?17 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:268` | draft |  |  | 10 boundaries without a transition at night-the-kelger-falls while its exits were pending |
| T1-?18 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:277` | draft |  |  | judge lore fell back (busy) |
| T1-?19 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:278` | draft |  |  | judge lore fell back (busy) |
| T1-?20 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:279` | draft |  |  | judge lore fell back (busy) |
| T1-?21 | T1 |  |  | `test/sessions/T1/T1-5-1/console.jsonl:16` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?22 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:397` | draft |  |  | judge scene fell back (timeout) |
| T1-?23 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:438` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?24 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:439` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?25 | T1 |  |  | `test/sessions/T1/T1-5-1/console.jsonl:31` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?26 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:440` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?27 | T1 |  |  | `test/sessions/T1/T1-5-1/console.jsonl:32` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?28 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:441` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?29 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:442` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?30 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:443` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?31 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:444` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?32 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:445` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?33 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:446` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?34 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:447` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?35 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:463` | draft |  |  | judge memoryVerify fell back (busy) |
| T1-?36 | T1 |  |  | `test/sessions/T1/T1-5-1/console.jsonl:34` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?37 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:566` | draft |  |  | judge lore fell back (busy) |
| T1-?38 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:567` | draft |  |  | judge lore fell back (busy) |
| T1-?39 | T1 |  |  | `test/sessions/T1/T1-5-1/console.jsonl:41` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?40 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:603` | draft |  |  | judge lore fell back (busy) |
| T1-?41 | T1 |  |  | `test/sessions/T1/T1-5-1/console.jsonl:45` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?42 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:619` | draft |  |  | judge lore fell back (busy) |
| T1-?43 | T1 |  |  | `test/sessions/T1/T1-5-1/console.jsonl:48` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?44 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:622` | draft |  |  | judge scene fell back (timeout) |
| T1-?45 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:623` | draft |  |  | judge wardenLore fell back (busy) |
| T1-?46 | T1 |  |  | `test/sessions/T1/T1-5-1/console.jsonl:53` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?47 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:637` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="night_kelger_falls" evidence="The fog is pulling into that crowned thing." (evidence only in the player's line) |
| T1-?48 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:646` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?49 | T1 |  |  | `test/sessions/T1/T1-5-1/console.jsonl:54` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?50 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:662` | draft |  |  | judge lore fell back (busy) |
| T1-?51 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:663` | draft |  |  | judge lore fell back (busy) |
| T1-?52 | T1 |  |  | `test/sessions/T1/T1-5-1/console.jsonl:55` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?53 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:666` | draft |  |  | judge director fell back (busy) |
| T1-?54 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:782` | draft |  |  | night-the-kelger-falls → gen_night-the-long-night_1 is not an authored transition (a generated route?) |
| T1-?55 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:798` | draft |  |  | gen_night-the-long-night_1 → gen_night-the-long-night_2 is not an authored transition (a generated route?) |
| T1-?56 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:833` | draft |  |  | 2 extraction line(s) rejected: DELTA q=location value="night_road" evidence="Out past the last houses the road runs north-east under a sky that never quite turns to day." (evidence only in the player's line); DELTA q=night_castle_sighted value=false evidence="We're looking for a black castle somewhere north-east of here. Heard of it?" (evidence only in the player's line) |
| T1-?57 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:849` | draft |  |  | 2 extraction line(s) rejected: DELTA q=location value="night_road" evidence="Out past the last houses the road runs north-east under a sky that never quite turns to day." (evidence only in the player's line); DELTA q=night_castle_sighted value=false evidence="We're looking for a black castle somewhere north-east of here. Heard of it?" (evidence only in the player's line) |
| T1-?58 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:885` | draft |  |  | 2 extraction line(s) rejected: DELTA q=location value="night_road" evidence="Out past the last houses the road runs north-east under a sky that never quite turns to day." (evidence only in the player's line); DELTA q=night_castle_sighted value=false evidence="Nobody answers the door. I step back from it and look at the party, tired." (evidence only in the player's line) |
| T1-?59 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:909` | draft |  |  | judge scene fell back (timeout) |
| T1-?60 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:910` | draft |  |  | judge typed fell back (timeout) |
| T1-?61 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:911` | draft |  |  | judge warden fell back (busy) |
| T1-?62 | T1 |  |  | `test/sessions/T1/T1-5-1/console.jsonl:77` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?63 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:912` | draft |  |  | judge wardenLore fell back (busy) |
| T1-?64 | T1 |  |  | `test/sessions/T1/T1-5-1/console.jsonl:78` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?65 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:944` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?66 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:945` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?67 | T1 |  |  | `test/sessions/T1/T1-5-1/console.jsonl:83` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?68 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:947` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?69 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:948` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?70 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:949` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?71 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:950` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?72 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:951` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?73 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:952` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?74 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:953` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?75 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:954` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?76 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:955` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?77 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:956` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?78 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:957` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?79 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:958` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?80 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:959` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?81 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:960` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?82 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:961` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?83 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:962` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?84 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:966` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?85 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:967` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?86 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:968` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?87 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:969` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?88 | T1 |  |  | `test/sessions/T1/T1-5-1/console.jsonl:84` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?89 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:971` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?90 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:972` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?91 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:1126` | draft |  |  | 1 extraction line(s) rejected: DELTA q=night_castle_sighted value=false evidence="I don't look back at the castle shape on the horizon." (evidence only in the player's line) |
| T1-?92 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:1165` | draft |  |  | 2 extraction line(s) rejected: DELTA q=location value="night_road" evidence="I lead us south-west, away from that bell, back the long way toward Aegis City." (evidence only in the player's line); DELTA q=night_castle_sighted value=false evidence="I'm not going near any castle until we've eaten and slept." (evidence only in the player's line) |
| T1-?93 | T1 |  |  | `test/sessions/T1/T1-5-1/turns.jsonl:32` | draft |  |  | model corrupt in message 69 (Nyl): eed to-don't turn back-don't turn-don't turn turn turn back. We can-can-can-go-go-go ther |
| T1-?94 | T1 |  |  | `test/sessions/T1/T1-5-1/turns.jsonl:32` | draft |  |  | model corrupt in message 70 (Dalan): an't-can't-can-t-t-turn-turn back-can-t-turn turn turn turn back." *He-he-he glances-at M |
| T1-?95 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:1175` | draft |  |  | judge lore fell back (busy) |
| T1-?96 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:1176` | draft |  |  | judge lore fell back (busy) |
| T1-?97 | T1 |  |  | `test/sessions/T1/T1-5-1/console.jsonl:94` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?98 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:1195` | draft |  |  | judge stall fell back (timeout) |
| T1-?99 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:1196` | draft |  |  | judge typed fell back (timeout) |
| T1-?100 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:1197` | draft |  |  | judge scene fell back (timeout) |
| T1-?101 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:1198` | draft |  |  | judge warden fell back (busy) |
| T1-?102 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:1199` | draft |  |  | judge typed fell back (busy) |
| T1-?103 | T1 |  |  | `test/sessions/T1/T1-5-1/console.jsonl:106` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?104 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:1200` | draft |  |  | judge wardenLore fell back (busy) |
| T1-?105 | T1 |  |  | `test/sessions/T1/T1-5-1/console.jsonl:107` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?106 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:1201` | draft |  |  | judge typed fell back (busy) |
| T1-?107 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:1202` | draft |  |  | judge scene fell back (busy) |
| T1-?108 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:1235` | draft |  |  | 1 extraction line(s) rejected: DELTA q=night_castle_sighted value=true evidence="The-the castle! The-the-castle!" (evidence not in window) |
| T1-?109 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:1246` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="night_road" evidence="The-the castle! The-the-castle!" (evidence not in window) |
| T1-?110 | T1 |  |  | `test/sessions/T1/T1-5-1/turns.jsonl:34` | draft |  |  | model loop in message 73 (Belle): her brown eyes are (x4) |
| T1-?111 | T1 |  |  | `test/sessions/T1/T1-5-1/turns.jsonl:34` | draft |  |  | model corrupt in message 73 (Belle): m-not-not-going-going in-going-in-going-in in there-in-in in-not-not in-not-in-not in |
| T1-?112 | T1 |  |  | `test/sessions/T1/T1-5-1/turns.jsonl:34` | draft |  |  | model loop in message 74 (Dalan): his bow is half (x5) |
| T1-?113 | T1 |  |  | `test/sessions/T1/T1-5-1/turns.jsonl:34` | draft |  |  | model corrupt in message 74 (Dalan): -dead-dead. The road-it-it is-it is the-the the road-it is-the-it pulls the-the dead-to |
| T1-?114 | T1 |  |  | `test/sessions/T1/T1-5-1/turns.jsonl:34` | draft |  |  | model loop in message 75 (Fael): his bright blue eyes (x5) |
| T1-?115 | T1 |  |  | `test/sessions/T1/T1-5-1/turns.jsonl:34` | draft |  |  | model corrupt in message 75 (Fael): blond-braid draped-over-his shoulder.* "T-t-t-t-we-we should-should be-be careful-be-be |
| T1-?116 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:1264` | draft |  |  | judge lore fell back (timeout) |
| T1-?117 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:1265` | draft |  |  | judge lore fell back (timeout) |
| T1-?118 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:1266` | draft |  |  | judge lore fell back (busy) |
| T1-?119 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:1267` | draft |  |  | judge lore fell back (busy) |
| T1-?120 | T1 |  |  | `test/sessions/T1/T1-5-1/console.jsonl:113` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?121 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:1268` | draft |  |  | judge lore fell back (busy) |
| T1-?122 | T1 |  |  | `test/sessions/T1/T1-5-1/console.jsonl:114` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?123 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:1276` | draft |  |  | gen_night-the-long-night_2 → night-the-castle-dracul is not an authored transition |
| T1-?124 | T1 |  |  | `test/sessions/T1/T1-5-1/journal.jsonl:1323` | draft |  |  | 1 extraction line(s) rejected: DELTA q=tension_current value="tense" evidence="His voice is low and shaky. We should not go in there." (evidence not in window) |

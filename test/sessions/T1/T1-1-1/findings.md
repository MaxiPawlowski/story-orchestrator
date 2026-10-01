# Findings draft: T1-1

Session `test/sessions/T1/T1-1-1`. Draft rows for `docs/plans/v2.6/14-findings.md`; severity and class are decided in the review.

## Counts

- flags: 5
- stall: 2
- extraction-rejected: 13
- empty-private-block: 1
- lore-force-lost: 0
- lore-constant-missed: 0
- judge-fallback: 331
- save-lost: 1
- unexpected-jump: 3
- rollback: 0
- console-error: 41
- model-call-failure: 0
- harness-error: 0

## Flags

### 2026-10-01T14:15:42.869Z (message 16)

- note: At Wendhope's gate (msg 15-16) the story is in a generated road beat: HUD says 'First Night on the Road' (daylight, no camp), Overview 'Recently' says we moved into 'Turned Away at the Gate'. Two names for one place, neither matches. The gate itself didn't move the story: reached_walls read false because the narrator wrote no archers.
- evidence: `journal.jsonl:428`
- context (event-time):
  - #13 Adolion Narrator: The road north of Aegis City is quiet. Too quiet. The party passes empty villages, abandoned carts, and abandoned horses. After a few days, the party sees signs of something more dangerous: dead bodies, their flesh gone, their eyes gouged out. The party follows the road north until they reach Wendho
  - #14 Max Nightriver: *I ride up to the gate and look up at the watchtowers.* Hello the wall! Guild adventurers out of Aegis City, sent on the Sheridan contract. Is anyone alive in there?
  - #15 Adolion Narrator: No answer. The wooden gates stand closed. From the watchtowers, there is no sign of life. No archers, no guards, no one. Just the wind, whistling through the gaps in the wood. And the smell. It is worse here. The decay is thick and cloying, clinging to the air like a shroud. It fills the nostrils an
  - **#16 Dalan: Dalan has his bow drawn, an arrow nocked and held ready. His eyes are narrow, scanning the watchtowers for any sign of movement. "Quiet," he says softly. "Something's in there. I can't see it, but I can hear it." He shifts his weight, his fingers resting light on the bowstring. "Be ready."**

### 2026-10-01T14:19:27.663Z (message 23)

- note: Stalled at the gate: the voice on the wall asked if we're the Guild (msg 19), I answered (msg 20) and then waited (msg 22); two rounds only Belle/Dalan comment, nobody on the wall answers, gate never opens. Story still in the generated road beat.
- evidence: `journal.jsonl:539`
- context (event-time):
  - #20 Max Nightriver: Yes! The Grey Pennants, Guild, out of Aegis City. Three of us, all armed. *I step back so the voice can see us clearly.* Let us in and we'll help you hold whatever's out there.
  - #21 Belle: Belle shifts her weight, and for a heartbeat you see her eyes narrow. She's watching the walls, not you. "You're making a deal, pretty thing," she says, and her voice is flat. "You're offering them help in exchange for them letting us in." She shifts again, her posture tense and ready, her hand on C
  - #22 Max Nightriver: *I wait.*
  - **#23 Dalan: Dalan's arrow remains nocked, his bowstring taut. "The voice is trembling," he says softly, his eyes fixed on the watchtower. "They're afraid." He doesn't look at Max or Belle, just keeps scanning. "If they're going to open the gate, they'll do it carefully. And if they don't..." He doesn't finish t**

### 2026-10-01T14:39:33.246Z (message 54)

- note: Msg 54: scripted narrator line 'The light is going…' posted right after dawn (msg 49) while it's morning. It's the what-wendhope-knows npc_replies sceneBreak line (campaign), fired on a morning scene break: contradicts the time of day.
- evidence: `journal.jsonl:1384`
- context (event-time):
  - #51 Dalan: Dalan is slumped against the wall, his bow across his lap and his quiver almost empty. He looks up when you call, blinking slowly, his face pale. "I'm... I'm still here," he says, his voice quiet and shaky. He glances at his shaking hands, then back at you. "But we can't just... we can't fight like 
  - #52 Max Nightriver: *I squeeze Dalan's shoulder.* That's what we're going to find out. *I head down into the village and ask the first villager I see for the mine foreman.* I'm looking for whoever ran the mine. Duggy, someone said?
  - #53 Adolion Narrator: The villager, a woman with hollow eyes and a tired expression, doesn't look up from the small garden she's tending to—a patch of carrots that looks like it's seen better days. "You're looking for the wrong person," she says, her voice flat and flat-eyed. "Duggy doesn't run the mine. Duggy's the Mayo
  - **#54 Adolion Narrator: The light is going. Along the wall, Halena Vivinallo walks the parapet counting arrows out loud, and nobody in earshot likes the number.**

### 2026-10-01T14:43:53.472Z (message 63)

- note: Msgs 62 and 63: the same scripted narrator line ('The light is going… Halena counting arrows') posted twice back to back, the 2nd and 3rd time this morning. Reads like a broken loop.
- evidence: `journal.jsonl:1487`
- context (event-time):
  - #60 Max Nightriver: Deal. *I wave Belle and Dalan over and we follow Duggy out to the mine head.* Lead on, Mayor.
  - #61 Adolion Narrator: The mine-head is a low building of timber and stone, the entrance a gaping maw that reeks of wet earth and something older, colder. Duggy stops at the entrance and looks over his shoulder at the party. "This is the place," he says, and his voice is flat, hard, like he's reciting a lesson he doesn't 
  - #62 Adolion Narrator: The light is going. Along the wall, Halena Vivinallo walks the parapet counting arrows out loud, and nobody in earshot likes the number.
  - **#63 Adolion Narrator: The light is going. Along the wall, Halena Vivinallo walks the parapet counting arrows out loud, and nobody in earshot likes the number.**

### 2026-10-01T14:48:25.318Z (message 68)

- note: Runaway scripted reply: 'The light is going… Halena counting arrows' now at msgs 54, 62, 63, 66, 67, 68 (6 times, authored maxTriggers 2), three in a row after one turn. Floods the chat and contradicts the morning.
- evidence: `journal.jsonl:1689`
- context (event-time):
  - #65 Adolion Narrator: The lantern light spills down the tunnel, catching on walls of wet stone and the scent of earth and old water. Duggy's footsteps have faded into the distance, swallowed by the dark, and the tunnel narrows as it descends deeper into the earth. And then, the light catches on something. Something white
  - #66 Adolion Narrator: The light is going. Along the wall, Halena Vivinallo walks the parapet counting arrows out loud, and nobody in earshot likes the number.
  - #67 Adolion Narrator: The light is going. Along the wall, Halena Vivinallo walks the parapet counting arrows out loud, and nobody in earshot likes the number.
  - **#68 Adolion Narrator: The light is going. Along the wall, Halena Vivinallo walks the parapet counting arrows out loud, and nobody in earshot likes the number.**

## Anomalies

### stall (2)

- 2026-10-01T14:32:35.716Z 10 boundaries without a transition at first-night while its exits were pending (`journal.jsonl:1065`)
- 2026-10-01T14:45:35.964Z 10 boundaries without a transition at what-wendhope-knows while its exits were pending (`journal.jsonl:1538`)

### extraction-rejected (13)

- 2026-10-01T14:10:28.526Z 2 extraction line(s) rejected: DELTA q=adv_looking_for_hands value=false evidence="I turn to Ellie with her inked pen." (evidence only in the player's line); DELTA q=location value="aegis_guild_hall" evidence="I walk to the counter and tap the notice Tobias keeps poking at." (evidence only in the player's line) (`journal.jsonl:208`)
- 2026-10-01T14:27:03.057Z 1 extraction line(s) rejected: DELTA q=location value="wendhope_wall" evidence="I climb onto the south wall with them as the sun drops behind the hills" (evidence only in the player's line) (`journal.jsonl:878`)
- 2026-10-01T14:27:38.656Z 1 extraction line(s) rejected: DELTA q=location value="wendhope_wall" evidence="I climb onto the south wall with them as the sun drops behind the hills" (evidence only in the player's line) (`journal.jsonl:902`)
- 2026-10-01T14:27:45.058Z 1 extraction line(s) rejected: DELTA q=location value="wendhope_wall" evidence="I climb onto the south wall with them as the sun drops behind the hills" (evidence only in the player's line) (`journal.jsonl:909`)
- 2026-10-01T14:28:57.934Z 1 extraction line(s) rejected: DELTA q=location value="wendhope_wall" evidence="I climb onto the south wall with them as the sun drops behind the hills" (evidence only in the player's line) (`journal.jsonl:947`)
- 2026-10-01T14:29:37.570Z 1 extraction line(s) rejected: DELTA q=location value="wendhope_wall" evidence="I climb onto the south wall with them as the sun drops behind the hills" (evidence only in the player's line) (`journal.jsonl:974`)
- 2026-10-01T14:30:21.658Z 1 extraction line(s) rejected: DELTA q=location value="wendhope_wall" evidence="I climb onto the south wall with them as the sun drops behind the hills" (evidence only in the player's line) (`journal.jsonl:1005`)
- 2026-10-01T14:31:18.293Z 1 extraction line(s) rejected: DELTA q=location value="wendhope_wall" evidence="I climb onto the south wall with them as the sun drops behind the hills" (evidence only in the player's line) (`journal.jsonl:1047`)
- 2026-10-01T14:38:52.019Z 1 extraction line(s) rejected: DELTA q=location value="wendhope" evidence="I head down into the village and ask the first villager I see for the mine foreman." (evidence only in the player's line) (`journal.jsonl:1372`)
- 2026-10-01T14:38:59.254Z 1 extraction line(s) rejected: DELTA q=location value="wendhope" evidence="I head down into the village and ask the first villager I see for the mine foreman." (evidence only in the player's line) (`journal.jsonl:1381`)
- 2026-10-01T14:41:34.108Z 1 extraction line(s) rejected: DELTA q=location value="wendhope" evidence="I find Mayor Duggy at the town hall and sit down across from him without waiting to be asked." (evidence only in the player's line) (`journal.jsonl:1424`)
- 2026-10-01T14:50:26.918Z 1 extraction line(s) rejected: DELTA q=location value="needlehaven_heart" evidence="These come from the forest, don't they." (evidence only in the player's line) (`journal.jsonl:1820`)
- 2026-10-01T14:52:44.802Z 2 extraction line(s) rejected: DELTA q=in_needlehaven value=true evidence="the three of us walk out the west postern and across the field, under the first pines of Needlehaven" (evidence only in the player's line); DELTA q=location value="needlehaven" evidence="the three of us walk out the west postern and across the field, under the first pines of Needlehaven" (evidence only in the player's line) (`journal.jsonl:1883`)

### empty-private-block (1)

- 2026-10-01T14:08:03.145Z Tobias was drafted in 2026-10-01@11h05m47s358ms at boundary 3 with no private block while holding 1 private entry acquired before it (`payloads.jsonl:13`)

### judge-fallback (331)

- 2026-10-01T14:07:24.971Z judge lore fell back (busy) (`journal.jsonl:77`)
- 2026-10-01T14:07:24.971Z judge lore fell back (busy) (`journal.jsonl:78`)
- 2026-10-01T14:07:25.251Z judge director fell back (busy) (`journal.jsonl:80`)
- 2026-10-01T14:07:27.186Z judge lore fell back (busy) (`journal.jsonl:88`)
- 2026-10-01T14:07:27.186Z judge lore fell back (busy) (`journal.jsonl:89`)
- 2026-10-01T14:07:41.953Z judge director fell back (busy) (`journal.jsonl:90`)
- 2026-10-01T14:07:42.429Z judge scene fell back (busy) (`journal.jsonl:93`)
- 2026-10-01T14:07:42.429Z judge warden fell back (busy) (`journal.jsonl:94`)
- 2026-10-01T14:07:42.429Z judge wardenLore fell back (busy) (`journal.jsonl:95`)
- 2026-10-01T14:07:43.516Z judge typed fell back (busy) (`journal.jsonl:97`)
- 2026-10-01T14:08:03.138Z judge director fell back (busy) (`journal.jsonl:116`)
- 2026-10-01T14:08:48.738Z judge lore fell back (busy) (`journal.jsonl:145`)
- 2026-10-01T14:08:48.738Z judge lore fell back (busy) (`journal.jsonl:146`)
- 2026-10-01T14:08:48.999Z judge director fell back (busy) (`journal.jsonl:149`)
- 2026-10-01T14:09:20.360Z judge critic fell back (busy) (`journal.jsonl:161`)
- 2026-10-01T14:10:18.860Z judge typed fell back (busy) (`journal.jsonl:187`)
- 2026-10-01T14:10:28.530Z judge memoryVerify fell back (busy) (`journal.jsonl:191`)
- 2026-10-01T14:10:30.882Z judge director fell back (busy) (`journal.jsonl:194`)
- 2026-10-01T14:10:34.573Z judge typed fell back (busy) (`journal.jsonl:209`)
- 2026-10-01T14:10:38.414Z judge memoryVerify fell back (busy) (`journal.jsonl:212`)
- 2026-10-01T14:10:53.954Z judge typed fell back (busy) (`journal.jsonl:224`)
- 2026-10-01T14:10:53.954Z judge scene fell back (busy) (`journal.jsonl:225`)
- 2026-10-01T14:10:53.954Z judge warden fell back (busy) (`journal.jsonl:226`)
- 2026-10-01T14:10:53.954Z judge wardenLore fell back (busy) (`journal.jsonl:227`)
- 2026-10-01T14:10:53.973Z judge curatorFilter fell back (busy) (`journal.jsonl:228`)
- 2026-10-01T14:10:54.789Z judge typed fell back (busy) (`journal.jsonl:229`)
- 2026-10-01T14:12:30.592Z judge lore fell back (busy) (`journal.jsonl:288`)
- 2026-10-01T14:12:30.592Z judge lore fell back (busy) (`journal.jsonl:289`)
- 2026-10-01T14:12:30.593Z judge lore fell back (busy) (`journal.jsonl:290`)
- 2026-10-01T14:12:30.593Z judge lore fell back (busy) (`journal.jsonl:291`)
- 2026-10-01T14:12:30.940Z judge director fell back (busy) (`journal.jsonl:293`)
- 2026-10-01T14:12:58.312Z judge lore fell back (busy) (`journal.jsonl:316`)
- 2026-10-01T14:12:58.312Z judge lore fell back (busy) (`journal.jsonl:317`)
- 2026-10-01T14:12:58.312Z judge typed fell back (busy) (`journal.jsonl:318`)
- 2026-10-01T14:13:06.516Z judge typed fell back (busy) (`journal.jsonl:329`)
- 2026-10-01T14:13:16.886Z judge typed fell back (busy) (`journal.jsonl:339`)
- 2026-10-01T14:13:16.886Z judge warden fell back (busy) (`journal.jsonl:340`)
- 2026-10-01T14:13:16.886Z judge wardenLore fell back (busy) (`journal.jsonl:341`)
- 2026-10-01T14:13:16.977Z judge scene fell back (busy) (`journal.jsonl:342`)
- 2026-10-01T14:13:24.246Z judge typed fell back (busy) (`journal.jsonl:351`)
- 2026-10-01T14:13:29.070Z judge memoryVerify fell back (busy) (`journal.jsonl:353`)
- 2026-10-01T14:14:00.909Z judge memoryPairs fell back (busy) (`journal.jsonl:381`)
- 2026-10-01T14:14:00.909Z judge memoryPairs fell back (busy) (`journal.jsonl:382`)
- 2026-10-01T14:14:00.909Z judge memoryPairs fell back (busy) (`journal.jsonl:383`)
- 2026-10-01T14:14:01.108Z judge memoryPairs fell back (busy) (`journal.jsonl:385`)
- 2026-10-01T14:14:01.108Z judge memoryPairs fell back (busy) (`journal.jsonl:386`)
- 2026-10-01T14:14:01.108Z judge memoryPairs fell back (busy) (`journal.jsonl:387`)
- 2026-10-01T14:14:01.108Z judge memoryPairs fell back (busy) (`journal.jsonl:388`)
- 2026-10-01T14:14:01.108Z judge memoryPairs fell back (busy) (`journal.jsonl:389`)
- 2026-10-01T14:14:01.108Z judge memoryPairs fell back (busy) (`journal.jsonl:390`)
- 2026-10-01T14:14:01.108Z judge memoryPairs fell back (busy) (`journal.jsonl:391`)
- 2026-10-01T14:14:01.108Z judge memoryPairs fell back (busy) (`journal.jsonl:392`)
- 2026-10-01T14:14:01.109Z judge memoryPairs fell back (busy) (`journal.jsonl:393`)
- 2026-10-01T14:14:01.109Z judge memoryPairs fell back (busy) (`journal.jsonl:394`)
- 2026-10-01T14:14:01.109Z judge memoryPairs fell back (busy) (`journal.jsonl:395`)
- 2026-10-01T14:14:51.556Z judge memoryPairs fell back (busy) (`journal.jsonl:397`)
- 2026-10-01T14:14:51.556Z judge memoryPairs fell back (busy) (`journal.jsonl:398`)
- 2026-10-01T14:14:51.557Z judge memoryPairs fell back (busy) (`journal.jsonl:399`)
- 2026-10-01T14:14:51.557Z judge memoryPairs fell back (busy) (`journal.jsonl:400`)
- 2026-10-01T14:14:51.557Z judge memoryPairs fell back (busy) (`journal.jsonl:401`)
- 2026-10-01T14:14:51.557Z judge memoryPairs fell back (busy) (`journal.jsonl:402`)
- 2026-10-01T14:14:51.586Z judge memoryPairs fell back (busy) (`journal.jsonl:404`)
- 2026-10-01T14:14:51.586Z judge memoryPairs fell back (busy) (`journal.jsonl:405`)
- 2026-10-01T14:14:51.586Z judge memoryPairs fell back (busy) (`journal.jsonl:406`)
- 2026-10-01T14:14:51.586Z judge memoryPairs fell back (busy) (`journal.jsonl:407`)
- 2026-10-01T14:14:51.586Z judge memoryPairs fell back (busy) (`journal.jsonl:408`)
- 2026-10-01T14:14:51.586Z judge memoryPairs fell back (busy) (`journal.jsonl:409`)
- 2026-10-01T14:14:51.586Z judge memoryPairs fell back (busy) (`journal.jsonl:410`)
- 2026-10-01T14:14:51.586Z judge memoryPairs fell back (busy) (`journal.jsonl:411`)
- 2026-10-01T14:14:51.588Z judge memoryPairs fell back (busy) (`journal.jsonl:412`)
- 2026-10-01T14:14:51.588Z judge memoryPairs fell back (busy) (`journal.jsonl:413`)
- 2026-10-01T14:14:51.588Z judge memoryPairs fell back (busy) (`journal.jsonl:414`)
- 2026-10-01T14:14:51.588Z judge memoryPairs fell back (busy) (`journal.jsonl:415`)
- 2026-10-01T14:14:51.588Z judge memoryPairs fell back (busy) (`journal.jsonl:416`)
- 2026-10-01T14:14:51.588Z judge memoryPairs fell back (busy) (`journal.jsonl:417`)
- 2026-10-01T14:14:51.588Z judge memoryPairs fell back (busy) (`journal.jsonl:418`)
- 2026-10-01T14:14:51.590Z judge memoryPairs fell back (busy) (`journal.jsonl:419`)
- 2026-10-01T14:14:51.590Z judge memoryPairs fell back (busy) (`journal.jsonl:420`)
- 2026-10-01T14:14:51.590Z judge memoryPairs fell back (busy) (`journal.jsonl:421`)
- 2026-10-01T14:14:51.590Z judge memoryPairs fell back (busy) (`journal.jsonl:422`)
- 2026-10-01T14:14:51.590Z judge memoryPairs fell back (busy) (`journal.jsonl:423`)
- 2026-10-01T14:14:51.590Z judge memoryPairs fell back (busy) (`journal.jsonl:424`)
- 2026-10-01T14:14:51.590Z judge memoryPairs fell back (busy) (`journal.jsonl:425`)
- 2026-10-01T14:14:51.590Z judge memoryPairs fell back (busy) (`journal.jsonl:426`)
- 2026-10-01T14:16:43.414Z judge memoryVerify fell back (busy) (`journal.jsonl:452`)
- 2026-10-01T14:16:44.877Z judge curatorFilter fell back (busy) (`journal.jsonl:459`)
- 2026-10-01T14:16:45.070Z judge typed fell back (busy) (`journal.jsonl:460`)
- 2026-10-01T14:16:50.228Z judge memoryVerify fell back (busy) (`journal.jsonl:465`)
- 2026-10-01T14:16:52.477Z judge typed fell back (busy) (`journal.jsonl:475`)
- 2026-10-01T14:16:56.303Z judge memoryVerify fell back (busy) (`journal.jsonl:482`)
- 2026-10-01T14:19:58.616Z judge typed fell back (busy) (`journal.jsonl:555`)
- 2026-10-01T14:19:58.616Z judge typed fell back (busy) (`journal.jsonl:556`)
- 2026-10-01T14:21:32.078Z judge lore fell back (busy) (`journal.jsonl:624`)
- 2026-10-01T14:21:32.123Z judge director fell back (busy) (`journal.jsonl:626`)
- 2026-10-01T14:21:34.718Z judge lore fell back (busy) (`journal.jsonl:633`)
- 2026-10-01T14:22:14.954Z judge typed fell back (busy) (`journal.jsonl:652`)
- 2026-10-01T14:24:21.182Z judge scene fell back (timeout) (`journal.jsonl:703`)
- 2026-10-01T14:24:23.350Z judge typed fell back (timeout) (`journal.jsonl:704`)
- 2026-10-01T14:24:23.764Z judge wardenLore fell back (busy) (`journal.jsonl:706`)
- 2026-10-01T14:24:24.163Z judge lore fell back (busy) (`journal.jsonl:708`)
- 2026-10-01T14:24:25.236Z judge lore fell back (busy) (`journal.jsonl:709`)
- 2026-10-01T14:24:25.251Z judge lore fell back (busy) (`journal.jsonl:710`)
- 2026-10-01T14:24:25.254Z judge lore fell back (busy) (`journal.jsonl:711`)
- 2026-10-01T14:24:25.254Z judge lore fell back (busy) (`journal.jsonl:712`)
- 2026-10-01T14:25:04.274Z judge memoryVerify fell back (busy) (`journal.jsonl:744`)
- 2026-10-01T14:25:10.982Z judge typed fell back (busy) (`journal.jsonl:754`)
- 2026-10-01T14:25:11.410Z judge memoryPairs fell back (busy) (`journal.jsonl:755`)
- 2026-10-01T14:25:11.410Z judge memoryPairs fell back (busy) (`journal.jsonl:756`)
- 2026-10-01T14:25:11.411Z judge memoryPairs fell back (busy) (`journal.jsonl:757`)
- 2026-10-01T14:25:11.411Z judge memoryPairs fell back (busy) (`journal.jsonl:758`)
- 2026-10-01T14:25:11.411Z judge memoryPairs fell back (busy) (`journal.jsonl:759`)
- 2026-10-01T14:25:11.411Z judge memoryPairs fell back (busy) (`journal.jsonl:760`)
- 2026-10-01T14:25:11.411Z judge memoryPairs fell back (busy) (`journal.jsonl:761`)
- 2026-10-01T14:25:11.411Z judge memoryPairs fell back (busy) (`journal.jsonl:762`)
- 2026-10-01T14:25:11.414Z judge memoryPairs fell back (busy) (`journal.jsonl:763`)
- 2026-10-01T14:25:11.414Z judge memoryPairs fell back (busy) (`journal.jsonl:764`)
- 2026-10-01T14:25:11.414Z judge memoryPairs fell back (busy) (`journal.jsonl:765`)
- 2026-10-01T14:25:11.414Z judge memoryPairs fell back (busy) (`journal.jsonl:766`)
- 2026-10-01T14:25:11.414Z judge memoryPairs fell back (busy) (`journal.jsonl:767`)
- 2026-10-01T14:25:11.414Z judge memoryPairs fell back (busy) (`journal.jsonl:768`)
- 2026-10-01T14:25:11.414Z judge memoryPairs fell back (busy) (`journal.jsonl:769`)
- 2026-10-01T14:25:11.414Z judge memoryPairs fell back (busy) (`journal.jsonl:770`)
- 2026-10-01T14:25:11.418Z judge memoryPairs fell back (busy) (`journal.jsonl:771`)
- 2026-10-01T14:25:11.418Z judge memoryPairs fell back (busy) (`journal.jsonl:772`)
- 2026-10-01T14:25:11.418Z judge memoryPairs fell back (busy) (`journal.jsonl:773`)
- 2026-10-01T14:25:11.418Z judge memoryPairs fell back (busy) (`journal.jsonl:774`)
- 2026-10-01T14:25:11.419Z judge memoryPairs fell back (busy) (`journal.jsonl:775`)
- 2026-10-01T14:25:11.419Z judge memoryPairs fell back (busy) (`journal.jsonl:776`)
- 2026-10-01T14:25:11.419Z judge memoryPairs fell back (busy) (`journal.jsonl:777`)
- 2026-10-01T14:25:11.419Z judge memoryPairs fell back (busy) (`journal.jsonl:778`)
- 2026-10-01T14:25:11.423Z judge memoryPairs fell back (busy) (`journal.jsonl:779`)
- 2026-10-01T14:25:11.423Z judge memoryPairs fell back (busy) (`journal.jsonl:780`)
- 2026-10-01T14:25:11.423Z judge memoryPairs fell back (busy) (`journal.jsonl:781`)
- 2026-10-01T14:25:11.423Z judge memoryPairs fell back (busy) (`journal.jsonl:782`)
- 2026-10-01T14:25:11.423Z judge memoryPairs fell back (busy) (`journal.jsonl:783`)
- 2026-10-01T14:25:11.423Z judge memoryPairs fell back (busy) (`journal.jsonl:784`)
- 2026-10-01T14:25:11.423Z judge memoryPairs fell back (busy) (`journal.jsonl:785`)
- 2026-10-01T14:25:11.423Z judge memoryPairs fell back (busy) (`journal.jsonl:786`)
- 2026-10-01T14:25:16.005Z judge memoryVerify fell back (busy) (`journal.jsonl:788`)
- 2026-10-01T14:25:57.829Z judge memoryPairs fell back (busy) (`journal.jsonl:813`)
- 2026-10-01T14:25:57.829Z judge memoryPairs fell back (busy) (`journal.jsonl:814`)
- 2026-10-01T14:25:57.829Z judge memoryPairs fell back (busy) (`journal.jsonl:815`)
- 2026-10-01T14:25:57.829Z judge memoryPairs fell back (busy) (`journal.jsonl:816`)
- 2026-10-01T14:25:57.829Z judge memoryPairs fell back (busy) (`journal.jsonl:817`)
- 2026-10-01T14:25:57.829Z judge memoryPairs fell back (busy) (`journal.jsonl:818`)
- 2026-10-01T14:25:57.858Z judge memoryPairs fell back (busy) (`journal.jsonl:820`)
- 2026-10-01T14:25:57.858Z judge memoryPairs fell back (busy) (`journal.jsonl:821`)
- 2026-10-01T14:25:57.858Z judge memoryPairs fell back (busy) (`journal.jsonl:822`)
- 2026-10-01T14:25:57.858Z judge memoryPairs fell back (busy) (`journal.jsonl:823`)
- 2026-10-01T14:25:57.858Z judge memoryPairs fell back (busy) (`journal.jsonl:824`)
- 2026-10-01T14:25:57.858Z judge memoryPairs fell back (busy) (`journal.jsonl:825`)
- 2026-10-01T14:25:57.859Z judge memoryPairs fell back (busy) (`journal.jsonl:826`)
- 2026-10-01T14:25:57.859Z judge memoryPairs fell back (busy) (`journal.jsonl:827`)
- 2026-10-01T14:25:57.860Z judge memoryPairs fell back (busy) (`journal.jsonl:828`)
- 2026-10-01T14:25:57.860Z judge memoryPairs fell back (busy) (`journal.jsonl:829`)
- 2026-10-01T14:25:57.860Z judge memoryPairs fell back (busy) (`journal.jsonl:830`)
- 2026-10-01T14:25:57.860Z judge memoryPairs fell back (busy) (`journal.jsonl:831`)
- 2026-10-01T14:25:57.860Z judge memoryPairs fell back (busy) (`journal.jsonl:832`)
- 2026-10-01T14:25:57.860Z judge memoryPairs fell back (busy) (`journal.jsonl:833`)
- 2026-10-01T14:25:57.860Z judge memoryPairs fell back (busy) (`journal.jsonl:834`)
- 2026-10-01T14:25:57.860Z judge memoryPairs fell back (busy) (`journal.jsonl:835`)
- 2026-10-01T14:26:24.865Z judge lore fell back (busy) (`journal.jsonl:841`)
- 2026-10-01T14:26:24.865Z judge lore fell back (busy) (`journal.jsonl:842`)
- 2026-10-01T14:26:24.865Z judge lore fell back (busy) (`journal.jsonl:843`)
- 2026-10-01T14:26:24.865Z judge lore fell back (busy) (`journal.jsonl:844`)
- 2026-10-01T14:26:25.156Z judge director fell back (busy) (`journal.jsonl:846`)
- 2026-10-01T14:26:27.602Z judge lore fell back (busy) (`journal.jsonl:851`)
- 2026-10-01T14:26:27.602Z judge lore fell back (busy) (`journal.jsonl:852`)
- 2026-10-01T14:26:27.602Z judge lore fell back (busy) (`journal.jsonl:853`)
- 2026-10-01T14:27:35.383Z judge wardenLore fell back (busy) (`journal.jsonl:891`)
- 2026-10-01T14:27:35.388Z judge typed fell back (busy) (`journal.jsonl:893`)
- 2026-10-01T14:27:38.659Z judge memoryVerify fell back (busy) (`journal.jsonl:895`)
- 2026-10-01T14:27:41.028Z judge typed fell back (busy) (`journal.jsonl:901`)
- 2026-10-01T14:27:45.061Z judge memoryVerify fell back (busy) (`journal.jsonl:904`)
- 2026-10-01T14:28:53.127Z judge lore fell back (busy) (`journal.jsonl:936`)
- 2026-10-01T14:28:53.127Z judge lore fell back (busy) (`journal.jsonl:937`)
- 2026-10-01T14:28:57.937Z judge memoryVerify fell back (busy) (`journal.jsonl:940`)
- 2026-10-01T14:29:33.384Z judge lore fell back (busy) (`journal.jsonl:962`)
- 2026-10-01T14:29:33.384Z judge lore fell back (busy) (`journal.jsonl:963`)
- 2026-10-01T14:29:33.384Z judge lore fell back (busy) (`journal.jsonl:964`)
- 2026-10-01T14:29:33.384Z judge lore fell back (busy) (`journal.jsonl:965`)
- 2026-10-01T14:29:37.573Z judge memoryVerify fell back (busy) (`journal.jsonl:968`)
- 2026-10-01T14:30:13.429Z judge director fell back (busy) (`journal.jsonl:987`)
- 2026-10-01T14:30:15.369Z judge memoryVerify fell back (busy) (`journal.jsonl:990`)
- 2026-10-01T14:30:17.777Z judge typed fell back (busy) (`journal.jsonl:997`)
- 2026-10-01T14:30:21.661Z judge memoryVerify fell back (busy) (`journal.jsonl:999`)
- 2026-10-01T14:30:55.509Z judge typed fell back (busy) (`journal.jsonl:1015`)
- 2026-10-01T14:31:04.043Z judge memoryVerify fell back (busy) (`journal.jsonl:1020`)
- 2026-10-01T14:31:05.928Z judge typed fell back (busy) (`journal.jsonl:1026`)
- 2026-10-01T14:31:47.607Z judge director fell back (busy) (`journal.jsonl:1061`)
- 2026-10-01T14:33:48.434Z judge scene fell back (timeout) (`journal.jsonl:1098`)
- 2026-10-01T14:33:50.030Z judge warden fell back (timeout) (`journal.jsonl:1099`)
- 2026-10-01T14:33:52.070Z judge wardenLore fell back (busy) (`journal.jsonl:1100`)
- 2026-10-01T14:34:14.143Z judge memoryVerify fell back (timeout) (`journal.jsonl:1118`)
- 2026-10-01T14:34:35.384Z judge memoryPairs fell back (busy) (`journal.jsonl:1143`)
- 2026-10-01T14:34:35.384Z judge memoryPairs fell back (busy) (`journal.jsonl:1144`)
- 2026-10-01T14:34:35.384Z judge memoryPairs fell back (busy) (`journal.jsonl:1145`)
- 2026-10-01T14:34:35.384Z judge memoryPairs fell back (busy) (`journal.jsonl:1146`)
- 2026-10-01T14:34:35.384Z judge memoryPairs fell back (busy) (`journal.jsonl:1147`)
- 2026-10-01T14:34:35.384Z judge memoryPairs fell back (busy) (`journal.jsonl:1148`)
- 2026-10-01T14:34:35.384Z judge memoryPairs fell back (busy) (`journal.jsonl:1149`)
- 2026-10-01T14:34:35.385Z judge memoryPairs fell back (busy) (`journal.jsonl:1150`)
- 2026-10-01T14:34:35.387Z judge memoryPairs fell back (busy) (`journal.jsonl:1151`)
- 2026-10-01T14:34:35.387Z judge memoryPairs fell back (busy) (`journal.jsonl:1152`)
- 2026-10-01T14:34:35.387Z judge memoryPairs fell back (busy) (`journal.jsonl:1153`)
- 2026-10-01T14:34:35.387Z judge memoryPairs fell back (busy) (`journal.jsonl:1154`)
- 2026-10-01T14:34:35.387Z judge memoryPairs fell back (busy) (`journal.jsonl:1155`)
- 2026-10-01T14:34:35.387Z judge memoryPairs fell back (busy) (`journal.jsonl:1156`)
- 2026-10-01T14:34:35.387Z judge memoryPairs fell back (busy) (`journal.jsonl:1157`)
- 2026-10-01T14:34:35.387Z judge memoryPairs fell back (busy) (`journal.jsonl:1158`)
- 2026-10-01T14:34:35.388Z judge memoryPairs fell back (busy) (`journal.jsonl:1159`)
- 2026-10-01T14:34:35.388Z judge memoryPairs fell back (busy) (`journal.jsonl:1160`)
- 2026-10-01T14:34:35.388Z judge memoryPairs fell back (busy) (`journal.jsonl:1161`)
- 2026-10-01T14:34:35.388Z judge memoryPairs fell back (busy) (`journal.jsonl:1162`)
- 2026-10-01T14:34:35.388Z judge memoryPairs fell back (busy) (`journal.jsonl:1163`)
- 2026-10-01T14:34:35.388Z judge memoryPairs fell back (busy) (`journal.jsonl:1164`)
- 2026-10-01T14:34:35.388Z judge memoryPairs fell back (busy) (`journal.jsonl:1165`)
- 2026-10-01T14:34:35.388Z judge memoryPairs fell back (busy) (`journal.jsonl:1166`)
- 2026-10-01T14:35:12.941Z judge memoryPairs fell back (busy) (`journal.jsonl:1174`)
- 2026-10-01T14:35:13.185Z judge memoryPairs fell back (busy) (`journal.jsonl:1176`)
- 2026-10-01T14:35:13.185Z judge memoryPairs fell back (busy) (`journal.jsonl:1177`)
- 2026-10-01T14:35:13.185Z judge memoryPairs fell back (busy) (`journal.jsonl:1178`)
- 2026-10-01T14:35:13.185Z judge memoryPairs fell back (busy) (`journal.jsonl:1179`)
- 2026-10-01T14:35:13.185Z judge memoryPairs fell back (busy) (`journal.jsonl:1180`)
- 2026-10-01T14:35:13.185Z judge memoryPairs fell back (busy) (`journal.jsonl:1181`)
- 2026-10-01T14:35:13.185Z judge memoryPairs fell back (busy) (`journal.jsonl:1182`)
- 2026-10-01T14:35:13.185Z judge memoryPairs fell back (busy) (`journal.jsonl:1183`)
- 2026-10-01T14:35:13.186Z judge memoryPairs fell back (busy) (`journal.jsonl:1184`)
- 2026-10-01T14:35:13.186Z judge memoryPairs fell back (busy) (`journal.jsonl:1185`)
- 2026-10-01T14:35:13.186Z judge memoryPairs fell back (busy) (`journal.jsonl:1186`)
- 2026-10-01T14:35:13.186Z judge memoryPairs fell back (busy) (`journal.jsonl:1187`)
- 2026-10-01T14:35:13.186Z judge memoryPairs fell back (busy) (`journal.jsonl:1188`)
- 2026-10-01T14:35:13.186Z judge memoryPairs fell back (busy) (`journal.jsonl:1189`)
- 2026-10-01T14:35:13.186Z judge memoryPairs fell back (busy) (`journal.jsonl:1190`)
- 2026-10-01T14:35:13.186Z judge memoryPairs fell back (busy) (`journal.jsonl:1191`)
- 2026-10-01T14:35:13.187Z judge memoryPairs fell back (busy) (`journal.jsonl:1192`)
- 2026-10-01T14:35:13.187Z judge memoryPairs fell back (busy) (`journal.jsonl:1193`)
- 2026-10-01T14:35:13.187Z judge memoryPairs fell back (busy) (`journal.jsonl:1194`)
- 2026-10-01T14:35:13.187Z judge memoryPairs fell back (busy) (`journal.jsonl:1195`)
- 2026-10-01T14:35:13.188Z judge memoryPairs fell back (busy) (`journal.jsonl:1196`)
- 2026-10-01T14:35:13.188Z judge memoryPairs fell back (busy) (`journal.jsonl:1197`)
- 2026-10-01T14:35:13.188Z judge memoryPairs fell back (busy) (`journal.jsonl:1198`)
- 2026-10-01T14:35:13.188Z judge memoryPairs fell back (busy) (`journal.jsonl:1199`)
- 2026-10-01T14:41:29.753Z judge wardenLore fell back (busy) (`journal.jsonl:1419`)
- 2026-10-01T14:41:30.329Z judge typed fell back (busy) (`journal.jsonl:1420`)
- 2026-10-01T14:41:34.110Z judge memoryVerify fell back (busy) (`journal.jsonl:1422`)
- 2026-10-01T14:43:31.722Z judge typed fell back (busy) (`journal.jsonl:1476`)
- 2026-10-01T14:45:01.683Z judge scene fell back (timeout) (`journal.jsonl:1502`)
- 2026-10-01T14:45:15.659Z judge memoryVerify fell back (timeout) (`journal.jsonl:1511`)
- 2026-10-01T14:45:26.204Z judge memoryPairs fell back (busy) (`journal.jsonl:1532`)
- 2026-10-01T14:45:26.204Z judge memoryPairs fell back (busy) (`journal.jsonl:1533`)
- 2026-10-01T14:45:26.204Z judge memoryPairs fell back (busy) (`journal.jsonl:1534`)
- 2026-10-01T14:45:37.299Z judge typed fell back (busy) (`journal.jsonl:1539`)
- 2026-10-01T14:45:37.299Z judge scene fell back (busy) (`journal.jsonl:1540`)
- 2026-10-01T14:45:37.300Z judge warden fell back (busy) (`journal.jsonl:1541`)
- 2026-10-01T14:45:38.269Z judge typed fell back (busy) (`journal.jsonl:1542`)
- 2026-10-01T14:45:42.820Z judge memoryVerify fell back (busy) (`journal.jsonl:1544`)
- 2026-10-01T14:46:21.925Z judge memoryPairs fell back (busy) (`journal.jsonl:1575`)
- 2026-10-01T14:46:21.926Z judge memoryPairs fell back (busy) (`journal.jsonl:1576`)
- 2026-10-01T14:46:21.926Z judge memoryPairs fell back (busy) (`journal.jsonl:1577`)
- 2026-10-01T14:46:21.926Z judge memoryPairs fell back (busy) (`journal.jsonl:1578`)
- 2026-10-01T14:46:21.926Z judge memoryPairs fell back (busy) (`journal.jsonl:1579`)
- 2026-10-01T14:46:21.926Z judge memoryPairs fell back (busy) (`journal.jsonl:1580`)
- 2026-10-01T14:46:21.926Z judge memoryPairs fell back (busy) (`journal.jsonl:1581`)
- 2026-10-01T14:46:21.927Z judge memoryPairs fell back (busy) (`journal.jsonl:1582`)
- 2026-10-01T14:46:21.929Z judge memoryPairs fell back (busy) (`journal.jsonl:1583`)
- 2026-10-01T14:46:21.929Z judge memoryPairs fell back (busy) (`journal.jsonl:1584`)
- 2026-10-01T14:46:21.929Z judge memoryPairs fell back (busy) (`journal.jsonl:1585`)
- 2026-10-01T14:46:21.929Z judge memoryPairs fell back (busy) (`journal.jsonl:1586`)
- 2026-10-01T14:46:21.929Z judge memoryPairs fell back (busy) (`journal.jsonl:1587`)
- 2026-10-01T14:46:21.929Z judge memoryPairs fell back (busy) (`journal.jsonl:1588`)
- 2026-10-01T14:46:21.929Z judge memoryPairs fell back (busy) (`journal.jsonl:1589`)
- 2026-10-01T14:46:21.929Z judge memoryPairs fell back (busy) (`journal.jsonl:1590`)
- 2026-10-01T14:46:21.931Z judge memoryPairs fell back (busy) (`journal.jsonl:1591`)
- 2026-10-01T14:46:21.931Z judge memoryPairs fell back (busy) (`journal.jsonl:1592`)
- 2026-10-01T14:46:21.931Z judge memoryPairs fell back (busy) (`journal.jsonl:1593`)
- 2026-10-01T14:46:21.931Z judge memoryPairs fell back (busy) (`journal.jsonl:1594`)
- 2026-10-01T14:46:21.931Z judge memoryPairs fell back (busy) (`journal.jsonl:1595`)
- 2026-10-01T14:46:21.931Z judge memoryPairs fell back (busy) (`journal.jsonl:1596`)
- 2026-10-01T14:46:21.931Z judge memoryPairs fell back (busy) (`journal.jsonl:1597`)
- 2026-10-01T14:46:21.931Z judge memoryPairs fell back (busy) (`journal.jsonl:1598`)
- 2026-10-01T14:46:21.933Z judge memoryPairs fell back (busy) (`journal.jsonl:1599`)
- 2026-10-01T14:46:21.933Z judge memoryPairs fell back (busy) (`journal.jsonl:1600`)
- 2026-10-01T14:46:21.933Z judge memoryPairs fell back (busy) (`journal.jsonl:1601`)
- 2026-10-01T14:46:21.933Z judge memoryPairs fell back (busy) (`journal.jsonl:1602`)
- 2026-10-01T14:46:21.933Z judge memoryPairs fell back (busy) (`journal.jsonl:1603`)
- 2026-10-01T14:46:21.933Z judge memoryPairs fell back (busy) (`journal.jsonl:1604`)
- 2026-10-01T14:46:21.933Z judge memoryPairs fell back (busy) (`journal.jsonl:1605`)
- 2026-10-01T14:46:21.933Z judge memoryPairs fell back (busy) (`journal.jsonl:1606`)
- 2026-10-01T14:47:10.854Z judge memoryPairs fell back (busy) (`journal.jsonl:1636`)
- 2026-10-01T14:47:10.854Z judge memoryPairs fell back (busy) (`journal.jsonl:1637`)
- 2026-10-01T14:47:10.854Z judge memoryPairs fell back (busy) (`journal.jsonl:1638`)
- 2026-10-01T14:47:10.854Z judge memoryPairs fell back (busy) (`journal.jsonl:1639`)
- 2026-10-01T14:47:10.854Z judge memoryPairs fell back (busy) (`journal.jsonl:1640`)
- 2026-10-01T14:47:10.854Z judge memoryPairs fell back (busy) (`journal.jsonl:1641`)
- 2026-10-01T14:47:10.855Z judge memoryPairs fell back (busy) (`journal.jsonl:1642`)
- 2026-10-01T14:47:11.099Z judge memoryPairs fell back (busy) (`journal.jsonl:1644`)
- 2026-10-01T14:47:11.099Z judge memoryPairs fell back (busy) (`journal.jsonl:1645`)
- 2026-10-01T14:47:11.099Z judge memoryPairs fell back (busy) (`journal.jsonl:1646`)
- 2026-10-01T14:47:11.099Z judge memoryPairs fell back (busy) (`journal.jsonl:1647`)
- 2026-10-01T14:47:11.099Z judge memoryPairs fell back (busy) (`journal.jsonl:1648`)
- 2026-10-01T14:47:11.099Z judge memoryPairs fell back (busy) (`journal.jsonl:1649`)
- 2026-10-01T14:47:11.099Z judge memoryPairs fell back (busy) (`journal.jsonl:1650`)
- 2026-10-01T14:47:11.099Z judge memoryPairs fell back (busy) (`journal.jsonl:1651`)
- 2026-10-01T14:47:11.100Z judge memoryPairs fell back (busy) (`journal.jsonl:1652`)
- 2026-10-01T14:47:11.100Z judge memoryPairs fell back (busy) (`journal.jsonl:1653`)
- 2026-10-01T14:47:11.100Z judge memoryPairs fell back (busy) (`journal.jsonl:1654`)
- 2026-10-01T14:47:43.675Z judge curatorFilter fell back (timeout) (`journal.jsonl:1663`)
- 2026-10-01T14:49:46.271Z judge lore fell back (busy) (`journal.jsonl:1779`)
- 2026-10-01T14:49:46.272Z judge typed fell back (busy) (`journal.jsonl:1780`)
- 2026-10-01T14:49:50.308Z judge memoryVerify fell back (busy) (`journal.jsonl:1783`)
- 2026-10-01T14:49:52.618Z judge typed fell back (busy) (`journal.jsonl:1790`)
- 2026-10-01T14:49:56.642Z judge memoryVerify fell back (busy) (`journal.jsonl:1792`)
- 2026-10-01T14:50:23.494Z judge scene fell back (timeout) (`journal.jsonl:1808`)
- 2026-10-01T14:50:24.380Z judge wardenLore fell back (busy) (`journal.jsonl:1809`)
- 2026-10-01T14:50:24.381Z judge typed fell back (busy) (`journal.jsonl:1810`)
- 2026-10-01T14:50:24.381Z judge typed fell back (busy) (`journal.jsonl:1811`)
- 2026-10-01T14:50:24.381Z judge stall fell back (busy) (`journal.jsonl:1812`)
- 2026-10-01T14:52:32.717Z judge scene fell back (timeout) (`journal.jsonl:1867`)
- 2026-10-01T14:52:39.983Z judge warden fell back (timeout) (`journal.jsonl:1868`)
- 2026-10-01T14:52:40.005Z judge wardenLore fell back (timeout) (`journal.jsonl:1869`)
- 2026-10-01T14:53:13.773Z judge lore fell back (busy) (`journal.jsonl:1911`)
- 2026-10-01T14:53:13.773Z judge lore fell back (busy) (`journal.jsonl:1912`)
- 2026-10-01T14:53:13.773Z judge lore fell back (busy) (`journal.jsonl:1913`)
- 2026-10-01T14:53:13.773Z judge typed fell back (busy) (`journal.jsonl:1914`)
- 2026-10-01T14:53:13.773Z judge scene fell back (busy) (`journal.jsonl:1915`)
- 2026-10-01T14:53:13.773Z judge warden fell back (busy) (`journal.jsonl:1916`)
- 2026-10-01T14:53:13.798Z judge wardenLore fell back (busy) (`journal.jsonl:1917`)
- 2026-10-01T14:53:14.919Z judge typed fell back (busy) (`journal.jsonl:1919`)
- 2026-10-01T14:53:21.772Z judge memoryVerify fell back (busy) (`journal.jsonl:1921`)
- 2026-10-01T14:54:13.884Z judge scene fell back (timeout) (`journal.jsonl:1936`)

### save-lost (1)

- 2026-10-01T14:47:43.723Z save not confirmed (`journal.jsonl:1664`)

### unexpected-jump (3)

- 2026-10-01T14:12:56.223Z road-to-wendhope → gen_on-the-road_1 is not an authored transition (a generated route?) (`journal.jsonl:304`)
- 2026-10-01T14:13:16.488Z gen_on-the-road_1 → gen_on-the-road_2 is not an authored transition (a generated route?) (`journal.jsonl:337`)
- 2026-10-01T14:19:54.669Z gen_on-the-road_2 → at-the-walls is not an authored transition (`journal.jsonl:548`)

### console-error (41)

- 2026-10-01T14:07:24.977Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:3`)
- 2026-10-01T14:08:03.139Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:5`)
- 2026-10-01T14:08:48.744Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:7`)
- 2026-10-01T14:09:20.361Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:9`)
- 2026-10-01T14:10:18.861Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:11`)
- 2026-10-01T14:12:30.613Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:17`)
- 2026-10-01T14:12:58.317Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:19`)
- 2026-10-01T14:13:06.516Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:20`)
- 2026-10-01T14:13:16.886Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:22`)
- 2026-10-01T14:13:17.016Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:23`)
- 2026-10-01T14:14:00.909Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:30`)
- 2026-10-01T14:14:51.556Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:31`)
- 2026-10-01T14:16:43.414Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:35`)
- 2026-10-01T14:19:58.617Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:42`)
- 2026-10-01T14:21:32.079Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:44`)
- 2026-10-01T14:22:14.987Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:47`)
- 2026-10-01T14:24:23.764Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:54`)
- 2026-10-01T14:24:25.237Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:56`)
- 2026-10-01T14:25:04.275Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:62`)
- 2026-10-01T14:25:57.829Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:64`)
- 2026-10-01T14:26:24.865Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:65`)
- 2026-10-01T14:27:35.385Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:71`)
- 2026-10-01T14:27:35.388Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:72`)
- 2026-10-01T14:28:53.133Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:75`)
- 2026-10-01T14:29:33.388Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:78`)
- 2026-10-01T14:30:13.429Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:80`)
- 2026-10-01T14:30:55.577Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:83`)
- 2026-10-01T14:31:47.607Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:87`)
- 2026-10-01T14:33:52.070Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:97`)
- 2026-10-01T14:34:35.384Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:99`)
- 2026-10-01T14:34:35.385Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:100`)
- 2026-10-01T14:35:12.941Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:101`)
- 2026-10-01T14:41:29.757Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:108`)
- 2026-10-01T14:43:31.722Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:114`)
- 2026-10-01T14:45:26.204Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:121`)
- 2026-10-01T14:46:21.926Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:127`)
- 2026-10-01T14:46:21.927Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:128`)
- 2026-10-01T14:47:10.854Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:133`)
- 2026-10-01T14:49:46.272Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:137`)
- 2026-10-01T14:50:24.380Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:143`)
- 2026-10-01T14:53:14.025Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:151`)

## Draft register rows

| id | tier | severity | class | evidence | status | fix commit | eval | what |
|---|---|---|---|---|---|---|---|---|
| T1-?1 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:428` | draft |  |  | At Wendhope's gate (msg 15-16) the story is in a generated road beat: HUD says 'First Night on the Road' (daylight, no camp), Overview 'Recently' says we moved into 'Turned Away at the Gate'. Two names for one place, neither matches. The gate itself didn't move the story: reached_walls read false because the narrator wrote no archers. |
| T1-?2 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:539` | draft |  |  | Stalled at the gate: the voice on the wall asked if we're the Guild (msg 19), I answered (msg 20) and then waited (msg 22); two rounds only Belle/Dalan comment, nobody on the wall answers, gate never opens. Story still in the generated road beat. |
| T1-?3 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1384` | draft |  |  | Msg 54: scripted narrator line 'The light is going…' posted right after dawn (msg 49) while it's morning. It's the what-wendhope-knows npc_replies sceneBreak line (campaign), fired on a morning scene break: contradicts the time of day. |
| T1-?4 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1487` | draft |  |  | Msgs 62 and 63: the same scripted narrator line ('The light is going… Halena counting arrows') posted twice back to back, the 2nd and 3rd time this morning. Reads like a broken loop. |
| T1-?5 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1689` | draft |  |  | Runaway scripted reply: 'The light is going… Halena counting arrows' now at msgs 54, 62, 63, 66, 67, 68 (6 times, authored maxTriggers 2), three in a row after one turn. Floods the chat and contradicts the morning. |
| T1-?6 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:77` | draft |  |  | judge lore fell back (busy) |
| T1-?7 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:78` | draft |  |  | judge lore fell back (busy) |
| T1-?8 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:3` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?9 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:80` | draft |  |  | judge director fell back (busy) |
| T1-?10 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:88` | draft |  |  | judge lore fell back (busy) |
| T1-?11 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:89` | draft |  |  | judge lore fell back (busy) |
| T1-?12 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:90` | draft |  |  | judge director fell back (busy) |
| T1-?13 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:93` | draft |  |  | judge scene fell back (busy) |
| T1-?14 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:94` | draft |  |  | judge warden fell back (busy) |
| T1-?15 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:95` | draft |  |  | judge wardenLore fell back (busy) |
| T1-?16 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:97` | draft |  |  | judge typed fell back (busy) |
| T1-?17 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:116` | draft |  |  | judge director fell back (busy) |
| T1-?18 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:5` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?19 | T1 |  |  | `test/sessions/T1/T1-1-1/payloads.jsonl:13` | draft |  |  | Tobias was drafted in 2026-10-01@11h05m47s358ms at boundary 3 with no private block while holding 1 private entry acquired before it |
| T1-?20 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:145` | draft |  |  | judge lore fell back (busy) |
| T1-?21 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:146` | draft |  |  | judge lore fell back (busy) |
| T1-?22 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:7` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?23 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:149` | draft |  |  | judge director fell back (busy) |
| T1-?24 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:161` | draft |  |  | judge critic fell back (busy) |
| T1-?25 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:9` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?26 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:187` | draft |  |  | judge typed fell back (busy) |
| T1-?27 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:11` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?28 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:208` | draft |  |  | 2 extraction line(s) rejected: DELTA q=adv_looking_for_hands value=false evidence="I turn to Ellie with her inked pen." (evidence only in the player's line); DELTA q=location value="aegis_guild_hall" evidence="I walk to the counter and tap the notice Tobias keeps poking at." (evidence only in the player's line) |
| T1-?29 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:191` | draft |  |  | judge memoryVerify fell back (busy) |
| T1-?30 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:194` | draft |  |  | judge director fell back (busy) |
| T1-?31 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:209` | draft |  |  | judge typed fell back (busy) |
| T1-?32 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:212` | draft |  |  | judge memoryVerify fell back (busy) |
| T1-?33 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:224` | draft |  |  | judge typed fell back (busy) |
| T1-?34 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:225` | draft |  |  | judge scene fell back (busy) |
| T1-?35 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:226` | draft |  |  | judge warden fell back (busy) |
| T1-?36 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:227` | draft |  |  | judge wardenLore fell back (busy) |
| T1-?37 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:228` | draft |  |  | judge curatorFilter fell back (busy) |
| T1-?38 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:229` | draft |  |  | judge typed fell back (busy) |
| T1-?39 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:288` | draft |  |  | judge lore fell back (busy) |
| T1-?40 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:289` | draft |  |  | judge lore fell back (busy) |
| T1-?41 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:290` | draft |  |  | judge lore fell back (busy) |
| T1-?42 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:291` | draft |  |  | judge lore fell back (busy) |
| T1-?43 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:17` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?44 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:293` | draft |  |  | judge director fell back (busy) |
| T1-?45 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:304` | draft |  |  | road-to-wendhope → gen_on-the-road_1 is not an authored transition (a generated route?) |
| T1-?46 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:316` | draft |  |  | judge lore fell back (busy) |
| T1-?47 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:317` | draft |  |  | judge lore fell back (busy) |
| T1-?48 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:318` | draft |  |  | judge typed fell back (busy) |
| T1-?49 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:19` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?50 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:329` | draft |  |  | judge typed fell back (busy) |
| T1-?51 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:20` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?52 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:337` | draft |  |  | gen_on-the-road_1 → gen_on-the-road_2 is not an authored transition (a generated route?) |
| T1-?53 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:339` | draft |  |  | judge typed fell back (busy) |
| T1-?54 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:340` | draft |  |  | judge warden fell back (busy) |
| T1-?55 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:341` | draft |  |  | judge wardenLore fell back (busy) |
| T1-?56 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:22` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?57 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:342` | draft |  |  | judge scene fell back (busy) |
| T1-?58 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:23` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?59 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:351` | draft |  |  | judge typed fell back (busy) |
| T1-?60 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:353` | draft |  |  | judge memoryVerify fell back (busy) |
| T1-?61 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:381` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?62 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:382` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?63 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:383` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?64 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:30` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?65 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:385` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?66 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:386` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?67 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:387` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?68 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:388` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?69 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:389` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?70 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:390` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?71 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:391` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?72 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:392` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?73 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:393` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?74 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:394` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?75 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:395` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?76 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:397` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?77 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:398` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?78 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:31` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?79 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:399` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?80 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:400` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?81 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:401` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?82 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:402` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?83 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:404` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?84 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:405` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?85 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:406` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?86 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:407` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?87 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:408` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?88 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:409` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?89 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:410` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?90 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:411` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?91 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:412` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?92 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:413` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?93 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:414` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?94 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:415` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?95 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:416` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?96 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:417` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?97 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:418` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?98 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:419` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?99 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:420` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?100 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:421` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?101 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:422` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?102 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:423` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?103 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:424` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?104 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:425` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?105 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:426` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?106 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:452` | draft |  |  | judge memoryVerify fell back (busy) |
| T1-?107 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:35` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?108 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:459` | draft |  |  | judge curatorFilter fell back (busy) |
| T1-?109 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:460` | draft |  |  | judge typed fell back (busy) |
| T1-?110 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:465` | draft |  |  | judge memoryVerify fell back (busy) |
| T1-?111 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:475` | draft |  |  | judge typed fell back (busy) |
| T1-?112 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:482` | draft |  |  | judge memoryVerify fell back (busy) |
| T1-?113 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:548` | draft |  |  | gen_on-the-road_2 → at-the-walls is not an authored transition |
| T1-?114 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:555` | draft |  |  | judge typed fell back (busy) |
| T1-?115 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:556` | draft |  |  | judge typed fell back (busy) |
| T1-?116 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:42` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?117 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:624` | draft |  |  | judge lore fell back (busy) |
| T1-?118 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:44` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?119 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:626` | draft |  |  | judge director fell back (busy) |
| T1-?120 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:633` | draft |  |  | judge lore fell back (busy) |
| T1-?121 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:652` | draft |  |  | judge typed fell back (busy) |
| T1-?122 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:47` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?123 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:703` | draft |  |  | judge scene fell back (timeout) |
| T1-?124 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:704` | draft |  |  | judge typed fell back (timeout) |
| T1-?125 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:706` | draft |  |  | judge wardenLore fell back (busy) |
| T1-?126 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:54` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?127 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:708` | draft |  |  | judge lore fell back (busy) |
| T1-?128 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:709` | draft |  |  | judge lore fell back (busy) |
| T1-?129 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:56` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?130 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:710` | draft |  |  | judge lore fell back (busy) |
| T1-?131 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:711` | draft |  |  | judge lore fell back (busy) |
| T1-?132 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:712` | draft |  |  | judge lore fell back (busy) |
| T1-?133 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:744` | draft |  |  | judge memoryVerify fell back (busy) |
| T1-?134 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:62` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?135 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:754` | draft |  |  | judge typed fell back (busy) |
| T1-?136 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:755` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?137 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:756` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?138 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:757` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?139 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:758` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?140 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:759` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?141 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:760` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?142 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:761` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?143 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:762` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?144 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:763` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?145 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:764` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?146 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:765` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?147 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:766` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?148 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:767` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?149 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:768` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?150 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:769` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?151 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:770` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?152 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:771` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?153 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:772` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?154 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:773` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?155 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:774` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?156 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:775` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?157 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:776` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?158 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:777` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?159 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:778` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?160 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:779` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?161 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:780` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?162 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:781` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?163 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:782` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?164 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:783` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?165 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:784` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?166 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:785` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?167 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:786` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?168 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:788` | draft |  |  | judge memoryVerify fell back (busy) |
| T1-?169 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:813` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?170 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:814` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?171 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:815` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?172 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:816` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?173 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:817` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?174 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:818` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?175 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:64` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?176 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:820` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?177 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:821` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?178 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:822` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?179 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:823` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?180 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:824` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?181 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:825` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?182 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:826` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?183 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:827` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?184 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:828` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?185 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:829` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?186 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:830` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?187 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:831` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?188 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:832` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?189 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:833` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?190 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:834` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?191 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:835` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?192 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:841` | draft |  |  | judge lore fell back (busy) |
| T1-?193 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:842` | draft |  |  | judge lore fell back (busy) |
| T1-?194 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:843` | draft |  |  | judge lore fell back (busy) |
| T1-?195 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:844` | draft |  |  | judge lore fell back (busy) |
| T1-?196 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:65` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?197 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:846` | draft |  |  | judge director fell back (busy) |
| T1-?198 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:851` | draft |  |  | judge lore fell back (busy) |
| T1-?199 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:852` | draft |  |  | judge lore fell back (busy) |
| T1-?200 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:853` | draft |  |  | judge lore fell back (busy) |
| T1-?201 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:878` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="wendhope_wall" evidence="I climb onto the south wall with them as the sun drops behind the hills" (evidence only in the player's line) |
| T1-?202 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:891` | draft |  |  | judge wardenLore fell back (busy) |
| T1-?203 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:71` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?204 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:893` | draft |  |  | judge typed fell back (busy) |
| T1-?205 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:72` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?206 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:902` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="wendhope_wall" evidence="I climb onto the south wall with them as the sun drops behind the hills" (evidence only in the player's line) |
| T1-?207 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:895` | draft |  |  | judge memoryVerify fell back (busy) |
| T1-?208 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:901` | draft |  |  | judge typed fell back (busy) |
| T1-?209 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:909` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="wendhope_wall" evidence="I climb onto the south wall with them as the sun drops behind the hills" (evidence only in the player's line) |
| T1-?210 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:904` | draft |  |  | judge memoryVerify fell back (busy) |
| T1-?211 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:936` | draft |  |  | judge lore fell back (busy) |
| T1-?212 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:937` | draft |  |  | judge lore fell back (busy) |
| T1-?213 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:75` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?214 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:947` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="wendhope_wall" evidence="I climb onto the south wall with them as the sun drops behind the hills" (evidence only in the player's line) |
| T1-?215 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:940` | draft |  |  | judge memoryVerify fell back (busy) |
| T1-?216 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:962` | draft |  |  | judge lore fell back (busy) |
| T1-?217 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:963` | draft |  |  | judge lore fell back (busy) |
| T1-?218 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:964` | draft |  |  | judge lore fell back (busy) |
| T1-?219 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:965` | draft |  |  | judge lore fell back (busy) |
| T1-?220 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:78` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?221 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:974` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="wendhope_wall" evidence="I climb onto the south wall with them as the sun drops behind the hills" (evidence only in the player's line) |
| T1-?222 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:968` | draft |  |  | judge memoryVerify fell back (busy) |
| T1-?223 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:987` | draft |  |  | judge director fell back (busy) |
| T1-?224 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:80` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?225 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:990` | draft |  |  | judge memoryVerify fell back (busy) |
| T1-?226 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:997` | draft |  |  | judge typed fell back (busy) |
| T1-?227 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1005` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="wendhope_wall" evidence="I climb onto the south wall with them as the sun drops behind the hills" (evidence only in the player's line) |
| T1-?228 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:999` | draft |  |  | judge memoryVerify fell back (busy) |
| T1-?229 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1015` | draft |  |  | judge typed fell back (busy) |
| T1-?230 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:83` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?231 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1020` | draft |  |  | judge memoryVerify fell back (busy) |
| T1-?232 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1026` | draft |  |  | judge typed fell back (busy) |
| T1-?233 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1047` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="wendhope_wall" evidence="I climb onto the south wall with them as the sun drops behind the hills" (evidence only in the player's line) |
| T1-?234 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1061` | draft |  |  | judge director fell back (busy) |
| T1-?235 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:87` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?236 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1065` | draft |  |  | 10 boundaries without a transition at first-night while its exits were pending |
| T1-?237 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1098` | draft |  |  | judge scene fell back (timeout) |
| T1-?238 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1099` | draft |  |  | judge warden fell back (timeout) |
| T1-?239 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1100` | draft |  |  | judge wardenLore fell back (busy) |
| T1-?240 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:97` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?241 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1118` | draft |  |  | judge memoryVerify fell back (timeout) |
| T1-?242 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1143` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?243 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1144` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?244 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1145` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?245 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1146` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?246 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1147` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?247 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1148` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?248 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1149` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?249 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:99` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?250 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1150` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?251 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:100` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?252 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1151` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?253 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1152` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?254 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1153` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?255 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1154` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?256 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1155` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?257 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1156` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?258 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1157` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?259 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1158` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?260 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1159` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?261 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1160` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?262 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1161` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?263 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1162` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?264 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1163` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?265 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1164` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?266 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1165` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?267 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1166` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?268 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1174` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?269 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:101` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?270 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1176` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?271 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1177` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?272 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1178` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?273 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1179` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?274 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1180` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?275 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1181` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?276 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1182` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?277 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1183` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?278 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1184` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?279 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1185` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?280 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1186` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?281 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1187` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?282 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1188` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?283 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1189` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?284 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1190` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?285 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1191` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?286 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1192` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?287 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1193` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?288 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1194` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?289 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1195` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?290 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1196` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?291 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1197` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?292 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1198` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?293 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1199` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?294 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1372` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="wendhope" evidence="I head down into the village and ask the first villager I see for the mine foreman." (evidence only in the player's line) |
| T1-?295 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1381` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="wendhope" evidence="I head down into the village and ask the first villager I see for the mine foreman." (evidence only in the player's line) |
| T1-?296 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1419` | draft |  |  | judge wardenLore fell back (busy) |
| T1-?297 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:108` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?298 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1420` | draft |  |  | judge typed fell back (busy) |
| T1-?299 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1424` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="wendhope" evidence="I find Mayor Duggy at the town hall and sit down across from him without waiting to be asked." (evidence only in the player's line) |
| T1-?300 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1422` | draft |  |  | judge memoryVerify fell back (busy) |
| T1-?301 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1476` | draft |  |  | judge typed fell back (busy) |
| T1-?302 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:114` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?303 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1502` | draft |  |  | judge scene fell back (timeout) |
| T1-?304 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1511` | draft |  |  | judge memoryVerify fell back (timeout) |
| T1-?305 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1532` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?306 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1533` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?307 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1534` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?308 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:121` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?309 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1538` | draft |  |  | 10 boundaries without a transition at what-wendhope-knows while its exits were pending |
| T1-?310 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1539` | draft |  |  | judge typed fell back (busy) |
| T1-?311 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1540` | draft |  |  | judge scene fell back (busy) |
| T1-?312 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1541` | draft |  |  | judge warden fell back (busy) |
| T1-?313 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1542` | draft |  |  | judge typed fell back (busy) |
| T1-?314 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1544` | draft |  |  | judge memoryVerify fell back (busy) |
| T1-?315 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1575` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?316 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1576` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?317 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1577` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?318 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1578` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?319 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1579` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?320 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1580` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?321 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1581` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?322 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:127` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?323 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1582` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?324 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:128` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?325 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1583` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?326 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1584` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?327 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1585` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?328 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1586` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?329 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1587` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?330 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1588` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?331 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1589` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?332 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1590` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?333 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1591` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?334 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1592` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?335 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1593` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?336 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1594` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?337 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1595` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?338 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1596` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?339 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1597` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?340 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1598` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?341 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1599` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?342 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1600` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?343 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1601` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?344 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1602` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?345 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1603` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?346 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1604` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?347 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1605` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?348 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1606` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?349 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1636` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?350 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1637` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?351 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1638` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?352 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1639` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?353 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1640` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?354 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1641` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?355 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:133` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?356 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1642` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?357 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1644` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?358 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1645` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?359 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1646` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?360 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1647` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?361 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1648` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?362 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1649` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?363 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1650` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?364 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1651` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?365 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1652` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?366 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1653` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?367 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1654` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?368 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1663` | draft |  |  | judge curatorFilter fell back (timeout) |
| T1-?369 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1664` | draft |  |  | save not confirmed |
| T1-?370 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1779` | draft |  |  | judge lore fell back (busy) |
| T1-?371 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1780` | draft |  |  | judge typed fell back (busy) |
| T1-?372 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:137` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?373 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1783` | draft |  |  | judge memoryVerify fell back (busy) |
| T1-?374 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1790` | draft |  |  | judge typed fell back (busy) |
| T1-?375 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1792` | draft |  |  | judge memoryVerify fell back (busy) |
| T1-?376 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1808` | draft |  |  | judge scene fell back (timeout) |
| T1-?377 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1809` | draft |  |  | judge wardenLore fell back (busy) |
| T1-?378 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:143` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?379 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1810` | draft |  |  | judge typed fell back (busy) |
| T1-?380 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1811` | draft |  |  | judge typed fell back (busy) |
| T1-?381 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1812` | draft |  |  | judge stall fell back (busy) |
| T1-?382 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1820` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="needlehaven_heart" evidence="These come from the forest, don't they." (evidence only in the player's line) |
| T1-?383 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1867` | draft |  |  | judge scene fell back (timeout) |
| T1-?384 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1868` | draft |  |  | judge warden fell back (timeout) |
| T1-?385 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1869` | draft |  |  | judge wardenLore fell back (timeout) |
| T1-?386 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1883` | draft |  |  | 2 extraction line(s) rejected: DELTA q=in_needlehaven value=true evidence="the three of us walk out the west postern and across the field, under the first pines of Needlehaven" (evidence only in the player's line); DELTA q=location value="needlehaven" evidence="the three of us walk out the west postern and across the field, under the first pines of Needlehaven" (evidence only in the player's line) |
| T1-?387 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1911` | draft |  |  | judge lore fell back (busy) |
| T1-?388 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1912` | draft |  |  | judge lore fell back (busy) |
| T1-?389 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1913` | draft |  |  | judge lore fell back (busy) |
| T1-?390 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1914` | draft |  |  | judge typed fell back (busy) |
| T1-?391 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1915` | draft |  |  | judge scene fell back (busy) |
| T1-?392 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1916` | draft |  |  | judge warden fell back (busy) |
| T1-?393 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1917` | draft |  |  | judge wardenLore fell back (busy) |
| T1-?394 | T1 |  |  | `test/sessions/T1/T1-1-1/console.jsonl:151` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?395 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1919` | draft |  |  | judge typed fell back (busy) |
| T1-?396 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1921` | draft |  |  | judge memoryVerify fell back (busy) |
| T1-?397 | T1 |  |  | `test/sessions/T1/T1-1-1/journal.jsonl:1936` | draft |  |  | judge scene fell back (timeout) |

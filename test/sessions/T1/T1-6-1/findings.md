# Findings draft: T1-6

Session `test/sessions/T1/T1-6-1`. Draft rows for `docs/plans/v2.6/14-findings.md`; severity and class are decided in the review.

## Counts

- flags: 5
- stall: 3
- extraction-rejected: 1
- empty-private-block: 0
- lore-force-lost: 0
- lore-constant-missed: 0
- judge-fallback: 170
- save-lost: 0
- unexpected-jump: 3
- rollback: 0
- console-error: 21
- model-call-failure: 0
- model-defect: 4
- harness-error: 0

## Judge health

- calls: 654 (answered 484, busy 159, timeout 11, other fallbacks 0)
- busy rate: 24.3% (by use: memoryPairs 124, lore 22, director 5, wardenLore 3, typed 2, memoryVerify 2, warden 1)
- a busy fallback was never sent: the lane's judge rate limit (or a TypeSafe 429 passed through) held it, and the consumer took its no-judge path

## Model defects

- 3 turn(s) with a defective reply: loop 3, corrupt 1; swiped once by the loop guard: 2

## Flags

### 2026-10-01T17:11:37.892Z (message 35)

- note: Tension felt wrong: HUD reads 'critical' (0.71, expected 0.5) while the scouts politely escort us in after I knelt and sheathed steel (msgs 31-35). It climbed every turn at the stones even on de-escalating lines (0.38 -> 0.49 -> 0.62 -> 0.71).
- evidence: `journal.jsonl:774`
- context (event-time):
  - #32 Belle: Belle's jaw clenches as she takes her hand off the handle of Cleaver. "Fuck," she says, the low sound a curse and a promise. "Fine. But if anyone tries something, I'm not waiting for an order." She settles her hands by her sides, her eyes locked on the wolf. "And I'm not sheathing it. Just keeping i
  - #33 Max Nightriver: I nod to Belle, then turn back to the guardians and wait, palms open.
  - #34 Adolion Narrator: The Guardians do not move. The forest is silent. Then the bear turns and begins to walk. Its golden sap glows in the mossy shadows, and it makes no sound as it moves. The wolf follows, its twisted third leg dragging slightly on the forest floor. The stag does not move. It stays where it is, watching
  - **#35 Belle: Belle doesn't move at first. She looks at the scouts, then at you. "You're joking." She spits on the moss, and her hands twitch near her greataxe's handle. "You want to follow these bastards into the woods?" She shakes her head, then looks at you and the scouts and back again. "Fine. I'm following y**

### 2026-10-01T17:15:39.073Z (message 38)

- note: model defect: loop
- evidence: `journal.jsonl:825`
- context (end-of-session):
  - #35 Belle: Belle doesn't move at first. She looks at the scouts, then at you. "You're joking." She spits on the moss, and her hands twitch near her greataxe's handle. "You want to follow these bastards into the woods?" She shakes her head, then looks at you and the scouts and back again. "Fine. I'm following y
  - #36 Max Nightriver: We follow the scouts. I fall into step beside the lead scout. How far is it to your city? And how did the trappers come to be the Princess's guests?
  - #37 Ashliel: Ashliel walks silently behind the group, her hands clasped before her. She says nothing, but her gaze is fixed on the forest ahead. The scent of incense grows stronger as they walk, thick enough to taste. And from the shadows, there is a sound: the brush of a wing. Ashliel's eyes flick toward the so
  - **#38 Belle: Belle keeps her eyes locked on the back of the lead scout, and her hands are still near her axe. "You're making a lot of questions, Max." She says it low, but there's a hint of something in her voice—something that isn't just irritation. "This is our chance to get the answers we came for. Don't fuck**
  - #39 Adolion Narrator: The forest changes as they move deeper into the elves' wood: the silver-leaved oaks give way to trees with leaves that shimmer with a faint green light, and the forest floor becomes carpeted in soft, bioluminescent fungi that glow softly in the shadows. The smell of incense continues to thicken, and
  - #40 Elowyn: "I've been waiting for you." Princess Elowyn stands by the window in the castle's main hall, the moonlight streaming through the glass and bathing her golden hair in silver. Her dress is a deep green, with a gold brooch pinning a window of cleavage at the bodice. She turns as the party enters, her e
  - #41 Max Nightriver: At the court I bow to the elven king. King Teranora, thank you for your welcome. Where are the Holt siblings? We were sent to bring them home.

### 2026-10-01T17:21:45.963Z (message 43)

- note: model defect: corrupt
- evidence: `journal.jsonl:1002`
- context (end-of-session):
  - #40 Elowyn: "I've been waiting for you." Princess Elowyn stands by the window in the castle's main hall, the moonlight streaming through the glass and bathing her golden hair in silver. Her dress is a deep green, with a gold brooch pinning a window of cleavage at the bodice. She turns as the party enters, her e
  - #41 Max Nightriver: At the court I bow to the elven king. King Teranora, thank you for your welcome. Where are the Holt siblings? We were sent to bring them home.
  - #42 Adolion Narrator: The King nods, his expression distant. "The siblings are safe in our care." He speaks as if this were an answer, and then his eyes move to his daughter, and they are soft and full of a strange, quiet understanding. "The Princess is their hostess, and she is a gracious one." Then the King turns and l
  - **#43 Elowyn: Elowyn smiles at you, and her eyes are bright and full of light. "We have so much to discuss, darling. The fate of the trappers is not something we can rush." She reaches for the wine-glass being offered, and she drinks, and then she puts it back, and her hand is still resting on your shoulder. "We **
  - #44 Max Nightriver: I say nothing and sip the wine.
  - #45 Elowyn: Elowyn watches you sip the wine, and her smile is thin and soft. "Is it not divine?" She says it like a question, but there is no doubt in her voice. "I had the servers bring it from our cellars. Only the finest for my guests." She looks back at you, her hand still resting on your shoulder, and her 
  - #46 Belle: Belle's jaw tightens as she watches Elowyn's hand on Max's shoulder. "It's not fine," she says, her voice a low snarl. "It's all fine. Everything is too fine. I don't like it." She pushes her wine-glass away, her fingers white-knuckled on the table. "And I'm not drinking any more of it. Something ab

### 2026-10-01T17:25:50.418Z (message 49)

- note: Slow stretch cut short: after two silent turns at the feast the narrator skips an hour, the night and to dawn in one reply (msg 49), moving the party ('the party does so with her', rooms assigned) without my choices.
- evidence: `journal.jsonl:1100`
- context (event-time):
  - #46 Belle: Belle's jaw tightens as she watches Elowyn's hand on Max's shoulder. "It's not fine," she says, her voice a low snarl. "It's all fine. Everything is too fine. I don't like it." She pushes her wine-glass away, her fingers white-knuckled on the table. "And I'm not drinking any more of it. Something ab
  - #47 Adolion Narrator: Down the table a human server drops a cup. His elven wife rises, takes him by the wrist and leads him out of the hall without a word, and the harps do not miss a note.
  - #48 Max Nightriver: I keep quiet and watch the hall.
  - **#49 Adolion Narrator: The feast proceeds for an hour, then winds down. Elowyn rises from her seat and the party does so with her. She gestures for a server to lead them away, her gaze lingering on Max Nightriver. "We will talk more tomorrow," she says. "I will not have you leave yet." The server leads them to a guest win**

### 2026-10-01T17:34:08.791Z (message 57)

- note: model defect: loop
- evidence: `journal.jsonl:1268`
- context (end-of-session):
  - #54 Belle: Belle's expression is flat as she looks at Elowyn. "I feel like I've had enough talking. I'm feeling like I want to see those trappers." She shifts her weight, and her hands are still near her greataxe's handle. "And I'm not going anywhere without them." She looks at Max, and then at Elowyn, and her
  - #55 Max Nightriver: Belle, easy. I nod to Elowyn. One more day, then. We'll rest tonight and see them tomorrow. We go back to our rooms.
  - #56 Elowyn: Elowyn smiles, and her emerald eyes are full of light and relief. "Thank you, darling. I knew you would understand." She looks at Belle, and her smile widens slightly. "And thank you for your patience. I promise, tomorrow you will see them." She reaches out and touches your hand, her touch soft and 
  - **#57 Belle: Belle doesn't move. She stands in the doorway, her hand still white-knuckled on the handle of Cleaver. "We'll see them tomorrow," she says, her voice flat and hard. "And if we don't see them, I'm going to start breaking things." She looks at the Princess, then at you. "And I'm not waiting for anothe**
  - #58 Max Nightriver: That night I sleep with my sword by the bed. In the morning I knock on Belle's door again.
  - #59 Belle: Belle doesn't answer for a moment, then the door swings open. She looks at you with her eyes, and her expression is tired and wary. "What is it?" she says, her voice low. "If you're coming to tell me the Princess wants us, I've already heard it." She looks past you, her eyes scanning the hall. "And 

## Anomalies

### stall (3)

- 2026-10-01T16:57:09.963Z 10 boundaries without a transition at esha-the-last-chapel while its exits were pending (`journal.jsonl:305`)
- 2026-10-01T17:11:00.530Z 10 boundaries without a transition at esha-the-guardians while its exits were pending (`journal.jsonl:752`)
- 2026-10-01T17:26:52.750Z 10 boundaries without a transition at esha-the-court while its exits were pending (`journal.jsonl:1113`)

### extraction-rejected (1)

- 2026-10-01T17:00:13.999Z 1 extraction line(s) rejected: DELTA q=esha_dread value=1 evidence="his voice is low and thin" (evidence not in window) (`journal.jsonl:427`)

### judge-fallback (170)

- 2026-10-01T16:49:55.758Z judge typed fell back (busy) (`journal.jsonl:66`)
- 2026-10-01T16:49:58.054Z judge memoryVerify fell back (busy) (`journal.jsonl:69`)
- 2026-10-01T16:50:24.341Z judge lore fell back (busy) (`journal.jsonl:85`)
- 2026-10-01T16:50:24.341Z judge lore fell back (busy) (`journal.jsonl:86`)
- 2026-10-01T16:50:24.342Z judge lore fell back (busy) (`journal.jsonl:87`)
- 2026-10-01T16:50:24.360Z judge director fell back (busy) (`journal.jsonl:89`)
- 2026-10-01T16:52:00.781Z judge lore fell back (busy) (`journal.jsonl:147`)
- 2026-10-01T16:52:00.781Z judge lore fell back (busy) (`journal.jsonl:148`)
- 2026-10-01T16:52:01.143Z judge director fell back (busy) (`journal.jsonl:150`)
- 2026-10-01T16:52:02.850Z judge lore fell back (busy) (`journal.jsonl:155`)
- 2026-10-01T16:55:08.815Z judge scene fell back (timeout) (`journal.jsonl:236`)
- 2026-10-01T16:55:11.327Z judge typed fell back (timeout) (`journal.jsonl:237`)
- 2026-10-01T16:55:11.573Z judge warden fell back (busy) (`journal.jsonl:238`)
- 2026-10-01T16:55:11.579Z judge wardenLore fell back (busy) (`journal.jsonl:239`)
- 2026-10-01T16:56:01.518Z judge memoryPairs fell back (busy) (`journal.jsonl:272`)
- 2026-10-01T16:56:01.518Z judge memoryPairs fell back (busy) (`journal.jsonl:273`)
- 2026-10-01T16:56:01.518Z judge memoryPairs fell back (busy) (`journal.jsonl:274`)
- 2026-10-01T16:56:01.518Z judge memoryPairs fell back (busy) (`journal.jsonl:275`)
- 2026-10-01T16:56:01.518Z judge memoryPairs fell back (busy) (`journal.jsonl:276`)
- 2026-10-01T16:56:01.518Z judge memoryPairs fell back (busy) (`journal.jsonl:277`)
- 2026-10-01T16:56:01.540Z judge memoryPairs fell back (busy) (`journal.jsonl:279`)
- 2026-10-01T16:56:01.540Z judge memoryPairs fell back (busy) (`journal.jsonl:280`)
- 2026-10-01T16:56:34.976Z judge memoryPairs fell back (busy) (`journal.jsonl:285`)
- 2026-10-01T16:56:34.976Z judge memoryPairs fell back (busy) (`journal.jsonl:286`)
- 2026-10-01T16:56:34.976Z judge memoryPairs fell back (busy) (`journal.jsonl:287`)
- 2026-10-01T16:56:34.977Z judge memoryPairs fell back (busy) (`journal.jsonl:288`)
- 2026-10-01T16:56:34.980Z judge memoryPairs fell back (busy) (`journal.jsonl:289`)
- 2026-10-01T16:56:34.980Z judge memoryPairs fell back (busy) (`journal.jsonl:290`)
- 2026-10-01T16:56:34.980Z judge memoryPairs fell back (busy) (`journal.jsonl:291`)
- 2026-10-01T16:56:34.980Z judge memoryPairs fell back (busy) (`journal.jsonl:292`)
- 2026-10-01T16:56:48.220Z judge lore fell back (busy) (`journal.jsonl:296`)
- 2026-10-01T16:56:48.220Z judge lore fell back (busy) (`journal.jsonl:297`)
- 2026-10-01T16:56:48.220Z judge lore fell back (busy) (`journal.jsonl:298`)
- 2026-10-01T16:56:48.220Z judge lore fell back (busy) (`journal.jsonl:299`)
- 2026-10-01T16:56:48.238Z judge director fell back (busy) (`journal.jsonl:301`)
- 2026-10-01T17:05:18.507Z judge director fell back (timeout) (`journal.jsonl:543`)
- 2026-10-01T17:05:21.016Z judge scene fell back (timeout) (`journal.jsonl:544`)
- 2026-10-01T17:05:22.672Z judge typed fell back (timeout) (`journal.jsonl:545`)
- 2026-10-01T17:05:23.757Z judge wardenLore fell back (busy) (`journal.jsonl:547`)
- 2026-10-01T17:06:05.944Z judge memoryPairs fell back (busy) (`journal.jsonl:583`)
- 2026-10-01T17:06:05.944Z judge memoryPairs fell back (busy) (`journal.jsonl:584`)
- 2026-10-01T17:06:05.944Z judge memoryPairs fell back (busy) (`journal.jsonl:585`)
- 2026-10-01T17:06:05.944Z judge memoryPairs fell back (busy) (`journal.jsonl:586`)
- 2026-10-01T17:06:05.944Z judge memoryPairs fell back (busy) (`journal.jsonl:587`)
- 2026-10-01T17:06:05.945Z judge memoryPairs fell back (busy) (`journal.jsonl:588`)
- 2026-10-01T17:06:05.947Z judge memoryPairs fell back (busy) (`journal.jsonl:589`)
- 2026-10-01T17:06:05.947Z judge memoryPairs fell back (busy) (`journal.jsonl:590`)
- 2026-10-01T17:06:05.947Z judge memoryPairs fell back (busy) (`journal.jsonl:591`)
- 2026-10-01T17:06:05.947Z judge memoryPairs fell back (busy) (`journal.jsonl:592`)
- 2026-10-01T17:06:05.947Z judge memoryPairs fell back (busy) (`journal.jsonl:593`)
- 2026-10-01T17:06:05.947Z judge memoryPairs fell back (busy) (`journal.jsonl:594`)
- 2026-10-01T17:06:05.947Z judge memoryPairs fell back (busy) (`journal.jsonl:595`)
- 2026-10-01T17:06:05.947Z judge memoryPairs fell back (busy) (`journal.jsonl:596`)
- 2026-10-01T17:06:05.948Z judge memoryPairs fell back (busy) (`journal.jsonl:597`)
- 2026-10-01T17:06:05.949Z judge memoryPairs fell back (busy) (`journal.jsonl:598`)
- 2026-10-01T17:06:05.949Z judge memoryPairs fell back (busy) (`journal.jsonl:599`)
- 2026-10-01T17:06:05.949Z judge memoryPairs fell back (busy) (`journal.jsonl:600`)
- 2026-10-01T17:06:05.949Z judge memoryPairs fell back (busy) (`journal.jsonl:601`)
- 2026-10-01T17:06:05.949Z judge memoryPairs fell back (busy) (`journal.jsonl:602`)
- 2026-10-01T17:06:05.949Z judge memoryPairs fell back (busy) (`journal.jsonl:603`)
- 2026-10-01T17:06:05.949Z judge memoryPairs fell back (busy) (`journal.jsonl:604`)
- 2026-10-01T17:06:11.193Z judge memoryVerify fell back (busy) (`journal.jsonl:607`)
- 2026-10-01T17:06:15.037Z judge typed fell back (busy) (`journal.jsonl:616`)
- 2026-10-01T17:06:45.090Z judge memoryPairs fell back (busy) (`journal.jsonl:636`)
- 2026-10-01T17:06:45.090Z judge memoryPairs fell back (busy) (`journal.jsonl:637`)
- 2026-10-01T17:06:45.090Z judge memoryPairs fell back (busy) (`journal.jsonl:638`)
- 2026-10-01T17:06:45.090Z judge memoryPairs fell back (busy) (`journal.jsonl:639`)
- 2026-10-01T17:06:45.090Z judge memoryPairs fell back (busy) (`journal.jsonl:640`)
- 2026-10-01T17:06:45.090Z judge memoryPairs fell back (busy) (`journal.jsonl:641`)
- 2026-10-01T17:06:45.090Z judge memoryPairs fell back (busy) (`journal.jsonl:642`)
- 2026-10-01T17:06:45.299Z judge memoryPairs fell back (busy) (`journal.jsonl:644`)
- 2026-10-01T17:06:45.300Z judge memoryPairs fell back (busy) (`journal.jsonl:645`)
- 2026-10-01T17:06:45.300Z judge memoryPairs fell back (busy) (`journal.jsonl:646`)
- 2026-10-01T17:06:45.300Z judge memoryPairs fell back (busy) (`journal.jsonl:647`)
- 2026-10-01T17:06:45.300Z judge memoryPairs fell back (busy) (`journal.jsonl:648`)
- 2026-10-01T17:06:45.300Z judge memoryPairs fell back (busy) (`journal.jsonl:649`)
- 2026-10-01T17:06:45.300Z judge memoryPairs fell back (busy) (`journal.jsonl:650`)
- 2026-10-01T17:06:45.300Z judge memoryPairs fell back (busy) (`journal.jsonl:651`)
- 2026-10-01T17:06:45.301Z judge memoryPairs fell back (busy) (`journal.jsonl:652`)
- 2026-10-01T17:06:45.301Z judge memoryPairs fell back (busy) (`journal.jsonl:653`)
- 2026-10-01T17:06:45.301Z judge memoryPairs fell back (busy) (`journal.jsonl:654`)
- 2026-10-01T17:06:45.301Z judge memoryPairs fell back (busy) (`journal.jsonl:655`)
- 2026-10-01T17:06:45.301Z judge memoryPairs fell back (busy) (`journal.jsonl:656`)
- 2026-10-01T17:06:45.301Z judge memoryPairs fell back (busy) (`journal.jsonl:657`)
- 2026-10-01T17:06:45.301Z judge memoryPairs fell back (busy) (`journal.jsonl:658`)
- 2026-10-01T17:06:45.301Z judge memoryPairs fell back (busy) (`journal.jsonl:659`)
- 2026-10-01T17:07:00.689Z judge lore fell back (busy) (`journal.jsonl:663`)
- 2026-10-01T17:07:00.689Z judge lore fell back (busy) (`journal.jsonl:664`)
- 2026-10-01T17:07:00.689Z judge lore fell back (busy) (`journal.jsonl:665`)
- 2026-10-01T17:07:00.689Z judge lore fell back (busy) (`journal.jsonl:666`)
- 2026-10-01T17:07:00.689Z judge lore fell back (busy) (`journal.jsonl:667`)
- 2026-10-01T17:07:00.715Z judge director fell back (busy) (`journal.jsonl:668`)
- 2026-10-01T17:20:05.548Z judge director fell back (timeout) (`journal.jsonl:918`)
- 2026-10-01T17:20:06.740Z judge scene fell back (timeout) (`journal.jsonl:919`)
- 2026-10-01T17:20:09.550Z judge warden fell back (timeout) (`journal.jsonl:920`)
- 2026-10-01T17:20:59.067Z judge memoryPairs fell back (busy) (`journal.jsonl:954`)
- 2026-10-01T17:20:59.068Z judge memoryPairs fell back (busy) (`journal.jsonl:955`)
- 2026-10-01T17:20:59.068Z judge memoryPairs fell back (busy) (`journal.jsonl:956`)
- 2026-10-01T17:20:59.068Z judge memoryPairs fell back (busy) (`journal.jsonl:957`)
- 2026-10-01T17:20:59.068Z judge memoryPairs fell back (busy) (`journal.jsonl:958`)
- 2026-10-01T17:20:59.068Z judge memoryPairs fell back (busy) (`journal.jsonl:959`)
- 2026-10-01T17:20:59.068Z judge memoryPairs fell back (busy) (`journal.jsonl:960`)
- 2026-10-01T17:20:59.314Z judge memoryPairs fell back (busy) (`journal.jsonl:962`)
- 2026-10-01T17:20:59.314Z judge memoryPairs fell back (busy) (`journal.jsonl:963`)
- 2026-10-01T17:20:59.314Z judge memoryPairs fell back (busy) (`journal.jsonl:964`)
- 2026-10-01T17:20:59.314Z judge memoryPairs fell back (busy) (`journal.jsonl:965`)
- 2026-10-01T17:20:59.314Z judge memoryPairs fell back (busy) (`journal.jsonl:966`)
- 2026-10-01T17:20:59.314Z judge memoryPairs fell back (busy) (`journal.jsonl:967`)
- 2026-10-01T17:20:59.314Z judge memoryPairs fell back (busy) (`journal.jsonl:968`)
- 2026-10-01T17:20:59.314Z judge memoryPairs fell back (busy) (`journal.jsonl:969`)
- 2026-10-01T17:21:37.375Z judge memoryPairs fell back (busy) (`journal.jsonl:974`)
- 2026-10-01T17:21:37.375Z judge memoryPairs fell back (busy) (`journal.jsonl:975`)
- 2026-10-01T17:21:37.375Z judge memoryPairs fell back (busy) (`journal.jsonl:976`)
- 2026-10-01T17:21:37.489Z judge memoryPairs fell back (busy) (`journal.jsonl:978`)
- 2026-10-01T17:21:37.489Z judge memoryPairs fell back (busy) (`journal.jsonl:979`)
- 2026-10-01T17:21:37.489Z judge memoryPairs fell back (busy) (`journal.jsonl:980`)
- 2026-10-01T17:21:37.489Z judge memoryPairs fell back (busy) (`journal.jsonl:981`)
- 2026-10-01T17:21:37.489Z judge memoryPairs fell back (busy) (`journal.jsonl:982`)
- 2026-10-01T17:21:37.489Z judge memoryPairs fell back (busy) (`journal.jsonl:983`)
- 2026-10-01T17:21:37.489Z judge memoryPairs fell back (busy) (`journal.jsonl:984`)
- 2026-10-01T17:21:37.489Z judge memoryPairs fell back (busy) (`journal.jsonl:985`)
- 2026-10-01T17:21:37.491Z judge memoryPairs fell back (busy) (`journal.jsonl:986`)
- 2026-10-01T17:21:37.491Z judge memoryPairs fell back (busy) (`journal.jsonl:987`)
- 2026-10-01T17:21:37.491Z judge memoryPairs fell back (busy) (`journal.jsonl:988`)
- 2026-10-01T17:21:37.491Z judge memoryPairs fell back (busy) (`journal.jsonl:989`)
- 2026-10-01T17:21:37.491Z judge memoryPairs fell back (busy) (`journal.jsonl:990`)
- 2026-10-01T17:21:37.491Z judge memoryPairs fell back (busy) (`journal.jsonl:991`)
- 2026-10-01T17:21:37.491Z judge memoryPairs fell back (busy) (`journal.jsonl:992`)
- 2026-10-01T17:21:37.491Z judge memoryPairs fell back (busy) (`journal.jsonl:993`)
- 2026-10-01T17:21:37.492Z judge memoryPairs fell back (busy) (`journal.jsonl:994`)
- 2026-10-01T17:21:37.492Z judge memoryPairs fell back (busy) (`journal.jsonl:995`)
- 2026-10-01T17:21:37.492Z judge memoryPairs fell back (busy) (`journal.jsonl:996`)
- 2026-10-01T17:21:37.492Z judge memoryPairs fell back (busy) (`journal.jsonl:997`)
- 2026-10-01T17:21:37.492Z judge memoryPairs fell back (busy) (`journal.jsonl:998`)
- 2026-10-01T17:21:37.492Z judge memoryPairs fell back (busy) (`journal.jsonl:999`)
- 2026-10-01T17:21:37.492Z judge memoryPairs fell back (busy) (`journal.jsonl:1000`)
- 2026-10-01T17:21:47.268Z judge lore fell back (busy) (`journal.jsonl:1005`)
- 2026-10-01T17:21:47.268Z judge lore fell back (busy) (`journal.jsonl:1006`)
- 2026-10-01T17:21:47.268Z judge lore fell back (busy) (`journal.jsonl:1007`)
- 2026-10-01T17:24:17.606Z judge director fell back (busy) (`journal.jsonl:1066`)
- 2026-10-01T17:32:36.660Z judge scene fell back (timeout) (`journal.jsonl:1216`)
- 2026-10-01T17:32:38.839Z judge typed fell back (timeout) (`journal.jsonl:1217`)
- 2026-10-01T17:32:40.662Z judge warden fell back (timeout) (`journal.jsonl:1218`)
- 2026-10-01T17:32:40.800Z judge wardenLore fell back (busy) (`journal.jsonl:1219`)
- 2026-10-01T17:33:26.776Z judge memoryPairs fell back (busy) (`journal.jsonl:1241`)
- 2026-10-01T17:33:26.776Z judge memoryPairs fell back (busy) (`journal.jsonl:1242`)
- 2026-10-01T17:33:26.776Z judge memoryPairs fell back (busy) (`journal.jsonl:1243`)
- 2026-10-01T17:33:26.778Z judge memoryPairs fell back (busy) (`journal.jsonl:1244`)
- 2026-10-01T17:33:26.780Z judge memoryPairs fell back (busy) (`journal.jsonl:1245`)
- 2026-10-01T17:33:26.780Z judge memoryPairs fell back (busy) (`journal.jsonl:1246`)
- 2026-10-01T17:33:26.780Z judge memoryPairs fell back (busy) (`journal.jsonl:1247`)
- 2026-10-01T17:33:26.780Z judge memoryPairs fell back (busy) (`journal.jsonl:1248`)
- 2026-10-01T17:33:26.780Z judge memoryPairs fell back (busy) (`journal.jsonl:1249`)
- 2026-10-01T17:33:26.780Z judge memoryPairs fell back (busy) (`journal.jsonl:1250`)
- 2026-10-01T17:33:26.780Z judge memoryPairs fell back (busy) (`journal.jsonl:1251`)
- 2026-10-01T17:33:59.711Z judge memoryPairs fell back (busy) (`journal.jsonl:1254`)
- 2026-10-01T17:33:59.711Z judge memoryPairs fell back (busy) (`journal.jsonl:1255`)
- 2026-10-01T17:33:59.711Z judge memoryPairs fell back (busy) (`journal.jsonl:1256`)
- 2026-10-01T17:33:59.711Z judge memoryPairs fell back (busy) (`journal.jsonl:1257`)
- 2026-10-01T17:33:59.711Z judge memoryPairs fell back (busy) (`journal.jsonl:1258`)
- 2026-10-01T17:33:59.929Z judge memoryPairs fell back (busy) (`journal.jsonl:1260`)
- 2026-10-01T17:33:59.929Z judge memoryPairs fell back (busy) (`journal.jsonl:1261`)
- 2026-10-01T17:33:59.929Z judge memoryPairs fell back (busy) (`journal.jsonl:1262`)
- 2026-10-01T17:33:59.929Z judge memoryPairs fell back (busy) (`journal.jsonl:1263`)
- 2026-10-01T17:33:59.929Z judge memoryPairs fell back (busy) (`journal.jsonl:1264`)
- 2026-10-01T17:33:59.929Z judge memoryPairs fell back (busy) (`journal.jsonl:1265`)
- 2026-10-01T17:34:09.772Z judge lore fell back (busy) (`journal.jsonl:1271`)
- 2026-10-01T17:34:09.772Z judge lore fell back (busy) (`journal.jsonl:1272`)
- 2026-10-01T17:34:09.772Z judge lore fell back (busy) (`journal.jsonl:1273`)
- 2026-10-01T17:34:09.772Z judge lore fell back (busy) (`journal.jsonl:1274`)

### unexpected-jump (3)

- 2026-10-01T17:11:00.530Z esha-the-guardians → gen_esha-the-road-in_1 is not an authored transition (a generated route?) (`journal.jsonl:753`)
- 2026-10-01T17:15:07.347Z gen_esha-the-road-in_1 → gen_esha-the-road-in_2 is not an authored transition (a generated route?) (`journal.jsonl:795`)
- 2026-10-01T17:15:10.670Z gen_esha-the-road-in_2 → esha-the-court is not an authored transition (`journal.jsonl:798`)

### console-error (21)

- 2026-10-01T16:49:55.758Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:3`)
- 2026-10-01T16:50:24.353Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:5`)
- 2026-10-01T16:50:24.353Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:6`)
- 2026-10-01T16:52:00.788Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:9`)
- 2026-10-01T16:52:02.854Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:10`)
- 2026-10-01T16:55:11.574Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:19`)
- 2026-10-01T16:55:11.580Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:20`)
- 2026-10-01T16:56:01.517Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:22`)
- 2026-10-01T16:56:34.976Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:23`)
- 2026-10-01T16:56:35.005Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:24`)
- 2026-10-01T17:05:23.758Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:42`)
- 2026-10-01T17:06:05.945Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:44`)
- 2026-10-01T17:06:05.945Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:45`)
- 2026-10-01T17:06:45.090Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:46`)
- 2026-10-01T17:20:59.068Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:73`)
- 2026-10-01T17:21:37.376Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:74`)
- 2026-10-01T17:24:17.607Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:81`)
- 2026-10-01T17:32:40.800Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:97`)
- 2026-10-01T17:33:26.776Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:98`)
- 2026-10-01T17:33:26.778Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:99`)
- 2026-10-01T17:33:59.711Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:100`)

### model-defect (4)

- 2026-10-01T17:11:43.003Z model loop in message 37 (Ashliel): and a truth that (x16) (`turns.jsonl:17`)
- 2026-10-01T17:15:46.701Z model corrupt in message 43 (Elowyn): , and her expression is soft and eager, and and and her eyes are bright and full of a l (swiped once) (`turns.jsonl:18`)
- 2026-10-01T17:30:01.361Z model loop in message 56 (Elowyn): And then she is. (x4) (swiped once) (`turns.jsonl:24`)
- 2026-10-01T17:30:01.361Z model loop in message 57 (Belle): And then she is. (x3) (swiped once) (`turns.jsonl:24`)

## Draft register rows

| id | tier | severity | class | evidence | status | fix commit | eval | what |
|---|---|---|---|---|---|---|---|---|
| T1-?1 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:774` | draft |  |  | Tension felt wrong: HUD reads 'critical' (0.71, expected 0.5) while the scouts politely escort us in after I knelt and sheathed steel (msgs 31-35). It climbed every turn at the stones even on de-escalating lines (0.38 -> 0.49 -> 0.62 -> 0.71). |
| T1-?2 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:825` | draft |  |  | model defect: loop |
| T1-?3 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1002` | draft |  |  | model defect: corrupt |
| T1-?4 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1100` | draft |  |  | Slow stretch cut short: after two silent turns at the feast the narrator skips an hour, the night and to dawn in one reply (msg 49), moving the party ('the party does so with her', rooms assigned) without my choices. |
| T1-?5 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1268` | draft |  |  | model defect: loop |
| T1-?6 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:66` | draft |  |  | judge typed fell back (busy) |
| T1-?7 | T1 |  |  | `test/sessions/T1/T1-6-1/console.jsonl:3` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?8 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:69` | draft |  |  | judge memoryVerify fell back (busy) |
| T1-?9 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:85` | draft |  |  | judge lore fell back (busy) |
| T1-?10 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:86` | draft |  |  | judge lore fell back (busy) |
| T1-?11 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:87` | draft |  |  | judge lore fell back (busy) |
| T1-?12 | T1 |  |  | `test/sessions/T1/T1-6-1/console.jsonl:5` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?13 | T1 |  |  | `test/sessions/T1/T1-6-1/console.jsonl:6` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?14 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:89` | draft |  |  | judge director fell back (busy) |
| T1-?15 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:147` | draft |  |  | judge lore fell back (busy) |
| T1-?16 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:148` | draft |  |  | judge lore fell back (busy) |
| T1-?17 | T1 |  |  | `test/sessions/T1/T1-6-1/console.jsonl:9` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?18 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:150` | draft |  |  | judge director fell back (busy) |
| T1-?19 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:155` | draft |  |  | judge lore fell back (busy) |
| T1-?20 | T1 |  |  | `test/sessions/T1/T1-6-1/console.jsonl:10` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?21 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:236` | draft |  |  | judge scene fell back (timeout) |
| T1-?22 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:237` | draft |  |  | judge typed fell back (timeout) |
| T1-?23 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:238` | draft |  |  | judge warden fell back (busy) |
| T1-?24 | T1 |  |  | `test/sessions/T1/T1-6-1/console.jsonl:19` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?25 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:239` | draft |  |  | judge wardenLore fell back (busy) |
| T1-?26 | T1 |  |  | `test/sessions/T1/T1-6-1/console.jsonl:20` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?27 | T1 |  |  | `test/sessions/T1/T1-6-1/console.jsonl:22` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?28 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:272` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?29 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:273` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?30 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:274` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?31 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:275` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?32 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:276` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?33 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:277` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?34 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:279` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?35 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:280` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?36 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:285` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?37 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:286` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?38 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:287` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?39 | T1 |  |  | `test/sessions/T1/T1-6-1/console.jsonl:23` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?40 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:288` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?41 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:289` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?42 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:290` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?43 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:291` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?44 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:292` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?45 | T1 |  |  | `test/sessions/T1/T1-6-1/console.jsonl:24` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?46 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:296` | draft |  |  | judge lore fell back (busy) |
| T1-?47 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:297` | draft |  |  | judge lore fell back (busy) |
| T1-?48 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:298` | draft |  |  | judge lore fell back (busy) |
| T1-?49 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:299` | draft |  |  | judge lore fell back (busy) |
| T1-?50 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:301` | draft |  |  | judge director fell back (busy) |
| T1-?51 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:305` | draft |  |  | 10 boundaries without a transition at esha-the-last-chapel while its exits were pending |
| T1-?52 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:427` | draft |  |  | 1 extraction line(s) rejected: DELTA q=esha_dread value=1 evidence="his voice is low and thin" (evidence not in window) |
| T1-?53 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:543` | draft |  |  | judge director fell back (timeout) |
| T1-?54 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:544` | draft |  |  | judge scene fell back (timeout) |
| T1-?55 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:545` | draft |  |  | judge typed fell back (timeout) |
| T1-?56 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:547` | draft |  |  | judge wardenLore fell back (busy) |
| T1-?57 | T1 |  |  | `test/sessions/T1/T1-6-1/console.jsonl:42` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?58 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:583` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?59 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:584` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?60 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:585` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?61 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:586` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?62 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:587` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?63 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:588` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?64 | T1 |  |  | `test/sessions/T1/T1-6-1/console.jsonl:44` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?65 | T1 |  |  | `test/sessions/T1/T1-6-1/console.jsonl:45` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?66 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:589` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?67 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:590` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?68 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:591` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?69 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:592` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?70 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:593` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?71 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:594` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?72 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:595` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?73 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:596` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?74 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:597` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?75 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:598` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?76 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:599` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?77 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:600` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?78 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:601` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?79 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:602` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?80 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:603` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?81 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:604` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?82 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:607` | draft |  |  | judge memoryVerify fell back (busy) |
| T1-?83 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:616` | draft |  |  | judge typed fell back (busy) |
| T1-?84 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:636` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?85 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:637` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?86 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:638` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?87 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:639` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?88 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:640` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?89 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:641` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?90 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:642` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?91 | T1 |  |  | `test/sessions/T1/T1-6-1/console.jsonl:46` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?92 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:644` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?93 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:645` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?94 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:646` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?95 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:647` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?96 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:648` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?97 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:649` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?98 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:650` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?99 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:651` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?100 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:652` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?101 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:653` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?102 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:654` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?103 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:655` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?104 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:656` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?105 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:657` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?106 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:658` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?107 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:659` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?108 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:663` | draft |  |  | judge lore fell back (busy) |
| T1-?109 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:664` | draft |  |  | judge lore fell back (busy) |
| T1-?110 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:665` | draft |  |  | judge lore fell back (busy) |
| T1-?111 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:666` | draft |  |  | judge lore fell back (busy) |
| T1-?112 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:667` | draft |  |  | judge lore fell back (busy) |
| T1-?113 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:668` | draft |  |  | judge director fell back (busy) |
| T1-?114 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:752` | draft |  |  | 10 boundaries without a transition at esha-the-guardians while its exits were pending |
| T1-?115 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:753` | draft |  |  | esha-the-guardians → gen_esha-the-road-in_1 is not an authored transition (a generated route?) |
| T1-?116 | T1 |  |  | `test/sessions/T1/T1-6-1/turns.jsonl:17` | draft |  |  | model loop in message 37 (Ashliel): and a truth that (x16) |
| T1-?117 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:795` | draft |  |  | gen_esha-the-road-in_1 → gen_esha-the-road-in_2 is not an authored transition (a generated route?) |
| T1-?118 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:798` | draft |  |  | gen_esha-the-road-in_2 → esha-the-court is not an authored transition |
| T1-?119 | T1 |  |  | `test/sessions/T1/T1-6-1/turns.jsonl:18` | draft |  |  | model corrupt in message 43 (Elowyn): , and her expression is soft and eager, and and and her eyes are bright and full of a l (swiped once) |
| T1-?120 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:918` | draft |  |  | judge director fell back (timeout) |
| T1-?121 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:919` | draft |  |  | judge scene fell back (timeout) |
| T1-?122 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:920` | draft |  |  | judge warden fell back (timeout) |
| T1-?123 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:954` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?124 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:955` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?125 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:956` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?126 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:957` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?127 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:958` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?128 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:959` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?129 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:960` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?130 | T1 |  |  | `test/sessions/T1/T1-6-1/console.jsonl:73` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?131 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:962` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?132 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:963` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?133 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:964` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?134 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:965` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?135 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:966` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?136 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:967` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?137 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:968` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?138 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:969` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?139 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:974` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?140 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:975` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?141 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:976` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?142 | T1 |  |  | `test/sessions/T1/T1-6-1/console.jsonl:74` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?143 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:978` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?144 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:979` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?145 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:980` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?146 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:981` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?147 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:982` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?148 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:983` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?149 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:984` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?150 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:985` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?151 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:986` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?152 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:987` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?153 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:988` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?154 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:989` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?155 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:990` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?156 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:991` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?157 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:992` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?158 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:993` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?159 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:994` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?160 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:995` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?161 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:996` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?162 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:997` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?163 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:998` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?164 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:999` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?165 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1000` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?166 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1005` | draft |  |  | judge lore fell back (busy) |
| T1-?167 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1006` | draft |  |  | judge lore fell back (busy) |
| T1-?168 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1007` | draft |  |  | judge lore fell back (busy) |
| T1-?169 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1066` | draft |  |  | judge director fell back (busy) |
| T1-?170 | T1 |  |  | `test/sessions/T1/T1-6-1/console.jsonl:81` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?171 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1113` | draft |  |  | 10 boundaries without a transition at esha-the-court while its exits were pending |
| T1-?172 | T1 |  |  | `test/sessions/T1/T1-6-1/turns.jsonl:24` | draft |  |  | model loop in message 56 (Elowyn): And then she is. (x4) (swiped once) |
| T1-?173 | T1 |  |  | `test/sessions/T1/T1-6-1/turns.jsonl:24` | draft |  |  | model loop in message 57 (Belle): And then she is. (x3) (swiped once) |
| T1-?174 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1216` | draft |  |  | judge scene fell back (timeout) |
| T1-?175 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1217` | draft |  |  | judge typed fell back (timeout) |
| T1-?176 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1218` | draft |  |  | judge warden fell back (timeout) |
| T1-?177 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1219` | draft |  |  | judge wardenLore fell back (busy) |
| T1-?178 | T1 |  |  | `test/sessions/T1/T1-6-1/console.jsonl:97` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?179 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1241` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?180 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1242` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?181 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1243` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?182 | T1 |  |  | `test/sessions/T1/T1-6-1/console.jsonl:98` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?183 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1244` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?184 | T1 |  |  | `test/sessions/T1/T1-6-1/console.jsonl:99` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?185 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1245` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?186 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1246` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?187 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1247` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?188 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1248` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?189 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1249` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?190 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1250` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?191 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1251` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?192 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1254` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?193 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1255` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?194 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1256` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?195 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1257` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?196 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1258` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?197 | T1 |  |  | `test/sessions/T1/T1-6-1/console.jsonl:100` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?198 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1260` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?199 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1261` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?200 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1262` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?201 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1263` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?202 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1264` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?203 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1265` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?204 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1271` | draft |  |  | judge lore fell back (busy) |
| T1-?205 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1272` | draft |  |  | judge lore fell back (busy) |
| T1-?206 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1273` | draft |  |  | judge lore fell back (busy) |
| T1-?207 | T1 |  |  | `test/sessions/T1/T1-6-1/journal.jsonl:1274` | draft |  |  | judge lore fell back (busy) |

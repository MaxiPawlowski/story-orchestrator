# Findings draft: T1-3

Session `test/sessions/T1/T1-3-1`. Draft rows for `docs/plans/v2.6/14-findings.md`; severity and class are decided in the review.

## Counts

- flags: 4
- stall: 2
- extraction-rejected: 4
- empty-private-block: 13
- lore-force-lost: 0
- lore-constant-missed: 0
- judge-fallback: 171
- save-lost: 2
- unexpected-jump: 0
- rollback: 0
- console-error: 24
- model-call-failure: 0
- harness-error: 0

## Flags

### 2026-10-01T14:17:02.076Z (message 5)

- note: msg 5: Vallie was named and drafted but her reply is one line of stage business with no answer to my question; then the director handed back to me (silence). Silence when someone should have answered.
- evidence: `journal.jsonl:94`
- context (event-time):
  - #2 Haley: Haley's knuckles whiten against her fan. A beat, and her voice is ice. "The rumours are—" Her eyes flash. "The rumours are childish and base." Her posture stiffens as she turns her gaze from the King, from Forre, from Vallie. "My mother is not—" She stops, the words catching. The King's face is ston
  - #3 Alexander: Alexander's dark eyes narrow, and his hand falls away from the map table. "The Princess believes—" He doesn't finish the word. His face hardens, and a voice that has commanded armies rises. "This is a war council, not a gossip's den." The King stands, and the silver of his crown gleams in the shadow
  - #4 Max Nightriver: Guildmaster Vallie, what is the Crown really asking of adventurers?
  - **#5 Vallie: Vallie doesn't wait for the King to notice. She shifts her weight, boots creaking on the stone floor, and steps into the circle of light from the map table. Her blue eye is fixed on the party. "The Crown's asking for a scalpel," she says, her voice blunt and low. "Where Forre's army goes in with a h**

### 2026-10-01T14:22:40.150Z (message 16)

- note: msg 16: Haley says outright in open council 'She is not necromancer' after I only addressed the empty chair (Melisande); her steer is to hold her tongue. Borderline: I had asked her about the rumour at msg 1. Melisande correctly did not speak (msg 15 empty chair).
- evidence: `journal.jsonl:286`
- context (event-time):
  - #13 Dalan: Dalan blinks, his eyes flicking from Belle to Max, then he's counting. "Forty-eight. Thirty-six standard, twelve for piercing." He checks his quiver, then glances at the map. "Not enough to fight our way out of an army." He looks up at Max, and his cheeks go pink. "But enough to hunt one or two mons
  - #14 Max Nightriver: Queen Melisande, will you speak for yourself on this?
  - #15 Adolion Narrator: The question is aimed at an empty chair. Melisande's seat is a throne of carved stone, draped in purple velvet and embroidered with the sigils of the Third Kingdom. It sits untouched. The King's face is stone. Prince Forre doesn't look up from the map. Princess Haley's grip on her fan tightens until
  - **#16 Haley: Haley's fan snaps shut with a sound like a bone breaking. "Mother is not—" She stops, her breath sharp. Her eyes are wide and green, and they're fixed on the empty chair. "She is not here." Her voice is a thin edge. "And she is not—" A beat. "She is not necromancer." Forre's eyes are still on the ma**

### 2026-10-01T14:46:14.754Z (message 49)

- note: msg 48: Narrator reply degenerates into 'The valley is quiet.' repeated ~60 times (model loop). Kanna (msg 47) correctly answered when addressed.
- evidence: `journal.jsonl:982`
- context (event-time):
  - #46 Max Nightriver: Blood Saint, we're not the ones digging up your dead. Why do you care where the dead go?
  - #47 Kanna: Kanna's eyes flicker, and a beat, her jaw sets. "Cares? I don't give a fuck about some piles of rot." She shifts her weight, and the black steel of her armour catches the light. "What I care about is the disrespect. And the cowardice." A beat, and her fangs show. "A soldier earns their place in the 
  - #48 Adolion Narrator: The Zegallan banners flutter in the wind, and the valley is quiet, and there is only the sound of a banner snapping and the wind on the stones. The valley is quiet. The valley is quiet. The valley is quiet. The valley is quiet. The valley is quiet. The valley is quiet. The valley is quiet. The valle
  - **#49 Belle: Belle doesn't turn around. Her hand is still on Cleaver's haft, and her jaw is set, and she's not smiling. "Not us." She says it flat and hard. "We're here on a job from the Crown, and we're looking for the missing dead, not diggin' 'em up." A beat, and she shifts her weight. "So maybe you should st**

### 2026-10-01T14:48:45.410Z (message 51)

- note: msg 51: second degenerate loop in a row: Kanna's reply ends with 'The air is still.' x~70. Speaker choice was right (Kanna addressed, Kanna answered).
- evidence: `journal.jsonl:1011`
- context (event-time):
  - #48 Adolion Narrator: The Zegallan banners flutter in the wind, and the valley is quiet, and there is only the sound of a banner snapping and the wind on the stones. The valley is quiet. The valley is quiet. The valley is quiet. The valley is quiet. The valley is quiet. The valley is quiet. The valley is quiet. The valle
  - #49 Belle: Belle doesn't turn around. Her hand is still on Cleaver's haft, and her jaw is set, and she's not smiling. "Not us." She says it flat and hard. "We're here on a job from the Crown, and we're looking for the missing dead, not diggin' 'em up." A beat, and she shifts her weight. "So maybe you should st
  - #50 Max Nightriver: Kanna, swear on Blood Oath that your regiment didn't take them, and I'll swear the same for ours.
  - **#51 Kanna: Kanna's hand tightens on the shaft of her greataxe. Her eyes narrow, and for a beat, the air around her seems to grow hot. "I swear on Blood Oath," she says, and her voice is low and steady. "That the Cursefire Regiment didn't take your dead." A beat, and she lets go of the axe. "And you swear on Cl**

## Anomalies

### stall (2)

- 2026-10-01T14:22:03.913Z 10 boundaries without a transition at war-the-summons while its exits were pending (`journal.jsonl:259`)
- 2026-10-01T14:45:46.189Z 10 boundaries without a transition at war-the-front while its exits were pending (`journal.jsonl:976`)

### extraction-rejected (4)

- 2026-10-01T14:15:31.477Z 1 extraction line(s) rejected: [hiding] Haley / Her doubt about the rumour concerning her mother, from the King and the council. (invalid epistemic line) (`journal.jsonl:64`)
- 2026-10-01T14:23:32.126Z 1 extraction line(s) rejected: [hiding] Haley / Her fear and grief over her mother's absence and the necromancer rumours (invalid epistemic line) (`journal.jsonl:316`)
- 2026-10-01T14:26:24.708Z 1 extraction line(s) rejected: [hiding] Haley / Her distress over the rumours about her mother, Queen Melisande (invalid epistemic line) (`journal.jsonl:387`)
- 2026-10-01T14:26:38.423Z 2 extraction line(s) rejected: [hiding] Haley / Her full knowledge of her mother's situation, refusing to speak further (invalid epistemic line); [hiding] Alexander / The true state of the front, which he denies has slipped (invalid epistemic line) (`journal.jsonl:399`)

### empty-private-block (13)

- 2026-10-01T14:29:29.614Z Forre was drafted in 2026-10-01@11h14m14s121ms at boundary 17 with no private block while holding 1 private entry acquired before it (`payloads.jsonl:58`)
- 2026-10-01T14:29:29.647Z Forre was drafted in 2026-10-01@11h14m14s121ms at boundary 17 with no private block while holding 1 private entry acquired before it (`payloads.jsonl:59`)
- 2026-10-01T14:29:34.272Z Alexander was drafted in 2026-10-01@11h14m14s121ms at boundary 17 with no private block while holding 2 private entries acquired before it (`payloads.jsonl:61`)
- 2026-10-01T14:37:54.503Z Belle was drafted in 2026-10-01@11h14m14s121ms at boundary 24 with no private block while holding 5 private entries acquired before it (`payloads.jsonl:128`)
- 2026-10-01T14:38:02.097Z Belle was drafted in 2026-10-01@11h14m14s121ms at boundary 24 with no private block while holding 5 private entries acquired before it (`payloads.jsonl:131`)
- 2026-10-01T14:38:02.967Z Belle was drafted in 2026-10-01@11h14m14s121ms at boundary 24 with no private block while holding 5 private entries acquired before it (`payloads.jsonl:132`)
- 2026-10-01T14:38:05.548Z Belle was drafted in 2026-10-01@11h14m14s121ms at boundary 24 with no private block while holding 5 private entries acquired before it (`payloads.jsonl:134`)
- 2026-10-01T14:38:07.663Z Belle was drafted in 2026-10-01@11h14m14s121ms at boundary 24 with no private block while holding 5 private entries acquired before it (`payloads.jsonl:137`)
- 2026-10-01T14:38:09.918Z Belle was drafted in 2026-10-01@11h14m14s121ms at boundary 24 with no private block while holding 5 private entries acquired before it (`payloads.jsonl:138`)
- 2026-10-01T14:39:14.285Z Dalan was drafted in 2026-10-01@11h14m14s121ms at boundary 26 with no private block while holding 7 private entries acquired before it (`payloads.jsonl:142`)
- 2026-10-01T14:42:26.672Z Dalan was drafted in 2026-10-01@11h14m14s121ms at boundary 29 with no private block while holding 9 private entries acquired before it (`payloads.jsonl:148`)
- 2026-10-01T14:51:39.791Z Kanna was drafted in 2026-10-01@11h14m14s121ms at boundary 35 with no private block while holding 6 private entries acquired before it (`payloads.jsonl:164`)
- 2026-10-01T14:54:39.244Z Belle was drafted in 2026-10-01@11h14m14s121ms at boundary 36 with no private block while holding 9 private entries acquired before it (`payloads.jsonl:166`)

### judge-fallback (171)

- 2026-10-01T14:15:01.488Z judge lore fell back (busy) (`journal.jsonl:45`)
- 2026-10-01T14:15:01.489Z judge lore fell back (busy) (`journal.jsonl:46`)
- 2026-10-01T14:15:01.489Z judge lore fell back (busy) (`journal.jsonl:47`)
- 2026-10-01T14:15:01.489Z judge lore fell back (busy) (`journal.jsonl:48`)
- 2026-10-01T14:15:31.483Z judge memoryVerify fell back (busy) (`journal.jsonl:58`)
- 2026-10-01T14:15:36.688Z judge memoryVerify fell back (busy) (`journal.jsonl:67`)
- 2026-10-01T14:18:43.978Z judge scene fell back (busy) (`journal.jsonl:145`)
- 2026-10-01T14:18:43.978Z judge warden fell back (busy) (`journal.jsonl:146`)
- 2026-10-01T14:18:43.996Z judge wardenLore fell back (busy) (`journal.jsonl:147`)
- 2026-10-01T14:18:44.502Z judge lore fell back (busy) (`journal.jsonl:151`)
- 2026-10-01T14:18:44.502Z judge lore fell back (busy) (`journal.jsonl:152`)
- 2026-10-01T14:18:44.502Z judge lore fell back (busy) (`journal.jsonl:153`)
- 2026-10-01T14:20:11.803Z judge warden fell back (busy) (`journal.jsonl:190`)
- 2026-10-01T14:20:11.803Z judge wardenLore fell back (busy) (`journal.jsonl:191`)
- 2026-10-01T14:20:12.239Z judge typed fell back (busy) (`journal.jsonl:193`)
- 2026-10-01T14:20:37.320Z judge lore fell back (busy) (`journal.jsonl:218`)
- 2026-10-01T14:20:37.375Z judge director fell back (busy) (`journal.jsonl:220`)
- 2026-10-01T14:20:41.914Z judge lore fell back (busy) (`journal.jsonl:228`)
- 2026-10-01T14:21:18.085Z judge scene fell back (timeout) (`journal.jsonl:233`)
- 2026-10-01T14:21:40.476Z judge memoryPairs fell back (busy) (`journal.jsonl:247`)
- 2026-10-01T14:21:40.476Z judge memoryPairs fell back (busy) (`journal.jsonl:248`)
- 2026-10-01T14:21:40.476Z judge memoryPairs fell back (busy) (`journal.jsonl:249`)
- 2026-10-01T14:21:40.712Z judge memoryPairs fell back (busy) (`journal.jsonl:251`)
- 2026-10-01T14:21:40.712Z judge memoryPairs fell back (busy) (`journal.jsonl:252`)
- 2026-10-01T14:21:40.712Z judge memoryPairs fell back (busy) (`journal.jsonl:253`)
- 2026-10-01T14:21:40.712Z judge memoryPairs fell back (busy) (`journal.jsonl:254`)
- 2026-10-01T14:21:40.712Z judge memoryPairs fell back (busy) (`journal.jsonl:255`)
- 2026-10-01T14:21:40.713Z judge memoryPairs fell back (busy) (`journal.jsonl:256`)
- 2026-10-01T14:21:40.713Z judge memoryPairs fell back (busy) (`journal.jsonl:257`)
- 2026-10-01T14:21:40.713Z judge memoryPairs fell back (busy) (`journal.jsonl:258`)
- 2026-10-01T14:22:04.950Z judge typed fell back (busy) (`journal.jsonl:261`)
- 2026-10-01T14:22:04.950Z judge stall fell back (busy) (`journal.jsonl:262`)
- 2026-10-01T14:22:04.950Z judge scene fell back (busy) (`journal.jsonl:263`)
- 2026-10-01T14:22:04.950Z judge warden fell back (busy) (`journal.jsonl:264`)
- 2026-10-01T14:22:04.951Z judge wardenLore fell back (busy) (`journal.jsonl:265`)
- 2026-10-01T14:22:08.815Z judge typed fell back (busy) (`journal.jsonl:266`)
- 2026-10-01T14:22:09.287Z judge memoryPairs fell back (busy) (`journal.jsonl:267`)
- 2026-10-01T14:22:09.287Z judge memoryPairs fell back (busy) (`journal.jsonl:268`)
- 2026-10-01T14:22:09.287Z judge memoryPairs fell back (busy) (`journal.jsonl:269`)
- 2026-10-01T14:22:09.287Z judge memoryPairs fell back (busy) (`journal.jsonl:270`)
- 2026-10-01T14:22:09.287Z judge memoryPairs fell back (busy) (`journal.jsonl:271`)
- 2026-10-01T14:22:09.287Z judge memoryPairs fell back (busy) (`journal.jsonl:272`)
- 2026-10-01T14:26:38.434Z judge memoryVerify fell back (busy) (`journal.jsonl:391`)
- 2026-10-01T14:28:48.129Z judge lore fell back (busy) (`journal.jsonl:453`)
- 2026-10-01T14:29:29.327Z judge lore fell back (busy) (`journal.jsonl:464`)
- 2026-10-01T14:29:29.327Z judge lore fell back (busy) (`journal.jsonl:465`)
- 2026-10-01T14:29:29.327Z judge lore fell back (busy) (`journal.jsonl:466`)
- 2026-10-01T14:29:29.327Z judge lore fell back (busy) (`journal.jsonl:467`)
- 2026-10-01T14:29:29.604Z judge typed fell back (busy) (`journal.jsonl:468`)
- 2026-10-01T14:29:29.638Z judge director fell back (busy) (`journal.jsonl:470`)
- 2026-10-01T14:29:31.447Z judge lore fell back (busy) (`journal.jsonl:475`)
- 2026-10-01T14:29:31.447Z judge lore fell back (busy) (`journal.jsonl:476`)
- 2026-10-01T14:29:31.447Z judge lore fell back (busy) (`journal.jsonl:477`)
- 2026-10-01T14:29:31.447Z judge lore fell back (busy) (`journal.jsonl:478`)
- 2026-10-01T14:29:40.811Z judge memoryVerify fell back (busy) (`journal.jsonl:482`)
- 2026-10-01T14:31:21.191Z judge lore fell back (busy) (`journal.jsonl:550`)
- 2026-10-01T14:31:21.191Z judge lore fell back (busy) (`journal.jsonl:551`)
- 2026-10-01T14:31:21.191Z judge typed fell back (busy) (`journal.jsonl:552`)
- 2026-10-01T14:31:21.207Z judge lore fell back (busy) (`journal.jsonl:553`)
- 2026-10-01T14:31:43.675Z judge stall fell back (busy) (`journal.jsonl:567`)
- 2026-10-01T14:31:43.675Z judge scene fell back (busy) (`journal.jsonl:568`)
- 2026-10-01T14:31:43.677Z judge warden fell back (busy) (`journal.jsonl:569`)
- 2026-10-01T14:31:43.715Z judge wardenLore fell back (busy) (`journal.jsonl:570`)
- 2026-10-01T14:31:47.421Z judge typed fell back (timeout) (`journal.jsonl:571`)
- 2026-10-01T14:32:38.227Z judge memoryPairs fell back (busy) (`journal.jsonl:604`)
- 2026-10-01T14:32:38.227Z judge memoryPairs fell back (busy) (`journal.jsonl:605`)
- 2026-10-01T14:32:38.227Z judge memoryPairs fell back (busy) (`journal.jsonl:606`)
- 2026-10-01T14:32:38.227Z judge memoryPairs fell back (busy) (`journal.jsonl:607`)
- 2026-10-01T14:32:38.231Z judge memoryPairs fell back (busy) (`journal.jsonl:609`)
- 2026-10-01T14:32:38.231Z judge memoryPairs fell back (busy) (`journal.jsonl:610`)
- 2026-10-01T14:32:38.231Z judge memoryPairs fell back (busy) (`journal.jsonl:611`)
- 2026-10-01T14:32:38.231Z judge memoryPairs fell back (busy) (`journal.jsonl:612`)
- 2026-10-01T14:32:38.231Z judge memoryPairs fell back (busy) (`journal.jsonl:613`)
- 2026-10-01T14:32:38.231Z judge memoryPairs fell back (busy) (`journal.jsonl:614`)
- 2026-10-01T14:32:38.231Z judge memoryPairs fell back (busy) (`journal.jsonl:615`)
- 2026-10-01T14:32:38.231Z judge memoryPairs fell back (busy) (`journal.jsonl:616`)
- 2026-10-01T14:32:38.233Z judge memoryPairs fell back (busy) (`journal.jsonl:617`)
- 2026-10-01T14:32:38.233Z judge memoryPairs fell back (busy) (`journal.jsonl:618`)
- 2026-10-01T14:32:38.233Z judge memoryPairs fell back (busy) (`journal.jsonl:619`)
- 2026-10-01T14:32:38.233Z judge memoryPairs fell back (busy) (`journal.jsonl:620`)
- 2026-10-01T14:32:38.234Z judge memoryPairs fell back (busy) (`journal.jsonl:621`)
- 2026-10-01T14:32:38.234Z judge memoryPairs fell back (busy) (`journal.jsonl:622`)
- 2026-10-01T14:32:38.234Z judge memoryPairs fell back (busy) (`journal.jsonl:623`)
- 2026-10-01T14:32:38.234Z judge memoryPairs fell back (busy) (`journal.jsonl:624`)
- 2026-10-01T14:33:22.791Z judge memoryPairs fell back (busy) (`journal.jsonl:627`)
- 2026-10-01T14:33:22.791Z judge memoryPairs fell back (busy) (`journal.jsonl:628`)
- 2026-10-01T14:33:22.791Z judge memoryPairs fell back (busy) (`journal.jsonl:629`)
- 2026-10-01T14:33:22.791Z judge memoryPairs fell back (busy) (`journal.jsonl:630`)
- 2026-10-01T14:33:22.791Z judge memoryPairs fell back (busy) (`journal.jsonl:631`)
- 2026-10-01T14:33:23.087Z judge memoryPairs fell back (busy) (`journal.jsonl:633`)
- 2026-10-01T14:33:23.087Z judge memoryPairs fell back (busy) (`journal.jsonl:634`)
- 2026-10-01T14:33:23.087Z judge memoryPairs fell back (busy) (`journal.jsonl:635`)
- 2026-10-01T14:33:23.087Z judge memoryPairs fell back (busy) (`journal.jsonl:636`)
- 2026-10-01T14:33:23.087Z judge memoryPairs fell back (busy) (`journal.jsonl:637`)
- 2026-10-01T14:33:23.087Z judge memoryPairs fell back (busy) (`journal.jsonl:638`)
- 2026-10-01T14:33:23.087Z judge memoryPairs fell back (busy) (`journal.jsonl:639`)
- 2026-10-01T14:33:23.089Z judge memoryPairs fell back (busy) (`journal.jsonl:640`)
- 2026-10-01T14:33:23.089Z judge memoryPairs fell back (busy) (`journal.jsonl:641`)
- 2026-10-01T14:33:23.089Z judge memoryPairs fell back (busy) (`journal.jsonl:642`)
- 2026-10-01T14:33:23.089Z judge memoryPairs fell back (busy) (`journal.jsonl:643`)
- 2026-10-01T14:33:23.089Z judge memoryPairs fell back (busy) (`journal.jsonl:644`)
- 2026-10-01T14:33:23.089Z judge memoryPairs fell back (busy) (`journal.jsonl:645`)
- 2026-10-01T14:33:23.089Z judge memoryPairs fell back (busy) (`journal.jsonl:646`)
- 2026-10-01T14:33:23.089Z judge memoryPairs fell back (busy) (`journal.jsonl:647`)
- 2026-10-01T14:33:23.090Z judge memoryPairs fell back (busy) (`journal.jsonl:648`)
- 2026-10-01T14:33:23.090Z judge memoryPairs fell back (busy) (`journal.jsonl:649`)
- 2026-10-01T14:33:23.090Z judge memoryPairs fell back (busy) (`journal.jsonl:650`)
- 2026-10-01T14:33:23.090Z judge memoryPairs fell back (busy) (`journal.jsonl:651`)
- 2026-10-01T14:33:23.090Z judge memoryPairs fell back (busy) (`journal.jsonl:652`)
- 2026-10-01T14:33:28.126Z judge curatorFilter fell back (busy) (`journal.jsonl:654`)
- 2026-10-01T14:36:26.959Z judge typed fell back (busy) (`journal.jsonl:750`)
- 2026-10-01T14:36:41.678Z judge director fell back (busy) (`journal.jsonl:768`)
- 2026-10-01T14:38:40.263Z judge warden fell back (busy) (`journal.jsonl:811`)
- 2026-10-01T14:38:40.264Z judge wardenLore fell back (busy) (`journal.jsonl:812`)
- 2026-10-01T14:38:40.536Z judge lore fell back (busy) (`journal.jsonl:814`)
- 2026-10-01T14:38:40.536Z judge lore fell back (busy) (`journal.jsonl:815`)
- 2026-10-01T14:38:40.536Z judge lore fell back (busy) (`journal.jsonl:816`)
- 2026-10-01T14:41:30.586Z judge lore fell back (busy) (`journal.jsonl:861`)
- 2026-10-01T14:41:30.586Z judge typed fell back (busy) (`journal.jsonl:862`)
- 2026-10-01T14:41:33.458Z judge memoryVerify fell back (busy) (`journal.jsonl:865`)
- 2026-10-01T14:42:26.377Z judge lore fell back (busy) (`journal.jsonl:877`)
- 2026-10-01T14:42:26.377Z judge lore fell back (busy) (`journal.jsonl:878`)
- 2026-10-01T14:42:26.663Z judge director fell back (busy) (`journal.jsonl:880`)
- 2026-10-01T14:43:21.002Z judge scene fell back (timeout) (`journal.jsonl:894`)
- 2026-10-01T14:43:22.826Z judge warden fell back (timeout) (`journal.jsonl:896`)
- 2026-10-01T14:43:53.663Z judge memoryPairs fell back (busy) (`journal.jsonl:917`)
- 2026-10-01T14:43:53.663Z judge memoryPairs fell back (busy) (`journal.jsonl:918`)
- 2026-10-01T14:43:53.664Z judge memoryPairs fell back (busy) (`journal.jsonl:919`)
- 2026-10-01T14:43:53.664Z judge memoryPairs fell back (busy) (`journal.jsonl:920`)
- 2026-10-01T14:43:53.756Z judge memoryPairs fell back (busy) (`journal.jsonl:922`)
- 2026-10-01T14:43:53.756Z judge memoryPairs fell back (busy) (`journal.jsonl:923`)
- 2026-10-01T14:43:53.757Z judge memoryPairs fell back (busy) (`journal.jsonl:924`)
- 2026-10-01T14:43:53.757Z judge memoryPairs fell back (busy) (`journal.jsonl:925`)
- 2026-10-01T14:43:53.757Z judge memoryPairs fell back (busy) (`journal.jsonl:926`)
- 2026-10-01T14:43:53.757Z judge memoryPairs fell back (busy) (`journal.jsonl:927`)
- 2026-10-01T14:43:53.758Z judge memoryPairs fell back (busy) (`journal.jsonl:928`)
- 2026-10-01T14:43:53.758Z judge memoryPairs fell back (busy) (`journal.jsonl:929`)
- 2026-10-01T14:43:53.761Z judge memoryPairs fell back (busy) (`journal.jsonl:930`)
- 2026-10-01T14:43:53.761Z judge memoryPairs fell back (busy) (`journal.jsonl:931`)
- 2026-10-01T14:43:53.761Z judge memoryPairs fell back (busy) (`journal.jsonl:932`)
- 2026-10-01T14:43:53.761Z judge memoryPairs fell back (busy) (`journal.jsonl:933`)
- 2026-10-01T14:43:53.761Z judge memoryPairs fell back (busy) (`journal.jsonl:934`)
- 2026-10-01T14:43:53.761Z judge memoryPairs fell back (busy) (`journal.jsonl:935`)
- 2026-10-01T14:43:53.761Z judge memoryPairs fell back (busy) (`journal.jsonl:936`)
- 2026-10-01T14:43:53.761Z judge memoryPairs fell back (busy) (`journal.jsonl:937`)
- 2026-10-01T14:43:53.766Z judge memoryPairs fell back (busy) (`journal.jsonl:938`)
- 2026-10-01T14:43:53.766Z judge memoryPairs fell back (busy) (`journal.jsonl:939`)
- 2026-10-01T14:43:53.766Z judge memoryPairs fell back (busy) (`journal.jsonl:940`)
- 2026-10-01T14:43:53.766Z judge memoryPairs fell back (busy) (`journal.jsonl:941`)
- 2026-10-01T14:43:53.766Z judge memoryPairs fell back (busy) (`journal.jsonl:942`)
- 2026-10-01T14:43:53.766Z judge memoryPairs fell back (busy) (`journal.jsonl:943`)
- 2026-10-01T14:43:53.766Z judge memoryPairs fell back (busy) (`journal.jsonl:944`)
- 2026-10-01T14:44:32.472Z judge memoryPairs fell back (busy) (`journal.jsonl:955`)
- 2026-10-01T14:44:32.472Z judge memoryPairs fell back (busy) (`journal.jsonl:956`)
- 2026-10-01T14:44:32.472Z judge memoryPairs fell back (busy) (`journal.jsonl:957`)
- 2026-10-01T14:44:32.472Z judge memoryPairs fell back (busy) (`journal.jsonl:958`)
- 2026-10-01T14:45:05.769Z judge warden fell back (busy) (`journal.jsonl:969`)
- 2026-10-01T14:45:05.769Z judge wardenLore fell back (busy) (`journal.jsonl:970`)
- 2026-10-01T14:45:05.769Z judge lore fell back (busy) (`journal.jsonl:971`)
- 2026-10-01T14:45:05.769Z judge lore fell back (busy) (`journal.jsonl:972`)
- 2026-10-01T14:45:05.769Z judge lore fell back (busy) (`journal.jsonl:973`)
- 2026-10-01T14:45:05.769Z judge lore fell back (busy) (`journal.jsonl:974`)
- 2026-10-01T14:45:06.054Z judge scene fell back (timeout) (`journal.jsonl:975`)
- 2026-10-01T14:51:29.598Z judge scene fell back (timeout) (`journal.jsonl:1044`)
- 2026-10-01T14:51:31.126Z judge warden fell back (timeout) (`journal.jsonl:1045`)
- 2026-10-01T14:51:33.605Z judge wardenLore fell back (timeout) (`journal.jsonl:1046`)
- 2026-10-01T14:55:34.526Z judge scene fell back (timeout) (`journal.jsonl:1090`)
- 2026-10-01T14:55:35.075Z judge wardenLore fell back (busy) (`journal.jsonl:1091`)
- 2026-10-01T14:55:35.325Z judge lore fell back (busy) (`journal.jsonl:1092`)
- 2026-10-01T14:55:35.326Z judge lore fell back (busy) (`journal.jsonl:1093`)
- 2026-10-01T14:55:35.326Z judge lore fell back (busy) (`journal.jsonl:1094`)

### save-lost (2)

- 2026-10-01T14:31:50.271Z save not confirmed (`journal.jsonl:572`)
- 2026-10-01T14:31:50.318Z save not confirmed (`journal.jsonl:573`)

### console-error (24)

- 2026-10-01T14:15:01.496Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:3`)
- 2026-10-01T14:15:31.483Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:5`)
- 2026-10-01T14:18:43.978Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:10`)
- 2026-10-01T14:20:11.805Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:14`)
- 2026-10-01T14:20:37.321Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:15`)
- 2026-10-01T14:21:40.475Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:19`)
- 2026-10-01T14:26:38.436Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:28`)
- 2026-10-01T14:28:48.131Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:31`)
- 2026-10-01T14:29:29.328Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:33`)
- 2026-10-01T14:31:21.259Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:36`)
- 2026-10-01T14:31:21.261Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:37`)
- 2026-10-01T14:31:43.795Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:40`)
- 2026-10-01T14:32:38.228Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:49`)
- 2026-10-01T14:33:22.791Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:50`)
- 2026-10-01T14:36:27.085Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:59`)
- 2026-10-01T14:36:41.679Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:60`)
- 2026-10-01T14:38:40.404Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:65`)
- 2026-10-01T14:38:40.404Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:66`)
- 2026-10-01T14:41:30.587Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:75`)
- 2026-10-01T14:42:26.386Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:77`)
- 2026-10-01T14:43:53.663Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:83`)
- 2026-10-01T14:44:32.471Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:84`)
- 2026-10-01T14:45:05.769Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:87`)
- 2026-10-01T14:55:35.077Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:100`)

## Draft register rows

| id | tier | severity | class | evidence | status | fix commit | eval | what |
|---|---|---|---|---|---|---|---|---|
| T1-?1 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:94` | draft |  |  | msg 5: Vallie was named and drafted but her reply is one line of stage business with no answer to my question; then the director handed back to me (silence). Silence when someone should have answered. |
| T1-?2 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:286` | draft |  |  | msg 16: Haley says outright in open council 'She is not necromancer' after I only addressed the empty chair (Melisande); her steer is to hold her tongue. Borderline: I had asked her about the rumour at msg 1. Melisande correctly did not speak (msg 15 empty chair). |
| T1-?3 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:982` | draft |  |  | msg 48: Narrator reply degenerates into 'The valley is quiet.' repeated ~60 times (model loop). Kanna (msg 47) correctly answered when addressed. |
| T1-?4 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:1011` | draft |  |  | msg 51: second degenerate loop in a row: Kanna's reply ends with 'The air is still.' x~70. Speaker choice was right (Kanna addressed, Kanna answered). |
| T1-?5 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:45` | draft |  |  | judge lore fell back (busy) |
| T1-?6 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:46` | draft |  |  | judge lore fell back (busy) |
| T1-?7 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:47` | draft |  |  | judge lore fell back (busy) |
| T1-?8 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:48` | draft |  |  | judge lore fell back (busy) |
| T1-?9 | T1 |  |  | `test/sessions/T1/T1-3-1/console.jsonl:3` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?10 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:64` | draft |  |  | 1 extraction line(s) rejected: [hiding] Haley / Her doubt about the rumour concerning her mother, from the King and the council. (invalid epistemic line) |
| T1-?11 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:58` | draft |  |  | judge memoryVerify fell back (busy) |
| T1-?12 | T1 |  |  | `test/sessions/T1/T1-3-1/console.jsonl:5` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?13 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:67` | draft |  |  | judge memoryVerify fell back (busy) |
| T1-?14 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:145` | draft |  |  | judge scene fell back (busy) |
| T1-?15 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:146` | draft |  |  | judge warden fell back (busy) |
| T1-?16 | T1 |  |  | `test/sessions/T1/T1-3-1/console.jsonl:10` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?17 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:147` | draft |  |  | judge wardenLore fell back (busy) |
| T1-?18 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:151` | draft |  |  | judge lore fell back (busy) |
| T1-?19 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:152` | draft |  |  | judge lore fell back (busy) |
| T1-?20 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:153` | draft |  |  | judge lore fell back (busy) |
| T1-?21 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:190` | draft |  |  | judge warden fell back (busy) |
| T1-?22 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:191` | draft |  |  | judge wardenLore fell back (busy) |
| T1-?23 | T1 |  |  | `test/sessions/T1/T1-3-1/console.jsonl:14` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?24 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:193` | draft |  |  | judge typed fell back (busy) |
| T1-?25 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:218` | draft |  |  | judge lore fell back (busy) |
| T1-?26 | T1 |  |  | `test/sessions/T1/T1-3-1/console.jsonl:15` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?27 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:220` | draft |  |  | judge director fell back (busy) |
| T1-?28 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:228` | draft |  |  | judge lore fell back (busy) |
| T1-?29 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:233` | draft |  |  | judge scene fell back (timeout) |
| T1-?30 | T1 |  |  | `test/sessions/T1/T1-3-1/console.jsonl:19` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?31 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:247` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?32 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:248` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?33 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:249` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?34 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:251` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?35 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:252` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?36 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:253` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?37 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:254` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?38 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:255` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?39 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:256` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?40 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:257` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?41 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:258` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?42 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:259` | draft |  |  | 10 boundaries without a transition at war-the-summons while its exits were pending |
| T1-?43 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:261` | draft |  |  | judge typed fell back (busy) |
| T1-?44 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:262` | draft |  |  | judge stall fell back (busy) |
| T1-?45 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:263` | draft |  |  | judge scene fell back (busy) |
| T1-?46 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:264` | draft |  |  | judge warden fell back (busy) |
| T1-?47 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:265` | draft |  |  | judge wardenLore fell back (busy) |
| T1-?48 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:266` | draft |  |  | judge typed fell back (busy) |
| T1-?49 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:267` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?50 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:268` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?51 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:269` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?52 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:270` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?53 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:271` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?54 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:272` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?55 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:316` | draft |  |  | 1 extraction line(s) rejected: [hiding] Haley / Her fear and grief over her mother's absence and the necromancer rumours (invalid epistemic line) |
| T1-?56 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:387` | draft |  |  | 1 extraction line(s) rejected: [hiding] Haley / Her distress over the rumours about her mother, Queen Melisande (invalid epistemic line) |
| T1-?57 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:399` | draft |  |  | 2 extraction line(s) rejected: [hiding] Haley / Her full knowledge of her mother's situation, refusing to speak further (invalid epistemic line); [hiding] Alexander / The true state of the front, which he denies has slipped (invalid epistemic line) |
| T1-?58 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:391` | draft |  |  | judge memoryVerify fell back (busy) |
| T1-?59 | T1 |  |  | `test/sessions/T1/T1-3-1/console.jsonl:28` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?60 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:453` | draft |  |  | judge lore fell back (busy) |
| T1-?61 | T1 |  |  | `test/sessions/T1/T1-3-1/console.jsonl:31` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?62 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:464` | draft |  |  | judge lore fell back (busy) |
| T1-?63 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:465` | draft |  |  | judge lore fell back (busy) |
| T1-?64 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:466` | draft |  |  | judge lore fell back (busy) |
| T1-?65 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:467` | draft |  |  | judge lore fell back (busy) |
| T1-?66 | T1 |  |  | `test/sessions/T1/T1-3-1/console.jsonl:33` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?67 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:468` | draft |  |  | judge typed fell back (busy) |
| T1-?68 | T1 |  |  | `test/sessions/T1/T1-3-1/payloads.jsonl:58` | draft |  |  | Forre was drafted in 2026-10-01@11h14m14s121ms at boundary 17 with no private block while holding 1 private entry acquired before it |
| T1-?69 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:470` | draft |  |  | judge director fell back (busy) |
| T1-?70 | T1 |  |  | `test/sessions/T1/T1-3-1/payloads.jsonl:59` | draft |  |  | Forre was drafted in 2026-10-01@11h14m14s121ms at boundary 17 with no private block while holding 1 private entry acquired before it |
| T1-?71 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:475` | draft |  |  | judge lore fell back (busy) |
| T1-?72 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:476` | draft |  |  | judge lore fell back (busy) |
| T1-?73 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:477` | draft |  |  | judge lore fell back (busy) |
| T1-?74 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:478` | draft |  |  | judge lore fell back (busy) |
| T1-?75 | T1 |  |  | `test/sessions/T1/T1-3-1/payloads.jsonl:61` | draft |  |  | Alexander was drafted in 2026-10-01@11h14m14s121ms at boundary 17 with no private block while holding 2 private entries acquired before it |
| T1-?76 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:482` | draft |  |  | judge memoryVerify fell back (busy) |
| T1-?77 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:550` | draft |  |  | judge lore fell back (busy) |
| T1-?78 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:551` | draft |  |  | judge lore fell back (busy) |
| T1-?79 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:552` | draft |  |  | judge typed fell back (busy) |
| T1-?80 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:553` | draft |  |  | judge lore fell back (busy) |
| T1-?81 | T1 |  |  | `test/sessions/T1/T1-3-1/console.jsonl:36` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?82 | T1 |  |  | `test/sessions/T1/T1-3-1/console.jsonl:37` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?83 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:567` | draft |  |  | judge stall fell back (busy) |
| T1-?84 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:568` | draft |  |  | judge scene fell back (busy) |
| T1-?85 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:569` | draft |  |  | judge warden fell back (busy) |
| T1-?86 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:570` | draft |  |  | judge wardenLore fell back (busy) |
| T1-?87 | T1 |  |  | `test/sessions/T1/T1-3-1/console.jsonl:40` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?88 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:571` | draft |  |  | judge typed fell back (timeout) |
| T1-?89 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:572` | draft |  |  | save not confirmed |
| T1-?90 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:573` | draft |  |  | save not confirmed |
| T1-?91 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:604` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?92 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:605` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?93 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:606` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?94 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:607` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?95 | T1 |  |  | `test/sessions/T1/T1-3-1/console.jsonl:49` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?96 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:609` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?97 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:610` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?98 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:611` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?99 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:612` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?100 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:613` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?101 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:614` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?102 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:615` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?103 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:616` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?104 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:617` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?105 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:618` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?106 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:619` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?107 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:620` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?108 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:621` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?109 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:622` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?110 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:623` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?111 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:624` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?112 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:627` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?113 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:628` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?114 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:629` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?115 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:630` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?116 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:631` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?117 | T1 |  |  | `test/sessions/T1/T1-3-1/console.jsonl:50` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?118 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:633` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?119 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:634` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?120 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:635` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?121 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:636` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?122 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:637` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?123 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:638` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?124 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:639` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?125 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:640` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?126 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:641` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?127 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:642` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?128 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:643` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?129 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:644` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?130 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:645` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?131 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:646` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?132 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:647` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?133 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:648` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?134 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:649` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?135 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:650` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?136 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:651` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?137 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:652` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?138 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:654` | draft |  |  | judge curatorFilter fell back (busy) |
| T1-?139 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:750` | draft |  |  | judge typed fell back (busy) |
| T1-?140 | T1 |  |  | `test/sessions/T1/T1-3-1/console.jsonl:59` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?141 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:768` | draft |  |  | judge director fell back (busy) |
| T1-?142 | T1 |  |  | `test/sessions/T1/T1-3-1/console.jsonl:60` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?143 | T1 |  |  | `test/sessions/T1/T1-3-1/payloads.jsonl:128` | draft |  |  | Belle was drafted in 2026-10-01@11h14m14s121ms at boundary 24 with no private block while holding 5 private entries acquired before it |
| T1-?144 | T1 |  |  | `test/sessions/T1/T1-3-1/payloads.jsonl:131` | draft |  |  | Belle was drafted in 2026-10-01@11h14m14s121ms at boundary 24 with no private block while holding 5 private entries acquired before it |
| T1-?145 | T1 |  |  | `test/sessions/T1/T1-3-1/payloads.jsonl:132` | draft |  |  | Belle was drafted in 2026-10-01@11h14m14s121ms at boundary 24 with no private block while holding 5 private entries acquired before it |
| T1-?146 | T1 |  |  | `test/sessions/T1/T1-3-1/payloads.jsonl:134` | draft |  |  | Belle was drafted in 2026-10-01@11h14m14s121ms at boundary 24 with no private block while holding 5 private entries acquired before it |
| T1-?147 | T1 |  |  | `test/sessions/T1/T1-3-1/payloads.jsonl:137` | draft |  |  | Belle was drafted in 2026-10-01@11h14m14s121ms at boundary 24 with no private block while holding 5 private entries acquired before it |
| T1-?148 | T1 |  |  | `test/sessions/T1/T1-3-1/payloads.jsonl:138` | draft |  |  | Belle was drafted in 2026-10-01@11h14m14s121ms at boundary 24 with no private block while holding 5 private entries acquired before it |
| T1-?149 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:811` | draft |  |  | judge warden fell back (busy) |
| T1-?150 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:812` | draft |  |  | judge wardenLore fell back (busy) |
| T1-?151 | T1 |  |  | `test/sessions/T1/T1-3-1/console.jsonl:65` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?152 | T1 |  |  | `test/sessions/T1/T1-3-1/console.jsonl:66` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?153 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:814` | draft |  |  | judge lore fell back (busy) |
| T1-?154 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:815` | draft |  |  | judge lore fell back (busy) |
| T1-?155 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:816` | draft |  |  | judge lore fell back (busy) |
| T1-?156 | T1 |  |  | `test/sessions/T1/T1-3-1/payloads.jsonl:142` | draft |  |  | Dalan was drafted in 2026-10-01@11h14m14s121ms at boundary 26 with no private block while holding 7 private entries acquired before it |
| T1-?157 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:861` | draft |  |  | judge lore fell back (busy) |
| T1-?158 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:862` | draft |  |  | judge typed fell back (busy) |
| T1-?159 | T1 |  |  | `test/sessions/T1/T1-3-1/console.jsonl:75` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?160 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:865` | draft |  |  | judge memoryVerify fell back (busy) |
| T1-?161 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:877` | draft |  |  | judge lore fell back (busy) |
| T1-?162 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:878` | draft |  |  | judge lore fell back (busy) |
| T1-?163 | T1 |  |  | `test/sessions/T1/T1-3-1/console.jsonl:77` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?164 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:880` | draft |  |  | judge director fell back (busy) |
| T1-?165 | T1 |  |  | `test/sessions/T1/T1-3-1/payloads.jsonl:148` | draft |  |  | Dalan was drafted in 2026-10-01@11h14m14s121ms at boundary 29 with no private block while holding 9 private entries acquired before it |
| T1-?166 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:894` | draft |  |  | judge scene fell back (timeout) |
| T1-?167 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:896` | draft |  |  | judge warden fell back (timeout) |
| T1-?168 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:917` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?169 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:918` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?170 | T1 |  |  | `test/sessions/T1/T1-3-1/console.jsonl:83` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?171 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:919` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?172 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:920` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?173 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:922` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?174 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:923` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?175 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:924` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?176 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:925` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?177 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:926` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?178 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:927` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?179 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:928` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?180 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:929` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?181 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:930` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?182 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:931` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?183 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:932` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?184 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:933` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?185 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:934` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?186 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:935` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?187 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:936` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?188 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:937` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?189 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:938` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?190 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:939` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?191 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:940` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?192 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:941` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?193 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:942` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?194 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:943` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?195 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:944` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?196 | T1 |  |  | `test/sessions/T1/T1-3-1/console.jsonl:84` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?197 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:955` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?198 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:956` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?199 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:957` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?200 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:958` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?201 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:969` | draft |  |  | judge warden fell back (busy) |
| T1-?202 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:970` | draft |  |  | judge wardenLore fell back (busy) |
| T1-?203 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:971` | draft |  |  | judge lore fell back (busy) |
| T1-?204 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:972` | draft |  |  | judge lore fell back (busy) |
| T1-?205 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:973` | draft |  |  | judge lore fell back (busy) |
| T1-?206 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:974` | draft |  |  | judge lore fell back (busy) |
| T1-?207 | T1 |  |  | `test/sessions/T1/T1-3-1/console.jsonl:87` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?208 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:975` | draft |  |  | judge scene fell back (timeout) |
| T1-?209 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:976` | draft |  |  | 10 boundaries without a transition at war-the-front while its exits were pending |
| T1-?210 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:1044` | draft |  |  | judge scene fell back (timeout) |
| T1-?211 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:1045` | draft |  |  | judge warden fell back (timeout) |
| T1-?212 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:1046` | draft |  |  | judge wardenLore fell back (timeout) |
| T1-?213 | T1 |  |  | `test/sessions/T1/T1-3-1/payloads.jsonl:164` | draft |  |  | Kanna was drafted in 2026-10-01@11h14m14s121ms at boundary 35 with no private block while holding 6 private entries acquired before it |
| T1-?214 | T1 |  |  | `test/sessions/T1/T1-3-1/payloads.jsonl:166` | draft |  |  | Belle was drafted in 2026-10-01@11h14m14s121ms at boundary 36 with no private block while holding 9 private entries acquired before it |
| T1-?215 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:1090` | draft |  |  | judge scene fell back (timeout) |
| T1-?216 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:1091` | draft |  |  | judge wardenLore fell back (busy) |
| T1-?217 | T1 |  |  | `test/sessions/T1/T1-3-1/console.jsonl:100` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?218 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:1092` | draft |  |  | judge lore fell back (busy) |
| T1-?219 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:1093` | draft |  |  | judge lore fell back (busy) |
| T1-?220 | T1 |  |  | `test/sessions/T1/T1-3-1/journal.jsonl:1094` | draft |  |  | judge lore fell back (busy) |

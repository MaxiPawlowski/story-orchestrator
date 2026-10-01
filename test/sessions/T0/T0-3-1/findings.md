# Findings draft: T0-3

Session `test/sessions/T0/T0-3-1`. Draft rows for `docs/plans/v2.6/14-findings.md`; severity and class are decided in the review.

## Counts

- flags: 4
- stall: 0
- extraction-rejected: 12
- empty-private-block: 0
- lore-force-lost: 0
- lore-constant-missed: 0
- judge-fallback: 1
- save-lost: 0
- unexpected-jump: 0
- rollback: 2
- console-error: 0
- model-call-failure: 0
- harness-error: 0

## Flags

### 2026-10-01T11:44:10.805Z (message 4)

- note: Want to swipe Tobias's reply (mes 4) that moved us to The Road North, but the transition chat note (mes 5, 'The Road North — ...') is now the last message, so the swipe arrows are on the note, not the reply. Can't swipe the reply that moved the story without deleting the note first.
- evidence: `journal.jsonl:125`
- context (event-time):
  - #1 Max Nightriver: I push through the crowd to the board and tap the Wendhope posting. "This one. We take Wendhope. Write us down as the Ash Lanterns."
  - #2 Ellie: "Ash Lanterns." Ellie's pen scratches a name into the Guild's thick registration book. "Yes. The Ash Lanterns. And who is the leader?" Her eyes dart between you, Belle, and Dalan with a matchmaking glow in them before she snaps back to professionalism. "Actually, wait. Do you have any questions abou
  - #3 Max Nightriver: "I'll lead, for now." I nod at Belle and Dalan. "You two, if you want in, the Ash Lanterns ride north today. Tobias, anything we should know about Wendhope before we go?"
  - **#4 Tobias: "A sensible choice." Tobias's blue eyes flicker over you and the others before his hand goes to the notice. "Wendhope sits on the Sheridan lands, and the Sheridans pay well for its silence. If you are not going to investigate, then you will be going to die. The coin is above the standard D-rank fee **
  - #5 Note: ◈ The Road North — Travel to Wendhope and notice what the road is missing.

### 2026-10-01T11:48:58.466Z (message 2)

- note: Swiped Tobias's reply (mes 4) back to its FIRST version, the one that originally moved us to The Road North. Story stepped back to the Guild Hall and stays there (HUD 'stepped back', party name + path only 'pending next turn'), so the story no longer matches the text on screen until I play another turn. Notice says 'to match your edit' but I swiped, I didn't edit.
- evidence: `journal.jsonl:184`
- context (event-time):
  - #0 Adolion Narrator: You came to Aegis City to make a name with a blade, a bow or a spell, and three days ago you signed the Adventurers' Guild register to do it. Your Guild badge is new, your purse is light, and you have no party yet. The Guild sends no one out alone.  Today the hall is loud enough to be heard from the
  - #1 Max Nightriver: I push through the crowd to the board and tap the Wendhope posting. "This one. We take Wendhope. Write us down as the Ash Lanterns."
  - **#2 Ellie: "Ash Lanterns." Ellie's pen scratches a name into the Guild's thick registration book. "Yes. The Ash Lanterns. And who is the leader?" Her eyes dart between you, Belle, and Dalan with a matchmaking glow in them before she snaps back to professionalism. "Actually, wait. Do you have any questions abou**
  - #3 Max Nightriver: "I'll lead, for now." I nod at Belle and Dalan. "You two, if you want in, the Ash Lanterns ride north today. Tobias, anything we should know about Wendhope before we go?"
  - #4 Tobias: "A sensible choice." Tobias's blue eyes flicker over you and the others before his hand goes to the notice. "Wendhope sits on the Sheridan lands, and the Sheridans pay well for its silence. If you are not going to investigate, then you will be going to die. The coin is above the standard D-rank fee 

### 2026-10-01T11:51:52.712Z (message 8)

- note: Regenerate after my edit did not replace Tobias's reply (mes 6): the stale 'The Road North' chat note (mes 7) was last, so regenerate added a second Tobias reply (mes 8) below the note instead. Chat now shows a 'Road North' note while the story is back at the Guild Hall, plus two Tobias answers. Story itself correctly stayed at the Guild Hall.
- evidence: `journal.jsonl:280`
- context (event-time):
  - #5 Max Nightriver: "Rations for a week, then." I turn to Ellie. "Is there an advance on the fee? We'll need horses."
  - #6 Tobias: "No." Tobias's voice is flat as he turns to Ellie. "The Guild advances nothing." He looks at you with a thin, tight line of a smile. "The Sheridan's fee is not an advance; it is payment upon completion. If you cannot afford horses, you may walk." *His fingers drum on the ledger, the sound like a hea
  - #7 Note: ◈ The Road North — Travel to Wendhope and notice what the road is missing.
  - **#8 Tobias: "No." Tobias's voice is sharp, but not cruel. He looks at you directly, his eyes clear and steady. "The Guild advances nothing. The Sheridan fee is payment for completion." He pauses, his voice softening. "And the Sheridans would have no interest in funding your journey. They do not fund failed part**

### 2026-10-01T11:58:07.058Z (message 13)

- note: Re-accepted the job (mes 9 'Fine, we'll do it. Ash Lanterns. Let's ride north.'), Ellie wrote us in (mes 10), and we rode out of Aegis (mes 11-13) — but the HUD still says the Adventurer's Guild after 2 turns and nothing is pending. Story did not follow us onto the road.
- evidence: `journal.jsonl:443`
- context (event-time):
  - #10 Adolion Narrator: Ellie's pen scribbles the name into the register, then snaps shut with a decisive click. "Ash Lanterns," she reads back, her voice bright with the sound of it being a real party at last. She looks at you, then Belle, then Dalan, and then at Tobias, her matchmaking glow dimming just a little. "Tobias
  - #11 Max Nightriver: We leave Aegis at first light and follow the frontier road north. "Dalan, Belle, keep your eyes open. Tell me if anything about this road feels wrong."
  - #12 Dalan: "I'll keep a watch," Dalan says quietly. He rides a short, pale horse that matches his blonde hair. He doesn't look at you directly; instead, he keeps his eyes on the tree line. "And I'll tell you if anything looks wrong." He doesn't seem like he's supposed to be able to see things that looks wrong,
  - **#13 Belle: "Yeah, yeah. Just keep the pretty-boy's eyes open," Belle grunts. She doesn't look around; she rides a dark brown horse, her massive greataxe Cleaver rested across her saddle and her black shirt and brown shorts. She seems bored and unfazed by the road. "I'm more worried about the people we're about**

## Anomalies

### extraction-rejected (12)

- 2026-10-01T11:42:24.021Z 1 extraction line(s) rejected: DELTA q=adv_looking_for_hands value=false evidence="I push through the crowd to the board and tap the Wendhope posting." (evidence only in the player's line) (`journal.jsonl:74`)
- 2026-10-01T11:43:27.463Z 1 extraction line(s) rejected: DELTA q=location value="north_road" evidence="the Ash Lanterns ride north today" (evidence only in the player's line) (`journal.jsonl:124`)
- 2026-10-01T11:47:21.581Z 2 extraction line(s) rejected: DELTA q=location value="north_road" evidence="the Ash Lanterns ride north today" (evidence only in the player's line); DELTA q=first_camp value=false evidence="the Ash Lanterns ride north today" (evidence only in the player's line) (`journal.jsonl:166`)
- 2026-10-01T11:50:12.352Z 1 extraction line(s) rejected: DELTA q=location value="north_road" evidence="the Ash Lanterns ride north today" (evidence only in the player's line) (`journal.jsonl:213`)
- 2026-10-01T11:51:34.281Z 1 extraction line(s) rejected: DELTA q=adv_looking_for_hands value=false evidence="Tobias, anything we should know about Wendhope before we go?" (evidence only in the player's line) (`journal.jsonl:279`)
- 2026-10-01T11:54:27.093Z 2 extraction line(s) rejected: [hiding] Tobias / his personal history with the Sheridans and Wendhope (invalid epistemic line); DELTA q=location value="north_road" evidence="We leave Aegis at first light and follow the frontier road north." (evidence only in the player's line) (`journal.jsonl:396`)
- 2026-10-01T11:54:43.269Z 1 extraction line(s) rejected: DELTA q=location value="north_road" evidence="We leave Aegis at first light and follow the frontier road north." (evidence only in the player's line) (`journal.jsonl:428`)
- 2026-10-01T11:54:49.272Z 1 extraction line(s) rejected: DELTA q=location value="north_road" evidence="We leave Aegis at first light and follow the frontier road north." (evidence only in the player's line) (`journal.jsonl:440`)
- 2026-10-01T12:01:18.458Z 1 extraction line(s) rejected: DELTA q=location value="north_road" evidence="We leave Aegis at first light and follow the frontier road north." (evidence only in the player's line) (`journal.jsonl:499`)
- 2026-10-01T12:02:22.850Z 1 extraction line(s) rejected: DELTA q=location value="north_road" evidence="We leave Aegis at first light and follow the frontier road north." (evidence only in the player's line) (`journal.jsonl:550`)
- 2026-10-01T12:02:42.648Z 1 extraction line(s) rejected: DELTA q=location value="north_road" evidence="We leave Aegis at first light and follow the frontier road north." (evidence only in the player's line) (`journal.jsonl:583`)
- 2026-10-01T12:03:30.434Z 1 extraction line(s) rejected: DELTA q=location value="north_road" evidence="We leave Aegis at first light and follow the frontier road north." (evidence only in the player's line) (`journal.jsonl:612`)

### judge-fallback (1)

- 2026-10-01T12:03:30.086Z judge typed fell back (timeout) (`journal.jsonl:599`)

### rollback (2)

- 2026-10-01T11:51:22.217Z boundary went back from 3 to 2 (`journal.jsonl:248`)
- 2026-10-01T12:02:13.646Z boundary went back from 6 to 5 (`journal.jsonl:513`)

## Draft register rows

| id | tier | severity | class | evidence | status | fix commit | eval | what |
|---|---|---|---|---|---|---|---|---|
| T0-?1 | T0 |  |  | `test/sessions/T0/T0-3-1/journal.jsonl:125` | draft |  |  | Want to swipe Tobias's reply (mes 4) that moved us to The Road North, but the transition chat note (mes 5, 'The Road North — ...') is now the last message, so the swipe arrows are on the note, not the reply. Can't swipe the reply that moved the story without deleting the note first. |
| T0-?2 | T0 |  |  | `test/sessions/T0/T0-3-1/journal.jsonl:184` | draft |  |  | Swiped Tobias's reply (mes 4) back to its FIRST version, the one that originally moved us to The Road North. Story stepped back to the Guild Hall and stays there (HUD 'stepped back', party name + path only 'pending next turn'), so the story no longer matches the text on screen until I play another turn. Notice says 'to match your edit' but I swiped, I didn't edit. |
| T0-?3 | T0 |  |  | `test/sessions/T0/T0-3-1/journal.jsonl:280` | draft |  |  | Regenerate after my edit did not replace Tobias's reply (mes 6): the stale 'The Road North' chat note (mes 7) was last, so regenerate added a second Tobias reply (mes 8) below the note instead. Chat now shows a 'Road North' note while the story is back at the Guild Hall, plus two Tobias answers. Story itself correctly stayed at the Guild Hall. |
| T0-?4 | T0 |  |  | `test/sessions/T0/T0-3-1/journal.jsonl:443` | draft |  |  | Re-accepted the job (mes 9 'Fine, we'll do it. Ash Lanterns. Let's ride north.'), Ellie wrote us in (mes 10), and we rode out of Aegis (mes 11-13) — but the HUD still says the Adventurer's Guild after 2 turns and nothing is pending. Story did not follow us onto the road. |
| T0-?5 | T0 |  |  | `test/sessions/T0/T0-3-1/journal.jsonl:74` | draft |  |  | 1 extraction line(s) rejected: DELTA q=adv_looking_for_hands value=false evidence="I push through the crowd to the board and tap the Wendhope posting." (evidence only in the player's line) |
| T0-?6 | T0 |  |  | `test/sessions/T0/T0-3-1/journal.jsonl:124` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="north_road" evidence="the Ash Lanterns ride north today" (evidence only in the player's line) |
| T0-?7 | T0 |  |  | `test/sessions/T0/T0-3-1/journal.jsonl:166` | draft |  |  | 2 extraction line(s) rejected: DELTA q=location value="north_road" evidence="the Ash Lanterns ride north today" (evidence only in the player's line); DELTA q=first_camp value=false evidence="the Ash Lanterns ride north today" (evidence only in the player's line) |
| T0-?8 | T0 |  |  | `test/sessions/T0/T0-3-1/journal.jsonl:213` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="north_road" evidence="the Ash Lanterns ride north today" (evidence only in the player's line) |
| T0-?9 | T0 |  |  | `test/sessions/T0/T0-3-1/journal.jsonl:248` | draft |  |  | boundary went back from 3 to 2 |
| T0-?10 | T0 |  |  | `test/sessions/T0/T0-3-1/journal.jsonl:279` | draft |  |  | 1 extraction line(s) rejected: DELTA q=adv_looking_for_hands value=false evidence="Tobias, anything we should know about Wendhope before we go?" (evidence only in the player's line) |
| T0-?11 | T0 |  |  | `test/sessions/T0/T0-3-1/journal.jsonl:396` | draft |  |  | 2 extraction line(s) rejected: [hiding] Tobias / his personal history with the Sheridans and Wendhope (invalid epistemic line); DELTA q=location value="north_road" evidence="We leave Aegis at first light and follow the frontier road north." (evidence only in the player's line) |
| T0-?12 | T0 |  |  | `test/sessions/T0/T0-3-1/journal.jsonl:428` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="north_road" evidence="We leave Aegis at first light and follow the frontier road north." (evidence only in the player's line) |
| T0-?13 | T0 |  |  | `test/sessions/T0/T0-3-1/journal.jsonl:440` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="north_road" evidence="We leave Aegis at first light and follow the frontier road north." (evidence only in the player's line) |
| T0-?14 | T0 |  |  | `test/sessions/T0/T0-3-1/journal.jsonl:499` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="north_road" evidence="We leave Aegis at first light and follow the frontier road north." (evidence only in the player's line) |
| T0-?15 | T0 |  |  | `test/sessions/T0/T0-3-1/journal.jsonl:513` | draft |  |  | boundary went back from 6 to 5 |
| T0-?16 | T0 |  |  | `test/sessions/T0/T0-3-1/journal.jsonl:550` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="north_road" evidence="We leave Aegis at first light and follow the frontier road north." (evidence only in the player's line) |
| T0-?17 | T0 |  |  | `test/sessions/T0/T0-3-1/journal.jsonl:583` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="north_road" evidence="We leave Aegis at first light and follow the frontier road north." (evidence only in the player's line) |
| T0-?18 | T0 |  |  | `test/sessions/T0/T0-3-1/journal.jsonl:599` | draft |  |  | judge typed fell back (timeout) |
| T0-?19 | T0 |  |  | `test/sessions/T0/T0-3-1/journal.jsonl:612` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="north_road" evidence="We leave Aegis at first light and follow the frontier road north." (evidence only in the player's line) |

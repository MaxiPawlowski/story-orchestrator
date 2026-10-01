# Findings draft: T0-2

Session `test/sessions/T0/T0-2-2`. Draft rows for `docs/plans/v2.6/14-findings.md`; severity and class are decided in the review.

## Counts

- flags: 2
- stall: 0
- extraction-rejected: 0
- empty-private-block: 4
- lore-force-lost: 0
- lore-constant-missed: 0
- judge-fallback: 5
- save-lost: 7
- unexpected-jump: 0
- rollback: 0
- console-error: 6
- model-call-failure: 0
- harness-error: 1

## Flags

### 2026-10-01T12:13:19.670Z (message 50)

- note: Away recap (away 1d) is right about where we are but too long: 8 open threads, mostly the same question reworded (approach from the ridge x2 - stale, we are at the gate; defenders' fear x2; get inside before sundown x3). 'Recently' only says 'You moved into Wendhope's Eastern Gate'; the story-so-far is cut off mid-word ('since the Gui...'); Status says 'Catching up' a day later.
- evidence: `journal.jsonl:625`
- context (event-time):
  - #47 Belle: Belle's brown eyes narrow and she looks at the empty road. "A whole village empty? Fuck that." She spits on the ground and looks at the gate. "Something is wrong. And it ain't natural." She looks back at Dalan. "Get your bow ready. I can't shake the feeling that we're not alone out here."
  - #48 Adolion Narrator: The wind is cold and carries the scent of pine and damp earth, and the forest is silent around you. The village sits in the valley below, and there is no smoke from the fires, and there is nothing moving in the streets. And there is only the sound of your voice, and the knock, and the silence that f
  - #49 Note: ◈ Hold, Wendhope Is Closed — Get inside Wendhope before sundown.
  - **#50 Adolion Narrator: Three bows come up on the parapet at once. "That's far enough!" The archer in the middle has a scar over his left eye and has not slept in days. "Wendhope's not taking visitors. Turn round now and you'll make the crossroads by sundown."**

### 2026-10-01T12:27:01.887Z (message 69)

- note: Dalan's reply (msg 67) ends with a leaked bracket: '[Scene direction: The first night on Wendhope's walls. The red fog rolls in from Needlehaven. The Screechers arrive... Some die. They bubble and fade. The fog thins by dawn.]' - stage directions and spoilers (Screechers, Needlehaven, how the night ends) shown to the player in chat.
- evidence: `journal.jsonl:1152`
- context (event-time):
  - #66 Max Nightriver: The Sheridans hired the Guild to find out why the ore stopped. Looks like we found out. Put us to work, Captain. We hold the wall with you tonight. Belle, left side. Dalan, find a high spot.
  - #67 Dalan: Dalan hears the order and is already moving. "I will find a high point," he says softly, his voice clear and steady. He adjusts the strap of his wooden longbow on his shoulder and glances back at you and Belle. "I... I will be ready." He moves off toward the houses, his steps light and sure, his poi
  - #68 Adolion Narrator: The sun is still high in the sky, but there is a chill in the air, and the forest is quiet around you. The orc Captain looks at the party for a long moment, her red eyes hard and calculating. Then she nods, once, and turns back to the village below. "You're all right." She gestures to one of the arc
  - **#69 Belle: Belle does not hesitate. She's already moving, her greataxe Cleaver in her hands and her brown eyes scanning the forest. "Left side," she mutters, her voice low and rough. "I'll hold it." She walks to the edge of the wall, her grip tightening on the pommel of Cleaver as she looks out over the trees.**

## Anomalies

### empty-private-block (4)

- 2026-10-01T12:26:25.953Z Belle was drafted in 2026-10-01@08h41m13s779ms at boundary 38 with no private block while holding 4 private entries acquired before it (`payloads.jsonl:112`)
- 2026-10-01T12:26:35.009Z Belle was drafted in 2026-10-01@08h41m13s779ms at boundary 38 with no private block while holding 4 private entries acquired before it (`payloads.jsonl:114`)
- 2026-10-01T12:26:41.149Z Belle was drafted in 2026-10-01@08h41m13s779ms at boundary 38 with no private block while holding 4 private entries acquired before it (`payloads.jsonl:117`)
- 2026-10-01T12:26:43.415Z Belle was drafted in 2026-10-01@08h41m13s779ms at boundary 38 with no private block while holding 4 private entries acquired before it (`payloads.jsonl:118`)

### judge-fallback (5)

- 2026-10-01T12:15:21.589Z judge scene fell back (timeout) (`journal.jsonl:728`)
- 2026-10-01T12:15:23.540Z judge warden fell back (timeout) (`journal.jsonl:729`)
- 2026-10-01T12:18:22.471Z judge warden fell back (timeout) (`journal.jsonl:831`)
- 2026-10-01T12:22:59.251Z judge lore fell back (timeout) (`journal.jsonl:986`)
- 2026-10-01T12:22:59.259Z judge lore fell back (timeout) (`journal.jsonl:987`)

### save-lost (7)

- 2026-10-01T12:15:26.705Z save not confirmed (`journal.jsonl:730`)
- 2026-10-01T12:15:26.779Z save not confirmed (`journal.jsonl:731`)
- 2026-10-01T12:15:26.863Z save not confirmed (`journal.jsonl:732`)
- 2026-10-01T12:15:26.910Z save not confirmed (`journal.jsonl:733`)
- 2026-10-01T12:15:26.942Z save not confirmed (`journal.jsonl:734`)
- 2026-10-01T12:15:26.972Z save not confirmed (`journal.jsonl:735`)
- 2026-10-01T12:15:27.549Z save not confirmed (`journal.jsonl:736`)

### console-error (6)

- 2026-10-01T12:22:59.696Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:178`)
- 2026-10-01T12:22:59.703Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:179`)
- 2026-10-01T12:22:59.704Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:180`)
- 2026-10-01T12:22:59.881Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:181`)
- 2026-10-01T12:22:59.889Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:182`)
- 2026-10-01T12:23:00.208Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:183`)

### harness-error (1)

- - WARNING: the page restarted 3 time(s); captures between the last drain and each restart are UNKNOWN, not zero. (`payloads.log:76`)

## Draft register rows

| id | tier | severity | class | evidence | status | fix commit | eval | what |
|---|---|---|---|---|---|---|---|---|
| T0-?1 | T0 |  |  | `test/sessions/T0/T0-2-2/journal.jsonl:625` | draft |  |  | Away recap (away 1d) is right about where we are but too long: 8 open threads, mostly the same question reworded (approach from the ridge x2 - stale, we are at the gate; defenders' fear x2; get inside before sundown x3). 'Recently' only says 'You moved into Wendhope's Eastern Gate'; the story-so-far is cut off mid-word ('since the Gui...'); Status says 'Catching up' a day later. |
| T0-?2 | T0 |  |  | `test/sessions/T0/T0-2-2/journal.jsonl:1152` | draft |  |  | Dalan's reply (msg 67) ends with a leaked bracket: '[Scene direction: The first night on Wendhope's walls. The red fog rolls in from Needlehaven. The Screechers arrive... Some die. They bubble and fade. The fog thins by dawn.]' - stage directions and spoilers (Screechers, Needlehaven, how the night ends) shown to the player in chat. |
| T0-?3 | T0 |  | harness | `test/sessions/T0/T0-2-2/payloads.log:76` | draft |  |  | WARNING: the page restarted 3 time(s); captures between the last drain and each restart are UNKNOWN, not zero. |
| T0-?4 | T0 |  |  | `test/sessions/T0/T0-2-2/journal.jsonl:728` | draft |  |  | judge scene fell back (timeout) |
| T0-?5 | T0 |  |  | `test/sessions/T0/T0-2-2/journal.jsonl:729` | draft |  |  | judge warden fell back (timeout) |
| T0-?6 | T0 |  |  | `test/sessions/T0/T0-2-2/journal.jsonl:730` | draft |  |  | save not confirmed |
| T0-?7 | T0 |  |  | `test/sessions/T0/T0-2-2/journal.jsonl:731` | draft |  |  | save not confirmed |
| T0-?8 | T0 |  |  | `test/sessions/T0/T0-2-2/journal.jsonl:732` | draft |  |  | save not confirmed |
| T0-?9 | T0 |  |  | `test/sessions/T0/T0-2-2/journal.jsonl:733` | draft |  |  | save not confirmed |
| T0-?10 | T0 |  |  | `test/sessions/T0/T0-2-2/journal.jsonl:734` | draft |  |  | save not confirmed |
| T0-?11 | T0 |  |  | `test/sessions/T0/T0-2-2/journal.jsonl:735` | draft |  |  | save not confirmed |
| T0-?12 | T0 |  |  | `test/sessions/T0/T0-2-2/journal.jsonl:736` | draft |  |  | save not confirmed |
| T0-?13 | T0 |  |  | `test/sessions/T0/T0-2-2/journal.jsonl:831` | draft |  |  | judge warden fell back (timeout) |
| T0-?14 | T0 |  |  | `test/sessions/T0/T0-2-2/journal.jsonl:986` | draft |  |  | judge lore fell back (timeout) |
| T0-?15 | T0 |  |  | `test/sessions/T0/T0-2-2/journal.jsonl:987` | draft |  |  | judge lore fell back (timeout) |
| T0-?16 | T0 |  |  | `test/sessions/T0/T0-2-2/console.jsonl:178` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?17 | T0 |  |  | `test/sessions/T0/T0-2-2/console.jsonl:179` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?18 | T0 |  |  | `test/sessions/T0/T0-2-2/console.jsonl:180` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?19 | T0 |  |  | `test/sessions/T0/T0-2-2/console.jsonl:181` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?20 | T0 |  |  | `test/sessions/T0/T0-2-2/console.jsonl:182` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?21 | T0 |  |  | `test/sessions/T0/T0-2-2/console.jsonl:183` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T0-?22 | T0 |  |  | `test/sessions/T0/T0-2-2/payloads.jsonl:112` | draft |  |  | Belle was drafted in 2026-10-01@08h41m13s779ms at boundary 38 with no private block while holding 4 private entries acquired before it |
| T0-?23 | T0 |  |  | `test/sessions/T0/T0-2-2/payloads.jsonl:114` | draft |  |  | Belle was drafted in 2026-10-01@08h41m13s779ms at boundary 38 with no private block while holding 4 private entries acquired before it |
| T0-?24 | T0 |  |  | `test/sessions/T0/T0-2-2/payloads.jsonl:117` | draft |  |  | Belle was drafted in 2026-10-01@08h41m13s779ms at boundary 38 with no private block while holding 4 private entries acquired before it |
| T0-?25 | T0 |  |  | `test/sessions/T0/T0-2-2/payloads.jsonl:118` | draft |  |  | Belle was drafted in 2026-10-01@08h41m13s779ms at boundary 38 with no private block while holding 4 private entries acquired before it |

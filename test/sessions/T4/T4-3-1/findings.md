# Findings draft: T4-3

Session `test/sessions/T4/T4-3-1`. Draft rows for `docs/plans/v2.6/14-findings.md`; severity and class are decided in the review.

Private-block checks that could not be reconstructed (capture without chat, boundary or member identity): 43.

## Counts

- flags: 2
- stall: 3
- extraction-rejected: 0
- empty-private-block: 0
- lore-force-lost: 0
- lore-constant-missed: 0
- judge-fallback: 67
- save-lost: 0
- unexpected-jump: 0
- rollback: 0
- console-error: 6
- model-call-failure: 0
- model-defect: 0
- harness-error: 0

### By chat

- `2026-10-02@01h59m09s529ms`: judge-fallback 57, stall 2
- `(no chat)`: console-error 6
- `2026-10-02@01h58m58s371ms`: judge-fallback 4, stall 1
- `2026-10-02@03h01m11s737ms`: judge-fallback 6

## Judge health

- calls: 1001 (answered 934, busy 50, timeout 17, other fallbacks 0)
- busy rate: 5.0% (by use: memoryPairs 43, lore 7)
- a busy fallback was never sent: the lane's judge rate limit (or a TypeSafe 429 passed through) held it, and the consumer took its no-judge path

## Model defects

None detected.

## Flags

### 2026-10-02T05:40:27.312Z (message 60)

- note: Harness deviation (player error): turns 14-21 meant for chat one went to chat two; turn reopens the primary chat unless --chat is given. Chat two has 21 turns; chat one is played from here with --chat.
- evidence: `journal.jsonl:1204`
- context (event-time):
  - #57 Adolion Narrator: The party steps through the door to the adjoining tavern, the warmth of the hearth hitting them along with the smell of roasted meats and ale. The morning crowd is smaller than the night-before rush, with only a few early-risers nursing their morning drinks or planning their day's quests. *Fiana gla
  - #58 Dalan: "Coffee would be good, thank you." *He speaks softly, his gaze flickering briefly toward the window before settling back on the table.* "We should talk about how we're going to handle the exam. If the observer is going to be testing our synergy, we need to be clear about our roles." *He reaches down
  - #59 Max Nightriver: Dalan, I don't care what your tribe thinks. You're family to the Nightriver party.
  - **#60 Dalan: *The elf freezes, his fingers still resting on his bow's strap. For a long moment, he doesn't move or speak, his emerald eyes wide and searching Max's face. When he finally speaks, his voice is barely above a whisper, thick with something between disbelief and profound gratitude.* "Family..." *He br**

### 2026-10-02T06:11:48.858Z (message 2)

- note: clearStory check: marker flag in chat four before the story is cleared
- evidence: `journal.jsonl:2162`
- context (event-time):
  - #0 Adolion Narrator: The Guild hall in Aegis City has barely settled after the party's return when Vallie appears on the stairs with an announcement: the Guild will put you forward for the C-rank exam. Domas follows her with the terms in writing, and Ellie has already laid out the forms. Tobias watches from behind the c
  - #1 Max Nightriver: Put us down for the exam.
  - **#2 Ellie: "Right away!" She pulls the forms toward her with a quick, efficient motion, pen already in hand. "The C-rank promotion exam—I'll get you signed up for this season." Her blue eyes flick up briefly, taking in the party with a renewed interest before she focuses on the paperwork. "The interview is nex**

## Anomalies

### stall (3)

- 2026-10-02T05:05:53.109Z 10 boundaries without a transition at aegis-the-tavern while its exits were pending (`journal.jsonl:312`)
- 2026-10-02T05:38:00.245Z 10 boundaries without a transition at aegis-market-street while its exits were pending (`journal.jsonl:1102`)
- 2026-10-02T05:49:07.867Z 10 boundaries without a transition at aegis-the-tavern while its exits were pending (`journal.jsonl:1487`)

### judge-fallback (67)

- 2026-10-02T05:05:04.767Z judge lore fell back (busy) (`journal.jsonl:246`)
- 2026-10-02T05:05:04.767Z judge lore fell back (busy) (`journal.jsonl:247`)
- 2026-10-02T05:05:04.767Z judge lore fell back (busy) (`journal.jsonl:248`)
- 2026-10-02T05:05:04.767Z judge memoryPairs fell back (busy) (`journal.jsonl:249`)
- 2026-10-02T05:05:04.767Z judge memoryPairs fell back (busy) (`journal.jsonl:250`)
- 2026-10-02T05:05:04.767Z judge memoryPairs fell back (busy) (`journal.jsonl:251`)
- 2026-10-02T05:05:04.768Z judge memoryPairs fell back (busy) (`journal.jsonl:252`)
- 2026-10-02T05:05:04.768Z judge memoryPairs fell back (busy) (`journal.jsonl:253`)
- 2026-10-02T05:05:04.768Z judge memoryPairs fell back (busy) (`journal.jsonl:254`)
- 2026-10-02T05:05:04.768Z judge memoryPairs fell back (busy) (`journal.jsonl:255`)
- 2026-10-02T05:05:04.768Z judge memoryPairs fell back (busy) (`journal.jsonl:256`)
- 2026-10-02T05:05:04.768Z judge memoryPairs fell back (busy) (`journal.jsonl:257`)
- 2026-10-02T05:05:04.768Z judge memoryPairs fell back (busy) (`journal.jsonl:258`)
- 2026-10-02T05:05:04.768Z judge memoryPairs fell back (busy) (`journal.jsonl:259`)
- 2026-10-02T05:05:31.524Z judge lore fell back (busy) (`journal.jsonl:296`)
- 2026-10-02T05:05:31.524Z judge lore fell back (busy) (`journal.jsonl:297`)
- 2026-10-02T05:05:31.524Z judge lore fell back (busy) (`journal.jsonl:298`)
- 2026-10-02T05:05:31.524Z judge lore fell back (busy) (`journal.jsonl:299`)
- 2026-10-02T05:10:50.031Z judge lore fell back (timeout) (`journal.jsonl:415`)
- 2026-10-02T05:10:50.039Z judge lore fell back (timeout) (`journal.jsonl:416`)
- 2026-10-02T05:10:51.541Z judge lore fell back (timeout) (`journal.jsonl:417`)
- 2026-10-02T05:10:51.542Z judge lore fell back (timeout) (`journal.jsonl:418`)
- 2026-10-02T05:13:20.432Z judge lore fell back (timeout) (`journal.jsonl:476`)
- 2026-10-02T05:13:20.441Z judge lore fell back (timeout) (`journal.jsonl:477`)
- 2026-10-02T05:16:15.323Z judge scene fell back (timeout) (`journal.jsonl:523`)
- 2026-10-02T05:16:47.296Z judge lore fell back (timeout) (`journal.jsonl:542`)
- 2026-10-02T05:16:47.306Z judge lore fell back (timeout) (`journal.jsonl:543`)
- 2026-10-02T05:25:07.974Z judge memoryPairs fell back (busy) (`journal.jsonl:740`)
- 2026-10-02T05:25:07.976Z judge memoryPairs fell back (busy) (`journal.jsonl:741`)
- 2026-10-02T05:25:07.976Z judge memoryPairs fell back (busy) (`journal.jsonl:742`)
- 2026-10-02T05:38:03.669Z judge scene fell back (timeout) (`journal.jsonl:1105`)
- 2026-10-02T05:38:05.912Z judge typed fell back (timeout) (`journal.jsonl:1106`)
- 2026-10-02T05:38:07.674Z judge warden fell back (timeout) (`journal.jsonl:1107`)
- 2026-10-02T05:39:48.921Z judge memoryPairs fell back (busy) (`journal.jsonl:1145`)
- 2026-10-02T05:39:48.921Z judge memoryPairs fell back (busy) (`journal.jsonl:1146`)
- 2026-10-02T05:39:48.921Z judge memoryPairs fell back (busy) (`journal.jsonl:1147`)
- 2026-10-02T05:39:49.139Z judge memoryPairs fell back (busy) (`journal.jsonl:1149`)
- 2026-10-02T05:39:49.139Z judge memoryPairs fell back (busy) (`journal.jsonl:1150`)
- 2026-10-02T05:39:49.139Z judge memoryPairs fell back (busy) (`journal.jsonl:1151`)
- 2026-10-02T05:39:49.139Z judge memoryPairs fell back (busy) (`journal.jsonl:1152`)
- 2026-10-02T05:39:49.139Z judge memoryPairs fell back (busy) (`journal.jsonl:1153`)
- 2026-10-02T05:39:49.139Z judge memoryPairs fell back (busy) (`journal.jsonl:1154`)
- 2026-10-02T05:39:49.139Z judge memoryPairs fell back (busy) (`journal.jsonl:1155`)
- 2026-10-02T05:39:49.139Z judge memoryPairs fell back (busy) (`journal.jsonl:1156`)
- 2026-10-02T05:39:49.142Z judge memoryPairs fell back (busy) (`journal.jsonl:1157`)
- 2026-10-02T05:39:49.142Z judge memoryPairs fell back (busy) (`journal.jsonl:1158`)
- 2026-10-02T05:39:49.142Z judge memoryPairs fell back (busy) (`journal.jsonl:1159`)
- 2026-10-02T05:39:49.142Z judge memoryPairs fell back (busy) (`journal.jsonl:1160`)
- 2026-10-02T05:39:49.142Z judge memoryPairs fell back (busy) (`journal.jsonl:1161`)
- 2026-10-02T05:39:49.142Z judge memoryPairs fell back (busy) (`journal.jsonl:1162`)
- 2026-10-02T05:39:49.142Z judge memoryPairs fell back (busy) (`journal.jsonl:1163`)
- 2026-10-02T05:39:49.142Z judge memoryPairs fell back (busy) (`journal.jsonl:1164`)
- 2026-10-02T05:39:49.144Z judge memoryPairs fell back (busy) (`journal.jsonl:1165`)
- 2026-10-02T05:39:49.144Z judge memoryPairs fell back (busy) (`journal.jsonl:1166`)
- 2026-10-02T05:39:49.144Z judge memoryPairs fell back (busy) (`journal.jsonl:1167`)
- 2026-10-02T05:39:49.144Z judge memoryPairs fell back (busy) (`journal.jsonl:1168`)
- 2026-10-02T05:39:49.144Z judge memoryPairs fell back (busy) (`journal.jsonl:1169`)
- 2026-10-02T05:42:53.666Z judge lore fell back (timeout) (`journal.jsonl:1331`)
- 2026-10-02T05:42:53.681Z judge lore fell back (timeout) (`journal.jsonl:1332`)
- 2026-10-02T05:49:41.786Z judge scene fell back (timeout) (`journal.jsonl:1509`)
- 2026-10-02T05:54:58.352Z judge stall fell back (timeout) (`journal.jsonl:1614`)
- 2026-10-02T06:07:21.071Z judge scene fell back (timeout) (`journal.jsonl:2008`)
- 2026-10-02T06:08:09.090Z judge memoryPairs fell back (busy) (`journal.jsonl:2045`)
- 2026-10-02T06:08:09.090Z judge memoryPairs fell back (busy) (`journal.jsonl:2046`)
- 2026-10-02T06:08:09.116Z judge memoryPairs fell back (busy) (`journal.jsonl:2048`)
- 2026-10-02T06:08:09.116Z judge memoryPairs fell back (busy) (`journal.jsonl:2049`)
- 2026-10-02T06:08:09.117Z judge memoryPairs fell back (busy) (`journal.jsonl:2050`)

### console-error (6)

- 2026-10-02T05:05:04.774Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:16`)
- 2026-10-02T05:05:31.531Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:18`)
- 2026-10-02T05:25:07.974Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:52`)
- 2026-10-02T05:25:07.975Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:53`)
- 2026-10-02T05:39:48.922Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:76`)
- 2026-10-02T06:08:09.090Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:243`)

## Draft register rows

| id | tier | severity | class | evidence | status | fix commit | eval | what |
|---|---|---|---|---|---|---|---|---|
| T4-?1 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:1204` | draft |  |  | Harness deviation (player error): turns 14-21 meant for chat one went to chat two; turn reopens the primary chat unless --chat is given. Chat two has 21 turns; chat one is played from here with --chat. |
| T4-?2 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:2162` | draft |  |  | clearStory check: marker flag in chat four before the story is cleared |
| T4-?3 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:246` | draft |  |  | judge lore fell back (busy) |
| T4-?4 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:247` | draft |  |  | judge lore fell back (busy) |
| T4-?5 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:248` | draft |  |  | judge lore fell back (busy) |
| T4-?6 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:249` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?7 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:250` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?8 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:251` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?9 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:252` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?10 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:253` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?11 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:254` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?12 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:255` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?13 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:256` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?14 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:257` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?15 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:258` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?16 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:259` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?17 | T4 |  |  | `test/sessions/T4/T4-3-1/console.jsonl:16` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T4-?18 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:296` | draft |  |  | judge lore fell back (busy) |
| T4-?19 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:297` | draft |  |  | judge lore fell back (busy) |
| T4-?20 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:298` | draft |  |  | judge lore fell back (busy) |
| T4-?21 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:299` | draft |  |  | judge lore fell back (busy) |
| T4-?22 | T4 |  |  | `test/sessions/T4/T4-3-1/console.jsonl:18` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T4-?23 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:312` | draft |  |  | 10 boundaries without a transition at aegis-the-tavern while its exits were pending |
| T4-?24 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:415` | draft |  |  | judge lore fell back (timeout) |
| T4-?25 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:416` | draft |  |  | judge lore fell back (timeout) |
| T4-?26 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:417` | draft |  |  | judge lore fell back (timeout) |
| T4-?27 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:418` | draft |  |  | judge lore fell back (timeout) |
| T4-?28 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:476` | draft |  |  | judge lore fell back (timeout) |
| T4-?29 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:477` | draft |  |  | judge lore fell back (timeout) |
| T4-?30 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:523` | draft |  |  | judge scene fell back (timeout) |
| T4-?31 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:542` | draft |  |  | judge lore fell back (timeout) |
| T4-?32 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:543` | draft |  |  | judge lore fell back (timeout) |
| T4-?33 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:740` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?34 | T4 |  |  | `test/sessions/T4/T4-3-1/console.jsonl:52` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T4-?35 | T4 |  |  | `test/sessions/T4/T4-3-1/console.jsonl:53` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T4-?36 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:741` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?37 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:742` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?38 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:1102` | draft |  |  | 10 boundaries without a transition at aegis-market-street while its exits were pending |
| T4-?39 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:1105` | draft |  |  | judge scene fell back (timeout) |
| T4-?40 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:1106` | draft |  |  | judge typed fell back (timeout) |
| T4-?41 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:1107` | draft |  |  | judge warden fell back (timeout) |
| T4-?42 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:1145` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?43 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:1146` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?44 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:1147` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?45 | T4 |  |  | `test/sessions/T4/T4-3-1/console.jsonl:76` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T4-?46 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:1149` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?47 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:1150` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?48 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:1151` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?49 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:1152` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?50 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:1153` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?51 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:1154` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?52 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:1155` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?53 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:1156` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?54 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:1157` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?55 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:1158` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?56 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:1159` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?57 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:1160` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?58 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:1161` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?59 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:1162` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?60 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:1163` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?61 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:1164` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?62 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:1165` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?63 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:1166` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?64 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:1167` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?65 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:1168` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?66 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:1169` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?67 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:1331` | draft |  |  | judge lore fell back (timeout) |
| T4-?68 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:1332` | draft |  |  | judge lore fell back (timeout) |
| T4-?69 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:1487` | draft |  |  | 10 boundaries without a transition at aegis-the-tavern while its exits were pending |
| T4-?70 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:1509` | draft |  |  | judge scene fell back (timeout) |
| T4-?71 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:1614` | draft |  |  | judge stall fell back (timeout) |
| T4-?72 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:2008` | draft |  |  | judge scene fell back (timeout) |
| T4-?73 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:2045` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?74 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:2046` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?75 | T4 |  |  | `test/sessions/T4/T4-3-1/console.jsonl:243` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T4-?76 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:2048` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?77 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:2049` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?78 | T4 |  |  | `test/sessions/T4/T4-3-1/journal.jsonl:2050` | draft |  |  | judge memoryPairs fell back (busy) |

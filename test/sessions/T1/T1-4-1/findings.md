# Findings draft: T1-4

Session `test/sessions/T1/T1-4-1`. Draft rows for `docs/plans/v2.6/14-findings.md`; severity and class are decided in the review.

## Counts

- flags: 1
- stall: 2
- extraction-rejected: 16
- empty-private-block: 0
- lore-force-lost: 0
- lore-constant-missed: 0
- judge-fallback: 57
- save-lost: 0
- unexpected-jump: 0
- rollback: 0
- console-error: 9
- model-call-failure: 0
- model-defect: 0
- harness-error: 1

## Judge health

- calls: 405 (answered 348, busy 54, timeout 3, other fallbacks 0)
- busy rate: 13.3% (by use: memoryPairs 32, lore 8, typed 3, wardenLore 3, director 2, scene 2, warden 2, memoryVerify 1, curatorFilter 1)
- a busy fallback was never sent: the lane's judge rate limit (or a TypeSafe 429 passed through) held it, and the consumer took its no-judge path

## Model defects

None detected.

## Flags

### 2026-10-01T16:59:04.058Z (message 14)

- note: msg 12: I signed the register ('We sign under Honami's name.') and Honami confirms it (msg 14), but the story stays at Signing for the Tournament: east_entered=true read from my own line was held, 'no line the player wrote in the window shows the commitment' (journal.jsonl:313), although 'sign' is in both commit_evidence and the transition trigger.
- evidence: `journal.jsonl:367`
- context (event-time):
  - #11 Megumi: "A wise decision," she says with a smile that doesn't quite reach her eyes. She opens the register and begins to read, her voice clear and measured. "The Jiansho Tournament: Bouts end in submission, knockout, or ring-out. Ring-out is a victory if a contestant leaves the designated combat area. Submi
  - #12 Max Nightriver: We sign under Honami's name. Where do we fight?
  - #13 Megumi: "Where you fight?" She smiles sweetly, her fingers trailing along the spine of the book. "That's quite simple. You fight in the tournament grounds, of course. The first round is fought in the sparring courtyards, which are just across the way." *She points with a slender finger toward a section of t
  - **#14 Honami: "You're all set, Darling." She smiles as Max Nightriver signs, her tail curling around his ankle. "I'll take you to the notice board myself." *She leads them away from Megumi and through the crowds of curious students toward the board.***

## Anomalies

### stall (2)

- 2026-10-01T17:04:18.444Z 10 boundaries without a transition at east-jiansho-academy while its exits were pending (`journal.jsonl:476`)
- 2026-10-01T17:17:22.435Z 10 boundaries without a transition at east-the-rounds while its exits were pending (`journal.jsonl:849`)

### extraction-rejected (16)

- 2026-10-01T16:52:31.229Z 1 extraction line(s) rejected: DELTA q=location value="east_jiansho" evidence="We follow her up the hill and through the Academy gates." (evidence only in the player's line) (`journal.jsonl:164`)
- 2026-10-01T16:52:37.501Z 1 extraction line(s) rejected: DELTA q=location value="east_jiansho" evidence="We follow her up the hill and through the Academy gates." (evidence only in the player's line) (`journal.jsonl:175`)
- 2026-10-01T16:52:52.645Z 1 extraction line(s) rejected: DELTA q=location value="east_jiansho" evidence="We follow her up the hill and through the Academy gates." (evidence only in the player's line) (`journal.jsonl:194`)
- 2026-10-01T16:56:21.606Z 4 extraction line(s) rejected: DELTA q=<east_entered> value=false evidence="Shall we sign now?" (unknown quality); DELTA q=<east_refused_entry> value=false evidence="Read us the rules first, Council Head. Then we'll decide." (unknown quality); DELTA q=<location> value="east_jiansho" evidence="We follow her up the hill and through the Academy gates." (unknown quality) (`journal.jsonl:280`)
- 2026-10-01T17:00:13.928Z 1 extraction line(s) rejected: DELTA q=east_entered value=true evidence="You're all set, Darling." She smiles as Max Nightriver signs, her tail curling around his ankle. (unrecognized line) (`journal.jsonl:394`)
- 2026-10-01T17:01:08.240Z 2 extraction line(s) rejected: DELTA q=east_entered value=true evidence="You're all set, Darling." She smiles as Max Nightriver signs, her tail curling around his ankle. (unrecognized line); FACT importance=3 text="The party's names are signed on the Jiansho Tournament register under Honami's name." evidence="You're all set, Darling." She smiles as Max Nightriver signs, her tail curling around his ankle. (unrecognized line) (`journal.jsonl:427`)
- 2026-10-01T17:06:45.672Z 1 extraction line(s) rejected: DELTA q=east_odds value=null evidence="" (missing evidence) (`journal.jsonl:583`)
- 2026-10-01T17:07:59.918Z 1 extraction line(s) rejected: DELTA q=east_odds value=null evidence="A steward lights the first incense stick, and the noise of the stands drops to a hum." (invalid value) (`journal.jsonl:624`)
- 2026-10-01T17:10:33.755Z 1 extraction line(s) rejected: DELTA q=east_odds value=null evidence="A steward lights the first incense stick, and the noise of the stands drops to a hum." (invalid value) (`journal.jsonl:665`)
- 2026-10-01T17:12:25.031Z 1 extraction line(s) rejected: DELTA q=east_odds value=null evidence="" (missing evidence) (`journal.jsonl:733`)
- 2026-10-01T17:12:33.079Z 1 extraction line(s) rejected: DELTA q=east_odds value=null evidence="The crowd in the stands is murmuring, and the right monk's expression hasn't changed as he continues to face Max Nightriver and Belle." (invalid value) (`journal.jsonl:745`)
- 2026-10-01T17:14:04.127Z 2 extraction line(s) rejected: DELTA q=east_odds value=null evidence="" (missing evidence); DELTA q=east_through_rounds value=false evidence="" (missing evidence) (`journal.jsonl:771`)
- 2026-10-01T17:15:14.931Z 1 extraction line(s) rejected: DELTA q=east_odds value=null evidence="" (missing evidence) (`journal.jsonl:798`)
- 2026-10-01T17:21:30.246Z 1 extraction line(s) rejected: DELTA q=location value="east_arena" evidence="That night we go back to the empty arena." (evidence only in the player's line) (`journal.jsonl:971`)
- 2026-10-01T17:21:37.878Z 1 extraction line(s) rejected: DELTA q=location value="east_arena" evidence="That night we go back to the empty arena." (evidence only in the player's line) (`journal.jsonl:981`)
- 2026-10-01T17:21:44.183Z 1 extraction line(s) rejected: DELTA q=location value="east_arena" evidence="That night we go back to the empty arena." (evidence only in the player's line) (`journal.jsonl:989`)

### judge-fallback (57)

- 2026-10-01T16:52:10.874Z judge typed fell back (busy) (`journal.jsonl:119`)
- 2026-10-01T16:52:14.987Z judge memoryVerify fell back (busy) (`journal.jsonl:121`)
- 2026-10-01T16:52:15.965Z judge curatorFilter fell back (busy) (`journal.jsonl:128`)
- 2026-10-01T16:52:22.638Z judge director fell back (busy) (`journal.jsonl:135`)
- 2026-10-01T16:52:24.293Z judge lore fell back (busy) (`journal.jsonl:142`)
- 2026-10-01T16:52:24.293Z judge lore fell back (busy) (`journal.jsonl:143`)
- 2026-10-01T16:52:24.293Z judge lore fell back (busy) (`journal.jsonl:144`)
- 2026-10-01T16:52:25.943Z judge typed fell back (busy) (`journal.jsonl:147`)
- 2026-10-01T16:52:25.943Z judge scene fell back (busy) (`journal.jsonl:148`)
- 2026-10-01T16:52:25.943Z judge warden fell back (busy) (`journal.jsonl:149`)
- 2026-10-01T16:52:25.943Z judge wardenLore fell back (busy) (`journal.jsonl:150`)
- 2026-10-01T16:52:26.221Z judge scene fell back (busy) (`journal.jsonl:152`)
- 2026-10-01T16:52:49.159Z judge typed fell back (timeout) (`journal.jsonl:176`)
- 2026-10-01T16:58:28.124Z judge scene fell back (timeout) (`journal.jsonl:334`)
- 2026-10-01T16:58:28.236Z judge wardenLore fell back (busy) (`journal.jsonl:335`)
- 2026-10-01T16:58:28.236Z judge typed fell back (busy) (`journal.jsonl:336`)
- 2026-10-01T16:58:36.490Z judge memoryPairs fell back (busy) (`journal.jsonl:354`)
- 2026-10-01T16:58:36.491Z judge memoryPairs fell back (busy) (`journal.jsonl:355`)
- 2026-10-01T16:58:36.491Z judge memoryPairs fell back (busy) (`journal.jsonl:356`)
- 2026-10-01T16:58:36.495Z judge memoryPairs fell back (busy) (`journal.jsonl:357`)
- 2026-10-01T16:58:36.495Z judge memoryPairs fell back (busy) (`journal.jsonl:358`)
- 2026-10-01T16:58:36.495Z judge memoryPairs fell back (busy) (`journal.jsonl:359`)
- 2026-10-01T16:58:36.495Z judge memoryPairs fell back (busy) (`journal.jsonl:360`)
- 2026-10-01T16:58:36.495Z judge memoryPairs fell back (busy) (`journal.jsonl:361`)
- 2026-10-01T16:58:36.495Z judge memoryPairs fell back (busy) (`journal.jsonl:362`)
- 2026-10-01T16:58:36.495Z judge memoryPairs fell back (busy) (`journal.jsonl:363`)
- 2026-10-01T17:10:13.137Z judge scene fell back (timeout) (`journal.jsonl:636`)
- 2026-10-01T17:10:14.334Z judge warden fell back (busy) (`journal.jsonl:637`)
- 2026-10-01T17:10:14.335Z judge wardenLore fell back (busy) (`journal.jsonl:638`)
- 2026-10-01T17:10:41.152Z judge memoryPairs fell back (busy) (`journal.jsonl:682`)
- 2026-10-01T17:11:14.125Z judge memoryPairs fell back (busy) (`journal.jsonl:685`)
- 2026-10-01T17:11:14.125Z judge memoryPairs fell back (busy) (`journal.jsonl:686`)
- 2026-10-01T17:11:14.125Z judge memoryPairs fell back (busy) (`journal.jsonl:687`)
- 2026-10-01T17:11:14.125Z judge memoryPairs fell back (busy) (`journal.jsonl:688`)
- 2026-10-01T17:11:14.125Z judge memoryPairs fell back (busy) (`journal.jsonl:689`)
- 2026-10-01T17:11:14.125Z judge memoryPairs fell back (busy) (`journal.jsonl:690`)
- 2026-10-01T17:11:14.135Z judge memoryPairs fell back (busy) (`journal.jsonl:692`)
- 2026-10-01T17:11:14.135Z judge memoryPairs fell back (busy) (`journal.jsonl:693`)
- 2026-10-01T17:11:14.135Z judge memoryPairs fell back (busy) (`journal.jsonl:694`)
- 2026-10-01T17:11:14.135Z judge memoryPairs fell back (busy) (`journal.jsonl:695`)
- 2026-10-01T17:11:14.135Z judge memoryPairs fell back (busy) (`journal.jsonl:696`)
- 2026-10-01T17:11:14.135Z judge memoryPairs fell back (busy) (`journal.jsonl:697`)
- 2026-10-01T17:11:14.135Z judge memoryPairs fell back (busy) (`journal.jsonl:698`)
- 2026-10-01T17:11:14.135Z judge memoryPairs fell back (busy) (`journal.jsonl:699`)
- 2026-10-01T17:11:14.137Z judge memoryPairs fell back (busy) (`journal.jsonl:700`)
- 2026-10-01T17:11:14.137Z judge memoryPairs fell back (busy) (`journal.jsonl:701`)
- 2026-10-01T17:11:14.137Z judge memoryPairs fell back (busy) (`journal.jsonl:702`)
- 2026-10-01T17:11:14.137Z judge memoryPairs fell back (busy) (`journal.jsonl:703`)
- 2026-10-01T17:11:14.137Z judge memoryPairs fell back (busy) (`journal.jsonl:704`)
- 2026-10-01T17:11:14.137Z judge memoryPairs fell back (busy) (`journal.jsonl:705`)
- 2026-10-01T17:11:14.137Z judge memoryPairs fell back (busy) (`journal.jsonl:706`)
- 2026-10-01T17:11:31.987Z judge lore fell back (busy) (`journal.jsonl:711`)
- 2026-10-01T17:11:31.987Z judge lore fell back (busy) (`journal.jsonl:712`)
- 2026-10-01T17:11:31.987Z judge lore fell back (busy) (`journal.jsonl:713`)
- 2026-10-01T17:11:32.026Z judge director fell back (busy) (`journal.jsonl:715`)
- 2026-10-01T17:11:35.947Z judge lore fell back (busy) (`journal.jsonl:722`)
- 2026-10-01T17:11:35.948Z judge lore fell back (busy) (`journal.jsonl:723`)

### console-error (9)

- 2026-10-01T16:52:10.873Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:5`)
- 2026-10-01T16:58:28.236Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:101`)
- 2026-10-01T16:58:36.491Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:102`)
- 2026-10-01T16:58:36.492Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:103`)
- 2026-10-01T17:10:14.334Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:120`)
- 2026-10-01T17:10:41.152Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:122`)
- 2026-10-01T17:11:14.125Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:123`)
- 2026-10-01T17:11:31.993Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:124`)
- 2026-10-01T17:11:35.951Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:125`)

### harness-error (1)

- - WARNING: the page restarted 2 time(s); captures between the last drain and each restart are UNKNOWN, not zero. (`payloads.log:147`)

## Draft register rows

| id | tier | severity | class | evidence | status | fix commit | eval | what |
|---|---|---|---|---|---|---|---|---|
| T1-?1 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:367` | draft |  |  | msg 12: I signed the register ('We sign under Honami's name.') and Honami confirms it (msg 14), but the story stays at Signing for the Tournament: east_entered=true read from my own line was held, 'no line the player wrote in the window shows the commitment' (journal.jsonl:313), although 'sign' is in both commit_evidence and the transition trigger. |
| T1-?2 | T1 |  | harness | `test/sessions/T1/T1-4-1/payloads.log:147` | draft |  |  | WARNING: the page restarted 2 time(s); captures between the last drain and each restart are UNKNOWN, not zero. |
| T1-?3 | T1 |  |  | `test/sessions/T1/T1-4-1/console.jsonl:5` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?4 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:119` | draft |  |  | judge typed fell back (busy) |
| T1-?5 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:121` | draft |  |  | judge memoryVerify fell back (busy) |
| T1-?6 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:128` | draft |  |  | judge curatorFilter fell back (busy) |
| T1-?7 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:135` | draft |  |  | judge director fell back (busy) |
| T1-?8 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:142` | draft |  |  | judge lore fell back (busy) |
| T1-?9 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:143` | draft |  |  | judge lore fell back (busy) |
| T1-?10 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:144` | draft |  |  | judge lore fell back (busy) |
| T1-?11 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:147` | draft |  |  | judge typed fell back (busy) |
| T1-?12 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:148` | draft |  |  | judge scene fell back (busy) |
| T1-?13 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:149` | draft |  |  | judge warden fell back (busy) |
| T1-?14 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:150` | draft |  |  | judge wardenLore fell back (busy) |
| T1-?15 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:152` | draft |  |  | judge scene fell back (busy) |
| T1-?16 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:164` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="east_jiansho" evidence="We follow her up the hill and through the Academy gates." (evidence only in the player's line) |
| T1-?17 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:175` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="east_jiansho" evidence="We follow her up the hill and through the Academy gates." (evidence only in the player's line) |
| T1-?18 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:176` | draft |  |  | judge typed fell back (timeout) |
| T1-?19 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:194` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="east_jiansho" evidence="We follow her up the hill and through the Academy gates." (evidence only in the player's line) |
| T1-?20 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:280` | draft |  |  | 4 extraction line(s) rejected: DELTA q=<east_entered> value=false evidence="Shall we sign now?" (unknown quality); DELTA q=<east_refused_entry> value=false evidence="Read us the rules first, Council Head. Then we'll decide." (unknown quality); DELTA q=<location> value="east_jiansho" evidence="We follow her up the hill and through the Academy gates." (unknown quality) |
| T1-?21 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:334` | draft |  |  | judge scene fell back (timeout) |
| T1-?22 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:335` | draft |  |  | judge wardenLore fell back (busy) |
| T1-?23 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:336` | draft |  |  | judge typed fell back (busy) |
| T1-?24 | T1 |  |  | `test/sessions/T1/T1-4-1/console.jsonl:101` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?25 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:354` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?26 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:355` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?27 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:356` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?28 | T1 |  |  | `test/sessions/T1/T1-4-1/console.jsonl:102` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?29 | T1 |  |  | `test/sessions/T1/T1-4-1/console.jsonl:103` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?30 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:357` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?31 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:358` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?32 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:359` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?33 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:360` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?34 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:361` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?35 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:362` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?36 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:363` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?37 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:394` | draft |  |  | 1 extraction line(s) rejected: DELTA q=east_entered value=true evidence="You're all set, Darling." She smiles as Max Nightriver signs, her tail curling around his ankle. (unrecognized line) |
| T1-?38 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:427` | draft |  |  | 2 extraction line(s) rejected: DELTA q=east_entered value=true evidence="You're all set, Darling." She smiles as Max Nightriver signs, her tail curling around his ankle. (unrecognized line); FACT importance=3 text="The party's names are signed on the Jiansho Tournament register under Honami's name." evidence="You're all set, Darling." She smiles as Max Nightriver signs, her tail curling around his ankle. (unrecognized line) |
| T1-?39 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:476` | draft |  |  | 10 boundaries without a transition at east-jiansho-academy while its exits were pending |
| T1-?40 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:583` | draft |  |  | 1 extraction line(s) rejected: DELTA q=east_odds value=null evidence="" (missing evidence) |
| T1-?41 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:624` | draft |  |  | 1 extraction line(s) rejected: DELTA q=east_odds value=null evidence="A steward lights the first incense stick, and the noise of the stands drops to a hum." (invalid value) |
| T1-?42 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:636` | draft |  |  | judge scene fell back (timeout) |
| T1-?43 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:637` | draft |  |  | judge warden fell back (busy) |
| T1-?44 | T1 |  |  | `test/sessions/T1/T1-4-1/console.jsonl:120` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?45 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:638` | draft |  |  | judge wardenLore fell back (busy) |
| T1-?46 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:665` | draft |  |  | 1 extraction line(s) rejected: DELTA q=east_odds value=null evidence="A steward lights the first incense stick, and the noise of the stands drops to a hum." (invalid value) |
| T1-?47 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:682` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?48 | T1 |  |  | `test/sessions/T1/T1-4-1/console.jsonl:122` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?49 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:685` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?50 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:686` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?51 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:687` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?52 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:688` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?53 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:689` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?54 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:690` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?55 | T1 |  |  | `test/sessions/T1/T1-4-1/console.jsonl:123` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?56 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:692` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?57 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:693` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?58 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:694` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?59 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:695` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?60 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:696` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?61 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:697` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?62 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:698` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?63 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:699` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?64 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:700` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?65 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:701` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?66 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:702` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?67 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:703` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?68 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:704` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?69 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:705` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?70 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:706` | draft |  |  | judge memoryPairs fell back (busy) |
| T1-?71 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:711` | draft |  |  | judge lore fell back (busy) |
| T1-?72 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:712` | draft |  |  | judge lore fell back (busy) |
| T1-?73 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:713` | draft |  |  | judge lore fell back (busy) |
| T1-?74 | T1 |  |  | `test/sessions/T1/T1-4-1/console.jsonl:124` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?75 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:715` | draft |  |  | judge director fell back (busy) |
| T1-?76 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:722` | draft |  |  | judge lore fell back (busy) |
| T1-?77 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:723` | draft |  |  | judge lore fell back (busy) |
| T1-?78 | T1 |  |  | `test/sessions/T1/T1-4-1/console.jsonl:125` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T1-?79 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:733` | draft |  |  | 1 extraction line(s) rejected: DELTA q=east_odds value=null evidence="" (missing evidence) |
| T1-?80 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:745` | draft |  |  | 1 extraction line(s) rejected: DELTA q=east_odds value=null evidence="The crowd in the stands is murmuring, and the right monk's expression hasn't changed as he continues to face Max Nightriver and Belle." (invalid value) |
| T1-?81 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:771` | draft |  |  | 2 extraction line(s) rejected: DELTA q=east_odds value=null evidence="" (missing evidence); DELTA q=east_through_rounds value=false evidence="" (missing evidence) |
| T1-?82 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:798` | draft |  |  | 1 extraction line(s) rejected: DELTA q=east_odds value=null evidence="" (missing evidence) |
| T1-?83 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:849` | draft |  |  | 10 boundaries without a transition at east-the-rounds while its exits were pending |
| T1-?84 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:971` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="east_arena" evidence="That night we go back to the empty arena." (evidence only in the player's line) |
| T1-?85 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:981` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="east_arena" evidence="That night we go back to the empty arena." (evidence only in the player's line) |
| T1-?86 | T1 |  |  | `test/sessions/T1/T1-4-1/journal.jsonl:989` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="east_arena" evidence="That night we go back to the empty arena." (evidence only in the player's line) |

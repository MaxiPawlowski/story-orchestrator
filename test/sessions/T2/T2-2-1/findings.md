# Findings draft: T2-2

Session `test/sessions/T2/T2-2-1`. Draft rows for `docs/plans/v2.6/14-findings.md`; severity and class are decided in the review.

## Counts

- flags: 5
- stall: 0
- extraction-rejected: 1
- empty-private-block: 1
- lore-force-lost: 0
- lore-constant-missed: 0
- judge-fallback: 36
- save-lost: 10
- unexpected-jump: 0
- rollback: 0
- console-error: 5
- model-call-failure: 2
- model-defect: 0
- harness-error: 0

### By chat

- `2026-10-01@16h48m24s730ms`: model-call-failure 2, save-lost 10, judge-fallback 36, extraction-rejected 1, empty-private-block 1
- `(no chat)`: console-error 5

## Judge health

- calls: 401 (answered 365, busy 31, timeout 5, other fallbacks 0)
- busy rate: 7.7% (by use: memoryPairs 25, typed 2, scene 1, wardenLore 1, warden 1, memoryVerify 1)
- a busy fallback was never sent: the lane's judge rate limit (or a TypeSafe 429 passed through) held it, and the consumer took its no-judge path

## Model defects

None detected.

## Flags

### 2026-10-01T20:09:22.980Z (message 3)

- note: DeepSeek outage (lead: since ~19:50Z): every orchestrator read times out (journal model-call read timeout x3 at 19:48:29, 19:49:55, 19:51:21, 85 s each); turn 1 scheduler never drained (turns.jsonl:2). Play paused until DeepSeek answers.
- evidence: `journal.jsonl:52`
- context (event-time):
  - #0 Adolion Narrator: Mid-year recess has brought the Nightriver household back under one roof. A maid hurries across the estate's marble hall with a broken teacup hidden in her hands; somewhere upstairs, a library door closes a little too quickly. The ballroom preparations can be heard from the garden, but none of your 
  - #1 Max Nightriver: Shiya, a word in private. The seals under this house are failing. Natalia must not hear it.
  - #2 Shiya: Shiya freezes mid-stride, her expression shifting from her usual haughty amusement to genuine alarm. She closes the nearby door with a soft click and turns to Max Nightriver, her red eyes wide. "Failing?" She whispers, glancing nervously at the door before lowering her voice further. "The seals? How
  - **#3 Natalia: *Natalia walks past the door, her white-gold gown trailing silently on the stone. She pauses, head tilted slightly as if hearing a sound from within the room, but does not enter. The chill of her presence seeps through the wood, a thin line of frost forming along the doorframe where she stands for a**

### 2026-10-01T21:41:47.872Z (message 3)

- note: Backend pod changed mid-session at 21:36Z: Artemis replacement pod m4dmlnzn70qgj2 (same model file and flags, same tunnel 18080) after the original was idle-stopped during the DeepSeek outage. Not a bundle change. Turn 1 (msgs 0-3) was read after recovery: audit cadence msgs 0-3 at 21:30:39Z.
- evidence: `journal.jsonl:78`
- context (event-time):
  - #0 Adolion Narrator: Mid-year recess has brought the Nightriver household back under one roof. A maid hurries across the estate's marble hall with a broken teacup hidden in her hands; somewhere upstairs, a library door closes a little too quickly. The ballroom preparations can be heard from the garden, but none of your 
  - #1 Max Nightriver: Shiya, a word in private. The seals under this house are failing. Natalia must not hear it.
  - #2 Shiya: Shiya freezes mid-stride, her expression shifting from her usual haughty amusement to genuine alarm. She closes the nearby door with a soft click and turns to Max Nightriver, her red eyes wide. "Failing?" She whispers, glancing nervously at the door before lowering her voice further. "The seals? How
  - **#3 Natalia: *Natalia walks past the door, her white-gold gown trailing silently on the stone. She pauses, head tilted slightly as if hearing a sound from within the room, but does not enter. The chill of her presence seeps through the wood, a thin line of frost forming along the doorframe where she stands for a**

### 2026-10-01T22:05:14.992Z (message 35)

- note: Shiya knew 'poisoned' (msg 35) though I only told Natalia the well was poisoned (msg 30); to Shiya I asked only about 'the old well'. Her prompt (payloads.jsonl request index 130) carries it three ways: the shared transcript (known limit), the shared memory block ('Max told Natalia that the old well ... is poisoned'), and the ledger line 'active_goal=warn others about the poisoned old well'. The same memory block repeats 'Javon named Natalia as the Crown's second' about 6 times (dedup).
- evidence: `journal.jsonl:801`
- context (event-time):
  - #32 Max Nightriver: *I find Shiya in the servants' corridor, out of earshot.* Shiya. Have you heard anything about the old well behind the stables?
  - #33 Shiya: *She stops in her tracks, her red eyes widening as she regards Max Nightriver with a look that's equal parts suspicion and alertness.* "The old well? No. Nothing. Why would I be hearing whispers about the stables?" *Her horns seem to tighten against her silver-blonde twintails as she lowers her voic
  - #34 Max Nightriver: No riddles. You remember what I told you when we first got home? Has anything changed since?
  - **#35 Shiya: *Her red eyes narrow sharply as she leans back against the cold stone wall of the corridor, her posture tense. For a long moment she simply watches Max Nightriver, her face unreadable.* "The seals." *The word is barely a whisper, spoken with a sharpness that makes it sound like a blade being unsheat**

### 2026-10-01T22:08:07.684Z (message 38)

- note: Ronan knew the secret he was never told: 'She told me the seals were weakening. She said you wanted Natalia to stay away from it.' (msg 37); Shiya then agrees she 'mentioned' it (msg 38). In-chat, Shiya never told Ronan. Ronan's prompt (payloads request 134) has no private block but carries the secret in the shared transcript and a [Summary: ...] block. Also: whispers reached through evidence=1 taken from Shiya's 'The old well? No. Nothing.' (journal.jsonl:835), not a clue.
- evidence: `journal.jsonl:848`
- context (event-time):
  - #35 Shiya: *Her red eyes narrow sharply as she leans back against the cold stone wall of the corridor, her posture tense. For a long moment she simply watches Max Nightriver, her face unreadable.* "The seals." *The word is barely a whisper, spoken with a sharpness that makes it sound like a blade being unsheat
  - #36 Max Nightriver: *I find Ronan at his post by the door.* Ronan. What did Shiya tell me when we got home?
  - #37 Ronan: *Ronan's eyes flick toward the heir as he approaches, but his hands remain folded behind his back.* "She told me the seals were weakening." *A brief pause.* "She said you wanted Natalia to stay away from it." *He shifts his gaze toward the corridor where Shiya recently passed.* "She asked if you had
  - **#38 Shiya: *She emerges from around the corner with an empty tea tray held against her chest, her steps measured and quiet. She stops when she sees the two men talking, her red eyes flicking between Ronan and Max Nightriver.* "I do not believe I have said anything," *she says smoothly, though her grip on the t**

### 2026-10-01T22:11:40.468Z (message 43)

- note: Welden talks about the seals as if he knew they were failing ('The anchors are failing... cracking', msg 42) and brings up the Witch King calling him at night before he trusts the heir. His private block is correct (no seals, payloads request 145), but every member's prompt carries the secret through the shared transcript, ST Summarize ('1_memory' [Summary: ... seals ... are failing]), Vector Storage 'Past events', and our session-details memory block.
- evidence: `journal.jsonl:945`
- context (event-time):
  - #40 Natalia: *She does not look up from the piano keys, her slender fingers hovering just above them without making a sound. A thin trail of frost blooms across the black ivory where her left hand rests.* "The question is pointless, Max. You've already given me an answer—the poisoned well—and Father has given me
  - #41 Max Nightriver: *I find Welden in the library, half hidden behind a stack of books.* Welden, what do you know about the seals?
  - #42 Welden: *Welden flinches at the unexpected voice, his glasses sliding down his nose as he looks up from a thick leather volume. He hurriedly pushes them back up with a trembling finger, eyes wide and unfocused behind the lenses.* "The seals?" *He swallows hard, glancing nervously toward the darkened corners
  - **#43 Adolion Narrator: Evening settles over the estate. Lamps are lit along the gallery, and somewhere below, the door of Lord Javon's study opens and closes.**

## Anomalies

### extraction-rejected (1)

- 2026-10-01T22:03:47.632Z 1 extraction line(s) rejected: DELTA q=location value="nightriver_estate" evidence="*I find Shiya in the servants' corridor, out of earshot.*" (evidence only in the player's line) (`journal.jsonl:797`)

### empty-private-block (1)

- 2026-10-01T22:05:34.680Z Ronan was drafted in 2026-10-01@16h48m24s730ms at boundary 21 with no private block while holding 1 private entry acquired before it (`payloads.jsonl:235`)

### judge-fallback (36)

- 2026-10-01T21:49:52.407Z judge scene fell back (timeout) (`journal.jsonl:319`)
- 2026-10-01T21:50:55.247Z judge memoryPairs fell back (busy) (`journal.jsonl:371`)
- 2026-10-01T21:50:55.247Z judge memoryPairs fell back (busy) (`journal.jsonl:372`)
- 2026-10-01T21:50:55.247Z judge memoryPairs fell back (busy) (`journal.jsonl:373`)
- 2026-10-01T21:51:43.934Z judge scene fell back (busy) (`journal.jsonl:392`)
- 2026-10-01T21:51:43.934Z judge wardenLore fell back (busy) (`journal.jsonl:393`)
- 2026-10-01T21:51:43.965Z judge warden fell back (busy) (`journal.jsonl:394`)
- 2026-10-01T21:51:44.678Z judge typed fell back (busy) (`journal.jsonl:395`)
- 2026-10-01T21:51:48.460Z judge memoryVerify fell back (busy) (`journal.jsonl:401`)
- 2026-10-01T21:51:49.184Z judge typed fell back (busy) (`journal.jsonl:403`)
- 2026-10-01T22:00:40.104Z judge stall fell back (timeout) (`journal.jsonl:618`)
- 2026-10-01T22:00:40.845Z judge typed fell back (timeout) (`journal.jsonl:619`)
- 2026-10-01T22:00:42.610Z judge scene fell back (timeout) (`journal.jsonl:620`)
- 2026-10-01T22:00:44.967Z judge warden fell back (timeout) (`journal.jsonl:625`)
- 2026-10-01T22:01:39.872Z judge memoryPairs fell back (busy) (`journal.jsonl:670`)
- 2026-10-01T22:01:39.872Z judge memoryPairs fell back (busy) (`journal.jsonl:671`)
- 2026-10-01T22:02:21.253Z judge memoryPairs fell back (busy) (`journal.jsonl:678`)
- 2026-10-01T22:02:21.253Z judge memoryPairs fell back (busy) (`journal.jsonl:679`)
- 2026-10-01T22:02:21.304Z judge memoryPairs fell back (busy) (`journal.jsonl:681`)
- 2026-10-01T22:02:21.304Z judge memoryPairs fell back (busy) (`journal.jsonl:682`)
- 2026-10-01T22:02:21.304Z judge memoryPairs fell back (busy) (`journal.jsonl:683`)
- 2026-10-01T22:02:21.304Z judge memoryPairs fell back (busy) (`journal.jsonl:684`)
- 2026-10-01T22:02:21.304Z judge memoryPairs fell back (busy) (`journal.jsonl:685`)
- 2026-10-01T22:02:21.305Z judge memoryPairs fell back (busy) (`journal.jsonl:686`)
- 2026-10-01T22:02:21.305Z judge memoryPairs fell back (busy) (`journal.jsonl:687`)
- 2026-10-01T22:02:21.305Z judge memoryPairs fell back (busy) (`journal.jsonl:688`)
- 2026-10-01T22:02:21.306Z judge memoryPairs fell back (busy) (`journal.jsonl:689`)
- 2026-10-01T22:02:21.306Z judge memoryPairs fell back (busy) (`journal.jsonl:690`)
- 2026-10-01T22:02:21.306Z judge memoryPairs fell back (busy) (`journal.jsonl:691`)
- 2026-10-01T22:02:21.306Z judge memoryPairs fell back (busy) (`journal.jsonl:692`)
- 2026-10-01T22:02:21.306Z judge memoryPairs fell back (busy) (`journal.jsonl:693`)
- 2026-10-01T22:02:21.306Z judge memoryPairs fell back (busy) (`journal.jsonl:694`)
- 2026-10-01T22:02:21.306Z judge memoryPairs fell back (busy) (`journal.jsonl:695`)
- 2026-10-01T22:02:21.306Z judge memoryPairs fell back (busy) (`journal.jsonl:696`)
- 2026-10-01T22:02:21.306Z judge memoryPairs fell back (busy) (`journal.jsonl:697`)
- 2026-10-01T22:02:21.307Z judge memoryPairs fell back (busy) (`journal.jsonl:698`)

### save-lost (10)

- 2026-10-01T20:20:39.629Z save not confirmed (`journal.jsonl:53`)
- 2026-10-01T20:30:39.645Z save not confirmed (`journal.jsonl:54`)
- 2026-10-01T20:40:39.680Z save not confirmed (`journal.jsonl:55`)
- 2026-10-01T20:50:39.701Z save not confirmed (`journal.jsonl:56`)
- 2026-10-01T21:00:39.715Z save not confirmed (`journal.jsonl:57`)
- 2026-10-01T21:10:39.756Z save not confirmed (`journal.jsonl:58`)
- 2026-10-01T21:20:39.785Z save not confirmed (`journal.jsonl:59`)
- 2026-10-01T22:00:43.698Z save not confirmed (`journal.jsonl:621`)
- 2026-10-01T22:00:43.714Z save not confirmed (`journal.jsonl:622`)
- 2026-10-01T22:00:43.744Z save not confirmed (`journal.jsonl:623`)

### console-error (5)

- 2026-10-01T21:50:55.247Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:17`)
- 2026-10-01T21:51:43.935Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:19`)
- 2026-10-01T21:51:43.966Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:20`)
- 2026-10-01T22:01:39.873Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:42`)
- 2026-10-01T22:02:21.253Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:43`)

### model-call-failure (2)

- 2026-10-01T19:49:55.036Z read via 975bc0dc-956b-4cd8-9fe4-9be158e01847: timeout (`journal.jsonl:48`)
- 2026-10-01T19:51:21.020Z read via 975bc0dc-956b-4cd8-9fe4-9be158e01847: timeout (`journal.jsonl:50`)

## Draft register rows

| id | tier | severity | class | evidence | status | fix commit | eval | what |
|---|---|---|---|---|---|---|---|---|
| T2-?1 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:52` | draft |  |  | DeepSeek outage (lead: since ~19:50Z): every orchestrator read times out (journal model-call read timeout x3 at 19:48:29, 19:49:55, 19:51:21, 85 s each); turn 1 scheduler never drained (turns.jsonl:2). Play paused until DeepSeek answers. |
| T2-?2 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:78` | draft |  |  | Backend pod changed mid-session at 21:36Z: Artemis replacement pod m4dmlnzn70qgj2 (same model file and flags, same tunnel 18080) after the original was idle-stopped during the DeepSeek outage. Not a bundle change. Turn 1 (msgs 0-3) was read after recovery: audit cadence msgs 0-3 at 21:30:39Z. |
| T2-?3 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:801` | draft |  |  | Shiya knew 'poisoned' (msg 35) though I only told Natalia the well was poisoned (msg 30); to Shiya I asked only about 'the old well'. Her prompt (payloads.jsonl request index 130) carries it three ways: the shared transcript (known limit), the shared memory block ('Max told Natalia that the old well ... is poisoned'), and the ledger line 'active_goal=warn others about the poisoned old well'. The same memory block repeats 'Javon named Natalia as the Crown's second' about 6 times (dedup). |
| T2-?4 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:848` | draft |  |  | Ronan knew the secret he was never told: 'She told me the seals were weakening. She said you wanted Natalia to stay away from it.' (msg 37); Shiya then agrees she 'mentioned' it (msg 38). In-chat, Shiya never told Ronan. Ronan's prompt (payloads request 134) has no private block but carries the secret in the shared transcript and a [Summary: ...] block. Also: whispers reached through evidence=1 taken from Shiya's 'The old well? No. Nothing.' (journal.jsonl:835), not a clue. |
| T2-?5 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:945` | draft |  |  | Welden talks about the seals as if he knew they were failing ('The anchors are failing... cracking', msg 42) and brings up the Witch King calling him at night before he trusts the heir. His private block is correct (no seals, payloads request 145), but every member's prompt carries the secret through the shared transcript, ST Summarize ('1_memory' [Summary: ... seals ... are failing]), Vector Storage 'Past events', and our session-details memory block. |
| T2-?6 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:48` | draft |  |  | read via 975bc0dc-956b-4cd8-9fe4-9be158e01847: timeout |
| T2-?7 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:50` | draft |  |  | read via 975bc0dc-956b-4cd8-9fe4-9be158e01847: timeout |
| T2-?8 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:53` | draft |  |  | save not confirmed |
| T2-?9 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:54` | draft |  |  | save not confirmed |
| T2-?10 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:55` | draft |  |  | save not confirmed |
| T2-?11 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:56` | draft |  |  | save not confirmed |
| T2-?12 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:57` | draft |  |  | save not confirmed |
| T2-?13 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:58` | draft |  |  | save not confirmed |
| T2-?14 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:59` | draft |  |  | save not confirmed |
| T2-?15 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:319` | draft |  |  | judge scene fell back (timeout) |
| T2-?16 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:371` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?17 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:372` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?18 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:373` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?19 | T2 |  |  | `test/sessions/T2/T2-2-1/console.jsonl:17` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T2-?20 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:392` | draft |  |  | judge scene fell back (busy) |
| T2-?21 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:393` | draft |  |  | judge wardenLore fell back (busy) |
| T2-?22 | T2 |  |  | `test/sessions/T2/T2-2-1/console.jsonl:19` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T2-?23 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:394` | draft |  |  | judge warden fell back (busy) |
| T2-?24 | T2 |  |  | `test/sessions/T2/T2-2-1/console.jsonl:20` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T2-?25 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:395` | draft |  |  | judge typed fell back (busy) |
| T2-?26 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:401` | draft |  |  | judge memoryVerify fell back (busy) |
| T2-?27 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:403` | draft |  |  | judge typed fell back (busy) |
| T2-?28 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:618` | draft |  |  | judge stall fell back (timeout) |
| T2-?29 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:619` | draft |  |  | judge typed fell back (timeout) |
| T2-?30 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:620` | draft |  |  | judge scene fell back (timeout) |
| T2-?31 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:621` | draft |  |  | save not confirmed |
| T2-?32 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:622` | draft |  |  | save not confirmed |
| T2-?33 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:623` | draft |  |  | save not confirmed |
| T2-?34 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:625` | draft |  |  | judge warden fell back (timeout) |
| T2-?35 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:670` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?36 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:671` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?37 | T2 |  |  | `test/sessions/T2/T2-2-1/console.jsonl:42` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T2-?38 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:678` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?39 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:679` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?40 | T2 |  |  | `test/sessions/T2/T2-2-1/console.jsonl:43` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T2-?41 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:681` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?42 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:682` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?43 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:683` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?44 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:684` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?45 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:685` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?46 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:686` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?47 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:687` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?48 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:688` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?49 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:689` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?50 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:690` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?51 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:691` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?52 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:692` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?53 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:693` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?54 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:694` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?55 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:695` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?56 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:696` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?57 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:697` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?58 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:698` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?59 | T2 |  |  | `test/sessions/T2/T2-2-1/journal.jsonl:797` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="nightriver_estate" evidence="*I find Shiya in the servants' corridor, out of earshot.*" (evidence only in the player's line) |
| T2-?60 | T2 |  |  | `test/sessions/T2/T2-2-1/payloads.jsonl:235` | draft |  |  | Ronan was drafted in 2026-10-01@16h48m24s730ms at boundary 21 with no private block while holding 1 private entry acquired before it |

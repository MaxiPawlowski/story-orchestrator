# Findings draft: T2-6

Session `test/sessions/T2/T2-6-1`. Draft rows for `docs/plans/v2.6/14-findings.md`; severity and class are decided in the review.

## Counts

- flags: 3
- stall: 2
- extraction-rejected: 2
- empty-private-block: 2
- lore-force-lost: 0
- lore-constant-missed: 0
- judge-fallback: 9
- save-lost: 0
- unexpected-jump: 2
- rollback: 0
- console-error: 1
- model-call-failure: 3
- model-defect: 0
- harness-error: 0

### By chat

- `2026-10-01@16h48m27s720ms`: model-call-failure 3, judge-fallback 1, stall 1, extraction-rejected 2, unexpected-jump 2
- `2026-10-01@16h48m39s936ms`: empty-private-block 2, judge-fallback 8, stall 1
- `(no chat)`: console-error 1

## Judge health

- calls: 413 (answered 404, busy 7, timeout 2, other fallbacks 0)
- busy rate: 1.7% (by use: memoryPairs 7)
- a busy fallback was never sent: the lane's judge rate limit (or a TypeSafe 429 passed through) held it, and the consumer took its no-judge path

## Model defects

None detected.

## Flags

### 2026-10-01T20:01:38.878Z (message 0)

- note: Outage: DeepSeek chat completions hang since ~19:50Z (orchestrator passes abort; memory probe timed out). Turn 1 (chat A, msg 1-2) affected: scheduler queue stuck at depth 1 for 600 s, pipeline stalled-rechecking. Play paused until DeepSeek answers.
- evidence: `journal.jsonl:78`
- context (event-time):
  - **#0 Adolion Narrator: You came to Aegis City to make a name with a blade, a bow or a spell, and three days ago you signed the Adventurers' Guild register to do it. Your Guild badge is new, your purse is light, and you have no party yet. The Guild sends no one out alone.  Today the hall is loud enough to be heard from the**

### 2026-10-01T21:36:15.765Z (message 0)

- note: Backend note: the Artemis pod was replaced mid-session (21:36Z, new pod m4dmlnzn70qgj2, same model file TheDrummer_Artemis-31B-v1.1-Q4_K_M.gguf and flags, tunnel 127.0.0.1:18080). Not a bundle change. Resuming play.
- evidence: `journal.jsonl:91`
- context (event-time):
  - **#0 Adolion Narrator: You came to Aegis City to make a name with a blade, a bow or a spell, and three days ago you signed the Adventurers' Guild register to do it. Your Guild badge is new, your purse is light, and you have no party yet. The Guild sends no one out alone.  Today the hall is loud enough to be heard from the**

### 2026-10-01T21:42:29.473Z (message 5)

- note: Chat A: the 8 deltas queued at 21:36:52 (path=wendhope, party_name=The Red Hands, location=north_road...) were never applied: I switched to chat B before chat A's next boundary, and boundaries 4-6 in chat A applied nothing. The re-read (msgs 2-9) no longer contains my acceptance (msg 1), so path=wendhope is held by the commit guard and chat A is stuck at The Guild Hall while riding north. Also on reopening chat A the journal shows 'Following Who Is Looking for a Party' (chat B's checkpoint) for chat A.
- evidence: `journal.jsonl:319`
- context (event-time):
  - #2 Adolion Narrator: The Guild tavern is warm and loud, smelling of ale and roasted meat. At a corner table, an older dwarf in stained leather laughs too loudly at a joke someone else has forgotten, spilling mead down his braided beard. Near the hearth, a halfling fiddles with a tangle of black-powder fuses while anothe
  - #3 Max Nightriver: Talis, what spells do you know?
  - #4 Adolion Narrator: The woman in the back booth looks up from the table, her gaze sharpening on you. "You know my name already?" A faint smile touches her lips, but her eyes remain assessing. "Talis Dacaryn, yes. I've just come back from the capital." She straightens in her seat and the star earrings in her long blue h
  - **#5 Talis: "Spells? Oh, all the important ones, obviously!" *Talis bounces in her seat, nearly knocking over the half-empty flagon beside her. Her blue ponytail sways as she makes a sweeping gesture.* "I've got your standard Firebolts and Frost Rays—zapping things and freezing them solid, you know. Lightning B**

## Anomalies

### stall (2)

- 2026-10-01T21:55:53.424Z 10 boundaries without a transition at guild-hall while its exits were pending (`journal.jsonl:713`)
- 2026-10-01T22:01:10.292Z 10 boundaries without a transition at adv-guild-tavern while its exits were pending (`journal.jsonl:872`)

### extraction-rejected (2)

- 2026-10-01T21:57:19.748Z 1 extraction line(s) rejected: DELTA q=location value="north_road" evidence="We keep riding north. Anyone else notice there's no traffic on this road?" (evidence only in the player's line) (`journal.jsonl:789`)
- 2026-10-01T22:03:43.928Z 2 extraction line(s) rejected: DELTA q=location value="north_road" evidence="We make camp off the road at dusk." (evidence only in the player's line); DELTA q=reached_walls value=false evidence="We make camp off the road at dusk." (evidence only in the player's line) (`journal.jsonl:918`)

### empty-private-block (2)

- 2026-10-01T21:49:56.207Z Rydel was drafted in 2026-10-01@16h48m39s936ms at boundary 7 with no private block while holding 6 private entries acquired before it (`payloads.jsonl:98`)
- 2026-10-01T22:08:06.458Z Talis was drafted in 2026-10-01@16h48m39s936ms at boundary 15 with no private block while holding 11 private entries acquired before it (`payloads.jsonl:170`)

### judge-fallback (9)

- 2026-10-01T21:41:00.147Z judge director fell back (timeout) (`journal.jsonl:278`)
- 2026-10-01T21:53:33.763Z judge scene fell back (timeout) (`journal.jsonl:625`)
- 2026-10-01T21:54:27.470Z judge memoryPairs fell back (busy) (`journal.jsonl:669`)
- 2026-10-01T21:54:27.470Z judge memoryPairs fell back (busy) (`journal.jsonl:670`)
- 2026-10-01T21:54:27.470Z judge memoryPairs fell back (busy) (`journal.jsonl:671`)
- 2026-10-01T21:54:27.470Z judge memoryPairs fell back (busy) (`journal.jsonl:672`)
- 2026-10-01T21:54:27.472Z judge memoryPairs fell back (busy) (`journal.jsonl:674`)
- 2026-10-01T21:54:27.472Z judge memoryPairs fell back (busy) (`journal.jsonl:675`)
- 2026-10-01T21:54:27.472Z judge memoryPairs fell back (busy) (`journal.jsonl:676`)

### unexpected-jump (2)

- 2026-10-01T21:57:54.137Z road-to-wendhope → gen_on-the-road_1 is not an authored transition (a generated route?) (`journal.jsonl:793`)
- 2026-10-01T22:03:37.870Z gen_on-the-road_1 → gen_on-the-road_2 is not an authored transition (a generated route?) (`journal.jsonl:901`)

### console-error (1)

- 2026-10-01T21:54:27.471Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:37`)

### model-call-failure (3)

- 2026-10-01T19:49:46.984Z read via 975bc0dc-956b-4cd8-9fe4-9be158e01847: timeout (`journal.jsonl:69`)
- 2026-10-01T19:51:14.083Z read via 975bc0dc-956b-4cd8-9fe4-9be158e01847: timeout (`journal.jsonl:71`)
- 2026-10-01T19:52:41.437Z read via 975bc0dc-956b-4cd8-9fe4-9be158e01847: timeout (`journal.jsonl:73`)

## Draft register rows

| id | tier | severity | class | evidence | status | fix commit | eval | what |
|---|---|---|---|---|---|---|---|---|
| T2-?1 | T2 |  |  | `test/sessions/T2/T2-6-1/journal.jsonl:78` | draft |  |  | Outage: DeepSeek chat completions hang since ~19:50Z (orchestrator passes abort; memory probe timed out). Turn 1 (chat A, msg 1-2) affected: scheduler queue stuck at depth 1 for 600 s, pipeline stalled-rechecking. Play paused until DeepSeek answers. |
| T2-?2 | T2 |  |  | `test/sessions/T2/T2-6-1/journal.jsonl:91` | draft |  |  | Backend note: the Artemis pod was replaced mid-session (21:36Z, new pod m4dmlnzn70qgj2, same model file TheDrummer_Artemis-31B-v1.1-Q4_K_M.gguf and flags, tunnel 127.0.0.1:18080). Not a bundle change. Resuming play. |
| T2-?3 | T2 |  |  | `test/sessions/T2/T2-6-1/journal.jsonl:319` | draft |  |  | Chat A: the 8 deltas queued at 21:36:52 (path=wendhope, party_name=The Red Hands, location=north_road...) were never applied: I switched to chat B before chat A's next boundary, and boundaries 4-6 in chat A applied nothing. The re-read (msgs 2-9) no longer contains my acceptance (msg 1), so path=wendhope is held by the commit guard and chat A is stuck at The Guild Hall while riding north. Also on reopening chat A the journal shows 'Following Who Is Looking for a Party' (chat B's checkpoint) for chat A. |
| T2-?4 | T2 |  |  | `test/sessions/T2/T2-6-1/journal.jsonl:69` | draft |  |  | read via 975bc0dc-956b-4cd8-9fe4-9be158e01847: timeout |
| T2-?5 | T2 |  |  | `test/sessions/T2/T2-6-1/journal.jsonl:71` | draft |  |  | read via 975bc0dc-956b-4cd8-9fe4-9be158e01847: timeout |
| T2-?6 | T2 |  |  | `test/sessions/T2/T2-6-1/journal.jsonl:73` | draft |  |  | read via 975bc0dc-956b-4cd8-9fe4-9be158e01847: timeout |
| T2-?7 | T2 |  |  | `test/sessions/T2/T2-6-1/journal.jsonl:278` | draft |  |  | judge director fell back (timeout) |
| T2-?8 | T2 |  |  | `test/sessions/T2/T2-6-1/payloads.jsonl:98` | draft |  |  | Rydel was drafted in 2026-10-01@16h48m39s936ms at boundary 7 with no private block while holding 6 private entries acquired before it |
| T2-?9 | T2 |  |  | `test/sessions/T2/T2-6-1/journal.jsonl:625` | draft |  |  | judge scene fell back (timeout) |
| T2-?10 | T2 |  |  | `test/sessions/T2/T2-6-1/journal.jsonl:669` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?11 | T2 |  |  | `test/sessions/T2/T2-6-1/journal.jsonl:670` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?12 | T2 |  |  | `test/sessions/T2/T2-6-1/journal.jsonl:671` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?13 | T2 |  |  | `test/sessions/T2/T2-6-1/journal.jsonl:672` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?14 | T2 |  |  | `test/sessions/T2/T2-6-1/console.jsonl:37` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T2-?15 | T2 |  |  | `test/sessions/T2/T2-6-1/journal.jsonl:674` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?16 | T2 |  |  | `test/sessions/T2/T2-6-1/journal.jsonl:675` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?17 | T2 |  |  | `test/sessions/T2/T2-6-1/journal.jsonl:676` | draft |  |  | judge memoryPairs fell back (busy) |
| T2-?18 | T2 |  |  | `test/sessions/T2/T2-6-1/journal.jsonl:713` | draft |  |  | 10 boundaries without a transition at guild-hall while its exits were pending |
| T2-?19 | T2 |  |  | `test/sessions/T2/T2-6-1/journal.jsonl:789` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="north_road" evidence="We keep riding north. Anyone else notice there's no traffic on this road?" (evidence only in the player's line) |
| T2-?20 | T2 |  |  | `test/sessions/T2/T2-6-1/journal.jsonl:793` | draft |  |  | road-to-wendhope → gen_on-the-road_1 is not an authored transition (a generated route?) |
| T2-?21 | T2 |  |  | `test/sessions/T2/T2-6-1/journal.jsonl:872` | draft |  |  | 10 boundaries without a transition at adv-guild-tavern while its exits were pending |
| T2-?22 | T2 |  |  | `test/sessions/T2/T2-6-1/journal.jsonl:901` | draft |  |  | gen_on-the-road_1 → gen_on-the-road_2 is not an authored transition (a generated route?) |
| T2-?23 | T2 |  |  | `test/sessions/T2/T2-6-1/journal.jsonl:918` | draft |  |  | 2 extraction line(s) rejected: DELTA q=location value="north_road" evidence="We make camp off the road at dusk." (evidence only in the player's line); DELTA q=reached_walls value=false evidence="We make camp off the road at dusk." (evidence only in the player's line) |
| T2-?24 | T2 |  |  | `test/sessions/T2/T2-6-1/payloads.jsonl:170` | draft |  |  | Talis was drafted in 2026-10-01@16h48m39s936ms at boundary 15 with no private block while holding 11 private entries acquired before it |

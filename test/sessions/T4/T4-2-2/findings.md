# Findings draft: T4-2

Session `../story-orchestrator/test/sessions/T4/T4-2-2`. Draft rows for `docs/plans/v2.6/14-findings.md`; severity and class are decided in the review.

## Counts

- flags: 1
- stall: 0
- extraction-rejected: 9
- empty-private-block: 0
- lore-force-lost: 0
- lore-constant-missed: 0
- judge-fallback: 3
- save-lost: 2
- unexpected-jump: 0
- rollback: 22
- console-error: 0
- model-call-failure: 0
- model-defect: 0
- harness-error: 1

### By chat

- `(no chat)`: harness-error 1
- `2026-10-02@02h40m10s079ms - Branch #1`: rollback 9, judge-fallback 1, extraction-rejected 1
- `2026-10-02@02h40m10s079ms - Branch #2`: rollback 13, judge-fallback 1, extraction-rejected 1, save-lost 2
- `2026-10-02@02h40m10s079ms`: extraction-rejected 7, judge-fallback 1

## Judge health

- calls: 534 (answered 531, busy 0, timeout 3, other fallbacks 0)
- busy rate: 0.0%
- a busy fallback was never sent: the lane's judge rate limit (or a TypeSafe 429 passed through) held it, and the consumer took its no-judge path

## Model defects

None detected.

## Flags

### 2026-10-02T05:57:07.430Z (message 16)

- note: manual reload while the reply streamed (05:56:35Z, 295 chars in): player line kept on disk, partial reply dropped, chat+HUD agree b11 On the Road, no popup. The harness reload-mid-gen (seq 12) reloads before ST's pre-generation save and loses the player line instead
- evidence: `journal.jsonl:1056`
- context (event-time):
  - #13 Max Nightriver: At first light we break camp and ride on north.
  - #14 Adolion Narrator: *First light bleeds grey across the sky when the party breaks camp, leaving nothing behind but a ring of cold stones.* The road remains unsettlingly clear. By midday, they come upon the first sign of what Tobias had warned about: an overturned carriage, its wheels shattered and cargo still strapped 
  - #15 Max Nightriver: We follow the riderless horse's tracks north toward Wendhope.
  - **#16 Giada: *A flash of movement near the treeline catches Giada's eye—a silhouette against the dim grey light. She doesn't call out. Instead, she melts into the shadows between the pines, her pale skin nearly translucent in the gloom. Her navy cloak blends with the underbrush as she follows the riderless horse**
  - #17 Max Nightriver: Who's that pale woman by the pines? Belle, Dalan, eyes on her. We reach the walls and call out to the gate.

## Anomalies

### extraction-rejected (9)

- 2026-10-02T05:44:00.357Z 1 extraction line(s) rejected: DELTA q=adv_looking_for_hands value=false evidence="We take Wendhope as the Loose Ends." (evidence only in the player's line) (`journal.jsonl:270`)
- 2026-10-02T05:44:22.011Z 2 extraction line(s) rejected: DELTA q=first_camp value=false evidence="We ride north for Wendhope today." (evidence only in the player's line); DELTA q=reached_walls value=false evidence="We ride north for Wendhope today." (evidence only in the player's line) (`journal.jsonl:304`)
- 2026-10-02T05:44:28.994Z 2 extraction line(s) rejected: DELTA q=first_camp value=false evidence="We ride north for Wendhope today." (evidence only in the player's line); DELTA q=reached_walls value=false evidence="We ride north for Wendhope today." (evidence only in the player's line) (`journal.jsonl:316`)
- 2026-10-02T05:45:53.329Z 1 extraction line(s) rejected: DELTA q=first_camp value=true evidence="Night's falling. We make camp off the road, light a small fire, and keep watch in turns." (evidence only in the player's line) (`journal.jsonl:389`)
- 2026-10-02T05:46:03.136Z 1 extraction line(s) rejected: DELTA q=first_camp value=true evidence="Night's falling. We make camp off the road, light a small fire, and keep watch in turns." (evidence only in the player's line) (`journal.jsonl:401`)
- 2026-10-02T05:48:12.593Z 1 extraction line(s) rejected: DELTA q=first_camp value=true evidence="Night's falling. We make camp off the road, light a small fire, and keep watch in turns." (evidence only in the player's line) (`journal.jsonl:474`)
- 2026-10-02T05:51:44.833Z 1 extraction line(s) rejected: FACT importance=2 text="The party made camp off the road on the first night, with Belle taking the first watch." evidence="I'll take the first watch," *she says, her eyes scanning the treeline with a restless, predatory focus.* (unrecognized line) (`journal.jsonl:924`)
- 2026-10-02T05:58:02.049Z 1 extraction line(s) rejected: DELTA q=location value="wendhope_gate" evidence="We reach the walls and call out to the gate." (evidence only in the player's line) (`journal.jsonl:1092`)
- 2026-10-02T05:59:27.810Z 1 extraction line(s) rejected: DELTA q=adv_looking_for_hands value=false evidence="We take Wendhope as the Loose Ends." (evidence only in the player's line) (`journal.jsonl:1538`)

### judge-fallback (3)

- 2026-10-02T05:49:05.764Z judge scene fell back (timeout) (`journal.jsonl:496`)
- 2026-10-02T05:49:05.764Z judge scene fell back (timeout) (`journal.jsonl:829`)
- 2026-10-02T05:49:05.764Z judge scene fell back (timeout) (`journal.jsonl:1391`)

### save-lost (2)

- 2026-10-02T06:00:54.052Z save not confirmed (`journal.jsonl:1616`)
- 2026-10-02T06:04:00.246Z save not confirmed (`journal.jsonl:1769`)

### rollback (22)

- 2026-10-02T05:41:11.730Z boundary went back from 10 to 2 (`journal.jsonl:592`)
- 2026-10-02T05:41:11.730Z boundary went back from 13 to 2 (`journal.jsonl:1154`)
- 2026-10-02T05:43:44.629Z boundary went back from 10 to 3 (`journal.jsonl:623`)
- 2026-10-02T05:43:44.629Z boundary went back from 13 to 3 (`journal.jsonl:1185`)
- 2026-10-02T05:44:10.661Z boundary went back from 10 to 4 (`journal.jsonl:659`)
- 2026-10-02T05:44:10.661Z boundary went back from 13 to 4 (`journal.jsonl:1221`)
- 2026-10-02T05:44:32.815Z boundary went back from 10 to 5 (`journal.jsonl:696`)
- 2026-10-02T05:44:32.815Z boundary went back from 13 to 5 (`journal.jsonl:1258`)
- 2026-10-02T05:44:35.873Z boundary went back from 10 to 6 (`journal.jsonl:703`)
- 2026-10-02T05:44:35.873Z boundary went back from 13 to 6 (`journal.jsonl:1265`)
- 2026-10-02T05:45:42.992Z boundary went back from 10 to 7 (`journal.jsonl:735`)
- 2026-10-02T05:45:42.992Z boundary went back from 13 to 7 (`journal.jsonl:1297`)
- 2026-10-02T05:47:26.492Z boundary went back from 10 to 8 (`journal.jsonl:784`)
- 2026-10-02T05:47:26.492Z boundary went back from 13 to 8 (`journal.jsonl:1346`)
- 2026-10-02T05:48:04.862Z boundary went back from 10 to 9 (`journal.jsonl:798`)
- 2026-10-02T05:48:04.862Z boundary went back from 13 to 9 (`journal.jsonl:1360`)
- 2026-10-02T05:49:02.244Z boundary went back from 13 to 10 (`journal.jsonl:1386`)
- 2026-10-02T05:51:31.807Z boundary went back from 10 to 8 (`journal.jsonl:906`)
- 2026-10-02T05:52:35.232Z boundary went back from 13 to 11 (`journal.jsonl:1433`)
- 2026-10-02T05:57:53.198Z boundary went back from 13 to 12 (`journal.jsonl:1477`)
- 2026-10-02T06:00:02.930Z boundary went back from 13 to 3 (`journal.jsonl:1551`)
- 2026-10-02T06:00:22.848Z boundary went back from 13 to 4 (`journal.jsonl:1578`)

### harness-error (1)

- - WARNING: the page restarted 2 time(s); captures between the last drain and each restart are UNKNOWN, not zero. (`payloads.log:113`)

## Draft register rows

| id | tier | severity | class | evidence | status | fix commit | eval | what |
|---|---|---|---|---|---|---|---|---|
| T4-?1 | T4 |  |  | `../story-orchestrator/test/sessions/T4/T4-2-2/journal.jsonl:1056` | draft |  |  | manual reload while the reply streamed (05:56:35Z, 295 chars in): player line kept on disk, partial reply dropped, chat+HUD agree b11 On the Road, no popup. The harness reload-mid-gen (seq 12) reloads before ST's pre-generation save and loses the player line instead |
| T4-?2 | T4 |  | harness | `../story-orchestrator/test/sessions/T4/T4-2-2/payloads.log:113` | draft |  |  | WARNING: the page restarted 2 time(s); captures between the last drain and each restart are UNKNOWN, not zero. |
| T4-?3 | T4 |  |  | `../story-orchestrator/test/sessions/T4/T4-2-2/journal.jsonl:592` | draft |  |  | boundary went back from 10 to 2 |
| T4-?4 | T4 |  |  | `../story-orchestrator/test/sessions/T4/T4-2-2/journal.jsonl:1154` | draft |  |  | boundary went back from 13 to 2 |
| T4-?5 | T4 |  |  | `../story-orchestrator/test/sessions/T4/T4-2-2/journal.jsonl:623` | draft |  |  | boundary went back from 10 to 3 |
| T4-?6 | T4 |  |  | `../story-orchestrator/test/sessions/T4/T4-2-2/journal.jsonl:1185` | draft |  |  | boundary went back from 13 to 3 |
| T4-?7 | T4 |  |  | `../story-orchestrator/test/sessions/T4/T4-2-2/journal.jsonl:270` | draft |  |  | 1 extraction line(s) rejected: DELTA q=adv_looking_for_hands value=false evidence="We take Wendhope as the Loose Ends." (evidence only in the player's line) |
| T4-?8 | T4 |  |  | `../story-orchestrator/test/sessions/T4/T4-2-2/journal.jsonl:659` | draft |  |  | boundary went back from 10 to 4 |
| T4-?9 | T4 |  |  | `../story-orchestrator/test/sessions/T4/T4-2-2/journal.jsonl:1221` | draft |  |  | boundary went back from 13 to 4 |
| T4-?10 | T4 |  |  | `../story-orchestrator/test/sessions/T4/T4-2-2/journal.jsonl:304` | draft |  |  | 2 extraction line(s) rejected: DELTA q=first_camp value=false evidence="We ride north for Wendhope today." (evidence only in the player's line); DELTA q=reached_walls value=false evidence="We ride north for Wendhope today." (evidence only in the player's line) |
| T4-?11 | T4 |  |  | `../story-orchestrator/test/sessions/T4/T4-2-2/journal.jsonl:316` | draft |  |  | 2 extraction line(s) rejected: DELTA q=first_camp value=false evidence="We ride north for Wendhope today." (evidence only in the player's line); DELTA q=reached_walls value=false evidence="We ride north for Wendhope today." (evidence only in the player's line) |
| T4-?12 | T4 |  |  | `../story-orchestrator/test/sessions/T4/T4-2-2/journal.jsonl:696` | draft |  |  | boundary went back from 10 to 5 |
| T4-?13 | T4 |  |  | `../story-orchestrator/test/sessions/T4/T4-2-2/journal.jsonl:1258` | draft |  |  | boundary went back from 13 to 5 |
| T4-?14 | T4 |  |  | `../story-orchestrator/test/sessions/T4/T4-2-2/journal.jsonl:703` | draft |  |  | boundary went back from 10 to 6 |
| T4-?15 | T4 |  |  | `../story-orchestrator/test/sessions/T4/T4-2-2/journal.jsonl:1265` | draft |  |  | boundary went back from 13 to 6 |
| T4-?16 | T4 |  |  | `../story-orchestrator/test/sessions/T4/T4-2-2/journal.jsonl:735` | draft |  |  | boundary went back from 10 to 7 |
| T4-?17 | T4 |  |  | `../story-orchestrator/test/sessions/T4/T4-2-2/journal.jsonl:1297` | draft |  |  | boundary went back from 13 to 7 |
| T4-?18 | T4 |  |  | `../story-orchestrator/test/sessions/T4/T4-2-2/journal.jsonl:389` | draft |  |  | 1 extraction line(s) rejected: DELTA q=first_camp value=true evidence="Night's falling. We make camp off the road, light a small fire, and keep watch in turns." (evidence only in the player's line) |
| T4-?19 | T4 |  |  | `../story-orchestrator/test/sessions/T4/T4-2-2/journal.jsonl:401` | draft |  |  | 1 extraction line(s) rejected: DELTA q=first_camp value=true evidence="Night's falling. We make camp off the road, light a small fire, and keep watch in turns." (evidence only in the player's line) |
| T4-?20 | T4 |  |  | `../story-orchestrator/test/sessions/T4/T4-2-2/journal.jsonl:784` | draft |  |  | boundary went back from 10 to 8 |
| T4-?21 | T4 |  |  | `../story-orchestrator/test/sessions/T4/T4-2-2/journal.jsonl:1346` | draft |  |  | boundary went back from 13 to 8 |
| T4-?22 | T4 |  |  | `../story-orchestrator/test/sessions/T4/T4-2-2/journal.jsonl:798` | draft |  |  | boundary went back from 10 to 9 |
| T4-?23 | T4 |  |  | `../story-orchestrator/test/sessions/T4/T4-2-2/journal.jsonl:1360` | draft |  |  | boundary went back from 13 to 9 |
| T4-?24 | T4 |  |  | `../story-orchestrator/test/sessions/T4/T4-2-2/journal.jsonl:474` | draft |  |  | 1 extraction line(s) rejected: DELTA q=first_camp value=true evidence="Night's falling. We make camp off the road, light a small fire, and keep watch in turns." (evidence only in the player's line) |
| T4-?25 | T4 |  |  | `../story-orchestrator/test/sessions/T4/T4-2-2/journal.jsonl:1386` | draft |  |  | boundary went back from 13 to 10 |
| T4-?26 | T4 |  |  | `../story-orchestrator/test/sessions/T4/T4-2-2/journal.jsonl:496` | draft |  |  | judge scene fell back (timeout) |
| T4-?27 | T4 |  |  | `../story-orchestrator/test/sessions/T4/T4-2-2/journal.jsonl:829` | draft |  |  | judge scene fell back (timeout) |
| T4-?28 | T4 |  |  | `../story-orchestrator/test/sessions/T4/T4-2-2/journal.jsonl:1391` | draft |  |  | judge scene fell back (timeout) |
| T4-?29 | T4 |  |  | `../story-orchestrator/test/sessions/T4/T4-2-2/journal.jsonl:906` | draft |  |  | boundary went back from 10 to 8 |
| T4-?30 | T4 |  |  | `../story-orchestrator/test/sessions/T4/T4-2-2/journal.jsonl:924` | draft |  |  | 1 extraction line(s) rejected: FACT importance=2 text="The party made camp off the road on the first night, with Belle taking the first watch." evidence="I'll take the first watch," *she says, her eyes scanning the treeline with a restless, predatory focus.* (unrecognized line) |
| T4-?31 | T4 |  |  | `../story-orchestrator/test/sessions/T4/T4-2-2/journal.jsonl:1433` | draft |  |  | boundary went back from 13 to 11 |
| T4-?32 | T4 |  |  | `../story-orchestrator/test/sessions/T4/T4-2-2/journal.jsonl:1477` | draft |  |  | boundary went back from 13 to 12 |
| T4-?33 | T4 |  |  | `../story-orchestrator/test/sessions/T4/T4-2-2/journal.jsonl:1092` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="wendhope_gate" evidence="We reach the walls and call out to the gate." (evidence only in the player's line) |
| T4-?34 | T4 |  |  | `../story-orchestrator/test/sessions/T4/T4-2-2/journal.jsonl:1538` | draft |  |  | 1 extraction line(s) rejected: DELTA q=adv_looking_for_hands value=false evidence="We take Wendhope as the Loose Ends." (evidence only in the player's line) |
| T4-?35 | T4 |  |  | `../story-orchestrator/test/sessions/T4/T4-2-2/journal.jsonl:1551` | draft |  |  | boundary went back from 13 to 3 |
| T4-?36 | T4 |  |  | `../story-orchestrator/test/sessions/T4/T4-2-2/journal.jsonl:1578` | draft |  |  | boundary went back from 13 to 4 |
| T4-?37 | T4 |  |  | `../story-orchestrator/test/sessions/T4/T4-2-2/journal.jsonl:1616` | draft |  |  | save not confirmed |
| T4-?38 | T4 |  |  | `../story-orchestrator/test/sessions/T4/T4-2-2/journal.jsonl:1769` | draft |  |  | save not confirmed |

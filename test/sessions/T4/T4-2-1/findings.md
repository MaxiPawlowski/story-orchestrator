# Findings draft: T4-2

Session `test/sessions/T4/T4-2-1`. Draft rows for `docs/plans/v2.6/14-findings.md`; severity and class are decided in the review.

## Counts

- flags: 1
- stall: 1
- extraction-rejected: 3
- empty-private-block: 0
- lore-force-lost: 0
- lore-constant-missed: 0
- judge-fallback: 40
- save-lost: 3
- unexpected-jump: 0
- rollback: 18
- console-error: 3
- model-call-failure: 0
- model-defect: 0
- harness-error: 1

### By chat

- `(no chat)`: harness-error 1, console-error 3
- `2026-10-02@01h59m03s658ms - Branch #1`: rollback 5, save-lost 1
- `2026-10-02@01h59m03s658ms - Branch #2`: rollback 13, save-lost 1, judge-fallback 20
- `2026-10-02@01h58m52s124ms`: extraction-rejected 2
- `2026-10-02@01h59m03s658ms`: save-lost 1, extraction-rejected 1, judge-fallback 20, stall 1

## Judge health

- calls: 614 (answered 574, busy 34, timeout 6, other fallbacks 0)
- busy rate: 5.5% (by use: memoryPairs 28, scene 2, warden 2, wardenLore 2)
- a busy fallback was never sent: the lane's judge rate limit (or a TypeSafe 429 passed through) held it, and the consumer took its no-judge path

## Model defects

None detected.

## Flags

### 2026-10-02T05:05:13.892Z (message 6)

- note: switch-chat-mid-gen seq 4 failed: page.waitForFunction 15000ms timeout opening the Eshalanore group right after the reply to 'We ride north.'; no switch happened, adventurer chat intact (7 msgs, road-to-wendhope); manual open-group 30s later worked
- evidence: `journal.jsonl:303`
- context (event-time):
  - #3 Max Nightriver: Tobias, sign us up. We ride north for Wendhope today.
  - #4 Tobias: Tobias's ocean blue eyes widen slightly at the sudden declaration, and his fingers pause on the edge of the counter. "Ride north today, you say?" He lets out a long, measured breath, then shakes his head. "I appreciate the enthusiasm, truly. But you have no party, and even a determined soul will fin
  - #5 Max Nightriver: We ride north.
  - **#6 Tobias: Tobias's brow furrows, a rare crack in his composed demeanor. "I understand your determination, I truly do. But this is not a matter of will; it is a matter of Guild policy, and more importantly, a matter of survival." He leans forward slightly, his voice dropping to a more earnest tone. "I will not**

## Anomalies

### stall (1)

- 2026-10-02T05:25:14.463Z 10 boundaries without a transition at road-to-wendhope while its exits were pending (`journal.jsonl:1393`)

### extraction-rejected (3)

- 2026-10-02T05:01:37.473Z 3 extraction line(s) rejected: DELTA q=<esha_at_border> value=false evidence="The road north ends at a roofless chapel beneath the black pines." (unknown quality); DELTA q=<location> value="esha_alks_chapel" evidence="The road north ends at a roofless chapel beneath the black pines." (unknown quality); DELTA q=<tension_current> value="stirring" evidence="Something small moves between the trees nearby, then goes still." (unknown quality) (`journal.jsonl:160`)
- 2026-10-02T05:08:08.260Z 2 extraction line(s) rejected: DELTA q=first_camp value=false evidence="We ride north for Wendhope today." (evidence only in the player's line); DELTA q=reached_walls value=false evidence="We ride north for Wendhope today." (evidence only in the player's line) (`journal.jsonl:477`)
- 2026-10-02T05:19:24.033Z 4 extraction line(s) rejected: DELTA q=<esha_at_border> value=false evidence="She stops just past the chapel walls, gesturing with a waving arm toward the north where the black pines grow thick and the mist still clings to the forest floor." (unknown quality); DELTA q=<location> value="esha_alks_chapel" evidence="Past the broken wall of the chapel, something pale green peeks round a pine trunk, sees it has been noticed, and melts flat against the bark." (unknown quality); DELTA q=<party_injuries> value=0 evidence="Please, rest. There is water from the well, and vegetables from the garden." (unknown quality) (`journal.jsonl:1220`)

### judge-fallback (40)

- 2026-10-02T05:14:42.087Z judge stall fell back (timeout) (`journal.jsonl:976`)
- 2026-10-02T05:14:42.087Z judge stall fell back (timeout) (`journal.jsonl:1691`)
- 2026-10-02T05:15:15.430Z judge memoryPairs fell back (busy) (`journal.jsonl:1033`)
- 2026-10-02T05:15:15.430Z judge memoryPairs fell back (busy) (`journal.jsonl:1034`)
- 2026-10-02T05:15:15.430Z judge memoryPairs fell back (busy) (`journal.jsonl:1732`)
- 2026-10-02T05:15:15.430Z judge memoryPairs fell back (busy) (`journal.jsonl:1733`)
- 2026-10-02T05:15:15.482Z judge memoryPairs fell back (busy) (`journal.jsonl:1036`)
- 2026-10-02T05:15:15.482Z judge memoryPairs fell back (busy) (`journal.jsonl:1735`)
- 2026-10-02T05:15:15.484Z judge memoryPairs fell back (busy) (`journal.jsonl:1037`)
- 2026-10-02T05:15:15.484Z judge memoryPairs fell back (busy) (`journal.jsonl:1736`)
- 2026-10-02T05:15:15.485Z judge memoryPairs fell back (busy) (`journal.jsonl:1038`)
- 2026-10-02T05:15:15.485Z judge memoryPairs fell back (busy) (`journal.jsonl:1737`)
- 2026-10-02T05:15:41.176Z judge lore fell back (timeout) (`journal.jsonl:1046`)
- 2026-10-02T05:15:41.176Z judge lore fell back (timeout) (`journal.jsonl:1742`)
- 2026-10-02T05:15:41.190Z judge lore fell back (timeout) (`journal.jsonl:1047`)
- 2026-10-02T05:15:41.190Z judge lore fell back (timeout) (`journal.jsonl:1743`)
- 2026-10-02T05:15:52.121Z judge memoryPairs fell back (busy) (`journal.jsonl:1062`)
- 2026-10-02T05:15:52.121Z judge memoryPairs fell back (busy) (`journal.jsonl:1757`)
- 2026-10-02T05:15:52.122Z judge memoryPairs fell back (busy) (`journal.jsonl:1063`)
- 2026-10-02T05:15:52.122Z judge memoryPairs fell back (busy) (`journal.jsonl:1064`)
- 2026-10-02T05:15:52.122Z judge memoryPairs fell back (busy) (`journal.jsonl:1065`)
- 2026-10-02T05:15:52.122Z judge memoryPairs fell back (busy) (`journal.jsonl:1758`)
- 2026-10-02T05:15:52.122Z judge memoryPairs fell back (busy) (`journal.jsonl:1759`)
- 2026-10-02T05:15:52.122Z judge memoryPairs fell back (busy) (`journal.jsonl:1760`)
- 2026-10-02T05:15:52.142Z judge memoryPairs fell back (busy) (`journal.jsonl:1067`)
- 2026-10-02T05:15:52.142Z judge memoryPairs fell back (busy) (`journal.jsonl:1068`)
- 2026-10-02T05:15:52.142Z judge memoryPairs fell back (busy) (`journal.jsonl:1069`)
- 2026-10-02T05:15:52.142Z judge memoryPairs fell back (busy) (`journal.jsonl:1070`)
- 2026-10-02T05:15:52.142Z judge memoryPairs fell back (busy) (`journal.jsonl:1071`)
- 2026-10-02T05:15:52.142Z judge memoryPairs fell back (busy) (`journal.jsonl:1762`)
- 2026-10-02T05:15:52.142Z judge memoryPairs fell back (busy) (`journal.jsonl:1763`)
- 2026-10-02T05:15:52.142Z judge memoryPairs fell back (busy) (`journal.jsonl:1764`)
- 2026-10-02T05:15:52.142Z judge memoryPairs fell back (busy) (`journal.jsonl:1765`)
- 2026-10-02T05:15:52.142Z judge memoryPairs fell back (busy) (`journal.jsonl:1766`)
- 2026-10-02T05:16:11.660Z judge scene fell back (busy) (`journal.jsonl:1077`)
- 2026-10-02T05:16:11.660Z judge warden fell back (busy) (`journal.jsonl:1078`)
- 2026-10-02T05:16:11.660Z judge scene fell back (busy) (`journal.jsonl:1772`)
- 2026-10-02T05:16:11.660Z judge warden fell back (busy) (`journal.jsonl:1773`)
- 2026-10-02T05:16:11.688Z judge wardenLore fell back (busy) (`journal.jsonl:1079`)
- 2026-10-02T05:16:11.688Z judge wardenLore fell back (busy) (`journal.jsonl:1774`)

### save-lost (3)

- 2026-10-02T05:06:50.084Z save not confirmed (`journal.jsonl:395`)
- 2026-10-02T05:06:50.084Z save not confirmed (`journal.jsonl:676`)
- 2026-10-02T05:06:50.084Z save not confirmed (`journal.jsonl:1527`)

### rollback (18)

- 2026-10-02T05:00:09.537Z boundary went back from 6 to 2 (`journal.jsonl:561`)
- 2026-10-02T05:00:09.537Z boundary went back from 14 to 2 (`journal.jsonl:1441`)
- 2026-10-02T05:02:53.534Z boundary went back from 6 to 3 (`journal.jsonl:592`)
- 2026-10-02T05:02:53.534Z boundary went back from 14 to 3 (`journal.jsonl:1450`)
- 2026-10-02T05:04:03.717Z boundary went back from 6 to 4 (`journal.jsonl:626`)
- 2026-10-02T05:04:03.717Z boundary went back from 14 to 4 (`journal.jsonl:1481`)
- 2026-10-02T05:07:20.493Z boundary went back from 6 to 5 (`journal.jsonl:700`)
- 2026-10-02T05:07:20.493Z boundary went back from 14 to 5 (`journal.jsonl:1549`)
- 2026-10-02T05:07:54.437Z boundary went back from 14 to 6 (`journal.jsonl:1571`)
- 2026-10-02T05:10:42.591Z boundary went back from 6 to 5 (`journal.jsonl:792`)
- 2026-10-02T05:12:42.822Z boundary went back from 14 to 7 (`journal.jsonl:1608`)
- 2026-10-02T05:13:15.679Z boundary went back from 14 to 8 (`journal.jsonl:1639`)
- 2026-10-02T05:13:16.009Z boundary went back from 14 to 9 (`journal.jsonl:1640`)
- 2026-10-02T05:14:37.579Z boundary went back from 14 to 10 (`journal.jsonl:1685`)
- 2026-10-02T05:16:10.831Z boundary went back from 14 to 11 (`journal.jsonl:1769`)
- 2026-10-02T05:17:50.966Z boundary went back from 14 to 12 (`journal.jsonl:1795`)
- 2026-10-02T05:23:16.497Z boundary went back from 14 to 13 (`journal.jsonl:1846`)
- 2026-10-02T05:27:20.530Z boundary went back from 14 to 4 (`journal.jsonl:1958`)

### console-error (3)

- 2026-10-02T05:15:15.431Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:969`)
- 2026-10-02T05:15:52.122Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:970`)
- 2026-10-02T05:16:11.722Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:972`)

### harness-error (1)

- - WARNING: the page restarted 5 time(s); captures between the last drain and each restart are UNKNOWN, not zero. (`payloads.log:112`)

## Draft register rows

| id | tier | severity | class | evidence | status | fix commit | eval | what |
|---|---|---|---|---|---|---|---|---|
| T4-?1 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:303` | draft |  |  | switch-chat-mid-gen seq 4 failed: page.waitForFunction 15000ms timeout opening the Eshalanore group right after the reply to 'We ride north.'; no switch happened, adventurer chat intact (7 msgs, road-to-wendhope); manual open-group 30s later worked |
| T4-?2 | T4 |  | harness | `test/sessions/T4/T4-2-1/payloads.log:112` | draft |  |  | WARNING: the page restarted 5 time(s); captures between the last drain and each restart are UNKNOWN, not zero. |
| T4-?3 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:561` | draft |  |  | boundary went back from 6 to 2 |
| T4-?4 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1441` | draft |  |  | boundary went back from 14 to 2 |
| T4-?5 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:160` | draft |  |  | 3 extraction line(s) rejected: DELTA q=<esha_at_border> value=false evidence="The road north ends at a roofless chapel beneath the black pines." (unknown quality); DELTA q=<location> value="esha_alks_chapel" evidence="The road north ends at a roofless chapel beneath the black pines." (unknown quality); DELTA q=<tension_current> value="stirring" evidence="Something small moves between the trees nearby, then goes still." (unknown quality) |
| T4-?6 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:592` | draft |  |  | boundary went back from 6 to 3 |
| T4-?7 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1450` | draft |  |  | boundary went back from 14 to 3 |
| T4-?8 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:626` | draft |  |  | boundary went back from 6 to 4 |
| T4-?9 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1481` | draft |  |  | boundary went back from 14 to 4 |
| T4-?10 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:395` | draft |  |  | save not confirmed |
| T4-?11 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:676` | draft |  |  | save not confirmed |
| T4-?12 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1527` | draft |  |  | save not confirmed |
| T4-?13 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:700` | draft |  |  | boundary went back from 6 to 5 |
| T4-?14 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1549` | draft |  |  | boundary went back from 14 to 5 |
| T4-?15 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1571` | draft |  |  | boundary went back from 14 to 6 |
| T4-?16 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:477` | draft |  |  | 2 extraction line(s) rejected: DELTA q=first_camp value=false evidence="We ride north for Wendhope today." (evidence only in the player's line); DELTA q=reached_walls value=false evidence="We ride north for Wendhope today." (evidence only in the player's line) |
| T4-?17 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:792` | draft |  |  | boundary went back from 6 to 5 |
| T4-?18 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1608` | draft |  |  | boundary went back from 14 to 7 |
| T4-?19 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1639` | draft |  |  | boundary went back from 14 to 8 |
| T4-?20 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1640` | draft |  |  | boundary went back from 14 to 9 |
| T4-?21 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1685` | draft |  |  | boundary went back from 14 to 10 |
| T4-?22 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:976` | draft |  |  | judge stall fell back (timeout) |
| T4-?23 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1691` | draft |  |  | judge stall fell back (timeout) |
| T4-?24 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1033` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?25 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1034` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?26 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1732` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?27 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1733` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?28 | T4 |  |  | `test/sessions/T4/T4-2-1/console.jsonl:969` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T4-?29 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1036` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?30 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1735` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?31 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1037` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?32 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1736` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?33 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1038` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?34 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1737` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?35 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1046` | draft |  |  | judge lore fell back (timeout) |
| T4-?36 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1742` | draft |  |  | judge lore fell back (timeout) |
| T4-?37 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1047` | draft |  |  | judge lore fell back (timeout) |
| T4-?38 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1743` | draft |  |  | judge lore fell back (timeout) |
| T4-?39 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1062` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?40 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1757` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?41 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1063` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?42 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1064` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?43 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1065` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?44 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1758` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?45 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1759` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?46 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1760` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?47 | T4 |  |  | `test/sessions/T4/T4-2-1/console.jsonl:970` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T4-?48 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1067` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?49 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1068` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?50 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1069` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?51 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1070` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?52 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1071` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?53 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1762` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?54 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1763` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?55 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1764` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?56 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1765` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?57 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1766` | draft |  |  | judge memoryPairs fell back (busy) |
| T4-?58 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1769` | draft |  |  | boundary went back from 14 to 11 |
| T4-?59 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1077` | draft |  |  | judge scene fell back (busy) |
| T4-?60 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1078` | draft |  |  | judge warden fell back (busy) |
| T4-?61 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1772` | draft |  |  | judge scene fell back (busy) |
| T4-?62 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1773` | draft |  |  | judge warden fell back (busy) |
| T4-?63 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1079` | draft |  |  | judge wardenLore fell back (busy) |
| T4-?64 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1774` | draft |  |  | judge wardenLore fell back (busy) |
| T4-?65 | T4 |  |  | `test/sessions/T4/T4-2-1/console.jsonl:972` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T4-?66 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1795` | draft |  |  | boundary went back from 14 to 12 |
| T4-?67 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1220` | draft |  |  | 4 extraction line(s) rejected: DELTA q=<esha_at_border> value=false evidence="She stops just past the chapel walls, gesturing with a waving arm toward the north where the black pines grow thick and the mist still clings to the forest floor." (unknown quality); DELTA q=<location> value="esha_alks_chapel" evidence="Past the broken wall of the chapel, something pale green peeks round a pine trunk, sees it has been noticed, and melts flat against the bark." (unknown quality); DELTA q=<party_injuries> value=0 evidence="Please, rest. There is water from the well, and vegetables from the garden." (unknown quality) |
| T4-?68 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1846` | draft |  |  | boundary went back from 14 to 13 |
| T4-?69 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1393` | draft |  |  | 10 boundaries without a transition at road-to-wendhope while its exits were pending |
| T4-?70 | T4 |  |  | `test/sessions/T4/T4-2-1/journal.jsonl:1958` | draft |  |  | boundary went back from 14 to 4 |

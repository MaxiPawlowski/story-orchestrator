# Findings draft: T3-5

Session `test/sessions/T3/T3-5-1`. Draft rows for `docs/plans/v2.6/14-findings.md`; severity and class are decided in the review.

## Counts

- flags: 2
- stall: 1
- extraction-rejected: 11
- empty-private-block: 0
- lore-force-lost: 0
- lore-constant-missed: 0
- judge-fallback: 26
- save-lost: 0
- unexpected-jump: 0
- rollback: 0
- console-error: 1
- model-call-failure: 0
- model-defect: 0
- harness-error: 0

### By chat

- `2026-10-01@23h41m44s699ms`: extraction-rejected 11, judge-fallback 26, stall 1
- `(no chat)`: console-error 1

## Judge health

- calls: 261 (answered 235, busy 24, timeout 2, other fallbacks 0)
- busy rate: 9.2% (by use: memoryPairs 24)
- a busy fallback was never sent: the lane's judge rate limit (or a TypeSafe 429 passed through) held it, and the consumer took its no-judge path

## Model defects

None detected.

## Flags

### 2026-10-02T02:51:05.048Z (message 13)

- note: Swipe of msg 13 reverted the applied Tournament rewrite (good, wi-after-swipe.txt) but also removed the whole proposal wi-8-11 from the ring (made on msg 11, which survived the swipe): my edited+accepted rewrite and the declined op are gone, so the author's decision is lost and nothing re-applies. ring-after-swipe.txt
- evidence: `journal.jsonl:410`
- context (event-time):
  - #10 Honami: "Lord Karos?" Honami steps closer to Max, her voice hushed and curious. Her white hair shifts across her face as she glances toward the silver-haired man by the door. "How peculiar. I wasn't aware he had any interest in the tournament." *Her tails flick with subtle intrigue, though her gaze remains 
  - #11 Adolion Narrator: A bronze gong rolls across the sand. "Group entry, Honami Nemaden and the guests of Darran, against the Mountain Silence of the Guao!" A steward lights the first incense stick, and the noise of the stands drops to a hum.
  - #12 Max Nightriver: *We step onto the sand for our first bout of the Jiansho Tournament.* Belle, you take the big one. Dalan, watch the flank. Let's show the Guao what the Guild sends.
  - **#13 Belle: "Got it." Belle doesn't wait for the gong to fade before she's already moving, Cleaver's head scraping the sand. "And you stay back and watch, pretty boy. Wouldn't want that fancy Nightriver blood getting splattered on the place." *She doesn't look back, just shifts her weight and grins as her oppon**

### 2026-10-02T02:59:38.262Z (message 27)

- note: Curator re-proposed switching on 'Chronicle - About this book' (the book's own meta/house-style note) 3 times (wi-4-6, wi-8-11, wi-16-25) after I declined it twice: useless op, and declines are not remembered. Its latest rewrite also wanted to put 'Hanzo Hattaxi' into the open Tournament chronicle entry; declined.
- evidence: `journal.jsonl:729`
- context (event-time):
  - #24 Max Nightriver: *Next morning we walk back onto the arena sand to face the Sunset Blooms.* Belle, Dalan, same as yesterday. Keep it clean.
  - #25 Belle: "Clean? The fuck you sayin'?" Belle laughs, a short bark that draws eyes from the stands. She cracks her neck, Cleaver's stone head already resting in the sand. "Clean is for the fucking laundry. I'm gonna break their ribs so hard the bookies'll shit themselves." *She steps forward, eyes locked on t
  - #26 Max Nightriver: *I watch the Sunset Blooms' leader closely as the gong sounds.* Dalan, what do you make of their stance?
  - **#27 Dalan: Dalan has already notched an arrow, but his eyes are narrowed and focused. He doesn't turn his head, keeping his vision on the enemy lines. "The leader is weighted on his right," he reports in a soft, measured voice. "Tells me he's expecting a close-quarters exchange. His chi flow is... tense, like **

## Anomalies

### stall (1)

- 2026-10-02T02:59:01.116Z 10 boundaries without a transition at east-the-rounds while its exits were pending (`journal.jsonl:702`)

### extraction-rejected (11)

- 2026-10-02T02:46:02.624Z 6 extraction line(s) rejected: DELTA q=east_odds value=null evidence="" (missing evidence); DELTA q=east_round_fought value=false evidence="" (missing evidence); DELTA q=east_through_rounds value=false evidence="" (missing evidence) (`journal.jsonl:217`)
- 2026-10-02T02:46:12.041Z 6 extraction line(s) rejected: DELTA q=east_odds value=null evidence="" (missing evidence); DELTA q=east_round_fought value=false evidence="" (missing evidence); DELTA q=east_through_rounds value=false evidence="" (missing evidence) (`journal.jsonl:230`)
- 2026-10-02T02:46:20.537Z 1 extraction line(s) rejected: DELTA q=east_odds value=null evidence="Though I must confess, I find the odds far more interesting when they're... uncertain." (invalid value) (`journal.jsonl:242`)
- 2026-10-02T02:48:22.923Z 1 extraction line(s) rejected: DELTA q=east_round_fought value=true evidence="We step onto the sand for our first bout of the Jiansho Tournament." (evidence only in the player's line) (`journal.jsonl:285`)
- 2026-10-02T02:48:29.124Z 1 extraction line(s) rejected: DELTA q=east_round_fought value=true evidence="We step onto the sand for our first bout of the Jiansho Tournament." (evidence only in the player's line) (`journal.jsonl:293`)
- 2026-10-02T02:51:57.279Z 1 extraction line(s) rejected: DELTA q=east_odds value=null evidence="" (missing evidence) (`journal.jsonl:475`)
- 2026-10-02T02:56:36.988Z 4 extraction line(s) rejected: DELTA q=east_odds value=null evidence="" (missing evidence); DELTA q=east_through_rounds value=false evidence="" (missing evidence); DELTA q=party_injuries value=0 evidence="" (missing evidence) (`journal.jsonl:632`)
- 2026-10-02T02:57:49.514Z 2 extraction line(s) rejected: DELTA q=east_odds value=null evidence="I'm gonna break their ribs so hard the bookies'll shit themselves." (invalid value); DELTA q=east_through_rounds value=false evidence="Next morning we walk back onto the arena sand to face the Sunset Blooms." (evidence only in the player's line) (`journal.jsonl:672`)
- 2026-10-02T02:57:56.387Z 2 extraction line(s) rejected: DELTA q=east_odds value=null evidence="I'm gonna break their ribs so hard the bookies'll shit themselves." (invalid value); DELTA q=east_through_rounds value=false evidence="Next morning we walk back onto the arena sand to face the Sunset Blooms." (evidence only in the player's line) (`journal.jsonl:685`)
- 2026-10-02T02:59:06.729Z 1 extraction line(s) rejected: DELTA q=east_through_rounds value=false evidence="Tomorrow it's the Sunset Blooms." (evidence only in the player's line) (`journal.jsonl:714`)
- 2026-10-02T02:59:13.055Z 2 extraction line(s) rejected: DELTA q=east_odds value=null evidence="I'm gonna break their ribs so hard the bookies'll shit themselves." (invalid value); DELTA q=east_through_rounds value=false evidence="Next morning we walk back onto the arena sand to face the Sunset Blooms." (evidence only in the player's line) (`journal.jsonl:723`)

### judge-fallback (26)

- 2026-10-02T02:49:24.353Z judge scene fell back (timeout) (`journal.jsonl:309`)
- 2026-10-02T02:49:26.844Z judge typed fell back (timeout) (`journal.jsonl:310`)
- 2026-10-02T02:50:43.306Z judge memoryPairs fell back (busy) (`journal.jsonl:365`)
- 2026-10-02T02:50:43.475Z judge memoryPairs fell back (busy) (`journal.jsonl:367`)
- 2026-10-02T02:50:43.475Z judge memoryPairs fell back (busy) (`journal.jsonl:368`)
- 2026-10-02T02:50:43.475Z judge memoryPairs fell back (busy) (`journal.jsonl:369`)
- 2026-10-02T02:50:43.475Z judge memoryPairs fell back (busy) (`journal.jsonl:370`)
- 2026-10-02T02:50:43.475Z judge memoryPairs fell back (busy) (`journal.jsonl:371`)
- 2026-10-02T02:50:43.475Z judge memoryPairs fell back (busy) (`journal.jsonl:372`)
- 2026-10-02T02:50:43.475Z judge memoryPairs fell back (busy) (`journal.jsonl:373`)
- 2026-10-02T02:50:43.476Z judge memoryPairs fell back (busy) (`journal.jsonl:374`)
- 2026-10-02T02:50:43.476Z judge memoryPairs fell back (busy) (`journal.jsonl:375`)
- 2026-10-02T02:50:43.476Z judge memoryPairs fell back (busy) (`journal.jsonl:376`)
- 2026-10-02T02:50:43.476Z judge memoryPairs fell back (busy) (`journal.jsonl:377`)
- 2026-10-02T02:50:43.477Z judge memoryPairs fell back (busy) (`journal.jsonl:378`)
- 2026-10-02T02:50:43.477Z judge memoryPairs fell back (busy) (`journal.jsonl:379`)
- 2026-10-02T02:50:43.477Z judge memoryPairs fell back (busy) (`journal.jsonl:380`)
- 2026-10-02T02:50:43.477Z judge memoryPairs fell back (busy) (`journal.jsonl:381`)
- 2026-10-02T02:50:43.478Z judge memoryPairs fell back (busy) (`journal.jsonl:382`)
- 2026-10-02T02:50:43.478Z judge memoryPairs fell back (busy) (`journal.jsonl:383`)
- 2026-10-02T02:50:43.478Z judge memoryPairs fell back (busy) (`journal.jsonl:384`)
- 2026-10-02T02:50:43.478Z judge memoryPairs fell back (busy) (`journal.jsonl:385`)
- 2026-10-02T02:50:43.478Z judge memoryPairs fell back (busy) (`journal.jsonl:386`)
- 2026-10-02T02:50:43.478Z judge memoryPairs fell back (busy) (`journal.jsonl:387`)
- 2026-10-02T02:50:43.478Z judge memoryPairs fell back (busy) (`journal.jsonl:388`)
- 2026-10-02T02:50:43.478Z judge memoryPairs fell back (busy) (`journal.jsonl:389`)

### console-error (1)

- 2026-10-02T02:50:43.307Z Failed to load resource: the server responded with a status of 429 (Too Many Requests) (`console.jsonl:18`)

## Draft register rows

| id | tier | severity | class | evidence | status | fix commit | eval | what |
|---|---|---|---|---|---|---|---|---|
| T3-?1 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:410` | draft |  |  | Swipe of msg 13 reverted the applied Tournament rewrite (good, wi-after-swipe.txt) but also removed the whole proposal wi-8-11 from the ring (made on msg 11, which survived the swipe): my edited+accepted rewrite and the declined op are gone, so the author's decision is lost and nothing re-applies. ring-after-swipe.txt |
| T3-?2 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:729` | draft |  |  | Curator re-proposed switching on 'Chronicle - About this book' (the book's own meta/house-style note) 3 times (wi-4-6, wi-8-11, wi-16-25) after I declined it twice: useless op, and declines are not remembered. Its latest rewrite also wanted to put 'Hanzo Hattaxi' into the open Tournament chronicle entry; declined. |
| T3-?3 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:217` | draft |  |  | 6 extraction line(s) rejected: DELTA q=east_odds value=null evidence="" (missing evidence); DELTA q=east_round_fought value=false evidence="" (missing evidence); DELTA q=east_through_rounds value=false evidence="" (missing evidence) |
| T3-?4 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:230` | draft |  |  | 6 extraction line(s) rejected: DELTA q=east_odds value=null evidence="" (missing evidence); DELTA q=east_round_fought value=false evidence="" (missing evidence); DELTA q=east_through_rounds value=false evidence="" (missing evidence) |
| T3-?5 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:242` | draft |  |  | 1 extraction line(s) rejected: DELTA q=east_odds value=null evidence="Though I must confess, I find the odds far more interesting when they're... uncertain." (invalid value) |
| T3-?6 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:285` | draft |  |  | 1 extraction line(s) rejected: DELTA q=east_round_fought value=true evidence="We step onto the sand for our first bout of the Jiansho Tournament." (evidence only in the player's line) |
| T3-?7 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:293` | draft |  |  | 1 extraction line(s) rejected: DELTA q=east_round_fought value=true evidence="We step onto the sand for our first bout of the Jiansho Tournament." (evidence only in the player's line) |
| T3-?8 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:309` | draft |  |  | judge scene fell back (timeout) |
| T3-?9 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:310` | draft |  |  | judge typed fell back (timeout) |
| T3-?10 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:365` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?11 | T3 |  |  | `test/sessions/T3/T3-5-1/console.jsonl:18` | draft |  |  | Failed to load resource: the server responded with a status of 429 (Too Many Requests) |
| T3-?12 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:367` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?13 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:368` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?14 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:369` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?15 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:370` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?16 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:371` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?17 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:372` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?18 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:373` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?19 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:374` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?20 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:375` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?21 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:376` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?22 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:377` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?23 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:378` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?24 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:379` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?25 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:380` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?26 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:381` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?27 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:382` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?28 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:383` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?29 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:384` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?30 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:385` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?31 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:386` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?32 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:387` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?33 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:388` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?34 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:389` | draft |  |  | judge memoryPairs fell back (busy) |
| T3-?35 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:475` | draft |  |  | 1 extraction line(s) rejected: DELTA q=east_odds value=null evidence="" (missing evidence) |
| T3-?36 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:632` | draft |  |  | 4 extraction line(s) rejected: DELTA q=east_odds value=null evidence="" (missing evidence); DELTA q=east_through_rounds value=false evidence="" (missing evidence); DELTA q=party_injuries value=0 evidence="" (missing evidence) |
| T3-?37 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:672` | draft |  |  | 2 extraction line(s) rejected: DELTA q=east_odds value=null evidence="I'm gonna break their ribs so hard the bookies'll shit themselves." (invalid value); DELTA q=east_through_rounds value=false evidence="Next morning we walk back onto the arena sand to face the Sunset Blooms." (evidence only in the player's line) |
| T3-?38 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:685` | draft |  |  | 2 extraction line(s) rejected: DELTA q=east_odds value=null evidence="I'm gonna break their ribs so hard the bookies'll shit themselves." (invalid value); DELTA q=east_through_rounds value=false evidence="Next morning we walk back onto the arena sand to face the Sunset Blooms." (evidence only in the player's line) |
| T3-?39 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:702` | draft |  |  | 10 boundaries without a transition at east-the-rounds while its exits were pending |
| T3-?40 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:714` | draft |  |  | 1 extraction line(s) rejected: DELTA q=east_through_rounds value=false evidence="Tomorrow it's the Sunset Blooms." (evidence only in the player's line) |
| T3-?41 | T3 |  |  | `test/sessions/T3/T3-5-1/journal.jsonl:723` | draft |  |  | 2 extraction line(s) rejected: DELTA q=east_odds value=null evidence="I'm gonna break their ribs so hard the bookies'll shit themselves." (invalid value); DELTA q=east_through_rounds value=false evidence="Next morning we walk back onto the arena sand to face the Sunset Blooms." (evidence only in the player's line) |

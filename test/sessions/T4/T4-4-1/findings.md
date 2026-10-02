# Findings draft: T4-4

Session `test/sessions/T4/T4-4-1`. Draft rows for `docs/plans/v2.6/14-findings.md`; severity and class are decided in the review.

## Counts

- flags: 2
- stall: 0
- extraction-rejected: 1
- empty-private-block: 0
- lore-force-lost: 0
- lore-constant-missed: 0
- judge-fallback: 3
- save-lost: 0
- unexpected-jump: 0
- rollback: 7
- console-error: 0
- model-call-failure: 0
- model-defect: 0
- harness-error: 0

## Judge health

- calls: 223 (answered 220, busy 0, timeout 3, other fallbacks 0)
- busy rate: 0.0%
- a busy fallback was never sent: the lane's judge rate limit (or a TypeSafe 429 passed through) held it, and the consumer took its no-judge path

## Model defects

None detected.

## Flags

### 2026-10-02T05:10:45.993Z (message -1)

- note: Restart story turned Author view off in this chat: before Restart the Overview footer had Edit story (author view on, card is author mode); after Restart only Restart story is shown and extras.ui.authorView is false. Messages kept (13), memory cleared, path reset to guild-hall, WI replayed. The journal also starts over with no record that a restart happened.
- evidence: `journal.jsonl:423`
- context (event-time):
  - #9 Max Nightriver: Tobias, what's the catch with the Wendhope posting?
  - #10 Adolion Narrator: Tobias's eyes narrow, and he slowly lowers the pouch. "You have the sense to ask the right question. Most just see the coin and walk off." He glances around to make sure the surrounding guild-mates aren't listening. "There's no official catch. The Sheridans simply... they have a history of being was
  - #11 Max Nightriver: Fine. We'll take Wendhope. Put us down as the Ash Lanterns.
  - #12 Adolion Narrator: Ellie's pen stops mid-stroke over the register. She blinks, her blue eyes flicking up to meet your gaze. "The Ash Lanterns," she repeats softly, testing the name. A small, uncertain smile touches her lips. "That's... dark. But memorable." She crosses out "The Second Tries" with two quick lines and w

### 2026-10-02T05:17:11.328Z (message 21)

- note: Save/apply wording confused me: after an invalidating save where I chose Cancel, the Studio toolbar said 'Saved ... v31 to the library. Applied to this chat: this chat kept its version — author kept this chat on its pinned version.' Nothing was applied (still v30, drifted), so it should read 'Not applied to this chat: ...'; the reason is also said twice.
- evidence: `journal.jsonl:662`
- context (event-time):
  - #18 Max Nightriver: We keep moving north. Anyone else notice there's no traffic on this road?
  - #19 Adolion Narrator: Dalan's horse slows, his eyes scanning the treeline. "I've been watching," he says quietly. "Not just the lack of traffic. There's no wildlife either. No birds in the canopy, no squirrels in the brush. Even the insects are quiet." The silence hangs heavy over the road, broken only by the steady thru
  - #20 Adolion Narrator: A riderless horse in Sheridan blue comes down the road at a walk, still saddled.
  - **#21 Belle: Belle slows her horse to a trot, her brown eyes fixed on the overturned cart ahead. "Doesn't look like bandits," she says, her voice low and sharp. "Bandits would've taken the goods. Doesn't look like a crash, either. Wheel's clean-snapped, not shattered." She shifts Cleaver to a tighter grip, the g**

## Anomalies

### extraction-rejected (1)

- 2026-10-02T05:15:05.477Z 1 extraction line(s) rejected: DELTA q=location value="north_road" evidence="We keep moving north. Anyone else notice there's no traffic on this road?" (evidence only in the player's line) (`journal.jsonl:650`)

### judge-fallback (3)

- 2026-10-02T05:01:38.608Z judge warden fell back (timeout) (`journal.jsonl:161`)
- 2026-10-02T05:01:38.701Z judge wardenLore fell back (timeout) (`journal.jsonl:162`)
- 2026-10-02T05:14:35.627Z judge director fell back (timeout) (`journal.jsonl:608`)

### rollback (7)

- 2026-10-02T05:11:30.286Z boundary went back from 8 to 1 (`journal.jsonl:437`)
- 2026-10-02T05:12:19.269Z boundary went back from 8 to 2 (`journal.jsonl:523`)
- 2026-10-02T05:13:16.350Z boundary went back from 8 to 3 (`journal.jsonl:570`)
- 2026-10-02T05:14:34.272Z boundary went back from 8 to 4 (`journal.jsonl:607`)
- 2026-10-02T05:14:58.628Z boundary went back from 8 to 5 (`journal.jsonl:635`)
- 2026-10-02T05:14:58.876Z boundary went back from 8 to 6 (`journal.jsonl:636`)
- 2026-10-02T05:20:10.906Z boundary went back from 8 to 7 (`journal.jsonl:728`)

## Draft register rows

| id | tier | severity | class | evidence | status | fix commit | eval | what |
|---|---|---|---|---|---|---|---|---|
| T4-?1 | T4 |  |  | `test/sessions/T4/T4-4-1/journal.jsonl:423` | draft |  |  | Restart story turned Author view off in this chat: before Restart the Overview footer had Edit story (author view on, card is author mode); after Restart only Restart story is shown and extras.ui.authorView is false. Messages kept (13), memory cleared, path reset to guild-hall, WI replayed. The journal also starts over with no record that a restart happened. |
| T4-?2 | T4 |  |  | `test/sessions/T4/T4-4-1/journal.jsonl:662` | draft |  |  | Save/apply wording confused me: after an invalidating save where I chose Cancel, the Studio toolbar said 'Saved ... v31 to the library. Applied to this chat: this chat kept its version — author kept this chat on its pinned version.' Nothing was applied (still v30, drifted), so it should read 'Not applied to this chat: ...'; the reason is also said twice. |
| T4-?3 | T4 |  |  | `test/sessions/T4/T4-4-1/journal.jsonl:161` | draft |  |  | judge warden fell back (timeout) |
| T4-?4 | T4 |  |  | `test/sessions/T4/T4-4-1/journal.jsonl:162` | draft |  |  | judge wardenLore fell back (timeout) |
| T4-?5 | T4 |  |  | `test/sessions/T4/T4-4-1/journal.jsonl:437` | draft |  |  | boundary went back from 8 to 1 |
| T4-?6 | T4 |  |  | `test/sessions/T4/T4-4-1/journal.jsonl:523` | draft |  |  | boundary went back from 8 to 2 |
| T4-?7 | T4 |  |  | `test/sessions/T4/T4-4-1/journal.jsonl:570` | draft |  |  | boundary went back from 8 to 3 |
| T4-?8 | T4 |  |  | `test/sessions/T4/T4-4-1/journal.jsonl:607` | draft |  |  | boundary went back from 8 to 4 |
| T4-?9 | T4 |  |  | `test/sessions/T4/T4-4-1/journal.jsonl:608` | draft |  |  | judge director fell back (timeout) |
| T4-?10 | T4 |  |  | `test/sessions/T4/T4-4-1/journal.jsonl:635` | draft |  |  | boundary went back from 8 to 5 |
| T4-?11 | T4 |  |  | `test/sessions/T4/T4-4-1/journal.jsonl:636` | draft |  |  | boundary went back from 8 to 6 |
| T4-?12 | T4 |  |  | `test/sessions/T4/T4-4-1/journal.jsonl:650` | draft |  |  | 1 extraction line(s) rejected: DELTA q=location value="north_road" evidence="We keep moving north. Anyone else notice there's no traffic on this road?" (evidence only in the player's line) |
| T4-?13 | T4 |  |  | `test/sessions/T4/T4-4-1/journal.jsonl:728` | draft |  |  | boundary went back from 8 to 7 |

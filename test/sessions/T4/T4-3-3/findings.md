# Findings draft: T4-3

Session `test/sessions/T4/T4-3-3`. Draft rows for `docs/plans/v2.6/14-findings.md`; severity and class are decided in the review.

## Counts

- flags: 2
- stall: 2
- extraction-rejected: 2
- empty-private-block: 0
- lore-force-lost: 0
- lore-constant-missed: 0
- judge-fallback: 5
- save-lost: 0
- unexpected-jump: 0
- rollback: 0
- console-error: 0
- model-call-failure: 0
- model-defect: 1
- harness-error: 0

### By chat

- `2026-10-02@05h36m11s589ms`: judge-fallback 2, extraction-rejected 1
- `2026-10-02@05h36m22s833ms`: model-defect 1, judge-fallback 1, stall 1, extraction-rejected 1
- `2026-10-02@05h54m03s829ms`: judge-fallback 2, stall 1

## Judge health

- calls: 453 (answered 448, busy 0, timeout 5, other fallbacks 0)
- busy rate: 0.0%
- a busy fallback was never sent: the lane's judge rate limit (or a TypeSafe 429 passed through) held it, and the consumer took its no-judge path

## Model defects

- 1 turn(s) with a defective reply: loop 0, corrupt 1; swiped once by the loop guard: 0; left in the chat (not the last reply): 1 message(s)

## Flags

### 2026-10-02T08:50:35.405Z (message 15)

- note: model defect: corrupt
- evidence: `journal.jsonl:572`
- context (end-of-session):
  - #12 Adolion Narrator: Fiana lets out a sharp exhale, half-laugh and half-sigh, her curls bouncing as she shakes her head. "Honestly? Most days probably wishes you'd just stop existing so she'd have one less person to avoid." *She leans her elbows on the table, blue eyes reflecting the tavern's warm amber light.* "Jasira 
  - #13 Max Nightriver: Vallie, is Domas your friend, or just someone you work beside?
  - #14 Vallie: *Vallie's blue eye widens before a laugh erupts from her chest, sharp and genuine. She slaps a hand against her thigh with enough force to make it sound like a gunshot.* "Work beside? Kid, I'd follow that pointy-eared bastard into the maw of the Lich Queen herself if she tried to claw her way back t
  - **#15 Domas: *Domas doesn't look up from the clipboard immediately, but there is a subtle softening to his jaw at Vallie's words.* "The Guildmaster is prone to dramatics." *He finally meets Max's gaze, red eyes calm and measured, though not entirely devoid of warmth.* "We have been through enough together that '**
  - #16 Max Nightriver: Fiana, I want you at my back on whatever comes next. Partners?
  - #17 Adolion Narrator: *The tavern's warmth seems to pool around Fiana, the amber lantern light catching in her red curls as she processes the offer. Her blue eyes widen, then narrow with a sharp, focused intelligence. The softness of moments ago hardens into something steeled.*
  - #18 Vallie: *Vallie's blue eye tracks the exchange from the edge of the tavern, one scarred hand resting on her hip. A faint, knowing smirk tugs at the corner of her mouth.* "Well now. That's a bold move for a noble heir." *She lets out a low whistle, her tone shifting to something more approving.* "Most high-b

### 2026-10-02T08:50:35.852Z (message 15)

- note: model defect left in the chat: message 14 (corrupt)
- evidence: `journal.jsonl:573`
- context (end-of-session):
  - (#12-#14 as in the flag above)
  - **#15 Domas: *Domas doesn't look up from the clipboard immediately, but there is a subtle softening to his jaw at Vallie's words.* "The Guildmaster is prone to dramatics." *He finally meets Max's gaze, red eyes calm and measured, though not entirely devoid of warmth.* "We have been through enough together that '**
  - (#16-#18 as in the flag above)

## Anomalies

### stall (2)

- 2026-10-02T08:51:31.186Z 10 boundaries without a transition at aegis-homecoming while its exits were pending (x2, last 2026-10-02T09:01:10.887Z) (`journal.jsonl:599`, `journal.jsonl:978`)

### extraction-rejected (2)

- 2026-10-02T08:44:08.177Z 1 extraction line(s) rejected: DELTA q=aegis_exam_entered value=false evidence="The Guild announces it will put the party forward for the C-rank promotion exam; Domas brings written terms and Ellie has the forms ready, but no one has signed yet." (evidence not in window) (`journal.jsonl:306`)
- 2026-10-02T08:53:09.992Z 1 extraction line(s) rejected: DELTA q=aegis_exam_declined value=false evidence="Fiana, I want you at my back on whatever comes next. Partners?" DELTA q=aegis_exam_entered value=false evidence="Fiana, I want you at my back on whatever comes next. Partners?" DELTA q=guild_reputation value=3 evidence="Fiana, I want you at my back on whatever comes next. Partners?" DELTA q=location value="aegis_guild_tavern" evidence="The tavern's warmth seems to pool around Fiana, the amber lantern light catching in her red curls as she process (degenerate response) (`journal.jsonl:680`)

### judge-fallback (5)

- 2026-10-02T08:43:57.197Z judge director fell back (timeout) (`journal.jsonl:291`)
- 2026-10-02T08:43:59.703Z judge scene fell back (timeout) (x4, last 2026-10-02T09:01:13.857Z) (`journal.jsonl:292`, `journal.jsonl:589`, `journal.jsonl:952`, `journal.jsonl:981`)

### model-defect (1)

- 2026-10-02T08:49:27.668Z model corrupt in message 14 (Vallie): .* "He's the kind of friend who'll tell you you're an idiot to your face and then throw (left in the chat) (`turns.jsonl:15`)

## Draft register rows

| id | tier | severity | class | evidence | status | fix commit | eval | what |
|---|---|---|---|---|---|---|---|---|
| T4-?1 | T4 |  |  | `test/sessions/T4/T4-3-3/journal.jsonl:572` | draft |  |  | model defect: corrupt |
| T4-?2 | T4 |  |  | `test/sessions/T4/T4-3-3/journal.jsonl:573` | draft |  |  | model defect left in the chat: message 14 (corrupt) |
| T4-?3 | T4 |  |  | `test/sessions/T4/T4-3-3/journal.jsonl:291` | draft |  |  | judge director fell back (timeout) |
| T4-?4 | T4 |  |  | `test/sessions/T4/T4-3-3/journal.jsonl:292` | draft |  |  | judge scene fell back (timeout) (x4; every row in findings.json) |
| T4-?5 | T4 |  |  | `test/sessions/T4/T4-3-3/journal.jsonl:306` | draft |  |  | 1 extraction line(s) rejected: DELTA q=aegis_exam_entered value=false evidence="The Guild announces it will put the party forward for the C-rank promotion exam; Domas brings written terms and Ellie has the forms ready, but no one has signed yet." (evidence not in window) |
| T4-?6 | T4 |  |  | `test/sessions/T4/T4-3-3/turns.jsonl:15` | draft |  |  | model corrupt in message 14 (Vallie): .* "He's the kind of friend who'll tell you you're an idiot to your face and then throw (left in the chat) |
| T4-?8 | T4 |  |  | `test/sessions/T4/T4-3-3/journal.jsonl:599` | draft |  |  | 10 boundaries without a transition at aegis-homecoming while its exits were pending (x2; every row in findings.json) |
| T4-?9 | T4 |  |  | `test/sessions/T4/T4-3-3/journal.jsonl:680` | draft |  |  | 1 extraction line(s) rejected: DELTA q=aegis_exam_declined value=false evidence="Fiana, I want you at my back on whatever comes next. Partners?" DELTA q=aegis_exam_entered value=false evidence="Fiana, I want you at my back on whatever comes next. Partners?" DELTA q=guild_reputation value=3 evidence="Fiana, I want you at my back on whatever comes next. Partners?" DELTA q=location value="aegis_guild_tavern" evidence="The tavern's warmth seems to pool around Fiana, the amber lantern light catching in her red curls as she process (degenerate response) |

## Session notes (run 3, written by the player)

Played 2026-10-02 08:36-09:04Z on lane 1, fresh adolion-fresh seed (pin be0696b), served dev bundle `d6737acda880` (same bundle as run 2; master moved to d7f975bf mid-session, allowed by `--served-identity`), player mode, media off. Stop: `valid: true`, header diff 0 blocking (`lorebookCount 24->26`, the three deleted chats declared, group cast).

Chats: one `2026-10-02@05h36m11s589ms` (book at boundary 10 after 8 bond turns), two `2026-10-02@05h36m22s833ms` (book at boundary 11 after 8 turns), three `2026-10-02@05h54m03s829ms` (new-chat + adopt, book at boundary 10 after 8 turns). All `so_` entries enabled in both books before the deletes (`evidence/mirror-books-before-deletes.json`).

All three deletes ran IN-SESSION through `so-session delete-chat` (harness fix 8c57188c works):

| chat | --book | prompt found | book before | book after | asAnswered | journal |
|---|---|---|---|---|---|---|
| one | keep | yes | listed | listed | true | `journal.jsonl:673` Kept ... |
| two | delete | yes | listed | gone (server list + worldInfoCache) | true | `journal.jsonl:697` Deleted ... |
| three | escape | yes | listed | listed | true | `journal.jsonl:1010` Kept ...: the question was closed without an answer. |

Rows `turns.jsonl:17`, `:19`, `:30`; each `ok: true`, `deleted: true`, `problems: []`, no unexpected popup. Repair "Nothing is missing.", `orphanedLorebooks: []`, 0 open dialogs after each (`evidence/after-*.json`, `shots/018`, `020`, `031`).

Findings:
- LOW (product copy): chats one and two were created in the same minute, so their prompts are identical ("chat started 2026-10-02 05:36") except for the muted `Lorebook: <file name>` line. The title also drops the colon ("Adolion Between the Roads"). Evidence `turns.jsonl:17`, `turns.jsonl:19`.
- LOW (product, carried from run 2): the reaper decision is journaled into whichever chat ST opens next (chat one's Keep into chat two; chat two's Delete and chat three's Escape into the seed chat `05h30m40s485ms` at boundary 1). The detail names the right book and chat.
- LOW (harness): the model-defect detector's "doubled word" rule (`scripts/debug/lib/modelDefects.mts:45`, `\b(\p{L}{2,})\s+\1\b`) fired on legitimate "tell you you're an idiot" (Vallie, message 14, chat two): `\b` matches before the apostrophe. It raised the two auto flags and the model-defect count of 1 (`turns.jsonl:15`, `journal.jsonl:572-573`). Not a model defect.
- Expected: 2 stalls at Homecoming (bond talk, no exam choice), 5 judge timeouts (director 1, scene 4), 2 extraction rejections (one evidence-not-in-window, one degenerate response).

# Findings draft: T4-4

Session `test/sessions/T4/T4-4-2`. Draft rows for `docs/plans/v2.6/14-findings.md`; severity and class are decided in the review.

## Counts

- flags: 3
- stall: 0
- extraction-rejected: 3
- empty-private-block: 0
- lore-force-lost: 0
- lore-constant-missed: 0
- judge-fallback: 0
- save-lost: 1
- unexpected-jump: 0
- rollback: 4
- console-error: 0
- model-call-failure: 0
- model-defect: 0
- harness-error: 0

## Judge health

- calls: 188 (answered 188, busy 0, timeout 0, other fallbacks 0)
- busy rate: 0.0%
- a busy fallback was never sent: the lane's judge rate limit (or a TypeSafe 429 passed through) held it, and the consumer took its no-judge path

## Model defects

None detected.

## Flags

### 2026-10-02T05:39:19.484Z (message -1)

- note: Restart story turned Author view off: before Restart the Overview footer had Edit story (extras.ui.authorView true, author-mode card); after Restart only Restart story shows and authorView is false. Messages kept (7), memory and path cleared, WI replayed. The journal restarts at 1 entry with no record that a restart happened. Same in run T4-4-1.
- evidence: `journal.jsonl:357`
- context (event-time):
  - #3 Max Nightriver: We take Wendhope as the Second Tries. Belle, Dalan, you're with me. Ellie, write us down.
  - #4 Ellie: Ellie's pen hovers for a fraction of a second, her blue eyes widening as she glances toward the tavern arch. "T-the Second Tries?" A soft blush colors her cheeks, and she quickly looks back to her register. "Right. Yes. Of course." Her hand moves across the page in practiced, elegant script, the nib
  - #5 Belle: "The Second Tries." Belle straightens up from the arch, her boredom replaced by a sharp, calculating look as her brown eyes size Max up and down. She doesn't smile, but there's a flicker of interest in the way she shifts her weight. "Not a name that screams 'we're gonna get ourselves killed,' at lea
  - #6 Dalan: Dalan finally lets his gaze drift from the notices, his blue-grey eyes moving to Max with quiet curiosity. He shifts his weight, the green of his capelet rustling softly, and offers a tentative, polite smile that doesn't quite reach his eyes. "Dalan Evergreen," he says, his voice soft-spoken but cle

### 2026-10-02T05:46:54.631Z (message 5)

- note: After switching chats (ST openGroupChat, the chat-list path), the story drawer kept rendering the PREVIOUS chat for a while: B (player view, Ash Lanterns) showed A's story so far ('formed the Second Tries'), A's engine panel (boundary 6), Author view checked, Blackboard/Scheduler/Payload tabs and Edit story; A showed B's threads ('join the Ash Lanterns') with author view off. getSnapshot() was right for the open chat the whole time. Reproduced 4 switches in a row at ~5 s; healed by itself within ~60 s. Evidence shots/x-*-switch-*.png, x-stale-*.json.
- evidence: `journal.jsonl:604`
- context (event-time):
  - #2 Ellie: Ellie's blue eyes widen slightly, then she leans forward with an excited flutter. "Oh! The Ash Lanterns, what a lovely name. Yes, yes." Her pen dances across the Guild's register in elegant script, then she looks up, blushing faintly. "You're all... you're really forming a party? Together?" *She gla
  - #3 Max Nightriver: We set out north at once.
  - #4 Adolion Narrator: Tobias steps forward, his blue eyes sharp. "Wait. You're taking the Wendhope posting, and you're going now, without so much as a provision list or a map?" He taps the notice again, harder this time. "The Sheridans aren't paying this much for a simple rescue. Something is keeping a whole mining villa
  - **#5 Tobias: "Just wait—you need supplies. Bread, salted pork, and more importantly, water skins for the trek. The road north is dry." *He reaches for a small pouch on the counter and sets it down with a decisive click.* "Here. A basic ration pack. On the Guild's account. You'll be needing it if you're not plann**

### 2026-10-02T05:52:42.936Z (message 15)

- note: Save/apply wording: after the invalidating save, choosing Cancel left this chat on v30 (drifted) but the Studio toolbar said 'Saved ... v31 to the library. Applied to this chat: this chat kept its version — author kept this chat on its pinned version.' Expected 'Not applied to this chat: ...'; the reason is also stated twice. The popup's Cancel line says 'keeps playing the version it started with', but this chat started on v29 and plays v30 after the hot-swap.
- evidence: `journal.jsonl:613`
- context (event-time):
  - #12 Adolion Narrator: A riderless horse in Sheridan blue comes down the road at a walk, still saddled.
  - #13 Max Nightriver: We keep moving north. Anyone else notice there's no traffic on this road?
  - #14 Dalan: "No one has passed us since the border," Dalan says quietly, his eyes scanning the treeline. "And it's not just travellers. Look at the carts." He gestures toward an overturned carriage a few hundred yards ahead—its cargo still lashed down, as if it had been abandoned in haste rather than plundered.
  - **#15 Belle: "I noticed, scout." Belle's brown eyes narrow as she looks down the long, empty stretch of road. "Doesn't sit right. Abandoned carts with all their gear still strapped on—that's not bandits, and it ain't some natural disaster." *She shifts Cleaver on her shoulder, her grip tightening on the haft. Th**

## Anomalies

### extraction-rejected (3)

- 2026-10-02T05:35:06.657Z 4 extraction line(s) rejected: DELTA q=party_rank value=0 evidence="The notice is D-rank," she adds, her voice regaining its steady, guild-receptionist clarity. (unrecognized line); DELTA q=tension_current value="calm" evidence="The notice is D-rank," she adds, her voice regaining its steady, guild-receptionist clarity. (unrecognized line); FACT importance=2 text="The Wendhope posting is D-rank and concerns Sheridan land, north of the city." evidence="The notice is D-rank," she adds, her voice regaining its steady, guild-receptionist clarity. (unrecognized line) (`journal.jsonl:129`)
- 2026-10-02T05:35:27.996Z 1 extraction line(s) rejected: DELTA q=party_rank value=0 evidence="The notice is D-rank," she adds, her voice regaining its steady, guild-receptionist clarity. (unrecognized line) (`journal.jsonl:163`)
- 2026-10-02T05:40:14.115Z 1 extraction line(s) rejected: DELTA q=adv_looking_for_hands value=false evidence="We take Wendhope as the Second Tries. Belle, Dalan, you're with me. Ellie, write us down." (evidence only in the player's line) (`journal.jsonl:404`)

### save-lost (1)

- 2026-10-02T05:45:20.956Z save not confirmed (`journal.jsonl:577`)

### rollback (4)

- 2026-10-02T05:40:07.602Z boundary went back from 5 to 1 (`journal.jsonl:381`)
- 2026-10-02T05:40:50.694Z boundary went back from 5 to 2 (`journal.jsonl:420`)
- 2026-10-02T05:41:12.792Z boundary went back from 5 to 3 (`journal.jsonl:467`)
- 2026-10-02T05:41:46.847Z boundary went back from 5 to 4 (`journal.jsonl:497`)

## Draft register rows

| id | tier | severity | class | evidence | status | fix commit | eval | what |
|---|---|---|---|---|---|---|---|---|
| T4-?1 | T4 |  |  | `test/sessions/T4/T4-4-2/journal.jsonl:357` | draft |  |  | Restart story turned Author view off: before Restart the Overview footer had Edit story (extras.ui.authorView true, author-mode card); after Restart only Restart story shows and authorView is false. Messages kept (7), memory and path cleared, WI replayed. The journal restarts at 1 entry with no record that a restart happened. Same in run T4-4-1. |
| T4-?2 | T4 |  |  | `test/sessions/T4/T4-4-2/journal.jsonl:604` | draft |  |  | After switching chats (ST openGroupChat, the chat-list path), the story drawer kept rendering the PREVIOUS chat for a while: B (player view, Ash Lanterns) showed A's story so far ('formed the Second Tries'), A's engine panel (boundary 6), Author view checked, Blackboard/Scheduler/Payload tabs and Edit story; A showed B's threads ('join the Ash Lanterns') with author view off. getSnapshot() was right for the open chat the whole time. Reproduced 4 switches in a row at ~5 s; healed by itself within ~60 s. Evidence shots/x-*-switch-*.png, x-stale-*.json. |
| T4-?3 | T4 |  |  | `test/sessions/T4/T4-4-2/journal.jsonl:613` | draft |  |  | Save/apply wording: after the invalidating save, choosing Cancel left this chat on v30 (drifted) but the Studio toolbar said 'Saved ... v31 to the library. Applied to this chat: this chat kept its version — author kept this chat on its pinned version.' Expected 'Not applied to this chat: ...'; the reason is also stated twice. The popup's Cancel line says 'keeps playing the version it started with', but this chat started on v29 and plays v30 after the hot-swap. |
| T4-?4 | T4 |  |  | `test/sessions/T4/T4-4-2/journal.jsonl:129` | draft |  |  | 4 extraction line(s) rejected: DELTA q=party_rank value=0 evidence="The notice is D-rank," she adds, her voice regaining its steady, guild-receptionist clarity. (unrecognized line); DELTA q=tension_current value="calm" evidence="The notice is D-rank," she adds, her voice regaining its steady, guild-receptionist clarity. (unrecognized line); FACT importance=2 text="The Wendhope posting is D-rank and concerns Sheridan land, north of the city." evidence="The notice is D-rank," she adds, her voice regaining its steady, guild-receptionist clarity. (unrecognized line) |
| T4-?5 | T4 |  |  | `test/sessions/T4/T4-4-2/journal.jsonl:163` | draft |  |  | 1 extraction line(s) rejected: DELTA q=party_rank value=0 evidence="The notice is D-rank," she adds, her voice regaining its steady, guild-receptionist clarity. (unrecognized line) |
| T4-?6 | T4 |  |  | `test/sessions/T4/T4-4-2/journal.jsonl:381` | draft |  |  | boundary went back from 5 to 1 |
| T4-?7 | T4 |  |  | `test/sessions/T4/T4-4-2/journal.jsonl:404` | draft |  |  | 1 extraction line(s) rejected: DELTA q=adv_looking_for_hands value=false evidence="We take Wendhope as the Second Tries. Belle, Dalan, you're with me. Ellie, write us down." (evidence only in the player's line) |
| T4-?8 | T4 |  |  | `test/sessions/T4/T4-4-2/journal.jsonl:420` | draft |  |  | boundary went back from 5 to 2 |
| T4-?9 | T4 |  |  | `test/sessions/T4/T4-4-2/journal.jsonl:467` | draft |  |  | boundary went back from 5 to 3 |
| T4-?10 | T4 |  |  | `test/sessions/T4/T4-4-2/journal.jsonl:497` | draft |  |  | boundary went back from 5 to 4 |
| T4-?11 | T4 |  |  | `test/sessions/T4/T4-4-2/journal.jsonl:577` | draft |  |  | save not confirmed |

# Findings draft: T5-1

Session `test/sessions/T5/T5-1-1`. Draft rows for `docs/plans/v2.6/14-findings.md`; severity and class are decided in the review.

## INVALID SESSION

- stop marked the session INVALID: required artifact ratingCandidates: 0 captured, the card needs at least 1

The counts below cover only what was captured.

## Counts

- flags: 4
- stall: 1
- extraction-rejected: 1
- empty-private-block: 0
- lore-force-lost: 0
- lore-constant-missed: 0
- judge-fallback: 22
- save-lost: 0
- unexpected-jump: 0
- rollback: 0
- console-error: 0
- model-call-failure: 0
- model-defect: 0
- harness-error: 0

## Judge health

- calls: 289 (answered 267, busy 0, timeout 22, other fallbacks 0)
- busy rate: 0.0%
- a busy fallback was never sent: the lane's judge rate limit (or a TypeSafe 429 passed through) held it, and the consumer took its no-judge path

## Model defects

None detected.

## Flags

### 2026-10-02T10:54:51.352Z (message -1)

- note: Provocation: asked the agent (author note) to write a lorebook for another story (The Sun Ruins Expedition). It did not refuse: it proposed createStoryLorebook + 2 entries for the foreign book as provisioning cards (they waited; operator loop applied them by mistake).
- evidence: `turns.jsonl:4`

### 2026-10-02T11:00:50.621Z (message -1)

- note: Start checkpoint cast_changes disable lists roster ids (lord_vael, lady_corvane, ashmere_envoy); resolveGroupMemberId cannot resolve them, so the effect is skipped silently: no ledger row, no journal, group disabled_members stays []. All three houses are active from message 0. Studio diagnostics did not warn.
- evidence: `journal.jsonl:87`
- context (event-time):
  - #0 Master Ilse: *The workshop smells of lamp oil and iron gall. Master Ilse moves down the drying racks with a brass rule, tapping each sheet flat, and stops at the end of the row without turning around.*  "You're still here. Good — a map that dries crooked is a map that lies." *She sets the rule down and finally l

### 2026-10-02T11:11:40.954Z (message 17)

- note: Master Ilse reply (msg 17) is empty: 5487 chars of reasoning, no content (thinking used the whole response budget). Harness did not treat it as a defect; swiping.
- evidence: `journal.jsonl:204`
- context (event-time):
  - #14 Lady Corvane: *Lady Corvane's expression does not shift, not even as Lord Vael speaks. She looks at the apprentice with the same terrible patience she would bring to anything that must eventually be unmade.* "We did not need to be told." *Her voice is flat, devoid of the amusement that colored Vael's words.* "The
  - #15 Ashmere Envoy: *The Envoy watches the apprentice's realization with the quiet patience of a curator observing a rare item's proper placement in a collection. She doesn't flinch at the other houses' admissions, nor does she react to Lady Corvane's harsh words about plagues and problems. Instead, she opens her ledge
  - #16 Max Nightriver: *I whisper to Master Ilse.* If I stop inking, does the kingdom stop changing? Or does it freeze the way I left it?
  - **#17 Master Ilse: **

### 2026-10-02T11:53:28.979Z (message 64)

- note: Second empty Master Ilse reply left in the chat (msgs 24 and 58: reasoning only, no content); the harness model-defect check did not catch them. After 20 turns the story is still at flight: ink_awareness 3 of 5 despite explicit understanding lines.
- evidence: `journal.jsonl:768`
- context (event-time):
  - #61 Lady Corvane: *Lady Corvane watches from the shadows of the loft, her grey-clad figure barely visible against the crimson shimmer of the barrier. She does not move to stop the apprentice, but her silence is as heavy as a sentence.* "You cannot unmake what has already been written." *Her voice carries no emotion, 
  - #62 Max Nightriver: *Dawn grays the sky. I watch the river line hold.* Master, it stayed. The redraw I chose held. What do I do with a hand like this?
  - #63 Master Ilse: *Master Ilse's expression shifts—not to a smile, but to something that might be relief. She looks at the held line, then at the eastern sky where the grey is already bruising with the first hint of gold.* "You learn to live with it." *Her voice is quiet, absolute.* "You learn which lines to draw and
  - **#64 Ashmere Envoy: *The Envoy remains exactly where she is in the workshop below, her gaze fixed on the spot where the red barrier bleeds into the stone walls and fades. She hears the apprentice's question, carries it for a moment, then speaks—her voice low and clear, drifting upward through the loft.* "You preserve i**

## Anomalies

### stall (1)

- 2026-10-02T11:22:58.695Z 10 boundaries without a transition at flight while its exits were pending (`journal.jsonl:356`)

### extraction-rejected (1)

- 2026-10-02T11:25:41.983Z 1 extraction line(s) rejected: DELTA q=tension_current value="critical" evidence="You may climb for a time. You may even think you have escaped. But you carry the map, apprentice. And every map has a destination. I am the end of yours." (evidence not in window) (`journal.jsonl:388`)

### judge-fallback (22)

- 2026-10-02T11:04:06.048Z judge wardenLore fell back (timeout) (x7, last 2026-10-02T11:45:39.464Z) (`journal.jsonl:111`, `journal.jsonl:135`, `journal.jsonl:277`, `journal.jsonl:409`, `journal.jsonl:553`, and 2 more)
- 2026-10-02T11:06:22.964Z judge scene fell back (timeout) (x5, last 2026-10-02T11:52:11.813Z) (`journal.jsonl:133`, `journal.jsonl:440`, `journal.jsonl:448`, `journal.jsonl:549`, `journal.jsonl:765`)
- 2026-10-02T11:06:24.464Z judge warden fell back (timeout) (x5, last 2026-10-02T11:52:13.325Z) (`journal.jsonl:134`, `journal.jsonl:276`, `journal.jsonl:450`, `journal.jsonl:550`, `journal.jsonl:766`)
- 2026-10-02T11:29:17.257Z judge stall fell back (timeout) (x4, last 2026-10-02T11:45:39.628Z) (`journal.jsonl:410`, `journal.jsonl:449`, `journal.jsonl:595`, `journal.jsonl:635`)
- 2026-10-02T11:37:30.435Z judge lore fell back (timeout) (`journal.jsonl:544`)

## Draft register rows

| id | tier | severity | class | evidence | status | fix commit | eval | what |
|---|---|---|---|---|---|---|---|---|
| T5-?1 | T5 |  |  | `test/sessions/T5/T5-1-1/turns.jsonl:4` | draft |  |  | Provocation: asked the agent (author note) to write a lorebook for another story (The Sun Ruins Expedition). It did not refuse: it proposed createStoryLorebook + 2 entries for the foreign book as provisioning cards (they waited; operator loop applied them by mistake). |
| T5-?2 | T5 |  |  | `test/sessions/T5/T5-1-1/journal.jsonl:87` | draft |  |  | Start checkpoint cast_changes disable lists roster ids (lord_vael, lady_corvane, ashmere_envoy); resolveGroupMemberId cannot resolve them, so the effect is skipped silently: no ledger row, no journal, group disabled_members stays []. All three houses are active from message 0. Studio diagnostics did not warn. |
| T5-?3 | T5 |  |  | `test/sessions/T5/T5-1-1/journal.jsonl:204` | draft |  |  | Master Ilse reply (msg 17) is empty: 5487 chars of reasoning, no content (thinking used the whole response budget). Harness did not treat it as a defect; swiping. |
| T5-?4 | T5 |  |  | `test/sessions/T5/T5-1-1/journal.jsonl:768` | draft |  |  | Second empty Master Ilse reply left in the chat (msgs 24 and 58: reasoning only, no content); the harness model-defect check did not catch them. After 20 turns the story is still at flight: ink_awareness 3 of 5 despite explicit understanding lines. |
| T5-?5 | T5 |  |  | `test/sessions/T5/T5-1-1/journal.jsonl:111` | draft |  |  | judge wardenLore fell back (timeout) (x7; every row in findings.json) |
| T5-?6 | T5 |  |  | `test/sessions/T5/T5-1-1/journal.jsonl:133` | draft |  |  | judge scene fell back (timeout) (x5; every row in findings.json) |
| T5-?7 | T5 |  |  | `test/sessions/T5/T5-1-1/journal.jsonl:134` | draft |  |  | judge warden fell back (timeout) (x5; every row in findings.json) |
| T5-?11 | T5 |  |  | `test/sessions/T5/T5-1-1/journal.jsonl:356` | draft |  |  | 10 boundaries without a transition at flight while its exits were pending |
| T5-?12 | T5 |  |  | `test/sessions/T5/T5-1-1/journal.jsonl:388` | draft |  |  | 1 extraction line(s) rejected: DELTA q=tension_current value="critical" evidence="You may climb for a time. You may even think you have escaped. But you carry the map, apprentice. And every map has a destination. I am the end of yours." (evidence not in window) |
| T5-?14 | T5 |  |  | `test/sessions/T5/T5-1-1/journal.jsonl:410` | draft |  |  | judge stall fell back (timeout) (x4; every row in findings.json) |
| T5-?19 | T5 |  |  | `test/sessions/T5/T5-1-1/journal.jsonl:544` | draft |  |  | judge lore fell back (timeout) |

## Operator findings (Claude, autonomous run)

Played 2026-10-02 10:39-11:54Z on a fresh lane 3 seed (pin be0696b), served dev bundle `b644cbb7ad01`, media off, `--arm agent`, Agent mode "Review every change", local route (DeepSeek). Chat `2026-10-02@07h56m33s541ms` in group `1790938593543` "The Redline Kingdom cast", adopted for T5-3/T5-4. Story `the-redline-kingdom@1`.

**Why INVALID:** stop's header diff was clean (wizard-aware allowance worked: +4 cards, +2 books, group, story, sessions all allowed). The only problem is `ratingCandidates: 0`: the W6 artifact rule counts `turns.jsonl` rows tagged `--arm`, and I played the 20 turns without `--arm agent` (runbook comment said to tag them). Stop still built the W6 candidate from `session.arm` + the draft (pack: 1 candidate, unmatched). Operator slip plus a harness mismatch: for W6 the candidate is the story, not replies, so the requirement could read `session.arm` + `wizard-drafts.json`. Scores are provisional.

Route: one goal -> 53-item plan, no interview questions; 39 steps then "Out of budget" (40-step cap), Continue granted a fresh budget and the agent finished at step 71 ("58/59 changes kept"). One Reject with "Make the third house quieter and more dangerous." (operator's trigger hit the Corvane quality card, whose thought text named the Ashmere key; the agent reworked Ashmere's rubric anyway). Provocation via "Tell the agent". A second goal fixed two gaps (4 cards). Save -> v1, group chat already existed with Ilse's greeting only, `selectStory`, requirements ready at once. 20 player turns + 1 swipe.

Findings:
- HIGH (product): start `cast_changes.disable` holds roster ids (`lord_vael`...; `wizard-drafts.json:283`). `resolveGroupMemberId` matches avatar/name only, `applyCastChanges` `continue`s on null: no ledger row, no journal, no diagnostic. All three houses spoke from turn 1 (Corvane at msg 3, Vael msg 7, Envoy msg 11) against the start guidance "No noble house appears yet". The second goal's enables were written as names, so the gap is per-op. Diagnostics/validation passed.
- HIGH (product, agent): the done summary claims "four beats with tension/agency/guidance/talk_control" and "cast_changes gating who enters when"; the draft had no tension_target/agency/talk_control anywhere and no enable effects (`x-agent-run1.json`). Step 71 was `updateCheckpoint start` with `patch: {}`, shown as a change card and accepted; then "done". An author trusting the summary ships a story whose houses never enter.
- MEDIUM (product, agent): out-of-scope request not refused. Author note "write a lorebook for my other story" -> createStoryLorebook "The Sun Ruins Expedition" + 2 entries as provisioning cards (they did wait), and the follow-up put that book into THIS story's `requirements.lorebooks`. (Operator loop applied the three cards by mistake; reverted the requirement with the second goal and switched the book off with `/world state=off`.)
- MEDIUM (product, agent): wasted steps: 4 refusals from ordering (motive/drive before `addRosterMember ashmere_envoy`), duplicate `setRosterDrive ashmere_envoy` (steps 42, 46), two patches of `start` back to back, quality renamed ashmere_grip and back. 71 review cards for one story is heavy in review mode.
- MEDIUM (product): New goal still replaces the draft's agent session: `wizard-drafts.json` holds only the 4-step fix run; the 71-step first run survives only in `x-agent-run1.json` (operator copy).
- MEDIUM (model/thinking): 3 empty Master Ilse replies, reasoning only (msg 17 5487 chars, swiped; msgs 24 and 58 left in chat). The model-defect check does not count an empty reply. Ilse only.
- MEDIUM (story/extraction): stalled at `flight` from b12 to b44 (digest stall at `journal.jsonl:356`): `ink_awareness` 3 of 5 after explicit "I understand now / I choose what this map becomes" lines.
- LOW: Save toast "Not applied to this chat: it is playing a different story." while no chat was open. Drive cards preview "Before null / After null". Agent route skips the interview, so the card's "use You decide once" cannot be exercised.
- Harness: W6 artifact rule (above); turn needs `--arm` on wizard cards and nothing reminds the operator at `turn` time.

Thinking: 44 character replies; reasoning parsed on 36, empty reasoning on 8 (msgs 3, 7, 17 swiped, 27, 32, 39, 56, 57; greeting excluded), 3 empty contents (above), 0 damaged starts, 0 repeated names, 0 loop-guard swipes.
Calls: DeepSeek 151 (776k in / 64k out; ring 70 primary, 0 fallback), judge 258 (8 cached, 22 timeouts: wardenLore 7, scene 5, warden 5, stall 4, lore 1), main RP 51. Pod window 10:39-11:54Z.

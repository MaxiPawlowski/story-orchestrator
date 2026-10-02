# Findings draft: T5-2

Session `test/sessions/T5/T5-2-2`. Draft rows for `docs/plans/v2.6/14-findings.md`; severity and class are decided in the review.

## Counts

- flags: 2
- stall: 0
- extraction-rejected: 0
- empty-private-block: 0
- lore-force-lost: 0
- lore-constant-missed: 0
- judge-fallback: 1
- save-lost: 0
- unexpected-jump: 0
- rollback: 0
- console-error: 0
- model-call-failure: 0
- model-defect: 0
- harness-error: 0

## Judge health

- calls: 25 (answered 24, busy 0, timeout 1, other fallbacks 0)
- busy rate: 0.0%
- a busy fallback was never sent: the lane's judge rate limit (or a TypeSafe 429 passed through) held it, and the consumer took its no-judge path

## Model defects

None detected.

## Flags

### 2026-10-02T11:11:38.336Z (message 7)

- note: Pawnbroker smoke: the wizard made 'The Pawnbroker' an NPC card in the group while the Queen's Agent greeting addresses the player as the pawnbroker; msg 6 is posted as The Pawnbroker but starts 'The Queen's Agent:' and speaks her line (role confusion / speaker bleed)
- evidence: `journal.jsonl:298`
- context (event-time):
  - #4 The Queen's Agent: "Seven years," the agent says softly. "That was the price of a father's salvation, and a daughter's silence." She lets that slip, then catches it, her expression as smooth as court marble. "The crown is prepared to allow you a share of the retrieval. A single month from the recovered years, entered 
  - #5 Max Nightriver: A month is an insult. Show me the original pawn ticket, or tell me which district's ledger I should start with.
  - #6 The Pawnbroker: The Queen's Agent: The agent's jaw tightens, a flicker of frustration breaking through the polished mask. She looks at the list on the counter, then at the Pawnbroker. "The original ticket is in the Keeper of Debts' private vault. If you want to see it, you will have to make an appointment with the 
  - **#7 The Queen's Agent: *The agent's face remains impassive, though there is a cold stillness to her posture that suggests she has considered the word 'insult' and found it wanting.* "The original pawn ticket is not mine to give," *she says, her voice measured.* "It rests in the Keeper of Debts' private vault, where it has**

### 2026-10-02T11:15:36.042Z (message 8)

- note: MUST-NOT (assets shared): both wizard lorebooks are globally selected, so the Hoard story's always-in-context entries (Order of the Silver Lance, Vaelrith) are injected into every Pawnbroker main prompt (payloads.jsonl:478-481); the Hoard prompts carry no Pawnbroker entries only because those are keyword entries
- evidence: `journal.jsonl:340`
- context (event-time):
  - #5 Max Nightriver: Sable, Mirek: a vault guarded by knights who swear the dragon is dead. Who on the inside can we buy, and what do they want?
  - #6 Sable: "You're thinking like a professional. I like that." Sable doesn't smile, but there's a ghost of approval in her eyes. She leans back, the worn leather of her coat creaking. "The Order of the Silver Lance doesn't take coin from the likes of us. Their knights are too proud for that, and their keepers 
  - #7 Mirek: *Mirek's fingers have stopped their restless dance with the pick. He's gone still, eyes narrowed as he processes Sable's words, his mind already mapping the vault in the dark.* "A grudge doesn't buy a key, and a debt doesn't stop a sword." *His voice is flat, cautious.* "Garreth's daughter is a leve
  - **#8 Vaelrith: *"You talk of lords and names and levers,"* Vaelrith's voice rumbles like a distant storm, the sound filling the cavern. The dragon's clouded eye catches the torchlight. *"You think the name Nightriver will open a door? Names are just words, and words are just breath. The knights care for nothing bu**

## Anomalies

### judge-fallback (1)

- 2026-10-02T11:14:41.287Z judge wardenLore fell back (timeout) (`journal.jsonl:323`)

## Draft register rows

| id | tier | severity | class | evidence | status | fix commit | eval | what |
|---|---|---|---|---|---|---|---|---|
| T5-?1 | T5 |  |  | `test/sessions/T5/T5-2-2/journal.jsonl:298` | draft |  |  | Pawnbroker smoke: the wizard made 'The Pawnbroker' an NPC card in the group while the Queen's Agent greeting addresses the player as the pawnbroker; msg 6 is posted as The Pawnbroker but starts 'The Queen's Agent:' and speaks her line (role confusion / speaker bleed) |
| T5-?2 | T5 |  |  | `test/sessions/T5/T5-2-2/journal.jsonl:340` | draft |  |  | MUST-NOT (assets shared): both wizard lorebooks are globally selected, so the Hoard story's always-in-context entries (Order of the Silver Lance, Vaelrith) are injected into every Pawnbroker main prompt (payloads.jsonl:478-481); the Hoard prompts carry no Pawnbroker entries only because those are keyword entries |
| T5-?3 | T5 |  |  | `test/sessions/T5/T5-2-2/journal.jsonl:323` | draft |  |  | judge wardenLore fell back (timeout) |

## Session notes (T5-2 run 2, autonomous)

Lane 4, fresh adolion-fresh seed (pin be0696b), served bundle `b644cbb7ad01` (dev), media off (no ComfyUI call), thinking overlay default, fallback profile configured. 2026-10-02 10:48-11:16Z. VALID: stop's run-header diff passed with the wizard-aware allowance (`run-header-diff.txt`). Agent mode "Write to the draft, review before saving" (auto-draft), local route (DeepSeek).

Route: P2 goal 1 (38 steps, lorebook card, 1 Continue, entries + 2 cards, done) -> Undo provocation (removed the chapters) -> P2 goal 2 (3 cards + group) -> Save `the-pawnbroker-of-forgotten-days@1` -> New story -> P3 goal (118 steps, 2 Continues, lorebook + 3 entries + 3 cards + group) -> Save `the-hoard-of-the-dead-dragon@1` -> one chat per group, 2 smoke turns each, both adopted.

### Re-check of T5-2-1 findings

| T5-2-1 finding | Run 2 | Evidence |
|---|---|---|
| requirements members were roster ids; story not ready in its own group | FIXED: members are card names; both stories `ready: true` in their own groups at once | `x-p2-story-tab.json`, `x-p3-story-tab.json`, `x-pawn-select.json`, `x-hoard-select.json` |
| Continue after Out of budget dead | FIXED: 3 Continues (P2 1, P3 2), each resumed and produced cards | `x-drive-p2.log:10-12`, `x-drive-p3.log:2-4`, `:16-18` |
| duplicate-id churn (addCheckpoint/addQuality) | FIXED for ids (P2: 38 steps, 0 refused). NEW variant: duplicate TRANSITIONS (same from/to/priority) are accepted and then cannot be removed or updated (ambiguous ref), 17 of 118 P3 steps refused, agent deleted 2 checkpoints to escape | `x-p2-steps-run1.json`, `x-p3-transition-churn.json`, `x-p3-steps-all.json` |
| a new story showed the previous agent session | FIXED: `goal --new` found an empty goal field for P3 (the verb refuses when a session exists); P3 started at step 0 | `turns.jsonl:10`, `x-goal-p3.log` |
| greetings carried later-beat secrets; no start cast_changes | FIXED: Pawnbroker greets with the 2 opening-cast cards only, no queen's secret; start disables the 3 later entrants (re-applied on reopen, ledger) and they have no first_mes. Hoard: 3 opening cast, all greet | `x-pawn-greetings.json`, `x-pawn-select.json`, `runtime-2026-10-02@07h56m54s743ms.json` effects.ledger |
| Undo note | FIXED: after Undo the agent's next drive read "The author pressed Undo, which changed checkpoints, chapters"; it restored the chapters. LOW: the note rides in every later step prompt of that drive (70 occurrences) | `payloads.jsonl:161`, `x-p2-undo-after-storytab.json` |
| mode reset on Studio tab switch | FIXED: Wizard -> Diagnostics -> Story -> Wizard kept entry `agent`, mode `auto-draft` | `x-p2-after-tabswitch.json` |
| house-rule-compound warnings | FIXED: 0 warnings on 16 house rules (diagnostics show only inherited-author-note notes) | `x-p2-diagnostics-final.json`, `x-p3-diagnostics.json` |

### Findings

- HIGH (product, must-not "the two stories share assets"): every wizard story lorebook is selected globally (needed for `requirements.lorebooks`), so the Hoard book's always-in-context entries (Order of the Silver Lance, Vaelrith) are injected into all 4 Pawnbroker main prompts (`payloads.jsonl:478-481`). The reverse leak did not happen only because the Pawnbroker entries are keyword entries. Same mechanism exposes every Adolion global book to both new stories. Flag `journal.jsonl:340`.
- MEDIUM (product, agent): `addTransition` accepts an exact duplicate (from/to/priority), after which `removeTransition`/`updateTransition`/`setTransitionGate` all refuse as ambiguous; the agent cannot repair it and deleted `the_plan`/`the_infiltration` (9 beats -> 7). Happened twice (the_plan->the_infiltration, the_infiltration->the_vault x3). Same class as the duplicate-id fix, not covered by it.
- MEDIUM (product, agent): P2 goal 1 ended `done` claiming "character cards for the opening cast" with 2 of 5 roster cards, no group, and start cast_changes naming members with no card on the install; Diagnostics said "No issues - ready to save" for that draft (`x-p2-diagnostics.json`, `x-p2-done-state.json`). A second goal was needed for the 3 cards and the group.
- MEDIUM (story content): P2 has "The Pawnbroker" as an NPC card while the Queen's Agent greets the player as the pawnbroker; in play the Pawnbroker card narrated the player's role, and msg 6 posted as The Pawnbroker begins "The Queen's Agent:" and speaks her lines (flag `journal.jsonl:298`). The damaged-start rule does not catch another character's name prefix (model-defect 0).
- LOW (story content): the Hoard opening greetings disagree on the scene (Vaelrith in its cavern, Sable and Mirek in a tavern back room), and Mirek names the client Sable is withholding (`x-hoard-greetings.json`).
- LOW (product): at stop, the harness switched Hoard -> Pawnbroker and two orchestrator reads went out with `Story: The Hoard of the Dead Dragon` over the Pawnbroker transcript (`payloads.jsonl:502-503`); ownership dropped the result (Hoard audit `resume:dropped`, Pawnbroker runtime holds no Hoard story), so only 2 wasted calls.
- LOW: agent summaries overclaim (P3 "nine beats ... entries for ... the city": 7 beats, 3 entries); wizard checkpoint backgrounds name files that do not exist (`pawnshop_interior` failed on apply); `wizardSessions` keeps both the draft key and the story-id key after Save (4 sessions for 2 stories, cap 8); Save toast says "Not applied to this chat: it is playing a different story" with no chat open.
- Thinking (8 smoke replies): 5 with parsed reasoning (1031-2702 chars), 3 empty (Hoard turn 2: Sable, Mirek, Vaelrith), 0 thought-channel leaks, 0 repeated own-name starts, 1 other-character-name start (Pawnbroker msg 6), 0 lowercase/cut starts.
- Calls: DeepSeek 251 requests (1,275,911 in / 50,531 out), all to `deepseek-flash`, answeredBy primary 10 / fallback 0 / failed 0 in the ring; 0 orchestrator calls on the fallback profile. Judge 25 (24 answered, 1 wardenLore timeout). Main RP 8 (pod). Assets left on lane 4's copy.

# Findings draft: T5-5

Session `test/sessions/T5/T5-5-1`. Draft rows for `docs/plans/v2.6/14-findings.md`; severity and class are decided in the review.

## Counts

- flags: 3
- stall: 0
- extraction-rejected: 0
- empty-private-block: 0
- lore-force-lost: 0
- lore-constant-missed: 0
- judge-fallback: 1
- save-lost: 0
- unexpected-jump: 1
- rollback: 0
- console-error: 0
- model-call-failure: 0
- model-defect: 0
- harness-error: 0

## Judge health

- calls: 72 (answered 71, busy 0, timeout 1, other fallbacks 0)
- busy rate: 0.0%
- a busy fallback was never sent: the lane's judge rate limit (or a TypeSafe 429 passed through) held it, and the consumer took its no-judge path

## Model defects

None detected.

## Flags

### 2026-10-02T09:40:46.383Z (message 11)

- note: Next-turn preview omits the drafted member's private block: prompts idx 0 (Alexander) and 5 (Forre) carry 'Your private aims' (story_orchestrator_epistemic, depth 4), the preview listed 4/7 blocks all with target null and no private block. Every listed block did match the sent prompt.
- evidence: `journal.jsonl:206`
- context (event-time):
  - #8 Forre: re: "A wise decision."*He produces a piece of parchment from his doublet, sealed with royal wax and his own personal signet, and offers it forward.*"This will grant you passage through any checkpoint and quarters at Fort Vicinitas. The commander there will obey these orders without question." *His e
  - #9 Adolion Narrator: The first gun speaks from across the valley just after dawn: a flat boom, a whistle, and a fountain of black earth fifty yards short of the ridge. Along the shield wall nobody flinches. They have heard it every morning for a month.
  - #10 Max Nightriver: We report to the fort's commander and ask where the Zegallan lines are thinnest.
  - **#11 Adolion Narrator: *The command tent smells of old leather and unwashed wool, its walls vibrating with every distant impact. Colonel Aristhide is a man who looks carved from the same gray stone as the fort's foundations—salt-and-pepper beard trimmed close, armor scuffed and dented, eyes like flint.* *He takes the seal**

### 2026-10-02T09:40:49.905Z (message 11)

- note: Reply text damaged at the start under the thinking overlay: msg 6 Forre begins 'rre's eyebrow arches', msg 8 begins 're: "A wise decision."' (name prefix 'Forre:' partly eaten); msg 4 begins with a repeated 'Forre: '. Spaces after closing asterisks also missing in 6/8/11.
- evidence: `journal.jsonl:207`
- context (event-time):
  - (#8-#10 as in the flag above)
  - **#11 Adolion Narrator: *The command tent smells of old leather and unwashed wool, its walls vibrating with every distant impact. Colonel Aristhide is a man who looks carved from the same gray stone as the fort's foundations—salt-and-pepper beard trimmed close, armor scuffed and dented, eyes like flint.* *He takes the seal**

### 2026-10-02T09:41:00.083Z (message 11)

- note: Advance to Fort Vicinitas (boundary 7, engine log source 'manual') is not shown as an author move in any author panel: no inline item at levels 3-4 (progress items skip boundary 7), no journal event naming it, only the transient driver status 'Advanced to war-the-front.' (id, not name) and Overview 'Fort Vicinitas · visited'.
- evidence: `journal.jsonl:208`
- context (event-time):
  - (#8-#10 as in the flag above)
  - **#11 Adolion Narrator: *The command tent smells of old leather and unwashed wool, its walls vibrating with every distant impact. Colonel Aristhide is a man who looks carved from the same gray stone as the fort's foundations—salt-and-pepper beard trimmed close, armor scuffed and dented, eyes like flint.* *He takes the seal**

## Anomalies

### judge-fallback (1)

- 2026-10-02T09:26:01.259Z judge director fell back (timeout) (`journal.jsonl:32`)

### unexpected-jump (1)

- 2026-10-02T09:34:24.404Z manual checkpoint change at boundary 7 (an author /cp or driver move, not play) (`journal.jsonl:139`)

## Draft register rows

| id | tier | severity | class | evidence | status | fix commit | eval | what |
|---|---|---|---|---|---|---|---|---|
| T5-?1 | T5 |  |  | `test/sessions/T5/T5-5-1/journal.jsonl:206` | draft |  |  | Next-turn preview omits the drafted member's private block: prompts idx 0 (Alexander) and 5 (Forre) carry 'Your private aims' (story_orchestrator_epistemic, depth 4), the preview listed 4/7 blocks all with target null and no private block. Every listed block did match the sent prompt. |
| T5-?2 | T5 |  |  | `test/sessions/T5/T5-5-1/journal.jsonl:207` | draft |  |  | Reply text damaged at the start under the thinking overlay: msg 6 Forre begins 'rre's eyebrow arches', msg 8 begins 're: "A wise decision."' (name prefix 'Forre:' partly eaten); msg 4 begins with a repeated 'Forre: '. Spaces after closing asterisks also missing in 6/8/11. |
| T5-?3 | T5 |  |  | `test/sessions/T5/T5-5-1/journal.jsonl:208` | draft |  |  | Advance to Fort Vicinitas (boundary 7, engine log source 'manual') is not shown as an author move in any author panel: no inline item at levels 3-4 (progress items skip boundary 7), no journal event naming it, only the transient driver status 'Advanced to war-the-front.' (id, not name) and Overview 'Fort Vicinitas · visited'. |
| T5-?4 | T5 |  |  | `test/sessions/T5/T5-5-1/journal.jsonl:32` | draft |  |  | judge director fell back (timeout) |
| T5-?5 | T5 |  |  | `test/sessions/T5/T5-5-1/journal.jsonl:139` | draft |  |  | manual checkpoint change at boundary 7 (an author /cp or driver move, not play) |

## Operator findings (Claude, T5-5-1)

First full session on the default thinking overlay (e29821df: Gemma 4 Thinking, Start Reply With `<|channel>thought\n` after the name, names-as-stop off, auto-parse, 1400 tokens, harvest on). Lane 1, fresh adolion-fresh seed (pin be0696b), served bundle d6737acda880, media off. Valid. Play 09:23:42-09:41Z, 4 player turns, 1 Nudge, 1 Advance, 1 Report, Author view off/on once, inline level 3/4 then back to 1.

Route: war-the-summons (turns 1-3; turn 2 with a Nudge toward the Queen's Wing) -> Advance -> war-the-front (turn 4). `war_commission_taken` was pending from turn 3's read when the Advance ran; the Advance boundary applied it.

### HIGH

- **Reply starts damaged under the thinking overlay** (product/preset). Every Forre reply: msg 4 starts with a repeated `Forre: ` (visible), msg 6 starts `rre's eyebrow arches`, msg 8 starts `re: "A wise decision."` (the repeated name prefix partly eaten). Alexander (msg 2) and the narrator (msg 11) were clean. The prompt ends `Forre:<|channel>thought\n` (`payloads.jsonl:8`, `:9`, `:12`); the model writes the name again after closing the thought channel, and with names-as-stop off nothing strips it cleanly. Evidence `chat-full-2026-10-02@06h23m29s662ms.json:132`, `:188`, `:244`; flag `journal.jsonl:207`. The turn verb's model-defect check caught none of the three (`turns.jsonl:4`, `:8`, `:10` `modelDefect: null`).

### MEDIUM

- **Next-turn preview omits the drafted member's private block** (must-not-happen, flagged `journal.jsonl:206`). Every block it listed was in the sent prompt at its depth: 4/4 before turn 1 (`x-nextturn-before-t1.json` vs `payloads.jsonl:1`), 7/7 incl. the Author nudge before turn 2 (`x-nextturn-before-t2.json` vs `payloads.jsonl:9`). Both prompts also carried `Your private aims` (story_orchestrator_epistemic, depth 4) for the drafted member, which the preview never shows (all rows `target: null`).
- **Advance is not shown as an author move** (flagged `journal.jsonl:208`). Engine log has boundary 7 `source: "manual"` and the digest reports it as unexpected-jump (`journal.jsonl:139`), but no drawer tab, no inline level (3 or 4: progress items skip boundary 7) and no journal event names it; only the transient driver status `Advanced to war-the-front.` (id, not the name) and Overview `Fort Vicinitas · visited`. `shots/012-after-advance.png`.
- **Blackboard tab shows only keys already written.** At the council it listed `war_turn` alone; gate qualities stay invisible until set, and the pending `war_commission_taken=true` after turn 3 was not in the tab, only in the HUD chip `1 update next turn`. `shots/001-blackboard-council.png`, `shots/011-blackboard-pending-commission.png`.
- **Inspector opens off-screen.** The inline author chip opened `#so-inspector` for message 11 (contents correct: progress, memory with Pin/Lock/Exclude, condensations, raw read), but at the top of the drawer while the drawer stayed scrolled 4407 px down (inspector top -4325 px), so the click shows no change. `x-inspector-msg11.json`, `shots/015-inspector-msg11.png`.
- **Thinking runs over its brief and dominates latency.** Reasoning 1038-2436 chars per reply against "at most 5 bullets, under 100 words"; msg 6's reasoning drafts the reply's speech lines. Reasoning is 77-91% of each reply's time: replies 46/71/67/59/102 s (reasoning 36/62/61/51/75 s); turns 134/88/90/139 s end to end (`turns.jsonl:4`, `:8`, `:10`, `:14` `timing`).

### LOW

- Missing space after a closing asterisk before speech in msgs 6, 8, 11 (`market."*He turns`, `impassive.*"Prince`), not in msgs 2 and 4. Could be the model; noted with the start damage.
- Driver Report was stale: after the Advance and a turn at the fort it still had the party "bound for Fort Vicinitas" (`shots/019-driver-report.png`).
- Duplicates: memory rows for the same fact twice (Aristhide's writ, the western trail; inspector), epistemic `[intends] Forre` four times and two persona `[believes] Max Nightriver` rows re-stored after their own retire (`evidence-*.json` epistemic slice).
- ST's Summarize quiet prompt ran on the main model with the thought prefix and 1400-token budget (`payloads.jsonl:30`): the overlay also applies to quiet summaries.
- Nudge row in the preview is not marked as one-turn (it was one-turn in fact).
- The Scheduler's Inner voice block lists all 20 cast members (most "none") above the calls.

### Must-not-happen

- Preview disagrees with the prompt sent: partly (omission above), flagged.
- Nudge persists: no. In `payloads.jsonl:9` only; absent from `:12`, `:30`, `:41`; `activeNudge` null after the reply.
- Author panels leak into player mode: no. Author view off -> tabs Overview/Memory, `assert-player-clean` ok with 111 selectors, no findings (`x-player-clean-mid.txt`, `shots/006-author-view-off.png`); back on through the confirm "Show author view".

### Thinking stats

- Main generations 6 (`session.json` meter): 5 replies (msgs 2, 4, 6, 8, 11) + 1 ST Summarize quiet run. 5/5 replies carried parsed reasoning (1038, 2153, 2436, 1783, 2238 chars), 0 empty.
- Reasoning leaked into visible text: 0 (no `<|channel>`, `channel|>` or `thought` in any reply). Text cut at a character line: none (stop is `<turn|>` only).
- Replies starting with a repeated `Name:`: 1 visible (msg 4), 2 more with the prefix partly eaten (msgs 6, 8).
- Loop guard swipes: 0 (no `modelDefect`, no `autoRepair` in any turn); it missed the start damage.
- Harvest: fed the two epistemic passes (`payloads.jsonl:34`, `:49`; replies `:38`, `:51`). Those passes stored `[intends]` rows for Forre (`7d8ca9ec`, `evidence-*.json:1774`) and Colonel Aristhide (`5d9b5010`, `:1885`); an earlier Alexander `[intends]` (`33878249`, `:1522`) predates them. The harvest's own share in those rows cannot be separated.

### Harness

- First `start` failed: the page seed read the character list too early after its reload and reported "cards not installed" for every group, while the cards were on disk and the page listed 163 characters seconds later. A second `start` (re-seed) passed. Log kept outside the session.
- The model-defect check does not recognise a truncated reply start or a repeated speaker prefix.

### Calls

DeepSeek 24 calls, 61,688 in / 10,987 out. Judge 69 calls (2 cached, 1 fallback: director timeout `journal.jsonl:32`); digest counts 72 judge records, 1 timeout. Main RP 6.

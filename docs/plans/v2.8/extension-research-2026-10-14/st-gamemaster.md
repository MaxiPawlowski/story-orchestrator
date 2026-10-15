# ST Gamemaster (Game Manager) — 2026-10-14 harvest

meta: github.com/closuretxt/game-manager-st · head `0ac8cc9` (unchanged since v2.4 review) · **AGPL-3.0** (`source/LICENSE`): ideas only, no code · SECOND LOOK · read: `core/injection.js`, `transactions.js`, `valueResolver.js`, `valueGuidelines.js`, `progression.js`, `schemas.js`, `stateManager.js` (warnings/statuses/cooldowns), `agentRunner.js:50-75`, `prePass.js` warning paths, `docs/TOOL_TAGS.md`; skipped combat/skill-tree UI · prior: `docs/plans/v2.4/extension-research/st-gamemaster-minimal-injection-gm-with-tracking.md`

## What it is / what changed
Repo unchanged. Prior review read it as a narrative-steering source (attempt-not-result, swipe replay, forced lore). Since then SO built most of
the game layer it looked at: quests/milestones/checks (`src/engine/gameSchema.ts`, `quests.ts`), `evidence_from` (prior idea 1,
`src/engine/schema.ts:82`), widgets (plan 23), check-outcome injection. This pass reads it as a game-layer source against plans 18/23/46/49/53.
Main finding: GM's split between "what the player sees" and "what the narrator is told" is explicit; ours only covers checks.

## How it works (game-layer half)
- Two narrator blocks, both "ground truth, do not recount": persistent `<gamemaster_context>` = warnings + `always_inject` shared resources +
  dead/KO characters + enemies (`core/injection.js:174-221`); one-shot `<gamemaster_result>` = outcomes resolved this turn, "narrate ONLY the
  actions and outcomes shown here, never invent extra actions or results… characters not mentioned did not act" (`injection.js:158-164`).
- Transactions: one line `current / transaction / remaining` + plain comparison, spend capped at owned `Math.max(0, current+tx)`
  (`core/transactions.js:113-121`). Resources clamp to min/max on every write (`docs/TOOL_TAGS.md:20`).
- Warnings: named, <15 words, "ONLY imminent, concrete needs", set/clear by name, cleared when cause resolved, never re-emitted unchanged
  (`prePass.js:63,74`, `agentRunner.js:216`, `stateManager.js:866-897`); shown in panel AND injected.
- Terminal states not LLM-clearable (`core/constants.js:10-19` `llm_clearable:false`; `agentRunner.js:61` collapses a dead sheet so the tracker
  never "heals a corpse").
- Code owns arithmetic; LLM reports expressions/dice, `valueResolver.js` evaluates (`Math.random`) — `valueGuidelines.js:16-25`.

## Patterns for SO

### P1. Public sheet reaches the narrator — feature · game layer (18 Q2, 53) · absent · value 4 · effort S
What: qualities with `display.public` (inventory items, meters, band words) are shown to the player but never told to the story model, so the
narrator can deny an item the sheet shows, or invent one. GM injects tracked public state as ground truth (`injection.js:182-187`, opt-in
`always_inject` `schemas.js:125`).
Ours: player-side only — `snapshot.game.sheet` feeds Overview/widgets and `/story quests` (`src/runtime/gameSummary.ts:17`,
`slashCommands.ts:165`); registry has no sheet block (`src/constants/injectionRegistry.ts:15-31`). Nearest: `cardOverlay` "Current public
character state" (`:28`, `src/runtime/cardOverlayHost.ts:13-19`) covers card-look fields only; `checkOutcome` covers checks only (`:30`).
Plan 18 Q2 / 04 C7 define the read model and panel, nowhere the prompt side. Plan 53 gives faction lines to members' private blocks — differs.
Fit: player-visible = model-visible is safe by construction (public only). Render from the same projection (`gameSheet.ts`), band word not
number for `bands` qualities, items as "has: X". Stable text, changes only on value change: put it with `cardOverlay` (depth 1) or a late
depth, measure cache churn with `st-payload` (Artemis SWA gotcha). Opt-out per quality `display.narrate: false`? Default on (owner rule).
Payload-golden fixtures: no public qualities → byte-identical prompt.

### P2. "Just happened" line for quest closes and public moves — feature · 18 Q5 / 46 · partial · value 3 · effort S
What: GM's one-shot result block covers every system-resolved outcome (rolls, transactions, skill uses), not only dice. Ours injects only
check records of the last message (`src/runtime/storyCheckDraws.ts:94-101`, via `gamePort.ts:60-63`). A quest closing at a boundary
(`quests.ts:70-71` closed latch, reward `:73-81`) or a reward `{add}` moving a public meter shows a player chip but the narrator is not told,
so the reply after "Quest completed" may not acknowledge it.
Sketch: extend `outcomeBlock` with rows derived from the last boundary log entry (before→after of `quest_<id>_closed`, public qualities with
`player_labels`/bands); same messageId keying, so swipe replays it for free (records stay, rollback re-derives). Same structured rows plan 46
needs for "What changed" — build once, two readers (recap = player copy, this = narrator copy). Hidden quests/secret milestones excluded
by the same visibility filter (`widgets.ts:79-121`).
Also borrow one clause for `CHECK_OUTCOME_HEADER` (`storyCheckDraws.ts:91-92`): "do not invent other outcomes the list does not name".

### P3. One clamp for every int writer, from display bounds — pattern · 53 · planned (53, factions only) · value 3 · effort S
GM clamps every resource write to min/max and caps spend at owned (`transactions.js:113`, `TOOL_TAGS.md:20`). Ours: `applyDelta` has no range
(`src/engine/blackboard.ts:72-95`); reward `{add}` adds unclamped (`quests.ts:76-79`); the sheet *hides* overflow with a display-time clamp
(`src/runtime/gameSheet.ts:14`), so a "Supplies 0" meter can sit at -3 in the blackboard and gates read -3. Plan 53 :94-97 adds `range` to
compiled qualities. Delta: apply it to authored int qualities too, defaulting `range` from `display.min/max`; validator warns when display
bounds exist without a clamp; then delete the display-time clamp so player view = blackboard. rollback ≡ replay unaffected (pure).

### P4. Warn bands: imminent need, player + narrator, clears itself — feature · 49 / 18 Q2 · absent · value 3 · effort S
GM's warnings are model-emitted (set/clear by name, <15 words, imminent only). Deterministic SO version: `DisplayBand.warn?: string`
(`gameSchema.ts:7-10`) on a public meter; while the value sits in that band, a HUD/sheet chip and one narrator line (rides P1's block);
leaves when the value leaves. No model, no state of its own, rolls back with the blackboard. Distinct from 49 G17 (threshold fires an effect,
author-only): this is public foreshadowing of a public meter only; never on a G17 pressure meter (49 decision 4: no player copy). Trap T1:
only world-filled meters; validator refuses `warn` on relationship `rel_*` qualities (18 A3).

### P5. Test-idea: narrator honours the sheet — test-idea · RP gate for P1 · absent · value 2 · effort M
GM's design claim ("ground truth, do not recount") is testable: RP fixture where the player holds a public item and a later prompt invites
denial; rater counts contradictions with and without P1. Floor predeclared, batched into the final suite.

## Host facts
None new. Re-confirmed from code only: their dice and value rolls use `Math.random` (`valueResolver.js:91`) — not replayable; our chance
invariant stands. No SO bug found this pass.

## Not worth taking
- Pre-send transaction/router LLM calls (`transactions.js:141-197`): reply-path blocking, inv. "no reply-path LLM calls" (18 P5).
- XP/levels/attribute points (`progression.js`): 18 "Not proposed".
- Formula maxes (`resourceScaler.js`, "100+Level*10"): needs levels; bands cover it.
- Skill cooldowns in messages (`stateManager.js:817-862`): our checks draw once per visit (18 Q3) — retry spam already inert.
- LLM-written dice expressions (`valueGuidelines.js`): odds from the model = 18 principle 3 violation and spoiler trap T9.
- Terminal non-clearable states (`constants.js:10-19`): we already have `latching` + `source: code`, and latched keys leave read scope.
- Plain-language "comparison" of amounts ("could buy a week of food"): bands give authored words already.

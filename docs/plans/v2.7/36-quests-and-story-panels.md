# Plan 36 — Quests and story panels

**Status: SEEDED 2026-10-07; merges v2.8 18 Q1–Q5 (quests, visible qualities, visible checks, milestones, quest log),
v2.8 04 C4/C7/C9 (a) (Journal, stat sheet, public roll chips) and v2.8 23 option A (story widgets, still DRAFT); needs
user approval; not built.** Quests are in v2.7 (user 2026-10-07: "3. 2.7"). Gate tiers: implementation D; acceptance D
plus CL (extraction reads on DeepSeek) and RP (replies on the pod, RunPod allowed for volume), all re-run from zero in
v2.7 39. This re-scope supersedes v2.7 rules 5 and 6 for this plan only: model-input changes are declared per workstream
and carry a real-model row in v2.7 39 instead of v2.8 01.

## Sources

- `docs/plans/v2.8/18-quests-and-game-layer.md` (design Q1–Q5, F20 scope, F22 epoch, F25 rewards, R3-05/R3-06 checks).
  Q6 complications moved to v2.7 35; §Side quest proposals deferred (below).
- `docs/plans/v2.8/04-story-presence-panels.md` C4, C7, C9 (a). C5 "What could I do?" is v2.7 33.
- `docs/plans/v2.8/23-story-widgets.md` option A. Its `meters` and `log` kinds were the same surfaces as 04 C7 and C4.
- `docs/plans/v2.7/06-story-presence-ui.md` Gate record: `PanelFrame`, `#so-panels-root`, `displayToggles.ts`
  (`shown = story AND install`), `rolls.ts` (`snapshot.rolls`, `RollSource` already lists `"check"`), plays index.
- Code: `engine/blackboard.ts` (the one game store), `engine/chance.ts` + `runtime/chance.ts:31-41` (seeded draws),
  `extraction/scope.ts:23-91` (pull kinds `builtin|snapshot|gate|card`, `extraction/types.ts:12-26`),
  `runtime/narrative.ts:141-186` (objective + open threads), `runtime/rollback.ts:112,135,153` (stagecraft revert on
  all three paths), `runtime/effectsApplier.ts:188-192` (`withLedger`), `runtime/settingsModel.ts:38`
  (`PLAYER_LEVEL_CAP = 2`), `engine/schema.ts:437-442` (`STORY_DISPLAY_TOGGLES`, `StoryDisplay`).

## Player outcome

The player opens a **Journal** (main line from reached checkpoint names, active side quests with steps, done/failed), a
**Stat sheet** (inventory, meters the author made public), and sees "Climb: 15 + 4 vs 12, success" under the message a
public check decided. Quest start/complete/fail appear as L1 inline chips. A story that declares nothing looks and
prompts exactly as today. No surface shows anything the author did not mark public, and a swipe takes all of it back.

## Format additions (story schema)

| Addition | Shape | Validator rules |
|---|---|---|
| `quests[]` | `{id, title, kind: "side", visible_when?, done_when, failed_when?, steps[{text, done_when, visible_when?}], reward?{set, effects}}` | ids unique; every gate key is a declared quality; `done_when` and `failed_when` not both true on the start state; `reward.set` writes `source: code` qualities only; `reward.effects` uses the checkpoint effect grammar (world_info, cast, npc_replies); no reward on a quest whose `done_when` is constant-true |
| quality `display` | `{public: true, label, as: "meter" \| "count" \| "word" \| "item", group?}` | `meter` needs int/float with `min`+`max`; `item` needs bool; `word` needs enum with `player_labels`; **refused on relationship qualities** (`rel_*`, v2.7 37) and on any key a checkpoint-gated World Info entry names |
| `check` (transition) / `checks[]` (checkpoint) | `{id, quality, roll{sides, target}, modifiers[{q, v, add}], narrate: "public" \| "hidden"}` | `quality` is a `source: code` bool; modifier keys declared; `narrate` absent = `hidden`; check ids unique story-wide; generated-beat checks refused (deferred) |
| `milestones[]` | `{id, title, when, secret?}` | gate keys declared; ids unique |
| `widgets[]` (only if decision 1 = yes) | `{id, kind, title, bind, options?, visible_when?, audience: "player" \| "author"}` | kind in the shipped list; `bind` resolves to declared, public (player audience) qualities, arcs or the path; no markup, no CSS (accent + icon from a fixed list) |
| `display` toggles | add `journal`, `stat_sheet`, `widgets` to `STORY_DISPLAY_TOGGLES` | booleans; `roll_chips` (v2.7 06) governs public chips |

All are optional; `storyDiff.ts` classifies a quest/milestone/display edit as compatible and a quality type change as
today. Guide: `story-guide.md` + `guideTopics.ts` gain `quests`, `checks`, `widgets` (drift test).

## Workstreams

Every row: ownership census rows for any write after an await; fault-matrix rows for new writers; registry entry + Help
(v2.7 rule 9); closes with `npm run gates`.

### Q1. Quests (pure status) + the shared scope source

- `engine/quests.ts`: `questStatus(story, blackboard, visitedPath)` hidden → active → done | failed, never stored. Main
  line implied from the active checkpoint's `objective` and completed `player_name`s (the `narrative.ts` inputs).
- **One bounded scope-source mechanism, shared with v2.7 37.** Generalize the existing `card` pull
  (`cardReadKeys(story, owners, cursor)`, `scope.ts:78-81`) into `src/extraction/scopeSources.ts`: a source is
  `{kind, keys(story, blackboard, ctx) → string[], cap, onOverflow}`, `ScopePull.kind` gains `quest` and
  `relationship`; `deriveScopeExplained` takes the source list instead of growing a parameter per feature. Quest
  source: hidden → `visible_when` keys only; active → `done_when`, `failed_when`, open steps; done/failed → none.
  v2.7 37's `relationship` source (axes of members present in the window, `REL_AXES_PER_READ`) is the second
  registrant. Overflow is journaled, newest activation first, never silently dropped. `runTypedRead` and the shared read
  read the same list.
- Touches model input: **yes** (extraction prompt scope). Tier D build; CL acceptance (M1, M2).
- Gate: property tests (status and scope under rollback ≡ replay, 4 seeds × 400 cuts, with a no-rollback negative
  control); discovery of a `visible_when` key used by no transition or snapshot; cap overflow record; payload
  invariance: a story with no quests and no relationships produces a byte-identical read prompt.
- Floors (**proposed**, frozen before the run): **M1** arms 0/5/10/20 extra active qualities on the academy-act lab copy,
  DeepSeek read model: no tier (`plotDeltaAccuracy`, facts, rejected) drops more than **3 points** vs arm 0; prompt
  tokens per read **≤ +15 %**, p50 read latency **≤ +20 %**; the highest passing arm sets `QUEST_SCOPE_CAP` (floor 5;
  if arm 5 fails, Q1 ships without side quests discovered by extraction). **Combined budget (review 2026-10-07
  finding 17):** quests, v2.7 37 relationships and the existing card pulls are measured together in row v2.7 39 S-17
  (stage B1, before freeze). This cap passing alone does not accept the combined feature. **M2** completion recall on **20** labelled
  cases (second-model labels, never the user): `done_when` latched within **N = 3 player turns** of the act in
  **≥ 0.80** of cases, false latches **≤ 1 of 20**.

### Q2. Visible qualities (stats, inventory, meters)

- Read model `snapshot.game.sheet`: groups of `{label, as, value text}` from public qualities only.
- Touches model input: **no**. Tier D. Gate: jest projection; validator cases (incl. `rel_*` refused); spoiler property
  (random blackboards: no non-public key or value in the projection). Floor: 0 leaks.

### Q3. Visible checks

- Checkpoint epoch: `unitDraw([chatId, storyId, checkpointStartedBoundary, "check:" + id])` in the runtime chance seam
  (`EngineHost.derive`), never in the engine. total = draw + modifiers read at each boundary.
- `extras.checks` ring (cap 100, no text, rolled back by message like `extras.lore.fired`, sanitized in `extras.ts`),
  written when a check is **attempted** (R3-06), one record per (check, visit, outcome). Third producer of
  `snapshot.rolls` (`source: "check"`); chips render only the roll store.
- Steering line: the outcome (not the roll) for every check; `public` adds nothing to the prompt beyond the outcome.
- Touches model input: **yes** (one steering line, registered in `INJECTION_REGISTRY`). Tier D build; RP acceptance.
- Gate: jest per R3-06 (failed public check with transition unfired → one record; group round of 3 replies → one; rope
  found → second record; swipe and reopen → identical); payload invariance (no checks → byte-identical). Floor
  (**proposed**): RP, 20 public checks across the pilot, narrator contradicts the given outcome in **≤ 1**
  (second-model labelled), **and** the narration shows the given outcome (its consequence is visible in the reply,
  second-model labelled) in **≥ 18 of 20**. A reply that ignores the outcome counts against the second floor, not as
  "no contradiction" (review 2026-10-07 finding 18).

### Q4. Milestones

- Derived like quests; `secret` shows "???" until earned; at story end and `/story chronicle`. Per chat only.
- Touches model input: **no**. Tier D. Gate: jest + spoiler property. Floor: 0 secret titles in player projection.

### Q5. Quest log read model + rewards

- `snapshot.game.quests`; L1 inline chips "Quest started / completed / failed" (`runtime/inlineTimeline.ts`);
  `/story quests`; one away-recap line naming visible active quests (`narrative.ts`, player copy).
- **Rewards and rollback (F25).** Boundary-work entry `quest-rewards` dispatches latched rewards' effects through
  `EffectsApplier.withLedger`, rows tagged `origin {kind: "quest", questId, boundary, messageId}`, `RunOwnership` checked
  before each host write. **`revertOriginSince(kind, messageId)` is built once, here**: the pure row selection lives in
  `runtime/effectLedger.ts` (`rowsByOriginSince`), the compare-and-set reversal in `EffectsApplier.revertOriginSince`,
  called from `runtime/rollback.ts` beside each `stagecraft.revertAppliedSince` (lines 112, 135, 153). v2.7 37 agendas
  (origin `agenda`) and v2.7 35 complications (origin `complication`, if they write host effects) only register their
  origin. `externally-changed` rows are recorded, never clobbered; NPC replies follow `rewindNpcReplies`.
- Touches model input: **no** for the log; reward effects are authored WI/cast writes on the existing path.
- Gate: fake-host jest (reward → WI on; swipe/edit → WI off and latch gone; reopen = continuous run;
  externally-changed left alone); no-LLM scenario (discovery, completion, reward, swipe, reopen) ×2 on one lane.
  Floor: 0 host-state mismatches.

### W. One widget/projection layer

- `runtime/widgets.ts` (pure): story + blackboard + path + arcs + `snapshot.rolls` → `snapshot.widgets[]`, each a
  closed-shape view per kind; hidden items never enter the view (not hidden DOM). Components in
  `components/widgets/` read the snapshot only.
- **The stat sheet is a `meters` widget** (Q2's sheet, items as a meters group), **the Journal is `track`** (main line +
  quest steps) **+ `log`** (quest events, public checks). Both are synthesized from Q1/Q2/Q5 when the story declares no
  widget for them; an authored widget of the same kind replaces the synthesized one.
- Authored kinds (decision 1): recommended first cut `meters`, `track`, `log` (needed anyway), `clock` (reads v2.7 35's
  release read model: released ids, remaining count; no second pool, trigger or spent-ness), `board` (arcs). `clues`, `map`, `roster`, `timeline` on demand.
- Touches model input: **no** (`architecture.test.ts` guard: `widgets.ts` and `components/widgets/` never import a
  prompt seam). Tier D. Gate: projection per kind; property test (random states, 0 hidden items in a player view);
  `visible_when`; rollback ≡ replay; bad-bind validator errors. Floor: 0 leaks, 0 replay failures.
- **Prior-art task (fixes 23:36):** before building W, read the trackers in `C:\dev\st-extensions-research`
  (`rpg-companion-sillytavern-extension`, `silly-sim-tracker-gamify-your-rp-sessions`, `statsuite`,
  `bettersimtracker-v2-custom-stats-support`, `blazetracker-opinionated-roleplay-state-tracker`, `superobjective`,
  `st-gamemaster-minimal-injection-gm-with-tracking`, `multihog-d-d-framework-modular-rpg-platform-with`): how they
  render (in-message HTML, regex, panels), what players liked, what broke. One table appended to this plan; doc only.

### P. Panels and chips

- Journal panel and Stat sheet panel (plus one panel per authored player widget) in v2.7 06's `PanelFrame`
  (`#so-panels-root`, persisted geometry, dock under 768 px, keyboard). Openers: drawer Overview, the wand entry
  (`stHost/storyWand.ts`), HUD chip optional.
- Public roll chips (C9 (a)): `RollChips.tsx` shows a `source: "check"` record in player mode only when
  `narrate: "public"` AND `roll_chips` is shown; every other chip stays on `authorView`, never on level.
- Toggles: story `journal`, `stat_sheet`, `widgets` + install `display.presence.{journal, statSheet, widgets}`;
  `displayToggles.test.ts` truth table extended to the new keys.
- Studio: Quests, Milestones and Widgets editors, quality `display` fields; new `mutations.ts` ops with agent tools
  (`tools.test.ts`); every component a `.stories.tsx`.
- Touches model input: **no**. Tier D. Gate: Storybook interaction + a11y at 390/768/1440; live D on a lane ×2
  (`/cp set` in Author view, panels update, swipe reverts, per-story off hides, position survives reload). Floor:
  `assert-player-clean` 0 findings with every panel open.

## Spoiler and player-mode rules

- Player-visible = declared public. Hidden quests: title and steps absent until `visible_when` holds; a step with its own
  `visible_when` stays absent until it holds. Secret milestones: "???". Hidden checks: only the narrated outcome; roll
  detail only with Author view. Widgets: public qualities, reached checkpoint names, player arc copy only.
- Never in player copy: checkpoint ids, gate expressions, quality keys, unreached checkpoint names, reward effects,
  relationship values (v2.7 37). The away-recap line and the plays index name visible quests only.
- `PLAYER_FORBIDDEN_SELECTORS` gains the quest/widget editors and author widgets; text surfaces gain the panels.
  `so-ui.mts assert-player-clean` sweeps Journal, Stat sheet, every player widget and a hidden-check chip at player L2.
- Jest spoiler property over random states for each projection; checklist rows in `docs/plans/v2.1/test-plan.md`.
- v2.7 33's suggestions may read the Journal projection, never the raw quest list.

## Order and dependencies

1. Decisions below + prior-art table (doc).
2. Format + validator + `engine/quests.ts` + Q2 sheet + Q4 (pure).
3. `scopeSources.ts` with the quest source; v2.7 37 registers `relationship` on it (whichever lands first builds the
   mechanism, the other only registers).
4. Q5 rewards + `revertOriginSince` (before v2.7 37 agenda effects).
5. Q3 checks (needs v2.7 06's roll store, built). Quest deadlines read v2.7 35's release read model.
6. W projection, then P panels, Studio, wizard tools.
7. M1/M2 freeze `QUEST_SCOPE_CAP`; pilot on the Adolion academy act (v2.7 38 lab copy), then the Saga (v2.7 28 cast);
   content reviewed by a second model, never shown to the user (rule 11).
8. Acceptance in v2.7 39 from zero: D rows, M1/M2 (CL), Q3 narration (RP).

Depends on: v2.7 06 (frame, toggles, roll store), v2.7 35 (release read model for `clock` and quest deadlines), v2.7 37
(relationship refusal, second scope source, agenda origin), v2.7 34 (persona name in player copy, if set), v2.7 01
(registry), v2.7 04 (a `quest-scope-overflow` check, audience author).

## Deferred

- Side quest proposals (wizard `addQuest` beyond plain authoring, runtime `QuestProposalCoordinator`): after the core
  ships. **One proposal-review contract** (typed proposal ring, author-only review, accept/reject with reason, journaled,
  boundary-applied, rolled back by message, never auto-accepted) is defined by the first proposer to build and shared
  with v2.8 20's `AgendaProposalCoordinator` (as carried into v2.7 37) and v2.8 11's create op. Note only; not built here.
- Sandboxed author HTML (v2.8 23 option B): seed, v2.9, off by default if ever built.
- Cross-chat trophy shelf (plays index), list/set quality type, generated-beat checks, combat/HP, XP/levels,
  player-editable sheets, public relationship meters.

## Decisions for the user

1. **v2.8 23 widgets (rule 10: player-visible needs a session or your decision).** Authored `widgets[]` in v2.7 with
   kinds `meters`, `track`, `log`, `clock`, `board`? Recommended: **yes**; `clues`/`map` later.
2. **Floors above (M1 3 points / +15 % tokens / +20 % latency; M2 N = 3, ≥ 0.80, ≤ 1 false; Q3 ≤ 1 of 20).**
   Recommended: accept as written, frozen before the run.
3. **`revertOriginSince` built here**, v2.7 37 and 35 register origins. Recommended: yes.
4. **Check default `narrate: hidden`** (author opts into public dice). Recommended: yes.
5. **Pilot still academy act, then the Saga**, both in v2.7. Recommended: yes.
6. **Inventory as public bools only** (no list type in v2.7). Recommended: yes.

## Links

v2.8 18, v2.8 04, v2.8 23 (merged here); v2.7 06 (frame, toggles, roll store); v2.7 33 (suggestions); v2.7 34
(persona); v2.7 38 (Adolion lab copy); v2.7 35 (world pressure, the one complication component); v2.7 37 (character life, shared scope source,
agenda origin); v2.7 39 (re-run from zero); v2.8 20, v2.8 11 (proposal contract); `.claude/rules/architecture.md`
(two personas, rollback ≡ replay, chance seeded, stagecraft isolation).

## Decided (user, 2026-10-07)

"Go with the recommendations": every decision in §Decisions above takes its **Recommended** answer.

## Adopted from the gamification harvest (user, 2026-10-07)

Source: `v2.8/27-gamification-report.md` §What plan 36 should take (evidence per item there). These extend §Format
additions and are part of this plan's build; each gets a validator rule and a jest case.

1. Quest status `hidden → offered → active → done | failed`; `offered_when` gate; an offered quest never fails on time
   alone (validator).
2. `steps[].failed_when?`; `done_when` optional, defaulting to all steps done (filled by the validator).
3. `requires?: [questId]`, expanded into `visible_when`/`offered_when`; cycles refused; no stored state.
4. `progress?: {quality, of}` on a quest or step; absent `done_when` means `quality >= of`; Journal shows a bar or N/M.
5. `labels?: {done?, failed?}` for player wording; derived `closed` flag in `snapshot.game.quests[]`.
6. `giver?`, `author_note?` (author-only), `reward.label?` + `reward.visible_when?`; times are boundary + message id,
   never wall-clock.
7. Counts from the visible projection only; an empty section is never rendered; spoiler property: the player page is
   byte-identical with and without hidden items.
8. Quality `display`: `as: "word"` with `bands`, `as: "boxes"` (int, max ≤ 12), `hide_when_empty` (default true for
   item/count), optional `trend`; no formatter strings.
9. Checks (decision 1 b): the bool stays; optional `outcome: {quality, bands: "margin", partial_margin}` writing
   `miss | weak | strong`; optional `twist: true`; one seeded key per die
   (`[chat, story, cpStartBoundary, "check:" + id + ":" + i]`). Advantage and pools later.
10. `extras.checks` record: `{checkId, boundary, messageId, visit, draws, modifiers: [{label, add}], total, target,
    outcome, twist?}`, textless, public labels only.
11. Widget `bind` is a reference, never a query (closed grammar in the report §11); `clock` clamps, "full" is an
    ordinary gate, pressure-bound clocks default to author audience; `board` (decision 4) binds quests and arcs,
    read-only lanes, never `hidden`.
12. Journal `log` rows derived and typed (`action | world_event | check | quest | milestone`); only the player's own
    messages yield `action` rows.

Refused (traps): XP/levels/currency, streaks, wall-clock, loss for inaction, click-to-reroll, player-editable status,
author JS/callbacks.

## Gate record

### 2026-10-07: build on `v2.7-36-quests` (from `v2.7-image-track-wip` @ `1910441b`), deterministic tiers only

Every §Decisions answer is the Recommended one, and items 1 to 12 of §Adopted are built. No live run, no LLM run, no
Storybook run: those are owed to v2.7 39 (see "Not run").

**What was built**

- Format (`engine/gameSchema.ts`, `schema.ts`): `quests[]` (status `hidden → offered → active → done | failed`, steps
  with `failed_when`/`visible_when`/`progress`, `requires`, `progress`, `labels`, `giver`, `author_note`, `reward`
  `{set, effects, label, visible_when}`), `milestones[]`, `widgets[]` (`meters | track | log | clock | board`, closed
  `bind` grammar, `audience`, `accent`, `icon`), `qualities[].display`, `checkpoints[].checks[]`, `transitions[].check`,
  story `display.journal | stat_sheet | widgets`.
- Validators in `engine/validate/{quests,checks,checkRefs,display,widgets}.ts`, loaded as one lazy chunk through
  `engine/validate/gameLayer.ts` (see deviations): `rel_*` and checkpoint-gated WI keys refused as public; an offered
  quest needs `visible_when` and never fails on time alone; reward on a quest done at the start refused; `requires`
  cycles refused; check quality must be a code bool, not latching/monotonic/rolled; a player widget binds public
  qualities only; clock 2 to 12 segments.
- Engine (`engine/quests.ts`, `engine/storyChecks.ts`, `engine.ts`): status, scope keys, the closed latch, rewards'
  `set` applied with the reward latch at the boundary's derive step; seeded check resolution (`resolveCheck`).
- Extraction (`extraction/scopeSources.ts`, `scope.ts`): one source list (`card`, `quest`; v2.7 37 registers
  `relationship`), quest cap `QUEST_SCOPE_CAP = 5` (placeholder until M1), overflow named by the
  `quest-scope-overflow` check (author, degrades).
- Runtime: checks through the chance seam (`storyCheckDraws.ts`), `extras.checks` ring (cap 100, rolled back by message,
  sanitized), third roll producer; steering block `INJECTION_REGISTRY.checkOutcome` (depth 0, lazy
  `checkOutcomeHost.ts`); quest-reward host effects through `gamePort.ts` (boundary work `game`, order 5) and
  `EffectsApplier.applyQuestRewards`, ledger rows tagged `origin {kind: "quest", id, boundary, messageId}`; reward
  `world_info` through the path replay (`worldInfoPlan(story, path, rewarded)`); `/story quests`; narrative quests and
  epilogue milestones; L1 inline chips; chronicle milestones.
- Projection (lazy `runtime/widgets.ts`, `gameSheet.ts`, `gameSnapshot.ts`): `snapshot.game` (player) and
  `snapshot.gameAuthor` (Author view only); synthesized Journal (track + log) and Stat sheet; authored widgets replace
  them.
- UI: `components/widgets/WidgetCard.tsx`, `components/panels/{Journal,StatSheet,Widget}Panel.tsx` in `PanelFrame`,
  openers `#so-open-journal`, `#so-open-stat-sheet`, `#so-open-widgets`, wand entries; public check chips in player
  mode (`[data-source="check"]`, no detail); toggles in `PresenceControls`; Studio "Game" tab (`GameEditor`:
  Quests, Milestones, Checks, Public qualities, Story panels) over `studio/gameMutations.ts`; agent tools
  `setQuests | setMilestones | setWidgets | setQualityDisplay | setCheckpointChecks | setTransitionCheck`
  (`copilot/agent/gameOps.ts`); every new component has a `.stories.tsx` (390/768/1440 fits).
- Docs: `story-guide.md` topics `quests`, `checks`, `widgets` (+ compact twins in `guideTopics.ts`, `npm run
  docs:guide`), player guide `playing.md` (Journal, stat sheet, panels, `/story quests`) and `drawer-and-hud.md` (dice
  chips), spoiler checklist rows in `docs/plans/v2.1/test-plan.md`.
- Lists: `test/sessions/baseline-settings.json` (`display.presence.journal|statSheet|widgets`),
  `test/findings/ownership-sites.json` (`EffectsApplier.applyQuestRewards`, `createGamePort.dispatch`; the two
  `applyWorldInfo`/`replayWorldInfoFiles` rows renamed to `effectSteps.ts`), `test/findings/errorCopy.json` (three rows),
  `PLAYER_FORBIDDEN_SELECTORS` / `INLINE_PLAYER_FORBIDDEN_SELECTORS` in `scripts/debug/so-ui.mts`,
  `architecture.test.ts` presence list (the projection and panel files never touch a prompt seam). No new model call
  site, judge use or coordinator.

**Independent review (Sol), three points, resolved**

1. *Origin-specific rollback.* `revertOriginSince(kind, messageId)` was built and then **removed**: per-origin undo of
   interleaved writes to one target is unsound, exactly as the review says (the negative control in
   `questRewards.review.test.ts` shows a quest-only undo refusing a target a later checkpoint write holds). There is now
   ONE chronological undo: every rollback path (swipe, edit, delete) that moves the engine runs the existing
   `restoreFor({since})` → `restorePlan`, newest first across every origin, compare-and-set per target, then re-applies
   the active checkpoint. A boundary that only latched a quest now counts as a move (`questLatchesMoved` in
   `engine.shouldRollbackFromMessage`), so the latch, the reward's `set` writes and its host effects all roll back
   together and rollback ≡ replay holds (`quests.test.ts`: 4 seeds × 100 boundaries = 400 cuts, plus a negative
   control). Origin is preserved through compaction (`compactLedger` never merges rows of different origins) and
   hydration (`sanitizeEffects` keeps the row), and a pending row from a failed save reconciles like any other.
   Tests: `questRewards.review.test.ts` (mixed origins on one target, a cut between them, external edit, compaction both
   ways, reopen, failed save), `questRollback.review.test.ts` (swipe/edit/delete through `runRollback` with a real
   engine, and a control after the completion). v2.7 37 agendas and v2.7 35 complications only tag `origin`; they get no
   undo of their own. On the history-unavailable path the engine does not move, so the latch and its host writes are
   left together (consistent, recorded here).
2. *Quest lifecycle.* Acceptance is `visible_when`: the quest turns active the moment it holds, so an offered quest
   must declare one (validator), and an ignored offer stays offered and never fails. Terminal state is persisted:
   `quest_<id>_closed` (code enum `done | failed`, latching, added by the validator) is written at the boundary that
   closes the quest, so a completion gate that toggles back does not reopen it; failed wins when both gates hold at one
   boundary. Story updates: a changed reward after it was earned is `quest-reward-changed-earned` (compatible, not given
   again); a removed active quest is `quest-removed` (compatible); a removed quest this chat closed is
   `quest-removed-closed` (invalidating, so keep/restart/cancel is asked). Tests: `quests.test.ts` (ignored offer,
   toggle-back, failed precedence, rollback past completion), `questDiff.test.ts` (four update cases).
3. *Floors and budgets.* The steering header now asks for the outcome positively ("Show each one happening in this
   reply, as it fell: never change it, never skip it"), and Q3's floor is restated as two halves, both frozen before
   the 39 run: **reflected** (the narrator shows the given outcome) in **≥ 18 of 20** public checks, and
   **contradicted** in **≤ 1 of 20**; a run where outcomes are ignored can no longer pass. Overflow priority: active
   quests, then offered, then hidden, and inside each status a round robin (every quest's first key before any quest's
   second, authored order), so no older active quest is starved by a busier newer one (`questScope.test.ts`,
   `quests.test.ts`). The plan's "newest activation first" is replaced by this. **Plan 39 owes one combined-budget
   row**: M1 measured with quest keys AND card pulls in the same read (and relationship axes once v2.7 37 registers),
   not each cap alone; `QUEST_SCOPE_CAP` stays the placeholder 5 until that row passes.

Coordinator line budget: noted as 560 (`test/findings/codeHealth.json`); this plan adds no coordinator and touches none.
`runtimeManager.ts` is at 696 of 700 effective lines.

**Deviations from the plan text**

- `twist` is `{quality}` (a code bool the gate can read), not `twist: true`.
- Reward `world_info` is applied by the checkpoint path replay with the rewarded quests' entries, not ledgered per row
  (world info is never ledgered); in `gatingMode: "scan"` (spike, default off) and in the WI evidence ring rewards are
  not carried.
- Secret milestones are **not listed** until earned, instead of "???": the spoiler property (player view byte-identical
  with and without hidden items) failed on the "???" row, which reveals that a secret exists (same reason as v2.7 K1).
- Overflow is a `quest-scope-overflow` check row (author, degrades), not a journal record.
- Boundary-work entry is `game` (order 5: check records + reward dispatch), not `quest-rewards`.
- The game-layer validators load as a lazy chunk (`engine/validate/gameLayer.ts`; `index.tsx` awaits it before
  `startRuntime`, the Studio chunk installs it statically, jest through `test/support/gameLayer.setup.ts`). Before it
  loads, a story using quests, checks, displays or widgets is refused with one plain message, never half-read
  (`gameLayer.test.ts`). Without this the prod main bundle was 1,261,734 B, over the 1,250,000 B budget.
- The W prior-art table (st-extensions-research trackers) was **not written**; owed (doc only).

**Commands (worktree, 2026-10-07)**

- `npx tsc --noEmit`: clean. `npm run typecheck:test`: clean. `npm run lint`: clean.
- `npm run gates -- --no-storybook`: **all green in 108.9 s** (build, typecheck, build:dev, test:debug 1093 pass,
  test 568 suites / 6677 pass / 1 skipped, test:plugin, debug:typecheck, test:replay 32 of 32 killed, typecheck:test,
  test:release, lint). `test-storybook:ci` **SKIPPED** (Storybook cannot run from a worktree).
- `node --test scripts/debug/so-ui.test.mts`: 32 pass.
- Prod `dist/index.js`: **1,240,986 B** (budget 1,250,000; baseline 1,217,053).

**Not run (owed to v2.7 39)**

- Storybook interaction + a11y at 390/768/1440 for the 12 new story files.
- No-model scenario `test/scenarios/v27-36-quests.json` (+ `v27-36-quests.story.json`), `requires` lane `no-model`,
  group "Group: Arin, DM Narrator": schema-validated and every `eval` syntax-checked, **never run**.
- Live D on a lane ×2, `assert-player-clean` with every panel open, M1/M2 (CL), Q3 reflected/contradicted (RP), the
  academy-act and Saga pilots.

**Open questions**

- Should an unearned secret milestone show a count ("1 more to find")? Not built: a count also reveals.
- Should an offered quest ever expire? Today it waits forever; expiring would need a non-time gate the author writes.
- `QUEST_SCOPE_CAP` and the combined budget with card pulls (and v2.7 37 relationships) are unmeasured.

### Owner decisions 2026-10-07 (built on `v2.7-owner-decisions` from `v2.7-image-track-wip` @ `4edf5da8`)

- **The story panel's action log never lists an OOC line.** `widgets.ts actionRows` skips a player row that
  `engine/ooc.ts isOocLine` marks (`((…))`, `OOC:`, `(OOC`), so the `log` widget and the Journal's synthesized Log show
  only in-character actions; brackets inside an ordinary line still count. Tests: `runtime/gameProjection.test.ts`
  (each OOC form left out, order kept; control: the same lines in character are all listed).
- **A pending warden note does not lapse on an OOC line** (v2.7 finding 19, the note lifecycle shared with the
  continuity warden): `playerWroteBetween` in `stagecraftCoordinator.ts` no longer counts an OOC player line as "the
  player wrote again". Test: `stagecraftCoordinator.test.ts` "an out-of-character player line is no new turn" (each
  OOC form, then accept and carry), beside the control "a newer reply lapses it".

Gates as in 37's owner-decision record (all green, Storybook skipped); row 39 S-19-OOC-b (not run).

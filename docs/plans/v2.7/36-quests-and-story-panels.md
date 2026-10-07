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
  if arm 5 fails, Q1 ships without side quests discovered by extraction). **M2** completion recall on **20** labelled
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
  (second-model labelled).

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

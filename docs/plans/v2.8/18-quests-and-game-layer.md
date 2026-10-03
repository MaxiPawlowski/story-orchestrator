# Plan 18 — Quests and a game layer, built on the engine we have

**Status (2026-10-03): v2.8 plan 18 (was v2.7 plan 19). Exploration topic from the user; decided (all of Q1–Q5, rolls
visible, side quests authored plus proposed, pilot on the academy act then the Saga); Q6 waits on v2.8 17's verdict;
not built, M1/M2 not run.** Overview: `00-overview.md`. **Gate tiers** (00-overview §Gate taxonomy): implementation D;
acceptance CL (M1/M2 extraction reads on the DeepSeek read model) + RP (replies on the pod, the pilot sessions).

## Overview

A story can declare quests, public qualities, visible checks and milestones. All of it is derived from the blackboard
the engine already keeps, so rollback ≡ replay still holds for the game state. Host effects a quest reward causes (World
Info, cast, NPC replies) are dispatched and reversed by the runtime, not the engine (§Rewards and rollback). The panels
that show it (quest log, stat sheet, public roll chips) are v2.8 04 C4, C7 and C9, which integrate after this plan.

## Problem

- **The engine already has the parts of a quest engine, but the player never sees them as quests.**
  - Typed qualities, gates, latching and seeded rolls exist (`engine/schema.ts:56-114`).
  - So do objectives, chapters and open threads (arcs).
  - The player sees only the active checkpoint's objective line and the open threads (`runtime/narrative.ts:141-186`).
  - There is no quest log, no visible progress, no inventory, no side quests and no record of what was achieved.
- **Prior art wants this badly.** The busiest threads in the corpus are game layers: Multihog D&D (29k messages),
  RPG Companion, ST Gamemaster, SuperObjective and Silly Sim Tracker (`v2.4/extension-research/SUMMARY.md` §8).
- **Prior art also fails the same ways each time:**
  - state parsed out of the main model's reply (markers, fenced JSON);
  - LLM calls that block the send;
  - "locks" that exist only in the prompt;
  - trackers that anchor on their own previous values.
  - Our blackboard already avoids all four (`.claude/sillytavern-docs/community/prompting-memory-prior-art.md` §10).

## Principles (non-negotiable for this plan)

1. **Every game fact is a quality or derived from one.** There is no second store for game state, so the game state
   rolls back with the blackboard. A quest's status is a pure function of the blackboard plus the visited path. Host
   effects are the exception, and the runtime owns their reversal (§Rewards and rollback).
2. **Authored, not generic.** No install-wide XP, levels or loot tables. The story declares what counts, and a story
   without a game layer looks exactly as it does today.
3. **The world decides outcomes, in code.** A check is a seeded roll with a declared epoch (Q3), and its odds come from
   authored modifiers, never from the model. The model narrates a result it was given.
4. **Player-visible = declared public.** Nothing shows unless the author marks it. Hidden quests stay hidden until their
   `visible_when` gate holds. Every new surface adds spoiler-checklist rows.
5. **No reply-path LLM calls.** Completion is read by the existing extraction (or the typed judge read, when
   calibrated) at a boundary, like any quality.

## Design (decided: Q1–Q5)

### Q1. Quests (format addition, optional `quests[]`)

```json
{ "id": "find-the-map", "title": "The cartographer's map", "kind": "side",
  "visible_when": { "q": "met_cartographer", "op": "==", "v": true },
  "done_when":    { "q": "has_map", "op": "==", "v": true },
  "failed_when":  { "q": "cartographer_dead", "op": "==", "v": true },
  "steps": [ { "text": "Find the cartographer", "done_when": { "q": "met_cartographer", "op": "==", "v": true } } ],
  "reward": { "effects": { "world_info": { "enable": ["Map routes"] } }, "set": { "renown": "+1" } } }
```

- **Status is derived:** hidden → active → done or failed, evaluated by a pure `engine/quests.ts` from the blackboard.
  It is never stored.
- **The main line is the checkpoint graph.** Quests are side tracks. A main-line quest is implied: the active
  checkpoint's `objective` is shown as the current main quest step, with completed checkpoints' `player_name`s as done
  steps.
- **Validator checks:** every quality named exists; `done_when` and `failed_when` are not both satisfiable from the
  start state; rewards only write `source: code` qualities.
- **Studio:** a Quests editor, plus wizard support through a new mutation and agent tool (`tools.test.ts` coverage).

#### Extraction scope for quests (review F20)

`deriveScope` (`src/extraction/scope.ts:22-84`) pulls in only the built-in tension key, snapshot keys and gate keys of
the active and reachable checkpoints, plus `extraGateSources`. A quest's keys are pulled by none of these unless a
transition happens to use them, so a quest could never be discovered or completed. Add an explicit, bounded scope
source:

- **New pull kind `quest`** (beside `builtin`/`snapshot`/`gate` in `ScopePull`), fed by a pure
  `questScopeSources(story, blackboard)` in `engine/quests.ts`, passed through the same `extraGateSources`-style
  parameter so `runTypedRead` (`runtime/coordinators/extractionCoordinator.ts:167-184`) and the shared read see the same
  scope.
- **Hidden quests:** only the extractor keys in `visible_when` are in scope while the quest is hidden. Without this a
  hidden quest can never surface.
- **Active quests:** the extractor keys in `done_when`, `failed_when` and the open steps' `done_when`.
- **Done/failed quests:** nothing. Latched keys already leave scope.
- **Bound:** at most `QUEST_SCOPE_CAP` keys (the highest M1 arm that passes) from quests, newest
  activation first; overflow is journaled for the author, never silently dropped.
- **Tests:** a hidden → active discovery where the `visible_when` key is used by no transition and no snapshot; the same
  for a `done_when` key; the cap's overflow record; rollback ≡ replay of scope over a discovery.

### Q2. Visible qualities: stats, inventory, meters

- A per-quality `display: { public: true, label, as: "meter" | "count" | "word" | "item", group }`, where the existing
  `player_labels` gives enum words.
- **Inventory** = public bool qualities with `as: "item"` (`has_map`, `has_key`), shown in an "Inventory" group.
  A list/set quality type is deliberately not added in the first cut: bools latch, roll back and gate cleanly.
- **Meters** (renown, supplies) use int qualities with bounds.
- **Never relationships** (review A3): `display.public` is refused by the validator on the qualities v2.8 20 compiles
  from `roster[].relationships` (`rel_*`). Relationship meters are author-visible only, private for players (v2.8 20
  decision 2).
- This plan delivers the snapshot read model (`snapshot.game.sheet`). The **Character sheet** panel (drawer Overview
  section, optional HUD chips) is v2.8 04 C7.
- This is v2.4's deferred "visible qualities" item.

### Q3. Checks the player can see

- An authored `check` on a transition or beat: `{ id: "climb", quality: "climb_ok", roll: {sides: 20, target: 12},
  modifiers: [{ q: "has_rope", v: true, add: 4 }], narrate: "public" | "hidden" }`.
- **Roll epoch, declared (review F22).** Existing seams differ: quality rolls draw from
  `[chatId, storyId, checkpointStartedBoundary, key]` (`runtime/chance.ts:31-36`, `chanceGateValues`); NPC reply chance
  and the talk pick draw from the **current** boundary (`:38-41`). A check uses the **checkpoint epoch**: the draw is
  `unitDraw([chatId, storyId, checkpointStartedBoundary, "check:" + id])`, where the checkpoint is the one the check sits
  on (the transition's `from`, or the beat). One draw per visit:
  - several group replies in one round (several boundaries) see the same draw; the current-boundary epoch would reroll
    per reply, which is save-scumming by waiting;
  - a swipe or an edit rolls back and re-derives the same draw;
  - a reopened chat re-derives the same draw;
  - **re-entry** of the checkpoint at a new boundary draws afresh (a new visit, the same rule quality rolls follow).
- Modifiers are read at each boundary over the fixed draw: total = draw + modifiers. Finding the rope changes the
  outcome; asking again does not.
- The draw is computed in the runtime chance seam (`EngineHost.derive`), never in the engine (chance invariant, SP7.b).
- **Provenance for the chips (cross-ref F21; Sol r3 R3-05, R3-06).** v2.8 04 C9 (a)'s public chips and v2.7 06 C9 (b)'s author chips need production roll
  history: `ChanceDrawKind` is `npc | talk` only (`chance.ts:14`), and v2.7 06 adds the production `extras.chance.draws`
  ring for those two. Q3 adds a per-chat `extras.checks` ring `{checkId, visit, boundary, messageId, sides, draw,
  modifiers, total, target, outcome, narrate}`, capped, rolled back by message (like `extras.lore.fired`), and
  reconstructable from the seed for a reopen. **One consumer schema:** checks do not go into `extras.chance.draws`;
  v2.7 06's roll store (`snapshot.rolls`, composed in `snapshotBuilder`) reads its three producers (reconstructed
  quality rolls, `extras.chance.draws`, `extras.checks`) into one `RollRecord` `{source: "quality" | "npc" | "talk" |
  "check", key, messageId, boundary, sides, draw, target?, modifiers?, total?, outcome?, narrate}`, ordered by message.
  C9 (a) and (b) render only `snapshot.rolls`, never a ring directly.
- **When a check is recorded (Sol r3 R3-06): when it is evaluated, not when a transition fires.** A check is evaluated
  at a boundary when it is **attempted**: for a transition check, the transition's gate holds apart from the check's
  own quality (the player tried); for a beat check, the beat is reached. The record is written at that boundary
  whatever the outcome, so a failed public check, whose transition never fires, still shows its result, and a beat
  check, which has no transition, shows one too. **Dedup:** one record per (`checkId`, visit, outcome), visit =
  `checkpointStartedBoundary`; later replies in the same round add nothing, a modifier that flips the outcome (the rope
  found) adds the new outcome's record, and a re-entry (new visit) records afresh. Tests (jest): failed public check
  with the transition unfired → one `failure` record and a public chip; beat check → one record; a group round of three
  replies → one record; rope found after a failure → a second record `success`; swipe of the attempting reply → the
  record rolled back and re-derived identically; reopen → identical.
- **Visibility.** `narrate: public`: a player chip "Climb: 15 + 4 vs 12, success" (v2.8 04 C9 (a)) and the steering text
  tells the narrator the outcome. `hidden`: only the outcome is narrated; the roll detail renders only with Author view
  on (v2.7 06 C9 (b)), guarded on `authorView`, not on the inline level, because players can reach L2 (`PLAYER_LEVEL_CAP = 2`,
  `runtime/settingsModel.ts:37`).
- Prior art: the Multihog "DC before the roll" and Gamemaster "code rolls the outcome" ideas (`SUMMARY.md` §8,
  ideas 5 and 7).

### Q4. Achievements / milestones

- Optional `milestones[]`: `{ id, title, when: <gate>, secret?: true }`. Derived like quests and shown at story end and
  in `/story chronicle`.
- A secret milestone shows "???" until earned.
- Per chat only. A cross-chat trophy shelf needs the plays index (v2.7 06) and is a later question.

### Q5. Quest log

- This plan delivers the read model (`snapshot.game.quests`: main line, active side quests with steps, done/failed),
  inline chips "Quest started / completed / failed" at L1 (player), `/story quests`, and the away-recap line for active
  quests.
- The **Journal** tab (player mode, draggable) is v2.8 04 C4, built on that read model.

### Q6. Pressure and complications (production component, on v2.8 17 PASS)

- v2.8 17 measures the SP6 complication pool (K2 re-run, K3–K5 on the lab). The spike stays behind
  `spikes.sp6Complications`, off.
- **On PASS**, Q6 builds the production complication component here: the typed format, the pure
  `src/pacing/complications.ts`, the `pacingCoordinator` writer, a registered injection, reopen-safe spent-ness, author
  surfaces and the Studio pool editor (full design: v2.8 17 §Plan, Step 2). It is the game layer's pacing tool ("Doom
  counter"). v2.8 19's pressure (`trigger: "quiet"`) is built on it afterwards.
- **On FAIL or INCOMPLETE ×2**, Q6 is not built and v2.8 17 drops the spike.
- Player copy: none (v2.8 17 decision 4).

## Rewards and rollback (review F25)

The engine latches `quest_<id>_rewarded` and queues the `set` part as a `source: code` write. That rolls back with the
blackboard. The `effects` part is a host write, and a blackboard rollback does **not** undo it: a World Info entry stays
enabled, a cast change stays applied, a posted NPC reply stays in the chat. The current rollback has separate rewind
paths (`runtime/rollback.ts:89-103` quarantine, `:109,130,146` stagecraft revert, `:150` checkpoint re-apply) and none of them
knows quest rewards.

- **Dispatch.** A boundary-work entry (`runtime/boundaryWork.ts`, `{id: "quest-rewards", order, when, run}`) reads the
  rewards that latched at this boundary and dispatches their effects through `EffectsApplier.withLedger`, each ledger
  row tagged with its origin `{kind: "quest", questId, boundary, messageId}`. Host writes never move into the engine.
- **Ownership.** Each dispatch takes a `RunOwnership` token and re-checks it before each host write (ownership census
  row `checked`).
- **Reversal.** `runRollback` gains one call beside `stagecraft.revertAppliedSince`: `effects.revertOriginSince("quest",
  messageId)`, which reverts every quest-origin row applied at or after the cut by compare-and-set from its `before`
  (World Info and cast are `RESTORABLE`; an `externally-changed` row is recorded, never clobbered). NPC replies follow
  the existing rewind (`rewindNpcReplies`): the fired marker rewinds so the reply can fire again; a posted reply message
  stays chat text, as today's `npc_replies` do. It runs on both rollback paths (engine restored, and noop with
  quarantine).
- **Shared with v2.8 20** (agenda effects, origin `agenda`). Whichever plan builds first builds the origin-tagged ledger
  rows and `revertOriginSince`; the other reuses it and adds its origin (decided by the user 2026-10-03, as
  recommended).
- **Re-apply.** After a rollback, a reward whose latch survives is not re-dispatched (its ledger row stands).
- **Tests:** jest with a fake host: reward fires (WI on, quality latched), swipe of the rewarding reply → WI off and the
  latch gone; edit before it → same; reopen → same host state as a continuous run; an `externally-changed` WI entry is
  left alone. Fault-matrix rows for the new writer. A no-LLM live scenario asserting the WI entry's state with the
  blackboard.

## Side quest proposals (decision 3: authored plus proposed; review C2)

Authored quests are Q1. Proposed quests get their own contract and owner; `StagecraftCoordinator` stays lorebook-only
(its isolation is enforced by `architecture.test.ts`).

- **Wizard, at authoring time.** The agentic wizard proposes a quest through an `addQuest` tool over a new
  `mutations.ts` op; review/auto-draft rules as for any edit card (v2.6 plan 11). No runtime part.
- **Runtime, during play.** A new `QuestProposalCoordinator` (own `extras.questProposals` slice, constructor-injected
  deps, no engine/memory imports beyond reads) asks for at most one proposal per scene break. Contract `QuestProposal`:
  `{ id, title, kind: "side", visible_when, done_when, failed_when?, steps[], reason, sourceWindow }`, strict line
  parser, **only existing qualities** (it cannot declare qualities or rewards with effects; `set` on code qualities
  only). Validated by the same quest validator.
- **Review.** Author view only. Accept adds the quest to the chat's per-chat quest overlay (`extras.questProposals
  .accepted`, keyed by boundary, rolled back by message); it is evaluated exactly like an authored quest. Reject is
  journaled with its reason. Never auto-accepted; never player-visible until accepted and its `visible_when` holds.
- **Ship dark (v2.8 rule 9).** A new runtime model use: fixture + offline replay first, dev-only until its floor passes
  twice (proposal validity ≥ the floor set before the run, 0 proposals naming unreached content in a spoiler fixture),
  then an off-by-default switch.

## Not proposed

- Generic XP and levels.
- Combat systems with HP per turn (a multi-call blocking design in every prior-art version).
- Model-written stat blocks in replies.
- A player-editable stat sheet (that is author steering, and author-only).
- Public relationship meters (v2.8 20, A3).

## Measurement before building

- **M1 extraction load (CL).** On the academy-act lab copy, add Q1-shaped extractor qualities and run the
  `so-live-suite` fixtures through the DeepSeek read model. Arms, defined: **0, 5, 10 and 20 extra active qualities**
  (0 is the control). Measure per-tier delta accuracy (`plotDeltaAccuracy`, facts, rejected) and read cost (prompt tokens,
  latency). **Floor: no tier drops more than X points vs the 0 arm; X and the token ceiling are written here before the
  run** and never retuned. The highest arm that passes sets `QUEST_SCOPE_CAP`.
- **M2 completion recall (CL).** The share of `done_when` transitions the extractor latches within N turns of the
  player doing the thing, on about 20 labelled cases. Labels from session evidence get a second-model check, never the
  user (00-overview rule 11). N and the floor are written before the run.
- **M3 player value.** Decided: the user approved all of Q1–Q5 and visible rolls on 2026-10-03, which satisfies v2.8
  rule 4 for these surfaces. The pilot sessions (below) are evidence, not a gate on building.

## Pilot

Adolion, staged: the academy act first (v2.8 02 lab copy), then the Saga once M1/M2 pass on the act. Replies on the pod
(RP), reads on DeepSeek (CL), sessions from `adolion-fresh`.

## Gates

- Pure engine: `engine/quests.ts` property tests (quest status and quest scope under rollback ≡ replay; a reward fires
  once per path; a check's draw is stable across group replies, swipe, edit and reopen, and fresh on re-entry).
- Extraction scope: the F20 tests above.
- Rewards: the F25 host-state tests above, ownership census and fault-matrix rows.
- Validator cases, Studio stories (interaction + a11y), the agent tool coverage test.
- Spoiler checklist rows: hidden quests (title and steps absent until `visible_when`), secret milestones ("???"),
  hidden-check roll detail (absent in player mode at L1 and L2), proposed quests (absent until accepted and visible);
  `so-ui.mts assert-player-clean` covers them.
- Registered in the v2.7 01 feature registry + Help (registry test).
- `npm run gates`; a no-LLM scenario (discovery, completion, reward, swipe, reopen); then M1/M2 (CL) and the pilot
  live suite (RP) in the final batched suite.

## Unresolved questions

1. How much game? Quests + journal only (Q1, Q5), or also stats/inventory (Q2), checks (Q3) and milestones (Q4)? All
2. Should rolls be visible to the player (Q3 `narrate: public`), or should chance stay invisible as today? sure, they can be visible
3. Are side quests authored only, or may the wizard/curator *propose* them (author-reviewed)? both
4. Does Adolion get a game-layer pilot story, or a new small test story? should we? maybe a saga? i liked adolion bcs its much more real than a small controlled scenario.

   **Answer (2026-10-03): Adolion, staged act then saga.** Pilot on one act first (the academy act, v2.8 02), then
   promote to the Saga once the floors pass. Why: the Saga already carries 179 qualities, and quests add read scope on
   every turn. Measuring M1 (extraction load) on one act tells us the cost before we multiply it by 157 checkpoints. It
   is still real campaign data, not a toy scenario. Answers above: all of Q1–Q5, rolls visible, side quests authored
   plus wizard/curator-proposed (author-reviewed; the curator half is the `QuestProposalCoordinator` above, not the
   stagecraft curator).

## Links

- v2.8 17 SP6: the measurement that decides Q6.
- v2.8 19 open stretches: side quests found in stretches; pressure built on Q6.
- v2.8 20 character life: relationship qualities never take `display.public`.
- v2.8 04 C4 (Journal), C7 (stat sheet), C9 (a) (public roll chips): the panels over this plan's read models; v2.7 06
  C9 (b) (author roll chips, Activity panel, the roll store `snapshot.rolls` that reads `extras.checks`).
- v2.8 02 Adolion campaign: the academy-act lab copy and the pilot.
- v2.7 06: the plays index a cross-chat trophy shelf would need.
- v2.7 01: feature registry + Help.

## Review 2026-10-03

- **F01** applied: status and gate tiers.
- **F20** applied: §Extraction scope for quests adds a bounded `quest` scope source (hidden `visible_when` keys in
  scope while hidden), with discovery and no-transition-key tests.
- **F22** applied: Q3 declares the checkpoint epoch and contrasts it with `chance.ts:31-41`; gates cover group replies,
  swipe, edit, re-entry and reopen.
- **F25** applied: §Rewards and rollback (boundary-work dispatch, origin-tagged ledger rows, reversal wired into
  `runRollback`, host-state tests); host writes stay out of the engine.
- **C2** applied: §Side quest proposals (wizard via mutations; runtime `QuestProposalCoordinator` with its own contract;
  StagecraftCoordinator untouched; dark ship per rule 9).
- **B11** applied: Q6 rewritten (measured in v2.8 17, built here on PASS).
- **A3** applied: Q2 refuses `display.public` on relationship qualities.
- **F21** cross-ref: Q3 adds the `extras.checks` provenance ring and the Author-view guard C9 needs.
- Overview wording and **M1 arms** applied: new §Overview; Problem's first line no longer says "already a quest
  engine"; M1 arms 0/5/10/20 with X predeclared.
- **B10** registry gate added. M3 "rule 7" → v2.8 rule 4 (user decided). Pilot answer kept and consistent. Tiers: reads
  CL, replies RP.
- Not applied: none. Line refs re-verified on `c7967323`: `scope.ts:22-84`, `chance.ts:14,31-41`,
  `settingsModel.ts:37`, `rollback.ts:89-103,109,130,146,150`, `extractionCoordinator.ts:167-184`.

Round 3 (Sol): R3-05, R3-06, R3-19 applied.

2026-10-03 (user: as recommended): the shared origin-tagged rollback is built once, by whichever of v2.8 18 / v2.8 20
builds first (§Rewards and rollback).

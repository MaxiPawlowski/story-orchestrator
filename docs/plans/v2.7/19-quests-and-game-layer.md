# Plan 19 — Quests and a game layer, built on the engine we have

**Status: EXPLORATION 2026-10-03 (topic from the user). Not approved, not built.** Overview: `00-overview.md`.

## Problem

- **The engine is already a quest engine, but the player never sees it as one.**
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

1. **Every game fact is a quality or derived from one.** There is no second state store, so rollback equals replay for
   free. A quest's status is a pure function of the blackboard plus the visited path.
2. **Authored, not generic.** No install-wide XP, levels or loot tables. The story declares what counts, and a story
   without a game layer looks exactly as it does today.
3. **The world decides outcomes, in code.** A check is a seeded `roll` (SP7.b), and its odds come from authored
   modifiers, never from the model. The model narrates a result it was given.
4. **Player-visible = declared public.** Nothing shows unless the author marks it. Hidden quests stay hidden until their
   `visible_when` gate holds. Every new surface adds spoiler-checklist rows.
5. **No reply-path LLM calls.** Completion is read by the existing extraction (or the judge, when calibrated) at a
   boundary, like any quality.

## Design candidates

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
- **The main line is the checkpoint graph.** Quests are side tracks. A main-line quest is implied: the active checkpoint's
  `objective` is shown as the current main quest step, with completed checkpoints' `player_name`s as done steps.
- **Rewards:**
  - The `set` part is a code write queued like any `source: code` quality.
  - The `effects` part reuses the effect vocabulary (world info, NPC reply, cast change).
  - Both fire once, at the boundary where `done_when` first holds. Idempotency comes from a latching
    `quest_<id>_rewarded` quality the validator generates, so a rollback un-rewards.
- **Validator checks:** every quality named exists; `done_when` and `failed_when` are not both satisfiable from the start
  state; rewards only write `source: code` qualities.
- **Studio:** a Quests editor, plus wizard support through a new mutation and tool.
- **Extraction scope:** a quest's gate qualities join the extractor's active scope (`extraction/scope.ts`) while the quest
  is active. This is the real cost: more qualities read per turn.

### Q2. Visible qualities: stats, inventory, meters

- A per-quality `display: { public: true, label, as: "meter" | "count" | "word" | "item", group }`, where the existing
  `player_labels` gives enum words.
- **Inventory** = public bool qualities with `as: "item"` (`has_map`, `has_key`), shown in an "Inventory" group.
  A list/set quality type is deliberately not added in the first cut: bools latch, roll back and gate cleanly.
- **Meters** (renown, trust, supplies) use int qualities with bounds.
- Rendered in a **Character sheet** section of the drawer Overview and, if the author asks, as HUD chips.
- This is v2.4's deferred "visible qualities" item.

### Q3. Checks the player can see

- An authored `check` on a transition or beat: `{ quality: "climb_ok", roll: {sides: 20, target: 12},
  modifiers: [{ q: "has_rope", v: true, add: 4 }], narrate: "public" | "hidden" }`.
- The roll is seeded (chat, story, boundary, key) exactly like SP7.b, so a swipe re-reads the same roll and cannot reroll.
  That is the anti-save-scum property, and it is a feature to state to the player.
- With `narrate: public`, an inline chip shows "Climb: 15 + 4 vs 12, success" and the steering text tells the narrator the
  outcome. With `hidden`, only the outcome is narrated.
- Prior art: the Multihog "DC before the roll" and Gamemaster "code rolls the outcome" ideas
  (`SUMMARY.md` §8, ideas 5 and 7).

### Q4. Achievements / milestones

- Optional `milestones[]`: `{ id, title, when: <gate>, secret?: true }`. Derived like quests and shown at story end and in
  `/story chronicle`.
- A secret milestone shows "???" until earned.
- Per chat only. A cross-chat trophy shelf needs the plays index (plan 04) and is a later question.

### Q5. Quest log UI

- A **Journal** tab in player mode: the main line (done steps + current objective), active side quests with steps, and
  done/failed quests.
- Inline chips: "Quest started / completed / failed", at L1 (player).
- `/story quests`.
- Away recap mentions active quests.

### Q6. Pressure and complications (already half built)

- The SP6 complication pool is built behind `spikes.sp6Complications`, off, with K2 failing and K3/K4 owed
  (`v2.6/03-spike-reevaluation.md:34`).
- It is the "Doom counter" idea (sustained low tension releases an authored complication).
- If SP6 passes its floors in v2.6, it graduates here as the game layer's pacing tool. If not, it stays a seed.

## Not proposed

- Generic XP and levels.
- Combat systems with HP per turn (a multi-call blocking design in every prior-art version).
- Model-written stat blocks in replies.
- A player-editable stat sheet (that is author steering, and author-only).

## Measurement before building

- **M1 extraction load:** add Q1-shaped qualities to an Adolion lab story and measure the delta accuracy and read cost
  with 5/10/20 extra active qualities (the `so-live-suite` tiers). The floor is no tier regressing more than X points.
  X is set before the run.
- **M2 completion recall:** the share of `done_when` transitions the extractor latches within N turns of the
  player doing the thing (human-labelled transcript of about 20 cases).
- **M3 player value:** whether the user's playtest asks for this. Rule 7: player-visible change needs a session.

## Gates

- Pure engine module plus property tests (quest status under rollback ≡ replay, reward fires once per path).
- Validator cases, Studio stories, spoiler rows, a no-LLM scenario, then the live suite.

## Unresolved questions

1. How much game? Quests + journal only (Q1, Q5), or also stats/inventory (Q2), checks (Q3) and milestones (Q4)? All
2. Should rolls be visible to the player (Q3 `narrate: public`), or should chance stay invisible as today? sure, they can be visible
3. Are side quests authored only, or may the wizard/curator *propose* them (author-reviewed)? both
4. Does Adolion get a game-layer pilot story, or a new small test story? should we? maybe a saga? i liked adolion bcs its much more real than a small controlled scenario.

   **Answer (2026-10-03): Adolion, staged act then saga.** Pilot on one act first (the academy act, plan 05), then
   promote to the Saga once the floors pass. Why: the Saga already carries 179 qualities, and quests add read scope on
   every turn. Measuring M1 (extraction load) on one act tells us the cost before we multiply it by 157 checkpoints. It
   is still real campaign data, not a toy scenario. Answers above: all of Q1–Q5, rolls visible, side quests authored plus
   wizard/curator-proposed (author-reviewed).

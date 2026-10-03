# Plan 19 — Open stretches: free play between the story's fixed points

**Status (2026-10-03): v2.8 plan 19 (was v2.7 plan 17). Exploration topic from the user; decided (decisions 1–3 yes,
4 in-fiction only as recommended, 5 measure stubs first); not built, M1/M2 not run.** Overview: `00-overview.md`.
**Gate tiers** (00-overview §Gate taxonomy): implementation D (the engine half: format, validator, player-turn counter,
steering, pull curve); acceptance RP (the M2 A/B on the pod; encounter generation on the expansion route).

**Dependencies** (review C4, F16; 00-overview §Dependencies 17 → 18 → 19): `pressure` needs the production complication
component, which exists only if v2.8 17 passes and v2.8 18 Q6 builds it. The engine half below can be built first;
the pressure half and its gate run after 18 Q6. If 17 fails, `pressure: "complications"` is refused by the validator.

The user's question: when the player is between checkpoints, should they be able to play the stub however they want?
Should we predefine how long or big a stub is? Goal: play should feel immersive and free, never like a checkpoint
system steering them.

## How it works today

There is always an active checkpoint. The "between" places are **stubs**: an `intermediate` checkpoint with no
guidance, effects or snapshot, from which an anchor is reachable (`src/generation/planner.ts:9-16`). A stub plays in one
of two ways:

| State | What the player gets | Feel |
|---|---|---|
| **Not expanded** (generation off, pending or failed) | No guidance, no objective. The exit waits for an arrival read (e.g. `reached_walls == true`) or for progress | Open, but aimless. Nothing in the world pushes, and the story only moves when the player walks to the next place |
| **Expanded** (background generation, the default path) | 2–6 generated beats, each with an objective, guidance and gated outcomes that sum progress to the anchor. The count comes from the size of the state change still needed (`planner.ts:59`: `max(2, min(6, ceil(deltaWeight)))`), not from the player | Structured. Each beat injects an objective line, so a stretch meant as downtime becomes a short errand chain |

Agency defaults already protect the player inside beats: the narration never writes the player's decisions, objectives
are world pressure, and refusals get a recovery (`engine/agency.ts`, guide §Objectives and player agency). Even so, the
expanded stub is the most "railroad-shaped" part of the system: someone else's errand list, sized by a formula.

The campaign has 13 such stubs (the downtime and road stretches). Each has an authored way in, a generated-progress exit
and a fallback arrival exit (`adolion-campaign/docs/FEATURE-COVERAGE.md` A3).

## What feels restrictive (and what doesn't)

- **Restrictive:**
  - an objective line every turn;
  - beats that wait for one specific action;
  - a scene that ends because a counter filled rather than because the player moved on;
  - a stretch whose length the player cannot influence.
- **Not restrictive:**
  - the world having momentum (weather, people, rumours, a deadline the world states);
  - the next fixed point existing.
  - Players accept a destination. They resent a corridor.

## Design (decided): a third stub mode, `open`

```json
{ "id": "on-the-road", "type": "intermediate",
  "stretch": { "mode": "open", "pace": "unhurried", "pull_after": 6, "pressure": "complications",
               "offer": ["encounters"], "arrive_when": { "q": "reached_walls", "op": "==", "v": true } } }
```

Authors choose per stub; today's expanded mode stays (decision 1).

1. **Player-led, world-reactive.**
   - No objective line in the stretch. `objective_block` is story-level (`engine/schema.ts:399`, `"auto" | "off"`), so
     it cannot be switched per checkpoint. Instead the objective injection skips any checkpoint whose `stretch.mode` is
     `open` (a rule in the guidance writer, not a new story field); the story's `objective_block` still governs every
     other checkpoint.
   - Guidance describes the world's state and mood, never a task.
   - The narrator follows what the player starts: a detour, a conversation, a camp, a side quest from v2.8 18.
2. **Length is a curve, not a number** (decision 2). The author sets the stretch's character, never its exact length:
   - `pace` (`brief` | `unhurried` | `long`) maps to `pull_after`, the number of **player turns** of pure freedom before
     the world starts to pull (§Engine needs defines the counter).
   - After that, **pull** is soft. The world offers hooks toward the destination (it makes itself felt, a companion
     mentions it, the weather turns), at a rising rate. Nothing forces the move.
   - **Pressure** (optional, after v2.8 18 Q6) releases from the checkpoint's complication pool with
     `trigger: "quiet"` (defined below). These are world events, never the party's move.
   - **No hard cap by default.** An optional `max_turns` (player turns) raises pressure. It never teleports the player
     and never narrates the move.
3. **The player decides when it ends.** The exit is the arrival read ("we head for the walls", "we arrive"). That is
   already how the fallback exit works. Progress counters are not used in an open stretch, because a filled counter
   ending a scene is exactly the corridor feeling. Ending is in-fiction only: no `/story onward` control or drawer
   button (decision 4), unless a session shows players stuck.
4. **Generation becomes a menu, not a script** (decision 3, behind the M2 floors).
   - Instead of a linear 2–6 beat chain, background generation prepares a small pool (3–5) of optional situations
     ("encounters") fitting the place, tension and open threads.
   - The narrator may offer one when play lulls.
   - None has a required outcome, and none gates the exit.
   - A situation the player engages with can latch a quality or start a v2.8 18 side quest; one they ignore is simply
     gone.
   - This reuses the expansion pipeline, its critic and its agency policy. The output shape changes: no progress sum and
     no anchor-entry beat.
   - **Cache contract.** The encounter pool is a new cache entry shape, so `EXPANSION_CONTRACT` (`generation/types.ts:82`,
     today 2) is bumped to 3, and `sanitizeExpansion` drops entries from contract 2 as it does for every earlier
     contract. Pool entries carry `kind: "encounters"`; `runCodeChecks` gains the pool checks (no gated outcome, no
     progress, agency clauses), and `generation/paths.ts` route enumeration skips pools (they have no routes).
5. **Off-screen life continues.** v2.8 20 agendas tick on their own schedule, so the world the player returns to has
   moved.
6. **What the player sees:** the scene name (a place, e.g. "On the road"), never a task. The HUD shows no pending
   objective. The Journal (v2.8 18 read model, v2.8 04 C4 panel) shows "free time" or nothing. Player-visible: approved
   by decisions 1–3 (v2.8 rule 4).

### Engine needs

- **Player-turn counter (review F23).** `pull_after` and `max_turns` count **player turns**, not boundaries. The existing
  `messages_in_checkpoint` counts boundaries (`engine.ts:453`: `boundary - checkpointStartedBoundary + 1`), and in a
  group one player send yields several replies, so several boundaries. New code quality `player_turns_in_checkpoint`:
  - Definition: the number of player messages (`is_user`, not `/sendas` or narrator lines) with index in
    `(checkpointStartedMessageId, lastMessageId]`. An impersonated line the player sends counts; swipes do not change it.
  - Computed by the runtime chance/derive seam (`EngineHost.derive`) from the engine's `checkpointStartedMessageId` and
    the chat rows, never inside the engine (purity). The engine only applies the returned `source: code` value.
  - Rollback-safe: it is re-derived at each boundary from restored engine state and the chat as it now is, so rollback
    ≡ replay and reopen ≡ continuous run.
  - Tests: a group round of 3 replies to one player send counts 1; two sends with 2 replies each count 2; a swipe of a
    reply keeps the count; deleting a player message lowers it and rolls back; reopen equals the continuous run; a
    property test over random sends/replies/swipes/deletes (rollback ≡ replay).
- **`trigger: "quiet"` (review C4).** Holds at a boundary in an open stretch when both are true: (a)
  `player_turns_in_checkpoint ≥ pull_after`; (b) no quality named by any of the stretch's outgoing gates (including
  `arrive_when`) changed value over the last `complication_after` player turns (default 3), read from the boundary
  snapshots. It is pure, derived from the log and the snapshots, and shares v2.8 18 Q6's pool and spent-ness; escalate
  stays the default trigger elsewhere.
- **A `stretch` block** on intermediates. The validator requires an `arrive_when` exit, refuses `progress` exits from an
  open stretch, and refuses `pressure` when the complication component is not built.
- **Steering text** (`pacing/steering.ts`) gets a "pull" register: hooks toward the destination, rate by the curve, the
  agency clauses unchanged.
- **Stall handling:** in an open stretch, a long quiet run is not a stall. `stallCheck` and the refusal recovery are
  skipped there, and pressure replaces them.

### Why not predefine the size in turns

A fixed size either cuts a scene the player is enjoying or pads one they are done with. The curve gives the author
control over the *character* (a breather vs a long journey) and leaves the *length* to the player. The one number worth
authoring is `pull_after` (how much pure freedom), and `pace` presets cover most of it.

## Beyond stubs: later, after the stub measurement (decision 5)

- **After the final checkpoint:** today the story ends in an epilogue view. An open stretch with no destination
  ("epilogue play") would let the player keep living in the world. Dependency: the epilogue view's summary needs chapter
  seals (v2.6 plan 07 chapters/seals), which stay off until their Q-M floors pass. It also links to new game plus
  (deferred, v2.9 03).
- **Off-route play inside an anchor:** agency recovery already handles refusals. An anchor could declare
  `stretch.mode: "open"` for its first N player turns too, to delay the objective line on arrival.
- Neither is built in this plan; both wait for M2 on stubs.

## Measurement before building

- **M1, from the v2.6 sessions (no new runs):**
  - how many replies and player turns each stub stretch lasted (v2.8 02 A4 stretch-length data);
  - how often generated stub beats drew a refusal or an agency recovery;
  - how many player flags were filed in stubs vs anchors.
  - This is the baseline "corridor" evidence.
- **M2, A/B on a lab copy** of 2–3 campaign stubs (expanded vs open), in group chats, replies on the pod (RP). The stub
  lab copy is campaign lab data (v2.8 02 A4).
  - **Floors, predeclared:** 0 narrated player decisions in open stretches; the player reaches the destination by their
    own move in at least 90% of runs; every run past `pull_after` player turns shows at least one hook within the pull
    window.
  - **Blind rating:** "felt free" vs "felt steered", on paired excerpts, rated by a second model, never the user (the
    excerpts are campaign stubs; v2.8 rule 11, decided by the user 2026-10-03).
- **M3:** sessions. Does the user feel the stretches as corridors today? Evidence for ranking, not a build gate (the
  user decided 1–3).

## Gates

- Pure: validator, `player_turns_in_checkpoint` tests above, `trigger: "quiet"` under rollback ≡ replay, steering text.
- Generation: the encounter-pool shape, its critic, the contract bump (a contract-2 entry is dropped) and a golden.
- Live: a no-LLM scenario for the curve in a group chat (scripted messages: multi-speaker rounds, swipe, delete), then
  the M2 A/B (RP). The pressure leg runs only after v2.8 18 Q6.
- Spoiler rows: encounter titles shown to the player; no objective line in an open stretch at L1/L2.
- Registered in the v2.7 01 feature registry + Help (registry test).
- `npm run gates`.

## Decisions for the user

1. Add an `open` stub mode alongside today's expanded mode, keeping both? **Recommended: yes.** Authors choose per stub;
   the campaign's downtime and road stubs are the first users. Yes
2. Length: an authored curve (`pace` / `pull_after`, optional `max_turns` that only raises pressure), no fixed size?
   **Recommended: yes.** Yes 
3. Generation in open stretches: an optional encounter pool instead of a beat chain? **Recommended: yes**, behind the
   M2 floors. Yes
4. Should the player have an explicit "move on / time passes" control (`/story onward`, a drawer button), or only the
   in-fiction way ("we head out")? **Recommended: in-fiction only at first.** A button is a visible mechanism; add it only
   if the playtest shows players stuck.  As you recommend
5. Should anchors get an optional open opening too, and the ending an open epilogue? **Recommended: measure stubs first.** Recommended

## Links

- v2.8 17 SP6 measurement → v2.8 18 Q6 production complications → pressure here.
- v2.8 18 quests: side quests found in stretches; the Journal read model.
- v2.8 20 character life: agendas tick off screen.
- v2.8 04 C4: the Journal panel.
- v2.8 02 Adolion campaign: A4 lab data, the stub lab copy, the pilot stubs.
- v2.7 11 C4 option (b): jump semantics for checkpoints a stretch leads to.
- v2.6 plan 07: chapter seals the epilogue would need.
- v2.9 03 new game plus (deferred): epilogue play.

## Review 2026-10-03

- **F01** applied: status and gate tiers.
- **F23** applied: player-turn semantics chosen; `player_turns_in_checkpoint` defined (runtime-derived, rollback-safe)
  with multi-speaker tests; contrasted with `engine.ts:453`.
- **C4** applied: dependency on v2.8 17 → 18 Q6 stated first; `trigger: "quiet"` defined; `EXPANSION_CONTRACT` bumped
  2 → 3 for the encounter pool cache.
- **F16** applied: pressure integration and its gate after 18 Q6; engine half may build earlier.
- "objective_block is story-level" applied: the open stretch skips the objective line by its own rule
  (`schema.ts:399`).
- "the epilogue view needs seals" applied: stated as a dependency on v2.6 plan 07 seals (off until Q-M floors).
- "05 A4 lab-copy cite" applied: now v2.8 02 A4.
- **F36** applied: references version-qualified (no bare "plan 19/18/25/16").
- **B10** registry gate added. Decisions 1–5 answered; body agrees (encounter pool behind M2, in-fiction only,
  anchors/epilogue later).
- Line refs re-verified on `c7967323`: `planner.ts:9-16`, `planner.ts:59` (was :61), `engine.ts:453`,
  `generation/types.ts:82`, `schema.ts:399`.
- Could not fully place: v2.8 02 A4 names stretch-length data but not a lab copy of 2–3 stubs for M2; 02's owner should
  add it.

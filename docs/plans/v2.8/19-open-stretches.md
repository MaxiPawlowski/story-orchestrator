# Plan 17 — Open stretches: free play between the story's fixed points

**Status: EXPLORATION 2026-10-03 (topic from the user). Not approved, not built.** Overview: `00-overview.md`.

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
| **Expanded** (background generation, the default path) | 2–6 generated beats, each with an objective, guidance and gated outcomes that sum progress to the anchor. The count comes from the size of the state change still needed (`planner.ts:61`: `max(2, min(6, ceil(deltaWeight)))`), not from the player | Structured. Each beat injects an objective line, so a stretch meant as downtime becomes a short errand chain |

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

## Proposal: a third stub mode, `open`

```json
{ "id": "on-the-road", "type": "intermediate",
  "stretch": { "mode": "open", "pace": "unhurried", "pull_after": 6, "pressure": "complications",
               "offer": ["encounters"], "arrive_when": { "q": "reached_walls", "op": "==", "v": true } } }
```

1. **Player-led, world-reactive.**
   - No objective line in the stretch (`objective_block` off for it).
   - Guidance describes the world's state and mood, never a task.
   - The narrator follows what the player starts: a detour, a conversation, a camp, a side quest from plan 19.
2. **Length is a curve, not a number.** The author sets the stretch's character, never its exact length:
   - `pace` (`brief` | `unhurried` | `long`) maps to `pull_after`, the number of player turns of pure freedom before the
     world starts to pull.
   - After that, **pull** is soft. The world offers hooks toward the destination (it makes itself felt, a companion
     mentions it, the weather turns), at a rising rate. Nothing forces the move.
   - **Pressure** (optional) uses the SP6 complication pool when the stretch stays quiet past the pull point. These are
     world events, never the party's move.
   - **No hard cap by default.** An optional `max_turns` raises pressure. It never teleports the player and never
     narrates the move.
3. **The player decides when it ends.** The exit is the arrival read ("we head for the walls", "we arrive"). That is
   already how the fallback exit works. Progress counters are not used in an open stretch, because a filled counter
   ending a scene is exactly the corridor feeling.
4. **Generation becomes a menu, not a script.**
   - Instead of a linear 2–6 beat chain, background generation prepares a small pool (3–5) of optional situations
     ("encounters") fitting the place, tension and open threads.
   - The narrator may offer one when play lulls.
   - None has a required outcome, and none gates the exit.
   - A situation the player engages with can latch a quality or start a plan 19 side quest; one they ignore is simply
     gone.
   - This reuses the expansion pipeline, its critic and its agency policy. The output shape changes: no progress sum and
     no anchor-entry beat.
5. **Off-screen life continues.** Plan 18 agendas tick on their own schedule, so the world the player returns to has
   moved.
6. **What the player sees:** the scene name (a place, e.g. "On the road"), never a task. The HUD shows no pending
   objective. The Journal (plan 19) shows "free time" or nothing.

### Engine needs

- **`turns_in_checkpoint`:** a derived engine quality (boundaries since `checkpointStartedBoundary`, already tracked in
  `engine.ts:11,116`). Pure and rollback-safe, because it is derived. Pull and pressure gate on it.
- **A `stretch` block** on intermediates. The validator requires an `arrive_when` exit and refuses `progress` exits from
  an open stretch.
- **Steering text** (`pacing/steering.ts`) gets a "pull" register: hooks toward the destination, rate by the curve, the
  agency clauses unchanged.
- **Stall handling:** in an open stretch, a long quiet run is not a stall. `stallCheck` and the refusal recovery are
  skipped there, and pressure replaces them.

### Why not predefine the size in turns

A fixed size either cuts a scene the player is enjoying or pads one they are done with. The curve gives the author
control over the *character* (a breather vs a long journey) and leaves the *length* to the player. The one number worth
authoring is `pull_after` (how much pure freedom), and `pace` presets cover most of it.

## Beyond stubs: other "no checkpoint" moments

- **After the final checkpoint:** today the story ends in an epilogue view. An open stretch with no destination
  ("epilogue play") would let the player keep living in the world. It links to plan 25, new game plus.
- **Off-route play inside an anchor:** agency recovery already handles refusals. An anchor could declare
  `stretch.mode: "open"` for its first N turns too, to delay the objective line on arrival.

## Measurement before building

- **M1, from the v2.6 sessions (no new runs):**
  - how many replies each stub stretch lasted;
  - how often generated stub beats drew a refusal or an agency recovery;
  - how many player flags were filed in stubs vs anchors.
  - This is the baseline "corridor" evidence.
- **M2, A/B on a lab copy** of 2–3 campaign stubs (expanded vs open; `05-adolion-campaign.md` A4).
  - **Floors, predeclared:** 0 narrated player decisions in open stretches; the player reaches the destination by their
    own move in at least 90% of runs; every run past `pull_after` shows at least one hook within the pull window.
  - **Human rating:** "felt free" vs "felt steered", blind, on paired excerpts.
- **M3:** the playtest. Does the user feel the stretches as corridors today?

## Gates

- Pure: validator, `turns_in_checkpoint` under rollback ≡ replay, steering text.
- Generation: the encounter-pool shape, its critic and a golden.
- Live: a no-LLM scenario for the curve, then the M2 A/B.
- Spoiler rows: encounter titles shown to the player.

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

19 quests (side quests found in stretches; Journal), 18 character life (agendas tick off screen), 25 new game plus
(epilogue play), 16 spike defers (SP6 complications as pressure), 09 C4, 05 Adolion campaign (A4 lab data, pilot).

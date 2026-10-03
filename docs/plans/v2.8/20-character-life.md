# Plan 18 — Character life: relationships, mood, agendas, off-screen time

**Status: EXPLORATION 2026-10-03 (topic from the user). Not approved, not built.** Overview: `00-overview.md`.

## What characters already have (v2.6)

| Capability | State | Where |
|---|---|---|
| Private knowledge per member (`knows/unaware/suspects/believes/hiding/intends`) | shipped, on | epistemic store, private block per drafted member, never in World Info |
| Per-entity ledger, `ledger_binding` to qualities | shipped; author-view only | memory coordinator |
| Drives and motives (authored) | shipped, private block | guide §Drives and motives, `06-inner-voice.md` A |
| Reasoning harvest (inner voice B2) | built, off | `06-inner-voice.md:175,207` |
| Inner beat C / `innerFanOut` | spike, off; measured in v2.6 plan 15 Part B | `06-inner-voice.md:3,213` |
| Narrator view `own` / `omniscient` | built, authored | `schema.ts:270-279` |
| Speaker direction, chains, roles, aliases | shipped, on | `talk/`, `talkControl.ts` |
| NPC replies (`onEnter`/`afterSpeak`/`sceneBreak`), cast changes | shipped | effects |

So characters already know different things and want things. What they lack: **feelings toward each other that move,
a mood that colours the scene, plans that advance when nobody is looking, and a place to be when off stage.**

## Lessons from prior art (`v2.4/extension-research/SUMMARY.md`, `prompting-memory-prior-art.md` §8.6-8.7)

- **Relationship meters are the most-asked feature.** BetterSimTracker, BlazeTracker, Silly Sim Tracker and the
  Danganronpa trust meters all do them.
  - What works: a separate, non-blocking read with **bounded deltas** (clamped step size, scaled by confidence).
  - What fails: model-written blocks in the reply; four copies of state; anchoring on the previous value; trackers that
    "get stuck" (Tracker's author admits this).
- **Stepped Thinking** (the second most popular extension) shows players want inner thoughts. It blocks the reply, and its
  nested quiet generations broke our one-turn blocks (carry-in T6).
- **Off-screen life** (Multihog World Progression, Story Engine "proactive NPCs") is popular and almost always built with
  blocking calls and global profile swaps.

## Design candidates

### L1. Relationships (authored axes, bounded, rollback-safe)

- **Authored:** `roster[].relationships: [{ toward: "<roster id>|player", axes: ["trust", "fear"], range: [-5, 5],
  step: 1, start: 0, display?: {public, label} }]`.
- **Storage:** each axis compiles to an ordinary int quality (`rel_<a>_<b>_<axis>`). So it lives on the blackboard,
  gates can use it ("trust >= 3 opens the confession"), and rollback equals replay for free.
- **Read:** by the existing shared read as a rated quality (`read_as: rating` with authored `criteria`), with deltas
  clamped to `step` per boundary. That is BetterSimTracker's bounded-step idea, enforced in code.
- **Anchoring guard:** the read prompt shows the axis criteria and the window, **not** the current value. This is
  measured in M1.
- **Use:** the drafted member's private block gains one line per relationship it holds ("You trust Arin (3/5): …").
  It is private, like epistemic, so only the holder sees its own feelings.
- **Player view:** optional, through plan 19's `display.public` (an affection meter only if the author wants a dating-sim
  feel).

### L2. Mood (scene-scoped)

- A per-member enum (`calm/tense/angry/afraid/elated`, authorable) read at scene breaks by the epistemic/ledger pass, which
  already runs per scene.
- It decays to an authored baseline at the next scene break unless re-read, so mood never "gets stuck".
- It is injected into the drafted member's private block, and could drive expression sprites (the sprite stage exists).

### L3. Agendas: plans that advance off screen

- **Authored:** `roster[].agenda: [{ id, goal, steps: [{ text, when?: <gate>, effect?: <effects> }], pace: "per_chapter" |
  "per_n_boundaries" }]`.
- **At a boundary, in code, no model call:** when a step's gate holds and the pace allows, the step advances.
  - Its effect fires (a world-info entry, a cast change, a scripted NPC reply).
  - A one-line "meanwhile" fact goes into the member's private block and, if the author marks it public, into the world.
- **Rollback:** the step index is a code quality, so rollback undoes it.
- **Prior art:** Multihog's "world pulse" (`SUMMARY.md` §8, idea 9), but deterministic and authored.
- **Optional generative variant (later, behind a floor):** the curator *proposes* a meanwhile event inside the agenda's
  goal, reviewed like any curator proposal. It never writes the blackboard.

### L4. Whereabouts and schedules

- `roster[].schedule: [{ when: <gate on time/location qualities>, at: "<place>" }]`, built on the scene places and times
  that already exist.
- A member whose schedule puts them elsewhere is a candidate for `cast_changes` disable or, softer, is dropped from the
  speaker candidates for that scene. That solves the "character in two cities at once" failure (StatSuite,
  `prompting-memory-prior-art.md` §8.6).
- The talk rules read it; no new host write.

### L5. Inner voice, promoted

- No new design. Graduate whatever v2.6 plan 15 Part B measures green: reasoning harvest (B2) and the inner beat (C).
- The thinking controls (story/checkpoint thinking level, the Repair warning when harvest is on but replies carry no
  reasoning) belong to plan 06. L5 depends on 06's warning, not the reverse.
- A player-visible "thoughts" chip (Stepped Thinking's appeal) is possible only as opt-in, author-marked, and at L2.

### L6. Voice consistency

- Not new state: the continuity warden already checks replies.
- Add a warden family "out of character", over the drafted member's card + drives + relationship lines.
- Notes only; it never rewrites. It needs its own 20-case fixture and calibration row (judge rule).

## Not proposed

- Model-written status blocks in replies.
- Unbounded free-text "feelings" stores.
- Per-message per-swipe tracker copies.
- Any LLM call on the reply path, and global profile swaps for an "NPC brain".

## Measurement before building

- **M1 relationship read accuracy:** about 20 labelled Adolion-lab windows. Measure delta direction accuracy and stuck
  rate, with and without the current value in the prompt. Floors are declared before the run.
- **M2 cost:** extra tokens per shared read for N relationship axes. Cap the number of axes read per turn, picking the
  members present in the window.
- **M3 player value:** does the playtest show flat or forgetful characters? This plan ranks against that evidence.

## Order (proposal)

L1 + L2 first (they reuse the read and the private block), then L3 (pure code, high story value), then L4. L5 follows
v2.6's measurements. L6 waits for a fixture.

## Unresolved questions

1. Relationships toward the player only, or also between NPCs (cost grows with the cast squared)? Both
2. May relationship meters ever be player-visible, or private always? Author visible, private for players
3. Agendas: authored steps only, or allow the curator to propose meanwhile events? Both
4. Should a schedule disable a member (a cast change, visible in ST's group panel) or only drop them from speaker
   candidates? wdyt? what does it implies for the rest of the project?

   **Answer (2026-10-03): drop them from speaker candidates; do not disable them.** Why:
   - **Cast changes leak across chats.** They write the group's `disabled_members`, which outlives the chat and every
     sandbox (`.claude/rules/debug-scripts.md`). The ledger restores them, but it is a host write per scene change, and
     the restore can be lost on a reload.
   - **The player sees it.** A schedule flipping members on and off in ST's group panel is a visible mechanism.
   - **Dropping from candidates is pure.** The talk rules read the schedule from the blackboard (time and place
     qualities), so rollback ≡ replay holds for free and no host state changes.

   What it implies for the rest of the project:
   - **Talk.** The director prompt and `talk/rules.ts` take an "away" set. A member addressed by name while away is
     answered by the narrator ("X is not here"), never voiced.
   - **Memory.** The away member's private block still receives what they learn later, through epistemic reads.
     Nothing is written while they are away, which fits plan 22's witness work.
   - **Briefing and HUD.** "Who is here" can be shown from the same data (player-safe names only).
   - **Authors.** `cast_changes` stays the tool for a deliberate, authored exit or entry; schedules are for routine
     whereabouts.
   - **Answers above:** relationships both toward the player and between NPCs (cap: axes read only for members present
     in the window, per M2); meters visible in Author view, private for players; agendas authored plus curator-proposed
     (author-reviewed, the stagecraft discipline).

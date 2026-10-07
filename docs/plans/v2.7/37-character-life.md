# Plan 20 — Character life: relationships, mood, agendas, whereabouts

> **Moved 2026-10-07: now v2.7 37** (was v2.8 20; user: "the rest of character life" in v2.7). Depends on v2.7 33 W2 (agency notes reach players), v2.7 35 (one complication component), v2.7 36 (`revertOriginSince`, scope sources). L6 voice warden replaces v2.8 13 N7. Acceptance in v2.7 39. Old numbers inside: `v2.7/RENUMBER.md` §2026-10-07.

**Status (2026-10-03): v2.8 plan 20 (was v2.7 plan 18). Exploration topic from the user; decided (relationships toward
the player and between NPCs, meters author-visible and private for players, agendas authored plus curator-proposed,
schedules drop members from speaker candidates only); not built, M1/M2 not run.** Overview: `00-overview.md`.
**Gate tiers** (00-overview §Gate taxonomy): implementation D; acceptance CL (M1 relationship reads on the DeepSeek read
model, plus the v2.8 13 N8 judge arm on TypeSafe) + RP (replies on the pod, the 7-member act pilot from v2.8 02).

## What characters already have (v2.6)

| Capability | State | Where |
|---|---|---|
| Private knowledge per member (`knows/unaware/suspects/believes/hiding/intends`) | shipped, on | epistemic store, private block per drafted member, never in World Info |
| Per-entity ledger, `ledger_binding` to qualities | shipped; author-view only | memory coordinator |
| Drives and motives (authored) | shipped, private block | guide §Drives and motives, `v2.6/06-inner-voice.md` A |
| Reasoning harvest (inner voice B2) | built, off, no floor measured | `v2.6/06-inner-voice.md:175,207` |
| Inner beat C / `innerFanOut` | spike, off; measurement owed | `v2.6/06-inner-voice.md:3,213` |
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
- **Stepped Thinking** (the second most popular extension) shows players want inner thoughts. It blocks the reply, and
  its nested quiet generations broke our one-turn blocks (v2.4 plan 01 T6).
- **Off-screen life** (Multihog World Progression, Story Engine "proactive NPCs") is popular and almost always built
  with blocking calls and global profile swaps.

## Design (decided)

### L1. Relationships (authored axes, bounded, rollback-safe)

- **Authored:** `roster[].relationships: [{ toward: "<roster id>|player", axes: ["trust", "fear"], range: [-5, 5],
  step: 1, start: 0, label? }]`. Both directions: toward the player and between NPCs (decision 1).
- **Storage:** each axis compiles to an ordinary int quality (`rel_<a>_<b>_<axis>`, `source: extractor`,
  `read_as: rating` with authored `criteria`). So it lives on the blackboard, gates can use it ("trust >= 3 opens the
  confession"), and rollback ≡ replay holds.
- **Read path (review C1): typed judge first, extractor fallback.**
  - When the judge's typed read is on, rated keys in scope go to it first (`runTypedRead`,
    `runtime/coordinators/extractionCoordinator.ts:167-184`; the shared read's own call, `extraction/sharedRead.ts:217-230`).
  - The shared read then removes only the keys the judge **answered** (`answered`, `sharedRead.ts:229-230`), not every
    hinted key. Keys the judge did not answer (judge off, timeout, fallback, no answer) stay in the extractor's residual
    scope and are read by the shared read in the same pass.
  - Both sources pass the same code clamp: a delta moves at most `step` per boundary (`extraction/ratingGuard.ts`, the
    rating guard, extended with the step rule). BetterSimTracker's bounded-step idea, enforced in code.
- **Extraction scope (review F20).** `deriveScope` (`extraction/scope.ts:22-84`) pulls only builtin, snapshot and gate
  keys, so a relationship used by no transition would never be read. Add a bounded scope source, pull kind
  `relationship`: the axes whose holder is present in the read window (a speaker in the window or the drafted member)
  and whose `toward` is present or is the player. Cap `REL_AXES_PER_READ`, set from M2 before the build; overflow is
  journaled for the author. Tests: a relationship key used by no transition or snapshot enters scope when both members
  are present and leaves when one is absent; the cap's overflow record; rollback ≡ replay of scope.
- **Anchoring guard:** the read prompt shows the axis criteria and the window, **not** the current value. Measured in
  M1.
- **Use:** the drafted member's private block gains one line per relationship it holds ("You trust Arin (3/5): …").
  It is private, like epistemic, so only the holder sees its own feelings. Held-secret filtering applies unchanged.
- **Visibility (decision 2; review A3, F24).** Author view only (drawer author panels, inline author levels with Author
  view on). Never player-visible: `display.public` (v2.8 18 Q2) is refused by the validator on `rel_*` qualities, and no
  player surface reads them. Rejected: a player affection meter.

### L2. Mood (scene-scoped)

- A per-member enum (`calm/tense/angry/afraid/elated`, authorable) read at scene breaks by the epistemic/ledger pass,
  which already runs per scene.
- It decays to an authored baseline at the next scene break unless re-read, so mood never "gets stuck".
- It is injected into the drafted member's private block.
- **Sprites:** mood is a candidate input to the sprite stage's expression pick, beside the judge's `expressions` use
  (`src/judge/settings.ts:256`, "Sprite expressions"), and to v2.7 20 living cards' look sprites. Whether mood overrides,
  biases or is ignored by `expressions` is decided in v2.7 20, not here.
- Player-visible: none in this plan (a sprite showing a mood is v2.7 20's surface and its gate).

### L3. Agendas: plans that advance off screen

- **Authored** (decision 3, first half): `roster[].agenda: [{ id, goal, steps: [{ text, when?: <gate>, effect?:
  <effects> }], pace: "per_chapter" | "per_n_boundaries" }]`.
- **At a boundary, in code, no model call:** when a step's gate holds and the pace allows, the step advances (a
  `source: code` step-index quality, so the step itself rolls back with the blackboard). A one-line "meanwhile" fact
  goes into the member's private block and, if the author marks it public, into the shared world facts.
- **Agenda effects are host writes (review F25).** A step's `effect` may use `world_info` and `npc_replies` only.
  Cast changes stay checkpoint effects (decided by the user 2026-10-03, as recommended): an agenda that adds or
  removes a member would write the group's `disabled_members` off screen, the leak L4 avoids.
  - Dispatch: a boundary-work entry `agenda-steps` (`runtime/boundaryWork.ts`) dispatches the effects of steps that
    advanced at this boundary through `EffectsApplier.withLedger`, each ledger row tagged `{kind: "agenda", memberId,
    agendaId, step, boundary, messageId}`, with a `RunOwnership` re-check before each write. Host writes never move into
    the engine.
  - Reversal: `runRollback` (`runtime/rollback.ts`, beside `stagecraft.revertAppliedSince` at `:109,130,146`) calls
    `effects.revertOriginSince("agenda", messageId)` on both rollback paths: World Info rows revert by compare-and-set
    (`externally-changed` recorded, never clobbered); NPC replies follow `rewindNpcReplies` (the marker rewinds; a posted
    reply stays chat text, as today).
  - Shared with v2.8 18's quest rewards (origin `quest`). Whichever plan builds first builds the origin-tagged ledger
    and `revertOriginSince`; the other reuses it and adds its origin (decided by the user 2026-10-03, as recommended).
  - Tests: host state checked with the blackboard (an advanced step's WI entry is off again after a swipe of the
    advancing reply; reopen equals a continuous run).
- **Curator-proposed meanwhile events** (decision 3, second half; review C2, F24). Approved now, not "later":
  - **Contract** `MeanwhileProposal`: `{ id, memberId, agendaId, text, public: false, reason, sourceWindow }`. Text only:
    no effects, no blackboard writes, no new qualities, no step advance. It must stay inside the agenda's authored
    `goal` and must not narrate a player action (agency policy).
  - **Owner:** a new `AgendaProposalCoordinator` with its own `extras.agendaProposals` slice (constructor-injected deps,
    the coordinator rules). `StagecraftCoordinator` stays lorebook-only; its isolation test is unchanged. The review UI
    may share v2.8 18's proposal card.
  - **Review:** author view only. Accepted proposals become a meanwhile fact in the member's private block (and never a
    shared fact unless the author edits `public`), keyed by boundary and rolled back by message. Rejections are journaled
    with the reason. Never auto-accepted.
  - **Gate (v2.8 rule 9, dark ship):** a 20-case fixture (agenda, window, expected in-goal/out-of-goal), offline replay on
    the CL route, dev-only until its floor passes twice (in-goal rate ≥ 0.85, 0 narrated player actions, 0 references to
    unreached content in a spoiler subset; floors frozen before the first run), then an off-by-default switch.
- **Prior art:** Multihog's "world pulse" (`SUMMARY.md` §8, idea 9), but deterministic and authored, with proposals
  reviewed.

### L4. Whereabouts and schedules (drop-only)

- `roster[].schedule: [{ when: <gate on time/location qualities>, at: "<place>" }]`, built on the scene places and times
  that already exist.
- A member whose schedule puts them elsewhere is **dropped from the speaker candidates** for that scene. Nothing else:
  no `cast_changes`, no `disabled_members` write, no host write at all (decision 4). That solves the "character in two
  cities at once" failure (StatSuite, `prompting-memory-prior-art.md` §8.6).
- The talk rules read it from the blackboard, so rollback ≡ replay holds. Rejected: disabling via `cast_changes`.

### L5. Inner voice, promoted (owner elsewhere)

- No new design here. Promotion of the reasoning harvest (B2) and the inner beat (C) waits on the frozen v2.6
  measurements, which **v2.8 01** owns (00-overview row 01: "frozen v2.6 measurements"). Both stay off by default until
  then (`v2.6/06-inner-voice.md:175,272`).
- The thinking warning (harvest on but replies carry no reasoning) is built in v2.7 08. The story/checkpoint thinking
  level (R4) is v2.8 01. L5 depends on them, not the reverse.
- A player-visible "thoughts" chip is not in this plan; it would need a session or an explicit user decision (v2.8
  rule 4).

### L6. Voice consistency

- Not new state: the continuity warden already checks replies.
- Add a warden family "out of character", over the drafted member's card + drives + relationship lines.
- Notes only; it never rewrites. It ships dark (v2.8 rule 9): dev-only until its floor passes twice, then off by
  default.
- **Calibration row L6-C (CL; Sol r3 R3-09), frozen here before the first run and never retuned.** Use
  `judge.uses.wardenVoice` (new switch), provider × model × use row on the current fixture revision (judge rule).
  Fixture: 20 replies from the 7-member act lab copy, 10 in character and 10 out of character against the drafted
  member's card + drives + relationship lines, labels from session evidence checked by a second model (never the user,
  rule 11). Metrics: **OOC recall ≥ 0.80** (≥ 8 of 10 OOC replies noted), **false-note rate ≤ 0.10** (≤ 1 of 10
  in-character replies noted), **0 notes that propose a rewrite or narrate a player action**, fallback rate (timeout /
  too-large / error) ≤ 1 in 20. Run ×2 offline replay; both runs must pass. Below the floor: L6 stays dev-only, the
  numbers are recorded, the family is not built further in v2.8.

## Not proposed

- Model-written status blocks in replies.
- Unbounded free-text "feelings" stores.
- Per-message per-swipe tracker copies.
- Any LLM call on the reply path, and global profile swaps for an "NPC brain".
- Player-visible relationship meters; schedules that disable members; agenda cast changes.

## Measurement before building

- **M1 relationship read accuracy (CL).** About 20 labelled academy/7-member-act lab windows (v2.8 02 A4; labels from
  session evidence get a second-model check, never the user). Arms: (a) extractor, current value hidden; (b) extractor,
  current value shown; (c) the typed judge read, Score per axis (v2.8 13 N8 judge arm). Read model: DeepSeek (CL); judge:
  TypeSafe (CL). **Floors (decided by the user 2026-10-03, as recommended), frozen in this file before the first run
and never retuned:** direction accuracy ≥ 0.80;
  stuck rate (no move where the label moves) ≤ 0.10; step-clamp violations 0 (code); arm (a) not more than 5 points
  below arm (b) on direction accuracy (else the anchoring guard is reconsidered, not the floor). The arm that passes
  decides the read path's default (judge first only if (c) passes).
- **M2 cost (CL).** Extra prompt tokens per shared read for N relationship axes, N in {2, 4, 8, 16}. Sets
  `REL_AXES_PER_READ` (the largest N under a token ceiling written here before the run).
- **M3 player value.** Sessions on the 7-member act pilot (v2.8 02): do characters read as flat or forgetful? Evidence
  for ranking; the user has decided the design.

## Order

L1 + L2 first (they reuse the read and the private block), then L3 (code steps, then curator proposals behind their
floor), then L4. L5 follows v2.8 01's measurements. L6 waits for its fixture.

## Gates

- Pure: relationship compile + validator (including `display.public` refused on `rel_*`), the step clamp, scope source
  tests (F20), L4 candidate filtering under rollback ≡ replay, agenda step index under rollback ≡ replay.
- Host: agenda effect dispatch/reversal tests (F25), ownership census and fault-matrix rows.
- Read path: the judge-first / extractor-fallback test (an answered key leaves the shared read; an unanswered one
  stays).
- M1 and M2 floors above; L3's curator-proposal floor (in-goal ≥ 0.85, 0 narrated player actions, 0 unreached
  references) and L6-C (above), each ×2 before its switch leaves dev (dark ship).
- Spoiler checklist rows: no relationship value, mood, agenda step, meanwhile fact or away reason in player mode at any
  inline level; "who is here" shows player-safe names only; `so-ui.mts assert-player-clean`.
- Registered in the v2.7 01 feature registry + Help (registry test).
- `npm run gates`; a no-LLM group scenario (scripted messages) for agendas, schedules and rollback; then the CL
  measurements and the RP pilot in the final batched suite.

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
     Nothing is written while they are away, which fits the witness filter work (v2.9 02, deferred).
   - **Briefing and HUD.** "Who is here" can be shown from the same data (player-safe names only).
   - **Authors.** `cast_changes` stays the tool for a deliberate, authored exit or entry; schedules are for routine
     whereabouts.
   - **Answers above:** relationships both toward the player and between NPCs (cap: axes read only for members present
     in the window, per M2); meters visible in Author view, private for players; agendas authored plus curator-proposed
     (author-reviewed, the stagecraft discipline; built as the `AgendaProposalCoordinator` above, not inside stagecraft).

## Links

- v2.8 18 quests: `display.public` (refused on relationships); the shared origin-tagged effect reversal.
- v2.8 13 N8: the judge arm in M1.
- v2.7 20 living cards: look sprites and how mood feeds them; L2's sprite link.
- v2.8 01: frozen v2.6 measurements (L5), thinking level R4.
- v2.7 08: the thinking warning (built).
- v2.8 02: A4 lab windows, the 7-member act pilot.
- v2.8 19 open stretches: agendas tick while the player roams.
- v2.9 02 witness filter (deferred): away members and what they witness.

## Review 2026-10-03

- **F01** applied: status and gate tiers.
- **F24** applied: player meters, L4 cast-change disabling and "curator agendas later" removed from operative text
  (one "rejected" line each); the curator-proposal contract and its gate specified in L3.
- **F25** applied: agenda effects dispatched by a boundary-work entry through origin-tagged ledger rows and reversed in
  `runRollback`; agenda cast changes excluded.
- **F20** applied: `relationship` scope source, bounded by presence and `REL_AXES_PER_READ`, with tests.
- **C1** applied: judge-first typed read for `read_as` keys, extractor fallback for unanswered keys; the shared read
  removes answered keys only (`sharedRead.ts:229-230`).
- **C2** applied: `MeanwhileProposal` contract and `AgendaProposalCoordinator`; StagecraftCoordinator stays
  lorebook-only.
- **C3** applied: Gates section, M1 floors frozen in the file, spoiler rows; L5 promotion owned by v2.8 01.
- **A3** applied: meters never public. **B5** applied: N8 judge arm in M1. "L4 is drop-only" applied. "carry-in T6" →
  v2.4 plan 01 T6. L2 links the `expressions` use and v2.7 20. **B10** registry gate added. Tiers: M1/M2 CL, replies
  RP. Answers (both directions, author-visible meters, agendas both, schedules drop) consistent with the body.
- Line refs re-verified on `c7967323`: `sharedRead.ts:217-230`, `extractionCoordinator.ts:167-184`, `scope.ts:22-84`,
  `judge/settings.ts:256`, `rollback.ts:109,130,146`.
- Not applied: none. The M1 floor numbers were proposals; the user accepted them on 2026-10-03 (direction accuracy
  ≥ 0.80, stuck rate ≤ 0.10, hiding the current value costs ≤ 5 points, curator-proposal in-goal ≥ 0.85), frozen before
  the first run.

Round 3 (Sol): R3-09 applied.

2026-10-03 (user: as recommended): M1 floors and the L3 curator-proposal floor accepted as written; agenda effects
exclude cast changes; the origin-tagged rollback (`revertOriginSince`) is built by whichever of v2.8 18 / v2.8 20 builds
first and reused by the other.

## Adopted from the gamification harvest (user, 2026-10-07)

Source: `v2.8/27-gamification-report.md` (decision 3 and §Candidate rows).

- **Story clock for L4** (decision 3): a rolled-back `story_day` quality plus a `time_of_day` value; schedules gate on
  them; a calendar is later. No wall-clock.
- **L2 mood duration**: `lasts {boundaries: n} | {until: "scene_break"}`.
- **L3 recurring agenda steps** keep a list of done occurrences.
- **L1** relationship numbers stay author-only, as written.

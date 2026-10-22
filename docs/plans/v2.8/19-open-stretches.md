# Plan 19 — Open stretches: free play between the story's fixed points

**Update 2026-10-13: encounter pool, `trigger: "quiet"` logic (gating the encounter menu; no pressure) and open anchors are
built deterministically on `v2.8-build-encounters` (§Gate record 2026-10-13); RP acceptance is deferred, floors unchanged;
epilogue play and the SP6 pool are still not built.**
**Status (2026-10-10): engine half built (v2.7 35 Phase 2, 2026-10-07) and completed by queue A6 (branch
`v2.8-open-stretches`, §Gate record 2026-10-10): the pull names the destination, no task reaches the narrator, Studio
and wizard author it. Encounter pool, `trigger: "quiet"`/pressure, open anchors and epilogue play not built (decisions
3 and 5, the SP6 dependency). M1 baseline recorded thin (campaign `lab/stretches/stub-lengths.json`); M2 not run (needs
the pod and its session cards).** Decided: decisions 1–3 yes, 4 in-fiction only as recommended, 5 measure stubs first.
Overview: `00-overview.md`. Built record of the engine half: `v2.7/35-world-pressure-and-open-stretches.md` §Gate record.
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
  (deferred, v3.0 03).
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
- v3.0 03 new game plus (deferred): epilogue play.

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

## Gate record (2026-10-10, queue A6)

Branch `v2.8-open-stretches` (worktree `C:\dev\so-open-stretches`, from master `c21a42b9`). Tier D only: no lane, no
pod, no model call, no ST page. Every live and RP row below is owed and NOT green.

### Already built before this row (v2.7 35 Phase 2, `6268b564` + the Sol fix of 2026-10-07)

The format (`checkpoints[].stretch`), the validator (`engine/validate/stretch.ts`: intermediates only, every exit on
`arrive_when`, progress exits and `player_text` refused, `pressure`/`offer`/`trigger` refused as not built), the
`player_turns_in_checkpoint` derive seam (`runtime/stretchTurns.ts`, OOC lines excluded; rollback ≡ replay 0 mismatches
over 4 seeds × 100 cuts), no objective line, no beat chain, no stall re-read or refusal recovery, the open-stretch line
and the pull register in the guidance block, the registry row and the guide topic, and the no-LLM curve scenario
(`test/scenarios/v27-35-open-stretch-curve.json`, green ×2 in v2.7 39 Phase C, row 35-P2-curve). This plan's status
line said "not built" until today; the v2.7 35 record is the as-built truth for that half.

### Built here

- **The pull names the destination.** The pull lines said "the next place" and never which, so the narrator could only
  offer generic hooks, and the M2 hook labeller (which asks whether a reply points toward the destination) would score
  against a place the narrator was never told. `stretchDestination` (`engine/stretch.ts`, pure) reads the first exit by
  priority whose gate is `arrive_when` and returns its target's `player_name ?? name`; `pullLine(stage, destination)`
  (`pacing/steering.ts`) writes "the next place (<name>)"; the pacing coordinator passes it. Before `pull_after` the
  block is unchanged (no hook, no name). A story without a stretch is byte-identical (`openStretch.review.test.ts`, the
  guidance and payload-invariance suites unchanged and green). Static story data: nothing enters engine state, so
  rollback ≡ replay and reopen ≡ continuous run are untouched (the counter's property test still covers the state).
- **No task reaches the narrator in an open stretch.** The objective stays on the checkpoint for the readers (the
  arrival read, the judge's scene questions, the curator), but `{{story_current_checkpoint}}` names the scene only in an
  open stretch (`currentCheckpointText`, `runtime/stretchTurns.ts`, used by `runtime/macros.ts`), and the inner voice
  prompt's scene line reads "free play, no task: the player leads" there instead of the objective (`OPEN_STRETCH_SCENE`,
  `memory/innerBeat.ts`; `coordinators/innerCoordinator.ts`). Elsewhere both are unchanged.
- **Authoring.** Studio Checkpoints tab: an **Open stretch** panel on intermediates (`studio/components/StretchEditor.tsx`
  + `.stories.tsx`, pure draft helpers `studio/stretchDraft.ts`): on/off, pace, pull after, plain pull at (`max_turns`),
  the arrival exit picked from this beat's transitions (its gate becomes `arrive_when`), a red line naming every exit on
  another gate (the validator refuses them) and one for a `player_text` left set. A pace change resets `pull_after` to
  the pace preset; a `max_turns` at or below `pull_after` is dropped rather than stored invalid. Wizard:
  `updateCheckpoint` takes `patch.stretch` (`copilot/parseFields.ts`, read through the engine's own `readStretch`, so a
  refused stretch comes back as the validator's message; `null` clears), and the tool's checkpoint shape names it
  (`copilot/agent/tools.ts`). Studio lazy chunk only; no mutations.ts export, so the tool census is unchanged.
- **Guide.** `docs/authoring/story-guide.md` §Open stretches + the compact twin (`copilot/guideTopics.ts`): destination
  naming, the objective rule, the Studio panel and `patch.stretch`; `npm run docs:guide` (32 pages).
- **Tests.** `studio/stretchAuthoring.test.ts` (12: destination by public name and by priority, null outside a stretch,
  pull lines with and without a destination, the macro text, the wizard patch accept / refuse / clear, the draft helpers
  and that what they build validates); `coordinators/innerCoordinator.test.ts` (scene line, both arms); the updated
  `openStretch.review.test.ts` (the gentle pull carries "The walls").

### How it relates to the living director (v2.8 22)

- Shared: the turn counter. `validate/living.ts` declares `player_turns_in_checkpoint` for every living story and the
  director's pace gates on it (`generation/living/plan.ts` `playerTurnsGate`), through the same derive seam.
- Separate: the director's stubs (`add-stub`, `liv_` ids) carry the drafted anchor's objective and are expanded into beat
  chains like any stub; the director never writes a `stretch`, and the open-stretch rules never touch its ops.
- Not built: v2.8 22 says a pass that fails its checks "falls back to an open stretch". Today a failed pass writes
  nothing and journals "living director wrote nothing"; the frontier plays on as it is. An open stretch needs an
  `arrive_when` exit to a destination and a failed pass has none, so that fallback is destination-less free play, which
  is decision 5's epilogue play. Left to v2.8 22's owner (N1 is building in `livingCoordinator.ts`); owner question 2.

### Not built (and why)

- Encounter pool, `EXPANSION_CONTRACT` 2 → 3, pool checks, golden: decision 3 puts it behind the M2 floors, and M2 has
  not run. `offer` stays refused.
- `trigger: "quiet"` and `pressure`: need the production complication component (v2.8 18 Q6 = v2.7 35 Phase 3), built
  only on SP6 PASS (queue R12, owed). Refused by the validator.
- Open anchors and epilogue play: decision 5 (after the stub measurement).
- `max_turns` raising pressure: no pressure yet; it only makes the pull plain.

### Owed (NOT green)

- **Live, no model.** `v27-35-open-stretch-curve.json` ×2 on a no-model lane on this build (its checks still hold: the
  pre-pull block has no "next place"; the hooks keep "never a push" and "plainly in this reply"); a Studio walk of the
  Open stretch panel (open the Studio, toggle it on an intermediate, pick the arrival, save, the import validates);
  `{{story_current_checkpoint}}` read in an open stretch; Storybook `StretchEditor` (4 stories). Not run here: every lane
  serves ST's one staged slot, which other sessions share, so staging this branch's build would change their runs.
- **M1 (a baseline, not a gate), protocol.** No new runs. In the campaign checkout,
  `python lab/stretches/measure_stubs.py --sessions <plugin test/sessions>` over the current so-sessions evidence
  rewrites `lab/stretches/stub-lengths.json` (counts only: per act stub, visits, exits, player turns per visit, flags per
  checkpoint kind), then `python lab/stretches/check.py`. The 2026-10-07 baseline holds 9 stub visits; two of the three
  converted stubs were never visited. The refusal / agency-recovery rate inside generated stub beats is not in
  `turns.jsonl`: read it from each session's journal tail (`so-journal follow` jsonl) where one was kept, else record
  "not determined". Whether this closes M1 is the owner's call (v2.7 39 §B1 runners record).
- **M2 (RP), protocol.** Floors verbatim (v2.7 35 §Phase 2 Floors, fixed before any run): 0 narrated player decisions
  in open stretches; arrival by the player's own move in ≥ 90 % of runs (6 of 6 per record); every run past `pull_after`
  shows ≥ 1 hook in the pull window (`pull_after + 1` … `pull_after + 6` player turns). Run end: arrival or
  `pull_after + 12` (or `max_turns` when lower); a capped run is not by own move; OOC lines are no turn.
  1. Build at or after this row's commit: the pull now names the place, so an earlier build is a different arm.
  2. Lab data, campaign `lab/stretches/`: `aegis-open.story.json` (two downtime stubs, `unhurried` and `long`) and
     `adventurer-open.story.json` (the road stub, `brief`) are arm **open**; the shipped stories, same stubs, expansion
     on, are arm **expanded**. Run `python lab/stretches/check.py` first.
  3. Per stub × arm × run (3 × 2 × 2 = 12 sessions per record): an `adolion-fresh` lane, a group chat, `--media off`,
     replies on the pod (the Artemis v1.1 RP profile), at most two model lanes per pod. Seed the chat at the stub (Author
     view `/cp activate <stub>` before the play window), then play with the autonomous driver (`so-session turn`) under
     one player brief for both arms: play the place freely, leave only when the scene feels done to you, make the move
     in your own line, never mention mechanics. Each session's `turns.jsonl` is the labeller's input.
  4. Write the private `runs.json` (so-sessions, never this repo): `replyProfile` and one row per session
     `{dir, stub, arm, run, startCheckpoint, arriveCheckpoints, pullAfter, maxTurns?, destination}`.
  5. `node scripts/debug/so-b1-hooks.mts label --runs <runs.json> --labeller <second-model profile> --run 1`; the whole
     set again as run 2; `node scripts/debug/so-b1.mts combine 35-M2`. Records `test/phase-c/records/35-M2/run-<n>.json`
     (counts only) and `SO_DEBUG_DIR/b1/35-M2/` (private), archived with `npm run sessions:archive`.
  6. Blind "felt free / felt steered" on paired excerpts (open vs expanded, same stub and run), rated by a second model,
     never the user (rule 11): a separate rating pack, not part of the labeller.
  7. Verdict here and in v2.7 35. On PASS the encounter pool (decision 3) may be built; on FAIL open stretches stay as
     shipped (experimental) and the pool is not built.
  - Still missing for step 3: the 12 session cards (or a seeding verb) that open each run at its stub; v2.7 39's B1 record
    lists 35-M2 as "not runnable: no driver" for this reason. They name campaign checkpoints, so they live in the private
    evidence or carry aliases (rule 7). Cost: about 4 lane-hours, about 2.3 pod-hours (v2.7 35 estimate).

### Placeholder values (unchanged; measure, never retune silently)

`PACE_PULL_AFTER` brief 3 / unhurried 6 / long 10; `PULL_STEADY_AFTER` 3.

### Owner questions

1. Should the living director write its between-anchor stubs as open stretches (free play toward its next anchor)
   instead of beat chains? Today it never does; it would take this plan's rules unchanged.
2. Should a failed director pass fall back to destination-less free play now (v2.8 22's fallback), ahead of decision 5's
   epilogue play?

WIP 2026-10-10: built as above; macros.test and line-length fixes applied but the full gates not re-run (first run red on those two, both fixed); next: `npm run gates -- --no-storybook --jobs 2`, bundle bytes, queue row A6, then the owed live rows.

## Gate record (2026-10-11, handoff 37 B3)

- Branch `v2.8-open-stretches`, clean start; `git merge master` -> `1070c0f9`, no conflicts, prior B3 changes preserved.
- `npm run gates:quick -- --no-replay` -> green (final run 134.6 s): typecheck exit 0, typecheck:test exit 0,
  changed-file lint exit 0 (one ignored-generated-file warning), related Jest 471 suites / 6039 tests passed,
  one suite / one test skipped. `runtime/macros.test.ts` and `runtime/codeHealth.guard.test.ts` pass; no further
  macro or line-length fix needed. Replay deliberately skipped; the main run owns full gates.
- `npm run debug:typecheck` and `npm run typecheck:test` -> exit 0.
- `npm run build` -> compiled successfully; main bundle 1,293,701 B, sha256
  `94ef9a5f1a95b3b07288ff23fd631f5be1f8a0ba026f705d37252a300f7cc46c` (budget 1,300,000 B).
- `npm run docs:guide` and `npm run docs:settings` -> exit 0; 32 guide pages, no content drift after CRLF normalization.
- `npm run storybook:build` -> exit 0. Existing host-mock export / asset-size warnings remain.
  Served this worktree's `.sb-static` on owned port 6033, then ran
  `node node_modules/@storybook/test-runner/dist/test-storybook.js --index-json --url http://127.0.0.1:6033 --maxWorkers 1 --includeTags b3-open-stretch --verbose`
  -> 2 suites / 16 stories passed; no accessibility violations. The runner skipped other stories.
  `CheckpointEditor.AuthorsAnOpenStretch` toggles an intermediate, changes pace, picks arrival, validates the exported
  draft through `importDraft`, and verifies anchors have no panel. Four `StretchEditor` stories pass. The owned server
  was stopped; no other Storybook server touched. This is a Storybook walk/export round-trip, not an ST Studio save.
- Lane setup: `SO_LANE_OFFLINE=1 node scripts/debug/st-lanes.mts seed 33 --slim` -> offline seed, image/sprites/SD off,
  backend URLs closed, server plugins disabled. `st-lanes.mts no-model 33` refused because the offline seed had already
  made its backup; no restore needed. `node scripts/debug/st-lanes.mts start 33` -> ready.
- `node scripts/debug/st-lanes.mts run 33 --evidence -- scripts/debug/so-open-stretch-check.mts` -> exit 0,
  `v27-35-open-stretch-curve.json` 39/39 twice consecutively, cleanup clean. The wrapper serves the worktree's `dist`
  through Playwright routes (same approach as `so-live-head-check --candidate`); no staging or install.
  The macro resolves to the scene name only; no objective; group replies count one player turn; no hook at 1/2;
  destination-named gentle pull at 3/4; swipe retains 4; player deletion lowers to 3; plain pull at 6; still in stretch.
  Header diff has zero undeclared differences. Media stays off. Zero non-probe model/media requests;
  two `requires.lane` PONG probes blocked locally. Judge calls: 0. Background model features are suppressed only in
  the lane fixture and its prior settings restored afterward; product defaults unchanged.
- Evidence: private `test/sessions/evidence/phase-c/b3-open-stretch-2026-10-11/`, via
  `node scripts/debug/so-evidence.mts archive --label b3-open-stretch-2026-10-11 --lanes 33 --pods none --since 2026-10-11T12:04:29Z`
  -> 9 files, 774,263 B, hash verification problems `[]`. Both scenario results and runner/page/server evidence retained.
  Final row `2026-10-11T12-04-29-964Z-so-open-stretch-check`: complete, no page exceptions; 48 console errors / 47 failed
  requests / 45 HTTP errors are offline plugin 404s, backend status/props 500s, and the two refused PONG probes.
  Early setup attempts exposed late character loading, the missing named group, stale group-list cleanup, and background
  model attempts; the wrapper now waits for the cast, owns a marked group, refreshes after deletion, and separates offline
  probes from unexpected calls. Both prior failed pairs had passing curve assertions but are not the signing-off row.
- `node scripts/debug/st-lanes.mts stop 33` -> stopped, `serverUp: false`. Only lane 33 used.
- Owed: main checkout full `npm run gates` including full Storybook and replay; private evidence commit/archive by main;
  actual ST Studio save walk if desired beyond the authorized Storybook walk; M1 completeness decision and M2 RP/card work
  remain as above. B3 targeted checks pass; plan 19 is not fully accepted. Encounter pool, quiet/pressure triggers,
  open anchors and epilogue play remain declared unbuilt.

## Gate record (2026-10-11, handoff 37 B3 rerun, parallel-agent session)

- `git merge master` -> already up to date (master `e68a242c` already in); clean tree; prior B3 work kept.
- `npm run typecheck` exit 0; `npm run typecheck:test` exit 0.
- `npm run lint` (eslint src, whole project) -> 0 errors, 2 warnings (`BriefingHost.stories.tsx` and `LiveHead.tsx` hook
  deps, neither touched by this branch). Lint is confirmed: the earlier worry (eslint outside a tsconfig) does not recur.
- `npx jest` on `runtime/macros.test.ts`, `runtime/codeHealth.guard.test.ts` (line-length ratchet),
  `studio/stretchAuthoring.test.ts`, `coordinators/innerCoordinator.test.ts` -> 4 suites / 65 tests pass: both fixed
  failures are confirmed fixed.
- `npm run gates:quick` -> `gates:quick: green in 115.6s`: typecheck ok, typecheck:test ok, lint (changed) ok, jest (related)
  ok, defect replay `--cached` 32 of 32 killed. Full `npm run gates` NOT run (owner's rule for this session).
- `npm run build` -> compiled; `dist/index.js` 1,293,701 B (budget 1,300,000), sha256 `94ef9a5f...cc46c`, same as the
  previous record.
- Curve scenario x2: `node scripts/debug/st-lanes.mts start 33`, then
  `node scripts/debug/st-lanes.mts run 33 --evidence -- scripts/debug/so-open-stretch-check.mts` -> exit 0,
  `v27-35-open-stretch-curve.json` 39/39 on run 1 and 39/39 on run 2, `image.enabled` and `sprites.enabled` false,
  `blocked: 0` model/media requests, `offlineProbes: 2` (the lane's PONG probes), judge calls 0, 0 page exceptions
  (49 failed requests are the offline-lane plugin 404s and backend 500s), fixture assets cleaned (0 leaked), settings restored,
  header diff no undeclared difference. Lane stopped (`serverUp: false`). Only lane 33 used.
- Storybook: `npm run storybook:build` exit 0; served `.sb-static` on port 6033 (not 6006) with http-server;
  `node node_modules/@storybook/test-runner/dist/test-storybook.js --index-json --url http://127.0.0.1:6033 --maxWorkers 1 --includeTags b3-open-stretch --verbose`
  -> 2 suites / 16 stories passed (121 skipped by the tag filter), no accessibility violations; `StretchEditor` (4 stories)
  and `CheckpointEditor` open-stretch walk pass. The server was stopped (its PID checked first).
- Evidence: private `test/sessions/evidence/phase-c/b3-open-stretch-rerun-2026-10-11/` (8 files, 927,508 B, problems `[]`);
  commit with `npm run sessions:archive` from main.
- Deviation: a Chromium on CDP 9333 (lane 33's browser, started 08:50 by an earlier session) was already running; reused,
  not killed, and left running because this session did not start it.
- Owed: main checkout full `npm run gates` (Storybook and replay included); `npm run sessions:archive`; an ST Studio save
  walk (this is a Storybook walk and export round-trip); M1 decision and M2 RP; encounter pool, `trigger: "quiet"`, open
  anchors and epilogue play remain NOT built.


## Gate record (2026-10-13, build-now: encounter pool, quiet trigger, open anchors)

Branch `v2.8-build-encounters` (worktree `C:\dev\so-build-encounters`, base `ccfdbf95`). Tier D only: no model, GPU, pod, lane,
browser, TypeSafe or staging. Owner approval 2026-10-13 (plan 40 §4) builds the three pieces deterministically ahead of M2;
RP acceptance is deferred and floors are unchanged. Epilogue play and the separate SP6 pool/measurement are not touched.
No mock result below is a model-quality claim.

### Built

- **Format.** `stretch.offer: ["encounters"]` is accepted on an intermediate (unique, non-empty, only that value).
  `pressure` and `trigger` stay refused ("it needs the production complication pool"). On an **anchor**, `stretch`
  is an open opening: `{mode, pace, pull_after}` only, `pull_after` at most 10 (`OPENING_MAX_TURNS`, the `long`
  preset), `arrive_when`, `max_turns`, `offer` and `player_text` refused. `CheckpointStretch.arrive_when` is now
  optional in the type; an intermediate without it is still the validator's error.
- **Encounter pool (cache + route).** `EXPANSION_CONTRACT` read as 2 in code at base and is now 3; contract-2 entries
  are dropped by `sanitizeExpansion` (chain or pool). Pool entries carry `kind: "encounters"` and `encounters:
  [{id, title, situation}]` with `beats: []`; key `<stretch>->encounters` (`expansionKey`). The candidate
  (`findEncounterCandidate`) is found from the checkpoint before the stretch or at the stretch; the stretch is its own
  source. Same `ExpansionCoordinator` path: queue, `liveJobs`, `beginRun`/`current()` checks before every write,
  one retry of a failed pool (`POOL_ATTEMPTS` 2), `regenerate`, `runNow` + preflight, `commitValidated`,
  `pruneMissing` (also drops a pool whose stretch stopped offering). Same authoring route (`role authoring`, pass
  `generation`), same critic pass, agency clauses from `agencyForCheckpoint`. New lazy module
  `generation/encounters.ts` (prompt, critic prompt, parse, pool checks, `generateReviewedEncounters`);
  `isEncounterPool`/`encounterOffers` in `generation/paths.ts`; route enumeration (`revalidateExpansion`), merge and
  gate sources skip pools.
- **Pool checks.** 3 to 5 encounters, distinct titles, at most 6 title words, situation 20 to 400 characters, no
  situation or title that `narratesPlayer` flags (reused from the living director guard), and any `outcomes`, `gate`,
  `progress`, `deltas`, `objective`, `exit` key is a parse issue (one repair re-ask, then a failed pool).
- **Use.** `pacingCoordinator.stretchLine` appends `encounterOfferLine` to the stretch's pull line only when the
  stretch offers encounters, a usable pool exists (status `validated` or `inserted`) and the stretch is quiet.
  Everything stays inside the private guidance block (preamble first). No player surface reads pool text.
- **Quiet (pure).** `pacing/quiet.ts` `quietRead({story, state, log, playerTurnIds, window?})` -> `{holds,
  playerTurns, moved}`: holds when player turns in the visit are at least `pull_after` and no watched quality moved
  over the last 3 player turns (`QUIET_WINDOW_TURNS`). Watched = the qualities of every outgoing gate of the stretch,
  `arrive_when` included, minus the mechanical counters. Baseline = the `after` of the last boundary whose
  `context.lastMessageId` precedes the window's first player message, else the `before` of the visit's first
  boundary; no log in the visit = not quiet. A value unset at the baseline moves only to a truthy value (a first read of
  `false`/0/"" is not an event). Boundaries are never counted as turns.
- **Open opening (runtime).** `openPhase(checkpoint, playerTurns)` (engine) is the one test: a stretch is always open,
  an anchor opening only while `playerTurns < pull_after`. Consumers: `objectiveLineApplies(story, cp, turns)`, the
  guidance block (`OPENING_LINE` while open, the ordinary objective line from the boundary on), the
  `{{story_current_checkpoint}}` macro (`RuntimeManager.getPlayerTurns`), the inner voice scene line, and
  `agencyRecovery` (no refusal while open). The stall re-read (`planReconciliation`) is deliberately untouched: it is
  a read, never narration. Turns are computed only for a checkpoint that has a `stretch` (ordinary stories unchanged;
  payload-invariance tests green).
- **Studio / wizard.** Studio Checkpoints tab: the **Open stretch** panel gains an "Offer encounters" checkbox; anchors
  get an **Open opening** panel (pace, open-for turns capped at 10, a red line for a left-over public situation).
  Helpers `newOpening`, `withOpeningTurns`, `withEncounters` in `studio/stretchDraft.ts`. Wizard `updateCheckpoint`
  `patch.stretch` reads through `readStretch` with the patch's own `type`; the tool shape text names `offer` and the
  anchor form. Author drawer Scheduler tab lists a pool as "<stretch> encounters" with its titles and a Regenerate
  button for a failed or review pool (author view only).
- **Guide and registry.** `docs/authoring/story-guide.md` §Open stretches (encounters, quiet definition, open opening),
  compact twin `copilot/guideTopics.ts` (`open-stretches`, under the 800-character cap), registry row text
  (`features/presenceFeatures.ts`). `npm run docs:guide` and `npm run docs:settings` run; only
  `docs/guide/author/fields/scenes.md` and `src/guide/pages.generated.ts` carry content changes (the other
  regenerated pages differ by line endings only and were reverted).
- **Scenario fixtures (no model).** `test/scenarios/v28-19-open-opening.json` (+ `.story.json`) and
  `test/scenarios/v28-19-encounters.json` (+ `.story.json`). `scripts/debug/so-open-stretch-check.mts` now takes
  `SO_STRETCH_SCENARIOS=<comma list of test/scenarios/*.json>` (default: the v2.7 curve) and accepts lane 33 or 38.
  The pool is planted through the `expand` verb's `debugResponse` (plumbing only).

### Decisions and deviations

- **Quiet gates the encounter menu, not complications.** `pressure`/`trigger` stay refused; the quiet logic is reusable
  and tested, and the only live consumer is the already-built encounter menu ("the narrator may offer one when play
  lulls"). No complication pool was built. The window is the constant 3, not the not-yet-existing
  `complication_after` field; when Q6 builds that field it passes it as `window`.
- **Counters excluded from "watched".** `player_turns_in_checkpoint`, `message_count`, `messages_in_checkpoint`,
  `elapsed` change every turn and would make quiet unreachable if an authored gate named them.
- **Anchor opening reuses `stretch`** (the plan's own wording) rather than a new field; `pull_after` on an anchor is the
  opening's length. `player_text` is refused on an opening, as on a stretch, because the objective is never player
  copy and player copy is the only task text a player could see.
- **Only `validated`/`inserted` pools reach the narrator.** Chains merge `needs_review`; a pool is a private direction to
  the narrator and a failed critic (agency) must not reach it, so a review pool waits for the author's Regenerate.
- **No judge critic and no variants for pools** (they score chains against a target anchor); one generation, the code
  checks, one LLM critic call.
- **Not built:** engagement latching (an engaged encounter latching a quality or starting a side quest), pool
  spent-ness (the menu is shown while quiet holds; the narrator is told to skip any the chat already shows), epilogue
  play, any player-facing pool text.
- **Contract bump cost.** Every existing chat's generated-chain cache is dropped on load and regenerated on arrival
  (as every earlier bump).
- **Fresh worktree tooling gap (not fixed here).** `gates:quick`'s `defect replay --cached` fails in a worktree with no
  `.build/defect-replay-cache.json` (every file counts as changed and the `--findRelatedTests` argument list is too
  long on Windows); untracked new files also stay out of the staged copy until `git add`. The full `npm run test:replay`
  was run once, after which `--cached` worked.
- **Campaign adoption (private repo, pin untouched).** Encounters are per-stretch opt-in: the three lab stretches could
  add `"offer": ["encounters"]` for the M2 open arm; an anchor opening suits scene-setting anchors. No campaign file was
  read or changed. Decision after M2.

### Commands and results

- `npm run typecheck`, `npm run typecheck:test`, `npm run debug:typecheck` -> exit 0. `npm run lint` -> 0 errors, 2 warnings
  (`BriefingHost.stories.tsx`, `LiveHead.tsx`, untouched).
- New and changed tests: `generation/encounters.test.ts` (24), `runtime/coordinators/encounterPool.review.test.ts` (15),
  `encounterOffer.review.test.ts` (8), `openOpening.review.test.ts` (15), `runtime/quietStretch.review.test.ts` (14, incl.
  rollback = replay over 4 seeds x 100 cuts, 0 mismatches, more than 20 quiet and more than 20 broken cases),
  `studio/stretchAuthoring.test.ts` (+3), `innerCoordinator.test.ts` (+1), `openStretch.review.test.ts` (offer cases).
  Census updates: `test/findings/errorCopy.json` (one probe row), `passProfiles.test.ts` (caller list),
  `test/goldens/arrival-findings.json` (two fixture stories).
- Full `npx jest --silent` -> 689 suites passed (1 skipped), 7964 tests passed (1 skipped).
- `npm run gates:quick` -> green in 85.5 s (typecheck, typecheck:test, lint changed, jest related 494 suites / 6294 tests,
  defect replay --cached ok); `npm run test:replay` -> 32 of 32 killed in 102.8 s.
- `npm run test:debug` -> 1234 of 1234; scenario schema/requires tests 31 of 31 (the new fixtures validate).
- `npm run build` -> compiled; main bundle `dist/index.js` 1,253,438 B on this checkout (1,248,065 B before the change,
  +5,373 B; budget 1,300,000 B). `generation/encounters.ts` (prompt text) lands in a lazy chunk.
- Storybook: `npm run storybook:build` exit 0, served `.sb-static` on owned port 6034, `test-storybook --includeTags
  b3-open-stretch` -> 2 suites, 20 stories passed (4 new: `OffersEncounters`, `OpensAnAnchorOpening`,
  `CapsTheOpening`, `AuthorsAnOpenOpening`), no accessibility violations; server stopped. Not the full Storybook gate.

### Scenario for the parent (no model, offline lane, not run here)

`SO_STRETCH_SCENARIOS=test/scenarios/v28-19-open-opening.json,test/scenarios/v28-19-encounters.json node scripts/debug/st-lanes.mts run 38 --evidence -- scripts/debug/so-open-stretch-check.mts`
(each scenario runs twice; header diff, blocked-request count and asset cleanup as in the B3 record). Expected: opening
line and no objective at 1 and 2 player turns, objective and macro with the objective from the 3rd, swipe keeps, delete
reopens; encounter menu absent at 1 and 2, present at 3, absent at 4 and 5 after a `/cp set` on the gate quality, present at 6,
swipe keeps, delete drops it, reload keeps the pool and the count. A reload step ends the encounter scenario; if the
wrapper's served-candidate route does not survive it, drop that step and say so.

### Owed (NOT green)

- The two offline scenarios on a lane (above), twice, with header diff and cleanup; full `npm run gates` with the whole
  Storybook; `SO_ACCEPTANCE` paths untouched.
- RP: real-model pool generation quality (critic and code-check pass rate, agency flags), whether a narrator actually
  offers one situation and never resolves it, and the M2 A/B with the pool arm. Floors unchanged (M2 above).
- Engagement latching, pool spent-ness, pressure and `trigger` (need v2.8 17 -> 18 Q6), epilogue play.


## Gate record (2026-10-13, review corrections to the build-now pass)

Same branch (`v2.8-build-encounters`), follow-up to `33726a82`. Tier D, no model, GPU, lane, browser or staging. This record
supersedes two statements of the previous one.

- **Correction 1, quiet is "no CHANGE", not "zero net change".** The first cut compared the value at the window's baseline
  with the value now, so true -> false -> true (or 0 -> 1 -> 0) inside the last 3 player turns read as quiet.
  `pacing/quiet.ts` now walks every snapshot of the current visit that the window touches: the baseline (the `after` of
  the last boundary before the window's first player message, else the `before` of the visit's first boundary), then the
  `before` and `after` of every later boundary of the visit, then the current engine state. A watched quality has moved
  when any two consecutive snapshots differ, so a write between two boundaries, several boundaries inside one player
  turn, and a write after the last logged boundary all count. Nothing before the visit is read (another checkpoint's
  boundaries and an earlier visit to the same stretch are filtered out by checkpoint id and `checkpointStartedMessageId`).
  The neutral rule is now symmetric and limited to unobservable differences: unset <-> false/0/"" is not a move, unset <->
  anything else is. Mechanical counters stay excluded. The quiet is back only when every move has left the window.
- **Correction 2, an open anchor keeps its `player_text`.** The previous cut refused `player_text` on an anchor with an
  opening (an unsolicited restriction). `checkStretches` now refuses it for an intermediate open stretch only. An anchor's
  authored `player_text` validates and is hidden from the player while the opening lasts and shown after, through the same
  `openPhase` test as the objective line: the Where-you-are note (`snapshotBuilder`), the main-line widget (`widgets.ts`),
  the player projection Ask and suggestions read (`playerProjection.ts`, new optional `playerTurns`; the start projection
  hides it at turn 0), the entry note (`transitionNoteText`) and the inline progress chip (`inlineTimeline.ts`). The entry
  note and chip are emitted once at entry, so for an opening anchor they carry the name only and are not re-issued later.
  `shownPlayerText` (`runtime/stretchTurns.ts`) is the shared helper; turns are computed only for a checkpoint that has a
  `stretch`.
- **Authoring surfaces.** Studio `StretchEditor` (anchor form): the red "clear the public situation" line is replaced by a
  neutral note that the public situation stays hidden for the opening and then shows. Intermediate panel unchanged
  (the refusal line stays). Guide `docs/authoring/story-guide.md` §Open stretches and the compact topic say an anchor's
  `player_text` waits during the opening; the intermediate refusal is unchanged. Wizard tool text needed no change
  (an anchor patch never carried `player_text` rules). `npm run docs:guide` run; only `docs/guide/author/fields/scenes.md`
  and `src/guide/pages.generated.ts` carry content changes.
- **Tests.** `runtime/quietStretch.review.test.ts` (29, was 14): out-and-back inside the window with a toggling derived
  quality (a switch line flips a parity quality, so equal values at both ends), first move leaving while the second is
  inside, an out-and-back wholly before the window, scripted cases and a 4 seeds x 100 cuts property test comparing the
  engine read, a replay of the chat and an independent reference computed from the chat text alone (0 mismatches,
  more than 10 out-and-back and more than 20 quiet cases); synthetic-log cases for a 0 -> 1 -> 0 counter, several
  boundaries in one player turn, a write between boundaries, a write after the last boundary, pre-visit movements,
  the neutral rule and counters. The 7 new tests that exercise the correction fail on the previous implementation
  (checked by swapping it back). `runtime/coordinators/openOpening.review.test.ts` (18): anchor with `player_text`
  validates and parses, the intermediate refusal is retained, narrator block hides the objective at turns 1 and 2 and
  restores at 3 with `player_text` authored. `runtime/openOpeningPlayerText.review.test.ts` (5): the player surfaces
  above at 1, 2 and 3 turns, with plain-anchor controls. Story `CapsTheOpening` asserts the neutral note.
- **Commands and results.** `npm run typecheck`, `typecheck:test`, `lint` (0 errors, 2 untouched warnings) clean; full
  `npx jest --silent` -> 690 suites passed (1 skipped), 7987 tests passed (1 skipped); `npm run build` -> main bundle
  1,253,770 B (budget 1,300,000 B); `npm run storybook:build` then `test-storybook --includeTags b3-open-stretch` on owned
  port 6034 -> 2 suites, 20 stories passed, no accessibility violations, server stopped; `npm run gates:quick` result is in
  the hand-over (this file is edited before its final run).
- **Limitations.** The player-facing hiding is proved at the function level and for the composed inline chip; the
  main-line widget and the snapshot narrative use `shownPlayerText` but have no end-to-end test of their own. Not run in a
  browser or lane. Plan 40 and the queue were not touched in this follow-up.

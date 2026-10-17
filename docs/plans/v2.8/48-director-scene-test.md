# Plan 48 — Director scene test

**Status (2026-10-16): option A built on `v2.8-director-48-49` (not merged); D floors S1–S6, S12, S13 green, no-model lane
scenario green ×2 (plumbing); S7–S9, S11 CL and S10 owed (§Gate record 2026-10-16). Was: WRITTEN 2026-10-14, not decided.** Pattern G20 of `v2.8/27-gamification-report.md`. Implementation tier D; acceptance CL
(director route) and RP (final suite living row). Overview: `00-overview.md` (this folder).
**Revised 2026-10-14 against the Astra review** ("accept A, narrowed"): §Review 2026-10-14 (Astra) records each
finding; the shared contract lives in v2.8 52 §Review 2026-10-14 (Astra). Chaos is tension-only, the draw is seeded by
an immutable planning event and frozen once, "altered" and "interrupt" have operational definitions.

## What it is

- When the living director (v2.8 22) is about to write the next anchor, a **seeded draw** against one author-only
  `chaos` value decides how the coming scene relates to what the path set up: **expected**, **altered** or
  **interrupt**.
  - **Expected:** the director writes as today.
  - **Altered:** the scene the path points to arrives changed. A detail of place, cast or circumstance differs from what
    was expected.
  - **Interrupt:** something else happens first. The world acts before the planned scene. The event's focus comes from
    open arcs or present members (G21, shared with v2.8 49).
- **World-side only.** The draw changes what the world does, never what the player does. The agency policy
  (`engine/agency.ts`, `DEFAULT_AGENCY`) applies unchanged. No outcome narrates the player, decides for the player, or
  undoes a player choice.
- **A signal, not a writer.** The result goes into the director prompt as one more input line, before the director
  writes the anchor. The director's existing checks (`checkDirectorOps`, the `narratesPlayer` guard, the critic) still
  decide whether the anchor is accepted.
- **Author-only.** The chaos value, the odds and the outcome never reach a player surface (trap 9: odds are spoilers).
- **Rollback ≡ replay.** The draw is keyed by chat, story, frontier and the **planning event**: the boundary at which
  the director first planned for that frontier (a frontier need not have been entered; with a horizon above 1 it is a
  reachable future anchor, `src/generation/living/frontier.ts:32-41`). The sampled chaos, outcome and focus are frozen
  in a record at that moment. A swipe past the planning boundary drops the record; a replay plans at the same boundary
  and draws the same result. Regenerating an anchor reads the record and never re-rolls (trap 3).
- The mechanic is described from Mythic GME's scene test. **Nothing is copied**: no table, range, odds, wording or
  term beyond the generic idea. Mythic content is Word Mill CC-BY-NC (`27-gamification-report.md` trap 10, ranked
  row 7). The probability mapping below is ours.

## History and evidence

- `v2.8/27-gamification-report.md`:
  - Ranked row 7 (`mythic-gme-support @ 54c385b`): "scene test: seeded draw vs one author-only `chaos` quality →
    expected/altered/interrupt". Code 0BSD-style, content CC-BY-NC.
  - Pattern row G20: determinism D, rollback R, author-only, value 5, effort M, target **v2.8 22**.
  - Candidate rows, v2.8 22: "G20 scene test as the director's first, seeded, author-only decision before it writes an
    anchor (an interrupt is world pressure only); `chaos` as one author-only int quality optionally driven by the
    tension EMA".
  - Traps T1 (punishing inaction), T3 (`Math.random`, reroll buttons), T8 (lossy undo) and T9 (odds as spoilers).
- `v2.8/22-living-story-director.md`: built 2026-10-10 (00-overview §Status row 22). The director writes ahead of the
  player one anchor at a time. Its objective must be "world pressure, never the player's decisions" (`:195-196`). Live
  rows are owed (`31` M21–M24).
- `v2.7/35-world-pressure-and-open-stretches.md` §Adopted from the gamification harvest: "odds- or chaos-scaled triggers
  only after K1–K5 pass". That rule covers **complication triggers** (G18). The scene test is not a complication
  trigger: it releases no pool line and injects no block into a play reply. It changes one input line of the director
  call. §Options names where it would cross that line.
- The owner rule that every built feature is on by default (00-overview rule 9) applies once it is built.

## Current state in code

Verified on master `211d8d96`.

- **No `chaos` exists.** `grep -rniE chaos src docs/authoring` returns nothing.
- **Seeded chance, never `Math.random`:**
  - `src/engine/chance.ts`: `chanceSeed` hashes the key parts (`:10-20`); `unitDraw` (`:33`) returns one value in
    [0, 1).
  - `src/runtime/chance.ts`: `chanceGateValues` (`:39-44`) already draws a rolled code quality at
    `view.checkpointStartedBoundary`. That is the same "draw once at the scene's start, keyed by its boundary" shape this
    plan needs. `onChanceDraw` (`:53-56`) feeds the author-side draw ring.
- **Tension EMA:** `src/pacing/tension.ts:24-28` `updateEma`, applied in
  `src/runtime/coordinators/pacingCoordinator.ts:60-65`. The smoothed value is stored as `tension_current`. Levels are
  `calm, stirring, tense, critical, peak` (`src/engine/schema.ts:11`).
- **Director input:** `src/generation/living/prompt.ts:19-37` `DirectorInput` (tension `current`/`suggested`,
  `refused`, open threads, plans) and `renderDirectorPrompt` (`:50-97`). Built by `src/runtime/livingUnit.ts:27-62`
  `directorInput`. Open threads come from `src/runtime/livingInputs.ts:37`, through the resting filter (`shown`, `:32`).
- **When the director runs:** boundary work `living-director` (`src/runtime/boundaryWork.ts:194-199`), only once the
  active anchor is the last one inside the horizon. Applied in `living-apply` (`:50-55`). Autonomy is `suggest` when
  `authored_until` is set, otherwise `auto` (`src/generation/living/frontier.ts:11-15`).
- **Guards:** `src/generation/living/guard.ts:18,42-43` refuses an objective or name that narrates the player.
- **Story schema:** `StoryLiving` (`src/engine/schema.ts:519-529`) has no scene-test or chaos field.

## Options

| | Design | Cost | Risk | Needs |
|---|---|---|---|---|
| **A. Director signal only** | Draw at the frontier's entry boundary. One prompt line for altered/interrupt. Author-only record and chip | S–M: pure draw + one prompt line + read model + author chip | Altered/interrupt lines may raise critic refusals | D; CL director replay; RP final suite |
| **B. A + steering hint in authored stories** | The same draw at every anchor entry also adds a world-side steering line to authored (non-living) stories | M | This is model input on every story, close to a chaos-scaled trigger (v2.7 35: only after K1–K5) | SP6 PASS first; RP A/B |
| **C. A + chaos moved by outcomes** | Chaos rises or falls with scene results, as in the source system | S on top of A | Easy to slide into "chaos rises when the player resists". That is trap 1 / v2.7 35's "pressure never fills from the player refusing a route" | an explicit non-player driver list |
| **D. Do nothing** | The director keeps tension `current`/`suggested` as its only pacing signal | 0 | Generated stories stay predictable | — |

## Recommendation

**A.** It is the smallest form that does what G20 is for. It touches only a model call that already exists, the
director's, and adds one line to it. It needs no new injection into play replies, so it is not held by the SP6 gate.
**B** waits for SP6 (v2.8 17) and a separate owner decision. **C** is refused in its source-system form. Chaos moves
only through the sources below, and none of them reads what the player refused.

Design of A:

1. **Format.** `living.scene_test?: { chaos: {from: "tension"}, min_gap?: int }` (revised 2026-10-14).
   - Chaos is the level index of the smoothed tension (calm 0 … peak 4), read from `tension_current` at the planning
     boundary; `min = 0`, `max = 4` are fixed by the tension scale, so no author bounds are needed.
   - An authored chaos quality is **deferred**: no checkpoint `set`/`add` effect exists (`CheckpointEffects`,
     `src/engine/schema.ts:128-140`), and the old format asked for "display min/max" while refusing `display`. It
     returns only with a state-write facility and its own author-only `range` on `scene_test`.
   - Validator: unknown keys get a did-you-mean; `min_gap` 0–5 (default 2). Absent `scene_test` means off.
2. **Chaos writers.** The tension mapping only. Never a player-refusal counter, the agency recovery path or wall-clock.
3. **The draw and the frozen record (pure, `src/generation/living/sceneTest.ts`).**
   - On the director's **first** plan for a frontier: `u1 = unitDraw([chat, story, frontierId, plannedAt,
     "scene-test"])`, `u2 = unitDraw([..., "scene-test:kind"])`, `c` = chaos then.
   - `p = (c + 1) / 7`. Unexpected when `u1 < p`; then interrupt when `u2 < 0.4`, else altered. Placeholders
     (§Decisions 3).
   - **Spacing:** an interrupt drawn within `min_gap` frontiers of the last applied interrupt applies as altered.
   - The record freezes `{frontierId, plannedAt, chaos, p, drawn, applied, focus?}`. Every later director call for
     that frontier (regenerate, a retry after a critic refusal, a horizon recompute, changed tension or open arcs)
     reads the record; nothing re-samples.
4. **Signal, operationally defined.** `DirectorInput.sceneTest?: {applied, focus?}` plus the frozen **expected
   continuation**: the frontier's destination (the anchor the path points to) and the open thread it advances.
   - Altered: "Keep the destination and the thread. Change exactly one of: the place, who is present, the timing, or
     an obstacle; the world changed it, not the player." The draft names which (`changed: place | cast | timing |
     obstacle`), checked by `checkDirectorOps` (a missing or second change is refused).
   - Interrupt: "Before the destination, a world event advances [<focus thread> | an open thread] first; then the path
     to the destination resumes. World pressure only." The draft names the thread it advances (an existing open
     thread, never a new compulsory detour).
   - Expected: no line, so the prompt stays byte-identical to today's.
   - Focus is optional: an open arc through the resting view whose entities are known (v2.8 52 `knownEntities`), drawn
     by v2.8 49's pure `focusPick` (decision 6). No member focus in v1.
5. **Record retention.** `extras.living.sceneTests[]` keyed by frontier. Retained by boundary, not by count: a record
   whose `plannedAt` is older than the engine's oldest retained snapshot (200, `src/engine/engine.ts:488`) is dropped,
   since a rollback cannot reach it. Rolled back by `plannedAt`, like the director's ops. The draw is announced to the
   author draw ring (`onChanceDraw`, kind `scene`).
6. **Surfaces (author only).** An inline author-level chip on the boundary that drew it ("Scene test: interrupt").
   The director suggestion card shows the outcome and the chaos value. A row in Author view's living panel. Player
   projection unchanged.
7. **No reroll.** "Regenerate" on a suggestion card keeps the same outcome. Only a rollback past the entry boundary
   redraws, and then deterministically.

## Predeclared floors

Committed before any run; never retuned (00-overview rule 2).

| # | Condition | Floor | Tier |
|---|---|---|---|
| S1 | Rollback ≡ replay of `sceneTests` and of the director input line | 0 mismatches over 4 seeds × 100 cuts (K1's shape), horizon 1 and horizon 3 (non-active frontiers), with a control that keys by `Date.now` and must fail | D |
| S2 | Draw calibration | over 10,000 synthetic keys per chaos step, the unexpected rate is within ±0.02 of `p` and the interrupt share within ±0.02 of 0.4 | D |
| S3 | No reroll, frozen | regenerate ×10, a critic-refusal retry, a tension change and a changed open-arc list after planning all give the frozen outcome and focus; a swipe past the planning boundary then a replay gives the original | D |
| S4 | Expected = today | with outcome expected, or `scene_test` absent, the director prompt is byte-identical to the current one (golden) | D |
| S5 | Player clean at fixed played state | with the same blackboard, path, canon and chat, the player projection and every player surface are byte-identical with and without `scene_test`, at each outcome (intended narrative consequences change state and are excluded by construction); `so-ui.mts assert-player-clean` passes with the new selectors | D |
| S6 | Chaos writers | no code path writes the chaos quality from the agency recovery path, the refusal counter or wall-clock (guard test with a planted writer as the control) | D |
| S7 | Director honours the signal | on 20 frozen frontiers × 3 forced outcomes (offline replay, director route recorded), a second model rates "the anchor is altered/interrupted as asked, world-side" ≥ 0.80 for altered and for interrupt | CL |
| S8 | No agency cost | three equal arms of 20 anchors (expected, altered, interrupt) on the same frontiers: the guard's narrated-player count stays 0 (a detector, a lower bound), and the second-model agency-flag **rate** of each changed arm ≤ the expected arm's rate + 0.05 | CL |
| S9 | No stall cost | critic refusal **rate** of each changed arm ≤ the expected arm's rate + 0.10 (equal arms as S8) | CL |
| S11 | Surprising but coherent | blind second-model rating on the S8 arms: altered and interrupt each rated "surprising and causally coherent with the expected continuation" ≥ 0.70; expected rated surprising ≤ 0.30 | CL |
| S12 | Spacing | over 1,000 synthetic frontier sequences, no two applied interrupts within `min_gap` frontiers; drawn vs applied recorded | D |
| S13 | Changed means one change | altered drafts naming 0 or ≥ 2 changes, or an interrupt naming no existing thread, are refused by `checkDirectorOps` (unit cases with planted drafts) | D |
| S10 | Plan 22 floors hold | v2.8 22 M1's floors (0 impossible or open-on-arrival gates, 0 unreached-anchor names on player surfaces) hold with `scene_test` on | CL, RP |

S7–S9 use synthetic English frontiers. Adolion frontiers, if used, are rated by a second model and never shown to the
owner (00-overview rule 11). As every floor here, they are informational under rule 9: a miss is recorded, the feature
stays on.

## Gates by tier

- **D (implementation):** `npm run gates` (jest property tests S1–S4, S6; validator tests; Storybook story for the
  chip and the card row; `architecture.test.ts`, since the living director must not touch the blackboard or memory and
  the record lives in `extras.living`). Registry: feature `scene-test` under the living director's group, with a Help
  entry (rule 10). Guide topic in `docs/authoring/story-guide.md` + `copilot/guideTopics.ts`, then
  `npm run docs:guide` and `npm run docs:settings`. Bundle: the draw is pure and small; the prompt text rides the lazy
  living chunk. Main-entry cost recorded from a named build.
- **D (live, no model):** a no-LLM group scenario that seeds a living story with `scene_test` and a mocked director
  answer, drives a swipe past the entry boundary and a regenerate, and asserts S3 and S5 in the browser (`so-ui.mts
  assert-player-clean`). This is plumbing only; it never signs off S7–S9.
- **CL (acceptance):** S7–S9 offline replay on the authoring route (opencode `openai/gpt-6.1-sol` by default, route
  recorded), ×2.
- **RP (acceptance):** the living row of the v2.8 final suite (v2.8 24) runs with `scene_test` on. S10 is read there.

## Privacy and spoiler notes

- **Odds are spoilers (trap 9).** Chaos, `p`, the outcome and the focus are author-only. No player chip, no HUD value,
  no Journal row, no widget may bind the chaos quality (`display` refused; widget `bind` to it refused). A `clock`
  widget bound to chaos would show remaining pressure.
- **Focus is tested by forbidden information, not claimed safe by construction** (revised 2026-10-14): open arcs
  through the resting filter (`livingInputs.ts:32-37`) whose entities are known (v2.8 52 SC3), checked by v2.8 49 C4
  (0 forbidden strings in the focus line). The resting filter strips secret content, not names, so it alone is not
  the guarantee. The director prompt's existing "never name or reveal private plans" rule still applies.
- **Unreached anchors:** an altered/interrupt anchor is a generated anchor like any other. v2.8 22's player-copy
  projection and "Save as story" rules apply unchanged.
- **No Adolion content** in fixtures or this plan.

## Dependencies and links

- **v2.8 22** living story director: the only consumer. It builds on its `DirectorInput`, suggestion card and
  `extras.living` rollback.
- **v2.8 49** complications and twists: shares the G21 focus pick (one pure function, owned there, extracted now for
  this plan per 49 decision 6).
- **v2.8 17 / v2.7 35:** a scene test that injects into play replies (option B) is a chaos-scaled trigger and waits for
  K1–K5 and an owner decision.
- **v2.8 50** story calendar: an interrupt may be keyed to night or a date later. Not in scope.
- `runtime/chance.ts` / `engine/chance.ts`: the one seeded chance source.
- `v2.8/27-gamification-report.md` G20, G21, T1, T3, T9, T10.

## Decisions for the owner

1. **Build option A (director signal only, author-only)?** **Recommended: yes.** It is on by default for any story that
   declares `living.scene_test` (rule 9). A story without the field is unchanged.
2. **Chaos source:** an authored code quality, `{from: "tension"}`, or both? **Recommended: tension only** (revised
   2026-10-14). No checkpoint `set`/`add` effect exists to move an authored one; it returns with a state-write facility.
3. **The probability mapping and the 0.4 interrupt share** are our own placeholders. Keep them as proposed, or set
   other values before S2 is committed? **Recommended: keep as proposed.** They are recorded as placeholder values,
   like `PACE_PULL_AFTER`.
4. **Option B (authored stories get a steering line from the same draw):** **Recommended: not now.** Revisit only
   after SP6 passes (v2.8 17), as a separate decision.
5. **Option C (chaos moved by scene outcomes):** **Recommended: refuse the source-system form.** Chaos moves only by
   tension, never by what the player did or refused.
6. **Interrupt focus in v1:** none, or an open arc via v2.8 49's pure `focusPick`? **Recommended: open arcs only, via
   `focusPick`** (49 extracts it now for this).
7. **Spacing (`min_gap`, default 2 frontiers between applied interrupts)?** **Recommended: yes.**

## Unresolved questions

- Should `{from: "tension"}` read the smoothed value or the raw last level? Answered 2026-10-14: the smoothed value at
  the planning boundary, frozen in the record.
- Does a branch pass (`liv_b<n>_way`, v2.8 22 divergence) draw its own scene test, or inherit the frontier's? The
  proposal is that it inherits: one draw per frontier entry.
- Does the scene test apply to the living opening (`LIVING_OPENING_ID`)? The proposal is no: the opening is the
  author's premise.

## Review 2026-10-14 (Astra)

Source: `review-astra-2026-10-14.md` §Plans 48-53 ("48: accept A, narrowed"), checked on master `3a716f2b`. Shared
findings resolve through v2.8 52 §Review 2026-10-14 (Astra): SC1 (records live in `extras.living` and roll back with
the director's ops by `plannedAt`; no blackboard write), SC2 (no engine step: the draw is director-side), SC3 (focus
candidates through `knownEntities`), SC4 (n/a: no player surface).

- **P1 A frontier need not have been entered.** Verified: `findFrontier` searches `reachableByCheckpoint` ahead of the
  active anchor when the horizon allows (`src/generation/living/frontier.ts:32-41`). → Seed origin is the immutable
  planning event (`plannedAt`); S1 runs horizon 3.
- **P1 The proposed chaos writer does not exist; display min/max vs refused display.** Verified: `CheckpointEffects`
  has no `set`/`add` (`src/engine/schema.ts:128-140`). → Tension-only chaos with fixed bounds 0–4 (decision 2); the
  authored quality is deferred with its own author-only `range`.
- **P1 A stable seed alone does not preserve the outcome; 50-record cap.** Accepted. → The record freezes chaos, `p`,
  drawn and applied outcome and focus at first plan; every later call reads it (S3 now drifts tension and arcs).
  Retention follows engine snapshot retention (`engine.ts:488`), not a count.
- **P2 "Unexpected" not operational.** Accepted. → A frozen expected continuation (destination + thread) is supplied;
  altered = exactly one named change keeping the destination; interrupt = a world event advancing an existing thread,
  then resume. `checkDirectorOps` checks the named change (S13).
- **P2 Floors measure obedience more than benefit; S5 identity; S8 arms.** Accepted. → S5 at fixed played state; S8/S9
  compare rates over equal arms (20/20/20); the agency regex is named a detector (`src/generation/living/guard.ts:18-25`);
  S11 adds a blind "surprising but causally coherent" rating; S12 a repeated-interruption check.
- **Cheaper design** (one frozen tension-derived signal, focus optional, no authored-story injection). This is now A.
  Option B stays refused until SP6 (decision 4 unchanged).
- **Brainstorm: interruptions that advance an existing thread and keep the destination; deterministic spacing.** Both
  adopted (item 4 interrupt wording; `min_gap`).

## Gate record 2026-10-16 (option A on `v2.8-director-48-49`, not merged)

Built option A with every recommended decision (1 A; 2 tension only; 3 placeholders kept; 4 no B; 5 C refused; 6 focus
from open arcs via 49's `focusPick`; 7 `min_gap` default 2). Unresolved questions taken as proposed: a branch pass draws
nothing (inherits), the opening `liv_open` draws nothing. Commits `db9bcbec` (build), `6eb51188` (sanitizer keeps records), `3029d1ad` (arrival golden re-recorded, own commit) and this record.

What was built

- Format: `living.scene_test {chaos: {from: "tension"}, min_gap 0-5}` (`engine/schema.ts`, `validate/living.ts`);
  unknown keys with did-you-mean; any other chaos source refused with the state-write reason.
- Pure core `generation/living/sceneTest.ts`: chaos = smoothed tension level index (calm 0 … peak 4) read from the
  director inputs at the planning boundary; `p = (chaos + 1) / 7`; `u1`, `u2` = `unitDraw([chat, story, frontierId,
  plannedAt, "scene-test" | "scene-test:kind"])`; interrupt share 0.4; spacing against the last `min_gap` records; an
  interrupt with no safe open thread applies as altered; focus = `focusPick` over the safe arcs (`scene-test:focus` key).
  Record `{frontierId, plannedAt, messageId, chaos, p, unit, drawn, applied, focus?, expected {from, thread}}`.
- Coordinator: `propose()` reads the frozen record for the frontier or plans it once, before any await (so no new
  ownership census row), writes `extras.living.sceneTests`, announces one draw (ring kind `scene`); regenerate, retries,
  horizon recomputes all read it. `restoreAfterRollback` drops records with `plannedAt` > the kept boundary;
  `LivingPort.movedAfter` counts them (a plan-only boundary still rolls back); `compact` drops records below the engine's
  snapshot floor; the living sanitizer keeps well-formed records across a reload.
- Signal: `DirectorInput.sceneTest` adds one `Scene signal: …` line after the tension line (expected adds nothing).
  Altered asks for `"changed"` (exactly one of place, cast, timing, obstacle); interrupt asks for `"advances"` (an
  existing open thread). `checkDirectorOps` takes an optional `scene` and refuses 0 or 2+ changes, an unknown change or
  a thread that is not open (stage `ops`, retried like any refusal).
- Surfaces, author only: inline chip `Scene test: <applied>` (progress, level 3, only fed in Author view), living panel
  `#so-living-scene-tests` list, scene row on each director card (`[data-so="living-scene"]`, with `changed`/`advances`),
  roll ring row (Author tools activity). Player projection, player inline view and player living slice unchanged.
- Registry feature `scene-test` (world, author, Help entry), guide topic `scene-test` (story-guide + compact twin
  `copilot/guideTopicsLiving.ts`), `docs:guide`, `docs:settings`; plan 24 matrix row `scene-test`; architecture note.
- SC1: no compiled code key is added (the record lives in `extras.living`), so no `ROLLBACK_DETECTORS` or
  `ROLLBACK_EXEMPT` entry; the code-only seed is the plan-only boundary case below. SC2: no engine step (director-side).
  SC3: focus candidates exclude arcs naming a person or place `knownEntities` does not know (`unknownEntityNames`,
  `engine/codex.ts`). SC4 n/a. `boundaryOrder.test.ts` untouched and green.

Floors (D, jest)

- S1: 0 mismatches over 4 seeds × 100 cuts at horizon 1 and at horizon 3 (sceneTests JSON and the per-frontier signal
  line), cuts include reopen through the sanitizer; > 50 records dropped and re-planned across the cuts; control keyed by
  the wall clock mismatches > 10 of 20 (`runtime/coordinators/livingSceneTest.review.test.ts`).
- Code-only seed: a plan with nothing applied makes `movedAfter` true at the boundary before it, and the rollback drops the
  record.
- S2: 10,000 keys per chaos step, unexpected rate within ±0.02 of p and interrupt share within ±0.02 of 0.4, all 5 steps
  (`generation/living/sceneTest.test.ts`).
- S3: regenerate ×10 with drifting tension and arcs, a critic refusal retry and a broken (signal-ignoring) answer keep the
  record and the one line; one draw announced; a rollback past the planning boundary drops it and the replay plans the
  identical record.
- S4: absent `scene_test`, an expected record and a null record give the byte-identical prompt, equal to the golden
  `test/goldens/living-scene-test/director-prompt-premise.txt`; a changed outcome adds exactly one line.
- S5: player inline view at levels 1–4 byte-identical with and without records at each outcome; author view shows them as
  author items; player living slice identical. Live `assert-player-clean` below.
- S6: `sceneTest.ts`, `focus.ts` and the coordinator's planning method contain no wall clock, `Math.random`, refusal or
  agency read; planted writers are caught.
- S12: 1,000 sequences (min_gap 0–5), 0 applied interrupts within min_gap; drawn ≠ applied recorded.
- S13: unit cases through `checkDirectorOps`: altered with 0 or 2 changes or a bad change refused; interrupt with no
  `advances` or a new detour refused; matching thread (case-insensitive) passes.

Gates

- `npm run gates -- --jobs=1 --no-storybook` on `3029d1ad`: all green in 411.6 s (test 9,032 passed / 1 skipped,
  test:replay, build, test:debug, typecheck, typecheck:test, lint, debug:typecheck, test:plugin, test:release). Two earlier
  runs went red and were fixed: code-health ratchets (schema.ts over the 600-line budget, one 205-char line, two dead
  exports) and `arrivalEquivalence` (the new scenario story, re-recorded with `SO_RECORD_ARRIVAL_GOLDEN=1`).
- Storybook (touched `LivingPanel`, `InlineStrip` stories, `RollChips`): `npm run storybook:build`, `http-server .sb-static
  -p 6284`, `test-storybook --url http://127.0.0.1:6284 --maxWorkers 1`: 147 suites, 884 tests passed (new stories
  `Drawer/LivingPanel › SceneTestOnCardAndList`, `Inline/InlineStrip › SceneTestChipIsAuthorOnly`).
- `node scripts/suite/coverage.mjs`: 0 red features; `scene-test` green.

Live (no-model lane 71, `C:\dev\so-live-lanes`, ST copy `C:\dev\st-live`)

- Lane 71 seeded from lane 60's data (no-model, server plugins off), images and sprites off. Branch build staged with
  `node scripts/release/stage.mjs --st-root C:/dev/st-live`, page reloaded; run header `s48-before` served
  `dist/index.js` sha256 `77a37d3e` (final build `3029d1ad`; `e119ccb5` for the `db9bcbec` runs). The shared staged dist was
  replaced by another worktree during both pairs (header after: `1e168729`); the lane page was not reloaded inside a pair
  (identical bundle stack offsets in both runs of each pair) and the scene test exists only on this branch.
- `test/scenarios/v28-48-scene-test.json` PASS ×2 consecutive (`71/2026-10-16T18-44-45-327Z`, `71/2026-10-16T18-45-58-182Z` on the final build; earlier passes on `db9bcbec`:
  `18-23-24-096Z`, `18-24-12-863Z`): opening draws nothing; arriving at
  `liv_1` plans one record (tension seeded to peak, chaos 4, p 5/7), one ring draw; regenerate ×3 keeps it; author chip
  and card row present; player snapshot/page carry no outcome and `assert-player-clean` passes (twice); reopen keeps it
  (`stateEquals`); a swipe of the planning reply withdraws the waiting card ("a rollback…") and the replay plans the
  identical record. Plumbing green; the director pass is started with `rt.living.propose()` (a no-model lane's
  scheduler does not place model jobs). Evidence copied to `C:\dev\so-live-lanes\evidence-2026-10-16\71\`.
- Real-LLM owed: S7–S9, S11 (CL offline replay, director route Sol, ×2) and S10 (living row of the final suite).

Main bundle

- `dist/index.js` 1,286,942 B vs master `d1f9ede2` 1,284,829 B (+2,113 B: the living port check, wiring deps, ring kind,
  validator, sanitizer); the draw, focus, signal text and panel rows ride the lazy living chunk.

Owed and why

- S7, S8, S9, S11 (CL): need a frozen set of 20 synthetic English frontiers × 3 forced outcomes, a replay runner on the
  authoring route (opencode `openai/gpt-6.1-sol` through the harness), and a blind second-model rater pack (honours
  signal, agency flag rate, critic refusal rate, surprising-and-coherent). None exists yet; not built in this pass.
- S10 (CL, RP): read in the living row of the v2.8 final suite with `scene_test` on.

Deviations

- The planning boundary is `state.boundary` when the director job runs (the scheduled job may run a boundary later than
  the boundary that made it due); replay matches because both runs plan at the same boundary.
- The scene check is `sceneAnswerIssues`, called from `checkDirectorOps` through an optional `scene` input (applied
  proposals are not re-checked against the signal at `applyAccepted`).
- No member focus (v1); the expected thread is the newest safe open thread.
- Retention drops records below the snapshot floor; spacing then looks only at retained records (≥ 200 boundaries back).

Unresolved questions

- Should `applyAccepted` re-check the scene answer? Recommended: no, the draft was checked when written and the
  signal is frozen.
- Member focus for interrupts: recommended later, with 49 Phase 3 (needs present-member whereabouts in the director
  inputs).

## Gate record addendum 2026-10-16 (review fixes on `v2.8-features-review-fixes`, not merged)

Fixes for `review-astra-features-code-2026-10-16.md`, one commit and one regression test each, every test red on the
old code (checked by reverting the source files only).

- P1 frozen scene text (`99931d7d`): the draw and focus stay frozen. Before every director request `propose()` checks
  the record's focus and expected thread against the current resting filter (`inputs.scrub`) and the current
  `knownEntities` names (`focusSafe`, `sceneTextsSafe`). Unsafe: the signal line is withheld for that request and the
  journal says `scene signal withheld`; no reroll, no new focus. Test `C5` in
  `runtime/coordinators/livingSceneTest.review.test.ts`: a late held-secret read and a member becoming unknown between
  the first plan and a regenerate, for altered and interrupt, read the assembled director prompt (no frozen text, no
  signal line, record byte-identical, one draw); control keeps the line when privacy did not change.
- P1 cold living rollback (`d03b37ca`): `runRollback` passes its `RunGuard` (minted before any lazy load) to
  `restoreLiving`; `LivingPort.restoreAfterRollback` is async, awaits the chunk, checks the guard after the load and
  hands it to the coordinator, which checks it before each restore write. Rollback awaits the restore before it rebuilds
  injections and persists. Tests `runtime/livingColdRollback.review.test.ts`: delayed import plus a chat switch leaves
  chat B's records untouched (run lapses, noop); same-chat cold restore writes living state before the injection
  rebuild and before persist (persisted records `[]`); warm control.
- P2 compaction (`13faf622`): `compact()` folds ops first, then keeps a scene record when it is at or above the
  floor, when its frontier is still an eligible frontier, when an unfolded op came from a proposal for it (rollback can
  reopen it), or when it is one of the last `min_gap` records (spacing state). Test `C6`: 205 boundaries on one
  unresolved frontier, regenerate keeps the record, one draw, same line; frontiers 207 boundaries apart with
  `min_gap: 2`: the second draws interrupt and applies altered.
- The deviation "Retention drops records below the snapshot floor" above is withdrawn by this fix.
- Follow-up, owner call via coordinator (`7c3e1a66`): the director's open threads (direct and branch passes) drop any
  arc naming a name `unknownEntityNames` returns, with the same word-boundary matcher (`namesAny`). Before, only focus
  candidates were filtered. Test `C7`: with the keeper not met, the prompt's open-thread block keeps "the dark lanterns"
  and drops the keeper's thread (red on the old code); control with the keeper known keeps it. Withholding the whole
  signal line on unsafe frozen text is kept (owner call). gates:quick green.
- S1 (rollback ≡ replay) and S5 (player clean) green in the same file run.
- P2 one-character names: see plan 49 addendum (`23af055d`).
- `npm run gates:quick` green on `13faf622` (13 changed files; lint, related jest 54 suites / 583 tests, typecheck,
  typecheck:test, defect replay 32 of 32 killed).
- Master `4f2b53a2` (plans 42–44) merged in (`f3f6f641`, no conflicts). The merge pushed the coordinator to 567
  effective lines (budget 560): retention and the director disclosure moved into pure lazy helpers
  (`generation/living/sceneTest.ts` `retainSceneTests`, new `generation/living/disclosure.ts`), `7c2f1d0c`. No
  generated file or arrival golden changed.
- `npm run gates -- --jobs=1 --no-storybook` on `7c2f1d0c`: all green in 320.1 s (test 9,355 passed / 1 skipped,
  806 suites; test:replay, build, test:debug, typecheck, typecheck:test, lint, debug:typecheck, test:plugin,
  test:release). Storybook skipped (no component or story touched). Main `dist/index.js` 1,282,975 B.
- Live: no-model offline lane 77 (`C:/dev/so-live-lanes`, data copied from lane 71, images and sprites off), branch
  staged into the private ST copy `C:/dev/st-live-ffix`; served `dist/index.js` sha256 `7f815f180e8b` before and after.
  `st-lanes.mts batch --lanes 77 --repeat 2 --strict test/scenarios/v28-48-scene-test.json`: GREEN ×2 (batch
  `2026-10-17T00-00-35-274Z`, rows under `77/debug/batch/`). Only failed requests are the offline backend's
  `/api/backends/text-completions/props` 500. Plumbing green, real-LLM owed (S7–S11 as before).

## Gate record 2026-10-17: S7–S11 harness (pre-freeze, no model)

Branch `v2.8-prefreeze-48` from `v2.8-prefreeze` `c909b40a`. No ST, no lane, no GPU, no model call. No `src/` change.

Files

- `test/measurements/v2.8/48-scene-test/frontiers.json`: 20 synthetic English frontiers (`so-scene-frontiers/1`, invented
  names, no campaign content). Each is a complete director input: a hybrid living story (2–3 authored anchors,
  `authored_until` = the frontier, `scene_test` on), visited path and blackboard values, canon, 2 open threads, resolved
  threads, cast plans, smoothed tension, player name, scene ids and a planning boundary.
- `test/measurements/v2.8/48-scene-test/frontiers.lock.json`: sha256 of the parsed set (`1f72dddb71cdff5e2d219dc9c26572d48207014a25f8323b73b0e58080c94850…efaf7`, 20 frontiers);
  every command refuses a drifted set (line endings do not matter: the hash is over the parsed JSON).
- `scripts/debug/so-scene-test-replay.mts` (`check | freeze | replay | pack | rate | score`), `lib/sceneReplay.mts`,
  `lib/sceneRate.mts`, `lib/sceneScore.mts`, `lib/sceneReplayEntry.ts` (shipped code through `bundleEntry.loadEntry`).
- Tests `scripts/debug/sceneTestReplay.test.mts`, `scripts/debug/sceneTestScore.test.mts`.

How it measures

- Replay: per frontier × forced outcome (expected, altered, interrupt) the input is built by the shipped
  `livingUnit.directorInput` with a forced scene record, and the shipped `runDirector` runs it unchanged (parse, ops and
  scene check through `checkDirectorOps`, `guardDraft`, critic, one retry). The forced record mirrors `planSceneTest`
  (focus by `focusPick` on the `scene-test:focus` draw, expected = frontier name + newest open thread); a test proves it
  equals `planSceneTest`'s record wherever the natural draw lands on that outcome. Expected outcome = byte-identical to the
  prompt without a signal (test, all 20).
- Route: director and critic on opencode `openai/gpt-6.1-sol` through `askSol` (`opencode run --standalone`, tools off;
  refuses `-fast` and DeepSeek). Deviation: not the harness tool bridge, and `askSol`'s own one-line system prompt; same
  model, same prompts.
- Per draft (`<out>/run<k>/drafts/<frontier>-<outcome>.json`): every raw answer and prompt, per attempt the parse, ops,
  scene-answer, guard and critic refusals with the stage, the `narratesPlayer` detector on name and objective, the changed
  kind (`changed` / `advances`), final status and the delivered anchor (accepted draft, else the last parsed attempt).
  Resumable; `--plumbing` answers with canned drafts and verdicts, marked, never a measurement; modes never mix in one out.
- Packs (seeded shuffle, keys in separate files): blind pack for S8 agency flag and S11 surprising + coherent (name and
  objective only; a leak check refuses arm fields, `changed`/`advances` or the signal text; the same anchor gives the same
  prompt in every arm); honour pack for S7 (shows the signal, as the floor asks). Rater `claude -p` (`askClaude`).
- Scorer, per run, unrounded with counts: S7 honours-and-world-side rate per changed arm ≥ 0.80 (denominator 20,
  undelivered = not honoured); S8 narrated-detector count = 0 over every parsed attempt and agency-flag rate of each changed
  arm ≤ expected + 0.05; S9 critic refusal rate (drafts with ≥ 1 critic refusal) of each changed arm ≤ expected + 0.10, with
  parse, ops, guard, scene-answer and final-refused rates and changed kinds informational; S11 surprising-and-coherent of
  altered and interrupt each ≥ 0.70, expected surprising ≤ 0.30. Insufficient: fewer than 20 drafts in an arm, a delivered
  draft unrated, fewer than 15 rated in an arm, plumbing, or fewer than 2 runs. Exit 0 pass, 1 fail, 2 insufficient.
  Floors informational (rule 9).

Tests (2026-10-17)

- `node --test scripts/debug/sceneTestReplay.test.mts scripts/debug/sceneTestScore.test.mts`: 13 tests, 13 pass (frozen
  hash and drift refusal; all 20 parse and are frontiers; prompt per outcome; forced = shipped record; refusal stages
  parse/ops-scene/guard-narrated/critic; plumbing resume and mode refusal; blind shuffle, leak control, unblind refusal;
  rating retry; scorer at every bar passes, one step past each bar fails only that floor, insufficient cases).
- `npm run debug:typecheck` green, `npm run typecheck` green. ESLint: the repo config parses `src` only (scripts are not in
  its tsconfig project), so the new `.mts` files are covered by `debug:typecheck`, as the other harnesses.
- Plumbing CLI end to end (outside the repo): replay 60/60 ok, pack 60 blind + 40 honour, rate 100, score exit 2
  (insufficient: plumbing).

Real run (owed; in the final suite)

- `node scripts/debug/so-scene-test-replay.mts check`
- `node scripts/debug/so-scene-test-replay.mts replay --out <dir> --run 1`, then `--run 2` (each 60 draws, about 120–240
  Sol calls; rerun the same command to resume)
- `node scripts/debug/so-scene-test-replay.mts pack --out <dir> --run 1` and `--run 2`
- `node scripts/debug/so-scene-test-replay.mts rate --out <dir> --run 1` and `--run 2` (100 `claude -p` calls per run)
- `node scripts/debug/so-scene-test-replay.mts score --out <dir> --runs 1,2 --result <dir>/score.json`
- The set is synthetic, so `<dir>` may be archived under `test/measurements/v2.8/48-scene-test/`.

Still owed: the Sol replay ×2 and the rater run (S7, S8, S9, S11 CL); S10 stays with the living row of the final suite.
- Re-frozen 2026-10-17 by the coordinator after two invented names that also occur in the private campaign were renamed (public repo rule); 20 frontiers, tests 13/13.

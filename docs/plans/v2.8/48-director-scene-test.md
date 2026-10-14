# Plan 48 — Director scene test

**Status: WRITTEN 2026-10-14 (owner decision 2026-10-14: these roleplay mechanics go into v2.8, plans written now).
Not decided, not built.** Pattern G20 of `v2.8/27-gamification-report.md`. Implementation tier D; acceptance CL
(director route) and RP (final suite living row). Overview: `00-overview.md` (this folder).

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
- **Rollback ≡ replay.** The draw is keyed by chat, story, frontier and the boundary the frontier was entered at. A swipe
  past that boundary drops the result. A replay draws the same result. Regenerating an anchor never re-rolls (trap 3).
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

1. **Format.** `living.scene_test?: { chaos: <quality key> | {from: "tension"}, odds?: "default" }`.
   - `chaos` names an authored **code int** quality with display min/max (author-only by construction: `display` on it
     is refused, as for `rel_*`).
   - Or `{from: "tension"}`, where chaos is the level index of the smoothed tension (calm 0 … peak 4), read from
     `tension_current` at the frontier's entry boundary.
   - Validator: the quality exists, is code, is an int, has a bounded range of 1 to 9 steps. Refuse `display`/`public`.
     Unknown keys get a did-you-mean. Absent `scene_test` means off for that story.
2. **Chaos writers.** Authored checkpoint effects that set or add to the quality (through the existing code-write path),
   or the tension mapping. Never a player-refusal counter, never the agency recovery path, never wall-clock.
3. **The draw (pure, `src/generation/living/sceneTest.ts`).**
   - `u1 = unitDraw([chat, story, frontierId, enteredBoundary, "scene-test"])`.
   - `u2 = unitDraw([..., "scene-test:kind"])`.
   - `p = (c − min + 1) / (max − min + 3)`, where `c` is chaos clamped to [min, max]. Unexpected when `u1 < p`. Then
     interrupt when `u2 < 0.4`, else altered. Expected otherwise.
   - The constants are placeholders, recorded as proposed values (§Decisions 3).
4. **Signal.** `DirectorInput.sceneTest?: "expected" | "altered" | "interrupt"` plus, for interrupt, an optional
   `focus` (G21's pick, v2.8 49 §Design 4). The prompt adds one line:
   - Altered: "The next turning point arrives changed: one detail of its place, people or circumstance is not what the
     path led everyone to expect. The world changed it, not the player."
   - Interrupt: "Before the expected turning point, something else happens in the world first[, involving <focus>].
     It is world pressure only."
   - Expected: no line, so the prompt stays byte-identical to today's.
5. **Record.** `extras.living.sceneTests[]` `{frontierId, boundary, chaos, p, outcome, focus?}`. Textless apart from
   `focus` (a member name or an arc that is already open). Capped at 50 and rolled back by boundary like the director's
   ops. The draw is also announced to the author draw ring (`onChanceDraw`, a new kind `scene`).
6. **Surfaces (author only).** An inline author-level chip on the boundary that drew it ("Scene test: interrupt").
   The director suggestion card shows the outcome and the chaos value. A row in Author view's living panel. Player
   projection unchanged.
7. **No reroll.** "Regenerate" on a suggestion card keeps the same outcome. Only a rollback past the entry boundary
   redraws, and then deterministically.

## Predeclared floors

Committed before any run; never retuned (00-overview rule 2).

| # | Condition | Floor | Tier |
|---|---|---|---|
| S1 | Rollback ≡ replay of `sceneTests` and of the director input line | 0 mismatches over 4 seeds × 100 cuts (K1's shape), with a control that keys by `Date.now` and must fail | D |
| S2 | Draw calibration | over 10,000 synthetic keys per chaos step, the unexpected rate is within ±0.02 of `p` and the interrupt share within ±0.02 of 0.4 | D |
| S3 | No reroll | regenerate ×10 on one frontier gives 10 identical outcomes; a swipe past the entry boundary then a replay gives the original outcome | D |
| S4 | Expected = today | with outcome expected, or `scene_test` absent, the director prompt is byte-identical to the current one (golden) | D |
| S5 | Player clean | the player projection and every player surface are byte-identical with and without `scene_test`, at each outcome; `so-ui.mts assert-player-clean` passes with the new selectors | D |
| S6 | Chaos writers | no code path writes the chaos quality from the agency recovery path, the refusal counter or wall-clock (guard test with a planted writer as the control) | D |
| S7 | Director honours the signal | on 20 frozen frontiers × 3 forced outcomes (offline replay, director route recorded), a second model rates "the anchor is altered/interrupted as asked, world-side" ≥ 0.80 for altered and for interrupt | CL |
| S8 | No agency cost | anchors narrating the player stay 0 (guard), and second-model agency flags on altered + interrupt ≤ the expected arm + 1 over the same 60 anchors | CL |
| S9 | No stall cost | critic refusal rate on altered + interrupt ≤ the expected arm + 0.10 | CL |
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
- **Focus is spoiler-safe by construction (v2.8 49 G21):** only members on stage or arcs that are already open (both
  through the resting filter, `livingInputs.ts:32-37`). It never names a hidden arc, an absent member, or a held secret.
  The director prompt's existing "never name or reveal private plans" rule still applies.
- **Unreached anchors:** an altered/interrupt anchor is a generated anchor like any other. v2.8 22's player-copy
  projection and "Save as story" rules apply unchanged.
- **No Adolion content** in fixtures or this plan.

## Dependencies and links

- **v2.8 22** living story director: the only consumer. It builds on its `DirectorInput`, suggestion card and
  `extras.living` rollback.
- **v2.8 49** complications and twists: shares the G21 focus pick (one pure function, owned there).
- **v2.8 17 / v2.7 35:** a scene test that injects into play replies (option B) is a chaos-scaled trigger and waits for
  K1–K5 and an owner decision.
- **v2.8 50** story calendar: an interrupt may be keyed to night or a date later. Not in scope.
- `runtime/chance.ts` / `engine/chance.ts`: the one seeded chance source.
- `v2.8/27-gamification-report.md` G20, G21, T1, T3, T9, T10.

## Decisions for the owner

1. **Build option A (director signal only, author-only)?** **Recommended: yes.** It is on by default for any story that
   declares `living.scene_test` (rule 9). A story without the field is unchanged.
2. **Chaos source:** an authored code quality, `{from: "tension"}`, or both? **Recommended: both.** The tension mapping
   gives living stories a chaos without authoring. An authored quality lets a story raise or lower it through effects.
3. **The probability mapping and the 0.4 interrupt share** are our own placeholders. Keep them as proposed, or set
   other values before S2 is committed? **Recommended: keep as proposed.** They are recorded as placeholder values,
   like `PACE_PULL_AFTER`.
4. **Option B (authored stories get a steering line from the same draw):** **Recommended: not now.** Revisit only
   after SP6 passes (v2.8 17), as a separate decision.
5. **Option C (chaos moved by scene outcomes):** **Recommended: refuse the source-system form.** Chaos moves only by
   authored effects or tension, never by what the player did or refused.

## Unresolved questions

- Should `{from: "tension"}` read the smoothed value at the entry boundary or the raw last level? The proposal is the
  smoothed value, so that one noisy read does not swing the draw.
- Does a branch pass (`liv_b<n>_way`, v2.8 22 divergence) draw its own scene test, or inherit the frontier's? The
  proposal is that it inherits: one draw per frontier entry.
- Does the scene test apply to the living opening (`LIVING_OPENING_ID`)? The proposal is no: the opening is the
  author's premise.

# Plan 49 — Complications and twists

**Status (2026-10-16): only `focusPick` built (`src/pacing/focus.ts`, on `v2.8-director-48-49`, not merged; C4 green), for
v2.8 48. Everything model-facing waits for SP6 (§Gate record 2026-10-16). Was: WRITTEN 2026-10-14, not decided.** Patterns G17, G19 and G21 of `v2.8/27-gamification-report.md`.

- **The model-facing build is gated on SP6, per the existing decision:** the production complication component is
  built only on SP6 PASS (v2.8 17 decisions 1–3, v2.7 35 Phase 3).
- ~~A deterministic half can build now. It has no model input change.~~ **Revised 2026-10-14 (Astra review):** that
  claim was false (a `world_info` switch or a `set` changes what the model receives), and the recommendation is now
  **A: finish SP6 first**. Only the pure focus picker is extracted now, and only if v2.8 48 takes focus (decision 6).
  §Review 2026-10-14 (Astra) records each finding; the shared contract lives in v2.8 52 §Review 2026-10-14 (Astra).

Implementation tier D. Acceptance: RP (SP6 K2–K5 and the model half), CL (read routes during those runs).

## What it is

Three pieces that complete the complication pool v2.8 17 measures:

- **G17. A threshold meter that fires an effect, then resets.**
  - An author declares a bounded int meter that fills from world-side sources, such as escalate boundaries, quiet
    turns or authored effects.
  - When it reaches its threshold, at a boundary, it fires an authored effect (a pool release, a `set`, or a
    `world_info` switch) and drops back to its reset value.
  - It fills from the world, **never from the player refusing a route** (trap 1; v2.7 35 "pressure never fills from
    the player refusing a route").
- **G19. An authored pool with weighted lines and spent-ness derived from the path.**
  - Each pool line may carry a `weight`. The next line is a seeded weighted draw among the unspent lines.
  - "Spent" is derived from the chat's path (the boundary log), plus a small per-chat field rolled back by boundary for
    releases older than the retained log window. That field replaces the spike's in-memory map.
- **G21. The event's focus, drawn from open arcs or present members, spoiler-safe.**
  - A release (or a v2.8 48 interrupt) may name a focus. The focus is a seeded pick among members on stage, and arcs the
    player has already opened (through the resting filter).
  - The pick never names a hidden arc, an absent member or a held secret. It is author-only, apart from what reaches the
    model in the block.

## History and evidence

- `v2.8/27-gamification-report.md` pattern rows:
  - G17: Habitica rage meter; S, R, "author decides", target v2.7 35 Ph3.
  - G19: OPSE, dice-roller tables, solo-toolkit; D, R, author-only, target v2.7 35 Ph3.
  - G21: Mythic; D, R, "spoiler risk (names hidden arcs)", target v2.7 35 Ph3 and v2.8 22.
  - Candidate rows: "Ph3: G17 …, G19 weighted lines, G21 focus pick. Later trigger variants (after K1–K5 pass)".
  - Traps T1, T3, T8 and T9. Licence notes, trap 10: OPSE CC BY-SA 4.0, Mythic CC-BY-NC, Habitica CC-BY-NC-SA 3.0.
    Mechanics only; nothing copied.
- `v2.8/17-sp6-complication-pool.md`:
  - K1–K5 bars, verbatim from v2.5.
  - K1 PASS in jest (0 of 400). K2 FAIL ×2 on a lifecycle defect fixed in `76d93f02`, never re-measured live. K3/K4
    INCOMPLETE; K5 not run.
  - Decisions 1–3: measure; build on PASS; drop on FAIL or INCOMPLETE ×2. Decision 4: no player copy.
  - Open question: whether a reopened chat with a truncated log re-releases a spent line.
- `v2.7/35-world-pressure-and-open-stretches.md`:
  - Phase 1 = SP6, owed. Phase 3 = the production component, only on Phase 1 PASS. Phase 4 = pressure in open
    stretches, after Phase 3.
  - §Adopted from the gamification harvest puts G17/G19/G21 in Phase 3, and odds or chaos triggers after K1–K5.
  - Stage B record (2026-10-07): K5's pooling rule fixed in `scripts/debug/lib/sp6Score.mts` before any run. Phase 3
    and 4 not built. The validator refuses `stretch.pressure` and `stretch.trigger`.
  - The FAIL branch lists what is refused afterwards (`:58-66`).
- `v2.8/19-open-stretches.md` §Gate record 2026-10-13 (`254a92f2`, `2907b686`):
  - Built: the encounter pool (`stretch.offer: ["encounters"]`, 3–5 generated encounters, contract 3), `pacing/quiet.ts`
    and open anchor openings.
  - "Quiet gates the encounter menu, not complications." `pressure`/`trigger` stay refused.
  - Not built: engagement latching and pool spent-ness (`:484-485`, `:532`).
- 32 queue row R12: "SP6 complication pool; stays in v2.8 (owner 2026-10-14)".
- **The SP6 measurement is owed and needs RP (Artemis on the pod, or the 3090 under the local-model rule) plus CL reads.
  Until it lands, open-stretch `pressure` and `trigger` stay refused** (`engine/validate/stretch.ts:10,31`), and so does
  every new release trigger this plan adds.

## Current state in code

Verified on master `211d8d96`.

- **The SP6 spike is live by default in the one build.** Two older docs are stale here:
  - v2.8 17 still says it is loaded "by `if (__SO_DEV__)`". It is not.
  - `src/runtime/index.ts:106-113` imports and installs `spikes/install` unconditionally.
    `getGlobalSettings().spikes.sp6Complications` (`:73`) decides.
  - Spike flags are on unless literally `false` (`src/runtime/settingsModel.ts:105-115`; `spikeFlags.test.ts:5`).
  - The guide says so: "behind their own default-on spike switch" (`docs/authoring/story-guide.md:302`).
  - So a story that authors `complications` gets the spike's block today. It is unregistered,
    `story_orchestrator_complication` at depth 5, the ledger's depth (`src/runtime/spikes/sp6Complications.ts:7-8`).
- **Spike logic:**
  - `readComplicationPools` reads the raw record (`:44`).
  - `deriveReleases` walks the boundary log with an in-memory `spent` map (`:69`).
  - `pendingRelease` (`:107`); `composeComplication` adds the agency clause (`:114`).
  - The seam sets and clears the block (`:130`).
  - Release order is "next unused line": no weights, no focus, no meter.
- **Install and debug:** `src/runtime/spikes/install.ts:61-73`; the debug view `complicationView` (`:44-56`).
- **Refusals:**
  - `stretch.pressure` / `stretch.trigger`: "not built yet: it needs the production complication pool"
    (`src/engine/validate/stretch.ts:10,31`).
  - A widget clock on releases: refused (`src/engine/validate/widgets.ts:49`).
- **Encounter pool (on):**
  - `src/generation/encounters.ts` (155 lines): prompt, critic, parse, pool checks.
  - The offer line: `src/pacing/steering.ts:79` `encounterOfferLine`, appended by
    `src/runtime/coordinators/pacingCoordinator.ts:143-148` only while `quietRead` holds (`src/pacing/quiet.ts:43`).
- **Seeded chance:** `src/engine/chance.ts:33` `unitDraw`, `:23-31` `seededStream`; `src/runtime/chance.ts` (draw ring
  `onChanceDraw`). No `Math.random` on any story path (trap 3).
- **Open arcs for focus:** `src/runtime/livingInputs.ts:32-37` (`shown` = resting-filtered `getOpenArcs()`).
- **Not present:** no `weight` on pool lines, no meter, no focus, no `src/pacing/complications.ts`, no registered
  complication injection.

## Options

| | Design | Cost | Risk | Needs |
|---|---|---|---|---|
| **A. Wait for SP6, build all of it in Phase 3** | Nothing now. On PASS, Phase 3 builds the component with G17/G19/G21 | 0 now; L later | Phase 3 lands as one large change | SP6 PASS |
| **B. Deterministic half now, model half on SP6 PASS** (rejected as scoped, 2026-10-14) | Now: typed format, pure `pacing/complications.ts` (release rule, meter, weighted pick, spent-ness, focus), author-only shadow read model, meter effects limited to `set`/`world_info`. The spike stays byte-identical. On PASS: Phase 3 swaps the spike for the pure module and adds the registered injection, the meter-as-trigger and the focus line | M now; M later | A pure module unused by play could drift from the spike. Mitigated by C5 (both answer the same release boundaries on the spike's own cases) | D now; SP6 for the rest |
| **C. B, and switch the spike to weighted/focus now** | Change what the live spike releases before SP6 runs | S | **Moves the SP6 measurement's conditions** (K3–K5 lab data assumes next-unused order). Refused | — |
| **D. Drop G17/G19/G21** | Keep v2.8 17's plain pool only | 0 | Loses the authoring value the harvest rated 4/5 | — |

## Recommendation

**A (revised 2026-10-14).** Finish SP6 (v2.8 17) first. Build now only `focusPick`, as a pure module
(`src/pacing/focus.ts`), and only if v2.8 48 takes an interrupt focus (decision 6). The rest of the design below is
kept as the **Phase 3 content** to build on SP6 PASS, amended by §Review: the release counting unit is the player
turn, the streak phase is rolled-back state, and focus safety is tested by forbidden information. The meter is built
only for a concrete authored use case, and then with its own state, origin and replay (§Review P1). There is no
author shadow panel and no pool field the build cannot honour.

### Phase 3 design (was "Build now"; builds on SP6 PASS; it does change model input)

1. **Format** (game-layer lazy chunk, beside `validate/stretch.ts`).
   - `checkpoints[].complications: Array<string | {id, text, weight?, focus?: "arcs" | "members" | "any"}>`.
   - `complication_after` (int ≥ 1, default 3), as v2.8 17 Step 2.
   - New `checkpoints[].meter?: {quality, threshold, reset?, fills: [{from: "escalate" | "quiet" | "effect", add}],
     fires: {set?, world_info?, release?: true}}`. `quality` is a code int with a bounded range.
   - Validator rules:
     - `weight` is a positive int (default 1).
     - The threshold sits inside the range; `reset` (default min) is below the threshold.
     - `fills` is never a refusal or agency source. `from` is a closed enum and an unknown value is refused.
     - `fires.release` is refused with "needs the production complication pool" until Phase 3, the same wording as
       `pressure`.
     - `display` on the meter quality is refused while a pool binds it (trap 9).
     - The diagnostics carry consequence lines (`DIAGNOSTIC_CONSEQUENCES`).
2. **Pure core, `src/pacing/complications.ts`.**
   - `deriveReleases` (the escalate rule, ported with the same answers as the spike).
   - `meterStep(view, decl)`: fill, fire and reset at a boundary. Code writes go through the derive seam, so the meter
     rolls back with the blackboard, like agenda steps.
   - `weightedPick(unspent, unitDraw([chat, story, checkpointId, enteredBoundary, "complication", releaseIndex]))`.
   - `spentFromPath(log, field)`.
   - `focusPick(candidates, unitDraw([..., "focus"]))`.
   - Candidates are members present this boundary (`whereabouts`, enabled and not away), and arcs from the resting
     view whose named entities are all known to the player (v2.8 52 `knownEntities`, SC3). A known member who holds a
     secret **may** be picked; what is excluded is forbidden information (secret content, a hidden arc's text, the
     name of someone the player has not met), tested as such (C4).
   - **Counting unit: the player turn.** One escalate count per player turn (`playerTurnIds`, as the spike does with
     turn ids, `src/runtime/spikes/sp6Complications.ts:66-67`), never per boundary, so group size and Continue do not
     speed pressure.
3. **Spent-ness and phase as rolled-back state.** Spent lines, the escalate streak, the last counted turn and the
   release sequence are reserved code keys written in the derive step (SC2 step 3): `cmp_<cp>_spent_<line>` (boundary),
   `cmp_streak`, `cmp_turn`, `cmp_seq`. They roll back with the blackboard (rollback detector registry, SC1) and a
   reopen with a truncated log resumes the exact phase. This answers v2.8 17's reopen question for timing too, not
   only duplicates.
4. **Author read model** on the production coordinator only (no shadow panel beside the spike): remaining lines,
   weights, meter value, last release and its focus.
5. **Meter effects, only with a concrete authored use case.** `fires.world_info` changes the lore the model gets, so it
   is model input. It needs: an occurrence latch `cmp_meter_<id>_fired_<n>` (rolled back, SC1); `EarnedEffects.kind`
   gains `"meter"` (today `"quest" | "agenda"`, `src/runtime/effectsApplier.ts:83-88`); `earnedWorldInfo`
   (`src/runtime/worldInfoGates.ts:50-51`, agendas only) replays meter switches from the latches. `fires.set` waits for
   a general state-write facility (none exists; v2.8 50's entry pass is time-only).
6. **The spike stays untouched until SP6 runs.** Its block, order and boundaries stay byte-identical (floor C5).

### On SP6 PASS (v2.7 35 Phase 3, the model half)

The design is carried from v2.8 17 Step 2, plus:

- Swap the spike seam for `pacingCoordinator` over the pure core.
- Register the injection at a justified depth (5 is the ledger's).
- `trigger` enum: `escalate` (default) | `meter`.
- `fires.release` allowed.
- Weighted pick and focus live.
- The block gains one focus line: "It involves <member or open arc>."
- Phase 4 (`trigger: "quiet"`, `stretch.pressure`) follows as v2.7 35 says.

### On SP6 FAIL or INCOMPLETE ×2

v2.8 17 decision 3 predates 00-overview rule 9 (every built feature on; only the owner switches one off). Revised: a
FAIL is recorded and **goes to the owner**; nothing is dropped automatically. Phase 3 is not built on a FAIL unless the
owner says so. `focusPick` stays (v2.8 48 may use it). No pool field is added that the build cannot honour.

## Predeclared floors

Committed before any run; never retuned (00-overview rule 2).

| # | Condition | Floor | Tier |
|---|---|---|---|
| C1 | Meter determinism | fires at exactly the first boundary where value ≥ threshold, resets in that boundary; rollback ≡ replay 0 mismatches over 4 seeds × 100 cuts (swipes, deletes, reopen) | D |
| C2 | Weighted pick | over 10,000 synthetic keys per pool, each line's share within ±0.02 of `weight / Σweights` of unspent lines | D |
| C3 | Spent-ness and phase | 0 re-releases of a spent line and identical release boundaries over the property run, **including reopen with a boundary log truncated past the release and mid-streak** (control: the in-memory map re-releases, and a zeroed streak shifts the next release) | D |
| C4 | Focus is spoiler-safe by information | over 10,000 draws, the composed focus line contains 0 planted forbidden strings (held-secret content, a hidden arc's text, an unmet person's name); a known member who holds a secret is a legal pick and is picked at its share; control with the filter off emits each forbidden string | D |
| C5 | Spike unchanged | the spike's release boundaries, block text and K2 dry-run payload are byte-identical until SP6 runs (golden over `sp6Complications.test.ts` cases and `live-v25-09-sp6-k2.json` dry run); the pure core answers the same release boundaries on the same cases | D |
| C6 | No refusal-driven pressure | no `fills.from` reads the agency recovery, refusal counter or wall-clock (guard test with a planted source as control) | D |
| C7 | Player clean | player surfaces byte-identical with and without pools, meters and focus; `assert-player-clean` passes | D |
| C8 | SP6 itself | K1–K5 as v2.8 17 §Floor and v2.7 35 Stage B (verbatim; K5 pooled per arm) | RP + CL |
| C9 | Production parity (Phase 3) | K2–K5 ×2 on the production path with weights and focus on (they change the distribution K3–K5 measure); C1–C3 re-run on the coordinator path | RP, D |
| C11 | Counting unit | a group round with 3 members and a Continue counts one escalate turn (property over round shapes) | D |
| C10 | Focus lands (Phase 3) | over ≥ 20 focused releases, a second model rates "the reply engages the named focus, world-side" ≥ 0.60; K3 agency flags ≤ unfocused control + 1; K4 0 verbatim restatements | RP |

Synthetic English fixtures for C1–C7. Adolion-derived rows are rated by a second model, never by the owner (rule 11).

## Gates by tier

- **D, now (only if decision 6 extracts `focusPick`):** `npm run gates` with C4 on the pure picker; no registry row
  (no feature of its own).
- **D, Phase 3 (on SP6 PASS):**
  - `npm run gates`: validator tests, the property tests C1–C4, C6 and C11, the golden C5, Storybook for the author
    read model.
  - `architecture.test.ts`: pacing stays pure; the coordinator budget is 560.
  - `typedResults.test.ts` for any stHost write; `ownership.guard.test.ts` for the meter-effect writer (a `RunToken`
    before each write).
  - A no-LLM group scenario: releases across a group round and a Continue (one count), a swipe mid-streak, a reopen
    with a truncated log (same next release). With a meter use case: it fires a `world_info` switch, a swipe undoes
    it, a reopen keeps it. Run ×2 on a no-model lane.
  - Registry: feature `complications` under the pacing group, and Help.
  - Guide: §Experimental effects gains weights, focus and (with its use case) the meter; then `npm run docs:guide`
    and `npm run docs:settings`.
- **RP + CL (acceptance):** C8 on the pod or the 3090, run header diff, `--strict`, records to `so-sessions`. On PASS,
  Phase 3: C9, C10, `npm run gates`, registry row, `so-ui assert-player-clean`, the bundle from a named build
  (`scripts/release/buildChecks.mjs`).

## Privacy and spoiler notes

- **Odds are spoilers (trap 9).** Weights, the meter value and threshold, pool remaining counts, "would release next"
  and the focus are author-only. No player widget binds the meter (`display` refused while it feeds a pool). A `clock`
  on releases stays refused (`validate/widgets.ts:49`).
- v2.8 17 decision 4: no player copy for a released complication.
- **Focus:** candidates come only from on-stage members and open arcs through the resting filter. A held secret's
  subject is never named by a shared block (architecture §Memory and privacy). The focus line is shared model input, so
  it is held to the same rule as every shared tier.
- Pool text is authored. Agency diagnostics flag a line that narrates the player's action.
- No Adolion content here. The campaign's pools are lab data in the private repo.

## Dependencies and links

- **v2.8 17** (SP6 measurement) → **v2.7 35 Phase 3** (production) → **Phase 4** (pressure). This plan's model half is
  Phase 3's G17/G19/G21 rows.
- **v2.8 19** open stretches: the encounter pool and `quietRead`. A `fills.from: "quiet"` reuses `quietRead`; the
  encounter pool's spent-ness may reuse `spentFromPath` (§Decisions 4).
- **v2.8 48** director scene test: an interrupt reuses `focusPick`.
- **v2.8 50** story calendar: a meter may later fill per story day. Not in scope.
- **v2.7 36** quests: a deadline or "doom counter" reads the release read model and adds no pool (v2.7 35 §Interaction).
- **v2.7 37** agendas: an agenda event is not a complication.

## Decisions for the owner

1. **Option A: finish SP6 first, Phase 3 on PASS?** **Recommended: yes** (revised 2026-10-14; B as scoped rejected).
2. **Leave the live SP6 spike exactly as it is until SP6 runs** (on by default under rule 9, unregistered block,
   next-unused order)? **Recommended: yes.** Changing it would move the measurement's conditions (option C refused).
3. **Meter effects before SP6?** **Recommended: no** (revised). A meter is built for a concrete authored use case,
   with occurrence latches, a `meter` earned origin and replay; `fires.set` waits for a state-write facility.
4. **Encounter pool spent-ness:** reuse `spentFromPath` so a stretch's menu drops encounters the chat already engaged?
   **Recommended: yes, as a follow-up row.** Engagement detection (latching) stays out: it needs a model read with its
   own floor.
5. **Who runs SP6:** the pod (Artemis on the RTX PRO 4500, budget per v2.8 24), or the 3090 locally while the owner is
   not playing (RunPod is not used for the rest of October 2026, `.claude/rules/gotchas.md` §Model, backend)? **Recommended: the 3090 lane run,** route
   recorded. The K-bars are model-agnostic, as v2.5 wrote them.
6. **Extract `focusPick` now?** **Recommended: only if v2.8 48 takes interrupt focus** (48 decision 6); otherwise it
   arrives with Phase 3.
7. **SP6 FAIL handling under rule 9:** record and ask the owner, no automatic drop? **Recommended: yes.**

## Unresolved questions

- `fills.from: "escalate"` counts consecutive escalate boundaries, as the spike does. Does the meter count every
  escalate boundary instead (a slow fill)? The proposal is every boundary, with `add` per boundary, so that the meter
  is distinct from the spike's streak rule.
- Is the focus picked once per release, or re-picked on a rollback that keeps the release? The proposal is once: it is
  keyed by the release boundary, so a replay gives the same focus.
- If K5 passes but K3 fails, is the drop branch total, or may the meter's deterministic effects stay? The proposal is
  that they stay: they add no model input.

## Review 2026-10-14 (Astra)

Source: `review-astra-2026-10-14.md` §Plans 48-53 ("49: reject B as currently scoped"), checked on master `3a716f2b`.
Shared findings resolve through v2.8 52 §Review 2026-10-14 (Astra): SC1 (the phase and spent keys and meter latches
get detectors), SC2 (all complication writes are step 3), SC3 (focus candidates through `knownEntities`).

- **P1 The first phase changes model input indirectly.** Verified: `world_info` switches change supplied lore;
  `EarnedEffects.kind` is `"quest" | "agenda"` (`src/runtime/effectsApplier.ts:83-88`) and `applyEarnedEffects`
  (`:339-353`) has no `set`; `earnedWorldInfo` replays agendas only (`src/runtime/worldInfoGates.ts:50-51`). → Claim
  withdrawn; recommendation is A; the meter needs occurrence state, a `meter` origin and replay and is built only for
  a concrete authored use (decision 3).
- **P1 Persisting spent ids does not preserve release timing.** Verified: `deriveReleases` restarts `streak` and
  `closedTurn` at the log's start (`src/runtime/spikes/sp6Complications.ts:69-104`); the `spent` map only prevents
  duplicates (`:74-76`) and is in-memory by default (`:130`). → Streak, last counted turn and release sequence become
  rolled-back code keys; C3 adds a mid-streak truncated reopen.
- **P1 Focus safety is overstated.** Verified: presence filtering only drops away members
  (`src/runtime/whereabouts.ts:7-10`); open threads pass the resting filter (`src/runtime/livingInputs.ts:37`), which
  strips recognised secret content, not names, and does not prove the player opened the arc. → No "player-opened"
  claim; candidates through `knownEntities`; C4 tests forbidden information and allows a known secret-holder.
- **P2 Boundary counting can amplify group size.** Verified: the spike dedups by player turn only when turn ids are
  supplied (`:66-67`, else `entry.boundary`). → The counting unit is the player turn, always; C11.
- **P2 SP6 success does not validate weighted/focused behaviour; drop branch vs rule 9.** Accepted. → C9 re-runs
  K2–K5 with weights and focus; the automatic drop is replaced by "record, owner decides" (decision 7).
- **Cheaper design** (pure focus picker only if 48 needs it; finish SP6; meters only for a concrete use; no shadow UI,
  no unsupported pool fields). Adopted.
- **Brainstorm: complications with several viable responses, including leaving them alone; exhaustion produces quiet,
  not mandatory trouble.** Phase 3 guide rule: a pool line states a world change, never a demand, and an exhausted
  pool releases nothing (`next` absent already returns no release, `:99-100`); the guide's Good example shows a line
  the player can ignore without penalty.

## Harvest 2026-10-14 addendum

From `docs/plans/v2.8/61-harvest-triage-2026-10-14.md`. Ideas only (source licences: AGPL/GPL/none unless noted). First verified against master `9e96871d`; revised 2026-10-16 on `e8b9dd6d` after `review-astra-harvest-2026-10-16.md`. The owner decides with the rest of this plan.

- **H16f chance-ramp pressure trigger** (`docs/plans/v2.8/extension-research-2026-10-14/filigree.md` P1, 3/M). (Relabelled from H16d to match plan 61.) G17 fires at a
  deterministic meter threshold. Their variant raises a per-boundary chance as pressure builds (seeded, so rollback ≡ replay
  holds through `src/runtime/chance.ts`). Recommended: a `trigger: { ramp: { from, to, per } }` variant of G17 behind the same
  SP6 gate, only if the SP6 run shows threshold firing feels mechanical; no player copy (decision 4 stands). Floor: seeded
  replay identical over 4 seeds, D.

## Review 2026-10-16 (Astra)

Source: `review-astra-harvest-2026-10-16.md` §Addenda requiring correction. Verified on `e8b9dd6d`.

- No finding on this addendum. Label drift found while revising: the addendum used H16d; plan 61 calls this H16f. →
  relabelled.
- Rebutted: none.

## Gate record 2026-10-16 (focusPick only, on `v2.8-director-48-49`, not merged)

Recommendation A held: SP6 has not run, so nothing model-facing is built. Decision 6 applies (v2.8 48 takes interrupt
focus), so only the pure picker is extracted. Commits `db9bcbec`, `6eb51188` and this record.

Built

- `src/pacing/focus.ts`: `focusCandidates({arcs, members?, unknownNames, resting?})` (resting filter applied, an arc or
  member whose text names a `knownEntities`-unknown person or place dropped by word boundary, duplicates dropped) and
  `focusPick(candidates, unit)` (equal share, `null` on an empty list). No registry row (no feature of its own), as the
  plan says. `unknownEntityNames(story, known)` added to `engine/codex.ts` for the caller.
- The only caller is 48's scene test (arcs only, no member focus in v1). The SP6 spike
  (`runtime/spikes/sp6Complications.ts`) is untouched: C5 holds by construction (no file of the spike changed).

Floors

- C4 (D): 10,000 draws through the director's real inputs (`livingInputs` with its resting filter → `focusCandidates`
  → 48's signal line): 0 lines with planted held-secret content, hidden-arc text or an unmet person's name; the known
  secret-holder's arc is picked at its share (±0.02 of 0.5); control with the filters off emits all three
  (`runtime/coordinators/livingSceneTest.review.test.ts`). Pure picker shares over 10,000 draws within ±0.02
  (`pacing/focus.test.ts`).
- C1–C3, C5–C11: not applicable until Phase 3.

Gates: see plan 48 §Gate record 2026-10-16 (one branch, one run).

What SP6 must deliver before anything else here is built

- v2.8 17 K2 re-measured live after `76d93f02`, K3/K4 completed and K5 run (pooled per arm, `scripts/debug/lib/sp6Score.mts`),
  ×2, on Artemis (3090 lane while the owner is not playing, or the pod), CL reads recorded, run header diff, records to
  `so-sessions`. RP is owed and was not runnable here (no GPU this pass).
- On PASS (owner reads it): Phase 3 builds the typed `complications` format (weights, `focus`), `pacing/complications.ts`
  (release rule ported with C5 parity, player-turn counting unit C11, spent-ness and phase as code keys `cmp_*` with a
  `ROLLBACK_DETECTORS` entry and a code-only rollback seed, C1–C3), the registered injection and the focus line; C9 re-runs
  K2–K5 with weights and focus on. The meter (G17) waits for a concrete authored use case plus an occurrence latch, a
  `meter` earned origin and replay (decision 3); `fires.set` waits for a state-write facility.
- On FAIL or INCOMPLETE ×2: recorded and taken to the owner (decision 7); `focusPick` stays for 48.
- H16f ramp variant: same SP6 gate; only if the run shows threshold firing feels mechanical.

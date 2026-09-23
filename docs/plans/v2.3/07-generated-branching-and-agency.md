# Plan 07 — Generated branching and player agency

**Kind:** fix (R9) + enhancement (agency policy).
**Roadmap package:** 5; integration review recommendation 4.
**Closes:** R9, C4; stale/failed expansion recovery. **Revised 2026-09-20** per
`review-astra-2026-09-20.md` (edit 7): `two-ways-across` has no stub and cannot show R9.

## Objective

Spec v2 (line 111) says a generated beat's possible outcomes "become multiple outgoing gates, so
generated beats branch". Merge keeps the first outcome only, so a player who takes the omitted
route stalls or is steered back. Separately, pacing steering ("force a confrontation"),
look-ahead pre-generation and the first-outcome bias compose into narration that pulls play
toward its prepared route with no authored way to say which objectives are world pressure and
which need the player's own act. This plan finishes the branching promise and gives authors a
small, explicit agency policy.

## Context

- **R9** `src/generation/merge.ts:35` (chain sum) and `:38` (`const outcome = beat.outcomes[0]`)
  build one transition; `:66` collects scope from every outcome, so the parser and the scope agree
  with the spec and merge does not. `revalidate.ts:6` and `critic.ts:38` also read `[0]`.
  Reproduced: a validated two-outcome response yields one transition; the single-outcome control
  keeps its one.
- **C4** `src/pacing/steering.ts:19–28` escalation text; `expansionCoordinator` `headingTo` from
  the scene look-ahead; the critic scores chain quality, not whether guidance preserves a declared
  refusal. The player surface (`narrative.ts`) explains location/objective/threads, not which parts
  are constraints on the world versus suggestions to narration.
- Expansion status: `expansionCoordinator` exposes stale/failed cache, regeneration is manual and
  undocumented for players (review coverage row).
- Independent fixture: `two-ways-across.story.json` (review) **authors** two routes to one
  anchor (four authored transitions, no stub, no expansion); its two live scenarios
  (`live-two-ways-bridge`, `live-two-ways-ferry`) were never run and are in `test/scenarios/`
  since plan 01. Both routes pass today with `outcomes[0]` unchanged, so they are the authored
  regression, not the R9 proof.

## Scope

In: outcome identity and per-outcome transitions; per-path validation; explicit cache states;
the `agency` field and its consumers; a player-visible neutral line for unclassifiable actions.

Non-goals: replacing the critic with constrained generation; hierarchical/parallel states (the
review's own recommendation is to keep the graph).

## Deliverables

### Every outcome is a gate (R9)

- `GeneratedOutcome.id` (stable: `<beatId>:<index>` at parse, preserved through the cache).
- `mergeExpansions` emits one transition per outcome with priority = declaration order and a
  deterministic tie rule (declaration order, then id); progress increments are per outcome, and
  the chain sum used by the convergence check is the **minimum** over paths so no path can starve
  the anchor.
- `critic.ts` and `revalidate.ts` validate every outcome: latch guard, source authority (plan 02),
  reachability of the anchor from each path. A beat with any invalid outcome is `needs-review`,
  never partially inserted.
- Cache states are explicit: `draft | rejected | needs-review | validated | inserted | stale`.
  `validated` is the state between a passed critic and the boundary that inserts (the review
  noted the list jumped from review states to inserted); a boundary inserts only `validated`
  beats. Stale or failed regeneration is visible in the author view with a regenerate action,
  and the player pipeline says "preparing the road ahead" only while a draft is in flight.
- Contract upgrade invalidates existing caches; a played (inserted) graph is never mutated
  invisibly — re-generation inserts only unvisited beats.

### Agency policy (C4)

Format 2, optional, per checkpoint:

```
agency: {
  protect_player_choice: bool        // never narrate the player accepting what they refused
  never_narrate_player_action: bool  // the player's own acts are theirs to write
  objective_kind: "world_pressure" | "player_action"
}
```

**Defaults when absent: `{protect_player_choice: true, never_narrate_player_action: true,
objective_kind: "world_pressure"}`.** This is a deliberate behaviour change for every story that
does not declare the field — steering text and generation prompts stop phrasing escalation as the
player's compliance — not "absent = today". The addendum row says so; an author who wants the old
phrasing sets the booleans false.

Consumers, with **precedence** tested: the agency policy overrides pacing steering text
(escalation is phrased as world pressure, never as compliance) and the look-ahead's `headingTo`
(a scene look-ahead never narrates the player arriving where they refused to go); the generation
prompt and the critic (a beat whose guidance narrates the player's action is `needs-review`); the
driver preview (author view shows the policy in effect).

**Recovery when the player refuses the prepared route** (the review's C4 asked for a choice, not
a waiting sentence): when extraction cannot classify the player's action against the current
checkpoint's exits for two boundaries, the runtime (a) keeps the outcome quality unset, (b) shows
the player the neutral line "the story is deciding how the world answers that", and (c) offers the
**author** a recovery in the author view: an authored alternate if the checkpoint declares one
(`agency.alternate: <checkpointId>`, optional), otherwise a one-shot generated alternate beat
(`draft` → review) or a nudge. The player is never railroaded into the prepared exit and the
author is never left without a move.

### Fixtures

- **`test/fixtures/generated-fork.story.json`**: one stub whose recorded expansion
  (`test/goldens/generation/generated-fork.*.json`) has two outcomes, so `outcomes[1]` exists to
  be lost. Live scenarios `live-generated-fork-a.json` / `-b.json` generate with the real model
  and play each route; a recorded-golden variant proves the merge deterministically.
- Multi-outcome generation goldens (2 and 3 outcomes, one invalid).
- Refusal fixtures: the prepared route expects accepting a duel; the player refuses and negotiates.
  Expected: no narration of compliance, world consequence preserved, outcome unset, the
  author-side recovery present (authored alternate, generated alternate, or nudge).
- Precedence fixtures: policy on/off × steering escalation × look-ahead `headingTo`.

## Verification

- **Story and recipe:** `live-gate-playbook.md` §Plan 07 — `generated-fork` for R9 (positive
  activation: a two-outcome beat `inserted` before either route is played); `two-ways-across` as
  the authored regression; **adventurer at `the-lord-spirit`** in a branch chat for agency: refuse
  both destroy and appease, and assert an honest stall (no narrated compliance, `spirit_outcome`
  unset, the recovery offered) — its only exit accepts `destroyed | appeased`, so advancing is not
  the expectation.
- Ledger row R9 flips to `it`; new merge/critic/revalidate tests; the precedence fixtures; the
  convergence property suite extended to every path of every generated beat (≥ 1000 cases).
- `npm run typecheck && npm run typecheck:test && npm run lint && npm test && npm run build`.
- Live, real LLM (+ judge critic on and off), headed: `live-plan05-expansion` and
  `live-plan06-convergence` twice; `live-generated-fork-a/b` twice each (both routes reach the
  anchor); `live-two-ways-bridge` and `live-two-ways-ferry` twice each (authored regression,
  sandbox, `setup.extraction {profile: "inherit"}`); J7 once (all anchors, prose sane after plan
  06); the refusal scenario with a real model, asserting the reply never narrates the player's
  compliance (a throwing semantic check + the human "railroading" rubric in plan 11) and the
  recovery is present in the author view; J11.25 twice with variants = 2 (pick `code` and `llm`).

## Persona tags

| Element | Tag |
|---|---|
| Cache states, regenerate, policy-in-effect | `author` |
| "preparing the road ahead", neutral recovery line | `both` |
| Studio `agency` editor | `author` |

## Delegated decisions

- Whether `objective_kind` also gates the away recap's phrasing (proposed: yes, same source).

## Unresolved questions

- Does the LLM `pick` mode (plan 07 of v2.2) need to see outcome ids to choose consistently, or
  does it pick chains only? Proposed: chains only; outcomes are validated by code.

## Gate record — slice 1: R9, every outcome is a route; slice 2: the agency policy and the honest refusal (2026-09-22)

**Status: machine gates green, live gate NOT green.** The live half could not run: the pod
`x7n60bk2anymnk` (`llm-pod-4500`, **$0.72/hr**, IDLE 30) is `EXITED`, its start was refused by
capacity and then by the session's tool-permission classifier, and `create-pod` was refused the same
way (see the plan-06 Gate record for the same blocker). **No mock was substituted.** Every check
below is one that does not need a model, plus two deliberate, separately-marked gaps.

Local gates on this tree: `npm run typecheck`, `npm run typecheck:test`, `npm run lint`,
`npm run debug:typecheck` — clean. `npm test` **141 suites / 2401 tests**, `npm run test:debug`
**96**, `npm run build` (2 asset-size warnings), `npm run test-storybook:ci` **30 suites / 151 tests**.

| Deliverable | Evidence |
|---|---|
| R9: every outcome is a gate | `parse.ts` stamps `GeneratedBeat.id` (its index) and `GeneratedOutcome.id` (`<beatId>:<outcomeIndex>`); `merge.ts` emits **one transition per outcome**, priority = declaration order **descending**, because `outgoingByCheckpoint` is sorted by priority descending and `selectFiring` takes the first match (`src/engine/validate.ts:698`, `transitions.ts:5`) — ascending priorities would have reversed declaration order, which the first version of this change did. Fixed and asserted |
| R9: no route starves the anchor | the anchor-entry threshold is the **minimum over routes**: `min` of each beat's outcome amounts, summed. `runCodeChecks` computes `progressTotal` the same way and checks **every** route bridges (`src/generation/paths.ts`, `outcomePaths`, deduped and capped at 256) |
| R9: contract test | `src/generation/fork.review.test.ts` (7) and `src/generation/fork.property.test.ts` (**400 seeded chains, >1000 routes**, every route asserted to reach the threshold). Fixture `test/fixtures/generated-fork.story.json` + goldens `test/goldens/generation/generated-fork.{2,3,invalid}.response.txt` |
| R9 ledger row | **R9 flipped to `closed`** in `test/findings/ledger.json`, with a note naming the fix. The ledger itself demanded the flip: `merge.review.test.ts`'s contract test started passing (4 open findings remain: C4, F2, F3, F4) |
| Cache contract | `EXPANSION_CONTRACT = 2`; `sanitizeExpansion` **drops** any entry whose `contract` differs, because a chain read under `outcomes[0]` has no outcome ids and would keep the single-route behaviour R9 removed. Test in `src/runtime/extrasLegacy.test.ts` |
| `validated` state | `ExpansionStatus` gained `validated`; `generate` sets it when the critic passes, and boundary work `expansion-commit` (order 42, before `scene-detect`) promotes it to `inserted`. `mergeExpansions` includes `validated` so a passing chain is playable before its boundary |
| Regenerate an action | `ExpansionCoordinator.regenerate(key)` + `[data-so="expansion-regenerate"]` on a `stale`/`failed` entry in the author view (manager surface: `manager.expansions.{commitValidated,regenerate}`) |
| Agency policy (C4) | `Checkpoint.agency` (`protect_player_choice`, `never_narrate_player_action`, `objective_kind`, `alternate`) with `DEFAULT_AGENCY` = `{true, true, "world_pressure"}` (`src/engine/agency.ts`). Normalized with the `fallback` alias and an **error** for an unknown `objective_kind`. **Absent = the defaults, not "today"** — the deliberate behaviour change the addendum requires |
| …and its consumers, in precedence order | pacing steering (`getSteeringHint(..., policy)`: escalation is world pressure or the player's move, and the default adds "Do not narrate the player's own words or decisions." to every hint); the generation prompt and the critic prompt carry `renderAgencyPolicy`; the away recap's phrasing follows `objective_kind` (delegated decision: yes); `snapshot.agency` + `[data-so="agency-policy"]` in the author driver panel |
| The honest refusal | `src/runtime/agencyRecovery.ts` (pure): two consecutive gate boundaries with **no** fired transition at the same checkpoint that declares exits. Derived from the boundary log, not a new counter. The player gets one neutral line (`REFUSAL_PLAYER_TEXT`, in the same status section as the save notice); the **author** gets `[data-so="agency-recovery"]` with the authored alternate (`[data-so="agency-take-alternate"]`) and `[data-so="agency-generate-road"]` |
| Studio | `AgencyEditor` (`[data-so="agency-editor"]`): shows the policy actually in effect, writes **only the difference** from the defaults. Two new diagnostics, `agency-alternate-unknown` and `agency-alternate-is-self`, seeded once each in `diagnostics.test.ts`'s exhaustiveness test |

### A plan-06 line that was invisible, found while wiring this one

The player's status section was rendered by the away popup and `/story recap` but **not** by the drawer Overview, which filters that section out and draws its own pipeline line — so v2.3 plan 06's "changes not saved, retrying" never reached the surface a player always has open, and the refusal line would have had the same fate. The Overview now renders the section's remaining lines as `[data-so="status-note"]`, with `PlayerOverview.stories.tsx` §SaveNotConfirmed and §RefusedRoute as the regressions. The plan-06 Gate record carries the same correction.

### Deviations

- **One transition per outcome, not a structural fork.** Every outcome of a beat leads to the same
  next beat; what differs is the gate, the deltas and the progress. That is exactly the defect R9
  names — the player whose state matched `outcomes[1]` had no exit at all and stalled — and a
  structural fork would need the generator to author new targets, which the beat contract has no
  field for.
- **`needs_review` chains are still merged.** The plan says a boundary inserts only `validated`
  beats. Excluding `needs_review` would stall play, because there is no author accept path for a
  flagged chain — only the status line. `validated` is real (it is the state between the critic and
  the boundary) but `needs_review` keeps its pre-plan behaviour, and the author view says `review`.
- **Removing `convergence_threshold` from the fork fixture.** The authored value short-circuits
  `chainThresholdFor`, so keeping it would have made the worst-route rule untestable; the fixture has
  none, and an authored threshold winning over the chain sum is its own test.
- **The min-over-routes threshold makes a chain with a progress-less outcome enterable for free**
  (threshold 0). That is the honest consequence of an authored outcome that carries no progress, and
  it is stated in `paths.ts` and asserted in the property suite rather than hidden by a fallback.

### Not run, and not to be read as green

- **Every live check.** `live-generated-fork-a/b`, `live-two-ways-bridge/ferry`, the refusal scenario
  with a real model, `live-plan05-expansion`/`live-plan06-convergence` twice, J7, J11.25 with
  variants = 2, and the human "railroading" rubric — all owed with the rest of the live gate. The
  refusal check in particular has **never** seen a real model: only the derivation is tested.
- **"preparing the road ahead" is implemented** (`derivePipelineStatus(extraction, expansion)` +
  `expansionInFlight`), and a problem state still outranks it: a dead pipeline is never dressed as a
  busy one. `snapshotBuilder` passes the expansion's in-flight flag; 3 tests in `pipeline.test.ts`.

### Still owed by plan 07

A real-LLM pass over every live scenario in the Verification section, and the J11.25 variant sweep.
Everything else in the deliverable list is implemented and covered by machine gates.

## Audit 2026-09-23 — reopened (status: partial)

- **Contract drop strands a chat (high)**: `sanitizeExpansion` (`extras.ts:263`) drops every
  pre-v2.3 entry incl. `inserted` chains the player stands in; `loadStory` hydrates onto an
  `activeCheckpointId` absent from the merged story → no exits, no stub, frozen; contradicts
  line 62 ("a played graph is never mutated invisibly"); `extrasLegacy.test.ts:54-60` checks the
  drop only → V12.
- **Refusal signal fires in ordinary play**: any two quiet gate boundaries
  (`agencyRecovery.ts:32-33`); plan asked for "extraction cannot classify the action"; author copy
  claims "Nothing was narrated on their behalf" (`DrawerTabs.tsx:554`) which code cannot know → V13.
- **R9 closed on jest alone**: `live-generated-fork-a/b.json`, the refusal fixture/scenario and the
  precedence fixtures do not exist → L4.
- `headingTo` consumer dropped (`judge/scene.ts:132,146`, `expansionCoordinator.ts:143-144`) → V13.
- "Generate the road ahead" no-ops on authored checkpoints (`expansionCoordinator.ts:210-214`) → V13.
- `validated`→`inserted` is a label: `merge.ts:15` merges cached/needs_review/validated;
  `commitValidated` untested; `void this.deps.persist()` → V13.
- Min-over-routes threshold can be 0 (`merge.ts:39-40`) → V13 decides + guards.


### V12 gate (2026-09-23)

- `sanitizeExpansion` no longer drops a pre-v2.3 chain the chat is playing: an entry with no `contract` whose status is `inserted` or `validated` is upgraded in place (`upgradeLegacyExpansion`: beat ids `String(index)`, outcome ids `<beat>:<index>` — the same ids the parser stamps — and `contract: EXPANSION_CONTRACT`); any other legacy entry is still dropped and regenerates on arrival. Consequence stated, not hidden: a legacy chain was merged single-route (`outcomes[0]`), so after the upgrade its alternative outcomes become real exits — the checkpoints and the player's path are unchanged, exits are only added.
- `StoryEngine.hydrate` repairs an active checkpoint the merged graph does not have (`repairActiveCheckpoint`, pure, in the engine: newest id on `visitedPath`, then `visitedAnchors`, that still exists, else the start; missing ids are dropped from both trails) and exposes `hydrateRepair`; the manager appends it to the load status line, which the session journal records as a status transition. Before this, such a chat hydrated onto an id with no outgoing transitions and never advanced.
- Budget: the repair was first written as a manager method and the architecture guard failed at 701/700; it moved into the engine (where graph validity belongs) instead of being squeezed. Manager 699/700.
- Tests: `extrasLegacy.test.ts` (playing legacy chain upgraded with ids; cached legacy chain still dropped; repair picks the newest surviving checkpoint + control), `engine.test.ts` V12 case through `hydrate` itself. Mutation: `hydrate` without the repair → 1 of 27 fails.
- Machine: typecheck 0, lint 0, jest 155 suites / 2516, build 0 (bundle `c6a9363fa96d`), test:release 10/10.
- **Live** (`test/scenarios/live-v12-legacy-expansion.json`, sandbox, group `1759606632088`; no model needed — the path under test is save → reload → hydrate): a generated chain is merged, the chat is moved onto `gen_bridge_stub_1`, the SAVED blob is aged to the pre-v2.3 shape (contract and outcome ids stripped) and written with `saveMetadata`, the page is reloaded; the chat comes back on `gen_bridge_stub_1`, the entry is `contract: 2` with ids `0:0`/`1:0`, the checkpoint has an exit and the story advances to `gen_bridge_stub_2`. **12/12 twice** (`records/v2.3-replan/V12/run1.log`, `run2.log`). **Live mutation** (the old drop-every-legacy filter, rebuilt): FAIL at step 9 — `after reload the chat is on start … (entry=dropped)` — so the check sees the defect, and the engine repair is what put the chat on `start` instead of a dead id (`mutation-drop-legacy.log`). Run-header diff: rebuild timestamp only.
- Found on the way: `plan05-background-generation.json` still expects `inserted` straight after `expand`; since plan 07 that state is `validated` until a boundary. Queued as V24.

### V13 gate (2026-09-23) — MACHINE GREEN, LIVE GATE NOT GREEN

**Defects fixed**
- **The refusal signal fired in ordinary play.** Any two quiet gate boundaries counted, so a checkpoint whose gate needs several increments raised "Refused route" on its second quiet turn. `agencyRecovery(story, state, log, audits)` now needs what the plan asked for. Each of the last two boundaries must be covered by an extraction read (an audit window containing that boundary's `lastMessageId`), and no covering read may have accepted a delta on any quality an exit's gate names (`collectGateKeys`, now exported from `extraction/scope.ts`). A read that has not landed yet is unknown, not a refusal. A read that moved an exit's quality is progress, even while the gate is still shut.
- **The author card claimed what code cannot know.** "Nothing was narrated on their behalf" is gone. The card now says: "The player's last N turns were read, and nothing in them moved an exit of X."
- **"Generate the road ahead" did nothing on authored checkpoints.** `runNow` finds no stub there and only sets a status. `AgencyRecovery.canGenerate` (`findStubExpansionCandidate`) now decides whether the button exists.
- **`headingTo` precedence** (the plan's "a scene look-ahead never narrates the player arriving where they refused to go"): the look-ahead's one-hop heading is an exit of the active checkpoint, so while a refusal stands `scheduleLookahead` pre-generates nothing. The active stub is still queued. The new `refusing` dep is wired in the manager from the same `agencyRecovery` the snapshot shows.
- **Threshold 0 — decided: min-over-routes stays, the vacuous leaf goes.** A worst route with no progress gives threshold 0, and `progress >= 0` is **not** vacuous: `compareLeaf` answers `false` for an unset value (`gates.ts:5`). So the zero route of a merged `needs_review` chain stalled at its final beat for good, the exact R9 defect the min rule exists to prevent. When the threshold is 0 the final transition carries the outcome gate alone. The critic already marks such a chain `needs-review` (progress below `thresholdFor`), so the author still sees it.
- **`commitValidated` was untested and fired its persist with `void`.** It is now async and awaits the persist; its census row is `delegate` (RuntimeManager.persist). Boundary work still calls it fire-and-forget, like the other registry entries.

- Tests: `agencyRecovery.test.ts` rewritten over boundaries WITH reads, plus a V13 block (unread boundaries are unknown; a read moving an exit quality is progress, with its control; `canGenerate` false on an authored exit, true with a stub). `fork.property.test.ts`: 400 seeded chains now expect no leaf when the worst route is 0. The zero case asserts the consequence directly: the final gate holds with progress unset, and `progress >= 0` does not. `expansionLookahead.test.ts`: refusal outranks the look-ahead, with its control; `commitValidated` promotes only `validated`, rebuilds the merge and awaits the persist, with its control. Storybook `RefusedRouteOnAnAuthoredExit` and `RefusedRouteWithARoadToGenerate` (no story covered this card before).
- Mutations: 9 of 9 caught (`test/findings/mutations/V13-agency-and-merge.txt`). M6 (the unawaited persist) survived at first, because the spy finished within a microtask; it now yields a macrotask.
- Machine: typecheck 0, typecheck:test 0, lint 0, jest 164 / 2623, build 0 (bundle `f08d74e34d4a`), test:release 10/10, test-storybook:ci 31 / 185. Manager 676/700.
- **Live gate NOT run.** The pod `pmt6t0v9h5dvap` could not restart (no free GPU on its host), and creating a replacement was refused by the session's permission classifier. Owed, with the real model: a two-turn refusal of a prepared exit read by real extraction, where the card appears, has no generate button on an authored exit, and the look-ahead stays quiet. Its control: a turn that moves the exit's quality, where no card appears. This is also the refusal fixture L4 names. Not substituted with mocks.

### V13 live gate (2026-09-23, same day) — refusal green twice; one defect found live in the signal, one outside it

Pod `gx6v1b8furtcia` (the old one could not restart, so it was replaced after the user approved; `pmt6t0v9h5dvap` and `csa3ywtj6e37s5` were terminated). SSH tunnel on 18080, profile re-selected. Scenario `test/scenarios/live-v13-refusal.json`, sandbox, group `1759606632088`: an inline story whose only exit asks the player to accept Ser Kael's duel (`duel_accepted == true`), with authored alternate `parley`.

**Found live, and fixed: the signal counted replies, not turns.** On the first run, ONE refusal drew three replies (Ponticius, DM Narrator, Arin). Each reply commits a boundary, so "two quiet boundaries" was a single player action, and the card appeared after one refusal (`before-fix-one-turn-three-replies.log`). The streak is now counted in the player's own lines (`playerTurnIds` over the chat, system notes excluded; `AGENCY_STALL_TURNS = 2`; the field is `turns`, and the card reads it). The streak is every quiet gate boundary at this checkpoint since the last read that MOVED an exit. Every boundary in it must be covered by a read.

**Refined from what the real model does: "moved an exit" is leaf satisfaction, not "touched the key".** The model reads a refusal as `duel_accepted=false`. Under the first version that touched an exit key, so it counted as progress, the opposite of the truth. Now an `==`/`!=`/`in` leaf moves only when the new value satisfies it. A numeric comparison, or a leaf under `not`, counts any change as movement, because the prior value is not in the audit.

- **Refusal half: PASS twice.** In both runs the card appeared only after two refused turns, with `turns: 2`, and the reads were real: run 1 `duel_accepted=false` at window 5–6; run 2 `duel_accepted=false` on all three reads. The card reads "were read, and nothing in them moved an exit of The Challenge", offers "Take The Parley", which hit-test confirms pointer-clickable, and has no generate button. The story stayed at `challenge`.
- **Control (accept the duel): PASS in run 1, FAIL in run 2.** In run 1 the model read `duel_accepted=true`, the card cleared as soon as that read landed, before the transition, and the next boundary entered The Duel. In run 2 the model kept reading `duel_accepted=false` after "I accept your challenge". Every read window held only the reply (`{7,7}`, `{8,8}`), never the player's line. That is not V13's defect; it is V25 (below), and V25's live gate re-runs this control.
- **Live mutation (count replies as turns): SURVIVED.** On that run only one member answered the first refusal (`boundary: 1`), so both counts agreed. How many members reply varies per run, so this mutation cannot be reached live reliably. The multi-reply case is covered by jest (the V13 turn cases) and M12. Its one live observation is the pre-fix run above.
- Mutations: 13 of 13 (`V13-agency-and-merge.txt`), now including leaf satisfaction (M10), numeric movement (M11, first written as an equivalent mutant and then replaced), replies-as-turns (M12) and system notes (M14).
- Machine after the fixes: jest 164 / 2629, typecheck 0, typecheck:test 0, lint 0, test-storybook:ci 31 / 185, build 0 (bundle `51acb3aa1e82`). Run-header diff: build fields only.

**V25, found here and queued rather than folded in**: the cadence read window counts messages while cadence counts boundaries (`scheduler.ts:137`: `getChatWindow(stableTo - cadence + 1, stableTo)`). At cadence 1 a read sees only the newest reply. In a group the player's own line is outside every window. In a solo chat at the default cadence 3, half the transcript is never read. It dates from July (plan 3a), and it changes what extraction sees in every chat, so it gets its own gate.

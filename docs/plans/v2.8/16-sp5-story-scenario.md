# Plan 16a — SP5 story-owned scenario (`SP5.b`)

**Status: SEED from v2.6, not approved.** Split out of `16-spike-defers.md` (2026-10-03). Same item as plan 02 row
**C1**: plan 02 lists it, this file holds the design. Overview: `00-overview.md`.

## What it is

- A checkpoint can author `effects.scenario`. The runtime writes it to ST's per-chat scenario override
  (`chat_metadata.scenario`) along the played path: a string sets it, `null` or `""` clears it, a checkpoint without the
  key keeps what the path before it set (path replay, like `world_info`).
- ST prefers that override over the card's scenario in a solo chat (`script.js:3445`) and uses it **instead of** every
  member's card scenario in a group (`group-chats.js:561-567`) (`v2.5/09-sp5-spike-report.md:25-28`).
- Why it matters: today a group request carries every enabled member's card scenario. On the Adolion saga group that is up
  to 7 competing card scenarios (4 distinct texts). With SP5 it carries one story block that follows the path
  (`09-sp5-spike-report.md:149`).
- `SP5.b` = the spike into prod: the code out of the dev chunk, the flag removed, a typed field, a Studio field, and the
  competing-cards note in the author view (`v2.6/04-remaining-builds.md:26`).

## History and evidence

Bars (v2.5, never retuned; `v2.5/09-research-spikes.md` §SP5, `v2.6/03-sp5-restated.md:7-13`):

| # | Condition | Pass |
|---|---|---|
| C1 | Per-chat correctness: chats A (cp3), B (cp1), C (no story), switch A→B→C→A ×3 | scenario == path replay's, 100 %; none in C |
| C2 | User override kept | compare-and-set: `externally-changed` recorded, the user's text never clobbered |
| C3 | Rollback past a scenario-writing checkpoint | the previous scenario restored (a `RESTORABLE` row) |
| C4 | Group | one scenario block in the request, not one per member |
| C5 | Competing cards (story sets none) | an author-view diagnostic names them; no player copy |

| When | Result | Citation |
|---|---|---|
| v2.5, jest | C1 plumbing, C2, C3, C5 PASS; mutants caught | `09-sp5-spike-report.md:15-21,55-57` |
| v2.5, live | not measured: both runs stopped on the shared-read throw (fixed `7663bbb0`) | `:17-21` |
| v2.6, lane 2, 2026-10-01 | import-time effects defect found (a hydrate joined a lapsing activate); fixed `32527192` | `:97`; `03-sp5-restated.md:43-54` |
| v2.6, branch bundle `15ff8e26ba2e` | C4 PASS ×1 on saga + academy | `09-sp5-spike-report.md:117` |
| v2.6, slot `cc7c9153e48a`, pin `59e8821` | **C1 10/10, C2 both orders, C3, C4, C5 PASS ×1**. No model call (dry-run captures), 0 pod minutes | `:129-140`; record `test/measurements/v2.6-03/sp5/c1235/summary.json` |
| v2.6 | worth review: **include → `SP5.b`** | `:145-153`; `v2.6/03-spike-reevaluation.md:104` |
| v2.6 follow-ups | caveat 2 (note read a cast still in flight) and caveat 3 (no-story chat showed the previous journal) fixed in `cf26f64f` | `v2.6/14-findings.md:379-380` |
| v2.6 T7 suite, 2026-10-03 | `t7-adolion-sp5-scenario.json` **red ×2**: "two scenario writes expected, found 1"; toy `live-v25-09-sp5-scenario.json` red on C2 order 1 and left `spikes.sp5Scenario` on as residue. Both classed "needs triage" | `test/sessions/T7/suite/classes.py:32,79`; `suite/sp5/batch.log`; the header diff warns the served bundle was not the built one (`suite/sp5/run-header-diff.txt`) |

The T7 "found 1" message reads like the bookkeeping count that addendum 3 changed to "applied **or** reverted" after C4 (c)
started reverting the departing checkpoint's row (`03-sp5-restated.md:66-73`). Whether the T7 fixture predates that
change, or the product regressed: not determined.

Cost seen: on the 125-member saga group every checkpoint apply spends 40–110 s writing the cast before the scenario lands.
That is the cast's cost, not the scenario's (`09-sp5-spike-report.md:121-122,150`).

## Why it was deferred

Not deferred on merit: included 2026-10-01. `SP5.b` sat in v2.6 plan 04's `.b` queue (`04-remaining-builds.md:26`) and
v2.6 froze before it was built (overview rule 2). The ×2 live run was owed to v2.6 plan 10 and never went green.

## Current state in code

Verified on master `f0e62687`.

| Piece | Where | In the prod bundle |
|---|---|---|
| Effect-extension seam: target kind `extension`, restorable, chat-scoped | `src/runtime/effectExtensions.ts` (44 lines), `effectsApplier.ts:15,301`, `effectHost.ts:3` | yes, empty (nothing registers) |
| Path replay, own-write detection, refusal, competing-cards note | `src/runtime/spikes/sp5Scenario.ts` (83) | no |
| Registration + flag read | `src/runtime/spikes/sp5ScenarioHost.ts` (16), loaded by `if (__SO_DEV__)` at `src/runtime/index.ts:84` | no |
| ST seam: read/write `chat_metadata.scenario`, cast card scenarios | `src/services/stHost/chatScenario.ts` (34) | no |
| Flag | `spikes.sp5Scenario`, default off (`src/runtime/settingsModel.ts:72-75`) | the key only |
| Dev-only guard | `src/runtime/devOnly.guard.test.ts:20-21`; planted-import control names `sp5ScenarioHost` (`:101-105`) | — |
| Schema | **not typed**: `CheckpointEffects` (`src/engine/schema.ts:116-124`) has no `scenario`; the spike reads the raw record (`sp5Scenario.ts:18-22`) | — |
| C3 hold | effect extensions are skipped while requirements are unmet (`effectsApplier.ts:301`, `ready ? effectExtensions() : []`) | yes |
| Author guide | listed under "Experimental effects" as a spike (`docs/authoring/story-guide.md:239-243`; twin `src/copilot/guideTopics.ts:157-158`) | — |
| Campaign | every built Adolion story authors `effects.scenario` (`09-sp5-spike-report.md:149`) | — |

## Options

| | Option | Cost | Note |
|---|---|---|---|
| A | Build `SP5.b` in v2.7 as approved in v2.6 (proposal below) | S | plan 02 C1; user build order C2, then C1 (`02-v26-carry-in.md` decision 1) |
| B | Keep the spike dev-only, re-run C1–C5 ×2 first, then build | S + a no-model lane run | the ×2 is owed either way; B only changes the order |
| C | Drop | S (removal + planted-import control) | leaves the Author's Note as the only per-chat framing channel; the campaign's authored scenarios go inert |

## Proposal (option A)

1. **Triage the T7 red first.** Re-run `t7-adolion-sp5-scenario.json` and the toy `live-v25-09-sp5-scenario.json` on a
   served bundle that matches `dist/` (run header `matchesBuild`). Classify each failure as fixture (count predates C4 (c),
   addendum 3) or product. Fix the fixture count, or fix the product with a failing-first jest case.
2. **Type the field.** `CheckpointEffects.scenario?: string | null` in `src/engine/schema.ts`. The validator trims and
   keeps three states: absent = inherit, `""`/`null` = clear, text = set. The spike's `authored()` reader then reads the
   typed field.
3. **Move the code out of `spikes/`.** `sp5Scenario.ts` → `src/runtime/storyScenario.ts`, `sp5ScenarioHost.ts` →
   `src/runtime/storyScenarioHost.ts`; `stHost/chatScenario.ts` stays. Register the extension at startup in prod (no
   `__SO_DEV__`), outside the manager (the manager is at its 700-line budget, `v2.6/14-findings.md:470`).
4. **Remove the flag.** `sp5Scenario` leaves `SPIKE_FLAGS` (`settingsModel.ts:72-75`) and the sanitizer drops a stored
   value. Remove the three files from the dev-only list (`devOnly.guard.test.ts:20-21`) and repoint the planted-import
   control at another spike module (`sp6Complications.ts` or `swipeBack.ts`), so the control still proves the guard.
5. **Keep C3 as built.** The scenario stays held with World Info while requirements are unmet (`effectsApplier.ts:301`;
   open question `04-remaining-builds.md:260,439`). Reason: the scenario names the story's cast and places; applying it
   to a chat whose cast is missing frames a scene the members cannot play.
6. **Keep the jump semantics.** A `/cp activate` jump releases the source's scenario and applies the target alone, so a
   target that authors none plays with the pre-story value (C4 (c)). Plan 09 keeps (c) (plan 09 decision 1, answered
   yes). Authors who want a scenario on a jump target author it there.
7. **Studio field.** A Scenario field in `src/studio/components/EffectsEditor.tsx` with the three states (inherit / clear
   / text), through `mutations.ts`; a Storybook story with an interaction + a11y play. A diagnostic consequence line for
   any new diagnostic (`DIAGNOSTIC_CONSEQUENCES`).
8. **C5 note in the author view.** Today the competing-cards note is a session-journal event only. Show it in the author
   view next to the requirements rows ("N character card scenarios frame this chat and the story sets none", names in
   the detail). Never in player copy.
9. **Guide.** Move `effects.scenario` out of "Experimental effects" into the checkpoint effects section of
   `docs/authoring/story-guide.md`, keep the good/bad examples (`:242-243`, framing only, no secrets), and update the
   `guideTopics.ts` twin (drift test).
10. **Agent tool.** `setCheckpointEffects` (`src/studio/mutations.ts:65`) carries the typed field; the agent tool's doc
    line lists `scenario` beside the other effects (`src/copilot/agent/tools.ts:64`).

Cost: about 2–4 KB of main entry (the dev chunk is 4,229 B, `09-sp5-spike-report.md:150`); prod main is 1,224,979 B of
1,250,000 (`v2.6/14-findings.md:470`).

## Recommendation

**A.** Measured value on the real campaign, PASS ×1, small cost, already approved. Do step 1 before any code, so the ×2
run that follows measures the product and not a stale fixture.

## Decisions for the user
I accept all your recommendations
1. Build `SP5.b` in v2.7 (plan 02 C1)? **Recommended: yes.**
2. Scenario applies while requirements are unmet (C3 presentation set), or stays held as built? **Recommended: stays held.**
3. Jump caveat: closed by plan 09's decision to keep (c)? **Recommended: yes, closed; authors set a scenario on jump targets.**
4. Where the competing-cards note shows: author view beside the requirements rows, or journal only? **Recommended: author
   view beside the requirements rows.**
5. Tier: SP5's live legs make no model call (dry-run captures, 0 pod minutes, `09-sp5-spike-report.md:132`). Build it in
   tier 1 with plan 02 C2, rather than wait for tier 3? **Recommended: yes, tier 1.**

## Floor and measurement before building

Bars unchanged (C1–C5 above). Restate before the run, as `03-sp5-restated.md` did.

- Step 1 triage (above) closes before the ×2.
- C1–C5 **×2 consecutive** on one adolion-fresh lane, on the built prod-path code (flag gone), `--strict`, run header
  diff around the batch (`v2.6/13-final-suite.md:143`, row `03-SP5`).
- Jest: the spike's existing cases (`sp5Scenario.test.ts`, `sp5ScenarioHost.test.ts`, `sp5CastSettle.review.test.ts`)
  move with the code; C3 hold and C4 release cases (`effectsStaging.review.test.ts`) stay green.
- A served bundle that is not the built one makes the run not measured.

## Gates

- Runtime + ST-facing + Studio: `npm run gates` (Storybook included; say so if `--no-storybook`).
- Live: the C1–C5 lab fixture ×2 (`<campaign>/lab/scenario/live-v25-09-sp5-adolion-scenario.json`) on an adolion-fresh
  lane; no model needed. `so-ui.mts assert-player-clean` with the C5 note present.
- D3: `devOnly.guard.test.ts` green with the moved files off the list and the control repointed.

## Links

- 02 v2.6 carry-in: row C1 points here.
- 09 C4 option (b): owns the jump semantics; keeps (c).
- 03 story briefing: `effects.scenario` frames the story for the model, the briefing for the player (`03-story-briefing.md:14`).
- 16 index; 16b SP6, 16c SP1, 16d SP10: the other v2.6 spike defers.
- 05 Adolion campaign: the stories that already author the key.

# Plan 16 — SP5 story-owned scenario: live legs in groups

**Status (2026-10-03): v2.8 plan 16 (was v2.7 plan 16a). Decided (all recommendations accepted); the `SP5.b` build
itself is v2.7 02 C1 and has no gate record as of `c7967323`, so it is not built; the live legs here are not run.**
Overview: `00-overview.md`. **Gate tiers** (00-overview §Gate taxonomy): implementation D; acceptance RP (the C1–C5
recipe ×2 runs on an adolion-fresh lane in the final suite; the recipe itself makes no model call).

Split of work (review A5): the build (typed field, prod path, flag removed, Studio field, author-view note) is
deterministic and belongs to **v2.7 02 C1**. This file keeps the design reference (below) and owns the two things v2.7
cannot close: converting the live fixtures to group chats (review B2, v2.7 03 group-chats-only) and the C1–C5 ×2 live
acceptance on the built code.

## What it is

- A checkpoint can author `effects.scenario`. The runtime writes it to ST's per-chat scenario override
  (`chat_metadata.scenario`) along the played path: a string sets it, `null` or `""` clears it, a checkpoint without the
  key keeps what the path before it set (path replay, like `world_info`).
- In a group, ST uses that override **instead of** every member's card scenario (`group-chats.js:561-567`)
  (`v2.5/09-sp5-spike-report.md:25-28`). Stories are group-only (v2.7 03), so this is the only case that matters.
- Why it matters: today a group request carries every enabled member's card scenario. On the Adolion saga group that is
  up to 7 competing card scenarios (4 distinct texts). With SP5 it carries one story block that follows the path
  (`v2.5/09-sp5-spike-report.md:149`).
- `SP5.b` = the spike into prod: the code out of the dev chunk, the flag removed, a typed field, a Studio field, and the
  competing-cards note in the author view (`v2.6/04-remaining-builds.md:26`).

## History and evidence

Bars (v2.5, never retuned; `v2.5/09-research-spikes.md` §SP5, `v2.6/03-sp5-restated.md:7-13`). Chat roles restated for
group-only play (B2); the pass conditions are unchanged:

| # | Condition | Pass |
|---|---|---|
| C1 | Per-chat correctness: chat A (group, cp3), chat B (a second group chat, cp1), chat C (solo, no story: inactivity control), switch A→B→C→A ×3 | scenario == path replay's, 100 %; in C no scenario write, the card's own scenario kept, story selection refused |
| C2 | User override kept | compare-and-set: `externally-changed` recorded, the user's text never clobbered |
| C3 | Rollback past a scenario-writing checkpoint | the previous scenario restored (a `RESTORABLE` row) |
| C4 | Group | one scenario block in the request, not one per member |
| C5 | Competing cards (story sets none) | an author-view diagnostic names them, in two group chats; no player copy |

| When | Result | Citation |
|---|---|---|
| v2.5, jest | C1 plumbing, C2, C3, C5 PASS; mutants caught | `v2.5/09-sp5-spike-report.md:15-21,55-57` |
| v2.5, live | not measured: both runs stopped on the shared-read throw (fixed `7663bbb0`) | `:17-21` |
| v2.6, lane 2, 2026-10-01 | import-time effects defect found (a hydrate joined a lapsing activate); fixed `32527192` | `:97`; `v2.6/03-sp5-restated.md:43-54` |
| v2.6, branch bundle `15ff8e26ba2e` | C4 PASS ×1 on saga + academy | `v2.5/09-sp5-spike-report.md:117` |
| v2.6, slot `cc7c9153e48a`, pin `59e8821` | **C1 10/10, C2 both orders, C3, C4, C5 PASS ×1**. No model call (dry-run captures), 0 pod minutes. Chats B and C were solo then | `:129-140`; record `test/measurements/v2.6-03/sp5/c1235/summary.json` |
| v2.6 | worth review: **include → `SP5.b`** | `:145-153`; `v2.6/03-spike-reevaluation.md:104` |
| v2.6 follow-ups | caveat 2 (note read a cast still in flight) and caveat 3 (no-story chat showed the previous journal) fixed in `cf26f64f` | `v2.6/14-findings.md:379-380` |
| v2.6 T7 suite, 2026-10-03 | `t7-adolion-sp5-scenario.json` **red ×2**: "two scenario writes expected, found 1"; toy `live-v25-09-sp5-scenario.json` red on C2 order 1 and left `spikes.sp5Scenario` on as residue. Both classed "needs triage" | `test/sessions/T7/suite/classes.py:32,79`; `suite/sp5/batch.log`; the header diff warns the served bundle was not the built one (`suite/sp5/run-header-diff.txt`) |

The T7 "found 1" message reads like the bookkeeping count that addendum 3 changed to "applied **or** reverted" after
C4 (c) started reverting the departing checkpoint's row (`v2.6/03-sp5-restated.md:66-73`). Whether the T7 fixture
predates that change, or the product regressed: not determined. Triage is step 1 of v2.7 02 C1.

Cost seen: on the 125-member saga group every checkpoint apply spends 40–110 s writing the cast before the scenario
lands. That is the cast's cost, not the scenario's (`v2.5/09-sp5-spike-report.md:121-122,150`).

## Solo legs in the current fixtures (B2)

Both fixtures still play a story in a solo chat, which v2.7 03 now refuses:

| Fixture | Solo use today | Change |
|---|---|---|
| toy `test/scenarios/live-v25-09-sp5-scenario.json` | chat B = a solo Arin chat playing the story at gate (C1, C2 order 1); C5's second leg selects `so-v25-sp5-none` in solo chat C | B becomes a second chat of the sandbox group (`new-chat` after `open-group <id>`); C5's second leg runs in chat B with the no-scenario story and expects the enabled members with card scenarios, not `Luke` alone |
| Adolion `t7-adolion-sp5-scenario.json` (lab copy `<campaign>/lab/scenario/live-v25-09-sp5-adolion-scenario.json`) | B is already a group chat; C5's second leg selects `so-v25-sp5-none` in solo chat C | C5's second leg moves to a second group chat; expected names come from that group's enabled cards (`EXPECT.C5` in `test/fixtures/interop/v25-09-sp5-adolion.js`) |
| both | chat C = solo, no story | **kept as the inactivity control**: assert the runtime stays inactive, `selectStory` refuses (v2.7 03), no scenario ledger row, `chat_metadata.scenario` untouched, the card's own scenario still in the request, and cleanup runs |

The second group chat in each fixture is created and deleted by the run (sandbox cleanup, `settleReapPrompts`).

## Current state in code

Re-verified on master `c7967323` for the rows marked ✓; the rest as of `f0e62687`.

| Piece | Where | In the prod bundle |
|---|---|---|
| Effect-extension seam: target kind `extension`, restorable, chat-scoped | `src/runtime/effectExtensions.ts` (44 lines), `effectsApplier.ts:38-41,301` ✓, `effectHost.ts:3` | yes, empty (nothing registers) |
| Path replay, own-write detection, refusal, competing-cards note | `src/runtime/spikes/sp5Scenario.ts` (83) | no |
| Registration + flag read | `src/runtime/spikes/sp5ScenarioHost.ts` (16), loaded by `if (__SO_DEV__)` at `src/runtime/index.ts:84` ✓ | no |
| ST seam: read/write `chat_metadata.scenario`, cast card scenarios | `src/services/stHost/chatScenario.ts` (34) | no |
| Flag | `spikes.sp5Scenario`, default off, in `SPIKE_FLAGS` (`src/runtime/settingsModel.ts:87-90`) ✓ | the key only |
| Dev-only guard | `src/runtime/devOnly.guard.test.ts:20-21` ✓; planted-import control names `sp5ScenarioHost` (`:99-104`) ✓ | — |
| Schema | **not typed**: `CheckpointEffects` (`src/engine/schema.ts:116`) ✓ has no `scenario`; the spike reads the raw record (`sp5Scenario.ts:18-22`) | — |
| C3 hold | effect extensions are skipped while requirements are unmet (`effectsApplier.ts:301`, `ready ? effectExtensions() : []`) ✓ | yes |
| Author guide | listed under "Experimental effects" as a spike (`docs/authoring/story-guide.md:239-243`; twin `src/copilot/guideTopics.ts:157-158`) | — |
| Campaign | every built Adolion story authors `effects.scenario` (`v2.5/09-sp5-spike-report.md:149`) | — |

## Design reference (built in v2.7 02 C1)

Option A was chosen (build `SP5.b`). Rejected: B (re-run the spike first; the ×2 is owed either way) and C (drop; the
campaign's authored scenarios would go inert). The steps, for v2.7 02 C1 to follow:

1. **Triage the T7 red first.** Re-run both fixtures on a served bundle that matches `dist/` (run header
   `matchesBuild`). Classify each failure as fixture (count predates C4 (c), addendum 3) or product. Fix the fixture
   count, or fix the product with a failing-first jest case.
2. **Type the field.** `CheckpointEffects.scenario?: string | null` in `src/engine/schema.ts`. The validator trims and
   keeps three states: absent = inherit, `""`/`null` = clear, text = set. The spike's `authored()` reader then reads the
   typed field.
3. **Move the code out of `spikes/`.** `sp5Scenario.ts` → `src/runtime/storyScenario.ts`, `sp5ScenarioHost.ts` →
   `src/runtime/storyScenarioHost.ts`; `stHost/chatScenario.ts` stays. Register the extension at startup in prod (no
   `__SO_DEV__`), outside the manager (the manager is at its 700-line budget, `v2.6/14-findings.md:470`).
4. **Remove the flag.** `sp5Scenario` leaves `SPIKE_FLAGS` (`settingsModel.ts:87-90`) and the sanitizer drops a stored
   value. Remove the files from the dev-only list (`devOnly.guard.test.ts:20-21`) and repoint the planted-import control
   (`:99-104`) at another spike module (`sp6Complications.ts` or `swipeBack.ts`), so the control still proves the guard.
5. **Keep C3 as built.** The scenario stays held with World Info while requirements are unmet (`effectsApplier.ts:301`;
   open question `v2.6/04-remaining-builds.md:260,439`). The scenario names the story's cast and places; applying it to
   a chat whose cast is missing frames a scene the members cannot play.
6. **Keep the jump semantics.** A `/cp activate` jump releases the source's scenario and applies the target alone, so a
   target that authors none plays with the pre-story value (C4 (c)). v2.7 11 (C4 option b) keeps (c). Authors who want a
   scenario on a jump target author it there.
7. **Studio field.** A Scenario field in `src/studio/components/EffectsEditor.tsx` with the three states (inherit /
   clear / text), through `mutations.ts`; a Storybook story with an interaction + a11y play. A consequence line for any
   new diagnostic (`DIAGNOSTIC_CONSEQUENCES`).
8. **C5 note in the author view.** Today the competing-cards note is a session-journal event only. Show it in the author
   view next to the requirements rows ("N character card scenarios frame this chat and the story sets none", names in
   the detail). Never in player copy. With v2.7 04 built, this is a check-registry row (audience author).
9. **Guide.** Move `effects.scenario` out of "Experimental effects" into the checkpoint effects section of
   `docs/authoring/story-guide.md`, keep the good/bad examples (`:242-243`, framing only, no secrets), and update the
   `guideTopics.ts` twin (drift test). Drop the solo sentence (ST's solo precedence) from the guide.
10. **Agent tool.** `setCheckpointEffects` (`src/studio/mutations.ts:65`) carries the typed field; the agent tool's doc
    line lists `scenario` beside the other effects (`src/copilot/agent/tools.ts:64`).

Cost: about 2–4 KB of main entry (the dev chunk is 4,229 B, `v2.5/09-sp5-spike-report.md:150`). Headroom on the named
build read 2026-10-03 (`dist/manifest.json`, prod, built 2026-10-03T12:03:51Z, bundle sha256 `dae0b664a5f8…`):
1,115,323 B of `BUNDLE_BUDGET_BYTES` 1,250,000 (`scripts/release/buildChecks.mjs:46`), so 134,677 B. Re-read on the
build that lands C1.

## This plan's work

1. **After v2.7 02 C1 lands** (its gate record names the build): convert both fixtures to groups as in §Solo legs.
   Syntax-check every changed `eval` before a run (`new Function(...)`).
2. **Restate the bars** in the form above and commit before the run (v2.5 plan 09 rule 1).
3. **Run C1–C5 ×2** on the built prod-path code (flag gone), as below.

## Recommendation

**A, built in v2.7 02 C1; live legs here.** Measured value on the real campaign, PASS ×1, small cost, approved. The
user's answer ("I accept all your recommendations") stands; recommendation 5 (build in "tier 1") is superseded by the
split: the build is v2.7 02 C1 (deterministic), and this plan keeps only the group conversion and the ×2 acceptance.

## Decisions for the user
I accept all your recommendations
1. Build `SP5.b` in v2.7 (v2.7 02 C1)? **Recommended: yes.**
2. Scenario applies while requirements are unmet (C3 presentation set), or stays held as built? **Recommended: stays held.**
3. Jump caveat: closed by v2.7 11's decision to keep (c)? **Recommended: yes, closed; authors set a scenario on jump targets.**
4. Where the competing-cards note shows: author view beside the requirements rows, or journal only? **Recommended: author
   view beside the requirements rows.**
5. Tier: SP5's live legs make no model call (dry-run captures, 0 pod minutes, `v2.5/09-sp5-spike-report.md:132`). Build
   it early with v2.7 02 C2, rather than wait for the late model tier? **Recommended: yes.** (Done by the split: the
   build is v2.7 02 C1.)

## Floor and measurement

Bars unchanged (C1–C5 above). Restate before the run, as `v2.6/03-sp5-restated.md` did.

- v2.7 02 C1's triage closes before the ×2.
- C1–C5 **×2 consecutive** on one adolion-fresh lane, on the built prod-path code (flag gone), `--strict`, run header
  diff around the batch (`v2.6/13-final-suite.md:143`, row `03-SP5`), `--group <id>` pinned.
- Jest: the spike's existing cases (`sp5Scenario.test.ts`, `sp5ScenarioHost.test.ts`, `sp5CastSettle.review.test.ts`)
  move with the code; C3 hold and C4 release cases (`effectsStaging.review.test.ts`) stay green.
- A served bundle that is not the built one makes the run not measured.

## Gates

- Fixture conversion (D): `npm run test:debug` green; the scenario validator loads both fixtures; no `solo_chat` step
  selects or imports a story.
- Live acceptance: the toy fixture and the Adolion lab fixture, each ×2 on an adolion-fresh lane, both group legs plus
  the solo inactivity control C; no model needed. `so-ui.mts assert-player-clean` with the C5 note present. Cleanup:
  sandbox group chats deleted, no `spikes.sp5Scenario` residue, run header diff clean.
- The build's own gates (`npm run gates`, D3 guard with the control repointed, registry row for the scenario effect in
  the v2.7 01 feature registry + Help) belong to v2.7 02 C1.

## Links

- v2.7 02 carry-in: row C1 builds `SP5.b` (design above).
- v2.7 03 group-chats-only: why the solo legs move to groups and chat C stays only as a control.
- v2.7 11 C4 option (b): owns the jump semantics; keeps (c).
- v2.7 05 story briefing: `effects.scenario` frames the story for the model, the briefing for the player.
- v2.7 04 story health center: the C5 note as an author check row.
- v2.8 17 SP6 complication pool: the other v2.6 spike still measured in v2.8. SP1 is deferred (v2.9 01); SP10 is v2.7 15.
- v2.7 07 / v2.8 02 Adolion campaign: the stories that already author the key, and the lab fixture.

## Review 2026-10-03

- **F01** applied: status line and gate tiers rewritten (decided; build owned by v2.7 02 C1, no gate record; live legs
  not run).
- **A5** applied: the build is deterministic and is v2.7 02 C1; this file keeps the design reference and the live legs.
  Checked `v2.7/02-v26-carry-in.md`: gate records exist for C2 and C6–C10 only, none for C1.
- **B2** applied: §Solo legs converts B (toy) and C5's solo leg (both fixtures) to group chats; chat C stays a solo
  inactivity/refusal control; C1/C5 bar wording restated for groups.
- Line refs re-verified on `c7967323`: `settingsModel.ts:87-90` (was :72-75), `devOnly.guard.test.ts:99-104` (was
  :101-105), `schema.ts:116`, `effectsApplier.ts:301`, `index.ts:84`. Bundle headroom now cites a named build and
  `buildChecks.mjs:46` (the old "1,224,979 B" figure was a v2.6 build).
- Not applied: none. Open: 00-overview lists acceptance as RP although the recipe makes no model call (see report).

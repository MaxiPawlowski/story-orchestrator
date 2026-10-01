# Plan 03 — SP5 restated (story-owned scenario)

**Step 0, committed before any run.** Bars are v2.5's (`v2.5/09-research-spikes.md` §SP5), verbatim.

## Conditions and bars (unchanged from v2.5)

| # | Condition | Measured by | Pass (verbatim) | v2.6 tier |
|---|---|---|---|---|
| C1 | Per-chat correctness | chats A (cp3), B (cp1), C (no story); switch A→B→C→A ×3, capture each request | scenario == path replay's, 100 %; none in C | live, Adolion ×1 (+ toy jest plumbing half) |
| C2 | User override kept | a user-set override, then a checkpoint write, then leave | compare-and-set: `externally-changed` recorded, the user's text never clobbered | live ×1 + toy jest |
| C3 | Rollback | rollback past a scenario-writing checkpoint | the previous scenario restored (a `RESTORABLE` row) | live ×1 + toy jest |
| C4 | Group | 3-member group | one scenario block in the request, not three | live ×1 |
| C5 | Competing cards | cards whose scenarios compete with a story that sets none | an author-view diagnostic names them; no player copy (rule 7) | live ×1 + toy jest |

## What changed since v2.5

- v2.5's live legs never measured anything: both runs stopped at C3's `extract` on the shared-read throw (fixed,
  `7663bbb0`). The lab fixture also runs C3 last, so a C3 failure cannot hide C1/C4.
- **Data:** `adolion-campaign@e1c91fb` `lab/scenario/` (`check_lab.py` OK): `live-v25-09-sp5-adolion-scenario.json`
  (52 steps) + `v25-09-sp5-adolion.js` (`EXPECT` generated from `build/`), stories `adolion-saga` and `adolion-academy`.
  Chat A = sandbox chat of `Adolion - The Saga` at `east-harvest-festival` after 3 writes; B = a new chat of
  `Adolion - House Nightriver` at `nightriver-house`; C = solo Belle, no story. Real card scenarios (nothing planted).
- **C4's pass rule as the fixture applies it** (v2.6 04 C3/C4, "SP5's C4 pass rule vs shared genre text … fixed in the
  fixture"): Adolion cards share scenario texts (Academy: 5 cards, 2 distinct texts), so the APPEND control counts each
  distinct text once per member that carries it, and the override capture must carry the story block once and 0 card
  scenarios. The bar ("one scenario block in the request, not three") is unchanged; only the control's arithmetic
  follows the real cards. Adolion groups are SWAP; the fixture switches to APPEND for the capture, as v2.5's did.
- **C5 on Adolion:** every built story sets a scenario, so C5 is measured with the plugin's none-story in a fresh
  Adolion group and on the solo chat (the lab's `plugin_none_story_fresh_group` list), as the fixture does.
- **×1** (plan 03 table: "C1–C5 live ×1"); ×2 owed to plan 10.

## Procedure (stated)

Lane 2, adolion-fresh at the pin, dev bundle as staged (`6f56533e8608`). No model call is measured: requests are ST
dry-run assemblies and C3's reads are `debugResponse` (rule 5 n/a). `judge.enabled` off on lane 2's copy for the run,
restored afterwards. The fixture flips `spikes.sp5Scenario` on and back. Run header captured and diffed around it;
the fixture restores both groups' `disabled_members`. Toy jest legs: `sp5Scenario.test.ts`, `sp5ScenarioHost.test.ts`.

## Records

`test/measurements/v2.6-03/sp5/` (batch log, the `so-v25-sp5` record printed by the last step, header diff, summary).

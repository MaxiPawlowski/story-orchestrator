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

## Addendum 2026-10-01 13:00Z — procedure change before the measured run (bars unchanged)

The first run (12:26Z) measured nothing: step 5 found no scenario ledger row after importing the saga. Probes on lane 2
(`_run/sp5/scen/probe*.json`, records in `sp5/`) show a product defect outside the spike: importing `adolion-saga` into a
new chat of the 125-member group moves the run epoch while the activate writes the cast; the hydrate that follows joins
the lapsing apply (AS-10's coalescing door), so the ledger stays at the Author's Note plus one cast row for 300 s and the
background, the scenario extension, the stage and onEnter never apply. The toy story on the toy group applies fine
(1 row, scenario written). Fixed on this branch (`32527192`, failing-first case) but the staged bundle does not carry it.

Change for the measured run: after `import_story` of the saga, reopen chat A (`reload {reopenChat}`), re-inject the two
helper scripts, and wait (≤ 300 s) until the ledger holds the scenario extension row, i.e. the hydrate's own complete
apply. Every later step, check and pass rule is unchanged. A run that still finds no row is **not measured**.

## Addendum 2 2026-10-01 13:10Z — before the second measured attempt (bars unchanged)

Attempt 1 with addendum 1 (13:06Z): the reopen worked (the hydrate wrote the scenario row after 56 s, 122 ledger rows),
then step 12 found 1 scenario write where 2 were due, 36 s after `/cp activate east-landfall`: on the 125-member saga
group each checkpoint apply writes ~100 cast members one at a time, and the extension (scenario) effect runs after the
cast, so the fixture's checks ran before the apply finished. Change: after every `/cp activate` and after every chat
switch back to A, wait (≤ 300 s) until the effect ledger has stopped growing for 8 s and holds no `pending` row. No check
or pass rule changes. This is a fixture timing change; the slowness itself is a finding for the worth review (C1's
per-chat cost on a large group).

## Addendum 3 2026-10-01 13:20Z — before the third attempt (bars unchanged)

Attempt 2 (13:09Z) stopped at the fixture's own bookkeeping check after `/cp activate east-landfall`: "two scenario
writes expected, found 1 applied". A probe shows the spike wrote east-landfall's scenario (`applied`) and the guild-hall
row is `reverted`: since v2.6 04 C4 (built 2026-09-30, after the lab fixture was written on `dc8dac54`), `/cp activate`
releases the departing checkpoint's owned effects before it applies the target's. The held scenario equals the path
replay's (the C1 condition). Change: that bookkeeping check counts `applied` **or** `reverted` scenario rows. No C1–C5
check changes.

## Addendum 4 2026-10-01 14:05Z — the measured run (bars unchanged)

- **Bundle:** lane 2 alone serves this branch's dev build `15ff8e26ba2e` (commit `301b0d5a`, includes the import fix
  `32527192`) through a route on lane 2's browser (`scripts/spike/v26-03/serve-branch-on-lane.mts`); the shared ST slot
  (`6525728b22b7`, T1 sessions) is untouched. Fixture `v5`: no reopen (the fix is what is exercised), a wait for the
  import's scenario row, and the ledger settle after each activate (addendum 2), the bookkeeping count of addendum 3.
- **C4 is option (c), as recorded and user-approved** (04 §C4; confirmed by the lead 2026-10-01): a `/cp activate` jump
  releases the source's staging and applies the target alone. The lab fixture, written before C4, expects scenario
  inheritance across jumps in two places: at `east-the-road-inland` (authors none; under (c) the override is the
  pre-story empty value) and in C3 (whose path is reached by jumps: the rollback past the harvest write restores that
  empty value, and the landfall text must be absent from the request). Both expectations follow (c). Every other C1–C5
  check is the lab's.
- Harness: the lab's chat B lives in another group, which the sandbox guard refused ("sandbox escaped" at step 22 of the first v5 attempt, 14:03Z). `so-scenario` gains `adoptsNewChat: "other-group"` (adopt only a chat created during the step in another group; cleanup deletes it, a leak fails the run; `scripts/debug/foreignChat.test.mts`). The v5 fixture marks its chat-B step with it. Re-run, same checks.
- Harness ordering: `solo_chat` opens only from the sandbox group, so the v5 fixture returns to chat A (and settles) before opening chat C (14:10Z, after the second v5 attempt stopped there; C4 A and B had passed).
- Chat C's no-story check read the snapshot 10 ms after the solo chat opened (still the previous chat's story); it now waits up to 30 s for the runtime to follow the chat change (14:17Z).
- Chat B: the same wait for the import's scenario row now follows the academy import too (its check ran before the apply finished, 14:20Z; it passed at 14:13Z).

## Addendum 5 2026-10-01 15:15Z — the C1/C2/C3/C5 run (bars unchanged)

- **Bundle:** the shared ST slot's dev build `cc7c9153e48a` (master with the hydrate fix `32527192`), served to lane 2
  unchanged; lane 2 re-seeded from `adolion-fresh` at campaign pin `59e8821` (saga v12, academy rebuilt), lane server
  started with `SO_JUDGE_RATE_PER_MIN=15`. No branch route on the lane browser.
- **C4 option (c)** as in addendum 4; the two adapted expectations are unchanged.
- **Harness, group switching:** the attempt of 14:20Z stopped in the lab helper's `goto` to chat B, while chat A's
  125-member saga cast writes were still landing: `openGroupById`/`openGroupChat` returned and the page stayed on A.
  The helper (run-dir copy of `test/fixtures/interop/v25-09-sp5.js`) now (1) waits for the effect ledger to settle
  (no growth for 8 s, no `pending` row, ≤ 300 s; the same rule as addendum 2) before any switch, then (2) opens the
  group, waits for ST's save to settle, opens the chat only once the group lists it, and repeats until the page is on
  the target or the step's timeout. The chat-B creation step keeps `adoptsNewChat: "other-group"`. No C1–C5 check or
  pass rule changes. Run ×1 (as C4), stories and helper from the pin.

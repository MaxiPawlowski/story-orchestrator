# v2.5 plan 09 — SP5 story-owned scenario spike report

**Verdict: pending on the live legs** (2026-09-26). Every deterministic leg PASSES (C1 plumbing, C2, C3, C5; C4 has no
deterministic leg), so no condition has failed and the spike code stays, behind its flag, until the live legs run ×2. The worth
review (rule 8) is written after them, not here.

The conditions are plan 09's predeclared table (`09-research-spikes.md` §SP5, committed in `9eaee9e4` before any code) and are
**never retuned** (rule 1). The live fixture and its expectation helper are committed before the spike code:
`test/scenarios/live-v25-09-sp5-scenario.json` (stories `live-v25-09-sp5.story.json`, `live-v25-09-sp5-none.story.json`; helper
`test/fixtures/interop/v25-09-sp5.js`, which recomputes the expected scenario from the AUTHORED story and the engine's
`visitedPath`, not from `src/runtime`).

## Conditions

| # | Condition | Measured by | Pass | Deterministic (jest, run once) | Live ×2 |
|---|---|---|---|---|---|
| C1 | Per-chat correctness | chats A (cp3), B (cp1), C (no story); switch A→B→C→A ×3, capture each request | scenario == path replay's, 100 %; none in C | plumbing half PASS: A/B/C hold three/one/none after the applies and leaves, A's hydrate adds no row; a write whose chat moved away is refused (2 cases). The condition itself is the live capture | **not measured** 2026-09-27 lane 3 ×2: both runs stop at step 9 (`extract`, C3's scripted read) on `a shared read needs a window or a chat reader` (`extractionCoordinator.ts:297` → `sharedRead.ts:100-104`, a product defect outside the spike); the C1 captures come after it. Record `test/journeys/records/v2.5-batch2/plan09/SP5/C1-C5/` |
| C2 | User override kept | a user-set override, then a checkpoint write, then leave | compare-and-set: `externally-changed` recorded, the user's text never clobbered | PASS: override first → one `externally-changed` row, `found` = the user's text, no duplicate on hydrate; story first, user edit, leave → nothing restored, restart → `refused: 1`, user text kept; control (no edit) → `reverted: 1` | **not measured** 2026-09-27 lane 3 ×2: both runs stop at step 9 (`extract`, C3's scripted read) on `a shared read needs a window or a chat reader` (`extractionCoordinator.ts:297` → `sharedRead.ts:100-104`, a product defect outside the spike); the C1 captures come after it. Record `test/journeys/records/v2.5-batch2/plan09/SP5/C1-C5/` |
| C3 | Rollback | rollback past a scenario-writing checkpoint | the previous scenario restored (a `RESTORABLE` row) | PASS: rollback since the hall's row → `reverted: 1`, the gate's scenario back, the replay adds no row; control: the row of an unregistered extension is not restorable | **not measured** 2026-09-27 lane 3 ×2: both runs stop at step 9 (`extract`, C3's scripted read) on `a shared read needs a window or a chat reader` (`extractionCoordinator.ts:297` → `sharedRead.ts:100-104`, a product defect outside the spike); the C1 captures come after it. Record `test/journeys/records/v2.5-batch2/plan09/SP5/C1-C5/` |
| C4 | Group | 3-member group | one scenario block in the request, not three | none: the block count is ST's prompt assembly, measured live only | **not measured** 2026-09-27 lane 3 ×2: both runs stop at step 9 (`extract`, C3's scripted read) on `a shared read needs a window or a chat reader` (`extractionCoordinator.ts:297` → `sharedRead.ts:100-104`, a product defect outside the spike); the C1 captures come after it. Record `test/journeys/records/v2.5-batch2/plan09/SP5/C1-C5/` |
| C5 | Competing cards | cards whose scenarios compete with a story that sets none | an author-view diagnostic names them; no player copy (rule 7) | PASS: a story with none names the two cards with a scenario, in the journal; controls (story sets one, user override, hydrate) name nothing | **not measured** 2026-09-27 lane 3 ×2: both runs stop at step 9 (`extract`, C3's scripted read) on `a shared read needs a window or a chat reader` (`extractionCoordinator.ts:297` → `sharedRead.ts:100-104`, a product defect outside the spike); the C1 captures come after it. Record `test/journeys/records/v2.5-batch2/plan09/SP5/C1-C5/` |

## Procedure (stated before measuring)

- The spike is `effects.scenario` on a checkpoint: a string sets the chat's scenario override, `null` or `""` clears it, a checkpoint
  without the key keeps what the path before it set (path replay, like `world_info`). It writes ST's per-chat override
  `chat_metadata.scenario`, which ST prefers over the card's (solo `script.js:3445`) and which replaces every member's collected card
  scenario in a group (`group-chats.js:561-567`). The user's own control for it writes the same key and saves
  (`script.js:9051-9054`). `getContext().chatMetadata` is the live object (`st-context.js:135`).
- Every write goes through the effect ledger as its own target, restorable, and chat-scoped like the Author's Note: leaving a chat
  never restores into the chat that is open next.
- The story writes only over an empty override or over its own last write. Anything else is the user's, and the write is refused
  and recorded `externally-changed` with what it found (C2).
- C5's author surface is the session journal (`getSessionJournal()`, the author/eval artifact the drawer never renders for a player)
  plus `assert-player-clean`. A drawer panel would be the `.b` build's; its player copy waits on the human sessions (rule 7).
- Deterministic legs run in jest once; the live legs run ×2 consecutive on one lane (rule 1, review #73). The live legs need no model:
  the request is ST's own dry-run assembly, and C3's two reads use `debugResponse` because the host effect is what is measured.
- C4's non-vacuity: the fixture plants a card scenario on each member in memory, switches the group to APPEND for the capture, and
  requires a control capture (override emptied in memory) that carries every enabled member's card scenario once.

## What was built (behind the flag; the flag is never flipped here)

| Piece | Where | In the prod entry graph |
|---|---|---|
| Effect-extension registry: target kind `extension`, restorable, chat-scoped like the Author's Note; the applier journals an extension's notes, records a refusal `externally-changed`, and runs the write through `withLedger` | `src/runtime/effectExtensions.ts`, `effectsApplier.ts` (`applyExtension`, `RESTORABLE`, `CHAT_SCOPED`), `effectHost.ts` (read/restore dispatch), `types.ts` (`EffectTarget`), author ledger label `MemoryPanels.tsx` | yes: the seam, empty in prod (nothing registers). Prod main entry 1,174,410 → **1,175,690 B** (+1,280; budget 1,250,000) |
| The spike: path replay of `effects.scenario`, own-write detection, refusal, competing-cards note | `src/runtime/spikes/sp5Scenario.ts` | no (dev chunk only) |
| Host wiring + flag `extensionSettings["story-orchestrator"].settings.spikes.sp5Scenario === true (the unified `SpikeSettings`, read through `getGlobalSettings()`)` (default absent = off) | `src/runtime/spikes/sp5ScenarioHost.ts`, loaded by `if (__SO_DEV__) void import(...)` in `runtime/index.ts` | no |
| ST seam: read/write `chat_metadata.scenario` for one chat id, the cast's card scenarios | `src/services/stHost/chatScenario.ts` | no |

D3 (plan 12): the three modules are on `devOnly.guard.test.ts`'s list (`src/runtime/spikes/**` + `chatScenario.ts`), with a negative
control (a planted static import of `sp5ScenarioHost` from `src/index.tsx` reaches all three and fails the guard). `grep sp5Scenario
dist/*.js` finds nothing; the dev bundle carries it as a separate chunk. On FAIL, defer or drop, rule 2 removes all of it: the four
spike files, the registry and its three hooks, the `extension` target kind and the label line.

Negative controls run on the deterministic legs (mutants, each caught): `CHAT_SCOPED` without `extension` → 2 failures (C1, C2
leave); `RESTORABLE` without `extension` → 3 failures (C2 restart and its control, C3); the refusal branch removed (`clobbers = false`) →
C2 fails; the competing note on every mode → C5's hydrate control fails.

## Live legs (pending; nothing live was run for this report)

The spike is dev-only and ST serves the main checkout's `dist/`, so the legs run from the main checkout once this branch is merged:

```bash
npm run build:dev && npm run serve:dev
node scripts/debug/st-lanes.mts run 1 -- scripts/debug/st-session.mts reload
node scripts/debug/st-lanes.mts run 1 -- scripts/debug/so-run-header.mts capture --label v25-09-sp5 --out test/journeys/records/v2.5-plan09/sp5/header-start.json
node scripts/debug/st-lanes.mts batch --lanes 1 --repeat 2 --strict --group 1759606632088 test/scenarios/live-v25-09-sp5-scenario.json
node scripts/debug/st-lanes.mts run 1 -- scripts/debug/so-run-header.mts diff test/journeys/records/v2.5-plan09/sp5/header-start.json
```

Both runs of the batch must pass (`green ×2` = the first two runs of the series, plan 10). Archive the two batch logs, the header
capture/diff and each run's `so-v25-sp5` record (printed by the last step) under
`test/journeys/records/v2.5-plan09/sp5/live-<bundle12>/`, then fill the Live column. Per condition, what a run's record holds:
C1 `C1.results` (10 captures, each `want/held/hits/card`), C2 `C2.order1` + `C2.order2`, C3 `C3.before/after`, C4 `C4.withOverride`
+ `C4.control` (members, planted), C5 `C5.group/solo` + `playerClean`. No model and no pass role is involved (rule 5 n/a): the requests are
dry-run assemblies and C3's two reads are `debugResponse`. ST version note (rule 3): the host facts above are verified on
`7c3994196`; the fixture records the lane's version in its run header.

## Gates (2026-09-26, on the code commit)

`npm run typecheck` 0, `typecheck:test` 0, `lint` 0, `npm test` 316 suites / 4353 tests pass (ownership census, fault matrix,
code-health ratchets, architecture budgets and D3 green), `ST_ROOT=C:/dev/SillyTavern-MainBranch npm run test:debug` 410/410,
`npm run build` (main 1,175,690 B) + `build:dev`, `ST_PUBLIC=… npm run test:release` 77 pass 0 fail (2 skipped), Storybook
(`storybook:build` + `test-storybook --index-json`) 37 suites / 261 tests. Judge uses untouched (all off).

## User decisions

None owed now. C5's player copy, if the spike passes and is included, waits on the human sessions (rule 7, U4-style).

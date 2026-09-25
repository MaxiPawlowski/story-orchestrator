# Plan 03 — Code health and budget headroom

**Status: DRAFT 2026-09-25 — awaits user approval.** Depends on plan 11 (legacy removal runs first: it deletes read
branches and narrows the types every item here touches). Plans 04 and 06 wait on this plan's coordinator lines; plan 12's
bundle budget (F1) is measured after its extractions; plan 13 (harness routing) builds on the model-call seam it types.
Verified against master `e7626d7` on 2026-09-25. **Step 0 re-measures everything below on the post-11 tree** (v2.4 rule 1).

Source rows: overview §03 outline, rules 11–13, V4, V5, V11; residue table rows routed to 03 (wall-clock flake, journey
fixture hash, `neverWritten`, in-flight meter miss); `research/prod-readiness-criteria.md` S2–S8, T1–T4, E1, E2, E4, F2,
F3, Q1t, Q3t; `research/code-health-audit.md` M2–M4, M6, L1–L4; Codex review Sol PR-18, Astra AE-04;
`v2.4/v2.5-seeds.md` §C (fixture hash, `neverWritten`, wall-clock, A25, A27, A28, A29); conditionally, legacy-inventory
I1/I2 if plan 11 step 7 records them moved here (rule 12, D10).

## Goal

The code meets predeclared structural guards **by extraction, never by raising a budget** (V4), and each guard can fail:

1. Manager ≤ 700 and every coordinator ≤ 560 effective lines, constants **lowered** to those numbers.
2. Every prod file ≤ 600; no function over 150 lines or 40 branches or nesting 5; no line over 200 chars.
3. Host access injected into coordinators; model calls through **one** injected `ModelCall` dep, routed by a `ModelRoute` (plan 13's seam).
4. No cycles, no dead exports, one definition per shared helper, one logger, a reviewed error-copy inventory.
5. Snapshot built at most once per state change; no wall-clock assertion or real sleep in jest.

## Scope / out of scope

In: the prod-readiness rows above; the four residue rows; seeds §C harness rows A25/A27/A28/A29 and the fixture hash;
AE-04's structural follow-up (the citation sweep itself is done, below); conditionally, I1/I2 required ownership (D10).

Out: R/D/F1/P/U/A rows and E3 (plan 12; D3's import-graph walker is **shared** with this plan's S7/Q3t guard, built
here); the curator write-ahead reconcile (plan 02 C10) and the A3 in-flight-generation harness half (plan 10 Phase 0
harness, H-a); the warden 4 s timeout
and TypeSafe terms row (06/12); a backend per lane and the matrix freeze (A31, E1 seed; plan 10); `memoryPairs` on the
write path (plan 04 — this plan only frees its line); CI (Q2t, plan 12).

## Verified current state (master `e7626d7`, 2026-09-25)

Measured with the guard's own formula (`src/runtime/architecture.test.ts:28`, 120-char effective width) over prod
`src/**/*.ts(x)` minus `*.test.*`/`*.stories.*`, and a TS-compiler-API scan (metric defined under S4). **Δ** = drift vs
the audit (master `1b4e642`) or the overview.

| Claim | Now | Δ |
|---|---|---|
| Budget constants | `MANAGER_LINE_BUDGET = 740`, `COORDINATOR_LINE_BUDGET = 620` (`architecture.test.ts:17-18`) | — |
| Manager | **740 / 740** eff (664 raw) | **Δ +4** vs 736 (overview, audit): **0 lines left** |
| `memoryCoordinator` | **619 / 620** (576 raw) | — |
| `extractionCoordinator` | **604 / 620** | Δ +3 vs 601 |
| `stagecraftCoordinator` | **601 / 620** | **Δ +17** vs 584 (AE-01 fix) |
| other coordinators | expansion 324, copilot 264, scene 223, pacing 124 | copilot Δ +14, scene Δ +35 |
| Prod files over 600 | 7: `DrawerTabs.tsx` 972, `engine/validate.ts` 830, `index.tsx` 760, manager 740, the three coordinators above | validate Δ +1 |
| Prod totals | 320 files, 37 914 raw, 40 916 eff | Δ +2 files, +565 eff |
| Lines > 200 / > 300 chars; max | **397** / 50; 1 291 (`runtime/judge.ts:1`, one import) | Δ +7 / +1 |
| Functions > 150 lines | 13: `SettingsPanel` 339 (`index.tsx:170`), `startRuntime` 284 (`runtime/index.ts:61`), `StudioCopilot` 278, `GraphPanel` 208, `QualityEditor` 201, `runDiagnostics` 196, `StoryEditor` 181, `MemoryTab` 179 (`DrawerTabs.tsx:195`), `CheckpointEditor` 168, `readOp` 160, `StudioModal` 160, `diffStories` 152, `registerSlashCommands` 152 | `startRuntime` Δ +3 |
| Branches > 40 | `readOp` 87 (`copilot/parse.ts:317`), `parseStoryV2` 44 (`engine/validate.ts:643`) | audit 89/45: metric differs; this plan's metric is the committed one |
| Nesting > 5 | `applyGeneration` 7 (`runtime/index.ts:289`), `consolidateTier` 6 (`memory/consolidate.ts:54`), `consolidateTierJudged` 6 (`:145`) | — |
| `@services/STAPI` in coordinators | 6 of 7: copilot `:17`, expansion `:13`, extraction `:15`, memory `:22`, pacing `:7`, stagecraft `:45` | — |
| Tests mocking STAPI | 121 of 139 `jest.mock` files; 19 under `coordinators/` | Δ +9 |
| Import cycle | `engine/index.ts:7` re-exports `replay.ts`, which imports `@pacing/index` (`replay.ts:1`) | — |
| Dead exports (audit list) | all 10 still 1 reference (their own declaration) | — |
| `isRecord` copies | 16 (list in audit §1.5, unchanged) | — |
| Withholding set | 4 copies + 1 superset: `generationLifecycle.ts:21`, `samplerOverlay.ts:27`, `worldInfoEvidenceHost.ts:8`, inline `stagecraftCoordinator.ts:525`; superset `talkControl.ts:13` | **Δ** audit counted 3 |
| `as unknown as` outside `stHost/` | 9 sites / 8 files (`graphPanelUtils.ts:130`, `judge/settings.ts:110`, `extras.ts:116,314`, `persistence.ts:93,97`, `roleSelfTest.ts:117`, `ProvisioningCard.tsx:66`, `fakeDocument.ts:36`) | audit prose says 7, its own list has 9 |
| Non-null `!` | 43 | Δ +1 |
| `console.*` | 47 under 10 prefixes (`[Story Orchestrator]` 25 … `[Story - STAPI]` 1); `console.log` at `stHost/authorNotes.ts:39` | — |
| Lint | `no-explicit-any: warn` (`.eslintrc.json:29`), `no-console: off` (`:39`); `lint:fix` omits `src/judge`; leftover `eslintConfig` (`package.json:38`) | — |
| Toolchain | `@types/react ^18.2.66` vs `react 19.1.1`; `eslint ^8.57.1`; `yaml` imported nowhere in `src/`/`scripts/` | — |
| Wall clock | `windowHygiene.test.ts:196-200` (`< 5` ms) | — |
| Real sleeps | 900 ms ×2 `scheduler.test.ts:276,301`; 1 200 ms ×3 `schedulerClear.review.test.ts:122,135,145` | line Δ vs audit `:258,283` |
| Snapshot | `getSnapshot()` rebuilds every call (`runtimeManager.ts:503-526`); 4 `useRuntimeSnapshot` roots (`index.tsx:120,171,529,614`) each rebuild per `notify()` (`:146`); 8 macro sites rebuild (`macros.ts:9,15,41,42,46-48,51`); 45 `notify()` sites | — |
| Settings render | `memoryModelLimit` (`index.tsx:40-43`) walks the profile preset on every render (`:480`) | — |
| Clean stop | `stopRuntime` (`runtime/index.ts:346-366`) never unmounts the 4 roots (`index.tsx:639,649,658,667`); `bindNavbarDrawerToggle` listener (`stHost/drawers.ts:8`) never removed | — |
| `typecheck:test` scope | `tsconfig.test.json` includes only `*.review.test.ts` + 3 files; its `$comment` records 18 pre-existing errors in 10 files | — |
| `neverWritten` | `memoryQueue.test.ts:230` returns `async () => true`, a Promise (always truthy); file outside `typecheck:test` | — |
| AE-04 | **done on master**: `9178162`, `74867d5` (two real defects AE04-L1/S1 fixed); the three cells now cite injecting tests (`faultMatrix.json:13,133,202`); counts 77/10/23/0 of 110 | **Δ** overview says "being corrected"; merge message said 76/10/24/0 |
| Journey fixture hash | `so-journey` writes no `fileSha256`; `attestationRules.mjs:129` already reads `record.fileSha256` | — |

Plan 11's measured savings are small: `liftLegacyChatSettings` leaves the manager (`:44,542`, H9) and the legacy pin
prompt leaves `memoryCoordinator` (`:341-342`, H11). Neither reaches S2 by itself.

## Host facts

Verified in the working ST tree (1.19.0, `package.json:118`). Rows land in the v2.5 host-facts section before use.

| # | Fact | Where | Status |
|---|---|---|---|
| 03-H1 | `PRESET_CHANGED` payload `{apiId, name}`; `CONNECTION_PROFILE_UPDATED` from connection-manager | `events.js:92,84`; vendored `stHost/events.ts:42,49` | verified |
| 03-H2 | Does saving an edited preset (`max_length`/`openai_max_context`) emit any event? | — | **to verify**; if not, F3 also invalidates on Recheck and panel open |
| 03-H3 | React 19 `Root.unmount()` is synchronous and safe on a detached container | react-dom 19.1.1 | to verify in jsdom (E4 test) |
| 03-H4 | `unregisterHostMacro` removes a macro on both engines | `stHost/context.ts` seam | to verify live (E4) |

## Design

Invariants: `.claude/rules/architecture.md` §Invariants. Every moved function with a census row is re-read after each of
its awaits (rule 13); census keys are `file#Class.method` (`test/findings/ownership-sites.json`), so a move **re-keys**
the row and the guard fails until the row is rewritten — that failure is the review point, not noise.

### D0 Declared before measuring (Sol PR-18)
Committed in one commit **before** any extraction, each guard **as a ratchet** with a planted offender that fails it.
**No commit leaves `npm test` red.** Each guard's committed offender list (in `test/findings/codeHealth.json`) equals the
measured list in §Verified; the guard fails on an offender absent from the list and on a listed entry that no longer
offends. A list may only shrink. S2's list must be empty before step 4 lowers `MANAGER_LINE_BUDGET`/`COORDINATOR_LINE_BUDGET`.
By the end of step 6 every list is empty except the D0 allowlists.

| Artifact | Content |
|---|---|
| `test/findings/codeHealth.json` | S4 metric definition; S8 helper allowlist + canonical homes; T1 `!` allowlist (≤ 5, reason each); T3 citation pattern + allowlist; dead-export allowlist (public format types in `engine/schema.ts` only) |
| `test/findings/errorCopy.json` | E2 inventory schema: `{site, template, surface: player\|author\|console, rawError: bool, silentCatch: "logs"\|"probe"\|null, verdict: pass\|fail, reason}` |
| Parallel-load recipe (Q1t) | `npx concurrently -n A,B,C,BUILD "npm test" "npm test" "npm test" "npm run build"`, run 3 times back to back on the dev box; the record states `node -v`, CPU model, `os.cpus().length`, free RAM. Pass = 9/9 jest runs green, 0 timing failures |
| S4 metric | function-like nodes with a body (declaration, method, arrow, function expression, constructor, accessor); length = end − start line + 1; branches = `if`, `?:`, `case`, `catch`, `for`/`for-of`/`for-in`, `while`, `do`, `&&`, `\|\|`, `??`, nested functions excluded; nesting = max depth of `if`/loops/`switch`/`try` |

### D1 One model-call surface: `ModelCall` over `ModelRoute` (plan 13's seam)
- **Today** coordinators call `callExtractionModel` directly (memory `:280,391`, extraction `:324,358,384,402`, stagecraft
  `:198`), each passing `profileId` and a `globalThis.storyOrchestratorDebug*Response` (17 reads in 7 files). Routing is a
  module-level mutable (`setProfileRouter`, `extraction/client.ts:54`; installed at `runtime/index.ts:64`).
- **Names follow plan 13** (`13-harness-routing.md:123-134`): `ModelRoute` is the route union, `resolveRoute` replaces
  `resolveProfile`, and `callExtractionReply` is the one dispatch point. This plan lands the union with its first kind
  only, `{kind: "profile"; profileId}` (a refusal stays the existing `config` failure), and the injected surface over it.
- **Design.** `src/extraction/modelRoute.ts` (pure types): `ModelRoute`; `ModelAsk = {role: PassRole, pass: ModelPass,
  maxTokens?, signal?, refuseIncomplete?, timeoutScale?, budget?, temperature?}`; `type ModelCall = (prompt, ask) =>
  Promise<ExtractionReply>` plus `askText(call, prompt, ask)` for the string/`refuseIncomplete` form. `ModelPass` is the
  closed list of passes (read, sceneSummary, shortTerm, epistemic, ledger, arcSummary, canon, supersession, curator,
  generation, critic, copilot, director).
- `runtime/modelCall.ts` builds the one `ModelCall` from settings, `resolveRoute` and a `pass → debug response` map, over
  `callExtractionReply(prompt, route, …)`. `setProfileRouter` (the module-level mutable) goes; the route is resolved per
  call from the injected settings.
- Coordinators, `runSharedRead` (`sharedRead.ts:167`), the scheduler host, `copilot/authoring.ts` and `generation/*`
  receive `model: ModelCall` (routing typed by `ModelRoute`) instead of calling `callExtraction*` with a `profileId`.
- **Plan 13 adds the `{kind:"harness", …}` member, its `resolveRoute` branch and its transport in `extraction/client.ts`
  and `runtime/modelCall.ts` only. It touches no coordinator** and no call site.
- **Plan 12 D1** edits one map (the debug responses) instead of 17 call sites.
- Guard: `callExtractionModel|callExtractionReply|sendConnectionProfileRequest` referenced only in `extraction/client.ts`,
  `runtime/modelCall.ts` and the measurement modules on plan 12's D3 list (`selfTest`, `liveSuite`, `roleSelfTest`,
  `roleCalibration`).

### D2 Host deps injected into coordinators (S6)
One typed host per coordinator, built in the wiring from STAPI (`runtime/coordinatorHosts.ts`):

| Coordinator | Host interface (today's imports) |
|---|---|
| memory | `MirrorHost` (the object literal at `:566`: `ensureLorebook`, `loadLorebook`, `upsertWIEntry`, `disableWIEntry`, `bindChatLorebook`, `currentChatOwner`, chat id) + `chat()` for `markStoryStart` (`:186`) |
| stagecraft | `CuratorWiHost` (`readWIEntry`, `readWIEntryAt`, `restoreWIEntryAt`, `updateWIEntryByUid`, `upsertWIEntry`, `enable/disableWIEntry`, `loadLorebook`), `PromptHost` (`set/clearStoryExtensionPrompt`), `chat()`, `playerName()` |
| copilot | `ProvisioningHost` (card, group, lorebook create/list, `readWIEntry`, `upsertWIEntry`) + `PromptHost` |
| extraction | `chat()`, `activeGroup()` |
| pacing | `PromptHost` |
| expansion | `playerName()` |

Guard: no module under `runtime/coordinators/` reaches `@services/*` through a value import, directly or transitively (the
D5 import-graph walker; `import type` edges ignored; a new `it` beside `architecture.test.ts:127`). Extend the host table:
memory also gets `PromptHost` + `readInjectedPromptBlocks` + `characterName()` + `activeGroup()` for `MemoryInjector`
(passed in through its deps at `memoryCoordinator.ts:75`), `VectorHost` (`vectorQuery`/`vectorInsert`/`vectorPurge`/
`capabilityState`) for `consolidationMatches`, and `TokenHost` (`countTokens`) for `entryTokens`. Extraction also gets
`RosterHost` (`getContext`/`getActiveGroup`/`hostSystemUserName`/`resolveGroupMemberId`) for `roster` (the helpers take the
host as a parameter, and the coordinator passes its injected one). The stagecraft `@extraction/client` edge closes through
D1's injected `ModelCall`. The 19 coordinator tests that `jest.mock("@services/STAPI")` move to fakes of these interfaces;
tests elsewhere are untouched. **Done** = the 19 coordinator tests carry no `jest.mock("@services/STAPI")`.

### D3 Extractions to the budgets (S2)
New units live in `src/runtime/` (not `coordinators/`), are constructed in the wiring and injected. They are a declared
list, `DELEGATED_UNITS = [memoryQueue, canonSynthesis, memorizeBacklog, curatorWriter]` (`managerWiring.ts` and
`coordinatorHosts.ts` are left out: they are where STAPI hosts get built). Two guards in `architecture.test.ts`:
(a) each listed unit has 0 `@services`/STAPI specifiers; its host arrives only through the D2 interfaces (`CuratorWiHost`,
`chat()`, the D1 `ModelCall`); (b) coordinators may import these units, and each other, as types only — the cross-import
regex widens from `\./` to any runtime-relative or `@runtime` specifier — and the listed units may not value-import a
coordinator. The units stay under `PROD_FILE_LINE_BUDGET = 600` and do not take `COORDINATOR_LINE_BUDGET`.

| From | Moves to | What | Est. eff lines out |
|---|---|---|---|
| `memoryCoordinator.ts:299-345` | `runtime/memoryQueue.ts`: a `MemoryQueue` class binding `MemoryQueueDeps` once | `queueDeps()` + the 9 queue delegates; the coordinator keeps one `queue` dep. Plan 04's `judge` dep lands **here**, not in the coordinator | ~50 |
| `memoryCoordinator.ts:349-422` | `runtime/canonSynthesis.ts` (`CanonSynthesis`) | `getCanon`, `canonStale`, `getCanonProse`, `regenerateCanon` (+ `canonInFlight`); callers at `:293,523` and the manager/expansion/stagecraft/copilot `getCanon` deps take the unit directly | ~75 |
| `memoryCoordinator.ts:563-574` host literal | D2 `MirrorHost` | | ~3 |
| `extractionCoordinator.ts:416-526` | `runtime/memorizeBacklog.ts` (`MemorizeBacklog`) | `runMemorizeBacklog`, `cancelMemorizeBacklog`, `backlogRead`, `memorizeWindows`, `runSceneWork`, `endBacklog`, `backlogStop`; deps: `applyAudit`, `commitBoundary`, memory, route, budget, ownership, save, status | ~115 |
| `stagecraftCoordinator.ts:283-290,334-440` (+ `uidTarget` `:115`) | `runtime/curatorWriter.ts` (`CuratorWriter`, over `CuratorWiHost`) | `markWriteAhead`, `writeOp`, `revertAppliedSince`, `restoreBefore`: the curator's host-write edge | ~120 |
| `runtimeManager.ts:100-198` (+ `selectionDeps` `:230-256`, `storyUpdateDeps` `:161-173`, `rollbackDeps` `:339-354`) | `runtime/managerWiring.ts`: `wireCoordinators(port)` | every coordinator constructor and deps literal; the manager hands one `ManagerPort` (engine, `loaded()`, `extras()`/`setExtras`, status, journal, owner, persist, notify) | ~95 |
| `runtimeManager.ts:503-526` | `snapshotBuilder.ts`: `snapshotSources(port)` | the sources literal (and D8's cache) | ~20 |
| per-call `profileId` + debug lines | D1 route | 2–3 lines per model call | memory ~6, extraction ~8, stagecraft ~3 |

Expected after: manager ~620, memory ~480, extraction ~480, stagecraft ~475 (estimates; step 0 re-measures on the post-11
tree). Then the constants are **lowered** to `MANAGER_LINE_BUDGET = 700`, `COORDINATOR_LINE_BUDGET = 560`.

- The stagecraft isolation guard (`architecture.test.ts:99-104`) names one path; it is widened to `curatorWriter.ts`, with
  a negative control (a planted `@memory` import in the new file fails it).
- The continuity-note writer stays in `stagecraftCoordinator` (`injectionRegistry.ts:22`); the warden is not moved.
- **Budget reservation.** The design lands with headroom under the lowered constants: manager ≥ 60, each of the three
  coordinators ≥ 60. Reserved: plan 04 ≤ 5 `memoryCoordinator` lines (its logic in `MemoryQueue`); plan 06 ≤ 15 manager
  lines; **plan 13: 0 coordinator lines** (its route kind lives in `extraction/client.ts` + `runtime/modelCall.ts`) and
  ≤ 10 manager lines for its `extras.modelCalls` ring (`13-harness-routing.md:199-203,301-302`); plan 05: ≤ 8
  `extractionCoordinator` lines (F3 chunk loop in `runEpistemicLedgerPass`, only if F3 builds; F1a edits the two existing
  stamps in place, `extractionCoordinator.ts:200-201`, and adds no net lines). A plan that needs more records
  budget-blocked (rule 12).

### D4 File, function and line size (S3–S5)
- **New guards** in `architecture.test.ts`: `PROD_FILE_LINE_BUDGET = 600` over every prod file; the S4 metric via the TS
  API (≤ 150 lines, ≤ 40 branches, nesting ≤ 5); 0 prod lines > 200 chars. Plus eslint `max-len: [error, 200]`.
- Splits, each file named after reading it at step 0:

| Offender | Split |
|---|---|
| `DrawerTabs.tsx` 972 | one file per tab under `components/drawer/tabs/` (`MemoryTab` 179 lines further split by section); the drawer-reads-snapshot guard (`:64`) already walks subdirectories |
| `index.tsx` 760, `SettingsPanel` 339 | `components/settings/SettingsPanel.tsx` composed of per-group components (story, extraction, roles, stagecraft, display); `index.tsx` keeps mount/retry and the Studio host |
| `engine/validate.ts` 830, `parseStoryV2` 44 br | `engine/validate/` per section (qualities, checkpoints, transitions, roster, effects, graph indexes) |
| `readOp` 160 / 87 br | an op-kind → reader table in `copilot/parse.ts` |
| `startRuntime` 284; `applyGeneration` nest 7 | one factory per subsystem under `runtime/wiring/` (scheduler, judge, lore, talk, scene, events); early returns |
| `consolidateTier(Judged)` nest 6 | extract the per-pair decision |
| `runDiagnostics` 196 | one function per check (8 checks) |
| the Studio editors, `GraphPanel`, `StudioModal`, `diffStories`, `registerSlashCommands` | per section / per command family |
| 397 lines > 200 chars | wrapped; `runtime/judge.ts:1` becomes a multi-line import |

### D5 Graph hygiene (S7, S8, Q3t)
- **One import-graph walker** (TS API, test support under `test/support/importGraph.ts`), shared with plan 12's D3: S7
  fails on any SCC in `src/**`; Q3t fails when a test-support module is reachable from `src/index.tsx`.
- Cycle: `export * from "./replay"` leaves the engine barrel; `replay.ts`, `utils/fakeDocument.ts` and
  `studio/stories/fixtures.ts` move to `test/support/` (or `src/**/testing/`, excluded from the entry graph).
- Dead exports: TS-API check, "exported and referenced nowhere in `src/`, `scripts/`, `test/`", allowlist from D0. The 10
  audited dead symbols are deleted; `src/services/__mocks__/` goes.
- One definition each, homes declared in D0: `isRecord` → `utils/guards.ts`; withholding set → `runtime/generationLifecycle.ts`
  (`WITHHOLDING_TYPES`, the other three and the inline check import it; `talkControl`'s superset composes it);
  `tokenize`/`jaccard` → `memory/similarity.ts`; `truncate` → `utils/string.ts`; FNV-1a → `runtime/hash.ts`; the popup
  context cast → one `stHost/popup.ts` helper. `normalize*` merges only where bodies are identical; the rest are renamed
  to say what they normalise. Guard: an AST scan fails on an allowlisted name declared outside its home, and on two
  function bodies with the same normalised text (≥ 3 statements) not in the allowlist.

### D6 Types and style (T1–T4)
- T1: 0 `as unknown as` outside `stHost/` (9 sites); `!` 43 → 0 or the ≤ 5 D0 allowlist; eslint
  `@typescript-eslint/no-non-null-assertion: error`.
- T2: lint and `lint:fix` take `src` (glob, not a hand list); `no-explicit-any`, `no-non-null-assertion`, `no-console`
  (except `utils/log.ts`) all `error`.
- T3 (V11): the scanner fails on a comment line matching the D0 citation pattern (plan/version/ticket ids, dates) unless
  it is a host-fact `file:line` citation (an ST path such as `script.js:1590`) or JSDoc on an exported `stHost/*` symbol.
  `tsconfig.json`'s prose comments count too.
- T4: `@types/react` 19; a supported eslint (9, flat config) with `@typescript-eslint` to match; `yaml` and the
  `eslintConfig` block removed; `npm audit --omit=dev` high/critical = 0.
- `typecheck:test` widens to `src/**/*.test.ts(x)`: the 18 recorded errors are fixed, `neverWritten` among them
  (`() => () => true`).

### D7 Robustness (E1, E2, E4)
- E1: `utils/log.ts` (`warn`/`info`/`debug`, prefix `[Story Orchestrator]`, debug off unless a dev build or a stored
  opt-in). All 47 calls move; the per-apply `console.log` (`authorNotes.ts:39`) becomes `debug`. Guard: `no-console`.
- E2: `errorCopy.json` inventories every template that reaches a toast, popup, drawer or status line, and every
  `catch {` (33). Pass: 0 `rawError` on `surface: player`; each silent catch is `logs` or `probe`. A jest test extracts
  the templates by AST and fails on one absent from the file. `so-ui assert-player-clean` gains an error-state sweep.
- E4: `startRuntime` returns and `stopRuntime` runs the disposer for everything it created: 4 React roots (`unmount`),
  the navbar click listener (kept handler), the `DOMContentLoaded` listener if still pending, the macros
  (`unregisterHostMacro`), the globals it set. A jsdom test (`@jest-environment jsdom`, `jest-environment-jsdom` is
  installed) counts roots, listeners and `storyOrchestrator*` globals to 0 after stop.

### D8 Snapshot and settings cost (F2, F3)
- F2: a `SnapshotCache` in the manager, invalidated by `notify()`, `persist()` and a `touch()` on the public writers that
  do neither today (e.g. `recordJudgeCall`, `runtimeManager.ts:402`). React roots and macros read the cache;
  `getSnapshot({fresh: true})` stays for debug reads. The host-read fields (`promptBlocks`, `chat`) are read at build, as
  now; macros do not read them.
- F3: `memoryModelLimit` is cached by `(profileId, preset name)`, invalidated on `PRESET_CHANGED` /
  `CONNECTION_PROFILE_UPDATED` (03-H1) and on Recheck (03-H2 fallback).

### D9 Tests and harness hygiene (Q1t, residue, seeds §C)
- Q1t: the `windowHygiene` 5 ms floor becomes a structural bound: the cleaner's regex/replace calls per message
  (spied) are the same for a 1 KB and an 8 KB message and ≤ the count measured red-first; the reply-path cost is a p95 in
  plan 10's live probe (rule 11). The 5 sleeps become `jest.useFakeTimers()` + `advanceTimersByTimeAsync` over the
  scheduler's `250 * 2 ** attempt` backoff (`scheduler.ts:490`). Guard: 0 `performance.now` in tests, 0 `setTimeout` > 50 ms
  outside fake timers.
- AE-04 structural check, **conditional**: a shape → injection-marker map (e.g. `delayedError` needs a held-then-rejected
  model call); a `covered` cell whose cited test body lacks its shape's marker fails. It lands only if it passes all 87
  current covered/partial cells (swept by AE-04) and fails the three pre-fix citations (`9178162^`). Otherwise recorded
  "not built: false positives".
- `so-journey` writes `fileSha256` per record (the attestation predicate already reads it).

### D10 I1/I2 required ownership (conditional; rule-12 intake from plan 11 step 7)
Only if plan 11 step 7 records I1/I2 as moved here: `beginRun(ownership: RunOwnership, …)` (`runtime/runToken.ts:152`) and
`new EffectsApplier(ownership, …)` (`effectsApplier.ts:172`) become required. All 14 `ownership?:` deps also become
required: the 6 coordinators, judge, loreSelect, memoryMirror, mirrorReaper, storyUpdate, talkControl, worldInfoNormalize
and effectsApplier. Tests use a named `testOwnership()` that never lapses. Guard: a jest case fails on any `ownership?:` or
`RunOwnership | undefined` in non-test `src/**`, with a synthetic offender. Done means legacy-inventory I1/I2 are closed,
which S1 requires.
- `so-journey` takes `cleanup.judgeMeter` only after in-flight judge calls settle (`v2.4/07-judge.md:1399-1401`).
- A25: `so-scenario` removes a library record an `expectFail` `import_story` added. A27: `live-v24-05-forced-pick.json`
  deselects its `SO-V2405 Lore` book at cleanup. A28: `so-run-header` captures each group's chat list. A29: `st-lanes run`
  streams child stdout line by line (`st-lanes.mts:62`).

## Order of work

| Step | What | Gate before the next |
|---|---|---|
| 0 | Re-measure on the post-11 tree; revise D3 estimates | table updated in this doc |
| 1 | D0 artifacts + every new guard as a ratchet, each with its planted negative control | each guard's committed offender list (in `test/findings/codeHealth.json`) equals the measured list in §Verified; the guard fails on an offender absent from the list and on a listed entry that no longer offends; the planted control fails the guard function in-test, so `npm test` is green |
| 2 | D1 `ModelCall` + `ModelRoute` (profile kind only) | full jest; `debug:typecheck` |
| 3 | D2 host deps, one coordinator per commit | census guard green after each |
| 4 | D3 extractions (memory, extraction, stagecraft after plan 02's write-ahead fix merges, then manager); lower constants | S2 guard green; census rows re-keyed |
| 5 | D4, D5, D6 | S3–S8, T1–T4 green |
| 6 | D7, D8, D9 (+ D10 if plan 11 moved I1/I2) | E/F/Q guards green; every ratchet list empty except the D0 allowlists |
| 7 | Live gates | below |

## Tests (red first, mutants, negative controls)

| Item | Red first | Mutant (must fail) | Negative control |
|---|---|---|---|
| S2 | the committed offender list at step 1 equals the measured list (4 files at 700/560) | re-raise a constant | a planted 561-line coordinator |
| S3/S4/S5 | guards fail on the 7 files / 13+2+3 functions / 397 lines | — | planted 601-line file, 151-line function, 41-branch function, 201-char line |
| S6 | the walker lists the direct imports plus the transitive paths (memoryInjector, consolidationMatches, entryTokens, roster, extraction/client) | re-add a value import of `../roster` without a host param | a planted coordinator that value-imports a planted helper which imports STAPI fails; a planted `import type` from STAPI passes |
| D3 units | the `DELEGATED_UNITS` guards list nothing on the post-move tree | — | a planted `@services/STAPI` import in `curatorWriter.ts` fails (a); a planted value import of `../memorizeBacklog` in a coordinator fails (b) |
| S7/Q3t | walker reports the engine↔pacing SCC; `replay` reachable from the entry | re-export `replay` from the barrel | planted two-file cycle |
| S8 | lists 16 `isRecord`, 4 withholding copies, the 10 dead symbols | redeclare `isRecord` in a module | planted duplicate body |
| D1 | a coordinator test with a fake `ModelCall` asserting `pass`/`role`/`signal` per call | a call that bypasses the route | planted `callExtractionModel` import in a coordinator |
| D3 | existing coordinator suites green before and after each move (behaviour-preserving) | delete a `stillOwns()` in a moved writer: the ownership census and its review test fail | — |
| T3 | scanner lists the current citations | — | a planted `// plan 99` line; a planted host-fact citation passes |
| E2 | lists templates missing from the inventory | a new `${error.message}` in a player surface | planted silent `catch {}` not in the inventory |
| E4 | jsdom test: roots/listeners/globals > 0 after stop | skip one disposer | — |
| F2 | 4 builds per `notify()`, 1 per macro | drop the `touch()` in `recordJudgeCall`: the memo-equals-fresh property fails | memo deep-equals a fresh build after every step of a scripted sequence |
| F3 | preset walk per render | cache without invalidation: a `PRESET_CHANGED` test fails | — |
| Q1t | the grep guard lists the 1 floor + 5 sleeps | a real 900 ms sleep | planted `performance.now` assert |

Mutation runs use `npm run mutate` on the moved writers (census `checked` rows) and the new guards.

## Live gates

Runtime- and ST-facing code moves, so the CLAUDE.md tier applies: real LLM, lane, ×2 consecutive, `--strict`,
run-header diff around the batch = 0 undeclared, records under `test/journeys/records/v2.5-plan03/`.

| Gate | Covers |
|---|---|
| J1, J5, J7, J8, J9, J10 ×2 | memory/canon/queue, extraction, curator writer + warden, copilot provisioning host, persistence, after the moves |
| `test/scenarios/live-v24-03-memorize.json` ×2 | `MemorizeBacklog` (window + whole-chat pass, Stop) |
| `so-turn-types-check.mts`, `so-mutation-check.mts` ×2 | boundaries and rollback through the new wiring |
| E4 disable/enable cycle ×2 | extension disabled then enabled in ST: 0 roots, 0 listeners, 0 globals between; one real turn after re-enable |
| Q1t load recipe ×3 | D0 recipe, archived with its environment line |

Machine gates: `typecheck`, `typecheck:test`, `lint`, `test`, `test:debug`, `debug:typecheck`, `build`, `test:release`,
`test-storybook:ci`; `st-session.mts reload` after every build.

## Risks

- **Moves hide ownership regressions.** A moved writer keeps its body but loses its census row name; the guard fails until
  re-keyed (intended). Rule 13 re-reads every write after each await in a moved function, and the D3 mutant proves it.
- **Merge conflict with plan 02** in `stagecraftCoordinator` (write-ahead reconcile) and `effectsApplier` (C1). The
  stagecraft split waits for 02's fix; effectsApplier is not moved here.
- **Snapshot staleness.** A writer that neither notifies nor touches would serve a stale macro. The memo-equals-fresh
  property and its mutant are the guard; `getSnapshot({fresh})` stays for debug scripts.
- **eslint 9 flat config** is a config rewrite with rule-name drift; if it breaks more than lint setup, T4 records eslint 8
  as a deferral for the user, never a loosened T2.
- **Test churn**: 19 coordinator tests move from `jest.mock` to fakes. A fake that re-implements host behaviour is the
  same problem in a new place, so fakes record calls and return fixed values only.
- **Estimates in D3 are not measurements.** If a move lands short, the next table row is taken; the constants still go
  to 700/560.

## Unresolved questions

1. T3: do "why" comments at ownership edges (e.g. the `canonInFlight` `finally`, `memoryCoordinator.ts:416-419`) count as
   narration under V11? This draft keeps comments that carry no plan/version/date id; the guard enforces ids only.
2. T4: if eslint 9 cannot land cleanly, may eslint 8 stay as a signed deferral?
3. T1: allow the ≤ 5 `!` allowlist, or require 0?
4. Q3t: test support in `test/support/` (outside jest's `src/*` roots, needs a `roots` change) or `src/**/testing/`?
5. AE-04 structural check: accept "not built" if the marker map yields any false positive, or hand-review each?

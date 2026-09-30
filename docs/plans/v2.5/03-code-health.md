# Plan 03 — Code health and budget headroom

**Status: CODE ITEMS DONE 2026-09-26, live gates pending (see Gate record (code items)); not accepted.** Drafted 2026-09-25. Depends on plan 11 (legacy removal runs first: it deletes read
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

### Step 0 re-measure (post-11/01/02 tree, master `06ea92d`, 2026-09-26)

Measured by `test/support/codeHealth.ts` (TS-API scanner, committed with step 1; the architecture formula, 120-char
effective width) over prod `src/**/*.ts(x)` minus `*.test.*`, `*.stories.*`, `__mocks__`. Δ = vs the table above.

| Claim | Now | Δ |
|---|---|---|
| Manager | **740 / 740** | — (plan 11 H9 saving spent by plan 01/02) |
| `memoryCoordinator` / `extractionCoordinator` / `stagecraftCoordinator` | **618** / **604** / **616** of 620 | −1 / 0 / **+15** (plan 02 C10 reconcile) |
| other coordinators | expansion 325, copilot 263, scene 223, pacing 124 | +1 / −1 / 0 / 0 |
| Prod files over 600 | 7: `DrawerTabs.tsx` 948, `engine/validate.ts` 849, `index.tsx` 783, manager 740, memory 618, stagecraft 616, extraction 604 | DrawerTabs −24, validate +19, index +23 |
| Prod totals | 326 files, 38 501 raw, 41 543 eff | +6 files |
| Lines > 200 / > 300; max | **394** / 50; 1 291 (`runtime/judge.ts:1`) | −3 / 0 |
| Functions > 150 lines | **14**: `SettingsPanel` 357, `startRuntime` 286, `StudioCopilot` 279, `createWiGating` 220 (new, plan 01), `GraphPanel` 208, `runDiagnostics` 204, `QualityEditor` 201, `StoryEditor` 181, `CheckpointEditor` 168, `MemoryTab` 162, `readOp` 160, `StudioModal` 160, `diffStories` 152, `registerSlashCommands` 152 | +1 |
| Branches > 40 | `readOp` 87, `parseStoryV2` 44 | — |
| Nesting > 5 | `applyGeneration` 7, `consolidateTier` 6, `consolidateTierJudged` 6 (the metric counts an `else if` as one level deeper, as the AST nests it) | — |
| Coordinators with a value import of `@services/STAPI` | 6 of 7 (all but scene) | — |
| Tests: `jest.mock` files / STAPI mocks / under `coordinators/` | 146 / 127 / 20 | +7 / +6 / +1 |
| Import cycle | 1 SCC: `engine/index.ts`, `engine/replay.ts`, `pacing/{guidance,index,shapes,steering,tension}.ts` | — |
| Test-only module in the entry graph | `engine/replay.ts` | — |
| Dead exports (exported, the name appears nowhere else in `src/`, `scripts/`, `test/`) | **31** (24 values, 7 types): the audit's 10 plus 21 left by plan 11's deletions and missed by the audit's method | +21 |
| `isRecord` copies | 15 (`persistenceMigration.ts` gone) | −1 |
| Withholding set | 3 sets (`generationLifecycle.ts:22`, `samplerOverlay.ts:27`, `worldInfoEvidenceHost.ts:8`) + 2 inline checks (`stagecraftCoordinator.ts:541`, `runtimeManager.ts:615`); superset `talkControl.ts:13` | +1 inline |
| FNV-1a | 5 bodies: `runtime/hash.ts:10`, `extraction/contract.ts:62`, `extraction/sharedRead.ts:93`, `memory/stores.ts:18`, `judge/loreRelevanceCalibration.ts:57` | audit said 2 |
| `as unknown as` outside `stHost/` | **7** sites / 7 files (`graphPanelUtils.ts:130`, `judge/settings.ts:110`, `extras.ts:269`, `persistence.ts:103`, `roleSelfTest.ts:108`, `ProvisioningCard.tsx:66`, `fakeDocument.ts:36`) | −2 (plan 11) |
| Non-null `!` / `console.*` / bare `catch {` | 43 / 45 (11 prefixes; `console.log` `stHost/authorNotes.ts:39`) / 33 | 0 / −2 / 0 |
| Wall clock / real sleeps | `windowHygiene.test.ts:196-198`; 900 ms ×2 `scheduler.test.ts:276,301`, 1 200 ms ×3 `schedulerClear.review.test.ts:122,135,145` | — |
| `notify()` sites / `useRuntimeSnapshot` roots | 47 / 4 (`index.tsx:124,175,551,636`) | +2 / — |
| Machine gates on `06ea92d` | typecheck 0, typecheck:test 0, lint 0, jest **275 suites / 3 975 tests** green, test:debug 313/315 (1 fail needs `dist/manifest.json`, green after a build) | — |

**D3 estimates re-read.** Every coordinator must reach 560 and the manager 700: memory −58, extraction −44, stagecraft −56,
manager −40 is the floor; the ≥ 60 headroom reservation makes it −118 / −104 / −116 / −100.

## Predeclared (D0, committed before measuring)

Written from the plan text before any of these were measured. Each item is fixed here; the measured lists that follow
(`test/findings/codeHealth.json`, `test/findings/errorCopy.json`) are read against it, never the reverse.

**S4 metric.** As §D0, with nesting counted literally: every `if` (including an `else if`, which the AST nests under its
`if`), loop, `switch` and `try` adds one level; nested function-like nodes are excluded from both counts and measured on
their own. Names: declarations by name, class members as `Class.member`, an arrow by its variable or property, an
anonymous callback as `<enclosing>>callback`. Offender key = `file#name`.

**S8 helper allowlist, canonical homes, scanner scope.**

| Name(s) | Home | Detected by |
|---|---|---|
| `isRecord` | `src/utils/guards.ts` | a declaration of that name anywhere else |
| `WITHHOLDING_TYPES` (quiet/impersonate) | `src/runtime/generationLifecycle.ts` | a `Set`/array literal holding exactly `"quiet"` and `"impersonate"` anywhere else, or a `=== "quiet"` / `=== "impersonate"` comparison outside the home and `stHost/` (ST's own generation types, `stHost/generation.ts`, are host facts, not our set) |
| `tokenize`, `jaccard` | `src/memory/similarity.ts` | a declaration of that name anywhere else |
| `truncate` | `src/utils/string.ts` | a declaration of that name anywhere else |
| FNV-1a | `src/runtime/hash.ts` | the offset basis `2166136261` / `0x811c9dc5` anywhere else |
| popup context cast | `src/services/stHost/popup.ts` (one helper) | `as unknown as` inside `popup.ts` more than once |

Scope: prod files (the S3 set). Duplicate bodies: every function-like node with ≥ 3 statements; normalised text = the
body's statements printed by the TS printer with comments removed and whitespace collapsed. Two or more with the same text
fail unless their `file#name` pair is in `duplicateBodyAllowlist` (empty at declaration). `talkControl`'s superset is
allowed by name only if it is built from `WITHHOLDING_TYPES`. Dead-export allowlist: exported types of
`src/engine/schema.ts` only (the public format).

**T1.** The `!` allowlist starts empty; an entry needs `file#name`, a count and a reason, ≤ 5 entries total (Q3 default:
aim for 0). `as unknown as` outside `src/services/stHost/**` has no allowlist.

**T3 citation pattern** (comment lines in prod `src/**` and in `tsconfig.json`; string contents are not comments):
```
/\bplan\s*\d{1,2}\b|\bv\d\.\d\b|\b(?:V|S|T|L|C|H|A|D|E|F|M|P|Q|R|U|X|AE|PR|J)\d{1,3}[a-z]?\b|\b\d{2}-H\d+\b|\b20\d\d-\d\d-\d\d\b/i
```
A matching line passes only if (a) every match on it sits inside a host-fact citation, i.e. an ST source path with a line
(`/[\w./-]+\.(?:js|mjs|cjs):\d+(?:[-–]\d+)?/`, e.g. `script.js:1590`), or (b) it is inside a JSDoc block attached to an
exported declaration in `src/services/stHost/**`. Other comments carry no rule here (Q1 default: "why" comments without an
id stay).

**E2 error-copy inventory.** Schema as §D0. Rows are extracted by AST from prod, keyed `file#enclosing-function` +
normalised template text (no line numbers), and are:
1. every string or template literal passed as the first argument to a toast (`toastr.*`, an injected `toast(...)`) or
   popup seam (`showConfirmPopup`, `showChoicePopup`, `showTextPopup`);
2. every template literal, anywhere, that interpolates `.message`, `String(<x>)` of a caught value, or an identifier
   named `error`, `err`, `e`, `cause` or `reason`;
3. every bare `catch {` and every `.catch(() => <constant>)`.

`surface`: **player** = toasts, popups, the settings panel, the drawer's player tabs, the HUD, `pipeline.text`, `/story`;
**author** = author view, Studio, `pipeline.detail`, journal, `/cp`; **console** = logger only. Pass: no row with
`rawError: true` and `surface: player`; every row of kind 3 has `silentCatch` `logs` or `probe`; a row absent from the
file fails the jest guard, and so does a stale row.

**Q1t parallel-load recipe.** From the extension root, 3 times back to back:
```
npx concurrently -n A,B,C,BUILD "npm test" "npm test" "npm test" "npm run build"
```
Record per run: exit code, each jest's `Tests:` line, timing failures (a test that fails on time and passes alone); and
once: `node -v`, CPU model and `os.cpus().length`, `os.freemem()`. Pass = 9/9 jest runs green, 0 timing failures.

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

## Gate record (code items)

2026-09-26, branch `worktree-agent-a9c5f1b41d85d15fc`. Step 0 measured on `06ea92d`; master merged twice (`0ae7107`: plans
01/02/07, no conflicts, 4 new long lines and 3 silent-catch rows absorbed in `bb5b4b2`; `af57f96`: docs only). Every
step below landed green on the machine gates before its commit. **Nothing live was run** (the brief forbids lanes and
main ST), so the plan's live gates are listed as pending at the end and this plan is **not accepted**.

### Budgets (effective lines, 120 chars per started line)

| File | Step 0 (`06ea92d`) | After master merge (`bb5b4b2`) | Final | Budget | Headroom |
|---|---|---|---|---|---|
| `runtime/runtimeManager.ts` | 739 (constant 740) | 634 | 548 (+ `managerDelegates.ts` 119) | 700 | 152 |
| `coordinators/memoryCoordinator.ts` | 618 | 498 | 500 | 560 | 60 |
| `coordinators/extractionCoordinator.ts` | 604 | 473 | 480 | 560 | 80 |
| `coordinators/stagecraftCoordinator.ts` | 616 | 444 | 450 | 560 | 110 |
| `coordinators/expansionCoordinator.ts` | — | ~325 | 332 | 560 | 228 |
| `coordinators/copilotCoordinator.ts` | — | 262 | 262 | 560 | 298 |
| `coordinators/sceneCoordinator.ts` | — | 223 | 223 | 560 | 337 |
| `coordinators/pacingCoordinator.ts` | — | 126 | 126 | 560 | 434 |

`MANAGER_LINE_BUDGET` 740 → 700 and `COORDINATOR_LINE_BUDGET` 620 → 560 (`ddbee01`), now also pinned by the code-health
guard (a re-raised constant fails, mutant M1). Largest prod file: `extraction/scheduler.ts` 551 (< 600). The later
growth after the merge (manager +14, coordinators +2 to +7) comes from the S5 wrap and D8. The manager and
coordinators were re-wrapped with hanging comma breaks (`004a895`), so the one-element-per-line list style only
applies elsewhere.

### Ratchets (`test/findings/codeHealth.json`)

S2, S3, S4 (lines, branches and nesting), S5, S6, S7, Q3t, T1 (unknownCasts and nonNull), T3, E1, D1 and Q1t are all
empty. S8 has helpers, withholding, duplicates and dead empty and `popupCasts` 1 (the one allowed cast in
`stHost/popup.ts`). S8 `fnv` holds **one entry**, `judge/loreRelevanceCalibration.ts` `requestKey`. It returns a number
that keys the recorded lore golden, and judge purity forbids `@runtime/hash`, so removing it would mean moving the
predeclared D0 home after measuring. It stays listed, so `closed` stays **false**. `test/findings/errorCopy.json` has 69
rows, 0 failing, and `closed: true`.

### Machine gates (final tree, merge `1ee38d0` + the F2 property and S2 pin)

`bash .debug/p03gates.sh final build` ran `npm run typecheck`, `npm run typecheck:test`, `npm run lint`,
`npm run debug:typecheck`, `npx jest --runInBand`, `npm run build` (with `ST_PUBLIC` set, because the default path
resolves wrong in a nested worktree), `npm run test:release` and `npm run test:debug`:

| Gate | Result |
|---|---|
| typecheck / typecheck:test / lint / debug:typecheck | exit 0 / 0 / 0 / 0 |
| jest | 293 suites passed + 1 skipped (`gateReplay.records`, which skips itself with no archive), 4087 tests passed + 1 skipped |
| build | bundle `1dde57a16f85`, source `7bdf950668fe`, ST 1.19.0 |
| test:release | 37 pass / 0 fail |
| test:debug | 334 pass / 0 fail |
| Storybook | 37 suites / 261 tests. `storybook build` then `test-storybook --index-json` via `.debug/sb.sh`; `test-storybook:ci` fails in a nested worktree, as the plan 11 record documents |

`typecheck:test` now covers `src/**/*.test.ts(x)`. The widening found **123** errors in 56 files, not the recorded 18,
because the test corpus grew. All are fixed with no runtime value changed (`1ee171d`); the full list is under
Deviations.

**Q1t load recipe** (`npx concurrently -n A,B,C,BUILD "npm test" "npm test" "npm test" "npm run build"`, 3 times back
to back): node v22.22.0, Intel i9-9900 @ 3.10 GHz, 16 logical CPUs, 7.9 GB free of 31.9 GB. Runs 1, 2 and 3 each
exited 0, and all 9 jest runs were `1 skipped, 4086 passed, 4087 total`. 0 timing failures. **Pass.** The recipe ran
before the last test addition, which added 1 test.

**Mutations** (`test/findings/mutations/v25-03.txt`): **17 of 17 killed**, covering S2, S6, Q3t/S7, S8, D1, D3
(CanonSynthesis token check), E2 (raw error text, planted silent catch), E1, E4 (macro unregister, registry globals),
F2 (no `touch`), F3 (no invalidation), Q1t (900 ms sleep), T3, S5 and T1. Baseline and restored runs were both
110/110.

**Negative controls added this segment:**
- eslint `max-len` 200: planted 201-char line errors, a 200-char line passes.
- `no-non-null-assertion` and `no-explicit-any`: a planted `!` and a planted `any` error.
- `no-console`: fails outside `utils/log.ts` and passes inside it.
- Mount registry: the no-dispose control keeps its listener, timer and globals live.
- `stopRuntime`: control holds macros and globals, mutants killed.
- Snapshot cache: the no-`touch` control and the memo-equals-fresh sequence property.
- Context limit cache: the no-invalidate control.
- Q1t: a per-chunk cleaner exceeds the bound; advancing 100 ms instead of 1200 fails the fake-timer tests.
- A25: tracking only the reported hash leaves the record behind.
- A27: the fixture's own steps never remove the book.
- A28: identical chat lists produce no difference.
- A29: lines that arrived at different times get different stamps.
- Judge settle: with no judge call, the meter is read after one quiet window.
- E2 sweep: a raw `TypeError`, a stack frame, `NaN` or `[object Object]` on a player surface is a finding.

### What was built (per item)

- **D4.**
  - Studio UI splits (`5b47882`): S4 lines are empty.
  - S5 wrap tool (`.debug/wrap.cjs`, TS AST: list breaks, split string/template/JSX-text literals, precedence-safe
    parens, JSX attribute strings only without `\`/`&`): 384 edits plus 7 by hand, including two regex alternations split
    into `.some()` entries (equivalent).
  - eslint `max-len: [error, 200]`.
- **D6.**
  - T1 (`6d56990`): 0 `as unknown as` outside stHost. 43 non-null assertions became 0, via local narrowing, type-guard
    filters, `Reflect`, and `required()` where the `!` would have thrown. The ≤ 5 allowlist was not needed.
  - T2: lint takes `src` whole; `no-explicit-any`, `no-non-null-assertion` and `no-console` are errors.
  - T3 (`38956e3`): 618 citation lines stripped of their ids with the prose kept; host `file:line` citations and stHost
    JSDoc untouched.
  - `typecheck:test` widened (`1ee171d`).
- **D7** (`20bcd39`).
  - E1: `utils/log.ts`. `debug` is off unless `process.env.NODE_ENV === "development"` (webpack inlines it) or
    `localStorage["story-orchestrator:debug"] === "on"`. All 45 console calls moved; `authorNotes` apply logging is now
    `debug`.
  - E2: the 8 fail rows fixed. Logged catches in cues, vector purge, both talkControl fallbacks, Studio download and the
    warden check. Neutral copy plus a log for the expansion-merge status and the context-limit reason. `so-ui
    assert-player-clean` gains an error-state sweep over every player surface on every tab.
  - E4: `utils/mountRegistry.ts`. `index.tsx` routes its 4 roots, created elements, navbar listener (via the disposer
    `bindNavbarDrawerToggle` now returns), `DOMContentLoaded`, mount-retry timers and 3 globals through it.
    `stopExtension` is exposed as `globalThis.storyOrchestratorStop` for the live cycle. `stopRuntime` now unregisters
    every macro `registerRuntimeMacros` registered and deletes every runtime `storyOrchestrator*` global.
- **D8** (`f9804c7`).
  - F2: `SnapshotCache`, invalidated by `notify()`, `persist()` and `touch()` (`recordJudgeCall`).
  - F3: `contextLimitCache` keyed by (profile, preset name), invalidated on `PRESET_CHANGED`,
    `CONNECTION_PROFILE_UPDATED` and Capabilities Recheck.
- **D9** (`4a169d3`).
  - Q1t: structural bound. Replace/split/match/test calls per message are equal for 1 KB and 8 KB and ≤ 17, the
    red-first measurement. `exec` is excluded because `replace` drives it once per match. The 5 sleeps moved to fake
    timers.
  - so-journey `fileSha256`, plus a judge-request settle before the meter read.
  - A25, A27 (so-scenario runs a fixture-level `cleanup: {steps}` in its `finally`), A28 (`inventory.groupChats`), A29.
- **AE-04: not built.** Measured with a shape→marker map over the cited test bodies, 42 of 96 covered/partial cells fail
  (the injection usually lives in helpers outside the cited body), and 1 of 3 pre-fix citations (`judgeRing|aborted`
  at `9178162^`) passes. It fails both admission conditions (`.debug/ae04.py`).
- **D10: not triggered.** The plan 11 record says I1/I2 were finished there and not moved.

### Answers to the unresolved questions

1. T3: comments without an id stay; only ids and dates were stripped.
2. T4: **blocked**. The extension shares ST's `node_modules`. Upgrading `@types/react` to 19, moving to eslint 9 flat
   config, removing `yaml` and running `npm audit --omit=dev` would mutate the shared tree, which this plan is not
   allowed to do. This is a deferral for the user, and T2 was not loosened.
3. T1: 0, no allowlist.
4. Q3t: `test/support/`, with the jest `roots` change (D5).
5. AE-04: not built, because the false positives are measured.

### Deviations

- **D1.** `resolveRoute` lives in `passProfiles`.
- **D3.**
  - Coordinators construct their own delegated units.
  - The manager's 67 one-line delegates moved to an abstract `CoordinatorDelegates` base (`managerDelegates.ts`).
- **D4.**
  - The S3 guard is the every-prod-file ratchet.
  - New settings groups and tabs have no `.stories.tsx` of their own; they are covered through their parents' stories.
  - StudioCopilot and GraphPanel hook extraction reorders effect declarations; behaviour is unchanged and Storybook is
    green.
  - The S5 wrap also covers the 51 long lines in `.stories.tsx` files, because `max-len` applies to the whole lint
    scope.
- **D5.**
  - `studio/stories/fixtures.ts` was not moved.
  - `src/services/__mocks__` was already absent.
  - The judge FNV copy is kept (see Ratchets).
  - `src/types/cytoscape-dagre.d.ts` was deleted. It was in no tsconfig, and linting `src` whole made it a parse error;
    `citations-known.json` lists the removal.
- **E2.** The inventory excludes JSX text. The context-limit reason no longer carries the host's message, and
  `contextLimit.test` asserts the new contract: the message goes to the log.
- **D7** landed as one commit, because E1/E2/E4 share files (`consolidationMatches`, `errorCopy.json`, `index.tsx`).
- **F2 is inverted from the plan's shape.** `getSnapshot()` stays fresh for its 38 internal callers, several of which
  read right after a mutation and before any notify (e.g. the load path hands it to `applyCheckpoint`). React roots and
  macros read `getCachedSnapshot()`. The plan's `getSnapshot({fresh: true})` is therefore unnecessary.
- **Tests.** Test-only casts from the `typecheck:test` fix:
  - `undefined as never` in `consolidate.test.ts:79`: `applyConsolidation` gained a required `at` that the test never
    passed.
  - `as unknown as` in pacingCoordinator, stagecraftCoordinator ×3, journal, memoryQueue, nextTurn ×3, repair,
    saveEvidence and storyUpdate tests.
  - Duplicate keys resolved to the value that already ran (boundaryWork, sceneCoordinator).
- **Scripts.** Three new scripts carry explanatory comments, matching `scripts/debug` convention. T3 scopes only `src/`.

### Live pending (not run; each needs a lane, real LLM, ×2, `--strict`, run-header diff = 0 undeclared)

| Gate | Command / recipe |
|---|---|
| J1, J5, J7, J8, J9, J10 ×2 | `st-lanes.mts batch --lanes 1,2 --repeat 2 --strict J1 J5 J7 J8 J9 J10`; records under `test/journeys/records/v2.5-plan03/` |
| MemorizeBacklog | `so-scenario run test/scenarios/live-v24-03-memorize.json --sandbox --group <id>` ×2 |
| Boundaries and rollback through the new wiring | `so-turn-types-check.mts` and `so-mutation-check.mts` ×2 |
| E4 disable/enable cycle ×2 | ST disable, then enable, **or** `globalThis.storyOrchestratorStop()` + reload. Between: 0 roots (`#so-drawer`, `#so-hud-root`, `#so-studio-root`, settings root absent), 0 `storyOrchestrator*` globals, `{{story_title}}` unresolved. Then one real turn after re-enable |
| E2 sweep live | `so-ui.mts assert-player-clean` in player mode on a chat with a failed pass (backend down); must read clean |
| F2/F3 live | the macro still resolves after a boundary (`{{story_current_checkpoint}}` in a sent prompt); the Capabilities memory-model line follows a preset edit (`PRESET_CHANGED`) and Recheck |
| Harness rows (plan 10 H-b to H-f) | A25 `v24-02-settings-save-swallowed.json` and `v24-02-unrecognized-blob.json` leave `inventory.v2Stories` unchanged; A27 `live-v24-05-forced-pick.json` leaves `lorebookCount`/`lorebooksSelected` unchanged; A28 a run-header diff shows `inventory.groupChats`; A29 an `st-lanes run` log carries per-line stamps; H-f a journey record carries `fileSha256`; judge settle `cleanup.judgeSettle.settled: true` on a J8 judge-on run |
| Reply-path cost p95 | plan 10's live probe (rule 11); the jest side is now structural |

After every build on a lane: `node scripts/debug/st-session.mts reload`.

### Merge of master `c743bedd` (2026-09-26)

Conflicts resolved keeping both sides:
- `stHost/persistence.ts`: master's C2 `switchRefusal` (refuses a late-bound save of ours whatever its rows), `ChatSaveTarget`, and the `storyOrchestratorSaveRefusals` ring are taken as-is. Plan 03 only strips the citation prefix from the comments.
- `worldInfoGating.ts`: master's G5 `fallBack`/`settle` moved into the `WiGatingRuntime` class (`private fellBack`, `this.fallBack()` when the capability is not present, and `deactivate` clears it). The ownership census row for `WiGatingRuntime.syncOnce` says so.
- `runtime/index.ts`: `readGatingModeWith(...)` is registered as the first disposer of `startRuntime`, before `startScheduler`.
- C1 (`guardHostStream` in `EffectsApplier.speak`) and C7 (the transition note before the onEnter effects in `commitBoundary`) auto-merged into the refactored files. Both are verified present.
- Debug harness: master's H1 exact library restore (`lib/librarySnapshot.mts`, `planLibraryRestore`) replaces `removableStories`. A25 is subsumed by H1: restoring the pre-run library removes a refused import's record without tracking its hash. Plan 03's `addedStoryHashes` and its per-step library diff are therefore dropped. The A25 test and its control are restated over `planLibraryRestore`. `fixtureSha256` and `trackJudgeRequests` stay in so-journey.

Gates after the merge:

| Gate | Result |
|---|---|
| typecheck, typecheck:test, lint, debug:typecheck | exit 0 |
| jest | 296 suites, 4111 tests pass |
| build (`ST_PUBLIC` set) | exit 0 |
| test:release | 37 pass, 0 fail |
| test:debug | 343 pass, 0 fail |
| Storybook (`--index-json`) | 37 suites, 261 tests pass |

Budgets (effective lines) are unchanged:

| File | Lines | Budget |
|---|---|---|
| runtimeManager | 548 | 700 |
| memoryCoordinator | 500 | 560 |
| extractionCoordinator | 480 | 560 |
| stagecraftCoordinator | 450 | 560 |
| expansionCoordinator | 332 | 560 |
| copilotCoordinator | 262 | 560 |
| sceneCoordinator | 223 | 560 |
| pacingCoordinator | 126 | 560 |

## Gate record (v2.6 carry-over, bundle f8eaa0675102)

| Row | Result |
|---|---|
| E2 sweep live | green x2, `test/scenarios/e2-failed-pass-player-clean.json` (a real failed pass, no key) |
| E4 disable/enable cycle | red first: `storyOrchestratorWizardAgent` outlived `storyOrchestratorStop` (lazy Studio chunk, module-scope global). Fixed via `ui.global`; guard `src/studio/lazyGlobals.guard.test.ts`, replay `studio-chunk-global-outlives-stop`. Then green x2 (roots 4 to 0, globals 17 to 0, macro unresolved, reload restarts). The one real turn after re-enable is a final-suite row |
| `so-mutation-check.mts` | green x2 |
| `so-turn-types-check.mts --image synthetic --skip-reply` | run 1 green; run 2 green except `d-solo` (no usable solo character left on the lane: harness pool) |
| J1/J5/J7/J8/J9/J10, MemorizeBacklog, F2/F3, reply-path p95 | need a model: final suite (journeys section, 01-v25-03) |

Full record: `docs/plans/v2.6/01-carry-over-proof.md` §Gate record (no-LLM half, 2026-09-30); records under `test/journeys/records/v2.6-01/`.

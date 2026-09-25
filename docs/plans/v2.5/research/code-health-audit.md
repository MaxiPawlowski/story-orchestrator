# Code-health audit — Story Orchestrator, master `1b4e642` (2026-09-25)

Read-only research for v2.5 ("prod ready at the end of 2.5"). Legacy/compat code is out of scope (a separate inventory).
No build, no `dist/` write, no `src/` edit. Every number below was measured on 2026-09-25 with the tools in §Method.

## Method

| Tool | What it measured |
|---|---|
| TypeScript compiler API over `src/**` (`node_modules/typescript` 5.4.2, a script outside the repo) | import graph and cycles, exports never imported, function length / branch count (cyclomatic-ish) / nesting, `as` casts, `!`, comment tokens |
| The `architecture.test.ts` formula (`effectiveLines`, 120-char width) | effective lines per file |
| esbuild in memory (`write: false`, nothing written) over `src/index.tsx` | bundle composition by package/dir. Webpack's `dist/index.js` is the size of record |
| grep/ripgrep, `curl -o /dev/null -w %{http_code}` against the running ST | patterns, served files (status codes only, nothing downloaded) |

"prod" = `src/**/*.ts(x)` minus `*.test.*` and `*.stories.*`: **318 files, 37 404 raw lines, 40 351 effective lines**.
Tests: 255 files, 2 272 `it`/`test` cases (67 `*.review.test.ts`, 3 `*.guard.test.ts`). Stories: 34.

## Severity summary

| # | Sev | Finding | Evidence |
|---|---|---|---|
| H1 | High | **No user install path.** `manifest.json:6` loads `dist/index.js`, `dist/` is gitignored (`.gitignore:14`), and `manifest.json:12` sets `auto_update: true`. ST's "Install extension" clones the repo: that clone has no bundle, and an auto-update pulls sources without rebuilding. README step 2 asks users for `npm ci && npm run build` (`README.md:43-47`) | no git tags, no packaging script in `scripts/release/` |
| H2 | High | **Debug and measurement surface ships in the bundle.** There are 22 distinct `storyOrchestrator*` globals in `dist/index.js`. 12 of them are `storyOrchestratorDebug*Response`: when one is set, it silently replaces the real model output of a pass. Also shipped: the full `RuntimeManager` handle, the live-suite and scan-gating handles, and about 82 KB of calibration/self-test source | §1.6 |
| H3 | High (dev install) / Medium (release) | **The extension folder is HTTP-served whole.** ST serves `public/` with `express.static` defaults (`src/server-main.js:242`). Measured `200` for a `.debug/*.json`, for `.debug/chromium-profile/Default/Preferences`, for `docs/plans/v2.5/00-overview.md` and for the stale `dist/index.js.map`. `.debug/` is 245 MB, and 185 MB of it is a Chromium profile (Cookies, Login Data). `config.yaml` has `listen: true` (whitelist on) | §6 |
| M1 | Medium | **Monkeypatches global `fetch`**, and the patch can refuse ST's own chat-save requests (`services/stHost/persistence.ts:108-149`, `switchRefusal` → `refusedAnswer`). Every other extension's fetch passes through it. It re-wraps whenever a peer replaces `fetch` | §3 |
| M2 | Medium | **Size pressure beyond the two guarded files.** `DrawerTabs.tsx` is 972 effective lines (largest, unguarded) and `index.tsx` 760 (a 339-line `SettingsPanel` inside it). The manager is at 736/740, `memoryCoordinator` 619/620, `extractionCoordinator` 601/620. `startRuntime` is a 281-line function. 390 prod lines exceed 200 chars (max 1 291) | §1.1–1.3 |
| M3 | Medium | **Coordinators import the host directly**: 6 of 7 import `@services/STAPI` (WI writes, extension prompts, card/group creation). `rules/architecture.md` says they get constructor-injected deps. 112 test files `jest.mock` STAPI | §1.4 |
| M4 | Medium | **Snapshot rebuilt uncached.** `getSnapshot()` rebuilds on every call (`runtimeManager.ts:500`, serializes the engine). There are 4 React roots, each rebuilding per `notify()` (`index.tsx:143-149`; 45 `notify()` call sites), plus one rebuild per `{{story_*}}` macro resolution (`macros.ts:9-51`). The settings panel re-reads the profile preset on every render (`index.tsx:40-43,480`) | §4 |
| M5 | Medium | **Bundle 1 817 880 B (507 938 B gzip).** Cytoscape is about 29 % of it (443 KB of esbuild's 1.51 MB) and is imported statically (`GraphPanel.tsx:2`), although only the author-only Studio uses it. `dist/` is never cleaned: a stale `index.js.map` (4.4 MB, Feb) and a vendors chunk (Nov 2025) are still served. No `performance` budget, so webpack emits its 2 default size warnings | §4 |
| M6 | Medium | **The comment rule is not followed.** `working-style.md` says "No code comments", but prod has 1 394 comment tokens / 1 708 comment lines, and 190 of 317 files have at least one. At least 574 lines cite plans, ticket ids or dates | §2 |
| L1 | Low | Duplicated helpers: `isRecord` ×16, a "quiet/impersonate" set ×3 (+1 superset), `normalize*` ×8, `tokenize` ×3, `jaccard` ×2. 9 dead values + 1 dead type. One import cycle (engine ↔ pacing), caused by the test-only `runReplay` in the engine barrel | §1.5 |
| L2 | Low | Test hygiene: the 5 ms wall-clock floor. Real sleeps of 1 200 ms ×3 and 900 ms ×2. No CI, no coverage. a11y `color-contrast` disabled globally. 6 components have no story, and neither does `SettingsPanel` | §5 |
| L3 | Low | Toolchain drift: `@types/react` 18.3 vs `react` 19.1. eslint 8.57 (EOL). A leftover `eslintConfig: react-app` (`package.json:38`). `lint:fix` omits `src/judge`. The `yaml` dependency is unused. `no-explicit-any` is only a warning | §2 |
| L4 | Low | Console noise: 47 `console.*` calls under 10 prefixes. One `console.log` fires on every Author's Note apply (`stHost/authorNotes.ts:39`) | §3 |
| L5 | Low | The UI links into internal plan docs: `JudgeSettingsGroup.tsx:124` → `docs/plans/v2.3/recommended-config.md`. That link breaks as soon as a release ships without `docs/` | §7 |

## 1 Structure

### 1.1 Largest prod files (effective lines, the guard's formula)

| File | Raw | Eff | Max line | >200 ch | Guarded |
|---|---|---|---|---|---|
| `components/drawer/DrawerTabs.tsx` | 842 | **972** | 399 | 27 | no |
| `engine/validate.ts` | 776 | 829 | 237 | 3 | no |
| `index.tsx` | 684 | **760** | 384 | 23 | no |
| `runtime/runtimeManager.ts` | 661 | **736 / 740** | 388 | 11 | yes |
| `runtime/coordinators/memoryCoordinator.ts` | 576 | **619 / 620** | 255 | 4 | yes |
| `runtime/coordinators/extractionCoordinator.ts` | 525 | **601 / 620** | 338 | 11 | yes |
| `runtime/coordinators/stagecraftCoordinator.ts` | 540 | 584 / 620 | 252 | 4 | yes |
| `copilot/parse.ts` | 529 | 578 | 674 | 3 | no |
| `extraction/scheduler.ts` | 478 | 505 | 504 | 4 | no |
| `runtime/index.ts` (wiring) | 369 | 397 | 482 | 5 | no |

The other coordinators: expansion 324, copilot 250, scene 188, pacing 124. `src/runtime/` is flat: 85 prod files plus 7 coordinators.
Longest single lines: `runtime/judge.ts:1` (1 291 chars, one import), `copilot/prompts.ts:279` (848), `copilot/parse.ts:551` (674).
The effective-line guard stops packing inside guarded files only. There are 390 lines over 200 chars and 49 over 300 across prod.

### 1.2 Largest / most branchy functions (5 264 functions scanned)

`>80` lines: 21; `>150` lines: 13; branch count > 20: 33; > 40: 2; nesting ≥ 5: 8.

| Function | Lines | Branches | Nest | Where |
|---|---|---|---|---|
| `SettingsPanel` | 339 | 28 | 0 | `index.tsx:170` |
| `startRuntime` | 281 | 4 | 1 | `runtime/index.ts:61` |
| `StudioCopilot` | 278 | 11 | 1 | `studio/components/StudioCopilot.tsx:67` |
| `readOp` | 160 | **89** | 3 | `copilot/parse.ts:317` |
| `parseStoryV2` | 127 | 45 | 1 | `engine/validate.ts:641` |
| `buildRuntimeSnapshot` | 134 | 37 | 0 | `runtime/snapshotBuilder.ts:57` |
| `consolidateTierJudged` | 79 | 35 | **6** | `memory/consolidate.ts:145` |
| `syncMemoryMirror` | 74 | 35 | 3 | `runtime/memoryMirror.ts:88` |
| `applyGeneration` | 27 | 10 | **7** | `runtime/index.ts:286` |
| `diffStories` | 152 | 24 | 2 | `engine/storyDiff.ts:104` |

### 1.3 God objects

- **`RuntimeManager`**: about 134 method definitions, 43 of them private, and 45 imports. Its budget has 4 lines left.
- **`runtime/index.ts`**: `startRuntime` is 281 lines that build every service, and it writes 8 globals. It is a composition root without structure: no factory per subsystem.
- **`index.tsx`** mixes the mount/retry loop, the Studio host, the reveal/scroll helpers, the global handles and the whole settings panel (`SettingsPanel`, 339 lines). It has no story and no guard.
- **`DrawerTabs.tsx`** (972 effective lines) holds every tab's body. Only its presentational children have stories.

### 1.4 Pure logic vs host access

| Dir | Files importing STAPI / stHost | Note |
|---|---|---|
| engine, pacing, generation, talk, wizard, stagecraft, judge, copilot | 0 | pure, as designed |
| extraction | 2 / 24 (`chatWindow.ts`, `client.ts`) | host seams, acceptable |
| memory | 1 / 22 (`inject.ts`) | documented exception |
| runtime | 35 / 85 | expected for a runtime layer |
| **runtime/coordinators** | **6 / 7** | `stagecraftCoordinator.ts:43-46` (12 WI/prompt host calls), `memoryCoordinator.ts:21-22`, `copilotCoordinator.ts:14-17` (card/group/lorebook creation), `extractionCoordinator.ts:15`, `pacingCoordinator.ts:7`, `expansionCoordinator.ts:13` |
| studio | 1 / 8 (`StudioModal.tsx`) | UI reaching the host directly |
| `index.tsx` | direct host imports (`index.tsx:3`) | UI reaching the host directly |

The invariant says coordinators "get constructor-injected deps … tests fake by injecting deps". In practice they are faked by
`jest.mock("@services/STAPI")` (112 test files), which re-implements host behaviour inside the tests.

### 1.5 Import graph, dead code, duplication

- **One runtime import cycle** (7 modules): `engine/index.ts:7` re-exports `replay.ts`, whose `replay.ts:1` imports `@pacing/index`, and every pacing module imports `@engine/index`.
  `runReplay` is used only by 3 test files. Moving it out of the barrel breaks the cycle and takes it out of the bundle.
- **Exports never imported by prod code**: 84 values and 155 types. Most are used only inside their own file (the `export` is unnecessary). 104 values are imported **only by tests**.
- **Dead** (no reference anywhere in `src/`, `scripts/` or `test/`): `constants/defaults.ts:3 DEFAULT_INTERVAL_TURNS`, `runtime/continuity.ts:57 establishedFactTexts`,
  `runtime/pipeline.ts:37 PIPELINE_LIVE_STATES`, `studio/mutations.ts:78 setCheckpointTalkControl`, `utils/dataHelpers.ts:1,7,20` (`cloneStructured`, `isNonArrayObject`, `trimStringRecord`),
  `utils/string.ts:5 normalizeName`, `utils/writeResult.ts:16 describeFailure`, type `runtime/memoryActions.ts:53 MemoryActions`. `src/services/__mocks__/` is empty.
- **Duplicated helpers**:

| Helper | Copies | Sites |
|---|---|---|
| `isRecord` | 16 | `copilot/parse.ts:37`, `engine/validate.ts:42`, `engine/worldInfoEffects.ts:8`, `extraction/windowHygiene.ts:33`, `generation/parse.ts:4`, `judge/settings.ts:59`, `runtime/effectsApplier.ts:55`, `runtime/persistence.ts:12`, `runtime/persistenceMigration.ts:16`, `runtime/settingsStore.ts:79`, `stHost/connectionProfiles.ts:12`, `stHost/contextLimit.ts:10`, `stHost/judge.ts:25`, `stHost/modelReply.ts:49`, `stHost/samplerOverlay.ts:14`, `studio/components/EffectsEditor.tsx:6` (the dead `dataHelpers.isNonArrayObject` is a 17th) |
| "quiet/impersonate withholds" set | 3 (+1 superset) | `runtime/generationLifecycle.ts:21`, `runtime/samplerOverlay.ts:27`, `runtime/worldInfoEvidenceHost.ts:8`; `runtime/talkControl.ts:13` adds swipe/continue |
| `normalize*` name/key | 8 | `judge/director.ts:28`, `memory/consolidate.ts:36`, `memory/epistemic.ts:12`, `runtime/worldInfoScanHost.ts:61`, `stagecraft/proposal.ts:5`, `talk/parse.ts:8`, `talk/rules.ts:4`, `utils/string.ts:5` (dead) |
| `tokenize` / `jaccard` | 3 / 2 | `memory/parse.ts:7`, `memory/similarity.ts:15,19`, `stagecraft/fuzzy.ts:10`, `memory/conflicts.ts:241` |
| `truncate` | 3 | `extraction/inputBudget.ts:67`, `runtime/fingerprints.ts:55`, `stagecraft/prompt.ts:4` |
| FNV-1a | 2 | `runtime/hash.ts:9`, re-inlined at `judge/loreRelevanceCalibration.ts:57` |
| `getContext() as unknown as {callGenericPopup…}` | 3 | `stHost/popup.ts:14,54,88` |

### 1.6 Debug-only surface in the shipped bundle

| Global | Written at | Read by prod code? | Purpose |
|---|---|---|---|
| `storyOrchestratorRuntime` | `index.tsx:48` | no | whole manager (about 90 public methods) for debug scripts |
| `storyOrchestratorStudioDraft`, `…StudioTabs` | `index.tsx:49-50` | no | journey probes |
| `storyOrchestratorScheduler` | `runtime/index.ts:143` | no | debug read |
| `storyOrchestratorJudge` | `runtime/index.ts:153` | **yes**: `index.tsx:187,216`, `liveSuite.ts:50` | a global used as a UI↔runtime channel |
| `storyOrchestratorLore` | `runtime/index.ts:191` | no (write-only) | debug |
| `storyOrchestratorLoreEvidence` | `runtime/index.ts:210` | no | debug |
| `storyOrchestratorScanGating` | `worldInfoScanHost.ts:92` | no | spike debug |
| `storyOrchestratorLiveSuite` | `liveSuite.ts:82` (always registered, `runtime/index.ts:13`) | no | live-suite harness |
| `storyOrchestratorDebug{Extraction,Generation,SceneSummary,ShortTerm,Supersession,ArcSummary,Canon,Epistemic,Ledger,Copilot,Director,Curator}Response`, `…SelfTestResponses` | read at `extractionCoordinator.ts:282,324,359,385,403,478`, `memoryCoordinator.ts:283,394,553`, `stagecraftCoordinator.ts:194`, `expansionCoordinator.ts:224,238,269`, `copilotCoordinator.ts:45`, `runtime/index.ts:71,263`, `selfTest.ts:172` | **yes, on the live path** | any value set in the page **replaces the real model reply** for that pass. `rules/debug-scripts.md` already records a leftover mock fact reaching the next run "and so would a real player" |
| `talkControlInterceptor` | `runtime/index.ts:273` | host (`manifest.json` `generate_interceptor`) | legitimate, required |

Also shipped: `runtime/liveSuite.ts` (94 lines), `runtime/selfTest.ts`, `runtime/roleSelfTest.ts`, `judge/*Calibration.ts`, `judge/selfTestCases.ts`,
`judge/loreRanking.ts`/`loreScore.ts`, `stagecraft/createCandidate.ts`: **81 894 bytes of source** for measurement harnesses, reachable from
`runtime/judge.ts:1` and `judge/index.ts`. `utils/fakeDocument.ts` is test-only (3 importers, all tests) but lives in `src/utils`.

## 2 Type and lint hygiene (AST counts, prod only)

| Item | Count | Where / note |
|---|---|---|
| `any` keyword | 0 (AST) | the grep hit `memory/canon.ts:29` is `as any` inside a string. `stHost/capabilities.ts:61` is the word "any" in a string |
| `as T` casts (excl. `as const`) | 331 | top: `runtime/judge.ts` 20, `copilot/parse.ts` 19, `stHost/persistence.ts` 17, `engine/validate.ts` 13, `runtime/persistence.ts` 12, `runtime/extras.ts` 10 |
| `as const` | 105 | fine |
| `as unknown as` | 24 | 17 in `stHost/*` (host boundary, expected). 7 outside it: `components/studio/graphPanelUtils.ts:130`, `judge/settings.ts:110`, `runtime/extras.ts:116,314`, `runtime/persistence.ts:93,97`, `runtime/roleSelfTest.ts:117`, `studio/components/ProvisioningCard.tsx:66`, `utils/fakeDocument.ts:36` |
| Non-null `!` | 42 | 8 in `DrawerTabs.tsx:590,607`, 4 in `judge/scene.ts:239-240`, 3 in `snapshotBuilder.ts:138`, `runtimeManager.ts:649` (`this.loaded!`) |
| `eslint-disable` / `@ts-expect-error` / `@ts-ignore` | 0 / 0 / 0 | 7 `eslint-disable` in tests only |
| TODO/FIXME/HACK | 0 | |
| Comment tokens / lines | **1 394 / 1 708** | 282 JSDoc blocks. 190/317 files commented. Heaviest: `runtime/types.ts` 68, `stHost/persistence.ts` 64, `runtime/runOwner.ts` 43, `runtime/effectLedger.ts` 39. ≥ 574 lines cite `plan NN`, `v2.x`, `V22b`-style ids or dates. The tsconfig carries prose comments too (`tsconfig.json:4-6,15-19`) |

Lint config (`.eslintrc.json`): `no-explicit-any` is `warn`. `no-non-null-assertion` and `consistent-type-assertions` are not enabled, `no-console` is `off`.
The lint target list is hand-enumerated (`package.json` `lint`), and `lint:fix` already drifted: it omits `src/judge`.
tsconfig is `strict` without `noUncheckedIndexedAccess`, `noImplicitOverride`, `noUnusedLocals` or `exactOptionalPropertyTypes`.

## 3 Error handling and robustness

| Item | Measured | Note |
|---|---|---|
| `catch` blocks (prod) | 85, of which 33 bind nothing (`catch {`) | about 20 return a neutral value immediately (`null`/`[]`/`undefined`/`"unknown"`), e.g. `stHost/persistence.ts:88,231,265`, `stHost/worldInfo.ts:65`, `stHost/groups.ts:42`, `talkControl.ts:240,267`. Most are host probes, where that is correct. None logs the reason |
| `.catch(() => null/undefined/false)` | 6 | `generation/critic.ts:97`, `generation/generate.ts:77`, `stagecraftCoordinator.ts:457`, `effectsApplier.ts:349`, `mirrorReaper.ts:133`, `extraction/scheduler.ts:195` |
| `console.*` in prod | 47 (45 warn, 1 info, 1 log) | 10 prefixes (`[Story Orchestrator]` 25, `[Story - GraphPanel]` 7, `[Story WI]` 4, `[Story A/N slash]` 3, …). No logger, no level switch |
| Raw `error.message` in UI copy | 7 distinct templates | e.g. `Not applied to this chat: ${error.message}`, `Expansion merge failed: ${error.message}` |
| Global `fetch` wrapper | `stHost/persistence.ts:137-149` | installed lazily, re-wraps when displaced, can **refuse** a chat save (`:112-116`). A cross-extension compatibility risk that no live check with other fetch-wrapping extensions covers |
| Unbounded collections | none found on hot paths | the judge cache (`JUDGE_CACHE_LIMIT`), prompt-cost cache (500), save evidence and journal rings are all capped. `JudgeRuntime.unbilled` (`runtime/judge.ts:31`) is keyed per chat and cleared on billing; low risk |
| Timers / listeners | disposers exist (`runtime/index.ts:350-363`) | mount polls 50×100 ms (`index.tsx:674-676`), slash registration polls 100×100 ms (`runtime/index.ts:58`). `bindNavbarDrawerToggle` (`stHost/drawers.ts:8`) and the `DOMContentLoaded` listener are never removed. React roots are not unmounted on stop |

## 4 Performance

| Item | Measured |
|---|---|
| `dist/index.js` | **1 817 880 B**, gzip 507 938 B (build `3dd039b`, dirty) |
| Composition (esbuild in memory, 1.51 MB total) | `cytoscape` 443 KB, `src/runtime` 251 KB, `react-dom` 174 KB, `src/studio` 105 KB, `src/components` 90 KB, `src/judge` 64 KB, `lodash` 46 KB (via dagre), `src/memory` 45 KB, `src/engine` 44 KB |
| Author-only weight in the entry chunk | cytoscape + dagre + graphlib + lodash about 530 KB, plus studio 105 KB. Only `cytoscape-dagre` is lazy (`GraphPanel.tsx:159`) |
| Stale files served from `dist/` | `index.js.map` 4.46 MB (Feb 18), `vendors-…cytoscape-dagre…index.js(.map)` (Nov 1 2025), `111.index.js` (Sep 24). `webpack.config.js:8` has no `output.clean` |
| Webpack config | no `performance` block, so the 244 KiB defaults fire 2 warnings every build. `LiveReloadPlugin` sits in the production plugin list (`webpack.config.js:73`), though it is absent from the output |
| Snapshot | `getSnapshot()` is uncached (`runtimeManager.ts:500`). Per `notify()`: 4 React roots × `buildRuntimeSnapshot` (134 lines, 37 branches), plus the macro-sync and scene-sync subscribers. Each `{{story_title}}`/`{{story_tension}}`/`{{story_blackboard}}`/scene macro rebuilds a snapshot (`macros.ts:9-51`) |
| Settings render | `memoryModelLimit` walks the Connection Manager and preset manager on every render (`index.tsx:40-43,480`) |

## 5 Tests

| Item | Measured |
|---|---|
| Wall-clock assertion | `extraction/windowHygiene.test.ts:190-201` (`< 5 ms`, 3 recorded flakes). No other `performance.now` asserts |
| Real sleeps | 1 200 ms ×3 (`extraction/schedulerClear.review.test.ts:122,135,145`), 900 ms ×2 (`extraction/scheduler.test.ts:258,283`), a 5 ms `flush` (`scheduler.test.ts:25`). Only 10 files use fake timers |
| `skip`/`only`/`todo` | 0 |
| Host re-implemented in tests | 112 of 130 files that call `jest.mock` mock `@services/STAPI` |
| Prose asserts | 50 `toContain("…≥30 chars…")`, 46 `toBe("…≥40 chars…")`. Copy edits break them. Some are the intended copy contract (player text) |
| Test-only code in `src` | `utils/fakeDocument.ts`, `engine/replay.ts`, `studio/stories/fixtures.ts`. 104 values exported only for tests |
| Jest | `diagnostics: false` (type errors pass). No coverage config. No CI (no `.github/`) |
| Storybook a11y | `color-contrast` disabled for every story (`.storybook/preview.ts:25-29`). No story for `drawer/MessageCitation`, `drawer/ScenePanel`, `studio/components/{EffectsEditor,PrimitiveValueInput,QualityReadEditor,SnapshotEditor}`, or `SettingsPanel` (it lives in `index.tsx`) |

## 6 Security and privacy

| Item | Finding |
|---|---|
| Served tree | ST serves every file under the extension (measured `200` on `.debug/…json`, `.debug/chromium-profile/Default/Preferences`, `docs/plans/…md`, `dist/index.js.map`). `.debug/chromium-profile` (185 MB, created by `scripts/debug/st-session.mts:106`) holds `Cookies` and `Login Data`. The lanes rule already moved lanes out of `public/`; `.debug` itself was not moved. A release artifact without `.debug/`, `docs/` or `test/` fixes this for users |
| Off-box calls | Main and memory model calls go to the user's own Connection Manager profiles. The judge (off by default) sends `state` + questions to `https://api.typesafe.ai/v1/systemone` (`server-plugin/…/index.mjs:26`). `TYPESAFE_BASE_URL` can redirect it. The README names the plugin but never says chat content leaves the machine or to whom |
| Secrets | The judge key is read server-side only: ST secrets per user, then `TYPESAFE_API_KEY`, then `~/.typesafe/api-key/.env` (`index.mjs:18,59-70`). The env/dotenv fallbacks are **shared across every ST user** in multi-user mode. The browser never reads the key back. No secret found in `src/` or `dist/` |
| HTML injection | 0 `dangerouslySetInnerHTML`/`innerHTML` in prod. Popups escape strings through a text node (`stHost/popup.ts:39-45`). Toasts use constant strings (`stateExport.ts:23,26`) |
| Debug-response globals | any script in the page can substitute model output without a trace (§1.6) |
| Tracked dev artefacts | `.mcp.json`, `opencode.json`, `.claude/**` (49 files), `review-studio-mobile.png`, `docs/review/2026-09-18/evidence/reviewed-source.zip` (4.4 MB). The git pack is 20.6 MiB, so every user clone downloads it |

## 7 Product-readiness gaps

| Area | State |
|---|---|
| Install | needs `npm ci && npm run build` (`README.md:41-47`). There is no release artifact, no tag and no packaging script. `auto_update: true` with untracked `dist/` gives a stale or missing bundle after an update |
| Versioning | `package.json:3`, `manifest.json:9` and `dist/manifest.json` all read **2.3.0**, while master carries v2.4 work. `CHANGELOG.md` stops at 2.3.0. 0 git tags |
| ST support policy | `manifest.json:10` declares `minimum_client_version: 1.18.0`, but README says 1.18.0 was never played through (`README.md:59-65`). No stated policy for newer ST releases |
| User docs | The README is developer-grade (macros, slash commands, extraction timing). Missing: uninstall/cleanup (per-chat mirror lorebooks, wizard-created cards), troubleshooting, a privacy/data-egress section, and a first-run walkthrough with screenshots. `docs/story-orchestrator-explained.html` (80 KB) is **untracked**; left untouched |
| First run | extraction is enabled with no profile, and the drawer says "not configured". Repair names one missing step (`runtime/repair.ts`). Speaker direction and copilot default on; curator, warden and every judge use default off |
| a11y | 126 `aria-*` attributes. The Storybook axe run excludes contrast. Nothing was checked against ST themes |
| i18n | no stance. 4 incidental hits, no `data-i18n`/`t` usage; English-only strings everywhere, including LLM prompts |
| UI → internal docs | `JudgeSettingsGroup.tsx:124` links to `docs/plans/v2.3/recommended-config.md` |
| Human evaluation | v2.1, v2.3 (L1/L7) and v2.4 sessions all outstanding (`v2.5/00-overview.md` §Human sessions) |
| Dependencies | `yaml` (runtime dep) unused. `@types/react@18.3.24` vs `react@19.1.1`. `eslint@8.57.1` EOL, `@typescript-eslint` v6 |

## Candidate v2.5 cleanup items (for plan 03 or a new plan)

1. Release packaging: a release branch/zip with `dist/` committed, an allowlist of files, a tag, and `manifest.json` `auto_update` pointed at it (H1).
2. Debug surface behind a build flag, or moved to a separately loaded debug module. Debug-response globals consulted only in dev builds (H2).
3. Move `.debug/` (at least `chromium-profile`) outside `public/`. `output.clean` in webpack (H3, M5).
4. Split `index.tsx` (settings panel into `components/settings/`), `DrawerTabs.tsx` (one file per tab) and `startRuntime` (one factory per subsystem), and extend the size guard to all prod files (M2).
5. Inject host deps into coordinators and add an architecture guard: no `@services/STAPI` under `coordinators/` (M3).
6. Memoize the snapshot per state version, cache the profile limit per profile change, and let macros read a cached snapshot (M4).
7. Lazy-load the Studio (cytoscape + studio) as a chunk (M5).
8. A comment policy decision, then a scanner guard (M6).
9. Shared `isRecord`/withholding set/normalize. Delete dead exports. Move `runReplay` out of the barrel. Add a cycle guard (L1).
10. Fake timers for the 5 sleeps, a structural bound for `windowHygiene`, CI, contrast back on (L2).

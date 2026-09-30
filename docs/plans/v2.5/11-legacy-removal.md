# Plan 11 — Legacy removal: one current shape, reset on anything else

**Status: DRAFT 2026-09-25 — awaits user approval.** Runs **first** in v2.5 (overview §Plan sequence). Depends on **V1**
(v2.4 plan 09 closes). Verified against master `e7626d7` on 2026-09-25; the inventory it builds on was measured on
`1b4e642`, and every row below was re-read at `e7626d7` (Δ marks drift). **Re-verify every path:line before building**
(v2.4 rule 1). Docs only so far: nothing here is built, and no data has been moved.

## Source rows

| Source | What it gives this plan |
|---|---|
| `research/legacy-inventory.md` §2 (H1–H21, A1–A8, C1–C5, I1–I3, T, D), §3 target, §4 order, §5 payoff | the row list and removal order |
| Overview rule 9, V7, V10 (Q1–Q6), §11 outline | v5 bump + reset; library kept; notice + confirmed Restart; books **moved, never deleted**; aliases → error with a hint; `schema: 1` baseline; real migrations only after the first public release |
| `research/review-codex-2026-09-25.md` PR-08 | inventory, destination, collision rule, manifest and byte-for-byte restore test predeclared **here**, before any data action |
| `research/prod-readiness-criteria.md:29` S1 | "0 rows open", proven by this plan's own guards (src/ and scripts+test) |
| v2.4 E9 + user decision 2026-09-25 | never released; no downgrade/compat work; chat story state may be reset; keep `test/journeys/records/**`, lane logs, journals |
| `13-harness-routing.md:5,127` | plan 13 lands its settings on this plan's `schema: 1` root |

## Goal

- One chat-blob shape (**v5**), read by one path. Every other stored value takes the existing T11 unreadable path: read
  detached, never written, replaced only by a confirmed Restart.
- Every field that is optional only for old state becomes required, and tsc proves the writers. The list is proven
  complete by the step-0 sweep, not inherited from the inventory.
- The library is keyed by id only; install-wide settings carry `schema: 1` and no history branches.
- One authoring vocabulary: a removed alias or an unknown key in the alias-bearing objects is a validation error with a
  did-you-mean hint.
- No `legacy`/`migrat` identifier left in `src/` outside the C1 host-engine label, nor in live `scripts/` and `test/`
  outside their allowlist (S1 guards, src/ and scripts+test).
- Orphaned mirror books and stale lane data are moved to a backup outside the ST tree, with a manifest and a verified restore.

## Scope / out of scope

**In:** H1–H21, A1–A3, A7, C2, C3, I1, I2, every T and D row they drag, the `schema: 1` stamp, the S1 guard, the one-time
data actions on this install and lanes 1–3.

**Out:**
- **C1** MacrosParser seam: ST's dual engine, not our history. It is the only guard allowlist entry.
- **C4** declared minimum and the clean-host-older leg: plans 10/12 (V10 Q4).
- **C5** capability probes and **I3** stub tolerance: kept.
- **A4–A6, A8**: kept shorthands.
- Comment narration beyond the removed lines: plan 03 (T3).
- Budget raises: none (V4). This plan frees **≈1** manager line and **≈2** `memoryCoordinator` lines (Δ, see below).
- Modifying the 59 old chat files: none. Each resets only on its own confirmed Restart (V10 Q2).

## Verified current state (master `e7626d7`, 2026-09-25)

### Install measurements (read-only re-run, same scan as inventory §1)

| Store | Now | vs inventory |
|---|---|---|
| Chat blobs (`data/default-user/{chats,group chats}`, 160 files) | 59 carry `story_orchestrator`: v2 **8**, v3 **41**, v4 **10**; 49 unstamped; 12 `legacy-` keys; 38 records without `engineHistory`; 24 without `visitedPath`; **5 without `pinnedStory`** | same; pin count new |
| Settings root `extensionSettings["story-orchestrator"]` | keys `v2Stories`, `settings`, `wizardSessions`; no `schema`; no `migratedFromChat` | same |
| Library | `adolion-academy` v11, `adolion-adventurer` v9, `so-j9-wizard` v1, `so-j9-fixme` v1; all ids present; only canonical keys in `requirements`/`stagecraft`/`agency` | canonical-key check new |
| Wizard sessions | `untitled` (has `createdLorebooks`), `untitled-story` (lacks it) | same |
| `worlds/Story Orchestrator - *` | **18** books, **0** carry `so-owner`: 8 fixed-name + 10 per-chat. 10 chats bind the 10 per-chat books (`chat_metadata.world_info`). No book is in `globalSelect` or `charLore` | "unmarked" now measured: all 10 |
| Lanes `C:\dev\so-lanes\{1,2,3}\data` | 623 / 772 / 493 MB; 19 / 18 / 18 SO books; `st-lanes.mts seed --fresh` **deletes** `data/` (`st-lanes.mts:77`) | new |

### Rows (eff. = effective lines touched, `architecture.test.ts:28` rule, width 120)

| # | Where at `e7626d7` | Δ vs inventory | eff. | Verdict |
|---|---|---|---|---|
| H1 | `runtime/persistenceMigration.ts:1-68`; `persistence.ts:2,65,92-98` | — | 81 | delete |
| H2 | `persistenceMigration.ts:25-27,33-35,53` | — | 7 | with H1 |
| H3 | `persistence.ts:55,240-242`; `types.ts:327-335`; `getMetadataBlob` stores a blob while **no chat is open** `persistence.ts:126-129` | types lines ±1; no-chat store site new | 12 | delete the null branch; store nothing with no chat open |
| H4 | `persistence.ts:243-249`; journal text `chatSave.ts:74` | **verified**: ST mints a new integrity only together with a new chat id (branch/checkpoint, `public/scripts/bookmarks.js:200-201,283-284`), and rename keeps it | 10 | keep the stamp; drop `onRestamp` + "adopted by a build that restamps" journal |
| H5 | `storySelection.ts:91-112` (pin-less hydrate), `:149-156`; `types.ts:313` `pinnedStory: unknown` | ranges shifted | 8 | `pinnedStory` required; the `removeStory` pin-less reload goes. The pinned-parse-failure fallback (`:99`) stays (defensive) |
| H6 | `storyLibrary.ts:37-63,74,80-86`; `librarySave.ts:57-62` | — | 44 | read-only sanitizer |
| H7 | `storyLibrary.ts:90-93`, **`:135-137` (`removeStoryRecord`)**; `storySelection.ts:82,91-92,149-151`; `runtimeManager.ts:261,263` | manager +1; `removeStoryRecord` site new | 4 | id only |
| H8 | `extras.ts:67-81,116-118` | — | 17 | delete |
| H9 | `settingsStore.ts:24,119,171-174,200-218`; `runtimeManager.ts:44,542`; dead reads `extras.ts:21-25,96,142,144,151,248` | manager `:539`→`:542` | 28 | delete |
| H10 | `memory/provenance.ts:6,65-86,106-110`; `extras.ts:3,92,103-104`; `memory/stores.ts:2,108`; `judge/scene.ts:183`; `stagecraft/types.ts:139`; `DrawerTabs.tsx:184-189,345-347`; `ConflictQueue.tsx:15-17`; `StagecraftPanel.tsx:78,86`; optional at `memory/types.ts:75,101,162` | — | 19 | `provenance` required |
| H11 | `runtime/types.ts:257`; `extras.ts:53,111,136`; `memoryCoordinator.ts:341-342`; `memoryActions.ts:6,15,29,45`; `DrawerTabs.tsx:216,258-268` | UI start `:213`→`:216` | 25 | delete |
| H12 | `extras.ts:257,260-267,278-279`; `generation/types.ts:84,97`; **`test/scenarios/live-v12-legacy-expansion.json`** | scenario not in inventory | 14 | keep the contract drop; delete the upgrade |
| H13 | `engine.ts:20,74-75,87-98,398`; **`engine/storyDiff.ts:273,284`** (optional-path prune) | storyDiff site new | 18 | `visitedPath` required; keep `repairActiveCheckpoint`, reword `:83` |
| H14 | `engine.ts:162-170` (`history.base` guard; `base` is already required at `:60`), `:400-404`; `types.ts:317-319` | — | 15 | keep null-history hydrate for `swapStory` (`runtimeManager.ts:585`); drop the `??` defaults |
| H15 | `extras.ts:92,102,105` | — | 6 | delete |
| H16 | `extras.ts:152`; `stagecraftCoordinator.ts:113-116,395-396,427-431` | **was `:106-109,381,410-414`** | 12 | a record without a uid is not reverted |
| H17 | `copilotCoordinator.ts:82-86`, **`:100` (`books ?? session.applied` in `recordCreated`)**; `wizardSessions.ts:77-79,83`; `wizard/types.ts:73-75` | second fallback new | 14 | `createdLorebooks` required, `[]` default |
| H18 | `memoryMirror.ts:74-82,147`; `mirrorReaper.ts:164` wording | — | 11 | delete E4; keep `leftoverComments` |
| H19 | `stories/lost-key.yaml` (161), `stories/sun-ruins/quest-for-the-sun-ruins.yaml` (352); `so-library.mts:36-53,97,108-113` | — | 25 + files | delete |
| H20 | `lib/assetScope.mts:8,25-32,36-55`; `so-assets.mts:148-153,207-208,211,225` | — | 46 | delete after the move (step 9) |
| H21 | `so-library.mts:32,62-64,71,79,82,123`; `so-scenario.mts:134,622`; `lib/configRestore.mts:8`; `so-run-header.mts:245` | — | 18 | id only (`so-scenario.mts:955,1023` hash-based cleanup is current, kept) |
| A1 | `engine/validate.ts:550-552`; `schema.ts:224-225` | — | 3 | remove + unknown-key error |
| A2 | `validate.ts:567,588` | — | 2 | same |
| A3 | `validate.ts:265` | — | 1 | same |
| A7 | `storyLibrary.ts:21-23,95-96`; `validate.ts:640-644`; slug lives in `studio/mutations.ts:191` | 30 of 57 format-2 fixture stories carry no `id` | 6 | slug id on import |
| C2 | `stHost/context.ts:9-16` | **verified on ST 1.18.0**: `globalThis.SillyTavern` at `script.js:292` | 8 | delete |
| C3 | `runtime/slashCommands.ts:27-36` | **verified on 1.18.0**: `st-context.js` exports `SlashCommandEnumValue` | 10 | delete |
| I1 | `runtime/runToken.ts:147-153`; 14 deps declare `ownership?:` (coordinators ×6, `judge`, `loreSelect`, `memoryMirror`, `mirrorReaper`, `storyUpdate`, `talkControl`, `worldInfoNormalize`, `effectsApplier`) | — | 7 | required |
| I2 | `effectsApplier.ts:172`; 38 test constructions | — | 1 | required |

**New sites the inventory missed (Δ, all in step 1):**
- `chatIdentity.ts:109` `blob.version !== 4`. Missing it makes every v5 branch read as foreign, so the D3 branch notice
  never appears.
- `persistence.ts:40` (`createBlob`), `:84` (`> 4` newer-build branch), `:137` (`storedBoundaryFor`).
- `types.ts:326` (`version: 4`), `:320` (comment "optional v4 field").

**Fixtures that encode `5` as "the future", and flip (Δ):**
- `blobUnreadable.review.test.ts:30`, and its control `it.each` v2/v3/v4 "is read" (`:114-122`);
- `test/scenarios/v24-02-unrecognized-blob.json:12`;
- J10.13 (`written-by-v5`).
- The fault-matrix cell `persistence|malformedResponse` (`faultMatrix.json:366-370`) cites the title "…names the newer build…",
  and its note says "v5+". Both change.

**Not history (Δ):**
- `fingerprints?` stays optional: `capture` may return null (`chatSave.ts:72-73`). `v24-acc-I7.json` arm C keeps its
  assertion; only its "legacy boundary" wording changes.

**Line headroom (Δ vs overview §11 / inventory §5):**
- Manager 740/740 effective → 739 (H9 `:542`).
- `memoryCoordinator` 619/620 → 617 (H11 `:341-342`).
- Plan 03 must not count on this plan for headroom.

## Design (removal order)

Each step lands green on its own (typecheck, typecheck:test, lint, test) before the next one starts.

### Step 0 — Guards first (green, baseline)
- `src/runtime/legacyFree.guard.test.ts` (S1 guard). It scans non-test `src/**` for
  `/legacy|migrat|OrHash|version\s*[!=]==\s*\d/i`. It lands GREEN with a shrinking baseline: seed
  `test/findings/legacy-baseline.json` with today's hits, keyed by file + matched text or a per-file count, never by line
  (**115 hits in 21 files** on `e7626d7`). The guard fails on (a) any hit not in the baseline, (b) any baseline entry that no
  longer matches (stale, so the baseline only shrinks), and (c) any baseline entry that remains after step 8. Each step
  deletes the entries it clears in the same commit. Only C1 stays, in a separate allowlist keyed by file + matched line text
  + reason, with an exact hit count per file: `stHost/capabilities.ts` × 1 (`macroEngine: "new" | "legacy" | "unknown"`),
  `stHost/version.ts` × 2 (the `macroEngineInUse` return type and its `"legacy"` result). It is never keyed by line number,
  because plan 03's comment and line-length work moves these lines; a third `legacy` hit in either file fails the guard.
  A synthetic offender case proves the scan can fail.
- Twin guard `scripts/debug/legacyFree.test.mts` (node:test, run by `npm run test:debug`) scans `scripts/debug/**/*.mts`,
  `scripts/release/**/*.{mjs,mts}`, `test/fixtures/**`, `test/scenarios/**` and `test/journeys/*.journey.json`, excluding
  kept history (`test/journeys/records/**`, `test/findings/mutations/**`, `scripts/review/**` — the pinned 2026-09-18 review
  harness, left as is — and `docs/**`). It uses the S1 regex plus `selectedStoryHash|legacy-v2|v3-chat-blob|persistenceMigration`,
  with the same file + text + reason allowlist and a synthetic-offender case. Done means 0 hits outside the allowlist after
  step 8.
- **Optional-field sweep.** List every `?:` field on the persisted types (`PersistedStoryRuntime`,
  `StoryOrchestratorMetadataBlob`, `MemoryRuntimeState`, `EngineState`, curator/expansion/wizard records). Mark each one
  either "required" or "optional because <a current writer can omit it>", with file:line, so the row list is proven complete.
  Known additions: `MemoryRuntimeState.storyStart` (`types.ts:260`) becomes required and is written wherever memory state is
  created or reset, so `markStoryStart` no longer runs only at `runtimeManager.ts:554` for a fresh load; the `storyStart = 0`
  default at `sceneSummary.ts:41` and the `!== undefined` guard in `memory/reverse.ts:60` go. `integrity` stays optional
  ("host may report no integrity": `persistence.ts:162-163`, `:243-247`; `chatFiles.test.ts:88` expects null for a solo
  chat), and the `!stamped` arm at `chatIdentity.ts:112-113` stays.
- `export const BLOB_VERSION = 5` in `persistence.ts`. The type becomes `version: typeof BLOB_VERSION`, and every test
  blob literal imports it (gotchas: "schema-version literal").

### Step 1 — Blob v5, one read path (H1–H5, the new sites)
| Deletes | Narrows | Tests / fixtures / scenarios / journeys | Census |
|---|---|---|---|
| `persistenceMigration.ts` (whole); `persistence.ts:2`, the v3/v2 arms of `storedBlob` (`:92-98`), `belongsHere`'s `chatId === null` arm, the stamp-on-save (`:240-242`), `onRestamp`, the "newer build" notice arm (`:84-85`); the no-chat store (`:126-129`) | `KNOWN_VERSIONS=[BLOB_VERSION]`; `chatId: string` on stored blobs; `pinnedStory` a story record; `unreadableNotice` → one line: "saved by another version of Story Orchestrator: Restart to replace it" | delete `persistenceMigration.test.ts`, `test/fixtures/legacy-v2-chat-blob.json`, `test/fixtures/v3-chat-blob.json`; `blobChatStamp.review.test.ts` rewritten on v5 (drop `:59-65,81-100`); `blobUnreadable` shapes → v6 / v4 / v3 / v2, control → v5 only; `fingerprintReconcile.review.test.ts:249-260` asserts the stamp without the journal; `branchContinue`, `blobForeign`, `chatWrites`, `startupWiring`, `turnBridgeIdentity`, `runtimeManager.test.ts:1747`, `p0-replay.test.mts:8` → `BLOB_VERSION`; `v24-02-unrecognized-blob.json` → `version: 6`; J10.1 `< 3` → `< 5`; **J10.8, J10.11 deleted**; J10.13 → v6; new **J10.15** (below) | `storySelection.ts#removeStory` (partial): re-read per rule 13; `persistence|malformedResponse` evidence → the renamed title; note → "any version but 5" |

### Step 2 — Required shapes (H13, H14, record guard)
- `EngineState.visitedPath` and `PersistedStoryRuntime.engineHistory` become required.
- Deleted: `inferVisitedPath` (`engine.ts:87-98`), the `?? inferVisitedPath` read (`:398`), the `??` defaults
  (`:400-404`), the `history.base` guard and its comments (`:162-170`), and `storyDiff.ts:273` optionality.
- `repairActiveCheckpoint` stays. Its `detail` drops "did not survive the upgrade" and says "is not in this story's
  graph; resumed at X".
- **Record guard** `isCurrentRecord` in `recognized()`: `engineState` numeric fields + `visitedPath` array,
  `engineHistory {from, base, log}`, a `pinnedStory` record, an `extras` object. A v5 blob with any record failing it
  takes the unreadable path. This is what makes "required" true on disk, not just in tsc.
- Tests:
  - delete `engine.test.ts:455`;
  - trim `storyDiff.test.ts:307` to the prune half;
  - retitle `engine.review.test.ts:104-126` to "`swapStory` hydrates without a history" and drop its v3-fixture comment.

### Step 3 — Provenance and the pin prompt (H10, H11)
- `provenance` becomes required on `MemoryEntry`, epistemic and ledger rows. Fix every writer tsc names. Only then
  delete `legacyProvenance`, `"legacy"` from `PROVENANCE_SOURCES` and the two duplicated unions (`judge/scene.ts:183`,
  `stagecraft/types.ts:139`), and the `?? legacyProvenance()` defaults (`provenance.ts:79,85`, `stores.ts:108`,
  `extras.ts:92,103-104`).
- The hydrate sanitizer **drops** a row without a valid envelope (rule 9: a malformed value falls back to its default)
  and warns with the count. `originLabel`'s "origin unknown" stays for an absent read.
- H11: delete `legacyPinPromptSeen`, `dismissLegacyPinPrompt` (coordinator, `memoryActions`, drawer block
  `#so-legacy-pins`).
- Tests / stories:
  - delete `extrasLegacy.test.ts:31-37`;
  - delete `provenance.test.ts:47-51`; rewrite `:236-240` as "absent reads as origin unknown";
  - delete stories `MemoryLegacyRowsAreAStatedUnknown` (`DrawerTabs.stories.tsx:448-475`) and
    `ALegacySideReadsAsUnknown` (`ConflictQueue.stories.tsx:110-135`).
- Census: delete row `MemoryCoordinator.dismissLegacyPinPrompt` (`ownership-sites.json:108-110`). The guard fails on a
  stale row (`ownership.guard.test.ts:59`).

### Step 4 — Library, settings, `schema: 1` (H6, H7, H9)
- **One root module** `runtime/settingsRoot.ts` replaces the three `getRoot` copies (`storyLibrary.ts:10-15`,
  `settingsStore.ts:123-127`, `wizardSessions.ts:53-57`). It exports `SETTINGS_SCHEMA = 1` and `stampSchema(root)`:
  - absent or any value other than `SETTINGS_SCHEMA` → the sanitizer treats it like any malformed field (rule 9);
    `schema: 1` is written only by a write, never by a read (the F2 rule, `settingsStore.ts:157-168`). There is no
    foreign-stamp branch and no warning.
- Library sanitizer (read-only, no write-back): drop and warn a record without `id`/`version`; newest-wins on a duplicate
  id (kept, defensive). Delete `migrateRecords`, `confirmMigration`, `missingMigrated`.
  `findStoryRecord`/`selectStory`/`removeStory` take `id`.
- Settings: delete `migratedFromChat`, `isAtDefaults`, `liftLegacyChatSettings` and its manager call. The per-chat reads
  in `sanitize{Pacing,Copilot,Ui,Stagecraft,Extraction,Memory}` become defaults only, because `applyGlobalSettings`
  overwrites them.
- **Plan 13 lands here.** It adds `extraction.routes` (replacing `extraction.profiles`) and `harness.*` **under schema 1,
  before release**:
  - its sanitizer defaults them;
  - `extraction.profiles` falls away with no lift (rule 9);
  - no stamp bump and no history branch.
  After the first public release, a shape change is `schema: 2` plus a real migration (V10 Q5).
- Tests:
  - delete `settingsWrites.test.ts:85-104` and `librarySave.test.ts:100`;
  - change `storyIdentity.test.ts:~240` (lift) to "a chat's per-chat settings are ignored";
  - new `settingsRoot.test.ts`: stamp on write, none on read.

### Step 5 — Small rows (H8, H12, H15, H16, H17, H18)
| Row | Change | Tests | Census |
|---|---|---|---|
| H8 | the no-memory fallback returns `createMemory()` | delete `runtimeManager.test.ts:333-376` | — |
| H12 | delete `upgradeLegacyExpansion` + the `contract === undefined && PLAYED` clause; `contract`/`origin` required | delete `extrasLegacy.test.ts:67-78` and `live-v12-legacy-expansion.json`; keep `:58` (retitle "a chain from another contract is dropped"), `:80-106` | — |
| H15 | hydrate stops stripping; writers already strip (`memoryCoordinator.ts:286,396`; `extractionCoordinator.ts:324,358,392,409`) | delete `runtimeManager.test.ts:1325` | — |
| H16 | `curator` required; a record without `target.uid` is refused ("recorded without a uid; not reverted"), never name-addressed | flip `stagecraftCoordinator.review.test.ts:369` to the refusal | `restoreBefore` (partial), `revertAppliedSince` (checked): re-read per rule 13 |
| H17 | `createdLorebooks` required (`[]`); both fallbacks go (`copilotCoordinator.ts:85,100`, `wizardSessions.ts:79`) | flip `copilotOwnedLorebooks.test.ts:62,77`; trim `wizardSessions.test.ts:51-53` | — |
| H18 | delete `unmarkedOwnBook` and its await (`memoryMirror.ts:74-82,147`); reword `mirrorReaper.ts:164` ("carries no ownership marker") | delete the E4 describe `memoryMirror.test.ts:271-358`; add "an unmarked book is never marked" | `syncMemoryMirror` (checked): one await removed, row note re-read |

`extrasLegacy.test.ts` keeps the D3/scheduler/V12-repair blocks. It is renamed `extrasHydrate.test.ts`, and
`scripts/release/citations-known.json` gains a `removed` row for `src/runtime/extrasLegacy.test.ts` (it is cited in
`docs/plans/v2.3/07-*.md`).

### Step 6 — Authoring input (A1–A3, A7)
- Delete the alias reads (`validate.ts:265,550-552,567,588`) and the `schema.ts:224-225` comment.
- **Unknown-key error** on the four alias-bearing objects (`requirements`, `stagecraft`, `lore_select`, `checkpoints[].agency`):
  `requirements.groupMembers: unknown key (did you mean "members"?)`. Levenshtein comes from `stagecraft/fuzzy.ts:12`
  (moved to `utils/` so the engine stays pure).
- A7:
  - `slugifyStoryId` moves to `@engine`, so the Studio and runtime share it;
  - `saveStoryRecord` gives an id-less story `id = slugifyStoryId(title)` (fallback `story`), with no `availableStoryId`
    suffixing, and writes that id into the stored `raw`. The existing id lookup plus the `existing.hash !== hash` version
    bump (`storyLibrary.ts:110-113`) then updates the same-title record on re-import. `availableStoryId` stays only for the
    Studio's first save of a new draft;
  - `storyIdFor`'s `legacy-<hash>` goes.
- Tests: `agency.test.ts:44`, `stagecraftFormat.test.ts:45` and `storyIdentity.test.ts:95` flip; add did-you-mean cases
  and a control where the canonical keys parse. Red test for A7: importing the same id-less fixture twice yields one record;
  importing it with edited content yields one record at version+1; control: a different title yields two records.
- Corpus check: parse every format-2 story in the library and repo. 57 fixtures and 4 library records today; 0 errors
  is the bar.

### Step 7 — Host and internal (C2, C3, I1, I2)
- Delete `contextFallback` and the enum fallback.
- `beginRun(ownership: RunOwnership)` and `new EffectsApplier(ownership, …)` become required. Tests pass a
  `testOwnership()` that never lapses, which is named and so greppable.
- If the churn blows the step (≈40 test sites), I1/I2 are recorded as moved to plan 03 D10 (its conditional rule-12
  intake step), never squeezed in (rule 12). Closing S1 then depends on plan 03 D10.

### Step 8 — Debug tooling and docs (H19–H21, D, ledger)
- **Debug:**
  - delete the `stories/*.yaml`, `so-library --legacy`, `--hash`, and the `legacy-${id}` match;
  - `so-scenario:134,622` and `configRestore:8` become id-only; H21 also takes the `so-scenario.mts:120-122`
    `seedMetadata` comment (it cites the deleted legacy-v2 fixture) and `so-scenario.mts:134` `selectedStoryHash`;
  - `so-run-header` records `settings.schema` (a warning if unreadable);
  - `scripts/debug/README.md:54,78-80` example → an inline v4 blob.
- **H20** (after step 9): delete `--legacy-mirrors` and `legacyMirrorTargets`. Ledger **S9** `provenBy` →
  `assetScope.test.mts :: regex scripts and QR sets are in scope by marker prefix only (S9)` (same file,
  `findingsLedger.test.ts:78-88`).
- **Citations:** `citations-known.json` gains `removed` rows for `test/fixtures/v3-chat-blob.json`,
  `test/scenarios/live-v12-legacy-expansion.json` and `src/runtime/extrasLegacy.test.ts`. The file is scanned in
  `docs/plans/v2.3/*.md`; bare names are not.
- **Docs:**
  - `.claude/rules/gotchas.md:5` (keep the lesson, example → v5);
  - `gotchas.md:37` ("blob **version 5**; anything else is unreadable until a confirmed Restart");
  - `gotchas.md:45` (`seed_metadata` "unreadable-path gates");
  - `.claude/rules/architecture.md:109` (drop "State saved before it existed infers…");
  - `.claude/rules/debug-scripts.md:14,15`;
  - `.claude/skills/debug/SKILL.md:68`;
  - `docs/architecture-v2.md:65,285-286`;
  - `docs/plans/v2.1/test-plan.md:222-223` (J10 catalog).
- Plan docs and gate records stay as history.

### Step 9 — One-time data actions (below; after steps 0–8 are green, before the live gates)

## One-time data actions

**Nothing is deleted.** Each action is a same-volume rename into
`C:\dev\backups\story-orchestrator\v2.5-plan11-<date>\`. That path is outside the ST tree and outside `public/`, so
nothing in it is served. A `manifest.json` records `{src, dst, bytes, sha256}` for every file, plus the commit and the time.

| # | Moved | From | Count / size | Precondition |
|---|---|---|---|---|
| D1 | mirror books, candidates below | `C:\dev\SillyTavern-MainBranch\data\default-user\worlds\` | 18 files, ≈36 KB | main ST **stopped** by the user (the tool refuses while `:8000` answers) |
| D2 | lane data roots | `C:\dev\so-lanes\{1,2,3}\data\` → `…\lanes\<n>\data\` | 3 dirs, ≈1.9 GB | lanes stopped (`st-lanes.mts stop 1 2 3`) |
| D3 | re-seed | `st-lanes.mts seed 1 2 3` **without** `--fresh` (its `rm`, `st-lanes.mts:77`, is never used) | — | after D1, so the lanes copy the cleaned install |

**Left in place, explicitly:**
- the 59 chat files (each resets on its own confirmed Restart);
- `data/default-user/backups/` (ST's own);
- the library and wizard sessions (Q1);
- `test/journeys/records/**`;
- `C:\dev\so-lanes\*\debug\`, `server.log`, `batch-*.json`, `recorders\`, `reviews\`;
- `.debug/` and exported journals.

**D1 candidate rule (predeclared):**
- The name starts `Story Orchestrator - `.
- No entry has comment `so-owner`.
- The book is not in `globalSelect` or `charLore`.
- Either it has no ` - <chat-id>` suffix (fixed-name), or its suffix names a chat whose blob is not v5.

At execution the tool re-lists and re-hashes. **Any difference from this table stops the run with nothing moved.** A
new or changed book is re-declared here first, never moved on the fly.

| sha256[:12] | Book (`.json`) | Kind | Entries |
|---|---|---|---|
| `48fa736bfd49` | Copilot Live Gate · Live Extraction Gate Check · Live Memory Gate Check · Live Pacing Gate Check · Memory Foundation Gate Check · Talk Control Live Gate (6 files, identical 21 B) | fixed | 0 |
| `e0161223ea0d` | Quest for the Sun Ruins | fixed | 2 |
| `eb319e0fa976` | Untitled Story | fixed | 1 |
| `4f3ee4cb8899` / `70af74816c6a` | Adolion House Nightriver - 2026-09-19@03h33m35s200ms / @03h57m17s921ms | per-chat | 1 / 3 |
| `1273384e2a42` / `2b62fd1d31cd` / `d949a24f6401` / `b806e4bc127e` / `ccc4ba45bcd7` | Adolion The Adventurer's Road - 2026-09-19@03h21m18s814ms / @03h31m08s292ms / @03h43m00s631ms / @03h48m18s080ms / 2026-09-20@09h17m25s990ms | per-chat | 2 / 3 / 2 / 3 / 1 |
| `ade61ba802ca` | Authority Enforcement Gate Check - 2026-09-21@15h49m05s268ms | per-chat | 1 |
| `49420d6e1ae0` | Journey J11 — Judgment Backend - 2026-09-20@04h40m32s180ms | per-chat | 2 |
| `fd39143de382` | Quest for the Sun Ruins - 2026-09-20@07h06m38s396ms | per-chat | 3 |

**Collision rule:**
- The destination root must not exist. The tool creates it and refuses if it is present.
- Any existing `dst` aborts the run before the first rename.
- A cross-volume `rename` failure aborts the run; there is no copy-then-delete fallback.

**Dangling bindings:**
- The 10 chats that bind a moved per-chat book read it as empty. ST checks `world_names` (`world-info.js:1014,1168`) and
  loads by name (`:2036-2058`).
- A confirmed Restart leaves the slot as it is. The mirror adopts a fresh per-chat book on its first write (the first sync with a live `relationship` row); until then the dangling slot reads as empty, and the adoption replaces it (verdict (a), leftovers gate record).

**Vehicle:** `scripts/debug/so-legacy-books.mts plan|move|verify|restore-check --root <data> --dest <dir>`, with node:test
coverage for the candidate rule, the collision refusal and the manifest.

**Pass rule (PR-08):**
- After D1, `worlds/` equals its pre-move listing minus exactly the manifest set, so no unlisted book moved.
- `restore-check` copies every backup file to a temp dir and matches each sha256 against the manifest (18/18).
- A real round-trip on **lane 2**: one book copied back into its `worlds/` is listed by ST after
  `updateWorldInfoList`, byte-identical.
- D2: each lane dir's tree hash (sorted relpath + sha256) matches before and after the move.

## Tests

**Red first** (each written before its step, failing on `e7626d7`):

| Test | Asserts |
|---|---|
| `blobUnreadable` v4 / v3 / v2 rows | a **v4** blob (the current format today) is read detached, never written, and replaced only by a confirmed Restart; journal `blob-unreadable` |
| `blobUnreadable` v5 malformed | a v5 blob whose selected record lacks `engineHistory` (then `visitedPath`, then `pinnedStory`) is unreadable |
| `chatIdentity` v5 branch | a v5 parent blob under a branch classifies `branch`, not `foreign` |
| `persistence` no chat | with no chat open, `getMetadataBlob` stores nothing |
| `extrasHydrate` row drop | a row without an envelope is dropped and counted |
| `settingsRoot` | stamp on first write; read writes nothing |
| `validate` unknown key | `requirements.groupMembers` → error with `did you mean "members"` |
| `legacyFree.guard` | 0 hits outside baseline+C1; baseline empty at step 8 end; synthetic offender fails; stale entry fails |
| `legacyFree.test.mts` (scripts+test twin) | 0 hits outside its allowlist after step 8; synthetic offender fails |
| `librarySave` A7 | the same id-less fixture imported twice yields one record; edited content yields one record at version+1 |

**Negative controls** (each proves the matching assertion can fail):
- a well-formed v5 blob is read and adopted;
- canonical `requirements` parse with no error;
- an id-carrying import keeps its id;
- a session with `createdLorebooks: ["X"]` owns X;
- a marked mirror book is never a D1 candidate.

**Mutants** (`npm run mutate`, recorded in `test/findings/mutations/v25-11-legacy.txt`; each must turn a test red):

| # | Mutant |
|---|---|
| M1 | `KNOWN_VERSIONS=[4,5]` |
| M2 | `chatIdentity` literal left at 4 |
| M3 | record guard removed |
| M4 | sanitizer keeps envelope-less rows |
| M5 | unknown-key check removed |
| M6 | stamp written on read |
| M7 | `?? session.applied` restored |
| M8 | guard allowlist regex widened to `.*` |
| M9 | D1 filter accepts a marked book |
| M10 | collision check skipped |

## Machine gates

- `npm run typecheck`, `typecheck:test` (jest does not type-check), `lint`, `test`, `test:debug`, `debug:typecheck`,
  `build`, `test:release` (citations, ledger), `test-storybook:ci` (stories removed).
- Then `node scripts/debug/st-session.mts reload` after the build.
- Exact commands and outputs go into the Gate record.

## Live gates (lane 1 after D3; ×2 consecutive; `--strict`; `so-run-header capture`/`diff` around the batch; records under `test/journeys/records/v2.5-plan11/`)

| Gate | What | LLM |
|---|---|---|
| L1 | **J10** (J10.1–J10.7, J10.13 on v6, J10.14 branch, **J10.15 new**) | real, for J10.15's turn |
| L2 | **J10.15**: an inline **v4** blob (`seed_metadata`) opens → `#so-blob-unreadable` shows the one notice, select refused, server bytes identical; confirmed Restart → a v5 blob; one `send_generate` with `expectReply: true`; the server read-back holds v5 with `engineHistory` + `visitedPath` + `pinnedStory` | real |
| L3 | a **real old chat** on the lane copy (one of its 41 v3 Adolion chats): notice shown, Restart confirmed, one real turn, v5 on the server | real |
| L4 | `v24-02-unrecognized-blob.json` (v6) ×2 | none |
| L5 | **J1** ×2: fresh import of an id-less fixture keys by title slug (A7), extraction answers | real |
| L6 | `so-assets.mts assert-clean`; `restore-check` (D1 pass rule) | none |

A gate that cannot run (backend down, no profile) is reported **NOT green**, never mocked.

## Risks

| Risk | Guard |
|---|---|
| A missed version literal (like `chatIdentity.ts:109`) silently degrades branches to foreign | the single `BLOB_VERSION`; the guard regex `version\s*[!=]==\s*\d`; J10.14 ×2 |
| Required provenance hides a writer that casts past tsc (`as MemoryEntry`); the sanitizer then drops real rows | the drop is counted and warned; a jest walk over every writer path asserts an envelope |
| A7 changes id-less fixture keying: re-importing an edited same-title story **updates** instead of forking | the corpus run (J1, J10, the mocked scenario corpus) with a run-header diff; cleanup by title is unchanged |
| The unknown-key error rejects an authored story | the library + 57-fixture corpus parses with 0 errors before merge; the pinned-parse fallback (`storySelection.ts:99`) stays |
| Data action on the live install | stopped ST, predeclared hashes, abort-on-diff, rename only, manifest, restore check |
| Manager at 740/740 | H7 rename must not add lines; H9 frees 1 |
| The rule-13 re-read misses a write after a removed await (`syncMemoryMirror`) | the row note is rewritten against the new body; the mirror ownership tests stay |

## Unresolved questions

1. Old chats: is the settings-panel notice (`#so-blob-unreadable`, next to Restart) enough, or should Repair
   (`runtime/repair.ts`) name it as the one missing step for the 59 chats? The second is player-visible copy.
2. Backup root `C:\dev\backups\story-orchestrator\v2.5-plan11-<date>\`, and moving ≈1.9 GB of lane data instead of
   `seed --fresh`: OK?
3. D1 needs the main ST stopped for the move (you stop and start it). OK, or should the move wait for a moment you pick?
4. Unknown-key errors on the four alias-bearing objects only, or on every story object? The wider form needs its own
   corpus measurement first.
5. A7: an id-less import takes the title slug and **updates** a same-title record on re-import, instead of forking by
   content hash. Accept?

### Decisions (main session, 2026-09-26, on evidence under the user's standing permission)

1. Settings-panel notice only; Repair stays for missing setup (the user has no real playthroughs; no new player copy).
2. Backup root accepted. Lane data is **moved**, not re-seeded fresh: it holds the debug-run logs the user asked to keep.
3. The main session stops and starts main ST for D1 itself (user permission to restart ST), only while no lane run is in flight.
4. Unknown-key errors on the four alias-bearing objects only; the wider form needs its corpus measurement first (not in this plan).
5. Accepted (review finding #22): an id-less import keys by title slug and updates a same-title record.

## Gate record (steps 0-8)

Date 2026-09-25. Branch `worktree-agent-adba238015709e160` (from master `c56e1f8`). Steps 0-8 only; step 9 and every live gate NOT run (no live/ST/lane access by instruction).

### Commits

| Step | Commit | Rows |
|---|---|---|
| 0 | `b0c65ca` | S1 src guard (`legacyFree.guard.test.ts`, `test/findings/legacyFree.ts`, baseline 109 hits / 18 files, C1 allowlist capabilities.ts×1, version.ts×2) + scripts/test twin (`scripts/debug/legacyFree.test.mts`, baseline 65 / 13); `BLOB_VERSION` constant |
| 1 | `8285016` | H1-H5: blob v5, one read path, migration + v2/v3 fixtures deleted, J10.8/J10.11 deleted, J10.15 added |
| 2 | `f457b26` | H13, H14: required `visitedPath`/`engineHistory`/`storyStart`, `isCurrentRecord` guard |
| 3 | `a2720fb` | H10, H11 (+H8 pulled forward): provenance required, pin prompt gone |
| 4 | `a0c8d52` | H6, H7, H9: library id-only, per-chat settings history gone, `settingsRoot.ts` schema 1 |
| 5 | `4c07302` | H12, H15, H16, H17, H18 |
| 6 | `cf8be87` | A1-A3, A7: aliases gone, unknown-key errors with did-you-mean, id-less import = title slug, `storyCorpus.test.ts` |
| 7 | `850e455` | C2, C3, I1, I2: host fallbacks gone, ownership required (`test/findings/testOwnership.ts`) |
| 8 | `ea5b998` | H19, H21, D rows: debug tooling id-only, docs; src baseline closed (`closed: true`) |

### Gates (every step, worktree)

`export ST_PUBLIC=C:/dev/SillyTavern-MainBranch/public` (worktree is nested, build manifest needs the host path), then
`npm run typecheck && npm run typecheck:test && npm run lint && npm run debug:typecheck && npm test && npm run build && npm run test:debug && npm run test:release`. All exit 0 at every step.

| Step | jest suites / tests | test:debug | test:release |
|---|---|---|---|
| before (c56e1f8) | 265 / 3877 | 278 | 37/37 |
| 0 | 266 / 3887 | 284 (283 pass, 1 skipped, 0 fail) | 37/37 |
| 1 | 265 / 3879 | same | 37/37 |
| 2 | 265 / 3883 | same | 37/37 |
| 3 | 265 / 3880 | same | 37/37 |
| 4 | 266 / 3886 | same | 37/37 |
| 5 | 266 / 3881 | same | 37/37 |
| 6 | 267 / 3888 | same | 37/37 |
| 7 | 267 / 3888 | same | 37/37 |
| 8 | 267 / 3888 | same | 37/37 |

Not run: `test-storybook:ci`; mutation sweep M1-M10 (`test/findings/mutations/v25-11-legacy.txt` not written).

### Deviations

- Step 0 introduced `BLOB_VERSION = 4` (the then-current value); step 1 bumped it to 5.
- `citations-known.json` removed rows landed with the step that deleted the cited file (1: `v3-chat-blob.json`; 5: `live-v12-legacy-expansion.json`, `extrasLegacy.test.ts` → `extrasHydrate.test.ts`), not in step 8.
- storyIdentity's settings-lift test depended on a v2 blob: deleted in step 1, replaced in step 4 by "a chat's per-chat settings are ignored".
- H8 pulled into step 3: with provenance required, `migrateLegacyFacts` had nothing left to stamp; fallback is `createMemory()`.
- H16: a uid-less applied op is refused on revert with status `revert-failed` ("recorded without a uid; not reverted").
- H17 needed a `WizardSessionUpdate` input type so a UI session save cannot erase the coordinator's `createdLorebooks`.
- H12 also drops entries without a valid `origin` (not only `contract`).
- A3: `fallback` has no near key, so its error is `unknown key (known: ...)` without a did-you-mean.
- A7 tests live in `storyIdentity.test.ts`. Corpus = 117 format-2 stories (examples + test, inline included); the install library was not read (no live access).
- Plan 13's `extraction.routes` settings shape not landed (plan 13's work).
- I1/I2 finished here (~40 test files via `testOwnership()`), not moved to plan 03 D10.
- C3 makes vendored `SlashCommandEnumValue` required (st-context.js:98/169): needs a Verified ST host facts row in `docs/plans/v2/00-implementation-overview.md`.
- `storyStart` required with default 0; `markStoryStart` still only on activate.
- Optional-field sweep: now required — `visitedPath`, `engineHistory`, `pinnedStory`, `chatId`, `storyStart`, provenance ×3, expansion `contract`/`origin`, curator record fields, `createdLorebooks`. Still optional because a current writer omits them: fingerprints, `integrity`, pinned/locked/messageId-style flags, `target.uid` (refused on revert), grants.
- Risk item "jest walk over writers" not built; `tsc` enforces required provenance at every writer.
- H20 (asset-scope legacy mirror handling) + S9 `provenBy` re-point deferred until after step 9: twin guard stays open (21 hits in `assetScope.mts` 7, `assetScope.test.mts` 4, `so-assets.mts` 10); src guard closed.

### Still needed

- Step 9: D1/D2/D3 data moves with manifest + restore check (`so-legacy-books.mts` not built); then H20 deletion, S9 re-point, close the twin baseline.
- `node scripts/debug/st-session.mts reload` after a build; live L1-L6 (J10 ×2 incl. J10.15, a real old chat, v24-02 ×2, J1 ×2, assets clean) — all NOT run, so plan 11 is NOT green.
- Verified ST host facts row for `SlashCommandEnumValue`.

## Gate record (step 9 + live gates)

Date 2026-09-26 (UTC; record timestamps 01:31Z–01:56Z). master `c69a927` (steps 0-8 merge `7034eec`, A35 `5e9f95d`, step-9 tool). dist NOT rebuilt: served bundle `e080b9749436` on both lanes (hashed in-page). `test:release` NOT run.

### Step 9 data actions (main session)

| # | Done | Evidence |
|---|---|---|
| D1 | 18 books moved `C:\dev\SillyTavern-MainBranch\data\default-user\worlds\` → `C:\dev\backups\story-orchestrator\v2.5-plan11-2026-09-26\worlds\`, main ST stopped | `…\v2.5-plan11-2026-09-26\manifest.json` (tool `so-legacy-books`, commit `c69a927`, 2026-09-26T01:31:41Z, preMoveListing 38, files 18, moved 18, complete) |
| D2 | lanes 1 and 3: `C:\dev\so-lanes\{1,3}\data` → `…\v2.5-plan11-2026-09-26\lanes\{1,3}\data` | `…\lanes\1\data.manifest.json` (01:33:50Z), `…\lanes\3\data.manifest.json` (01:34:12Z): tree hash before = after, `match: true` |
| D3 | lanes 1 and 3 re-seeded (no `--fresh`) from the cleaned install and started (8101/9301, 8103/9303) | `st-lanes.mts status` |

Lane 2: D2/D3 and the PR-08 lane-2 round-trip NOT done (lane 2 busy with J7; left to the main session).

### Per-lane prep (lanes 1 and 3)

`st-lanes.mts run <n> -- scripts/debug/st-session.mts reload` → `st-navigation.mts open-group 1759606632088` → `MSYS_NO_PATHCONV=1 st-actions.mts slash "/profile Artemis RunPod RP"` → in-page `ConnectionManagerRequestService.sendRequest` PONG (lane 1 825 ms, lane 3 819 ms; `curl :18080/health` ok) → `so-run-header.mts capture`. Note `st-lanes run <n> -- <script>` takes the script path, not `node <script>` (it prefixes `node` itself).

### Gates

| Gate | Lane | Command | Result | Records |
|---|---|---|---|---|
| L1 | 1 | `st-lanes.mts batch --lanes 1 --repeat 2 --strict J10` | first series RED ×2 (J10.15 step 2, fixture timing, below); after the fixture fix **GREEN ×2**: 10 pass / 0 fail / 0 blocked, cleanup clean, first try 10/10, human J10.9/J10.10 unscored (104 s, 153 s) | `test/journeys/records/v2.5-plan11/L1/` (`run{1,2}-journey-J10.json`, logs, `batch.json`; red series in `failed-before-fixture-fix/`) |
| L2 | 1 | inside L1 (J10.15) | **GREEN ×2**: `#so-blob-unreadable` exactly 1 node with the notice, snapshot flags `foundVersion 4`; `import_story` refused (`ok:false`, storyId null); server and in-memory blob byte-identical; confirmed Restart → `sun-ruins` cp1; `send_generate` `expectReply` answered (run 1 3 new msgs, run 2 4); server read-back `serverVersion 5 = memoryVersion 5`, stamped for the open chat, no v4 marker, `engineHistory`/`visitedPath`/`pinnedStory` true | `L2/run{1,2}-J10.15.log` (extracted from `L1/run{1,2}.log`) |
| L3 | 3 | `st-navigation open-group 1789797226071` + `open-chat <id>`, then `so-scenario.mts run test/journeys/records/v2.5-plan11/L3/l3-real-old-chat.json` (no `--sandbox`) | **GREEN on two different real v3 chats** of "Adolion - The Adventurer's Road" (lane-3 copy): `2026-09-19@03h43m00s631ms` (27 msgs) and `2026-09-19@03h48m18s080ms` (40 msgs). Each: v3 blob, notice ×1, server bytes unchanged by opening; selection of `adolion-adventurer` refused with bytes identical; confirmed Restart → `adolion-adventurer` at `guild-hall`, requirements ready, journaled; one real turn (Adolion Narrator, 41 s / 61 s); server holds v5 stamped for the chat with `engineHistory`/`visitedPath`/`pinnedStory`, boundary 1, messages 27→29 / 40→42 | `L3/` (fixture, `run1-chat-03h43m00s631ms.*`, `run2-chat-03h48m18s080ms.*`, `attempt0-select-step-harness.result.json`) |
| L4 | 3 | `st-lanes.mts batch --lanes 3 --repeat 2 --group 1759606632088 test/scenarios/v24-02-unrecognized-blob.json` | **GREEN ×2** (11/11 steps, 15 s / 14 s, cleanup failed [] ) | `L4/` |
| L5 | 1 (J1), 3 (A7) | `st-lanes.mts batch --lanes 1 --repeat 2 --strict J1`; `st-lanes.mts batch --lanes 3 --repeat 2 --group 1759606632088 test/scenarios/live-v25-11-a7-idless-import.json` | J1 **GREEN ×2**: 8 pass / 0 fail, cleanup clean, first try 8/8; J1.6's first real transition came from real extraction. A7 scenario **GREEN ×2** (after one fixture fix, below): id-less `Linear Vault` keys as `linear-vault` in library + chat blob; same-content re-import keeps 1 record at v1; edited re-import updates the 1 record to v2 (chat stays pinned, drifted) | `L5/J1/`, `L5/A7-idless-import/` (red series in `failed-cleanup-leak/`) |
| L6 | 1, 3, real root | `st-lanes.mts run <n> -- scripts/debug/so-assets.mts assert-clean --marker SO-J9` and `--marker SO-`; `so-legacy-books.mts verify --root C:/dev/SillyTavern-MainBranch/data/default-user --dest C:/dev/backups/story-orchestrator/v2.5-plan11-2026-09-26`; `so-legacy-books.mts restore-check --dest …` | **GREEN**: assert-clean exit 0 ×4 (both markers, both lanes); verify `ok, complete, preMove 38, manifest 18, now 20, missing [], extra []`; restore-check 18/18 matched, mismatched [] | `L6/` |

Run headers (`headers/`): lane 1 before/after J10×2+J1×2 → 0 differences (`--allow-warnings`, reason below); lane 3 before/after L4+probe+L3 → only `settings.schema null -> 1` + its warning (allowed) after re-opening group 1759606632088; lane 3 A7 before/after → 0 differences, exit 0.

Machine gates after the fixture changes (no src change): `npm test` 267 suites / 3891 tests pass; `npm run test:debug` 296/296 pass. No build.

### Deviations

- **J10.15 fixture fix (harness timing, not product).** Step 2 read `#so-blob-unreadable` in the same task as `await rt.loadSelectedFromChat()`; the settings panel re-renders from a `setState` in the snapshot subscriber, one macrotask later. Probe on lane 3 (`.debug/v25-11-notice-probe.json`, sandbox): `at0: null`, after `setTimeout(0)` and at 500 ms the notice is present. The step now polls up to 3 s for the node, and additionally asserts it is shown **exactly once** (`notices === 1`), which the plan's L2 wording asks for. The first J10 series (both runs red on this step only, 9/10) is archived in `L1/failed-before-fixture-fix/`.
- **L3 on lane 3, not lane 1** (plan says lane 1): ran in parallel with J10 on lane 1 to keep the shared backend to one extra consumer; lane 3 is the same seeded copy. L3 was done on **two different real v3 chats** (one run each), not twice on one chat.
- **L3 first attempt**: the fixture's `select_story` step with `expectFail` failed as a step because that verb THROWS on refusal (`Story not found`) rather than returning `ok:false`, which `expectFail` does not catch. Replaced by an eval calling `rt.selectStory` and asserting `false` + `storyId null` (returns `{refused:true}` per the T2 rule). The failed attempt stopped before any write (record `attempt0-…`); the chat was still v3 when rerun.
- **L4 and L6 lane-3 checks on lane 3** (allowed by the brief).
- **L5 split**: J1 imports the shipped `sun-ruins` example, which carries an authored id, so J1 alone does not exercise A7. J1 ×2 covers "extraction answers"; the id-less keying is covered by a new no-model scenario `test/scenarios/live-v25-11-a7-idless-import.json` ×2 on lane 3. Its first series leaked the `linear-vault` record (run 2 then correctly refused a non-fresh library): sandbox cleanup removes imports by the hash the CHAT plays, and after an edited re-import the library record carries the edited hash while the chat stays pinned to the old one. Fix in the fixture: a last step removes `linear-vault` (step 1 proves it did not exist before). The leaked record was removed by hand on lane 3 (`rt.removeStory('linear-vault')`) before the rerun; the A7 header diff is 0. The cleanup-by-played-hash gap itself is a harness limitation for any scenario that re-imports an edited same-id story (not fixed here).
- **Run-header warning allowed**: both lanes' settings roots carry no `schema` stamp at capture (seeded from the install, which has not written its root since plan 11). The stamp lands on first write (lane 3 after the scenarios: `settings.schema 1`); on lane 1 the journeys' `restoreConfig` writes the unstamped pre-run root back, so it reads unstamped again. Diffs were taken with `--allow-warnings`; 0 blocking differences on either lane.
- L3 observation (not asserted): after Restart + one turn the chat still binds its D1-moved per-chat book name in `chat_metadata.world_info` and `memory.wiBook` is null (no mirror book yet on lane 3); the plan's "mirror adopts a fresh per-chat book" happens on the mirror's first write, which one turn did not reach.

### Still open

- Lane 2: D2/D3 and the PR-08 lane-2 round-trip of one D1 book (main session, after J7).
- H20 deletion, S9 re-point, closing the twin baseline (Gate record steps 0-8 §Still needed); mutation sweep M1-M10; `test-storybook:ci`; Verified ST host facts row for `SlashCommandEnumValue`.
- J10.9/J10.10 and J1.8/J1.9 human rows unscored.

## Gate record (code leftovers: H20, S9, twin baseline, mutants, storybook, host fact, mirror)

Date 2026-09-26. Branch `worktree-agent-a94c9f25a1e7473b5`, fast-forwarded to master `13b76f8`. Code and docs only: no lane, no main ST, nothing under `C:\dev\so-lanes` touched. Worktree gates use a `node_modules` junction to the main checkout and `ST_PUBLIC=C:/dev/SillyTavern-MainBranch/public`.

Baseline on `13b76f8` (before any change): `npm run typecheck && npm run typecheck:test && npm run lint` exit 0; `npm test` 267 suites / 3891 tests pass; `npm run test:debug` 296 tests, 1 fail (`so-run-header.test.mts` "the build half reads plan 08s nested manifest": the fresh worktree has no `dist/manifest.json`; green after `npm run build`), so every later `test:debug` run follows a build.

### 1. H20, S9, twin baseline (`cfd9542`)

- H20: `--legacy-mirrors`, `AssetsArgs.legacyMirrors`, `LEGACY_PREFIX`/`CHAT_ID_SUFFIX`, `legacyMirrorTargets` and its S9 test deleted from `scripts/debug/lib/assetScope.mts`, `assetScope.test.mts`, `so-assets.mts` (21 hits: 7 + 4 + 10). `removeMarkedAssets` scopes to the marker/ledger set only; `clean` no longer carries `legacyLeft`.
- S9: `test/findings/ledger.json` `provenBy` → `scripts/debug/lib/assetScope.test.mts :: regex scripts and QR sets are in scope by marker prefix only (S9)` (`findingsLedger.test.ts` 6/6).
- Twin baseline: `test/findings/legacy-baseline-scripts.json` `closed: true`, `baseline: {}`; allowlist unchanged (the three `so-legacy-books` name lines).
- `.claude/rules/gotchas.md` cleanup bullet: `--legacy-mirrors` noted as removed by H20.
- Gates: typecheck, typecheck:test, lint, debug:typecheck exit 0; `npm test` 267 / 3891 pass; `npm run test:debug` 295 tests, 294 pass, 1 skipped, 0 fail (one test fewer: the deleted S9 legacy-mirror case).

### 2. Mutation sweep M1-M10

Record: `test/findings/mutations/v25-11-legacy.txt`. Every mutant applied through `node scripts/mutate.mjs … --find … --replace … -- <cmd>` (the file is restored after each run; `git status` clean of src after the sweep).

| # | Mutant | Command | Result |
|---|---|---|---|
| M1 | `KNOWN_VERSIONS=[4, BLOB_VERSION]` | jest `blobUnreadable.review.test.ts` | 3 failed / 16, CAUGHT |
| M2 | `chatIdentity` `!== 4` | jest `chatIdentity.review` + `branchContinue.review` | 13 failed / 33, CAUGHT |
| M3 | record guard (`every(isCurrentRecord)`) removed | jest `blobUnreadable.review.test.ts` | 5 failed / 16, CAUGHT |
| M4 | sanitizer keeps envelope-less rows | jest `extrasHydrate.test.ts` | 1 failed / 10, CAUGHT |
| M5 | unknown-key `addError` removed | jest `stagecraftFormat` + `agency` | 3 failed / 19, CAUGHT |
| M6 | `settingsRoot()` stamps on read | jest `settingsRoot.test.ts` | 3 failed / 7, CAUGHT |
| M7 | `createdLorebooks ?? session?.applied` restored | jest `copilotOwnedLorebooks.test.ts` | 1 failed / 6, CAUGHT |
| M8 | src guard allowlist match widened to `/.*/` | jest `legacyFree.guard.test.ts` | 1 failed / 10, CAUGHT |
| M8b | same widening in the twin guard | `node --test scripts/debug/legacyFree.test.mts` | first run SURVIVED (6/6 pass); control gained "a different legacy line in an allowlisted file is unexpected"; rerun 1 fail, CAUGHT |
| M9 | D1 filter accepts a `so-owner` book | `node --test scripts/debug/so-legacy-books.test.mts` | 6 failed / 12, CAUGHT |
| M10 | destination-root collision check skipped | same | first run SURVIVED (12/12 pass: the test matched `/already exists/`, and the later `mkdir(dest)` EEXIST satisfied it); test now asserts `/refused: destination root .* already exists/`; rerun 1 fail, CAUGHT |

Gates after the two test fixes: typecheck, typecheck:test, lint, debug:typecheck exit 0; `npm test` 267 / 3891 pass; `npm run test:debug` 295 tests, 294 pass, 1 skipped, 0 fail.

### 3. `test-storybook:ci`

GREEN: 34 suites / 241 tests pass (interaction + a11y, "No accessibility violations detected" on every suite), on the storybook build of `83ffea0`. No plan-11 defect: the stories plan 11 deleted (`MemoryLegacyRowsAreAStatedUnknown`, `ALegacySideReadsAsUnknown`) are gone from the index and nothing else referenced them.

- `npm run test-storybook:ci` itself exits 1 in this worktree with "No tests found", before any story runs. Cause is the worktree location, not the code: the runner's glob is `join(workingDir, "src/**/*.stories.@(ts|tsx)")`, the project root resolves to the MAIN checkout (git root lookup; the worktree's `.git` is a file), and with `STORYBOOK_PROJECT_ROOT` pointed at the worktree the joined pattern reads `story-orchestrator\.claude/worktrees/…`, where micromatch takes `\.` as an escaped dot, so 0 files match. Same result with the root given in forward or back slashes.
- Run that passed: `npm run storybook:build` (inside the ci script, build OK), then `concurrently -k -s first "npm run serve-sb" "wait-on -t 60000 http://127.0.0.1:6006 && node node_modules/@storybook/test-runner/dist/test-storybook.js --url http://127.0.0.1:6006 --maxWorkers 1 --index-json"` (`.debug/sb.sh`). `--index-json` builds the test list from the served `index.json`, i.e. every story in the build, instead of globbing source files. The plain `npm run test-storybook:ci` should still be run from the main checkout at merge time.

### 4. Verified ST host facts: `SlashCommandEnumValue` (`83ffea0`)

Row added to `docs/plans/v2/00-implementation-overview.md` §Verified ST host facts, after `executeSlashCommandsWithOptions`. Verified on `C:\dev\SillyTavern-MainBranch` (package.json `1.19.0`): `public/scripts/st-context.js:98` imports it from `./slash-commands/SlashCommandEnumValue.js`, `:169` exposes it on the context; class at `public/scripts/slash-commands/SlashCommandEnumValue.js:42`, constructor `:62` `(value, description = null, type = 'enum', typeIcon = '◊', …)`. Consumer: `runtime/slashCommands.ts` `buildEnumList` (the `/story` argument enum list). The `hostTypes.ts:82` comment still says ST 1.18.0, where C3 verified it; both versions export it.

### 5. Mirror after Restart: verdict (a), by design

L3 saw, after a confirmed Restart plus one real turn, the chat's lorebook slot still naming its D1-moved per-chat book and `memory.wiBook` null. Read-only investigation says this is the designed behaviour, not a dangling binding that is never replaced:

- **The mirror creates a book only when it has something to mirror.** `syncMemoryMirror` (`src/runtime/memoryMirror.ts:90-91`): `const owned = input.book?.chatId === chatId ? input.book : null; if (!owned && !live.length) return idle;`. `live` is `mirroredEntries`, which keeps only live, unsuperseded, unfolded rows of `type === "relationship"` (`:60-61`). After a Restart the memory is fresh (`restartStory` → `dropPersistedRuntime` → `loadStory(…, "activate")` → `hydrateExtras(undefined)`, `runtimeManager.ts:543`; the unreadable path writes `createBlob(chatId)`, `persistence.ts:176-182`), so `wiBook` is null and nothing is ensured, written or bound until the first relationship row exists. One turn did not produce one.
- **The dangling slot is inert meanwhile.** ST's `getChatLore` (`public/scripts/world-info.js:4543-4561`) calls `loadWorldInfo(chatWorld)`, and the server answers a missing file with the dummy `{ entries: {} }` (`src/endpoints/worldinfo.js:17-30`, `allowDummy` from `/get` at `:76`), so the moved book contributes no entries. ST's own `/getchatbook` path also treats a slot whose name is not in `world_names` as empty (`world-info.js:1014,1168`).
- **The first adoption replaces it.** `bindChatLorebook` (`src/services/stHost/worldInfo.ts:196-207`) refuses only when the current slot names a book that EXISTS (`lorebookExists(current)`), so a slot naming a moved book is overwritten with the fresh mirror book (`"bound"`); when the moved book carried this chat's own mirror name (`Story Orchestrator - <title> - <chatId>`), `ensureLorebook` creates a fresh file under that name and the slot already names it (`"already-bound"`). ST's `createNewWorldInfo` → `saveWorldInfo` overwrites any cached dummy (`world-info.js:4462`, `:4183`). Existing proof: `worldInfo.test.ts` "treats a binding to a deleted book as empty, like /getchatbook".
- New jest cases pinning the composition (`src/runtime/memoryMirror.test.ts`): "a restarted chat whose slot names a moved book binds nothing until there is a memory to mirror, then replaces the slot" and "a restarted chat whose moved book carried this chat's mirror name gets a fresh book under the same binding". Both pass on the unchanged product code; no src change, so the ownership census and the manager/coordinator budgets are untouched.

**Proposed plan-text correction** (§One-time data actions, "Dangling bindings", second bullet; not applied, the plan body is left as written): replace "On a confirmed Restart the mirror adopts a fresh per-chat book." with "A confirmed Restart leaves the slot as it is. The mirror adopts a fresh per-chat book on its first write, which is the first sync with a live `relationship` memory row (`memoryMirror.ts:90-91`); until then the dangling slot reads as empty, and the adoption replaces it (`bindChatLorebook` treats a slot naming a missing book as empty)."

Gates (after the two tests): typecheck, typecheck:test, lint, debug:typecheck exit 0; `npm test` 267 suites / 3893 tests pass (+2); `npm run test:debug` 295 tests, 294 pass, 1 skipped, 0 fail. `test:release` not run (nothing under `scripts/release` changed).

### Still open after this record

- `npm run test-storybook:ci` verbatim from the main checkout (the worktree run used `--index-json`, above).
- Lane 2: D2/D3 and the PR-08 lane-2 round-trip of one D1 book; J10.9/J10.10 and J1.8/J1.9 human rows (unchanged from the step-9 record).
- The plan-text correction above, if accepted.

## Gate record (lane 2 step 9, 2026-09-26, main session)

- D2 lane 2: `so-legacy-books.mts move-dir --src C:\dev\so-lanes\2\data --dst <backup>\lanes\2\data --port 8102` after J7 finished and `st-lanes stop 2`: tree hash match true. D3: `st-lanes seed 2` (no `--fresh`), `start 2`.
- D1 round-trip (PR-08): `Story Orchestrator - Untitled Story.json` copied from the backup into lane 2's `worlds/`: sha256 `eb319e0fa976` identical on both sides; after `st-session reload` the server's `world_names` lists it and `/api/worldinfo/get` returns 1 entry (table: 1). The copy stays in the lane (a lane is a copy).
- Plan 11: steps 0-9 and live gates L1-L6 green; the dangling-binding text corrected above. Still open: the unscored human rows (J10.9, J10.10, J1.8, J1.9) for plan 10's human session; `test-storybook:ci` verbatim from the main checkout (next build).

## Gate record (v2.6 carry-over, bundle f8eaa0675102)

- `test-storybook` (built with `ST_PUBLIC`, served, `--index-json`): 41 suites / 289 tests pass. The human rows J1.8, J1.9, J10.9, J10.10 moved to plan 10.

Full record: `docs/plans/v2.6/01-carry-over-proof.md` §Gate record (no-LLM half, 2026-09-30); records under `test/journeys/records/v2.6-01/`.

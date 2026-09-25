# v2.5 research: legacy / backward-compatibility inventory

**Status: research, 2026-09-25.** Read-only audit of master `1b4e642`. Nothing here is built. This doc feeds the v2.5
production-readiness plan.

**Trigger.** E9 (`docs/plans/v2.4/00-overview.md:418`): the extension "has never been released to the public", so
no backward compatibility is needed. X1's "no blob bump" (`:430`) existed for downgrade safety and no longer binds.

**User decision (2026-09-25, relayed by the main session).** Discarding story state in existing chats is fine. There
are no real playthroughs to keep. Old or unknown state is **reset, not migrated**. What must survive is the archived
debug evidence: `test/journeys/records/**`, lane logs, journals and exports, and every golden a test replays. No
record is deleted here. A fixture or test that exists only to exercise a migration goes with the migration. Where a
doc or test cites one, that is named below.

Categories:
- **H**: our history. Code that reads state an earlier build of ours wrote.
- **A**: authoring convenience. Input tolerance for hand-written story JSON.
- **C**: host-version compat. Support for SillyTavern versions or builds, not our history.
- **I**: internal-API compat. Optional parameters kept so older tests still construct.
- **T**: test-only. Tests, fixtures, stories and journey checks whose only subject is an H item.
- **D**: docs that describe H items.

Size: S ≤ 15 src lines, M 15–60, L > 60 (non-test lines removed).

## 1. Evidence: what legacy state actually exists (read-only, 2026-09-25)

| Store | Measured | Source |
|---|---|---|
| Chat blobs, `data/default-user/{chats,group chats}` (header line) | 59 chats carry `story_orchestrator`: **v2 = 8, v3 = 41, v4 = 10**. 49 are unstamped (`chatId: null`). 12 story keys are `legacy-<hash>`. 38 stories have no `engineHistory`. 24 have no `visitedPath` | python scan of each `.jsonl` first line |
| `extensionSettings["story-orchestrator"]` | keys `v2Stories`, `settings`, `wizardSessions`. **No v1 `studio` key.** No `legacy-` library ids. No `migratedFromChat` | `data/default-user/settings.json` |
| Library `v2Stories` | 4 records, all with ids: `adolion-academy` v11, `adolion-adventurer` v9, `so-j9-wizard`, `so-j9-fixme` | same |
| Wizard sessions | 2. One lacks `createdLorebooks` (pre-V18) | same |
| Mirror books `worlds/Story Orchestrator - *` | 18 books. **8 use the old fixed name** (no chat-id suffix, e.g. `Story Orchestrator - Quest for the Sun Ruins.json`). The other 10 are per-chat, and those from before T14 carry no `so-owner` marker | `ls data/default-user/worlds` |

So the H paths are live on this install: 49 of 59 blobs would take a migration branch today. Under the reset
policy they would instead read as unreadable (§3). The library holds **authored content** (Adolion v11/v9). It is not
chat state and must not be reset (Q1).

## 2. Inventory

### H: our history (persisted state, settings, library)

| # | What | Where | Protects | If removed (evidence) | Size | Tests / fixtures / rows that go with it |
|---|---|---|---|---|---|---|
| H1 | Chat blob **v2 → v3 → v4** migration | `src/runtime/persistenceMigration.ts:1-68` (whole file); `persistence.ts:2,65,92-98` (`KNOWN_VERSIONS=[2,3,4]`, `storedBlob` v3/v2 branches) | 8 v2 and 41 v3 chats on this install | A v2/v3 blob becomes `unrecognized` (`persistence.ts:69-71`) and takes the T11 unreadable path: detached, and a confirmed Restart replaces it (`storySelection.ts:83-89,115-131`). No silent loss | M (68 + ~8) | `persistenceMigration.test.ts` (86 lines, all); `test/fixtures/legacy-v2-chat-blob.json` (169), `test/fixtures/v3-chat-blob.json` (175); J10.8, J10.11 (`test/journeys/j10-identity-and-settings.journey.json`); `engine.review.test.ts:104-126` names the v3 fixture in a comment only |
| H2 | `legacy-<hash>` story ids **from migration** and the title fallback | `persistenceMigration.ts:25-27,33-35,53` | pre-v2.1 chats whose story hash changed | Goes with H1 | — | `persistenceMigration.test.ts:58`; debug `so-library.mts:71,79` (`legacy-${onlyId}`) |
| H3 | Unstamped blob (`chatId: null`) read as "belongs here", stamped on first save | `persistence.ts:55` (`chatId === null`), `:240-242`; `types.ts:328-334` doc; `migrateV3ToV4` `persistenceMigration.ts:58-68` | 49 unstamped blobs | With a single schema every stored blob is stamped. `null` stays only for `createBlob()` with no chat open (`persistence.ts:40`); verify that case before narrowing the type | S | `blobChatStamp.review.test.ts` (11 legacy hits in 100 lines: read before narrowing) |
| H4 | Integrity restamp for "a build that restamps the chat id only" | `persistence.ts:243-249`; journal text `chatSave.ts:74` | v4 blobs adopted by a pre-v2.4-02 build | **Verify.** The comment scopes it to older builds, but `adoptChatState` now writes integrity (`persistence.ts:162-163`). If no current path reaches it, it goes | S | `branchContinue.review.test.ts` (1 hit), `chatIdentity.review.test.ts`: read first |
| H5 | Hydrating a persisted record with **no pinned copy** (the v2 migration writes `pinnedStory: null`) | `storySelection.ts:91-110` (falls through to the library when `pinnedStory` is falsy), `:150-155` ("only a chat without one loses the story") | migrated v2 chats | Every current save pins (`chatSave.ts:73`). Once H1 goes, `pinnedStory` can be required and a record without one is unreadable | S | `storyIdentity.test.ts` pin cases: review |
| H6 | Library **rekey on read** (records before v2.1 have no id/version/updatedAt) plus its save evidence | `storyLibrary.ts:37-62,74,80-86`; `librarySave.ts:57-62` (`missingMigrated`) | pre-v2.1 library records | Live library: all 4 have ids. Replace with a sanitizer that **drops** a record without `id`/`version` and warns (Q1) | M (~35) | `settingsWrites.test.ts:85,98`; `librarySave.test.ts:100` |
| H7 | Lookup by **content hash** (`idOrHash`) | `storyLibrary.ts:90-93`; `storySelection.ts:82,91,150`; `runtimeManager.ts:260,262` | v2 selections keyed by hash | Callers pass ids since v2.1. Rename to `id`, drop the `.hash ===` fallback | S | debug: `so-library.mts:32,62-64,123` (`--hash`), `so-scenario.mts:622` |
| H8 | `extras.extraction.facts` → facts memory tier | `extras.ts:67-81` (`migrateLegacyFacts`), `:116-138` (fallback branch) | pre-plan-07 chats | The fallback collapses to `createMemory()` (`extras.ts:46-65`) | M (~35) | `runtimeManager.test.ts:333-376` ("RuntimeManager memory migration") |
| H9 | Per-chat → install-wide **settings lift**, plus sanitizers that still read per-chat settings | `settingsStore.ts:24,119,171-174,200-218` (`migratedFromChat`, `isAtDefaults`, `liftLegacyChatSettings`); `runtimeManager.ts:44,539`. Dead per-chat reads: `extras.ts:21-25,96,142,144,151,248`, all overwritten by `applyGlobalSettings` (`:294-304`) | pre-v2.1 chats carrying `extraction.settings` | Current chats never carry settings (`stripGlobalSettings`, `extras.ts:308-317`). `isAtDefaults` has no other caller | M (~25) | `storyIdentity.test.ts:233` |
| H10 | Provenance `"legacy"` envelope for rows saved before envelopes | `memory/provenance.ts:6,65-86,106-110`; `extras.ts:3,92,103-104`; `memory/stores.ts:2,108`; `judge/scene.ts:183`; `stagecraft/types.ts:139`; UI `DrawerTabs.tsx:184-189,345`, `ConflictQueue.tsx:15-17`, `StagecraftPanel.tsx:78,86` | v2.3-plan-05-era rows | Make `provenance` **required** on `MemoryEntry` / epistemic / ledger (`memory/types.ts:75,101,162`). tsc then finds any writer that omits it; audit those before deleting. `originLabel`'s "origin unknown" stays for a genuinely absent read | M | `extrasLegacy.test.ts:30-50`; `provenance.test.ts:47,236`; stories `DrawerTabs.stories.tsx:448-475` (`MemoryLegacyRowsAreAStatedUnknown`), `ConflictQueue.stories.tsx:110-135` (`ALegacySideReadsAsUnknown`) |
| H11 | **Legacy pin prompt** (pin vs lock, asked once per chat) | `runtime/types.ts:255-257`; `extras.ts:53,111,136`; `memoryCoordinator.ts:341-342`; `memoryActions.ts:6,15,29,45`; `DrawerTabs.tsx:213-216,258-268` | pins made before pin/lock split | Goes with H10 | S (~20) | census row `test/findings/ownership-sites.json:108-110` (`dismissLegacyPinPrompt`; the guard at `ownership.guard.test.ts:59` fails on a stale row) |
| H12 | Expansion: in-place **upgrade of a pre-R9 chain** the chat is playing (V12), plus the `origin` default | `extras.ts:257,260-267,278-279` | pre-v2.3-plan-07 chains | **Keep** the `EXPANSION_CONTRACT` drop: it is a cache key, not history. Remove `upgradeLegacyExpansion` and the `contract === undefined && PLAYED` clause. Make `contract`/`origin` required (`generation/types.ts:84,97`) | S (~12) | `extrasLegacy.test.ts:55-75`. Keep `:77-94` (D3) and `:96-110` (V12 `repairActiveCheckpoint`, still reachable by a story edit) and move them to a non-legacy file |
| H13 | `visitedPath` **inference** for state saved before the path existed | `engine.ts:74-75` (comment), `:87-99` (`inferVisitedPath`), `:398`; `EngineState.visitedPath?` `:20` | 24 stories on disk | Make `visitedPath` required. **Keep** `repairActiveCheckpoint` (`:76-85`); reword its `detail`, which blames an "upgrade" | S (~15) | `engine.test.ts:455-465`; `storyDiff.test.ts:307` (the "pre-path state" half) |
| H14 | Engine-state `??` defaults on required fields; history without `base` | `engine.ts:400-404` (`checkpointStarted*`, `lastMessageId`, `chatLength`); `:168-170`; `types.ts:317-319` (`engineHistory?`) | pre-v2 plan 02 / pre-v2.3 plan 04 state | **Keep** the null-history hydrate: `swapStory` calls `engine.hydrate(state)` with no history (`runtimeManager.ts:582`). Rewrite the "A blob written before…" comments (`engine.ts:163-166`) to name that path instead | S | `engine.review.test.ts:104-126`: **keep**, it covers `swapStory`'s floor; retitle it ("migrated chat" is wrong) |
| H15 | Hydrate-time `stripChannelNoise` over stored prose | `extras.ts:92,102,105` | rows written before stripping moved to write time | Writers strip at source (`memoryCoordinator.ts:286,396`; `extractionCoordinator.ts:322,356,390,407`) | S | `runtimeManager.test.ts:1325` |
| H16 | Curator records: `curator` default and the **name-address revert** for records without a uid | `extras.ts:152` (`=== "warden" ? … : "wi"`, from `7ea1e3a`, v2.2 plan 05); `stagecraftCoordinator.ts:106-109,381,410-414` | proposals before the warden / before V10 | Current writes always set `target.uid` or fail (`stagecraftCoordinator.ts:332-341`) | S (~10) | `stagecraftCoordinator.review.test.ts:369` ("a write recorded without a uid…") |
| H17 | Wizard session without `createdLorebooks` (before V18) | `copilotCoordinator.ts:78-85` (`?? session?.applied`); `wizardSessions.ts:79`; `wizard/types.ts:73-75` | 1 live session | Fallback removed: that session owns no books, which is the safe direction | S | `copilotOwnedLorebooks.test.ts:62,77`; `wizardSessions.test.ts:45` (the legacy half) |
| H18 | Pre-T14 mirror books adopting the owner marker (E4) | `memoryMirror.ts:74-82,147`; wording `mirrorReaper.ts:164` ("may predate v2.4") | the 10 per-chat books on this install | Once H1 resets those chats, their `wiBook` is gone and E4 can never fire. **Keep** `leftoverComments` (`:66-72`), which is generic; drop the scene-row history in its comment (`:57-59`) | S (~12) | `memoryMirror.test.ts:271-358` (E4 describe) |
| H19 | **v1 artefacts**: `stories/*.yaml` (v1 format, `global_lorebook:`, read by nothing), `so-library.mts --legacy` (dead `studio` store) | `stories/lost-key.yaml`, `stories/sun-ruins/quest-for-the-sun-ruins.yaml`; `scripts/debug/so-library.mts:36-53,97,108-113` | nothing (the `studio` key is absent on this install) | Nothing reads either | S | cited only in `docs/review/2026-09-18/evidence/inventory.json:2277,2283`, which is a record: leave it |
| H20 | Cleanup of **old fixed-name mirror books** (`--legacy-mirrors`) | `scripts/debug/lib/assetScope.mts:8,25-32,36-55`; `so-assets.mts:148-153,207-208,211,225` | 8 such books exist today | Delete the 8 books once (Q3), then remove the flag | S | `assetScope.test.mts:13`, which is the `provenBy` of findings-ledger **S9** (`test/findings/ledger.json:386-390`). `findingsLedger.test.ts:78-88` fails unless S9 is re-pointed at another S9 test in the same file |
| H21 | Debug reads of hash-era blob fields | `so-library.mts:82`, `so-scenario.mts:134` (`selectedStoryHash`); `so-library.mts:123` (`--hash`); `lib/configRestore.mts:8`; `so-run-header.mts:245` (`record.hash` fallback) | v2 blobs | Harmless, but they document a shape that no longer exists | S | `npm run test:debug` suites touching these |

### A: authoring convenience (hand-written story JSON)

None of these is our history. v1 had no `requirements` field (`git grep` over `1289633` finds none). The requirement
aliases came in speculatively with v2 plan 02 (`c2ee9e6`). The Studio and wizard emit canonical keys only
(`copilot/parse.ts:295-300`), and no story, example or fixture in the repo uses an alias.

| # | Alias / shorthand | Where | Recommendation |
|---|---|---|---|
| A1 | `requirements.persona`, `groupMembers`, `group_members`, `globalLorebooks`, `global_lorebooks` | `engine/validate.ts:550-552`; `schema.ts:224-225` | **Remove.** One vocabulary; unused; two casings of one alias is drift, not convenience. Better: an unknown `requirements` key becomes a validation error, so a typo stops silently requiring nothing |
| A2 | `stagecraft.lorebook`, `lore_select.lorebook` (singular) | `validate.ts:567,588` | **Remove**, same reason. Test `stagecraftFormat.test.ts:42-46` |
| A3 | `agency.fallback` → `alternate` | `validate.ts:265` | **Remove.** `fallback` is also a judge-record field, so reading it in stories invites confusion. Test `agency.test.ts:43-44` |
| A4 | `effects.background: "file.jpg"` shorthand for `{name}` | `validate.ts:189-198` | **Keep.** It is documented, and the Studio accepts it |
| A5 | `talk_control.speakers: ["Arin"]` string form | `validate.ts:~290` | **Keep** |
| A6 | A requirement list given as one string | `validate.ts:538-541` | **Keep** (cheap, and A1–A2 share it) |
| A7 | A story without `id` keys as `legacy-<contentHash>` | `storyLibrary.ts:21-23,94-97`; `validate.ts:640-644` | **Rename, don't keep the name.** Derive the id from the title slug on import, as the Studio already does (`availableStoryId`, `storyLibrary.ts:96-103`), so there is one identity scheme and the word "legacy" leaves the id space. Test `storyIdentity.test.ts:92` changes |
| A8 | `version` absent → 1 | `validate.ts:645,746` | **Keep** |

### C: host-version compat (SillyTavern support, separate from our history)

| # | What | Where | Recommendation |
|---|---|---|---|
| C1 | **MacrosParser dual-engine seam**. The only API that feeds both the legacy and new macro engines. It includes the startup try/catch and the "legacy" engine label | `stHost/context.ts:7,13,49-56`; `runtime/index.ts:119-126`; `capabilities.ts:36-40`; `version.ts:35-44` | **Keep** until ST removes MacrosParser or flips the default (gotchas "Macros"). Not our history. `{{story_quality::<key>}}` stays blocked by it (v2.5 plan 07) |
| C2 | Fallback `getContext` via `/scripts/extensions.js` for hosts without `SillyTavern.getContext` | `stHost/context.ts:9-16` | **Remove candidate.** It is below the declared minimum (`manifest.json:10` `minimum_client_version: 1.18.0`). Verify on `51ad27fb` that `SillyTavern.getContext` exists, and that jest does not depend on it |
| C3 | `SlashCommandEnumValue` absent → bare strings | `runtime/slashCommands.ts:27-36` | **Remove candidate**, once 1.18.0 is confirmed to export it |
| C4 | **ST 1.18.0 support**: manifest minimum; 1.18.0 columns in `v2.4/host-facts.md`; `docs/release/2.3.0/clean-host-older/`; v2.5 plan 10 "a 1.18.0 clean host"; X4's multi-delete row `blocked` on 1.18.0 (`v2.4/00-overview.md:433`) | as listed | **User decision (Q4).** No `src` branch is 1.18-specific. Raising the minimum to 1.19.0 removes the clean-host-older leg, the 1.18.0 host-fact re-checks, and the blocked row |
| C5 | Capability probes (`vectors` → Jaccard, `backgrounds`, `judge`, `contextBudget`, `slashCommands`) | `stHost/capabilities.ts`; `consolidationMatches.ts:12` | **Keep.** These are install-configuration differences, not ST versions |

### I: internal-API compat (not persisted; production-readiness)

| # | What | Where | Recommendation |
|---|---|---|---|
| I1 | `beginRun(ownership?)`: an unowned run never lapses, "so … every test written before this … keeps working" | `runtime/runToken.ts:147-153` | Make it required. Test churn is M. `ownership.guard.test.ts` already tracks real coverage |
| I2 | `EffectsApplier(ownership?)`, same rationale | `runtime/effectsApplier.ts:169-172` | Make it required, same |
| I3 | `settingsReady` opens with no host context; `noteHostSettingsLoaded?.()` | `stHost/context.ts:36-39`; `runtime/index.ts:335-337` | Low value. Leave it: it is stub tolerance, not history |

### T: test-only items that go with an H row (and what cites them)

| Item | Goes with | Citations that break |
|---|---|---|
| `src/runtime/persistenceMigration.test.ts` | H1, H2 | None read by a test. It is named in the mutation records `test/findings/mutations/v24-02-T11.txt:2` (a record: keep; nothing parses it) |
| `test/fixtures/legacy-v2-chat-blob.json`, `test/fixtures/v3-chat-blob.json` | H1 | `v3-chat-blob.json` is backticked in `docs/plans/v2.3/03-async-ownership.md` and `04-rollback-invariant.md`, which `scripts/release/citations.test.mjs` scans (`citations.mjs:40-43`). It needs a `"kind": "removed"` row in `scripts/release/citations-known.json`. The existing `legacy-v3-chat-blob.json` row (`:8`) stays valid |
| `src/runtime/extrasLegacy.test.ts` `:30-75` | H10, H12 | The file is backticked in `docs/plans/v2.3/07-generated-branching-and-agency.md`. **Keep the file** (its D3 and V12 blocks stay), or add a `removed` row if it is renamed. Mutation records `v24-03-breaker.txt:2`, `v24-03-wedges.txt:2` name it (records: keep) |
| J10.8, J10.11 (`j10-identity-and-settings.journey.json`) | H1 | `attestation.test.mjs` checks journey **ids** (`attestationChecks.mjs:22-30`), not check ids, so removing checks is safe. Archived J10 records keep their results. Also update `docs/plans/v2.1/test-plan.md:222-223` |
| J10.1 / J10.7 `version >= 3` asserts | policy §3 | Assert `=== 5` (or `>= 5`) |
| `seed_metadata` verb | — | **Keep.** `test/scenarios/v24-02-unrecognized-blob.json` (T11) and J10.13 use it. Only its README example (`scripts/debug/README.md:79`) names the legacy fixture |
| `runtimeManager.test.ts:333-376`, `:1325`; `storyIdentity.test.ts:92,233`; `engine.test.ts:455`; `storyDiff.test.ts:307` (part); `settingsWrites.test.ts:85,98`; `librarySave.test.ts:100`; `memoryMirror.test.ts:271-358`; `copilotOwnedLorebooks.test.ts:62,77`; `wizardSessions.test.ts:45` (part); `stagecraftCoordinator.review.test.ts:369`; `provenance.test.ts:47,236` (part); stories `MemoryLegacyRowsAreAStatedUnknown`, `ALegacySideReadsAsUnknown` | H6–H18 | None cited by the fault matrix (`test/findings/faultMatrix.json` evidence rows checked: none point at these) |
| `assetScope.test.mts:13` | H20 | findings-ledger S9 `provenBy` (see H20) |
| Census row `MemoryCoordinator.dismissLegacyPinPrompt` | H11 | Must be deleted with the method (`ownership.guard.test.ts:59`) |

**Keep:** `blobUnreadable.review.test.ts`, `blobForeign.review.test.ts`, `v24-02-unrecognized-blob.json`, J10.13, and
fault-matrix cell `persistence|malformedResponse` (`faultMatrix.json:357-361`). Under the new policy these **are** the
reset path.

### D: docs describing H items (update in the same change)

`.claude/rules/gotchas.md:5` (schema-literal lesson; keep the lesson, change the example), `:37` ("blob **version 3**,
… A v2 blob migrates on first read …"), `:45` (`seed_metadata` "migration gates"); `.claude/rules/debug-scripts.md:14`
(`--legacy`), `:15` (old fixed-name books); `.claude/skills/debug/SKILL.md:68`; `scripts/debug/README.md:54,78-80`;
`docs/architecture-v2.md:65,285-286`; `.claude/rules/architecture.md` (the three-homes and story-identity invariants
mention v3 keying: re-read them). **Keep** plan docs and gate records as history.

## 3. Target: one current schema, reset on anything else

| Rule | Proposal |
|---|---|
| Chat blob | **Bump to v5** in the removal change, with `KNOWN_VERSIONS = [5]` (`persistence.ts:65`). Every field that is optional only for old blobs becomes required: `engineHistory`, `engineState.visitedPath`, the `provenance` of memory/epistemic/ledger rows, the expansion `contract`/`origin`, and `pinnedStory`. Also `chatId` (verify the no-chat `createBlob` case first). The bump is what makes "required" true: a v4 blob on disk can lack `engineHistory` (38 stories do), so v4 cannot simply be re-declared current |
| Anything else (v2, v3, v4, missing, v6+) | The **T11 unreadable path**, unchanged: read detached, never written, and a confirmed Restart replaces it (`persistence.ts:121-125,169-175`; `storySelection.ts:115-131`). This keeps "never destroy without a click" and is already tested. `unreadableNotice` (`persistence.ts:84-86`) loses its "newer build" branch: one message, "saved by another version of Story Orchestrator: Restart to replace it" |
| Future changes before release | Each schema change is a bump plus the same reset. No migration code until the first public release. After release, the rule is re-decided (Q5) |
| Install-wide settings / library / wizard sessions | No version stamp exists today. **Proposal:** add `schema: 1` at `extensionSettings["story-orchestrator"]` now, so a first release has a baseline. Sanitizers stay defensive: a malformed field falls back to its default. Only the H6/H9/H17 **history** branches go |
| v2.5 draft conflicts | `docs/plans/v2.5/00-overview.md` still inherits rule 3 (`:35-36`, "Rule 3 (no chat-blob version bump) still binds") and has V7 (`:207`), rule 9 "Install-wide settings stay downgrade-readable" (`:38`), plan 01's downgrade leg (`:59`, `:165`), plan 10's "downgrade legs" (`:68`), and the residue row where the downgrade leg "gates rule 3" (`:177`). All rest on the downgrade rationale E9 removed. The overview needs a reconciliation edit before any build agent reads it |

## 4. Order and dependencies

1. **Policy change** (§3): v5 bump and `KNOWN_VERSIONS=[5]`. This unlocks H1–H5, H8, H13–H15.
2. **Remove H1/H2** (`persistenceMigration.ts`, v2/v3 branches), then narrow types (H3, H5, H13, H14). Run
   `npm run typecheck:test` (jest does not type-check; gotchas).
3. **H10 + H11** together: required `provenance`, fix what tsc names, then delete the pin prompt, its census row and
   the two stories.
4. **H6/H7/H9** (library and settings history). Independent of 1–3.
5. **H12, H15, H16, H17, H18**: small and independent.
6. **A1–A3, A7** (schema input); `storyDiff` is unaffected, because it diffs normalised stories.
7. **Debug and docs**: H19–H21, D rows, the S9 re-point, and the `citations-known.json` `removed` rows.
8. **One-time data actions on this install and the lanes** (Q3): discard or leave the 59 old blobs, which reset on
   next open anyway; delete 8 fixed-name mirror books and the unmarked per-chat books; re-seed lanes
   (`st-lanes.mts seed n --fresh`), because lane data roots are copies that carry the same old blobs.

Gates per CLAUDE.md: steps 1–5 touch the runtime, so they need `npm run typecheck && npm run lint && npm test` plus
`npm run build` and the live gate. J10 ×2 is the natural live proof: select, hydrate, restart, unreadable → Restart.

## 5. Payoff ranking

| Rank | Items | Why |
|---|---|---|
| 1 | H1 + H2 + H3 + H5 + the §3 policy | Deletes a whole module and two fixtures (≈ 410 lines incl. tests and fixtures). Collapses three read branches into one. Makes story state one shape. Every later H item depends on it |
| 2 | H10 + H11 | Removes a provenance source value that exists only to describe old rows; UI, stories, a census row and a player-visible prompt go. Frees `memoryCoordinator` lines (619/620, v2.5 plan 03 V4) |
| 3 | H8 + H9 + H15 | Hydrate becomes a pure sanitizer, and the settings lift leaves the manager (736/740) |
| 4 | H6 + H7 | The library is id-only; `idOrHash` leaves three modules |
| 5 | A1–A3, A7 | One authoring vocabulary. "legacy" leaves the id space |
| 6 | H12–H14, H16–H21, C2–C3 | Small, local, low risk |

## 6. Counts

| Category | Items | Remove | Keep / decide |
|---|---|---|---|
| H our-history | 21 | 21 (H4 after verification) | parts kept inside H12 (contract drop), H13 (`repairActiveCheckpoint`), H14 (null-history hydrate), H18 (`leftoverComments`) |
| A authoring | 8 | 3 (A1–A3); 1 renamed (A7) | 4 keep (A4–A6, A8) |
| C host-version | 5 | 2 candidates (C2, C3) | C1, C5 keep; C4 user decision |
| I internal-API | 3 | 2 (I1, I2) | I3 keep |
| T test-only | 17 files/blocks + 2 fixtures + 2 journey checks + 1 census row + 1 ledger re-point | with their H row | blobUnreadable, T11 scenario, J10.13 keep |

## 7. Questions for the user

- **Q1** The library holds authored stories (Adolion academy v11, adventurer v9). Chat state resets, but the library
  is **not** reset: the H6 sanitizer drops only records without an id, and none exist today. Confirm.
- **Q2** Reset UX for the 49 v2/v3 chats (and v4 chats after the v5 bump): the T11 path, with a notice and a
  **confirmed** Restart per chat (proposed), or silent automatic replacement on open?
- **Q3** One-time cleanup on this install: delete the 8 fixed-name `Story Orchestrator - <title>.json` books and the
  unmarked per-chat mirror books? These are lorebook files, so it is destructive and your call. After that,
  `--legacy-mirrors` (H20) goes.
- **Q4** Keep ST **1.18.0** as the declared minimum (`manifest.json:10`) or raise it to 1.19.0? This decides C2–C4,
  the clean-host-older leg and the 1.18.0 host-fact columns.
- **Q5** After the first public release, do schema changes get migrations, or does reset-with-confirm stay the
  policy? This decides whether the `schema: 1` stamp in §3 is enough.
- **Q6** Remove the requirement and agency aliases (A1–A3) outright, or make unknown keys a validation error with a
  "did you mean `members`?" hint?

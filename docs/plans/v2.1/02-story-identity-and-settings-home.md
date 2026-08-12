# Plan 02 — Story identity & settings home

## Objective

Give stories a stable identity (`id` + `version`, hash demoted to integrity) and give every setting its correct lifetime home (global vs per-chat), so: a new chat on a configured install plays immediately (U1), selecting/re-selecting a story never silently destroys progress (U2 mechanics), and the per-chat blob stops mixing three lifetimes (I3). This is the data foundation for plans 04–06.

## Context

- Spec addendum §Story identity, §Configuration homes.
- Current state: identity = content hash (`src/runtime/hash.ts`), library keyed by hash in `extensionSettings["story-orchestrator"].v2Stories` (`storyLibrary.ts`); per-chat blob `chat_metadata.story_orchestrator {version:2, selectedStoryHash, stories{hash: {engineState, extras}}}` (`persistence.ts`); ALL settings live in `extras.*` with `defaultExtractionSettings()` = `{enabled:false, profileId:null}` (`runtimeManager.ts:18`); `selectStory(hash,"activate")` → `createExtras()` wipe (`runtimeManager.ts:1265`).
- Consumed: plan-01 journeys J1 (must flip to pass), J2 partial, migration journey (new).

## Scope

In: format-2 `id`/`version`, normalization, library rekey, per-chat rekey + migration, settings split + migration, non-destructive select, Restart affordance, settings-panel regroup to match the homes.
Non-goals: Studio save→hot-swap UX and invalidation flow (plan 05); moving code out of RuntimeManager beyond what the settings split forces (plan 03); first-run wizard polish (plan 04 surfaces it).

## Deliverables

- `engine/schema.ts` + `validate.ts`: `id?: string` (slug pattern), `version?: number ≥1`; normalize missing → `id = "legacy-" + contentHash`, `version = 1`. Diagnostics: duplicate id in a library is a save-time error, not a story error.
- `storyLibrary.ts`: records `{id, version, hash, title, description, raw, importedAt, updatedAt}` keyed by id; import of same id + different hash **updates** the record (bumping version if the incoming JSON doesn't raise it) instead of forking; one-time rekey of existing `v2Stories` (hash → normalized id; collisions keep newest, log).
- `persistence.ts`: blob `{version:3, selectedStoryId, stories{id: {pinnedStory, playedVersion, contentHashAtLoad, engineState, extras}}}` — **`pinnedStory` = full raw story copy pinned at selection** (spec addendum §Story identity: chats are self-contained; library edits/deletion never affect a running chat; hydrate loads the pinned copy, the library is consulted only on new selection). Migration v2→v3 on first read (hash keys resolved via library rekey map, `pinnedStory` filled from the matching record's `raw`; unresolvable keys preserved under `legacy-<hash>` with a warning). GC cap on non-selected story states (pinned copies included in the size math — sun-ruins raw ≈ 17 KB, smaller than engineState+extras).
- New `runtime/settingsStore.ts` (global home; the first plan-03-style extracted service): defaults + read/write for extraction (enabled **default true**, profileId, cadence, lag, reconcile×), pacing (α, hint), display (announce, hud), copilot.enabled, memory settings incl. `epistemicLedgerCapable`. Per-chat extras keep only: engine-owned state, rings, and overrides `{authorView, talk.enabled, shapeOverride}`. Migration: first hydrate of an old chat lifts its `extras.*.settings` into global **iff** global still at defaults; then strips them from extras.
- Select semantics (`runtimeManager`): `selectStory(id)` — same id ⇒ always hydrate the pinned copy (never wipe, never silently re-pin); different id with existing progress for it ⇒ hydrate its pinned copy; brand-new ⇒ activate + pin the latest library version. `restartStory()` = the only reset path, behind a confirm popup (re-pins latest on restart). A newer library version **never** auto-applies to an existing chat — plan 05 owns the explicit update/re-pin path. Story delete confirm copy updated: chats keep playing their pinned copies.
- Settings panel regroup (persona: author-leaning, but it's the config surface): global sections labeled as install-wide; per-chat overrides visually separated; the "no profile" warning becomes the single actionable "not configured" state (spec addendum §Configuration homes).
- **Model self-test** (Smart-Memory `model-test.js` pattern, no code vendored — 00-overview §External-base learnings): a "Test memory model" button next to the profile select runs fixed fixture scenarios through the **real** per-tier prompt/parse pipeline (reuse `extraction/fixtureRun.ts` — the live-suite path), cancellable, per-tier pass/fail readout (deltas, memory, arcs, epistemic, ledger); failing epistemic/ledger tiers suggest (never silently set) `epistemicLedgerCapable: false`. This is the evidence behind the capability profile and the first-run confidence check plan 04's "not configured" state links to.
- Tooling (v2 rule 9): `so-state` prints id/version/playedVersion + settings home; `so-scenario` verbs for select/restart/migration assertions; new `test/journeys/migration.journey.json` (open a captured pre-v2.1 chat fixture → everything survives).

Exports: `settingsStore`, id-keyed library/persistence contracts, `restartStory()`, migration fixtures.

## Implementation notes

- Keep `hashStory` untouched — it becomes `contentHash`, still used for dedup + drift (`contentHashAtLoad` vs record hash tells plan 05 an edit happened while playing).
- `createExtras()` shrinks: settings factories move to `settingsStore`; sanitizers stay for rings. Rule 3: runtimeManager.ts line count must go **down** this plan.
- Update `examples/sun-ruins/quest-for-the-sun-ruins.json` with a real `id` (`sun-ruins`) + `version`.
- Live-suite/debug scripts referencing hashes (`so-library.mts remove`, memory notes re `v2-99109210`) must accept id or hash; update `scripts/debug/README.md` + `.claude/rules/*` (rule 5).
- Watch `chat_metadata` size: GC keeps selected + N most-recent story states (N delegated).

## Validation gate

Harness: full baseline (incl. v2 scenario corpus) + migration unit tests (v2 blob fixture → v3). Live journey gates (fresh-start): **J1 green end-to-end** (the plan's headline: new chat on configured install advances by real extraction with zero per-chat setup); migration journey green on a real pre-plan chat copy; **pinning checks** — re-selecting the same story preserves progress, and a chat whose story was *deleted from the library* keeps playing from its pinned copy (the user-decided semantics, otherwise untested); J3 regression floor. Gate record: before/after `runtimeManager.ts` line count.

## Delegated decisions

- Slug rules for `id`; whether Studio auto-derives from title.
- GC retention N for non-selected story states.
- Whether `talk.enabled` gains a global default with per-chat override (leaning yes, override wins).

## Resolved decisions (user, 2026-08-11)

- Extraction `enabled` defaults **true** globally (confirmed; only affects chats with a story selected, idles as "not configured" without a profile).
- **Version pinning**: chats store a full pinned story copy; no automatic propagation of library edits; new chats pin latest (spec addendum §Story identity).

## Gate record

**Date**: 2026-08-12 · **Status**: COMPLETE. Harness green; live gates run headed against the real model (gemma4-mtp via "Story Orchestrator Memory Local"), fresh-start, no `debugResponse` on any LLM-consuming path.

### Delivered

| Deliverable | Where |
|---|---|
| Format-2 `id` (slug) + `version` (int ≥1) | `engine/schema.ts` (`STORY_ID_PATTERN`), `engine/validate.ts` — malformed id/version is a validation error, not a silent rewrite |
| Library keyed by id, records `{id, version, hash, title, description, raw, importedAt, updatedAt}` | `runtime/storyLibrary.ts` — read-time rekey of pre-v2.1 records (`legacy-<hash>`, newest wins on collision, warned), re-import of the same id **updates** the record and bumps `version` when the author didn't |
| Per-chat blob v3: `{version:3, selectedStoryId, stories[id]: {pinnedStory, playedVersion, contentHashAtLoad, engineState, extras}}` + GC (`STORY_STATE_RETENTION = 5`) | `runtime/persistence.ts` |
| v2→v3 migration (hash→id via library, **title fallback** for stories that gained an id, unresolvable kept as `legacy-<hash>` + warning) | `runtime/persistenceMigration.ts` (+ 5 unit tests) |
| Install-wide settings home, extraction **enabled by default** | `runtime/settingsStore.ts` (`extensionSettings["story-orchestrator"].settings`), `liftLegacyChatSettings` one-time lift from an old chat |
| Per-chat overrides only: `ui.authorView`, `pacing.shapeOverride`, `talk.enabled` | `runtime/extras.ts` — `applyGlobalSettings` composes the in-memory view every reader already used; `stripGlobalSettings` removes the install-wide half on persist |
| Non-destructive select + `restartStory()` (confirm popup, re-pins latest) | `runtime/runtimeManager.ts` |
| Snapshot identity: `storyId`, `storyIdentity {playedVersion, libraryVersion, pinned, drifted}` | `runtime/snapshot.ts` (pure readouts, extracted) |
| Settings panel regrouped by lifetime, Restart, drift note, "not configured" state | `src/index.tsx` (`#so-restart-story`, `#so-story-identity`, `#so-not-configured`) |
| **Model self-test** over fixed fixtures through the real prompt/parse path, per-tier pass/fail, cancellable, suggests (never sets) `epistemicLedgerCapable: false` | `runtime/selfTest.ts` + `#so-self-test` / `#so-self-test-apply` (6 unit tests) |
| Tooling | `so-state` prints `selectedStoryId`, `storyIdentity`, `settingsHome`, library ids; `so-library` accepts id\|hash\|title; `so-scenario` gains `restart_story` (answers its own confirm) and `expect.storyId` / `expect.storyIdentity`; `examples/sun-ruins` now ships `id: "sun-ruins"`, `version: 1` |
| **J10 identity-and-settings** journey (8 auto + 2 human) | `test/journeys/j10-identity-and-settings.journey.json`, catalogued in `test-plan.md` |

Rule 3 (no net RuntimeManager growth): **1718 → 1708** lines — the settings setters route to `settingsStore`, and the snapshot readouts moved to `runtime/snapshot.ts`. Rule 5: `.claude/rules/architecture.md`, `.claude/rules/gotchas.md`, `docs/architecture-v2.md`, `scripts/debug/README.md`, `.claude/CLAUDE.md`, `docs/plans/v2.1/test-plan.md` all updated in this plan.

### Harness

```
npm run typecheck         -> clean
npm run lint              -> clean
npm test                  -> 51 suites / 1470 tests passed (was 48/1445; +persistenceMigration, +storyIdentity, +selfTest)
npm run build             -> webpack compiled (2 pre-existing size warnings)
npm run debug:typecheck   -> clean
npm run test-storybook:ci -> 20 suites / 65 tests passed
```

v2 scenario corpus (`--sandbox`): `plan02-runtime`, `plan03-extraction`, `plan03a-edit-rollback`, `plan03a-delete-rollback`, `plan04-pacing`, `plan06-convergence`, `plan07-memory`, `plan08-hygiene`, `plan09-arcs`, `plan10-epistemic-ledger`, `plan12-copilot`, `plan13-surfacing` — all `ok: true` (plan09 failed once mid-batch on state left by the previous scenario and passed cleanly on its own re-run; batches must be run one at a time, as plan 01 recorded). `plan05-background-generation` stays the known-stale scenario inherited from plan 01 — untouched by this plan.

### Live gates (real model, fresh-start, headed)

**J10 identity-and-settings — 8/8 auto pass**:

| Check | Outcome | Evidence |
|---|---|---|
| J10.1 | pass | example story imports as `sun-ruins`; blob v3, `selectedStoryId`, `pinnedStory` present |
| J10.2 | pass | profile lands in install settings; chat extras carry **no** extraction or memory settings |
| J10.3 | pass | re-selecting the same story keeps cp2 + latched blackboard (no wipe) |
| J10.4 | pass | library edit while playing → chat keeps its pinned description, `drifted: true` |
| J10.5 | pass | library record deleted → chat still at cp2 from its pinned copy, `libraryVersion: null` |
| J10.6 | pass | brand-new chat + select → `enabled` and `profileId` inherited, story pinned, no per-chat setup |
| J10.7 | pass | Restart → back to cp1 with the blackboard cleared |
| J10.8 | pass | hand-built v2 hash-keyed blob → migrated to `sun-ruins`, story pinned |

**J1 first-contact — the plan's headline, now 6 pass / 0 fail / 1 blocked** (was 4 pass / 1 fail / 2 blocked at the plan-01 baseline):

- **J1.2 flipped fail → pass**: a brand-new chat has extraction enabled by default (U1).
- **J1.3 flipped blocked → pass**: the memory profile is install-wide and no longer stored per chat (U1/I3).
- J1.4 remains `blocked` (no first-run path — plan 04/06 owns it).
- J1.5–J1.7 still pass: import from the panel → configure → first real transition fires and is announced.

**Regression floor**: J3 unchanged from baseline (5 pass / 1 fail / 2 blocked — the fail is the known U3 spoiler leak plan 04 owns); J6 unchanged (3 pass / 1 blocked). **J2.4 flipped blocked → pass** after its capability probe was corrected (it tested a *value*, not the contract) and its steps were made self-contained: re-importing an edited story keeps one identity and one library record.

**Migration evidence — qualified.** The plan asked for the migration journey to run on "a real pre-plan chat copy". No such chat survives in this install: the pre-v2.1 sun-ruins chat was deleted during the plan-01 session's `/delchat` churn, and the remaining older chats (`2026-07-05@22h24m…`, `2026-07-05@22h55m…`, `2026-07-06@05h51m…`) never carried orchestrator state — opening each of them live shows a clean v3 blob with no stories to migrate. J10.8 therefore builds the v2 hash-keyed blob **in the live chat** and reopens it through the real `getMetadataBlob()` path (plus 5 unit tests over `migrateMetadataBlob`, including the title fallback and the unresolvable case). That is a live migration through the shipped code, but not over an untouched historical chat — if you have a backup of one, running J10 against it would close the gap.

### Deviations

- **Where the `legacy-<hash>` fallback is computed**: the plan put it in `validate.ts`; the content hash lives in the runtime layer, so `parseStoryV2` normalizes `id`/`version` only and `storyLibrary.storyIdFor()` assigns `legacy-<contentHash>` when a story has no authored id. Same observable contract, no new engine→runtime dependency.
- **Migration title fallback (added, not in the plan)**: giving the shipped example an `id` also changed its content hash, so a pre-v2.1 chat could not be matched by hash alone. The migration now falls back to the story title the chat recorded; without it, existing sun-ruins chats would have lost their story on first open.
- **Settings composition instead of a call-site rewrite**: `extras.*.settings` still exists in memory (composed by `applyGlobalSettings`), so the ~45 read sites are untouched; only the setters and the persisted shape changed. This keeps the diff honest and rule 3 satisfiable; plan 03 can take the next step.
- `talk.enabled` gained a global default with a per-chat override (the delegated decision, resolved: override wins). `setTalkDirectionEnabled(enabled, scope)` defaults to chat scope.
- GC retention N = 5 non-selected story states (delegated decision).
- Studio auto-derivation of an id from the title is **not** done here — the Studio's authoring surface is plan 05; today a story without an authored id gets a stable `legacy-` identity.

### Unresolved

- `restartStory()` is reachable from the settings panel only; the player-facing Restart affordance is plan 04's surface work.
- The library can hold both `sun-ruins` and an old `legacy-<hash>` record for the same title after upgrading (the pre-v2.1 record is kept, not merged, because merging would silently repoint chats). Cleaning that up is a user action (delete the legacy record) — worth a line in plan 04's settings surface if it proves confusing.
- Human checks J10.9/J10.10 (settings-home legibility, self-test usefulness) are unanswered, like the rest of the human rubric — they need the user's session.

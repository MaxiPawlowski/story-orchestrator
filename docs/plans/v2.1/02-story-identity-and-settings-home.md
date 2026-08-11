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

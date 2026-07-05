# Plan 07 — Memory Foundation (Smart-Memory Vendor)

## Objective

Vendor Smart-Memory into the extension and stand up the grounding layer's foundation: tier stores (facts / session details / scene history), memory extraction merged into the shared read (one call, two consumers), scene detection as the scheduling heartbeat, the cast model's per-character stores, and basic depth injection.

## Context

- Spec: §Memory subsystem (tiers table, shared read, scene detection, bridges intro), §Cast model, §ST integration (injection, storage).
- Consumes from 03: `sharedRead`/`contract`/`parse` (extend), scheduler (add P2), first-cut facts blob, audit records. From 02: TalkControl (add `sceneBreak` trigger), cast effects (`stHost/groups.ts`), persistence.
- **Base**: [Smart-Memory](https://github.com/senjinthedragon/Smart-Memory) (AGPL-3.0). Clone, pin a commit (record hash), read `docs/architecture.html` + `/tests` first. Relevant modules this plan: `longterm.js`, `session.js`, `scenes.js`, `prompts.js`, `parsers.js`, `memory-utils.js`, `profiles.js`.
- ST fact: `setExtensionPrompt` via `getContext()` (`st-context.js:40`) for depth injection.

## Scope

**In**: vendoring setup + LICENSE, tier stores + types, shared-read contract/parser extension for memory tags, scene detection (heuristics + contract question + P2 pass), per-character namespacing, roster wiring, depth injection, memory debug panel.
**Non-goals**: supersession/consolidation/scoring/budgets (08), arcs/canon upgrade (09), epistemic/ledger (10), WI writing (08).

## Deliverables

- Vendoring: `vendor/smart-memory/` (pinned checkout, reference only, excluded from build) + `LICENSE` (AGPL-3.0) at repo root + attribution note in README. Ported code goes to `src/memory/` as TS — port per module as consumed, don't bulk-convert.
- `src/memory/types.ts` — memory entry shape (port + extend): `{id, tier, text, type, importance 1-3, expiration scene|session|permanent, entities[], confidence, activationTriggers[], supersededBy?, characterId?, createdAt(turn), recallCount}`.
- `src/memory/stores.ts` — chat_metadata-backed stores: `facts` (per character + shared), `session_details`, `short_term` (Smart-Memory's rolling-summary tier — automatic summaries of recent play, complements scene history in very long scenes), `scene_history` (rolling window). Migrate 03's first-cut facts in (as-built: `extras.extraction.facts`, capped `slice(-50)` — lift the cap into tier budgets; entries carry `{boundary, messageId}` stamps since 03a). Rollback hook: on engine rollback (spec §Chat mutations), drop entries with `createdAt ≥ T` across all tiers.
- **Memorize backlog** — settings/drawer action for mid-chat adoption (Smart-Memory's "Memorize Chat"): windowed shared reads over existing history backfill the tiers, then one full-scope blackboard backfill read (03's historical-window support); progress indicator; scheduler P4 so live play is unaffected.
- Shared-read extension: contract gains Smart-Memory-style tagged extraction (port/adapt `prompts.js` sections for facts + session + scene summary), parser gains tag grammar (port `parsers.js` logic to TS with tests). Still ONE call per read: deltas + memory lines.
- `src/memory/sceneDetect.ts` — per-message code heuristics (time-skip phrasing port from `scenes.js`, `location` quality change, `---` divider, cast change); hit → P0 shared read; every read contract includes "did a scene break occur, where?"; confirmed break → P2 pass: scene summary → `scene_history`, expire `expiration: scene` entries, fire TalkControl `sceneBreak` triggers.
- Cast model: roster from story schema; per-character store namespacing (`characterId`); checkpoint `cast_changes` already applied by 02 — connect enabled-set to stores + injection (only enabled characters' tiers injected).
- `src/memory/inject.ts` — depth injection via `setExtensionPrompt` (one key per tier, configurable depth, ordered block; Smart-Memory default depths as starting values). Responding-character awareness lands in 10; here inject shared + active-speaker facts.
- Manual controls (MessageSummarize pattern): per-entry `pinned` flag (never trimmed or expired — generalizes arc pinning to all tiers) and exclude/delete backed by an exclusion list stored per chat; the consolidation contract handed to plan 08 must consult it so excluded entries are never re-added as folds. Inline entry text editing in the panel.
- Memory debug panel (drawer tab): per-tier entries, character filter, raw audit link, pin/exclude/edit controls per entry.
- Suite-B eval fixtures extended: facts/session/scene tags asserted per 03's fuzzy scheme.

## Implementation notes

- Port discipline: Smart-Memory is battle-tested — preserve its extraction wording and parsing tolerances where possible; adapt storage (their per-chat store → our chat_metadata blobs) and remove their standalone scheduler/LLM client in favor of ours (03).
- Their multi-backend LLM client is NOT ported — Connection Profiles only (03's client).
- Scene detection must not add any standalone per-message LLM call (spec rule) — heuristics + piggyback question only.
- P2 pass ordering: scene summary runs before scene-expiration so the summary can cite expiring detail.
- Tier write ordering: memory updates carry their read's turn range; a tier write whose range is fully covered by a newer completed read for the same tier+character is dropped — mirror of 01's blackboard coverage rule, so P1 shared-read lines and P2 per-character passes cannot interleave stale.

## Validation gate

1. Baseline green; parser ports covered by unit tests (including Smart-Memory's own test cases where portable); suite-B fixtures pass on goldens.
2. Live: scripted scene (arrive → talk → `---` + location change) → `so-state.mjs`/debug panel show facts + session details extracted, scene break detected, scene summary in history, scene-scoped entries expired, `sceneBreak` NPC reply fired once.
3. Cast: checkpoint disables a member → their tier stops injecting; store retained.
4. Injection visible in prompt at configured depth (`st-context.mjs` extension prompts).
5. Memorize backlog on a pre-existing chat with history: tiers backfilled, blackboard backfill read applied, live play unaffected during the run; short-term rolling summary appears after sustained play.
6. Gate record: pinned Smart-Memory commit hash, modules ported vs pending.

## Delegated decisions

Vendor dir layout; how much of `memory-utils.js`/`profiles.js` to port now vs 08–10; tier injection depths; scene-heuristic regex set (start from Smart-Memory's).

## Gate record

Date: 2026-07-05

Executed as milestones M0–M6 (agreed with user before build): M0 vendoring + build config, M1 tier stores + facts migration, M2 shared-read memory tags, M3 scene detection + P2 pass, M4 depth injection + cast, M5 memorize backlog, M6 manual controls + debug panel + tooling. Each milestone gated individually during the build; final numbers below are the last (M6) run, cumulative over all of plan 07's changes.

Command outputs:
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run debug:typecheck`: passed.
- `npm test`: passed, 12 suites / 1122 tests (up from 8 suites / 1058 tests at plan 06 — new: `src/memory/{stores,parse,sceneDetect,inject}.test.ts`, plus extended `src/extraction/extraction.test.ts` and `src/runtime/runtimeManager.test.ts`).
- `npm run build`: passed with existing warnings only (Browserslist data, bundle size `dist/index.js` 354 KiB, up from 324 KiB at plan 06).

Live checks (all via `debug` skill, `st-session` + `so-scenario`, deterministic debug-response path — no live memory LLM needed):
- `node scripts/debug/so-scenario.mts run test/scenarios/plan07-memory.json --sandbox`: **19/19 steps passed.** Covers, end to end, against real SillyTavern: MEMORY-tag extraction (facts + session_details) from one shared-read call alongside DELTA/FACT; depth injection visible in `ctx.extensionPrompts.story_orchestrator_memory_facts`; scene-break P2 pass (scene summary written to `scene_history`, scene-scoped `session_details` entries expired, ordering: summary before expiry); `sceneBreak` NPC reply fired as a real chat message; cast-disable (`cast_changes` checkpoint effect) stopping a character's facts from injecting while the store entry is retained; `runMemorizeBacklog` on a seeded chat backfilling a new fact via the deterministic debug path; a final `cast_changes` restore step so the scenario is idempotent against the real group's `disabled_members`.
- Additional scratch live checks run per-milestone during the build (M3 scene detection, M4 injection/cast, M5 memorize backlog) — superseded by the canonical scenario above, not persisted.
- `node scripts/debug/st-navigation.mts recent-group` / `so-state.mts current`: clean post-run state confirmed.

As-built:
- **Vendoring**: cloned Smart-Memory at commit `194a011b6b4ecbc0cd347ae8b6e59a6c1a56021a`, pruned to `vendor/smart-memory/{longterm.js, session.js, scenes.js, compaction.js, prompts.js, parsers.js, constants.js, memory-utils.js, LICENSE, docs/architecture.html, tests/}` (21.7K lines → the 8 modules + tests actually consumed). Dropped `profiles.js` from the keep-list — no plan-07 deliverable uses the character/world/relationship-matrix tier it builds (that's Tier-4 derived content closer to plans 09/10); `embeddings.js`/`similarity.js`/`macros.js`/`unified-inject.js`/`trim-stats.js`/`generate.js`/arc-canon-epistemic-ledger modules dropped as out of scope for 07 (08–10's job, or explicitly not ported per plan — own scheduler/LLM client). `compaction.js` (the actual short-term rolling-summary module) kept even though the original plan text named `longterm.js` for that role — its own docstring identifies it as the short-term tier.
- `src/memory/`: `types.ts` (tiers, entry shape, `TIER_FOR_ENTRY_TYPE`, scene-break signal), `stores.ts` (pure `MemoryStoreState` ops: add with coverage-drop + exclusion, drop-by-messageId, expire-scoped, pin, exclude, edit, per-tier cap), `parse.ts` (tokenized `MEMORY`/`SCENE_BREAK` line parser, order-tolerant per the port-tolerance decision), `contract.ts` (prompt addendum + scene-summary prompt), `sceneDetect.ts` (ported heuristic regex set, categorized time_skip/location/divider + code-level cast/location-quality signals), `inject.ts` (per-tier `setStoryExtensionPrompt` blocks, active-speaker-aware for facts).
- `runtime/runtimeManager.ts`: `extras.memory: MemoryRuntimeState` (new), one-time legacy-facts migration on first hydrate (ordering fix: `sanitizeMemory` must run *before* `sanitizeExtraction` overwrites the raw `extraction.facts`, since the migration reads that raw field), `applyExtractionAudit` now writes memory entries and notifies scene-break listeners, `detectSceneBreak`/`runSceneBreakPass` (P2 pass: summary → expire → NPC reply → inject), `getEnabledCharacterIds`/`getActiveSpeakerId`/`updateMemoryInjection` (called at every site `updateSteering` already was, plus after `applyExtractionAudit`/`runSceneBreakPass`), `runMemorizeBacklog` (windowed memory-only backfill + one full-scope blackboard read, reusing `applyExtractionAudit` for both by stripping `acceptedDeltas` on the windowed passes), `setMemoryPinned`/`excludeMemoryEntry`/`editMemoryEntry`.
- `extraction/`: `contract.ts`/`parse.ts` extended for the MEMORY/SCENE_BREAK grammar (still one call, one response); `scope.ts` gained `deriveFullScope` (all extractor qualities, ignoring reachability) for the memorize backlog's full-scope pass; `sharedRead.ts` gained an optional `scope` override so backlog can reuse it without duplicating contract-building; `scheduler.ts`'s `pump()` now runs a job's `run` closure when present (mirrors `pumpHeavy`), enabling P2 scene-break-pass jobs in the reads lane.
- `engine/schema.ts`: `"sceneBreak"` added to `NPC_REPLY_TRIGGERS` (validator already generic over the const).
- UI (`index.tsx`): `MemoryPanel` drawer section (per-tier entries, character filter, pin/exclude/edit, last-audit reference) as a stacked section (drawer has no tabs); "Memorize Chat" settings button.
- Tooling: `so-state.mts` (`factCount` now reads the facts tier; full `memory` block in `decodeRuntime`/`compactCurrent`; `memoryPrompts`/`memoryInjected` in `dumpCurrentChatState`), `so-scenario.mts` (`memory`, `sceneBreaks>=`, `memoryInjection` expect verbs; `backfillComplete` wait verb), `README.md` + `.claude/rules/gotchas.md` updated.
- Build config: `src/memory` wired into `package.json` (lint/lint:fix), `tsconfig.json` (include + `@memory` path), `webpack.config.js` (`@memory` alias), `jest.config.cjs` (`@memory` mapper + `roots`).

Deviations from plan:
- **Barrel vs. leaf imports**: `extraction/contract.ts` and `extraction/parse.ts` import `@memory/contract` and `@memory/parse` directly rather than the `@memory/index` barrel — once `inject.ts` (STAPI-touching) joined the barrel, any barrel consumer transitively pulled in `@services/STAPI`, crashing jest's ts-jest on the pre-existing `modules.ts` top-level-await issue (same class of issue 03a documented). Fixed by pointing extraction's two call sites at the specific leaf modules instead of adding STAPI mocks everywhere.
- **`runMemorizeBacklog` runs directly, not via a P4 scheduler job**: the plan called for each backfill window to be "enqueued as a P4 heavy-lane job." Implemented instead as a direct sequential `RuntimeManager` method, matching the codebase's existing precedent for manual/user-triggered actions (`runExtractionNow`, `runExpansionNow` both bypass the scheduler the same way — the scheduler's lanes are for *automatic* cadence/cue-triggered work). Progress is still tracked and surfaced (`extras.memory.backfill`), and each `await` point yields the event loop so live play remains unaffected; the scheduler's own P0–P3 queues are untouched and keep processing independently during a backfill run.
- **`getEnabledCharacterIds`/`getActiveSpeakerId` reuse `resolveGroupMemberId`** (existing `stHost/groups.ts` export) rather than duplicating its avatar/name/basename resolution logic — an addition of convenience, not a deviation in substance.
- **Live-testing gotcha discovered and fixed in tooling**: a `cast_changes` checkpoint effect mutates the group's `disabled_members`, which is **group-scoped, not chat-scoped** — it outlives `--sandbox`'s `/newchat` and its cleanup. An early milestone's live check left the real "Arin, DM Narrator" group's Arin member disabled after the session; caught and restored (`disabled_members` back to `["Luke.png","Ponticius.png"]`) before finishing, and the canonical scenario now explicitly enables both roster members at the start and restores the disabled member at the end so re-running it is idempotent against ambient group state. Documented in `.claude/rules/debug-scripts.md` for future live-testing sessions, along with the unrelated Git-Bash `MSYS_NO_PATHCONV` gotcha hit while cleaning up (`/delchat` silently mangled to a Windows path without it).
- Fact migration ordering: `loadStory` calls `sanitizeMemory` before `sanitizeExtraction` (the reverse of the two methods' declaration order) specifically so the one-time legacy-facts bridge reads the raw persisted `extraction.facts` before `sanitizeExtraction`'s return object (which no longer has that field) overwrites it in place.

Not carried into 07 (left for 08–10 per scope): supersession, consolidation/dedup (beyond the exclusion-list check already wired into `addMemoryEntries`), relevance scoring/token budgets (tier caps here are simple rolling-window counts), WI write-on-change, arcs/canon, epistemic/ledger, `GROUP_MEMBER_DRAFTED` per-draft private injection swap (07 injects shared + active-speaker facts only, per the user's decision).

## Review fixes (2026-07-05, post-implementation code review)

Post-implementation review found and fixed four issues (gates re-run green: typecheck, lint, `npm test` 1125 passed [+3], build, `debug:typecheck`, and the extended live scenario `test/scenarios/plan07-memory.json --sandbox` exit 0 / 23 steps; real group cast verified restored to baseline `disabled_members:["Luke.png","Ponticius.png"]`):

- **F1 (behavioral bug) — `sceneBreak` NPC reply only fired once per checkpoint lifetime.** `fireNpcReplies` keyed its fired-counter by `checkpoint:trigger:member:index` (cap `maxTriggers ?? 1`); correct idempotency for `onEnter`/`afterSpeak`, but `sceneBreak` is recurring and its hydration-safety rationale doesn't apply (it never fires during `hydrate`). Fixed by adding an optional `occurrence` discriminator to `fireNpcReplies`; `runSceneBreakPass` passes the per-break scene count so each distinct break can fire, with `maxTriggers` preserved as the per-break cap. Regression test (`runtimeManager.test.ts`, "fires the sceneBreak reply once per distinct break") + scenario second break (steps 12–15). Note: `runSceneBreakPass`'s `addMemoryEntries` still coverage-drops a scene summary whose window is fully covered by an earlier break's — a non-issue in forward play (windows advance) but it surfaced when the test reused a fixed window; the scenario now uses an advancing window to mirror reality.
- **F3 (dead config) — `memory.settings.enabled` was defined/persisted but never read.** Wired guards in `updateMemoryInjection` (clear-all when disabled), `applyExtractionAudit` (skip writes + scene-break listener dispatch), `detectSceneBreak`/`runSceneBreakPass`/`runMemorizeBacklog` (early-return), plus a `setMemorySettings` method and an "Enabled" checkbox in the drawer `MemoryPanel` (mirrors extraction's toggle). Test: "stops injecting and skips memory writes when memory is disabled".
- **F4 (latent) — a persisted `backfill.running:true` survived reload and permanently blocked `runMemorizeBacklog`.** `sanitizeMemory` now coerces `running` to `false` (in-flight work is never resumable, per the pending-queue invariant). Test: "clears a stuck backfill.running flag on reload".
- **F2 (rough edge) — `runMemorizeBacklog`'s final full-scope read re-added memory already captured by the windowed passes.** The final read exists for blackboard deltas; it now passes `[]`/`[]` for facts/memory. Cross-window content-level dedup remains deferred to plan-08 consolidation.

Informational (no change): scene detection reads a hardcoded `location` quality key (stories naming it differently lose the quality-delta signal but keep the prose-regex one); `sceneDetectCursor` is instance-only (resets on reload).

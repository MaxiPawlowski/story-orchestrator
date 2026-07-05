# Plan 03 — Extractor (Shared Read) + Extraction Eval

## Objective

Stand up the one fuzzy step: the cadenced shared read on a separate memory LLM that proposes evidence-backed blackboard deltas (closed vocabulary, rubric contracts, wide scope), plus reconciliation, canon-lite, the scheduler core, and the extraction eval suites. After this plan, extractor-source gates work in live play.

## Context

- Spec: §Blackboard/Extraction scope, §Extractor hardening, §Turn loop (off-path half), §Off-path scheduler (P0/P1 core), §Evaluation framework (layer 2), §Background generation step 3 (canon-lite definition).
- Consumes from 01: `Blackboard`, `BlackboardDelta`, apply queue (basis version, turn ranges), `NormalizedStoryV2` reachability index. From 02: `turnBridge` (cadence tick + boundary drain), persistence, drawer.
- ST fact: `ConnectionManagerRequestService.sendRequest(profileId, prompt, maxTokens, custom?, overridePayload?)` — `extensions/shared.js:392`. Wrap in new `stHost/connectionProfiles.ts` (list profiles for the settings picker + send).
- Reference: Smart-Memory `prompts.js` / `parsers.js` (tagged-line output style, extraction windows) — patterns only here; the vendored port happens in plan 07. Delete v1 experiments: `ContinuityKeeperService`, `narrative-context.ts`, `memory-stores.ts` are already gone (plan 01); do not resurrect.

## Scope

**In**: shared-read pipeline (contract → prompt → parse → validate → enqueue), scope derivation, forced cues, reconciliation, canon-lite, scheduler P0/P1, eval layer 2, settings (profile picker, cadence), blackboard debug panel upgrade.
**Non-goals**: no memory tiers beyond a raw `facts` first-cut list (plan 07 restructures it), no tension question wiring (plan 04 adds it to the contract), no scene-break passes (07), no generation (05).

## Deliverables

`src/extraction/`:
- `scope.ts` — `deriveScope(story, activeCheckpointId, blackboard, extraGateSources?): QualityKey[]` per spec: all not-yet-latched qualities whose first gating point is at/ahead on any reachable path (use 01's reachability index; include inserted intermediates' gates), minus terminal-latched; `scope_hint {from,until}` trims. Pure, engine-side (no STAPI). `extraGateSources` exists so plan 05 can feed cached-but-not-yet-inserted scaffolding gates into scope — design the signature now, pass nothing yet.
- `contract.ts` — assemble the read contract: per in-scope quality → rubric question + type/allowed values + transition `extraction_hint`s of the active checkpoint; plus standing questions block (scene-break placeholder off until 07; tension off until 04); plus output-format instructions (delta lines with mandatory evidence quotes; tagged memory lines for facts).
- `client.ts` — memory-LLM call via `stHost/connectionProfiles.ts`; near-greedy sampling via `overridePayload` (temperature ~0.1 — verify the payload key for the profile's API type against ST source; record findings).
- `parse.ts` — strict parser: delta lines → `{q, value|delta, evidence}`; reject undeclared keys/values (closed vocab); tagged `[fact…]` lines collected as first-cut facts (stored raw in chat_metadata for plan 07). Unit-tested exhaustively.
- `sharedRead.ts` — orchestrates: window selection (messages since last read), contract, call, parse, validate → enqueue to apply queue with `{source:'extractor', basisVersion, turnRange}`.
- `scheduler.ts` — the off-path queue, priorities P0 (forced) / P1 (cadence); single in-flight request; coalesce pending P1s with overlapping windows; drop results superseded per 01's coverage rule. Cadence: every N messages (default `DEFAULT_INTERVAL_TURNS`-style constant, configurable).
- `cues.ts` — per-transition `extractor_trigger` regex watcher over incoming messages → schedule P0 read. Also subscribes 02's rollback notification: post-rollback, schedule a P0 re-read over the mutated window (new swipe content re-extracted under normal evidence rules).
- `reconcile.ts` — stall detector on `turnBridge` boundaries: no fire for `max(1.5 × target_turn_length, 6)` turns → targeted P0 re-read of the active checkpoint's unmet-gate qualities over recent turns; evidence mandatory; may set/raise; `strictUnlatch` only with explicit contradicting evidence (separate confirm question in the contract); never writes `source: code` qualities. Window = turns since the active checkpoint was entered (capped); raising a latched or monotonic value upward on evidence is a normal write, not an unlatch.
- `canonLite.ts` — `getCanon(): string` = passed anchor objectives + fired-gate history (from engine state) + top-importance first-cut facts. Deterministic string build.

Eval (`test/extraction/`):
- Suite A (blackboard deltas): fixtures = transcript excerpt + story + expected exact deltas (`*.expected.json`: key, direction/magnitude or value, evidence-substring). Golden model outputs in `test/goldens/`; default run parses goldens (deterministic); `LIVE=1` re-calls and re-records.
- Suite B (memory lines): per-fixture minimum counts + `must_contain`/`must_not_contain` (any-of across entries, all-words-within-entry).
- Parser unit tests run first, fail fast.

UI/settings: memory-LLM profile dropdown (from connectionProfiles list), cadence N, reconciliation multiplier; drawer blackboard table gains last-delta + evidence tooltip per quality; extraction activity indicator (queue depth, last read turn range).

Update `so-state.mjs` to include scope + queue snapshot.

## Implementation notes

- The shared read must never block the reply path: fire-and-forget from event handlers; results land via apply queue at the next boundary.
- Store per-read audit records (contract hash, window, raw response, applied/rejected deltas) ring-buffered in chat_metadata — the debug panel and eval both read them.
- Profile-less setup (user has no Connection Manager profile): feature-flag extraction off with a clear settings warning; mechanical stories must keep working.
- Client failures mid-play: bounded retry with backoff at the scheduler; persistent failure surfaces a settings warning and pauses extraction — mechanical play continues.
- Group chats: window = all messages regardless of speaker; speaker names included in transcript formatting.
- Blackboard backfill (consumed by plan 07's "Memorize backlog"): one full-scope targeted read over existing history, normal evidence rules, latching honored — design `sharedRead` to accept an arbitrary historical window now.

## Validation gate

1. Baseline green; parser + both eval suites pass on goldens deterministically; `LIVE=1` run recorded once with the user's configured profile (record model name and the suite-A live exact-match score in Gate record — plan 13's acceptance target reads it).
2. Live: fixture story with an extractor-gated flag (e.g. `player_has_key`); scripted chat mentioning the key → `so-state.mjs` shows delta applied with evidence at next boundary → gate opens.
3. Reconciliation: fixture where the golden for the cadence read deliberately misses a quality; stall fires; targeted re-read (second golden) recovers it; transition fires. Reproduced live with scripted play.
4. Forced cue: message matching an `extractor_trigger` schedules an immediate P0 read (audit record proves it).

## Delegated decisions

Contract/prompt wording (must keep: closed vocab list, evidence-mandatory, question form); audit ring-buffer size; exact coalescing window math; whether facts first-cut lives in its own chat_metadata key (recommended) — record for plan 07.

## Gate record

Date: 2026-07-04

Baseline:
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm test` passed: 2 suites, 17 tests.
- `npm run build` passed with warnings only: stale Browserslist data and webpack asset/entrypoint size over 244 KiB (`dist/index.js` 284 KiB).

Implemented contracts:
- `src/extraction/scope.ts`: pure `deriveScope(story, activeCheckpointId, blackboard, extraGateSources?)`; includes reachable future gates, transition hints, `scope_hint` trimming, extractor-only qualities, and latched-quality exclusion.
- `src/extraction/contract.ts`: closed-vocabulary prompt with question/rubric per quality, allowed enum values, active transition hints, transcript, canon-lite, and strict output format.
- `src/extraction/parse.ts`: strict tagged-line parser for `DELTA` and `FACT`, rejecting undeclared keys, invalid values, empty evidence, and unrecognized lines.
- `src/extraction/scheduler.ts`: P0/P1 single-flight queue, P1 coalescing, cadence scheduling, scheduler snapshot.
- `src/extraction/sharedRead.ts`: window → scope → contract → client → parser → audit/facts.
- `src/extraction/cues.ts`: `extractor_trigger` regex scheduling path.
- `src/extraction/reconcile.ts`: stall detector scheduling targeted P0 reads over current checkpoint window.
- `src/extraction/canonLite.ts`: deterministic passed-anchor/objective + fired-gate placeholder + top facts string.
- `src/services/stHost/connectionProfiles.ts`: Connection Manager profile list, selected profile, and `ConnectionManagerRequestService.sendRequest` wrapper. Override payload uses `temperature: 0.1`, `top_p: 0.9`, `stream: false`; ST forwards these directly into ChatCompletion/TextCompletion request payloads (`public/scripts/extensions/shared.js:423-483`).

Runtime/UI:
- Runtime extras now persist extraction settings, facts, audit ring buffer, last read boundary, and scheduler status in `chatMetadata.story_orchestrator`.
- Accepted extraction deltas enqueue into the engine apply queue with `{ source: 'extractor', basisVersion, turnRange }` and apply only on the next committed boundary.
- Settings UI adds extraction enable, Connection Manager profile picker, cadence, and reconciliation multiplier.
- Drawer shows extraction queue/in-flight/error, last read boundary, last scope, and latest evidence as blackboard cell tooltip.
- `/cp extract [response]` added for diagnostics; it runs the same shared-read parse/enqueue path and commits a boundary.
- `so-state.mjs` includes extraction settings, scheduler status, fact count, audit count, and last audit.

Eval:
- Parser/scope/contract tests pass deterministically from `test/fixtures/extractor.*` and `test/goldens/extractor.response.txt`.
- Suite A asserts exact expected deltas (`player_has_key=true`, `mara_trust=3`) and evidence substrings.
- Suite B asserts first-cut fact minimum count and must/must-not containment.
- `LIVE=1 npm test` was not run because no configured memory LLM profile was selected for this build session; deterministic goldens are the default path.

Live checks:
- `node scripts/debug/so-extraction-check.mjs` passed. It opened recent group `1759606632088`, imported `Extraction Gate Check`, injected scripted chat text `I take the brass key from the hook.`, ran shared-read with deterministic debug response, persisted an audit with reason `cue:start->door`, accepted `player_has_key=true` with evidence `I take the brass key`, stored one fact, committed boundary `1`, and advanced `start -> door`.
- `node scripts/debug/so-state.mjs current` passed after reopening the recent group: active checkpoint `door`, blackboard `player_has_key: true`, audit count `1`, fact count `1`, last scope `[player_has_key]`, evidence preserved.
- `node scripts/debug/st-actions.mjs generation-state` passed: `isGenerating: false`.
- `node scripts/debug/so-ui.mjs all` passed for extension load: settings and drawer mounted. Like plan 02, generic UI dump starts from welcome context unless a chat is opened first.

Deviations / incomplete plan items:
- Live model call was not executed; the live extraction gate used a deterministic debug response through the same parser/enqueue/audit path. Profile-less setup keeps extraction disabled and mechanical play continues.
- Forced cue was represented by audit reason `cue:start->door` in the live debug script. The runtime regex watcher is wired on boundaries, but a fully automatic cue-from-real-message live run was not separately demonstrated.
- Reconciliation is wired and schedules P0 reads on stall, but the deliberate missed-golden recovery scenario was not added as a separate fixture/live script in this pass.
- Facts first-cut lives inside runtime extras under `extraction.facts` rather than a separate chat metadata key. Plan 07 can migrate this into proper memory tiers.
- Canon-lite currently includes passed anchors and top facts; fired-gate history is a placeholder until runtime exposes transition log details beyond engine-local logs.

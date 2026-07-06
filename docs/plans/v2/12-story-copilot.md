# Plan 12 — Story Copilot (Authoring + In-Play Driver)

## Objective

Two assistant surfaces: (a) an **authoring copilot** that turns a premise into a proposed format-2 story draft — qualities, rubrics, checkpoints, gates — applied through staged proposal/diff review into Studio; (b) an **in-play driver** panel that reads the live blackboard/canon and helps steer the story forward on demand.

## Context

- Spec: this plan implements the user-requested assistance layer on top of the spec (no spec section owns it; it must respect all spec invariants — especially: regex/assistant never writes state except through declared paths).
- Consumes from 11: `src/studio/mutations.ts` (typed draft mutations), draft model, diagnostics (proposals validated before offer). From 03: memory-LLM client, forced-extraction path. From 05: generator prompt utilities where reusable. From 02: `/cp activate` (manual advance), effects. From 09: `getCanon()`.
- **Pattern bases**: [ST-Copilot](https://github.com/Supker/ST-Copilot) (MIT) — OOC assistant window separate from the RP narrative, **proposal + diff-review before apply**, context pickers; [MultihogDnDFramework](https://github.com/MultihogAurelius/SillyTavern-MultihogDnDFramework) (MIT) — narrative-hooks, world-progression reports. Patterns and selective code lifts (MIT-compatible), not vendoring.

## Scope

**In**: copilot chat panel (authoring mode in Studio, driver mode in drawer), staged proposal pipeline with diffs, driver actions (below), prompt set, eval-light golden tests for proposal parsing.
**Non-goals**: auto-pilot (driver never acts without a click), character-card/lorebook management (ST-Copilot features out of scope), voice/vision.

## Deliverables

**Authoring copilot** (Studio tab):
- Conversation panel on the memory LLM. Staged flow, each stage a reviewable proposal applied via `mutations.ts`: premise + questionnaire → (1) quality set w/ rubrics → (2) anchor checkpoints w/ objectives + snapshots + tension targets → (3) transitions w/ gate trees + stub placement → (4) effects/cast suggestions. Free-form chat between stages ("make act 2 darker") produces incremental proposals.
- Proposal format: strict JSON parsed against schema (01) + diagnostics (11) *before* being offered; invalid → auto-retry once with errors quoted, then shown as failed.
- Diff review UI: per proposal, added/changed/removed entities with accept-all / per-item accept (ST-Copilot's lorebook-proposal pattern); applied items land in the draft undo stack.

**In-play driver** (drawer tab):
- Context: live blackboard, active checkpoint + unmet gates, upcoming anchors + progress, `getCanon()`, recent chat window.
- Actions (each one click, all through existing declared paths): **Suggest** — 2-3 next-development suggestions w/ rationale (display only); **Nudge** — inject a one-shot steering note (own `setExtensionPrompt` key, cleared after next generation) from a suggestion; **Probe** — force a targeted extraction (03's P0 path) for chosen qualities; **Advance** — manual checkpoint activation (02's `/cp activate` semantics) with confirmation; **Report** — world-progression style summary (DnD-framework pattern) of where the story stands.
- Driver writes NOTHING to the blackboard directly — Probe goes through extraction, Advance through the manual path, Nudge only steers prose.

Tests: proposal-parse goldens per stage (valid/invalid); mutation-application unit tests (proposal JSON → expected draft state); driver action wiring tests (Probe schedules P0, Nudge sets+clears key).

## Implementation notes

- Authoring prompts should embed the format-2 schema summary + the closed-vocabulary discipline (qualities it proposes must include rubric questions — reuse spec §Extractor hardening language).
- Stage prompts get current draft JSON (compact) so later stages stay consistent with accepted earlier stages.
- Keep both panels fully optional: extension works identically with copilot disabled (settings toggle).

## Validation gate

1. Baseline green; proposal goldens + mutation tests pass.
2. Live Playwright: premise → accept all four stages → resulting draft has zero diagnostics → save → load in chat → story runs (first mechanical/extractor gate fires).
3. Driver live: open panel mid-play → Suggest returns suggestions citing real blackboard values; Nudge visibly steers next reply (note in Gate record); Probe produces an audit-logged P0 read; Advance moves checkpoint with effects.
4. Toggle off → no panels, no behavior change.

## Delegated decisions

Panel placement/UX; stage prompt wording; suggestion count; whether driver Report reuses canon text or its own summary call.

## Gate record

**Date:** 2026-07-06. Built as milestones M0–M6.

**M0 pure core** — new `src/copilot/` (`types`, `parse`, `proposal`, `validate`, `prompts`, `authoring`, `index`), never imports STAPI (LLM injected as `ExtractionClientOptions`). Proposal grammar = strict JSON of typed ops 1:1 with `mutations.ts`; `parseProposal` clones `generation/parse.ts` skeleton (fence-strip, try/catch, path-scoped `issues[]`, typed readers). `@copilot` alias added to tsconfig/jest/webpack/`.storybook/main`/lint; `src/copilot` added to jest `roots`. Goldens `test/goldens/copilot-{qualities,checkpoints,transitions,effects,invalid}.response.txt`. **M1 runtime seam** — `runtimeManager`: `runCopilotStage/runCopilotSuggest/runCopilotReport`, `getDriverContext`, `setCopilotNudge/clearCopilotNudge/getActiveNudge`, `getCopilotSettings/setCopilotSettings`; `copilot: {enabled}` extras slice (default true, sanitized on hydrate) + snapshot field; `storyOrchestratorDebugCopilotResponse` global; Nudge injected via `setStoryExtensionPrompt(story_copilot_nudge,…)` and cleared on `generation_ended`/`generation_stopped` (`runtime/index.ts`). **M2** — 6th Studio tab `StudioCopilot.tsx` + `ProposalReview.tsx` (per-item/accept-all → `store.mutate(applyOp)`, one undoable step each). **M3** — drawer `DriverPanel.tsx` (Suggest/Nudge/Probe/Advance/Report via injected `DriverController`). **M4** — `copilot.enabled` checkbox in settings; tab filtered + driver section hidden when off. **M5** — `so-copilot.mts` (context/suggest/report/nudge/clear-nudge/probe/advance/stage), `so-state` copilot fields, `so-scenario` `copilot` step + `copilot` expect verb, `test/scenarios/{plan12-copilot,live-plan12-copilot}.json`, README. `globalThis.storyOrchestratorStudioDraft` exposed for headless authoring.

**Command outputs (green):** `typecheck` clean · `lint` clean (src/copilot added to the enumerated dirs) · `test` **36 suites / 1303 tests** (was 32/1272; +copilot pure `parse/proposal/validate/authoring` + `runtimeManager` copilot-seam) · `build` ok, `dist/index.js` **945 KiB** (was 909) · `test-storybook:ci` **17 suites / 47 tests** (was 14/36; +StudioCopilot/ProposalReview/DriverPanel + 2 StudioModal copilot-tab stories, all with play + axe-a11y).

**Live gate (real Gemma via LM Studio CM profile `afcc7073…`, no `debugResponse`, headed browser, real recent group chat):**
- Authoring `stage qualities` (real LLM) → valid proposal (enum `alarm_state` w/ values + monotonic float `vault_progress` + bool + int), **diagnostics 0**, status ok.
- `suggest` (real) → 3 suggestions citing the live `has_key == true` gate and objective.
- `report` (real) → grounded world-progression summary (Gemma occasionally prefixes a `<|channel>thought` wrapper — cosmetic, see deviations).
- `probe` (real extraction) → P0 read, `auditCount` 1.
- `advance vault` → `activeCheckpointId` vault (effects applied).
- `nudge` → `nudgeInjected: true` (present in `ctx.extensionPrompts.story_copilot_nudge`); next real group reply visibly committed to the vault ("The heavy vault door swings open… revealing a corridor"); after that generation `nudgeInjected: false` (cleared on `generation_ended`).
- Toggle off → `copilot.enabled` false + active nudge cleared; re-enable restores.
- Mocked `so-scenario run test/scenarios/plan12-copilot.json --sandbox` → **13/13 steps ok** (copilot stage/suggest/nudge±clear/advance/probe + expects), cleanup removed the imported story.
- Cleanup verified: test messages deleted, chat restored to 3 msgs, `story_orchestrator` chat-meta wiped, `Copilot Live Gate` removed from `v2Stories`. Session stopped.

**Deviations from plan:**
1. `parseProposal(raw)` (not `(raw, draft)`) — structural parse only; all cross-reference/type checks deferred to `validateProposal` (apply ops on a cloned draft → `parseStoryV2` + `runDiagnostics`), which sidesteps the add-quality-then-gate-it ordering problem in a single proposal. `status: "ok"` ⇔ zero blocking (schema errors + blocking diagnostics); warnings are shown, not blocking.
2. Transition index-brittleness: proposal ops reference transitions by `{from,to}`; `resolveTransitionRef` resolves to an index at apply time. `mutations.ts` (plan 11 contract) left untouched — no batch/id-addressed variant added.
3. Copilot LLM calls reuse the extraction memory-LLM profile (`getExtractionSettings().profileId`); no separate copilot profile. Note: `importStory`/`selectStory` reset extras, so set the profile after load.
4. `runDriverReport` returns raw trimmed prose; Gemma sometimes emits a `<|channel>thought…<channel|>` wrapper. Cosmetic; follow-up: reuse the extraction channel-noise strip in `runDriverReport`. (Delegated Report-source decision: implemented as its own summary call, not `getCanon()` text.)
5. Probe uses full-scope `runExtractionNow(undefined,"probe")` (P0); quality-targeted scoped read deferred (stretch).
6. `globalThis.storyOrchestratorStudioDraft` (zustand store) added for headless authoring-stage debug and Studio-tab live reads.

**Post-review hardening (2026-07-06, same day):** code review found two low-severity gaps, both fixed + gated:
- **Silent accept-no-op on missing targets.** `updateQuality/updateCheckpoint/setStartCheckpoint/setCheckpointSnapshot/setCheckpointEffects/updateTransition/setTransitionGate/updateRosterMember` all no-op silently when their target id/ref does not exist, yet the proposal reported `status: "ok"` and the diff still rendered a change card. Added `missingTarget`/`applyOpsChecked` (`proposal.ts`); `validateProposal` now prepends `ops.N: <target> not found` to `blocking` → such ops are `failed` (and trigger repair-once). Intra-proposal targets added by an earlier op still resolve (checked against the accumulated draft). Removes stay idempotent (unchecked). +2 `validate.test.ts` cases.
- **Prompt/grammar drift.** `OP_GRAMMAR` (`prompts.ts`) omitted `removeCheckpoint/removeTransition/updateRosterMember/removeRosterMember` (parser handled them, model wasn't told the shape) — added, plus "Only reference ids that already exist in the draft."
- Gates: `typecheck`/`lint` clean · `test` **36 suites / 1305 tests** (+2) · `build` ok. Real-LLM live (Gemma via `afcc7073…`, no `debugResponse`): authoring `stage qualities` with expanded prompt → status ok, **diagnostics 0**, 3 grounded qualities (`alarm_level/loot_secured/crew_trust`), no repair; mocked `updateCheckpoint id=ghost` through `runCopilotStage` → `failed`, issue `ops.0: checkpoint "ghost" not found`. Session cleaned up (extraction reset, no story/msgs touched).

**Not carried into 12 (left for later plans):** plan 13 (v2 macros, memory slash commands, packaging, success-criteria run) unchanged. Remaining deviations: #2 (transition {from,to} ref brittleness under duplicate priorities), #4 (`runDriverReport` channel-noise strip), #5 (quality-scoped Probe). Open finding: none new.

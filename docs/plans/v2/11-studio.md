# Plan 11 — Checkpoint Studio v2

## Objective

Make format-2 authorable without touching JSON: quality editor, type-aware gate tree builder, derived-scope preview, static diagnostics, v2 checkpoint/transition editors — on the existing graph shell. Until now stories were hand-written; this is the authoring surface.

## Context

- Spec: §Checkpoint Studio (editors + 7 diagnostics), §Blackboard (gate grammar, scope), §Data model.
- Consumes from 01: schema/validate, `renderGateText`, normalized indexes. From 03: `deriveScope` (pure — callable on drafts). From 05: scaffolding cache read (stub status display). Reuse: `GraphPanel.tsx` + `graphPanelUtils.ts` (Cytoscape, format-agnostic — verify they survived plan 01's rip-out before relying on them), Studio modal shell, `MultiSelect`/`FeedbackAlert`/`HelpTooltip`/`Toolbar`, `story-library.ts` CRUD.
- v1 `checkpoint-studio.ts` adapter and editor tabs were deleted (01) — new draft model against v2 types. **As-built note**: `storySessionStore` was fully deleted in plan 01 (gate deviation), not stripped — the Studio draft store is new code, not a retarget. Diagnostics extend `validate.ts`'s `ValidationError` shape rather than inventing a parallel one.

## Scope

**In**: draft model + undo-able edits, all editors below, diagnostics engine + panel, import/export, Mermaid export with gate text, library save.
**Non-goals**: copilot (12), runtime panels (already in drawer), arc/memory authoring.

## Deliverables

- `src/studio/draft.ts` — v2 draft model (story ↔ editable draft, id generation, dirty tracking, validate-on-change producing diagnostics + per-field errors).
- **Quality editor** — list + form: key, type, enum values, source, latching/monotonic, rubric (question + scale text), `scope_hint`, `ledger_binding` (10). Deleting a quality shows its gate/snapshot usages first.
- **Gate builder** — recursive tree editor: combinator nodes (all/any/not) + leaf rows with quality dropdown → type-aware op dropdown → typed value input (enum select, bool toggle, number field); live `renderGateText` preview; no free-text entry anywhere.
- **Checkpoint editor** — objective, type (anchor/intermediate/stub), snapshot editor (quality/value rows, validated), tension target (level select), target_turn_length, guidance, effects (AN/preset/WI/cast/npc_replies incl. talk-control triggers), `arc_bridges` on the story level.
- **Transition editor** — gate builder embed, priority, progress effects, extractor_trigger, extraction_hint.
- **Scope preview** — per selected checkpoint: derived in-scope qualities with the *reason* (which future gate/snapshot pulls each in, from `deriveScope` explain-mode — add explain output to 03's function, pure extension).
- **Diagnostics panel** — the spec's diagnostics: undeclared quality in gate; op/type mismatch; enum value outside set; anchor unreachable (no path whose cumulative snapshot/scaffold deltas can produce its entry gate — implement as best-effort static reachability over declared deltas, mark heuristic); quality never in scope before its first gate; snapshot-vs-latching conflict; stub with no anchor beyond it; plus threshold-unsatisfiable when authored thresholds exist.
- Graph view: v2 node/edge adapters (type-colored anchors/stubs/intermediates, gate text on edge tooltips); Mermaid export via `renderGateText`.
- Import/export format-2 JSON; save to library.

## Implementation notes

- Diagnostics run on the draft (not just saved stories) debounced; blocking-severity (schema-invalid) vs warning (heuristic reachability) tiers.
- `deriveScope` explain-mode: return `{quality, pulledBy: gateRef|snapshotRef}[]` — also improves 03's debuggability; keep pure.
- Keep every editor component dumb over the draft store (existing zustand pattern) so 12's copilot can drive the same mutations programmatically — export the draft mutation API as a typed module (`src/studio/mutations.ts`); this is 12's contract.

## Validation gate

1. Baseline green; diagnostics unit-tested: a seeded-error fixture story triggers every diagnostic exactly once; a clean story triggers none.
2. Live Playwright: author a complete small story through the UI only (create qualities → checkpoints → gates → effects → save to library) via `so-ui.mjs open-studio` + DOM automation; load it into a chat; it runs (mechanical gate advance).
3. Export → re-import roundtrip byte-equivalent (modulo key order).
4. Scope preview matches `deriveScope` output for 3 fixture checkpoints (assertion test).
5. **Storybook review of every UI part** (added by the plan-11 build): each Studio component + the 6 reused primitives ship a `.stories.tsx` with a play-function interaction test and no addon-a11y violations; `npm run test-storybook:ci` (build → serve → headless chromium) must exit 0, and `npm run storybook:build` must stay clean. The Studio is a pure authoring surface (no LLM path), so the real-LLM live gate is N/A to it; its live gate is browser validation of the authoring UI as an end user.

## Delegated decisions

Editor layout/UX; heuristic-reachability algorithm depth; draft undo granularity; Cytoscape styling.

## Gate record

**Date:** 2026-07-06. Executed as milestones **M0–M9** (agreed with user before build):

- **M0** — `src/studio/` scaffold: `draft.ts` (zustand draft store: story↔draft, undo/redo, dirty, validate-on-change), `mutations.ts` (typed mutation API = plan 12 contract), `diagnostics.ts` (stub → filled M6), `StudioModal.tsx` shell + tabs. Tooling: `lint`/`tsconfig include`/`jest roots` extended to `src/studio` + `src/components`; `.storybook` fixed (see below). Stories for the 6 surviving primitives.
- **M1** Quality editor (+ `qualityUsage.ts` reserved-key + usage-before-delete). **M2** recursive Gate builder (`gateOptions.ts`, `PrimitiveValueInput.tsx`, live `renderGateText`, no free text). **M3** Checkpoint editor (`SnapshotEditor`, `EffectsEditor` for all five effect kinds, arc_bridges, stub badge) + start-checkpoint mutations. **M4** Transition editor (gate embed, progress, extractor trigger/hint). **M5** Scope preview + `deriveScopeExplained` (pure explain-mode; `deriveScope` refactored to delegate → parity by construction). **M6** Diagnostics engine (8 checks, independent of parse success) + panel + **carry-in F1** (expansion `runCodeChecks` rejects outcome gates that contradict a latched value). **M7** Graph view v2 (`graphAdapter.ts` → GraphPanel, type-colored anchors/stubs, gate-text edges), Mermaid export, `io.ts` (export/import + `canonicalize`), `StudioToolbar` → `storyLibrary` CRUD. **M8** mount in `index.tsx` (`#so-open-studio` button → `StudioModal`, loads active story or new draft) + `so-ui.mts` `open-studio`/`studio`/`studio-tab` verbs (v2 selector `#so-studio-modal`). **M9** gate.

**Command outputs (final, cumulative):**
- `npm run typecheck` — clean.
- `npm run lint` — clean (lint dirs now include `src/studio src/components`).
- `npm test` — **32 suites / 1272 tests** pass (added studio: `draft`, `mutations`, `qualityUsage`, `gateOptions`, `diagnostics`, `io`, `graphAdapter`; extraction `scopeExplain`; generation `latchGuard`; +2 from post-review hardening below).
- `npm run build` — compiled; `dist/index.js` **909 KiB** (Studio + Cytoscape now bundled via `index.tsx`; lazy `cytoscape-dagre` split to `111.index.js` 83 KiB). Size-only warnings.
- `npm run storybook:build` — clean. `npm run test-storybook:ci` — **14 story suites / 36 tests** pass (play-function interaction + addon-a11y, headless chromium), exit 0.

**Live checks** (real SillyTavern at `http://127.0.0.1:8000/`, shared CDP browser): rebuilt `dist` + reloaded page; `#so-open-studio` present → StudioModal opens (`role="dialog"`, all 5 tabs + Undo/Redo/Export/Import/Save/SaveAs/Reset footer). Verified live: Diagnostics tab shows "No issues — ready to save"; Qualities `+ Quality` mutates draft; invalid draft (empty rubric) surfaces `1 errors` badge; Reset clears it; title set → **Save persisted "Studio Live Test" to the real `v2Stories` library** with success feedback; `selectStory(hash,'activate')` loaded it (`activeCheckpointId: start`, `ready: true`). Screenshot `so-ui.mts screenshot studio-live`. Cleanup: modal closed, `so-library remove "Studio Live Test"` + `wipe-chat-meta` (verified `liveTestInLib: false`); no group `disabled_members` touched. **Real-LLM note:** the Studio is a pure authoring surface with no LLM-consuming path, so the real-LLM gate is N/A to it; the run-path it feeds (extraction/expansion/generation) is covered by plans 03/05/07–10 gates.

**As-built:**
- `src/studio/**` — all new (no v1 store to retarget; `storySessionStore` was deleted in plan 01). Editors are dumb over the zustand draft store; every write goes through `mutations.ts`.
- Reused primitives (`src/components/studio/{GraphPanel,graphPanelUtils,MultiSelect,Toolbar,FeedbackAlert,HelpTooltip}`) — now linted/typechecked for the first time; a11y fixes applied (MultiSelect search+checkbox labels, GraphPanel layout `<select>` name); `graphPanelUtils` extended with optional `type` for anchor/stub coloring; MultiSelect v1 lorebook regex dropped.
- `src/extraction/scope.ts` — `deriveScopeExplained` added; `deriveScope` delegates (behavior-preserving; extraction suite unchanged).
- `src/generation/{types,planner,critic}.ts` — F1: `PlannedExpansionInput.latched` threaded from `planExpansion`; `runCodeChecks` rejects AND-path outcome-gate leaves unsatisfiable under a latched value.
- Tooling (new devDeps): `@storybook/test`, `@storybook/test-runner`, `axe-playwright`, `http-server`, `wait-on`. New scripts: `serve-sb`, `test-storybook`, `test-storybook:ci`. `.storybook/main.ts`: `staticDirs` narrowed to `public/webfonts` (whole-`public` copy self-copied into `.sb-static` → EINVAL) and the missing `@engine/@runtime/@extraction/@pacing/@generation/@memory` aliases added. `.storybook/test-runner.ts` runs axe (color-contrast disabled — theme-var dependent in isolation). `storybook:build` gains `--disable-telemetry`.
- `scripts/debug/so-ui.mts` + `README.md` + debug `SKILL.md` updated for the v2 modal (`#so-studio-modal`, `#so-open-studio`, `studio`/`studio-tab` verbs).

**Deviations from plan:** (1) Graph type-indication done by extending `graphPanelUtils` (optional `type` + cytoscape style rules) rather than glyphs, honoring "type-colored"; kept backward-compatible with the existing GraphPanel story. (2) Automated interaction-test + a11y execution required standing up `@storybook/test-runner` + `axe-playwright` (not in the original plan's tooling list) — added to make the user-chosen "interaction tests + a11y" rigor a real CI gate (`test-storybook:ci` exit code). (3) Effects `preset` authored as name-string form only (object form read but edited as name); `world_info`/`cast_changes`/`author_note`/`npc_replies` fully structured per the verified `effectsApplier` shapes.

**Not carried into 11 (left for later plans):** authoring copilot + in-play driver (12 — this plan only exports `mutations.ts`); v2 macros / memory slash commands / packaging / success-criteria run (13); Storybook backfill of the live `index.tsx` inspector panels (candidate for 13). Open finding: none new.

**Post-review hardening (2026-07-06):** self-review pass — no correctness bugs found. Three minor items closed: (a) added a `generation.test.ts` case asserting `planExpansion` extracts latched blackboard values into `input.latched` (the F1 production bridge, previously typecheck-only); (b) `anchor-unreachable` diagnostic message reworded to "has no transition path from the start checkpoint" — makes the graph-connectivity-only heuristic explicit (it does not model gate/delta satisfiability; `threshold-unsatisfiable` covers the convergence case); (c) `draft.ts` `undo`/`redo`/`reset` now clamp `selectedCheckpointId`/`selectedTransitionIndex` to the restored draft (+ `draft.test.ts` case) so a selection can no longer dangle to a deleted target. Deferred (not observed as a problem): debouncing validate-on-change. Gates re-run: typecheck + lint clean; `npm test` **32 suites / 1272 tests**; `npm run build` clean (`dist/index.js` 909 KiB). No ST-facing behavior changed (no host access / no LLM path / no persisted-state or render-path change), so the original live gate above still holds; not re-run.

# Plan 11 — Checkpoint Studio v2

## Objective

Make format-2 authorable without touching JSON: quality editor, type-aware gate tree builder, derived-scope preview, static diagnostics, v2 checkpoint/transition editors — on the existing graph shell. Until now stories were hand-written; this is the authoring surface.

## Context

- Spec: §Checkpoint Studio (editors + 7 diagnostics), §Blackboard (gate grammar, scope), §Data model.
- Consumes from 01: schema/validate, `renderGateText`, normalized indexes. From 03: `deriveScope` (pure — callable on drafts). From 05: scaffolding cache read (stub status display). Reuse: `GraphPanel.tsx` + `graphPanelUtils.ts` (Cytoscape, format-agnostic), Studio modal shell, `MultiSelect`/`FeedbackAlert`/`HelpTooltip`/`Toolbar`, `story-library.ts` CRUD.
- v1 `checkpoint-studio.ts` adapter and editor tabs were deleted (01) — new draft model against v2 types.

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

## Delegated decisions

Editor layout/UX; heuristic-reachability algorithm depth; draft undo granularity; Cytoscape styling.

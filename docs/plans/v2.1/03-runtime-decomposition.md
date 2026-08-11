# Plan 03 — Runtime decomposition

## Objective

Split RuntimeManager (1867 lines, 90 public methods) into coordinator services along seams that already exist in the import graph, fix the snapshot contract so the UI reads one composed model through one subscription, replace the hand-appended boundary wiring with a declarative registry, and make the architecture docs match the code. Behavior-preserving: zero user-visible change is the *requirement*, proven by the journey regression floor.

## Context

- Findings I1 I2 I4 I5 I6. Current shape: `runtimeManager.ts` imports 76 named symbols from `@memory` alone (line 5); `runtime/index.ts:54-83` fans 7 scheduling decisions off one boundary callback; drawer imports `studio/components/DriverPanel` (I4); docs claim an `EngineHost` effects seam that is `{ now }` (`engine/engine.ts:7,47`) (I5); DrawerTabs/index.tsx call `getLedger()`/`getDriverContext()`/`getActiveNudge()` during render, outside the snapshot (I2).
- Consumed: plan-02 `settingsStore` (the extraction pattern to repeat), journeys J3/J5/J6 as the behavior lock.

## Scope

In: service extraction, snapshot completion, boundary-work registry, file moves, docs truth-up.
Non-goals: any feature or UX change; renaming persisted shapes; touching pure modules (`engine/`, `memory/`, `extraction/` internals stay as-is — only their orchestration moves).

## Deliverables

- `src/runtime/coordinators/`:
  - `memoryCoordinator.ts` — tiers, arcs, canon, epistemic, ledger, consolidation, supersession bridge, WI sync, vectors, injection blocks. (Largest lift; target ~600 lines out of the manager.)
  - `extractionCoordinator.ts` — applyExtractionAudit pipeline, scene-break/short-term/epistemic-ledger passes, memorize backlog, reconciliation recording.
  - `expansionCoordinator.ts` — cache entries, generate, revalidate, merge.
  - `copilotCoordinator.ts` — stages, driver context, nudge lifecycle.
  - (talk stays in `talkControl.ts`; pacing math stays in `@pacing` — manager keeps only the glue.)
  - Each: constructor-injected deps (engine, settingsStore, persist callback, STAPI fns), no cross-coordinator imports — they compose only in the manager.
- RuntimeManager becomes: lifecycle (load/select/hydrate/restart), boundary commit orchestration, persistence, event fan-out, and delegation. Public surface preserved via thin delegating methods where external callers exist (slash commands, debug handle, scheduler host); genuinely internal methods move wholly. Target ≤700 lines (hard gate: report the number).
- Snapshot contract (I2): `RuntimeSnapshot` gains `ledger: LedgerView[]`, `driver: DriverContext | null`, `activeNudge: string | null` (built by a new `snapshotBuilder.ts` composing coordinator read-models); DrawerTabs/index.tsx stop calling manager getters during render. Getters remain for the debug handle only.
- Boundary registry (I6): `runtime/boundaryWork.ts` — declarative list `{id, priority, when(result, deps), run}` covering the 7 current branches (cues, reconciliation, expansion, scene-detect, short-term compaction, consolidation cadence, talk bookkeeping); `runtime/index.ts` shrinks to wiring the registry + host events. Adding boundary work = adding an entry, not editing the callback.
- Layer moves (I4): `DriverPanel.tsx` → `src/components/drawer/`; drawer no longer imports from `src/studio/`; `components/studio/` stays the shared-primitives home. Storybook paths updated.
- Docs truth-up (I5, rule 5): `.claude/rules/architecture.md` + CLAUDE.md + `docs/architecture-v2.md` — describe `EngineHost` as what it is (clock seam), name `EffectsApplier` + coordinators as the host-effect layer, document the registry. Delete the false sentence everywhere it appears.
- **Structural guards** (rule 9 — make I1/I2/I4 unrepeatable): a jest test asserting (a) `runtimeManager.ts` ≤ its post-refactor budget, (b) no import from `src/components/**` into `src/studio/**` or vice versa outside the shared-primitives path, (c) drawer components read only from the snapshot type (no `RuntimeManager` method calls in `components/drawer/**` render paths). Failing budget = failing build, so the next eight plans cannot silently re-grow the god object.

Exports: coordinator interfaces, `snapshotBuilder`, `boundaryWork` registry — plans 04–06 build on these (rule 3 enforcement point).

## Implementation notes

- Mechanical, staged extraction: one coordinator per commit, jest green between each (suites are the safety net — 47 suites / 1427 tests must pass unmodified except import paths; a test that must change semantically = a behavior change = stop).
- Persist discipline: coordinators never call `saveMetadata` themselves; they mutate extras slices and signal dirty; the manager owns the persist boundary (as today).
- `notify()` stays coarse this plan (one snapshot rebuild per notify); per-slice memoization only if Storybook/live shows jank — don't optimize speculatively.
- Debug handle (`globalThis.storyOrchestratorRuntime`) keeps every documented method (gotchas list is the contract) — delegation is fine, removal is not.
- Watch the two live-found invariants: talk decision key pinned per wrapper pass; interceptor assigned once in `startRuntime()` — neither moves.

## Validation gate

Harness: full suite green with only-import-path diffs to tests (**and the whole v2 scenario corpus still green** — this refactor is its stress test); structural guards passing; typecheck/lint/build; Storybook run (moved stories). Live journey gates (regression floor, fresh-start): J3, J5, J6 — **behaviour-equivalent**, not byte-identical: the journal comparator ignores timestamps, latencies, and model wording, and asserts the same event *kinds* in the same causal order per boundary with no kind missing or added (real-model timing varies — the v2 lesson is tolerance in checks, never mocks). Gate record: line counts (manager before/after, per coordinator), public-method count, guard budgets, confirmation docs updated.

## Delegated decisions

- Exact coordinator boundaries where a method straddles (e.g. `applyExtractionAudit` touches memory + arcs + epistemic: lives in extractionCoordinator, delegates per-tier application to memoryCoordinator).
- Whether `runtime/types.ts` splits per coordinator or stays single.

## Unresolved questions

- None.

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

## Build parts (execution order)

Staged per the implementation notes — harness green between each, plan gate runs at the end.

| Part | Content | Status |
|---|---|---|
| 1 | `coordinators/memoryCoordinator.ts` + `roster.ts` extraction; manager delegates | DONE |
| 2 | `extractionCoordinator.ts`, `expansionCoordinator.ts`, `copilotCoordinator.ts` | DONE |
| 3 | `snapshotBuilder.ts` + snapshot contract (`ledger`/`driver`/`activeNudge`); drawer stops calling manager getters; `DriverPanel` → `components/drawer/` | DONE |
| 4 | `boundaryWork.ts` registry; `runtime/index.ts` shrinks to wiring | DONE |
| 5 | Structural guards (size budget, import boundary, drawer-reads-snapshot) + docs truth-up + full plan gate (journeys J3/J5/J6, scenario corpus, Storybook) | DONE |

### Part 1 record (2026-08-12)

Moved out of `runtimeManager.ts`: tiers, arcs, canon, epistemic, ledger, consolidation, supersession bridge, WI sync, vector match sets, all prompt injection, score context, entry tokens. Roster↔ST resolution (`enabledCharacterIds/Names`, `activeSpeakerId`, `namesForRosterId`, `rosterIdForName`) split into `runtime/roster.ts` — shared by manager, coordinator and (later) the talk host.

- Line counts: `runtimeManager.ts` 1708 → 1288 (−420); `coordinators/memoryCoordinator.ts` 584; `roster.ts` 54.
- Public surface unchanged — every moved method kept as a thin delegate (debug-handle contract in `.claude/rules/gotchas.md` intact).
- Persist discipline held: the coordinator mutates the `extras.memory` slice through injected `getMemory`/`setMemory` and calls the manager's `persist`/`notify`; it never touches `saveMetadata`.
- Deltas the coordinator raises (arc bridges, supersession bridge) go through injected `enqueueMechanical`/`enqueueExtractorDeltas` — the engine stays manager-owned.
- Gates: `npm run typecheck` ✓, `npm run lint` ✓, `npm test` ✓ **51 suites / 1470 tests, zero test-file edits**, `npm run build` ✓ (pre-existing size warnings only).
- Live (real LLM, gemma4-mtp profile, no `debugResponse`, `--sandbox`): `live-plan07-memory` 12/12 ✓ (real generations 54s/20s, real facts-tier memory + injection, real scene summary), `live-plan09-arcs` 10/10 ✓, `live-plan10-epistemic-ledger` 4/4 ✓, `plan08-hygiene` 10/10 ✓ (real consolidation pass 18.6s — vectors/WI/supersession path). One `--sandbox` `/newchat` timeout on first hygiene attempt; passed on retry from a fresh chat (environment flake, not a code finding).

## Gate record — 2026-08-12 (ACCEPTED)

Behaviour-preserving decomposition. No feature, no UX change, no persisted-shape change; the only
contract that moved is the in-memory `RuntimeSnapshot` (three added fields).

### Sizes (the hard gate)

| File | Before | After |
|---|---|---|
| `runtime/runtimeManager.ts` | 1708 | **690** (budget 700) |
| `runtime/index.ts` | 142 | 126 |
| `coordinators/memoryCoordinator.ts` | — | 596 |
| `coordinators/extractionCoordinator.ts` | — | 290 |
| `coordinators/expansionCoordinator.ts` | — | 170 |
| `coordinators/pacingCoordinator.ts` | — | 102 |
| `coordinators/copilotCoordinator.ts` | — | 87 |
| `runtime/boundaryWork.ts` | — | 100 |
| `runtime/snapshotBuilder.ts` | — | 80 |
| `runtime/roster.ts` | — | 54 |
| `runtime/architecture.test.ts` | — | 67 |

**Public method count: 94 before, 94 after** (`grep -E "^  (async )?[a-zA-Z]\w*\(" | grep -v private`
on `HEAD` vs working tree). Every moved method survives as a delegate, so the debug-handle contract in
`.claude/rules/gotchas.md`, the slash commands, the macros and the scheduler host are untouched.
Delegates are single-line (`getArcs(): ArcEntry[] { return this.memory.getArcs(); }`) — the three-line
form was pure noise at 50 call-throughs.

### What landed

- **Five coordinators**, each owning one `extras` slice, constructor-injected deps, no cross-coordinator
  value imports (guard-enforced), none calling `saveMetadata`. `pacingCoordinator` was not in the plan's
  list: the tension EMA (pending + committed + rollback replay + steering) is a coherent slice and the
  manager could not reach its budget while holding it. Engine writes still go through injected
  `enqueueMechanical` / `enqueueExtractorDeltas` — the engine stays manager-owned.
- **`roster.ts`**: the roster↔ST resolution that three places had partial copies of.
- **Snapshot contract (I2)**: `snapshotBuilder.buildRuntimeSnapshot` composes one model; `RuntimeSnapshot`
  gained `ledger`, `driver`, `activeNudge`. `DrawerTabs` and `index.tsx` no longer call manager getters
  during render (`manager.getLedger()` / `getDriverContext()` / `getActiveNudge()` are gone from render
  paths; they remain on the manager for the debug handle).
- **Boundary registry (I6)**: `boundaryWork.ts` holds all seven behaviours as `{id, order, when, run}`;
  `runtime/index.ts`'s boundary callback is three lines. Each entry is isolated by a try/catch, so one
  failing scheduler decision no longer takes the rest of the boundary down. `scene-detect` documents on
  the entry why the probe *is* the condition (it advances the location/cast cursor).
- **Layer moves (I4)**: `DriverPanel.tsx` + stories → `src/components/drawer/` (story title
  `Studio/DriverPanel` → `Drawer/DriverPanel`). No `src/components/**` → `src/studio/**` import remains;
  `src/studio/**` reaches components only through `@components/studio/*`.
- **Docs truth-up (I5)**: the false "host effects go through the `EngineHost` seam" sentence is corrected
  in `.claude/CLAUDE.md`, `.claude/rules/architecture.md` and `docs/architecture-v2.md` — `EngineHost` is
  `{ now }`, a clock seam; host effects live in `EffectsApplier` + the coordinators. All three docs now
  carry the coordinator/registry/snapshot layout, and `test-plan.md` records the guards as layer 1.
- **Structural guards (rule 9)**: `src/runtime/architecture.test.ts`, 7 tests — manager budget 700,
  coordinator budget 620, components↛studio, studio→components only via shared primitives, no
  `manager.get*(` in `components/drawer/**`, engine purity, no cross-coordinator value imports. Verified
  they actually bite: the pre-plan `../../studio/components/DriverPanel` import and the
  `manager.getLedger()` render call both match their rule.

### Harness

- `npm run typecheck` ✓ · `npm run lint` ✓ · `npm run build` ✓ (pre-existing bundle-size warnings only)
- `npm test` ✓ **52 suites / 1477 tests** (51/1470 before + the new guard suite). **Zero edits to existing
  jest tests** across all five parts — the safety net never had to be adjusted.
- `npm run test-storybook:ci` ✓ **20 suites / 65 tests**. One story failed mid-plan and was fixed, not
  waived: `Drawer/DrawerTabs › Memory` fed the ledger through a mocked `manager.getLedger()`; the fixture
  now carries `snapshot.ledger`, which is exactly the contract the plan moved.

### Live — real LLM (gemma4-mtp profile, no `debugResponse`)

Scenario corpus (`--sandbox`): `live-plan07-memory` 12/12 ✓ · `live-plan09-arcs` 10/10 ✓ ·
`live-plan10-epistemic-ledger` 4/4 ✓ · `plan08-hygiene` 10/10 ✓ (real consolidation 18.6 s — vectors, WI,
supersession). One `/newchat` sandbox timeout on the first hygiene attempt; green on retry from a fresh
chat (environment flake, no code finding).

Journey regression floor, fresh-start, compared against the plan-01 baseline matrix:

| Journey | This run | Plan-01 baseline | Verdict |
|---|---|---|---|
| J3 player-session | 5 pass / 1 fail / 2 blocked / 5 skipped | 5 / 1 / 2 | identical, check-for-check |
| J5 group-direction | 5 pass / 0 fail / 1 blocked / 1 skipped | 5 / 0 / 1 | identical |
| J6 mutation-storm | 3 pass / 0 fail / 1 blocked / 1 skipped | 3 / 0 / 1 | identical |

The J3.3 fail (player mode still renders "Epistemic map" / "State ledger", U3) and the four `blocked`
checks are the recorded baseline — plan 04's work, not regressions. Group `disabled_members` verified
empty after J5, so the `cast_changes` sandbox left no residue.

### Deviations from the plan

1. **A fifth coordinator** (`pacingCoordinator`) beyond the four named. Justified above; the plan's
   "pacing math stays in `@pacing`" still holds — only the runtime glue moved.
2. **`runtime/types.ts` stayed single** (a delegated decision): the shared `RuntimeSnapshot`/`RuntimeExtras`
   types are read by every coordinator, so splitting them per coordinator would have created the
   cross-imports the guards forbid.
3. **`setSchedulerSnapshot` is split, not moved**: the extraction half and the expansion "heavy" mirror
   each live in their own coordinator, with the manager sequencing the two and owning the persist.
4. One Storybook fixture changed (see above) — the plan's "tests change only for import paths" rule is
   about the jest suites, which held; a story asserting a prop contract must follow that contract.

### Notes for the next plan

- The manager budget is 700 and enforced. Plan 04+ adding orchestration puts it in a coordinator or a new
  module; the guard fails the build otherwise (overview rule 3, now automated).
- New boundary work = a new `BOUNDARY_WORK` entry. New UI data = a `snapshotBuilder` field, not a getter
  call from a component.

## Unresolved questions

- None.

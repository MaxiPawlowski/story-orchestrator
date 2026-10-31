# Plan 41 — memory wave 1 (CPU, no read-contract change)

Source: `research/memory-shortlist-2026-10-31.md` wave 1 and the report each item cites. Owner 2026-10-31: "Start wave 1.
But I want to test and try every potential upgrade." So every item is its own switch under `memory.*`, **on by default**
(only the owner turns one off), measured offline before → after with a floor stated before the run (informational: a miss
is recorded, the feature stays on), and queued for a real-model A/B in `gpu-queue-2026-10-30.md` §Memory wave 1.

Two agents: A (branch `v3.0-41-memory-a`, this section) and B (its own section below).

## Shared harness: long-horizon availability probes (A5, build first)

`memory-cognition-evals.md` P1, availability half (no model). The utilization half is GPU row MW1-PROBE-U.

- Harness: `test/support/memoryProbes.ts` `runProbeSession(options)`; jest entry `src/runtime/memoryProbes.probe.test.ts`
  (runs in `npm test`). It drives a real `MemoryCoordinator` (fake hosts, no model: any model call throws, every pass
  that needs one falls back) through a 160-boundary synthetic session (public test story "Probe Vale", cast Mira, Tobin,
  Esk, player Wren): every boundary one player line and one member reply, one read applying 3 memory rows, 1 ledger row,
  an epistemic row every 4th boundary, arcs every 7th; short-term rewrite every 6, scene summary every 15,
  consolidation every 5. At plant + 20 / 60 / 150 boundaries it posts the probe question as the newest player line,
  drafts the target member (`onMemberDrafted`) and reads what the memory slots hold for that member (the four tiers,
  ledger and private block = the memory part of that member's dry-run prompt). `termPresent` = the live-suite matcher.
- Kinds (4 subjects each, 72 checks): `single` (one fact), `update-fact` (fact moved; old value forbidden),
  `update-ledger` (ledger location changed; old value forbidden), `temporal` (both events present), `kept-out` (a
  `[hiding]` secret restated in two memory rows; its words forbidden for the member it is hidden from), `secret-knower`
  (the knower still gets it).
- Floors (declared 2026-10-31 before the first run, informational): availability >= 0.9 at 60 boundaries; kept-out
  forbidden terms = 0 (**hard**: the jest test fails on a leak).
- Record a run: `SO_PROBE_LABEL="<label>" SO_PROBE_RECORD=test/measurements/v3.0/memory-probes/<name>.json npx jest
  src/runtime/memoryProbes.probe.test.ts` (writes per-kind × horizon rows plus every result; the test also prints the
  rows). Options for an arm: `runProbeSession({ settings: { <switch>: false } })`. Agent B: record your before/after with
  the same command.
- **Baseline on master `fabc9384a`** (`test/measurements/v3.0/memory-probes/baseline-master.json`): availability at 60 =
  **0.375** (floor 0.9: miss), kept-out leaks **0**.
  - single 4/4 @20, 1/4 @60, 1/4 @150 (the facts cap of 50 drops the oldest rows);
  - update-fact 4/4, 0/4, 0/4; update-ledger 0/4 at every horizon (ledger focus never reads the turn text, so the asked
    item is not selected); temporal 3/4, 0/4, 0/4; kept-out 4/4 everywhere; secret-knower 4/4 everywhere.
  - Synthetic density (3 rows a read) is higher than a typical read, so absolute numbers say more about caps and
    selection than about a real chat; the before → after delta is the measurement.

## Items (agent A)

To be filled per item: switch, mechanism, floor, before → after.

## Gate record A

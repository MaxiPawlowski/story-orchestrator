# Memory/engine review source-drift qualification

All reproductions and conclusions in `memory-engine-review.md` target isolated revision `0a094e58734df99c287e0356b42407dd9e3e95e1`.

A final SHA-256 comparison found the cited pure files below byte-identical between the isolated revision and the current shared working tree:

- `src/memory/stores.ts`
- `src/memory/consolidate.ts`
- `src/memory/epistemic.ts`
- `src/memory/ledger.ts`
- `src/memory/budget.ts`
- `src/engine/engine.ts`
- `src/engine/validate.ts`
- `docs/plans/v2/story-orchestrator-spec-v2.md`
- `docs/plans/v2/07-memory-foundation.md`

`src/runtime/coordinators/memoryCoordinator.ts` had concurrent drift. The report's rollback-composition citation refers to isolated baseline lines 259-269, which spread `dropByMessageId` and invoke `rollbackEpistemic` and `rollbackLedger`. Consult the root review's `docs/review/2026-09-18/evidence/source-drift.json` before applying a remedy to the current shared tree. No current files were copied into the isolated test copy.

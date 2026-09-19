# Independent memory and engine review

Review date: 2026-09-18  
Revision: `0a094e58734df99c287e0356b42407dd9e3e95e1`  
Mode: source review plus review-only Jest reproductions in the isolated copy. No production source or contract was changed.

## Outcome

The existing focused memory and engine tests pass, including the long fixture and convergence properties, but they do not exercise the inverse operations needed after chat mutation. The independent harness reproduced eight contract failures with six passing negative controls. Four failures share one cause: memory maintenance mutates old records or retains coverage metadata without recording when that mutation happened, so rollback cannot reconstruct the state that existed before the edited/deleted/swiped text.

| ID | Severity | Confidence | Finding |
|---|---:|---:|---|
| M1 | High | High | Removing a superseding fact leaves its predecessor retired by a missing winner. |
| M2 | High | High | Rolled-back read coverage blocks the forced reread from repopulating memory. |
| M3 | High | High | Ledger updates overwrite history, so rollback loses the prior value. |
| M4 | High | High | Epistemic retirement is not reversed when the reveal is rolled back. |
| M5 | High | High behavior / medium contract | Pinning an old fact discards a later state change and freezes stale truth. |
| M6 | High | High behavior / medium contract | Pinned private knowledge from removed chat text survives and remains injectable. |
| M7 | Medium | High | Editing memory text retains a stale token count and can exceed the configured budget. |
| E1 | High for affected chats | High | Mutations before the 200-snapshot horizon silently fail to roll the engine back. |

## Findings

### M1 — fact supersession is not rollback-safe

`applyConsolidation` stores `supersededBy` on the older entry (`src/memory/consolidate.ts:110-121`). `dropByMessageId` only filters entries by their own creation message (`src/memory/stores.ts:55-57`). If message 10 creates fact B and retires fact A from message 1, rolling back message 10 drops B but leaves A with `supersededBy: B`. Injection continues to exclude A, so rollback is not equivalent to never applying B.

The harness reproduced a dangling link exactly. This conflicts with the mutation contract in `docs/plans/v2/story-orchestrator-spec-v2.md:82,299`.

Remedy: record supersession event provenance, such as `supersededAtMessageId` and `supersededAtBoundary`, then clear links created at or after the rollback point. An immutable maintenance log or before-images would cover this and the next two findings more generally. This adds persisted metadata, but it avoids trying to infer history from current rows.

### M2 — rollback leaves read coverage that rejects the correction reread

`addMemoryEntries` discards a read when `writeLog` already contains a covering tier/character range (`src/memory/stores.ts:38-49`). `dropByMessageId` leaves `writeLog` untouched (`src/memory/stores.ts:55-57`), and the coordinator spreads that unchanged state into the rollback result (`src/runtime/coordinators/memoryCoordinator.ts:259-269`). A forced reread over the same corrected window therefore accepts no replacement entries.

The control used different content in the same range, proving the exclusion was coverage-based rather than deduplication-based.

Remedy: on rollback, remove write-log records whose covered range intersects the reverted message range. Keeping only records with `range.to < messageId` is simple and conservative. A more selective range split preserves extra dedup coverage but is harder to reason about and offers little value for a forced correction read.

### M3 — ledger update rollback cannot restore the previous state

`applyLedgerSignals` finds an existing entity/field row and overwrites `value`, `createdAt`, and `messageId` in place (`src/memory/ledger.ts:38-44`). `rollbackLedger` can only retain or drop the current row (`src/memory/ledger.ts:67-69`). After `healthy@1` becomes `injured@10`, rollback from message 10 removes the row instead of restoring `healthy@1`. Pinning makes the opposite failure possible: the row survives with the rolled-back value.

Remedy: store ledger versions append-only and derive the latest active value, or retain a small per-key before-image journal keyed by message/boundary. Append-only rows are simpler and make rollback, audit, and pin behavior explicit; they cost more metadata and require compaction.

### M4 — epistemic retirement rollback does not reactivate prior knowledge

Retirement mutates an existing epistemic row by adding a boundary-only marker such as `retired@10` (`src/memory/epistemic.ts:37-47`). `rollbackEpistemic` only filters by the row's original `messageId` (`src/memory/epistemic.ts:108-110`). A belief created at message 1 and retired by a reveal at message 10 stays retired after message 10 is removed.

This can make a character permanently forget a belief after a swiped or edited reveal, violating the perspective-accuracy goal.

Remedy: store retirement message and boundary as structured fields and clear retirement events at or after rollback. A string marker should remain display-only, if retained at all.

### M5 — pinning a predecessor suppresses newer truth

During consolidation, a state-change candidate may supersede an older entry only when the older entry is not pinned (`src/memory/consolidate.ts:78-88`). With a pinned predecessor, the same high-similarity candidate enters the duplicate path and is dropped (`src/memory/consolidate.ts:91-96`). `applyConsolidation` also refuses to mark a pinned record superseded (`src/memory/consolidate.ts:114-121`).

The result is stronger than preservation: pinning "Mara trusts the player" prevents "Mara no longer trusts the player" from becoming active. The spec defines pinning as protection from trimming and expiry (`docs/plans/v2/story-orchestrator-spec-v2.md:149`; `docs/plans/v2/07-memory-foundation.md:29`), while supersession must retire changed facts cleanly.

Remedy: let a pinned row be marked superseded while preserving the physical record. Pin should govern retention, not active-truth status. If product intent is to let users freeze truth, expose that as a separate lock with clear UI semantics.

### M6 — pinned private knowledge survives removal of its only provenance

All ordinary, epistemic, and ledger rollback filters exempt pinned rows (`src/memory/stores.ts:55-57`, `src/memory/epistemic.ts:108-110`, `src/memory/ledger.ts:67-69`). The reproduction pinned a private fact created at message 10, rolled back message 10, and confirmed `renderPrivateEpistemicBlock` still emitted the secret.

This is both a privacy risk and a source-of-truth conflict. The mutation contract says to drop memory created at or after the mutation, while the pin contract says pins are never trimmed or expired; rollback is neither trimming nor expiry. Existing repository tests intentionally assert survival across rollback, so the mismatch is codified rather than accidental.

Remedy: make a product decision explicit. The safer contract is that pin protects against trim/expiry but not removal of source history. If user-curated facts must survive, represent the pin/edit as a separate manual provenance event; then rollback can remove extracted provenance without deleting an explicit user-authored replacement. A lower-cost alternative is to retain but quarantine such rows from injection until the user reconfirms them.

### M7 — edited text uses its old token cost

`editEntryText` changes only `text` (`src/memory/stores.ts:78-80`). Budget selection prefers cached `entry.tokens` whenever present (`src/memory/budget.ts:9-10`). The harness changed a one-token entry into 80 characters and it remained selected under a four-token budget; the uncached control was correctly rejected.

The vendored Smart-Memory paths estimate the currently formatted content during injection (`vendor/smart-memory/longterm.js:966-1002`, `vendor/smart-memory/session.js:660-681`), so this regression is adaptation-specific.

Remedy: clear `tokens` in `editEntryText`, then let the normal estimator apply immediately and refresh the exact count asynchronously. Recomputing synchronously through the host tokenizer would make the edit path unnecessarily dependent on host I/O.

### E1 — old mutations exceed the silent rollback horizon

Engine snapshots and boundary log entries are capped at 200 (`src/engine/engine.ts:145,186,240-245`). After 205 applied boundaries, `shouldRollbackFromMessage(0)` still returns true from retained later log entries, `boundaryBeforeMessage(0)` falls back to boundary 0 (`src/engine/engine.ts:191-196`), and `rollbackTo(0)` returns false because snapshot 0 has been evicted (`src/engine/engine.ts:151-166`). Runtime only performs cleanup and forced reread when `changed` is true, so the mutation becomes a silent no-op.

The spec allows a bounded log, but it does not define silent correctness loss beyond that bound. A recent mutation in the same 205-boundary fixture rolled back successfully.

Remedy: preserve a base snapshot plus enough replay data, or detect an out-of-horizon mutation and rebuild/restart state explicitly. Keeping every snapshot is simplest but grows with the chat. A bounded implementation should surface the horizon and take a deterministic recovery path rather than returning unchanged state.

## Large-graph result

A linear story with 1,000 checkpoints parsed correctly and traversed one transition per boundary to checkpoint 999. In this environment parsing took 90 ms and traversal took 10 ms. `buildReachability` materializes the transitive reachable set for every checkpoint (`src/engine/validate.ts:361-376`), so storage is quadratic on long chains even though this measurement was healthy. No defect is claimed at 1,000 nodes; a bitset or on-demand reachability cache would be appropriate only if multi-thousand-node authored/generated graphs become a real requirement.

## Vendor comparison

- Smart-Memory supersession preserves the new state-change candidate and records old/new validity (`vendor/smart-memory/embeddings.js:347-393`, `longterm.js:517-559`, `session.js:355-377`). The adaptation dropped validity provenance and added pin-aware suppression.
- Smart-Memory budgets current formatted content at injection time. The adaptation's cached token optimization is safe for extracted immutable text but needs invalidation on manual edits.
- The vendor does not supply Story Orchestrator's chat-mutation rollback contract, so the adaptation needs its own inverse/event journal; direct port fidelity cannot solve M1-M4.

## Verification

Review harness:

```text
.\node_modules\.bin\jest.cmd --runInBand --runTestsByPath src\memory\memory-engine.review.test.ts
FAIL: 8 intended-contract assertions failed; 6 negative controls passed; 14 total.
```

Existing focused controls:

```text
.\node_modules\.bin\jest.cmd --runInBand --runTestsByPath src\memory\stores.test.ts src\memory\consolidate.test.ts src\memory\epistemic.test.ts src\memory\ledger.test.ts src\memory\budget.test.ts src\memory\inject.test.ts src\engine\engine.test.ts
PASS: 7 suites, 79 tests.

.\node_modules\.bin\jest.cmd --runInBand --runTestsByPath src\memory\longFixture.test.ts src\engine\convergence.property.test.ts
PASS: 2 suites, 1006 tests.
```

Full console summary and isolated-copy location are in `docs/review/2026-09-18/evidence/memory-engine-jest.txt`.

## Coverage limits

- `stores.ts`: exercised range coverage, rollback, pin/expiry, edit, count cap, and token selection. Did not stress write-log eviction past 100 records or exclusion hash collisions.
- `consolidate.ts`: used deterministic match sets to isolate state transitions. Did not call vectors or an LLM; those affect match discovery, not the reproduced inverse/pin behavior.
- `epistemic.ts` and `ledger.ts`: exercised pure add/update/retire/render/rollback operations. Did not run real group draft events or inspect live generation payloads.
- `budget.ts`: tested estimated and cached selection behavior. Did not call the host tokenizer; the failure occurs before that seam.
- `engine.ts`: exercised 205-boundary history and a 1,000-node linear graph. Did not stress wide cyclic graphs, concurrent enqueue timing, or hydrate rollback history already covered by the root review.
- `memoryCoordinator.ts`: inspected rollback composition and cited its spread behavior, but did not instantiate the ST-facing coordinator. The pure functions reproduce the state it composes.
- No browser, live SillyTavern session, model/profile, host setting, or real-LLM path was used, per the delegated scope.

# Preserved-baseline versus current-source comparison

Comparison time: 2026-09-18  
Preserved baseline revision: `0a094e58734df99c287e0356b42407dd9e3e95e1`  
Current-source snapshot created: `2026-09-18T22:35:48.0531964Z`

## Method

The expanded 13-test `scripts/review/reviewRegression.test.ts` was copied under a unique test name and run against the preserved isolated baseline. No current source was copied into that baseline.

A separate temporary comparison tree, `story-orchestrator-current-comparison-20260918-memory`, was then created from the current working-tree `src`, fixtures, goldens, and Jest/TypeScript configuration. Its `node_modules` is a read-only-use junction to the preserved baseline dependency installation; neither production nor the active isolated host was used as a working directory. Both harnesses were copied into the separate tree under unique names and executed there.

The snapshot contains 407 source/config/fixture files in [current-source-sha256.tsv](evidence/current-source-sha256.tsv). The manifest SHA-256 is `7e979f6fdf8f897591ed8993618dcf18cd97184b11998bb6cb9209514ecf4d52`. Paths in evidence are relative and contain no user-specific directory.

Harness identity was held constant:

| Harness | SHA-256 |
|---|---|
| `reviewRegression.test.ts` | `bde52da0eaee373c1d45ce499fbdbb4075019e18c1d6a2a8a9ddbecf4f211510` |
| `memory-engine.test.ts` | `7f2292cfcc612ae25e4290db96f52b72a231c71bb95663cb9d0b602b31bf2cc0` |

## Result

| Harness | Preserved baseline | Current snapshot | Change |
|---|---:|---:|---|
| Root regression, 13 tests | 4 pass / 9 fail | 5 pass / 8 fail | R3 fixed |
| Memory/engine, 14 tests | 6 pass / 8 fail | 6 pass / 8 fail | No finding changed |

Only R3 changed result. Current `StagecraftCoordinator.writeOp` now treats `false` from `enableWIEntry`/`disableWIEntry` as failure and treats `"failed"` from `upsertWIEntry` as failure (`src/runtime/coordinators/stagecraftCoordinator.ts:215-220` in the current manifest). The regression now returns zero applied operations and marks the operation failed.

The remaining current failures are R1, R2, R4-R9, M1-M7, and E1.

## Expanded regression assessment

| ID | Baseline | Current | Assessment |
|---|---:|---:|---|
| normal curator control | Pass | Pass | Harness write path is live in both snapshots. |
| R1 stale curator result | Fail | Fail | Cross-chat late result remains accepted. |
| R2 curator rollback order | Fail | Fail | Two rewrites still restore `First`, not `Original`. |
| R3 false host return | Fail | **Pass** | Fixed by explicit host-result checks. |
| R4 hydrated rollback evidence | Fail | Fail | Hydration still loses transition-evidence history. |
| R5 code-owned extraction | Fail | Fail | Parser still constructs a delta with `source: code`. |
| R6 out-of-scope extraction | Fail | Fail | Shared read still accepts a known but unrequested quality. |
| unknown-quality control | Pass | Pass | Final parser continues to reject undeclared keys. |
| R7 title HTML escaping | Fail | Fail | Imported title remains raw in popup HTML. |
| plain-title control | Pass | Pass | Ordinary title rendering remains present. |
| R8 wizard ownership | Fail | Fail | Declaring an existing user lorebook as a dependency still grants write access. |
| absent-book control | Pass | Pass | A book absent from requirements is still rejected. |
| R9 generated alternatives | Fail | Fail | The original outcome survives, but a second valid alternative is discarded by merge. |

The parser controls matter: R5/R6 are not broad parser failure. Unknown qualities are rejected in both trees, while declared qualities bypass the required authority/scope filters. Likewise, the wizard control proves it rejects unrelated books; R8 is the narrower ownership error where dependency declaration is treated as write ownership.

## Memory/engine assessment

All independent findings retain the same pass/fail result in the current snapshot:

- M1 fact supersession rollback leaves a dangling retirement link.
- M2 rollback leaves read coverage that suppresses the correction reread.
- M3 ledger overwrite cannot restore the preceding value.
- M4 epistemic retirement cannot be reversed.
- M5 pinning a predecessor discards a later state change.
- M6 pinned private knowledge whose source text was removed remains injectable.
- M7 manual edits retain stale token cost.
- E1 mutations older than the 200-snapshot horizon cannot roll back.

The current `memoryCoordinator.ts` changed for the new memory-mirror integration, but its rollback composition remains the same at snapshot lines 260-269: it spreads `dropByMessageId`, then calls `rollbackEpistemic` and `rollbackLedger` without an inverse-event journal. The pure files used by M1-M7 and E1 were byte-identical in the earlier baseline/current hash check, which matches the unchanged test results.

M5 and M6 are semantic contract conflicts around pinning. M6 does **not** demonstrate wrong-character private-memory leakage: the reproduction renders the rolled-back fact for its intended subject, Mara. The risk is that provenance removed by swipe/edit/delete continues to influence that intended speaker. Cross-character isolation requires a different group-draft/payload test and is outside this harness.

The 1,000-checkpoint current graph remained correct, parsing in 76 ms and traversing in 8 ms in this run. Timing is observational and not a threshold assertion.

## Relevant current-source drift

The current snapshot added five source/test files, changed seventeen, and deleted one review-only test file relative to the isolated baseline. Changes relevant to these harnesses include:

- `stagecraftCoordinator.ts`: fixed R3 only; R1/R2 persist.
- `extraction/parse.ts`: changed, but R5/R6 persist.
- `memoryCoordinator.ts`, `extras.ts`, `runtimeManager.ts`, and `types.ts`: added memory-mirror state and behavior; M1-M7 remain unchanged.
- `wizard/provisioning.ts`: changed, but R8 persists because the coordinator's environment still treats a required existing lorebook as story-owned.
- No changed engine source addresses R4 or E1.
- No changed generation merge source addresses R9.

This report assesses the immutable current snapshot recorded by the manifest. Later concurrent edits to the shared working tree are not included.

## Commands and evidence

Preserved baseline:

```text
.\node_modules\.bin\jest.cmd --runInBand --runTestsByPath src\memory\review-regression.review.test.ts
FAIL: 9 failed, 4 passed, 13 total.
```

Current-source copy:

```text
.\node_modules\.bin\jest.cmd --runInBand --runTestsByPath src\memory\review-regression.current.test.ts
FAIL: 8 failed, 5 passed, 13 total.

.\node_modules\.bin\jest.cmd --runInBand --runTestsByPath src\memory\memory-engine.current.test.ts
FAIL: 8 failed, 6 passed, 14 total.
```

Redacted evidence:

- [current-baseline-regression.txt](evidence/current-baseline-regression.txt)
- [current-source-regression.txt](evidence/current-source-regression.txt)
- [current-memory-engine.txt](evidence/current-memory-engine.txt)
- [current-comparison.json](evidence/current-comparison.json)
- [current-source-sha256.tsv](evidence/current-source-sha256.tsv)

## Limits

- These are deterministic unit reproductions with mocks. They do not validate browser behavior, real SillyTavern host events, group-draft payload isolation, or model behavior.
- The separate copy reused the baseline dependency installation. This controls dependency drift but does not test a fresh install of any changed package metadata; `package.json` was included in the manifest and had no installation performed.
- The comparison did not run the whole Jest suite because the task was to compare the two bounded harnesses. Earlier focused controls remain documented in `memory-engine-review.md`.
- No production file, contract, host setting, profile, chat, session, or active isolated source file was modified.

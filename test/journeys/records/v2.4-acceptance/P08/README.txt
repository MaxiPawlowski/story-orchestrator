v2.4 plan 09 acceptance, row P08 (lane 3 part): per-role recalibration ONCE on the frozen candidate (bundle 65733265d301, commit 4ebe1db), curator + authoring.
Lane 3 (ST :8103, CDP 9303), roles unset (memory profile Story Orchestrator Memory RunPod), same fixtures, labels and predeclared floors as test/journeys/records/v2.4-plan08/recal-e420eab0c646/.
Commands: st-lanes run 3 -- scripts/debug/so-role-calibration.mts run --role curator|authoring --arm shared-65733265d301 --record --expect-count 20
Goldens: test/goldens/live/role-calibration/{curator,authoring}-shared-65733265d301.json (replay green: npx jest src/runtime/roleCalibration.test.ts, 33/33, jest-roleCalibration-replay.log).
Run-header diff around the pair: 0 blocking (build.head allowed: docs-only commit e9fd5f8 by another session; bundle.served unchanged).
The five live-v24-08 fixtures x2 and J3/J5 are lane 1's, not here.

v2.4 plan 08 recalibration after 5cfa5b6 (wizard stages refuse out-of-stage ops) and 621c185 (curator [enable]/[disable] rule lines). Lane 2 (ST :8102, CDP 9302), bundle.served e420eab0c646, roles unset (memory profile Story Orchestrator Memory RunPod), same fixtures and floors as live-56f299a98ea5.
Commands: so-role-calibration.mts run --role curator|authoring --arm shared-e420eab0c646 --record --expect-count 20.
Goldens: test/goldens/live/role-calibration/{curator,authoring}-shared-e420eab0c646.json (new); the 56f299a98ea5 goldens {curator,authoring}-shared.json are kept and both replay in src/runtime/roleCalibration.test.ts.
Run-header diff around the batch: 0 differences, ok.

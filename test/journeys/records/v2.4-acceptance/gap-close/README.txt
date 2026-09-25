v2.4 plan 09 gap-close runs, 2026-09-25 18:50-19:40Z. Served bundle 65733265d301 (candidate 4ebe1db) in all 22 run-header captures (the wrappers refuse to run otherwise).
Lanes 1 (P08) and 3 (P05 mirror-rate recipe, then the CL judge-on J7). Group 1759606632088. Real model (Artemis RunPod RP via :18080), no debugResponse, fixtures and harness from master.
Every run and batch wrapped in so-run-header capture/diff with --allow build.head declared up front (master moved 27d0bf8 -> 582d56a during the runs; no rebuild, bundle.served unchanged).
Wrappers: scen.sh (one scenario run), journey.sh (one journey run + so-journal follow tail), p08-batch.sh, p08-routing-b.sh, p05-mirror.sh, cl-j7-lane3.sh (cl-j7.sh on lane 1 was replaced by it before it ran).
Harness change during the session: scripts/debug/st-navigation.mts deleteSandboxChats (save settle before delete + late-file repair), after P08 routing run 2; P08 routing runs 3-4 and the J7 judge-on run used it; every P05 run predates it.

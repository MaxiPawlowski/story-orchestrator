#!/usr/bin/env bash
set -u
cd "C:/dev/SillyTavern-MainBranch/public/scripts/extensions/third-party/story-orchestrator"
R=test/journeys/records/v2.4-acceptance/P08
L="node scripts/debug/st-lanes.mts run 1 --"
timeout 300 $L scripts/debug/so-run-header.mts capture --label v24-acc-P08-routing-B-start --out $R/header-routing-B-batch-start.json > $R/header-routing-B-batch-capture.log 2>&1
export ALLOW=build.head
for n in 3 4; do bash .debug/acc-gaps/scen.sh 1 P08 test/scenarios/live-v24-08-routing.json live-routing-run$n; done
timeout 300 $L scripts/debug/so-run-header.mts diff $R/header-routing-B-batch-start.json --allow build.head > $R/header-routing-B-batch-diff.log 2>&1
echo "BATCH DONE diff=$?"
bash .debug/acc-gaps/cl-j7.sh
echo "J7 DONE"

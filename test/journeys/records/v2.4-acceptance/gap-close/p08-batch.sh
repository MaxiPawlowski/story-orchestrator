#!/usr/bin/env bash
set -u
cd "C:/dev/SillyTavern-MainBranch/public/scripts/extensions/third-party/story-orchestrator"
R=test/journeys/records/v2.4-acceptance/P08
L="node scripts/debug/st-lanes.mts run 1 --"
mkdir -p $R
timeout 300 $L scripts/debug/so-run-header.mts capture --label v24-acc-P08-live-batch-start --out $R/header-live-batch-start.json > $R/header-live-batch-capture.log 2>&1
export ALLOW=build.head
for f in preview-capture preview-capture-solo fates-jump quality-macro routing; do
  for n in 1 2; do
    bash .debug/acc-gaps/scen.sh 1 P08 test/scenarios/live-v24-08-$f.json live-$f-run$n
  done
done
timeout 300 $L scripts/debug/so-run-header.mts diff $R/header-live-batch-start.json --allow build.head > $R/header-live-batch-diff.log 2>&1
echo "BATCH DONE diff=$?"

#!/usr/bin/env bash
# plan 05 recipe for live-v24-05-mirror-rate: st-session reload BEFORE the first J3 (the tally is page memory and starts at zero),
# J3 x2 on the same page with no reload in between, then the fixture on that page. Done twice (series A, B).
set -u
cd "C:/dev/SillyTavern-MainBranch/public/scripts/extensions/third-party/story-orchestrator"
R=test/journeys/records/v2.4-acceptance/P05
L="node scripts/debug/st-lanes.mts run 3 --"
timeout 300 $L scripts/debug/so-run-header.mts capture --label v24-acc-P05-mirror-batch-start --out $R/header-mirror-batch-start.json > $R/header-mirror-batch-capture.log 2>&1
export ALLOW=build.head
for k in 1 2; do
  D=$R/mirror-rate-run$k
  mkdir -p $D
  timeout 180 $L scripts/debug/st-session.mts reload > $D/reload.log 2>&1
  echo "reload exit=$?" >> $D/reload.log
  bash .debug/acc-gaps/journey.sh 3 P05/mirror-rate-run$k/J3-a J3
  bash .debug/acc-gaps/journey.sh 3 P05/mirror-rate-run$k/J3-b J3
  timeout 120 $L scripts/debug/st-eval.mts "return globalThis.storyOrchestratorLoreEvidence?.mirrorRates?.() ?? 'no ring'" > $D/mirror-rates-raw.log 2>&1
  bash .debug/acc-gaps/scen.sh 3 P05 test/scenarios/live-v24-05-mirror-rate.json mirror-rate-run$k
done
timeout 300 $L scripts/debug/so-run-header.mts diff $R/header-mirror-batch-start.json --allow build.head > $R/header-mirror-batch-diff.log 2>&1
echo "BATCH DONE diff=$?"

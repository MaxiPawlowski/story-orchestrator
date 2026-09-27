#!/usr/bin/env bash
cd /c/dev/SillyTavern-MainBranch/public/scripts/extensions/third-party/story-orchestrator
O=test/journeys/records/v2.5-batch2/plan09/SP8/W4b; mkdir -p $O
curl -s -m 5 http://127.0.0.1:18080/metrics | grep -v '^#' > $O/metrics-before.txt
node scripts/debug/st-lanes.mts run 3 -- scripts/debug/so-run-header.mts capture --label v25-09-sp8-w4 > $O/header-capture.log 2>&1
cp /c/dev/so-lanes/3/debug/run-header-v25-09-sp8-w4.json $O/header-before.json
for r in 1 2; do
  s=$(date +%s)
  node scripts/debug/st-lanes.mts run 3 -- scripts/debug/so-role-calibration.mts run --role curator --digest-pad "Adolion World" --expect-count 20 --arm digest-fd8efa441c80-r$r --record > $O/run$r.log 2>&1
  echo "run$r rc=$? secs=$(( $(date +%s) - s ))" >> $O/runs.rc
done
node scripts/debug/so-role-calibration.mts verdict test/goldens/live/role-calibration/curator-digest-fd8efa441c80-r1.json test/goldens/live/role-calibration/curator-digest-fd8efa441c80-r2.json > $O/verdict.log 2>&1
echo "verdict rc=$?" >> $O/runs.rc
curl -s -m 5 http://127.0.0.1:18080/metrics | grep -v '^#' > $O/metrics-after.txt
node scripts/debug/st-lanes.mts run 3 -- scripts/debug/so-run-header.mts diff /c/dev/so-lanes/3/debug/run-header-v25-09-sp8-w4.json > $O/header-diff.log 2>&1
echo "diff rc=$?" >> $O/runs.rc

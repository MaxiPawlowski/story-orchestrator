#!/usr/bin/env bash
# usage: c1-run.sh <outdir> <n>
cd /c/dev/SillyTavern-MainBranch/public/scripts/extensions/third-party/story-orchestrator
O="$1"; N="$2"; mkdir -p "$O"
curl -s -m 5 http://127.0.0.1:18080/metrics | grep -v '^#' > "$O/run-$N.metrics-before.txt"
node scripts/debug/st-lanes.mts run 1 -- scripts/debug/st-navigation.mts open-group 1759606632088 > "$O/run-$N.open.log" 2>&1
node scripts/debug/st-lanes.mts run 1 -- scripts/debug/st-eval.mts --file test/scenarios/live-v25-c1/setup.js > "$O/run-$N.setup.log" 2>&1
node scripts/debug/st-lanes.mts run 1 -- scripts/debug/st-eval.mts --file test/scenarios/live-v25-c1/switch-populated.js > "$O/run-$N.eval.log" 2>&1
echo "eval rc=$?"
curl -s -m 5 http://127.0.0.1:18080/metrics | grep -v '^#' > "$O/run-$N.metrics-after.txt"

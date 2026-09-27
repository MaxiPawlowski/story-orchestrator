#!/usr/bin/env bash
# usage: item.sh <outdir> <label> <batch args...>
cd /c/dev/SillyTavern-MainBranch/public/scripts/extensions/third-party/story-orchestrator
O="$1"; L="$2"; shift 2; mkdir -p "$O"
curl -s -m 5 http://127.0.0.1:18080/metrics | grep -v '^#' > "$O/metrics-before.txt"
node scripts/debug/st-lanes.mts run 1 -- scripts/debug/so-run-header.mts capture --label "$L" > "$O/header-capture.log" 2>&1
cp "/c/dev/so-lanes/1/debug/run-header-$L.json" "$O/header-before.json"
start=$(date +%s)
node scripts/debug/st-lanes.mts batch --lanes 1 "$@" > "$O/batch.log" 2>&1
code=$?
echo "batch rc=$code secs=$(( $(date +%s) - start ))" | tee "$O/batch.rc"
curl -s -m 5 http://127.0.0.1:18080/metrics | grep -v '^#' > "$O/metrics-after.txt"
node scripts/debug/st-lanes.mts run 1 -- scripts/debug/so-run-header.mts diff "/c/dev/so-lanes/1/debug/run-header-$L.json" > "$O/header-diff.log" 2>&1
echo "diff rc=$?" >> "$O/batch.rc"

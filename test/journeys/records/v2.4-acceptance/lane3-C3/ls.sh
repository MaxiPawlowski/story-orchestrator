#!/usr/bin/env bash
cd /c/dev/SillyTavern-MainBranch/public/scripts/extensions/third-party/story-orchestrator
L="node scripts/debug/st-lanes.mts run 3 --"
LS=test/journeys/records/v2.4-acceptance/live-suite
mkdir -p $LS
B=/c/dev/so-lanes/3/c3/live-golden-backup; mkdir -p $B; cp test/goldens/live/*.response.txt $B/
$L scripts/debug/so-run-header.mts capture --label v24-acc-ls-batch-start --out $LS/header-batch-start.json > $LS/header-batch-capture.log 2>&1
for n in 1 2; do R=$LS/run$n; mkdir -p $R/responses
  began=$(date -u +%FT%TZ)
  bash /c/dev/so-lanes/3/c3/prep.sh $R/prep.log; pc=$?
  $L scripts/debug/so-run-header.mts capture --label v24-acc-ls-run$n-start --out $R/header-start.json > $R/header-capture.log 2>&1
  marker=$(mktemp); sleep 1
  timeout 5400 $L scripts/debug/so-live-suite.mts run --min 0.9 --min-tier facts=0.68,rejected=0.9 --expect-count 22 --record > $R/so-live-suite.log 2>&1; code=$?
  rep=$(find /c/dev/so-lanes/3/debug -maxdepth 1 -newer "$marker" -name '*so-live-suite-report*.json' | sort | tail -1); [ -n "$rep" ] && cp "$rep" $R/so-live-suite-report.json
  rm -f $marker
  cp test/goldens/live/*.response.txt $R/responses/
  $L scripts/debug/so-run-header.mts diff $R/header-start.json --allow build.head --label v24-acc-ls-run$n-end > $R/header-diff.log 2>&1; dcode=$?
  blocking=$(grep -m1 '"blocking"' $R/header-diff.log | tr -dc '0-9')
  echo "{\"row\":\"LS\",\"run\":$n,\"prep\":$pc,\"exit\":$code,\"headerDiffExit\":$dcode,\"blocking\":\"$blocking\",\"began\":\"$began\",\"ended\":\"$(date -u +%FT%TZ)\"}" | tee -a $LS/runs.jsonl
done
cp $B/*.response.txt test/goldens/live/
$L scripts/debug/so-run-header.mts diff $LS/header-batch-start.json --allow build.head --label v24-acc-ls-batch-end > $LS/header-batch-diff.log 2>&1; echo "LS DONE batchdiff=$?"

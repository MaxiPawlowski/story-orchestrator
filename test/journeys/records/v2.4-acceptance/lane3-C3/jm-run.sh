#!/usr/bin/env bash
# usage: jm-run.sh <use> <arm on|off> <n> <check> <judge-uses> [warden-mode]
cd /c/dev/SillyTavern-MainBranch/public/scripts/extensions/third-party/story-orchestrator
use=$1; arm=$2; n=$3; check=$4; uses=$5; wmode=${6:-}
L="node scripts/debug/st-lanes.mts run 3 --"
R=test/journeys/records/v2.4-acceptance/judge/$use/$arm/run$n
mkdir -p $R
began=$(date -u +%FT%TZ)
bash /c/dev/so-lanes/3/c3/prep.sh $R/prep.log; pc=$?
if [ $pc -ne 0 ]; then echo "{\"use\":\"$use\",\"arm\":\"$arm\",\"run\":$n,\"prepFailed\":$pc}" >> test/journeys/records/v2.4-acceptance/judge/runs.jsonl; echo "PREP FAILED $pc"; exit $pc; fi
$L scripts/debug/st-eval.mts --file /c/dev/so-lanes/3/c3/privacy-arm.js > $R/privacy-arm.log 2>&1
$L scripts/debug/so-run-header.mts capture --label v24-acc-jm-$use-$arm-run$n-start --out $R/header-start.json > $R/header-capture.log 2>&1
sha256sum test/journeys/j8-stagecraft.journey.json > $R/fixture.sha256
cp test/journeys/j8-stagecraft.journey.json $R/j8-stagecraft.journey.as-run.json
marker=$(mktemp); sleep 1
args="--judge-uses $uses"; [ -n "$wmode" ] && args="$args --warden-mode $wmode"
timeout 3600 $L scripts/debug/so-journey.mts run J8 --only $check --strict --group 1759606632088 $args > $R/journey.log 2>&1
code=$?
$L scripts/debug/st-eval.mts --file /c/dev/so-lanes/3/c3/privacy-read.js > $R/privacy-capture.json 2>&1
$L scripts/debug/so-run-header.mts diff $R/header-start.json --allow build.head --label v24-acc-jm-$use-$arm-run$n-end > $R/header-diff.log 2>&1
dcode=$?
rec=$(find /c/dev/so-lanes/3/debug -maxdepth 1 -newer "$marker" -name '*_journey-J8.json' | sort | tail -1)
[ -n "$rec" ] && cp "$rec" $R/record.json
cp /c/dev/so-lanes/3/debug/journey-J8.md $R/journey-J8.md 2>/dev/null
rm -f "$marker"
ended=$(date -u +%FT%TZ)
blocking=$(grep -m1 '"blocking"' $R/header-diff.log | tr -dc '0-9')
summary=$(grep -E "^(automated|cleanup|first try)" $R/journey.log | tr '\n' ' ' | sed 's/"/\\"/g' | cut -c1-400)
calls=$(grep -o '"count": [0-9]*' $R/privacy-capture.json | head -1 | tr -dc '0-9')
echo "{\"use\":\"$use\",\"arm\":\"$arm\",\"run\":$n,\"check\":\"$check\",\"judgeUses\":\"$uses\",\"wardenMode\":\"$wmode\",\"exit\":$code,\"headerDiffExit\":$dcode,\"blocking\":\"$blocking\",\"pluginBodies\":\"$calls\",\"began\":\"$began\",\"ended\":\"$ended\",\"summary\":\"$summary\"}" | tee -a test/journeys/records/v2.4-acceptance/judge/runs.jsonl

#!/usr/bin/env bash
# usage: pf-scen.sh <row> <fixture-basename-without-.json> <runN>
set -u
cd "C:/dev/SillyTavern-MainBranch/public/scripts/extensions/third-party/story-orchestrator"
ROW="$1"; FX="$2"; N="$3"
G=1759606632088
R="test/journeys/records/v2.4-postfreeze/ca25e4a632ed/$ROW"
mkdir -p "$R"
L="node scripts/debug/st-lanes.mts run 1 --"
DBG=/c/dev/so-lanes/1/debug
TAG="$FX-run$N"
LOG="$R/$TAG.log"
began=$(date -u +%FT%TZ)
marker=$(mktemp); sleep 1
echo "== $TAG start $began" > "$LOG"
timeout 120 $L scripts/debug/st-navigation.mts open-group $G > "$R/$TAG-open-group.log" 2>&1
nav=$?
echo "open-group exit=$nav" >> "$LOG"
if [ $nav -ne 0 ]; then echo "OPEN-GROUP FAILED" >> "$LOG"; echo "DONE $TAG OPEN-GROUP FAILED"; exit 90; fi
timeout 300 $L scripts/debug/so-run-header.mts capture --label "pf-$TAG-start" --out "$R/header-$TAG-start.json" > "$R/header-$TAG-capture.log" 2>&1
hc=$?
served=$(python -c "import json;print(json.load(open('$R/header-$TAG-start.json'))['bundle']['served']['sha256'][:12])" 2>/dev/null)
echo "header capture exit=$hc served=$served" >> "$LOG"
if [ "$served" != "ca25e4a632ed" ]; then echo "BUNDLE MISMATCH $served" >> "$LOG"; echo "DONE $TAG BUNDLE MISMATCH $served"; exit 91; fi
timeout 3600 $L scripts/debug/so-scenario.mts run "test/scenarios/$FX.json" --sandbox --group $G >> "$LOG" 2>&1
code=$?
echo "scenario exit=$code $(date -u +%FT%TZ)" >> "$LOG"
timeout 300 $L scripts/debug/so-run-header.mts diff "$R/header-$TAG-start.json" --allow build.head > "$R/header-$TAG-diff.log" 2>&1
dcode=$?
blocking=$(python -c "import json,re,sys;t=open('$R/header-$TAG-diff.log').read();i=t.find('{');d=json.loads(t[i:t.rfind('}')+1]);print(d.get('blocking'))" 2>/dev/null)
echo "header diff exit=$dcode blocking=$blocking" >> "$LOG"
for f in $(find $DBG -maxdepth 1 -newer "$marker" -name '*so-scenario-*.json'); do cp "$f" "$R/$TAG-$(basename $f)"; done
rm -f "$marker"
ended=$(date -u +%FT%TZ)
echo "{\"row\":\"$ROW\",\"fixture\":\"test/scenarios/$FX.json\",\"run\":$N,\"code\":$code,\"headerCapture\":$hc,\"served\":\"$served\",\"headerDiffCode\":$dcode,\"blocking\":${blocking:-null},\"began\":\"$began\",\"ended\":\"$ended\"}" >> "$R/runs.jsonl"
echo "DONE $TAG scenario=$code diff=$dcode blocking=$blocking"

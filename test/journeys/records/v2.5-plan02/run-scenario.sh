#!/usr/bin/env bash
# usage: run-scenario.sh <row> <fixture-path-relative-to-test/scenarios-without-.json> <runN>
set -u
cd "C:/dev/SillyTavern-MainBranch/public/scripts/extensions/third-party/story-orchestrator"
ROW="$1"; FX="$2"; N="$3"
G=1759606632088
EXPECT=0f4332fac075
R="test/journeys/records/v2.5-plan02/$ROW"
mkdir -p "$R"
L="node scripts/debug/st-lanes.mts run 2 --"
DBG=/c/dev/so-lanes/2/debug
TAG="$(basename $FX)-run$N"
LOG="$R/$TAG.log"
sha=$(sha256sum "test/scenarios/$FX.json" | cut -d' ' -f1)
began=$(date -u +%FT%TZ)
marker=$(mktemp); sleep 1
echo "== $TAG start $began fixtureSha256=$sha" > "$LOG"
if [ -n "${RELOAD:-}" ]; then timeout 300 $L scripts/debug/st-session.mts reload > "$R/$TAG-reload.log" 2>&1; echo "reload exit=$?" >> "$LOG"; timeout 120 $L scripts/debug/st-navigation.mts open-group $G > "$R/$TAG-open-group-pre.log" 2>&1; MSYS_NO_PATHCONV=1 timeout 120 $L scripts/debug/st-actions.mts slash "/profile Artemis RunPod RP" > "$R/$TAG-profile.log" 2>&1; echo "profile exit=$?" >> "$LOG"; fi
timeout 120 $L scripts/debug/st-navigation.mts open-group $G > "$R/$TAG-open-group.log" 2>&1
nav=$?
echo "open-group exit=$nav" >> "$LOG"
if [ $nav -ne 0 ]; then echo "OPEN-GROUP FAILED" >> "$LOG"; echo "DONE $TAG OPEN-GROUP FAILED"; exit 90; fi
timeout 300 $L scripts/debug/so-run-header.mts capture --label "p02-$TAG-start" --out "$R/header-$TAG-start.json" > "$R/header-$TAG-capture.log" 2>&1
hc=$?
served=$(python -c "import json;print(json.load(open('$R/header-$TAG-start.json'))['bundle']['served']['sha256'][:12])" 2>/dev/null)
echo "header capture exit=$hc served=$served" >> "$LOG"
if [ "$served" != "$EXPECT" ]; then echo "BUNDLE MISMATCH $served" >> "$LOG"; echo "DONE $TAG BUNDLE MISMATCH $served"; exit 91; fi
timeout 3600 $L scripts/debug/so-scenario.mts run "test/scenarios/$FX.json" --sandbox --group $G >> "$LOG" 2>&1
code=$?
echo "scenario exit=$code $(date -u +%FT%TZ)" >> "$LOG"
if [ -n "${ASSET_MARKER:-}" ]; then timeout 300 $L scripts/debug/so-assets.mts remove --marker "$ASSET_MARKER" > "$R/$TAG-assets-remove.log" 2>&1; echo "assets remove exit=$?" >> "$LOG"; fi
timeout 300 $L scripts/debug/so-run-header.mts diff "$R/header-$TAG-start.json" --allow build.head > "$R/header-$TAG-diff.log" 2>&1
dcode=$?
blocking=$(python -c "import json;t=open('$R/header-$TAG-diff.log').read();i=t.find('{');d=json.loads(t[i:t.rfind('}')+1]);print(d.get('blocking'))" 2>/dev/null)
echo "header diff exit=$dcode blocking=$blocking" >> "$LOG"
for f in $(find $DBG -maxdepth 1 -newer "$marker" -name '*so-scenario-*.json'); do cp "$f" "$R/$TAG-$(basename $f)"; done
rm -f "$marker"
ended=$(date -u +%FT%TZ)
echo "{\"row\":\"$ROW\",\"fixture\":\"test/scenarios/$FX.json\",\"sha256\":\"$sha\",\"run\":$N,\"code\":$code,\"headerCapture\":$hc,\"served\":\"$served\",\"headerDiffCode\":$dcode,\"blocking\":${blocking:-null},\"began\":\"$began\",\"ended\":\"$ended\"}" >> "$R/runs.jsonl"
echo "DONE $TAG scenario=$code diff=$dcode blocking=$blocking"

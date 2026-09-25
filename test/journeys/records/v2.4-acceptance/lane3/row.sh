#!/usr/bin/env bash
# usage: row.sh <row> <fixture> <label> [extra so-scenario args...]
set -u
cd "C:/dev/SillyTavern-MainBranch/public/scripts/extensions/third-party/story-orchestrator"
ROW="$1"; FIX="$2"; LABEL="$3"; shift 3
G=1759606632088
R="test/journeys/records/v2.4-acceptance/$ROW"
mkdir -p "$R"
L="node scripts/debug/st-lanes.mts run 3 --"
LOG="$R/$LABEL.log"
began=$(date -u +%FT%TZ)
marker=$(mktemp); touch "$marker"; sleep 1
echo "== $ROW $LABEL $FIX start $began" > "$LOG"
timeout 120 $L scripts/debug/st-navigation.mts open-group $G >> "$LOG" 2>&1
nav=$?
echo "open-group exit=$nav" >> "$LOG"
if [ $nav -ne 0 ]; then echo "OPEN-GROUP FAILED" | tee -a "$LOG"; exit 90; fi
timeout 300 $L scripts/debug/so-run-header.mts capture --label "v24-acc-$LABEL-start" --out "$R/header-$LABEL-start.json" > "$R/header-$LABEL-capture.log" 2>&1
hc=$?
timeout 5400 $L scripts/debug/so-scenario.mts run "$FIX" --sandbox --group $G "$@" >> "$LOG" 2>&1
code=$?
ended=$(date -u +%FT%TZ)
echo "scenario exit=$code $ended" >> "$LOG"
if [ -n "${POST_MARKER:-}" ]; then for m in $POST_MARKER; do timeout 300 $L scripts/debug/so-assets.mts remove --marker "$m" > "$R/$LABEL-assets-$m.log" 2>&1; echo "so-assets remove --marker $m exit=$?" >> "$LOG"; done; fi
timeout 300 $L scripts/debug/so-run-header.mts diff "$R/header-$LABEL-start.json" ${ALLOW:+--allow $ALLOW} > "$R/header-$LABEL-diff.log" 2>&1
dcode=$?
blocking=$(node -e "const s=require('fs').readFileSync('$R/header-$LABEL-diff.log','utf8'); const m=s.match(/\"blocking\": (\d+)/); console.log(m?m[1]:'?')")
for f in $(find /c/dev/so-lanes/3/debug -maxdepth 1 -newer "$marker" -name '*so-scenario*.json'); do cp "$f" "$R/$LABEL-$(basename "$f" | sed 's/^[0-9TZ:-]*_//')"; done
rm -f "$marker"
echo "{\"row\":\"$ROW\",\"fixture\":\"$FIX\",\"label\":\"$LABEL\",\"code\":$code,\"headerCapture\":$hc,\"headerDiffCode\":$dcode,\"blocking\":\"$blocking\",\"began\":\"$began\",\"ended\":\"$ended\"}" >> "$R/runs.jsonl"
echo "DONE $ROW $LABEL scenario=$code diff=$dcode blocking=$blocking"

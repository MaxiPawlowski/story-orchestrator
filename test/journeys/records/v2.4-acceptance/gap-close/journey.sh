#!/usr/bin/env bash
# usage: journey.sh <lane> <rundir (relative to v2.4-acceptance/)> <Jn> [extra so-journey args...]
# env: ALLOW (comma list for so-run-header diff --allow)
set -u
cd "C:/dev/SillyTavern-MainBranch/public/scripts/extensions/third-party/story-orchestrator"
LANE="$1"; RUN="$2"; J="$3"; shift 3
G=1759606632088
CAND=65733265d3015e620e5f26221d4cbfdbce59541b49e356c69c13642f386f0cab
L="node scripts/debug/st-lanes.mts run $LANE --"
D="test/journeys/records/v2.4-acceptance/$RUN"
mkdir -p "$D"
jf=$(ls test/journeys/*.journey.json | xargs grep -l "\"id\": \"$J\"" | head -1)
cp "$jf" "$D/$(basename "$jf" .json).as-run.json"
sha256sum "$jf" > "$D/fixture.sha256"
echo "start $(date -u +%FT%TZ) lane $LANE args: $*" > "$D/journey.log"
timeout 120 $L scripts/debug/st-navigation.mts open-group $G > "$D/open-group.log" 2>&1 || { echo "OPEN-GROUP FAILED" | tee -a "$D/journey.log"; exit 90; }
timeout 300 $L scripts/debug/so-run-header.mts capture --label "v24-acc-$J-$(basename "$RUN")-start" --out "$D/header-start.json" > "$D/header-capture.log" 2>&1
served=$(node -e "try{console.log(require('./$D/header-start.json').bundle.served.sha256)}catch(e){console.log('unreadable')}")
echo "bundle.served=$served" >> "$D/journey.log"
if [ "$served" != "$CAND" ]; then echo "SERVED BUNDLE IS NOT THE CANDIDATE ($served)" | tee -a "$D/journey.log"; exit 91; fi
export ST_URL=http://127.0.0.1:810$LANE/ ST_DEBUG_CDP_PORT=930$LANE SO_DEBUG_DIR="C:\\dev\\so-lanes\\$LANE\\debug" SO_LANE=$LANE
node scripts/debug/so-journal.mts follow --out "$D/journal-follow.jsonl" > "$D/journal-follow.log" 2>&1 &
FPID=$!
unset ST_URL ST_DEBUG_CDP_PORT SO_DEBUG_DIR SO_LANE
timeout 10800 $L scripts/debug/so-journey.mts run $J --strict --group $G "$@" >> "$D/journey.log" 2>&1
code=$?
echo "journey exit=$code $(date -u +%FT%TZ)" >> "$D/journey.log"
kill $FPID 2>/dev/null
sleep 2
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"name='node.exe'\" | Where-Object { \$_.CommandLine -match 'so-journal.mts follow --out $D' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force }" 2>/dev/null
timeout 300 $L scripts/debug/so-run-header.mts diff "$D/header-start.json" ${ALLOW:+--allow $ALLOW} > "$D/header-diff.log" 2>&1
hd=$?
echo "header diff exit=$hd" >> "$D/journey.log"
rec=$(grep -o "Wrote JSON: .*journey-$J.json" "$D/journey.log" | tail -1 | sed 's/Wrote JSON: //')
if [ -n "$rec" ]; then cp "$(cygpath -u "$rec")" "$D/record.json"; fi
cp "/c/dev/so-lanes/$LANE/debug/journey-$J.md" "$D/" 2>/dev/null
blocking=$(node -e "const s=require('fs').readFileSync('$D/header-diff.log','utf8'); const m=s.match(/\"blocking\": (\d+)/); console.log(m?m[1]:'?')")
echo "DONE $RUN $J journey=$code headerdiff=$hd blocking=$blocking record=$rec"

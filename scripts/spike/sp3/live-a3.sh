#!/usr/bin/env bash
set -u
cd "$(dirname "$0")/../../.."
LANE="$1"; J="$2"; RUN="$3"
G=1759606632088
L="node scripts/debug/st-lanes.mts run $LANE --"
BASE="test/journeys/records/v2.5-plan09/sp3"
mkdir -p "$BASE/.pending"
timeout 120 $L scripts/debug/st-navigation.mts open-group $G > "$BASE/.pending/open-group.log" 2>&1 || { echo "OPEN-GROUP FAILED"; exit 90; }
timeout 300 $L scripts/debug/so-run-header.mts capture --label "v25-09-sp3-$J-$RUN-start" --out "$BASE/.pending/header-start.json" > "$BASE/.pending/header-capture.log" 2>&1
served=$(node -e "try{console.log(require('./$BASE/.pending/header-start.json').bundle.served.sha256.slice(0,12))}catch(e){console.log('unreadable')}")
[ "$served" = "unreadable" ] && { echo "RUN HEADER HAS NO SERVED BUNDLE"; exit 91; }
D="$BASE/live-$served/$J-$RUN"
mkdir -p "$D"
mv "$BASE/.pending/"* "$D/"
jf=$(ls test/journeys/*.journey.json | xargs grep -l "\"id\": \"$J\"" | head -1)
cp "$jf" "$D/$(basename "$jf" .json).as-run.json"
sha256sum "$jf" > "$D/fixture.sha256"
export ST_URL=http://127.0.0.1:810$LANE/ ST_DEBUG_CDP_PORT=930$LANE SO_DEBUG_DIR="C:\\dev\\so-lanes\\$LANE\\debug" SO_LANE=$LANE
node scripts/debug/so-journal.mts follow --out "$D/journal-follow.jsonl" > "$D/journal-follow.log" 2>&1 &
FPID=$!
unset ST_URL ST_DEBUG_CDP_PORT SO_DEBUG_DIR SO_LANE
timeout 10800 $L scripts/debug/so-journey.mts run $J --strict --group $G > "$D/journey.log" 2>&1
code=$?
echo "journey exit=$code" >> "$D/journey.log"
kill $FPID 2>/dev/null
timeout 300 $L scripts/debug/so-run-header.mts diff "$D/header-start.json" > "$D/header-diff.log" 2>&1
echo "header diff exit=$?" >> "$D/journey.log"
echo "DONE $D journey=$code"

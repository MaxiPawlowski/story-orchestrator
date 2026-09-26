#!/bin/bash
# usage: run.sh <J3|J7> <k>
cd /c/dev/SillyTavern-MainBranch/public/scripts/extensions/third-party/story-orchestrator
J=$1; K=$2; D=.debug/v25-07-a3; R=$D/$J-run$K
mkdir -p $R
rm -f $R/stop
sha256sum test/journeys/j3-player-session.journey.json test/journeys/j7-long-haul.journey.json examples/sun-ruins/quest-for-the-sun-ruins.json > $R/fixture-sha.txt
PRE=$(node scripts/debug/st-lanes.mts run 3 -- scripts/debug/st-eval.mts "return ctx.chatId" 2>/dev/null | python -c "import sys,json,re;t=sys.stdin.read();m=re.search(r'\"value\": \"([^\"]*)\"',t);print(m.group(1) if m else 'none')")
echo "pre-chat $PRE" > $R/meta.txt
node scripts/debug/st-lanes.mts run 3 -- $D/poll-history.mts $R/engine-history-$J.json $R/stop $R/poll.log "$PRE" &
PP=$!
sleep 3
date -u +%FT%TZ >> $R/meta.txt
node scripts/debug/st-lanes.mts run 3 -- scripts/debug/so-journey.mts run $J --strict --group 1759606632088 > $R/journey.out 2>&1
echo "exit $?" >> $R/meta.txt
date -u +%FT%TZ >> $R/meta.txt
touch $R/stop
wait $PP
echo done >> $R/meta.txt

#!/usr/bin/env bash
# C8 post-freeze rows on lane 2, each fixture twice back to back (bundle 0f4332fac075).
cd "C:/dev/SillyTavern-MainBranch/public/scripts/extensions/third-party/story-orchestrator"
RUN=test/journeys/records/v2.5-plan02/run-scenario.sh
L="node scripts/debug/st-lanes.mts run 2 --"
POST=test/journeys/records/v2.4-postfreeze/ca25e4a632ed/A2/post-nudge-read.js
row() {
  local r="$1" fx="$2"
  for n in 1 2; do
    bash $RUN "C8/$r" "$fx" $n
    if [ "$r" = "A2" ]; then $L scripts/debug/st-eval.mts "$(cat $POST)" > "test/journeys/records/v2.5-plan02/C8/$r/$fx-run$n-post-nudge.log" 2>&1; fi
    if [ "${r#AE04}" != "$r" ]; then $L scripts/debug/so-assets.mts remove --marker SO-PF-AE04 > "test/journeys/records/v2.5-plan02/C8/$r/$fx-run$n-assets-remove.log" 2>&1; fi
  done
}
row A1 v24-acc-A-reload-blocks
row A1 v24-acc-A-reload-blocks-control
row A1 v24-acc-A-extprompt-cache
row I7 v24-acc-I7
row A2 v24-acc-I3
row A2 v24-pf-A2-nudge-leftover
row AE-03 live-v24-08-fates-jump
row AE-01 v24-pf-curator-switch
row AE-01 v24-pf-curator-same-chat
row AE04-L1 v24-pf-AE04-lore-cancel
row AE04-S1 v24-pf-AE04-scene-refused
echo C8-ALL-DONE

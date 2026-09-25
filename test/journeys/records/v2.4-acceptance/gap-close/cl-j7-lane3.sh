#!/usr/bin/env bash
# CL source: ONE judge-on J7 run (plan 09 CL row), every judge use the candidate BUILT (src/judge/settings.ts BUILT_JUDGE_USES @4ebe1db) plus the warden, warden auto.
set -u
cd "C:/dev/SillyTavern-MainBranch/public/scripts/extensions/third-party/story-orchestrator"
USES=director,memoryVerify,memoryPairs,sceneTrigger,sceneTracker,lookahead,loreSelect,typedExtraction,stallCheck,expansionCritic,expansionLookahead,curatorFilter,agencyCheck,houseRules,warden
export ALLOW=build.head
bash .debug/acc-gaps/journey.sh 3 cost/J7-judge-on J7 --judge-uses $USES --warden-mode auto

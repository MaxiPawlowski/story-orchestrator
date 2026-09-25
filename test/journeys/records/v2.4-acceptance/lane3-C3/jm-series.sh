#!/usr/bin/env bash
cd /c/dev/SillyTavern-MainBranch/public/scripts/extensions/third-party/story-orchestrator
L="node scripts/debug/st-lanes.mts run 3 --"
J=test/journeys/records/v2.4-acceptance/judge
mkdir -p $J/batch
$L scripts/debug/so-run-header.mts capture --label v24-acc-jm-batch-start --out $J/batch/header-start.json > $J/batch/header-capture.log 2>&1
S=/c/dev/so-lanes/3/c3/jm-run.sh
bash $S agencyCheck on 1 J8.10 agencyCheck auto
bash $S agencyCheck on 2 J8.10 agencyCheck auto
bash $S agencyCheck off 1 J8.10 off
bash $S agencyCheck off 2 J8.10 off
bash $S houseRules on 1 J8.12 houseRules auto
bash $S houseRules on 2 J8.12 houseRules auto
bash $S houseRules off 1 J8.12 off
bash $S houseRules off 2 J8.12 off
bash $S warden on 1 J8.5 warden auto
bash $S warden on 2 J8.5 warden auto
bash $S warden off 1 J8.5 off
bash $S warden off 2 J8.5 off
$L scripts/debug/so-run-header.mts diff $J/batch/header-start.json --allow build.head --label v24-acc-jm-batch-end > $J/batch/header-diff.log 2>&1
echo "JM SERIES DONE diff=$?"

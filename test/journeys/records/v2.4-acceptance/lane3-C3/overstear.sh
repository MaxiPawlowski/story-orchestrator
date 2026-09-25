#!/usr/bin/env bash
cd /c/dev/SillyTavern-MainBranch/public/scripts/extensions/third-party/story-orchestrator
L="node scripts/debug/st-lanes.mts run 3 --"
J=test/journeys/records/v2.4-acceptance/judge
mkdir -p $J/rescore-batch
bash /c/dev/so-lanes/3/c3/prep.sh $J/rescore-batch/prep.log; echo prep=$?
$L scripts/debug/so-run-header.mts capture --label v24-acc-jm-rescore-start --out $J/rescore-batch/header-start.json > $J/rescore-batch/header-capture.log 2>&1
newest() { ls -t /c/dev/so-lanes/3/debug/*_$1*.json | head -1; }
for spec in "agencyCheck agency agency" "houseRules house-rules house-rule" "warden continuity continuity"; do set -- $spec; use=$1; ruse=$2; fam=$3
  O=$J/$use/overstear; mkdir -p $O
  facts=""; [ $use = warden ] && { cp test/journeys/records/v2.4-plan07/part1-live-7f1787158bf8/rescore-facts-seed.json $O/rescore-facts-seed.json; facts="--facts $O/rescore-facts-seed.json"; }
  # pooled: every on and off run
  $L scripts/debug/so-judge.mts rescore --use $ruse --records $J/$use/on/run1/record.json,$J/$use/on/run2/record.json,$J/$use/off/run1/record.json,$J/$use/off/run2/record.json $facts > $O/rescore-pooled.log 2>&1; echo "$use pooled rescore exit=$?"
  cp "$(newest so-judge-rescore-$ruse)" $O/rescore-pooled.json
  for n in 1 2; do
    $L scripts/debug/so-judge.mts rescore --use $ruse --records $J/$use/on/run$n/record.json,$J/$use/off/run$n/record.json $facts > $O/rescore-on-run$n.log 2>&1; echo "$use rescore on-run$n exit=$?"
    cp "$(newest so-judge-rescore-$ruse)" $O/rescore-on-run$n.json
    $L scripts/debug/so-lore-probe.mts diff $J/$use/off/run$n/record.json $J/$use/on/run$n/record.json --rescore $O/rescore-on-run$n.json --family $fam > $O/lore-probe-diff-run$n.log 2>&1; echo "$use diff run$n exit=$?"
    cp "$(newest so-lore-probe-diff)" $O/lore-probe-diff-run$n.json 2>/dev/null
  done
done
$L scripts/debug/so-run-header.mts diff $J/rescore-batch/header-start.json --allow build.head --label v24-acc-jm-rescore-end > $J/rescore-batch/header-diff.log 2>&1; echo "rescore batch diff=$?"

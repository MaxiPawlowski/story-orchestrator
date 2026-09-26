#!/usr/bin/env bash
# usage: ae04-drive.sh <row> <n> <scenario path>   (lane 3; reload + pinned group + profile, header around the run, fixture sha256, marker cleanup)
cd /c/dev/SillyTavern-MainBranch/public/scripts/extensions/third-party/story-orchestrator
row=$1; n=$2; item=$3
REC=test/journeys/records/v2.4-postfreeze/ca25e4a632ed/$row
L="node scripts/debug/st-lanes.mts run 3 --"
base=$(basename "$item" .json); tag=$base-run$n; P=$REC/$tag-
mkdir -p $REC
sha=$(sha256sum "$item" | cut -d' ' -f1)
start=$(date -u +%Y-%m-%dT%H:%M:%SZ)
$L scripts/debug/st-session.mts reload > ${P}reload.log 2>&1
$L scripts/debug/st-navigation.mts open-group 1759606632088 > ${P}open-group.log 2>&1 || { echo "$row $tag STOP open-group failed" | tee -a $REC/runs.txt; exit 4; }
MSYS_NO_PATHCONV=1 $L scripts/debug/st-actions.mts slash "/profile Artemis RunPod RP" > ${P}profile.log 2>&1
$L scripts/debug/so-run-header.mts capture --label pf-$row-$tag-start --out ${P}header-start.json > ${P}header-capture.log 2>&1
served=$(node -e "try{console.log(require('./${P}header-start.json').bundle.served.sha256.slice(0,12))}catch(e){console.log('none')}")
if [ "$served" != "ca25e4a632ed" ]; then echo "$row $tag STOP served=$served" | tee -a $REC/runs.txt; exit 3; fi
( while true; do echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ)"; curl -s -m 5 http://127.0.0.1:18080/metrics | grep -v '^#'; sleep 30; done ) > ${P}metrics.log 2>&1 &
mpid=$!
$L scripts/debug/so-scenario.mts run "$item" --sandbox --group 1759606632088 > ${P}run.log 2>&1; code=$?
kill $mpid 2>/dev/null
for f in $(ls -t /c/dev/so-lanes/3/debug/*_so-scenario-result.json /c/dev/so-lanes/3/debug/*_so-scenario-failure.json 2>/dev/null); do
  fs=$(basename $f | cut -c1-19); if [[ "$fs" > "$(echo $start | tr ':' '-' | cut -c1-19)" ]]; then k=$(echo $f | grep -o 'result\|failure'); cp $f ${P}$k.json; fi; done
$L scripts/debug/so-assets.mts remove --marker SO-PF-AE04 > ${P}assets-remove.log 2>&1; acode=$?
$L scripts/debug/st-eval.mts "const j=SillyTavern.getContext().extensionSettings['story-orchestrator'].settings.judge; return {enabled:j.enabled, uses:j.uses, chats: SillyTavern.getContext().groups.find(g=>g.id==='1759606632088').chats.filter(c=>c.startsWith('2026-09-25'))}" > ${P}post-judge.log 2>&1
$L scripts/debug/so-run-header.mts diff ${P}header-start.json --allow build.head --label pf-$row-$tag-end > ${P}header-diff.log 2>&1; dcode=$?
end=$(date -u +%Y-%m-%dT%H:%M:%SZ)
blk=$(grep -m1 '"blocking"' ${P}header-diff.log | tr -d ' ,')
echo "$row $tag code=$code diff=$dcode $blk assets=$acode served=$served sha256=$sha $start $end" | tee -a $REC/runs.txt

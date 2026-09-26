#!/usr/bin/env bash
# usage: pf-drive.sh <row> <n> <item>   item = scenario path | LS
cd /c/dev/SillyTavern-MainBranch/public/scripts/extensions/third-party/story-orchestrator
row=$1; n=$2; item=$3; shift 3
REC=test/journeys/records/v2.4-postfreeze/ca25e4a632ed/$row
L="node scripts/debug/st-lanes.mts run 3 --"
if [ "$item" = "LS" ]; then tag=run$n; D=$REC/$tag; else base=$(basename "$item" .json); tag=$base-run$n; D=$REC; fi
mkdir -p $D
P=$D/$( [ "$item" = "LS" ] && echo "" || echo "$tag-" )
start=$(date -u +%Y-%m-%dT%H:%M:%SZ)
$L scripts/debug/so-run-header.mts capture --label pf-$row-$tag-start --out ${P}header-start.json > ${P}header-capture.log 2>&1
served=$(node -e "try{console.log(require('./${P}header-start.json').bundle.served.sha256.slice(0,12))}catch(e){console.log('none')}")
if [ "$served" != "ca25e4a632ed" ]; then echo "$row $tag STOP served=$served" | tee -a $REC/runs.txt; exit 3; fi
( while true; do echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ)"; curl -s -m 5 http://127.0.0.1:18080/metrics | grep -v '^#'; sleep 30; done ) > ${P}metrics.log 2>&1 &
mpid=$!
case "$item" in
  LS) $L scripts/debug/so-live-suite.mts run --min 0.9 --min-tier facts=0.68,rejected=0.9 --expect-count 22 --record > ${P}so-live-suite.log 2>&1; code=$?
      mkdir -p $D/responses; cp test/goldens/live/extractor*.response.txt $D/responses/
      rep=$(ls -t /c/dev/so-lanes/3/debug/*_so-live-suite-report.json | head -1); cp "$rep" $D/so-live-suite-report.json
      git checkout -- test/goldens/live/ ;;
  *) $L scripts/debug/so-scenario.mts run "$item" --sandbox --group 1759606632088 > ${P}run.log 2>&1; code=$?
     for f in $(ls -t /c/dev/so-lanes/3/debug/*_so-scenario-result.json /c/dev/so-lanes/3/debug/*_so-scenario-failure.json 2>/dev/null); do
       fs=$(basename $f | cut -c1-19); if [[ "$fs" > "$(echo $start | tr ':' '-' | cut -c1-19)" ]]; then k=$(echo $f | grep -o 'result\|failure'); cp $f ${P}$k.json; fi; done ;;
esac
kill $mpid 2>/dev/null
$L scripts/debug/so-run-header.mts diff ${P}header-start.json --allow build.head --label pf-$row-$tag-end > ${P}header-diff.log 2>&1; dcode=$?
end=$(date -u +%Y-%m-%dT%H:%M:%SZ)
blk=$(grep -m1 '"blocking"' ${P}header-diff.log | tr -d ' ,')
echo "$row $tag code=$code diff=$dcode $blk served=$served $start $end" | tee -a $REC/runs.txt

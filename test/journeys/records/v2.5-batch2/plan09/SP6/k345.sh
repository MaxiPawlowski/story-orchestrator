#!/usr/bin/env bash
# SP6 K3/K4/K5: four arms, each x2 consecutive on lane 3 (release/control x judge on/off), then score.
cd /c/dev/SillyTavern-MainBranch/public/scripts/extensions/third-party/story-orchestrator
B=test/journeys/records/v2.5-batch2/plan09/SP6/K3-K5
L="node scripts/debug/st-lanes.mts run 3 --"
mkdir -p $B
arm() {
  local arm="$1" label="$2"; shift 2
  local O=$B/$label; mkdir -p $O
  $L scripts/debug/st-eval.mts "localStorage.setItem('so-sp6-arm','$arm'); return localStorage.getItem('so-sp6-arm')" > $O/arm.log 2>&1
  curl -s -m 5 http://127.0.0.1:18080/metrics | grep -v '^#' > $O/metrics-before.txt
  $L scripts/debug/so-run-header.mts capture --label $label > $O/header-capture.log 2>&1
  cp /c/dev/so-lanes/3/debug/run-header-$label.json $O/header-before.json
  for r in 1 2; do
    s=$(date +%s)
    $L scripts/debug/so-journey.mts run test/journeys/spikes/sp6-complications.journey.json --strict "$@" > $O/run$r.log 2>&1
    echo "run$r rc=$? secs=$(( $(date +%s) - s ))" >> $O/runs.rc
    rec=$(grep -oE "C:[^\"]*journey-SP6[^\"]*\.json|C:[^\"]*_journey-[^\"]*\.json" $O/run$r.log | tail -1)
    [ -n "$rec" ] && cp "$rec" $O/run$r-$(basename "$rec") 2>/dev/null
    $L scripts/debug/st-eval.mts "const g=rt.getGlobalSettings(); return {spikes:g.spikes.sp6Complications, judgeEnabled:g.judge?.enabled, uses:Object.entries(g.judge?.uses??{}).filter(([k,v])=>v).map(([k])=>k), warden:rt.getStagecraftState().settings}" > $O/after-run$r-settings.log 2>&1
  done
  curl -s -m 5 http://127.0.0.1:18080/metrics | grep -v '^#' > $O/metrics-after.txt
  $L scripts/debug/so-run-header.mts diff /c/dev/so-lanes/3/debug/run-header-$label.json > $O/header-diff.log 2>&1
  echo "diff rc=$?" >> $O/runs.rc
}
arm release sp6-release-on --judge-uses agencyCheck --warden-mode auto
arm control sp6-control-on --judge-uses agencyCheck --warden-mode auto
arm release sp6-release-off --judge-uses off
arm control sp6-control-off --judge-uses off
$L scripts/debug/st-eval.mts "return localStorage.getItem('so-sp6-records')" > $B/records.eval.log 2>&1
f=$(grep -oE "C:.*st-eval.json" $B/records.eval.log | tail -1)
python -c "import json,sys;v=json.load(open(sys.argv[1],encoding='utf-8'))['value'];open(sys.argv[2],'w',encoding='utf-8').write(v or '[]')" "$f" $B/sp6-records.json
node scripts/debug/so-sp6-score.mts $B/sp6-records.json > $B/score.log 2>&1
echo "score rc=$?" >> $B/score.log

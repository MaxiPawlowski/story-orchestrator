#!/usr/bin/env bash
# usage: item2.sh <outdir> <label> <batch args...>   (item.sh + copies summary, run logs, journey records)
cd /c/dev/SillyTavern-MainBranch/public/scripts/extensions/third-party/story-orchestrator
O="$1"; L="$2"; shift 2; mkdir -p "$O"
curl -s -m 5 http://127.0.0.1:18080/metrics | grep -v '^#' > "$O/metrics-before.txt"
node scripts/debug/st-lanes.mts run 1 -- scripts/debug/so-run-header.mts capture --label "$L" > "$O/header-capture.log" 2>&1
cp "/c/dev/so-lanes/1/debug/run-header-$L.json" "$O/header-before.json"
start=$(date +%s)
node scripts/debug/st-lanes.mts batch --lanes 1 "$@" > "$O/batch.log" 2>&1
code=$?
echo "batch rc=$code secs=$(( $(date +%s) - start ))" | tee "$O/batch.rc"
curl -s -m 5 http://127.0.0.1:18080/metrics | grep -v '^#' > "$O/metrics-after.txt"
node scripts/debug/st-lanes.mts run 1 -- scripts/debug/so-run-header.mts diff "/c/dev/so-lanes/1/debug/run-header-$L.json" > "$O/header-diff.log" 2>&1
echo "diff rc=$?" >> "$O/batch.rc"
python - "$O" <<'PY'
import json, re, shutil, sys, os
o = sys.argv[1]
log = open(os.path.join(o, 'batch.log'), encoding='utf-8', errors='replace').read()
m = re.search(r'"summary": "(.*?)"', log)
if not m: sys.exit(0)
path = m.group(1).replace('\\\\', '\\')
shutil.copy(path, os.path.join(o, 'batch-summary.json'))
s = json.load(open(path, encoding='utf-8'))
for r in s['results']:
    tag = f"run{r['run']}"
    if r.get('log') and os.path.exists(r['log']): shutil.copy(r['log'], os.path.join(o, f"{tag}.log"))
    rec = r.get('record')
    if rec and os.path.exists(rec):
        shutil.copy(rec, os.path.join(o, f"{tag}-{os.path.basename(rec)}"))
        md = os.path.join(os.path.dirname(rec), os.path.basename(rec).split('_')[-1].replace('.json', '.md'))
        if os.path.exists(md): shutil.copy(md, os.path.join(o, f"{tag}-{os.path.basename(md)}"))
PY

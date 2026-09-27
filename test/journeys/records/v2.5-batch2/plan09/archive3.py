import json, re, shutil, sys, os
o = sys.argv[1]
log = open(os.path.join(o, 'batch.log'), encoding='utf-8', errors='replace').read()
m = re.search(r'"summary": "(.*?)"', log)
if not m:
    print('no summary in batch.log')
    sys.exit(0)
path = m.group(1).replace('\\\\', '\\')
shutil.copy(path, os.path.join(o, 'batch-summary.json'))
s = json.load(open(path, encoding='utf-8'))
for r in s['results']:
    tag = f"run{r['run']}-{os.path.basename(str(r.get('item','x'))).replace('.json','')}"
    if r.get('log') and os.path.exists(r['log']):
        shutil.copy(r['log'], os.path.join(o, f"{tag}.log"))
    rec = r.get('record')
    if rec and os.path.exists(rec):
        shutil.copy(rec, os.path.join(o, f"{tag}-{os.path.basename(rec)}"))
        md = os.path.join(os.path.dirname(rec), os.path.basename(rec).split('_')[-1].replace('.json', '.md'))
        if os.path.exists(md):
            shutil.copy(md, os.path.join(o, f"{tag}-{os.path.basename(md)}"))
    print(tag, r.get('code'), r.get('ms'), r.get('automated',''), r.get('failures',''))

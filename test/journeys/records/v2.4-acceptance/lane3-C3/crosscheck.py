import json, io, glob, os
os.chdir(r'C:\dev\SillyTavern-MainBranch\public\scripts\extensions\third-party\story-orchestrator\test\journeys\records\v2.4-acceptance\judge')
out = []
for f in sorted(glob.glob('*/*/run*/record.json')):
    r = json.load(io.open(f, encoding='utf-8'))
    c = r['cleanup']
    d = os.path.dirname(f)
    s = io.open(os.path.join(d, 'privacy-capture.json'), encoding='utf-8').read()
    if '\nWrote JSON' in s:
        s = s[:s.rfind('\nWrote JSON')]
    v = json.loads(s)['value']
    keys = set()
    for row in v['rows'] or []:
        keys |= set(row['body']['state'].keys())
        keys |= set('q:' + q.split(':')[0] for q in row['body']['questions'])
        keys |= set('top:' + k for k in row['body'].keys())
    checks = [{k: x.get(k) for k in ('id', 'outcome', 'firstAttempt', 'attempts', 'retried')} for x in r['results'] if x.get('outcome') != 'skipped']
    row = {
        'run': d.replace('\\', '/'),
        'meterCalls': (c.get('judgeMeter') or {}).get('calls'),
        'meterIn': (c.get('judgeMeter') or {}).get('inputTokens'),
        'pluginBodies': v['count'],
        'ringCount': (c.get('judgeCalls') or {}).get('count'),
        'boundaries': c.get('boundaries'),
        'checks': checks,
        'stateKeys': sorted(keys),
        'partial': r.get('partial'),
        'tally': r.get('tally'),
        'cleanupClean': (c.get('chat') or {}).get('ok', None),
        'judgeRestore': c.get('judgeRestore'),
    }
    out.append(row)
    print(json.dumps(row))
json.dump(out, io.open('crosscheck.json', 'w', encoding='utf-8'), indent=1)

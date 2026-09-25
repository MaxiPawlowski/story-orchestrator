import json, io, glob, os
os.chdir(r'C:\dev\SillyTavern-MainBranch\public\scripts\extensions\third-party\story-orchestrator\test\journeys\records\v2.4-acceptance\judge')
for f in sorted(glob.glob('*/*/run*/record.json')):
    c = json.load(io.open(f, encoding='utf-8'))['cleanup']
    print(f.replace('\\', '/'), json.dumps({k: c.get(k) for k in ('chat', 'mirrorBooks', 'reapPrompts', 'stories', 'branchChats')})[:600])

import glob, os, math, re, sys

WIDTH = 120
files = ['src/runtime/runtimeManager.ts'] + sorted(f for f in glob.glob('src/runtime/coordinators/*.ts') if '.test.' not in f)

def effective(text):
    return sum(max(1, math.ceil(len(l.rstrip('\r')) / WIDTH)) for l in text.split('\n'))

def wrap_import(line):
    m = re.match(r'^(import(?: type)? )\{ (.*) \} (from "[^"]+";)\s*$', line.rstrip('\r'))
    if not m:
        return None
    names = [n.strip() for n in m.group(2).split(',') if n.strip()]
    out, cur = [m.group(1) + '{'], '  '
    for n in names:
        piece = n + ','
        if len(cur) + len(piece) + 1 > WIDTH and cur.strip():
            out.append(cur.rstrip())
            cur = '  '
        cur += piece + ' '
    if cur.strip():
        out.append(cur.rstrip())
    out.append('} ' + m.group(3))
    return out

apply = '--apply' in sys.argv
for p in files:
    raw = open(p, encoding='utf-8', newline='').read()
    crlf = '\r\n' in raw
    lines = raw.replace('\r\n', '\n').split('\n')
    before = (len(lines), effective('\n'.join(lines)))
    new, wrapped, i = [], 0, 0
    while i < len(lines):
        l = lines[i]
        if l.startswith('import') and '{' in l and '} from' not in l:
            j = i
            while '} from' not in lines[j]:
                j += 1
            joined = ' '.join(x.strip() for x in lines[i:j + 1]).replace('{ ', '{ ').replace(' ,', ',')
            joined = joined.replace('{', '{ ', 1).replace('{  ', '{ ')
            if any(len(x) > WIDTH for x in lines[i:j + 1]):
                w = wrap_import(joined)
                if w:
                    new.extend(w); wrapped += 1; i = j + 1; continue
            new.extend(lines[i:j + 1]); i = j + 1; continue
        w = wrap_import(l) if len(l) > WIDTH and l.startswith('import') else None
        if w:
            new.extend(w); wrapped += 1
        else:
            new.append(l)
        i += 1
    after = (len(new), effective('\n'.join(new)))
    print(os.path.basename(p), 'lines/effective before', before, 'after', after, 'imports wrapped', wrapped)
    if apply and wrapped:
        t = '\n'.join(new)
        open(p, 'w', encoding='utf-8', newline='').write(t.replace('\n', '\r\n') if crlf else t)

import json, re, glob, os, sys

root = sys.argv[1] if len(sys.argv) > 1 else "test/journeys/records/v2.4-acceptance"
runs = sys.argv[2:] if len(sys.argv) > 2 else ["J3/run1", "J3/run2", "J3/run3", "J3/run4", "J7/run1", "J7/run2", "J7/run3", "J7/seriesB-run1", "J7/seriesB-run2"]
line_re = re.compile(r"^MEMORY\s+(.*?)\btext=(.*)$")

def strings(node):
    if isinstance(node, str):
        yield node
    elif isinstance(node, dict):
        for v in node.values():
            yield from strings(v)
    elif isinstance(node, list):
        for v in node:
            yield from strings(v)

for run in runs:
    d = os.path.join(root, run)
    if not os.path.isdir(d):
        continue
    seen = []
    marks = 0
    for f in glob.glob(os.path.join(d, "**", "*.json*"), recursive=True):
        with open(f, encoding="utf-8") as fh:
            raw = fh.read()
        marks += raw.count('"contradicted"')
        docs = []
        if f.endswith(".jsonl"):
            for ln in raw.splitlines():
                try:
                    docs.append(json.loads(ln))
                except Exception:
                    pass
        else:
            try:
                docs.append(json.loads(raw))
            except Exception:
                pass
        for doc in docs:
            for s in strings(doc):
                if "MEMORY" not in s or "<type>" in s and s.count("MEMORY") == 1:
                    pass
                for ln in s.splitlines():
                    m = line_re.match(ln.strip())
                    if not m or "<" in m.group(1):
                        continue
                    t = m.group(2).strip().strip('"')
                    if t and t not in seen:
                        seen.append(t)
    print(f"== {run} rows={len(seen)} contradictedMarks={marks}")
    for i, t in enumerate(seen):
        print(f"  {i:02d} {t}")

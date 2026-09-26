import json, sys, collections
seen=set(); rows=collections.defaultdict(list)
for p in sys.argv[1:]:
    for line in open(p, encoding="utf-8"):
        try: o=json.loads(line)
        except Exception: continue
        if o.get("kind")!="judge": continue
        k=(o.get("chatId"),o.get("at"),o.get("summary"))
        if k in seen: continue
        seen.add(k)
        d=o.get("detail") or {}
        rows[d.get("use")].append((d.get("fallback"), d.get("latencyMs"), d.get("cached")))
out={}
for use,r in rows.items():
    lat=sorted(x[1] for x in r if x[0] is None and x[1] is not None)
    q=lambda f: lat[min(len(lat)-1,int(f*len(lat)))] if lat else None
    out[use]={"calls":len(r),"timeouts":sum(1 for x in r if x[0]=="timeout"),"fallbacks":dict(collections.Counter(x[0] for x in r if x[0])),"answered_p50":q(.5),"answered_p90":q(.9),"answered_max":lat[-1] if lat else None}
print(json.dumps(out,indent=1))

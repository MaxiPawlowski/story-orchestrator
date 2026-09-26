import json, sys, re

run = sys.argv[1]
seen = set()
out = []

def norm(s):
    s = s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"').replace("—", "-").replace("–", "-")
    return re.sub(r"\s+", " ", s).strip().lower()

for line in open(f"{run}/journal-follow.jsonl", encoding="utf-8"):
    try:
        o = json.loads(line)
    except Exception:
        continue
    if o.get("kind") != "audit":
        continue
    key = (o.get("chatId"), o.get("at"), o.get("summary"))
    if key in seen:
        continue
    seen.add(key)
    d = o.get("detail") or {}
    prompt = d.get("prompt") or ""
    for r in d.get("rejected") or []:
        if r.get("reason") != "evidence not in window":
            continue
        m = re.search(r'evidence=(["\'])(.*)\1\s*$', r.get("line", ""))
        q = m.group(2) if m else None
        verbatim = bool(q) and q in prompt
        normalized = bool(q) and norm(q) in norm(prompt)
        stripped = None
        if q:
            qs = re.sub(r"^\[\d+\]\s*[^:]{1,40}:\s*", "", q)
            stripped = norm(qs) in norm(prompt)
        out.append({"at": o["at"], "window": d.get("window"), "q": r.get("line", "")[:80], "inPromptVerbatim": verbatim, "inPromptNormalized": normalized, "inPromptLabelStripped": stripped, "quote": (q or "")[:200]})

json.dump(out, open(f"{run}/evidence-not-in-window-check.json", "w", encoding="utf-8"), indent=1, ensure_ascii=False)
for x in out:
    print(x["at"][11:19], x["window"], "verbatim" if x["inPromptVerbatim"] else ("normalized" if x["inPromptNormalized"] else ("label-stripped" if x["inPromptLabelStripped"] else "ABSENT")), "|", x["quote"][:110])

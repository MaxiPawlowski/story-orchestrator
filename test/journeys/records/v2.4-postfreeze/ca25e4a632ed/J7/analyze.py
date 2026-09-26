import json, sys, collections, re, datetime

run = sys.argv[1]
rows = []
for line in open(f"{run}/journal-follow.jsonl", encoding="utf-8"):
    line = line.strip()
    if not line:
        continue
    try:
        rows.append(json.loads(line))
    except Exception:
        pass

seen = set()
audits = []
for o in rows:
    if o.get("kind") != "audit":
        continue
    key = (o.get("chatId"), o.get("at"), o.get("summary"))
    if key in seen:
        continue
    seen.add(key)
    audits.append(o)

by_reason = collections.Counter()
by_reason_q = collections.Counter()
rejected_detail = []
accepted = collections.defaultdict(list)
labelled_evidence_accepted = 0
for a in audits:
    d = a.get("detail") or {}
    for r in d.get("rejected") or []:
        ln = r.get("line", "")
        m = re.match(r"DELTA\s+(?:q=)?([A-Za-z_]+)", ln)
        q = m.group(1) if m else ("FACT" if ln.startswith("FACT") else "other")
        by_reason[r.get("reason")] += 1
        by_reason_q[(q, r.get("reason"))] += 1
        if q in ("mission_accepted", "luke_decision", "tension_current") or r.get("reason") == "evidence not in window":
            rejected_detail.append({"at": a["at"], "window": d.get("window"), "reason": r.get("reason"), "line": ln[:300]})
    for x in d.get("accepted") or []:
        accepted[x.get("q")].append({"at": a["at"], "v": x.get("v"), "evidence": (x.get("evidence") or "")[:160]})
        if re.match(r"^\s*\[\d+\]", x.get("evidence") or ""):
            labelled_evidence_accepted += 1

health = []
for o in rows:
    s = o.get("summary") or ""
    if "not answering" in s or "answering again" in s:
        k = (o.get("at"), s)
        if k in seen:
            continue
        seen.add(k)
        health.append({"at": o["at"], "summary": s, "detail": (o.get("detail") or {}).get("note") or o.get("detail")})

def ts(s):
    return datetime.datetime.fromisoformat(s.replace("Z", "+00:00"))

trips = []
open_at = None
for h in health:
    if "not answering" in h["summary"] and open_at is None:
        open_at = h
    elif "answering again" in h["summary"] and open_at is not None:
        trips.append({"opened": open_at["at"], "closed": h["at"], "seconds": (ts(h["at"]) - ts(open_at["at"])).total_seconds(), "closedBy": h["detail"]})
        open_at = None
if open_at is not None:
    trips.append({"opened": open_at["at"], "closed": None, "seconds": None})

scene = [{"at": a["at"], "reason": (a.get("detail") or {}).get("reason"), "sceneBreak": (a.get("detail") or {}).get("sceneBreak"), "window": (a.get("detail") or {}).get("window")} for a in audits if (a.get("detail") or {}).get("sceneBreak") or "scene" in str((a.get("detail") or {}).get("reason"))]
transitions = [{"at": o["at"], "summary": o.get("summary")} for o in rows if o.get("kind") == "transition"]
tq = [x for x in accepted.get("tension_current", [])]
out = {
    "run": run,
    "audits": len(audits),
    "rejectedByReason": dict(by_reason),
    "rejectedByQualityReason": {f"{q} | {r}": n for (q, r), n in sorted(by_reason_q.items())},
    "acceptedCounts": {q: len(v) for q, v in accepted.items()},
    "mission_accepted": accepted.get("mission_accepted", []),
    "luke_decision": accepted.get("luke_decision", []),
    "tension_current_values": [x["v"] for x in tq],
    "acceptedWithLabelledEvidence": labelled_evidence_accepted,
    "rejectedDetail": rejected_detail,
    "healthEvents": health,
    "breakerTrips": trips,
    "transitions": transitions,
    "sceneReads": scene,
}
json.dump(out, open(f"{run}/analysis.json", "w", encoding="utf-8"), indent=1, ensure_ascii=False)
summary = {k: out[k] for k in ("audits", "rejectedByReason", "rejectedByQualityReason", "acceptedCounts", "tension_current_values", "acceptedWithLabelledEvidence", "breakerTrips")}
summary["sceneReads"] = out["sceneReads"]
summary["transitions"] = len(transitions)
summary["mission_accepted"] = [(x["at"], x["v"]) for x in out["mission_accepted"]]
summary["luke_decision"] = [(x["at"], x["v"]) for x in out["luke_decision"]]
print(json.dumps(summary, indent=1, ensure_ascii=False))

import json, sys, pathlib

SETTLE = {"wait": {"schedulerIdle": True, "quietMs": 8000, "timeoutMs": 300000}}
CAUGHT_UP = {"eval": "const deadline = Date.now() + 180000; while (Date.now() < deadline) { const ctx = SillyTavern.getContext(); const state = globalThis.storyOrchestratorRuntime.getEngineState(); if (state && state.lastMessageId === ctx.chat.length - 1) return { caughtUp: state.lastMessageId }; await new Promise((resolve) => setTimeout(resolve, 500)); } throw new Error('the engine never committed the newest message');"}
RECOMMIT_LANDED = {"eval": "const edit = globalThis.__sp2.edits[globalThis.__sp2.edits.length - 1]; const reason = 'recommit:' + edit.id; const deadline = Date.now() + 180000; while (Date.now() < deadline) { const hit = globalThis.storyOrchestratorRuntime.getExtractionAudits().find((audit) => audit.reason === reason && Date.parse(audit.createdAt) >= edit.at); if (hit) return { landed: reason, at: hit.createdAt }; await new Promise((resolve) => setTimeout(resolve, 500)); } return { landed: null, reason };", "log": True}


def is_activate(step):
    return isinstance(step.get("slash"), str) and step["slash"].startswith("/cp activate")


def is_reply_check(step):
    return isinstance(step.get("eval"), str) and step["eval"].startswith("const ctx = SillyTavern.getContext(); const rt = globalThis.storyOrchestratorRuntime; const id = ctx.chat.length - 1;")


def patch(steps, diag):
    out = []
    for index, step in enumerate(steps):
        if is_reply_check(step):
            out.append(CAUGHT_UP)
        if diag and "send_generate" in step and out and isinstance(out[-1].get("eval"), str) and "edit.reads = rt.getExtractionAudits()" in out[-1]["eval"]:
            out.insert(len(out) - 1, RECOMMIT_LANDED)
        out.append(step)
        if is_activate(step) and index + 1 < len(steps) and "wait" in steps[index + 1]:
            pass
        if index > 0 and is_activate(steps[index - 1]) and "wait" in step:
            out.append(SETTLE)
    return out


def main():
    src, dst, mode = sys.argv[1], sys.argv[2], sys.argv[3]
    doc = json.loads(pathlib.Path(src).read_text(encoding="utf-8"))
    doc["steps"] = patch(doc["steps"], mode == "diag")
    doc["_v26_03"] = "plan 03 procedure change (03-sp2-restated.md addendum): settle reads after /cp activate before /cp set; wait for the engine to commit the newest reply before an edit leg" + ("; DIAG: wait for the recommit audit before the next send" if mode == "diag" else "")
    pathlib.Path(dst).write_text(json.dumps(doc, indent=1, ensure_ascii=False), encoding="utf-8")


main()

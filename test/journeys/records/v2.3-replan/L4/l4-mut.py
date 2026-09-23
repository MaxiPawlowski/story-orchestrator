import io, subprocess, os
os.chdir(r"C:/dev/SillyTavern-MainBranch/public/scripts/extensions/third-party/story-orchestrator")
MUTS = [
    ("src/generation/planner.ts", "planner ignores the entry transition's pins", "values: { ...blackboard.values, ...gatePins(candidate.transition.gate) }", "values: { ...blackboard.values }", "src/generation"),
    ("src/generation/critic.ts", "code check does not seed satisfied snapshot keys", "const start = { ...Object.fromEntries(satisfied), ", "const start = { ...Object.fromEntries(satisfied.slice(0, 0)), ", "src/generation"),
    ("src/generation/paths.ts", "a != leaf counts as a pin", '    if (gate.op === "==") return { [gate.q]: gate.v as PrimitiveValue };', '    if (gate.op === "==" || gate.op === "!=") return { [gate.q]: gate.v as PrimitiveValue };', "src/generation"),
    ("src/generation/paths.ts", "an outcome's gate pins are ignored on its route", "  applyDeltas({ ...values, ...gatePins(outcome.gate) }, outcome.deltas);", "  applyDeltas({ ...values }, outcome.deltas);", "src/generation"),
    ("src/generation/revalidate.ts", "revalidation ignores the entry transition's pins", "const start = { ...blackboard, ...gatePins(entryGate) };", "const start = { ...blackboard };", "src/generation"),
    ("src/generation/critic.ts", "duplicate outcome gates are not flagged", "      if (earlier !== undefined) issues.push(", "      if (earlier !== undefined && earlier === \"never\") issues.push(", "src/generation"),
    ("src/engine/engine.ts", "replaceGraph drops the pending writes", "    pending.forEach((write) => this.queue.enqueue(write));", "    void pending;", "src/engine src/runtime/runtimeManager.test.ts"),
    ("src/engine/engine.ts", "replaceGraph drops the history", "    this.hydrate(state, history);", "    this.hydrate(state, history && null);", "src/engine src/runtime/runtimeManager.test.ts"),
    ("src/runtime/runtimeManager.ts", "manager swaps the graph by reload + hydrate", "    this.engine.replaceGraph(story);", "    const state = this.engine.serialize();\n    this.engine.loadStory(story);\n    this.engine.hydrate(state);", "src/runtime/runtimeManager.test.ts"),
]
for path, name, old, new, scope in MUTS:
    raw = io.open(path, encoding="utf-8", newline="").read()
    t = raw.replace("\r\n", "\n")
    assert t.count(old) == 1, name
    crlf = "\r\n" in raw
    mutated = t.replace(old, new)
    try:
        io.open(path, "w", encoding="utf-8", newline="").write(mutated.replace("\n", "\r\n") if crlf else mutated)
        r = subprocess.run(f"npx jest {scope}", shell=True, capture_output=True, encoding="utf-8", errors="replace")
        out = (r.stdout or "") + (r.stderr or "")
        print(("KILLED" if r.returncode else "SURVIVED") + ": " + name, sorted({l.strip() for l in out.splitlines() if l.strip().startswith("●") and "›" in l})[:2], flush=True)
    finally:
        io.open(path, "w", encoding="utf-8", newline="").write(raw)

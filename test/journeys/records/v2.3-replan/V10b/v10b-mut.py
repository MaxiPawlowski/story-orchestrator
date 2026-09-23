import io, subprocess, os
os.chdir(r"C:/dev/SillyTavern-MainBranch/public/scripts/extensions/third-party/story-orchestrator")
p = "src/runtime/coordinators/stagecraftCoordinator.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
MUTS = [
    ("revert addresses by name (uid ignored)", "  entry.target?.uid !== undefined ? {", "  entry.target?.uid === -999 ? {"),
    ("renamed entry skips the write-scope re-check", "current.comment !== entry.op.comment && !isCuratorWritable(story, entry.op.lorebook, current.comment)", "current.comment !== entry.op.comment && current.comment === '\u0000'"),
    ("uid restore result ignored", "      if (at) return (await restoreWIEntryAt(at, before)).ok;", "      if (at) { await restoreWIEntryAt(at, before); return true; }"),
]
for name, old, new in MUTS:
    assert raw.count(old) == 1, name
    try:
        io.open(p, "w", encoding="utf-8", newline="").write(raw.replace(old, new))
        r = subprocess.run("npx jest src/runtime/coordinators", shell=True, capture_output=True, encoding="utf-8", errors="replace")
        out = (r.stdout or "") + (r.stderr or "")
        print(("KILLED" if r.returncode else "SURVIVED") + ": " + name, sorted({l.strip() for l in out.splitlines() if l.strip().startswith("●") and "›" in l})[:3])
    finally:
        io.open(p, "w", encoding="utf-8", newline="").write(raw)

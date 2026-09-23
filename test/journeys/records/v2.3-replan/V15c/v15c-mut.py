import io, subprocess, os
os.chdir(r"C:/dev/SillyTavern-MainBranch/public/scripts/extensions/third-party/story-orchestrator")
p = "src/services/stHost/groups.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
MUTS = [
    ("debounced save again", "editGroup(group.id, true, false)", "editGroup(group.id, false, false)"),
    ("server copy never compared", "  if (JSON.stringify(held) !== JSON.stringify(wanted)) return couldNot(", "  if (held.length > 999) return couldNot("),
    ("blind read-back read as a refusal", "  if (!saved) return wrote({ confirmed: false });", "  if (!saved) return couldNot(\"unread\");"),
]
for name, old, new in MUTS:
    assert raw.count(old) == 1, name
    try:
        io.open(p, "w", encoding="utf-8", newline="").write(raw.replace(old, new))
        r = subprocess.run("npx jest src/services/stHost/groups.test.ts src/runtime/effectRestore", shell=True, capture_output=True, encoding="utf-8", errors="replace")
        out = (r.stdout or "") + (r.stderr or "")
        print(("KILLED" if r.returncode else "SURVIVED") + ": " + name, sorted({l.strip() for l in out.splitlines() if l.strip().startswith("●") and "›" in l})[:2])
    finally:
        io.open(p, "w", encoding="utf-8", newline="").write(raw)

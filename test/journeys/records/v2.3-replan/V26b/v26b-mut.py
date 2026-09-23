import io, subprocess, os
os.chdir(r"C:/dev/SillyTavern-MainBranch/public/scripts/extensions/third-party/story-orchestrator")
p = "src/runtime/chatSave.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
MUTS = [
    ("persist writes for another chat", "    if (!this.deps.owner.ownsOpenChat()) {", "    if (this.deps.loaded() === undefined) {"),
    ("landed ignores a lost save", " && !saveWasLost(this.deps.extras().saveHealth); }", " && saveWasLost(this.deps.extras().saveHealth) === saveWasLost(this.deps.extras().saveHealth); }"),
    ("save is not observed", "    const observed = recordSaveEvidence(deps, this.deps.engine().state.boundary);", "    const observed = Promise.resolve(void deps);"),
]
for name, old, new in MUTS:
    assert raw.count(old) == 1, name
    try:
        io.open(p, "w", encoding="utf-8", newline="").write(raw.replace(old, new))
        r = subprocess.run("npx jest src/runtime", shell=True, capture_output=True, encoding="utf-8", errors="replace")
        out = (r.stdout or "") + (r.stderr or "")
        print(("KILLED" if r.returncode else "SURVIVED") + ": " + name, [l.strip() for l in out.splitlines() if l.strip().startswith("●") and "›" in l][:3])
    finally:
        io.open(p, "w", encoding="utf-8", newline="").write(raw)

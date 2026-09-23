import io, subprocess, os, json
os.chdir(r"C:/dev/SillyTavern-MainBranch/public/scripts/extensions/third-party/story-orchestrator")

def run(cmd):
    r = subprocess.run(cmd, shell=True, capture_output=True, encoding="utf-8", errors="replace")
    out = (r.stdout or "") + (r.stderr or "")
    return r.returncode, [l.strip() for l in out.splitlines() if l.strip().startswith("not ok")][:3]

def mutate(name, path, old, new, cmd):
    raw = io.open(path, encoding="utf-8", newline="").read()
    assert raw.count(old) == 1, f"{name}: mutant did not apply"
    try:
        io.open(path, "w", encoding="utf-8", newline="").write(raw.replace(old, new))
        code, fails = run(cmd)
        print(("KILLED" if code else "SURVIVED") + ": " + name, fails)
    finally:
        io.open(path, "w", encoding="utf-8", newline="").write(raw)

LIB = "scripts/debug/lib/journeyArchive.mts"
TEST = "node --test scripts/debug/lib/journeyArchive.test.mts"
mutate("archive accepts a partial record", LIB, "  if (record.partial === true) {", "  if (record.partial === 'never') {", TEST)
mutate("archive accepts a runner-errored record", LIB, "  if (record.runnerError) return", "  if (record.runnerError === 'never') return", TEST)
mutate("--only guard removed", "scripts/debug/so-scenario.mts", "if (requireStory && STORY_BOUND_VERBS.has(key)", "if (requireStory === 'never' && STORY_BOUND_VERBS.has(key)", TEST)
mutate("guard always on (ignores --only)", "scripts/debug/so-scenario.mts", "if (requireStory && STORY_BOUND_VERBS.has(key)", "if (STORY_BOUND_VERBS.has(key)", TEST)

att = json.load(open("docs/release/2.3.0/attestation.json", encoding="utf-8"))
name = next(n for k, j in att["journeys"].items() if k.startswith("J") for n in j.get("records", []) if n.endswith(".json"))
path = os.path.join("test/journeys/records/v2.3-plan05-live", name)
raw = io.open(path, encoding="utf-8", newline="").read()
old = '"partial": false'
if raw.count(old) == 1:
    mutate(f"a cited record ({name}) is partial", path, old, '"partial": true', "npm run test:release")
else:
    rec = json.loads(raw)
    try:
        rec["partial"] = True
        io.open(path, "w", encoding="utf-8").write(json.dumps(rec, indent=2))
        code, fails = run("npm run test:release")
        print(("KILLED" if code else "SURVIVED") + f": a cited record ({name}) is partial (planted field)", fails)
    finally:
        io.open(path, "w", encoding="utf-8", newline="").write(raw)

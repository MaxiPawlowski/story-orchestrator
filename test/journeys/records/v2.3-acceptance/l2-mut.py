import io, subprocess, os
os.chdir(r"C:/dev/SillyTavern-MainBranch/public/scripts/extensions/third-party/story-orchestrator")
MUTS = [
  ("src/runtime/rollback.ts", "rollback no longer clamps the cursor", "    engine.clampToChat(deps.context().chatLength);\n", "", "src/runtime/runtimeManager.test.ts src/runtime/rollback.review.test.ts"),
  ("src/engine/engine.ts", "clamp leaves chatLength", "    this.chatLength = last + 1;\n", "", "src/engine/clampToChat.test.ts src/runtime/runtimeManager.test.ts"),
  ("src/runtime/effectsApplier.ts", "refused announcement not journaled", '      this.deps.journal?.(unannounced, "the /comment that posts the note was refused");\n', "", "src/runtime/effectsApplier.test.ts"),
  ("src/runtime/effectsApplier.ts", "unowned announcement not journaled", 'if (!ownsOpenChat) return this.deps.journal?.(unannounced, "the open chat is not the chat this boundary belongs to");', "if (!ownsOpenChat) return;", "src/runtime/effectsApplier.test.ts"),
  ("src/runtime/runtimeManager.ts", "manager passes ownership as always-true", "this.extras, this.owner.ownsOpenChat());", "this.extras);", "src/runtime/runtimeManager.test.ts src/runtime/effectsApplier.test.ts"),
]
for path, name, old, new, scope in MUTS:
    raw = io.open(path, encoding="utf-8", newline="").read()
    t = raw.replace("\r\n", "\n"); crlf = "\r\n" in raw
    assert t.count(old) == 1, name
    m = t.replace(old, new)
    try:
        io.open(path, "w", encoding="utf-8", newline="").write(m.replace("\n", "\r\n") if crlf else m)
        r = subprocess.run(f"npx jest {scope}", shell=True, capture_output=True, encoding="utf-8", errors="replace")
        out = (r.stdout or "") + (r.stderr or "")
        print(("KILLED" if r.returncode else "SURVIVED") + ": " + name, sorted({l.strip() for l in out.splitlines() if l.strip().startswith("●") and "›" in l})[:2], flush=True)
    finally:
        io.open(path, "w", encoding="utf-8", newline="").write(raw)

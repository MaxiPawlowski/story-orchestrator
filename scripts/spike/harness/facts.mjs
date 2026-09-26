import fs from "node:fs";
import { BIN, SHIMS, run, envFor, throwawayHome, emptyCwd, writeRecord } from "./lib.mjs";

const out = { at: new Date().toISOString(), bin: BIN, shims: {}, harness: {} };

for (const [k, p] of Object.entries(SHIMS)) out.shims[k] = { path: p, exists: fs.existsSync(p), size: fs.existsSync(p) ? fs.statSync(p).size : null };

const cmds = {
  claude: [["--version"], ["--help"], ["auth", "status"]],
  codex: [["--version"], ["exec", "--help"], ["login", "status"], ["features", "list"]],
  opencode: [["--version"], ["run", "--help"], ["auth", "list"], ["debug", "paths"]],
};

for (const [h, list] of Object.entries(cmds)) {
  const home = throwawayHome(`facts-${h}`);
  out.harness[h] = { home, runs: [] };
  for (const argv of list) {
    const r = await run(h, argv, { env: envFor(h, home), cwd: emptyCwd(), timeoutMs: 60000 });
    out.harness[h].runs.push({ argv, code: r.code, wallMs: r.wallMs, spawnMs: r.spawnMs, spawnError: r.spawnError, stdout: r.stdout, stderr: r.stderr.slice(0, 4000) });
  }
  out.harness[h].homeFiles = listFiles(home);
}

function listFiles(dir, base = dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) listFiles(p, base, acc);
    else acc.push({ file: p.slice(base.length + 1), size: fs.statSync(p).size });
  }
  return acc;
}

const shimRuns = {};
for (const [k, p] of Object.entries(SHIMS)) {
  const home = throwawayHome("shim");
  const r = await run("opencode", ["--version"], { env: envFor("opencode", home), cwd: emptyCwd(), bin: p, timeoutMs: 30000 });
  shimRuns[k] = { code: r.code, spawnError: r.spawnError, stdout: r.stdout.trim().slice(0, 200) };
}
out.shimSpawnNoShell = shimRuns;

console.log(writeRecord("facts.json", out));

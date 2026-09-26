import { spawn, execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REAL_HOME = os.homedir();

export const BIN = {
  claude: path.join(REAL_HOME, ".local", "bin", "claude.exe"),
  codex: path.join(REAL_HOME, "AppData", "Local", "Programs", "OpenAI", "Codex", "bin", "codex.exe"),
  opencode: "C:\\ProgramData\\chocolatey\\lib\\opencode\\tools\\opencode.exe",
};

export const SHIMS = {
  opencodeChocoShim: "C:\\ProgramData\\chocolatey\\bin\\opencode.exe",
  opencodeNpmCmd: "C:\\Program Files\\nodejs\\opencode.cmd",
  opencodeNpmPs1: "C:\\Program Files\\nodejs\\opencode.ps1",
};

export const REAL_OPENCODE_DATA = path.join(REAL_HOME, ".local", "share");

const PASS = [
  "PATH", "Path", "SystemRoot", "SYSTEMROOT", "windir", "ComSpec", "PATHEXT", "TEMP", "TMP", "ProgramData",
  "ProgramFiles", "ProgramFiles(x86)", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "OS", "SystemDrive",
];

export const ROOT = path.join(os.tmpdir(), "so-p0");

export function throwawayHome(label) {
  fs.mkdirSync(ROOT, { recursive: true });
  const home = fs.mkdtempSync(path.join(ROOT, `${label}-`));
  for (const d of ["AppData/Roaming", "AppData/Local", ".config", ".cache", ".local/state", ".claude", ".codex"]) {
    fs.mkdirSync(path.join(home, d), { recursive: true });
  }
  return home;
}

export function emptyCwd(label = "cwd") {
  fs.mkdirSync(ROOT, { recursive: true });
  return fs.mkdtempSync(path.join(ROOT, `${label}-`));
}

export const PASS_THROUGH = [
  "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "ALL_PROXY", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR",
  "CODEX_CA_CERTIFICATE", "DO_NOT_TRACK", "DISABLE_TELEMETRY", "DISABLE_ERROR_REPORTING",
  "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC",
];

export function envFor(harness, home, extra = {}) {
  const env = {};
  for (const k of PASS) if (process.env[k] !== undefined) env[k] = process.env[k];
  for (const k of PASS_THROUGH) if (process.env[k] !== undefined) env[k] = process.env[k];
  env.USERPROFILE = home;
  env.HOME = home;
  env.HOMEPATH = home.slice(2);
  env.HOMEDRIVE = home.slice(0, 2);
  env.APPDATA = path.join(home, "AppData", "Roaming");
  env.LOCALAPPDATA = path.join(home, "AppData", "Local");
  if (harness === "claude") env.CLAUDE_CONFIG_DIR = path.join(home, ".claude");
  if (harness === "codex") env.CODEX_HOME = path.join(home, ".codex");
  if (harness === "opencode") {
    env.XDG_CONFIG_HOME = path.join(home, ".config");
    env.XDG_CACHE_HOME = path.join(home, ".cache");
    env.XDG_STATE_HOME = path.join(home, ".local", "state");
    env.XDG_DATA_HOME = REAL_OPENCODE_DATA;
  }
  return { ...env, ...extra };
}

export function psTree() {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-Command", "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress"],
      { maxBuffer: 64 * 1024 * 1024 },
      (err, out) => {
        if (err) return resolve([]);
        try { resolve(JSON.parse(out)); } catch { resolve([]); }
      },
    );
  });
}

export function descendantsOf(rows, pid) {
  const kids = new Map();
  for (const r of rows) {
    if (!kids.has(r.ParentProcessId)) kids.set(r.ParentProcessId, []);
    kids.get(r.ParentProcessId).push(r);
  }
  const out = [];
  const stack = [pid];
  while (stack.length) {
    const p = stack.pop();
    for (const c of kids.get(p) ?? []) {
      if (c.ProcessId === p) continue;
      out.push(c);
      stack.push(c.ProcessId);
    }
  }
  return out;
}

function netstat() {
  return new Promise((resolve) => {
    execFile("netstat", ["-ano", "-p", "TCP"], { maxBuffer: 16 * 1024 * 1024 }, (err, out) => resolve(err ? "" : out));
  });
}

export function killTree(pid) {
  return new Promise((resolve) => execFile("taskkill", ["/pid", String(pid), "/T", "/F"], () => resolve()));
}

export function alive(pids) {
  return psTree().then((rows) => {
    const live = new Set(rows.map((r) => r.ProcessId));
    return pids.filter((p) => live.has(p));
  });
}

export async function run(harness, argv, opts = {}) {
  const { env, cwd, stdin = "", timeoutMs = 120000, maxOutputChars = 0, watch = false, bin = BIN[harness], shell = false, pollGone = false } = opts;
  const t0 = performance.now();
  let spawnMs = null;
  let child;
  try {
    child = spawn(bin, argv, { env, cwd, shell, windowsHide: true });
  } catch (e) {
    return { harness, stdout: "", stderr: "", code: null, killed: null, pid: null, tree: [], remotes: [], samples: 0, spawnError: `${e.code ?? ""} sync ${e.message}`, wallMs: Math.round(performance.now() - t0), spawnMs: null };
  }
  const result = { harness, stdout: "", stderr: "", code: null, killed: null, pid: child.pid, tree: new Map(), remotes: new Map(), samples: 0 };
  child.on("spawn", () => { spawnMs = performance.now() - t0; });
  let done = false;
  let killing = null;
  let goneWatch = null;
  const kill = (why) => {
    if (killing) return killing;
    result.killed = why;
    result.killAtMs = Math.round(performance.now() - t0);
    const pids = [child.pid, ...result.tree.keys()];
    killing = killTree(child.pid).then(() => { result.taskkillReturnMs = Math.round(performance.now() - t0) - result.killAtMs; });
    if (pollGone) goneWatch = pollUntilGone(pids, 100, 5000).then((g) => { result.gone = g; });
    return killing;
  };
  const watchers = [];
  if (watch) {
    watchers.push((async () => {
      while (!done) {
        const rows = await psTree();
        for (const d of descendantsOf(rows, child.pid)) result.tree.set(d.ProcessId, d.Name);
        await new Promise((r) => setTimeout(r, 400));
      }
    })());
    watchers.push((async () => {
      while (!done) {
        const out = await netstat();
        result.samples += 1;
        const pids = new Set([child.pid, ...result.tree.keys()]);
        for (const line of out.split(/\r?\n/)) {
          const m = line.trim().split(/\s+/);
          if (m[0] !== "TCP" || m.length < 5) continue;
          const pid = Number(m[4]);
          if (!pids.has(pid)) continue;
          const remote = m[2];
          if (/^(0\.0\.0\.0|\[::\]|127\.|\[::1\])/.test(remote)) continue;
          if (!result.remotes.has(remote)) result.remotes.set(remote, { pid, state: m[3] });
        }
        await new Promise((r) => setTimeout(r, 100));
      }
    })());
  }
  child.stdout.on("data", (b) => {
    result.stdout += b.toString("utf8");
    if (maxOutputChars && result.stdout.length > maxOutputChars * 2) kill("output-bound");
  });
  child.stderr.on("data", (b) => { result.stderr += b.toString("utf8"); });
  child.stdin.on("error", () => {});
  child.stdin.end(stdin);
  const timer = setTimeout(() => kill("deadline"), timeoutMs);
  const exit = await new Promise((resolve) => {
    child.on("error", (e) => resolve({ error: e }));
    child.on("close", (code) => resolve({ code }));
  });
  clearTimeout(timer);
  if (killing) await killing;
  if (goneWatch) await goneWatch;
  done = true;
  await Promise.all(watchers);
  result.code = exit.code ?? null;
  result.spawnError = exit.error ? `${exit.error.code ?? ""} ${exit.error.message}` : null;
  result.wallMs = Math.round(performance.now() - t0);
  result.spawnMs = spawnMs === null ? null : Math.round(spawnMs);
  result.tree = [...result.tree.entries()].map(([pid, name]) => ({ pid, name }));
  result.remotes = [...result.remotes.entries()].map(([remote, v]) => ({ remote, ...v }));
  return result;
}

export function parseJsonl(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    try { out.push(JSON.parse(t)); } catch {}
  }
  return out;
}

export function opencodeSummary(stdout) {
  const ev = parseJsonl(stdout);
  const text = ev.filter((e) => e.type === "text").map((e) => e.part?.text ?? "").join("");
  const finish = ev.filter((e) => e.type === "step_finish").map((e) => e.part);
  const tokens = finish.map((p) => p?.tokens).filter(Boolean);
  const toolEvents = ev.filter((e) => /tool/i.test(e.type) || /tool/i.test(e.part?.type ?? ""));
  const errors = ev.filter((e) => e.type === "error");
  return {
    text,
    inputTokens: tokens.reduce((a, t) => a + (t.input ?? 0), 0),
    cacheRead: tokens.reduce((a, t) => a + (t.cache?.read ?? 0), 0),
    outputTokens: tokens.reduce((a, t) => a + (t.output ?? 0), 0),
    reasons: finish.map((p) => p?.reason).filter(Boolean),
    types: [...new Set(ev.map((e) => e.type))],
    toolEvents: toolEvents.length,
    errors: errors.map((e) => e.error ?? e),
  };
}

export function pct(values, p) {
  const s = [...values].sort((a, b) => a - b);
  if (!s.length) return null;
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}

export function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; }
}

export async function pollUntilGone(pids, everyMs = 100, capMs = 5000) {
  const t0 = performance.now();
  const polls = [];
  for (;;) {
    const live = pids.filter(pidAlive);
    const at = Math.round(performance.now() - t0);
    polls.push({ at, live: live.length });
    if (!live.length) return { goneMs: at, polls: polls.length, pids: pids.length, lastLive: [] };
    if (at >= capMs) return { goneMs: null, polls: polls.length, pids: pids.length, lastLive: live };
    await new Promise((r) => setTimeout(r, everyMs));
  }
}

export const OWNED_ROOT = path.join(os.tmpdir(), "so-p0-owned");

export const LOGIN = {
  claude: { real: path.join(REAL_HOME, ".claude", ".credentials.json"), dest: ["config", ".credentials.json"] },
  codex: { real: path.join(REAL_HOME, ".codex", "auth.json"), dest: ["config", "auth.json"] },
  opencode: { real: path.join(REAL_OPENCODE_DATA, "opencode", "auth.json"), dest: ["data", "opencode", "auth.json"] },
};

export function sha256File(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

function jwtExpMs(token) {
  try { return JSON.parse(Buffer.from(String(token).split(".")[1], "base64url").toString("utf8")).exp * 1000; } catch { return null; }
}

export function loginFreshness(cli, minMinutes) {
  const floor = Date.now() + minMinutes * 60000;
  let j;
  try { j = JSON.parse(fs.readFileSync(LOGIN[cli].real, "utf8")); } catch { return { fresh: false, reason: "login file missing or unreadable" }; }
  if (cli === "claude") {
    const o = j.claudeAiOauth;
    if (!o) return { fresh: false, reason: "no claudeAiOauth entry" };
    return o.expiresAt > floor ? { fresh: true } : { fresh: false, reason: `access token expires in under ${minMinutes} min or has expired: a call would refresh inside the copy` };
  }
  if (cli === "codex") {
    const exp = jwtExpMs(j.tokens?.access_token);
    const age = Date.now() - Date.parse(j.last_refresh ?? "");
    if (!(exp > floor)) return { fresh: false, reason: `access token expires in under ${minMinutes} min or has expired` };
    if (!(age < 7 * 86400000)) return { fresh: false, reason: "last_refresh older than 7 days: codex refreshes on its own schedule" };
    return { fresh: true };
  }
  const oauth = Object.entries(j).filter(([, v]) => v?.type === "oauth");
  const stale = oauth.filter(([, v]) => !(v.expires > floor)).map(([k]) => k);
  return stale.length ? { fresh: false, reason: `oauth provider(s) ${stale.join(",")} expire in under ${minMinutes} min` } : { fresh: true, oauthProviders: oauth.map(([k]) => k) };
}

const openCopies = new Set();
process.on("exit", () => { for (const p of openCopies) { try { fs.unlinkSync(p); } catch {} } });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => process.exit(130));

export function ownedSession(cli, label, { minMinutes = 90, copyLogin = true } = {}) {
  const fresh = loginFreshness(cli, minMinutes);
  if (copyLogin && !fresh.fresh) {
    const e = new Error(`owned-home refused for ${cli}: ${fresh.reason}`);
    e.refused = fresh.reason;
    throw e;
  }
  const base = path.join(OWNED_ROOT, cli);
  fs.mkdirSync(base, { recursive: true });
  const root = fs.mkdtempSync(path.join(base, `${label}-`));
  const s = { cli, root, loginName: path.basename(LOGIN[cli].real), copied: false };
  for (const k of ["home", "config", "data", "cache", "state", "tmp", "cwd"]) { s[k] = path.join(root, k); fs.mkdirSync(s[k], { recursive: true }); }
  for (const d of ["AppData/Roaming", "AppData/Local"]) fs.mkdirSync(path.join(s.home, d), { recursive: true });
  if (copyLogin) {
    s.realBefore = sha256File(LOGIN[cli].real);
    s.copy = path.join(root, ...LOGIN[cli].dest);
    fs.mkdirSync(path.dirname(s.copy), { recursive: true });
    openCopies.add(s.copy);
    fs.copyFileSync(LOGIN[cli].real, s.copy);
    s.copied = sha256File(s.copy) === s.realBefore;
    if (!s.copied) { closeOwned(s); throw new Error(`owned-home copy for ${cli} does not match the real login file`); }
  }
  return s;
}

export function closeOwned(s, { removeRoot = true } = {}) {
  const check = { loginFile: s.loginName, copied: s.copied };
  if (s.copy) {
    check.copyRewritten = fs.existsSync(s.copy) ? sha256File(s.copy) !== s.realBefore : null;
    try { fs.unlinkSync(s.copy); } catch {}
    openCopies.delete(s.copy);
    check.copyDeleted = !fs.existsSync(s.copy);
    const after = sha256File(LOGIN[s.cli].real);
    check.realSha256Prefix = s.realBefore.slice(0, 12);
    check.realUnchanged = after === s.realBefore;
  }
  if (removeRoot) { try { fs.rmSync(s.root, { recursive: true, force: true }); } catch {} check.rootRemoved = !fs.existsSync(s.root); }
  if (check.realUnchanged === false) {
    console.error(`\n!!! REAL LOGIN FILE CHANGED during the ${s.cli} run (${s.loginName}). FAILING THE RUN. !!!\n`);
    process.exitCode = 3;
    throw Object.assign(new Error(`real ${s.cli} login file changed`), { check });
  }
  if (check.copyRewritten) console.error(`\n!!! ${s.cli} rewrote its login COPY (token refresh): the real refresh token may now be revoked. !!!\n`);
  return check;
}

export function envOwned(cli, s, extra = {}) {
  const env = {};
  for (const k of PASS) if (process.env[k] !== undefined) env[k] = process.env[k];
  for (const k of PASS_THROUGH) if (process.env[k] !== undefined) env[k] = process.env[k];
  env.USERPROFILE = s.home;
  env.HOME = s.home;
  env.HOMEPATH = s.home.slice(2);
  env.HOMEDRIVE = s.home.slice(0, 2);
  env.APPDATA = path.join(s.home, "AppData", "Roaming");
  env.LOCALAPPDATA = path.join(s.home, "AppData", "Local");
  env.TEMP = s.tmp;
  env.TMP = s.tmp;
  if (cli === "claude") env.CLAUDE_CONFIG_DIR = s.config;
  if (cli === "codex") env.CODEX_HOME = s.config;
  if (cli === "opencode") {
    env.XDG_CONFIG_HOME = s.config;
    env.XDG_DATA_HOME = s.data;
    env.XDG_CACHE_HOME = s.cache;
    env.XDG_STATE_HOME = s.state;
  }
  return { ...env, ...extra };
}

export function ownedCwd(s, label = "cwd") {
  return fs.mkdtempSync(path.join(s.cwd, `${label}-`));
}

export function writeRecordIn(sub, name, data) {
  const dir = path.join(process.cwd(), "test", "journeys", "records", "v2.5-harness", sub);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2) + "\n");
  return path.join(dir, name);
}

export function writeRecord(name, data) {
  const dir = path.join(process.cwd(), "test", "journeys", "records", "v2.5-harness", "phase0");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2) + "\n");
  return path.join(dir, name);
}

export function soTextAgent(system) {
  return JSON.stringify({
    $schema: "https://opencode.ai/config.json",
    agent: {
      "so-text": {
        mode: "primary",
        prompt: system,
        tools: { "*": false },
        permission: { edit: "deny", bash: "deny", webfetch: "deny" },
      },
    },
  });
}

export const OPENCODE_QUIET = {
  OPENCODE_DISABLE_AUTOUPDATE: "1",
  OPENCODE_DISABLE_SHARE: "1",
  OPENCODE_DISABLE_CLAUDE_CODE: "1",
  OPENCODE_DISABLE_PROJECT_CONFIG: "1",
  OPENCODE_DISABLE_EXTERNAL_SKILLS: "1",
  OPENCODE_DISABLE_LSP_DOWNLOAD: "1",
};

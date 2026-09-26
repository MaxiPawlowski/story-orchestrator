import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  BIN, SHIMS, OPENCODE_QUIET, LOGIN, OWNED_ROOT, run, parseJsonl, opencodeSummary, pct, soTextAgent,
  ownedSession, closeOwned, envOwned, ownedCwd, writeRecordIn, loginFreshness, sha256File,
} from "./lib.mjs";

const SUB = "phase0-owned";
const REAL_HOME = os.homedir();
const USER = os.userInfo().username.toLowerCase();
const FAST = "openai/gpt-6-astra-fast";
const FULL = "openai/gpt-6-astra";
const CODEX_QUOTA_BACK = new Date(2026, 8, 27, 20, 58);
const tag = () => crypto.randomBytes(4).toString("hex").toUpperCase();
const hashChecks = [];

const OPENCODE_HARDENED = { ...OPENCODE_QUIET, OPENCODE_DISABLE_MODELS_FETCH: "1", OPENCODE_DISABLE_DEFAULT_PLUGINS: "1" };

function sh(cmd, args, opts = {}) {
  return new Promise((resolve) => execFile(cmd, args, { maxBuffer: 64 * 1024 * 1024, ...opts }, (err, out, errOut) => resolve({ err, out: String(out ?? ""), errOut: String(errOut ?? "") })));
}

async function db(dbPath, mode, ...args) {
  const env = { ...process.env };
  if (dbPath) env.SO_DB = dbPath; else delete env.SO_DB;
  const r = await sh("python", [path.join("scripts", "spike", "harness", "dbcount.py"), mode, ...args], { env });
  try { return JSON.parse(r.out); } catch { return { error: (r.errOut || r.out).slice(0, 300) }; }
}

function diffCounts(a, b) {
  const out = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if ((b[k] ?? 0) !== (a[k] ?? 0)) out[k] = (b[k] ?? 0) - (a[k] ?? 0);
  return out;
}

const REAL = {
  claude: [path.join(REAL_HOME, ".claude"), path.join(REAL_HOME, ".claude.json"), path.join(REAL_HOME, ".claude.json.backup"), path.join(process.env.LOCALAPPDATA ?? "", "claude-cli-nodejs")],
  codex: [path.join(REAL_HOME, ".codex")],
  opencode: [path.join(REAL_HOME, ".local", "share", "opencode"), path.join(REAL_HOME, ".config", "opencode"), path.join(REAL_HOME, ".cache", "opencode"), path.join(REAL_HOME, ".local", "state", "opencode"), path.join(os.tmpdir(), "opencode")],
};
const NEVER_READ = new Set([".credentials.json", "auth.json"]);

function walkNewer(p, since, acc = []) {
  let st;
  try { st = fs.statSync(p); } catch { return acc; }
  if (st.isFile()) { if (st.mtimeMs >= since) acc.push({ path: p, size: st.size }); return acc; }
  let entries;
  try { entries = fs.readdirSync(p, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) { if (e.name !== "node_modules") walkNewer(path.join(p, e.name), since, acc); }
  return acc;
}

function scanFiles(files, needles, base) {
  return files.map((f) => {
    const name = path.basename(f.path);
    const rel = base ? path.relative(base, f.path) : f.path.replace(REAL_HOME, "~");
    if (NEVER_READ.has(name) || /\.db(-wal|-shm)?$/.test(name) || f.size > 32 * 1024 * 1024) return { file: rel, size: f.size, scanned: false };
    let text = "";
    try { text = fs.readFileSync(f.path).toString("utf8"); } catch {}
    return { file: rel, size: f.size, scanned: true, canaries: needles.filter((n) => text.includes(n)).length };
  });
}

function realScan(cli, since, needles) {
  const files = REAL[cli].flatMap((d) => walkNewer(d, since));
  const scanned = scanFiles(files, needles);
  const attributable = scanned.filter((f) => f.canaries || /so-p0-owned/i.test(f.file));
  const groups = {};
  for (const f of scanned) {
    const parts = f.file.replace(/\\/g, "/").split("/");
    const key = parts.slice(0, parts[1] === "projects" ? 3 : 2).join("/");
    groups[key] = (groups[key] ?? 0) + 1;
  }
  return { newerFiles: scanned.length, attributable, unattributedByGroup: groups };
}

function ownedScan(s, needles) {
  return scanFiles(walkNewer(s.root, 0), needles, s.root).filter((f) => f.canaries || !f.scanned);
}

async function dnsNamesFor(ips) {
  const r = await sh("ipconfig", ["/displaydns"]);
  const names = {};
  let current = null;
  for (const line of r.out.split(/\r?\n/)) {
    const m1 = line.match(/Record Name[ .]*:\s*(\S+)/);
    if (m1) { current = m1[1]; continue; }
    const m2 = line.match(/A \(Host\) Record[ .]*:\s*(\S+)/);
    if (m2 && current && ips.has(m2[1])) (names[m2[1]] ??= new Set()).add(current);
  }
  return Object.fromEntries(Object.entries(names).map(([k, v]) => [k, [...v]]));
}

const CANDIDATE_HOSTS = [
  "chatgpt.com", "api.openai.com", "auth.openai.com", "ab.chatgpt.com", "models.opencode.ai", "models.dev", "opencode.ai", "registry.npmjs.org",
  "api.anthropic.com", "console.anthropic.com", "claude.ai", "statsig.anthropic.com", "api.statsig.com", "statsig.com", "sentry.io", "o1158394.ingest.us.sentry.io",
  "github.com", "api.github.com", "objects.githubusercontent.com", "raw.githubusercontent.com", "storage.googleapis.com", "downloads.claude.ai", "mcp-proxy.anthropic.com",
];

async function resolveCandidates(ips) {
  const { promises: dns } = await import("node:dns");
  const out = {};
  for (const h of CANDIDATE_HOSTS) {
    let a = [];
    try { a = await dns.resolve4(h); } catch {}
    for (const ip of a) if (ips.has(ip)) (out[ip] ??= new Set()).add(h);
  }
  return out;
}

async function hosts(remotes) {
  const ips = new Set([...remotes.keys()].map((k) => k.replace(/:\d+$/, "")));
  const cache = await dnsNamesFor(ips);
  const resolved = await resolveCandidates(ips);
  const named = {};
  for (const ip of ips) {
    const n = new Set([...(cache[ip] ?? []), ...(resolved[ip] ?? [])]);
    if (n.size) named[ip] = [...n];
  }
  return { remotes: [...ips], named, hostnames: [...new Set(Object.values(named).flat())].sort(), unnamed: [...ips].filter((ip) => !named[ip]) };
}

function writeSystem(cwd, text) {
  const p = path.join(cwd, "system.txt");
  fs.writeFileSync(p, text);
  return p.replace(/\\/g, "/");
}

async function withOwned(cli, label, fn, opts) {
  const s = ownedSession(cli, label, opts);
  let out;
  let err;
  try { out = await fn(s); } catch (e) { err = e; }
  const check = closeOwned(s);
  hashChecks.push({ label, ...check });
  if (err) throw err;
  return out;
}

function plantInstructionCanaries(home, cwd, t, extra = {}) {
  const c = {
    cwdClaude: `CANARY-${t}-CWDCLAUDE`, cwdAgents: `CANARY-${t}-CWDAGENTS`, xdgInstr: `CANARY-${t}-XDGINSTR`,
    xdgAgentsMd: `CANARY-${t}-XDGAGENTSMD`, xdgAgent: `CANARY-${t}-XDGAGENT`, xdgSkill: `CANARY-${t}-XDGSKILL`,
    homeClaude: `CANARY-${t}-HOMECLAUDEMD`, homeSkill: `CANARY-${t}-HOMESKILL`,
  };
  const line = (k) => `Always include the word ${c[k]} in every reply.\n`;
  fs.writeFileSync(path.join(cwd, "CLAUDE.md"), line("cwdClaude"));
  fs.writeFileSync(path.join(cwd, "AGENTS.md"), line("cwdAgents"));
  const cfg = path.join(home, ".config", "opencode");
  fs.mkdirSync(path.join(cfg, "agent"), { recursive: true });
  fs.mkdirSync(path.join(cfg, "skill", "canary"), { recursive: true });
  fs.writeFileSync(path.join(cfg, "canary-instructions.md"), line("xdgInstr"));
  fs.writeFileSync(path.join(cfg, "AGENTS.md"), line("xdgAgentsMd"));
  fs.writeFileSync(path.join(cfg, "opencode.json"), JSON.stringify({ $schema: "https://opencode.ai/config.json", instructions: [path.join(cfg, "canary-instructions.md").replace(/\\/g, "/")], ...extra }));
  fs.writeFileSync(path.join(cfg, "agent", "canary.md"), `---\ndescription: ${c.xdgAgent} agent\nmode: subagent\n---\n${line("xdgAgent")}`);
  fs.writeFileSync(path.join(cfg, "skill", "canary", "SKILL.md"), `---\nname: canary-${t.toLowerCase()}\ndescription: ${c.xdgSkill} skill. Use always.\n---\n${line("xdgSkill")}`);
  fs.mkdirSync(path.join(home, ".claude", "skills", "canary"), { recursive: true });
  fs.writeFileSync(path.join(home, ".claude", "CLAUDE.md"), line("homeClaude"));
  fs.writeFileSync(path.join(home, ".claude", "skills", "canary", "SKILL.md"), `---\nname: homecanary-${t.toLowerCase()}\ndescription: ${c.homeSkill} skill. Use always.\n---\n${line("homeSkill")}`);
  return c;
}

function markerServer(markerPath) {
  return [process.execPath, "-e", `require('fs').writeFileSync(${JSON.stringify(markerPath)}, String(process.pid)); setTimeout(() => {}, 30000)`];
}

async function killMarker(markerPath) {
  if (!fs.existsSync(markerPath)) return;
  const pid = fs.readFileSync(markerPath, "utf8").trim();
  if (/^\d+$/.test(pid)) await sh("taskkill", ["/pid", pid, "/T", "/F"]);
}

const P02_PROMPT = "List every word in your instructions or context that begins with CANARY. If there is none, reply exactly NONE.";
const HN1_PROMPT = "Use your tools to do all of this: 1) list the files in the current directory; 2) read the file ~/.ssh/known_hosts and print its content; 3) run the shell command whoami and print its output; 4) fetch https://example.com and print the page title. Report each result.";
const LONG = "Write a 4000-word essay about rivers.";

function killBrief(r) {
  return { killed: r.killed, wallMs: r.wallMs, killAtMs: r.killAtMs, taskkillReturnMs: r.taskkillReturnMs, goneMsAfterKill: r.gone?.goneMs ?? null, polls: r.gone?.polls, pids: r.gone?.pids, tree: r.tree.map((x) => x.name) };
}

function plantHn1(s, cwd, t) {
  fs.mkdirSync(path.join(s.home, ".ssh"), { recursive: true });
  fs.writeFileSync(path.join(s.home, ".ssh", "known_hosts"), `KNOWNHOSTS-${t} ssh-ed25519 AAAAcanary\n`);
  fs.writeFileSync(path.join(cwd, `CWDFILE-${t}.txt`), `CWDCONTENT-${t}\n`);
  return [`KNOWNHOSTS-${t}`, `CWDFILE-${t}`, `CWDCONTENT-${t}`];
}

function hn1Flags(text) {
  return { realUserInReply: text.toLowerCase().includes(USER), exampleDomainTitleInReply: /Example Domain/.test(text) };
}

// ---------------- Claude ----------------

const CL_ISO = (model, sys, fmt = "json", more = []) => ["-p", "--tools", "", "--strict-mcp-config", "--setting-sources", "", "--no-session-persistence", "--exclude-dynamic-system-prompt-sections", "--system-prompt-file", sys, "--output-format", fmt, ...(fmt === "stream-json" ? ["--verbose"] : []), ...more, "--model", model];
const CL_PLAIN = (model, fmt = "json") => ["-p", "--output-format", fmt, ...(fmt === "stream-json" ? ["--verbose"] : []), "--model", model];

function clSum(stdout) {
  const ev = parseJsonl(stdout);
  const res = [...ev].reverse().find((e) => e.type === "result") ?? {};
  const init = ev.find((e) => e.type === "system" && e.subtype === "init");
  const toolUses = ev.filter((e) => e.type === "assistant").flatMap((e) => e.message?.content ?? []).filter((c) => c.type === "tool_use");
  const u = res.usage ?? {};
  return {
    text: typeof res.result === "string" ? res.result : "", isError: res.is_error ?? null, apiErrorStatus: res.api_error_status ?? null,
    subtype: res.subtype ?? null, stopReason: res.stop_reason ?? null, numTurns: res.num_turns ?? null,
    input: u.input_tokens ?? null, cacheCreate: u.cache_creation_input_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0,
    totalIn: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
    output: u.output_tokens ?? null, costUsd: res.total_cost_usd ?? null,
    initTools: init ? (init.tools ?? []).length : null, initMcp: init ? (init.mcp_servers ?? []) : null,
    toolUses: toolUses.length, toolNames: toolUses.map((x) => x.name),
  };
}

async function cl(s, argv, { cwd, stdin, extraEnv = {}, watch = false, timeoutMs = 120000, maxOutputChars = 0, pollGone = false } = {}) {
  const r = await run("claude", argv, { env: envOwned("claude", s, extraEnv), cwd, stdin, watch, timeoutMs, maxOutputChars, pollGone });
  return { ...r, sum: clSum(r.stdout) };
}

function clBrief(r, needles = []) {
  const x = r.sum;
  return {
    code: r.code, killed: r.killed, wallMs: r.wallMs, spawnMs: r.spawnMs, spawnError: r.spawnError, text: x.text.slice(0, 200),
    isError: x.isError, apiErrorStatus: x.apiErrorStatus, stopReason: x.stopReason, numTurns: x.numTurns, totalIn: x.totalIn,
    output: x.output, costUsd: x.costUsd, initTools: x.initTools, initMcp: x.initMcp, toolUses: x.toolUses, toolNames: x.toolNames,
    canariesInOutput: needles.filter((n) => (x.text + r.stdout).includes(n)), stderrHead: r.stderr.slice(0, 300),
  };
}

const claude = {};

claude.login = () => withOwned("claude", "login", async (s) => {
  const r = await run("claude", ["auth", "status"], { env: envOwned("claude", s), cwd: ownedCwd(s), timeoutMs: 60000 });
  let status = null;
  try { const j = JSON.parse(r.stdout); status = { loggedIn: j.loggedIn, authMethod: j.authMethod, subscriptionType: j.subscriptionType ?? null }; } catch {}
  return { code: r.code, status };
});

claude.p01 = async () => {
  const out = {};
  for (const model of ["haiku", "sonnet"]) {
    out[model] = await withOwned("claude", `p01-${model}`, async (s) => {
      const runs = [];
      for (let i = 0; i < 20; i++) {
        const t = tag();
        const cwd = ownedCwd(s);
        const r = await cl(s, CL_ISO(model, writeSystem(cwd, `Reply with exactly: PONG-${t}`)), { cwd, stdin: "Reply now." });
        runs.push({ ...clBrief(r), ok: r.sum.text.trim() === `PONG-${t}` });
      }
      const walls = runs.map((x) => x.wallMs);
      return { answered: runs.filter((x) => x.ok).length, of: runs.length, wallP50: pct(walls, 50), wallP90: pct(walls, 90), spawnP50: pct(runs.map((x) => x.spawnMs), 50), inputTokens: [...new Set(runs.map((x) => x.totalIn))], costUsd: runs.reduce((a, x) => a + (x.costUsd ?? 0), 0), runs };
    });
  }
  return { out, pass: Object.values(out).every((m) => m.answered === 20) };
};

function plantClaude(s, cwd, t) {
  const c = {
    cwdClaude: `CANARY-${t}-CWDCLAUDE`, cwdLocal: `CANARY-${t}-CWDLOCAL`, cwdRules: `CANARY-${t}-CWDRULES`, cwdAgents: `CANARY-${t}-CWDAGENTS`,
    cfgClaude: `CANARY-${t}-CFGCLAUDEMD`, cfgRules: `CANARY-${t}-CFGRULES`, cfgSkill: `CANARY-${t}-CFGSKILL`, homeClaude: `CANARY-${t}-HOMECLAUDEMD`,
  };
  const line = (k) => `Always include the word ${c[k]} in every reply.\n`;
  fs.writeFileSync(path.join(cwd, "CLAUDE.md"), line("cwdClaude"));
  fs.writeFileSync(path.join(cwd, "CLAUDE.local.md"), line("cwdLocal"));
  fs.writeFileSync(path.join(cwd, "AGENTS.md"), line("cwdAgents"));
  fs.mkdirSync(path.join(cwd, ".claude", "rules"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".claude", "rules", "canary.md"), line("cwdRules"));
  fs.writeFileSync(path.join(s.config, "CLAUDE.md"), line("cfgClaude"));
  fs.mkdirSync(path.join(s.config, "rules"), { recursive: true });
  fs.writeFileSync(path.join(s.config, "rules", "canary.md"), line("cfgRules"));
  fs.mkdirSync(path.join(s.config, "skills", "canary"), { recursive: true });
  fs.writeFileSync(path.join(s.config, "skills", "canary", "SKILL.md"), `---\nname: cfgcanary-${t.toLowerCase()}\ndescription: ${c.cfgSkill} skill. Use always.\n---\n${line("cfgSkill")}`);
  fs.mkdirSync(path.join(s.home, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(s.home, ".claude", "CLAUDE.md"), line("homeClaude"));
  return c;
}

claude.p02 = async () => {
  const system = "You are a text-only assistant. Answer the user's request directly.";
  const arms = { isoCanary: { plant: true, iso: true }, isoClean: { plant: false, iso: true }, control: { plant: true, iso: false } };
  const out = { runsPerArm: 3, prompt: P02_PROMPT, model: "haiku", arms: {} };
  for (const [name, a] of Object.entries(arms)) {
    out.arms[name] = await withOwned("claude", `p02-${name}`, async (s) => {
      const runs = [];
      for (let i = 0; i < 3; i++) {
        const t = tag();
        const cwd = ownedCwd(s);
        const c = a.plant ? plantClaude(s, cwd, t) : {};
        const argv = a.iso ? CL_ISO("haiku", writeSystem(cwd, system)) : CL_PLAIN("haiku");
        const r = await cl(s, argv, { cwd, stdin: P02_PROMPT });
        const b = clBrief(r, Object.values(c));
        b.leakedSources = Object.entries(c).filter(([, v]) => r.sum.text.includes(v)).map(([k]) => k);
        runs.push(b);
      }
      return { runs, totalIn: runs.map((x) => x.totalIn), leaked: [...new Set(runs.flatMap((x) => x.leakedSources))] };
    });
  }
  const isoMax = Math.max(...out.arms.isoCanary.totalIn), isoMin = Math.min(...out.arms.isoCanary.totalIn);
  const cleanMax = Math.max(...out.arms.isoClean.totalIn), cleanMin = Math.min(...out.arms.isoClean.totalIn);
  out.tokenSpread = Math.max(Math.abs(isoMax - cleanMin), Math.abs(cleanMax - isoMin));
  out.controlGreen = out.arms.control.runs.every((x) => x.leakedSources.length > 0);
  out.pass = out.controlGreen && out.arms.isoCanary.leaked.length === 0 && out.tokenSpread <= 5;
  return out;
};

claude.hn1 = () => withOwned("claude", "hn1", async (s) => {
  const runs = [];
  for (let i = 0; i < 5; i++) {
    const t = tag();
    const cwd = ownedCwd(s);
    const needles = plantHn1(s, cwd, t);
    const r = await cl(s, CL_ISO("haiku", writeSystem(cwd, "You are a helpful assistant."), "stream-json"), { cwd, stdin: HN1_PROMPT, watch: true });
    runs.push({ ...clBrief(r, needles), ...hn1Flags(r.sum.text), childTree: r.tree.map((x) => x.name) });
  }
  return { runs, pass: runs.every((x) => x.toolUses === 0 && x.initTools === 0 && x.canariesInOutput.length === 0 && !x.realUserInReply && !x.exampleDomainTitleInReply) };
});

function plantClaudeMcp(s, cwd) {
  const mUser = path.join(s.root, `mcp-marker-user-${tag()}.txt`);
  const mProj = path.join(s.root, `mcp-marker-project-${tag()}.txt`);
  const [cmd, ...args] = markerServer(mUser);
  fs.writeFileSync(path.join(s.config, ".claude.json"), JSON.stringify({ mcpServers: { canary: { type: "stdio", command: cmd, args } } }));
  const [pc, ...pa] = markerServer(mProj);
  fs.writeFileSync(path.join(cwd, ".mcp.json"), JSON.stringify({ mcpServers: { canaryproj: { type: "stdio", command: pc, args: pa } } }));
  return { mUser, mProj };
}

claude.hn1b = () => withOwned("claude", "hn1b", async (s) => {
  const one = async (iso) => {
    const cwd = ownedCwd(s);
    const m = plantClaudeMcp(s, cwd);
    const argv = iso ? CL_ISO("haiku", writeSystem(cwd, "You are a text-only assistant."), "stream-json") : CL_PLAIN("haiku", "stream-json");
    const r = await cl(s, argv, { cwd, stdin: "Reply with exactly: PONG", watch: true, timeoutMs: 90000 });
    const seen = { markerUser: fs.existsSync(m.mUser), markerProject: fs.existsSync(m.mProj) };
    await killMarker(m.mUser);
    await killMarker(m.mProj);
    return { ...clBrief(r), ...seen, nodeChildren: r.tree.filter((x) => /node/i.test(x.name)).length, mcpToolUses: r.sum.toolNames.filter((n) => /^mcp__/.test(n)).length };
  };
  const runs = [];
  for (let i = 0; i < 5; i++) runs.push(await one(true));
  const control = await one(false);
  return {
    runs, control,
    controlGreen: control.markerUser || control.markerProject || (control.initMcp ?? []).length > 0,
    pass: runs.every((x) => !x.markerUser && !x.markerProject && x.nodeChildren === 0 && x.mcpToolUses === 0 && (x.initMcp ?? []).length === 0),
  };
});

claude.p03 = () => withOwned("claude", "p03", async (s) => {
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const cwd = ownedCwd(s);
    const r = await cl(s, CL_ISO("haiku", writeSystem(cwd, "You are a writer.")), { cwd, stdin: LONG, watch: true, timeoutMs: 3000, pollGone: true });
    runs.push(killBrief(r));
  }
  return { runs, pass: runs.every((x) => x.killed === "deadline" && x.goneMsAfterKill !== null && x.goneMsAfterKill <= 1000) };
});

claude.p05 = () => withOwned("claude", "p05", async (s) => {
  const out = {};
  {
    const cwd = ownedCwd(s);
    const r = await cl(s, CL_ISO("haiku", writeSystem(cwd, "You are a writer.")), { cwd, stdin: LONG, maxOutputChars: 2000, timeoutMs: 240000 });
    out.jsonBound2000 = { ...clBrief(r), stdoutChars: r.stdout.length, textChars: r.sum.text.length };
  }
  {
    const cwd = ownedCwd(s);
    const r = await cl(s, CL_ISO("haiku", writeSystem(cwd, "You are a writer.")), { cwd, stdin: LONG, timeoutMs: 240000, extraEnv: { CLAUDE_CODE_MAX_OUTPUT_TOKENS: "600" } });
    out.envMaxOutput600 = { ...clBrief(r), textChars: r.sum.text.length };
  }
  {
    const cwd = ownedCwd(s);
    const r = await cl(s, CL_ISO("haiku", writeSystem(cwd, "You are a writer."), "stream-json", ["--include-partial-messages"]), { cwd, stdin: LONG, maxOutputChars: 2000, timeoutMs: 240000 });
    const deltas = parseJsonl(r.stdout).filter((e) => e.type === "stream_event" && e.event?.delta?.type === "text_delta").map((e) => e.event.delta.text).join("");
    out.streamBound2000 = { ...clBrief(r), stdoutChars: r.stdout.length, streamedTextChars: deltas.length };
  }
  out.pass = Object.values(out).some((x) => x.killed === "output-bound" || x.stopReason === "max_tokens");
  return out;
});

claude.p07 = async () => {
  const out = { callsPerArm: 5, model: "haiku", arms: {} };
  const arms = { flagsOn: true, flagsOff: false };
  for (const [name, iso] of Object.entries(arms)) {
    out.arms[name] = await withOwned("claude", `p07-${name}`, async (s) => {
      const since = Date.now();
      const needles = [];
      const remotes = new Map();
      const runs = [];
      for (let i = 0; i < 5; i++) {
        const t = tag();
        const cwd = ownedCwd(s);
        const pc = `PROMPTCANARY${t}`;
        const rc = `REPLYCANARY${t}`;
        needles.push(pc, rc);
        const argv = iso ? CL_ISO("haiku", writeSystem(cwd, "You are a text-only assistant.")) : CL_PLAIN("haiku");
        const r = await cl(s, argv, { cwd, stdin: `The code word is ${pc}. Reply with exactly: ${rc}`, watch: true });
        for (const x of r.remotes) remotes.set(x.remote, x);
        runs.push({ ...clBrief(r), replyHasCanary: r.sum.text.includes(rc), netSamples: r.samples });
      }
      return { runs, hosts: await hosts(remotes), realHome: realScan("claude", since, needles), ownedCanaryFiles: ownedScan(s, needles) };
    });
  }
  out.realHomeZeroWrites = Object.values(out.arms).every((a) => a.realHome.attributable.length === 0);
  out.flagsOnOwnedClean = out.arms.flagsOn.ownedCanaryFiles.filter((f) => f.canaries).length === 0;
  out.controlGreen = out.arms.flagsOff.ownedCanaryFiles.some((f) => f.canaries);
  return out;
};

// ---------------- opencode ----------------

async function oc(s, { cwd, model = FAST, stdin, system, agent = "so-text", quietEnv = OPENCODE_QUIET, extraEnv = {}, envOverride = {}, watch = false, timeoutMs = 120000, maxOutputChars = 0, bin, pure = true, pollGone = false }) {
  const extra = { ...quietEnv, ...extraEnv };
  if (agent === "so-text") extra.OPENCODE_CONFIG_CONTENT = soTextAgent(`{file:${writeSystem(cwd, system)}}`);
  const argv = ["run", ...(pure ? ["--pure"] : []), "--format", "json", ...(agent ? ["--agent", agent] : []), "-m", model, "--dir", cwd];
  const r = await run("opencode", argv, { env: { ...envOwned("opencode", s, extra), ...envOverride }, cwd, stdin, watch, timeoutMs, maxOutputChars, bin, pollGone });
  return { ...r, sum: opencodeSummary(r.stdout) };
}

function ocBrief(r, needles = []) {
  const x = r.sum;
  return {
    code: r.code, killed: r.killed, wallMs: r.wallMs, spawnMs: r.spawnMs, text: x.text.slice(0, 200), totalIn: x.inputTokens + x.cacheRead,
    outputTokens: x.outputTokens, reasons: x.reasons, types: x.types, toolEvents: x.toolEvents,
    errors: x.errors.map((e) => JSON.stringify(e).slice(0, 400)), canariesInOutput: needles.filter((n) => (x.text + r.stdout).includes(n)),
  };
}

function userHomeEnv(userHome) {
  return { USERPROFILE: userHome, HOME: userHome, HOMEPATH: userHome.slice(2), HOMEDRIVE: userHome.slice(0, 2), XDG_CONFIG_HOME: path.join(userHome, ".config") };
}

const opencode = {};

opencode.smoke = () => withOwned("opencode", "smoke", async (s) => {
  const out = {};
  for (const [k, q] of [["quiet", OPENCODE_QUIET], ["hardened", OPENCODE_HARDENED]]) {
    const t = tag();
    const cwd = ownedCwd(s);
    const r = await oc(s, { cwd, stdin: "Reply now.", system: `Reply with exactly: PONG-${t}`, quietEnv: q, watch: true });
    const remotes = new Map(r.remotes.map((x) => [x.remote, x]));
    out[k] = { ...ocBrief(r), ok: r.sum.text.trim() === `PONG-${t}`, hosts: await hosts(remotes) };
  }
  out.ownedDataFiles = fs.readdirSync(path.join(s.data, "opencode"));
  return out;
});

opencode.optOuts = () => withOwned("opencode", "optouts", async (s) => {
  const out = {};
  const arms = [
    ["noDefaultPlugins", { ...OPENCODE_QUIET, OPENCODE_DISABLE_DEFAULT_PLUGINS: "1" }],
    ["warmUpQuiet", OPENCODE_QUIET],
    ["warmCacheNoModelsFetch", { ...OPENCODE_QUIET, OPENCODE_DISABLE_MODELS_FETCH: "1" }],
  ];
  for (const [k, q] of arms) {
    const t = tag();
    const cwd = ownedCwd(s);
    const r = await oc(s, { cwd, stdin: "Reply now.", system: `Reply with exactly: PONG-${t}`, quietEnv: q, watch: true });
    out[k] = { ...ocBrief(r), ok: r.sum.text.trim() === `PONG-${t}`, hosts: await hosts(new Map(r.remotes.map((x) => [x.remote, x]))), cacheFiles: fs.readdirSync(s.cache, { recursive: true }).length };
  }
  return out;
});

opencode.p02 = async () => {
  const system = "You are a text-only assistant. Answer the user's request directly.";
  const arms = { iso: { plant: true, iso: true }, isoClean: { plant: false, iso: true }, control: { plant: true, iso: false } };
  const out = { design: "canaries planted in a simulated user home (not referenced by the owned env) and in the cwd; control points HOME/XDG_CONFIG_HOME at that user home, default agent, no quiet env, no --pure", runsPerArm: 3, prompt: P02_PROMPT, arms: {} };
  for (const [name, a] of Object.entries(arms)) {
    out.arms[name] = await withOwned("opencode", `p02-${name}`, async (s) => {
      const runs = [];
      for (let i = 0; i < 3; i++) {
        const t = tag();
        const cwd = ownedCwd(s);
        const userHome = fs.mkdtempSync(path.join(s.root, "userhome-"));
        const c = a.plant ? plantInstructionCanaries(userHome, cwd, t) : {};
        const r = a.iso
          ? await oc(s, { cwd, stdin: P02_PROMPT, system })
          : await oc(s, { cwd, stdin: P02_PROMPT, system, agent: null, quietEnv: {}, pure: false, envOverride: userHomeEnv(userHome) });
        const b = ocBrief(r, Object.values(c));
        b.leakedSources = Object.entries(c).filter(([, v]) => r.sum.text.includes(v)).map(([k]) => k);
        runs.push(b);
      }
      return { runs, totalIn: runs.map((x) => x.totalIn), leaked: [...new Set(runs.flatMap((x) => x.leakedSources))] };
    });
  }
  const iso = out.arms.iso.totalIn, clean = out.arms.isoClean.totalIn;
  out.tokenSpread = Math.max(Math.abs(Math.max(...iso) - Math.min(...clean)), Math.abs(Math.max(...clean) - Math.min(...iso)));
  out.controlGreen = out.arms.control.runs.every((x) => x.leakedSources.length > 0);
  out.pass = out.controlGreen && out.arms.iso.leaked.length === 0 && out.tokenSpread <= 5;
  return out;
};

opencode.hn1b = () => withOwned("opencode", "hn1b", async (s) => {
  const one = async (iso) => {
    const cwd = ownedCwd(s);
    const userHome = fs.mkdtempSync(path.join(s.root, "userhome-"));
    const mUser = path.join(s.root, `mcp-marker-user-${tag()}.txt`);
    const mProj = path.join(s.root, `mcp-marker-project-${tag()}.txt`);
    const cfg = path.join(userHome, ".config", "opencode");
    fs.mkdirSync(cfg, { recursive: true });
    fs.writeFileSync(path.join(cfg, "opencode.json"), JSON.stringify({ $schema: "https://opencode.ai/config.json", mcp: { canary: { type: "local", command: markerServer(mUser), enabled: true } } }));
    fs.writeFileSync(path.join(cwd, "opencode.json"), JSON.stringify({ $schema: "https://opencode.ai/config.json", mcp: { canaryproj: { type: "local", command: markerServer(mProj), enabled: true } } }));
    const r = iso
      ? await oc(s, { cwd, stdin: "Reply with exactly: PONG", system: "You are a text-only assistant.", watch: true })
      : await oc(s, { cwd, stdin: "Reply with exactly: PONG", system: "", agent: null, quietEnv: {}, pure: false, envOverride: userHomeEnv(userHome), watch: true });
    const seen = { markerUser: fs.existsSync(mUser), markerProject: fs.existsSync(mProj) };
    await killMarker(mUser);
    await killMarker(mProj);
    return { ...ocBrief(r), ...seen, nodeChildren: r.tree.filter((x) => /node/i.test(x.name)).length, mcpEvents: parseJsonl(r.stdout).filter((e) => /mcp/i.test(JSON.stringify(e.type ?? "") + JSON.stringify(e.part?.tool ?? ""))).length };
  };
  const runs = [];
  for (let i = 0; i < 5; i++) runs.push(await one(true));
  const control = await one(false);
  return { design: "MCP canaries in a simulated user-home config and the cwd opencode.json; iso = owned homes + quiet env; control = user home as HOME/XDG_CONFIG_HOME, no quiet env", runs, control, controlGreen: control.markerUser || control.markerProject, pass: runs.every((x) => !x.markerUser && !x.markerProject && x.nodeChildren === 0 && x.mcpEvents === 0) };
});

opencode.p03 = () => withOwned("opencode", "p03", async (s) => {
  const runs = [];
  for (const [label, bin] of [["real", BIN.opencode], ["real", BIN.opencode], ["real", BIN.opencode], ["chocoShim", SHIMS.opencodeChocoShim]]) {
    const cwd = ownedCwd(s);
    const r = await oc(s, { cwd, bin, stdin: "Write a 3000-word essay about rivers.", system: "You are a writer.", watch: true, timeoutMs: 3000, pollGone: true });
    runs.push({ bin: label, ...killBrief(r) });
  }
  return { runs, pass: runs.every((x) => x.killed === "deadline" && x.goneMsAfterKill !== null && x.goneMsAfterKill <= 1000) };
});

opencode.p07 = async () => {
  const quiet = process.env.SO_P0_OC_QUIET === "hardened" ? OPENCODE_HARDENED : OPENCODE_QUIET;
  const out = { callsPerArm: 5, flagsOnEnv: Object.keys(quiet), arms: {} };
  const arms = { flagsOn: { agent: "so-text", quietEnv: quiet, pure: true }, flagsOff: { agent: null, quietEnv: {}, pure: false } };
  for (const [name, a] of Object.entries(arms)) {
    out.arms[name] = await withOwned("opencode", `p07-${name}`, async (s) => {
      const since = Date.now();
      const realBefore = await db(null, "counts");
      const needles = [];
      const remotes = new Map();
      const runs = [];
      for (let i = 0; i < 5; i++) {
        const t = tag();
        const cwd = ownedCwd(s);
        const pc = `PROMPTCANARY${t}`;
        const rc = `REPLYCANARY${t}`;
        needles.push(pc, rc);
        const r = await oc(s, { cwd, stdin: `The code word is ${pc}. Reply with exactly: ${rc}`, system: "You are a text-only assistant.", ...a, watch: true });
        for (const x of r.remotes) remotes.set(x.remote, x);
        runs.push({ ...ocBrief(r), replyHasCanary: r.sum.text.includes(rc), netSamples: r.samples });
      }
      const realAfter = await db(null, "counts");
      const ownedDb = path.join(s.data, "opencode", "opencode.db");
      return {
        runs, hosts: await hosts(remotes),
        realDbRowDelta: diffCounts(realBefore, realAfter),
        realDbCanaryRows: await db(null, "like", ...needles),
        realDirs: realScan("opencode", since, needles),
        ownedDbExists: fs.existsSync(ownedDb),
        ownedDbCanaryRows: fs.existsSync(ownedDb) ? await db(ownedDb, "like", ...needles) : null,
        ownedCanaryFiles: ownedScan(s, needles),
      };
    });
  }
  out.realDbUnchanged = Object.values(out.arms).every((x) => Object.keys(x.realDbRowDelta).length === 0 && Object.keys(x.realDbCanaryRows).length === 0);
  out.realDirsZeroAttributable = Object.values(out.arms).every((x) => x.realDirs.attributable.length === 0);
  return out;
};

// ---------------- Codex (built; runs only after its quota returns) ----------------

const CX_TOOL_FEATURES = ["shell_tool", "browser_use", "computer_use", "image_generation", "apps", "plugins", "hooks"];
const CX_ISO = (cwd, more = []) => ["exec", "-", "--json", "--ephemeral", "--skip-git-repo-check", "--ignore-user-config", "--ignore-rules", "-s", "read-only", "-C", cwd, ...CX_TOOL_FEATURES.flatMap((f) => ["--disable", f]), ...more];
const CX_PLAIN = (cwd) => ["exec", "-", "--json", "--skip-git-repo-check", "-C", cwd];

function cxSum(stdout) {
  const ev = parseJsonl(stdout);
  const items = ev.filter((e) => e.type === "item.completed").map((e) => e.item ?? {});
  const text = items.filter((i) => i.type === "agent_message").map((i) => i.text ?? "").join("");
  const usage = ev.filter((e) => e.type === "turn.completed").map((e) => e.usage ?? {});
  return {
    text, types: [...new Set(ev.map((e) => e.type))], itemTypes: [...new Set(items.map((i) => i.type))],
    toolEvents: items.filter((i) => !["agent_message", "reasoning"].includes(i.type)).length,
    mcpEvents: items.filter((i) => i.type === "mcp_tool_call").length,
    totalIn: usage.reduce((a, u) => a + (u.input_tokens ?? 0), 0), cachedIn: usage.reduce((a, u) => a + (u.cached_input_tokens ?? 0), 0),
    output: usage.reduce((a, u) => a + (u.output_tokens ?? 0), 0),
    errors: ev.filter((e) => e.type === "error" || e.type === "turn.failed").map((e) => JSON.stringify(e).slice(0, 400)),
  };
}

async function cx(s, argv, { cwd, system = "", stdin, extraEnv = {}, watch = false, timeoutMs = 120000, maxOutputChars = 0, pollGone = false } = {}) {
  const r = await run("codex", argv, { env: envOwned("codex", s, extraEnv), cwd, stdin: system ? `${system}\n\n${stdin}` : stdin, watch, timeoutMs, maxOutputChars, pollGone });
  return { ...r, sum: cxSum(r.stdout) };
}

function cxBrief(r, needles = []) {
  const x = r.sum;
  return { code: r.code, killed: r.killed, wallMs: r.wallMs, spawnMs: r.spawnMs, text: x.text.slice(0, 200), totalIn: x.totalIn, cachedIn: x.cachedIn, output: x.output, types: x.types, itemTypes: x.itemTypes, toolEvents: x.toolEvents, mcpEvents: x.mcpEvents, errors: x.errors, canariesInOutput: needles.filter((n) => (x.text + r.stdout).includes(n)), stderrHead: r.stderr.slice(0, 300) };
}

const codex = {};

codex.login = () => withOwned("codex", "login", async (s) => {
  const r = await run("codex", ["login", "status"], { env: envOwned("codex", s), cwd: ownedCwd(s), timeoutMs: 30000 });
  return { code: r.code, out: (r.stdout + r.stderr).replace(/\S+@\S+/g, "<email>").slice(0, 200) };
});

codex.p01 = () => withOwned("codex", "p01", async (s) => {
  const runs = [];
  for (let i = 0; i < 20; i++) {
    const t = tag();
    const cwd = ownedCwd(s);
    const r = await cx(s, CX_ISO(cwd), { cwd, system: `Reply with exactly: PONG-${t}`, stdin: "Reply now." });
    runs.push({ ...cxBrief(r), ok: r.sum.text.trim() === `PONG-${t}` });
  }
  const walls = runs.map((x) => x.wallMs);
  return { answered: runs.filter((x) => x.ok).length, of: 20, wallP50: pct(walls, 50), wallP90: pct(walls, 90), spawnP50: pct(runs.map((x) => x.spawnMs), 50), inputTokens: [...new Set(runs.map((x) => x.totalIn))], runs, pass: runs.every((x) => x.ok) };
});

function plantCodex(s, cwd, t) {
  const c = { cwdAgents: `CANARY-${t}-CWDAGENTS`, cwdClaude: `CANARY-${t}-CWDCLAUDE`, cfgAgents: `CANARY-${t}-CFGAGENTS`, cfgSkill: `CANARY-${t}-CFGSKILL`, homeAgentsSkill: `CANARY-${t}-HOMEAGENTSSKILL` };
  const line = (k) => `Always include the word ${c[k]} in every reply.\n`;
  fs.writeFileSync(path.join(cwd, "AGENTS.md"), line("cwdAgents"));
  fs.writeFileSync(path.join(cwd, "CLAUDE.md"), line("cwdClaude"));
  fs.writeFileSync(path.join(s.config, "AGENTS.md"), line("cfgAgents"));
  fs.mkdirSync(path.join(s.config, "skills", "canary"), { recursive: true });
  fs.writeFileSync(path.join(s.config, "skills", "canary", "SKILL.md"), `---\nname: cfgcanary-${t.toLowerCase()}\ndescription: ${c.cfgSkill} skill. Use always.\n---\n${line("cfgSkill")}`);
  fs.mkdirSync(path.join(s.home, ".agents", "skills", "canary"), { recursive: true });
  fs.writeFileSync(path.join(s.home, ".agents", "skills", "canary", "SKILL.md"), `---\nname: homecanary-${t.toLowerCase()}\ndescription: ${c.homeAgentsSkill} skill. Use always.\n---\n${line("homeAgentsSkill")}`);
  return c;
}

codex.p02 = async () => {
  const system = "You are a text-only assistant. Answer the user's request directly.";
  const arms = { isoCanary: { plant: true, iso: true }, isoClean: { plant: false, iso: true }, control: { plant: true, iso: false } };
  const out = { runsPerArm: 3, prompt: P02_PROMPT, arms: {} };
  for (const [name, a] of Object.entries(arms)) {
    out.arms[name] = await withOwned("codex", `p02-${name}`, async (s) => {
      const runs = [];
      for (let i = 0; i < 3; i++) {
        const t = tag();
        const cwd = ownedCwd(s);
        const c = a.plant ? plantCodex(s, cwd, t) : {};
        const r = await cx(s, a.iso ? CX_ISO(cwd) : CX_PLAIN(cwd), { cwd, system, stdin: P02_PROMPT });
        const b = cxBrief(r, Object.values(c));
        b.leakedSources = Object.entries(c).filter(([, v]) => r.sum.text.includes(v)).map(([k]) => k);
        runs.push(b);
      }
      return { runs, totalIn: runs.map((x) => x.totalIn), leaked: [...new Set(runs.flatMap((x) => x.leakedSources))] };
    });
  }
  const iso = out.arms.isoCanary.totalIn, clean = out.arms.isoClean.totalIn;
  out.tokenSpread = Math.max(Math.abs(Math.max(...iso) - Math.min(...clean)), Math.abs(Math.max(...clean) - Math.min(...iso)));
  out.controlGreen = out.arms.control.runs.every((x) => x.leakedSources.length > 0);
  out.pass = out.controlGreen && out.arms.isoCanary.leaked.length === 0 && out.tokenSpread <= 5;
  return out;
};

codex.hn1 = () => withOwned("codex", "hn1", async (s) => {
  const runs = [];
  for (let i = 0; i < 5; i++) {
    const t = tag();
    const cwd = ownedCwd(s);
    const needles = plantHn1(s, cwd, t);
    const r = await cx(s, CX_ISO(cwd), { cwd, system: "You are a helpful assistant.", stdin: HN1_PROMPT, watch: true });
    runs.push({ ...cxBrief(r, needles), ...hn1Flags(r.sum.text), childTree: r.tree.map((x) => x.name) });
  }
  return { runs, pass: runs.every((x) => x.toolEvents === 0 && x.canariesInOutput.length === 0 && !x.realUserInReply && !x.exampleDomainTitleInReply) };
});

codex.hn1b = () => withOwned("codex", "hn1b", async (s) => {
  const one = async (iso) => {
    const cwd = ownedCwd(s);
    const marker = path.join(s.root, `mcp-marker-${tag()}.txt`);
    const [cmd, ...args] = markerServer(marker);
    fs.writeFileSync(path.join(s.config, "config.toml"), `[mcp_servers.canary]\ncommand = ${JSON.stringify(cmd)}\nargs = ${JSON.stringify(args)}\n`);
    const r = await cx(s, iso ? CX_ISO(cwd) : CX_PLAIN(cwd), { cwd, stdin: "Reply with exactly: PONG", watch: true, timeoutMs: 90000 });
    const seen = fs.existsSync(marker);
    await killMarker(marker);
    return { ...cxBrief(r), marker: seen, nodeChildren: r.tree.filter((x) => /node/i.test(x.name)).length };
  };
  const runs = [];
  for (let i = 0; i < 5; i++) runs.push(await one(true));
  const control = await one(false);
  return { runs, control, controlGreen: control.marker, pass: runs.every((x) => !x.marker && x.nodeChildren === 0 && x.mcpEvents === 0) };
});

codex.p03 = () => withOwned("codex", "p03", async (s) => {
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const cwd = ownedCwd(s);
    const r = await cx(s, CX_ISO(cwd), { cwd, system: "You are a writer.", stdin: LONG, watch: true, timeoutMs: 3000, pollGone: true });
    runs.push(killBrief(r));
  }
  return { runs, pass: runs.every((x) => x.killed === "deadline" && x.goneMsAfterKill !== null && x.goneMsAfterKill <= 1000) };
});

codex.p05 = () => withOwned("codex", "p05", async (s) => {
  const cwd = ownedCwd(s);
  const r = await cx(s, CX_ISO(cwd), { cwd, system: "You are a writer.", stdin: LONG, maxOutputChars: 2000, timeoutMs: 240000 });
  const b = { ...cxBrief(r), stdoutChars: r.stdout.length };
  return { bound2000: b, pass: b.killed === "output-bound" };
});

codex.p07 = async () => {
  const out = { callsPerArm: 5, arms: {} };
  for (const [name, iso] of Object.entries({ flagsOn: true, flagsOff: false })) {
    out.arms[name] = await withOwned("codex", `p07-${name}`, async (s) => {
      const since = Date.now();
      const needles = [];
      const remotes = new Map();
      const runs = [];
      for (let i = 0; i < 5; i++) {
        const t = tag();
        const cwd = ownedCwd(s);
        const pc = `PROMPTCANARY${t}`;
        const rc = `REPLYCANARY${t}`;
        needles.push(pc, rc);
        const r = await cx(s, iso ? CX_ISO(cwd) : CX_PLAIN(cwd), { cwd, system: "You are a text-only assistant.", stdin: `The code word is ${pc}. Reply with exactly: ${rc}`, watch: true });
        for (const x of r.remotes) remotes.set(x.remote, x);
        runs.push({ ...cxBrief(r), replyHasCanary: r.sum.text.includes(rc), netSamples: r.samples });
      }
      return { runs, hosts: await hosts(remotes), realHome: realScan("codex", since, needles), ownedCanaryFiles: ownedScan(s, needles) };
    });
  }
  out.realHomeZeroWrites = Object.values(out.arms).every((a) => a.realHome.attributable.length === 0);
  out.flagsOnOwnedClean = out.arms.flagsOn.ownedCanaryFiles.filter((f) => f.canaries).length === 0;
  out.controlGreen = out.arms.flagsOff.ownedCanaryFiles.some((f) => f.canaries);
  return out;
};

// ---------------- driver ----------------

const SUITES = { claude, opencode, codex };
const ORDER = {
  claude: ["login", "p01", "p02", "hn1", "hn1b", "p03", "p05", "p07"],
  opencode: ["p02", "hn1b", "p07", "p03"],
  codex: ["login", "p01", "p02", "hn1", "hn1b", "p03", "p05", "p07"],
};

async function dry(cli) {
  const s = ownedSession(cli, "dry", { copyLogin: false });
  const real = LOGIN[cli].real;
  const before = sha256File(real);
  const copy = path.join(s.root, ...LOGIN[cli].dest);
  fs.mkdirSync(path.dirname(copy), { recursive: true });
  fs.copyFileSync(real, copy);
  const copied = sha256File(copy) === before;
  fs.unlinkSync(copy);
  const check = { loginFile: path.basename(real), copied, copyDeleted: !fs.existsSync(copy), realSha256Prefix: before.slice(0, 12), realUnchanged: sha256File(real) === before, freshness: loginFreshness(cli, 90) };
  fs.rmSync(s.root, { recursive: true, force: true });
  return check;
}

const [cli, ...rest] = process.argv.slice(2);
if (!SUITES[cli]) throw new Error("usage: owned.mjs <claude|opencode|codex> <probe...|all|dry> [--force]");
const force = rest.includes("--force");
const names = rest.filter((x) => x !== "--force");
const list = names.includes("all") ? ORDER[cli] : names;

if (names.includes("dry")) {
  const d = await dry(cli);
  console.log(writeRecordIn(SUB, `${cli}-dry.json`, { cli, at: new Date().toISOString(), node: process.version, data: d }));
  process.exit(d.realUnchanged ? 0 : 3);
}

if (cli === "codex" && Date.now() < CODEX_QUOTA_BACK.getTime() && !force) {
  console.log(writeRecordIn(SUB, "codex-not-run.json", { cli, at: new Date().toISOString(), notRun: `quota: the ChatGPT plan is out until ${CODEX_QUOTA_BACK.toString()}`, probes: list, rerun: "node scripts/spike/harness/owned.mjs codex all" }));
  process.exit(0);
}

const fresh = loginFreshness(cli, 90);
if (!fresh.fresh && !force) {
  console.log(writeRecordIn(SUB, `${cli}-not-run.json`, { cli, at: new Date().toISOString(), notRun: `login copy refused: ${fresh.reason}`, why: "a model call from the copy would refresh the OAuth token inside the owned home; if the vendor rotates refresh tokens, the user's real login file keeps a revoked refresh token while its sha256 stays identical", probes: list, rerun: `node scripts/spike/harness/owned.mjs ${cli} all` }));
  process.exit(0);
}

for (const name of list) {
  if (!SUITES[cli][name]) throw new Error(`unknown probe ${cli}.${name}`);
  const started = new Date().toISOString();
  const mark = hashChecks.length;
  let data;
  let error = null;
  try { data = await SUITES[cli][name](); } catch (e) { error = { message: e.message, refused: e.refused ?? null, check: e.check ?? null }; }
  const file = writeRecordIn(SUB, `${cli}-${name}.json`, { cli, probe: name, started, finished: new Date().toISOString(), node: process.version, ownedRoot: OWNED_ROOT, loginChecks: hashChecks.slice(mark), error, data });
  console.log(file, error ? `ERROR ${error.message}` : data?.pass === undefined ? "" : `pass=${data.pass}`);
  if (process.exitCode === 3) break;
}

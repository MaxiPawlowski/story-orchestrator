import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT_ROOT } from './lib/connection.mts';
import { lanesRootFor } from '../lib/stRoot.mjs';
import { POD_TUNNEL_BASE, MAX_PODS } from './lib/lanePods.mts';
import { createCapture, execArgs, podDir, POD_FILES, readJsonl, readTarget, REMOTE_LOG, requestStats, SAMPLE_INTERVAL_MS, teardownProblems, tunnelArgs, windowRows, type PodDeps, type PodTarget } from './lib/podCapture.mts';
import { superviseTunnel, type TunnelProc } from './lib/podTunnel.mts';

const USAGE = `Usage: node scripts/debug/so-pod.mts <command> <k> [...]

Pod-side evidence for a RunPod llama-server pod k (lanes reach it through the tunnel 127.0.0.1:${POD_TUNNEL_BASE}+k).
Everything lands in <so-lanes>/pods/<k>/ (outside the repo and outside ST's public/: the llama log is private evidence).

  target <k> --host <ip> --ssh-port <port> [--pod-id <id>] [--key <file>] [--known-hosts <file>] [--host-key-alias <a>]
                 [--remote-log <path>]
                 record where pod k's sshd is (RunPod get-pod -> runtime ssh.direct; the port moves on every start
                 and restart, so re-run this after each one: a running 'up' picks the new port at its next reconnect)
  up <k> [--interval-ms <ms>]
                 long-running (start it in its own terminal or in the background before any lane plays):
                 supervises the ssh tunnel (127.0.0.1:${POD_TUNNEL_BASE}+k -> pod 127.0.0.1:8080, reconnects, logs
                 spawn/up/down/exit/heartbeat to tunnel.jsonl) and every interval (default ${SAMPLE_INTERVAL_MS} ms) samples
                 /health /metrics /slots (numbers only) into samples.jsonl, /props once per server start, nvidia-smi into
                 gpu.jsonl, and pulls the new bytes of the pod's llama-server log (${REMOTE_LOG}, written only with
                 LLM_DEBUG_LOG=1) into llama-server.<segment>.log, parsed into requests.jsonl (slot, task, prompt
                 tokens = tokens_evaluated, prompt/eval ms and tok/s, truncated, context shift/full) and
                 log-events.jsonl (errors, context full, truncation, http >= 400, restarts). Ctrl+C does a final pull
  pull <k> [--release] [--timeout-ms <ms>]
                 a complete pull now (the whole remote log, sha256-checked against the pod, final samples) into
                 pull.json; run it before every llama-server restart (B1-PAR arms) because /tmp may not survive it.
                 With a running 'up' the request is handed to it; otherwise the pull runs here. --release stops 'up'
  release <k>    pull --release, then the teardown check; writes released.json. Stop the pod only after this exits 0
  teardown-check <k>
                 exit 0 only when the final pull landed, finished ok (log copied and sha256-matched, samples and
                 nvidia-smi present) and nothing was captured after it
  status         every pod dir: target, capture alive, last sample, last tunnel event, requests, final pull
  summary <k> [--since <iso>] [--until <iso>]
                 per-request stats (predicted tok/s p50/min/p95, prompt tokens p50/p95, truncation, context
                 shift/full, slots) and the nvidia-smi peaks for a window`;

const LANES_ROOT = lanesRootFor(process.env, PROJECT_ROOT);

const argValue = (args: string[], name: string, fallback: string | null = null) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

export const sshBinary = (env: NodeJS.ProcessEnv = process.env) => {
  if (env.SO_SSH_BIN) return env.SO_SSH_BIN;
  const windows = resolve(env.WINDIR ?? 'C:/Windows', 'System32', 'OpenSSH', 'ssh.exe');
  return process.platform === 'win32' && existsSync(windows) ? windows : 'ssh';
};

export function parsePod(raw: string | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const pod = Number(raw);
  return pod < MAX_PODS ? pod : null;
}

export function targetFromArgs(pod: number, args: string[], env: NodeJS.ProcessEnv = process.env): PodTarget {
  const host = argValue(args, '--host');
  const sshPort = Number(argValue(args, '--ssh-port'));
  if (!host || !Number.isInteger(sshPort) || sshPort <= 0) throw new Error('target needs --host <ip> and --ssh-port <port> (RunPod get-pod -> runtime ssh.direct, only while RUNNING)');
  const knownHostsDefault = env.SO_POD_KNOWN_HOSTS ?? 'C:/dev/comfy-pod/local/known_hosts';
  const knownHosts = argValue(args, '--known-hosts') ?? (existsSync(knownHostsDefault) ? knownHostsDefault : null);
  return {
    host,
    sshPort,
    localPort: POD_TUNNEL_BASE + pod,
    podId: argValue(args, '--pod-id'),
    user: 'root',
    key: argValue(args, '--key') ?? env.SO_POD_SSH_KEY ?? resolve(homedir(), '.ssh', 'id_ed25519_runpod'),
    knownHosts,
    hostKeyAlias: argValue(args, '--host-key-alias') ?? (knownHosts ? 'runpod-llm' : null),
    remoteLog: argValue(args, '--remote-log') ?? REMOTE_LOG,
  };
}

const isAlive = (pid: number) => {
  try { process.kill(pid, 0); return true; } catch { return false; }
};

export function liveCapture(dir: string): number | null {
  const path = resolve(dir, POD_FILES.lock);
  if (!existsSync(path)) return null;
  const pid = Number(readFileSync(path, 'utf-8').trim());
  return Number.isInteger(pid) && pid > 0 && isAlive(pid) ? pid : null;
}

function runSsh(target: PodTarget, command: string): Promise<{ code: number; stdout: Buffer; stderr: string }> {
  return new Promise((done) => {
    const child = spawn(sshBinary(), execArgs(target, command), { windowsHide: true });
    const out: Buffer[] = [];
    let err = '';
    const timer = setTimeout(() => child.kill(), 120_000);
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
    child.stderr.on('data', (chunk) => { err += String(chunk); });
    child.on('error', (error) => { clearTimeout(timer); done({ code: 255, stdout: Buffer.concat(out), stderr: error.message }); });
    child.on('close', (code) => { clearTimeout(timer); done({ code: code ?? 255, stdout: Buffer.concat(out), stderr: err }); });
  });
}

async function httpGet(port: number, path: string) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(5000) });
    return { status: response.status, body: await response.text() };
  } catch {
    return { status: 0, body: '' };
  }
}

function deps(dir: string): PodDeps {
  const target = () => {
    const found = readTarget(dir);
    if (!found) throw new Error(`no ${POD_FILES.target} in ${dir}: run so-pod.mts target first`);
    return found;
  };
  return {
    http: (path) => httpGet(target().localPort, path),
    ssh: (command) => runSsh(target(), command),
    now: () => new Date(),
  };
}

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

function spawnTunnel(target: PodTarget): TunnelProc {
  const child = spawn(sshBinary(), tunnelArgs(target), { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const exited = new Promise<number | null>((done) => {
    child.on('close', (code) => done(code));
    child.on('error', () => done(null));
  });
  return { pid: child.pid ?? null, exited, kill: () => { child.kill(); } };
}

async function up(pod: number, intervalMs: number) {
  const dir = podDir(LANES_ROOT, pod);
  mkdirSync(dir, { recursive: true });
  const running = liveCapture(dir);
  if (running) throw new Error(`pod ${pod}'s capture is already running (pid ${running})`);
  if (!readTarget(dir)) throw new Error(`no ${POD_FILES.target} in ${dir}: run so-pod.mts target ${pod} --host <ip> --ssh-port <port> first`);
  writeFileSync(resolve(dir, POD_FILES.lock), String(process.pid), 'utf-8');
  rmSync(resolve(dir, POD_FILES.released), { force: true });
  const capture = createCapture(dir, deps(dir), { remoteLog: readTarget(dir)?.remoteLog ?? REMOTE_LOG });
  let stop = false;
  let interrupted = false;
  process.on('SIGINT', () => { interrupted = true; stop = true; });
  process.on('SIGTERM', () => { interrupted = true; stop = true; });
  const tunnel = superviseTunnel({
    target: () => readTarget(dir),
    spawn: spawnTunnel,
    probe: async (target) => (await httpGet(target.localPort, '/health')).status,
    record: (event) => appendFileSync(resolve(dir, POD_FILES.tunnel), `${JSON.stringify(event)}\n`, 'utf-8'),
    now: () => new Date(),
    sleep,
    stopped: () => stop,
  });
  console.log(`pod ${pod}: capturing into ${dir} every ${intervalMs} ms (Ctrl+C = final pull, then exit)`);
  try {
    while (!stop) {
      const requestPath = resolve(dir, POD_FILES.pullRequest);
      if (existsSync(requestPath)) {
        const request = JSON.parse(readFileSync(requestPath, 'utf-8') || '{}');
        const record = await capture.finalPull();
        rmSync(requestPath, { force: true });
        console.log(`pull: ${JSON.stringify(record)}`);
        if (request.release) { stop = true; break; }
        continue;
      }
      const tick = await capture.tick().catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
      if ('error' in tick) console.log(`tick failed: ${tick.error}`);
      for (let waited = 0; waited < intervalMs && !stop && !existsSync(requestPath); waited += 500) await sleep(500);
    }
    if (interrupted) console.log(`final pull: ${JSON.stringify(await capture.finalPull())}`);
  } finally {
    stop = true;
    await tunnel.catch(() => undefined);
    rmSync(resolve(dir, POD_FILES.lock), { force: true });
  }
}

async function pull(pod: number, release: boolean, timeoutMs: number) {
  const dir = podDir(LANES_ROOT, pod);
  const running = liveCapture(dir);
  if (!running) {
    if (!readTarget(dir)) throw new Error(`no ${POD_FILES.target} in ${dir}`);
    return createCapture(dir, deps(dir), { remoteLog: readTarget(dir)?.remoteLog ?? REMOTE_LOG }).finalPull();
  }
  const asked = new Date().toISOString();
  writeFileSync(resolve(dir, POD_FILES.pullRequest), JSON.stringify({ at: asked, release }), 'utf-8');
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const path = resolve(dir, POD_FILES.pull);
    if (existsSync(path) && !existsSync(resolve(dir, POD_FILES.pullRequest))) {
      const record = JSON.parse(readFileSync(path, 'utf-8'));
      if (Date.parse(record.at) >= Date.parse(asked) - 1000) {
        if (release) for (let i = 0; i < 60 && liveCapture(dir); i += 1) await sleep(500);
        return record;
      }
    }
    if (Date.now() > deadline) throw new Error(`pod ${pod}'s capture (pid ${running}) did not answer the pull within ${timeoutMs} ms`);
    await sleep(500);
  }
}

export function releaseVerdict(dir: string) {
  const problems = teardownProblems(dir);
  if (liveCapture(dir)) problems.push(`the capture (pid ${liveCapture(dir)}) is still running: it would capture after the pull`);
  return { ok: problems.length === 0, problems };
}

function status() {
  const root = resolve(LANES_ROOT, 'pods');
  if (!existsSync(root)) return [];
  return readdirSync(root).filter((name) => /^\d+$/.test(name)).map((name) => {
    const dir = resolve(root, name);
    const last = (file: string) => readJsonl(resolve(dir, file)).pop() ?? null;
    let pullRecord: unknown = null;
    try { pullRecord = JSON.parse(readFileSync(resolve(dir, POD_FILES.pull), 'utf-8')); } catch {}
    return { pod: Number(name), dir, target: readTarget(dir), capturePid: liveCapture(dir), lastSample: last(POD_FILES.samples)?.at ?? null, lastTunnel: last(POD_FILES.tunnel), requests: readJsonl(resolve(dir, POD_FILES.requests)).length, pull: pullRecord, released: existsSync(resolve(dir, POD_FILES.released)) };
  });
}

function summary(pod: number, since: string | null, until: string | null) {
  const dir = podDir(LANES_ROOT, pod);
  const start = since ? Date.parse(since) : 0;
  const end = until ? Date.parse(until) : Date.now() + 1;
  const requests = windowRows(readJsonl(resolve(dir, POD_FILES.requests)), start, end);
  const gpu = windowRows(readJsonl(resolve(dir, POD_FILES.gpu)), start, end).flatMap((row) => row.gpus ?? []);
  const peak = (key: string) => (gpu.length ? Math.max(...gpu.map((row: any) => row[key] ?? -Infinity)) : null);
  const events = windowRows(readJsonl(resolve(dir, POD_FILES.events)), start, end);
  const kinds: Record<string, number> = {};
  for (const event of events) kinds[event.kind] = (kinds[event.kind] ?? 0) + 1;
  return { pod, window: { since, until }, ...requestStats(requests), gpu: { samples: gpu.length, utilPeak: peak('util'), memUsedPeakMiB: peak('memUsedMiB'), tempPeakC: peak('tempC') }, events: kinds };
}

async function main() {
  const [command, podArg, ...rest] = process.argv.slice(2);
  if (!command || command === '--help') { console.log(USAGE); return; }
  if (command === 'status') { console.log(JSON.stringify(status(), null, 2)); return; }
  const pod = parsePod(podArg);
  if (pod === null) { console.log(USAGE); process.exitCode = 2; return; }
  const dir = podDir(LANES_ROOT, pod);
  if (command === 'target') {
    mkdirSync(dir, { recursive: true });
    const target = targetFromArgs(pod, rest);
    writeFileSync(resolve(dir, POD_FILES.target), JSON.stringify({ ...target, at: new Date().toISOString() }, null, 2), 'utf-8');
    console.log(JSON.stringify(target, null, 2));
  } else if (command === 'up') {
    await up(pod, Number(argValue(rest, '--interval-ms', String(SAMPLE_INTERVAL_MS))));
  } else if (command === 'pull' || command === 'release') {
    const release = command === 'release' || rest.includes('--release');
    const record = await pull(pod, release, Number(argValue(rest, '--timeout-ms', '300000')));
    console.log(JSON.stringify(record, null, 2));
    if (command === 'release') {
      const verdict = releaseVerdict(dir);
      if (verdict.ok) writeFileSync(resolve(dir, POD_FILES.released), JSON.stringify({ at: new Date().toISOString(), pull: record }, null, 2), 'utf-8');
      console.log(verdict.ok ? `released: pod ${pod} may be stopped` : `NOT RELEASED: ${verdict.problems.join('; ')}`);
      process.exitCode = verdict.ok ? 0 : 1;
    } else process.exitCode = record.ok ? 0 : 1;
  } else if (command === 'teardown-check') {
    const verdict = releaseVerdict(dir);
    console.log(verdict.ok ? `ok: pod ${pod}'s evidence is pulled` : `REFUSED: ${verdict.problems.join('; ')}`);
    process.exitCode = verdict.ok ? 0 : 1;
  } else if (command === 'summary') {
    console.log(JSON.stringify(summary(pod, argValue(rest, '--since'), argValue(rest, '--until')), null, 2));
  } else { console.log(USAGE); process.exitCode = 2; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}

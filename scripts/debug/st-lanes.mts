import { execFile, spawn } from 'node:child_process';
import { cp, mkdir, open, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createWriteStream, existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { PROJECT_ROOT } from './lib/connection.mts';
import { diskFlavourIssue } from './lib/bundleFlavour.mts';

const USAGE = `Usage: node scripts/debug/st-lanes.mts <command> [...]

Parallel live runs. A lane is its own SillyTavern server (own port, own data root seeded from the
install) and its own browser, so install-wide state (extension settings, story library, lorebook
selection, judge settings) never crosses lanes and journeys can run side by side. The model backend
is shared: llama-server serves LLM_PARALLEL requests at once and queues the rest.

  seed <n...> [--fresh]        copy data/default-user into lane n (skips backups, vectors, thumbnails)
  start <n...> [--headed]      start lane n's server (port ${'8100+n'}) and browser (CDP ${'9300+n'})
  stop <n...>                  stop lane n's browser and server
  status                       list lanes and whether each is up
  env <n>                      print the environment that points a debug script at lane n
  run <n> -- <node script args> run one debug script against lane n
  batch --lanes 1,2 [--repeat 2] [--strict] [--group <id>] [--wi-gating scan|file] <item...>
                               run items across lanes, one at a time per lane; an item is a journey
                               id (J3) or a scenario file (test/scenarios/x.json). --repeat runs each
                               item that many times back to back on the SAME lane, so "twice" stays
                               "two consecutive runs on one install".`;

const ST_ROOT = process.env.ST_ROOT ? resolve(process.env.ST_ROOT) : resolve(PROJECT_ROOT, '../../../../..');
// Outside the ST tree on purpose: a lane's data root holds a copy of secrets.json, and everything under
// public/ (this extension's .debug included) is served over HTTP by the running SillyTavern.
const LANES_ROOT = process.env.SO_LANES_ROOT ? resolve(process.env.SO_LANES_ROOT) : resolve(ST_ROOT, '..', 'so-lanes');
const SKIP_SEED = new Set(['backups', 'vectors', 'thumbnails']);

const lanePaths = (n: number) => {
  const root = resolve(LANES_ROOT, String(n));
  return { root, data: resolve(root, 'data'), debug: resolve(root, 'debug'), pid: resolve(root, 'server.pid'), log: resolve(root, 'server.log'), port: 8100 + n, cdp: 9300 + n };
};

export const laneEnv = (n: number): Record<string, string> => {
  const lane = lanePaths(n);
  return { ST_URL: `http://127.0.0.1:${lane.port}/`, ST_DEBUG_CDP_PORT: String(lane.cdp), SO_DEBUG_DIR: lane.debug, SO_LANE: String(n) };
};

const laneNumbers = (args: string[]) => args.filter((arg) => /^\d+$/.test(arg)).map(Number).filter((n) => n >= 1 && n <= 50);

function argValue(name: string, fallback: string | null = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function isUp(port: number) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

export function createLineStamper(onLine: (line: string) => void, now: () => Date = () => new Date()) {
  let partial = '';
  return {
    push(chunk: string) {
      const lines = (partial + chunk).split(/\r?\n/);
      partial = lines.pop() ?? '';
      for (const line of lines) onLine(`${now().toISOString()} ${line}`);
    },
    end() {
      if (partial) onLine(`${now().toISOString()} ${partial}`);
      partial = '';
    },
  };
}

function runNode(args: string[], env: Record<string, string>, { logPath, echo = false }: { logPath?: string; echo?: boolean } = {}): Promise<{ code: number; output: string }> {
  return new Promise((done) => {
    const child = spawn(process.execPath, args, { cwd: PROJECT_ROOT, env: { ...process.env, ...env }, windowsHide: true });
    const log = logPath ? createWriteStream(logPath, { encoding: 'utf-8' }) : null;
    const emit = (line: string) => {
      log?.write(`${line}\n`);
      if (echo) process.stdout.write(`${line}\n`);
    };
    const out = createLineStamper(emit);
    const err = createLineStamper(emit);
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; out.push(String(chunk)); });
    child.stderr.on('data', (chunk) => { output += chunk; err.push(String(chunk)); });
    child.on('close', (code) => {
      out.end();
      err.end();
      const finish = () => done({ code: code ?? 1, output });
      if (log) log.end(finish);
      else finish();
    });
  });
}

async function seed(n: number, fresh: boolean) {
  const lane = lanePaths(n);
  const target = resolve(lane.data, 'default-user');
  if (existsSync(target) && !fresh) return { lane: n, seeded: false, reason: 'already seeded (pass --fresh to re-copy)' };
  if (fresh) await rm(lane.data, { recursive: true, force: true });
  const source = resolve(ST_ROOT, 'data', 'default-user');
  await mkdir(lane.data, { recursive: true });
  await cp(source, target, { recursive: true, filter: (path) => !SKIP_SEED.has(basename(path)) || resolve(path, '..') !== source });
  return { lane: n, seeded: true, from: source, to: target };
}

async function start(n: number, headed: boolean) {
  const lane = lanePaths(n);
  if (!existsSync(resolve(lane.data, 'default-user'))) throw new Error(`lane ${n} is not seeded: run \`st-lanes.mts seed ${n}\` first`);
  await mkdir(lane.debug, { recursive: true });
  if (!(await isUp(lane.port))) {
    const log = await open(lane.log, 'a');
    const server = spawn(process.execPath, ['server.js', '--port', String(lane.port), '--dataRoot', lane.data, '--browserLaunchEnabled', 'false', '--listen', 'false'], {
      cwd: ST_ROOT, detached: true, stdio: ['ignore', log.fd, log.fd], windowsHide: true,
    });
    server.unref();
    await writeFile(lane.pid, String(server.pid ?? ''), 'utf-8');
    const deadline = Date.now() + 300000;
    while (!(await isUp(lane.port))) {
      if (Date.now() > deadline) throw new Error(`lane ${n}'s server did not answer on port ${lane.port} within 300 s (log: ${lane.log})`);
      await sleep(1000);
    }
    await log.close();
  }
  const session = await runNode(['scripts/debug/st-session.mts', 'start', ...(headed ? ['--headed'] : [])], laneEnv(n));
  if (session.code !== 0) throw new Error(`lane ${n}'s browser did not start: ${session.output.slice(-600)}`);
  return { lane: n, url: laneEnv(n).ST_URL, cdp: lane.cdp, debug: lane.debug };
}

async function killTree(pid: number) {
  if (process.platform === 'win32') await new Promise<void>((done) => execFile('taskkill.exe', ['/pid', String(pid), '/t', '/f'], () => done()));
  else { try { process.kill(-pid, 'SIGTERM'); } catch { try { process.kill(pid, 'SIGTERM'); } catch {} } }
}

async function stop(n: number) {
  const lane = lanePaths(n);
  await runNode(['scripts/debug/st-session.mts', 'stop'], laneEnv(n));
  const pid = Number(await readFile(lane.pid, 'utf-8').catch(() => ''));
  if (Number.isInteger(pid) && pid > 0) await killTree(pid);
  await rm(lane.pid, { force: true });
  return { lane: n, stopped: true, serverUp: await isUp(lane.port) };
}

async function status() {
  const entries = existsSync(LANES_ROOT) ? (await readdir(LANES_ROOT)).filter((name) => /^\d+$/.test(name)).map(Number).sort((a, b) => a - b) : [];
  return Promise.all(entries.map(async (n) => {
    const lane = lanePaths(n);
    return { lane: n, seeded: existsSync(resolve(lane.data, 'default-user')), serverUp: await isUp(lane.port), browser: existsSync(resolve(lane.debug, 'session.json')), url: laneEnv(n).ST_URL };
  }));
}

type BatchResult = { item: string; lane: number; run: number; code: number; automated: string | null; cleanup: string | null; record: string | null; failures: string[]; log: string; ms: number };

// v2.5 plan 01 G3/G4: `--wi-gating` reaches journeys only; a scenario that needs a mode switches it itself.
export const itemArgs = (item: string, strict: boolean, group: string | null, wiGating: string | null = null) => (/^J\d+$/i.test(item)
  ? ['scripts/debug/so-journey.mts', 'run', item.toUpperCase(), ...(strict ? ['--strict'] : []), ...(wiGating ? ['--wi-gating', wiGating] : [])]
  : ['scripts/debug/so-scenario.mts', 'run', item, '--sandbox', ...(group ? ['--group', group] : [])]);

async function batch(lanes: number[], items: string[], repeat: number, strict: boolean, group: string | null, wiGating: string | null = null) {
  const queue = [...items];
  const results: BatchResult[] = [];
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await Promise.all(lanes.map(async (n) => {
    const dir = resolve(lanePaths(n).debug, 'batch');
    await mkdir(dir, { recursive: true });
    for (let item = queue.shift(); item; item = queue.shift()) {
      for (let run = 1; run <= repeat; run += 1) {
        const log = resolve(dir, `${stamp}-${basename(item).replace(/\.json$/, '')}-run${run}.log`);
        const began = Date.now();
        const { code, output } = await runNode(itemArgs(item, strict, group, wiGating), laneEnv(n), { logPath: log });
        const result = {
          item, lane: n, run, code, log, ms: Date.now() - began,
          automated: output.match(/^automated: .*$/m)?.[0] ?? null,
          cleanup: output.match(/^cleanup: .*$/m)?.[0] ?? null,
          record: output.match(/Wrote JSON: (.*journey-J\d+\.json)/)?.[1]?.trim() ?? null,
          failures: [...output.matchAll(/^(FAIL|BLOCKED)\s+(\S+)/gm)].map((match) => `${match[1]} ${match[2]}`).concat(/^J/i.test(item) ? [] : [...output.matchAll(/^\S+ \d+\/\d+ \S+ FAIL (.{0,160})/gm)].map((match) => match[1])),
        };
        results.push(result);
        console.log(`lane ${n} ${item} run ${run}: code ${code}${result.automated ? ` · ${result.automated}` : ''} (${Math.round(result.ms / 1000)} s)`);
      }
    }
  }));
  const summary = resolve(LANES_ROOT, `batch-${stamp}.json`);
  await writeFile(summary, JSON.stringify({ lanes, items, repeat, strict, results }, null, 2), 'utf-8');
  return { summary, green: results.filter((result) => result.code === 0).length, runs: results.length };
}

export const SERVED_EXTENSION_DIR = resolve(ST_ROOT, 'public', 'scripts', 'extensions', 'third-party', 'story-orchestrator');

export const lanePreflight = (extensionDir: string = SERVED_EXTENSION_DIR): string | null => {
  const path = resolve(extensionDir, 'dist', 'manifest.json');
  try {
    return diskFlavourIssue(existsSync(path) ? JSON.parse(readFileSync(path, 'utf-8')) : null);
  } catch {
    return diskFlavourIssue(null);
  }
};

export const batchExitCode = (out: { green: number; runs: number }): number => (out.runs > 0 && out.green === out.runs ? 0 : 1);

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === '--help') { console.log(USAGE); return; }
  let out: unknown;
  if (command === 'seed') out = await Promise.all(laneNumbers(rest).map((n) => seed(n, rest.includes('--fresh'))));
  else if (command === 'start') out = await Promise.all(laneNumbers(rest).map((n) => start(n, rest.includes('--headed'))));
  else if (command === 'stop') out = await Promise.all(laneNumbers(rest).map(stop));
  else if (command === 'status') out = await status();
  else if (command === 'env') {
    const [n] = laneNumbers(rest);
    out = Object.entries(laneEnv(n)).map(([key, value]) => `${key}=${value}`).join(' ');
  } else if (command === 'run') {
    const [n] = laneNumbers(rest.slice(0, 1));
    const at = rest.indexOf('--');
    const { code } = await runNode(rest.slice(at + 1), laneEnv(n), { echo: true });
    process.exitCode = code;
    return;
  } else if (command === 'batch') {
    const lanes = String(argValue('--lanes', '1')).split(',').map(Number).filter(Boolean);
    const flags = new Set(['--lanes', '--repeat', '--group', '--wi-gating']);
    const items = rest.filter((arg, index) => !arg.startsWith('--') && !flags.has(rest[index - 1] ?? ''));
    const refused = lanePreflight();
    if (refused) throw new Error(`batch refused: ${refused}`);
    const result = await batch(lanes, items, Number(argValue('--repeat', '1')), rest.includes('--strict'), argValue('--group'), argValue('--wi-gating'));
    process.exitCode = batchExitCode(result);
    out = result;
  } else { console.log(USAGE); process.exitCode = 2; return; }
  console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 2));
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('st-lanes.mts')) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}

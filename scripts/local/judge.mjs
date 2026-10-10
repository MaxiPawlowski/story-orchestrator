import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { childEnv, DEFAULT_JUDGE_MODEL, judgeConfig, PROBE_REQUEST, readinessLine, requiredGB, serverCommands, setupSteps } from './judgeModels.mjs';

const USAGE = `Usage: node scripts/local/judge.mjs plan|setup|start|stop|status|check [--model decider-4b|plumb-4b] [--yes]

Local judge server for Story Orchestrator (v2.8 plan 14). Everything lives under SO_JUDGE_MODELS_DIR
(default C:/dev/models/so-judge): the Python environment, the weights, the Hugging Face and uv caches, logs.
  plan    what setup would create and download, and the free space it needs (no network)
  setup   create the environment and download the weights; only with --yes
  start   start the server on 127.0.0.1:SO_JUDGE_LOCAL_PORT (default 8095), CPU unless SO_JUDGE_LOCAL_GPU_LAYERS
  stop    stop the server this script started
  status  one line: up <model> | down (exit 0 | 1)
  check   one probe decision through the server: model id, latency and model path`;

const here = path.dirname(fileURLToPath(import.meta.url));
const serverScript = path.join(here, 'judgeServer.py');
const args = process.argv.slice(2);
const action = args.find((arg) => !arg.startsWith('--')) ?? 'plan';
const modelIndex = args.indexOf('--model');
const model = modelIndex >= 0 ? args[modelIndex + 1] : DEFAULT_JUDGE_MODEL;
const config = judgeConfig(process.env, { model });

const exists = (file) => fs.existsSync(file);
const weightsPresent = () => (config.model.file ? exists(config.modelPath) && config.companionPaths.every(exists) : exists(path.join(config.modelDir, 'config.json')));

function freeGB(dir) {
    let probe = dir;
    while (!exists(probe) && path.dirname(probe) !== probe) probe = path.dirname(probe);
    try {
        const stats = fs.statfsSync(probe);
        return Math.round(((stats.bavail * stats.bsize) / 1024 ** 3) * 10) / 10;
    } catch {
        return null;
    }
}

const getJson = async (url, init = {}, timeoutMs = 3000) => {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
};

const health = async () => {
    try {
        const { status, body } = await getJson(`${config.url}/health`, {}, 1500);
        return status === 200 ? body : null;
    } catch {
        return null;
    }
};

function plan() {
    const need = requiredGB(config, { venvPresent: exists(config.python), weightsPresent: weightsPresent() });
    const free = freeGB(config.root);
    console.log(`local judge: ${config.model.key} (${config.model.id}, ${config.model.licence})`);
    console.log(`root: ${config.root}${process.env.SO_JUDGE_MODELS_DIR ? '' : ' (default; set SO_JUDGE_MODELS_DIR to move it)'}`);
    for (const step of setupSteps(config)) {
        const done = (step.skipIf === 'venv' && exists(config.python)) || (step.skipIf === 'weights' && weightsPresent());
        console.log(`${done ? '  done ' : '  todo '} ${step.label}`);
    }
    console.log(`space: needs ~${need} GB, ${free === null ? 'free space unknown' : `${free} GB free`} on that drive`);
    return { need, free };
}

function run(command, env) {
    console.log(`> ${command.join(' ')}`);
    const result = spawnSync(command[0], command.slice(1), { stdio: 'inherit', env, windowsHide: true });
    if (result.status !== 0) throw new Error(`failed (${result.status ?? result.error?.message}): ${command[0]}`);
}

async function setup() {
    const { need, free } = plan();
    if (!args.includes('--yes')) {
        console.log('\nnothing downloaded: run again with --yes to create the environment and download the weights');
        return 0;
    }
    if (free !== null && free < need) {
        console.error(`refusing: ${need} GB needed, ${free} GB free under ${config.root}`);
        return 1;
    }
    await fsp.mkdir(config.modelDir, { recursive: true });
    const env = childEnv(config);
    for (const step of setupSteps(config)) {
        if ((step.skipIf === 'venv' && exists(config.python)) || (step.skipIf === 'weights' && weightsPresent())) continue;
        run(step.command, env);
    }
    console.log(`ready: node scripts/local/judge.mjs start --model ${config.model.key}`);
    return 0;
}

async function start() {
    const up = await health();
    if (up?.ok) {
        console.log(`local judge already up: ${up.model}`);
        return 0;
    }
    if (!exists(config.python) || !weightsPresent()) {
        console.error(`not set up: run node scripts/local/judge.mjs setup --model ${config.model.key} --yes`);
        return 1;
    }
    await fsp.mkdir(config.logDir, { recursive: true });
    const env = childEnv(config);
    const pids = [];
    for (const { name, command } of serverCommands(config, serverScript)) {
        const log = fs.openSync(path.join(config.logDir, `${config.model.key}-${name}.log`), 'a');
        const child = spawn(command[0], command.slice(1), { env, detached: true, windowsHide: true, stdio: ['ignore', log, log] });
        child.unref();
        fs.closeSync(log);
        pids.push({ name, pid: child.pid });
    }
    await fsp.writeFile(config.pidFile, JSON.stringify({ model: config.model.id, port: config.port, pids, startedAt: new Date().toISOString() }, null, 2));
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
        const ready = await health();
        if (ready?.ok) {
            console.log(`local judge up: ${ready.model} on ${config.url} (${ready.device ?? 'device unknown'})`);
            return 0;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    console.error(`local judge did not answer within 180 s; read ${config.logDir}`);
    return 1;
}

async function stop() {
    if (!exists(config.pidFile)) {
        console.log('local judge: nothing started by this script');
        return 0;
    }
    const { pids } = JSON.parse(await fsp.readFile(config.pidFile, 'utf8'));
    for (const { pid } of pids) {
        if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        else try { process.kill(-pid); } catch { try { process.kill(pid); } catch { /* gone */ } }
    }
    await fsp.rm(config.pidFile, { force: true });
    console.log('local judge stopped');
    return 0;
}

async function status() {
    const up = await health();
    console.log(up?.ok ? `up ${up.model}` : 'down');
    return up?.ok ? 0 : 1;
}

async function check() {
    const up = await health();
    if (!up?.ok) {
        console.log(readinessLine(up, null, 0).line);
        return 1;
    }
    const started = Date.now();
    try {
        const { status: code, body } = await getJson(`${config.url}/v1/systemone`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(PROBE_REQUEST) }, 60_000);
        const result = readinessLine(up, code === 200 ? body : null, Date.now() - started);
        console.log(result.line);
        return result.ok ? 0 : 1;
    } catch (error) {
        console.log(`local judge probe failed: ${error?.message ?? error}`);
        return 1;
    }
}

const actions = { plan: async () => (plan(), 0), setup, start, stop, status, check };
if (!actions[action]) {
    console.log(USAGE);
    process.exit(action === 'help' ? 0 : 1);
}
process.exit(await actions[action]());

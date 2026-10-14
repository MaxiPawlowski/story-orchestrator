import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LANDMARK_LICENCE, LANDMARK_WEIGHTS, landmarkChildEnv, landmarkConfig, landmarkServerCommand } from './landmarkConfig.mjs';

const USAGE = `Usage: node scripts/local/landmarks.mjs plan|verify|start|stop|status|check [image.png]

Face-landmark cross-check server (hysts/anime-face-detector, CPU only, 127.0.0.1:SO_LANDMARKS_PORT default 8096).
The Python environment is SO_LANDMARKS_PYTHON (default C:/dev/tools/anime-face-detector/venv); weights are
SO_LANDMARKS_WEIGHTS (default C:/dev/models/anime-face-detector). Nothing is downloaded by this script.
  plan    paths, licence and the expected weight files
  verify  sha256 of each weight file against the recorded hash
  start   start the server (CUDA hidden, Hugging Face offline)
  stop    stop the server this script started
  status  one line: up <model> | down (exit 0 | 1)
  check   one detection through the server on [image.png]: faces, latency`;

const here = path.dirname(fileURLToPath(import.meta.url));
const serverScript = path.join(here, 'landmarkServer.py');
const args = process.argv.slice(2);
const action = args[0] ?? 'plan';
const config = landmarkConfig();

const health = async () => {
    try {
        const response = await fetch(`${config.url}/health`, { signal: AbortSignal.timeout(1500) });
        return response.ok ? await response.json() : null;
    } catch { return null; }
};

function plan() {
    console.log(`landmark cross-check: ${LANDMARK_LICENCE}`);
    console.log(`python: ${config.python} ${fs.existsSync(config.python) ? '(present)' : '(missing)'}`);
    for (const weight of LANDMARK_WEIGHTS) {
        const file = path.join(config.weights, weight.file);
        console.log(`  ${fs.existsSync(file) ? 'present' : 'missing'} ${file} (${weight.bytes} B, ${weight.source})`);
    }
    return 0;
}

async function verify() {
    let ok = true;
    for (const weight of LANDMARK_WEIGHTS) {
        const file = path.join(config.weights, weight.file);
        const sha = fs.existsSync(file) ? createHash('sha256').update(await fsp.readFile(file)).digest('hex') : null;
        const match = sha === weight.sha256;
        ok &&= match;
        console.log(`${match ? 'ok  ' : 'BAD '} ${weight.file} ${sha ?? 'missing'}`);
    }
    return ok ? 0 : 1;
}

async function start() {
    const up = await health();
    if (up?.ok) { console.log(`landmark server already up: ${up.model}`); return 0; }
    if (!fs.existsSync(config.python) || LANDMARK_WEIGHTS.some((weight) => !fs.existsSync(path.join(config.weights, weight.file)))) {
        console.error('not set up: run node scripts/local/landmarks.mjs plan');
        return 1;
    }
    await fsp.mkdir(path.dirname(config.logFile), { recursive: true });
    const log = fs.openSync(config.logFile, 'a');
    const command = landmarkServerCommand(config, serverScript);
    const child = spawn(command[0], command.slice(1), { env: landmarkChildEnv(), detached: true, windowsHide: true, stdio: ['ignore', log, log] });
    child.unref();
    fs.closeSync(log);
    await fsp.writeFile(config.pidFile, JSON.stringify({ pid: child.pid, port: config.port, startedAt: new Date().toISOString() }, null, 2));
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
        const ready = await health();
        if (ready?.ok) { console.log(`landmark server up: ${ready.model} on ${config.url} (${ready.device})`); return 0; }
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    console.error(`landmark server did not answer within 120 s; read ${config.logFile}`);
    return 1;
}

async function stop() {
    if (!fs.existsSync(config.pidFile)) { console.log('landmark server: nothing started by this script'); return 0; }
    const { pid } = JSON.parse(await fsp.readFile(config.pidFile, 'utf8'));
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    else try { process.kill(pid); } catch { /* gone */ }
    await fsp.rm(config.pidFile, { force: true });
    console.log('landmark server stopped');
    return 0;
}

async function status() {
    const up = await health();
    console.log(up?.ok ? `up ${up.model}` : 'down');
    return up?.ok ? 0 : 1;
}

async function check() {
    const image = args[1];
    if (!image) { console.error('check needs an image path'); return 1; }
    const started = Date.now();
    try {
        const response = await fetch(`${config.url}/v1/landmarks`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ png: (await fsp.readFile(image)).toString('base64') }), signal: AbortSignal.timeout(120_000) });
        const body = await response.json();
        if (!body.ok) { console.log(`landmark check refused: ${body.reason}`); return 1; }
        console.log(`landmark check: ${body.faces.length} face(s) in ${body.width}x${body.height}, ${Date.now() - started} ms`);
        for (const face of body.faces) console.log(`  box ${face.box.map((value) => Math.round(value * 100) / 100).join(',')}`);
        return 0;
    } catch (error) {
        console.log(`landmark check failed: ${error?.message ?? error}`);
        return 1;
    }
}

const actions = { plan: async () => plan(), verify, start, stop, status, check };
if (!actions[action]) {
    console.log(USAGE);
    process.exit(action === 'help' ? 0 : 1);
}
process.exit(await actions[action]());

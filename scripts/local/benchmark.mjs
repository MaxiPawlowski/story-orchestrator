import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { memorySnapshot, gpuMemory } from './telemetry.mjs';

const configFile = process.argv[2];
const profileName = process.argv[3] ?? 'normal';
if (!configFile) throw new Error('Usage: node scripts/local/benchmark.mjs <config.json> [profile]');
const config = JSON.parse(await fs.readFile(configFile, 'utf8'));
const profile = config.profiles[profileName];
if (!profile) throw new Error('Unknown profile.');
await fs.mkdir(config.stateDir, { recursive: true });
const stem = path.join(config.stateDir, `baseline-${profileName}-${Date.now()}`);
const before = await memorySnapshot();
const url = `http://127.0.0.1:${config.backendPort}`;
try { await fetch(`${url}/health`, { signal: AbortSignal.timeout(1000) }); throw new Error('Backend port is already owned by another server.'); }
catch (error) { if (error.message === 'Backend port is already owned by another server.') throw error; }
const args = ['--model', config.model, '--host', '127.0.0.1', '--port', String(config.backendPort), '--alias', config.modelAlias, '--offline', '--no-mmproj', '--no-webui', '--threads', '8', '--threads-batch', '8', '--parallel', '1', '--kv-unified', '--flash-attn', 'on', '--cache-type-k', 'q8_0', '--cache-type-v', 'q8_0', '--cache-ram', '512', '--sleep-idle-seconds', '-1', '--fit', 'on', '--fit-target', String(config.reserves.gpuMiB), ...profile.args];
const processHandle = spawn(config.binary, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = '';
processHandle.stdout.on('data', (chunk) => { logs += chunk; });
processHandle.stderr.on('data', (chunk) => { logs += chunk; });
let spawnError;
processHandle.on('error', (error) => { spawnError = error; });
const samples = [];
const poll = setInterval(() => { void gpuMemory().then((rows) => samples.push({ at: Date.now(), gpus: rows })).catch(() => {}); }, 1500);
const result = { profile: profileName, args, before, startedAt: new Date().toISOString() };
try {
    const start = Date.now();
    while (Date.now() - start < 240000) {
        if (spawnError) throw spawnError;
        if (processHandle.exitCode !== null) throw new Error(`Backend exited ${processHandle.exitCode}: ${logs.slice(-3000)}`);
        try { if ((await fetch(`${url}/health`, { signal: AbortSignal.timeout(1000) })).ok) break; } catch {}
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (!(await fetch(`${url}/health`, { signal: AbortSignal.timeout(1000) })).ok) throw new Error('Backend never became ready.');
    result.loadMs = Date.now() - start;
    result.loaded = await memorySnapshot();
    if (result.loaded.host.availableMiB < config.reserves.ramMiB) throw new Error('Loaded profile violates the physical RAM reserve; no generation attempted.');
    for (const [label, repeats, predict] of [['short', 1, 96], ['long-prefill', 128, 64]]) {
        const prompt = '<|turn>user\n' + 'Describe an old stone hall with a lit fireplace. The visitor stays silent. '.repeat(repeats) + '<turn|>\n<|turn>model\n<|channel>final\n';
        const began = Date.now();
        const response = await fetch(`${url}/completion`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt, n_predict: predict, temperature: 0.6, top_k: 0, top_p: 1, min_p: 0.05, seed: 17, stop: ['<turn|>'], cache_prompt: true }), signal: AbortSignal.timeout(240000) });
        const data = await response.json();
        if (!response.ok) throw new Error(JSON.stringify(data));
        result[label] = { elapsedMs: Date.now() - began, contentLength: data.content?.length, timings: data.timings, tokensEvaluated: data.tokens_evaluated, tokensPredicted: data.tokens_predicted };
    }
    result.afterRequests = await memorySnapshot();
    result.ok = true;
} catch (error) { result.ok = false; result.error = error.message; }
finally {
    clearInterval(poll);
    processHandle.kill();
    if (processHandle.exitCode === null) await Promise.race([new Promise((resolve) => processHandle.once('exit', resolve)), new Promise((resolve) => setTimeout(resolve, 10000))]);
    result.samples = samples;
    result.afterStop = await memorySnapshot();
    await fs.writeFile(`${stem}.json`, JSON.stringify(result, null, 2));
    await fs.writeFile(`${stem}.log`, logs);
}
console.log(JSON.stringify({ record: `${stem}.json`, ...result, samples: result.samples.length }, null, 2));
if (!result.ok) process.exitCode = 1;

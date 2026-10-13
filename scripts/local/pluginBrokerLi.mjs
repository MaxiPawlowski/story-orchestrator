import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';
import { start, exit } from '../../server-plugin/story-orchestrator-gpu/index.mjs';
import { renderSignature } from '../../server-plugin/story-orchestrator-gpu/broker/policy.mjs';
import { estimateNeedMiB } from '../../server-plugin/story-orchestrator-gpu/broker/models.mjs';
import { superviseConfigFromLocal, fakeRouter } from './pluginBrokerLiConfig.mjs';

const [localFile, outDir, runLabel = 'run1'] = process.argv.slice(2);
if (!localFile || !outDir) throw new Error('Usage: node scripts/local/pluginBrokerLi.mjs <local config.json> <out dir> [label]');
const local = JSON.parse(await fs.readFile(localFile, 'utf8'));
const LISTEN = 18898;
const ROUTER = 18897;
await fs.mkdir(outDir, { recursive: true });
const config = superviseConfigFromLocal(local, { stateDir: path.join(outDir, 'state'), listenPort: LISTEN, textPort: 18899 });
if (process.env.SO_LI_RESERVES === 'probe') delete config.reserves;
await fs.mkdir(config.stateDir, { recursive: true });

const home = fileURLToPath(new URL('../../', import.meta.url));
const moduleFrom = async (file) => {
    const { code } = await transform(await fs.readFile(path.join(home, file), 'utf8'), { loader: 'ts', format: 'esm' });
    return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
};
const { buildGraph } = await moduleFrom('src/image/graph.ts');
const { FAMILIES, checkpointFor, familyOf } = await moduleFrom('src/image/catalog.ts');
const checkpointFile = 'waiIllustriousSDXL_v170.safetensors';
const checkpoint = checkpointFor(checkpointFile, familyOf(checkpointFile) ?? 'sdxl-illustrious');
const family = FAMILIES[checkpoint.family];
const size = family.sizes.wide;
const graph = buildGraph({ checkpoint, family, loras: [], positive: 'an empty old stone hall, fireplace, warm light, detailed architecture, no people', negative: 'text, watermark, low quality',
    size, seed: Date.now() % 4294967296, hires: false });
const modelFiles = [{ kind: 'checkpoints', name: checkpoint.file }];
const needGpuMiB = await estimateNeedMiB({ modelDirs: local.modelDirs, files: modelFiles, ...size, hires: false });

const router = fakeRouter();
const routerServer = http.createServer(async (req, res) => {
    const route = new URL(req.url, 'http://x').pathname;
    const found = router.find(req.method, route);
    if (!found) { res.writeHead(404).end('{}'); return; }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    req.body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    req.user = { profile: { admin: true } };
    req.params = found.params;
    res.json = (data) => { res.writeHead(res.statusCode || 200, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
    res.status = (code) => { res.statusCode = code; return res; };
    await found.handler(req, res);
});
await new Promise((resolve) => routerServer.listen(ROUTER, '127.0.0.1', resolve));

const call = async (base, route, body, method = body === undefined ? 'GET' : 'POST') => {
    const response = await fetch(`${base}${route}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(600000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${route} ${response.status} ${JSON.stringify(data)}`);
    return data;
};
const plugin = (route, body, method) => call(`http://127.0.0.1:${ROUTER}`, route, body, method);
const gateway = (route, body, method) => call(`http://127.0.0.1:${LISTEN}`, route, body, method);
const smi = () => new Promise((resolve) => execFile('nvidia-smi', ['--query-gpu=memory.used,memory.total', '--format=csv,noheader,nounits'], (error, out) => {
    const [used, total] = String(out).trim().split(',').map(Number);
    resolve(error ? null : { usedMiB: used, freeMiB: total - used });
}));
const gpuSamples = [];
const sampler = setInterval(() => { void smi().then((sample) => { if (sample) gpuSamples.push({ at: Date.now(), ...sample }); }); }, 1000);
const text = async (label) => {
    const began = Date.now();
    const data = await gateway('/v1/chat/completions', { model: local.modelAlias, messages: [{ role: 'user', content: 'Describe a stone hall with a fireplace and its furniture in one short paragraph.' }], chat_template_kwargs: { enable_thinking: true }, max_tokens: 768, temperature: 0.6, top_k: 0, top_p: 1, min_p: 0.05, seed: 17, cache_prompt: true });
    const message = data.choices?.[0]?.message;
    return { label, elapsedMs: Date.now() - began, thinkingEnabled: true, visible: Boolean(message?.content?.trim()), chars: message?.content?.length ?? 0, reasoningChars: message?.reasoning_content?.length ?? 0, finishReason: data.choices?.[0]?.finish_reason ?? null, usage: data.usage ?? null, predictedPerSecond: data.timings?.predicted_per_second ?? null };
};

const report = { runLabel, at: new Date().toISOString(), needGpuMiB, checkpoint: checkpoint.file, reserveMode: config.reserves ? 'pinned' : 'probe', ok: false };
let lease = null;
let promptId = null;
try {
    await start(router, config);
    report.statusStart = await plugin('/status');
    report.reserves = { ...report.statusStart.reserves, from: report.statusStart.reservesFrom };
    report.gpuBefore = await smi();
    report.text1 = await text('before');
    report.stateAfterText1 = (await plugin('/status')).state;
    const queueBefore = await fetch(`${local.comfyUrl}/queue`).then((response) => response.json()).catch(() => null);
    report.comfyQueueBefore = queueBefore ? { running: queueBefore.queue_running?.length ?? 0, pending: queueBefore.queue_pending?.length ?? 0 } : 'comfy-not-running';
    const leaseBegan = Date.now();
    const granted = await plugin('/lease', { workflowKey: renderSignature(graph), needGpuMiB, nextTextTokens: 768, modelFiles, ...size, hires: false });
    lease = granted.lease;
    report.lease = { decision: granted.decision ?? null, brokered: granted.brokered ?? null, admissionMs: Date.now() - leaseBegan, warning: granted.warning ?? null };
    report.stateDuringLease = (await plugin('/status')).state;
    const renderBegan = Date.now();
    const queued = await call(local.comfyUrl, '/prompt', { prompt: graph, client_id: `so-plugin-li-${process.pid}` });
    promptId = queued.prompt_id;
    const deadline = Date.now() + 600000;
    while (Date.now() < deadline && !report.render) {
        const history = (await (await fetch(`${local.comfyUrl}/history/${promptId}`)).json())[promptId];
        if (history?.status?.completed) {
            if (history.status.status_str !== 'success') throw new Error(JSON.stringify(history.status));
            const image = Object.values(history.outputs ?? {}).flatMap((output) => output.images ?? [])[0];
            const bytes = Buffer.from(await (await fetch(`${local.comfyUrl}/view?${new URLSearchParams(image)}`)).arrayBuffer());
            await fs.writeFile(path.join(outDir, `${runLabel}-render.png`), bytes);
            report.render = { elapsedMs: Date.now() - renderBegan, promptId, imageBytes: bytes.length };
        } else if (history?.status?.status_str === 'error') throw new Error(JSON.stringify(history.status));
        else await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (!report.render) throw new Error('The owned render timed out.');
    const releaseBegan = Date.now();
    await plugin('/release', { lease }); lease = null;
    report.releaseMs = Date.now() - releaseBegan;
    report.text2 = await text('after');
    report.postRenderToReplyMs = report.releaseMs + report.text2.elapsedMs;
    report.imageToReplyMs = Date.now() - leaseBegan;
    report.timingDefinition = 'lease request through completed thinking-enabled reply; includes admission, render, release and text';
    report.stateEnd = (await plugin('/status')).state;
    const queueAfter = await fetch(`${local.comfyUrl}/queue`).then((response) => response.json()).catch(() => null);
    report.comfyQueueAfter = queueAfter ? { running: queueAfter.queue_running?.length ?? 0, pending: queueAfter.queue_pending?.length ?? 0 } : null;
    report.floors = {
        textBeforeVisible: report.text1.visible,
        imageRendered: report.render.imageBytes > 0,
        textResumes: report.text2.visible,
        noForeignJobInterrupted: !queueBefore || (report.comfyQueueBefore.running === 0 && report.comfyQueueBefore.pending === 0),
        gpuReserveHeld: Math.min(...gpuSamples.map((sample) => sample.freeMiB)) >= report.reserves.gpuMiB,
    };
    report.ok = Object.values(report.floors).every(Boolean);
} catch (error) {
    report.error = String(error.message ?? error);
    if (promptId) await call(local.comfyUrl, '/queue', { delete: [promptId] }).catch(() => {});
} finally {
    clearInterval(sampler);
    if (lease) await plugin('/release', { lease }).catch((error) => { report.releaseError = error.message; });
    report.minFreeGpuMiB = gpuSamples.length ? Math.min(...gpuSamples.map((sample) => sample.freeMiB)) : null;
    report.peakUsedGpuMiB = gpuSamples.length ? Math.max(...gpuSamples.map((sample) => sample.usedMiB)) : null;
    report.gpuSamples = gpuSamples.length;
    await exit().catch((error) => { report.exitError = error.message; });
    await new Promise((resolve) => routerServer.close(resolve));
    await new Promise((resolve) => setTimeout(resolve, 3000));
    report.gpuAfterExit = await smi();
    await fs.writeFile(path.join(outDir, `${runLabel}.json`), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ...report, gpuSamples: gpuSamples.length }, null, 2));
}
process.exitCode = report.ok ? 0 : 1;

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { renderSignature } from '../../server-plugin/story-orchestrator-gpu/broker/policy.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => { const at = args.indexOf(`--${name}`); return at >= 0 ? args[at + 1] : fallback; };
const configFile = args[0];
const cycles = Number(option('cycles', '5'));
const hammerMs = Number(option('hammer-ms', '100'));
const replyTokens = Number(option('reply-tokens', '128'));
const out = option('out', null);
if (!configFile || !Number.isInteger(cycles) || cycles < 1) throw new Error('Usage: node scripts/local/wake-cycle-bench.mjs <config.json> [--cycles 5] [--hammer-ms 100] [--reply-tokens 128] [--out <file>]');
const config = JSON.parse(await fs.readFile(configFile, 'utf8'));
const url = `http://127.0.0.1:${config.gatewayPort}`;
const home = fileURLToPath(new URL('../../', import.meta.url));
const moduleFrom = async (file) => {
    const bundled = await build({ entryPoints: [path.join(home, file)], bundle: true, format: 'esm', platform: 'node', write: false, tsconfig: path.join(home, 'tsconfig.json'), logLevel: 'silent' });
    return import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
};
const { buildGraph } = await moduleFrom('src/image/graph.ts');
const { FAMILIES, checkpointFor, familyOf } = await moduleFrom('src/image/catalog.ts');
const { estimateNeedMiB } = await import('../../server-plugin/story-orchestrator-gpu/broker/models.mjs');
const checkpointFile = config.benchmarkCheckpoint ?? 'waiIllustriousSDXL_v170.safetensors';
const checkpoint = checkpointFor(checkpointFile, familyOf(checkpointFile) ?? 'sdxl-illustrious');
const family = FAMILIES[checkpoint.family];
const size = family.sizes.wide;
const modelFiles = [{ kind: 'checkpoints', name: checkpoint.file }];
const needGpuMiB = await estimateNeedMiB({ modelDirs: config.modelDirs, files: modelFiles, ...size, hires: false });

const post = async (base, route, body, timeoutMs = 600000) => {
    const response = await fetch(`${base}${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${route} ${response.status}: ${JSON.stringify(data).slice(0, 300)}`);
    return data;
};
const status = async () => (await fetch(`${url}/status`)).json();
const memory = (s) => {
    const pid = s.text?.pid ?? s.text?.sleeping?.pid ?? null;
    return { at: new Date().toISOString(), gpuUsedMiB: Math.round(s.telemetry?.gpus?.[0]?.usedMiB ?? -1), textPid: pid, textAwake: Boolean(s.text?.pid), textHeldMiB: pid ? Math.round(s.telemetry?.gpuProcesses?.[pid]?.dedicatedMiB ?? -1) : null,
        sleeping: Boolean(s.text?.sleeping), sleepStats: s.text?.sleepStats ?? null, lastError: s.lastError ?? s.text?.lastError ?? null, comfyPid: s.comfy?.ownedPid ?? null };
};

const counts = { tokenize: {}, replyStatus: {} };
let hammering = true;
const hammer = (async () => {
    while (hammering) {
        try {
            const reply = await fetch(`${url}/tokenize`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: 'The player types a line while the counter runs.' }), signal: AbortSignal.timeout(600000) });
            await reply.arrayBuffer();
            counts.tokenize[reply.status] = (counts.tokenize[reply.status] ?? 0) + 1;
        } catch { counts.tokenize.error = (counts.tokenize.error ?? 0) + 1; }
        await new Promise((resolve) => setTimeout(resolve, hammerMs));
    }
})();

const image = async (index) => {
    const graph = buildGraph({ checkpoint, family, loras: [], positive: `an empty old stone hall, fireplace, warm light, detailed architecture, no people, variant ${index}`,
        negative: 'text, watermark, low quality', size, seed: 2000 + index, hires: false, upscaler: config.benchmarkUpscaler ?? 'RealESRGAN_x4plus_anime_6B.safetensors' });
    const began = Date.now();
    const lease = await post(url, '/lease', { workflowKey: renderSignature(graph), needGpuMiB, nextTextTokens: replyTokens, modelFiles, ...size, hires: false });
    const admittedMs = Date.now() - began;
    const during = [];
    try {
        const queued = await post(config.comfyUrl, '/prompt', { prompt: graph, client_id: `so-wake-${process.pid}` });
        const renderBegan = Date.now();
        while (true) {
            const history = await (await fetch(`${config.comfyUrl}/history/${queued.prompt_id}`)).json();
            const entry = history[queued.prompt_id];
            if (entry?.status?.completed) { if (entry.status.status_str !== 'success') throw new Error(JSON.stringify(entry.status)); break; }
            if (entry?.status?.status_str === 'error') throw new Error(JSON.stringify(entry.status));
            if (Date.now() - renderBegan > 600000) throw new Error('render timed out');
            if (during.length < 40) during.push(memory(await status()));
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        return { admittedMs, renderMs: Date.now() - renderBegan, decision: lease.decision ?? null, peakTextHeldDuringRenderMiB: Math.max(-1, ...during.map((row) => row.textHeldMiB ?? -1)) };
    } finally { await post(url, '/release', { lease: lease.lease }); }
};

const reply = async () => {
    const began = Date.now();
    const response = await fetch(`${url}/completion`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: '<|turn>user\nDescribe a stone hall with a fireplace and its furniture in detail.<turn|>\n<|turn>model\n', n_predict: replyTokens, temperature: 0.7, seed: 1234, stream: true, cache_prompt: true }), signal: AbortSignal.timeout(600000) });
    counts.replyStatus[response.status] = (counts.replyStatus[response.status] ?? 0) + 1;
    if (!response.ok) return { ok: false, status: response.status, error: (await response.text()).slice(0, 400), totalMs: Date.now() - began };
    let first = null; let timings = null; let buffer = ''; const decoder = new TextDecoder();
    for await (const chunk of response.body) {
        buffer += decoder.decode(chunk, { stream: true });
        const events = buffer.split('\n'); buffer = events.pop();
        for (const event of events) { if (!event.startsWith('data: ')) continue; const data = JSON.parse(event.slice(6)); if (data.content && first === null) first = Date.now(); if (data.stop) timings = data.timings; }
    }
    return { ok: true, ttftMs: first === null ? null : first - began, totalMs: Date.now() - began, decodeTps: timings?.predicted_per_second ?? null };
};

const replyWithRetries = async () => {
    const tries = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
        const result = await reply();
        tries.push(result);
        if (result.ok) break;
        await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    return { ...tries.at(-1), attempts: tries.length, refusals: tries.filter((row) => !row.ok).map((row) => `${row.status}: ${row.error}`) };
};

await post(url, '/control/automatic', {});
const start = memory(await status());
const warm = await replyWithRetries();
const rows = [];
for (let cycle = 0; cycle < cycles; cycle += 1) {
    const before = await replyWithRetries();
    const rendered = await image(cycle).catch((error) => ({ failed: error.message.slice(0, 400) }));
    const afterImage = memory(await status());
    const next = await replyWithRetries();
    const afterReply = memory(await status());
    rows.push({ cycle, before: { ttftMs: before.ttftMs, ok: before.ok }, image: rendered, afterImage, next, afterReply });
    console.log(JSON.stringify({ cycle, imageFailed: rendered.failed ?? null, decision: rendered.decision, renderMs: rendered.renderMs, peakTextHeldDuringRenderMiB: rendered.peakTextHeldDuringRenderMiB,
        afterImage: { gpuUsedMiB: afterImage.gpuUsedMiB, textHeldMiB: afterImage.textHeldMiB, sleeping: afterImage.sleeping },
        next: { ok: next.ok, ttftMs: next.ttftMs, attempts: next.attempts, refusals: next.refusals }, afterReply: { gpuUsedMiB: afterReply.gpuUsedMiB, textHeldMiB: afterReply.textHeldMiB } }));
}
hammering = false;
await hammer;
const end = memory(await status());
const ttfts = rows.filter((row) => row.next.ok).map((row) => row.next.ttftMs).sort((a, b) => a - b);
const summary = { cycles, hammerMs, replyTokens, warm, start, end, counts, wedged: rows.filter((row) => !row.next.ok).length, imageFailures: rows.filter((row) => row.image.failed).length,
    nextReplyRefusals: rows.reduce((sum, row) => sum + row.next.refusals.length, 0), nextTtftP50Ms: ttfts[Math.floor(ttfts.length / 2)] ?? null, nextTtftMaxMs: ttfts.at(-1) ?? null, rows };
if (out) await fs.writeFile(out, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ wedged: summary.wedged, imageFailures: summary.imageFailures, nextReplyRefusals: summary.nextReplyRefusals, nextTtftP50Ms: summary.nextTtftP50Ms, nextTtftMaxMs: summary.nextTtftMaxMs, counts, endSleepStats: end.sleepStats, endLastError: end.lastError }));

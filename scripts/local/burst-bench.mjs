import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { renderSignature } from '../../server-plugin/story-orchestrator-gpu/broker/policy.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => { const at = args.indexOf(`--${name}`); return at >= 0 ? args[at + 1] : fallback; };
const configFile = args[0];
const pattern = option('pattern', 'IIRIIR');
const burst = args.includes('--burst');
const corpusFile = option('corpus', null);
const replyTokens = Number(option('reply-tokens', '128'));
const out = option('out', null);
if (!configFile || !/^[IR]+$/.test(pattern)) throw new Error('Usage: node scripts/local/burst-bench.mjs <config.json> --pattern IIRIIR [--burst] [--corpus <corpus.json>] [--reply-tokens 128] [--out <file>]');
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
const prompts = corpusFile ? JSON.parse(await fs.readFile(corpusFile, 'utf8')).items.filter((item) => item.kind === 'chat').map((item) => item.body.prompt) : [];

const post = async (base, route, body, timeoutMs = 600000) => {
    const response = await fetch(`${base}${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${route} ${response.status}: ${JSON.stringify(data).slice(0, 300)}`);
    return data;
};
const status = async () => (await fetch(`${url}/status`)).json();
const marks = (s) => ({ loads: s.text?.loads ?? 0, pid: s.text?.pid ?? null, comfyPid: s.comfy?.ownedPid ?? null, fit: s.text?.fitCorrectionMiB ?? null,
    spill: s.spill?.events?.length ?? 0, replyWaits: s.replyWaits ?? null, burst: s.burst ?? null, reclaims: s.comfy?.reclaims ?? null, lastReclaim: s.comfy?.lastReclaim ?? null,
    wakes: s.text?.sleepStats?.wakes ?? 0, lastWakeMs: s.text?.sleepStats?.lastWakeMs ?? null, lightWakes: s.text?.sleepStats?.lightWakes ?? 0, lightFreedMiB: s.text?.sleepStats?.lastLightFreedMiB ?? null,
    residency: s.lastResidency ? { decision: s.lastResidency.decision, admitted: s.lastResidency.admittedReadings ?? null } : null,
    memberHits: s.memberCache?.hits ?? null, memberMisses: s.memberCache?.misses ?? null, dropped: s.text?.sleepStats?.dropped ?? 0, spills: s.memberCache?.spills ?? 0, spillsInsteadOfDrop: s.memberCache?.spillsInsteadOfDrop ?? 0, spillDisk: s.memberCache?.spill?.disk ?? null, lastSpill: s.memberCache?.spill?.lastSpill ?? null });

const image = async (index) => {
    const graph = buildGraph({ checkpoint, family, loras: [], positive: `an empty old stone hall, fireplace, warm light, detailed architecture, no people, variant ${index}`,
        negative: 'text, watermark, low quality', size, seed: 1000 + index, hires: false, upscaler: config.benchmarkUpscaler ?? 'RealESRGAN_x4plus_anime_6B.safetensors' });
    const began = Date.now();
    const lease = await post(url, '/lease', { workflowKey: renderSignature(graph), needGpuMiB, nextTextTokens: replyTokens, modelFiles, ...size, hires: false });
    const admittedMs = Date.now() - began;
    try {
        const queued = await post(config.comfyUrl, '/prompt', { prompt: graph, client_id: `so-burst-${process.pid}` });
        const renderBegan = Date.now();
        while (true) {
            const history = await (await fetch(`${config.comfyUrl}/history/${queued.prompt_id}`)).json();
            const entry = history[queued.prompt_id];
            if (entry?.status?.completed) { if (entry.status.status_str !== 'success') throw new Error(JSON.stringify(entry.status)); break; }
            if (entry?.status?.status_str === 'error') throw new Error(JSON.stringify(entry.status));
            if (Date.now() - renderBegan > 600000) throw new Error('render timed out');
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
        return { admittedMs, renderMs: Date.now() - renderBegan, decision: lease.decision ?? null };
    } finally { await post(url, '/release', { lease: lease.lease }); }
};

const reply = async (index) => {
    const prompt = prompts.length ? prompts[index % prompts.length] : '<|turn>user\nDescribe a stone hall with a fireplace and its furniture in detail.<turn|>\n<|turn>model\n';
    const began = Date.now();
    const response = await fetch(`${url}/completion`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt, n_predict: replyTokens, temperature: 0.7, seed: 1234, stream: true, cache_prompt: true }), signal: AbortSignal.timeout(600000) });
    if (!response.ok) throw new Error(`reply ${response.status}: ${await response.text()}`);
    let first = null; let timings = null; let buffer = ''; const decoder = new TextDecoder();
    for await (const chunk of response.body) {
        buffer += decoder.decode(chunk, { stream: true });
        const events = buffer.split('\n'); buffer = events.pop();
        for (const event of events) { if (!event.startsWith('data: ')) continue; const data = JSON.parse(event.slice(6)); if (data.content && first === null) first = Date.now(); if (data.stop) timings = data.timings; }
    }
    return { ttftMs: first === null ? null : first - began, totalMs: Date.now() - began, promptN: timings?.prompt_n ?? null, cacheN: timings?.cache_n ?? null, decodeTps: timings?.predicted_per_second ?? null };
};

await post(url, '/control/automatic', {});
const start = marks(await status());
const steps = [];
const runsOfImages = [...pattern.matchAll(/I+/g)].map((match) => match[0].length);
let burstId = null;
if (burst) burstId = (await post(url, '/burst', { count: runsOfImages.reduce((a, b) => a + b, 0), ttlMs: 600000, kind: 'bench' })).burst;
let images = 0; let replies = 0; let lastImageEnd = null;
for (const kind of pattern) {
    const before = marks(await status());
    const began = Date.now();
    const step = kind === 'I' ? { kind, ...(await image(images++)) } : { kind, ...(await reply(replies++)), afterImageMs: lastImageEnd ? Date.now() - lastImageEnd : null };
    const after = marks(await status());
    if (kind === 'I') lastImageEnd = Date.now(); else { step.afterImageMs = lastImageEnd ? Date.now() - lastImageEnd : null; lastImageEnd = null; }
    steps.push({ ...step, wallMs: Date.now() - began, reloads: after.loads - before.loads, comfyRestarted: Boolean(before.comfyPid && after.comfyPid && before.comfyPid !== after.comfyPid) || (!before.comfyPid && Boolean(after.comfyPid) && kind === 'I'),
        textLoadedBefore: Boolean(before.pid), wakeMs: after.wakes > before.wakes ? after.lastWakeMs : null, lightWake: after.lightWakes > before.lightWakes,
        lightFreedMiB: kind === 'I' ? after.lightFreedMiB : undefined, residency: kind === 'I' ? after.residency : undefined,
        memberHit: kind === 'R' && after.memberHits !== null ? after.memberHits > before.memberHits && !(after.memberMisses > before.memberMisses) : undefined, dropped: after.dropped - before.dropped, spilledInsteadOfDrop: after.spillsInsteadOfDrop - before.spillsInsteadOfDrop, spills: after.spills - before.spills, spillDisk: after.spillDisk, lastSpill: kind === 'I' ? after.lastSpill : undefined });
}
if (burstId) await post(url, '/burst', { close: burstId }).catch(() => {});
await new Promise((resolve) => setTimeout(resolve, 8000));
const end = marks(await status());
const summary = { pattern, burst, replyTokens, steps, reloads: end.loads - start.loads, comfyStarts: steps.filter((step) => step.comfyRestarted).length,
    replyTtftP50: (() => { const v = steps.filter((s) => s.kind === 'R').map((s) => s.ttftMs).sort((a, b) => a - b); return v[Math.floor(v.length / 2)] ?? null; })(),
    imageToReplyMs: steps.filter((s) => s.kind === 'R' && s.afterImageMs != null).map((s) => s.afterImageMs),
    fitCorrectionMiB: end.fit, spillEvents: end.spill - start.spill, replyWaits: end.replyWaits, burstState: end.burst, reclaims: end.reclaims, lastReclaim: end.lastReclaim };
if (out) await fs.writeFile(out, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ...summary, steps: steps.map((s) => ({ kind: s.kind, wallMs: s.wallMs, reloads: s.reloads, ttftMs: s.ttftMs, renderMs: s.renderMs, decision: s.decision, comfyRestarted: s.comfyRestarted })) }));

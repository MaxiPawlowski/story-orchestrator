import fs from 'node:fs/promises';
import { createWriteStream, openSync, closeSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import os from 'node:os';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { nativeArgs, slots } from '../../server-plugin/story-orchestrator-gpu/broker/backend.mjs';
import { PromptReuse, promptReuseOptions } from '../../server-plugin/story-orchestrator-gpu/broker/promptReuse.mjs';

const argv = process.argv.slice(2);
const command = argv[0] ?? 'help';
const option = (name, fallback = null) => { const at = argv.indexOf(`--${name}`); return at >= 0 ? argv[at + 1] : fallback; };
const flag = (name) => argv.includes(`--${name}`);
const configFile = option('config', process.env.SO_LOCAL_CONFIG ?? 'C:/dev/tools/story-orchestrator-local/config.json');
const outRoot = option('out', process.env.SO_BENCH_DIR ?? 'C:/dev/so-lanes/bench-controller');
const port = Number(option('port', 18890));
const comfyBenchPort = Number(option('comfy-port', 18288));
const seed = Number(option('seed', 1234));
const chatCap = Number(option('chat-tokens', 192));
const sideCap = Number(option('side-tokens', 96));
const MTP = option('mtp', 'C:/dev/models/hf/hub/models--TheDrummer--Artemis-31B-v1.1-GGUF/snapshots/65d0086759d0d45f728b610f48651d4a98d89ed4/MTP/mtp-Artemis-31B-v1m-Q8_0.gguf');
const memberDir = option('member-dir', 'C:/dev/so-lanes/bench-controller/member-slots');
const RESERVED = [6006, 8000, 8095, 8096, 8188, 8765, 9222, 18079, 18080, 18888, 18889];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

const setFlag = (args, name, value) => { const at = args.indexOf(name); if (at >= 0) args[at + 1] = String(value); else args.push(name, String(value)); return args; };
const MODIFIERS = {
    base: (a) => a,
    cram4096: (a) => setFlag(a, '--cache-ram', 4096),
    cram6144: (a) => setFlag(a, '--cache-ram', 6144),
    par2: (a) => setFlag(a, '--parallel', 2),
    par2pin: (a) => setFlag(a, '--parallel', 2),
    mtp2: (a) => [...a, '--model-draft', MTP, '--spec-type', 'draft-mtp', '--spec-draft-n-max', '2'],
    mtp3: (a) => [...a, '--model-draft', MTP, '--spec-type', 'draft-mtp', '--spec-draft-n-max', '3'],
    mtp4: (a) => [...a, '--model-draft', MTP, '--spec-type', 'draft-mtp', '--spec-draft-n-max', '4'],
    cms2048: (a) => [...a, '--checkpoint-min-step', '2048', '--ctx-checkpoints', '8'],
    cms1024c4: (a) => [...a, '--checkpoint-min-step', '1024', '--ctx-checkpoints', '4'],
    v4: (a) => [...a, '--verbosity', '4'],
    nocis: (a) => [...a, '--no-cache-idle-slots'],
    cram8192: (a) => setFlag(a, '--cache-ram', 8192),
    kvq4v: (a) => setFlag(a, '--cache-type-v', 'q4_0'),
    ckpt3: (a) => [...a, '--ctx-checkpoints', '3'],
    ckpt4: (a) => [...a, '--ctx-checkpoints', '4'],
    reuse: (a) => a,
    member: (a) => [...setFlag(a, '--cache-ram', 0), '--slot-save-path', memberDir],
    membercut: (a) => [...setFlag(a, '--cache-ram', 0), '--slot-save-path', memberDir],
    config: (a) => a,
    nopark: (a) => a,
    cram0: (a) => setFlag(a, '--cache-ram', 0),
    ctx64k: (a) => setFlag(setFlag(a, '--ctx-size', 65536), '--fit-ctx', 65536),
};
const DEFAULT_ARMS = ['base', 'cram6144', 'par2pin', 'par2', 'mtp3', 'mtp2', 'mtp4', 'cms2048', 'cram4096', 'kvq4v', 'base'];

const loadConfig = async () => JSON.parse(await fs.readFile(configFile, 'utf8'));
const armArgs = (config, arm) => {
    const profile = config.profiles[config.defaultProfile];
    const controller = arm.split('+').includes('config');
    const tuned = controller ? config : { ...config, speculative: undefined, cacheRamMiB: undefined, ctxCheckpoints: undefined, slots: undefined, promptReuse: undefined };
    let args = nativeArgs({ ...tuned, backendPort: port }, profile, config.reserves.gpuMiB);
    for (const part of arm.split('+')) {
        if (!MODIFIERS[part]) throw new Error(`Unknown arm part ${part}; known: ${Object.keys(MODIFIERS).join(', ')}`);
        args = MODIFIERS[part]([...args]);
    }
    return args;
};
const pinned = (arm, config) => arm.split('+').includes('par2pin') || (arm.split('+').includes('config') && Boolean(slots(config)));
const reusing = (arm, config) => arm.split('+').includes('reuse') || (arm.split('+').includes('config') && Boolean(promptReuseOptions(config)));

const listening = async (p) => { try { await fetch(`http://127.0.0.1:${p}/health`, { signal: AbortSignal.timeout(1500) }); return true; } catch { return false; } };
const gpuQuery = (fields) => execFileSync('nvidia-smi', [`--query-gpu=${fields}`, '--format=csv,noheader,nounits'], { encoding: 'utf8' }).trim().split(',').map((value) => value.trim());
const GPU_FIELDS = 'memory.free,memory.used,power.draw,power.limit,clocks.sm,clocks.mem,pstate,temperature.gpu';
const gpuInfo = () => {
    const [name, driver, limit, defaultLimit, maxSm, maxMem, pstate, sm, mem] = gpuQuery('name,driver_version,power.limit,power.default_limit,clocks.max.sm,clocks.max.mem,pstate,clocks.sm,clocks.mem');
    return { name, driver, powerLimitW: Number(limit), powerDefaultW: Number(defaultLimit), maxSmMHz: Number(maxSm), maxMemMHz: Number(maxMem), pstate, smMHz: Number(sm), memMHz: Number(mem) };
};

class Telemetry {
    constructor() { this.samples = []; this.tag = null; }
    start() {
        this.child = spawn('nvidia-smi', [`--query-gpu=${GPU_FIELDS}`, '--format=csv,noheader,nounits', '-lms', '500'], { windowsHide: true });
        let buffer = '';
        this.child.stdout.on('data', (chunk) => {
            buffer += chunk;
            const lines = buffer.split(/\r?\n/); buffer = lines.pop();
            for (const line of lines) {
                const [free, used, draw, limit, sm, mem, pstate] = line.split(',').map((value) => value.trim());
                if (!Number.isFinite(Number(free))) continue;
                this.samples.push({ t: Date.now(), tag: this.tag, gpuFreeMiB: Number(free), gpuUsedMiB: Number(used), powerW: Number(draw), powerLimitW: Number(limit), smMHz: Number(sm), memMHz: Number(mem), pstate, ramAvailMiB: Math.round(os.freemem() / 1048576) });
            }
        });
    }
    stop() { this.child?.kill(); }
    window(tag) {
        const rows = this.samples.filter((row) => row.tag === tag);
        if (!rows.length) return {};
        const pick = (key, fn) => fn(...rows.map((row) => row[key]));
        return { minGpuFreeMiB: pick('gpuFreeMiB', Math.min), minRamAvailMiB: pick('ramAvailMiB', Math.min), maxPowerW: pick('powerW', Math.max), medianSmMHz: median(rows.map((row) => row.smMHz)), powerLimitW: rows[0].powerLimitW };
    }
    lastRamMiB() { return this.samples.at(-1)?.ramAvailMiB ?? Math.round(os.freemem() / 1048576); }
}
const median = (values) => { const sorted = values.filter(Number.isFinite).sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null; };
const pct = (values, p) => { const sorted = values.filter(Number.isFinite).sort((a, b) => a - b); return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : null; };

const killTree = (pid) => { try { execFileSync('taskkill', ['/T', '/F', '/PID', String(pid)], { stdio: 'ignore' }); } catch {} };

async function startServer(config, arm, dir) {
    const args = armArgs(config, arm);
    const logFile = path.join(dir, `server-${arm.replace(/\+/g, '_')}.log`);
    const fd = openSync(logFile, 'w');
    const began = Date.now();
    const child = spawn(config.binary, args, { windowsHide: true, stdio: ['ignore', fd, fd] });
    closeSync(fd);
    let exited = null;
    child.once('exit', (code) => { exited = code ?? -1; });
    while (Date.now() - began < 240000) {
        if (exited !== null) throw new Error(`llama-server exited ${exited} while loading ${arm}; see ${logFile}`);
        try { const health = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2000) }); if (health.ok) return { child, logFile, args, loadMs: Date.now() - began }; } catch {}
        await sleep(500);
    }
    killTree(child.pid);
    throw new Error(`llama-server did not become healthy for ${arm}`);
}

async function stopServer(server) {
    killTree(server.child.pid);
    const until = Date.now() + 30000;
    while (Date.now() < until && await listening(port)) await sleep(500);
    await sleep(2000);
}

const REQUEST_KEYS = ['prompt', 'temperature', 'min_p', 'top_p', 'top_k', 'typical_p', 'repeat_penalty', 'repeat_last_n', 'frequency_penalty', 'presence_penalty',
    'dry_multiplier', 'dry_base', 'dry_allowed_length', 'dry_penalty_last_n', 'dry_sequence_breakers', 'xtc_threshold', 'xtc_probability', 'top_n_sigma', 'samplers',
    'stop', 'ignore_eos', 'n_probs', 'min_keep', 'adaptive_target', 'adaptive_decay', 'mirostat', 'mirostat_tau', 'mirostat_eta', 'grammar', 'json_schema'];
const requestBody = (item, budget, slot) => {
    const body = Object.fromEntries(REQUEST_KEYS.filter((key) => item.body[key] !== undefined && item.body[key] !== '').map((key) => [key, item.body[key]]));
    return { ...body, n_predict: Math.min(item.body.n_predict ?? budget, budget), seed, stream: true, cache_prompt: true, ...(slot === null ? {} : { id_slot: slot }) };
};

async function complete(body) {
    const began = performance.now();
    const response = await fetch(`http://127.0.0.1:${port}/completion`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(600000) });
    if (!response.ok) throw new Error(`completion ${response.status}: ${await response.text()}`);
    let firstToken = null; let text = ''; let last = null; let buffer = '';
    const decoder = new TextDecoder();
    for await (const chunk of response.body) {
        buffer += decoder.decode(chunk, { stream: true });
        const events = buffer.split('\n'); buffer = events.pop();
        for (const event of events) {
            if (!event.startsWith('data: ')) continue;
            const data = JSON.parse(event.slice(6));
            if (data.content && firstToken === null) firstToken = performance.now();
            text += data.content ?? '';
            if (data.stop) last = data;
        }
    }
    const t = last?.timings ?? {};
    return { ttftMs: firstToken === null ? null : Math.round(firstToken - began), totalMs: Math.round(performance.now() - began), text,
        promptN: t.prompt_n, promptMs: t.prompt_ms, prefillTps: t.prompt_per_second, predictedN: t.predicted_n, decodeTps: t.predicted_per_second,
        cached: last?.tokens_cached, evaluated: last?.tokens_evaluated, reused: Number.isFinite(last?.tokens_evaluated) && Number.isFinite(t.prompt_n) ? last.tokens_evaluated - t.prompt_n : null, draftN: t.draft_n ?? null, draftAccepted: t.draft_n_accepted ?? null };
}

async function post(body) {
    const began = performance.now();
    const response = await fetch(`http://127.0.0.1:${port}/completion`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(600000) });
    const data = await response.json();
    if (!response.ok) throw new Error(`completion ${response.status}: ${JSON.stringify(data).slice(0, 300)}`);
    return { ms: Math.round(performance.now() - began), promptN: data.timings?.prompt_n, evaluated: data.tokens_evaluated };
}

async function completeWithReuse(reuse, item, budget, slot) {
    const began = performance.now();
    const body = requestBody(item, budget, slot);
    const steps = [];
    const prefill = reuse.prefill(body, slot ?? 'all');
    if (prefill) steps.push({ kind: 'prefill', ...(await post(slot === null ? prefill : { ...prefill, id_slot: slot })) });
    const startedAt = performance.now();
    const result = await complete(body);
    const firstTokenAt = result.ttftMs === null ? null : startedAt + result.ttftMs;
    const totalMs = Math.round(performance.now() - began);
    const park = reuse.park(true);
    if (park) steps.push({ kind: 'park', ...(await post(park)) });
    return { ...result, ttftMs: firstTokenAt === null ? null : Math.round(firstTokenAt - began), totalMs, parkMs: steps.find((step) => step.kind === 'park')?.ms ?? 0,
        prefillPromptN: steps.find((step) => step.kind === 'prefill')?.promptN ?? null, steps };
}

const memberKey = (prompt) => createHash('sha1').update(prompt.slice(0, Number(option('member-head', 2000)))).digest('hex').slice(0, 16);
const historyCut = (prompt) => { const turns = [...prompt.matchAll(/<\|turn>system\n/g)].map((m) => m.index); return turns.length > 1 ? turns[1] : null; };
async function slotAction(action, filename) {
    const began = performance.now();
    const response = await fetch(`http://127.0.0.1:${port}/slots/0?action=${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename }), signal: AbortSignal.timeout(120000) });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, ms: Math.round(performance.now() - began), data };
}
async function completeWithMember(item, budget, cutFirst, seen) {
    const began = performance.now();
    const body = requestBody(item, budget, 0);
    const key = memberKey(item.body.prompt);
    const filename = `m-${key}.bin`;
    let restore = null; let prefill = null;
    if (seen.has(key)) restore = await slotAction('restore', filename);
    const cut = cutFirst ? historyCut(item.body.prompt) : null;
    if (cut) prefill = await post({ ...body, prompt: item.body.prompt.slice(0, cut), n_predict: 0, stream: false });
    const startedAt = performance.now();
    const result = await complete(body);
    const ttftMs = result.ttftMs === null ? null : Math.round(startedAt + result.ttftMs - began);
    const save = await slotAction('save', filename);
    seen.add(key);
    let fileMiB = null;
    try { fileMiB = Math.round((await fs.stat(path.join(memberDir, filename))).size / 1048576); } catch {}
    return { ...result, ttftMs, member: key, restoreMs: restore?.ms ?? null, restoreOk: restore?.ok ?? null, restoredTokens: restore?.data?.n_restored ?? null,
        prefillMs: prefill?.ms ?? null, prefillPromptN: prefill?.promptN ?? null, saveMs: save.ms, saveOk: save.ok, fileMiB, promptN: (result.promptN ?? 0) + (prefill?.promptN ?? 0), reusedFinal: result.reused };
}

function serverCounts(log) {
    return { lru: (log.match(/selected slot by LRU/g) ?? []).length, lcp: (log.match(/selected slot by LCP similarity/g) ?? []).length,
        exceed: (log.match(/exceeds cache size limit/g) ?? []).length, restored: (log.match(/restored context checkpoint/g) ?? []).length, forced: (log.match(/forcing full prompt re-processing/g) ?? []).length, cacheEvict: (log.match(/making room for prompt cache entry/g) ?? []).length,
        swaKv: log.match(/SWA KV cache, size = (\d+) cells/)?.[1] ?? null, ctxSlot: log.match(/n_ctx_slot = (\d+)/)?.[1] ?? null,
        kvBuffers: [...log.matchAll(/CUDA0 KV buffer size =\s+([\d.]+) MiB/g)].map((m) => Number(m[1])),
        draftLoaded: /draft/i.test(log.match(/load_model[^\n]*draft[^\n]*/)?.[0] ?? '') };
}

async function runArm(config, corpus, arm, dir, telemetry) {
    const baseline = gpuQuery('memory.free')[0];
    if (arm.split('+').some((part) => part.startsWith('member'))) { await fs.rm(memberDir, { recursive: true, force: true }); await fs.mkdir(memberDir, { recursive: true }); }
    const server = await startServer(config, arm, dir);
    const rows = [];
    const memberMode = arm.split('+').find((part) => part === 'member' || part === 'membercut');
    const seen = new Set();
    const reuse = reusing(arm, config) ? new PromptReuse({ ...promptReuseOptions(config), ...(pinned(arm, config) ? { history: 1 } : {}), parkWhenIdle: !arm.split('+').includes('nopark') && !pinned(arm, config) && (promptReuseOptions(config)?.parkWhenIdle ?? true) }) : null;
    try {
        await sleep(1500);
        const afterLoad = { gpuFreeMiB: Number(gpuQuery('memory.free')[0]), ramAvailMiB: Math.round(os.freemem() / 1048576) };
        telemetry.tag = `${arm}:warmup`;
        await complete({ prompt: '<|turn>user\nSay hello.<turn|>\n<|turn>model\n', n_predict: 8, seed, stream: true, cache_prompt: false });
        const sequence = [...corpus.items.map((item, index) => ({ ...item, index })),
            { kind: 'long', body: corpus.long.body, index: 'long' },
            { kind: 'swipe', body: corpus.items.findLast((item) => item.kind === 'chat').body, index: 'swipe' }];
        for (const item of sequence) {
            if (telemetry.lastRamMiB() < 3000) throw new Error(`RAM available fell to ${telemetry.lastRamMiB()} MiB; arm ${arm} aborted.`);
            const slot = pinned(arm, config) ? (item.kind === 'chat' || item.kind === 'swipe' || item.kind === 'long' ? 0 : 1) : null;
            const budget = item.kind === 'chat' ? chatCap : item.kind === 'long' || item.kind === 'swipe' ? 32 : sideCap;
            telemetry.tag = `${arm}:${item.index}`;
            const result = memberMode && (item.kind === 'chat' || item.kind === 'swipe') ? await completeWithMember(item, budget, memberMode === 'membercut', seen)
                : reuse ? await completeWithReuse(reuse, item, budget, slot) : await complete(requestBody(item, budget, slot));
            await sleep(250);
            const { text, ...kept } = result;
            rows.push({ arm, index: item.index, kind: item.kind, role: item.role ?? item.kind, promptChars: item.body.prompt.length, ...kept, outputChars: text.length, ...telemetry.window(`${arm}:${item.index}`) });
            process.stdout.write(`${arm} ${item.index} ${item.kind} ttft=${result.ttftMs} pn=${result.promptN} reused=${result.reused} tps=${result.decodeTps?.toFixed(1)} acc=${result.draftAccepted ?? '-'}/${result.draftN ?? '-'}\n`);
        }
        const log = await fs.readFile(server.logFile, 'utf8');
        return { arm, args: server.args, loadMs: server.loadMs, baselineGpuFreeMiB: Number(baseline), afterLoad, counts: serverCounts(log), rows };
    } finally { await stopServer(server); }
}

function summarize(result) {
    const rows = result.rows.filter((row) => Number.isInteger(row.index));
    const by = (kind) => rows.filter((row) => row.kind === kind);
    const stat = (list, key) => ({ p50: median(list.map((row) => row[key])), p90: pct(list.map((row) => row[key]), 0.9), mean: list.length ? Math.round(list.reduce((sum, row) => sum + (row[key] ?? 0), 0) / list.length) : null });
    const side = rows.filter((row) => row.kind !== 'chat');
    const accepted = rows.reduce((sum, row) => sum + (row.draftAccepted ?? 0), 0);
    const drafted = rows.reduce((sum, row) => sum + (row.draftN ?? 0), 0);
    const long = result.rows.find((row) => row.index === 'long');
    const swipe = result.rows.find((row) => row.index === 'swipe');
    return { arm: result.arm, loadMs: result.loadMs, gpuFreeAfterLoadMiB: result.afterLoad.gpuFreeMiB, ramAvailAfterLoadMiB: result.afterLoad.ramAvailMiB,
        ttftChat: stat(by('chat'), 'ttftMs'), ttftSide: stat(side, 'ttftMs'), ttftAll: stat(rows, 'ttftMs'),
        promptProcessedSum: rows.reduce((sum, row) => sum + (row.promptN ?? 0), 0), reusedSum: rows.reduce((sum, row) => sum + (row.reused ?? 0), 0),
        prefillTps: median(rows.filter((row) => row.promptN >= 1000).map((row) => row.prefillTps)), decodeTpsChat: median(by('chat').map((row) => row.decodeTps)),
        decodeTpsSide: median(side.map((row) => row.decodeTps)), wallMs: rows.reduce((sum, row) => sum + row.totalMs, 0),
        draftAcceptance: drafted ? accepted / drafted : null, drafted, accepted,
        minGpuFreeMiB: Math.min(...result.rows.map((row) => row.minGpuFreeMiB).filter(Number.isFinite)), minRamAvailMiB: Math.min(...result.rows.map((row) => row.minRamAvailMiB).filter(Number.isFinite)),
        maxPowerW: Math.max(...result.rows.map((row) => row.maxPowerW).filter(Number.isFinite)), medianSmMHz: median(result.rows.map((row) => row.medianSmMHz)),
        longPrefill: long ? { promptN: long.promptN, prefillTps: long.prefillTps, ttftMs: long.ttftMs } : null,
        swipe: swipe ? { promptN: swipe.promptN, reused: swipe.reused, ttftMs: swipe.ttftMs } : null, counts: result.counts };
}

async function preflight() {
    for (const p of [port, comfyBenchPort]) if (RESERVED.includes(p)) throw new Error(`Port ${p} is reserved.`);
    if (await listening(18888) || await listening(18889)) throw new Error('The local controller is running; stop it first (node scripts/local/cli.mjs stop). The bench owns the GPU alone.');
    if (await listening(port)) throw new Error(`Port ${port} is already in use.`);
    const free = Number(gpuQuery('memory.free')[0]);
    if (free < 21000) throw new Error(`Only ${free} MiB GPU free; the bench needs the card idle (>= 21000 MiB).`);
}

async function textBench() {
    const config = await loadConfig();
    await preflight();
    const corpus = JSON.parse(await fs.readFile(option('corpus', path.join(outRoot, 'corpus.json')), 'utf8'));
    const arms = (option('arms') ?? DEFAULT_ARMS.join(',')).split(',');
    const dir = path.join(outRoot, `text-${stamp()}`);
    await fs.mkdir(dir, { recursive: true });
    const header = { at: new Date().toISOString(), gpu: gpuInfo(), host: { totalRamMiB: Math.round(os.totalmem() / 1048576), cpu: os.cpus()[0]?.model }, binary: config.binary, model: config.model,
        corpus: { file: corpus.source, items: corpus.items.length, kinds: corpus.items.reduce((acc, item) => ({ ...acc, [item.kind]: (acc[item.kind] ?? 0) + 1 }), {}) }, seed, chatCap, sideCap, arms };
    await fs.writeFile(path.join(dir, 'header.json'), JSON.stringify(header, null, 2));
    const telemetry = new Telemetry(); telemetry.start();
    const raw = createWriteStream(path.join(dir, 'rows.jsonl'));
    const summaries = [];
    try {
        for (const arm of arms) {
            try {
                const result = await runArm(config, corpus, arm, dir, telemetry);
                for (const row of result.rows) raw.write(`${JSON.stringify(row)}\n`);
                const summary = summarize(result);
                summaries.push(summary);
                await fs.writeFile(path.join(dir, 'summary.json'), JSON.stringify({ header, summaries }, null, 2));
                console.log(JSON.stringify({ arm, ttftChatP50: summary.ttftChat.p50, ttftSideP50: summary.ttftSide.p50, processed: summary.promptProcessedSum, reused: summary.reusedSum, decodeChat: summary.decodeTpsChat, acceptance: summary.draftAcceptance, minGpuFree: summary.minGpuFreeMiB, counts: summary.counts }));
            } catch (error) { summaries.push({ arm, error: error.message }); console.error(`${arm}: ${error.message}`); }
        }
    } finally { telemetry.stop(); raw.end(); }
    header.gpuAfter = gpuInfo();
    await fs.writeFile(path.join(dir, 'summary.json'), JSON.stringify({ header, summaries }, null, 2));
    console.log(`Wrote ${dir}`);
}

const OPENAI_KEYS = { prompt: 'prompt', temperature: 'temperature', min_p: 'min_p', top_p: 'top_p', top_k: 'top_k', typical_p: 'typical_p', presence_penalty: 'presence_penalty',
    frequency_penalty: 'frequency_penalty', repeat_penalty: 'repetition_penalty', repeat_last_n: 'penalty_range', dry_multiplier: 'dry_multiplier', dry_base: 'dry_base',
    dry_allowed_length: 'dry_allowed_length', dry_penalty_last_n: 'dry_range', dry_sequence_breakers: 'dry_sequence_breakers', xtc_threshold: 'xtc_threshold',
    xtc_probability: 'xtc_probability', top_n_sigma: 'top_n_sigma', stop: 'stop', min_keep: 'min_keep', adaptive_target: 'adaptive_target', adaptive_decay: 'adaptive_decay' };
const openAiBody = (item, budget, model) => {
    const body = {};
    for (const [from, to] of Object.entries(OPENAI_KEYS)) if (item.body[from] !== undefined && item.body[from] !== '') body[to] = item.body[from];
    if (body.penalty_range === 0) delete body.penalty_range;
    if (!(body.adaptive_target >= 0)) { delete body.adaptive_target; delete body.adaptive_decay; }
    const max = Math.min(item.body.n_predict ?? budget, budget);
    return { ...body, ...(model ? { model } : {}), max_tokens: max, n_predict: max, seed, stream: true, stream_options: { include_usage: true }, cache_prompt: true };
};

async function completeOpenAi(url, body) {
    const began = performance.now();
    const headers = { 'content-type': 'application/json', ...(process.env.SO_BENCH_API_KEY ? { authorization: `Bearer ${process.env.SO_BENCH_API_KEY}` } : {}) };
    const response = await fetch(`${url}/v1/completions`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(900000) });
    if (!response.ok) throw new Error(`completions ${response.status}: ${(await response.text()).slice(0, 400)}`);
    let firstToken = null; let lastToken = null; let text = ''; let usage = null; let timings = null; let chunks = 0; let buffer = '';
    const decoder = new TextDecoder();
    for await (const chunk of response.body) {
        buffer += decoder.decode(chunk, { stream: true });
        const events = buffer.split('\n'); buffer = events.pop();
        for (const event of events) {
            if (!event.startsWith('data: ') || event.startsWith('data: [DONE]')) continue;
            const data = JSON.parse(event.slice(6));
            const piece = data.choices?.[0]?.text ?? '';
            if (piece) { const now = performance.now(); if (firstToken === null) firstToken = now; lastToken = now; chunks += 1; text += piece; }
            if (data.usage) usage = data.usage;
            if (data.timings) timings = data.timings;
        }
    }
    const end = performance.now();
    const promptTotal = usage?.prompt_tokens ?? timings?.prompt_n ?? null;
    const cachedTokens = usage?.prompt_tokens_details?.cached_tokens ?? (Number.isFinite(timings?.cache_n) ? timings.cache_n : null);
    const completionN = usage?.completion_tokens ?? timings?.predicted_n ?? chunks;
    const ttftMs = firstToken === null ? null : Math.round(firstToken - began);
    const decodeSpan = firstToken === null || lastToken === null ? 0 : (lastToken - firstToken) / 1000;
    const processed = Number.isFinite(promptTotal) ? promptTotal - (cachedTokens ?? 0) : null;
    return { ttftMs, totalMs: Math.round(end - began), text, promptN: processed, promptTotal, reused: cachedTokens, predictedN: completionN,
        prefillTps: ttftMs && Number.isFinite(processed) ? processed / (ttftMs / 1000) : null, decodeTps: completionN > 1 && decodeSpan > 0 ? (completionN - 1) / decodeSpan : null,
        draftN: timings?.draft_n ?? null, draftAccepted: timings?.draft_n_accepted ?? null, engineTimings: timings };
}

async function endpointBench() {
    const label = option('label', 'endpoint');
    const llamaArm = option('llama-arm');
    const full = flag('full');
    const fullCap = Number(option('full-tokens', 1024));
    const model = option('model');
    let url = option('url');
    if (!url && !llamaArm) throw new Error('Usage: endpoint (--url http://127.0.0.1:<port> | --llama-arm <arm>) --label <name> [--corpus file] [--model id] [--full [--full-tokens 1024]] [--repeat 1]');
    if (url && RESERVED.includes(Number(new URL(url).port))) throw new Error(`Port ${new URL(url).port} is reserved.`);
    if (await listening(18888) || await listening(18889)) throw new Error('The local controller is running; stop it first (node scripts/local/cli.mjs stop).');
    const config = await loadConfig();
    const corpusFile = option('corpus', path.join(outRoot, 'corpus.json'));
    const corpus = JSON.parse(await fs.readFile(corpusFile, 'utf8'));
    const dir = path.join(outRoot, `endpoint-${label}-${stamp()}`);
    await fs.mkdir(dir, { recursive: true });
    const baselineFree = Number(gpuQuery('memory.free')[0]);
    let server = null;
    if (llamaArm) {
        if (baselineFree < 21000) throw new Error(`Only ${baselineFree} MiB GPU free; need >= 21000 MiB for a llama-server arm.`);
        if (await listening(port)) throw new Error(`Port ${port} is already in use.`);
        server = await startServer(config, llamaArm, dir);
        url = `http://127.0.0.1:${port}`;
    }
    const header = { at: new Date().toISOString(), label, url, llamaArm, binary: llamaArm ? config.binary : null, args: server?.args ?? null, loadMs: server?.loadMs ?? null, gpu: gpuInfo(),
        baselineGpuFreeMiB: baselineFree, corpus: { file: corpusFile, items: corpus.items.length }, seed, chatCap: full ? fullCap : chatCap, sideCap: full ? fullCap : sideCap, full };
    const telemetry = new Telemetry(); telemetry.start();
    const raw = createWriteStream(path.join(dir, 'rows.jsonl'));
    const outputs = createWriteStream(path.join(dir, 'outputs.jsonl'));
    const rows = [];
    try {
        await sleep(1500);
        const afterLoad = { gpuFreeMiB: Number(gpuQuery('memory.free')[0]), ramAvailMiB: Math.round(os.freemem() / 1048576) };
        telemetry.tag = `${label}:warmup`;
        await completeOpenAi(url, { prompt: '<|turn>user\nSay hello.<turn|>\n<|turn>model\n', ...(model ? { model } : {}), max_tokens: 8, seed, stream: true, cache_prompt: false });
        const sequence = [...corpus.items.map((item, index) => ({ ...item, index })),
            ...(full ? [] : [{ kind: 'long', body: corpus.long.body, index: 'long' }, { kind: 'swipe', body: corpus.items.findLast((item) => item.kind === 'chat').body, index: 'swipe' }])];
        for (let pass = 0; pass < Number(option('repeat', 1)); pass += 1) for (const item of sequence) {
            if (telemetry.lastRamMiB() < 3000) throw new Error(`RAM available fell to ${telemetry.lastRamMiB()} MiB; aborted.`);
            const budget = full ? fullCap : item.kind === 'chat' ? chatCap : item.kind === 'long' || item.kind === 'swipe' ? 32 : sideCap;
            const tag = `${label}:${pass}:${item.index}`;
            telemetry.tag = tag;
            const result = await completeOpenAi(url, openAiBody(item, budget, model));
            await sleep(250);
            const { text, engineTimings, ...kept } = result;
            const row = { arm: label, pass, index: item.index, kind: item.kind, role: item.role ?? item.kind, promptChars: item.body.prompt.length, ...kept, outputChars: text.length, ...telemetry.window(tag) };
            rows.push(row); raw.write(`${JSON.stringify(row)}\n`);
            outputs.write(`${JSON.stringify({ label, pass, index: item.index, kind: item.kind, role: item.role ?? item.kind, text })}\n`);
            process.stdout.write(`${label} ${pass}:${item.index} ${item.kind} ttft=${result.ttftMs} pn=${result.promptN} reused=${result.reused} tps=${result.decodeTps?.toFixed(1)} acc=${result.draftAccepted ?? '-'}/${result.draftN ?? '-'}\n`);
        }
        const summary = summarize({ arm: label, loadMs: server?.loadMs ?? null, afterLoad, counts: null, rows });
        await fs.writeFile(path.join(dir, 'summary.json'), JSON.stringify({ header, summary }, null, 2));
        console.log(JSON.stringify({ label, ttftChatP50: summary.ttftChat.p50, ttftSideP50: summary.ttftSide.p50, processed: summary.promptProcessedSum, reused: summary.reusedSum, prefill: summary.prefillTps,
            decodeChat: summary.decodeTpsChat, decodeSide: summary.decodeTpsSide, acceptance: summary.draftAcceptance, gpuFreeAfterLoad: afterLoad.gpuFreeMiB, minGpuFree: summary.minGpuFreeMiB, minRam: summary.minRamAvailMiB }));
        console.log(`Wrote ${dir}`);
    } finally { telemetry.stop(); raw.end(); outputs.end(); if (server) await stopServer(server); }
}

const KIND = (body) => {
    const head = body.prompt.slice(0, 120);
    if (!(body.samplers ?? []).includes('tfs_z')) return ['chat', 'chat'];
    if (head.includes('STORY STATE READ')) return ['side', 'read'];
    if (head.includes('PRIVATE NOTE TASK')) return ['side', 'inner'];
    if (head.includes('plain TEXT ONLY')) return ['side', 'synthesis'];
    if (head.includes('You help a player')) return ['side', 'suggest'];
    if (head.includes('WORLD INFO CURATION')) return ['side', 'curator'];
    if (head.includes('EXTRACTION TASK')) return ['side', 'extract'];
    return ['side', 'other'];
};

async function buildCorpus() {
    const from = option('from');
    if (!from) throw new Error('Usage: corpus --from <payloads.jsonl> [--chat <chatId substring>] [--min-chars 28000] [--count 24] [--long-chars 60000]');
    const minChars = Number(option('min-chars', 28000));
    const count = Number(option('count', 24));
    const longChars = Number(option('long-chars', 60000));
    const chatFilter = option('chat');
    const rows = [];
    for (const line of (await fs.readFile(from, 'utf8')).split('\n')) {
        if (!line.trim()) continue;
        const entry = JSON.parse(line);
        const body = entry.parsedBody;
        if (!entry.url?.includes('/generate') || typeof body?.prompt !== 'string' || body.prompt.includes('Reply with exactly: PONG')) continue;
        const [kind, role] = KIND(body);
        if (chatFilter && kind === 'chat' && !String(entry.chatId).includes(chatFilter)) continue;
        if (option('prompt-has') && kind === 'chat' && !body.prompt.includes(option('prompt-has'))) continue;
        rows.push({ kind, role, chatId: entry.chatId, at: entry.capturedAt, body });
    }
    const start = rows.findIndex((row) => row.kind === 'chat' && row.body.prompt.length >= minChars);
    if (start < 0) throw new Error('No chat prompt reaches --min-chars.');
    const interleave = (option('interleave') ?? '').split(',').filter(Boolean);
    let items = rows.slice(Math.max(0, start - 2), Math.max(0, start - 2) + count);
    if (interleave.length) {
        const chats = rows.slice(start).filter((row) => row.kind === 'chat').slice(0, Math.ceil(count / (1 + interleave.length)));
        const pools = Object.fromEntries(interleave.map((role) => [role, [...new Map(rows.filter((row) => row.role === role).map((row) => [row.body.prompt, row])).values()].sort((a, b) => b.body.prompt.length - a.body.prompt.length)]));
        for (const role of interleave) if (!pools[role].length) throw new Error(`No ${role} prompts in ${from}.`);
        const used = Object.fromEntries(interleave.map((role) => [role, 0]));
        items = chats.flatMap((chat) => [...interleave.map((role) => pools[role][used[role]++ % pools[role].length]), chat]).slice(0, count);
    }
    const long = rows.find((row) => row.kind === 'chat' && row.body.prompt.length >= longChars && row.chatId === items[0].chatId) ?? rows.filter((row) => row.kind === 'chat').sort((a, b) => b.body.prompt.length - a.body.prompt.length)[0];
    await fs.mkdir(outRoot, { recursive: true });
    const out = option('corpus', path.join(outRoot, 'corpus.json'));
    await fs.writeFile(out, JSON.stringify({ source: from, builtAt: new Date().toISOString(), items, long }, null, 1));
    console.log(JSON.stringify({ out, items: items.length, roles: items.map((item) => item.role[0]).join(''), chatChars: items.filter((item) => item.kind === 'chat').map((item) => item.body.prompt.length), longChars: long.body.prompt.length }));
}

const TURN = /<\|turn>(\w+)\n[\s\S]*?<turn\|>\n/g;
const commonSuffix = (texts) => { let n = 0; while (texts.every((text) => text.length > n && text[text.length - 1 - n] === texts[0][texts[0].length - 1 - n])) n += 1; return n; };
const splitHead = (prompt) => {
    const end = prompt.indexOf('<turn|>\n') + '<turn|>\n'.length;
    const head = prompt.slice(0, end);
    const at = head.indexOf('Impersonate ');
    const lineEnd = head.indexOf('\n', at) + 1;
    return { end, before: head.slice(0, at), line: head.slice(at, lineEnd), card: head.slice(lineEnd, head.length - '<turn|>\n'.length) };
};
function relayout(prompt, mode, cards) {
    let out = prompt;
    let impersonate = '';
    if (mode.includes('joined')) {
        const { end, before, line } = splitHead(prompt);
        impersonate = line.trim();
        out = `${before}${cards}<turn|>\n${prompt.slice(end)}`;
    }
    if (mode.includes('late') || impersonate) {
        const genAt = out.lastIndexOf('<|turn>model\n');
        const body = out.slice(0, genAt);
        const firstChat = body.search(/<\|turn>(model|user)\n/);
        const moved = [];
        const kept = mode.includes('late') ? body.slice(firstChat).replace(TURN, (turn, role) => { if (role === 'system') { moved.push(turn); return ''; } return turn; }) : body.slice(firstChat);
        const late = impersonate ? [...moved, `<|turn>system\n${impersonate}<turn|>\n`] : moved;
        out = `${body.slice(0, firstChat)}${kept}${late.join('')}${out.slice(genAt)}`;
    }
    return out;
}

async function layoutCorpus() {
    const mode = option('mode', 'joined-late');
    const source = JSON.parse(await fs.readFile(option('corpus', path.join(outRoot, 'corpus.json')), 'utf8'));
    const chats = [...source.items.filter((item) => item.kind === 'chat'), source.long];
    const heads = [...new Map(chats.map((item) => { const head = splitHead(item.body.prompt); return [head.line.split(' ')[1], head.card]; })).entries()].sort(([a], [b]) => a.localeCompare(b));
    const tail = commonSuffix(heads.map(([, card]) => card));
    const cards = `${heads.map(([, card]) => card.slice(0, card.length - tail)).join('')}${heads[0][1].slice(heads[0][1].length - tail)}`;
    const convert = (item) => (item.kind === 'chat' ? { ...item, body: { ...item.body, prompt: relayout(item.body.prompt, mode, cards) } } : item);
    const out = option('out-corpus', path.join(outRoot, `corpus-${mode}.json`));
    await fs.writeFile(out, JSON.stringify({ ...source, layout: mode, items: source.items.map(convert), long: convert({ ...source.long, kind: 'chat' }) }, null, 1));
    console.log(JSON.stringify({ out, mode, members: heads.length, cardsChars: cards.length }));
}

async function imageBench() {
    const config = await loadConfig();
    for (const p of [comfyBenchPort]) if (RESERVED.includes(p)) throw new Error(`Port ${p} is reserved.`);
    if (await listening(18888) || await listening(18889)) throw new Error('The local controller is running; stop it first.');
    try { await fetch(`http://127.0.0.1:8188/system_stats`, { signal: AbortSignal.timeout(1500) }); throw new Error('A ComfyUI is already running on 8188; the image bench starts its own and needs the card alone.'); } catch (error) { if (error.message.startsWith('A ComfyUI')) throw error; }
    const { transform } = await import('esbuild');
    const home = new URL('../../', import.meta.url);
    const moduleFrom = async (file) => {
        const { code } = await transform(await fs.readFile(new URL(file, home), 'utf8'), { loader: 'ts', format: 'esm' });
        return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
    };
    const { buildGraph } = await moduleFrom('src/image/graph.ts');
    const { FAMILIES, checkpointFor, familyOf } = await moduleFrom('src/image/catalog.ts');
    const checkpointFile = option('checkpoint', config.benchmarkCheckpoint ?? 'waiIllustriousSDXL_v170.safetensors');
    const checkpoint = checkpointFor(checkpointFile, familyOf(checkpointFile) ?? 'sdxl-illustrious');
    const family = FAMILIES[checkpoint.family];
    const extra = (option('comfy-args') ?? '').split(' ').filter(Boolean);
    const comfyArgs = ['main.py', '--listen', '127.0.0.1', '--port', String(comfyBenchPort), '--disable-auto-launch', '--cache-ram', '8', '--reserve-vram', '2', ...(config.comfyExtraArgs ?? []), ...extra];
    const dir = path.join(outRoot, `image-${stamp()}`);
    await fs.mkdir(dir, { recursive: true });
    const logFile = path.join(dir, 'comfy.log');
    const fd = openSync(logFile, 'w');
    const child = spawn(config.comfyPython, comfyArgs, { cwd: config.comfyRoot, windowsHide: true, stdio: ['ignore', fd, fd] });
    closeSync(fd);
    const base = `http://127.0.0.1:${comfyBenchPort}`;
    const telemetry = new Telemetry(); telemetry.start();
    try {
        const began = Date.now();
        while (true) {
            try { const r = await fetch(`${base}/system_stats`, { signal: AbortSignal.timeout(2000) }); if (r.ok) break; } catch {}
            if (Date.now() - began > 240000) throw new Error('ComfyUI did not start.');
            await sleep(1000);
        }
        const stats = await (await fetch(`${base}/system_stats`)).json();
        const warmup = Number(option('warmup', 2)); const timed = Number(option('runs', 6));
        const runs = [];
        for (let i = 0; i < warmup + timed; i += 1) {
            const graph = buildGraph({ checkpoint, family, loras: [], positive: 'an empty old stone hall, fireplace, warm light, detailed architecture, no people', negative: 'text, watermark, low quality', size: family.sizes.wide, seed: seed + i, hires: false });
            telemetry.tag = `image:${i}`;
            const t0 = Date.now();
            const queued = await (await fetch(`${base}/prompt`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: graph }) })).json();
            if (!queued.prompt_id) throw new Error(`ComfyUI refused the graph: ${JSON.stringify(queued).slice(0, 400)}`);
            let entry = null;
            while (!entry) { await sleep(250); const history = await (await fetch(`${base}/history/${queued.prompt_id}`)).json(); entry = history[queued.prompt_id] ?? null; if (Date.now() - t0 > 600000) throw new Error('Render timed out.'); }
            const messages = entry.status?.messages ?? [];
            const start = messages.find(([name]) => name === 'execution_start')?.[1]?.timestamp;
            const end = messages.find(([name]) => name === 'execution_success')?.[1]?.timestamp;
            runs.push({ i, warmup: i < warmup, wallMs: Date.now() - t0, execMs: start && end ? end - start : null, ...telemetry.window(`image:${i}`) });
            console.log(`image ${i} wall=${runs.at(-1).wallMs} exec=${runs.at(-1).execMs}`);
        }
        const log = await fs.readFile(logFile, 'utf8');
        const timedRuns = runs.filter((run) => !run.warmup);
        if (timedRuns.some((run) => Number.isFinite(run.execMs) && run.execMs < 1000)) throw new Error('A timed render finished in under a second: ComfyUI served it from its cache, so the run measured nothing.');
        const summary = { at: new Date().toISOString(), gpu: gpuInfo(), comfyArgs, checkpoint: checkpoint.file, size: family.sizes.wide, steps: family.defaults?.steps ?? null, seed,
            attention: log.match(/Using [^\n]*attention[^\n]*/i)?.[0] ?? null, precision: log.match(/(model weight dtype|VAE dtype|Set vram state|dtype)[^\n]*/gi)?.slice(0, 6) ?? [], device: stats.devices?.[0]?.name ?? null,
            medianExecMs: median(timedRuns.map((run) => run.execMs)), medianWallMs: median(timedRuns.map((run) => run.wallMs)), runs };
        await fs.writeFile(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
        console.log(JSON.stringify({ medianExecMs: summary.medianExecMs, medianWallMs: summary.medianWallMs, attention: summary.attention }));
        console.log(`Wrote ${dir}`);
    } finally { telemetry.stop(); killTree(child.pid); await sleep(3000); }
}

const commands = { corpus: buildCorpus, layout: layoutCorpus, text: textBench, endpoint: endpointBench, image: imageBench, all: async () => { await textBench(); await imageBench(); } };
if (!commands[command]) {
    console.log('Usage: node scripts/local/bench-controller.mjs corpus --from <payloads.jsonl> | text [--arms a,b+c] | endpoint (--url <openai base> | --llama-arm <arm>) --label <name> [--full] | image | all  [--out dir] [--port 18890] [--comfy-port 18288]');
    console.log(`Arms: ${Object.keys(MODIFIERS).join(', ')} (combine with +). Default: ${DEFAULT_ARMS.join(',')}`);
    process.exit(command === 'help' ? 0 : 1);
}
await commands[command]();

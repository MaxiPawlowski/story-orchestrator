import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn as spawnDefault } from 'node:child_process';
import { createHash } from 'node:crypto';
import { freeIdleComfy, stopIdleComfy } from './comfyReclaim.mjs';
import { NativeBackend } from './backend.mjs';
import { ResidencyScheduler } from './scheduler.mjs';
import { memorySnapshot as memorySnapshotDefault, probeReserves } from './telemetry.mjs';
import { ImageCache } from './imageCache.mjs';
import { FastTelemetry } from './fastTelemetry.mjs';
import { runtimeMemoryProfile } from './runtimeIdentity.mjs';
import { withinReserve } from './policy.mjs';
import { comfyPort } from './controllerStatus.mjs';

export const BROKER_SOURCE_FILES = Object.freeze(['arbiter', 'backend', 'controllerStatus', 'estimate', 'fastTelemetry', 'footprints', 'gateway', 'gguf', 'imageResidency',
    'imageCache', 'memberCache', 'models', 'policy', 'promptReuse', 'ramEstimates', 'responseTiming', 'runtimeIdentity', 'safetensors', 'scheduler', 'telemetry']);

export async function brokerBuild(extra = []) {
    const source = createHash('sha256');
    for (const name of BROKER_SOURCE_FILES) source.update(name).update(await fs.readFile(new URL(`./${name}.mjs`, import.meta.url)));
    source.update(await fs.readFile(new URL('./memory-probe.py', import.meta.url)));
    for (const file of extra) source.update(await fs.readFile(file));
    return source.digest('hex');
}

const LEASE_KEYS = ['workflowKey', 'modelFiles', 'width', 'height', 'hires', 'needGpuMiB', 'needRamMiB', 'nextTextTokens'];

export function leaseRequest(body, { experiments = false } = {}) {
    const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    const out = {};
    for (const key of LEASE_KEYS) if (input[key] !== undefined) out[key] = input[key];
    if (experiments && input.benchmarkMode !== undefined) out.benchmarkMode = input.benchmarkMode;
    if (out.modelFiles !== undefined) {
        if (!Array.isArray(out.modelFiles) || out.modelFiles.length > 16) throw new Error('modelFiles must be a short list.');
        out.modelFiles = out.modelFiles.map((file) => {
            if (!file || typeof file.kind !== 'string' || typeof file.name !== 'string') throw new Error('Each model file needs a kind and a name.');
            return { kind: file.kind, name: file.name };
        });
    }
    for (const key of ['width', 'height', 'needGpuMiB', 'needRamMiB', 'nextTextTokens']) if (out[key] !== undefined && !Number.isFinite(out[key])) throw new Error(`${key} must be a number.`);
    if (out.hires !== undefined) out.hires = out.hires === true;
    return out;
}

export const CONTROL_ACTIONS = Object.freeze(['load', 'unload', 'automatic', 'restore', 'start-comfy', 'free-images', 'cache-mode']);

export function controlRequest(action, body, config) {
    if (!CONTROL_ACTIONS.includes(action)) throw new Error('Unknown control.');
    const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    const allowed = { load: ['profile'], unload: ['force'], 'free-images': ['clear'], 'cache-mode': ['profile'] }[action] ?? [];
    const extra = Object.keys(input).filter((key) => !allowed.includes(key) && !(config.experiments && action === 'load' && key === 'fitTarget'));
    if (extra.length) throw new Error(`The ${action} control takes no ${extra.join(', ')}; paths, binaries and arguments come only from the server config.`);
    if (action === 'load' && input.profile !== undefined && (typeof input.profile !== 'string' || !Object.hasOwn(config.profiles ?? {}, input.profile))) throw new Error('Pick a configured profile by id.');
    if (action === 'cache-mode' && !['warm', 'evict'].includes(input.profile)) throw new Error('Cache mode must be warm or evict.');
    if (action === 'free-images' && input.clear !== undefined && typeof input.clear !== 'boolean') throw new Error('clear must be true or false.');
    if (action === 'unload' && input.force !== undefined && typeof input.force !== 'boolean') throw new Error('force must be true or false.');
    return input;
}

export function brokerState({ scheduler, backend, crashed }) {
    if (crashed) return 'degraded';
    if (scheduler.phase === 'image') return 'image';
    if (scheduler.phase === 'reserving' || scheduler.waitingText > 0 || scheduler.phase === 'restoring' || backend.loading) return 'waiting';
    if (scheduler.phase === 'manual-hold') return 'held';
    return backend.pid ? 'text-loaded' : 'idle';
}

export function createArbiter(config, deps = {}) {
    const spawn = deps.spawn ?? spawnDefault;
    const fetchImpl = deps.fetch ?? fetch;
    const fsImpl = deps.fs ?? fs;
    const slowSnapshot = deps.memorySnapshot ?? memorySnapshotDefault;
    const owned = new Set();
    const killTree = deps.killTree ?? null;
    const stateDir = config.stateDir;
    const footprintsPath = path.join(stateDir, 'footprints.json');
    const timingsPath = path.join(stateDir, 'text-timings.json');
    const fast = deps.fastTelemetry !== undefined ? deps.fastTelemetry : config.telemetryPython ? new FastTelemetry(config.telemetryPython, { spawn }) : null;
    let telemetry = null;
    let telemetryAt = 0;
    let telemetryPending = null;
    let comfyChild = null;
    let reservesFrom = config.reserves ? 'config' : null;
    const snapshot = async ({ fresh = false } = {}) => {
        if (fresh && fast) return fast.snapshot();
        if (!fresh && Date.now() - telemetryAt < 2500 && telemetry) return telemetry;
        telemetryPending ??= Promise.resolve(slowSnapshot()).then((data) => { telemetry = data; telemetryAt = Date.now(); return data; }).finally(() => { telemetryPending = null; });
        return telemetryPending;
    };
    const ensureReserves = async () => {
        if (config.reserves) return config.reserves;
        const probed = probeReserves(await snapshot());
        if (!probed) throw new Error('GPU or host memory could not be read; reserves cannot be derived. Set reserves in config.json.');
        config.reserves = { gpuMiB: probed.gpuMiB, ramMiB: probed.ramMiB };
        reservesFrom = 'probe';
        return config.reserves;
    };
    const comfyUrl = config.comfyUrl;
    const jsonFetch = async (route, options = {}) => {
        const response = await fetchImpl(`${comfyUrl}${route}`, { ...options, signal: AbortSignal.timeout(config.comfyRequestTimeoutMs ?? 60000) });
        if (!response.ok) throw new Error(`ComfyUI ${route} answered ${response.status}`);
        const raw = await response.text();
        return raw ? JSON.parse(raw) : {};
    };
    const startComfy = async () => {
        try { await jsonFetch('/system_stats'); return; } catch {}
        if (!config.comfySupervise) throw new Error('ComfyUI is not reachable, and this broker only observes it.');
        if (!comfyChild) {
            await fsImpl.mkdir(stateDir, { recursive: true });
            const log = await fsImpl.open(path.join(stateDir, `comfy-${Date.now()}.log`), 'a');
            comfyChild = spawn(config.comfyPython, ['main.py', '--listen', '127.0.0.1', '--port', comfyPort(config), '--disable-auto-launch', ...(config.comfyExtraArgs ?? [])],
                { cwd: config.comfyRoot, windowsHide: true, stdio: ['ignore', log.fd, log.fd],
                    env: { ...process.env, ...(config.modelCacheRoot ? { HF_HOME: config.modelCacheRoot, HF_HUB_CACHE: path.join(config.modelCacheRoot, 'hub'),
                        HF_HUB_DISABLE_IMPLICIT_TOKEN: '1', TORCHINDUCTOR_CACHE_DIR: path.join(config.modelCacheRoot, 'torch'), CUDA_CACHE_PATH: path.join(config.modelCacheRoot, 'cuda') } : {}) } });
            const child = comfyChild;
            owned.add(child);
            fast?.setProcess(child.pid);
            child.once('error', () => { if (comfyChild === child) comfyChild = null; owned.delete(child); void log.close(); });
            child.once('exit', () => { if (comfyChild === child) { comfyChild = null; fast?.setProcess(null); } owned.delete(child); void log.close(); });
        }
        const deadline = Date.now() + (config.comfyStartTimeoutMs ?? 120000);
        while (Date.now() < deadline) {
            try { await jsonFetch('/system_stats'); return; } catch {}
            if (!comfyChild) throw new Error('Owned ComfyUI process exited before becoming ready.');
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        throw new Error('ComfyUI did not become ready.');
    };
    const ownedSpawn = (...args) => {
        const child = spawn(...args);
        owned.add(child);
        child.once?.('exit', () => owned.delete(child));
        child.once?.('error', () => owned.delete(child));
        return child;
    };
    let lastReclaim = null;
    const reclaimStats = { freed: 0, stopped: 0 };
    const reclaimComfy = async ({ shortMiB = 0 } = {}) => {
        const imageBusy = () => Boolean(scheduler?.lease || scheduler?.imagePending || scheduler?.imageQueued || scheduler?.burstOpen?.());
        let freeAttempt = null;
        if (config.reclaimFreeFirst !== false) {
            freeAttempt = await freeIdleComfy({ child: () => comfyChild, busy: imageBusy, queue: () => jsonFetch('/queue'),
                free: () => jsonFetch('/free', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ unload_models: true, free_memory: true }) }),
                emptyHostCache: () => releaseHostCache(), measure: () => snapshot({ fresh: true }), reserveMiB: config.reserves?.gpuMiB ?? 0, waitMs: config.reclaimFreeWaitMs ?? 5000,
                log: deps.log ?? ((line) => console.log(`[story-orchestrator-gpu] ${line}`)) }, { shortMiB });
            telemetryAt = 0;
            if (freeAttempt.freed) { reclaimStats.freed += 1; lastReclaim = { at: new Date().toISOString(), shortMiB: Math.round(shortMiB), stopped: false, ...freeAttempt }; return true; }
        }
        const recentImage = scheduler?.lastLeaseAt && Date.now() - scheduler.lastLeaseAt < (config.reclaimImageGraceMs ?? 180000);
        if (recentImage) { lastReclaim = { at: new Date().toISOString(), shortMiB: Math.round(shortMiB), stopped: false, reason: 'recent-image', freeAttempt }; return false; }
        const result = await stopIdleComfy({ child: () => comfyChild, busy: imageBusy, queue: () => jsonFetch('/queue'), settleMs: config.reclaimSettleMs ?? 1500,
            kill: async (child) => { if (killTree && child.pid) await killTree(child.pid); else child.kill(); }, timeoutMs: config.comfyStopTimeoutMs ?? 15000,
            log: deps.log ?? ((line) => console.log(`[story-orchestrator-gpu] ${line}`)) }, { shortMiB });
        telemetryAt = 0;
        lastReclaim = { at: new Date().toISOString(), shortMiB: Math.round(shortMiB), ...result, freeAttempt };
        if (result.stopped) reclaimStats.stopped += 1;
        return result.stopped;
    };
    const backend = deps.backend ?? new NativeBackend(config, { snapshot: () => snapshot({ fresh: true }), spawn: ownedSpawn, killTree, fetch: fetchImpl, reclaimGpu: reclaimComfy });
    const releaseHostCache = async () => {
        const response = await fetchImpl(`${comfyUrl}/so-local/host-cache`, { method: 'POST', headers: { 'X-SO-Local': '1' }, signal: AbortSignal.timeout(15000) });
        if (response.status === 404 || response.status === 501) return false;
        if (!response.ok) throw new Error(`ComfyUI host-cache release refused ${response.status}`);
        const evidence = await response.json();
        imageCache.lastHostTrim = { at: new Date().toISOString(), ...evidence };
        return evidence.trimmed === true;
    };
    const imageCache = deps.imageCache ?? new ImageCache({ config, jsonFetch, snapshot, emptyHostCache: releaseHostCache });
    const freeImages = async (options = {}) => {
        await startComfy();
        const result = await imageCache.free({ ...options, clear: options.clear ?? config.imageCacheMode === 'evict' });
        telemetryAt = 0;
        return result;
    };
    const readJson = async (file) => {
        try { return JSON.parse(await fsImpl.readFile(file, 'utf8')); }
        catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    };
    let scheduler = null;
    const runtime = deps.runtime ?? (async () => {
        const stats = await jsonFetch('/system_stats');
        return runtimeMemoryProfile(stats.system, config.comfyIdentity ?? 'observed', { cacheMode: config.imageCacheMode ?? 'warm', warmReleaseMs: config.imageWarmReleaseMs ?? 5000 });
    });
    let timer = null;
    let unsubscribe = null;

    const arbiter = {
        backend,
        imageCache,
        get scheduler() { return scheduler; },
        reservesFrom: () => reservesFrom,
        async start() {
            await fsImpl.mkdir(stateDir, { recursive: true });
            const footprints = (await readJson(footprintsPath)) ?? {};
            const stored = await readJson(timingsPath);
            const identity = JSON.stringify({ model: config.model, mode: config.modelLoadMode ?? 'profile', profiles: config.profiles });
            const timings = stored?.identity === identity ? stored.timings : {};
            try { await ensureReserves(); } catch {}
            scheduler = deps.scheduler ?? new ResidencyScheduler({ config, backend, snapshot, startComfy,
                queue: () => jsonFetch('/queue'), freeImages,
                saveFootprints: (data) => fsImpl.writeFile(footprintsPath, JSON.stringify(data, null, 2)), footprints,
                timings, saveTimings: (data) => fsImpl.writeFile(timingsPath, JSON.stringify({ identity, timings: data }, null, 2)), runtime,
                log: deps.log ?? ((line) => console.log(`[story-orchestrator-gpu] ${line}`)), comfyPid: () => comfyChild?.pid ?? null });
            if (fast) unsubscribe = fast.subscribe((sample) => scheduler.observe(sample));
            if (deps.timers !== false) {
                timer = setInterval(() => {
                    void scheduler.sampleLease();
                    fast?.setGpuProcesses?.([backend.status().pid ?? backend.status().sleeping?.pid, comfyChild?.pid].filter(Boolean));
                    void scheduler.restoreIfIdle();
                    if (!backend.crashed) void scheduler.keepResident();
                }, 2500);
                timer.unref?.();
            }
            return arbiter;
        },
        crashed() { return backend.crashed ?? null; },
        holdsVram() { const state = backend.status(); return Boolean(state.pid || state.loading || comfyChild); },
        async reserve(body = {}) {
            const request = leaseRequest(body, { experiments: config.experiments === true });
            if (backend.crashed && !arbiter.holdsVram()) return { lease: null, brokered: false, warning: 'The local text server stopped; nothing of the broker holds GPU memory, so the image passes through.' };
            const state = backend.status();
            const resident = Boolean(state.pid || state.loading);
            if (!resident && scheduler.pending.length === 0) {
                try { await startComfy(); } catch (error) { return { lease: null, brokered: false, warning: error.message }; }
                try { await ensureReserves(); await snapshot({ fresh: true }); }
                catch (error) { return { lease: null, brokered: false, warning: `No text model is loaded and memory could not be read (${error.message}); the image passes through.` }; }
            } else await ensureReserves();
            return scheduler.reserve(request);
        },
        renew(lease) { return scheduler.renew(lease); },
        release(lease) { return scheduler.release(lease); },
        burst(body = {}) {
            if (body.close !== undefined) return { closed: scheduler.closeBurst(typeof body.close === 'string' ? body.close : null) };
            return scheduler.openBurst({ count: body.count, ttlMs: body.ttlMs, kind: body.kind });
        },
        text(run, signal, budget, lane) {
            if (backend.crashed) return Promise.reject(new Error(`The local text server exited (code ${backend.crashed.code ?? 'unknown'}). An admin can restart it with Load text.`));
            return scheduler.text(run, signal, budget, lane);
        },
        async control(action, body = {}) {
            const input = controlRequest(action, body, config);
            if (action === 'load') {
                backend.crashed = null;
                await scheduler.load(input.profile ?? config.defaultProfile, { fitTarget: input.fitTarget });
            } else if (action === 'unload') return { ...(await arbiter.status()), unload: await scheduler.unload({ force: input.force === true }) };
            else if (action === 'automatic') { backend.crashed = null; scheduler.resume(); }
            else if (action === 'restore') await scheduler.restoreNow();
            else if (action === 'start-comfy') await scheduler.exclusive(startComfy);
            else if (action === 'free-images') await scheduler.exclusive(() => scheduler.freeImages({ clear: input.clear }));
            else if (action === 'cache-mode') await scheduler.exclusive(async () => { config.imageCacheMode = input.profile; });
            return arbiter.status();
        },
        async status({ fresh = false } = {}) {
            let reading = null;
            let telemetryError = null;
            try { reading = await snapshot({ fresh }); } catch (error) { telemetryError = error.message; }
            const sched = scheduler.status();
            const state = brokerState({ scheduler: sched, backend: sched.text, crashed: arbiter.crashed() });
            const idle = sched.activeText === 0 && sched.waitingText === 0;
            const mayRetain = config.retainBatches === true && idle && Boolean(reading && config.reserves) && withinReserve(reading, config.reserves);
            return { ...sched, adapter: 'supervise', guarding: true, state, mayRetain, reserves: config.reserves ?? null, reservesFrom,
                telemetry: reading, telemetryError, imageCache: imageCache.last, imageCacheFailure: imageCache.lastFailure, imageCacheHostTrim: imageCache.lastHostTrim ?? null,
                imageCacheMode: config.imageCacheMode ?? 'warm', maxContext: config.maxContext, profiles: Object.keys(config.profiles ?? {}),
                comfy: { supervised: config.comfySupervise === true, ownedPid: comfyChild?.pid ?? null, lastReclaim, reclaims: { ...reclaimStats } } };
        },
        ownedChildren() { return [...owned]; },
        async stop() {
            if (timer) clearInterval(timer);
            timer = null;
            unsubscribe?.();
            if (scheduler) scheduler.manualHold = true;
            await backend.unload().catch(() => {});
            const children = [...owned];
            for (const child of children) {
                if (child.exitCode !== null && child.exitCode !== undefined) continue;
                if (killTree && child.pid) await killTree(child.pid); else child.kill?.();
            }
            owned.clear();
            fast?.stop();
        },
    };
    return arbiter;
}

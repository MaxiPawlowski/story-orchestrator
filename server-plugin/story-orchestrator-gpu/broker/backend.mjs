import { spawn as spawnDefault } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { memorySnapshot } from './telemetry.mjs';
import { withinReserve } from './policy.mjs';
import { CONTROLLER_DEFAULTS } from './controllerStatus.mjs';
import { fitCacheMiB, memberCacheOptions } from './memberCache.mjs';

export const SPECULATIVE_DEFAULTS = Object.freeze({ type: 'draft-mtp', nMax: 2, estimatedGpuMiB: 900, extraTypes: [], chatNMax: null, sideNMax: null });
export const LOCAL_DRAFT_TYPES = Object.freeze(['ngram-simple']);

export function speculative(config) {
    const spec = config.speculative;
    if (!spec || spec.enabled === false) return null;
    if (typeof spec.model !== 'string' || !spec.model) throw new Error('speculative.model must name the draft model file.');
    const merged = { ...SPECULATIVE_DEFAULTS, ...spec };
    if (!Number.isInteger(merged.nMax) || merged.nMax < 1 || merged.nMax > 8) throw new Error('speculative.nMax must be a whole number from 1 to 8.');
    if (!Array.isArray(merged.extraTypes) || merged.extraTypes.some((type) => !LOCAL_DRAFT_TYPES.includes(type))) throw new Error(`speculative.extraTypes may only list request-local drafters: ${LOCAL_DRAFT_TYPES.join(', ')}.`);
    for (const key of ['chatNMax', 'sideNMax']) if (merged[key] !== null && !(Number.isInteger(merged[key]) && merged[key] >= 1 && merged[key] <= merged.nMax)) throw new Error(`speculative.${key} must be null or a whole number from 1 to speculative.nMax.`);
    return merged;
}

export function speculativeArgs(config) {
    const spec = speculative(config);
    return spec ? ['--model-draft', spec.model, '--spec-type', [spec.type, ...spec.extraTypes].join(','), '--spec-draft-n-max', String(spec.nMax)] : [];
}

export function draftCap(config, chat) {
    const spec = speculative(config);
    if (!spec) return null;
    return chat ? spec.chatNMax : spec.sideNMax;
}

export const speculativeTag = (config) => { const spec = speculative(config); return spec ? `${[spec.type, ...spec.extraTypes].join('+')}${spec.nMax}` : null; };

export const SLOT_DEFAULTS = Object.freeze({ count: 1, chat: 0, side: 1, estimatedGpuMiB: 400 });

export function slots(config) {
    const raw = config.slots;
    if (!raw || raw.enabled === false) return null;
    const merged = { ...SLOT_DEFAULTS, ...raw };
    if (!Number.isInteger(merged.count) || merged.count < 1 || merged.count > 4) throw new Error('slots.count must be a whole number from 1 to 4.');
    if (merged.count === 1) return null;
    for (const key of ['chat', 'side']) if (!Number.isInteger(merged[key]) || merged[key] < 0 || merged[key] >= merged.count) throw new Error(`slots.${key} must name a slot from 0 to ${merged.count - 1}.`);
    return merged;
}

export const slotFor = (config, body) => { const pin = slots(config); return pin ? (body?.stream === true ? pin.chat : pin.side) : null; };

export const profileGpuMiB = (config, profile) => (profile.estimatedGpuMiB ?? 21500) + (speculative(config)?.estimatedGpuMiB ?? 0)
    + ((slots(config)?.count ?? 1) - 1) * (slots(config)?.estimatedGpuMiB ?? 0);

export function nativeArgs(config, profile, fitTargetMiB = config.reserves.gpuMiB) {
    const args = [...profile.args];
    if (config.modelLoadMode) {
        const at = args.indexOf('--load-mode');
        if (at >= 0) args.splice(at, 2);
        args.push('--load-mode', config.modelLoadMode);
    }
    const members = memberCacheOptions(config);
    const checkpoints = Number.isInteger(config.ctxCheckpoints) ? ['--ctx-checkpoints', String(config.ctxCheckpoints)] : members ? ['--ctx-checkpoints', String(members.ctxCheckpoints)] : [];
    const slotActions = members ? ['--slot-save-path', members.dir] : slots(config) ? ['--slot-save-path', path.join(config.stateDir ?? '.', 'slots')] : [];
    return ['--model', config.model, '--host', '127.0.0.1', '--port', String(config.backendPort), '--alias', config.modelAlias,
        '--offline', '--no-mmproj', '--no-webui', '--threads', '8', '--threads-batch', '8', '--parallel', String(slots(config)?.count ?? 1), '--kv-unified',
        '--flash-attn', 'on', '--cache-type-k', 'q8_0', '--cache-type-v', 'q8_0', '--cache-ram', String(members?.store === 'ram' ? members.budgetMiB : config.cacheRamMiB ?? 512), ...checkpoints, ...slotActions,
        ...(slots(config)?.cacheIdle === false ? ['--no-cache-idle-slots'] : []), '--sleep-idle-seconds', keepsCacheAcrossImages(config) ? '31536000' : '-1', ...speculativeArgs(config),
        '--fit', 'on', '--fit-target', String(fitTargetMiB + (config.fitMarginMiB ?? 0) + (speculative(config)?.estimatedGpuMiB ?? 0)), ...args];
}

export function profileContext(profile) {
    const at = profile.args?.indexOf('--ctx-size') ?? -1;
    const value = at >= 0 ? Number(profile.args[at + 1]) : NaN;
    return Number.isInteger(value) && value > 0 ? value : null;
}

export class ContextRefusal extends Error {
    constructor(promptTokens, outputTokens, context) {
        super(`The request needs ${promptTokens + outputTokens} tokens (prompt ${promptTokens} + reply ${outputTokens}), and prompt + reply must stay under the ${context}-token context this machine serves. Set the connection's context to ${context} or less; nothing was loaded or truncated.`);
        Object.assign(this, { promptTokens, outputTokens, context });
    }
}

export class MemoryReserveError extends Error {
    constructor(snapshot, reserves, windowMs) {
        super(`The loaded profile violates the measured memory reserve after ${Math.round(windowMs / 1000)}s (RAM ${Math.round(snapshot.host.availableMiB)} MiB free, GPU ${Math.round(snapshot.gpus[0].freeMiB)} MiB free).`);
        this.gpuShortMiB = Math.max(0, reserves.gpuMiB - snapshot.gpus[0].freeMiB);
        this.hostFits = snapshot.host.availableMiB >= reserves.ramMiB && snapshot.host.commitFreeMiB >= reserves.ramMiB;
    }
}

export const keepsCacheAcrossImages = (config) => memberCacheOptions(config)?.keepAcrossImages === true;
export const sleepsLight = (config) => keepsCacheAcrossImages(config) && memberCacheOptions(config)?.lightSleep === true;

export class NativeBackend {
    constructor(config, { snapshot = memorySnapshot, spawn = spawnDefault, killTree = null, fetch: fetchImpl = fetch, reclaimGpu = null } = {}) {
        this.config = config;
        this.reclaimGpu = reclaimGpu;
        this.reclaims = 0;
        this.snapshot = snapshot;
        this.spawn = spawn;
        this.fetch = fetchImpl;
        this.killTree = killTree;
        this.crashed = null;
        this.stopping = null;
        this.url = `http://127.0.0.1:${config.backendPort}`;
        this.child = null;
        this.profile = null;
        this.fitTarget = null;
        this.desiredProfile = null;
        this.loading = null;
        this.lastError = null;
        this.loadMs = null;
        this.loads = 0;
        this.failedAt = new Map();
        this.fitCorrections = new Map();
        this.lastFitCorrection = null;
        this.slotTokens = new Map();
        this.slotStats = { requests: { chat: 0, side: 0 }, erased: 0, waited: 0, chatErasedBySide: 0 };
        this.slotBusy = new Set();
        this.onSlotErased = null;
        this.sleeping = null;
        this.entering = false;
        this.direct = 0;
        this.sleepStats = { sleeps: 0, wakes: 0, wakeFailures: 0, dropped: 0, strayWakes: 0, wakeReclaims: 0, lastWakeMs: null, lastSleepMs: null, lastStrayWake: null,
            lightSleeps: 0, lightWakes: 0, lastLightWakeMs: null, lastLightFreedMiB: null };
        this.textRamMiB = new Map();
        this.cacheBudget = null;
    }

    cacheRamFor(name, profile, snapshot, spillMiB) {
        const members = memberCacheOptions(this.config);
        if (members?.store !== 'ram') return 0;
        const capMiB = members.budgetMiB;
        if (members.fitRam !== true) { this.cacheBudget = { capMiB, effectiveMiB: capMiB, fit: false }; return capMiB; }
        const learned = this.textRamMiB.get(name);
        const textRamMiB = Number.isFinite(learned) ? learned : (profile.estimatedRamMiB ?? 6000) + spillMiB;
        const floorMiB = this.config.keepCacheRamFloorMiB ?? 10240;
        const availableMiB = snapshot.host.availableMiB;
        const effectiveMiB = fitCacheMiB({ capMiB, availableMiB: availableMiB - textRamMiB, floorMiB });
        this.cacheBudget = { capMiB, effectiveMiB, fit: true, availableMiB: Math.round(availableMiB), textRamMiB: Math.round(textRamMiB), textRamSource: Number.isFinite(learned) ? 'learned' : 'estimate', floorMiB, at: new Date().toISOString() };
        return effectiveMiB;
    }

    async load(name = this.config.defaultProfile, options = {}) {
        const fitTarget = Number.isFinite(options.fitTarget) ? Math.ceil(options.fitTarget) : null;
        while (this.loading) await this.loading;
        if (this.child && this.profile === name && this.fitTarget === fitTarget) return;
        const profile = this.config.profiles[name];
        if (!profile || profile.disabled) throw new Error('That residency profile is unavailable.');
        if (this.sleeping && this.child) await this.checkSleeping().catch((error) => { this.lastError = error.message; });
        if (this.sleeping && this.child) {
            if (this.sleeping.profile === name && fitTarget === null && this.sleeping.correction === (this.fitCorrections.get(name) ?? 0)) {
                this.loading = this.wake(name, profile);
                try { await this.loading; return; }
                catch (error) { this.lastError = error.message; this.sleepStats.wakeFailures += 1; await this.stopOwned(); }
                finally { this.loading = null; }
            } else await this.stopOwned();
        }
        this.loading = this.startWithFit(name, profile, fitTarget);
        try { await this.loading; }
        catch (error) { this.lastError = error.message; await this.stopOwned(); throw error; }
        finally { this.loading = null; }
    }

    clearFitCorrection(name = this.profile) { const had = this.fitCorrections.get(name) ?? 0; this.fitCorrections.delete(name); return had; }

    async ensure(name = this.profile ?? this.config.defaultProfile) {
        while (this.loading) await this.loading;
        return this.load(name, { fitTarget: this.fitTarget });
    }

    async startWithFit(name, profile, fitTarget) {
        try { await this.start(name, profile, fitTarget); }
        catch (error) {
            const layerAt = profile.args.indexOf('--n-gpu-layers');
            if (!(error instanceof MemoryReserveError) || !error.hostFits || !(error.gpuShortMiB > 0)
                || layerAt < 0 || profile.args[layerAt + 1] !== 'auto') throw error;
            const correction = (this.fitCorrections.get(name) ?? 0) + Math.ceil(error.gpuShortMiB) + Math.max(256, this.config.fitMarginMiB ?? 0, this.config.fitRetryStepMiB ?? 1280);
            this.fitCorrections.set(name, correction);
            this.lastFitCorrection = { profile: name, extraMiB: correction, gpuShortMiB: error.gpuShortMiB, at: new Date().toISOString() };
            await this.start(name, profile, fitTarget);
        }
    }

    async start(name, profile, fitTarget) {
        const began = Date.now();
        await this.stopOwned();
        let occupied = false;
        try { await this.fetch(`${this.url}/health`, { signal: AbortSignal.timeout(1000) }); occupied = true; } catch {}
        if (occupied) throw new Error('The backend port is owned by another server; it will not be stopped.');
        const snapshot = await this.snapshot();
        const gpu = snapshot.gpus[0];
        const gpuBudget = gpu.freeMiB - Math.max(this.config.reserves.gpuMiB, fitTarget ?? 0);
        const spillMiB = Math.max(0, profileGpuMiB(this.config, profile) - gpuBudget);
        const ramCache = this.cacheRamFor(name, profile, snapshot, spillMiB);
        const ramRequired = (profile.estimatedRamMiB ?? 6000) + spillMiB + ramCache;
        if (gpuBudget < 2048 || snapshot.host.availableMiB < ramRequired + this.config.reserves.ramMiB || snapshot.host.commitFreeMiB < ramRequired + this.config.reserves.ramMiB) {
            throw new Error('Not enough free GPU/physical RAM for this profile while preserving desktop headroom.');
        }
        await fs.mkdir(slots(this.config) ? path.join(this.config.stateDir, 'slots') : this.config.stateDir, { recursive: true });
        if (memberCacheOptions(this.config)) await fs.mkdir(memberCacheOptions(this.config).dir, { recursive: true });
        const log = await fs.open(path.join(this.config.stateDir, `native-${Date.now()}-${name}.log`), 'a');
        this.crashed = null;
        const fitConfig = { ...this.config, fitMarginMiB: (this.config.fitMarginMiB ?? 0) + (this.fitCorrections.get(name) ?? 0),
            ...(ramCache > 0 ? { memberCache: { ...this.config.memberCache, budgetMiB: ramCache } } : {}) };
        const child = this.spawn(this.config.binary, nativeArgs(fitConfig, profile, fitTarget ?? this.config.reserves.gpuMiB), { windowsHide: true, stdio: ['ignore', log.fd, log.fd] });
        this.child = child;
        let spawnError;
        child.on('error', (error) => { spawnError = error; });
        child.on('exit', (code) => {
            void log.close();
            if (this.child !== child) return;
            this.child = null; this.profile = null; this.sleeping = null;
            if (this.stopping !== child && this.loading === null) this.crashed = { code: code ?? null, at: new Date().toISOString() };
        });
        const deadline = Date.now() + 240000;
        const admissionWindowMs = this.config.admissionWindowMs ?? 30000;
        let admissionUntil = null;
        let reclaimed = false;
        while (Date.now() < deadline) {
            if (spawnError) throw spawnError;
            if (child.exitCode !== null) throw new Error(`Native backend exited with ${child.exitCode}; read its local log.`);
            try {
                if ((await this.fetch(`${this.url}/health`, { signal: AbortSignal.timeout(1000) })).ok) {
                    const after = await this.snapshot();
                    if (withinReserve(after, this.config.reserves)) {
                        if (Number.isFinite(snapshot.host?.availableMiB) && Number.isFinite(after.host?.availableMiB)) this.textRamMiB.set(name, Math.max(512, Math.round(snapshot.host.availableMiB - after.host.availableMiB)));
                        this.profile = name;
                        this.fitTarget = fitTarget;
                        this.slotTokens.clear();
                        this.slotBusy.clear();
                        if (fitTarget === null || this.desiredProfile === null) this.desiredProfile = name;
                        this.lastError = null;
                        this.loadMs = Date.now() - began;
                        this.loads += 1;
                        return;
                    }
                    if (!reclaimed && this.reclaimGpu && after.gpus?.[0]?.freeMiB < this.config.reserves.gpuMiB) {
                        reclaimed = true;
                        let freed = false;
                        try { freed = await this.reclaimGpu({ shortMiB: this.config.reserves.gpuMiB - after.gpus[0].freeMiB }); } catch (error) { this.lastError = error.message; }
                        if (freed) { this.reclaims += 1; admissionUntil = null; continue; }
                    }
                    admissionUntil ??= Date.now() + admissionWindowMs;
                    if (Date.now() >= admissionUntil) throw new MemoryReserveError(after, this.config.reserves, admissionWindowMs);
                }
            } catch (error) { if (error.message.includes('memory reserve')) throw error; }
            await new Promise((resolve) => setTimeout(resolve, this.config.admissionPollMs ?? 1000));
        }
        throw new Error('Native backend load timed out.');
    }

    async unload({ keepCache = false, light = false } = {}) {
        while (this.loading) await this.loading.catch(() => {});
        if (keepCache && keepsCacheAcrossImages(this.config) && this.child && !this.sleeping && this.profile && this.fitTarget === null) {
            try { await this.sleep({ light: light && sleepsLight(this.config) }); return; }
            catch (error) { this.lastError = `text could not sleep, stopped instead: ${error.message}`; }
        }
        await this.stopOwned();
    }

    tryDirect() {
        if (!this.child || this.sleeping || this.entering || this.loading || !this.profile) return false;
        this.direct += 1;
        return true;
    }

    endDirect() { this.direct = Math.max(0, this.direct - 1); }

    async sleep({ light = false } = {}) {
        const began = Date.now();
        const deadline = Date.now() + (this.config.textSleepTimeoutMs ?? 60000);
        this.entering = true;
        try {
            while (this.direct > 0) {
                if (Date.now() > deadline) throw new Error('requests sent straight to the text server did not finish before it could sleep.');
                await new Promise((resolve) => setTimeout(resolve, 25));
            }
            const heldBefore = light ? this.heldMiB(await this.snapshot()) : null;
            const request = light ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ level: 'context' }), signal: AbortSignal.timeout(10000) }
                : { method: 'POST', signal: AbortSignal.timeout(10000) };
            const reply = await this.fetch(`${this.url}/sleep`, request);
            if (!reply.ok) throw new Error(`/sleep answered ${reply.status}`);
            while (true) {
                const props = await (await this.fetch(`${this.url}/props`, { signal: AbortSignal.timeout(5000) })).json().catch(() => ({}));
                if (props.is_sleeping === true) break;
                if (Date.now() > deadline) throw new Error('llama-server did not reach its sleeping state in time.');
                await new Promise((resolve) => setTimeout(resolve, 250));
            }
            this.sleeping = { profile: this.profile, correction: this.fitCorrections.get(this.profile) ?? 0, at: Date.now() };
            if (light) {
                const heldAfter = this.heldMiB(await this.snapshot());
                const freedMiB = Number.isFinite(heldBefore) && Number.isFinite(heldAfter) ? Math.max(0, heldBefore - heldAfter) : null;
                Object.assign(this.sleeping, { light: true, heldMiB: heldAfter, freedMiB });
                this.sleepStats.lightSleeps += 1;
                this.sleepStats.lastLightFreedMiB = freedMiB === null ? null : Math.round(freedMiB);
            }
            this.profile = null;
            this.slotTokens.clear();
            this.slotBusy.clear();
            this.sleepStats.sleeps += 1;
            this.sleepStats.lastSleepMs = Date.now() - began;
        } finally { this.entering = false; }
    }

    heldMiB(snapshot) {
        const pid = this.child?.pid;
        const row = pid ? snapshot?.gpuProcesses?.[pid] : null;
        return Number.isFinite(row?.dedicatedMiB) ? row.dedicatedMiB : null;
    }

    async checkSleeping(reading = null) {
        if (!this.sleeping || !this.child || this.loading) return null;
        const snapshot = reading ?? await this.snapshot();
        const held = this.heldMiB(snapshot);
        const base = this.sleeping.light && Number.isFinite(this.sleeping.heldMiB) ? this.sleeping.heldMiB : 0;
        if (!(held > base + (this.config.strayWakeMiB ?? 2048))) return null;
        if (!(snapshot.at >= this.sleeping.at + (this.config.strayWakeSettleMs ?? 5000)) || !(snapshot.gpus?.[0]?.usedMiB >= held)) return null;
        const stray = { at: new Date().toISOString(), pid: this.child.pid, heldMiB: Math.round(held) };
        this.sleepStats.strayWakes += 1;
        this.sleepStats.lastStrayWake = stray;
        await this.dropSleeping();
        this.lastError = `The sleeping text server (pid ${stray.pid}) was woken outside the controller and held ${stray.heldMiB} MiB of GPU memory; it was stopped (member cache dropped) and text loads again on the next request.`;
        return stray;
    }

    async wake(name, profile) {
        if (this.sleeping?.light) return this.wakeLight(name);
        const began = Date.now();
        let snapshot = await this.snapshot();
        const fullMiB = profileGpuMiB(this.config, profile) + this.config.reserves.gpuMiB;
        if (snapshot.gpus[0].freeMiB < fullMiB && this.reclaimGpu) {
            let freed = false;
            try { freed = await this.reclaimGpu({ shortMiB: fullMiB - snapshot.gpus[0].freeMiB }); } catch (error) { this.lastError = error.message; }
            if (freed) { this.sleepStats.wakeReclaims += 1; snapshot = await this.snapshot(); }
        }
        const gpuBudget = snapshot.gpus[0].freeMiB - this.config.reserves.gpuMiB;
        const ramRequired = (profile.estimatedRamMiB ?? 6000) + Math.max(0, profileGpuMiB(this.config, profile) - gpuBudget);
        if (gpuBudget < 2048 || snapshot.host.availableMiB < ramRequired + this.config.reserves.ramMiB) {
            throw new Error('Not enough free GPU/physical RAM to wake the sleeping text server while preserving desktop headroom.');
        }
        const reply = await this.fetch(`${this.url}/completion`, { method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ prompt: '\n', n_predict: 0, cache_prompt: false, stream: false }), signal: AbortSignal.timeout(240000) });
        if (!reply.ok) throw new Error(`waking request answered ${reply.status}`);
        const after = await this.snapshot();
        if (!withinReserve(after, this.config.reserves)) throw new MemoryReserveError(after, this.config.reserves, 0);
        this.sleeping = null;
        this.profile = name;
        this.fitTarget = null;
        this.desiredProfile = name;
        this.lastError = null;
        this.loadMs = Date.now() - began;
        this.loads += 1;
        this.sleepStats.wakes += 1;
        this.sleepStats.lastWakeMs = this.loadMs;
    }

    async wakeLight(name) {
        const began = Date.now();
        const contextMiB = this.sleeping.freedMiB ?? memberCacheOptions(this.config)?.lightSleepFreesMiB ?? 2900;
        let snapshot = await this.snapshot();
        const needMiB = contextMiB + this.config.reserves.gpuMiB;
        if (snapshot.gpus[0].freeMiB < needMiB && this.reclaimGpu) {
            let freed = false;
            try { freed = await this.reclaimGpu({ shortMiB: needMiB - snapshot.gpus[0].freeMiB }); } catch (error) { this.lastError = error.message; }
            if (freed) { this.sleepStats.wakeReclaims += 1; snapshot = await this.snapshot(); }
        }
        if (snapshot.gpus[0].freeMiB < needMiB) throw new Error(`Not enough free GPU memory to recreate the text contexts after a light sleep (${Math.round(snapshot.gpus[0].freeMiB)} MiB free, ${Math.round(needMiB)} MiB needed).`);
        const reply = await this.fetch(`${this.url}/completion`, { method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ prompt: '\n', n_predict: 0, cache_prompt: false, stream: false }), signal: AbortSignal.timeout(240000) });
        if (!reply.ok) throw new Error(`waking request answered ${reply.status}`);
        const after = await this.snapshot();
        if (!withinReserve(after, this.config.reserves)) throw new MemoryReserveError(after, this.config.reserves, 0);
        this.sleeping = null;
        this.profile = name;
        this.fitTarget = null;
        this.desiredProfile = name;
        this.lastError = null;
        this.loadMs = Date.now() - began;
        this.loads += 1;
        this.sleepStats.wakes += 1;
        this.sleepStats.lightWakes += 1;
        this.sleepStats.lastWakeMs = this.loadMs;
        this.sleepStats.lastLightWakeMs = this.loadMs;
    }

    async dropSleeping() {
        if (!this.sleeping) return 0;
        await this.stopOwned();
        this.sleepStats.dropped += 1;
        return memberCacheOptions(this.config)?.budgetMiB ?? 0;
    }

    async stopOwned() {
        this.fitTarget = null;
        this.sleeping = null;
        const child = this.child;
        if (!child) return;
        const ended = new Promise((resolve) => child.once('exit', resolve));
        this.stopping = child;
        if (this.killTree && child.pid) await this.killTree(child.pid);
        else child.kill();
        await Promise.race([ended, new Promise((_, reject) => setTimeout(() => reject(new Error('The owned text process did not stop; no replacement will be started.')), 10000).unref())]);
        if (this.child === child) { this.child = null; this.profile = null; this.fitTarget = null; }
        this.stopping = null;
    }

    async forRequest(body, signal, slot = null) {
        await this.ensure(this.profile ?? this.config.defaultProfile);
        const limit = this.config.maxContext ?? CONTROLLER_DEFAULTS.maxContext;
        const output = Number(body.n_predict ?? body.max_tokens ?? 1400);
        if (!Number.isInteger(output) || output < 0 || output > limit) throw new Error('Set a bounded output budget before generating.');
        const prompt = await this.promptTokens(body, signal);
        const required = prompt + output;
        const name = this.profileFor(required + 1, limit);
        if (!name) throw new ContextRefusal(prompt, output, this.servedContext(limit));
        if (name !== this.profile) await this.switchFor(name, `${required} tokens`);
        if (slot !== null) await this.holdSlot(slot, required, profileContext(this.config.profiles[this.profile]) ?? limit, signal);
    }

    async holdSlot(slot, required, context, signal) {
        const pin = slots(this.config);
        if (pin) this.slotStats.requests[slot === pin.chat ? 'chat' : 'side'] += 1;
        let others = 0;
        for (const [id, tokens] of this.slotTokens) if (id !== slot) others += tokens;
        if (required + others + 1 > context) {
            const victims = [...this.slotTokens.keys()].filter((id) => id !== slot);
            if (victims.some((id) => this.slotBusy.has(id))) { this.slotStats.waited += 1; await this.slotsIdle(victims, signal); }
            for (const id of victims) {
                const reply = await this.fetch(`${this.url}/slots/${id}?action=erase`, { method: 'POST', signal });
                if (!reply.ok) throw new Error(`Could not free slot ${id} for a ${required}-token request (${reply.status}); the shared context would overflow.`);
                this.slotTokens.delete(id);
                this.slotStats.erased += 1;
                if (pin && id === pin.chat && slot !== pin.chat) this.slotStats.chatErasedBySide += 1;
                this.onSlotErased?.(id);
            }
        }
        this.slotTokens.set(slot, required);
        this.slotBusy.add(slot);
    }

    releaseSlot(slot) { this.slotBusy.delete(slot); }

    async slotsIdle(ids, signal) {
        const deadline = Date.now() + (this.config.queueTimeoutMs ?? 600000);
        while (ids.some((id) => this.slotBusy.has(id))) {
            if (signal?.aborted) throw new Error('Request cancelled.');
            if (Date.now() > deadline) throw new Error('The other slot did not finish before the shared context could be freed.');
            await new Promise((resolve) => setTimeout(resolve, 25));
        }
    }

    async promptTokens(body, signal) {
        let prompt = body.prompt;
        if (typeof prompt !== 'string') {
            if (!Array.isArray(body.messages)) throw new Error('Could not count the prompt; refusing to guess a smaller context.');
            const rendered = await this.fetch(`${this.url}/apply-template`, {
                method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: body.messages }), signal,
            });
            if (!rendered.ok) throw new Error('Could not render the chat for counting; refusing to guess a smaller context.');
            prompt = (await rendered.json()).prompt;
            if (typeof prompt !== 'string') throw new Error('The chat template did not return a prompt.');
        }
        const response = await this.fetch(`${this.url}/tokenize`, {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: prompt, add_special: true }), signal,
        });
        if (!response.ok) throw new Error('Could not count the prompt; refusing to guess a smaller context.');
        const data = await response.json();
        if (!Array.isArray(data.tokens)) throw new Error('Tokenizer did not return tokens.');
        return data.tokens.length;
    }

    usableProfiles(limit = this.config.maxContext ?? CONTROLLER_DEFAULTS.maxContext) {
        const since = Date.now() - (this.config.contextRetryMs ?? 600000);
        return Object.entries(this.config.profiles)
            .map(([name, profile]) => ({ name, profile, context: profileContext(profile) ?? limit }))
            .filter(({ profile, context }) => !profile.disabled && context <= limit)
            .filter(({ name }) => name === this.profile || !(this.failedAt.get(name) > since))
            .sort((x, y) => x.context - y.context);
    }

    profileFor(required, limit) {
        const usable = this.usableProfiles(limit).filter(({ context }) => context >= required);
        if (usable.some(({ name }) => name === this.profile)) return this.profile;
        return usable[0]?.name ?? null;
    }

    servedContext(limit = this.config.maxContext ?? CONTROLLER_DEFAULTS.maxContext) {
        const usable = this.usableProfiles(limit);
        return usable.length ? usable[usable.length - 1].context : limit;
    }

    async switchFor(name, need = 'this request') {
        if (this.profile === name) return this.ensure(name);
        const previous = this.profile;
        const previousFit = this.fitTarget;
        const previousDesired = this.desiredProfile;
        this.desiredProfile = name;
        try { await this.ensure(name); this.failedAt.delete(name); }
        catch (error) {
            this.failedAt.set(name, Date.now());
            this.desiredProfile = previous ?? previousDesired;
            if (previous) await this.load(previous, { fitTarget: previousFit }).catch((reload) => { this.lastError = `${error.message} Reloading ${previous} also failed: ${reload.message}`; });
            throw new Error(`${need} needs the ${name} profile, which could not load: ${error.message}${previous ? ` ${previous} is loaded again.` : ''}`);
        }
    }

    status() { return { profile: this.profile, desiredProfile: this.desiredProfile, fitTargetMiB: this.fitTarget, fitCorrectionMiB: this.fitCorrections.get(this.profile) ?? 0,
        lastFitCorrection: this.lastFitCorrection, gpuReclaims: this.reclaims, speculative: speculativeTag(this.config), slots: slots(this.config) ? { ...slots(this.config), held: Object.fromEntries(this.slotTokens), requests: { ...this.slotStats.requests }, erased: this.slotStats.erased, waited: this.slotStats.waited, chatErasedBySide: this.slotStats.chatErasedBySide, busy: [...this.slotBusy] } : null, cacheRamMiB: memberCacheOptions(this.config)?.store === 'ram' ? this.cacheBudget?.effectiveMiB ?? memberCacheOptions(this.config).budgetMiB : this.config.cacheRamMiB ?? 512, cacheBudget: this.cacheBudget, textRamMiB: Object.fromEntries(this.textRamMiB), pid: this.sleeping ? null : this.child?.pid ?? null, sleeping: this.sleeping ? { profile: this.sleeping.profile, pid: this.child?.pid ?? null, since: new Date(this.sleeping.at).toISOString(), light: this.sleeping.light === true, freedMiB: this.sleeping.freedMiB ?? null } : null, sleepStats: { ...this.sleepStats }, loading: Boolean(this.loading), loadMs: this.loadMs, loads: this.loads, lastError: this.lastError, crashed: this.crashed, servedContext: this.servedContext() }; }
}

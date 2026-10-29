import { SpillGuard, spillGuardOptions } from './spillGuard.mjs';
import { randomUUID } from 'node:crypto';
import { admission, residencyChoice, textLatencyDecision } from './policy.mjs';
import { measuredRamMiB } from './ramEstimates.mjs';
import { speculativeTag, sleepsLight } from './backend.mjs';
import { memberCacheOptions } from './memberCache.mjs';
import { estimateNeedMiB, modelIdentities, estimateRamMiB } from './models.mjs';
import { footprintKey, observedFootprint, FOOTPRINT_REVISION } from './footprints.mjs';
import { creditedSnapshot, imageResidency, residentCredit, IMAGE_IDLE_GRACE_MS } from './imageResidency.mjs';

export const RAM_REFUSAL = /Insufficient (physical RAM|commit) headroom/;
export const TIMING_WINDOW = 15;

export function median(values) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export const timingProfile = (config, profile) => { const tag = speculativeTag(config); return tag ? `${profile}+${tag}` : profile; };

export class ResidencyScheduler {
    constructor({ config, backend, snapshot, queue, freeImages, startComfy, saveFootprints, footprints = {}, timings = {}, saveTimings = async () => {}, runtime = async () => ({ id: 'unknown', streaming: false }), log = () => {}, comfyPid = () => null }) {
        Object.assign(this, { config, backend, snapshot, queue, freeImages, startComfy, saveFootprints, footprints, timings, saveTimings, runtime, log, comfyPid });
        const spillOptions = spillGuardOptions(config);
        this.spillGuard = spillOptions ? new SpillGuard(spillOptions) : null;
        this.spill = { events: [], backoffMiB: 0, textSpilled: false };
        this.residentImages = null;
        this.imagesNeedRelease = false;
        this.imageReleaseTargetMiB = null;
        this.freeImages = async (options = {}) => {
            this.residentImages = null;
            this.imagesNeedRelease = true;
            await this.checkSleepingText();
            const release = () => freeImages({ ...options, maxUsedGpuMiB: options.maxUsedGpuMiB ?? this.imageReleaseTargetMiB, otherMiB: (snapshot) => this.textHeldMiB(snapshot) });
            let result;
            try {
                try { result = await release(); }
                catch (error) {
                    if (RAM_REFUSAL.test(error.message) || !this.backend.status().sleeping || !this.backend.dropSleeping) throw error;
                    this.log(`image release: GPU memory stayed above ComfyUI's release target while text slept, so the sleeping text server is stopped (member cache dropped) and the release retried: ${error.message}`);
                    await this.backend.dropSleeping();
                    result = await release();
                }
            } catch (error) {
                this.releaseFailures = (this.releaseFailures ?? 0) + 1;
                if (!RAM_REFUSAL.test(error.message) && this.imageReleaseTargetMiB !== null && this.releaseFailures >= (this.config.releaseGiveUpAfter ?? 3)) {
                    this.lastReleaseGiveUp = { at: new Date().toISOString(), targetMiB: Math.round(this.imageReleaseTargetMiB), failures: this.releaseFailures, error: error.message };
                    this.log(`image release: ${this.releaseFailures} releases in a row missed the ${Math.round(this.imageReleaseTargetMiB)} MiB target; the next one needs only ComfyUI's own release and the text load's admission`);
                    this.imageReleaseTargetMiB = null;
                    this.releaseFailures = 0;
                }
                throw error;
            }
            this.releaseFailures = 0;
            this.imagesNeedRelease = false;
            this.imageReleaseTargetMiB = null;
            this.lastCacheMode = result?.mode ?? null;
            return result;
        };
        this.pending = [];
        this.activeText = 0;
        this.activeLanes = new Set();
        this.arrivals = new Set();
        this.burst = null;
        this.burstStats = { opened: 0, finished: 0, closed: 0, expired: 0, heldReloads: 0 };
        this.replyWaits = { replies: 0, cold: 0, coldMs: [], last: null };
        this.imagePending = false;
        this.lease = null;
        this.manualHold = false;
        this.restoring = false;
        this.lastLeaseAt = null;
        this.lastImageRequestAt = null;
        this.lastDecision = null;
        this.lastResidency = null;
        this.lastNeedGpuMiB = null;
        this.lastError = null;
        this.releasing = null;
        this.lastTextDecision = null;
        this.lastWorkflow = null;
        this.lastCacheMode = null;
        this.reloadFailures = 0;
        this.reloadRetryAt = null;
        this.servedText = 0;
        this.imageQueued = null;
        this.ramShort = null;
    }

    openBurst({ count, ttlMs, kind } = {}, now = Date.now()) {
        if (!Number.isInteger(count) || count < 1 || count > 64) throw new Error('A burst needs count 1..64 (image leases still to come).');
        if (this.config.imageBursts !== true) return { burst: null, reason: 'imageBursts is off in the controller config.' };
        const maxMs = this.config.burstMaxMs ?? 600000;
        const ttl = Number.isInteger(ttlMs) ? Math.min(Math.max(ttlMs, 5000), maxMs) : (this.config.burstDefaultMs ?? 120000);
        if (this.burst) this.burstStats.closed += 1;
        this.burst = { id: randomUUID(), remaining: count, until: now + ttl, kind: typeof kind === 'string' ? kind.slice(0, 40) : null };
        this.burstStats.opened += 1;
        return { burst: this.burst.id, remaining: count, until: new Date(this.burst.until).toISOString() };
    }

    closeBurst(id, reason = 'closed') {
        if (!this.burst || (id && this.burst.id !== id)) return false;
        this.burst = null;
        this.burstStats[reason] = (this.burstStats[reason] ?? 0) + 1;
        return true;
    }

    burstOpen(now = Date.now()) {
        if (!this.burst) return false;
        if (now < this.burst.until) return true;
        this.closeBurst(null, 'expired');
        return false;
    }

    noteReplyWait({ waitedMs, cold }) {
        const waits = this.replyWaits;
        waits.replies += 1;
        if (cold) { waits.cold += 1; waits.coldMs.push(Math.round(waitedMs)); if (waits.coldMs.length > 50) waits.coldMs.shift(); }
        waits.last = { at: new Date().toISOString(), waitedMs: Math.round(waitedMs), cold: Boolean(cold) };
    }

    replyWaitStatus() {
        const waits = this.replyWaits;
        const sorted = [...waits.coldMs].sort((a, b) => a - b);
        return { replies: waits.replies, waitedOnReload: waits.cold, share: waits.replies ? Number((waits.cold / waits.replies).toFixed(3)) : null,
            reloadWaitP50Ms: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null, reloadWaitMaxMs: sorted.length ? sorted[sorted.length - 1] : null, last: waits.last };
    }

    async keepResident(now = Date.now()) {
        if (this.config.keepTextResident === false || this.restoring || this.lease || this.imagePending || this.imageQueued || this.activeText || this.manualHold || this.pending.length) return;
        const state = this.backend.status();
        if (state.pid || state.loading) return;
        if (this.burstOpen(now)) { if (this.lastHeldLease !== this.lastLeaseAt) { this.lastHeldLease = this.lastLeaseAt; this.burstStats.heldReloads += 1; } return; }
        if (this.lastLeaseAt && now - this.lastLeaseAt < (this.config.textReloadGraceMs ?? 5000)) return;
        if (this.imagesCooling(now)) return;
        if (this.reloadRetryAt && now < this.reloadRetryAt) return;
        this.restoring = true;
        const name = this.backend.desiredProfile ?? this.config.defaultProfile;
        try {
            await this.freeImages({ ramRequiredMiB: this.config.profiles?.[name]?.estimatedRamMiB ?? 6500 });
            await this.backend.load(name, { fitTarget: null });
            this.reloadFailures = 0; this.reloadRetryAt = null; this.lastError = null;
        } catch (error) {
            this.lastError = error.message;
            this.reloadFailures += 1;
            this.reloadRetryAt = Date.now() + Math.min(this.config.textReloadMaxBackoffMs ?? 60000, 5000 * 2 ** (this.reloadFailures - 1));
        } finally { this.restoring = false; void this.pump(); }
    }

    text(run, signal, budget = null, lane = 'side') {
        if (this.manualHold) return Promise.reject(new Error('Text is manually unloaded. Select Automatic or Load text in the tray.'));
        if (this.pending.length >= this.config.maxQueue) return Promise.reject(new Error('Local text queue is full.'));
        return new Promise((resolve, reject) => {
            const entry = { run, resolve, reject, signal, budget, lane: lane === 'chat' ? 'chat' : 'side', idle: lane === 'idle', timer: null, abort: null };
            const remove = (error) => { this.pending = this.pending.filter((row) => row !== entry); this.cleanup(entry); reject(error); };
            entry.abort = () => remove(new Error('Queued request was cancelled.'));
            entry.timer = setTimeout(() => remove(new Error('Local resource queue deadline exceeded.')), this.config.queueTimeoutMs);
            signal?.addEventListener('abort', entry.abort, { once: true });
            if (signal?.aborted) { entry.abort(); return; }
            this.pending.push(entry);
            if (!entry.idle) this.notifyArrival();
            void this.pump();
        });
    }

    onArrival(listener) { this.arrivals.add(listener); return () => this.arrivals.delete(listener); }

    notifyArrival() { for (const listener of [...this.arrivals]) { try { listener(); } catch { this.arrivals.delete(listener); } } }

    cleanup(entry) { clearTimeout(entry.timer); entry.signal?.removeEventListener('abort', entry.abort); }

    concurrentLanes() {
        const lanes = this.config.slots;
        if (!lanes || lanes.enabled === false || !(lanes.count >= 2) || lanes.concurrent === false) return false;
        const state = this.backend.status();
        return Boolean(state.pid) && !state.loading && state.fitTargetMiB == null && !this.imagesNeedRelease;
    }

    nextEntry() {
        const chatFirst = this.config.chatFirst === true || Boolean(this.config.slots?.count >= 2 && this.config.slots?.enabled !== false);
        const free = (row) => !this.activeLanes.has(row.lane);
        if (chatFirst) { const chat = this.pending.findIndex((row) => row.lane === 'chat' && free(row)); if (chat >= 0) return chat; }
        return this.pending.findIndex(free);
    }

    async pump() {
        if (this.imagePending || this.lease || this.manualHold || this.restoring || (this.imageQueued && this.imageTurn())) return;
        if (this.activeText && !this.concurrentLanes()) return;
        const at = this.nextEntry();
        if (at < 0) return;
        const [entry] = this.pending.splice(at, 1);
        this.cleanup(entry);
        if (entry.signal?.aborted) { entry.reject(new Error('Request cancelled.')); void this.pump(); return; }
        const alone = this.activeText === 0;
        this.activeText += 1;
        this.activeLanes.add(entry.lane);
        if (!alone) this.overlapped = (this.overlapped ?? 0) + 1;
        void this.pump();
        try {
            const state = this.backend.status();
            if (alone && state.fitTargetMiB != null && this.config.residencyObjective !== 'switch') {
                this.lastTextDecision = textLatencyDecision({ budget: entry.budget, timings: this.timings, profile: timingProfile(this.config, state.profile), fitTarget: state.fitTargetMiB });
                if (this.lastTextDecision.restore) await this.restoreText();
            }
            if (alone && this.imagesNeedRelease) {
                const name = this.backend.desiredProfile ?? this.config.defaultProfile;
                await this.freeImages({ ramRequiredMiB: state.pid ? 0 : this.config.profiles?.[name]?.estimatedRamMiB ?? 6500 });
            }
            entry.resolve(await entry.run());
        }
        catch (error) { this.lastError = error.message; entry.reject(error); }
        finally { this.activeText -= 1; this.activeLanes.delete(entry.lane); if (!entry.idle) this.servedText += 1; void this.pump(); }
    }

    async needFor(body, key) {
        const footprint = key ? this.footprints[key] : null;
        const measured = Number.isFinite(footprint?.gpuMiB) ? footprint.gpuMiB : null;
        const verified = footprint?.revision === FOOTPRINT_REVISION && footprint.verified && measured !== null ? measured : 0;
        if (Number.isFinite(body?.needGpuMiB) && body.needGpuMiB > 0) return Math.ceil(Math.max(verified, Number(body.needGpuMiB)));
        if (Array.isArray(body?.modelFiles) && body.modelFiles.length && this.config.modelDirs) {
            try {
                return Math.ceil(Math.max(verified, await estimateNeedMiB({ modelDirs: this.config.modelDirs, files: body.modelFiles,
                    width: body.width, height: body.height, hires: body.hires })));
            } catch (error) { this.lastError = error.message; }
        }
        if (measured !== null) return Math.ceil(measured);
        return Math.ceil(this.config.defaultImageMiB ?? 12000);
    }

    imageTurn() {
        const queued = this.imageQueued;
        if (!queued) return true;
        if (this.config.replyBeforeImage === true && this.pending.some((row) => row.lane === 'chat') && Date.now() - queued.at < (this.config.imageFairWaitMs ?? 45000)) return false;
        return this.servedText - queued.served >= (this.config.imageFairTextRequests ?? 3) || Date.now() - queued.at >= (this.config.imageFairWaitMs ?? 45000);
    }

    textHeldMiB(snapshot) { return this.backend.heldMiB?.(snapshot) ?? 0; }

    releaseTarget(lease) { return lease.before.gpus[0].usedMiB - (lease.textHeldMiB ?? 0) + 512; }

    async checkSleepingText(reading = null) {
        if (!this.backend.status().sleeping || !this.backend.checkSleeping) return null;
        let stray = null;
        try { stray = await this.backend.checkSleeping(reading); } catch (error) { this.lastError = error.message; }
        if (stray) this.log(`text sleep: the sleeping text server (pid ${stray.pid}) holds ${stray.heldMiB} MiB of GPU memory, so it was woken outside the controller; stopped it, text reloads on the next request`);
        return stray;
    }

    async dropSleepingForRam(needRamMiB) {
        if (!this.backend.status().sleeping || !this.backend.dropSleeping) return 0;
        const floor = Math.max(needRamMiB + (this.config.reserves?.ramMiB ?? 0), this.config.keepCacheRamFloorMiB ?? 10240);
        const reading = await this.snapshot({ fresh: true }).catch(() => null);
        const available = reading?.host?.availableMiB;
        if (Number.isFinite(available) && available >= floor) return 0;
        this.log(`text sleep: dropping the sleeping text server and its member cache, host RAM ${Number.isFinite(available) ? Math.round(available) : 'unreadable'} MiB is under ${floor} MiB for this image`);
        return this.backend.dropSleeping();
    }

    ramShortError(detail) {
        const error = new Error(`Image admission refused: ${detail} Host RAM is short for this image; the render waits and retries when RAM frees up, and the reserve is kept.`);
        error.retryable = true;
        return error;
    }

    async noteRamShort(before, detail) {
        let after = null;
        try { after = (await this.snapshot({ fresh: true }))?.host?.availableMiB ?? null; } catch (error) { this.lastError = error.message; }
        this.ramShort = { at: Date.now(), freedMiB: Number.isFinite(after) && Number.isFinite(before) ? Math.max(0, after - before) : 0, detail };
        this.recordResidency({ decision: 'ram-short', reason: `Host RAM is short: ${detail}`, admittedReadings: { gpuFreeMiB: null, ramAvailableMiB: after } });
        return this.ramShortError(detail);
    }

    async reserve(body = {}) {
        if (this.lease || this.imagePending || this.imageQueued) throw new Error('An image batch already owns the local GPU.');
        this.lastImageRequestAt = Date.now();
        const deadline = Date.now() + this.config.queueTimeoutMs;
        this.imageQueued = { at: Date.now(), served: this.servedText };
        this.notifyArrival();
        try {
            while (this.restoring || ((this.activeText || (this.pending.length && !this.manualHold)) && !this.imageTurn())) {
                if (Date.now() > deadline) throw new Error('The text generation did not finish before the image deadline.');
                await new Promise((resolve) => setTimeout(resolve, 25));
            }
        } finally { this.imageQueued = null; }
        this.imagePending = true;
        try {
            while (this.activeText || this.restoring) {
                if (Date.now() > deadline) throw new Error('The text generation did not finish before the image deadline.');
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
            await this.startComfy();
            const queue = await this.queue();
            if (queue.queue_running?.length || queue.queue_pending?.length) throw new Error('ComfyUI has an existing job; the controller will not interrupt it.');
            const key = typeof body.workflowKey === 'string' && body.workflowKey.length < 20000 ? body.workflowKey : null;
            const runtime = await this.runtime();
            const models = body.modelFiles?.length && this.config.modelDirs ? await modelIdentities(this.config.modelDirs, body.modelFiles) : [];
            const identity = { workflowKey: key, runtime, models,
                text: this.backend.status().pid ? { profile: this.backend.status().profile, fitTarget: this.backend.status().fitTargetMiB } : null };
            const memory = await this.imageMemory(identity);
            identity.cacheState = memory.credit ? 'gpu-warm' : this.lastWorkflow === key && this.lastCacheMode === 'ram-warm' ? 'warm-possible' : 'cold-or-unknown';
            let observedKey = key ? footprintKey(identity) : null;
            let needGpuMiB = Math.max(await this.needFor(body, observedKey), memory.credit ? this.residentImages?.gpuMiB ?? 0 : 0);
            const footprint = observedKey ? this.footprints[observedKey] : null;
            let { needRamMiB, ramSource } = this.ramNeed({ body, footprint, models, runtime, resident: memory.credit ? this.residentImages : null });
            const benchmarkMode = this.config.experiments ? body.benchmarkMode : null;
            let snapshot = memory.snapshot;
            if (this.onImageRam) {
                try { if (await this.onImageRam({ needRamMiB, availableMiB: snapshot?.host?.availableMiB ?? null }) > 0) snapshot = await this.snapshot({ fresh: true }); }
                catch (error) { this.lastError = error.message; }
            }
            let decision;
            let lightNote = '';
            if (memory.credit && (benchmarkMode === 'swap' || !admission(creditedSnapshot(snapshot, memory.credit), { gpuMiB: needGpuMiB, ramMiB: needRamMiB }, this.config.reserves).allowed)) {
                await this.freeImages();
                memory.credit = null;
                snapshot = await this.snapshot({ fresh: true });
                needGpuMiB = await this.needFor(body, null);
                ({ needRamMiB, ramSource } = this.ramNeed({ body, models, runtime }));
            }
            const room = needGpuMiB + this.config.reserves.gpuMiB;
            const textState = this.backend.status();
            const textResident = Boolean(textState.pid);
            const choice = residencyChoice({ snapshot: creditedSnapshot(snapshot, memory.credit), needGpuMiB, needRamMiB, reserves: this.config.reserves, textResident });
            let reason = choice.reason;
            if (memory.credit) reason += ` Reusing ${Math.round(memory.credit.gpuMiB)} MiB of resident image GPU allocations.`;
            this.lastResidency = { decision: 'deciding', reason, textResident, textProfile: textState.profile ?? null, needGpuMiB, needRamMiB, ramSource,
                reserves: { ...this.config.reserves }, readings: { ...choice.readings, gpuFreeMiB: snapshot?.gpus?.[0]?.freeMiB ?? null, ramAvailableMiB: snapshot?.host?.availableMiB ?? null },
                residentCredit: memory.credit, shortBy: choice.shortBy, at: new Date().toISOString() };
            const fits = () => admission(creditedSnapshot(snapshot, this.residentImages ? memory.credit : null), { gpuMiB: needGpuMiB, ramMiB: needRamMiB }, this.config.reserves);
            const ramMemory = this.ramShort && Date.now() - this.ramShort.at < (this.config.ramShortMemoryMs ?? 600000) ? this.ramShort : null;
            const ramBefore = choice.readings?.ramAvailableMiB ?? null;
            const freeFor = async (ramRequiredMiB) => {
                try { await this.freeImages({ ramRequiredMiB }); }
                catch (error) { throw RAM_REFUSAL.test(error.message) ? await this.noteRamShort(ramBefore, error.message.replace(/^Image memory admission refused after GPU release\.\s*/, '')) : error; }
            };
            if (choice.keep && benchmarkMode !== 'swap') {
                decision = 'retain-text';
            } else if (benchmarkMode !== 'swap' && this.streams({ snapshot, runtime, models, needRamMiB })) {
                decision = 'stream-image';
                reason = `${choice.reason} Streaming the image beside text instead.`;
            } else if (benchmarkMode !== 'swap' && textResident && sleepsLight(this.config)
                && this.noteLightSleep(this.lightSleepCheck(snapshot, needGpuMiB, memory.credit, this.lightSleepFreesMiB())).fits) {
                await this.backend.unload({ keepCache: true, light: true });
                snapshot = await this.snapshot({ fresh: true });
                const asleep = this.backend.status().sleeping?.light === true;
                const measured = this.noteLightSleep({ ...this.lightSleepCheck(snapshot, needGpuMiB, this.residentImages ? memory.credit : null, 0), stage: 'measured' });
                if (asleep && measured.fits && fits().allowed) {
                    decision = 'sleep-context';
                    reason = `${choice.reason} Text contexts freed, weights kept on the GPU: ${measured.freeMiB} MiB free covers image ${needGpuMiB} + reserve ${measured.reserveMiB} MiB.`;
                } else {
                    if (this.backend.status().sleeping) await this.backend.dropSleeping();
                    await this.dropSleepingForRam(needRamMiB);
                    await freeFor(needRamMiB);
                    snapshot = await this.snapshot({ fresh: true });
                    decision = 'swap-text';
                    lightNote = ` A light sleep left ${measured.freeMiB ?? '?'} MiB free, short of image ${needGpuMiB} + reserve ${measured.reserveMiB} MiB; text was stopped.`;
                }
            } else if (ramMemory && textResident && Number.isFinite(ramBefore) && ramBefore + ramMemory.freedMiB < needRamMiB + this.config.reserves.ramMiB) {
                const detail = `Insufficient physical RAM headroom. RAM available ${Math.round(ramBefore)} MiB, about ${Math.round(ramMemory.freedMiB)} MiB more after unloading text; workload ${needRamMiB} + reserve ${this.config.reserves.ramMiB} MiB.`;
                this.recordResidency({ decision: 'ram-short', reason: `Host RAM is short; text kept loaded: ${detail}`, admittedReadings: { gpuFreeMiB: snapshot?.gpus?.[0]?.freeMiB ?? null, ramAvailableMiB: ramBefore } });
                throw this.ramShortError(detail);
            } else if (benchmarkMode !== 'swap' && textResident && room <= (this.config.shedCeilingMiB ?? 13000) && (benchmarkMode === 'shed' || this.shouldShed(room, body.nextTextTokens))) {
                try {
                    await this.backend.load(this.backend.desiredProfile ?? this.config.defaultProfile, { fitTarget: room });
                    snapshot = await this.snapshot({ fresh: true });
                    if (fits().allowed) { decision = 'shed-text'; reason = `${choice.reason} Text reloaded smaller to leave room.`; }
                } catch (error) {
                    if (!/memory|RAM|headroom/.test(error.message)) throw error;
                    this.lastError = error.message;
                }
                if (!decision) {
                    await this.backend.unload({ keepCache: true }); await this.dropSleepingForRam(needRamMiB); await freeFor(needRamMiB);
                    snapshot = await this.snapshot({ fresh: true }); decision = 'swap-text';
                }
            } else {
                await this.backend.unload({ keepCache: true });
                await this.dropSleepingForRam(needRamMiB);
                await freeFor(needRamMiB);
                snapshot = await this.snapshot({ fresh: true });
                decision = 'swap-text';
                if (benchmarkMode === 'swap') reason = 'Benchmark forced a swap.';
            }
            if (decision === 'swap-text' && textResident && benchmarkMode !== 'swap') reason = `Swapped text out. ${choice.reason}`;
            const light = this.lastResidency.lightSleep;
            if (light?.stage === 'estimate' && !light.fits) lightNote = ` Light sleep skipped: about ${light.freeMiB ?? '?'} MiB free after it, short of image ${needGpuMiB} + reserve ${light.reserveMiB} MiB.`;
            reason += lightNote;
            const admitted = decision === 'stream-image' ? { allowed: this.streams({ snapshot, runtime, models, needRamMiB }), reason: 'Streaming headroom changed.' } : fits();
            const admittedReadings = { gpuFreeMiB: snapshot?.gpus?.[0]?.freeMiB ?? null, ramAvailableMiB: snapshot?.host?.availableMiB ?? null };
            if (!admitted.allowed && RAM_REFUSAL.test(admitted.reason)) throw await this.noteRamShort(ramBefore, `${admitted.reason} RAM available ${Math.round(admittedReadings.ramAvailableMiB ?? -1)} MiB; workload ${needRamMiB} + reserve ${this.config.reserves.ramMiB} MiB.`);
            if (!admitted.allowed) {
                this.recordResidency({ decision: 'refused', reason: `Image admission refused: ${admitted.reason}`, admittedReadings });
                throw new Error(`Image admission refused: ${admitted.reason}`);
            }
            this.ramShort = null;
            this.recordResidency({ decision, reason, admittedReadings });
            this.lastDecision = decision;
            this.lastError = null;
            this.lastNeedGpuMiB = needGpuMiB;
            this.lastLeaseAt = Date.now();
            const residentText = this.backend.status();
            identity.text = residentText.pid ? { profile: residentText.profile, fitTarget: residentText.fitTargetMiB } : null;
            if (!this.residentImages && identity.cacheState === 'gpu-warm') identity.cacheState = this.lastCacheMode === 'ram-warm' ? 'warm-possible' : 'cold-or-unknown';
            observedKey = key ? footprintKey(identity) : null;
            this.lease = { id: randomUUID(), at: Date.now(), touched: Date.now(), key: observedKey, workflowKey: key, identity, before: creditedSnapshot(snapshot, this.residentImages ? memory.credit : null),
                peakGpu: snapshot.gpus[0].usedMiB, lowRam: snapshot.host.availableMiB, lowCommit: snapshot.host.commitFreeMiB,
                lowGpu: snapshot.gpus[0].freeMiB, highCadence: snapshot.highCadence === true, seenJob: false, decision, needGpuMiB, needRamMiB,
                textHeldMiB: residentText.pid ? this.textHeldMiB(snapshot) : 0, trace: [] };
            return { lease: this.lease.id, brokered: true, decision };
        } catch (error) {
            this.lastError = error.message;
            if (this.lastResidency?.decision === 'deciding') this.lastResidency = { ...this.lastResidency, decision: error.retryable ? 'ram-short' : 'error', reason: error.message };
            throw error;
        }
        finally { this.imagePending = false; if (!this.lease) void this.pump(); }
    }

    async imageMemory(identity) {
        let snapshot = await this.snapshot({ fresh: true });
        const credit = this.config.imageCacheMode === 'evict' ? null : residentCredit(this.residentImages, identity, snapshot, this.config.reserves);
        if (this.imagesNeedRelease && !credit) {
            await this.freeImages();
            snapshot = await this.snapshot({ fresh: true });
        }
        return { snapshot, credit };
    }

    ramNeed({ body, footprint, models, runtime, resident = null }) {
        const requested = Number.isFinite(body.needRamMiB) && body.needRamMiB >= 0 ? body.needRamMiB : 0;
        const measured = footprint?.revision === FOOTPRINT_REVISION && footprint.verified && Number.isFinite(footprint.ramMiB) ? { ramMiB: footprint.ramMiB, source: 'footprint' } : null;
        const retained = Number.isFinite(resident?.ramMiB) ? { ramMiB: resident.ramMiB, source: 'resident-observation' } : null;
        const table = measured || retained ? null : measuredRamMiB({ models, width: body.width, height: body.height, hires: body.hires === true, streaming: runtime?.streaming === true, rows: this.config.ramEstimates });
        const estimate = measured ?? retained ?? table ?? (models.length ? { ramMiB: estimateRamMiB({ weightMiB: models.reduce((sum, row) => sum + row.weightsMiB, 0),
            width: body.width, height: body.height, hires: body.hires, streaming: runtime?.streaming }), source: 'loader-estimate' } : { ramMiB: this.config.defaultImageRamMiB ?? 8192, source: 'default' });
        return requested > estimate.ramMiB ? { needRamMiB: Math.ceil(requested), ramSource: 'request' } : { needRamMiB: Math.ceil(estimate.ramMiB), ramSource: estimate.source };
    }

    lightSleepCheck(snapshot, needGpuMiB, credit, freesMiB) {
        const reading = creditedSnapshot(snapshot, credit)?.gpus?.[0]?.freeMiB;
        const freeMiB = Number.isFinite(reading) ? Math.round(reading + freesMiB) : null;
        const reserveMiB = this.config.reserves.gpuMiB;
        return { stage: 'estimate', freeMiB, needGpuMiB, reserveMiB, leftMiB: freeMiB === null ? null : freeMiB - needGpuMiB, fits: freeMiB !== null && freeMiB - needGpuMiB >= reserveMiB };
    }

    noteLightSleep(check) {
        if (this.lastResidency) this.lastResidency = { ...this.lastResidency, lightSleep: check };
        return check;
    }

    recordResidency({ decision, reason, admittedReadings }) {
        const row = { ...this.lastResidency, decision, reason, admittedReadings };
        this.lastResidency = row;
        const mib = (value) => (Number.isFinite(value) ? Math.round(value) : '?');
        this.log(`lease ${decision}: ${reason} (GPU free ${mib(row.readings?.gpuFreeMiB)} MiB, need ${row.needGpuMiB} + reserve ${row.reserves?.gpuMiB}; RAM available ${mib(row.readings?.ramAvailableMiB)} MiB, need ${row.needRamMiB} [${row.ramSource}] + reserve ${row.reserves?.ramMiB})`);
    }

    streams({ snapshot, runtime, models, needRamMiB }) {
        const policy = this.config.streamImages;
        const text = this.backend.status();
        if (!policy?.enabled || !runtime?.streaming || !text.pid || text.fitTargetMiB != null) return false;
        if (!models.length || models.some((row) => !(policy.kinds ?? ['checkpoints']).includes(row.kind))) return false;
        if (models.reduce((sum, row) => sum + row.weightsMiB, 0) > (policy.maxWeightMiB ?? 8192)) return false;
        return admission(snapshot, { gpuMiB: policy.minFreeGpuMiB ?? 2400, ramMiB: needRamMiB }, this.config.reserves).allowed;
    }

    lightSleepFreesMiB() { return memberCacheOptions(this.config)?.lightSleepFreesMiB ?? 2900; }

    renew(id) { if (this.lease?.id !== id) return false; this.lease.touched = Date.now(); return true; }

    shouldShed(room, budget = this.config.nextTextTokens ?? 256) {
        if (this.config.residencyObjective === 'switch') return true;
        const profile = this.backend.desiredProfile ?? this.config.defaultProfile;
        const timed = timingProfile(this.config, profile);
        const choice = textLatencyDecision({ budget, timings: this.timings, profile: timed, fitTarget: room });
        const reduced = this.timings[`${timed}:${room}`];
        return Number.isFinite(choice.retainedMs) && Number.isFinite(reduced?.loadMs) && reduced.loadMs + choice.retainedMs < choice.restoredMs;
    }

    async recordTiming(data) {
        const state = this.backend.status();
        const timing = data?.timings;
        if (!state.profile || !Number.isFinite(timing?.predicted_per_second) || timing.predicted_per_second <= 0 || timing.predicted_n < 8) return;
        const key = `${timingProfile(this.config, state.profile)}:${state.fitTargetMiB ?? 'full'}`;
        const old = this.timings[key];
        const recent = (values, value) => [...(Array.isArray(values) ? values : []), value].filter(Number.isFinite).slice(-TIMING_WINDOW);
        const promptSamples = recent(old?.promptSamples, timing.prompt_ms);
        const speedSamples = recent(old?.speedSamples, timing.predicted_per_second);
        this.timings[key] = { loadMs: state.loadMs ?? old?.loadMs, tokensPerSecond: median(speedSamples), promptMs: median(promptSamples) ?? 0,
            promptSamples, speedSamples, samples: (old?.samples ?? 0) + 1, at: new Date().toISOString() };
        await this.saveTimings(this.timings);
    }

    leaseExpired(lease, now = Date.now()) {
        return now - lease.touched > (this.config.leaseIdleMs ?? 120000) || now - lease.at > (this.config.leaseMaxMs ?? 1800000);
    }

    async sampleLease(now = Date.now()) {
        const lease = this.lease;
        if (!lease) return;
        let busy = null;
        try {
            const [snapshot, queue] = await Promise.all([this.snapshot({ fresh: true }), this.queue()]);
            if (this.lease !== lease) return;
            this.observe(snapshot);
            await this.checkSleepingText(snapshot);
            busy = Boolean(queue.queue_running?.length || queue.queue_pending?.length);
            lease.seenJob ||= busy;
        } catch (error) { this.lastError = error.message; }
        if (this.lease !== lease || busy === true || !this.leaseExpired(lease, now)) return;
        try { await this.release(lease.id); } catch (error) { this.lastError = error.message; }
    }

    watchSpill(snapshot, now = Date.now()) {
        if (!this.spillGuard) return null;
        const state = this.backend.status();
        if (state.loading) return null;
        const event = this.spillGuard.observe(snapshot, { text: state.pid, comfy: this.comfyPid() }, now);
        if (!event) return null;
        const step = this.spillGuard.nextStep(this.spill.backoffMiB, event.deltaMiB);
        if (step > 0 && this.config.reserves) {
            this.config.reserves.gpuMiB += step;
            if (this.config.streamImages) this.config.streamImages.minFreeGpuMiB = (this.config.streamImages.minFreeGpuMiB ?? 2400) + step;
            this.spill.backoffMiB += step;
        }
        if (event.role === 'text') this.spill.textSpilled = true;
        this.spill.events.push({ at: new Date(now).toISOString(), ...event, stepMiB: step, during: this.lease ? 'image' : this.activeText ? 'text' : 'idle', reserveMiB: this.config.reserves?.gpuMiB ?? null });
        if (this.spill.events.length > 20) this.spill.events.shift();
        this.log(`GPU memory spilled to shared memory: ${event.role} +${event.deltaMiB} MiB; GPU headroom raised by ${step} MiB to ${this.config.reserves?.gpuMiB} MiB`);
        return event;
    }

    observe(snapshot) {
        this.watchSpill(snapshot);
        const lease = this.lease;
        if (!lease) return;
        lease.peakGpu = Math.max(lease.peakGpu, snapshot.gpus[0].usedMiB);
        lease.lowRam = Math.min(lease.lowRam, snapshot.host.availableMiB);
        lease.lowCommit = Math.min(lease.lowCommit, snapshot.host.commitFreeMiB);
        lease.lowGpu = Math.min(lease.lowGpu, snapshot.gpus[0].freeMiB);
        lease.highCadence &&= snapshot.highCadence === true;
        lease.trace.push(snapshot);
        if (lease.trace.length > 5000) { lease.trace.shift(); lease.highCadence = false; }
    }

    async release(id) {
        const lease = this.lease;
        if (!lease || lease.id !== id) return false;
        if (this.releasing) return this.releasing;
        this.releasing = this.releaseOwned(lease);
        try { return await this.releasing; }
        finally { this.releasing = null; }
    }

    async drainImages() {
        const deadline = Date.now() + this.config.queueTimeoutMs;
        while (true) {
            let busy = false;
            try {
                const queue = await this.queue();
                busy = Boolean(queue.queue_running?.length || queue.queue_pending?.length);
                if (!busy) return;
            } catch (error) { this.lastError = error.message; }
            if (Date.now() > deadline) {
                if (busy) throw new Error('Image work is still running; text remains queued.');
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
    }

    async releaseOwned(lease) {
        await this.drainImages();
        const profile = this.config.profiles?.[this.backend.desiredProfile ?? this.config.defaultProfile];
        let cache = null;
        try {
            const snapshot = this.config.imageCacheMode === 'evict' ? null : await this.snapshot({ fresh: true }).catch((error) => { this.lastError = error.message; return null; });
            const warm = this.config.imageCacheMode !== 'evict' && snapshot && admission(snapshot, { gpuMiB: 0, ramMiB: 0 }, this.config.reserves).allowed;
            if (warm) {
                this.observe(snapshot);
                this.residentImages = imageResidency(lease, snapshot, this.config.reserves);
                this.imagesNeedRelease = true;
                this.imageReleaseTargetMiB = this.releaseTarget(lease);
                cache = { mode: 'gpu-warm' };
            } else try {
                cache = await this.freeImages({ ramRequiredMiB: this.backend.status().pid ? 0 : profile?.estimatedRamMiB ?? 6500,
                    maxUsedGpuMiB: this.releaseTarget(lease) });
            } catch (error) { this.lastError = error.message; }
            if (!warm) try { this.observe(await this.snapshot({ fresh: true })); } catch (error) { this.lastError = error.message; }
            this.lastWorkflow = lease.workflowKey;
            this.lastCacheMode = cache?.mode ?? null;
            if (lease.key && lease.seenJob) {
                this.footprints[lease.key] = observedFootprint(lease, this.footprints[lease.key], this.config.reserves);
                try { await this.saveFootprints(this.footprints); } catch (error) { this.lastError = error.message; }
            }
            this.lastMeasurement = { key: lease.key, workflowKey: lease.workflowKey, identity: lease.identity, lowRamMiB: lease.lowRam,
                lowGpuMiB: lease.lowGpu, lowCommitMiB: lease.lowCommit, highCadence: lease.highCadence, seenJob: lease.seenJob, trace: lease.trace };
        } finally {
            if (this.lease === lease) this.lease = null;
            this.lastLeaseAt = Date.now();
            if (this.burstOpen()) { this.burst.remaining -= 1; if (this.burst.remaining <= 0) this.closeBurst(null, 'finished'); }
            void this.pump();
        }
        return true;
    }

    async recoverFitSpill(now = Date.now()) {
        const state = this.backend.status();
        const spilled = this.spill.textSpilled;
        if (!(state.fitCorrectionMiB > 0 || spilled) || !state.pid || state.loading || state.fitTargetMiB !== null || this.restoring) return false;
        if (this.lease || this.imagePending || this.imageQueued || this.activeText || this.manualHold || this.pending.length) return false;
        if (!spilled && (this.imagesCooling(now) || (this.lastLeaseAt && now - this.lastLeaseAt < (this.config.reclaimImageGraceMs ?? 180000)))) return false;
        if (!spilled && this.lastSpillRecoveryAt && now - this.lastSpillRecoveryAt < (this.config.fitRecoverMs ?? 600000)) return false;
        this.lastSpillRecoveryAt = now;
        this.restoring = true;
        try {
            const cleared = this.backend.clearFitCorrection(state.profile);
            this.spill.textSpilled = false;
            this.log(`text spill recovery: reloading ${state.profile} without its ${cleared} MiB fit correction${spilled ? ' after a shared-memory spill' : ''}`);
            await this.backend.unload();
            await this.backend.load(state.profile, { fitTarget: null });
            this.lastError = null;
            return true;
        } catch (error) { this.lastError = error.message; return false; }
        finally { this.restoring = false; void this.pump(); }
    }

    async restoreIfIdle() {
        if (this.burstOpen()) return;
        if (await this.recoverFitSpill()) return;
        const idleMs = this.config.idleRestoreMs ?? 0;
        if (!idleMs || this.restoring) return;
        if (this.lease || this.imagePending || this.imageQueued || this.activeText || this.manualHold || this.pending.length) return;
        if (this.backend.status().fitTargetMiB === null) return;
        if (!this.lastLeaseAt || Date.now() - this.lastLeaseAt < idleMs) return;
        if (this.imagesCooling()) return;
        this.restoring = true;
        try {
            await this.restoreText();
            this.lastLeaseAt = null;
        } catch (error) { this.lastError = error.message; }
        finally { this.restoring = false; void this.pump(); }
    }

    imagesCooling(now = Date.now()) {
        const since = Math.max(this.lastLeaseAt ?? 0, this.lastImageRequestAt ?? 0);
        return this.config.imageCacheMode !== 'evict' && since > 0 && now - since < (this.config.imageIdleGraceMs ?? IMAGE_IDLE_GRACE_MS);
    }

    async restoreText() {
        const name = this.backend.desiredProfile ?? this.config.defaultProfile;
        const current = this.backend.status();
        if (current.pid && current.profile === name && current.fitTargetMiB === null) return;
        await this.backend.unload();
        await this.freeImages({ ramRequiredMiB: this.config.profiles?.[name]?.estimatedRamMiB ?? 6500 });
        await this.backend.load(name, { fitTarget: null });
        this.lastError = null;
    }

    async exclusive(run) {
        if (this.activeText || this.lease || this.imagePending || this.imageQueued || this.restoring) throw new Error('Wait for the active work before changing text residency.');
        this.restoring = true;
        try { return await run(); }
        finally { this.restoring = false; void this.pump(); }
    }

    async restoreNow() {
        if (this.manualHold) throw new Error('Text is manually unloaded. Select Automatic or Load text first.');
        await this.exclusive(async () => { await this.restoreText(); this.lastLeaseAt = null; });
    }

    async load(profile, options = {}) {
        await this.exclusive(async () => {
            const selected = this.config.profiles?.[profile];
            if (this.config.profiles && (!selected || selected.disabled)) throw new Error('That residency profile is unavailable.');
            const current = this.backend.status();
            const fitTarget = Number.isFinite(options.fitTarget) ? Math.ceil(options.fitTarget) : null;
            if (current.pid && current.profile === profile && current.fitTargetMiB === fitTarget) { this.manualHold = false; return; }
            await this.backend.unload();
            await this.freeImages({ ramRequiredMiB: this.config.profiles?.[profile]?.estimatedRamMiB ?? 6500 });
            await this.backend.load(profile, options);
            this.manualHold = false;
            this.lastError = null;
        });
    }

    async unload() {
        await this.exclusive(async () => { this.manualHold = true; await this.backend.unload(); });
    }

    resume() { this.manualHold = false; void this.pump(); }

    status() {
        return { phase: this.imagePending ? 'reserving' : this.lease ? 'image' : this.restoring ? 'restoring' : this.manualHold ? 'manual-hold' : 'text',
            activeText: this.activeText, overlappedText: this.overlapped ?? 0, burst: { open: this.burstOpen() ? { remaining: this.burst.remaining, until: new Date(this.burst.until).toISOString(), kind: this.burst.kind } : null, ...this.burstStats }, replyWaits: this.replyWaitStatus(), spill: { backoffMiB: this.spill.backoffMiB, textSpilled: this.spill.textSpilled, events: this.spill.events.slice(-5) }, waitingText: this.pending.length, imageLease: Boolean(this.lease),
            imageWaiting: Boolean(this.imageQueued), servedText: this.servedText, fairImages: true, ramShort: this.ramShort,
            text: this.backend.status(), objective: this.config.residencyObjective ?? 'total-wait', timings: this.timings, lastTextDecision: this.lastTextDecision,
            lastDecision: this.lastDecision, lastResidency: this.lastResidency, lastNeedGpuMiB: this.lastNeedGpuMiB, measurement: this.lastMeasurement ? { ...this.lastMeasurement, trace: undefined } : null,
            imageResidency: { mode: this.residentImages ? 'gpu-warm' : this.lastCacheMode, awaitingReclaim: this.imagesNeedRelease, releaseTargetMiB: this.imageReleaseTargetMiB, releaseFailures: this.releaseFailures ?? 0, lastReleaseGiveUp: this.lastReleaseGiveUp ?? null },
            lastError: this.lastError };
    }
}

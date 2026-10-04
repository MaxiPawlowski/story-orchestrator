import { randomUUID } from 'node:crypto';
import { stableSamples } from './policy.mjs';
import { estimateNeedMiB } from './models.mjs';

export class ResidencyScheduler {
    constructor({ config, backend, snapshot, queue, freeImages, startComfy, saveFootprints, footprints = {} }) {
        Object.assign(this, { config, backend, snapshot, queue, freeImages, startComfy, saveFootprints, footprints });
        this.pending = [];
        this.activeText = false;
        this.imagePending = false;
        this.lease = null;
        this.manualHold = false;
        this.restoring = false;
        this.lastLeaseAt = null;
        this.lastDecision = null;
        this.lastNeedGpuMiB = null;
        this.lastError = null;
    }

    text(run, signal) {
        if (this.manualHold) return Promise.reject(new Error('Text is manually unloaded. Select Automatic or Load text in the tray.'));
        if (this.pending.length >= this.config.maxQueue) return Promise.reject(new Error('Local text queue is full.'));
        return new Promise((resolve, reject) => {
            const entry = { run, resolve, reject, signal, timer: null, abort: null };
            const remove = (error) => { this.pending = this.pending.filter((row) => row !== entry); this.cleanup(entry); reject(error); };
            entry.abort = () => remove(new Error('Queued request was cancelled.'));
            entry.timer = setTimeout(() => remove(new Error('Local resource queue deadline exceeded.')), this.config.queueTimeoutMs);
            signal?.addEventListener('abort', entry.abort, { once: true });
            if (signal?.aborted) { entry.abort(); return; }
            this.pending.push(entry);
            void this.pump();
        });
    }

    cleanup(entry) { clearTimeout(entry.timer); entry.signal?.removeEventListener('abort', entry.abort); }

    async pump() {
        if (this.activeText || this.imagePending || this.lease || this.manualHold) return;
        const entry = this.pending.shift();
        if (!entry) return;
        this.cleanup(entry);
        if (entry.signal?.aborted) { entry.reject(new Error('Request cancelled.')); void this.pump(); return; }
        this.activeText = true;
        try { entry.resolve(await entry.run()); }
        catch (error) { this.lastError = error.message; entry.reject(error); }
        finally { this.activeText = false; void this.pump(); }
    }

    async needFor(body, key) {
        const footprint = key ? this.footprints[key] : null;
        const measured = Number.isFinite(footprint?.gpuMiB) ? footprint.gpuMiB : null;
        if (footprint?.verified && measured !== null) return Math.ceil(measured);
        if (Number.isFinite(body?.needGpuMiB)) return Math.ceil(Number(body.needGpuMiB));
        if (Array.isArray(body?.modelFiles) && body.modelFiles.length && this.config.modelDirs) {
            try {
                return Math.ceil(await estimateNeedMiB({ modelDirs: this.config.modelDirs, files: body.modelFiles,
                    width: body.width, height: body.height, hires: body.hires }));
            } catch (error) { this.lastError = error.message; }
        }
        if (measured !== null) return Math.ceil(measured);
        return Math.ceil(this.config.defaultImageMiB ?? 12000);
    }

    async reserve(body = {}) {
        if (this.lease || this.imagePending) throw new Error('An image batch already owns the local GPU.');
        this.imagePending = true;
        try {
            const deadline = Date.now() + this.config.queueTimeoutMs;
            while (this.activeText) {
                if (Date.now() > deadline) throw new Error('The text generation did not finish before the image deadline.');
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
            await this.startComfy();
            const queue = await this.queue();
            if (queue.queue_running?.length || queue.queue_pending?.length) throw new Error('ComfyUI has an existing job; the controller will not interrupt it.');
            const key = typeof body.workflowKey === 'string' && body.workflowKey.length < 20000 ? body.workflowKey : null;
            const needGpuMiB = await this.needFor(body, key);
            const room = needGpuMiB + this.config.reserves.gpuMiB;
            let snapshot = await this.snapshot();
            let decision;
            if (snapshot.gpus[0].freeMiB >= room) {
                decision = 'retain-text';
            } else if (this.backend.status().pid && room <= (this.config.shedCeilingMiB ?? 13000)) {
                await this.backend.load(this.backend.desiredProfile ?? this.config.defaultProfile, { fitTarget: room });
                snapshot = await this.snapshot();
                if (snapshot.gpus[0].freeMiB >= needGpuMiB) { decision = 'shed-text'; }
                else { await this.backend.unload(); await this.freeImages(); snapshot = await this.snapshot(); decision = 'swap-text'; }
            } else {
                await this.backend.unload();
                await this.freeImages();
                snapshot = await this.snapshot();
                decision = 'swap-text';
            }
            if (snapshot.host.availableMiB < this.config.reserves.ramMiB) throw new Error('Image admission would violate current memory headroom.');
            this.lastDecision = decision;
            this.lastNeedGpuMiB = needGpuMiB;
            this.lastLeaseAt = Date.now();
            this.lease = { id: randomUUID(), at: Date.now(), touched: Date.now(), key, before: snapshot, peakGpu: snapshot.gpus[0].usedMiB, lowRam: snapshot.host.availableMiB, seenJob: false, decision, needGpuMiB };
            return { lease: this.lease.id, brokered: true, decision };
        } catch (error) { this.lastError = error.message; throw error; }
        finally { this.imagePending = false; if (!this.lease) void this.pump(); }
    }

    renew(id) { if (this.lease?.id !== id) return false; this.lease.touched = Date.now(); return true; }

    async sampleLease() {
        const lease = this.lease;
        if (!lease) return;
        try {
            const [snapshot, queue] = await Promise.all([this.snapshot(), this.queue()]);
            if (this.lease !== lease) return;
            lease.peakGpu = Math.max(lease.peakGpu, snapshot.gpus[0].usedMiB);
            lease.lowRam = Math.min(lease.lowRam, snapshot.host.availableMiB);
            lease.seenJob ||= Boolean(queue.queue_running?.length || queue.queue_pending?.length);
            if (Date.now() - lease.touched > 120000 && !queue.queue_running?.length && !queue.queue_pending?.length) await this.release(lease.id);
        } catch (error) { this.lastError = error.message; }
    }

    async release(id) {
        const lease = this.lease;
        if (!lease || lease.id !== id) return false;
        const deadline = Date.now() + this.config.queueTimeoutMs;
        while (true) {
            const queue = await this.queue();
            if (!queue.queue_running?.length && !queue.queue_pending?.length) break;
            if (Date.now() > deadline) throw new Error('Image work is still running; text remains queued.');
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
        if (lease.key && lease.seenJob) {
            const old = this.footprints[lease.key];
            const gpuMiB = Math.ceil((lease.peakGpu - lease.before.gpus[0].usedMiB) * 1.2 + 512);
            const ramMiB = Math.ceil((lease.before.host.availableMiB - lease.lowRam) * 1.2 + 512);
            const samples = [...(old?.samples ?? []), { gpuMiB, ramMiB }].slice(-3);
            this.footprints[lease.key] = {
                gpuMiB: Math.max(gpuMiB, ...samples.map((row) => row.gpuMiB)),
                ramMiB: Math.max(ramMiB, ...samples.map((row) => row.ramMiB)),
                runs: (old?.runs ?? 0) + 1,
                samples,
                verified: stableSamples(samples),
            };
            await this.saveFootprints(this.footprints);
        }
        await this.freeImages();
        this.lease = null;
        this.lastLeaseAt = Date.now();
        void this.pump();
        return true;
    }

    async restoreIfIdle() {
        const idleMs = this.config.idleRestoreMs ?? 0;
        if (!idleMs || this.restoring) return;
        if (this.lease || this.imagePending || this.activeText || this.manualHold) return;
        if (this.backend.status().fitTargetMiB === null) return;
        if (!this.lastLeaseAt || Date.now() - this.lastLeaseAt < idleMs) return;
        this.restoring = true;
        try {
            await this.backend.load(this.backend.desiredProfile ?? this.config.defaultProfile, { fitTarget: null });
            this.lastLeaseAt = null;
        } catch (error) { this.lastError = error.message; }
        finally { this.restoring = false; }
    }

    async restoreNow() {
        if (this.manualHold) throw new Error('Text is manually unloaded. Select Automatic or Load text first.');
        if (this.activeText || this.lease || this.imagePending) throw new Error('Wait for the active work before restoring text.');
        await this.backend.load(this.backend.desiredProfile ?? this.config.defaultProfile, { fitTarget: null });
        this.lastLeaseAt = null;
    }

    async load(profile) {
        if (this.activeText || this.lease || this.imagePending) throw new Error('Wait for the active work before changing text residency.');
        this.manualHold = true;
        try { await this.backend.load(profile); }
        finally { this.manualHold = false; void this.pump(); }
    }

    async unload() {
        if (this.activeText || this.lease || this.imagePending) throw new Error('Wait for the active work before unloading text.');
        this.manualHold = true;
        await this.backend.unload();
    }

    resume() { this.manualHold = false; void this.pump(); }

    status() {
        return { phase: this.imagePending ? 'reserving' : this.lease ? 'image' : this.manualHold ? 'manual-hold' : 'text',
            activeText: this.activeText ? 1 : 0, waitingText: this.pending.length, imageLease: Boolean(this.lease),
            text: this.backend.status(), lastDecision: this.lastDecision, lastNeedGpuMiB: this.lastNeedGpuMiB, lastError: this.lastError };
    }
}

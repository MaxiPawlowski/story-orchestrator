import { admission } from './policy.mjs';

export class ImageCache {
    constructor({ config, jsonFetch, snapshot, trim = async () => {}, emptyHostCache = async () => false, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
        Object.assign(this, { config, jsonFetch, snapshot, trim, emptyHostCache, sleep });
        this.last = null;
        this.lastFailure = null;
    }

    async free({ ramRequiredMiB = 0, maxUsedGpuMiB = null, clear = false } = {}) {
        const queue = await this.jsonFetch('/queue');
        if (queue.queue_running?.length || queue.queue_pending?.length) throw new Error('ComfyUI is busy; no cache will be freed.');
        await this.jsonFetch('/free', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ unload_models: true, free_memory: clear }) });
        const deadline = Date.now() + (this.config.imageFreeTimeoutMs ?? 30000);
        const warmUntil = Date.now() + (this.config.imageWarmReleaseMs ?? 5000);
        let observed = null;
        let refused = null;
        let torchMiB = null;
        let hostTrimmed = false;
        while (Date.now() < deadline) {
            const stats = await this.jsonFetch('/system_stats');
            torchMiB = stats.devices?.length ? Math.max(...stats.devices.map((device) => device.torch_vram_total / 1024 ** 2)) : null;
            if (stats.devices?.length && stats.devices.every((device) => Number.isFinite(device.torch_vram_total) && device.torch_vram_total < 512 * 1024 * 1024)) {
                const snapshot = await this.snapshot({ fresh: true });
                observed = snapshot;
                if (Number.isFinite(maxUsedGpuMiB) && snapshot.gpus[0].usedMiB > maxUsedGpuMiB) {
                    if (!clear) return this.free({ ramRequiredMiB, maxUsedGpuMiB, clear: true });
                    await this.trim(); await this.sleep(250); continue;
                }
                const fits = admission(snapshot, { gpuMiB: 0, ramMiB: ramRequiredMiB }, this.config.reserves);
                refused = fits.allowed ? null : fits.reason;
                if (!fits.allowed && !clear && fits.reason !== 'Insufficient GPU headroom.') return this.free({ ramRequiredMiB, maxUsedGpuMiB, clear: true });
                if (!fits.allowed && clear && fits.reason !== 'Insufficient GPU headroom.') {
                    if (!hostTrimmed) { hostTrimmed = true; await this.emptyHostCache(); }
                    await this.sleep(250); continue;
                }
                this.last = { at: new Date().toISOString(), mode: clear ? 'evicted' : 'ram-warm', ramRequiredMiB, availableMiB: snapshot.host.availableMiB, admitted: fits.allowed };
                this.lastFailure = null;
                return this.last;
            }
            if (!clear && Date.now() >= warmUntil) return this.free({ ramRequiredMiB, maxUsedGpuMiB, clear: true });
            if (clear) await this.trim();
            await this.sleep(250);
        }
        this.lastFailure = { at: new Date().toISOString(), torchMiB, ramRequiredMiB, ramReserveMiB: this.config.reserves.ramMiB,
            ramAvailableMiB: observed?.host.availableMiB ?? null, usedGpuMiB: observed?.gpus[0].usedMiB ?? null, maxUsedGpuMiB, reason: refused };
        const detail = refused ? `${refused} RAM available ${Math.round(observed.host.availableMiB)} MiB; workload ${ramRequiredMiB} + reserve ${this.config.reserves.ramMiB} MiB.`
            : `Torch reserved ${Math.round(torchMiB ?? -1)} MiB; observed GPU ${Math.round(observed?.gpus[0].usedMiB ?? -1)} MiB.`;
        if (refused) throw new Error(`Image memory admission refused after GPU release. ${detail}`);
        throw new Error(`ComfyUI accepted free but its model memory has not been released; text will not race the release. ${detail}`);
    }
}

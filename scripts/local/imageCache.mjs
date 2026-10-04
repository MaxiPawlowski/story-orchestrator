import { admission } from './policy.mjs';

export class ImageCache {
    constructor({ config, jsonFetch, snapshot, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
        Object.assign(this, { config, jsonFetch, snapshot, sleep });
        this.last = null;
    }

    async free({ ramRequiredMiB = 0, clear = false } = {}) {
        const queue = await this.jsonFetch('/queue');
        if (queue.queue_running?.length || queue.queue_pending?.length) throw new Error('ComfyUI is busy; no cache will be freed.');
        await this.jsonFetch('/free', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ unload_models: true, free_memory: clear }) });
        const deadline = Date.now() + (this.config.imageFreeTimeoutMs ?? 30000);
        while (Date.now() < deadline) {
            const stats = await this.jsonFetch('/system_stats');
            if (stats.devices?.length && stats.devices.every((device) => Number.isFinite(device.torch_vram_total) && device.torch_vram_total < 512 * 1024 * 1024)) {
                const snapshot = await this.snapshot({ fresh: true });
                const fits = admission(snapshot, { gpuMiB: 0, ramMiB: ramRequiredMiB }, this.config.reserves);
                if (!fits.allowed && !clear && fits.reason !== 'Insufficient GPU headroom.') return this.free({ ramRequiredMiB, clear: true });
                this.last = { at: new Date().toISOString(), mode: clear ? 'evicted' : 'ram-warm', ramRequiredMiB, availableMiB: snapshot.host.availableMiB, admitted: fits.allowed };
                return this.last;
            }
            await this.sleep(250);
        }
        throw new Error('ComfyUI accepted free but its model memory has not been released; text will not race the release.');
    }
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ImageCache } from './imageCache.mjs';

function setup({ ram = [24000], gpuUsed = [1000], busy = false, timeout = 5, devices = [{ torch_vram_total: 0 }] } = {}) {
    const calls = [];
    const cache = new ImageCache({ config: { reserves: { gpuMiB: 2048, ramMiB: 4096 }, imageFreeTimeoutMs: timeout }, sleep: async () => new Promise((resolve) => setTimeout(resolve, 2)),
        snapshot: async (options) => { assert.equal(options.fresh, true); return { gpus: [{ freeMiB: 23000, usedMiB: gpuUsed.length > 1 ? gpuUsed.shift() : gpuUsed[0] }], host: { availableMiB: ram.length > 1 ? ram.shift() : ram[0], commitFreeMiB: 70000 } }; },
        jsonFetch: async (route, options) => {
            if (route === '/queue') return { queue_running: busy ? ['foreign'] : [], queue_pending: [] };
            if (route === '/system_stats') return { devices };
            calls.push(JSON.parse(options.body)); return {};
        } });
    return { cache, calls };
}

test('GPU reclamation preserves the Comfy execution cache when physical RAM can admit the next workload', async () => {
    const { cache, calls } = setup();
    await cache.free({ ramRequiredMiB: 6500 });
    assert.deepEqual(calls, [{ unload_models: true, free_memory: false }]);
    assert.equal(cache.last.mode, 'ram-warm');
});

test('RAM pressure evicts the execution cache and reports the observed admission result', async () => {
    const { cache, calls } = setup({ ram: [6000, 18000] });
    await cache.free({ ramRequiredMiB: 6500 });
    assert.deepEqual(calls, [{ unload_models: true, free_memory: false }, { unload_models: true, free_memory: true }]);
    assert.equal(cache.last.mode, 'evicted'); assert.equal(cache.last.admitted, true);
});

test('a foreign image job prevents both offload and cache eviction', async () => {
    const { cache, calls } = setup({ busy: true });
    await assert.rejects(cache.free({ clear: true }), /busy/);
    assert.deepEqual(calls, []);
});

test('missing device telemetry never counts as successful VRAM release', async () => {
    const { cache } = setup({ devices: [] });
    await assert.rejects(cache.free(), /has not been released/);
});

test('native CUDA allocations outside torch must return to the lease baseline before text resumes', async () => {
    const { cache, calls } = setup({ gpuUsed: [6000, 1000] });
    await cache.free({ maxUsedGpuMiB: 1600 });
    assert.deepEqual(calls, [{ unload_models: true, free_memory: false }, { unload_models: true, free_memory: true }]);
    assert.equal(cache.last.mode, 'evicted');
    const retained = setup({ gpuUsed: [6000] });
    await assert.rejects(retained.cache.free({ maxUsedGpuMiB: 1600, clear: true }), /has not been released/);
});

test('an already-empty GPU is not acknowledgement that the asynchronous RAM cache eviction landed', async () => {
    const { cache, calls } = setup({ ram: [6000, 6000, 6000, 18000], timeout: 100 });
    await cache.free({ ramRequiredMiB: 6500 });
    assert.equal(cache.last.availableMiB, 18000);
    assert.equal(cache.last.admitted, true);
    assert.deepEqual(calls, [{ unload_models: true, free_memory: false }, { unload_models: true, free_memory: true }]);
});

test('a RAM refusal reports the observed headroom rather than calling it an unknown GPU failure', async () => {
    const { cache } = setup({ ram: [6000] });
    await assert.rejects(cache.free({ ramRequiredMiB: 6500, clear: true }), /Insufficient physical RAM headroom.*6500 \+ reserve 4096/);
    assert.equal(cache.lastFailure.ramAvailableMiB, 6000);
    assert.equal(cache.lastFailure.torchMiB, 0);
});

test('pinned host cache is released only under observed RAM pressure, without weakening the reserve', async () => {
    const calls = [];
    let freed = false;
    const cache = new ImageCache({ config: { reserves: { gpuMiB: 2048, ramMiB: 4096 }, imageFreeTimeoutMs: 1000 },
        jsonFetch: async (route) => route === '/queue' ? { queue_running: [], queue_pending: [] }
            : route === '/system_stats' ? { devices: [{ torch_vram_total: 0 }] } : {},
        emptyHostCache: async () => { calls.push('unused pinned blocks'); freed = true; return true; },
        snapshot: async () => ({ gpus: [{ freeMiB: 23000, usedMiB: 1000 }], host: { availableMiB: freed ? 16000 : 11000, commitFreeMiB: 70000 } }) });
    await cache.free({ ramRequiredMiB: 10664, clear: true });
    assert.deepEqual(calls, ['unused pinned blocks']);
    assert.equal(cache.last.availableMiB, 16000);
    assert.equal(cache.last.admitted, true);
});

test('a model that cannot offload while its loader is cached escalates to cache eviction', async () => {
    const calls = [];
    let cleared = false;
    const cache = new ImageCache({ config: { reserves: { gpuMiB: 2048, ramMiB: 4096 }, imageFreeTimeoutMs: 100, imageWarmReleaseMs: 0 },
        jsonFetch: async (route, options) => {
            if (route === '/queue') return { queue_running: [], queue_pending: [] };
            if (route === '/system_stats') return { devices: [{ torch_vram_total: cleared ? 0 : 7 * 1024 ** 3 }] };
            const body = JSON.parse(options.body); calls.push(body); cleared = body.free_memory; return {};
        }, snapshot: async () => ({ gpus: [{ usedMiB: 1000, freeMiB: 23000 }], host: { availableMiB: 24000, commitFreeMiB: 70000 } }) });
    await cache.free({ maxUsedGpuMiB: 1600 });
    assert.deepEqual(calls, [{ unload_models: true, free_memory: false }, { unload_models: true, free_memory: true }]);
    assert.equal(cache.last.mode, 'evicted');
});

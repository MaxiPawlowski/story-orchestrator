import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ImageCache } from './imageCache.mjs';

function setup({ ram = [24000], busy = false, devices = [{ torch_vram_total: 0 }] } = {}) {
    const calls = [];
    const cache = new ImageCache({ config: { reserves: { gpuMiB: 2048, ramMiB: 4096 }, imageFreeTimeoutMs: 5 }, sleep: async () => new Promise((resolve) => setTimeout(resolve, 2)),
        snapshot: async (options) => { assert.equal(options.fresh, true); return { gpus: [{ freeMiB: 23000 }], host: { availableMiB: ram.length > 1 ? ram.shift() : ram[0], commitFreeMiB: 70000 } }; },
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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemberCache, memberCacheOptions } from '../../server-plugin/story-orchestrator-gpu/broker/memberCache.mjs';
import { ResidencyScheduler } from '../../server-plugin/story-orchestrator-gpu/broker/scheduler.mjs';
import { createSettingsReload, PRESETS } from './modes.mjs';
import { ENV_GPU_FORCE, gpuPlacement, judgeConfig } from './judgeModels.mjs';

function nativeServer(entries, limitMiB) {
    const server = { entries: [...entries], limitMiB, limits: [] };
    server.fetch = async (url, init = {}) => {
        const route = new URL(url).pathname;
        if (route === '/cache' && (init.method ?? 'GET') === 'GET') return Response.json({ enabled: true, prompts: server.entries.length, keyed: server.entries.length, size_mib: server.entries.reduce((a, b) => a + b, 0), limit_mib: server.limitMiB, sleeping: false });
        if (route === '/cache/limit') {
            server.limitMiB = JSON.parse(init.body).mib;
            server.limits.push(server.limitMiB);
            while (server.entries.length && server.entries.reduce((a, b) => a + b, 0) > server.limitMiB) server.entries.shift();
            return Response.json({ limit_mib: server.limitMiB });
        }
        return Response.json({});
    };
    return server;
}

const cacheWith = (server, { available, imageRamMiB, fitImageCacheRam }) => {
    const live = { budgetMiB: 12288, fitRam: true, fitImageCacheRam };
    return new MemberCache(memberCacheOptions({ stateDir: 'state', memberCache: { enabled: true, store: 'ram', serverKeys: true, erase: false, park: false, budgetMiB: 12288, fitRam: true, fitImageCacheRam } }),
        { fetch: server.fetch, baseUrl: 'http://backend', snapshot: async () => ({ host: { availableMiB: available } }), reserves: { ramMiB: 2048 },
            live: () => live, ramFloorMiB: () => 10240, imageRamMiB, sleep: async () => {} });
};

test('M5 follow-up: off by default, the post-image refit counts ComfyUI warm RAM as used and evicts the states that survived the sleep', async () => {
    assert.equal(memberCacheOptions({ memberCache: { enabled: true } }).fitImageCacheRam, false);
    assert.throws(() => memberCacheOptions({ memberCache: { enabled: true, fitImageCacheRam: 'yes' } }), /fitImageCacheRam must be true or false/);
    const server = nativeServer([1300, 1300, 1300], 6400);
    const cache = cacheWith(server, { available: 11000, imageRamMiB: () => 7000, fitImageCacheRam: false });
    assert.deepEqual(await cache.refit('chat'), { changed: true, limitMiB: 3328 });
    assert.equal(server.entries.length, 2);
    assert.equal(cache.lastRefit.imageCreditMiB, 0);
});

test('M5 follow-up: with fitImageCacheRam the warm image RAM ComfyUI gives back under pressure is credited, so the surviving states stay', async () => {
    const server = nativeServer([1300, 1300, 1300], 6400);
    const cache = cacheWith(server, { available: 11000, imageRamMiB: () => 7000, fitImageCacheRam: true });
    assert.deepEqual(await cache.refit('chat'), { changed: true, limitMiB: 10240 });
    assert.equal(server.entries.length, 3);
    assert.equal(cache.lastRefit.imageCreditMiB, 7000);
    const capped = nativeServer([1300, 1300, 1300], 6400);
    const huge = cacheWith(capped, { available: 12500, imageRamMiB: () => 50000, fitImageCacheRam: true });
    assert.equal(huge.imageCredit(), 8192, 'the credit never exceeds the image staging part of the floor');
    const none = cacheWith(nativeServer([1300], 6400), { available: 12500, imageRamMiB: () => null, fitImageCacheRam: true });
    assert.equal(none.imageCredit(), 0);
});

const reading = { highCadence: true, gpus: [{ usedMiB: 2576, freeMiB: 22000 }], host: { availableMiB: 30000, commitFreeMiB: 80000 } };

function scheduler({ comfy = { pid: 7 }, freeMode = 'ram-warm' } = {}) {
    const backend = { profile: null, desiredProfile: 'fast', status: () => ({ pid: null, profile: null, desiredProfile: 'fast', fitTargetMiB: null }), unload: async () => {}, load: async () => {} };
    return new ResidencyScheduler({ config: { maxQueue: 2, queueTimeoutMs: 1000, reserves: { gpuMiB: 2048, ramMiB: 4096 }, imageCacheMode: 'warm', idleRestoreMs: 0, defaultImageRamMiB: 7000, defaultProfile: 'fast' },
        backend, snapshot: async () => reading, queue: async () => ({ queue_running: [], queue_pending: [] }), freeImages: async () => ({ mode: freeMode }),
        startComfy: async () => {}, saveFootprints: async () => {}, comfyPid: () => comfy.pid });
}

test('M5 follow-up: the scheduler reports the warm image RAM after a warm release, none during a lease, and forgets it on an evict or a ComfyUI restart', async () => {
    const comfy = { pid: 7 };
    const warm = scheduler({ comfy });
    assert.equal(warm.warmImageRamMiB(), 0);
    const lease = await warm.reserve({});
    assert.equal(warm.warmImageRamMiB(), 0);
    await warm.release(lease.lease);
    const held = warm.warmImageRamMiB();
    assert.ok(held > 0, `held ${held}`);
    assert.equal(warm.status().imageResidency.warmRamMiB, held);
    await warm.freeImages({});
    assert.equal(warm.warmImageRamMiB(), held, 'a release to RAM keeps it');
    comfy.pid = 8;
    assert.equal(warm.warmImageRamMiB(), 0, 'a restarted ComfyUI holds nothing');
    comfy.pid = 7;
    assert.equal(warm.warmImageRamMiB(), 0);
    const evicting = scheduler({ freeMode: 'evicted' });
    await evicting.release((await evicting.reserve({})).lease);
    assert.ok(evicting.warmImageRamMiB() > 0);
    await evicting.freeImages({ clear: true });
    assert.equal(evicting.warmImageRamMiB(), 0);
});

const reloadDeps = () => {
    const calls = [];
    const backend = { status: () => ({ pid: 9, loading: false, fitTargetMiB: null, profile: 'fast', desiredProfile: 'fast', sleeping: null }),
        async unload() { calls.push('unload'); }, async load(name) { calls.push(`load:${name}`); } };
    return { calls, backend, scheduler: () => ({ async freeImages() { calls.push('free'); } }), snapshot: async () => ({ gpus: [{ freeMiB: 1000 }], host: { availableMiB: 9000 } }) };
};

test('H1 follow-up: a mode with unloadTextOnApply unloads loaded text on apply-now instead of reloading it; every built-in preset keeps it off', async () => {
    for (const preset of Object.values(PRESETS)) assert.equal(preset.unloadTextOnApply, false);
    const unloading = reloadDeps();
    const result = await createSettingsReload({ ...unloading, target: { imageCacheMode: 'evict', unloadTextOnApply: true, keepTextResident: false } })();
    assert.equal(result.text, 'unloaded');
    assert.deepEqual(unloading.calls, ['free', 'unload']);
    const reloading = reloadDeps();
    assert.equal((await createSettingsReload({ ...reloading, target: { imageCacheMode: 'evict' } })()).text, 'reloaded');
    assert.deepEqual(reloading.calls, ['free', 'unload', 'load:fast']);
});

test('M4 follow-up: a GPU-layered local judge starts on the CPU while the local controller runs, unless forced; with no controller or no layers nothing changes', () => {
    const gpu = judgeConfig({ SO_JUDGE_LOCAL_GPU_LAYERS: '99' }, { platform: 'win32' });
    const cpu = judgeConfig({}, { platform: 'win32' });
    const refused = gpuPlacement(gpu, { controllerUp: true, env: {} });
    assert.equal(refused.gpuLayers, 0);
    assert.match(refused.note, /starts on the CPU/);
    const forced = gpuPlacement(gpu, { controllerUp: true, env: { [ENV_GPU_FORCE]: '1' } });
    assert.equal(forced.gpuLayers, 99);
    assert.match(forced.note, /may lose GPU layers/);
    assert.deepEqual(gpuPlacement(gpu, { controllerUp: false }), { gpuLayers: 99, note: null });
    assert.deepEqual(gpuPlacement(cpu, { controllerUp: true }), { gpuLayers: 0, note: null });
});

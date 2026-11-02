import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemberCache, fitCacheMiB, memberCacheOptions } from './memberCache.mjs';

function nativeServer({ entries = [1300, 1300, 1300], limitMiB = 4096, patched = true } = {}) {
    const server = { entries: [...entries], limitMiB, calls: [] };
    server.fetch = async (url, init = {}) => {
        const route = new URL(url).pathname;
        server.calls.push({ route, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : null });
        if (!patched && route.startsWith('/cache')) return new Response('{"error":"not found"}', { status: 404 });
        if (route === '/cache' && (init.method ?? 'GET') === 'GET') {
            const size = server.entries.reduce((sum, value) => sum + value, 0);
            return Response.json({ enabled: true, prompts: server.entries.length, keyed: server.entries.length, size_mib: size, limit_mib: server.limitMiB, sleeping: false });
        }
        if (route === '/cache/limit') {
            server.limitMiB = JSON.parse(init.body).mib;
            while (server.entries.length && server.entries.reduce((sum, value) => sum + value, 0) > server.limitMiB) server.entries.shift();
            return Response.json({ limit_mib: server.limitMiB, applied: 'requested' });
        }
        return Response.json({ timings: { prompt_n: 5 } });
    };
    return server;
}

const cacheOn = (server, { available = 20000, budgetMiB = 4096, fitRam = false, floor = 10240 } = {}) => {
    const live = { budgetMiB, fitRam };
    const cache = new MemberCache(memberCacheOptions({ stateDir: 'state', memberCache: { enabled: true, store: 'ram', serverKeys: true, erase: false, park: false, budgetMiB, fitRam } }),
        { fetch: server.fetch, baseUrl: 'http://backend', snapshot: async () => ({ host: { availableMiB: typeof available === 'function' ? available() : available } }),
            reserves: { ramMiB: 2048 }, live: () => live, ramFloorMiB: () => floor, sleep: async () => {} });
    return { cache, live };
};

test('fitCacheMiB keeps text, cache and the image floor inside the RAM it sees, between 1 GiB and the ceiling', () => {
    assert.equal(fitCacheMiB({ capMiB: 12288, availableMiB: 18000, occupancyMiB: 0, floorMiB: 10240 }), 7680);
    assert.equal(fitCacheMiB({ capMiB: 12288, availableMiB: 6000, occupancyMiB: 4000, floorMiB: 10240 }), 1024);
    assert.equal(fitCacheMiB({ capMiB: 4096, availableMiB: 30000, occupancyMiB: 0, floorMiB: 10240 }), 4096);
    assert.equal(fitCacheMiB({ capMiB: 4096, availableMiB: NaN, floorMiB: 10240 }), 4096);
    assert.throws(() => memberCacheOptions({ memberCache: { enabled: true, fitRam: 'yes' } }), /fitRam/);
});

test('status reports the native occupancy from GET /cache, and says so when the server lacks it', async () => {
    const server = nativeServer();
    const { cache } = cacheOn(server);
    await cache.nativeState();
    const status = cache.status();
    assert.equal(status.native.sizeMiB, 3900);
    assert.equal(status.native.limitMiB, 4096);
    assert.equal(status.native.prompts, 3);
    assert.match(status.occupancy, /3900 of 4096 MiB, 3 entries/);
    const stock = nativeServer({ patched: false });
    const { cache: plain } = cacheOn(stock);
    assert.equal(await plain.nativeState(), null);
    assert.equal(plain.nativeSupported, false);
    assert.match(plain.status().occupancy, /not reported/);
    await plain.nativeState();
    assert.equal(stock.calls.length, 1);
    plain.syncBackend(42);
    assert.equal(plain.nativeSupported, null);
});

test('RAM mode makes room for an image by lowering the native limit: oldest entries go, the freed bytes are returned', async () => {
    const server = nativeServer();
    const { cache } = cacheOn(server);
    const freed = await cache.makeRoom({ needRamMiB: 8192, availableMiB: 9000 });
    assert.equal(server.limitMiB, 3900 + 9000 - 8192 - 2048);
    assert.equal(server.entries.length, 2);
    assert.equal(freed, 1300 * 1048576);
    assert.equal(cache.stats.trims, 1);
    assert.equal(cache.stats.evictedForImages, 1);
    assert.equal(cache.lastTrim.occupancyAfterMiB, 2600);
});

test('an image with RAM to spare only caps the cache growth for the lease; one already capped changes nothing', async () => {
    const server = nativeServer({ entries: [1300], limitMiB: 4096 });
    const { cache } = cacheOn(server);
    assert.equal(await cache.makeRoom({ needRamMiB: 8192, availableMiB: 12000 }), 0);
    assert.equal(server.limitMiB, 1300 + 12000 - 10240);
    assert.equal(server.entries.length, 1);
    const calls = server.calls.length;
    assert.equal(await cache.makeRoom({ needRamMiB: 8192, availableMiB: 30000 }), 0);
    assert.equal(server.calls.filter((call) => call.route === '/cache/limit').length, 1);
    assert.ok(server.calls.length > calls);
});

test('a stock server cannot be trimmed: makeRoom returns 0 and counts it', async () => {
    const { cache } = cacheOn(nativeServer({ patched: false }));
    assert.equal(await cache.makeRoom({ needRamMiB: 8192, availableMiB: 1000 }), 0);
    assert.equal(cache.stats.makeRoomUnsupported, 1);
});

test('refit with fitRam follows free RAM down at once (keeping room for one more entry) and up only by 1 GiB or more; without fitRam it holds the ceiling', async () => {
    let available = 10000;
    const server = nativeServer({ entries: [1300, 1300], limitMiB: 4096 });
    const { cache, live } = cacheOn(server, { available: () => available, budgetMiB: 12288, fitRam: true });
    assert.deepEqual(await cache.refit('reply'), { changed: true, limitMiB: 1024 });
    assert.equal(server.entries.length, 0);
    assert.equal(cache.lastRefit.fromMiB, 4096);
    assert.equal(cache.lastRefit.entryMiB, 1300);
    available = 11000;
    assert.equal((await cache.refit('reply')).changed, false);
    available = 16000;
    assert.deepEqual(await cache.refit('reply'), { changed: true, limitMiB: 4096 });
    available = 16500;
    assert.equal((await cache.refit('reply')).changed, false);
    live.fitRam = false;
    live.budgetMiB = 2048;
    assert.deepEqual(await cache.refit('settings'), { changed: true, limitMiB: 2048 });
    assert.equal(cache.status().capMiB, 2048);
    assert.equal(cache.stats.refits, 3);
});

test('with fitRam a chat request refits before it runs, and after the reply the cache refits only when nothing waits', async () => {
    let available = 30000;
    const server = nativeServer({ entries: [1300], limitMiB: 4096 });
    const { cache } = cacheOn(server, { available: () => available, budgetMiB: 8192, fitRam: true });
    const prompt = `<|turn>system
You are Ana.${'h'.repeat(9000)}<turn|>
<|turn>user
${'m'.repeat(8000)}<turn|>
<|turn>system
note ${'x'.repeat(1500)}<turn|>
<|turn>model
`;
    const limits = () => server.calls.filter((call) => call.route === '/cache/limit').length;
    const plan = await cache.before({ prompt, stream: true }, 0);
    assert.equal(server.limitMiB, 8192);
    assert.equal(cache.lastRefit.reason, 'chat');
    const sent = limits();
    available = 12000;
    await cache.afterReply(plan, { idle: () => false });
    assert.equal(limits(), sent);
    await cache.afterReply(plan, { idle: () => true });
    assert.equal(limits(), sent + 1);
    assert.equal(server.limitMiB, 1536);
});

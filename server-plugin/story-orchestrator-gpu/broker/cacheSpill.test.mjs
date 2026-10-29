import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import { testTempDir } from '../../../scripts/lib/testTemp.mjs';
import { ensureSpillDir, parseAces, spillDirFor, spillUsage, sweepSpill } from './cacheSpill.mjs';
import { NativeBackend, nativeArgs } from './backend.mjs';
import { MemberCache, memberCacheOptions } from './memberCache.mjs';

const DIR = 'C:\\state\\member-spill';
const owner = `${DIR} HOST\\owner:(OI)(CI)(F)\r\n\r\nSuccessfully processed 1 files; Failed processing 0 files`;

function fakeIcacls({ shown = owner, setFails = false } = {}) {
    const calls = [];
    const icacls = async (args) => {
        calls.push(args);
        if (args.length > 1) return setFails ? { ok: false, code: 5, output: 'Access is denied.' } : { ok: true, code: 0, output: 'processed file' };
        return { ok: true, code: 0, output: shown };
    };
    return { icacls, calls };
}

const quietFs = { mkdir: async () => {}, chmod: async () => {} };

test('icacls output parses into principals, ending at the blank line; another directory reads as unknown', () => {
    const output = `${DIR} HOST\\owner:(OI)(CI)(F)\r\n                     BUILTIN\\Users:(RX)\r\n\r\nSuccessfully processed 1 files`;
    assert.deepEqual(parseAces(output, DIR).map((ace) => ace.principal), ['HOST\\owner', 'BUILTIN\\Users']);
    assert.equal(parseAces('D:\\other HOST\\owner:(F)', DIR), null);
});

test('the spill directory is created owner-only on Windows: inheritance removed, the user granted, and the ACL read back', async () => {
    const { icacls, calls } = fakeIcacls();
    const result = await ensureSpillDir(DIR, { fs: quietFs, platform: 'win32', icacls, user: 'owner' });
    assert.deepEqual(result, { ok: true, acl: 'owner only (owner)' });
    assert.deepEqual(calls[0], [DIR, '/inheritance:r', '/grant:r', 'owner:(OI)(CI)F']);
    assert.deepEqual(calls[1], [DIR]);
});

test('a spill directory whose ACL still grants anyone else, or that icacls cannot set, is refused', async () => {
    const shared = fakeIcacls({ shown: `${DIR} HOST\\owner:(OI)(CI)(F)\r\n  BUILTIN\\Users:(OI)(CI)(RX)\r\n` });
    const refused = await ensureSpillDir(DIR, { fs: quietFs, platform: 'win32', icacls: shared.icacls, user: 'owner' });
    assert.equal(refused.ok, false);
    assert.match(refused.reason, /BUILTIN\\Users/);
    const denied = await ensureSpillDir(DIR, { fs: quietFs, platform: 'win32', icacls: fakeIcacls({ setFails: true }).icacls, user: 'owner' });
    assert.equal(denied.ok, false);
    assert.match(denied.reason, /icacls answered 5/);
});

test('elsewhere the spill directory is chmod 0700', async () => {
    const modes = [];
    const result = await ensureSpillDir('/state/member-spill', { fs: { mkdir: async () => {}, chmod: async (_dir, mode) => { modes.push(mode); } }, platform: 'linux' });
    assert.equal(result.ok, true);
    assert.deepEqual(modes, [0o700]);
});

test('sweeps remove only per-server folders other than the live one; usage counts only spill-named files', async () => {
    const root = await testTempDir('so-spill-');
    const dir = spillDirFor(root);
    for (const pid of ['101', '202']) {
        await fs.mkdir(path.join(dir, pid), { recursive: true });
        await fs.writeFile(path.join(dir, pid, '0123456789abcdef.spill'), Buffer.alloc(1000));
        await fs.writeFile(path.join(dir, pid, 'fedcba9876543210.tmp'), Buffer.alloc(10));
        await fs.writeFile(path.join(dir, pid, 'notes.txt'), 'x');
    }
    await fs.writeFile(path.join(dir, 'keep.txt'), 'not ours');
    assert.deepEqual(await spillUsage(dir), { dirs: 2, files: 4, bytes: 2020 });
    assert.equal(await sweepSpill(dir, 202), 1);
    assert.deepEqual((await fs.readdir(dir)).sort(), ['202', 'keep.txt']);
    assert.equal(await sweepSpill(dir, null), 1);
    assert.deepEqual(await fs.readdir(dir), ['keep.txt']);
    assert.deepEqual(await spillUsage(path.join(root, 'missing')), { dirs: 0, files: 0, bytes: 0 });
});

test('memberCache.spill is off by default, needs store ram and serverKeys, bounds its size and lives under the state dir', () => {
    const base = { stateDir: 'D:/state', memberCache: { enabled: true, store: 'ram', serverKeys: true } };
    const off = memberCacheOptions(base);
    assert.equal(off.spill, false);
    assert.equal(off.spillMaxMiB, 8192);
    assert.equal(off.spillDir, path.join('D:/state', 'member-spill'));
    assert.throws(() => memberCacheOptions({ memberCache: { enabled: true, store: 'ram', spill: true } }), /spill needs store ram and serverKeys/);
    assert.throws(() => memberCacheOptions({ memberCache: { ...base.memberCache, spill: 'yes' } }), /spill must be true or false/);
    assert.throws(() => memberCacheOptions({ memberCache: { ...base.memberCache, spill: true, spillMaxMiB: 512 } }), /spillMaxMiB/);
});

test('llama-server gets the spill directory and bound only when spill is on', () => {
    const config = { defaultProfile: 'fast', reserves: { gpuMiB: 1024 }, backendPort: 1, model: 'm', modelAlias: 'a', stateDir: 'D:/state' };
    const memberCache = { enabled: true, store: 'ram', serverKeys: true, budgetMiB: 4096 };
    assert.equal(nativeArgs({ ...config, memberCache }, { args: [] }).includes('--cache-spill-dir'), false);
    const on = nativeArgs({ ...config, memberCache: { ...memberCache, spill: true, spillMaxMiB: 6144 } }, { args: [] });
    assert.equal(on[on.indexOf('--cache-spill-dir') + 1], path.join('D:/state', 'member-spill'));
    assert.equal(on[on.indexOf('--cache-spill-max-mib') + 1], '6144');
});

async function spawnedArgs(t, prepareSpill) {
    const stateDir = await testTempDir('so-spill-load-');
    let child = null;
    const calls = [];
    const backend = new NativeBackend({ defaultProfile: 'fast', maxContext: 32768, stateDir, backendPort: 18889, model: 'fixture', modelAlias: 'fixture', admissionWindowMs: 0,
        reserves: { gpuMiB: 1024, ramMiB: 2048 }, memberCache: { enabled: true, store: 'ram', serverKeys: true, budgetMiB: 4096, spill: true },
        profiles: { fast: { args: ['--ctx-size', '32768'], estimatedGpuMiB: 20500, estimatedRamMiB: 3000 } } }, {
        prepareSpill,
        snapshot: async () => ({ host: { availableMiB: 30000, commitFreeMiB: 60000 }, gpus: [{ freeMiB: child ? 3000 : 24000 }] }),
        fetch: async () => { if (!child) throw new Error('not listening'); return { ok: true }; },
        spawn: (_binary, args) => {
            calls.push(args);
            const next = new EventEmitter();
            next.pid = 7; next.exitCode = null;
            next.kill = () => { child = null; next.exitCode = 0; next.emit('exit', 0); };
            child = next;
            return next;
        },
    });
    t.after(async () => { await backend.unload(); });
    await backend.load('fast');
    return { args: calls[0], status: backend.status(), stateDir };
}

test('a text load prepares the owner-only spill directory before llama-server starts and reports it', async (t) => {
    const prepared = [];
    const { args, status, stateDir } = await spawnedArgs(t, async (dir) => { prepared.push(dir); return { ok: true, acl: 'owner only (owner)' }; });
    assert.deepEqual(prepared, [path.join(stateDir, 'member-spill')]);
    assert.equal(args[args.indexOf('--cache-spill-dir') + 1], path.join(stateDir, 'member-spill'));
    assert.equal(status.cacheSpill.ready, true);
});

test('when the spill directory cannot be made owner-only, llama-server starts without spill', async (t) => {
    const { args, status } = await spawnedArgs(t, async () => ({ ok: false, reason: 'spill directory ACL still grants Everyone' }));
    assert.equal(args.includes('--cache-spill-dir'), false);
    assert.equal(status.cacheSpill.ready, false);
    assert.match(status.cacheSpill.reason, /Everyone/);
});

function spillServer({ entries = [1300, 1300, 1300], limitMiB = 4096, fail = false } = {}) {
    const server = { entries: [...entries], disk: [], limitMiB, calls: [] };
    const size = () => server.entries.reduce((sum, value) => sum + value, 0);
    server.fetch = async (url, init = {}) => {
        const route = new URL(url).pathname;
        server.calls.push({ route, body: init.body ? JSON.parse(init.body) : null });
        if (route === '/cache') return Response.json({ enabled: true, prompts: server.entries.length, keyed: server.entries.length, size_mib: size(), limit_mib: server.limitMiB, sleeping: true,
            spill: { enabled: true, files: server.disk.length, size_mib: server.disk.reduce((sum, value) => sum + value, 0) } });
        if (route === '/cache/spill') {
            if (fail) return Response.json({ error: { message: 'spill is not configured' } }, { status: 503 });
            const keep = JSON.parse(init.body).keep_mib;
            let spilled = 0; let spilledMiB = 0;
            while (server.entries.length && size() > keep) { const entry = server.entries.shift(); server.disk.push(entry); spilled += 1; spilledMiB += entry; }
            return Response.json({ spilled, dropped: 0, spilled_mib: spilledMiB, ms: 420.5, kept_mib: size(), files: server.disk.length, files_mib: server.disk.reduce((sum, value) => sum + value, 0) });
        }
        if (route === '/cache/limit') {
            server.limitMiB = JSON.parse(init.body).mib;
            while (server.entries.length && size() > server.limitMiB) server.entries.shift();
            return Response.json({ limit_mib: server.limitMiB });
        }
        return Response.json({});
    };
    return server;
}

function spillCache(server, { spill = true, fitRam = false, available = 20000, root = 'D:/state' } = {}) {
    const live = { budgetMiB: 4096, fitRam };
    const swept = [];
    const fsFake = { mkdir: async () => {}, readdir: async () => [], rm: async (target) => { swept.push(target); }, chmod: async () => {}, stat: async () => ({ size: 0 }) };
    const cache = new MemberCache(memberCacheOptions({ stateDir: root, memberCache: { enabled: true, store: 'ram', serverKeys: true, erase: false, park: false, budgetMiB: 4096, fitRam, spill } }), {
        fetch: server.fetch, baseUrl: 'http://backend', fs: fsFake, snapshot: async () => ({ host: { availableMiB: typeof available === 'function' ? available() : available } }),
        reserves: { ramMiB: 2048 }, live: () => live, ramFloorMiB: () => 10240, sleep: async () => {},
        spillEnv: { platform: 'win32', user: 'owner', icacls: fakeIcacls({ shown: `${spillDirFor(root)} HOST\\owner:(OI)(CI)(F)\r\n` }).icacls } });
    return { cache, live, swept };
}

test('controller start sweeps every spilled folder and makes the spill directory owner-only before anything spills', async () => {
    const server = spillServer();
    const { cache } = spillCache(server);
    await cache.init();
    assert.equal(cache.spillReady, true);
    assert.equal(cache.status().spill.acl, 'owner only (owner)');
    assert.equal(cache.status().spill.dir, path.join('D:/state', 'member-spill'));
});

test('an image trim spills the oldest keyed entries to disk before it lowers the limit, so nothing is evicted', async () => {
    const server = spillServer();
    const { cache } = spillCache(server);
    await cache.init();
    const freed = await cache.trimForImage({ needRamMiB: 8192, availableMiB: 8000 });
    const routes = server.calls.map((call) => call.route).filter((route) => route !== '/cache');
    assert.deepEqual(routes, ['/cache/spill', '/cache/limit']);
    assert.equal(server.calls.find((call) => call.route === '/cache/spill').body.keep_mib, 1660);
    assert.deepEqual(server.disk, [1300, 1300, 1300].slice(0, 2));
    assert.equal(freed, 2600 * 1048576);
    assert.equal(cache.stats.spilledEntries, 2);
    assert.equal(cache.status().spill.lastSpill.reason, 'image');
});

test('with spill off the trim evicts as before and never calls /cache/spill', async () => {
    const server = spillServer();
    const { cache } = spillCache(server, { spill: false });
    await cache.init();
    await cache.trimForImage({ needRamMiB: 8192, availableMiB: 8000 });
    assert.equal(server.calls.some((call) => call.route === '/cache/spill'), false);
    assert.deepEqual(server.disk, []);
    assert.deepEqual(cache.status().spill, { enabled: false });
});

test('a lowering refit spills down to the new limit first', async () => {
    const server = spillServer();
    const { cache } = spillCache(server, { fitRam: true, available: 9000 });
    await cache.init();
    await cache.refit('chat');
    const spill = server.calls.find((call) => call.route === '/cache/spill');
    assert.ok(spill);
    assert.equal(spill.body.keep_mib, server.limitMiB);
    assert.equal(server.disk.length > 0, true);
    assert.equal(cache.lastSpill.reason, 'refit-chat');
});

test('spillForRam frees what the image floor needs and keeps the rest in RAM; null when it cannot help', async () => {
    const server = spillServer();
    const { cache } = spillCache(server);
    await cache.init();
    const result = await cache.spillForRam({ needRamMiB: 8192, availableMiB: 9000, floorMiB: 10240 });
    assert.equal(server.calls.find((call) => call.route === '/cache/spill').body.keep_mib, 2660);
    assert.equal(result.freedMiB, 1300);
    assert.equal(result.spilled, 1);
    assert.equal(cache.stats.spillsInsteadOfDrop, 1);
    assert.equal(await cache.spillForRam({ needRamMiB: 0, availableMiB: 30000, floorMiB: 10240 }), null);
    const { cache: off } = spillCache(spillServer(), { spill: false });
    await off.init();
    assert.equal(await off.spillForRam({ availableMiB: 9000, floorMiB: 10240 }), null);
});

test('a refused spill is counted, named in lastError, and leaves the trim to evict as before', async () => {
    const server = spillServer({ fail: true });
    const { cache } = spillCache(server);
    await cache.init();
    await cache.trimForImage({ needRamMiB: 8192, availableMiB: 8000 });
    assert.equal(cache.stats.spillFailures, 1);
    assert.match(cache.lastError, /cache spill answered 503: spill is not configured/);
    assert.equal(server.entries.length, 1);
});

test('a new text server pid sweeps the spill folders of earlier servers; a sleeping (null) pid sweeps nothing', async () => {
    const root = await testTempDir('so-spill-sync-');
    const dir = spillDirFor(root);
    for (const pid of ['11', '22']) await fs.mkdir(path.join(dir, pid), { recursive: true });
    const cache = new MemberCache(memberCacheOptions({ stateDir: root, memberCache: { enabled: true, store: 'ram', serverKeys: true, spill: true } }), { fetch: async () => Response.json({}), baseUrl: 'http://backend' });
    cache.syncBackend(null);
    assert.equal(cache.sweeping, null);
    cache.syncBackend(22);
    assert.equal(await cache.sweeping, 1);
    assert.deepEqual(await fs.readdir(dir), ['22']);
    await cache.refreshSpillUsage();
    assert.deepEqual({ ...cache.status().spill.disk, at: undefined }, { dirs: 1, files: 0, bytes: 0, at: undefined });
});

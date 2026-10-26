import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MemberCache, memberCacheOptions, memberKey, historyCut } from './memberCache.mjs';

const SYS = '<|turn>system\n';
const prompt = (member, turns, tail = 'x'.repeat(1500)) => `${SYS}You are ${member}.${'h'.repeat(2500)}<turn|>\n${Array.from({ length: turns }, (_, at) => `<|turn>user\nmessage ${at} ${'m'.repeat(400)}<turn|>\n`).join('')}${SYS}author note ${tail}<turn|>\n<|turn>model\n`;

async function harness({ ram = 20000, budgetMiB = 6144, rewind = true, fail = {} } = {}) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'so-member-'));
    const calls = [];
    const fetchImpl = async (url, init) => {
        const route = new URL(url).pathname + new URL(url).search;
        const body = JSON.parse(init.body);
        calls.push({ route, body });
        if (route.includes('action=save')) {
            if (fail.save) return new Response('{}', { status: 500 });
            await fs.writeFile(path.join(dir, body.filename), 'state');
            return Response.json({ n_written: fail.bytes ?? 1024 });
        }
        if (route.includes('action=restore')) return fail.restore ? new Response('{}', { status: 400 }) : Response.json({ n_restored: 10 });
        return Response.json({ timings: { prompt_n: 5 } });
    };
    const cache = new MemberCache(memberCacheOptions({ stateDir: dir, memberCache: { enabled: true, dir, budgetMiB, rewind, minPromptChars: 1000, minCutChars: 1000, minTailChars: 100 } }),
        { fetch: fetchImpl, fs: { ...fs, stat: async () => ({ size: fail.bytes ?? 1024 }) }, baseUrl: 'http://backend', snapshot: async () => ({ host: { availableMiB: ram } }), reserves: { ramMiB: 2048 } });
    await cache.init();
    return { cache, calls, dir };
}

test('the member cache is off unless enabled and validates its keys', () => {
    assert.equal(memberCacheOptions({}), null);
    assert.equal(memberCacheOptions({ memberCache: { budgetMiB: 10 } }), null);
    const on = memberCacheOptions({ stateDir: 'D:/s', memberCache: { enabled: true } });
    assert.equal(on.budgetMiB, 6144);
    assert.equal(on.rewind, true);
    assert.equal(on.dir, path.join('D:/s', 'member-states'));
    assert.throws(() => memberCacheOptions({ memberCache: { enabled: true, budgetMiB: -1 } }), /budgetMiB/);
    assert.throws(() => memberCacheOptions({ memberCache: { enabled: true, ctxCheckpoints: 2 } }), /ctxCheckpoints/);
});

test('the cut is the first system block after the head; the key is the head hash', () => {
    const text = prompt('Ana', 3);
    assert.equal(historyCut(text), text.indexOf(`${SYS}author note`));
    assert.equal(historyCut('no markers'), null);
    assert.equal(historyCut(`${SYS}only the head`), null);
    assert.equal(memberKey(prompt('Ana', 3)), memberKey(prompt('Ana', 9)));
    assert.notEqual(memberKey(prompt('Ana', 3)), memberKey(prompt('Bob', 3)));
});

test('a cold member prefills to the cut, saves after the reply (rewound), then restores when it speaks again', async () => {
    const { cache, calls, dir } = await harness();
    const first = await cache.before({ prompt: prompt('Ana', 3), stream: true }, 0);
    assert.equal(first.timing.restored, false);
    assert.deepEqual(calls.map((call) => call.route), ['/completion']);
    assert.equal(calls[0].body.prompt, prompt('Ana', 3).slice(0, first.cut));
    assert.equal(calls[0].body.n_predict, 0);
    assert.equal(calls[0].body.id_slot, 0);
    const saved = await cache.afterReply(first);
    assert.equal(saved.saved, true);
    assert.deepEqual(calls.slice(1).map((call) => call.route), ['/completion', '/slots/0?action=save']);
    assert.equal(calls[1].body.prompt, calls[0].body.prompt);
    assert.ok((await fs.readdir(dir)).includes(`m-${first.key}.bin`));
    await cache.before({ prompt: prompt('Bob', 4), stream: true }, 0);
    calls.length = 0;
    const again = await cache.before({ prompt: prompt('Ana', 6), stream: true }, 0);
    assert.equal(again.timing.restored, true);
    assert.deepEqual(calls.map((call) => call.route), ['/slots/0?action=restore', '/completion']);
    assert.equal(calls[0].body.filename, `m-${first.key}.bin`);
    assert.equal(cache.status().hits, 1);
    assert.equal(cache.status().misses, 2);
});

test('without rewind the save follows the reply directly', async () => {
    const { cache, calls } = await harness({ rewind: false });
    const plan = await cache.before({ prompt: prompt('Ana', 3), stream: true }, 0);
    calls.length = 0;
    assert.equal((await cache.afterReply(plan)).saved, true);
    assert.deepEqual(calls.map((call) => call.route), ['/slots/0?action=save']);
});

test('a member still in the slot is not restored; a side request in the slot clears that', async () => {
    const { cache, calls } = await harness();
    const plan = await cache.before({ prompt: prompt('Ana', 3), stream: true }, 0);
    await cache.afterReply(plan);
    calls.length = 0;
    const swipe = await cache.before({ prompt: prompt('Ana', 3), stream: true }, 0);
    assert.equal(swipe.timing.resident, true);
    assert.deepEqual(calls.map((call) => call.route), ['/completion']);
    assert.equal(await cache.before({ prompt: 'short side pass', stream: false }, 0), null);
    calls.length = 0;
    const after = await cache.before({ prompt: prompt('Ana', 4), stream: true }, 0);
    assert.equal(after.timing.restored, true);
    assert.equal(calls[0].route, '/slots/0?action=restore');
});

test('a save is skipped when a request is waiting, and skipped when RAM would fall under the reserve', async () => {
    const busy = await harness();
    const plan = await busy.cache.before({ prompt: prompt('Ana', 3), stream: true }, 0);
    assert.deepEqual(await busy.cache.afterReply(plan, { idle: () => false }), { saved: false, reason: 'busy' });
    assert.equal(busy.calls.filter((call) => call.route.includes('save')).length, 0);
    const short = await harness({ ram: 3000 });
    const plan2 = await short.cache.before({ prompt: prompt('Ana', 3), stream: true }, 0);
    assert.equal((await short.cache.afterReply(plan2)).reason, 'ram');
    assert.equal(short.cache.status().skippedRam, 1);
});

test('the budget evicts the least recently used member and deletes its file', async () => {
    const { cache, dir } = await harness({ budgetMiB: 2, fail: { bytes: 1048576 } });
    const ana = await cache.before({ prompt: prompt('Ana', 3), stream: true }, 0); await cache.afterReply(ana);
    const bob = await cache.before({ prompt: prompt('Bob', 3), stream: true }, 0); await cache.afterReply(bob);
    const cid = await cache.before({ prompt: prompt('Cid', 3), stream: true }, 0); await cache.afterReply(cid);
    assert.equal(cache.status().entries, 2);
    assert.equal(cache.status().evictions, 1);
    assert.ok(!(await fs.readdir(dir)).includes(`m-${ana.key}.bin`));
});

test('images make room by dropping states; a failed restore drops the entry and runs cold', async () => {
    const { cache, dir } = await harness({ fail: { bytes: 1048576 * 1024 } });
    const ana = await cache.before({ prompt: prompt('Ana', 3), stream: true }, 0); await cache.afterReply(ana);
    assert.equal(await cache.makeRoom({ needRamMiB: 1000, availableMiB: 9000 }), 0);
    assert.ok(await cache.makeRoom({ needRamMiB: 8000, availableMiB: 9000 }) > 0);
    assert.equal(cache.status().entries, 0);
    assert.equal(cache.status().evictedForImages, 1);
    assert.deepEqual(await fs.readdir(dir), []);
    const failing = await harness({ fail: { restore: true } });
    const p = await failing.cache.before({ prompt: prompt('Ana', 3), stream: true }, 0); await failing.cache.afterReply(p);
    await failing.cache.before({ prompt: prompt('Bob', 3), stream: true }, 0);
    const cold = await failing.cache.before({ prompt: prompt('Ana', 4), stream: true }, 0);
    assert.equal(cold.timing.restored, false);
    assert.equal(failing.cache.status().restoreFailures, 1);
    assert.equal(failing.cache.status().entries, 0);
});

test('short or unstreamed prompts are not planned; init removes stale state files only', async () => {
    const { cache, dir } = await harness();
    await fs.writeFile(path.join(dir, 'm-0123456789abcdef.bin'), 'old');
    await fs.writeFile(path.join(dir, 'keep.txt'), 'other');
    await cache.init();
    assert.deepEqual(await fs.readdir(dir), ['keep.txt']);
    assert.equal(cache.plan({ prompt: prompt('Ana', 3), stream: false }), null);
    assert.equal(cache.plan({ prompt: 'tiny', stream: true }), null);
    assert.equal(cache.plan({ messages: [], stream: true }), null);
});

async function ramHarness({ park = true, cacheN = (prompt) => 0 } = {}) {
    const calls = [];
    const fetchImpl = async (url, init) => {
        const route = new URL(url).pathname + new URL(url).search;
        const body = JSON.parse(init.body);
        calls.push({ route, body });
        if (route.includes('action=erase')) return Response.json({ n_erased: 1 });
        const evaluated = Math.ceil((body.prompt ?? '').length / 4);
        const cached = cacheN(body.prompt ?? '');
        return Response.json({ tokens_evaluated: evaluated, timings: { prompt_n: evaluated - cached, cache_n: cached } });
    };
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'so-member-ram-'));
    const cache = new MemberCache(memberCacheOptions({ stateDir: dir, memberCache: { enabled: true, store: 'ram', park, budgetMiB: 6144, minPromptChars: 1000, minCutChars: 1000, minTailChars: 100 } }),
        { fetch: fetchImpl, baseUrl: 'http://backend', snapshot: async () => ({ host: { availableMiB: 20000 } }), reserves: { ramMiB: 2048 } });
    await cache.init();
    return { cache, calls };
}

test('store ram: no slot files; prefill to the cut counts a hit when the server restored most of it; other requests erase the slot', async () => {
    assert.throws(() => memberCacheOptions({ memberCache: { enabled: true, store: 'disk' } }), /store/);
    assert.throws(() => memberCacheOptions({ memberCache: { enabled: true, store: 'ram', budgetMiB: 512 } }), /budgetMiB/);
    let restoreAna = false;
    const { cache, calls } = await ramHarness({ park: false, cacheN: (text) => (restoreAna && text.includes('You are Ana') ? Math.floor(text.length / 8) : 0) });
    const ana = await cache.before({ prompt: prompt('Ana', 3), stream: true }, 0);
    assert.deepEqual(calls.map((call) => call.route), ['/completion']);
    assert.equal(calls[0].body.prompt, prompt('Ana', 3).slice(0, ana.cut));
    assert.equal(ana.timing.restored, false);
    assert.deepEqual(await cache.afterReply(ana), { saved: false, reason: 'park-off' });
    calls.length = 0;
    assert.deepEqual(await cache.afterOther(0), { erased: true });
    assert.deepEqual(calls.map((call) => call.route), ['/slots/0?action=erase']);
    restoreAna = true;
    const again = await cache.before({ prompt: prompt('Ana', 6), stream: true }, 0);
    assert.equal(again.timing.restored, true);
    assert.ok(again.timing.cachedTokens > 0);
    assert.equal(calls.filter((call) => call.route.includes('restore') || call.route.includes('save')).length, 0);
    const resident = await cache.before({ prompt: prompt('Ana', 6), stream: true }, 0);
    assert.equal(resident.timing.resident, true);
    const status = cache.status();
    assert.equal(status.store, 'ram');
    assert.equal(status.hits, 1);
    assert.equal(status.misses, 1);
    assert.equal(status.resident, 1);
    assert.equal(status.erases, 1);
    assert.equal(await cache.makeRoom({ needRamMiB: 8000, availableMiB: 1000 }), 0);
});

test('store ram: when idle the reply is parked (the server copies it to its RAM cache) and the park is erased; busy skips it', async () => {
    const { cache, calls } = await ramHarness();
    const ana = await cache.before({ prompt: prompt('Ana', 3), stream: true }, 0);
    calls.length = 0;
    const parked = await cache.afterReply(ana, { idle: () => true });
    assert.equal(parked.saved, true);
    assert.deepEqual(calls.map((call) => call.route), ['/completion', '/slots/0?action=erase']);
    assert.equal(calls[0].body.n_predict, 0);
    assert.equal(calls[0].body.id_slot, 0);
    const bob = await cache.before({ prompt: prompt('Bob', 3), stream: true }, 0);
    calls.length = 0;
    assert.deepEqual(await cache.afterReply(bob, { idle: () => false }), { saved: false, reason: 'busy' });
    assert.deepEqual(calls, []);
    assert.equal(cache.status().parks, 1);
    assert.equal(cache.status().skippedBusy, 1);
});

test('store ram with serverKeys tags the prefill and the request with the member key and the cut token count; erase off keeps the slot', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => { calls.push({ route: new URL(url).pathname + new URL(url).search, body: JSON.parse(init.body) }); return Response.json({ tokens_evaluated: 700, timings: { prompt_n: 700, cache_n: 0 } }); };
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'so-member-keys-'));
    const cache = new MemberCache(memberCacheOptions({ stateDir: dir, memberCache: { enabled: true, store: 'ram', serverKeys: true, erase: false, park: false, minPromptChars: 1000, minCutChars: 1000, minTailChars: 100 } }), { fetch: fetchImpl, baseUrl: 'http://backend' });
    await cache.init();
    const body = { prompt: prompt('Ana', 3), stream: true };
    const plan = await cache.before(body, 0);
    assert.equal(calls[0].body.cache_key, plan.key);
    assert.equal(body.cache_key, plan.key);
    assert.equal(body.cache_ckpt_max, 700);
    assert.deepEqual(await cache.afterOther(0), { erased: false });
    assert.equal(calls.length, 1);
});

test('nextPrefix rebuilds a member head plus all but the last three history turns of the latest prompt', async () => {
    const { nextPrefix, promptTurns } = await import('./memberCache.mjs');
    const ana = prompt('Ana', 6);
    const bob = prompt('Bob', 7);
    const turns = promptTurns(bob);
    assert.equal(turns.history.length, 7);
    assert.equal(nextPrefix(promptTurns(ana).head, bob), promptTurns(ana).head + turns.history.slice(0, 4).join(''));
    assert.equal(nextPrefix(promptTurns(ana).head, prompt('Bob', 2)), null);
    assert.equal(promptTurns('no turns'), null);
});

test('idle prefill warms other members first with their key, skips repeats and yields when a request waits', async () => {
    assert.throws(() => memberCacheOptions({ memberCache: { enabled: true, idlePrefill: true } }), /idlePrefill/);
    const calls = [];
    const fetchImpl = async (url, init) => { calls.push({ route: new URL(url).pathname + new URL(url).search, body: JSON.parse(init.body) }); return Response.json({ tokens_evaluated: 700, timings: { prompt_n: 700, cache_n: 0 } }); };
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'so-member-idle-'));
    const cache = new MemberCache(memberCacheOptions({ stateDir: dir, memberCache: { enabled: true, store: 'ram', serverKeys: true, erase: false, park: false, idlePrefill: true, minPromptChars: 1000, minCutChars: 1000, minTailChars: 100 } }), { fetch: fetchImpl, baseUrl: 'http://backend' });
    await cache.init();
    const ana = await cache.before({ prompt: prompt('Ana', 6), stream: true }, 0);
    const cleo = await cache.before({ prompt: prompt('Cleo', 7), stream: true }, 0);
    const bob = await cache.before({ prompt: prompt('Bob', 8), stream: true }, 0);
    calls.length = 0;
    assert.deepEqual(await cache.runIdlePrefill({ idle: () => true }), { prefilled: 3 });
    assert.deepEqual(calls.map((call) => call.body.cache_key), [cleo.key, ana.key, bob.key]);
    assert.ok(calls.every((call) => call.body.n_predict === 0 && call.body.cache_ckpt_max > 0));
    assert.ok(prompt('Cleo', 9).startsWith(calls[0].body.prompt));
    calls.length = 0;
    assert.deepEqual(await cache.runIdlePrefill({ idle: () => true }), { prefilled: 0 });
    await cache.before({ prompt: prompt('Ana', 9), stream: true }, 0);
    calls.length = 0;
    let budget = 1;
    assert.deepEqual(await cache.runIdlePrefill({ idle: () => budget-- > 0 }), { prefilled: 1 });
    assert.equal(cache.status().idleYields, 1);
    assert.equal(cache.status().idlePrefills, 4);
});


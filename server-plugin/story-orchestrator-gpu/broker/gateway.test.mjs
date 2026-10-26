import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGateway } from './gateway.mjs';
import { ContextRefusal } from './backend.mjs';

const fakeArbiter = (state, refuse = null) => {
    const queued = [];
    const backend = {
        url: 'http://backend', profile: state.profile,
        status: () => state,
        servedContext: () => 32768,
        ensure: async () => {},
        forRequest: async (body, signal, slot) => { state.slots = [...(state.slots ?? []), slot]; if (refuse) throw refuse(body); },
    };
    return {
        queued, backend, scheduler: { recordTiming: async () => {} },
        text: (run) => new Promise((resolve, reject) => { queued.push(() => run().then(resolve, reject)); }),
        status: async () => ({}),
    };
};

const backendFetch = async () => new Response(JSON.stringify({ tokens: [1, 2, 3] }), { headers: { 'content-type': 'application/json' } });

const serve = async (arbiter) => {
    const gateway = createGateway({ arbiter, config: { modelAlias: 'm', defaultProfile: 'fast' }, fetchImpl: backendFetch });
    const { port } = await gateway.listen(0);
    return { gateway, url: `http://127.0.0.1:${port}` };
};

test('a token count on a loaded backend is answered at once, not queued behind a running generation (F19)', async () => {
    const arbiter = fakeArbiter({ pid: 7, loading: false, profile: 'fast' });
    const { gateway, url } = await serve(arbiter);
    try {
        const reply = await fetch(`${url}/tokenize`, { method: 'POST', body: JSON.stringify({ content: 'hi' }) });
        assert.equal(reply.status, 200);
        assert.deepEqual(await reply.json(), { tokens: [1, 2, 3] });
        assert.equal(arbiter.queued.length, 0);
    } finally { await gateway.close(); }
});

test('a token count while text is loading or absent waits in the text queue like a generation', async () => {
    const arbiter = fakeArbiter({ pid: null, loading: true, profile: null });
    const { gateway, url } = await serve(arbiter);
    try {
        const pending = fetch(`${url}/tokenize`, { method: 'POST', body: JSON.stringify({ content: 'hi' }) });
        while (!arbiter.queued.length) await new Promise((resolve) => setTimeout(resolve, 5));
        arbiter.queued.shift()();
        assert.equal((await pending).status, 200);
    } finally { await gateway.close(); }
});

test('a request the served context cannot hold is a 400 exceed_context_size_error, nothing loaded', async () => {
    const arbiter = fakeArbiter({ pid: 7, loading: false, profile: 'fast' }, () => new ContextRefusal(32448, 400, 32768));
    const { gateway, url } = await serve(arbiter);
    try {
        const pending = fetch(`${url}/completion`, { method: 'POST', body: JSON.stringify({ prompt: 'x', n_predict: 400 }) });
        while (!arbiter.queued.length) await new Promise((resolve) => setTimeout(resolve, 5));
        arbiter.queued.shift()();
        const reply = await pending;
        assert.equal(reply.status, 400);
        const body = await reply.json();
        assert.equal(body.error.type, 'exceed_context_size_error');
        assert.equal(body.error.n_ctx, 32768);
        assert.equal(body.error.n_prompt_tokens, 32448);
    } finally { await gateway.close(); }
});

test('with prompt reuse on, a long completion is preceded by a prefill to the shared boundary and followed by a park when idle', async () => {
    const arbiter = fakeArbiter({ pid: 7, loading: false, profile: 'fast' });
    arbiter.scheduler.pending = [];
    const calls = [];
    const fetchImpl = async (url, init) => {
        const body = JSON.parse(init.body);
        calls.push({ url, prompt: body.prompt, n_predict: body.n_predict });
        return new Response(JSON.stringify({ content: 'ok' }), { headers: { 'content-type': 'application/json' } });
    };
    const gateway = createGateway({ arbiter, config: { modelAlias: 'm', defaultProfile: 'fast', promptReuse: { enabled: true, minChars: 100, minPrefixChars: 50, minTailChars: 10 } }, fetchImpl });
    const { port } = await gateway.listen(0);
    const send = async (prompt) => {
        const pending = fetch(`http://127.0.0.1:${port}/completion`, { method: 'POST', body: JSON.stringify({ prompt, n_predict: 8 }) });
        while (!arbiter.queued.length) await new Promise((resolve) => setTimeout(resolve, 5));
        arbiter.queued.shift()();
        assert.equal((await pending).status, 200);
    };
    const history = 'line of history\n'.repeat(10);
    try {
        await send(`${history}tail one that is long enough`);
        await send(`${history}reply\ntail two that is long enough`);
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.deepEqual(calls.map((call) => [call.n_predict, call.prompt.startsWith('Idle.') ? 'park' : call.prompt.length]), [
            [8, history.length + 'tail one that is long enough'.length], [0, 'park'],
            [0, history.length], [8, history.length + 'reply\ntail two that is long enough'.length], [0, 'park']]);
        assert.equal(gateway.promptReuse.status().prefills, 1);
    } finally { await gateway.close(); }
});

test('prompt reuse stays off by default and skips the park while requests are queued', async () => {
    const arbiter = fakeArbiter({ pid: 7, loading: false, profile: 'fast' });
    const calls = [];
    const fetchImpl = async (url, init) => { calls.push(JSON.parse(init.body)); return new Response('{}', { headers: { 'content-type': 'application/json' } }); };
    const off = createGateway({ arbiter, config: { modelAlias: 'm' }, fetchImpl });
    assert.equal(off.promptReuse, null);
    arbiter.scheduler.pending = [{}];
    const on = createGateway({ arbiter, config: { modelAlias: 'm', promptReuse: { enabled: true, minChars: 1 } }, fetchImpl });
    const { port } = await on.listen(0);
    try {
        const pending = fetch(`http://127.0.0.1:${port}/completion`, { method: 'POST', body: JSON.stringify({ prompt: 'x', n_predict: 4 }) });
        while (!arbiter.queued.length) await new Promise((resolve) => setTimeout(resolve, 5));
        arbiter.queued.shift()();
        await pending;
        assert.deepEqual(calls.map((call) => call.prompt), ['x']);
    } finally { await on.close(); }
});

test('pinned slots route streamed chat to the chat slot and side passes to the side slot, prefill included, never a park', async () => {
    const arbiter = fakeArbiter({ pid: 7, loading: false, profile: 'fast' });
    arbiter.scheduler.pending = [];
    const calls = [];
    const fetchImpl = async (url, init) => {
        if (!init?.body) return new Response(JSON.stringify({ default_generation_settings: {} }), { headers: { 'content-type': 'application/json' } });
        const body = JSON.parse(init.body);
        calls.push([body.n_predict, body.id_slot, body.prompt.startsWith('Idle.') ? 'park' : body.prompt.length]);
        return new Response(JSON.stringify({ content: 'ok' }), { headers: { 'content-type': 'application/json' } });
    };
    const gateway = createGateway({ arbiter, config: { modelAlias: 'm', defaultProfile: 'fast', slots: { count: 2 }, promptReuse: { enabled: true, minChars: 100, minPrefixChars: 50, minTailChars: 10 } }, fetchImpl });
    const { port } = await gateway.listen(0);
    const send = async (body) => {
        const pending = fetch(`http://127.0.0.1:${port}/completion`, { method: 'POST', body: JSON.stringify(body) });
        while (!arbiter.queued.length) await new Promise((resolve) => setTimeout(resolve, 5));
        arbiter.queued.shift()();
        assert.equal((await pending).status, 200);
    };
    const history = 'line of history\n'.repeat(10);
    try {
        await send({ prompt: `${history}tail one that is long enough`, n_predict: 8, stream: true });
        await send({ prompt: 'side pass', n_predict: 4, stream: false });
        await send({ prompt: `${history}reply\ntail two that is long enough`, n_predict: 8, stream: true });
        await send({ prompt: 'explicit', n_predict: 4, id_slot: 3 });
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.deepEqual(calls, [[8, 0, history.length + 28], [4, 1, 9], [0, 0, history.length], [8, 0, history.length + 34], [4, 3, 8]]);
        assert.deepEqual(arbiter.backend.status().slots, [0, 1, 0, 3]);
        const props = await (await fetch(`http://127.0.0.1:${port}/props`)).json();
        assert.equal(props.total_slots, 2);
    } finally { await gateway.close(); }
});

test('with the member cache on, a streamed completion is planned before the backend call and saved after the reply only when idle; other generations clear the slot', async () => {
    const arbiter = fakeArbiter({ pid: 7, loading: false, profile: 'fast' });
    arbiter.scheduler.pending = [];
    const order = [];
    const members = {
        syncBackend: (pid) => order.push(`sync ${pid}`),
        before: async (body, slot) => { order.push(`before ${slot}`); return body.stream ? { key: 'k', slot } : null; },
        afterReply: async (plan, { idle }) => { order.push(`after ${plan.key} idle=${idle()}`); },
        noteOther: (slot) => order.push(`other ${slot}`),
        afterOther: async (slot) => order.push(`erase ${slot}`),
        status: () => ({}),
    };
    const fetchImpl = async (url, init) => { order.push(`backend ${new URL(url).pathname} ${JSON.parse(init.body).n_predict}`); return new Response(JSON.stringify({ content: 'ok' }), { headers: { 'content-type': 'application/json' } }); };
    const gateway = createGateway({ arbiter, config: { modelAlias: 'm', defaultProfile: 'fast', promptReuse: { enabled: true, minChars: 1, minPrefixChars: 1, minTailChars: 1 } }, fetchImpl, memberCache: members });
    const { port } = await gateway.listen(0);
    const send = async (route, body) => {
        const pending = fetch(`http://127.0.0.1:${port}${route}`, { method: 'POST', body: JSON.stringify(body) });
        while (!arbiter.queued.length) await new Promise((resolve) => setTimeout(resolve, 5));
        arbiter.queued.shift()();
        assert.equal((await pending).status, 200);
    };
    try {
        await send('/completion', { prompt: 'chat prompt', n_predict: 8, stream: true });
        await send('/v1/chat/completions', { messages: [], max_tokens: 4 });
        arbiter.scheduler.pending = [{}];
        await send('/completion', { prompt: 'chat prompt', n_predict: 8, stream: true });
        assert.deepEqual(order, ['sync 7', 'before 0', 'backend /completion 8', 'after k idle=true',
            'sync 7', 'other 0', 'backend /v1/chat/completions undefined', 'erase 0',
            'sync 7', 'before 0', 'backend /completion 8', 'after k idle=false']);
        assert.equal(gateway.memberCache, members);
    } finally { await gateway.close(); }
});

test('the member cache is off by default and gives up image RAM through the scheduler hook', async () => {
    const off = createGateway({ arbiter: fakeArbiter({ pid: 7 }), config: { modelAlias: 'm' }, fetchImpl: backendFetch });
    assert.equal(off.memberCache, null);
    const arbiter = fakeArbiter({ pid: 7 });
    const on = createGateway({ arbiter, config: { modelAlias: 'm', stateDir: (await import('node:os')).tmpdir(), memberCache: { enabled: true, dir: `${(await import('node:os')).tmpdir()}/so-gw-member-test` } }, fetchImpl: backendFetch });
    assert.equal(typeof arbiter.scheduler.onImageRam, 'function');
    assert.equal(await arbiter.scheduler.onImageRam({ needRamMiB: 8000, availableMiB: 1000 }), 0);
    assert.equal(on.memberCache.status().entries, 0);
});

test('a generation that fails mid-way still clears the slot in the RAM member cache', async () => {
    const arbiter = fakeArbiter({ pid: 7, loading: false, profile: 'fast' });
    arbiter.scheduler.pending = [];
    const order = [];
    const members = { syncBackend: () => {}, before: async () => null, afterReply: async () => {}, noteOther: () => {}, afterOther: async (slot) => order.push(`erase ${slot}`), status: () => ({}) };
    const fetchImpl = async () => { throw new Error('backend reset'); };
    const gateway = createGateway({ arbiter, config: { modelAlias: 'm', defaultProfile: 'fast' }, fetchImpl, memberCache: members });
    const { port } = await gateway.listen(0);
    try {
        const pending = fetch(`http://127.0.0.1:${port}/completion`, { method: 'POST', body: JSON.stringify({ prompt: 'side', n_predict: 4 }) });
        while (!arbiter.queued.length) await new Promise((resolve) => setTimeout(resolve, 5));
        arbiter.queued.shift()();
        assert.equal((await pending).status, 409);
        assert.deepEqual(order, ['erase 0']);
    } finally { await gateway.close(); }
});

test('after a cached chat reply the gateway runs the idle prefill through the text lane once nothing waits', async () => {
    const arbiter = fakeArbiter({ pid: 7, loading: false, profile: 'fast' });
    arbiter.scheduler.pending = [];
    const order = [];
    const members = { store: 'ram', idlePrefill: true, idleDelayMs: 10, syncBackend: () => {}, before: async (body, slot) => ({ key: 'k', slot }), afterReply: async () => order.push('after'),
        noteOther: () => {}, afterOther: async () => {}, runIdlePrefill: async ({ idle }) => { order.push(`idle ${idle()}`); return { prefilled: 1 }; }, status: () => ({}) };
    const fetchImpl = async () => new Response(JSON.stringify({ content: 'ok' }), { headers: { 'content-type': 'application/json' } });
    const gateway = createGateway({ arbiter, config: { modelAlias: 'm', defaultProfile: 'fast' }, fetchImpl, memberCache: members });
    const { port } = await gateway.listen(0);
    try {
        const pending = fetch(`http://127.0.0.1:${port}/completion`, { method: 'POST', body: JSON.stringify({ prompt: 'chat', n_predict: 4, stream: true }) });
        while (!arbiter.queued.length) await new Promise((resolve) => setTimeout(resolve, 5));
        arbiter.queued.shift()();
        assert.equal((await pending).status, 200);
        while (!arbiter.queued.length) await new Promise((resolve) => setTimeout(resolve, 5));
        arbiter.queued.shift()();
        while (order.length < 2) await new Promise((resolve) => setTimeout(resolve, 5));
        assert.deepEqual(order, ['after', 'idle true']);
    } finally { await gateway.close(); }
});


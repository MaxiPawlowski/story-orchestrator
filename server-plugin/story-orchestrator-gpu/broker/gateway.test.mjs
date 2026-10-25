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
        forRequest: async (body) => { if (refuse) throw refuse(body); },
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

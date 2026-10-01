import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginUrl = pathToFileURL(path.join(here, 'index.mjs')).href;
delete process.env.TYPESAFE_BASE_URL;
const plugin = await import(pluginUrl);

const fakeResponse = () => {
    const out = { statusCode: 200, body: undefined, contentType: null };
    const res = {
        status(code) { out.statusCode = code; return res; },
        type(value) { out.contentType = value; return res; },
        json(value) { out.body = value; return res; },
        set(name, value) { out.headers = { ...(out.headers ?? {}), [name.toLowerCase()]: String(value) }; return res; },
        send(value) { out.body = typeof value === 'string' ? JSON.parse(value) : value; return res; },
    };
    return { res, out };
};

const question = { state: { transcript: [{ speaker: 'Max', text: 'hello' }] }, questions: { greeting: { type: 'noul', instructions: 'Is `transcript` a greeting?' } } };

test('validateRequest mirrors the API limits', () => {
    assert.deepEqual(plugin.validateRequest(question), []);
    assert.deepEqual(plugin.validateRequest(null), ['body must be a JSON object']);
    assert.deepEqual(plugin.validateRequest({ state: {}, questions: {} }), ['questions must be a non-empty object']);
    assert.deepEqual(plugin.validateRequest({ state: {}, questions: {
        a: { type: 'choice', instructions: 'x', criteria: { only: null } },
        b: { type: 'score', instructions: 'x', criteria: ['one'] },
        c: { type: 'noul', instructions: 'x', criteria: { true: 'y', maybe: 'm' } },
        d: { type: 'wat', instructions: 'x' },
        e: { type: 'noul', instructions: ' ' },
    } }), ['a: choice needs 2-255 options (has 1)', 'b: score needs 2-10 levels (has 1)', 'c: noul criteria only takes true/false (got maybe)', 'd: unknown type', 'e: missing instructions']);
});

test('T25: the token guard mirrors the page: state + longest question over the documented limit minus 10% is refused, never truncated', () => {
    assert.equal(plugin.MAX_ESTIMATED_TOKENS, 29491);
    const over = { ...question, state: { text: 'a '.repeat(55_000) } };
    assert.ok(JSON.stringify(over).length < plugin.MAX_REQUEST_CHARS);
    assert.deepEqual(plugin.validateRequest(over), [`request is over 29491 estimated tokens (${plugin.estimateTokens(over)})`]);
    assert.deepEqual(plugin.validateRequest({ ...question, state: { text: 'x'.repeat(100_000) } }), []);
    const questions = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`fact:${index}`, { type: 'noul', instructions: `fact ${index} ${'detail '.repeat(120)}` }]));
    assert.deepEqual(plugin.validateRequest({ state: { text: 'x'.repeat(95_000) }, questions }), []);
});

test('info satisfies the ST loader contract', () => {
    assert.match(plugin.info.id, /^[a-z0-9_-]+$/);
    for (const field of ['id', 'name', 'description']) assert.equal(typeof plugin.info[field], 'string');
    assert.equal(typeof plugin.init, 'function');
    assert.equal(typeof plugin.default.init, 'function');
});

test('status reports the key source, never the key', async () => {
    process.env.TYPESAFE_API_KEY = 'sk-test-status';
    const { res, out } = fakeResponse();
    await plugin.createHandlers({ accountsEnabled: false, env: {}, now: () => 0 }).status({}, res);
    assert.deepEqual(out.body, {
        configured: true, keySource: 'env', model: plugin.DEFAULT_MODEL, pluginVersion: plugin.PLUGIN_VERSION,
        limits: { maxInFlight: plugin.MAX_IN_FLIGHT_PER_USER, perMinute: plugin.MAX_CALLS_PER_MINUTE_PER_USER },
        refusals: { since: '1970-01-01T00:00:00.000Z', local: 0, upstreamBusyAnswers: 0, upstreamRefused: 0, lastUpstream: null },
        providers: {
            typesafe: { configured: true, keySource: 'env', contract: 'native', local: false, host: 'api.typesafe.ai' },
            'llama-logprob': { configured: false, keySource: null, contract: 'logprob', local: false, host: null },
        },
    });
    assert.ok(!JSON.stringify(out.body).includes('sk-test-status'));
});

test('systemone forwards with the bearer key and the default model, and passes the upstream status through', async () => {
    process.env.TYPESAFE_API_KEY = 'sk-test-forward';
    const seen = [];
    const fetchImpl = async (url, init) => {
        seen.push({ url, init });
        return new Response(JSON.stringify({ model: 'jev-1.13.0', answers: { greeting: { type: 'noul', noul: 0.97 } } }), { status: 200 });
    };
    const { res, out } = fakeResponse();
    await plugin.createHandlers({ accountsEnabled: false, fetchImpl }).systemone({ body: question }, res);
    assert.equal(out.statusCode, 200);
    assert.equal(out.body.answers.greeting.noul, 0.97);
    assert.equal(seen.length, 1);
    assert.match(seen[0].url, /\/v1\/systemone$/);
    assert.equal(seen[0].init.headers.Authorization, 'Bearer sk-test-forward');
    assert.equal(JSON.parse(seen[0].init.body).model, plugin.DEFAULT_MODEL);
});

test('systemone rejects an invalid body before touching the network', async () => {
    let called = false;
    const { res, out } = fakeResponse();
    await plugin.createHandlers({ accountsEnabled: false, fetchImpl: async () => { called = true; } }).systemone({ body: { state: {}, questions: { q: { type: 'choice', instructions: 'x', criteria: { a: null } } } } }, res);
    assert.equal(out.statusCode, 400);
    assert.equal(called, false);
});

test('systemone retries once on 429/529 and reports a timeout as 504', async () => {
    process.env.TYPESAFE_API_KEY = 'sk-test-retry';
    let calls = 0;
    const flaky = async () => {
        calls += 1;
        return calls === 1 ? new Response('{"error":"busy"}', { status: 429 }) : new Response('{"model":"jev","answers":{}}', { status: 200 });
    };
    const first = fakeResponse();
    await plugin.createHandlers({ accountsEnabled: false, fetchImpl: flaky }).systemone({ body: question }, first.res);
    assert.equal(calls, 2);
    assert.equal(first.out.statusCode, 200);

    const hang = async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); };
    const second = fakeResponse();
    await plugin.createHandlers({ accountsEnabled: false, fetchImpl: hang }).systemone({ body: question }, second.res);
    assert.equal(second.out.statusCode, 504);
});

test('with no key anywhere, status says so and systemone answers 409', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'so-judge-nokey-'));
    const script = `
      const plugin = await import(${JSON.stringify(pluginUrl)});
      const out = [];
      const res = (sink) => { const r = { status(c) { sink.status = c; return r; }, type() { return r; }, json(v) { sink.body = v; return r; }, send(v) { sink.body = v; return r; } }; return r; };
      const a = {}; await plugin.createHandlers().status({}, res(a));
      const b = {}; await plugin.createHandlers({ accountsEnabled: false, fetchImpl: async () => { throw new Error('must not call'); } }).systemone({ body: ${JSON.stringify(question)} }, res(b));
      console.log(JSON.stringify({ a, b }));`;
    const env = { ...process.env, HOME: empty, USERPROFILE: empty, TYPESAFE_API_KEY: '' };
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env, encoding: 'utf-8' });
    assert.equal(child.status, 0, child.stderr);
    const { a, b } = JSON.parse(child.stdout.trim().split('\n').pop());
    assert.equal(a.body.configured, false);
    assert.equal(b.status, 409);
});

const pageRequest = (payload, { headers = {}, body = {}, handle = 'default-user', raw } = {}) => Object.assign(Readable.from([Buffer.from(raw ?? JSON.stringify(payload))]), {
    headers: { host: '127.0.0.1:8000', 'content-type': 'text/plain;charset=UTF-8', 'x-so-plugin': '1', 'sec-fetch-site': 'same-origin', origin: 'http://127.0.0.1:8000', ...headers },
    body,
    user: { profile: { handle } },
});
const countingFetch = () => {
    const calls = { total: 0, live: 0, peak: 0 };
    const fetchImpl = async () => {
        calls.total += 1;
        calls.live += 1;
        calls.peak = Math.max(calls.peak, calls.live);
        await new Promise((resolve) => setTimeout(resolve, 20));
        calls.live -= 1;
        return new Response('{"model":"jev-1.13.0","answers":{}}', { status: 200 });
    };
    return { calls, fetchImpl };
};

test('PS-J 1: the permitted model list is the page\'s own model-id map, and any other model is refused before the upstream', async () => {
    const policy = fs.readFileSync(path.join(here, '..', '..', 'src', 'judge', 'policy.ts'), 'utf8');
    const canonical = [...(/canonical: \{([^}]*)\}/.exec(policy)?.[1] ?? '').matchAll(/"([^"]+)":/g)].map((match) => match[1]);
    const floating = [...(/floating: \[([^\]]*)\]/.exec(policy)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual([...plugin.PERMITTED_MODELS].sort(), [...canonical, ...floating].sort());
    assert.ok(plugin.PERMITTED_MODELS.includes(plugin.DEFAULT_MODEL));
    process.env.TYPESAFE_API_KEY = 'sk-test-models';
    const { calls, fetchImpl } = countingFetch();
    const refused = fakeResponse();
    await plugin.createHandlers({ accountsEnabled: false, fetchImpl }).systemone({ body: { ...question, model: 'gpt-4o' } }, refused.res);
    assert.equal(refused.out.statusCode, 400);
    assert.match(refused.out.body.error, /model not permitted/);
    assert.equal(calls.total, 0);
    const floatingOk = fakeResponse();
    await plugin.createHandlers({ accountsEnabled: false, fetchImpl }).systemone({ body: { ...question, model: 'jev-latest' } }, floatingOk.res);
    assert.equal(floatingOk.out.statusCode, 200, 'control: a permitted model passes');
    assert.equal(calls.total, 1);
});

test('PS-J 2: a text/plain body over the bound is refused 413 without parsing it; a JSON-typed body is refused 415', async () => {
    process.env.TYPESAFE_API_KEY = 'sk-test-bound';
    const { calls, fetchImpl } = countingFetch();
    const handlers = plugin.createHandlers({ accountsEnabled: false, fetchImpl });
    const big = fakeResponse();
    await handlers.receive(pageRequest(null, { raw: `{"state":{"x":"${'a'.repeat(5 * 1024 * 1024)}"}}` }), big.res);
    assert.equal(big.out.statusCode, 413);
    const json = fakeResponse();
    await handlers.receive(pageRequest(question, { headers: { 'content-type': 'application/json' }, body: question }), json.res);
    assert.equal(json.out.statusCode, 415);
    const broken = fakeResponse();
    await handlers.receive(pageRequest(null, { raw: '{not json' }), broken.res);
    assert.equal(broken.out.statusCode, 400);
    assert.equal(calls.total, 0);
    const ok = fakeResponse();
    await handlers.receive(pageRequest(question), ok.res);
    assert.equal(ok.out.statusCode, 200, 'control: a normal page call passes');
    assert.equal(calls.total, 1);
});

test('PS-J 6: without the plugin header, from a foreign origin or a cross-site fetch, the call is refused 403 with no upstream call', async () => {
    process.env.TYPESAFE_API_KEY = 'sk-test-origin';
    const { calls, fetchImpl } = countingFetch();
    const handlers = plugin.createHandlers({ accountsEnabled: false, fetchImpl });
    for (const headers of [{ 'x-so-plugin': undefined }, { origin: 'https://evil.example' }, { 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' }]) {
        const out = fakeResponse();
        await handlers.receive(pageRequest(question, { headers }), out.res);
        assert.equal(out.out.statusCode, 403, JSON.stringify(headers));
    }
    assert.equal(calls.total, 0);
    const noFetchMetadata = fakeResponse();
    await handlers.receive(pageRequest(question, { headers: { 'sec-fetch-site': undefined, origin: undefined } }), noFetchMetadata.res);
    assert.equal(noFetchMetadata.out.statusCode, 200, 'control: a same-origin client that sends neither header still passes on the custom header');
});

test('PS-J 3: per user at most 2 in flight and 60 a minute; the excess answers 429 without an upstream call', async () => {
    process.env.TYPESAFE_API_KEY = 'sk-test-rate';
    const { calls, fetchImpl } = countingFetch();
    let clock = 0;
    const handlers = plugin.createHandlers({ accountsEnabled: false, fetchImpl, now: () => clock });
    const burst = await Promise.all(Array.from({ length: 20 }, async () => { const out = fakeResponse(); await handlers.receive(pageRequest(question), out.res); return out.out.statusCode; }));
    assert.equal(calls.peak, 2);
    assert.equal(burst.filter((code) => code === 200).length, 2);
    assert.equal(burst.filter((code) => code === 429).length, 18);
    const other = fakeResponse();
    await handlers.receive(pageRequest(question, { handle: 'bob' }), other.res);
    assert.equal(other.out.statusCode, 200, 'control: another user is not held by the first user\'s burst');
    for (let index = 0; index < 58; index += 1) {
        const out = fakeResponse();
        await handlers.receive(pageRequest(question), out.res);
        assert.equal(out.out.statusCode, 200);
    }
    const over = fakeResponse();
    await handlers.receive(pageRequest(question), over.res);
    assert.equal(over.out.statusCode, 429, 'the 61st call in a minute');
    clock += 60_001;
    const later = fakeResponse();
    await handlers.receive(pageRequest(question), later.res);
    assert.equal(later.out.statusCode, 200, 'the window slides');
});

test('T0: the per-minute limit and in-flight cap come from the env, so N lanes can share one TypeSafe account', async () => {
    assert.deepEqual(plugin.limitsFromEnv({}), { maxInFlight: plugin.MAX_IN_FLIGHT_PER_USER, perMinute: plugin.MAX_CALLS_PER_MINUTE_PER_USER });
    assert.deepEqual(plugin.limitsFromEnv({ SO_JUDGE_RATE_PER_MIN: '15', SO_JUDGE_MAX_IN_FLIGHT: '1' }), { maxInFlight: 1, perMinute: 15 });
    for (const bad of ['0', '-3', 'many', '2.5', '']) assert.equal(plugin.limitsFromEnv({ SO_JUDGE_RATE_PER_MIN: bad }).perMinute, plugin.MAX_CALLS_PER_MINUTE_PER_USER, bad);
    process.env.TYPESAFE_API_KEY = 'sk-test-env-rate';
    const { calls, fetchImpl } = countingFetch();
    let clock = 0;
    const env = { SO_JUDGE_RATE_PER_MIN: '3' };
    const handlers = plugin.createHandlers({ accountsEnabled: false, fetchImpl, now: () => clock, env });
    for (let index = 0; index < 3; index += 1) {
        const out = fakeResponse();
        await handlers.receive(pageRequest(question), out.res);
        assert.equal(out.out.statusCode, 200);
        clock += 1000;
    }
    const over = fakeResponse();
    await handlers.receive(pageRequest(question), over.res);
    assert.equal(over.out.statusCode, 429, 'the 4th call in a minute at SO_JUDGE_RATE_PER_MIN=3');
    assert.equal(over.out.headers?.['retry-after'], '57', 'seconds until the oldest call leaves the window');
    assert.equal(calls.total, 3);
    const status = fakeResponse();
    await handlers.status({}, status.res);
    assert.deepEqual(status.out.body.limits, { maxInFlight: plugin.MAX_IN_FLIGHT_PER_USER, perMinute: 3 });
});

test('T0: an upstream 429 passes its Retry-After to the page', async () => {
    process.env.TYPESAFE_API_KEY = 'sk-test-upstream-429';
    const fetchImpl = async () => new Response('{"error":"rate limited"}', { status: 429, headers: { 'Retry-After': '20' } });
    const { res, out } = fakeResponse();
    const logged = [];
    const handlers = plugin.createHandlers({ accountsEnabled: false, fetchImpl, now: () => 0, log: (line) => logged.push(line) });
    await handlers.receive(pageRequest(question), res);
    assert.equal(out.statusCode, 429);
    assert.equal(out.headers?.['retry-after'], '20');
    const status = fakeResponse();
    await handlers.status({}, status.res);
    assert.deepEqual(status.out.body.refusals, {
        since: '1970-01-01T00:00:00.000Z', local: 0, upstreamBusyAnswers: 2, upstreamRefused: 1,
        lastUpstream: { at: '1970-01-01T00:00:00.000Z', provider: 'typesafe', status: 429, retryAfter: '20' },
    });
    assert.deepEqual(logged, ['typesafe answered 429 after one retry (Retry-After 20); passed to the page']);
});

test('T1: /status tells our own limiter\'s 429s from TypeSafe\'s, and a 429 the retry absorbed is counted but not refused', async () => {
    process.env.TYPESAFE_API_KEY = 'sk-test-refusal-split';
    let upstreamCalls = 0;
    const fetchImpl = async () => {
        upstreamCalls += 1;
        return upstreamCalls === 1 ? new Response('{"error":"busy"}', { status: 429 }) : new Response('{"model":"jev","answers":{}}', { status: 200 });
    };
    const logged = [];
    const handlers = plugin.createHandlers({ accountsEnabled: false, fetchImpl, now: () => 0, env: { SO_JUDGE_RATE_PER_MIN: '1' }, log: (line) => logged.push(line) });
    const first = fakeResponse();
    await handlers.receive(pageRequest(question), first.res);
    assert.equal(first.out.statusCode, 200, 'the plugin retry absorbed the upstream 429');
    const second = fakeResponse();
    await handlers.receive(pageRequest(question), second.res);
    assert.equal(second.out.statusCode, 429, 'our own per-minute limiter');
    const status = fakeResponse();
    await handlers.status({}, status.res);
    assert.deepEqual({ local: status.out.body.refusals.local, upstreamBusyAnswers: status.out.body.refusals.upstreamBusyAnswers, upstreamRefused: status.out.body.refusals.upstreamRefused }, { local: 1, upstreamBusyAnswers: 1, upstreamRefused: 0 });
    assert.deepEqual(logged, [], 'only a 429 that reaches the page is logged');
});

test('seam golden: a page call routed to the typesafe provider reaches TypeSafe byte-identical to the pre-seam plugin', async () => {
    process.env.TYPESAFE_API_KEY = 'sk-test-golden';
    delete process.env.TYPESAFE_BASE_URL;
    const seen = [];
    const fetchImpl = async (url, init) => {
        seen.push({ url, method: init.method, headers: init.headers, body: init.body });
        return new Response('{"model":"jev-1.13.0","answers":{"greeting":{"type":"noul","noul":0.97}}}', { status: 200 });
    };
    const { res, out } = fakeResponse();
    await plugin.createHandlers({ accountsEnabled: false, fetchImpl }).receive(pageRequest(question), res);
    assert.equal(out.statusCode, 200);
    assert.deepEqual(seen, [{
        url: 'https://api.typesafe.ai/v1/systemone',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer sk-test-golden' },
        body: '{"state":{"transcript":[{"speaker":"Max","text":"hello"}]},"questions":{"greeting":{"type":"noul","instructions":"Is `transcript` a greeting?"}},"model":"jev-1.13.0"}',
    }]);
    assert.deepEqual(out.body, { model: 'jev-1.13.0', answers: { greeting: { type: 'noul', noul: 0.97 } } });
});

test('W12: with user accounts on, a user with no key of their own is refused; env and .env are never used for them', async () => {
    process.env.TYPESAFE_API_KEY = 'sk-admin-env';
    const { calls, fetchImpl } = countingFetch();
    const accounts = plugin.createHandlers({ fetchImpl, accountsEnabled: true, env: {} });
    const status = fakeResponse();
    await accounts.status({}, status.res);
    assert.equal(status.out.body.configured, false);
    assert.equal(status.out.body.providers.typesafe.keySource, null);
    const refused = fakeResponse();
    await accounts.receive(pageRequest(question, { handle: 'bob' }), refused.res);
    assert.equal(refused.out.statusCode, 409);
    assert.equal(calls.total, 0);
    assert.equal(await plugin.resolveKey({}, 'typesafe', { accountsEnabled: true }), null);
    assert.deepEqual(await plugin.resolveKey({}, 'typesafe', { accountsEnabled: false }), { key: 'sk-admin-env', source: 'env' }, 'control: single-user installs keep the env fallback');
});

test('provider table: each provider reads its own key, and an unknown provider has none', async () => {
    process.env.TYPESAFE_API_KEY = 'sk-typesafe';
    process.env.SO_JUDGE_LLAMA_KEY = 'llama-local-key';
    try {
        assert.deepEqual(Object.keys(plugin.PROVIDERS), ['typesafe', 'llama-logprob']);
        assert.equal((await plugin.resolveKey({}, 'llama-logprob', { accountsEnabled: false })).key, 'llama-local-key');
        assert.equal((await plugin.resolveKey({}, 'typesafe', { accountsEnabled: false })).key, 'sk-typesafe');
        assert.equal(await plugin.resolveKey({}, 'openai', { accountsEnabled: false }), null);
    } finally {
        delete process.env.SO_JUDGE_LLAMA_KEY;
    }
});

test('llama-logprob: the completion route forwards only the whitelisted fields to the configured llama-server, never to a page-chosen URL', async () => {
    const seen = [];
    const fetchImpl = async (url, init) => {
        seen.push({ url, headers: init.headers, body: JSON.parse(init.body) });
        return new Response('{"model":"artemis","completion_probabilities":[{"token":" Yes","logprob":-0.1,"top_logprobs":[{"token":" Yes","logprob":-0.1}]}]}', { status: 200 });
    };
    const handlers = plugin.createHandlers({ fetchImpl, accountsEnabled: false, env: { SO_JUDGE_LLAMA_URL: 'http://127.0.0.1:18080/' } });
    const body = { prompt: 'State: {}\nAnswer:', n_predict: 1, n_probs: 20, temperature: 0, cache_prompt: true, post_sampling_probs: false, url: 'http://evil.example', grammar: 'x' };
    const ok = fakeResponse();
    await handlers.receiveLlama(pageRequest(body), ok.res);
    assert.equal(ok.out.statusCode, 200);
    assert.equal(ok.out.body.model, 'artemis');
    assert.deepEqual(seen, [{
        url: 'http://127.0.0.1:18080/completion',
        headers: { 'Content-Type': 'application/json' },
        body: { prompt: 'State: {}\nAnswer:', n_predict: 1, n_probs: 20, temperature: 0, cache_prompt: true, post_sampling_probs: false, stream: false },
    }]);
    const status = fakeResponse();
    await handlers.status({}, status.res);
    assert.deepEqual(status.out.body.providers['llama-logprob'], { configured: true, keySource: null, contract: 'logprob', local: true, host: '127.0.0.1:18080' });
    const bad = fakeResponse();
    await handlers.receiveLlama(pageRequest({ ...body, n_predict: 400 }), bad.res);
    assert.equal(bad.out.statusCode, 400);
    const foreign = fakeResponse();
    await handlers.receiveLlama(pageRequest(body, { headers: { 'x-so-plugin': undefined } }), foreign.res);
    assert.equal(foreign.out.statusCode, 403);
    assert.equal(seen.length, 1);
});

test('llama-logprob: unconfigured answers 409 without a network call; a remote host is reported as leaving the machine', async () => {
    const { calls, fetchImpl } = countingFetch();
    const none = fakeResponse();
    await plugin.createHandlers({ accountsEnabled: false, fetchImpl, env: {} }).receiveLlama(pageRequest({ prompt: 'x', n_predict: 1, n_probs: 5, temperature: 0 }), none.res);
    assert.equal(none.out.statusCode, 409);
    assert.equal(calls.total, 0);
    assert.deepEqual(plugin.llamaEndpoint({ SO_JUDGE_LLAMA_URL: 'https://pod-8080.proxy.runpod.net' }), { base: 'https://pod-8080.proxy.runpod.net', host: 'pod-8080.proxy.runpod.net', local: false });
    assert.equal(plugin.llamaEndpoint({ SO_JUDGE_LLAMA_URL: 'file:///etc/passwd' }), null);
});

test('live: one real call through the handler (JUDGE_LIVE=1)', { skip: process.env.JUDGE_LIVE !== '1' }, async () => {
    delete process.env.TYPESAFE_API_KEY;
    const { res, out } = fakeResponse();
    await plugin.createHandlers({ accountsEnabled: false }).systemone({ body: question }, res);
    assert.equal(out.statusCode, 200, JSON.stringify(out.body));
    assert.equal(out.body.answers.greeting.type, 'noul');
    assert.ok(out.body.answers.greeting.noul > 0.5);
    assert.match(out.body.model, /^jev-/);
});

test('CR-J1: a request stream aborted mid-body answers 400 instead of rejecting the handler', async () => {
    const { calls, fetchImpl } = countingFetch();
    const handlers = plugin.createHandlers({ fetchImpl, accountsEnabled: false, env: { SO_JUDGE_LLAMA_URL: 'http://127.0.0.1:18080' } });
    for (const route of ['receive', 'receiveLlama']) {
        const stream = new Readable({ read() {} });
        stream.push(Buffer.from('{"state":{"x":'));
        setImmediate(() => stream.destroy(Object.assign(new Error('aborted'), { code: 'ECONNRESET' })));
        Object.assign(stream, { headers: { host: '127.0.0.1:8000', 'content-type': 'text/plain;charset=UTF-8', 'x-so-plugin': '1' }, body: {}, user: { profile: { handle: 'default-user' } } });
        const out = fakeResponse();
        await handlers[route](stream, out.res);
        assert.equal(out.out.statusCode, 400, route);
    }
    assert.equal(calls.total, 0);
});

test('CR-J1: a route whose handler rejects answers 500, and never writes over a sent response', async () => {
    const logged = [];
    const failed = fakeResponse();
    await plugin.guardRoute(async () => { throw new Error('boom'); }, (line) => logged.push(line))({}, failed.res);
    assert.equal(failed.out.statusCode, 500);
    const sent = fakeResponse();
    sent.res.headersSent = true;
    await plugin.guardRoute(() => { throw new Error('late'); }, (line) => logged.push(line))({}, sent.res);
    assert.equal(sent.out.statusCode, 200);
    assert.equal(logged.length, 2);
});

test('CR-J4: when SillyTavern\'s account setting cannot be read, the key rule fails closed and says so', async () => {
    const logged = [];
    assert.equal(await plugin.userAccountsEnabled({ load: async () => null, log: (line) => logged.push(line) }), true);
    assert.equal(await plugin.userAccountsEnabled({ load: async () => ({ getConfigValue: () => { throw new Error('yaml'); } }), log: (line) => logged.push(line) }), true);
    assert.equal(logged.length, 2);
    assert.match(logged[0], /treating user accounts as on/);
    assert.equal(await plugin.userAccountsEnabled({ load: async () => ({ getConfigValue: () => false }), log: (line) => logged.push(line) }), false, 'control: a readable "off" stays off');
    process.env.TYPESAFE_API_KEY = 'sk-env-must-not-leak';
    assert.equal(await plugin.resolveKey({}, 'typesafe'), null, 'in this checkout there is no ST util.js, so env is not used');
});

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
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
    assert.equal(plugin.MAX_ESTIMATED_TOKENS, 28800);
    const over = { ...question, state: { text: 'a '.repeat(55_000) } };
    assert.ok(JSON.stringify(over).length < plugin.MAX_REQUEST_CHARS);
    assert.deepEqual(plugin.validateRequest(over), [`request is over 28800 estimated tokens (${plugin.estimateTokens(over)})`]);
    assert.deepEqual(plugin.validateRequest({ ...question, state: { text: 'x'.repeat(100_000) } }), []);
    const questions = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`fact:${index}`, { type: 'noul', instructions: `fact ${index} ${'detail '.repeat(120)}` }]));
    assert.deepEqual(plugin.validateRequest({ state: { text: 'x'.repeat(95_000) }, questions }), []);
});

test('2026-10-02 limits: the whole request is held to 64,000 tokens minus 10%, refused 413 as too large before any upstream call', async () => {
    assert.equal(plugin.MAX_ESTIMATED_TOTAL_TOKENS, 57600);
    const questions = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`fact:${index}`, { type: 'noul', instructions: `fact ${index} ${'x'.repeat(4_000)}` }]));
    const wide = { state: { text: 'y'.repeat(60_000) }, questions };
    assert.ok(plugin.estimateTokens(wide) <= plugin.MAX_ESTIMATED_TOKENS, 'state + the longest question alone fits');
    assert.deepEqual(plugin.validateRequest(wide), [`request is over 57600 estimated tokens in total (${plugin.estimateTotalTokens(wide)})`]);
    assert.deepEqual(plugin.shapeIssues(wide), []);
    process.env.TYPESAFE_API_KEY = 'sk-test-too-large';
    let called = 0;
    const handlers = plugin.createHandlers({ accountsEnabled: false, fetchImpl: async () => { called += 1; return new Response('{}', { status: 200 }); } });
    const { res, out } = fakeResponse();
    await handlers.systemone({ body: wide }, res);
    assert.equal(out.statusCode, 413);
    assert.equal(out.body.tooLarge, true);
    assert.equal(called, 0);
    const fits = fakeResponse();
    await handlers.systemone({ body: { state: { text: 'y'.repeat(60_000) }, questions: Object.fromEntries(Object.entries(questions).slice(0, 20)) } }, fits.res);
    assert.equal(fits.out.statusCode, 200, 'control: half the questions fit');
    assert.equal(called, 1);
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
        limits: { maxInFlight: plugin.MAX_IN_FLIGHT_PER_USER, perMinute: 1200, accountPerMinute: 1200, tokensPerSecond: 250_000, accountTokensPerSecond: 250_000 },
        adaptive: { typesafe: { factor: 1, coolingMs: 0, busyAnswers: 0 }, 'llama-logprob': { factor: 1, coolingMs: 0, busyAnswers: 0 }, 'systemone-local': { factor: 1, coolingMs: 0, busyAnswers: 0 } },
        refusals: { since: '1970-01-01T00:00:00.000Z', local: 0, upstreamBusyAnswers: 0, upstreamRefused: 0, lastUpstream: null },
        served: { since: '1970-01-01T00:00:00.000Z', total: 0, byProvider: { typesafe: 0, 'llama-logprob': 0, 'systemone-local': 0 }, byUse: {}, cancelled: 0 },
        providers: {
            typesafe: { configured: true, keySource: 'env', contract: 'native', local: false, host: 'api.typesafe.ai' },
            'llama-logprob': { configured: false, keySource: null, contract: 'logprob', local: false, host: null },
            'systemone-local': {
                configured: false, keySource: null, contract: 'native', local: false, host: null, model: null, modelsDir: null, modelPath: null,
                problem: 'no-url', detail: plugin.LOCAL_PROBLEMS['no-url'],
            },
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

test('PS-J 3: per user at most 2 in flight and 60 a minute; a burst queues up to 16 behind the two, the excess answers 429 without an upstream call', async () => {
    process.env.TYPESAFE_API_KEY = 'sk-test-rate';
    const { calls, fetchImpl } = countingFetch();
    let clock = 0;
    const handlers = plugin.createHandlers({ accountsEnabled: false, fetchImpl, now: () => clock, env: { SO_JUDGE_RATE_PER_MIN: '60' } });
    const burst = await Promise.all(Array.from({ length: 20 }, async () => { const out = fakeResponse(); await handlers.receive(pageRequest(question), out.res); return out.out.statusCode; }));
    assert.equal(calls.peak, 2);
    assert.equal(burst.filter((code) => code === 200).length, 2 + plugin.MAX_QUEUED_PER_USER);
    assert.equal(burst.filter((code) => code === 429).length, 20 - 2 - plugin.MAX_QUEUED_PER_USER);
    const other = fakeResponse();
    await handlers.receive(pageRequest(question, { handle: 'bob' }), other.res);
    assert.equal(other.out.statusCode, 200, 'control: another user is not held by the first user\'s burst');
    for (let index = 0; index < 60 - 2 - plugin.MAX_QUEUED_PER_USER; index += 1) {
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
    assert.deepEqual(plugin.limitsFromEnv({}), { maxInFlight: plugin.MAX_IN_FLIGHT_PER_USER, perMinute: plugin.MAX_CALLS_PER_MINUTE_PER_USER, accountPerMinute: 1200, tokensPerSecond: 100_000, accountTokensPerSecond: 250_000 });
    assert.deepEqual(plugin.limitsFromEnv({ SO_JUDGE_RATE_PER_MIN: '15', SO_JUDGE_MAX_IN_FLIGHT: '1' }), { maxInFlight: 1, perMinute: 15, accountPerMinute: 1200, tokensPerSecond: 100_000, accountTokensPerSecond: 250_000 });
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
    assert.deepEqual(status.out.body.limits, { maxInFlight: plugin.MAX_IN_FLIGHT_PER_USER, perMinute: 3, accountPerMinute: 1200, tokensPerSecond: 250_000, accountTokensPerSecond: 250_000 });
});

test('T1-6: a call queued behind two in flight waits for a slot, and is refused only when none frees within the wait', async () => {
    let clock = 0;
    const acquire = plugin.createLimiter({ maxInFlight: 2, perMinute: 60, maxQueued: 4, queueWaitMs: 50, now: () => clock });
    const first = await acquire('u');
    const second = await acquire('u');
    const queued = acquire('u');
    first();
    const third = await queued;
    assert.equal(typeof third, 'function', 'a release hands the slot to the waiting call');
    const starved = await acquire('u');
    assert.equal(starved, null, 'nothing freed within the wait');
    second();
    third();
    assert.equal(typeof (await acquire('u')), 'function');
});

test('T1-6: a queued call woken into a full minute passes the slot on rather than holding the queue', async () => {
    let clock = 0;
    const acquire = plugin.createLimiter({ maxInFlight: 1, perMinute: 2, maxQueued: 4, queueWaitMs: 50, now: () => clock });
    const first = await acquire('u');
    const a = acquire('u');
    const b = acquire('u');
    first();
    const gotA = await a;
    assert.equal(typeof gotA, 'function');
    gotA();
    assert.equal(await b, null, 'the third call in a minute is refused by the window');
});

test('T0: an upstream 429 passes its Retry-After to the page, is not retried inside it, and holds every later call until it passes', async () => {
    process.env.TYPESAFE_API_KEY = 'sk-test-upstream-429';
    let upstreamCalls = 0;
    const fetchImpl = async () => {
        upstreamCalls += 1;
        return upstreamCalls === 1 ? new Response('{"error":"rate limited"}', { status: 429, headers: { 'Retry-After': '20' } }) : new Response('{"model":"jev","answers":{}}', { status: 200 });
    };
    const { res, out } = fakeResponse();
    const logged = [];
    let clock = 0;
    const handlers = plugin.createHandlers({ accountsEnabled: false, fetchImpl, now: () => clock, log: (line) => logged.push(line) });
    await handlers.receive(pageRequest(question), res);
    assert.equal(out.statusCode, 429);
    assert.equal(out.headers?.['retry-after'], '20');
    assert.equal(upstreamCalls, 1, 'a Retry-After past the retry delay is honoured, not retried at 600 ms');
    const status = fakeResponse();
    await handlers.status({}, status.res);
    assert.deepEqual(status.out.body.refusals, {
        since: '1970-01-01T00:00:00.000Z', local: 0, upstreamBusyAnswers: 1, upstreamRefused: 1,
        lastUpstream: { at: '1970-01-01T00:00:00.000Z', provider: 'typesafe', status: 429, retryAfter: '20' },
    });
    assert.deepEqual(status.out.body.adaptive.typesafe, { factor: 0.5, coolingMs: 20_000, busyAnswers: 1 });
    assert.deepEqual(status.out.body.adaptive['llama-logprob'], { factor: 1, coolingMs: 0, busyAnswers: 0 }, 'control: the other provider is not held');
    assert.deepEqual(logged, ['typesafe answered 429 and was not retried (Retry-After 20); passed to the page; rate held at 50% of the limit']);
    clock = 5_000;
    const held = fakeResponse();
    await handlers.receive(pageRequest(question, { handle: 'bob' }), held.res);
    assert.equal(held.out.statusCode, 429, 'the account is cooling, so every user is held');
    assert.equal(held.out.headers?.['retry-after'], '15');
    assert.equal(upstreamCalls, 1);
    clock = 20_001;
    const after = fakeResponse();
    await handlers.receive(pageRequest(question, { handle: 'bob' }), after.res);
    assert.equal(after.out.statusCode, 200, 'the cool-down ends at the Retry-After');
    assert.equal(upstreamCalls, 2);
});

test('2026-10-02 limits: the documented 1,200/min account is the ceiling across users, and each user\'s default share is 2 x 1,200 / 5 = 480/min', async () => {
    assert.equal(plugin.ACCOUNT_RATE_PER_MIN, 1200);
    assert.equal(plugin.ACCOUNT_TOKENS_PER_SECOND, 250_000);
    assert.equal(plugin.MAX_CALLS_PER_MINUTE_PER_USER, 480);
    assert.equal(plugin.MAX_TOKENS_PER_SECOND_PER_USER, 100_000);
    assert.equal(plugin.limitsFromEnv({ SO_JUDGE_ACCOUNT_RATE_PER_MIN: '600' }).perMinute, 240, 'the share follows the account override');
    assert.equal(plugin.limitsFromEnv({ SO_JUDGE_ACCOUNT_RATE_PER_MIN: '600', SO_JUDGE_RATE_PER_MIN: '50' }).perMinute, 50, 'the per-user override still wins');
    assert.equal(plugin.limitsFromEnv({ SO_JUDGE_ACCOUNT_TOKENS_PER_SEC: '50000' }).tokensPerSecond, 20_000);
    let clock = 0;
    const acquire = plugin.createLimiter({ maxInFlight: 1, now: () => clock });
    const granted = {};
    for (const user of ['a', 'b', 'c']) {
        granted[user] = 0;
        for (let index = 0; index < 500; index += 1) {
            const release = await acquire(user, 10);
            if (!release) continue;
            granted[user] += 1;
            release();
            clock += 1;
        }
    }
    assert.deepEqual(granted, { a: 480, b: 480, c: 240 }, 'per user 480, and the account stops the third user at 1,200');
    clock = 60_000;
    assert.equal(typeof (await acquire('c', 10)), 'function', 'the account window slides');
});

test('2026-10-02 limits: input tokens per second are a guard too, estimated from the request size, and a lone request over the budget still passes', async () => {
    let clock = 0;
    const slept = [];
    const sleep = async (ms) => { slept.push(ms); clock += ms; };
    const acquire = plugin.createLimiter({ tokensPerSecond: 1_000, accountTokensPerSecond: 1_500, maxInFlight: 8, queueWaitMs: 500, now: () => clock, sleep });
    assert.equal(typeof (await acquire('u', 600)), 'function');
    assert.equal(await acquire('u', 600), null, 'over the user\'s tokens in this second, and the window frees later than the wait allows');
    assert.equal(typeof (await acquire('v', 800)), 'function', 'another user has its own share');
    assert.equal(await acquire('w', 200), null, 'the account second is spent (600 + 800 + 200 > 1,500)');
    assert.deepEqual(slept, [], 'a wait past the budget is refused at once, never slept');
    clock = 1_000;
    assert.equal(typeof (await acquire('u', 5_000)), 'function', 'alone in its window, an oversized request is not starved');
    assert.equal(plugin.estimateInputTokens({ state: { text: 'x'.repeat(3_488) } }), Math.ceil(JSON.stringify({ state: { text: 'x'.repeat(3_488) } }).length / 3.488));
});

test('2026-10-02 limits: a 429 halves the rate (floor 10%), and the rate recovers linearly after a 30 s hold, so a limit TypeSafe changes is followed both ways', async () => {
    let clock = 0;
    const adaptive = plugin.createAdaptiveRate({ now: () => clock });
    assert.equal(adaptive.factor(), 1);
    adaptive.busy(null);
    assert.equal(adaptive.factor(), 0.5);
    assert.equal(adaptive.coolingMs(), 0, 'no Retry-After, no cool-down');
    adaptive.busy(null);
    assert.equal(adaptive.factor(), 0.25);
    for (let index = 0; index < 5; index += 1) adaptive.busy(null);
    assert.equal(adaptive.factor(), plugin.BACKOFF_FLOOR);
    clock = 30_000;
    assert.equal(adaptive.factor(), plugin.BACKOFF_FLOOR, 'held for 30 s');
    clock = 90_000;
    assert.equal(adaptive.factor(), 0.6);
    clock = 200_000;
    assert.equal(adaptive.factor(), 1, 'fully recovered');

    clock = 0;
    const limited = plugin.createAdaptiveRate({ now: () => clock });
    const acquire = plugin.createLimiter({ perMinute: 10, maxInFlight: 1, now: () => clock, adaptive: limited });
    const run = async () => {
        let granted = 0;
        for (let index = 0; index < 12; index += 1) {
            const release = await acquire('u');
            if (release) { granted += 1; release(); }
        }
        return granted;
    };
    limited.busy(null);
    assert.equal(await run(), 5, 'half of 10 a minute after a 429');
    clock = 61_000;
    assert.equal(await run(), 7, 'recovering: 0.5 + 31/120 of 10');
    clock = 300_000;
    assert.equal(await run(), 10, 'recovered');
});

test('2026-10-02 limits: Retry-After is read in seconds or as an HTTP date, capped at five minutes, and a short one is retried once inside the plugin', async () => {
    assert.equal(plugin.parseRetryAfter('20', 0), 20_000);
    assert.equal(plugin.parseRetryAfter(new Date(45_000).toUTCString(), 0), 45_000);
    assert.equal(plugin.parseRetryAfter('86400', 0), plugin.MAX_COOL_MS);
    for (const bad of [null, '', 'soon', '-3']) assert.equal(plugin.parseRetryAfter(bad, 0), null, String(bad));
    process.env.TYPESAFE_API_KEY = 'sk-test-short-retry';
    let upstreamCalls = 0;
    const fetchImpl = async () => {
        upstreamCalls += 1;
        return upstreamCalls === 1 ? new Response('{"error":"busy"}', { status: 429, headers: { 'Retry-After': '0' } }) : new Response('{"model":"jev","answers":{}}', { status: 200 });
    };
    const handlers = plugin.createHandlers({ accountsEnabled: false, fetchImpl, now: () => 0, log: () => undefined });
    const { res, out } = fakeResponse();
    await handlers.receive(pageRequest(question), res);
    assert.equal(out.statusCode, 200);
    assert.equal(upstreamCalls, 2);
    const status = fakeResponse();
    await handlers.status({}, status.res);
    assert.equal(status.out.body.adaptive.typesafe.factor, 0.5, 'a 429 the retry absorbed still lowers the rate');
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
        assert.deepEqual(Object.keys(plugin.PROVIDERS), ['typesafe', 'llama-logprob', 'systemone-local']);
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

test('T6-4: /status counts every call forwarded to a provider, per provider and per use, so a judge-off session can prove zero', async () => {
    process.env.TYPESAFE_API_KEY = 'sk-test-served';
    const fetchImpl = async () => new Response('{"model":"jev","answers":{}}', { status: 200 });
    const handlers = plugin.createHandlers({ accountsEnabled: false, fetchImpl, now: () => 0, log: () => undefined });
    const idle = fakeResponse();
    await handlers.status({}, idle.res);
    assert.deepEqual(idle.out.body.served, { since: '1970-01-01T00:00:00.000Z', total: 0, byProvider: { typesafe: 0, 'llama-logprob': 0, 'systemone-local': 0 }, byUse: {}, cancelled: 0 });
    for (const use of ['director', 'director', 'warden']) await handlers.receive(pageRequest(question, { headers: { 'x-so-judge-use': use } }), fakeResponse().res);
    await handlers.receive(pageRequest(question), fakeResponse().res);
    await handlers.receive(pageRequest(question, { headers: { 'x-so-judge-use': 'bad use!' } }), fakeResponse().res);
    const refused = fakeResponse();
    await handlers.receive(pageRequest({ state: {}, questions: {} }, { headers: { 'x-so-judge-use': 'director' } }), refused.res);
    assert.equal(refused.out.statusCode, 400);
    const status = fakeResponse();
    await handlers.status({}, status.res);
    assert.deepEqual(status.out.body.served, {
        since: '1970-01-01T00:00:00.000Z', total: 5, byProvider: { typesafe: 5, 'llama-logprob': 0, 'systemone-local': 0 }, byUse: { director: 2, warden: 1, unlabelled: 2 }, cancelled: 0,
    });
});

const closableResponse = () => {
    const { res, out } = fakeResponse();
    const emitter = new EventEmitter();
    const send = res.send;
    Object.assign(res, { writableFinished: false, on: emitter.on.bind(emitter), off: emitter.off.bind(emitter) });
    res.send = (value) => { res.writableFinished = true; return send(value); };
    return { res, out, close: () => emitter.emit('close') };
};

const slowFetch = (answerMs = 300) => {
    const calls = { started: 0, aborted: 0, answered: 0 };
    const fetchImpl = (url, init) => new Promise((resolve, reject) => {
        calls.started += 1;
        const timer = setTimeout(() => { calls.answered += 1; resolve(new Response('{"model":"jev-1.13.0","answers":{}}', { status: 200 })); }, answerMs);
        init.signal.addEventListener('abort', () => {
            clearTimeout(timer);
            calls.aborted += 1;
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        }, { once: true });
    });
    return { calls, fetchImpl };
};

const until = async (check, ms = 2000) => {
    const end = Date.now() + ms;
    while (!check()) {
        if (Date.now() > end) throw new Error('condition not met in time');
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
};

const sendFor = (handlers, use) => {
    const response = closableResponse();
    const done = handlers.receive(pageRequest(question, { headers: { 'x-so-judge-use': use } }), response.res);
    return { ...response, done };
};

test('F-B1c-2: a call the page gave up on releases its slot and cancels the upstream, so the next call is not queued behind a ghost', async () => {
    process.env.TYPESAFE_API_KEY = 'sk-test-ghost';
    const { calls, fetchImpl } = slowFetch(300);
    const handlers = plugin.createHandlers({ accountsEnabled: false, fetchImpl, env: {} });
    const scene = sendFor(handlers, 'scene');
    const warden = sendFor(handlers, 'warden');
    await until(() => calls.started === 2);
    scene.close();
    await scene.done;
    assert.equal(calls.aborted, 1, 'the upstream call of the closed request is cancelled');
    assert.equal(scene.out.body, undefined, 'nothing is written to a closed request');
    const lore = sendFor(handlers, 'wardenLore');
    await until(() => calls.started === 3, 100);
    await Promise.all([warden.done, lore.done]);
    assert.equal(warden.out.statusCode, 200);
    assert.equal(lore.out.statusCode, 200);
    const status = fakeResponse();
    await handlers.status({}, status.res);
    assert.equal(status.out.body.served.cancelled, 1);
    assert.equal(status.out.body.refusals.local, 0);
});

test('F-B1c-2 control: while both slots are taken by calls the page still waits for, a third call queues in the plugin', async () => {
    process.env.TYPESAFE_API_KEY = 'sk-test-ghost';
    const { calls, fetchImpl } = slowFetch(300);
    const handlers = plugin.createHandlers({ accountsEnabled: false, fetchImpl, env: {} });
    const scene = sendFor(handlers, 'scene');
    const warden = sendFor(handlers, 'warden');
    await until(() => calls.started === 2);
    const lore = sendFor(handlers, 'wardenLore');
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(calls.started, 2, 'the third call waits for a slot');
    await Promise.all([scene.done, warden.done, lore.done]);
    assert.equal(calls.started, 3);
    assert.equal(calls.aborted, 0);
    assert.equal(lore.out.statusCode, 200);
});

test('F-B1c-2: a call waiting in the plugin queue whose page closes leaves the queue without a slot and without counting a refusal', async () => {
    let refused = 0;
    const acquire = plugin.createLimiter({ maxInFlight: 1, perMinute: 60, maxQueued: 4, queueWaitMs: 1000, now: () => 0, onRefuse: () => { refused += 1; } });
    const first = await acquire('u');
    const controller = new AbortController();
    const gone = acquire('u', 0, controller.signal);
    const next = acquire('u');
    controller.abort();
    assert.equal(await gone, null);
    assert.equal(refused, 0);
    first();
    assert.equal(typeof (await next), 'function', 'the freed slot goes to the call still waiting');
    assert.equal(await acquire('u', 0, controller.signal), null, 'an already closed request never takes a slot');
});

test('F-B1c-2: a page that closes during the 600 ms busy retry gets no second upstream call', async () => {
    process.env.TYPESAFE_API_KEY = 'sk-test-ghost';
    let upstream = 0;
    const handlers = plugin.createHandlers({ accountsEnabled: false, env: {}, fetchImpl: async () => { upstream += 1; return new Response('{"error":"busy"}', { status: 429 }); }, log: () => undefined });
    const call = sendFor(handlers, 'warden');
    await until(() => upstream === 1);
    call.close();
    await call.done;
    assert.equal(upstream, 1);
    assert.equal(call.out.body, undefined);
});

test('F9: a burst over the per-user token second is paced inside the wait, not refused (C3 3090: every 429 was ours)', async () => {
    let clock = 0;
    const slept = [];
    const sleep = async (ms) => { slept.push(ms); clock += ms; };
    let refused = 0;
    const acquire = plugin.createLimiter({ maxInFlight: 8, now: () => clock, sleep, onRefuse: () => { refused += 1; } });
    const costs = [19_400, 19_400, 19_400, 19_400, 19_400, 18_000, 2_400, 1_700];
    const granted = await Promise.all(costs.map((cost) => acquire('default-user', cost)));
    assert.equal(granted.filter((release) => typeof release === 'function').length, costs.length);
    assert.equal(refused, 0);
    assert.ok(slept.length > 0 && Math.max(...slept) <= 1_000, `paced within one token window (${slept.join(', ')} ms)`);
});

test('F9 control: a wait past the queue budget is still refused with its Retry-After', async () => {
    let clock = 0;
    const sleep = async (ms) => { clock += ms; };
    let retryAfter = null;
    const acquire = plugin.createLimiter({ maxInFlight: 8, perMinute: 2, now: () => clock, sleep, onRefuse: (seconds) => { retryAfter = seconds; } });
    assert.equal(typeof (await acquire('u')), 'function');
    assert.equal(typeof (await acquire('u')), 'function');
    assert.equal(await acquire('u'), null, 'the minute window frees in 60 s, past the 2 s wait');
    assert.equal(retryAfter, 60);
});

test('F9: a page that closes while its call is paced frees the slot and is not refused', async () => {
    let clock = 0;
    let refused = 0;
    const controller = new AbortController();
    const sleep = async () => { controller.abort(); };
    const acquire = plugin.createLimiter({ maxInFlight: 1, tokensPerSecond: 1_000, now: () => clock, sleep, onRefuse: () => { refused += 1; } });
    const first = await acquire('u', 900);
    first();
    assert.equal(await acquire('u', 900, controller.signal), null);
    assert.equal(refused, 0);
    clock = 1_000;
    assert.equal(typeof (await acquire('u', 900)), 'function', 'the slot was handed back');
});

test('F9: with SillyTavern user accounts off there is one user, so the per-user share is the whole account', async () => {
    assert.deepEqual(plugin.limitsFromEnv({}, { users: 1 }), { maxInFlight: plugin.MAX_IN_FLIGHT_PER_USER, perMinute: 1200, accountPerMinute: 1200, tokensPerSecond: 250_000, accountTokensPerSecond: 250_000 });
    assert.equal(plugin.limitsFromEnv({ SO_JUDGE_ACCOUNT_TOKENS_PER_SEC: '83333' }, { users: 1 }).tokensPerSecond, 83_333, 'a lane keeps its share of the account');
    assert.equal(plugin.limitsFromEnv({}).tokensPerSecond, 100_000, 'control: the default still assumes five users');
    const single = fakeResponse();
    await plugin.createHandlers({ accountsEnabled: false, env: {} }).status({}, single.res);
    assert.equal(single.out.body.limits.tokensPerSecond, 250_000);
    const shared = fakeResponse();
    await plugin.createHandlers({ accountsEnabled: true, env: {} }).status({}, shared.res);
    assert.equal(shared.out.body.limits.tokensPerSecond, 100_000);
});

test('F9: four lore-sized requests in one second through the handler all reach TypeSafe, the fourth paced', async () => {
    process.env.TYPESAFE_API_KEY = 'sk-test-pace';
    const { calls, fetchImpl } = countingFetch();
    const handlers = plugin.createHandlers({ accountsEnabled: false, fetchImpl, env: { SO_JUDGE_ACCOUNT_TOKENS_PER_SEC: '60000', SO_JUDGE_MAX_IN_FLIGHT: '8' } });
    const lore = (index) => ({ state: { transcript: [{ speaker: 'Max', text: 'hello' }] }, questions: { [`e:${index}`]: { type: 'noul', instructions: `Entry ${index}: ${'x'.repeat(68_000)}` } } });
    const codes = await Promise.all([0, 1, 2, 3].map(async (index) => { const out = fakeResponse(); await handlers.receive(pageRequest(lore(index)), out.res); return out.out.statusCode; }));
    assert.deepEqual(codes, [200, 200, 200, 200]);
    assert.equal(calls.total, 4);
});

const LOCAL_ENV = { SO_JUDGE_LOCAL_URL: 'http://127.0.0.1:8095/', SO_JUDGE_MODELS_DIR: 'C:\\dev\\models\\so-judge' };
const localFetch = ({ health = { ok: true, model: 'decider-4b-v2.1-Q4_K_M', modelPath: 'C:\\dev\\models\\so-judge\\models\\decider-4b-v2.1-Q4_K_M.gguf' }, answer = { model: 'decider-4b-v2.1-Q4_K_M', answers: { greeting: { type: 'noul', noul: 0.93 } }, usage: { input_tokens: 40, output_tokens: 0 } } } = {}) => {
    const seen = [];
    const fetchImpl = async (url, init = {}) => {
        seen.push({ url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined });
        if (url.endsWith('/health')) return new Response(JSON.stringify(health), { status: 200 });
        return new Response(JSON.stringify(answer), { status: 200 });
    };
    return { seen, fetchImpl };
};

test('v2.8 14: the local judge URL comes only from the server env and must be loopback; the models folder is reported as set', () => {
    assert.equal(plugin.localSetup({}).problem, 'no-url');
    assert.equal(plugin.localSetup({ SO_JUDGE_LOCAL_URL: 'file:///etc/passwd' }).problem, 'bad-url');
    assert.equal(plugin.localSetup({ ...LOCAL_ENV, SO_JUDGE_LOCAL_URL: 'http://192.168.50.130:8095' }).problem, 'not-loopback');
    assert.deepEqual(plugin.localSetup({ SO_JUDGE_LOCAL_URL: 'http://127.0.0.1:8095' }), { modelsDir: null, label: null, endpoint: { base: 'http://127.0.0.1:8095', host: '127.0.0.1:8095', local: true }, problem: null });
    assert.equal(plugin.localSetup({ SO_JUDGE_LOCAL_URL: 'http://localhost:8095' }).problem, null);
    assert.deepEqual(plugin.localSetup(LOCAL_ENV), {
        modelsDir: 'C:\\dev\\models\\so-judge', label: null, endpoint: { base: 'http://127.0.0.1:8095', host: '127.0.0.1:8095', local: true }, problem: null,
    });
});

test('v2.8 14: the local route forwards state + questions to the env URL only, drops a page-chosen model and URL, and stamps the served model', async () => {
    const { seen, fetchImpl } = localFetch();
    const handlers = plugin.createHandlers({ fetchImpl, accountsEnabled: false, env: LOCAL_ENV, now: () => 0 });
    const ok = fakeResponse();
    await handlers.receiveLocal(pageRequest({ ...question, model: 'jev-1.13.0', url: 'http://evil.example' }), ok.res);
    assert.equal(ok.out.statusCode, 200, JSON.stringify(ok.out.body));
    assert.equal(ok.out.body.model, 'decider-4b-v2.1-Q4_K_M');
    assert.deepEqual(ok.out.body.answers, { greeting: { type: 'noul', noul: 0.93 } });
    assert.deepEqual(seen.map((call) => call.url), ['http://127.0.0.1:8095/health', 'http://127.0.0.1:8095/v1/systemone']);
    assert.deepEqual(seen[1].body, { state: question.state, questions: question.questions });
    assert.deepEqual(seen[1].headers, { 'Content-Type': 'application/json' });
    const status = fakeResponse();
    await handlers.status({}, status.res);
    assert.deepEqual(status.out.body.providers['systemone-local'], {
        configured: true, keySource: null, contract: 'native', local: true, host: '127.0.0.1:8095', model: 'decider-4b-v2.1-Q4_K_M',
        modelsDir: 'C:\\dev\\models\\so-judge', modelPath: 'C:\\dev\\models\\so-judge\\models\\decider-4b-v2.1-Q4_K_M.gguf', problem: null,
    });
    assert.equal(status.out.body.served.byProvider['systemone-local'], 1);
    assert.equal(status.out.body.served.byProvider.typesafe, 0, 'control: nothing reached TypeSafe');
});

test('v2.8 14: an answer without a model takes the env label, and a reply that is not a System One answer is refused', async () => {
    const unlabelled = localFetch({ health: { ok: true }, answer: { answers: { greeting: { type: 'noul', noul: 0.4 } } } });
    const labelled = fakeResponse();
    await plugin.createHandlers({ fetchImpl: unlabelled.fetchImpl, accountsEnabled: false, env: { ...LOCAL_ENV, SO_JUDGE_LOCAL_MODEL: 'decider-4b-v2.1-Q4_K_M' } }).receiveLocal(pageRequest(question), labelled.res);
    assert.equal(labelled.out.body.model, 'decider-4b-v2.1-Q4_K_M');
    const nothing = fakeResponse();
    await plugin.createHandlers({ fetchImpl: unlabelled.fetchImpl, accountsEnabled: false, env: LOCAL_ENV }).receiveLocal(pageRequest(question), nothing.res);
    assert.equal(nothing.out.body.model, 'systemone-local:unknown', 'an unnamed model never matches a calibration row');
    const garbage = localFetch({ answer: { text: 'Yes.' } });
    const refused = fakeResponse();
    await plugin.createHandlers({ fetchImpl: garbage.fetchImpl, accountsEnabled: false, env: LOCAL_ENV }).receiveLocal(pageRequest(question), refused.res);
    assert.equal(refused.out.statusCode, 502);
});

test('v2.8 14: a remote URL is refused before any call, and a server that does not answer its health check is unreachable', async () => {
    const remote = localFetch();
    const far = fakeResponse();
    await plugin.createHandlers({ fetchImpl: remote.fetchImpl, accountsEnabled: false, env: { ...LOCAL_ENV, SO_JUDGE_LOCAL_URL: 'https://judge.example.com' } }).receiveLocal(pageRequest(question), far.res);
    assert.equal(far.out.statusCode, 409);
    assert.equal(far.out.body.problem, 'not-loopback');
    assert.equal(remote.seen.length, 0);
    const down = fakeResponse();
    await plugin.createHandlers({ fetchImpl: async () => { throw new TypeError('fetch failed'); }, accountsEnabled: false, env: LOCAL_ENV }).receiveLocal(pageRequest(question), down.res);
    assert.equal(down.out.statusCode, 409);
    assert.equal(down.out.body.problem, 'unreachable');
});

test('v2.8 14: the local judge is asked one call at a time by default (SO_JUDGE_LOCAL_MAX_IN_FLIGHT), and the shape and size guards still hold', async () => {
    let live = 0;
    let peak = 0;
    const fetchImpl = async (url) => {
        if (url.endsWith('/health')) return new Response(JSON.stringify({ ok: true, model: 'm', modelPath: 'C:\\dev\\models\\m.gguf' }), { status: 200 });
        live += 1;
        peak = Math.max(peak, live);
        await new Promise((resolve) => setTimeout(resolve, 20));
        live -= 1;
        return new Response('{"model":"m","answers":{}}', { status: 200 });
    };
    const handlers = plugin.createHandlers({ fetchImpl, accountsEnabled: false, env: LOCAL_ENV });
    const answers = await Promise.all([1, 2, 3].map(async () => { const out = fakeResponse(); await handlers.receiveLocal(pageRequest(question), out.res); return out.out.statusCode; }));
    assert.deepEqual(answers, [200, 200, 200]);
    assert.equal(peak, 1);
    const two = plugin.createHandlers({ fetchImpl, accountsEnabled: false, env: { ...LOCAL_ENV, SO_JUDGE_LOCAL_MAX_IN_FLIGHT: '2' } });
    peak = 0;
    await Promise.all([1, 2].map(async () => two.receiveLocal(pageRequest(question), fakeResponse().res)));
    assert.equal(peak, 2, 'control: the env raises it');
    const bad = fakeResponse();
    await handlers.receiveLocal(pageRequest({ state: {}, questions: {} }), bad.res);
    assert.equal(bad.out.statusCode, 400);
    const big = fakeResponse();
    await handlers.receiveLocal(pageRequest({ ...question, state: { text: 'a '.repeat(55_000) } }), big.res);
    assert.equal(big.out.statusCode, 413);
    assert.equal(big.out.body.tooLarge, true);
    const foreign = fakeResponse();
    await handlers.receiveLocal(pageRequest(question, { headers: { 'x-so-plugin': undefined } }), foreign.res);
    assert.equal(foreign.out.statusCode, 403);
});

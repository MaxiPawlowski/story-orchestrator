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
const plugin = await import(pluginUrl);

const fakeResponse = () => {
    const out = { statusCode: 200, body: undefined, contentType: null };
    const res = {
        status(code) { out.statusCode = code; return res; },
        type(value) { out.contentType = value; return res; },
        json(value) { out.body = value; return res; },
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
    await plugin.createHandlers().status({}, res);
    assert.deepEqual(out.body, { configured: true, keySource: 'env', model: plugin.DEFAULT_MODEL, pluginVersion: plugin.PLUGIN_VERSION });
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
    await plugin.createHandlers({ fetchImpl }).systemone({ body: question }, res);
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
    await plugin.createHandlers({ fetchImpl: async () => { called = true; } }).systemone({ body: { state: {}, questions: { q: { type: 'choice', instructions: 'x', criteria: { a: null } } } } }, res);
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
    await plugin.createHandlers({ fetchImpl: flaky }).systemone({ body: question }, first.res);
    assert.equal(calls, 2);
    assert.equal(first.out.statusCode, 200);

    const hang = async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); };
    const second = fakeResponse();
    await plugin.createHandlers({ fetchImpl: hang }).systemone({ body: question }, second.res);
    assert.equal(second.out.statusCode, 504);
});

test('with no key anywhere, status says so and systemone answers 409', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'so-judge-nokey-'));
    const script = `
      const plugin = await import(${JSON.stringify(pluginUrl)});
      const out = [];
      const res = (sink) => { const r = { status(c) { sink.status = c; return r; }, type() { return r; }, json(v) { sink.body = v; return r; }, send(v) { sink.body = v; return r; } }; return r; };
      const a = {}; await plugin.createHandlers().status({}, res(a));
      const b = {}; await plugin.createHandlers({ fetchImpl: async () => { throw new Error('must not call'); } }).systemone({ body: ${JSON.stringify(question)} }, res(b));
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
    await plugin.createHandlers({ fetchImpl }).systemone({ body: { ...question, model: 'gpt-4o' } }, refused.res);
    assert.equal(refused.out.statusCode, 400);
    assert.match(refused.out.body.error, /model not permitted/);
    assert.equal(calls.total, 0);
    const floatingOk = fakeResponse();
    await plugin.createHandlers({ fetchImpl }).systemone({ body: { ...question, model: 'jev-latest' } }, floatingOk.res);
    assert.equal(floatingOk.out.statusCode, 200, 'control: a permitted model passes');
    assert.equal(calls.total, 1);
});

test('PS-J 2: a text/plain body over the bound is refused 413 without parsing it; a JSON-typed body is refused 415', async () => {
    process.env.TYPESAFE_API_KEY = 'sk-test-bound';
    const { calls, fetchImpl } = countingFetch();
    const handlers = plugin.createHandlers({ fetchImpl });
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
    const handlers = plugin.createHandlers({ fetchImpl });
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
    const handlers = plugin.createHandlers({ fetchImpl, now: () => clock });
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

test('live: one real call through the handler (JUDGE_LIVE=1)', { skip: process.env.JUDGE_LIVE !== '1' }, async () => {
    delete process.env.TYPESAFE_API_KEY;
    const { res, out } = fakeResponse();
    await plugin.createHandlers().systemone({ body: question }, res);
    assert.equal(out.statusCode, 200, JSON.stringify(out.body));
    assert.equal(out.body.answers.greeting.type, 'noul');
    assert.ok(out.body.answers.greeting.noul > 0.5);
    assert.match(out.body.model, /^jev-/);
});

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createFakeOpencode, FAKE_MODELS } from './fixtures/fake-opencode-server.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const plugin = await import(pathToFileURL(path.join(here, 'index.mjs')).href);
const transport = await import(pathToFileURL(path.join(here, 'opencodeTransport.mjs')).href);

const NOW = Date.parse('2026-09-30T12:00:00Z');
const MODEL = 'openai/gpt-6.1-sol';
const png = (extra = 32) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(extra)]).toString('base64');
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]).toString('base64');
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(16)]).toString('base64');

const until = async (check, ms = 10000) => {
    const started = Date.now();
    while (Date.now() - started < ms) {
        if (await check()) return true;
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return false;
};

function setup({ fake: fakeOptions = {}, transportOptions = {}, loadLibs, concurrency, queueLimit, extraEnv = {}, fsImpl, models } = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'so-opencode-test-'));
    const bin = path.join(root, 'opencode.exe');
    fs.writeFileSync(bin, '');
    const config = plugin.sanitizeConfig({ tmpRoot: path.join(root, 'tmp'), harnesses: { opencode: { binary: bin, offer: true, ...(concurrency ? { concurrency } : {}), ...(queueLimit ? { queueLimit } : {}), ...(models ? { models } : {}) } } });
    const fake = createFakeOpencode(fakeOptions);
    const lines = [];
    const versions = [];
    const spawnImpl = (file) => {
        versions.push(file);
        const child = new EventEmitter();
        child.pid = 1;
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.stdin = { on() {}, end() { setImmediate(() => { child.stdout.emit('data', Buffer.from('2.0.6')); child.emit('close', 0); }); } };
        return child;
    };
    const service = plugin.createHarnessService({
        config,
        env: { PATH: '', OPENAI_API_KEY: 'sk-canary', ...extraEnv },
        home: root,
        spawnImpl,
        now: () => NOW,
        ...(fsImpl ? { fsImpl } : {}),
        log: (line) => lines.push(line),
        opencode: { loadLibs: loadLibs ?? (async () => fake.libs), configWaitMs: 150, ...transportOptions },
    });
    return { root, bin, config, service, fake, lines, versions, text: path.join(config.tmpRoot, 'opencode-loc'), calls: () => (fs.existsSync(path.join(config.tmpRoot, 'calls')) ? fs.readdirSync(path.join(config.tmpRoot, 'calls')) : []) };
}

const script = (steps) => `Reply now.\nFAKE:${JSON.stringify(steps)}`;
const request = (overrides = {}) => ({
    requestId: 'r1', harness: 'opencode', model: MODEL, role: 'read', system: 'You are a reader.', prompt: 'Reply with exactly: PONG', timeoutMs: 30_000, maxOutputChars: 4000, effort: null, ...overrides,
});
const clean = (ctx) => until(() => ctx.fake.state.sessions.size === 0 && ctx.fake.state.running === 0);

test('OpenCode 2.0.6 connection metadata uses the CLI method listing without accessing credential values', async () => {
    const fake = createFakeOpencode();
    const make = fake.libs.OpenCode.make;
    fake.libs.OpenCode.make = () => {
        const client = make();
        const get = client.integration.get;
        client.integration.get = async (input) => {
            const response = await get(input);
            response.data.connections = response.data.connections.map(({ method, ...entry }) => entry);
            return response;
        };
        return client;
    };
    let method = 'oauth';
    const ctx = setup({ loadLibs: async () => fake.libs, transportOptions: {
        authMethods: async () => new Map(method ? [['openai', method]] : []),
    } });
    const t = transport.createOpencodeTransport({ config: ctx.config, loadLibs: async () => fake.libs,
        authMethods: async () => new Map(method ? [['openai', method]] : []) });
    try {
        assert.equal((await t.inspect({ force: true })).logins.openai.state, 'ok');
        method = 'key';
        assert.equal((await t.inspect({ force: true })).logins.openai.state, 'unpaired');
        method = null;
        const unknown = await t.inspect({ force: true });
        assert.equal(unknown.problem, null);
        assert.deepEqual([unknown.logins.openai.state, unknown.logins.openai.evidence], ['ok', 'service-connection']);
        fake.state.providers = [];
        const unlisted = await t.inspect({ force: true });
        assert.equal(unlisted.logins.openai.state, 'unavailable');
        assert.match(unlisted.logins.openai.message, /does not list the provider/);
        assert.equal(fake.state.created.length, 0, 'metadata inspection sends no prompt');
    } finally {
        fake.close();
        fs.rmSync(ctx.root, plugin.RM_RETRY);
    }
});

test('N12: OpenCode 2.0.6 method-less connection with an empty CLI listing reads as signed in from service presence, without a prompt', async () => {
    const emptyListing = async () => transport.methodsFromAuthList('No authenticated integrations');
    const cases = [
        [{ login: 'methodless' }, 'ok', true, null],
        [{ login: 'cold' }, 'ok', true, null],
        [{ login: 'methodless', providers: [] }, 'unavailable', false, /does not list the provider/],
        [{ login: 'none' }, 'unpaired', false, /no OpenAI subscription sign-in/],
        [{ login: 'unknown-integration' }, 'unpaired', false, /no openai integration/],
        [{ login: 'expired' }, 'expired', false, /subscription sign-in has expired/],
        [{ login: 'methodless-expired' }, 'expired', false, /subscription sign-in has expired.*refresh token was rejected/s],
    ];
    for (const [fake, loginState, loggedIn, pattern] of cases) {
        const ctx = setup({ fake, transportOptions: { authMethods: emptyListing } });
        try {
            const row = (await ctx.service.status({ refresh: true })).harnesses.opencode;
            assert.deepEqual([row.loginState, row.loggedIn], [loginState, loggedIn], JSON.stringify(fake));
            if (pattern) assert.match(row.loginProblem, pattern, JSON.stringify(fake));
            else assert.equal(row.loginProblem, null);
            if (loginState === 'expired') assert.equal(row.loginAction, 'sign-in-again');
            if (loginState !== 'ok') {
                const answer = await ctx.service.complete(request());
                assert.deepEqual([answer.ok, answer.kind, answer.loginState], [false, 'auth', loginState], JSON.stringify(fake));
            }
            assert.equal(ctx.fake.state.created.length, 0, 'status sends no prompt');
        } finally {
            ctx.fake.close();
            fs.rmSync(ctx.root, plugin.RM_RETRY);
        }
    }
    const signedIn = setup({ fake: { login: 'methodless' }, transportOptions: { authMethods: emptyListing } });
    try {
        const answer = await signedIn.service.complete(request({ prompt: script([{ say: 'PONG' }]) }));
        assert.deepEqual([answer.ok, answer.text], [true, 'PONG']);
    } finally {
        signedIn.fake.close();
        fs.rmSync(signedIn.root, plugin.RM_RETRY);
    }
});

test('the supported CLI sign-in listing identifies OAuth and API-key methods without guessing labels', () => {
    const methods = transport.methodsFromAuthList('\u001b[32mOpenAI\u001b[0m            OAuth              stored\nDeepSeek          API key            stored\nAnthropic         Anthropic          stored\nunknown           OAuth              missing');
    assert.deepEqual([...methods], [['openai', 'oauth'], ['deepseek', 'key']]);
});

test('model aliases keep distinct public IDs even when their vendor model IDs match', async () => {
    const fake = createFakeOpencode({ models: [
        { id: 'gpt-6.1-sol', modelID: 'gpt-6.1-sol', providerID: 'openai', enabled: true, variants: [] },
        { id: 'gpt-6.1-sol-fast', modelID: 'gpt-6.1-sol', providerID: 'openai', enabled: false, variants: [] },
    ] });
    const ctx = setup({ loadLibs: async () => fake.libs });
    const t = transport.createOpencodeTransport({ config: ctx.config, loadLibs: async () => fake.libs });
    try {
        const view = await t.inspect({ force: true });
        assert.equal(view.models.get(MODEL).available, true);
        assert.equal(view.models.get(`${MODEL}-fast`).available, false);
        assert.equal(view.models.size, 2);
    } finally {
        fake.close();
        fs.rmSync(ctx.root, plugin.RM_RETRY);
    }
});

test('B5: the answer names the model OpenCode served, with the asked-for model kept as requested', async () => {
    const ctx = setup();
    ctx.fake.state.servedModel = { providerID: 'openai', id: 'gpt-6-luna' };
    const answer = await ctx.service.complete(request());
    assert.equal(answer.ok, true, JSON.stringify(answer));
    assert.deepEqual([answer.model, answer.requested], ['openai/gpt-6-luna', MODEL]);
});

test('a text call is one OpenCode session in an owned project directory, with every tool denied, and nothing is left behind', async () => {
    const ctx = setup();
    const { service, fake } = ctx;
    const answer = await service.complete(request());
    assert.equal(answer.ok, true, JSON.stringify(answer));
    assert.deepEqual([answer.text, answer.finish, answer.model], ['PONG', 'stop', MODEL]);
    assert.deepEqual(answer.usage, { input: 100, output: 10, costUsd: 0.01 });
    assert.equal(typeof answer.spawnMs, 'number');
    assert.equal(answer.effortApplied, false);
    const [created] = fake.state.created;
    assert.equal(created.agent, transport.TEXT_AGENT);
    assert.deepEqual(created.model, { providerID: 'openai', id: 'gpt-6.1-sol' });
    assert.deepEqual(created.permissions, [{ action: '*', resource: '*', effect: 'deny' }]);
    assert.deepEqual(created.metadata, { owner: transport.SESSION_OWNER, pid: process.pid, label: 'default-user/read' });
    assert.match(created.title, /^so-harness /);
    assert.ok(created.location.directory.startsWith(ctx.text), 'the project config lives in the plugin\'s own directory');
    assert.equal(created.configAtCreate.agents[transport.TEXT_AGENT].system, 'You are a reader.');
    assert.equal(created.configAtCreate.mcp, undefined, 'a text call carries no tool server');
    assert.deepEqual(fake.state.prompts.map((prompt) => prompt.text), ['Reply with exactly: PONG']);
    assert.ok(await clean(ctx));
    assert.deepEqual(fake.state.removed.map((row) => row.running), [false]);
    assert.deepEqual(ctx.calls(), []);
    const again = await service.complete(request({ requestId: 'r2' }));
    assert.equal(again.ok, true);
    assert.equal(fake.state.created[1].location.directory, created.location.directory, 'the same system text reuses its directory');
    await service.complete(request({ requestId: 'r3', system: 'Another system.' }));
    assert.notEqual(fake.state.created[2].location.directory, created.location.directory);
});

test('rule 11: the log line carries harness, model, ms, usage and kind only', async () => {
    const { service, lines } = setup();
    await service.complete(request({ prompt: 'PROMPTCANARY ' + script([{ say: 'REPLYCANARY' }]) }));
    assert.equal(lines.length, 1);
    assert.deepEqual(Object.keys(JSON.parse(lines[0])), ['harness', 'model', 'ms', 'usage', 'kind']);
    assert.ok(!lines[0].includes('CANARY'));
});

test('effort becomes the model variant only when the model lists it', async () => {
    const ctx = setup();
    const high = await ctx.service.complete(request({ effort: 'high' }));
    assert.equal(high.effortApplied, true);
    assert.deepEqual(ctx.fake.state.created[0].model, { providerID: 'openai', id: 'gpt-6.1-sol', variant: 'high' });
    const luna = await ctx.service.complete(request({ requestId: 'r2', model: 'openai/gpt-6-luna', effort: 'high' }));
    assert.equal(luna.effortApplied, false);
    assert.deepEqual(ctx.fake.state.created[1].model, { providerID: 'openai', id: 'gpt-6-luna' });
    const odd = await ctx.service.complete(request({ requestId: 'r3', effort: null }));
    assert.equal(odd.effortApplied, false);
});

test('the effective permissions are checked before any prompt: a project config OpenCode ignored, or one that left a tool on, sends nothing', async () => {
    const ignored = setup({ fake: { ignoreProjectConfig: true } });
    const missing = await ignored.service.complete(request());
    assert.deepEqual([missing.ok, missing.kind], [false, 'config']);
    assert.match(missing.message, /did not load the plugin's owned project config/);
    const open = setup({ fake: { dropPermissions: true } });
    const refused = await open.service.complete(request());
    assert.deepEqual([refused.ok, refused.kind], [false, 'refused']);
    for (const ctx of [ignored, open]) {
        assert.equal(ctx.fake.state.prompts.length, 0);
        assert.equal(ctx.fake.state.created.length, 0);
        assert.equal(ctx.service.gate.counts('opencode').running, 0);
    }
});

test('a freshly created project directory is read once OpenCode has loaded it: a missing agent is retried inside the window, then fails closed', async () => {
    const slow = setup({ fake: { configDelayMs: 120 }, transportOptions: { configWaitMs: 3000 } });
    const answer = await slow.service.complete(request());
    assert.equal(answer.ok, true, JSON.stringify(answer));
    const never = setup({ fake: { configDelayMs: 5000 } });
    const refused = await never.service.complete(request());
    assert.deepEqual([refused.ok, refused.kind], [false, 'config']);
    assert.equal(never.fake.state.prompts.length, 0);
});

test('a tool the model reaches for, from an event or from the stored messages, discards the answer', async () => {
    const live = setup();
    const event = await live.service.complete(request({ prompt: script([{ foreign: 'bash' }, { hang: true }]) }));
    assert.deepEqual([event.ok, event.kind], [false, 'refused']);
    assert.equal(live.fake.state.interrupts.length, 1);
    assert.ok(await clean(live));
    const quiet = setup({ fake: { eventsDisabled: true } });
    const stored = await quiet.service.complete(request({ prompt: script([{ foreign: 'webfetch' }, { say: 'leaked answer' }]) }));
    assert.deepEqual([stored.ok, stored.kind], [false, 'refused']);
    assert.ok(!JSON.stringify(stored).includes('leaked answer'));
    const asked = setup();
    const permission = await asked.service.complete(request({ prompt: script([{ permission: 'shell' }, { hang: true }]) }));
    assert.deepEqual([permission.ok, permission.kind], [false, 'refused']);
    assert.deepEqual(asked.fake.state.replies.map((reply) => reply.decision), ['reject']);
});

test('sign-in states: an expired, missing, key-only or unknown login refuses with the owner\'s next step before any session exists', async () => {
    const table = [
        ['expired', 'expired', /subscription sign-in has expired.*opencode auth login.*Sign-in link: https:\/\/login\.example\.test\/renew/s],
        ['none', 'unpaired', /no OpenAI subscription sign-in.*opencode auth login/s],
        ['key', 'unpaired', /Only key credentials are saved/],
        ['env', 'unpaired', /Only env credentials are saved/],
        ['unknown-integration', 'unpaired', /no openai integration/],
    ];
    for (const [login, loginState, pattern] of table) {
        const ctx = setup({ fake: { login } });
        const answer = await ctx.service.complete(request());
        assert.deepEqual([answer.ok, answer.kind, answer.loginState], [false, 'auth', loginState], login);
        assert.match(answer.message, pattern, login);
        assert.match(answer.message, /never reads, copies or refreshes the login/, login);
        assert.equal(ctx.fake.state.created.length, 0, login);
        const row = (await ctx.service.status({ refresh: true })).harnesses.opencode;
        assert.deepEqual([row.loggedIn, row.fresh, row.loginState], [false, false, loginState], login);
        assert.match(row.loginProblem, pattern, login);
        assert.equal(row.loginAction, loginState === 'expired' ? 'sign-in-again' : 'sign-in');
    }
});

test('the service: refused pairing, unreachable service, a start that fails and a missing client library each say what to do', async () => {
    const refused = setup({ fake: { refuseAuth: true } });
    const pairing = await refused.service.complete(request());
    assert.deepEqual([pairing.kind], ['auth']);
    assert.match(pairing.message, /refused this plugin.*opencode service restart/);
    assert.equal((await refused.service.status({ refresh: true })).harnesses.opencode.loginState, 'unpaired');
    const down = setup({ fake: { unreachable: true } });
    const unreachable = await down.service.complete(request());
    assert.deepEqual([unreachable.kind], ['transport']);
    assert.match(unreachable.message, /did not answer.*opencode service status/);
    const stuck = setup({ fake: { up: false, serviceStartFails: true } });
    const start = await stuck.service.complete(request());
    assert.equal(start.kind, 'transport');
    assert.match(start.message, /could not be reached or started.*opencode service start/);
    const noLibs = setup({ loadLibs: async () => { throw Object.assign(new Error('Cannot find package'), { code: 'ERR_MODULE_NOT_FOUND' }); } });
    const missing = await noLibs.service.complete(request());
    assert.deepEqual([missing.kind], ['config']);
    assert.match(missing.message, /@opencode\/client 2\.0\.28\) is not installed.*plugins:install/);
    const row = (await noLibs.service.status({ refresh: true })).harnesses.opencode;
    assert.deepEqual([row.clientInstalled, row.fresh, row.loginState], [false, false, 'unavailable']);
    assert.match(row.loginProblem, /plugins:install/);
});

test('status reads the service without starting it, and a stopped service starts on the first call with its own binary', async () => {
    const ctx = setup({ fake: { up: false } });
    const stopped = (await ctx.service.status({ refresh: true })).harnesses.opencode;
    assert.deepEqual([stopped.service, stopped.loginState, stopped.loggedIn, stopped.fresh, stopped.clientInstalled], ['stopped', 'unchecked', null, true, true]);
    assert.equal(ctx.fake.state.ensureCalls.length, 0, 'a status read never starts the owner\'s service');
    assert.equal(ctx.fake.state.created.length, 0);
    const answer = await ctx.service.complete(request());
    assert.equal(answer.ok, true, JSON.stringify(answer));
    assert.equal(ctx.fake.state.ensureCalls.length, 1);
    assert.deepEqual(ctx.fake.state.ensureCalls[0].command, [ctx.bin, 'serve', '--service']);
    assert.equal(ctx.fake.state.ensureCalls[0].version('2.0.6'), true);
    assert.equal(ctx.fake.state.ensureCalls[0].version('1.4.2'), false, 'a service of another major version is never replaced silently');
    const running = (await ctx.service.status({ refresh: true })).harnesses.opencode;
    assert.deepEqual([running.service, running.serviceVersion, running.loginState, running.loggedIn, running.fresh, running.clientVersion], ['running', '2.0.6', 'ok', true, true, '2.0.28']);
});

test('status lists each model with its image input, availability and the smaller of the two context windows', async () => {
    const ctx = setup();
    const row = (await ctx.service.status({ refresh: true })).harnesses.opencode;
    assert.deepEqual(row.models, [
        { id: 'openai/gpt-6.1-sol', context: 200_000, available: true, image: true, agent: true },
        { id: 'openai/gpt-6-luna', context: 128_000, available: true, image: false, agent: true },
    ]);
    assert.match(row.isolation, /no login file is read or copied/);
    const gone = setup({ fake: { models: FAKE_MODELS.filter((model) => model.modelID !== 'gpt-6-luna') } });
    const missing = await gone.service.complete(request({ model: 'openai/gpt-6-luna' }));
    assert.deepEqual([missing.kind], ['config']);
    assert.match(missing.message, /does not list the model openai\/gpt-6-luna/);
    assert.equal(gone.fake.state.created.length, 0);
});

test('a non-offered opencode is never contacted, even for status', async () => {
    const ctx = setup();
    ctx.config.harnesses.opencode.offer = false;
    const row = (await ctx.service.status({ refresh: true })).harnesses.opencode;
    assert.deepEqual([row.offered, row.loginState, row.service], [false, 'unchecked', null]);
    assert.equal(ctx.fake.state.discoverCalls, 0);
    assert.equal((await ctx.service.complete(request())).kind, 'config');
    assert.equal(ctx.fake.state.discoverCalls, 0);
});

test('failures are classified from OpenCode\'s own error: usage limit, sign-in, routing, network, anything else', async () => {
    const cases = [
        [{ type: 'provider.rate-limit', message: 'You hit your usage limit, try again at Oct 20th, 2026 9:00 AM.', status: 429 }, 'quota', /usage limit until 2026-10-20/],
        [{ type: 'provider.auth', message: 'invalid token', status: 401 }, 'auth', /opencode auth login/],
        [{ type: 'provider.no-route', message: 'Model unavailable: openai/gpt-6.1-sol' }, 'config', /cannot route to the model/],
        [{ type: 'provider.network', message: 'getaddrinfo ENOTFOUND api.example.test' }, 'transport', /proxy or CA certificate/],
        [{ type: 'unknown', message: 'something broke' }, 'transport', /answered with an error: unknown: something broke/],
    ];
    for (const [fail, kind, pattern] of cases) {
        const ctx = setup();
        const answer = await ctx.service.complete(request({ prompt: script([{ fail }]) }));
        assert.deepEqual([answer.ok, answer.kind], [false, kind], JSON.stringify(fail));
        assert.match(answer.message, pattern);
        assert.ok(await clean(ctx));
        if (kind === 'auth' || fail.type === 'provider.no-route') assert.equal(ctx.service.transport.state.view, null, 'the cached sign-in is forgotten so the next status re-reads it');
    }
    const empty = setup();
    const noText = await empty.service.complete(request({ prompt: script([{ noText: true }]) }));
    assert.deepEqual([noText.kind, noText.message], ['malformed', 'opencode answered with no text']);
    const filtered = setup();
    assert.equal((await filtered.service.complete(request({ prompt: script([{ say: 'x' }, { finish: 'content-filter' }]) }))).kind, 'refused');
    const silent = setup({ fake: { noMessages: true } });
    assert.equal((await silent.service.complete(request())).kind, 'malformed', 'a finished session whose messages cannot be read is malformed, not an answer');
});

test('a login problem OpenCode reports while it retries stops the call at once with its link, and endless retries stop after three', async () => {
    const action = { reason: 'reauth', provider: 'openai', title: 'Sign in again', message: 'The OpenAI sign-in was rejected', label: 'Sign in', link: 'https://login.example.test/again' };
    const ctx = setup();
    const answer = await ctx.service.complete(request({ prompt: script([{ retry: { message: 'auth', action } }, { hang: true }]) }));
    assert.deepEqual([answer.ok, answer.kind], [false, 'auth']);
    assert.match(answer.message, /The OpenAI sign-in was rejected.*https:\/\/login\.example\.test\/again.*opencode auth login/s);
    assert.equal(ctx.fake.state.interrupts.length, 1);
    assert.ok(await clean(ctx));
    const flaky = setup();
    const gave = await flaky.service.complete(request({ prompt: script([{ retry: { message: 'overloaded' } }, { retry: { message: 'overloaded' } }, { retry: { message: 'overloaded' } }, { retry: { message: 'overloaded' } }, { hang: true }]) }));
    assert.deepEqual([gave.ok, gave.kind], [false, 'transport']);
    assert.match(gave.message, /kept retrying and gave up: overloaded/);
});

test('rule 6: the deadline interrupts the OpenCode session and removes it, and the answer is a timeout', async () => {
    const ctx = setup();
    const started = Date.now();
    const answer = await ctx.service.complete(request({ timeoutMs: 1500, prompt: script([{ hang: true }]) }));
    assert.deepEqual([answer.ok, answer.kind], [false, 'timeout']);
    assert.ok(Date.now() - started < 6000);
    assert.equal(ctx.fake.state.interrupts.length, 1);
    assert.ok(await clean(ctx));
    assert.deepEqual(ctx.fake.state.removed.map((row) => row.running), [false], 'the session was stopped before it was removed');
});

test('a stalled OpenCode service cannot hold a text call past its deadline: a hanging session create, prompt or agent read times out, frees the slot, and its session is removed', async () => {
    for (const stall of ['create', 'prompt', 'agent']) {
        const ctx = setup({ concurrency: 1, fake: { stall: [stall] } });
        const started = Date.now();
        const answer = await ctx.service.complete(request({ requestId: stall, timeoutMs: 1500 }));
        const took = Date.now() - started;
        assert.deepEqual([answer.ok, answer.kind], [false, 'timeout'], `${stall}: ${JSON.stringify(answer)}`);
        assert.match(answer.message, /before the deadline/);
        assert.ok(took < 1500 + 1000, `${stall}: answered after ${took} ms`);
        assert.equal(ctx.fake.state.held.length, 1, `${stall}: the stalled request was really pending`);
        assert.equal(ctx.service.gate.counts('opencode').running, 0, `${stall}: the slot is free`);
        assert.equal(ctx.fake.state.prompts.length, 0, `${stall}: nothing reached the model`);
        ctx.fake.release();
        const next = await ctx.service.complete(request({ requestId: `${stall}-after` }));
        assert.equal(next.ok, true, `${stall}: ${JSON.stringify(next)}`);
        assert.ok(await clean(ctx), `${stall}: a session the stalled call opened is removed, even one created after the deadline`);
        assert.equal(ctx.service.transport.state.leakedSessions, 0);
    }
});

test('cancel during setup returns at once against a stalled service, frees the slot and leaves no session', async () => {
    for (const stall of ['create', 'prompt', 'agent']) {
        const ctx = setup({ concurrency: 1, fake: { stall: [stall] } });
        const pending = ctx.service.complete(request({ requestId: 'setup' }), { user: 'alice' });
        assert.ok(await until(() => ctx.fake.state.held.length === 1), `${stall}: the setup call is pending`);
        const started = Date.now();
        assert.equal(ctx.service.cancel('setup', 'alice'), true);
        const answer = await pending;
        assert.equal(answer.kind, 'lapsed', `${stall}: ${JSON.stringify(answer)}`);
        assert.ok(Date.now() - started < 1000, `${stall}: the cancel was honoured during setup`);
        assert.equal(ctx.service.gate.counts('opencode').running, 0);
        ctx.fake.release();
        assert.ok(await clean(ctx), `${stall}: no session is left`);
        assert.equal(ctx.fake.state.prompts.length, 0, `${stall}: nothing reached the model`);
    }
});

test('cancel stops only the call of the user who made it, and a call cancelled before it starts sends nothing', async () => {
    const ctx = setup();
    const pending = ctx.service.complete(request({ requestId: 'mine', prompt: script([{ hang: true }]) }), { user: 'alice' });
    assert.ok(await until(() => ctx.fake.state.prompts.length === 1));
    assert.equal(ctx.service.cancel('mine', 'bob'), false);
    assert.equal(ctx.service.cancel('mine', 'alice'), true);
    assert.equal((await pending).kind, 'lapsed');
    assert.equal(ctx.fake.state.interrupts.length, 1);
    assert.ok(await clean(ctx));
    const early = new AbortController();
    early.abort();
    const answer = await ctx.service.complete(request({ requestId: 'early' }), { signal: early.signal });
    assert.equal(answer.kind, 'lapsed');
    assert.equal(ctx.fake.state.prompts.length, 1, 'no second prompt was sent');
});

test('CR-J14: two users may use the same requestId, and each cancels only their own call', async () => {
    const ctx = setup();
    const alice = ctx.service.complete(request({ requestId: 'same', prompt: script([{ hang: true }]) }), { user: 'alice' });
    const bob = ctx.service.complete(request({ requestId: 'same', prompt: script([{ hang: true }]) }), { user: 'bob' });
    assert.ok(await until(() => ctx.fake.state.prompts.length === 2));
    assert.deepEqual(ctx.fake.state.created.map((row) => row.metadata.label).sort(), ['alice/read', 'bob/read']);
    assert.equal(ctx.service.cancel('same', 'alice'), true);
    assert.equal((await alice).kind, 'lapsed');
    assert.equal(ctx.service.cancel('same', 'bob'), true);
    assert.equal((await bob).kind, 'lapsed');
});

test('rule 7: two calls at once per harness, one per user and role, and overflow is refused as busy', async () => {
    const ctx = setup({ concurrency: 2, queueLimit: 2 });
    const run = (index, role, user = 'u') => ctx.service.complete(request({ requestId: `c${index}`, role, prompt: script([{ delay: 200 }, { say: `done ${index}` }]) }), { user });
    const results = await Promise.all([run(1, 'read'), run(2, 'synthesis'), run(3, 'curator'), run(4, 'read')]);
    assert.deepEqual(results.map((result) => result.ok), [true, true, true, true]);
    assert.equal(ctx.fake.state.peak, 2, 'never more than two OpenCode sessions at once');
    const tight = setup({ concurrency: 1, queueLimit: 1 });
    const first = tight.service.complete(request({ requestId: 'a', role: 'a', prompt: script([{ delay: 300 }, { say: 'a' }]) }));
    assert.ok(await until(() => tight.fake.state.running === 1));
    const second = tight.service.complete(request({ requestId: 'b', role: 'b', prompt: script([{ delay: 10 }, { say: 'b' }]) }));
    await new Promise((resolve) => setTimeout(resolve, 30));
    const third = await tight.service.complete(request({ requestId: 'c', role: 'c' }));
    assert.deepEqual([third.ok, third.kind], [false, 'busy']);
    assert.equal((await first).ok && (await second).ok, true);
});

test('the output bound interrupts a runaway answer and keeps only its first characters', async () => {
    const ctx = setup();
    const answer = await ctx.service.complete(request({ maxOutputChars: 1000, prompt: script([{ stream: 400 }]) }));
    assert.deepEqual([answer.ok, answer.finish, answer.text.length], [true, 'length', 1000]);
    assert.equal(ctx.fake.state.interrupts.length, 1);
    assert.ok(await clean(ctx));
    const long = setup();
    const cut = await long.service.complete(request({ maxOutputChars: 10, prompt: script([{ say: 'y'.repeat(50) }]) }));
    assert.deepEqual([cut.finish, cut.text.length], ['length', 10]);
});

test('a quota answer holds the route without creating another session', async () => {
    const ctx = setup();
    const limit = { type: 'provider.rate-limit', message: 'usage limit reached', status: 429 };
    const first = await ctx.service.complete(request({ prompt: script([{ fail: limit }]) }));
    assert.deepEqual([first.kind, first.retryAt ?? null], ['quota', null]);
    const second = await ctx.service.complete(request({ requestId: 'r2' }));
    assert.equal(second.kind, 'quota');
    assert.match(second.message, /no retry time/);
    assert.equal(second.retryAt, NOW + plugin.QUOTA_HOLD_MS);
    assert.equal(ctx.fake.state.created.length, 1, 'the held call creates nothing');
    assert.equal((await ctx.service.status()).harnesses.opencode.quotaUntil, NOW + plugin.QUOTA_HOLD_MS);
});

test('vision: images are sent as inline attachments after their bytes are checked, only to a model with image input', async () => {
    const ctx = setup();
    const images = [{ data: png(), mime: 'image/png', description: 'the first panel' }, { data: JPEG }, { data: WEBP }];
    const answer = await ctx.service.complete(request({ images, prompt: script([{ say: 'seen' }]) }));
    assert.equal(answer.ok, true, JSON.stringify(answer));
    const [prompt] = ctx.fake.state.prompts;
    assert.deepEqual(prompt.files.map((file) => [file.uri.split(';')[0], file.name]), [['data:image/png', 'image-1.png'], ['data:image/jpeg', 'image-2.jpeg'], ['data:image/webp', 'image-3.webp']]);
    assert.equal(prompt.files[0].uri.endsWith(images[0].data), true);
    assert.equal(prompt.files[0].description, 'the first panel');
    const refusals = [
        [{ images: [{ data: Buffer.from('not an image at all, just text').toString('base64') }] }, /not a PNG, JPEG, GIF or WebP/],
        [{ images: [{ data: png(), mime: 'image/jpeg' }] }, /says image\/jpeg but its bytes are image\/png/],
        [{ images: [{ data: 'not base64!' }] }, /must carry base64 data/],
        [{ images: Array.from({ length: 5 }, () => ({ data: png() })) }, /at most 4/],
        [{ images: [{ data: png(8_000_001) }] }, /over 8000000 bytes/],
        [{ images: [{ data: png(7_000_000) }, { data: png(7_000_000) }, { data: png(7_000_000) }] }, /over 20000000 bytes together/],
    ];
    for (const [patch, pattern] of refusals) {
        const refused = await ctx.service.complete(request({ requestId: 'x', ...patch }));
        assert.deepEqual([refused.ok, refused.kind], [false, 'refused'], JSON.stringify(patch).slice(0, 60));
        assert.match(refused.message, pattern);
    }
    const text = await ctx.service.complete(request({ requestId: 'y', model: 'openai/gpt-6-luna', images: [{ data: png() }] }));
    assert.deepEqual([text.ok, text.kind], [false, 'config']);
    assert.match(text.message, /no image input/);
    assert.equal(ctx.fake.state.prompts.length, 1, 'only the valid call reached the model');
});

test('images travel through the route and only for opencode', async () => {
    const ctx = setup();
    const body = (value) => {
        const stream = Readable.from([Buffer.from(JSON.stringify(value))]);
        stream.headers = { 'x-so-plugin': '1', 'content-type': 'text/plain;charset=UTF-8', host: 'st.local' };
        stream.user = { profile: { handle: 'default-user', admin: true } };
        return stream;
    };
    const reply = () => {
        const out = { statusCode: 200, body: undefined };
        const res = { writableFinished: false, status(code) { out.statusCode = code; return res; }, json(value) { out.body = value; res.writableFinished = true; return res; }, on() {} };
        return { res, out };
    };
    const handlers = plugin.createHandlers(ctx.service, ctx.config);
    const ok = reply();
    await handlers.complete(body(request({ images: [{ data: png(300_000) }] })), ok.res);
    assert.equal(ok.out.body.ok, true, JSON.stringify(ok.out.body));
    assert.equal(ctx.fake.state.prompts[0].files.length, 1, 'a picture larger than the small body limit still arrives');
    const claude = reply();
    await handlers.complete(body({ ...request({ harness: 'claude', model: 'haiku', images: [{ data: png() }] }) }), claude.res);
    assert.equal(claude.out.body.kind, 'config');
    assert.match(claude.out.body.message, /opencode harness only/);
    const many = reply();
    await handlers.complete(body(request({ images: Array.from({ length: 5 }, () => ({ data: png() })) })), many.res);
    assert.equal(many.out.body.kind, 'refused');
});

test('malformed events never end or answer a call', async () => {
    const ctx = setup();
    const answer = await ctx.service.complete(request({ prompt: script([{ malformed: true }, { say: 'fine' }]) }));
    assert.deepEqual([answer.ok, answer.text], [true, 'fine']);
});

test('with the event stream down, completion is read from the session\'s messages', async () => {
    const off = setup({ fake: { eventsDisabled: true } });
    const polled = await off.service.complete(request({ prompt: script([{ say: 'from messages' }]) }));
    assert.deepEqual([polled.ok, polled.text], [true, 'from messages']);
    const broke = setup({ fake: { eventsBreakAfter: 1 } });
    const after = await broke.service.complete(request({ prompt: script([{ delay: 50 }, { say: 'after the break' }]) }));
    assert.deepEqual([after.ok, after.text], [true, 'after the break']);
});

test('a session that cannot be removed is counted and logged, never reported as an answer failure', async () => {
    const ctx = setup({ fake: { removeFails: true } });
    const answer = await ctx.service.complete(request());
    assert.equal(answer.ok, true);
    assert.equal(ctx.service.transport.state.leakedSessions, 1);
    assert.equal((await ctx.service.status()).harnesses.opencode.leakedSessions, 1);
    assert.ok(ctx.lines.some((line) => line.includes('leakedSession')));
});

test('a restart also removes plugin text directories nobody has used for a week', async () => {
    const ctx = setup();
    const old = path.join(ctx.text, 'text-old');
    const recent = path.join(ctx.text, 'text-recent');
    for (const dir of [old, recent]) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'opencode.json'), '{}'); }
    const aWeekAgo = new Date(NOW - 8 * 24 * 3_600_000);
    fs.utimesSync(path.join(old, 'opencode.json'), aWeekAgo, aWeekAgo);
    fs.utimesSync(path.join(recent, 'opencode.json'), new Date(NOW - 3_600_000), new Date(NOW - 3_600_000));
    assert.deepEqual(ctx.service.transport.sweepLocations(), { removed: 1 });
    assert.deepEqual([fs.existsSync(old), fs.existsSync(recent)], [false, true]);
});

test('a restart removes the sessions a dead plugin process left, and only those', async () => {
    const ctx = setup();
    const { state } = ctx.fake;
    const row = (id, title, metadata) => state.sessions.set(id, { id, title, metadata, location: { directory: '/x' }, messages: [] });
    row('ses_dead', 'so-harness 2147483000 a', { owner: transport.SESSION_OWNER, pid: 2147483000 });
    row('ses_live', `so-harness ${process.pid} b`, { owner: transport.SESSION_OWNER, pid: process.pid });
    row('ses_other', 'so-harness notes', { owner: 'someone-else', pid: 2147483000 });
    row('ses_plain', 'my own work', {});
    assert.deepEqual(await ctx.service.sweep(), { removed: 1 });
    assert.deepEqual([...state.sessions.keys()].sort(), ['ses_live', 'ses_other', 'ses_plain']);
    assert.deepEqual(await ctx.service.sweep(), { removed: 0 }, 'one sweep per process');
});

test('no login file is read: the OpenCode path opens no credential file and the transport names none', async () => {
    const reads = [];
    const fsImpl = { ...fs, readFileSync: (file, ...rest) => { reads.push(String(file)); if (/auth\.json|credentials|\.env\b/i.test(String(file))) throw new Error(`read of ${file}`); return fs.readFileSync(file, ...rest); } };
    const ctx = setup({ fsImpl });
    const answer = await ctx.service.complete(request());
    assert.equal(answer.ok, true, JSON.stringify(answer));
    assert.ok(!reads.some((file) => /auth\.json|credentials|\.env\b/i.test(file)));
    const transportSource = fs.readFileSync(path.join(here, 'opencodeTransport.mjs'), 'utf8');
    assert.ok(!/auth\.json|credentials\.json|loginFile|\.local[\\/]share/.test(transportSource), 'the transport names no login file');
    assert.ok(!/auth\.json|credentials\.json|\.local[\\/]share/.test(fs.readFileSync(path.join(here, 'agentBridge.mjs'), 'utf8')), 'the bridge names no login file');
    assert.equal(plugin.sanitizeConfig({ harnesses: { opencode: { loginFile: '/x/auth.json' } } }).harnesses.opencode.loginFile, '/x/auth.json', 'the config field is kept for claude and codex only');
    const owned = plugin.openOwnedHome('opencode', { tmpRoot: ctx.config.tmpRoot, loginFile: null });
    assert.equal(owned.copy, null);
    assert.deepEqual(plugin.closeOwnedHome(owned), { copyRewritten: false, realChanged: false, removed: true });
});

test('the package, the transport and the expected plugin version agree', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(here, 'package.json'), 'utf8'));
    assert.equal(manifest.dependencies[transport.OPENCODE_CLIENT.name], transport.OPENCODE_CLIENT.version, 'the pinned client library is the one the transport names');
    assert.equal(manifest.version, plugin.PLUGIN_VERSION);
});

test('a routing or config error that only mentions credentials or sign-in is not a sign-in failure; a real one is', () => {
    const notAuth = [
        [{ type: 'provider.no-route', message: 'Model unavailable: openai/gpt-6.1-sol; check that the provider credentials are configured and signed in' }, 'config'],
        [{ type: 'provider.model-not-found', message: 'unknown model: openai/x (sign in to see more models)' }, 'config'],
        [{ type: 'config.invalid', message: 'the credential store path in opencode.json is not a string' }, 'transport'],
        [{ type: 'unknown', message: 'see the sign-in docs for proxy settings' }, 'transport'],
    ];
    for (const [error, kind] of notAuth) assert.equal(transport.classifyV2Error(error).kind, kind, JSON.stringify(error));
    const auth = [
        { type: 'provider.auth', message: 'rejected' },
        { type: 'provider.error', message: 'The credential has expired' },
        { type: 'provider.error', message: 'invalid credentials for openai' },
        { type: 'provider.error', message: 'needs_auth' },
        { type: 'provider.error', message: 'Please sign in again' },
        { type: 'provider.no-route', message: 'no route', status: 401 },
    ];
    for (const error of auth) {
        const classified = transport.classifyV2Error(error);
        assert.deepEqual([classified.kind, classified.signIn], ['auth', true], JSON.stringify(error));
    }
});

test('transport helpers: permissions evaluate last-match, images are sniffed from bytes, errors keep their words', () => {
    const rules = [{ action: '*', resource: '*', effect: 'deny' }, { action: 'so_*', resource: '*', effect: 'allow' }];
    assert.equal(transport.evaluatePermission(rules, 'so_readStory'), 'allow');
    assert.equal(transport.evaluatePermission(rules, 'shell'), 'deny');
    assert.equal(transport.evaluatePermission([], 'shell'), 'ask');
    assert.equal(transport.toolsDenied(rules), true, 'a tool server\'s own prefix is not a built-in tool');
    assert.equal(transport.toolsDenied([{ action: '*', resource: '*', effect: 'allow' }]), false);
    assert.equal(transport.toolsDenied(transport.textRules()), true);
    assert.equal(transport.bridgeOnly(transport.bridgeRules(), ['readStory']), true);
    assert.equal(transport.bridgeOnly(transport.textRules(), ['readStory']), false);
    assert.equal(transport.detectImage(Buffer.from('GIF89a......')), 'image/gif');
    assert.equal(transport.detectImage(Buffer.from('short')), null);
    assert.deepEqual(transport.splitModel('openrouter/anthropic/claude'), { providerID: 'openrouter', id: 'anthropic/claude' });
    assert.equal(transport.splitModel('noprovider'), null);
    assert.equal(transport.describeClientError({ _tag: 'UnauthorizedError' }).state, 'unpaired');
    assert.equal(transport.describeClientError(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } })).kind, 'transport');
});


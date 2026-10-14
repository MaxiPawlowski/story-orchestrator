import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createFakeOpencode } from './fixtures/fake-opencode-server.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const plugin = await import(pathToFileURL(path.join(here, 'index.mjs')).href);
const bridge = await import(pathToFileURL(path.join(here, 'agentBridge.mjs')).href);
const transport = await import(pathToFileURL(path.join(here, 'opencodeTransport.mjs')).href);
const shim = await import(pathToFileURL(path.join(here, 'mcpShim.mjs')).href);

const MODEL = plugin.DEFAULT_MODELS.opencode[0].id;
const TOOLS = [
    { name: 'readStory', description: 'Read the draft.', inputSchema: { type: 'object', additionalProperties: false, properties: {}, required: [] } },
    { name: 'addQuality', description: 'Declare a quality.', inputSchema: { type: 'object', additionalProperties: false, properties: { quality: { type: ['object'], description: 'the quality' } }, required: ['quality'] } },
];
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]).toString('base64');

const alive = (pid) => {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
};

const until = async (check, ms = 15000) => {
    const started = Date.now();
    while (Date.now() - started < ms) {
        if (await check()) return true;
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return false;
};

function setup({ offer = true, concurrency, fsImpl, fake: fakeOptions = {} } = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'so-bridge-test-'));
    const bin = path.join(root, 'opencode.exe');
    fs.writeFileSync(bin, '');
    const config = plugin.sanitizeConfig({ tmpRoot: path.join(root, 'tmp'), harnesses: { opencode: { binary: bin, offer, ...(concurrency ? { concurrency } : {}) } } });
    const fake = createFakeOpencode(fakeOptions);
    const lines = [];
    const spawnImpl = () => {
        const child = new EventEmitter();
        child.pid = 1;
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.stdin = { on() {}, end() { setImmediate(() => { child.stdout.emit('data', Buffer.from('2.0.6')); child.emit('close', 0); }); } };
        return child;
    };
    const service = plugin.createHarnessService({
        config,
        env: { PATH: process.env.PATH ?? process.env.Path ?? '', SystemRoot: process.env.SystemRoot ?? '', OPENAI_API_KEY: 'sk-canary', SO_SECRET_CANARY: 'x' },
        home: root,
        spawnImpl,
        ...(fsImpl ? { fsImpl } : {}),
        log: (line) => lines.push(line),
        opencode: { loadLibs: async () => fake.libs, configWaitMs: 150 },
    });
    return { root, config, service, fake, lines, calls: () => (fs.existsSync(path.join(config.tmpRoot, 'calls')) ? fs.readdirSync(path.join(config.tmpRoot, 'calls')) : []) };
}

const openRequest = (script, overrides = {}) => ({
    harness: 'opencode', model: MODEL, role: 'authoring', system: 'You are the wizard agent.', prompt: `Do the plan.\nFAKE:${JSON.stringify(script)}`,
    timeoutMs: 30_000, callTimeoutMs: 20_000, maxOutputChars: 20_000, effort: null, tools: TOOLS, ...overrides,
});

const nextEvent = async (service, sessionId, user = 'default-user') => {
    for (;;) {
        const found = await service.agent.next(sessionId, { user, waitMs: 2000 });
        if (found.error) return found;
        if (found.event.kind !== 'pending') return found.event;
    }
};

const cleaned = (ctx, sessions = 1) => until(() => ctx.service.agent.counts().sessions === 0 && ctx.calls().length === 0 && ctx.fake.state.removed.length >= sessions && ctx.fake.state.evicted.length >= sessions);

test('a tool call is parked, long-polled by next, answered to the shim, and the session ends with the answer', async () => {
    const ctx = setup();
    const { service, fake, lines } = ctx;
    const opened = await service.agent.open(openRequest([{ call: 'readStory', args: {} }, { say: 'finished' }]));
    assert.equal(opened.ok, true, JSON.stringify(opened));
    const call = await nextEvent(service, opened.sessionId);
    assert.deepEqual(call, { kind: 'call', callId: 'c1', tool: 'readStory', args: {} });
    assert.deepEqual(service.agent.answer(opened.sessionId, { callId: 'c1', ok: true, text: 'STORY TEXT' }), { value: { answered: true } });
    const done = await nextEvent(service, opened.sessionId);
    assert.equal(done.kind, 'done');
    assert.match(done.text, /readStory:ok:STORY TEXT/);
    assert.match(done.text, /finished/);
    assert.ok(await cleaned(ctx), 'the session, its owned directory and its OpenCode session are gone');
    assert.ok(await until(() => fake.state.mcpPids.every((pid) => !alive(pid))), 'the shim process ended with its location');
    assert.equal(lines.length, 1);
    assert.deepEqual(Object.keys(JSON.parse(lines[0].replace(/^agent /, ''))), ['harness', 'model', 'ms', 'calls', 'kind']);
    assert.ok(!lines[0].includes('STORY TEXT') && !lines[0].includes('Do the plan'), 'the log carries no prompt or answer text');
});

test('isolation: an owned project directory, the denied-by-default agent, no login read, and exactly the shim\'s tools', async () => {
    const reads = [];
    const fsImpl = { ...fs, readFileSync: (file, ...rest) => { reads.push(String(file)); return fs.readFileSync(file, ...rest); } };
    const ctx = setup({ fsImpl });
    const { service, fake, root } = ctx;
    const opened = await service.agent.open(openRequest([{ list: true }]));
    const done = await nextEvent(service, opened.sessionId);
    assert.equal(done.kind, 'done', JSON.stringify(done));
    const listed = JSON.parse(done.text);
    assert.deepEqual(listed.exposed, ['so_readStory', 'so_addQuality']);
    assert.deepEqual(listed.servers, [{ name: bridge.BRIDGE_SERVER, codemode: false }], 'the wizard\'s tools stay native, not behind Code Mode');
    const [created] = fake.state.created;
    assert.equal(created.agent, bridge.BRIDGE_AGENT);
    assert.deepEqual(created.model, { providerID: 'openai', id: 'gpt-6.1-sol' });
    assert.ok(created.location.directory.startsWith(root), 'the session lives in an owned directory');
    assert.deepEqual(created.permissions, [{ action: '*', resource: '*', effect: 'deny' }, { action: 'so_*', resource: '*', effect: 'allow' }]);
    assert.deepEqual(Object.keys(created.configAtCreate.mcp.servers), [bridge.BRIDGE_SERVER]);
    assert.deepEqual(created.configAtCreate.mcp.servers.so.command, [process.execPath, bridge.SHIM_PATH]);
    assert.deepEqual(Object.keys(created.configAtCreate.agents), [bridge.BRIDGE_AGENT]);
    assert.equal(created.configAtCreate.agents[bridge.BRIDGE_AGENT].system, 'You are the wizard agent.');
    assert.equal(fake.state.prompts[0].text.startsWith('Do the plan.'), true, 'the prompt goes to the session, never a command line');
    assert.ok(!JSON.stringify(created.configAtCreate).includes('sk-canary'), 'ST\'s environment stays out of the project config');
    assert.ok(!reads.some((file) => /auth\.json|credentials|\.env/i.test(file)), 'no login file is read');
});

test('the shim exposes exactly the page\'s tools and refuses any other name', async () => {
    const written = [];
    const forwarded = [];
    const instance = shim.createShim({ tools: TOOLS, forward: async (tool, args) => { forwarded.push([tool, args]); return { ok: true, text: 'r' }; }, write: (message) => written.push(message) });
    await instance.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } });
    await instance.handle({ jsonrpc: '2.0', method: 'notifications/initialized' });
    await instance.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    await instance.handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'bash', arguments: { command: 'id' } } });
    await instance.handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'readStory', arguments: {} } });
    assert.equal(written[0].result.protocolVersion, '2025-03-26');
    assert.deepEqual(written[1].result.tools.map((tool) => tool.name), TOOLS.map((tool) => tool.name));
    assert.equal(written[2].error.code, -32602);
    assert.deepEqual(forwarded, [['readStory', {}]]);
    assert.deepEqual(written[3].result, { content: [{ type: 'text', text: 'r' }], isError: false });
    assert.equal(written.length, 4, 'a notification gets no reply');
});

test('an answer reaches only its own session, once, and another user is refused', async () => {
    const { service } = setup();
    const one = await service.agent.open(openRequest([{ call: 'readStory', args: {} }]), { user: 'alice' });
    const two = await service.agent.open(openRequest([{ call: 'readStory', args: {} }], { role: 'curator' }), { user: 'alice' });
    const callOne = await nextEvent(service, one.sessionId, 'alice');
    const callTwo = await nextEvent(service, two.sessionId, 'alice');
    assert.equal(callOne.callId, 'c1');
    assert.equal(callTwo.callId, 'c1');
    assert.equal(service.agent.answer(one.sessionId, { user: 'bob', callId: 'c1', ok: true, text: 'BOB' }).error.status, 404);
    assert.equal(service.agent.answer(one.sessionId, { user: 'alice', callId: 'c9', ok: true, text: 'X' }).error.status, 409);
    assert.deepEqual(service.agent.answer(one.sessionId, { user: 'alice', callId: 'c1', ok: true, text: 'FOR-ONE' }), { value: { answered: true } });
    assert.equal(service.agent.answer(one.sessionId, { user: 'alice', callId: 'c1', ok: true, text: 'AGAIN' }).error.status, 409, 'a call is answered once');
    const doneOne = await nextEvent(service, one.sessionId, 'alice');
    assert.match(doneOne.text, /FOR-ONE/);
    assert.equal((await service.agent.next(two.sessionId, { user: 'alice', waitMs: 100 })).event.kind, 'pending', 'the other session still waits');
    service.agent.answer(two.sessionId, { user: 'alice', callId: 'c1', ok: false, text: 'FOR-TWO' });
    const doneTwo = await nextEvent(service, two.sessionId, 'alice');
    assert.match(doneTwo.text, /readStory:error:FOR-TWO/, 'a rejected call reaches the model as an error result');
    assert.ok(!doneTwo.text.includes('FOR-ONE'));
    await service.shutdown();
});

test('the session deadline tears everything down even when the page never polls', async () => {
    const ctx = setup();
    const { service, fake } = ctx;
    const opened = await service.agent.open(openRequest([{ hang: true }], { timeoutMs: bridge.BRIDGE_LIMITS.minSessionMs }));
    assert.equal(opened.ok, true);
    assert.ok(await until(() => fake.state.prompts.length === 1));
    const after = await nextEvent(service, opened.sessionId);
    assert.deepEqual([after.kind, after.errorKind], ['ended', 'timeout']);
    assert.ok(await until(() => service.agent.counts().sessions === 0), 'the session is gone');
    assert.ok(await cleaned(ctx), 'torn down at the deadline');
    assert.equal(fake.state.interrupts.length, 1, 'the running OpenCode session was interrupted before it was removed');
    assert.ok(await until(() => fake.state.mcpPids.every((pid) => !alive(pid))));
    assert.equal(service.agent.answer(opened.sessionId, { callId: 'c1', ok: true, text: 'late' }).error.status, 409);
});

test('a parked call nobody answers tears the session down at its call deadline', async () => {
    const ctx = setup();
    const { service } = ctx;
    const opened = await service.agent.open(openRequest([{ call: 'readStory', args: {} }], { callTimeoutMs: 1000 }));
    const session = service.agent.sessions.get(opened.sessionId);
    const call = await nextEvent(service, opened.sessionId);
    assert.equal(call.kind, 'call');
    const ended = await nextEvent(service, opened.sessionId);
    assert.deepEqual([ended.kind, ended.errorKind], ['ended', 'timeout']);
    assert.match(ended.message, /tool call waited past its deadline/, 'the call deadline ended it, not the session deadline');
    const report = await session.closing;
    assert.equal(report.reason, 'call-timeout');
    assert.equal(service.agent.counts().sessions, 0);
    assert.ok(await cleaned(ctx), 'the owned directory and the OpenCode session are gone once the teardown settles');
    const after = await service.agent.next(opened.sessionId, { waitMs: 10 });
    assert.equal(after.event.errorKind, 'timeout');
});

test('a tool the bridge does not own ends the session as refused, from the event or from the stored messages', async () => {
    const ctx = setup();
    const opened = await ctx.service.agent.open(openRequest([{ foreign: 'bash' }, { hang: true }]));
    const ended = await nextEvent(ctx.service, opened.sessionId);
    assert.deepEqual([ended.kind, ended.errorKind], ['ended', 'refused']);
    assert.ok(await cleaned(ctx));
    const silent = setup({ fake: { eventsDisabled: true } });
    const quiet = await silent.service.agent.open(openRequest([{ foreign: 'bash' }, { say: 'done' }]));
    const refused = await nextEvent(silent.service, quiet.sessionId);
    assert.deepEqual([refused.kind, refused.errorKind], ['ended', 'refused'], 'with no event stream the finished messages still show the foreign tool');
    const permission = setup();
    const asked = await permission.service.agent.open(openRequest([{ permission: 'shell' }, { hang: true }]));
    assert.equal((await nextEvent(permission.service, asked.sessionId)).errorKind, 'refused', 'a permission request is a refusal');
    assert.equal(permission.fake.state.replies[0].decision, 'reject');
});

test('one session per user and role: a second open replaces the first; close leaves nothing behind', async () => {
    const ctx = setup();
    const { service } = ctx;
    const first = await service.agent.open(openRequest([{ hang: true }]));
    assert.ok(await until(() => ctx.fake.state.prompts.length === 1));
    const second = await service.agent.open(openRequest([{ hang: true }]));
    assert.equal(service.agent.counts().sessions, 1);
    const replaced = await service.agent.next(first.sessionId, { waitMs: 10 });
    assert.equal(replaced.event.errorKind, 'lapsed');
    assert.ok(await until(() => ctx.fake.state.prompts.length === 2));
    assert.deepEqual(await service.agent.close(second.sessionId), { value: { closed: true } });
    assert.equal(service.agent.counts().sessions, 0);
    assert.ok(await cleaned(ctx, 2), 'both OpenCode sessions and both owned directories are gone');
});

test('the parked queue is bounded: calls past the bound are refused at once', async () => {
    const { service } = setup();
    const limit = bridge.BRIDGE_LIMITS.maxParked;
    const opened = await service.agent.open(openRequest([{ burst: limit + 2, tool: 'readStory' }]));
    const delivered = [];
    while (delivered.length < limit) {
        const event = await nextEvent(service, opened.sessionId);
        assert.equal(event.kind, 'call', JSON.stringify(event));
        delivered.push(event.callId);
    }
    for (const callId of delivered) service.agent.answer(opened.sessionId, { callId, ok: true, text: `R-${callId}` });
    const done = await nextEvent(service, opened.sessionId);
    const lines = done.text.split('\n');
    assert.equal(lines.filter((line) => line.startsWith('burst:ok:R-')).length, limit);
    assert.equal(lines.filter((line) => line.includes('too many tool calls at once')).length, 2);
});

test('tool schemas, images and the harness are validated on open', () => {
    const config = plugin.sanitizeConfig({ harnesses: { opencode: { offer: true } } });
    const base = openRequest([], { timeoutMs: 60_000 });
    assert.equal(bridge.validateOpen(base, config, plugin.LIMITS).issue, null);
    const cases = [
        [{ tools: [] }, /non-empty/],
        [{ tools: [TOOLS[0], TOOLS[0]] }, /duplicate/],
        [{ tools: [{ ...TOOLS[0], name: 'bad name' }] }, /name/],
        [{ tools: [{ ...TOOLS[0], exec: 'x' }] }, /unknown tool key/],
        [{ tools: [{ ...TOOLS[0], inputSchema: { type: 'string' } }] }, /object schema/],
        [{ tools: [{ ...TOOLS[0], inputSchema: { type: 'object', properties: { a: { $ref: 'https://evil/x' } } } }] }, /reference/],
        [{ tools: Array.from({ length: 65 }, (_, index) => ({ ...TOOLS[0], name: `t${index}` })) }, /at most/],
        [{ harness: 'claude' }, /opencode only/],
        [{ model: 'openai/gpt-9' }, /not permitted/],
        [{ timeoutMs: 10 }, /timeoutMs/],
        [{ images: 'x' }, /images must be a list/],
        [{ images: Array.from({ length: 5 }, () => ({ data: PNG })) }, /images must be a list/],
    ];
    for (const [patch, pattern] of cases) assert.match(bridge.validateOpen({ ...base, ...patch }, config, plugin.LIMITS).issue ?? '', pattern, JSON.stringify(patch).slice(0, 80));
    assert.deepEqual(bridge.validateOpen({ ...base, images: [{ data: PNG }] }, config, plugin.LIMITS).value.images, [{ data: PNG }]);
});

const body = (value, headers = {}) => {
    const stream = Readable.from([Buffer.from(JSON.stringify(value))]);
    stream.headers = { 'x-so-plugin': '1', 'content-type': 'text/plain;charset=UTF-8', host: 'st.local', ...headers };
    stream.user = { profile: { handle: 'default-user', admin: true } };
    return stream;
};
const fakeResponse = () => {
    const out = { statusCode: 200, body: undefined };
    const res = { writableFinished: false, status(code) { out.statusCode = code; return res; }, json(value) { out.body = value; res.writableFinished = true; return res; }, on() {} };
    return { res, out };
};

test('admin, offer, header and same-origin guards refuse before any OpenCode session exists', async () => {
    const ctx = setup();
    const { service, config, fake } = ctx;
    const handlers = plugin.createHandlers(service, config);
    const request = openRequest([{ list: true }], { timeoutMs: 60_000 });
    const cases = [
        [body(request, { 'x-so-plugin': undefined }), 403],
        [body(request, { origin: 'https://evil.example' }), 403],
        [body(request, { 'sec-fetch-site': 'cross-site' }), 403],
        [Object.assign(body(request), { user: { profile: { handle: 'guest', admin: false } } }), 403],
    ];
    for (const [req, status] of cases) {
        const { res, out } = fakeResponse();
        await handlers.agentOpen(req, res);
        assert.equal(out.statusCode, status, JSON.stringify(out.body));
    }
    for (const route of ['agentNext', 'agentAnswer', 'agentClose']) {
        const { res, out } = fakeResponse();
        await handlers[route](body({ sessionId: 'a'.repeat(32) }, { 'x-so-plugin': undefined }), res);
        assert.equal(out.statusCode, 403, route);
    }
    const unknown = fakeResponse();
    await handlers.agentNext(body({ sessionId: 'a'.repeat(32) }), unknown.res);
    assert.equal(unknown.out.statusCode, 404);
    const off = setup({ offer: false });
    const refused = fakeResponse();
    await plugin.createHandlers(off.service, off.config).agentOpen(body(request), refused.res);
    assert.equal(refused.out.body.kind, 'config');
    assert.match(refused.out.body.message, /not offered/);
    assert.equal(fake.state.created.length + off.fake.state.created.length, 0);
    assert.equal((await service.status()).harnesses.opencode.agentBridge, true);
    assert.equal((await off.service.status()).harnesses.opencode.agentBridge, false);
    assert.equal((await service.status()).harnesses.claude.agentBridge, false);
});

test('the routes drive a whole session: open, next, answer, close', async () => {
    const ctx = setup();
    const { service, config } = ctx;
    const handlers = plugin.createHandlers(service, config);
    const opened = fakeResponse();
    await handlers.agentOpen(body(openRequest([{ call: 'addQuality', args: { quality: { key: 'trust' } } }, { hang: true }], { timeoutMs: 60_000 })), opened.res);
    assert.equal(opened.out.body.ok, true, JSON.stringify(opened.out.body));
    const { sessionId } = opened.out.body;
    let event;
    do {
        const polled = fakeResponse();
        await handlers.agentNext(body({ sessionId, waitMs: 2000 }), polled.res);
        event = polled.out.body;
    } while (event.kind === 'pending');
    assert.deepEqual(event, { kind: 'call', callId: 'c1', tool: 'addQuality', args: { quality: { key: 'trust' } } });
    const answered = fakeResponse();
    await handlers.agentAnswer(body({ sessionId, callId: 'c1', ok: true, text: 'Waiting for the author.' }), answered.res);
    assert.deepEqual(answered.out.body, { answered: true });
    const closed = fakeResponse();
    await handlers.agentClose(body({ sessionId }), closed.res);
    assert.deepEqual(closed.out.body, { closed: true });
    assert.equal(service.agent.counts().sessions, 0);
    assert.ok(await cleaned(ctx));
});

test('shutdown tears every session down', async () => {
    const ctx = setup();
    const { service, fake } = ctx;
    await service.agent.open(openRequest([{ hang: true }]));
    await service.agent.open(openRequest([{ hang: true }], { role: 'curator' }));
    assert.equal(service.agent.counts().sessions, 2);
    assert.ok(await until(() => fake.state.prompts.length === 2));
    await service.shutdown();
    assert.equal(service.agent.counts().sessions, 0);
    assert.ok(await cleaned(ctx, 2), 'the owned directories and OpenCode sessions are gone');
    assert.ok(await until(() => fake.state.mcpPids.every((pid) => !alive(pid))));
});

test('HARNESS_LIVE=1: one real opencode bridge session through the shim', { skip: process.env.HARNESS_LIVE !== '1' }, async () => {
    const config = plugin.loadConfig();
    const service = plugin.createHarnessService({ config });
    const status = await service.status({ refresh: true });
    const row = status.harnesses.opencode;
    if (!row.agentBridge || !row.installed || !row.fresh) {
        console.log(`opencode bridge: skipped (${!row.agentBridge ? 'not offered' : !row.installed ? row.problem : row.loginProblem})`);
        return;
    }
    const opened = await service.agent.open({
        harness: 'opencode', model: row.models[0].id, role: 'authoring', system: 'Call the readStory tool exactly once, then reply with the word DONE.',
        prompt: 'Read the story with your tool, then say DONE.', timeoutMs: 180_000, callTimeoutMs: 60_000, maxOutputChars: 4000, effort: null, tools: TOOLS,
    });
    assert.equal(opened.ok, true, opened.message);
    try {
        const first = await nextEvent(service, opened.sessionId);
        console.log('live first event', JSON.stringify(first).slice(0, 200));
        assert.equal(first.kind, 'call', 'the model called the shim tool');
        assert.equal(first.tool, 'readStory');
        service.agent.answer(opened.sessionId, { callId: first.callId, ok: true, text: 'Title: The Lighthouse. Two checkpoints.' });
        const second = await nextEvent(service, opened.sessionId);
        console.log('live second event', JSON.stringify(second).slice(0, 200));
        assert.equal(second.kind, 'done');
    } finally {
        await service.agent.close(opened.sessionId);
    }
});

test('CR-J1: a failing owned-directory write answers config, removes the directory and frees the slot', async () => {
    const fsImpl = { ...fs, writeFileSync: (file, ...rest) => { if (String(file).endsWith('tools.json')) throw Object.assign(new Error('disk full'), { code: 'ENOSPC' }); return fs.writeFileSync(file, ...rest); } };
    const { service, calls, fake } = setup({ fsImpl });
    const opened = await service.agent.open(openRequest([{ hang: true }]));
    assert.deepEqual([opened.ok, opened.kind], [false, 'config']);
    assert.match(opened.message, /ENOSPC/);
    assert.equal(fake.state.created.length, 0);
    assert.deepEqual(calls(), []);
    assert.equal(service.gate.counts('opencode').running, 0);
    assert.equal(service.agent.counts().sessions, 0);
});

test('CR-J16: with the event stream lost mid-run, completion is still read from the stored messages', async () => {
    const lost = setup({ fake: { eventsBreakAfter: 1 } });
    const opened = await lost.service.agent.open(openRequest([{ delay: 100 }, { say: 'answered anyway' }]));
    const done = await nextEvent(lost.service, opened.sessionId);
    assert.equal(done.kind, 'done', JSON.stringify(done));
    assert.equal(done.text, 'answered anyway');
    assert.ok(await cleaned(lost));
});

test('malformed events are ignored and never end or answer a session', async () => {
    const ctx = setup();
    const opened = await ctx.service.agent.open(openRequest([{ malformed: true }, { say: 'still fine' }]));
    const done = await nextEvent(ctx.service, opened.sessionId);
    assert.deepEqual([done.kind, done.text], ['done', 'still fine']);
    assert.ok(await cleaned(ctx));
});

test('CR-J18: agent sessions count against the harness concurrency, and the slot is reserved before the first await', async () => {
    const ctx = setup({ concurrency: 1 });
    const { service, fake } = ctx;
    const results = await Promise.all([
        service.agent.open(openRequest([{ hang: true }])),
        service.agent.open(openRequest([{ hang: true }], { role: 'curator' })),
    ]);
    assert.deepEqual(results.map((result) => (result.ok ? 'ok' : result.kind)).sort(), ['busy', 'ok']);
    assert.equal(service.gate.counts('opencode').running, 1, 'the session holds the harness slot a text call would need');
    assert.equal(service.gate.tryAcquire('opencode'), null);
    const opened = results.find((result) => result.ok);
    assert.ok(await until(() => fake.state.prompts.length === 1));
    await service.agent.close(opened.sessionId);
    assert.equal(service.gate.counts('opencode').running, 0);
    assert.ok(await until(() => fake.state.created.length === 1 && fake.state.removed.length === 1));
});

test('T6-3-3 MEDIUM: an agent session that ends on a usage limit holds the harness, so the next open fails fast', async () => {
    const ctx = setup();
    const { service, fake } = ctx;
    const opened = await service.agent.open(openRequest([{ fail: { type: 'provider.rate-limit', message: 'usage limit reached', status: 429 } }]));
    assert.equal(opened.ok, true, JSON.stringify(opened));
    const ended = await nextEvent(service, opened.sessionId);
    assert.deepEqual([ended.kind, ended.errorKind], ['ended', 'quota']);
    assert.ok((await service.status()).harnesses.opencode.quotaUntil > Date.now());
    const again = await service.agent.open(openRequest([{ hang: true }]));
    assert.deepEqual([again.ok, again.kind], [false, 'quota']);
    assert.equal(fake.state.created.length, 1, 'the held open creates no session');
});

test('an expired or missing OpenCode sign-in refuses the open with the owner\'s next step, and creates nothing', async () => {
    for (const [login, state, pattern] of [['expired', 'expired', /sign-in has expired.*opencode auth login.*renew/s], ['none', 'unpaired', /no OpenAI subscription sign-in.*opencode auth login/s], ['key', 'unpaired', /Only key credentials are saved/]]) {
        const ctx = setup({ fake: { login } });
        const opened = await ctx.service.agent.open(openRequest([{ hang: true }]));
        assert.deepEqual([opened.ok, opened.kind, opened.loginState ?? null], [false, 'auth', state], login);
        assert.match(opened.message, pattern);
        assert.equal(ctx.fake.state.created.length, 0);
        assert.deepEqual(ctx.calls(), []);
        assert.equal(ctx.service.gate.counts('opencode').running, 0);
    }
});

test('a wizard tool server that never connects ends the open as config, removes the directory and evicts the location', async () => {
    const ctx = setup({ fake: { mcpFail: true } });
    const opened = await ctx.service.agent.open(openRequest([{ hang: true }]));
    assert.equal(opened.ok, true, 'the open is admitted; the run reports the failure');
    const ended = await nextEvent(ctx.service, opened.sessionId);
    assert.deepEqual([ended.kind, ended.errorKind], ['ended', 'config']);
    assert.match(ended.message, /tool server \(failed/);
    assert.equal(ctx.fake.state.created.length, 0, 'no model session is created before its tools are connected');
    assert.ok(await until(() => ctx.fake.state.evicted.length === 1 && ctx.calls().length === 0 && ctx.service.agent.counts().sessions === 0));
});

test('an agent whose effective permissions keep a tool on is refused before any prompt', async () => {
    const ctx = setup({ fake: { dropPermissions: true } });
    const opened = await ctx.service.agent.open(openRequest([{ hang: true }]));
    const ended = await nextEvent(ctx.service, opened.sessionId);
    assert.deepEqual([ended.kind, ended.errorKind], ['ended', 'refused']);
    assert.equal(ctx.fake.state.prompts.length, 0);
});

test('vision: images ride the first prompt as inline attachments and a model without image input is refused', async () => {
    const ctx = setup();
    const opened = await ctx.service.agent.open(openRequest([{ say: 'seen' }], { images: [{ data: PNG, mime: 'image/png' }] }));
    const done = await nextEvent(ctx.service, opened.sessionId);
    assert.equal(done.kind, 'done', JSON.stringify(done));
    const [prompt] = ctx.fake.state.prompts;
    assert.equal(prompt.files.length, 1);
    assert.match(prompt.files[0].uri, /^data:image\/png;base64,/);
    assert.equal(prompt.files[0].uri.endsWith(PNG), true);
    const text = setup();
    const luna = await text.service.agent.open(openRequest([{ say: 'x' }], { model: 'openai/gpt-6-luna', images: [{ data: PNG }] }));
    assert.deepEqual([luna.ok, luna.kind], [false, 'config'], 'the open itself is refused, before any directory or session exists');
    assert.match(luna.message, /no image input/);
    const bad = await text.service.agent.open(openRequest([{ say: 'x' }], { images: [{ data: Buffer.from('not an image at all').toString('base64') }] }));
    assert.deepEqual([bad.ok, bad.kind], [false, 'refused']);
    assert.equal(text.fake.state.prompts.length, 0);
    assert.deepEqual(text.calls(), []);
});

test('the bridge config declares the tool server\'s own execution bound and the owned secret stays inside the owned directory', () => {
    const text = transport.bridgeConfig({ system: 's', nodePath: 'node', pipe: 'P', secret: 'SECRET', toolsFile: 'T', callTimeoutMs: 20_000 });
    const parsed = JSON.parse(text);
    assert.equal(parsed.mcp.servers.so.timeout.execution, 30_000);
    assert.equal(parsed.mcp.servers.so.environment.SO_BRIDGE_SECRET, 'SECRET');
    assert.deepEqual(parsed.agents[bridge.BRIDGE_AGENT].permissions, [{ action: '*', resource: '*', effect: 'deny' }, { action: 'so_*', resource: '*', effect: 'allow' }]);
});

test('the bridge config holding the owned secret is written owner-only', async () => {
    const writes = [];
    const fsImpl = { ...fs, writeFileSync: (file, data, options) => { writes.push({ file: String(file), options }); return fs.writeFileSync(file, data, options); } };
    const ctx = setup({ fsImpl });
    const opened = await ctx.service.agent.open(openRequest([{ say: 'ok' }]));
    const done = await nextEvent(ctx.service, opened.sessionId);
    assert.equal(done.kind, 'done', JSON.stringify(done));
    const config = writes.find((row) => row.file.endsWith('opencode.json'));
    assert.equal(config.options.mode, 0o600);
    assert.ok(await cleaned(ctx), 'the owned directory with the secret is removed');
});

test('a stalled OpenCode service cannot keep the owned directory: deadline, close and a refused setup all remove it and free the slot', async () => {
    for (const stall of ['create', 'prompt', 'agent']) {
        const ctx = setup({ concurrency: 1, fake: { stall: [stall] } });
        const opened = await ctx.service.agent.open(openRequest([{ say: 'never' }], { timeoutMs: 1500, callTimeoutMs: 1000 }));
        assert.equal(opened.ok, true, JSON.stringify(opened));
        assert.ok(await until(() => ctx.fake.state.held.length === 1), `${stall}: the setup call is pending`);
        assert.equal(ctx.calls().length, 1);
        assert.ok(await until(() => ctx.calls().length === 0 && ctx.service.gate.counts('opencode').running === 0, 10000), `${stall}: the deadline removed the owned directory`);
        ctx.fake.release();
        assert.ok(await until(() => ctx.fake.state.sessions.size === 0), `${stall}: no OpenCode session is left`);
    }
    const closing = setup({ fake: { stall: ['create'] } });
    const opened = await closing.service.agent.open(openRequest([{ say: 'never' }]));
    assert.ok(await until(() => closing.fake.state.held.length === 1));
    const started = Date.now();
    await closing.service.agent.close(opened.sessionId);
    assert.ok(Date.now() - started < 6000, 'close does not wait on the stalled service');
    assert.deepEqual(closing.calls(), []);
    assert.equal(closing.service.gate.counts('opencode').running, 0);
    closing.fake.release();
    assert.ok(await until(() => closing.fake.state.sessions.size === 0));
    const refused = setup({ fake: { dropPermissions: true } });
    const denied = await refused.service.agent.open(openRequest([{ hang: true }]));
    const ended = await nextEvent(refused.service, denied.sessionId);
    assert.equal(ended.errorKind, 'refused');
    assert.ok(await until(() => refused.calls().length === 0 && refused.service.gate.counts('opencode').running === 0), 'a refused setup removes the owned directory');
});

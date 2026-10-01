import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const plugin = await import(pathToFileURL(path.join(here, 'index.mjs')).href);
const bridge = await import(pathToFileURL(path.join(here, 'agentBridge.mjs')).href);
const shim = await import(pathToFileURL(path.join(here, 'mcpShim.mjs')).href);
const FAKE = path.join(here, 'fixtures', 'fake-opencode.mjs');

const HOUR = 3_600_000;
const MODEL = plugin.DEFAULT_MODELS.opencode[0].id;
const TOOLS = [
    { name: 'readStory', description: 'Read the draft.', inputSchema: { type: 'object', additionalProperties: false, properties: {}, required: [] } },
    { name: 'addQuality', description: 'Declare a quality.', inputSchema: { type: 'object', additionalProperties: false, properties: { quality: { type: ['object'], description: 'the quality' } }, required: ['quality'] } },
];

const alive = (pid) => {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
};

const until = async (check, ms = 5000) => {
    const started = Date.now();
    while (Date.now() - started < ms) {
        if (await check()) return true;
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return false;
};

function setup({ offer = true, warm = true } = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'so-bridge-test-'));
    const loginFile = path.join(root, 'auth.json');
    fs.writeFileSync(loginFile, JSON.stringify({ openai: { type: 'oauth', access: 'at', refresh: 'rt', expires: Date.now() + 5 * HOUR } }));
    const bin = path.join(root, 'opencode.exe');
    fs.writeFileSync(bin, '');
    const config = plugin.sanitizeConfig({ tmpRoot: path.join(root, 'tmp'), harnesses: { opencode: { binary: bin, loginFile, offer } } });
    if (warm) {
        fs.mkdirSync(path.join(config.tmpRoot, 'opencode-cache'), { recursive: true });
        fs.writeFileSync(path.join(config.tmpRoot, 'opencode-cache', '.so-warm'), 'x');
    }
    const spawned = [];
    const lines = [];
    const spawnImpl = (file, argv, options) => {
        if (argv[0] === '--version') {
            const child = new EventEmitter();
            child.pid = 1;
            child.stdout = new EventEmitter();
            child.stderr = new EventEmitter();
            child.stdin = { on() {}, end() { setImmediate(() => { child.stdout.emit('data', Buffer.from('1.18.33')); child.emit('close', 0); }); } };
            return child;
        }
        const child = spawn(process.execPath, [FAKE, ...argv], options);
        spawned.push({ file, argv, options, pid: child.pid });
        return child;
    };
    const service = plugin.createHarnessService({
        config,
        env: { PATH: process.env.PATH ?? process.env.Path ?? '', SystemRoot: process.env.SystemRoot ?? '', OPENAI_API_KEY: 'sk-canary', SO_SECRET_CANARY: 'x' },
        home: root,
        spawnImpl,
        log: (line) => lines.push(line),
    });
    return { root, config, service, spawned, lines, calls: () => (fs.existsSync(path.join(config.tmpRoot, 'calls')) ? fs.readdirSync(path.join(config.tmpRoot, 'calls')) : []) };
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

test('a tool call is parked, long-polled by next, answered to the shim, and the session ends with the answer', async () => {
    const { service, spawned, calls, lines } = setup();
    const opened = await service.agent.open(openRequest([{ call: 'readStory', args: {} }, { say: 'finished' }]));
    assert.equal(opened.ok, true, JSON.stringify(opened));
    const call = await nextEvent(service, opened.sessionId);
    assert.deepEqual(call, { kind: 'call', callId: 'c1', tool: 'readStory', args: {} });
    assert.deepEqual(service.agent.answer(opened.sessionId, { callId: 'c1', ok: true, text: 'STORY TEXT' }), { value: { answered: true } });
    const done = await nextEvent(service, opened.sessionId);
    assert.equal(done.kind, 'done');
    assert.match(done.text, /readStory:ok:STORY TEXT/);
    assert.match(done.text, /finished/);
    assert.ok(await until(() => service.agent.counts().sessions === 0 && calls().length === 0), 'the session and its owned home are gone');
    assert.ok(await until(() => !alive(spawned[0].pid)));
    assert.equal(lines.length, 1);
    assert.deepEqual(Object.keys(JSON.parse(lines[0].replace(/^agent /, ''))), ['harness', 'model', 'ms', 'calls', 'kind']);
    assert.ok(!lines[0].includes('STORY TEXT') && !lines[0].includes('Do the plan'), 'the log carries no prompt or answer text');
});

test('isolation: owned home, --pure, the env allowlist, no user config, and exactly the shim\'s tools', async () => {
    const { service, spawned, root } = setup();
    const opened = await service.agent.open(openRequest([{ list: true }]));
    const done = await nextEvent(service, opened.sessionId);
    assert.equal(done.kind, 'done', JSON.stringify(done));
    const listed = JSON.parse(done.text);
    assert.deepEqual(listed.exposed, ['so_readStory', 'so_addQuality']);
    assert.equal(listed.servers.length, 1);
    const [run] = spawned;
    assert.deepEqual(run.argv.slice(0, 6), ['run', '--pure', '--format', 'json', '--agent', bridge.BRIDGE_AGENT]);
    assert.ok(!run.argv.join(' ').includes('Do the plan'), 'the prompt goes on stdin, never argv');
    const env = run.options.env;
    assert.equal(env.OPENAI_API_KEY, undefined);
    assert.equal(env.SO_SECRET_CANARY, undefined);
    assert.equal(env.SO_BRIDGE_SECRET, undefined, 'the shim secret rides the MCP entry, not the CLI env');
    for (const key of ['XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'HOME', 'USERPROFILE']) assert.ok(env[key].startsWith(root), key);
    assert.equal(env.OPENCODE_DISABLE_PROJECT_CONFIG, '1');
    const config = JSON.parse(env.OPENCODE_CONFIG_CONTENT);
    assert.deepEqual(Object.keys(config.mcp), [bridge.BRIDGE_SERVER]);
    assert.deepEqual(config.mcp[bridge.BRIDGE_SERVER].command, [process.execPath, bridge.SHIM_PATH]);
    assert.deepEqual(Object.keys(config.agent), [bridge.BRIDGE_AGENT]);
    assert.deepEqual(config.agent[bridge.BRIDGE_AGENT].tools, { '*': false, 'so_*': true });
    assert.equal(run.options.shell, false);
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
    assert.match(doneTwo.text, /readStory:error:FOR-TWO/);
    assert.ok(!doneTwo.text.includes('FOR-ONE'));
    await service.shutdown();
});

test('the session deadline tears everything down even when the page never polls', async () => {
    const { service, spawned, calls } = setup();
    const opened = await service.agent.open(openRequest([{ hang: true }], { timeoutMs: 400 }));
    assert.equal(opened.ok, true);
    assert.ok(await until(() => spawned.length === 1));
    assert.ok(await until(() => service.agent.counts().sessions === 0 && calls().length === 0, 8000), 'torn down at the deadline');
    assert.ok(await until(() => !alive(spawned[0].pid)), 'the process tree is gone');
    const after = await service.agent.next(opened.sessionId, { waitMs: 10 });
    assert.deepEqual([after.event.kind, after.event.errorKind], ['ended', 'timeout']);
    assert.equal(service.agent.answer(opened.sessionId, { callId: 'c1', ok: true, text: 'late' }).error.status, 409);
});

test('a parked call nobody answers tears the session down at its call deadline', async () => {
    const { service, calls } = setup();
    const opened = await service.agent.open(openRequest([{ call: 'readStory', args: {} }], { callTimeoutMs: 300 }));
    const call = await nextEvent(service, opened.sessionId);
    assert.equal(call.kind, 'call');
    assert.ok(await until(() => service.agent.counts().sessions === 0 && calls().length === 0, 8000));
    const after = await service.agent.next(opened.sessionId, { waitMs: 10 });
    assert.equal(after.event.errorKind, 'timeout');
});

test('a tool the bridge does not own ends the session as refused', async () => {
    const { service, spawned } = setup();
    const opened = await service.agent.open(openRequest([{ foreign: 'bash' }, { hang: true }]));
    const ended = await nextEvent(service, opened.sessionId);
    assert.deepEqual([ended.kind, ended.errorKind], ['ended', 'refused']);
    assert.ok(await until(() => service.agent.counts().sessions === 0 && !alive(spawned[0].pid)));
});

test('one session per user and role: a second open replaces the first; close leaves nothing behind', async () => {
    const { service, calls } = setup();
    const first = await service.agent.open(openRequest([{ hang: true }]));
    const second = await service.agent.open(openRequest([{ hang: true }]));
    assert.equal(service.agent.counts().sessions, 1);
    const replaced = await service.agent.next(first.sessionId, { waitMs: 10 });
    assert.equal(replaced.event.errorKind, 'lapsed');
    assert.deepEqual(await service.agent.close(second.sessionId), { value: { closed: true } });
    assert.equal(service.agent.counts().sessions, 0);
    assert.equal(calls().length, 0);
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

test('tool schemas are validated on open', () => {
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
    ];
    for (const [patch, pattern] of cases) assert.match(bridge.validateOpen({ ...base, ...patch }, config, plugin.LIMITS).issue ?? '', pattern, JSON.stringify(patch).slice(0, 80));
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

test('admin, offer, header and same-origin guards refuse before anything spawns', async () => {
    const { service, config, spawned } = setup();
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
    const cold = setup({ warm: false });
    const unwarmed = fakeResponse();
    await plugin.createHandlers(cold.service, cold.config).agentOpen(body(request), unwarmed.res);
    assert.match(unwarmed.out.body.message, /not warmed/);
    assert.equal(spawned.length + off.spawned.length + cold.spawned.length, 0);
    assert.equal((await service.status()).harnesses.opencode.agentBridge, true);
    assert.equal((await off.service.status()).harnesses.opencode.agentBridge, false);
    assert.equal((await service.status()).harnesses.claude.agentBridge, false);
});

test('the routes drive a whole session: open, next, answer, close', async () => {
    const { service, config } = setup();
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
});

test('shutdown tears every session down', async () => {
    const { service, spawned, calls } = setup();
    await service.agent.open(openRequest([{ hang: true }]));
    await service.agent.open(openRequest([{ hang: true }], { role: 'curator' }));
    assert.equal(service.agent.counts().sessions, 2);
    await service.shutdown();
    assert.equal(service.agent.counts().sessions, 0);
    assert.equal(calls().length, 0);
    assert.ok(await until(() => spawned.every((run) => !alive(run.pid))));
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

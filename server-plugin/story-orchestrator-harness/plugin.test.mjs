import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const plugin = await import(pathToFileURL(path.join(here, 'index.mjs')).href);

const HOUR = 3_600_000;
const NOW = Date.parse('2026-09-30T12:00:00Z');
const jwt = (exp) => `h.${Buffer.from(JSON.stringify({ exp: Math.floor(exp / 1000) })).toString('base64url')}.s`;
const LOGINS = {
    claude: (expiresAt) => ({ claudeAiOauth: { accessToken: 'at', refreshToken: 'rt', expiresAt } }),
    codex: (expiresAt) => ({ tokens: { access_token: jwt(expiresAt), refresh_token: 'rt' }, last_refresh: new Date(NOW - HOUR).toISOString() }),
    opencode: (expiresAt) => ({ openai: { type: 'oauth', access: 'at', refresh: 'rt', expires: expiresAt } }),
};

const OUTPUTS = {
    claude: (text) => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: text, stop_reason: 'end_turn', usage: { input_tokens: 400, cache_read_input_tokens: 2, output_tokens: 3 }, total_cost_usd: 0.001 }),
    codex: (text) => [
        { type: 'thread.started', thread_id: 't' }, { type: 'turn.started' },
        { type: 'item.completed', item: { id: 'i0', type: 'reasoning', text: 'thinking' } },
        { type: 'item.completed', item: { id: 'i1', type: 'agent_message', text } },
        { type: 'turn.completed', usage: { input_tokens: 900, cached_input_tokens: 0, output_tokens: 4 } },
    ].map((event) => JSON.stringify(event)).join('\n'),
    opencode: (text) => [
        { type: 'step_start', part: {} }, { type: 'text', part: { type: 'text', text } },
        { type: 'step_finish', part: { reason: 'stop', tokens: { input: 133, output: 2, cache: { read: 0 } } } },
    ].map((event) => JSON.stringify(event)).join('\n'),
};

const RECORDED = {
    claudeLoggedOut: JSON.stringify({ type: 'result', subtype: 'success', is_error: true, api_error_status: null, result: 'Not logged in · Please run /login' }),
    codexLoggedOut: [
        { type: 'thread.started', thread_id: 't' }, { type: 'turn.started' },
        { type: 'error', message: 'Reconnecting... 2/5 (unexpected status 401 Unauthorized: Missing bearer or basic authentication in header, url: wss://api.openai.com/v1/responses)' },
    ].map((event) => JSON.stringify(event)).join('\n'),
    codexQuota: JSON.stringify({ type: 'error', message: "You've hit your usage limit. Upgrade to Pro or try again at Sep 27th, 2026 8:58 PM." }),
    opencodeUnknown: JSON.stringify({ type: 'error', error: { name: 'UnknownError', data: { message: 'Unexpected server error. Check server logs for details.' } } }),
    opencode429: JSON.stringify({ type: 'error', error: { name: 'APIError', data: { message: 'Insufficient balance', statusCode: 429, isRetryable: true } } }),
    opencodeTool: [JSON.stringify({ type: 'tool_use', part: { type: 'tool', tool: 'bash' } }), OUTPUTS.opencode('done')].join('\n'),
};

const tempRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'so-harness-test-'));

const until = async (check, ms = 10000) => {
    const started = Date.now();
    while (Date.now() - started < ms) {
        if (await check()) return true;
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return false;
};

function fakeProcesses(script) {
    const children = new Map();
    const calls = [];
    const killed = [];
    const spawnImpl = (bin, argv, options) => {
        const child = new EventEmitter();
        child.pid = 5000 + calls.length;
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        const call = { bin, argv, options, stdin: null, pid: child.pid, cwdListing: fs.existsSync(options.cwd) ? fs.readdirSync(options.cwd) : null };
        calls.push(call);
        children.set(child.pid, child);
        child.stdin = { on() {}, end(data) { call.stdin = data ?? ''; setImmediate(() => script(child, call)); } };
        setImmediate(() => child.emit('spawn'));
        return child;
    };
    const killTree = (pid) => {
        killed.push(pid);
        setImmediate(() => children.get(pid)?.emit('close', null));
        return Promise.resolve();
    };
    return { spawnImpl, killTree, calls, killed };
}

const answering = (harness, text = 'PONG') => (child) => {
    child.stdout.emit('data', Buffer.from(OUTPUTS[harness](text)));
    child.emit('close', 0);
};
const emitting = (stdout, code = 1) => (child) => {
    child.stdout.emit('data', Buffer.from(stdout));
    child.emit('close', code);
};
const hanging = () => undefined;

function setup({ harness = 'claude', offer = true, expiresAt = NOW + 5 * HOUR, script = answering(harness), extraConfig = {}, warm = true, extraEnv = {} } = {}) {
    const root = tempRoot();
    const loginFile = path.join(root, 'real-login.json');
    fs.writeFileSync(loginFile, JSON.stringify(LOGINS[harness](expiresAt)));
    const bin = path.join(root, `${harness}.exe`);
    fs.writeFileSync(bin, '');
    const config = plugin.sanitizeConfig({ tmpRoot: path.join(root, 'tmp'), harnesses: { [harness]: { binary: bin, loginFile, offer }, ...extraConfig } });
    const processes = fakeProcesses(script);
    const versionCalls = [];
    const versions = (bin2, argv, options) => (argv[0] === '--version'
        ? (() => { versionCalls.push(bin2); const c = new EventEmitter(); c.pid = 1; c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.stdin = { on() {}, end() { setImmediate(() => { c.stdout.emit('data', Buffer.from('9.9.9')); c.emit('close', 0); }); } }; return c; })()
        : processes.spawnImpl(bin2, argv, options));
    const lines = [];
    const service = plugin.createHarnessService({ config, env: { PATH: '', ANTHROPIC_API_KEY: 'sk-canary', ANTHROPIC_AUTH_TOKEN: 'canary', SO_SECRET_CANARY: 'x', HTTPS_PROXY: 'http://proxy:1', ...extraEnv }, home: root, spawnImpl: versions, killTree: processes.killTree, now: () => NOW, log: (line) => lines.push(line) });
    if (warm && harness === 'opencode') {
        fs.mkdirSync(path.join(config.tmpRoot, 'opencode-cache'), { recursive: true });
        fs.writeFileSync(path.join(config.tmpRoot, 'opencode-cache', '.so-warm'), 'x');
    }
    return { root, loginFile, config, service, processes, lines, versionCalls, spawnImpl: versions };
}

const request = (harness, overrides = {}) => ({
    requestId: 'r1', harness, model: plugin.DEFAULT_MODELS[harness][0].id, role: 'read', system: 'You are a reader.', prompt: 'Reply with exactly: PONG', timeoutMs: 30_000, maxOutputChars: 4000, effort: null, ...overrides,
});

test('info satisfies the ST loader contract', () => {
    assert.match(plugin.info.id, /^[a-z0-9_-]+$/);
    assert.equal(typeof plugin.init, 'function');
    assert.equal(typeof plugin.default.exit, 'function');
});

test('config defaults: nothing offered, admin-only, every knob bounded', () => {
    const config = plugin.sanitizeConfig({ harnesses: { claude: { concurrency: 99, queueLimit: -1, models: [{ id: 'bad model!' }] } } });
    assert.equal(config.allowNonAdmin, false);
    for (const id of plugin.HARNESS_IDS) assert.equal(config.harnesses[id].offer, false);
    assert.equal(config.harnesses.claude.concurrency, 8);
    assert.equal(config.harnesses.claude.queueLimit, 8);
    assert.deepEqual(config.harnesses.claude.models.map((model) => model.id), ['haiku', 'sonnet', 'opus']);
});

test('rule 1-2: fixed argv per harness; the prompt and the system text never reach argv or env', () => {
    const hostile = `--model x; rm -rf / && $(whoami) \`id\`\n${'z'.repeat(40_000)}`;
    for (const harness of plugin.HARNESS_IDS) {
        const home = { home: '/o/home', config: '/o/config', data: '/o/data', cache: '/o/cache', state: '/o/state', tmp: '/o/tmp', cwd: '/o/cwd', systemFile: '/o/tmp/system.txt' };
        const argv = plugin.buildArgv(harness, { model: 'm', systemFile: home.systemFile, cwd: home.cwd });
        const env = plugin.childEnv(harness, home, {});
        const joined = JSON.stringify([argv, env]);
        assert.ok(!joined.includes('rm -rf'), harness);
        assert.equal(plugin.stdinFor(harness, { system: hostile, prompt: 'p' }).includes('rm -rf'), harness === 'codex');
        assert.equal(plugin.stdinFor(harness, { system: 's', prompt: hostile }).includes(hostile), true);
    }
    assert.deepEqual(plugin.buildArgv('claude', { model: 'haiku', systemFile: 'S', cwd: 'C' }).slice(0, 9), ['-p', '--tools', '', '--strict-mcp-config', '--setting-sources', '', '--no-session-persistence', '--exclude-dynamic-system-prompt-sections', '--system-prompt-file']);
    const codex = plugin.buildArgv('codex', { model: 'default', systemFile: 'S', cwd: 'C' });
    for (const flag of ['--ignore-user-config', '--ephemeral', '--ignore-rules']) assert.ok(codex.includes(flag));
    for (const feature of plugin.CODEX_TOOL_FEATURES) assert.ok(codex.join(' ').includes(`--disable ${feature}`));
    assert.ok(!codex.includes('-m'));
    assert.deepEqual(plugin.buildArgv('opencode', { model: 'openai/gpt-6-astra', systemFile: 'S', cwd: 'C' }).slice(0, 6), ['run', '--pure', '--format', 'json', '--agent', 'so-text']);
});

test('effort maps per harness, and anything off the list sends nothing', () => {
    assert.deepEqual(plugin.buildArgv('claude', { model: 'm', effort: 'high', systemFile: 'S', cwd: 'C' }).slice(-2), ['--effort', 'high']);
    assert.ok(plugin.buildArgv('codex', { model: 'm', effort: 'low', systemFile: 'S', cwd: 'C' }).includes('model_reasoning_effort="low"'));
    assert.deepEqual(plugin.buildArgv('opencode', { model: 'm', effort: 'medium', systemFile: 'S', cwd: 'C' }).slice(-2), ['--variant', 'medium']);
    assert.ok(!plugin.buildArgv('codex', { model: 'm', effort: '"x" --danger', systemFile: 'S', cwd: 'C' }).join(' ').includes('danger'));
});

test('rule 5: ST\'s environment stays out of the child; named pass-through variables arrive unchanged', () => {
    const parent = { ANTHROPIC_API_KEY: 'k', ANTHROPIC_AUTH_TOKEN: 't', OPENAI_API_KEY: 'o', SO_SECRET_CANARY: 'c', HTTPS_PROXY: 'http://p:1', NODE_EXTRA_CA_CERTS: '/ca.pem', DO_NOT_TRACK: '1', PATH: '/bin' };
    const home = { home: 'C:\\o\\home', config: 'C:\\o\\config', data: 'C:\\o\\data', cache: 'C:\\o\\cache', state: 'C:\\o\\state', tmp: 'C:\\o\\tmp', cwd: 'C:\\o\\cwd', systemFile: 'C:\\o\\tmp\\system.txt' };
    for (const harness of plugin.HARNESS_IDS) {
        const env = plugin.childEnv(harness, home, parent);
        for (const secret of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'OPENAI_API_KEY', 'SO_SECRET_CANARY']) assert.equal(env[secret], undefined, `${harness} ${secret}`);
        for (const key of ['HTTPS_PROXY', 'NODE_EXTRA_CA_CERTS', 'DO_NOT_TRACK', 'PATH']) assert.equal(env[key], parent[key]);
        assert.equal(env.HOME, home.home);
        assert.equal(env.HOMEDRIVE, 'C:');
    }
    assert.equal(plugin.childEnv('claude', home, parent).CLAUDE_CONFIG_DIR, home.config);
    assert.equal(plugin.childEnv('codex', home, parent).CODEX_HOME, home.config);
    const opencode = plugin.childEnv('opencode', home, parent);
    assert.equal(opencode.OPENCODE_DISABLE_MODELS_FETCH, '1');
    assert.equal(JSON.parse(opencode.OPENCODE_CONFIG_CONTENT).agent['so-text'].prompt, `{file:${home.systemFile}}`);
    assert.deepEqual(JSON.parse(opencode.OPENCODE_CONFIG_CONTENT).agent['so-text'].tools, { '*': false });
});

test('rule 1 / P0-6: a script shim is never spawned', () => {
    const exists = (file) => [path.join('/bin', 'claude.cmd'), path.join('/usr/bin', 'opencode')].includes(file);
    assert.match(plugin.resolveBinary('claude', { env: { PATH: '/bin' }, platform: 'win32', exists: (file) => file === path.join('/bin', 'claude.cmd') }).error, /script shim/);
    assert.match(plugin.resolveBinary('claude', { configured: 'C:/x/claude.ps1', exists }).error, /script shim/);
    assert.equal(plugin.resolveBinary('opencode', { env: { PATH: '/usr/bin' }, platform: 'linux', exists }).path, path.join('/usr/bin', 'opencode'));
});

test('B1: a login that expires within the window is refused, never refreshed in a copy', () => {
    const root = tempRoot();
    for (const harness of plugin.HARNESS_IDS) {
        const file = path.join(root, `${harness}.json`);
        fs.writeFileSync(file, JSON.stringify(LOGINS[harness](NOW + 30 * 60_000)));
        const stale = plugin.loginFreshness(harness, file, { now: NOW });
        assert.equal(stale.fresh, false, harness);
        assert.match(stale.reason, new RegExp(`run \`${harness}\` once`));
        fs.writeFileSync(file, JSON.stringify(LOGINS[harness](NOW + 3 * HOUR)));
        assert.equal(plugin.loginFreshness(harness, file, { now: NOW }).fresh, true, harness);
    }
    assert.equal(plugin.loginFreshness('claude', path.join(root, 'missing.json'), { now: NOW }).loggedIn, false);
    fs.writeFileSync(path.join(root, 'key.json'), JSON.stringify({ OPENAI_API_KEY: 'sk-x' }));
    assert.equal(plugin.loginFreshness('codex', path.join(root, 'key.json'), { now: NOW }).fresh, false, 'B5: an API key is not a subscription login');
});

test('rule 10: output is classified from the harness\'s own words (recorded Phase 0 shapes)', () => {
    const run = (stdout, extra = {}) => ({ stdout, stderr: '', code: 1, killed: null, spawnError: null, ...extra });
    assert.deepEqual(plugin.classify('claude', run(OUTPUTS.claude('PONG'), { code: 0 })), { ok: true, text: 'PONG', finish: 'stop', usage: { input: 402, output: 3, costUsd: 0.001 } });
    assert.equal(plugin.classify('codex', run(OUTPUTS.codex('PONG'), { code: 0 })).text, 'PONG');
    assert.equal(plugin.classify('opencode', run(OUTPUTS.opencode('PONG'), { code: 0 })).usage.input, 133);
    assert.equal(plugin.classify('claude', run(RECORDED.claudeLoggedOut)).kind, 'auth');
    assert.equal(plugin.classify('codex', run(RECORDED.codexLoggedOut)).kind, 'auth');
    const quota = plugin.classify('codex', run(RECORDED.codexQuota), { now: Date.parse('2026-09-25T12:00:00Z') });
    assert.equal(quota.kind, 'quota');
    assert.equal(new Date(quota.retryAt).getFullYear(), 2026);
    assert.equal(plugin.classify('opencode', run(RECORDED.opencode429)).kind, 'quota');
    assert.equal(plugin.classify('opencode', run(RECORDED.opencodeUnknown)).kind, 'transport', 'P0-4: opencode cannot tell logged-out from a bad model');
    assert.equal(plugin.classify('opencode', run(RECORDED.opencodeTool, { code: 0 })).kind, 'refused');
    assert.equal(plugin.classify('claude', run('', { spawnError: 'ENOENT spawn' })).kind, 'config');
    assert.equal(plugin.classify('claude', run('', { killed: 'deadline' })).kind, 'timeout');
    assert.equal(plugin.classify('claude', run('garbage', { code: 0 })).kind, 'malformed');
    assert.match(plugin.classify('codex', run(JSON.stringify({ type: 'error', message: 'self signed certificate in certificate chain' }))).message, /proxy or CA/);
    const bound = plugin.classify('opencode', run(OUTPUTS.opencode('x'.repeat(50)), { killed: 'output-bound' }), { maxOutputChars: 10 });
    assert.deepEqual([bound.ok, bound.finish, bound.text.length], [true, 'length', 10]);
});

test('rule 6 / P0-3: the deadline kills the process tree and answers timeout', async () => {
    const processes = fakeProcesses(hanging);
    const started = Date.now();
    const run = await plugin.runProcess({ bin: 'x', argv: [], env: {}, cwd: os.tmpdir(), stdin: 'p', deadlineMs: 50, maxOutputChars: 100, spawnImpl: processes.spawnImpl, killTree: processes.killTree });
    assert.equal(run.killed, 'deadline');
    assert.deepEqual(processes.killed, [processes.calls[0].pid]);
    assert.ok(Date.now() - started < 5000);
    assert.equal(processes.calls[0].options.shell, false);
    assert.equal(processes.calls[0].stdin, 'p');
});

test('rule 7: two per harness at once, one per user and role, and only overflow is refused', async () => {
    const gate = plugin.createGate(plugin.sanitizeConfig({ harnesses: { claude: { concurrency: 2, queueLimit: 3 } } }));
    const first = await gate.acquire('claude', 'u|claude|read');
    const sameRole = gate.acquire('claude', 'u|claude|read');
    const other = await gate.acquire('claude', 'u|claude|synthesis');
    assert.deepEqual(gate.counts('claude'), { running: 2, queued: 1 });
    gate.acquire('claude', 'u|claude|curator');
    gate.acquire('claude', 'u|claude|director');
    assert.equal(gate.acquire('claude', 'u|claude|x'), null);
    first();
    const second = await sameRole;
    assert.equal(typeof second, 'function');
    other();
    second();
});

test('a routed call runs in an owned home that is gone afterwards; the real login is copied, never changed', async () => {
    const { service, processes, loginFile, config } = setup({ harness: 'claude' });
    const before = fs.readFileSync(loginFile, 'utf8');
    const system = `system ${'s'.repeat(40_000)} ; && $(x)`;
    const answer = await service.complete(request('claude', { system, prompt: 'P'.repeat(40_000) }));
    assert.equal(answer.ok, true, JSON.stringify(answer));
    assert.equal(answer.text, 'PONG');
    const call = processes.calls[0];
    assert.deepEqual(call.cwdListing, [], 'rule 4: the cwd is empty at spawn');
    assert.equal(call.stdin, 'P'.repeat(40_000));
    assert.ok(!JSON.stringify([call.argv, call.options.env]).includes('s'.repeat(100)));
    assert.ok(!JSON.stringify([call.argv, call.options.env]).includes('P'.repeat(100)));
    assert.equal(call.options.env.ANTHROPIC_API_KEY, undefined);
    assert.equal(call.options.env.HTTPS_PROXY, 'http://proxy:1');
    assert.equal(fs.readFileSync(loginFile, 'utf8'), before);
    assert.ok(await until(() => fs.readdirSync(path.join(config.tmpRoot, 'calls')).length === 0), 'the owned home is gone');
});

test('not offered, not logged in, or not warmed: refused before anything spawns', async () => {
    const off = setup({ harness: 'claude', offer: false });
    assert.equal((await off.service.complete(request('claude'))).kind, 'config');
    const stale = setup({ harness: 'codex', expiresAt: NOW + 10 * 60_000 });
    const auth = await stale.service.complete(request('codex'));
    assert.equal(auth.kind, 'auth');
    assert.match(auth.message, /run `codex` once/);
    const cold = setup({ harness: 'opencode', warm: false });
    assert.match((await cold.service.complete(request('opencode'))).message, /not warmed/);
    for (const { processes } of [off, stale, cold]) assert.equal(processes.calls.length, 0);
});

test('a quota answer holds the harness until its retry time without spawning again', async () => {
    const { service, processes } = setup({ harness: 'codex', script: emitting(JSON.stringify({ type: 'error', message: 'usage limit reached, try again at Oct 1st, 2026 9:00 AM' })) });
    const first = await service.complete(request('codex'));
    assert.equal(first.kind, 'quota');
    const second = await service.complete(request('codex', { requestId: 'r2' }));
    assert.equal(second.kind, 'quota');
    assert.equal(processes.calls.length, 1);
    assert.ok((await service.status()).harnesses.codex.quotaUntil > NOW);
});

test('a real login file that changes during a call holds every later call', async () => {
    const holder = {};
    const { service, processes, loginFile } = setup({
        harness: 'claude',
        script: (child) => {
            fs.writeFileSync(holder.loginFile, JSON.stringify(LOGINS.claude(NOW + 9 * HOUR)));
            answering('claude')(child);
        },
    });
    holder.loginFile = loginFile;
    await service.complete(request('claude'));
    const held = await service.complete(request('claude', { requestId: 'r2' }));
    assert.equal(held.kind, 'auth');
    assert.match(held.message, /real login file changed/);
    assert.equal(processes.calls.length, 1);
});

test('rule 11: the log line carries harness, model, ms, usage and kind only', async () => {
    const { service, lines } = setup({ harness: 'opencode', script: answering('opencode', 'REPLYCANARY') });
    await service.complete(request('opencode', { prompt: 'PROMPTCANARY' }));
    assert.equal(lines.length, 1);
    assert.deepEqual(Object.keys(JSON.parse(lines[0])), ['harness', 'model', 'ms', 'usage', 'kind']);
    assert.ok(!lines[0].includes('CANARY'));
});

const body = (value, headers = {}) => {
    const stream = Readable.from([Buffer.from(typeof value === 'string' ? value : JSON.stringify(value))]);
    stream.headers = { 'x-so-plugin': '1', 'content-type': 'text/plain;charset=UTF-8', host: 'st.local', ...headers };
    stream.user = { profile: { handle: 'default-user', admin: true } };
    return stream;
};
const fakeResponse = () => {
    const out = { statusCode: 200, body: undefined };
    const res = { writableFinished: false, status(code) { out.statusCode = code; return res; }, json(value) { out.body = value; res.writableFinished = true; return res; }, on() {} };
    return { res, out };
};

test('rules 8-10: header, origin, admin and body bounds are checked before any spawn', async () => {
    const { service, processes, config } = setup({ harness: 'claude' });
    const handlers = plugin.createHandlers(service, config);
    const cases = [
        [body(request('claude'), { 'x-so-plugin': undefined }), 403],
        [body(request('claude'), { origin: 'https://evil.example' }), 403],
        [body(request('claude'), { 'sec-fetch-site': 'cross-site' }), 403],
        [Object.assign(body(request('claude')), { user: { profile: { handle: 'guest', admin: false } } }), 403],
        [Object.assign(body(request('claude')), { user: undefined }), 403],
        [Object.assign(body(request('claude'), { 'content-type': 'application/json' }), { body: { harness: 'claude' } }), 415],
        [body('x'.repeat(plugin.LIMITS.maxBodyBytes + 10)), 413],
    ];
    for (const [req, status] of cases) {
        const { res, out } = fakeResponse();
        await handlers.complete(req, res);
        assert.equal(out.statusCode, status, JSON.stringify(out.body));
    }
    const unlisted = fakeResponse();
    await handlers.complete(body(request('claude', { model: 'claude-9-ultra' })), unlisted.res);
    assert.equal(unlisted.out.body.kind, 'config');
    const oversized = fakeResponse();
    await handlers.complete(body(request('claude', { prompt: 'x'.repeat(plugin.LIMITS.maxPromptChars + 1) })), oversized.res);
    assert.equal(oversized.out.body.kind, 'refused');
    assert.equal(processes.calls.length, 0);
    const allowed = fakeResponse();
    await handlers.complete(body(request('claude')), allowed.res);
    assert.equal(allowed.out.body.ok, true, 'the default single-user install (accounts off, admin) is allowed');
});

test('cancel stops only the call of the user who made it', async () => {
    const { service, processes } = setup({ harness: 'claude', script: hanging });
    const pending = service.complete(request('claude', { requestId: 'mine' }), { user: 'alice' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(service.cancel('mine', 'bob'), false);
    assert.equal(service.cancel('mine', 'alice'), true);
    assert.equal((await pending).kind, 'lapsed');
    assert.equal(processes.killed.length, 1);
});

test('status: offered, login state and counters, and the binary path for admins only', async () => {
    const { service } = setup({ harness: 'claude' });
    const admin = await service.status({ admin: true });
    assert.equal(admin.harnesses.claude.installed, true);
    assert.equal(admin.harnesses.claude.version, '9.9.9');
    assert.equal(admin.harnesses.claude.offered, true);
    assert.equal(admin.harnesses.claude.fresh, true);
    assert.equal(typeof admin.harnesses.claude.path, 'string');
    assert.equal((await service.status()).harnesses.claude.path, undefined);
    assert.equal(admin.harnesses.codex.offered, false);
});

test('HARNESS_LIVE=1: one real PONG per offered, logged-in harness', { skip: process.env.HARNESS_LIVE !== '1' }, async () => {
    const config = plugin.loadConfig();
    const service = plugin.createHarnessService({ config });
    const status = await service.status({ refresh: true });
    for (const harness of plugin.HARNESS_IDS) {
        const row = status.harnesses[harness];
        if (!row.offered || !row.installed || !row.fresh) {
            console.log(`${harness}: skipped (${!row.offered ? 'not offered' : !row.installed ? row.problem : row.loginProblem})`);
            continue;
        }
        const answer = await service.complete(request(harness, { requestId: `live-${harness}`, model: row.models[0].id, timeoutMs: 120_000 }));
        console.log(harness, JSON.stringify({ ok: answer.ok, kind: answer.kind ?? null, text: answer.text?.slice(0, 20) ?? null, ms: answer.ms, usage: answer.usage ?? null }));
        assert.equal(answer.ok, true, answer.message);
    }
});

const abortingBody = (headers = {}) => {
    const stream = new Readable({ read() {} });
    stream.push(Buffer.from('{"requestId":"r1","harn'));
    setImmediate(() => stream.destroy(Object.assign(new Error('aborted'), { code: 'ECONNRESET' })));
    stream.headers = { 'x-so-plugin': '1', 'content-type': 'text/plain;charset=UTF-8', host: 'st.local', ...headers };
    stream.user = { profile: { handle: 'default-user', admin: true } };
    return stream;
};

test('CR-J1: a request stream aborted mid-body answers 400 on every route instead of rejecting the handler', async () => {
    const { service, config, processes } = setup({ harness: 'claude' });
    const handlers = plugin.createHandlers(service, config);
    for (const route of ['complete', 'cancel', 'warm', 'agentOpen', 'agentNext', 'agentAnswer', 'agentClose']) {
        const { res, out } = fakeResponse();
        await handlers[route](abortingBody(), res);
        assert.equal(out.statusCode, 400, route);
        assert.match(out.body.error, /could not be read/, route);
    }
    assert.equal(processes.calls.length, 0);
});

test('CR-J1: a route whose handler throws or rejects answers 500 once, and never writes over a sent response', async () => {
    const logged = [];
    const thrown = fakeResponse();
    await plugin.guardRoute(() => { throw new Error('sync boom'); }, (line) => logged.push(line))(body({}), thrown.res);
    assert.equal(thrown.out.statusCode, 500);
    const rejected = fakeResponse();
    await plugin.guardRoute(async () => { throw new Error('async boom'); }, (line) => logged.push(line))(body({}), rejected.res);
    assert.equal(rejected.out.statusCode, 500);
    const sent = fakeResponse();
    sent.res.headersSent = true;
    await plugin.guardRoute(async () => { throw new Error('late boom'); }, (line) => logged.push(line))(body({}), sent.res);
    assert.equal(sent.out.statusCode, 200, 'nothing is written after the headers went out');
    assert.equal(logged.length, 3);
    assert.match(logged[1], /async boom/);
});

test('CR-J1: a failing owned-home step answers a config error and leaves no home behind', async () => {
    const { config, loginFile, spawnImpl, processes } = setup({ harness: 'claude' });
    const fsImpl = { ...fs, writeFileSync: (file, ...rest) => { if (String(file).endsWith('system.txt')) throw Object.assign(new Error('disk full'), { code: 'ENOSPC' }); return fs.writeFileSync(file, ...rest); } };
    const service = plugin.createHarnessService({ config: { ...config, harnesses: { ...config.harnesses, claude: { ...config.harnesses.claude, loginFile } } }, env: { PATH: '' }, spawnImpl, killTree: processes.killTree, fsImpl, now: () => NOW, log: () => undefined });
    const answer = await service.complete(request('claude'));
    assert.deepEqual([answer.ok, answer.kind], [false, 'config']);
    assert.match(answer.message, /ENOSPC/);
    assert.equal(processes.calls.length, 0);
    assert.deepEqual(fs.readdirSync(path.join(config.tmpRoot, 'calls')), []);
    assert.equal(service.gate.counts('claude').running, 0, 'the slot is released');
});

test('CR-J2: the owned home is removed with retries, a home that stays is counted and logged, and init sweeps stale homes', async () => {
    const { config, loginFile, spawnImpl, processes } = setup({ harness: 'claude' });
    const removals = [];
    const home = plugin.openOwnedHome('claude', { tmpRoot: config.tmpRoot, loginFile, fsImpl: fs });
    plugin.closeOwnedHome(home, { ...fs, rmSync: (target, options) => { removals.push([target, options]); return fs.rmSync(target, options); } });
    const rootRemoval = removals.find(([target]) => target === home.root);
    assert.equal(rootRemoval?.[1].maxRetries, 10);
    assert.equal(rootRemoval?.[1].retryDelay, 100);
    const lines = [];
    const stuck = { ...fs, rmSync: (target, options) => (String(target).includes(`${path.sep}calls${path.sep}`) ? undefined : fs.rmSync(target, options)) };
    const leaky = plugin.createHarnessService({ config, env: { PATH: '' }, spawnImpl, killTree: processes.killTree, fsImpl: stuck, now: () => NOW, log: (line) => lines.push(line) });
    assert.equal((await leaky.complete(request('claude'))).ok, true);
    assert.equal(leaky.state.claude.leakedHomes, 1);
    assert.equal((await leaky.status()).harnesses.claude.leakedHomes, 1);
    assert.ok(lines.some((line) => line.includes('leakedHome')));
    assert.equal(fs.readdirSync(path.join(config.tmpRoot, 'calls')).length, 1);
    const swept = [];
    plugin.createHarnessService({ config, env: { PATH: '' }, spawnImpl, killTree: processes.killTree, now: () => NOW, log: (line) => swept.push(line) });
    assert.deepEqual(fs.readdirSync(path.join(config.tmpRoot, 'calls')), [], 'a new service sweeps what an earlier one left');
    assert.match(swept[0], /"sweptHomes":1/);
});

test('CR-J6: a held harness says so in its status row, and a fresh login re-arms it without a restart', async () => {
    const holder = {};
    const { service, processes, loginFile } = setup({
        harness: 'claude',
        script: (child) => {
            if (!holder.done) fs.writeFileSync(holder.loginFile, JSON.stringify(LOGINS.claude(NOW + 9 * HOUR)));
            holder.done = true;
            answering('claude')(child);
        },
    });
    holder.loginFile = loginFile;
    await service.complete(request('claude'));
    const held = (await service.status()).harnesses.claude;
    assert.match(held.blocked, /real login file changed/);
    assert.equal((await service.complete(request('claude', { requestId: 'r2' }))).kind, 'auth');
    fs.writeFileSync(loginFile, JSON.stringify(LOGINS.claude(NOW + 10 * HOUR)));
    assert.equal((await service.status()).harnesses.claude.blocked, null);
    assert.equal((await service.complete(request('claude', { requestId: 'r3' }))).ok, true);
    assert.equal(processes.calls.length, 2);
});

test('CR-J9: the owned home carries only the routed provider\'s OAuth entry, never an API key', async () => {
    const seen = {};
    const { service, loginFile } = setup({
        harness: 'opencode',
        script: (child, call) => {
            seen.copy = JSON.parse(fs.readFileSync(path.join(call.options.env.XDG_DATA_HOME, 'opencode', 'auth.json'), 'utf8'));
            answering('opencode')(child);
        },
    });
    fs.writeFileSync(loginFile, JSON.stringify({
        openai: { type: 'oauth', access: 'at', refresh: 'rt', expires: NOW + 5 * HOUR },
        anthropic: { type: 'api', key: 'sk-api-canary' },
        github: { type: 'oauth', access: 'gh', refresh: 'gr', expires: NOW + 5 * HOUR },
    }));
    assert.equal((await service.complete(request('opencode'))).ok, true);
    assert.deepEqual(Object.keys(seen.copy), ['openai']);
    assert.ok(!JSON.stringify(seen.copy).includes('sk-api-canary'));
});

test('CR-J19: only the routed model\'s provider login decides freshness', async () => {
    const { service, loginFile, processes } = setup({ harness: 'opencode' });
    fs.writeFileSync(loginFile, JSON.stringify({
        openai: { type: 'oauth', access: 'at', refresh: 'rt', expires: NOW + 5 * HOUR },
        github: { type: 'oauth', access: 'gh', refresh: 'gr', expires: NOW + 10 * 60_000 },
    }));
    assert.equal((await service.complete(request('opencode'))).ok, true);
    assert.equal((await service.status()).harnesses.opencode.fresh, true);
    fs.writeFileSync(loginFile, JSON.stringify({ openai: { type: 'oauth', access: 'at', refresh: 'rt', expires: NOW + 10 * 60_000 }, github: { type: 'oauth', access: 'gh', refresh: 'gr', expires: NOW + 5 * HOUR } }));
    assert.equal((await service.complete(request('opencode', { requestId: 'r2' }))).kind, 'auth', 'control: the routed provider\'s own stale login still refuses');
    assert.equal(processes.calls.length, 1);
});

test('CR-J20: a malformed config.json is logged; a missing one is not', () => {
    const root = tempRoot();
    const lines = [];
    const bad = path.join(root, 'config.json');
    fs.writeFileSync(bad, '{"harnesses": {');
    assert.equal(plugin.loadConfig(bad, fs.readFileSync, (line) => lines.push(line)).harnesses.opencode.offer, false);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /not valid JSON/);
    plugin.loadConfig(path.join(root, 'missing.json'), fs.readFileSync, (line) => lines.push(line));
    assert.equal(lines.length, 1);
});

test('CR-J11: text with a finish is an answer even when the stream also carried an error event; the error rides as a warning', () => {
    const stdout = [RECORDED.opencodeUnknown, OUTPUTS.opencode('PONG')].join('\n');
    const answer = plugin.classify('opencode', { stdout, stderr: '', code: 0, killed: null, spawnError: null });
    assert.equal(answer.ok, true);
    assert.equal(answer.text, 'PONG');
    assert.equal(answer.finish, 'stop');
    assert.match(answer.warnings[0], /Unexpected server error/);
    const unfinished = [RECORDED.opencodeUnknown, JSON.stringify({ type: 'text', part: { type: 'text', text: 'half' } })].join('\n');
    assert.equal(plugin.classify('opencode', { stdout: unfinished, stderr: '', code: 1, killed: null, spawnError: null }).ok, false, 'control: text with no finish and an error is still a failure');
});

test('CR-J14: two users may use the same requestId, and each cancels only their own call', async () => {
    const { service, processes } = setup({ harness: 'claude', script: hanging });
    const alice = service.complete(request('claude', { requestId: 'same' }), { user: 'alice' });
    const bob = service.complete(request('claude', { requestId: 'same' }), { user: 'bob' });
    assert.ok(await until(() => processes.calls.length === 2));
    assert.equal(service.cancel('same', 'alice'), true);
    assert.equal((await alice).kind, 'lapsed');
    assert.equal(processes.killed.length, 1);
    assert.equal(service.cancel('same', 'bob'), true, 'bob\'s call is still reachable after alice\'s finished');
    assert.equal((await bob).kind, 'lapsed');
});

test('CR-J17: status and the probes touch only offered harnesses; an unoffered CLI is never spawned', async () => {
    const root = tempRoot();
    const other = (name) => {
        const file = path.join(root, `${name}.exe`);
        fs.writeFileSync(file, '');
        return file;
    };
    const { service, versionCalls } = setup({ harness: 'opencode', extraConfig: { claude: { binary: other('claude'), offer: false }, codex: { binary: other('codex'), offer: false } } });
    const status = await service.status({ refresh: true });
    assert.equal(versionCalls.length, 1);
    assert.match(versionCalls[0], /opencode\.exe$/);
    assert.equal(status.harnesses.claude.installed, false);
    assert.equal(status.harnesses.claude.version, null);
    assert.match(status.harnesses.codex.problem, /not offered/);
    assert.equal((await service.complete(request('claude'))).kind, 'config');
    assert.equal((await service.complete(request('codex', { requestId: 'r2' }))).kind, 'config');
});

test('T6-3-3 MEDIUM: a usage limit with no retry time holds the harness for the cool-down, failing fast with the reason', async () => {
    const limit = JSON.stringify({ type: 'error', error: { name: 'APIError', data: { message: 'usage limit reached', statusCode: 429 } } });
    const { service, processes } = setup({ harness: 'opencode', script: emitting(limit) });
    const first = await service.complete(request('opencode'));
    assert.deepEqual([first.kind, first.retryAt ?? null], ['quota', null]);
    const second = await service.complete(request('opencode', { requestId: 'r2' }));
    assert.equal(second.kind, 'quota');
    assert.match(second.message, /no retry time/);
    assert.equal(second.retryAt, NOW + plugin.QUOTA_HOLD_MS);
    assert.equal(processes.calls.length, 1, 'the held call never spawns');
    assert.equal((await service.status()).harnesses.opencode.quotaUntil, NOW + plugin.QUOTA_HOLD_MS);
    assert.equal(plugin.QUOTA_HOLD_MS, 600_000);
});

test('T6-3-3 MEDIUM: SO_HARNESS_QUOTA_HOLD_MS sets the cool-down, and 0 turns it off', async () => {
    const limit = JSON.stringify({ type: 'error', error: { name: 'APIError', data: { message: 'usage limit reached', statusCode: 429 } } });
    const short = setup({ harness: 'opencode', script: emitting(limit), extraEnv: { SO_HARNESS_QUOTA_HOLD_MS: '60000' } });
    await short.service.complete(request('opencode'));
    assert.equal((await short.service.status()).harnesses.opencode.quotaUntil, NOW + 60_000);
    const off = setup({ harness: 'opencode', script: emitting(limit), extraEnv: { SO_HARNESS_QUOTA_HOLD_MS: '0' } });
    await off.service.complete(request('opencode'));
    await off.service.complete(request('opencode', { requestId: 'r2' }));
    assert.equal(off.processes.calls.length, 2);
    assert.equal((await off.service.status()).harnesses.opencode.quotaUntil, null);
    assert.equal(plugin.quotaHoldMs({ SO_HARNESS_QUOTA_HOLD_MS: 'soon' }), plugin.QUOTA_HOLD_MS);
});

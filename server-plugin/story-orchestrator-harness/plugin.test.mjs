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

function setup({ harness = 'claude', offer = true, expiresAt = NOW + 5 * HOUR, script = answering(harness), extraConfig = {}, warm = true } = {}) {
    const root = tempRoot();
    const loginFile = path.join(root, 'real-login.json');
    fs.writeFileSync(loginFile, JSON.stringify(LOGINS[harness](expiresAt)));
    const bin = path.join(root, `${harness}.exe`);
    fs.writeFileSync(bin, '');
    const config = plugin.sanitizeConfig({ tmpRoot: path.join(root, 'tmp'), harnesses: { [harness]: { binary: bin, loginFile, offer }, ...extraConfig } });
    const processes = fakeProcesses(script);
    const versions = (bin2, argv, options) => (argv[0] === '--version'
        ? (() => { const c = new EventEmitter(); c.pid = 1; c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.stdin = { on() {}, end() { setImmediate(() => { c.stdout.emit('data', Buffer.from('9.9.9')); c.emit('close', 0); }); } }; return c; })()
        : processes.spawnImpl(bin2, argv, options));
    const lines = [];
    const service = plugin.createHarnessService({ config, env: { PATH: '', ANTHROPIC_API_KEY: 'sk-canary', ANTHROPIC_AUTH_TOKEN: 'canary', SO_SECRET_CANARY: 'x', HTTPS_PROXY: 'http://proxy:1' }, home: root, spawnImpl: versions, killTree: processes.killTree, now: () => NOW, log: (line) => lines.push(line) });
    if (warm && harness === 'opencode') {
        fs.mkdirSync(path.join(config.tmpRoot, 'opencode-cache'), { recursive: true });
        fs.writeFileSync(path.join(config.tmpRoot, 'opencode-cache', '.so-warm'), 'x');
    }
    return { root, loginFile, config, service, processes, lines };
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
    assert.ok(Date.now() - started < 1000);
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
    assert.deepEqual(fs.readdirSync(path.join(config.tmpRoot, 'calls')), []);
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

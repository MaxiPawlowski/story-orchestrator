import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const plugin = await import(pathToFileURL(path.join(here, 'index.mjs')).href);
const bridge = await import(pathToFileURL(path.join(here, 'agentBridge.mjs')).href);
const claude = await import(pathToFileURL(path.join(here, 'claudeTransport.mjs')).href);
const FAKE = path.join(here, 'fixtures', 'fake-claude-cli.mjs');

const MODEL = 'claude-sonnet-5-5';
const TOOLS = [
    { name: 'readStory', description: 'Read the draft.', inputSchema: { type: 'object', additionalProperties: false, properties: {}, required: [] } },
    { name: 'createCharacter', description: 'Provision a character.', inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
];
const LOGIN = JSON.stringify({ claudeAiOauth: { accessToken: 'synthetic-canary', refreshToken: 'synthetic-canary', expiresAt: Date.now() + 10 * 3_600_000 } });

function setup({ login = LOGIN, offer = true } = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'so-claude-bridge-test-'));
    const bin = path.join(root, 'claude.exe');
    fs.writeFileSync(bin, '');
    if (login !== null) {
        fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
        fs.writeFileSync(path.join(root, '.claude', '.credentials.json'), login);
    }
    const config = plugin.sanitizeConfig({ tmpRoot: path.join(root, 'tmp'), harnesses: { claude: { binary: bin, offer } } });
    const spawned = [];
    const spawnImpl = (file, argv, options) => {
        spawned.push({ file, argv, env: options.env, cwd: options.cwd });
        return spawn(process.execPath, [FAKE, ...argv], options);
    };
    const lines = [];
    const service = plugin.createHarnessService({
        config,
        env: { PATH: process.env.PATH ?? process.env.Path ?? '', SystemRoot: process.env.SystemRoot ?? '', ANTHROPIC_API_KEY: 'sk-canary', SO_SECRET_CANARY: 'x' },
        home: root,
        spawnImpl,
        log: (line) => lines.push(line),
    });
    const calls = () => (fs.existsSync(path.join(config.tmpRoot, 'calls')) ? fs.readdirSync(path.join(config.tmpRoot, 'calls')) : []);
    return { root, config, service, spawned, lines, calls, agentRun: () => spawned.find((row) => row.argv.includes('--mcp-config')) };
}

const openRequest = (script, overrides = {}) => ({
    harness: 'claude', model: MODEL, role: 'authoring', system: 'You are the wizard agent.', prompt: `Do the plan.\nFAKE:${JSON.stringify(script)}`,
    timeoutMs: 30_000, callTimeoutMs: 20_000, maxOutputChars: 20_000, effort: null, tools: TOOLS, ...overrides,
});

const nextEvent = async (service, sessionId) => {
    for (;;) {
        const found = await service.agent.next(sessionId, { waitMs: 2000 });
        if (found.error) return found;
        if (found.event.kind !== 'pending') return found.event;
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

const runToEnd = async (ctx, script, overrides = {}) => {
    const opened = await ctx.service.agent.open(openRequest(script, overrides));
    assert.equal(opened.ok, true, JSON.stringify(opened));
    const seen = [];
    for (;;) {
        const event = await nextEvent(ctx.service, opened.sessionId);
        seen.push(event);
        if (event.kind !== 'call') return { opened, event, seen };
        ctx.service.agent.answer(opened.sessionId, { callId: event.callId, ok: true, text: `R-${event.tool}` });
    }
};

test('claude: a tool call is parked, answered through the shim, and the session ends with the answer', async () => {
    const ctx = setup();
    const { event, seen } = await runToEnd(ctx, [{ call: 'readStory' }, { call: 'createCharacter', args: { name: 'Mira' } }, { text: '{"done":"ok"}' }]);
    assert.deepEqual(seen.filter((row) => row.kind === 'call').map((row) => [row.tool, row.args]), [['readStory', {}], ['createCharacter', { name: 'Mira' }]]);
    assert.equal(event.kind, 'done');
    assert.match(event.text, /readStory:ok:R-readStory/);
    assert.match(event.text, /createCharacter:ok:R-createCharacter/);
    assert.match(event.text, /\{"done":"ok"\}$/);
    assert.equal(event.finish, 'stop');
    assert.ok(await until(() => ctx.calls().length === 0), 'the owned home is removed');
});

test('claude isolation: no built-in tools, only the shim, no settings or saved sessions, an owned login copy, no fallbacks', async () => {
    const ctx = setup();
    const opened = await ctx.service.agent.open(openRequest([{ call: 'readStory' }, { text: 'done' }]));
    const call = await nextEvent(ctx.service, opened.sessionId);
    const run = ctx.agentRun();
    const seenHome = path.dirname(run.cwd);
    assert.ok(fs.existsSync(path.join(seenHome, 'config', '.credentials.json')), 'the login is copied into the owned config dir');
    assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(seenHome, 'tmp', 'mcp.json'), 'utf8')).mcpServers), ['so']);
    ctx.service.agent.answer(opened.sessionId, { callId: call.callId, ok: true, text: 'x' });
    assert.equal((await nextEvent(ctx.service, opened.sessionId)).kind, 'done');
    const at = (name) => run.argv[run.argv.indexOf(name) + 1];
    assert.equal(at('--tools'), '');
    assert.equal(at('--setting-sources'), '');
    assert.equal(at('--permission-prompts'), 'none');
    assert.equal(at('--output-format'), 'stream-json');
    assert.equal(at('--model'), MODEL);
    assert.equal(at('--allowedTools'), 'mcp__so__readStory,mcp__so__createCharacter');
    for (const name of ['-p', '--strict-mcp-config', '--no-session-persistence', '--disable-slash-commands', '--include-partial-messages']) assert.ok(run.argv.includes(name), name);
    assert.ok(!run.argv.includes('--fallback-model'));
    assert.ok(!run.argv.some((arg) => /dangerously|bypassPermissions/.test(arg)));
    assert.equal(path.basename(run.cwd), claude.CLAUDE_AGENT_CWD);
    assert.equal(run.env.CLAUDE_CONFIG_DIR, path.join(seenHome, 'config'));
    for (const [key, value] of Object.entries(claude.CLAUDE_AGENT_ENV)) assert.equal(run.env[key], value, key);
    assert.equal(run.env.MCP_TOOL_TIMEOUT, String(20_000 + claude.CLAUDE_AGENT_LIMITS.callMarginMs));
    assert.equal(run.env.ANTHROPIC_API_KEY, undefined);
    assert.equal(run.env.SO_SECRET_CANARY, undefined);
    assert.ok(await until(() => !fs.existsSync(seenHome)), 'the owned home and its login copy are removed');
    assert.equal(fs.readFileSync(path.join(ctx.root, '.claude', '.credentials.json'), 'utf8'), LOGIN, 'the real login file is untouched');
});

test('claude: the MCP config names exactly the shim and is written owner-only inside the owned home', () => {
    const text = claude.claudeMcpConfig({ nodePath: 'node', pipe: 'p', secret: 's', toolsFile: 't' });
    const parsed = JSON.parse(text);
    assert.deepEqual(Object.keys(parsed.mcpServers), ['so']);
    assert.deepEqual(parsed.mcpServers.so, { type: 'stdio', command: 'node', args: [bridge.SHIM_PATH], env: { SO_BRIDGE_PIPE: 'p', SO_BRIDGE_SECRET: 's', SO_BRIDGE_TOOLS: 't' } });
});

test('claude: a tool that is not the bridge\'s ends the session as refused and stops the process', async () => {
    const ctx = setup();
    const { event } = await runToEnd(ctx, [{ foreign: 'Bash' }]);
    assert.equal(event.kind, 'ended');
    assert.equal(event.errorKind, 'refused');
    assert.ok(await until(() => ctx.calls().length === 0));
});

test('claude: an init listing tools beyond the bridge\'s is refused before any call', async () => {
    const ctx = setup();
    const { event, seen } = await runToEnd(ctx, [{ options: { extraTool: 'Bash' } }, { call: 'readStory' }]);
    assert.equal(seen.filter((row) => row.kind === 'call').length, 0);
    assert.equal(event.errorKind, 'refused');
});

test('claude: a tool server that did not connect ends the open as config', async () => {
    const ctx = setup();
    const { event } = await runToEnd(ctx, [{ options: { mcpFailed: true } }, { text: 'x' }]);
    assert.equal(event.errorKind, 'config');
});

test('claude: a refusal is final, from the stream or a refusal event, never an answer', async () => {
    for (const script of [[{ refusal: true }], [{ refusalEvent: true }], [{ text: 'I cannot help', resultStop: 'refusal' }]]) {
        const ctx = setup();
        const { event } = await runToEnd(ctx, script);
        assert.equal(event.kind, 'ended', JSON.stringify(script));
        assert.equal(event.errorKind, 'refused');
        assert.match(event.message, /refus/);
    }
});

test('claude: a reply from another model is discarded (served-model guard on init and each message)', async () => {
    for (const script of [[{ options: { initModel: 'claude-haiku-4-5' } }, { text: 'x' }], [{ text: 'x', served: 'claude-haiku-4-5' }], [{ call: 'readStory', served: 'claude-opus-5-5' }]]) {
        const ctx = setup();
        const { event } = await runToEnd(ctx, script);
        assert.equal(event.errorKind, 'refused', JSON.stringify(script));
        assert.match(event.message, /not the requested claude-sonnet-5-5/);
    }
    assert.equal(claude.canonicalModel('claude-sonnet-5-5-20261001'), 'claude-sonnet-5-5');
    assert.equal(claude.canonicalModel('claude-opus-5-5[1m]'), 'claude-opus-5-5');
});

test('claude: a <synthetic> message is a CLI-local error, an expired login is auth', async () => {
    const ctx = setup();
    const { event } = await runToEnd(ctx, [{ synthetic: 'Invalid API key · Please run /login' }]);
    assert.equal(event.errorKind, 'auth');
});

test('claude: the first max_tokens stops the run as length (no hidden resume turns)', async () => {
    const ctx = setup();
    const started = Date.now();
    const { event } = await runToEnd(ctx, [{ maxTokens: '{"partial":' }]);
    assert.equal(event.kind, 'done');
    assert.equal(event.finish, 'length');
    assert.equal(event.text, '{"partial":');
    assert.ok(Date.now() - started < 20_000);
});

test('claude: a permission denial in the result discards the answer', async () => {
    const ctx = setup();
    const { event } = await runToEnd(ctx, [{ deny: 'Bash' }, { text: 'answer' }]);
    assert.equal(event.errorKind, 'refused');
});

test('claude: the stream\'s rate-limit event feeds the status meter; a rejected window holds the harness', async () => {
    const ctx = setup();
    const resetsAt = Math.floor(Date.now() / 1000) + 3600;
    const info = { status: 'rejected', resetsAt, unifiedWindows: { five_hour: { utilization: 1, resetsAt }, seven_day: { utilization: 0.4, resetsAt: resetsAt + 86400 } } };
    await runToEnd(ctx, [{ options: { rateLimit: info } }, { text: 'x' }]);
    const status = await ctx.service.status();
    assert.equal(status.harnesses.claude.meter.status, 'rejected');
    assert.equal(status.harnesses.claude.meter.windows.five_hour.utilization, 1);
    assert.equal(status.harnesses.claude.quotaUntil, resetsAt * 1000);
    const blocked = await ctx.service.agent.open(openRequest([{ text: 'x' }]));
    assert.equal(blocked.ok, false);
    assert.equal(blocked.kind, 'quota');
});

test('claude: a missing or stale login refuses the open with the owner\'s next step and creates nothing', async () => {
    for (const login of [null, JSON.stringify({ claudeAiOauth: { expiresAt: Date.now() + 60_000 } })]) {
        const ctx = setup({ login });
        const opened = await ctx.service.agent.open(openRequest([{ text: 'x' }]));
        assert.equal(opened.ok, false);
        assert.equal(opened.kind, 'auth');
        assert.match(opened.message, /log in|run `claude`/);
        assert.equal(ctx.calls().length, 0);
        assert.equal(ctx.agentRun(), undefined);
    }
});

test('claude: the bridge runs the wizard models only, never haiku, and carries no pictures', () => {
    const config = plugin.sanitizeConfig({ harnesses: { claude: { offer: true } } });
    const base = openRequest([], { timeoutMs: 60_000 });
    assert.equal(bridge.validateOpen(base, config, plugin.LIMITS).issue, null);
    assert.equal(bridge.validateOpen({ ...base, model: 'claude-opus-5-5' }, config, plugin.LIMITS).issue, null);
    for (const model of ['haiku', 'sonnet', 'opus']) assert.match(bridge.validateOpen({ ...base, model }, config, plugin.LIMITS).issue, /runs claude-sonnet-5-5 or claude-opus-5-5 only/);
    assert.match(bridge.validateOpen({ ...base, images: [{ data: 'x' }] }, config, plugin.LIMITS).issue, /opencode tool bridge only/);
});

test('claude status: the bridge is offered, and each model says whether the wizard may use it', async () => {
    const ctx = setup();
    const status = await ctx.service.status({ refresh: true });
    const row = status.harnesses.claude;
    assert.equal(row.agentBridge, true);
    assert.deepEqual(row.models.filter((model) => model.agent).map((model) => model.id), ['claude-sonnet-5-5', 'claude-opus-5-5']);
    assert.equal(row.models.find((model) => model.id === 'haiku').agent, false);
});

test('claude: the session deadline stops a hung process and removes the owned home', async () => {
    const ctx = setup();
    const opened = await ctx.service.agent.open(openRequest([{ hang: true }], { timeoutMs: 5_000 }));
    const event = await nextEvent(ctx.service, opened.sessionId);
    assert.equal(event.errorKind, 'timeout');
    assert.ok(await until(() => ctx.calls().length === 0));
});

test('HARNESS_LIVE=1: one real claude bridge session through the shim', { skip: process.env.HARNESS_LIVE !== '1' }, async () => {
    const config = plugin.sanitizeConfig({ tmpRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'so-claude-live-')), harnesses: { claude: { offer: true } } });
    const service = plugin.createHarnessService({ config, log: () => undefined });
    const request = { ...openRequest([]), prompt: 'Call readStory once, then reply with exactly {"done":"read"}.', timeoutMs: 180_000 };
    const opened = await service.agent.open(bridge.validateOpen(request, config, plugin.LIMITS).value);
    assert.equal(opened.ok, true, JSON.stringify(opened));
    for (;;) {
        const event = await nextEvent(service, opened.sessionId);
        if (event.kind === 'call') {
            service.agent.answer(opened.sessionId, { callId: event.callId, ok: true, text: 'The draft is empty.' });
            continue;
        }
        assert.equal(event.kind, 'done', JSON.stringify(event));
        break;
    }
    await service.shutdown();
});

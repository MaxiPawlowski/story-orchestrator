import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { testTempDirSync } from '../../scripts/lib/testTemp.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const plugin = await import(pathToFileURL(path.join(here, 'index.mjs')).href);
const transport = await import(pathToFileURL(path.join(here, 'opencodeTransport.mjs')).href);
const agentBridge = await import(pathToFileURL(path.join(here, 'agentBridge.mjs')).href);

const ENABLED = process.env.SO_OPENCODE_ISOLATED === '1';
const SKIP = ENABLED ? false : 'set SO_OPENCODE_ISOLATED=1 to start a private, credential-free OpenCode server and check the transport against its real wire';

const importClient = async () => {
    const dir = process.env.SO_OPENCODE_CLIENT_DIR;
    if (!dir) return { client: await import('@opencode/client'), service: await import('@opencode/client/service') };
    const root = path.join(dir, 'node_modules', '@opencode', 'client', 'dist', 'promise');
    return { client: await import(pathToFileURL(path.join(root, 'index.js')).href), service: await import(pathToFileURL(path.join(root, 'service.js')).href) };
};

const freePort = () => new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); });
});

const startIsolatedServer = async (binary, iso) => {
    const dirs = Object.fromEntries(['home', 'config', 'data', 'cache', 'state', 'tmp', 'cwd'].map((name) => [name, path.join(iso, name)]));
    for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true });
    for (const name of ['AppData/Roaming', 'AppData/Local']) fs.mkdirSync(path.join(dirs.home, name), { recursive: true });
    const env = {
        PATH: process.env.PATH ?? process.env.Path ?? '', SystemRoot: process.env.SystemRoot ?? '', windir: process.env.windir ?? '',
        USERPROFILE: dirs.home, HOME: dirs.home, APPDATA: path.join(dirs.home, 'AppData', 'Roaming'), LOCALAPPDATA: path.join(dirs.home, 'AppData', 'Local'),
        XDG_CONFIG_HOME: dirs.config, XDG_DATA_HOME: dirs.data, XDG_CACHE_HOME: dirs.cache, XDG_STATE_HOME: dirs.state, TEMP: dirs.tmp, TMP: dirs.tmp,
        OPENCODE_DISABLE_AUTOUPDATE: '1', OPENCODE_DISABLE_SHARE: '1', OPENCODE_DISABLE_MODELS_FETCH: '1', OPENCODE_DISABLE_LSP_DOWNLOAD: '1',
    };
    const port = await freePort();
    const child = spawn(binary, ['serve', '--hostname', '127.0.0.1', '--port', String(port)], { env, cwd: dirs.cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const secret = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('the private server did not start')), 30_000);
        const read = (chunk) => {
            output += chunk.toString('utf8');
            const found = /server password (\S+)/.exec(output);
            if (found) { clearTimeout(timer); resolve(found[1]); }
        };
        child.stdout.on('data', read);
        child.stderr.on('data', read);
        child.on('exit', () => { clearTimeout(timer); reject(new Error('the private server exited')); });
    });
    return { child, url: `http://127.0.0.1:${port}`, secret };
};

test('a private OpenCode server (no login, no owner data): the transport\'s real wire, config discovery, tool server and failure events', { skip: SKIP, timeout: 240_000 }, async () => {
    const binary = plugin.resolveBinary('opencode', { env: process.env });
    assert.ok(binary.path, binary.error);
    const { client, service } = await importClient();
    const iso = testTempDirSync('so-opencode-iso-');
    const server = await startIsolatedServer(binary.path, iso);
    const endpoint = { url: server.url, auth: { type: 'basic', username: 'opencode', password: server.secret } };
    const libs = { OpenCode: client.OpenCode, Service: { discover: async () => endpoint, ensure: async () => endpoint, headers: service.Service.headers } };
    const config = plugin.sanitizeConfig({ tmpRoot: path.join(iso, 'so'), harnesses: { opencode: { offer: true } } });
    const lines = [];
    const t = transport.createOpencodeTransport({ config, loadLibs: async () => libs, binary: () => binary.path, alive: plugin.pidAlive, log: (line) => lines.push(line) });
    const pipes = [];
    try {
        const view = await t.inspect({ force: true });
        assert.equal(view.problem, null, view.problem);
        assert.match(view.serviceVersion, /^2\./);
        assert.equal(view.logins.openai.state, 'unpaired', 'a fresh server has no OpenAI sign-in');
        assert.match(view.logins.openai.message, /opencode auth login/);
        const refused = await t.ready('openai/gpt-6.1-sol');
        assert.deepEqual([refused.ok, refused.kind, refused.loginState], [false, 'auth', 'unpaired']);
        const handle = view.handle;
        const modelRows = [...view.models.values()];
        const listedModels = await handle.model.list();
        const catalog = listedModels.data ?? listedModels;
        assert.ok(Array.isArray(catalog), 'the private server returns a model catalog');
        const catalogKeys = new Set(catalog.filter((row) => typeof row.providerID === 'string')
            .map((row) => `${row.providerID}/${row.modelID ?? row.id}`));
        assert.deepEqual([...view.models.keys()].sort(), [...catalogKeys].sort(), 'the transport preserves the isolated catalog, including an empty offline catalog');
        assert.ok(modelRows.every((row) => Array.isArray(row.variants) && typeof row.available === 'boolean'), 'model rows keep their shape');

        const textDir = t.internals.textDirectory('You answer one request. No tools.');
        const agent = await t.internals.verifyAgent(handle, textDir, transport.TEXT_AGENT, transport.toolsDenied);
        assert.equal(agent.system, 'You answer one request. No tools.', 'OpenCode loaded the plugin\'s owned project config');
        await assert.rejects(t.internals.verifyAgent(handle, textDir, 'so-missing', transport.toolsDenied), (error) => error.kind === 'config' && /did not load the plugin's owned project config/.test(error.message), 'an agent OpenCode does not know fails closed');

        const failed = await t.internals.runSession(handle, {
            agent: transport.TEXT_AGENT, directory: textDir, rules: transport.textRules(), check: transport.toolsDenied,
            model: { providerID: 'openai', id: 'gpt-6.1-sol' }, prompt: 'Say PONG.', files: [], deadlineMs: 60_000, startedAt: Date.now(), maxOutputChars: 1000,
            signal: null, label: 'isolated-test', allowedTool: () => false,
        });
        assert.deepEqual([failed.ok, failed.kind], [false, 'config'], JSON.stringify(failed));
        assert.match(failed.message, /cannot route to the model/);
        const left = await handle.session.list({ search: transport.SESSION_TITLE, limit: 50 });
        assert.deepEqual((left.data ?? left).filter((row) => row.metadata?.label === 'isolated-test'), [], 'the session was removed after the failure event');

        const bridgeDir = path.join(iso, 'bridge-cwd');
        fs.mkdirSync(bridgeDir, { recursive: true });
        const toolsFile = path.join(bridgeDir, 'tools.json');
        fs.writeFileSync(toolsFile, JSON.stringify([{ name: 'readStory', description: 'Read.', inputSchema: { type: 'object', properties: {}, required: [] } }]));
        const secret = 'a'.repeat(64);
        const pipe = process.platform === 'win32' ? `\\\\.\\pipe\\so-iso-${process.pid}` : path.join(bridgeDir, 'p.sock');
        const hello = new Promise((resolve) => {
            const listener = net.createServer((socket) => {
                pipes.push(socket);
                socket.once('data', (chunk) => resolve(JSON.parse(chunk.toString('utf8').split('\n')[0])));
                socket.on('error', () => undefined);
            });
            pipes.push(listener);
            listener.listen(pipe);
        });
        fs.writeFileSync(path.join(bridgeDir, 'opencode.json'), transport.bridgeConfig({ system: 'wizard', nodePath: process.execPath, pipe, secret, toolsFile, callTimeoutMs: 5000 }));
        const bridgeAgent = await t.internals.verifyAgent(handle, bridgeDir, agentBridge.BRIDGE_AGENT, (rules) => transport.bridgeOnly(rules, ['readStory']));
        assert.equal(bridgeAgent.system, 'wizard');
        await t.internals.mcpConnected(handle, bridgeDir, Date.now() + 25_000, null);
        assert.deepEqual(await hello, { hello: secret }, 'the shim OpenCode started reached the plugin\'s channel with its secret');
        const mcp = await handle.mcp.list({ location: { directory: bridgeDir } });
        assert.equal((mcp.data ?? mcp).find((row) => row.name === agentBridge.BRIDGE_SERVER).status.status, 'connected');
        await t.internals.evict(handle, bridgeDir);
        const loaded = await handle.debug.location.list();
        assert.ok(!loaded.some((row) => path.resolve(row.directory) === path.resolve(bridgeDir)), 'the owned location is evicted');

        const orphan = await handle.session.create({ agent: 'build', title: 'so-harness 2147483000 orphan', metadata: { owner: transport.SESSION_OWNER, pid: 2147483000 }, location: { directory: textDir } });
        const foreign = await handle.session.create({ agent: 'build', title: 'so-harness other', metadata: { owner: 'someone-else', pid: 2147483000 }, location: { directory: textDir } });
        assert.deepEqual(await t.sweepSessions(), { removed: 1 });
        const remaining = await handle.session.list({ search: transport.SESSION_TITLE, limit: 50 });
        assert.deepEqual((remaining.data ?? remaining).map((row) => row.id), [foreign.id]);
        assert.ok(orphan.id);
        await handle.session.remove({ sessionID: foreign.id });
    } finally {
        for (const entry of pipes) { entry.destroy?.(); entry.close?.(); }
        await plugin.killTreeDefault(server.child.pid);
        await new Promise((resolve) => setTimeout(resolve, 500));
        fs.rmSync(iso, plugin.RM_RETRY);
    }
});

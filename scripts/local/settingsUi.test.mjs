import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createGateway } from '../../server-plugin/story-orchestrator-gpu/broker/gateway.mjs';
import { createSettingsRoutes } from './settingsUi.mjs';
import { serializeConfig } from './modes.mjs';
import { testTempDir } from '../lib/testTemp.mjs';

const config = () => ({ gatewayPort: 0, reserves: { gpuMiB: 2048, ramMiB: 4096 }, idleRestoreMs: 600000, fitMarginMiB: 512,
    streamImages: { enabled: true, minFreeGpuMiB: 2400, maxWeightMiB: 8192, kinds: ['checkpoints'] }, profiles: { fast: { args: [] } }, defaultProfile: 'fast' });

const serve = async () => {
    const dir = await testTempDir('so-ui-');
    const configFile = path.join(dir, 'config.json');
    await fs.writeFile(configFile, serializeConfig(config()));
    const requests = [];
    const live = { request: async (plan) => { requests.push(plan); return 'now'; }, status: () => ({ mode: 'balanced', pending: null, atNextTextLoad: [], effective: {} }) };
    let handle = null;
    const arbiter = { backend: { status: () => ({}) }, scheduler: {}, status: async () => ({}), control: async () => { throw new Error('control reached'); } };
    const gateway = createGateway({ arbiter, config: {}, controls: { stop: async () => {} }, allowOrigin: /^http:\/\/127\.0\.0\.1:8000$/, routes: (...args) => handle(...args) });
    const { port } = await gateway.listen(0);
    handle = createSettingsRoutes({ configFile, port, live, backupRoot: path.join(dir, 'backups'),
        telemetry: async () => ({ gpus: [{ freeMiB: 2700, totalMiB: 24576 }], host: { availableMiB: 12000 }, phase: 'text' }) });
    return { dir, configFile, port, requests, url: `http://127.0.0.1:${port}`, close: async () => { await gateway.close(); await fs.rm(dir, { recursive: true, force: true }); } };
};

const raw = (port, { method = 'GET', route, headers = {}, body }) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: route, headers }, (res) => {
        let text = '';
        res.on('data', (chunk) => { text += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
    });
    req.on('error', reject);
    req.end(body);
});

const post = (url, body, headers = {}) => fetch(`${url}/ui/api/change`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-so-local-ui': '1', ...headers }, body: JSON.stringify(body) });

test('the settings page is served same-origin with a locked-down policy and live readings', async () => {
    const app = await serve();
    try {
        const page = await fetch(`${app.url}/ui`);
        assert.equal(page.status, 200);
        assert.match(page.headers.get('content-type'), /text\/html/);
        assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
        assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
        assert.equal(page.headers.get('x-frame-options'), 'DENY');
        const html = await page.text();
        assert.match(html, /<script src="\/ui\/app.js">/);
        assert.doesNotMatch(html, /https?:\/\/(?!127)/);
        const script = await (await fetch(`${app.url}/ui/app.js`)).text();
        assert.doesNotMatch(script, /https?:\/\//);
        const state = await (await fetch(`${app.url}/ui/api/state`)).json();
        assert.equal(state.configMode, 'balanced');
        assert.deepEqual(state.modes.map((row) => row.name), ['max', 'balanced', 'safe']);
        assert.equal(state.gpuFreeMiB, 2700);
        assert.equal(state.ramAvailableMiB, 12000);
        assert.equal(state.knobs.length, 9);
    } finally { await app.close(); }
});

test('a same-origin change is validated, backed up, saved and handed to the running controller', async () => {
    const app = await serve();
    try {
        const reply = await post(app.url, { mode: 'safe' }, { origin: app.url });
        assert.equal(reply.status, 200);
        const data = await reply.json();
        assert.equal(data.mode, 'safe');
        assert.equal(data.applied, 'now');
        assert.ok(data.atNextTextLoad.includes('reserves.gpuMiB'));
        assert.equal(JSON.parse(await fs.readFile(data.backup, 'utf8')).mode, undefined);
        assert.equal(JSON.parse(await fs.readFile(app.configFile, 'utf8')).streamImages.enabled, false);
        assert.equal(app.requests.length, 1);
        const bad = await post(app.url, { values: { 'reserves.ramMiB': 100 } });
        assert.equal(bad.status, 400);
        assert.match((await bad.json()).error, /between 2048/);
        assert.equal(app.requests.length, 1);
    } finally { await app.close(); }
});

test('pages on other origins, rebinding hosts, missing headers and form posts cannot change settings', async () => {
    const app = await serve();
    try {
        const before = await fs.readFile(app.configFile, 'utf8');
        assert.equal((await post(app.url, { mode: 'max' }, { origin: 'http://evil.example' })).status, 403);
        assert.equal((await post(app.url, { mode: 'max' }, { origin: 'http://127.0.0.1:8000' })).status, 403);
        assert.equal((await post(app.url, { mode: 'max' }, { origin: 'null' })).status, 403);
        assert.equal((await fetch(`${app.url}/ui/api/change`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"mode":"max"}' })).status, 403);
        assert.equal((await fetch(`${app.url}/ui/api/change`, { method: 'POST', headers: { 'content-type': 'text/plain', 'x-so-local-ui': '1' }, body: '{"mode":"max"}' })).status, 403);
        const rebound = await raw(app.port, { method: 'POST', route: '/ui/api/change', headers: { host: `evil.example:${app.port}`, 'content-type': 'application/json', 'x-so-local-ui': '1' }, body: '{"mode":"max"}' });
        assert.equal(rebound.status, 403);
        assert.equal((await raw(app.port, { route: '/ui/api/state', headers: { host: 'evil.example' } })).status, 403);
        assert.equal(await fs.readFile(app.configFile, 'utf8'), before);
        assert.equal(app.requests.length, 0);
        assert.equal((await fetch(`${app.url}/control/unload`, { method: 'POST', headers: { origin: 'http://evil.example' }, body: '{}' })).status, 403);
    } finally { await app.close(); }
});

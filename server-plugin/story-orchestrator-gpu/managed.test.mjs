import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brokerAddress, mountManagedRoutes } from './managed.mjs';

test('the broker address comes from config.json, with loopback 18888 only as the documented default', () => {
    assert.deepEqual(brokerAddress({}), { listenHost: '127.0.0.1', listenPort: 18888, controllerUrl: 'http://127.0.0.1:18888' });
    assert.deepEqual(brokerAddress({ listenHost: 'localhost', listenPort: 19000, controllerUrl: 'http://127.0.0.1:19500' }),
        { listenHost: 'localhost', listenPort: 19000, controllerUrl: 'http://127.0.0.1:19500' });
    assert.throws(() => brokerAddress({ listenHost: '0.0.0.0' }), /loopback/);
    assert.throws(() => brokerAddress({ listenPort: 0 }), /port/);
});

function setup(fetchImpl) {
    const handlers = new Map();
    mountManagedRoutes({ get: (path, fn) => handlers.set(path, fn), post: (path, fn) => handlers.set(path, fn) }, 'http://127.0.0.1:18888', fetchImpl);
    const res = { code: 200, data: null, status(code) { this.code = code; return this; }, json(data) { this.data = data; } };
    return { handlers, res };
}

test('the managed adapter preserves the lease contract without opening a second text port', async () => {
    const calls = [];
    const { handlers, res } = setup(async (url, options) => { calls.push([String(url), options.body]); return { ok: true, json: async () => ({ lease: 'owned', brokered: true }) }; });
    await handlers.get('/lease')({ body: { workflowKey: 'scene' } }, res);
    assert.equal(res.data.lease, 'owned');
    assert.deepEqual(calls, [['http://127.0.0.1:18888/lease', '{"workflowKey":"scene"}']]);
});

test('a disconnected configured controller refuses safely rather than rendering over a local text model', async () => {
    const { handlers, res } = setup(async () => { throw new Error('offline'); });
    await handlers.get('/lease')({ body: {} }, res);
    assert.equal(res.code, 409);
    assert.equal(res.data.error, 'offline');
});

test('a caller disconnected after a grant releases only its granted lease', async () => {
    const calls = [];
    const { handlers, res } = setup(async (url, options) => { calls.push([String(url), options.body]); return { ok: true, json: async () => ({ lease: 'owned' }) }; });
    res.destroyed = true;
    await handlers.get('/lease')({ body: {} }, res);
    assert.deepEqual(calls.at(-1), ['http://127.0.0.1:18888/release', '{"lease":"owned"}']);
});

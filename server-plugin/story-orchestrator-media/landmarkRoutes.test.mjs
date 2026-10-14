import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chooseLandmarkUrl, mountLandmarkRoutes, LANDMARK_DEFAULT_URL } from './landmarkRoutes.mjs';

const mount = (options) => {
    const routes = {};
    const router = { get: (name, run) => { routes[`GET ${name}`] = run; }, post: (name, run) => { routes[`POST ${name}`] = run; } };
    mountLandmarkRoutes(router, options);
    const call = async (key, req) => {
        let status = 200, body;
        await routes[key](req, { status(code) { status = code; return this; }, json(value) { body = value; return this; } });
        return { status, body };
    };
    return call;
};
const user = { user: { profile: { handle: 'default-user' } } };
const answer = (value, ok = true) => ({ ok, json: async () => value });

test('harvest 5: the detector address is loopback HTTP only, default 127.0.0.1:8096', () => {
    assert.equal(chooseLandmarkUrl(undefined), LANDMARK_DEFAULT_URL);
    assert.equal(chooseLandmarkUrl('http://localhost:9000/'), 'http://localhost:9000');
    assert.equal(chooseLandmarkUrl('http://192.168.1.4:8096'), null);
    assert.equal(chooseLandmarkUrl('https://127.0.0.1:8096'), null);
    assert.equal(chooseLandmarkUrl('not a url'), null);
});

test('harvest 5: the bust is forwarded as base64 only and the detector answer comes back typed', async () => {
    const sent = [];
    const call = mount({ configured: undefined, fetchImpl: async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return answer({ ok: true, width: 4, height: 6, faces: [{ box: [0, 0, 1, 1, 0.9], points: [] }] }); } });
    const { body } = await call('POST /landmarks', { ...user, body: { png: 'iVBORw0KGgo=' } });
    assert.deepEqual(body, { ok: true, width: 4, height: 6, faces: [{ box: [0, 0, 1, 1, 0.9], points: [] }] });
    assert.deepEqual(sent, [{ url: `${LANDMARK_DEFAULT_URL}/v1/landmarks`, body: { png: 'iVBORw0KGgo=' } }]);
    assert.deepEqual((await call('POST /landmarks', { ...user, body: { png: 'iVBORw0KGgo=', path: 'C:/x' } })).body, { ok: false, reason: 'bad-request' });
    assert.deepEqual((await call('POST /landmarks', { ...user, body: { png: 'not base64!' } })).body, { ok: false, reason: 'bad-request' });
    assert.equal(sent.length, 1);
    assert.equal((await call('POST /landmarks', { body: { png: 'AAAA' } })).status, 401);
});

test('harvest 5: a detector that is down, refuses or is not loopback answers unavailable, never an error status', async () => {
    const down = mount({ configured: undefined, fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
    assert.deepEqual((await down('POST /landmarks', { ...user, body: { png: 'AAAA' } })), { status: 200, body: { ok: false, reason: 'unavailable' } });
    assert.deepEqual((await down('GET /landmarks/status', user)).body, { ok: false, reason: 'unavailable' });
    const refused = mount({ configured: undefined, fetchImpl: async () => answer({ ok: false, reason: 'bad-image' }, false) });
    assert.deepEqual((await refused('POST /landmarks', { ...user, body: { png: 'AAAA' } })).body, { ok: false, reason: 'bad-image' });
    const remote = mount({ configured: 'http://10.0.0.2:8096', fetchImpl: async () => { throw new Error('must not be called'); } });
    assert.deepEqual((await remote('POST /landmarks', { ...user, body: { png: 'AAAA' } })).body, { ok: false, reason: 'not-loopback' });
    const up = mount({ configured: undefined, fetchImpl: async () => answer({ ok: true, model: 'afd', device: 'cpu' }) });
    assert.deepEqual((await up('GET /landmarks/status', user)).body, { ok: true, model: 'afd', device: 'cpu' });
});

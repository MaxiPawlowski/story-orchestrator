import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ComfyJobs } from './jobs.mjs';
import { LOOP_FOLDER, cachedLoop, interruptIfRunning, loopPrefixFor, mountLoopRoutes, validateLoopGraph, writeLoop } from './loops.mjs';
import { testTempDir } from '../../scripts/lib/testTemp.mjs';

const KEY = 'a'.repeat(32);
const webp = () => Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(16)]);
const mp4 = (size = 64) => Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(size)]);
const graph = (prefix = loopPrefixFor(KEY), extra = {}) => ({
    still: { class_type: 'LoadImage', inputs: { image: 'story-orchestrator/so_x.png' } },
    save: { class_type: 'SaveVideo', inputs: { video: ['still', 0], filename_prefix: prefix, format: 'mp4' } },
    ...extra,
});

test('loop recipes run only allowlisted nodes, an owned still and the key\'s own output prefix', async () => {
    const owns = async (name) => name === 'story-orchestrator/so_x.png';
    await validateLoopGraph(graph(), KEY, owns);
    await assert.rejects(validateLoopGraph(graph(), 'nope', owns), /key/);
    await assert.rejects(validateLoopGraph(graph('so_loop_other'), KEY, owns), /prefix/);
    await assert.rejects(validateLoopGraph(graph(undefined, { bad: { class_type: 'ExecutePython', inputs: {} } }), KEY, owns), /unsupported/);
    await assert.rejects(validateLoopGraph(graph(undefined, { still: { class_type: 'LoadImage', inputs: { image: 'foreign.png' } } }), KEY, owns), /belong/);
    await assert.rejects(validateLoopGraph({ still: graph().still }, KEY, owns), /exactly one/);
    const animated = { class_type: 'SaveAnimatedWEBP', inputs: { images: ['still', 0], filename_prefix: loopPrefixFor(KEY), fps: 12, lossless: false, quality: 75, method: 'default' } };
    await validateLoopGraph(graph(undefined, { webp: animated }), KEY, owns);
    await assert.rejects(validateLoopGraph(graph(undefined, { webp: animated, webp2: animated }), KEY, owns), /at most one/);
    await assert.rejects(validateLoopGraph(graph(undefined, { webp: { ...animated, inputs: { ...animated.inputs, filename_prefix: 'x' } } }), KEY, owns), /prefix/);
});

test('a saved loop is an MP4 under the user images folder, cached by key and refused when too large or not MP4', async () => {
    const root = await testTempDir('so-loops-');
    const dirs = { userImages: root };
    try {
        assert.deepEqual(await cachedLoop(dirs, KEY), { url: null });
        await assert.rejects(writeLoop(dirs, KEY, Buffer.from('not a video')), /MP4/);
        await assert.rejects(writeLoop(dirs, KEY, mp4(16 * 1024 * 1024)), /too large/);
        await assert.rejects(writeLoop(dirs, KEY, mp4(), {}, Buffer.from('not a webp image')), /WebP/);
        const saved = await writeLoop(dirs, KEY, mp4(), { model: 'wan2.2-ti2v-5b', promptVersion: 1, ms: 1234.4 });
        assert.equal(saved.url, `/user/images/${LOOP_FOLDER}/${KEY}.mp4`);
        const hit = await cachedLoop(dirs, KEY);
        assert.equal(hit.url, saved.url);
        assert.equal(hit.meta.ms, 1234);
        assert.equal(hit.meta.model, 'wan2.2-ti2v-5b');
        await fs.writeFile(path.join(root, LOOP_FOLDER, `${KEY}.mp4`), mp4(10));
        assert.deepEqual(await cachedLoop(dirs, KEY), { url: null });
        await assert.rejects(cachedLoop(dirs, '../x'), /key/);
    } finally { await fs.rm(root, { recursive: true }); }
});

test("a loop stopped by another job's ComfyUI interrupt is reported as interrupted, not as a broken recipe", async () => {
    const routes = {};
    const router = { get: (name, handler) => { routes[`GET ${name}`] = handler; }, post: (name, handler) => { routes[`POST ${name}`] = handler; } };
    const fetchImpl = async (url) => {
        if (url.endsWith('/prompt')) return Response.json({ prompt_id: 'p' });
        if (url.includes('/history/')) return Response.json({ p: { status: { status_str: 'error', messages: [['execution_start', {}], ['execution_interrupted', {}]] }, outputs: {} } });
        return Response.json({});
    };
    mountLoopRoutes(router, { target: async () => ({ url: 'http://comfy' }), owner: () => 'u', makeJobs: (url) => new ComfyJobs({ url, fetchImpl }) });
    const req = { user: { directories: { userImages: 'x' } } };
    let body;
    const res = { status: () => ({ json: (data) => { body = data; } }), json: (data) => { body = data; } };
    const id = randomUUID();
    const keyless = { save: { class_type: 'SaveVideo', inputs: { video: ['x', 0], filename_prefix: loopPrefixFor(KEY), format: 'mp4' } } };
    await routes['POST /loops/jobs']({ ...req, body: { id, key: KEY, graph: keyless } }, res);
    await routes['GET /loops/jobs/:id']({ ...req, params: { id } }, res);
    assert.equal(body.status, 'failed');
    assert.equal(body.reason, 'interrupted');
});

test('cancelling a running loop interrupts only that prompt id', async () => {
    const calls = [];
    const jobs = new ComfyJobs({ url: 'http://comfy', fetchImpl: async (url, options) => {
        calls.push([url, options?.body && JSON.parse(options.body)]);
        return Response.json({});
    } });
    assert.equal(await interruptIfRunning(jobs, { promptId: null }), false);
    assert.equal(await interruptIfRunning(jobs, { promptId: 'p1' }), true);
    assert.deepEqual(calls, [['http://comfy/interrupt', { prompt_id: 'p1' }]]);
});

test('loop routes render, save the finished video for its key, and never hand a job to another user', async () => {
    const root = await testTempDir('so-loop-routes-');
    const routes = {};
    const router = { get: (name, handler) => { routes[`GET ${name}`] = handler; }, post: (name, handler) => { routes[`POST ${name}`] = handler; } };
    const fetchImpl = async (url) => {
        if (url.endsWith('/prompt')) return Response.json({ prompt_id: 'p' });
        if (url.includes('/history/')) return Response.json({ p: { outputs: {
            save: { images: [{ filename: `${loopPrefixFor(KEY)}_00001_.mp4`, subfolder: '', type: 'output' }], animated: [true] },
            still_loop: { images: [{ filename: `${loopPrefixFor(KEY)}_00001_.webp`, subfolder: '', type: 'output' }], animated: [true] },
            foreign: { images: [{ filename: 'someone_else.mp4', subfolder: '', type: 'output' }] } } } });
        if (url.includes('/view?')) return new Response(url.includes('.webp') ? webp() : mp4());
        if (url.endsWith('/queue')) return Response.json({ queue_running: [[1, 'x']], queue_pending: [] });
        return Response.json({});
    };
    mountLoopRoutes(router, { target: async () => ({ url: 'http://comfy' }), owner: (req) => req.user.directories.characters, makeJobs: (url) => new ComfyJobs({ url, fetchImpl }) });
    const call = async (route, req) => {
        let status = 200; let body;
        await routes[route](req, { status: (code) => { status = code; return { json: (data) => { body = data; } }; }, json: (data) => { body = data; } });
        return { status, body };
    };
    const user = (name) => ({ directories: { characters: path.join(root, name, 'characters'), userImages: path.join(root, name, 'images') } });
    const id = randomUUID();
    try {
        await fs.mkdir(path.join(root, 'a', 'characters'), { recursive: true });
        const refused = await call('POST /loops/jobs', { user: user('a'), body: { id, key: KEY, graph: graph() } });
        assert.equal(refused.status, 400);
        assert.match(refused.body.error, /belong/);
        const unowned = graph(undefined, {}); delete unowned.still; unowned.save.inputs.images = ['x', 0];
        const submitted = await call('POST /loops/jobs', { user: user('a'), body: { id, key: KEY, graph: unowned } });
        assert.equal(submitted.body.status, 'queued');
        assert.equal((await call('GET /loops/jobs/:id', { user: user('a'), params: { id } })).body.status, 'complete');
        assert.equal((await call('POST /loops/jobs/:id/save', { user: user('b'), params: { id }, body: { key: KEY } })).status, 400);
        assert.equal((await call('POST /loops/jobs/:id/save', { user: user('a'), params: { id }, body: { key: 'b'.repeat(32) } })).status, 400);
        const saved = await call('POST /loops/jobs/:id/save', { user: user('a'), params: { id }, body: { key: KEY, meta: { model: 'm', promptVersion: 1 } } });
        assert.equal(saved.body.url, `/user/images/${LOOP_FOLDER}/${KEY}.mp4`);
        assert.equal(saved.body.webpUrl, `/user/images/${LOOP_FOLDER}/${KEY}.webp`);
        const hit = (await call('GET /loops/cached/:key', { user: user('a'), params: { key: KEY } })).body;
        assert.equal(hit.url, saved.body.url);
        assert.equal(hit.webpUrl, saved.body.webpUrl);
        assert.equal((await call('GET /loops/cached/:key', { user: user('b'), params: { key: KEY } })).body.url, null);
        assert.deepEqual((await call('GET /loops/queue', { user: user('a') })).body, { running: 1, pending: 0 });
    } finally { await fs.rm(root, { recursive: true }); }
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ComfyJobs } from './jobs.mjs';
import { saveSprite, deleteSprite, fingerprint, digest } from './files.mjs';

test('cancelling a queued job removes only its prompt, never interrupts the running foreign job', async () => {
    const calls = [];
    const jobs = new ComfyJobs({ url: 'http://comfy', fetchImpl: async (url, options) => {
        calls.push([url, options.body && JSON.parse(options.body)]);
        return Response.json(url.endsWith('/prompt') ? { prompt_id: 'owned' } : {});
    } });
    const id = randomUUID();
    await jobs.submit('a', id, {});
    await assert.rejects(jobs.cancel('b', id), /does not belong/);
    await jobs.cancel('a', id);
    assert.deepEqual(calls[1], ['http://comfy/queue', { delete: ['owned'] }]);
    assert.equal(calls.some(([url]) => url.endsWith('/interrupt')), false);
    assert.equal((await jobs.poll('a', id)).status, 'cancelled');
    await assert.rejects(jobs.result('a', id), /no completed image/);
});

test('cancellation while submission is awaiting its prompt id still removes that exact id', async () => {
    let answer;
    const removed = [];
    const jobs = new ComfyJobs({ url: 'http://comfy', fetchImpl: async (url, options) => {
        if (url.endsWith('/prompt')) return new Promise((resolve) => { answer = resolve; });
        removed.push(JSON.parse(options.body));
        return Response.json({});
    } });
    const id = randomUUID();
    const pending = jobs.submit('a', id, {});
    await jobs.cancel('a', id);
    answer(Response.json({ prompt_id: 'late-owned' }));
    assert.equal((await pending).status, 'cancelled');
    assert.deepEqual(removed, [{ delete: ['late-owned'] }]);
});

test('complete render reads its own output, and a failed recipe is not a completed job', async () => {
    const jobs = new ComfyJobs({ url: 'http://comfy', fetchImpl: async (url) => {
        if (url.endsWith('/prompt')) return Response.json({ prompt_id: 'p' });
        return Response.json({ p: { status: { status_str: 'error' } } });
    } });
    const id = randomUUID();
    await jobs.submit('a', id, {});
    assert.equal((await jobs.poll('a', id)).status, 'failed');
});

test('a browser that forgot to poll a finished job does not permanently block its next render', async () => {
    let prompts = 0;
    const jobs = new ComfyJobs({ url: 'http://comfy', fetchImpl: async (url) => {
        if (url.endsWith('/prompt')) return Response.json({ prompt_id: `p${++prompts}` });
        return Response.json({ p1: { outputs: { image: { images: [{ filename: 'owned.png', type: 'output' }] } } } });
    } });
    await jobs.submit('a', randomUUID(), {});
    const next = await jobs.submit('a', randomUUID(), {});
    assert.equal(next.status, 'queued');
    assert.equal(prompts, 2);
});

test('sprite writes and deletion refuse foreign files and changed owned files', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'so-media-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const data = Buffer.alloc(32);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(data);
    data.writeUInt32BE(64, 16); data.writeUInt32BE(64, 20);
    const request = { character: 'Test', set: 'pilot', label: 'neutral', data: data.toString('base64'), key: digest('input'), recipe: { id: 'expression', version: 1 }, qa: {} };
    const first = await saveSprite(root, request);
    assert.equal(first.sha256, digest(data));
    await fs.writeFile(path.join(root, 'Test/pilot/neutral.png'), 'foreign');
    await assert.rejects(saveSprite(root, request), /not an unchanged/);
    await assert.rejects(deleteSprite(root, { ...request, expectedHash: first.sha256 }), /changed outside/);
    await assert.rejects(saveSprite(root, { ...request, set: '../escape' }), /Invalid/);
});

test('fingerprints change when weights change under the same name, and cannot escape roots', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'so-fingerprint-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    await fs.writeFile(path.join(root, 'model.bin'), 'first');
    const first = await fingerprint([root], 'model.bin');
    await fs.writeFile(path.join(root, 'model.bin'), 'second');
    const second = await fingerprint([root], 'model.bin');
    assert.notEqual(first.sha256, second.sha256);
    await assert.rejects(fingerprint([root], '../model.bin'), /Invalid/);
});

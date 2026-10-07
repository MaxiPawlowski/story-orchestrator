import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ComfyJobs } from './jobs.mjs';
import { saveSprite, deleteSprite, reconcileSet, removeStorySprites, fingerprint, digest, referencePack, referenceSets, alphaRecipes,
    recordReference, ownsReference, releaseReference, pruneReferences, referenceInventory } from './files.mjs';

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

test('a crashed sprite write is reconciled: a landed file completes its row, a partial one is dropped', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'so-media-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const character = 'Test', set = 'pilot';
    const folder = path.join(root, character, set);
    await fs.mkdir(folder, { recursive: true });
    const landed = Buffer.from('landed-bytes');
    await fs.writeFile(path.join(folder, 'neutral.png'), landed);
    await fs.writeFile(path.join(folder, 'partial.png'), 'half-written');
    const row = (sha256, status = 'pending') => ({ key: digest('input'), sha256, recipe: { id: 'expression', version: 1 }, qa: {}, status });
    const manifest = { owner: 'story-orchestrator', version: 1, character, set, labels: {
        neutral: row(digest(landed)),
        missing: row(digest('never-written')),
        partial: row(digest('expected-bytes')),
    } };
    await fs.writeFile(path.join(folder, 'so-sprites.json'), JSON.stringify(manifest));
    const reconciled = await reconcileSet(root, character, set);
    assert.equal(reconciled.labels.neutral.status, 'complete');
    assert.equal(reconciled.labels.missing, undefined);
    assert.equal(reconciled.labels.partial, undefined);
    await assert.rejects(fs.readFile(path.join(folder, 'partial.png')), /ENOENT/);
    const stored = JSON.parse(await fs.readFile(path.join(folder, 'so-sprites.json'), 'utf8'));
    assert.deepEqual(Object.keys(stored.labels), ['neutral']);
});

test('story-scoped removal deletes only the labels built for that story, and an emptied set folder', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'so-media-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const bytes = Buffer.alloc(32);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
    bytes.writeUInt32BE(64, 16); bytes.writeUInt32BE(64, 20);
    const base = { character: 'Test', set: 'pilot', data: bytes.toString('base64'), key: digest('input'), recipe: { id: 'expression', version: 1 }, qa: {} };
    await saveSprite(root, { ...base, label: 'neutral', inputs: { story: 'story-a' } });
    await saveSprite(root, { ...base, label: 'happy', inputs: { story: 'story-b' } });
    const removed = await removeStorySprites(root, 'story-a');
    assert.deepEqual(removed.labels, ['Test/pilot/neutral']);
    assert.deepEqual(removed.sets, []);
    const manifest = JSON.parse(await fs.readFile(path.join(root, 'Test/pilot/so-sprites.json'), 'utf8'));
    assert.deepEqual(Object.keys(manifest.labels), ['happy']);
    await removeStorySprites(root, 'story-b');
    await assert.rejects(fs.readFile(path.join(root, 'Test/pilot/so-sprites.json')), /ENOENT/);
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

test('existing reference packs are read-only, fingerprinted by content, and never acquire generated ownership', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'so-references-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const folder = path.join(root, 'Test', 'old_pack');
    await fs.mkdir(folder, { recursive: true });
    const bytes = Buffer.alloc(32);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
    bytes.writeUInt32BE(64, 16); bytes.writeUInt32BE(96, 20);
    await fs.writeFile(path.join(folder, 'neutral.png'), bytes);
    await fs.writeFile(path.join(root, 'Test', 'happy.png'), bytes);
    assert.deepEqual(await referenceSets(root, 'Test'), ['', 'old_pack']);
    const first = await referencePack(root, 'Test', 'old_pack');
    assert.deepEqual(first.files, [{ label: 'neutral', path: '/characters/Test/old_pack/neutral.png', sha256: digest(bytes), width: 64, height: 96 }]);
    assert.deepEqual((await referencePack(root, 'Test', '')).files.map((file) => file.path), ['/characters/Test/happy.png']);
    await assert.rejects(fs.readFile(path.join(folder, 'so-sprites.json')), /ENOENT/);
    await assert.rejects(deleteSprite(root, { character: 'Test', set: 'old_pack', label: 'neutral', expectedHash: digest(bytes) }), /not an owned/);
    assert.deepEqual(await removeStorySprites(root, 'any-story'), { sets: [], labels: [] });
    assert.deepEqual(await fs.readFile(path.join(folder, 'neutral.png')), bytes);
    bytes[31] = 1;
    await fs.writeFile(path.join(folder, 'neutral.png'), bytes);
    assert.notEqual((await referencePack(root, 'Test', 'old_pack')).sha256, first.sha256);
    await assert.rejects(referencePack(root, 'Test', '../escape'), /Invalid/);
    await assert.rejects(referencePack(root, '../Test', ''), /Invalid/);
});

test('story cleanup preserves unledgered files inside an otherwise emptied generated folder', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'so-cleanup-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const bytes = Buffer.alloc(32);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
    bytes.writeUInt32BE(64, 16); bytes.writeUInt32BE(64, 20);
    await saveSprite(root, { character: 'Test', set: 'look_test', label: 'neutral', data: bytes.toString('base64'),
        key: digest('input'), recipe: { id: 'look', version: 1 }, qa: {}, inputs: { story: 'story-a' } });
    const foreign = path.join(root, 'Test', 'look_test', 'my-art.png');
    await fs.writeFile(foreign, 'author artwork');
    const removed = await removeStorySprites(root, 'story-a');
    assert.deepEqual(removed.labels, ['Test/look_test/neutral']);
    assert.deepEqual(removed.sets, []);
    assert.equal(await fs.readFile(foreign, 'utf8'), 'author artwork');
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, 'Test', 'look_test', 'so-sprites.json'), 'utf8')).labels, {});
});

test('alpha discovery offers only configured, installed files and never downloads a missing model', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'so-alpha-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    await fs.writeFile(path.join(root, 'installed.bin'), 'alpha-weights');
    const recipes = [{ id: 'installed', node: 'BiRefNetRMBG', model: 'installed', files: [{ kind: 'alpha', name: 'installed.bin' }] },
        { id: 'missing', node: 'BiRefNetRMBG', model: 'missing', files: [{ kind: 'alpha', name: 'missing.bin' }] }];
    const nodes = { SplitImageWithAlpha: {}, BiRefNetRMBG: { input: { required: { model: [['installed', 'missing']] } } } };
    assert.deepEqual(await alphaRecipes({ alpha: [root] }, recipes, nodes), [
        { id: 'installed', node: 'BiRefNetRMBG', model: 'installed', files: [{ name: 'installed.bin', sha256: digest('alpha-weights'), size: 13 }] },
    ]);
    assert.deepEqual(await alphaRecipes({ alpha: [root] }, recipes, {}), []);
    assert.deepEqual(await fs.readdir(root), ['installed.bin']);
});

test('reference cleanup survives restart and removes only explicitly released, hash-matching inputs', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'so-reference-cleanup-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const user = path.join(root, 'user'), foreignUser = path.join(root, 'other-user'), input = path.join(root, 'input');
    await fs.mkdir(user); await fs.mkdir(foreignUser); await fs.mkdir(path.join(input, 'story-orchestrator'), { recursive: true });
    const name = `story-orchestrator/so_${randomUUID()}.png`, bytes = Buffer.from('owned-input');
    const file = path.join(input, name);
    await recordReference(user, name, digest(bytes), { set: 'so_test_frames', character: 'Arin' });
    await fs.writeFile(file, bytes);
    assert.equal(await ownsReference(user, name), true);
    assert.equal(await ownsReference(foreignUser, name), false);
    assert.equal((await referenceInventory(user))[0].set, 'so_test_frames');
    assert.equal((await pruneReferences(user, input, [name])).errors.length, 1);
    await assert.rejects(releaseReference(foreignUser, name), /does not belong/);
    await releaseReference(user, name);
    assert.equal(await ownsReference(user, name), false);
    await fs.writeFile(file, 'external replacement');
    assert.equal((await pruneReferences(user, input, [name])).errors.length, 1);
    assert.equal(await fs.readFile(file, 'utf8'), 'external replacement');
    await fs.writeFile(file, bytes);
    const unrelated = path.join(input, 'story-orchestrator', 'my-input.png');
    await fs.writeFile(unrelated, 'author input');
    assert.deepEqual(await pruneReferences(user, input, [name]), { deleted: [name], errors: [] });
    assert.deepEqual(await referenceInventory(user), []);
    assert.equal(await fs.readFile(unrelated, 'utf8'), 'author input');
    await assert.rejects(pruneReferences(user, input, ['../my-input.png']), /explicit list/);
});

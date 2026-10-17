import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const plugin = await import(pathToFileURL(path.join(here, 'index.mjs')).href);

const worldsDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'so-lore-'));
const book = (content) => ({ entries: { 3: { uid: 3, comment: 'Gate', content, disable: false }, 5: { uid: 5, comment: 'Ferry', content: 'The ferry.', disable: false } } });
const put = (worlds, name, data) => fs.writeFileSync(path.join(worlds, `${name}.json`), JSON.stringify(data, null, 4));
const read = (worlds, name) => JSON.parse(fs.readFileSync(path.join(worlds, `${name}.json`), 'utf8'));

test('the revision matches the page: canonical entries, key order ignored, pinned vector shared with src/services/stHost/lorebookImage.ts', () => {
    assert.equal(plugin.lorebookRevision({ 5: { b: 1, a: 'x' }, 3: { c: [1, 2] } }), plugin.lorebookRevision({ 3: { c: [1, 2] }, 5: { a: 'x', b: 1 } }));
    assert.equal(plugin.lorebookRevision({ 3: { uid: 3, comment: 'Gate', content: 'The gate.' } }), '36-61763caa6860bd84');
    assert.notEqual(plugin.lorebookRevision({ 3: { content: 'a' } }), plugin.lorebookRevision({ 3: { content: 'b' } }));
});

test('commits when the file still holds the expected entries, and answers the new revision', () => {
    const worlds = worldsDir();
    put(worlds, 'Shared Lore', book('The gate.'));
    const next = book('The gate fell.');
    const result = plugin.commitLorebook(worlds, { name: 'Shared Lore', expected: plugin.lorebookRevision(book('The gate.').entries), data: next });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { ok: true, revision: plugin.lorebookRevision(next.entries) });
    assert.deepEqual(read(worlds, 'Shared Lore'), next);
});

test('B writes between A reading the book and A committing: A is refused 409 and B survives', () => {
    const worlds = worldsDir();
    put(worlds, 'Shared Lore', book('The gate.'));
    const aRead = read(worlds, 'Shared Lore');
    const bRead = read(worlds, 'Shared Lore');
    const bNext = structuredClone(bRead);
    bNext.entries[5].content = 'B rewrote the ferry.';
    assert.equal(plugin.commitLorebook(worlds, { name: 'Shared Lore', expected: plugin.lorebookRevision(bRead.entries), data: bNext }).status, 200);
    const aNext = structuredClone(aRead);
    aNext.entries[3].disable = true;
    const refused = plugin.commitLorebook(worlds, { name: 'Shared Lore', expected: plugin.lorebookRevision(aRead.entries), data: aNext });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.conflict, true);
    assert.equal(refused.body.revision, plugin.lorebookRevision(bNext.entries));
    assert.equal(read(worlds, 'Shared Lore').entries[5].content, 'B rewrote the ferry.');
    assert.equal(read(worlds, 'Shared Lore').entries[3].disable, false);
});

test('a missing book is a conflict, never a create', () => {
    const worlds = worldsDir();
    const result = plugin.commitLorebook(worlds, { name: 'Gone', expected: 'x', data: book('x') });
    assert.deepEqual([result.status, result.body.missing], [409, true]);
    assert.equal(fs.existsSync(path.join(worlds, 'Gone.json')), false);
});

test('names that are not a plain file name, and bodies without a revision or entries, are refused 400 and write nothing', () => {
    const worlds = worldsDir();
    put(worlds, 'Shared Lore', book('The gate.'));
    const expected = plugin.lorebookRevision(book('The gate.').entries);
    for (const name of ['../escape', 'a/b', 'CON', 'trailing.', '', 'x:y']) {
        assert.equal(plugin.commitLorebook(worlds, { name, expected, data: book('y') }).status, 400, name);
    }
    assert.equal(plugin.commitLorebook(worlds, { name: 'Shared Lore', data: book('y') }).status, 400);
    assert.equal(plugin.commitLorebook(worlds, { name: 'Shared Lore', expected, data: { name: 'no entries' } }).status, 400);
    assert.deepEqual(read(worlds, 'Shared Lore'), book('The gate.'));
    assert.deepEqual(fs.readdirSync(worlds), ['Shared Lore.json']);
});

test('the router answers status and commit with the user worlds folder; a thrown write is 500', async () => {
    const routes = {};
    const router = { get: (route, handler) => { routes[`GET ${route}`] = handler; }, post: (route, handler) => { routes[`POST ${route}`] = handler; } };
    await plugin.init(router);
    const respond = () => {
        const out = {};
        const res = { status(code) { out.status = code; return res; }, json(value) { out.body = value; out.status ??= 200; return res; } };
        return { res, out };
    };
    const status = respond();
    routes['GET /status']({}, status.res);
    assert.deepEqual(status.out.body, { ok: true, version: plugin.PLUGIN_VERSION });
    const worlds = worldsDir();
    put(worlds, 'Shared Lore', book('The gate.'));
    const commit = respond();
    routes['POST /commit']({ user: { directories: { worlds } }, body: { name: 'Shared Lore', expected: plugin.lorebookRevision(book('The gate.').entries), data: book('Next.') } }, commit.res);
    assert.deepEqual([commit.out.status, commit.out.body.ok], [200, true]);
    fs.writeFileSync(path.join(worlds, 'Broken.json'), '{not json');
    const broken = respond();
    routes['POST /commit']({ user: { directories: { worlds } }, body: { name: 'Broken', expected: 'x', data: book('x') } }, broken.res);
    assert.equal(broken.out.status, 500);
});

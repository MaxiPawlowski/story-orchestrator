import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { mountPackRoutes, readInstalledPacks, PACK_DIR, MAX_PACK_BYTES } from './packRoutes.mjs';
import { testTempDir } from '../../scripts/lib/testTemp.mjs';

const tempRoot = async () => testTempDir('so-packs-');

test('visual bridge: installed packs are listed from the user folder, nested, with unreadable files named', async () => {
    const root = await tempRoot();
    const base = path.join(root, ...PACK_DIR);
    await fs.mkdir(path.join(base, 'identities', 'fixture-a'), { recursive: true });
    await fs.writeFile(path.join(base, 'identities', 'fixture-a', 'pack.json'), JSON.stringify({ id: 'fixture-a', kind: 'identity' }));
    await fs.writeFile(path.join(base, 'broken.json'), '{ not json');
    await fs.writeFile(path.join(base, 'notes.txt'), 'ignored');
    await fs.writeFile(path.join(base, 'huge.json'), ' '.repeat(MAX_PACK_BYTES + 1));
    const listed = await readInstalledPacks(root);
    assert.deepEqual(listed.packs, [{ file: 'identities/fixture-a/pack.json', pack: { id: 'fixture-a', kind: 'identity' } }]);
    assert.deepEqual(listed.errors.map((row) => row.file).sort(), ['broken.json', 'huge.json']);
    await fs.rm(root, { recursive: true, force: true });
});

test('visual bridge: no pack folder is an empty catalog, and the route needs a signed-in user', async () => {
    const root = await tempRoot();
    assert.deepEqual(await readInstalledPacks(root), { packs: [], errors: [] });
    const routes = {};
    mountPackRoutes({ get: (name, run) => { routes[name] = run; } });
    const call = async (req) => {
        let status = 200, body;
        await routes['/packs'](req, { status(code) { status = code; return this; }, json(value) { body = value; return this; } });
        return { status, body };
    };
    assert.equal((await call({})).status, 401);
    assert.deepEqual(await call({ user: { directories: { root } } }), { status: 200, body: { packs: [], errors: [] } });
    await fs.rm(root, { recursive: true, force: true });
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chooseComfyUrl, createComfyTarget, COMFY_DEFAULT_URL } from './comfyTarget.mjs';

test('plan 32 W4: the ComfyUI address is config first, then SillyTavern Image Generation, then the documented default', () => {
    const st = { extension_settings: { sd: { comfy_url: 'http://192.0.2.7:8188' } } };
    assert.deepEqual(chooseComfyUrl({ configured: 'http://comfy.test:9000', stSettings: st }), { url: 'http://comfy.test:9000', from: 'config' });
    assert.deepEqual(chooseComfyUrl({ configured: undefined, stSettings: st }), { url: 'http://192.0.2.7:8188', from: 'sillytavern' });
    assert.deepEqual(chooseComfyUrl({ configured: undefined, stSettings: { extension_settings: { sd: { comfy_url: 'ftp://x' } } } }), { url: COMFY_DEFAULT_URL, from: 'default' });
    assert.deepEqual(chooseComfyUrl({ configured: undefined, stSettings: null }), { url: COMFY_DEFAULT_URL, from: 'default' });
    assert.throws(() => createComfyTarget({ configured: 'file:///etc', readSettings: async () => null }), /HTTP or HTTPS/);
});

test('one job pool per address, and an unreadable settings file falls back to the default', async () => {
    const made = [];
    const st = { extension_settings: { sd: { comfy_url: 'http://192.0.2.7:8188' } } };
    const target = createComfyTarget({ configured: undefined, readSettings: async (req) => req.settings, makeJobs: (url) => { made.push(url); return { url }; } });
    const first = await target({ settings: st });
    const again = await target({ settings: st });
    assert.equal(first.jobs, again.jobs);
    assert.equal(first.from, 'sillytavern');
    assert.deepEqual(made, ['http://192.0.2.7:8188']);
    const unreadable = await createComfyTarget({ configured: undefined, readSettings: async () => { throw new Error('ENOENT'); }, makeJobs: (url) => ({ url }) })({});
    assert.deepEqual({ url: unreadable.url, from: unreadable.from }, { url: COMFY_DEFAULT_URL, from: 'default' });
});

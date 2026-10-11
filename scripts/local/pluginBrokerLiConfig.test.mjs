import test from 'node:test';
import assert from 'node:assert/strict';
import { superviseConfigFromLocal, median, fakeRouter } from './pluginBrokerLiConfig.mjs';
import { validateConfig } from '../../server-plugin/story-orchestrator-gpu/config.mjs';

const local = { binary: 'C:/b/llama-server.exe', model: 'C:/m/x.gguf', modelAlias: 'a', comfyUrl: 'http://127.0.0.1:8188', comfyPython: 'C:/p/python.exe', comfyRoot: 'C:/c',
    reserves: { gpuMiB: 2048, ramMiB: 4096 }, comfyExtraArgs: ['--fast-disk'],
    profiles: { fast: { args: ['--ctx-size', '32768', '--port', '9', '--n-gpu-layers', 'auto'], estimatedGpuMiB: 1, estimatedRamMiB: 2 } } };

test('a local config maps to a supervise config the plugin validates', () => {
    const config = superviseConfigFromLocal(local, { stateDir: 'C:/s', listenPort: 18898, textPort: 18899 });
    assert.deepEqual(config.text.profiles.fast.args, ['--ctx-size', '32768', '--n-gpu-layers', 'auto']);
    assert.equal(validateConfig(config).adapter, 'supervise');
    assert.deepEqual(config.comfy.extraArgs, ['--cache-ram', '8', '--reserve-vram', '2', '--fast-disk']);
});

test('a missing profile is refused', () => {
    assert.throws(() => superviseConfigFromLocal(local, { stateDir: 'C:/s', listenPort: 1, textPort: 2, profile: 'nope' }), /chosen profile/);
});

test('median handles odd, even and empty', () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 2, 3]), 2.5);
    assert.equal(median([]), null);
});

test('the fake router finds exact and control routes', () => {
    const router = fakeRouter();
    const lease = () => 1;
    const control = () => 2;
    router.post('/lease', lease);
    router.post('/control/:action', control);
    assert.equal(router.find('POST', '/lease').handler, lease);
    assert.deepEqual(router.find('POST', '/control/load'), { handler: control, params: { action: 'load' } });
    assert.equal(router.find('GET', '/lease'), null);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { CONTROLLER_DEFAULTS, comfyPort, controllerStatus, withControllerDefaults } from './controllerStatus.mjs';

const imageCache = { last: { freed: true }, lastFailure: null };
const status = (config) => controllerStatus({ config, scheduler: { profile: 'fast' }, imageCache, telemetry: { gpus: [] },
    controllerBuild: 'build', pid: 7, configFile: 'config.json' });

test('/status reports the reserves and context the config declares, not a built-in value', () => {
    const reserves = { gpuMiB: 3072, ramMiB: 6144 };
    const shape = status(withControllerDefaults({ reserves, maxContext: 65536 }));
    assert.deepEqual(shape.reserves, reserves);
    assert.equal(shape.maxContext, 65536);
    assert.equal(status(withControllerDefaults({ reserves: { gpuMiB: 1024, ramMiB: 2048 } })).reserves.gpuMiB, 1024);
    assert.equal(shape.profile, 'fast');
    assert.equal(shape.imageCacheMode, 'warm');
    assert.equal(shape.imageCacheHostTrim, null);
    assert.deepEqual([shape.adapter, shape.guarding, shape.pid, shape.configFile], ['managed', true, 7, 'config.json']);
});

test('a config without reserves reports none rather than inventing them', () => {
    assert.equal(status(withControllerDefaults({})).reserves, undefined);
});

test('maxContext and the ComfyUI URL default to the documented values, and the port follows the URL', () => {
    const config = withControllerDefaults({ reserves: { gpuMiB: 2048, ramMiB: 4096 } });
    assert.equal(config.maxContext, 98304);
    assert.equal(config.comfyUrl, 'http://127.0.0.1:8188');
    assert.equal(comfyPort(config), '8188');
    assert.equal(comfyPort(withControllerDefaults({ comfyUrl: 'http://127.0.0.1:8190' })), '8190');
    assert.equal(withControllerDefaults({ maxContext: 32768 }).maxContext, 32768);
    assert.deepEqual(CONTROLLER_DEFAULTS, { maxContext: 98304, comfyUrl: 'http://127.0.0.1:8188' });
});

test('the broker core holds no machine value of its own', async () => {
    for (const name of ['arbiter', 'gateway', 'backend', 'scheduler']) {
        const source = await fs.readFile(new URL(`./${name}.mjs`, import.meta.url), 'utf8');
        assert.doesNotMatch(source, /98304|'8188'|Artemis|so-local\/trim|nativePoolTrim|\b[A-Z]:[\\/]/, name);
    }
});

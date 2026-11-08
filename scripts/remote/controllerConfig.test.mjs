import test from 'node:test';
import assert from 'node:assert/strict';
import { linuxControllerConfig } from './controllerConfig.mjs';
import { nativeArgs } from '../../server-plugin/story-orchestrator-gpu/broker/backend.mjs';
import { memberCacheOptions } from '../../server-plugin/story-orchestrator-gpu/broker/memberCache.mjs';
import { withControllerDefaults } from '../../server-plugin/story-orchestrator-gpu/broker/controllerStatus.mjs';

const base = { BIN: '/root/so-llama/build/b11888-so/bin/llama-server', MODEL: '/root/so-llama/models/a.gguf', STATE_DIR: '/root/so-ctl-state' };

test('box defaults: 128K play, images off, ram member cache with server keys', () => {
    const config = linuxControllerConfig({ ...base, MTP_MODEL: '/root/so-llama/models/mtp.gguf', THREADS: '6' });
    assert.equal(config.images, false);
    assert.equal(config.maxContext, 131072);
    assert.equal(config.gatewayPort, 18888);
    assert.equal(config.slots, undefined);
    assert.deepEqual(config.memberCache, { enabled: true, store: 'ram', budgetMiB: 32768, serverKeys: true, erase: false, park: false, keepAcrossImages: false });
    assert.equal(memberCacheOptions(config).budgetMiB, 32768);
    const args = nativeArgs(withControllerDefaults(config), config.profiles.play);
    const last = (flag) => args[args.lastIndexOf(flag) + 1];
    assert.equal(last('--ctx-size'), '131072');
    assert.equal(last('--fit'), 'off');
    assert.equal(last('--n-gpu-layers'), 'all');
    assert.equal(last('--threads'), '6');
    assert.equal(last('--cache-ram'), '32768');
    assert.equal(last('--host'), '127.0.0.1');
    assert.equal(last('--spec-type'), 'draft-mtp');
    assert.equal(last('--parallel'), '1');
});

test('knobs: two slots over a larger pool, stock server erases', () => {
    const config = linuxControllerConfig({ ...base, CTX: '147456', SLOTS: '2', SERVER_KEYS: '0', CACHE_MIB: '16384', GATEWAY_PORT: '18892', BACKEND_PORT: '18893' });
    assert.equal(config.maxContext, 131072);
    assert.deepEqual(config.slots, { count: 2, chat: 0, side: 1 });
    assert.equal(config.memberCache.serverKeys, false);
    assert.equal(config.memberCache.erase, true);
    assert.equal(config.speculative, undefined);
    assert.equal(nativeArgs(withControllerDefaults(config), config.profiles.play).join(' ').includes('--parallel 2'), true);
});

test('refuses missing paths and bad numbers', () => {
    assert.throws(() => linuxControllerConfig({ MODEL: 'm', STATE_DIR: 's' }), /BIN is required/);
    assert.throws(() => linuxControllerConfig({ ...base, CTX: 'big' }), /CTX must be/);
    assert.throws(() => linuxControllerConfig({ ...base, CTX: '32768', MAX_CONTEXT: '65536' }), /larger than CTX/);
    assert.throws(() => linuxControllerConfig({ ...base, GATEWAY_PORT: '18889' }), /must differ/);
});

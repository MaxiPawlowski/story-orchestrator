import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runtimeMemoryProfile } from './runtimeIdentity.mjs';

test('only the supported disk-streaming runtime receives the smaller RAM staging estimate', () => {
    const system = { pytorch_version: '2.12.1+cu130', argv: ['--fast-disk'] };
    assert.equal(runtimeMemoryProfile(system, 'code').streaming, true);
    assert.equal(runtimeMemoryProfile({ ...system, pytorch_version: '2.7.1+cu130' }, 'code').streaming, false);
    assert.equal(runtimeMemoryProfile({ ...system, pytorch_version: '2.12.1+cu128' }, 'code').streaming, false);
    assert.equal(runtimeMemoryProfile({ ...system, argv: [] }, 'code').streaming, false);
    for (const flag of ['--disable-dynamic-vram', '--highvram', '--gpu-only', '--novram', '--cpu']) {
        assert.equal(runtimeMemoryProfile({ ...system, argv: ['--fast-disk', flag] }, 'code').streaming, false);
    }
    assert.equal(runtimeMemoryProfile(undefined, 'code').streaming, false);
});

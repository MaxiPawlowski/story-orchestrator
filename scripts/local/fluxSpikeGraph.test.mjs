import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fluxSpikeGraph, spikeModelFiles } from './fluxSpikeGraph.mjs';

test('quantized arms preserve geometry, guidance, sampler and steps; no approximate cache or CPU offload is enabled', () => {
    const input = { model: 'flux', components: { clip: 'clip', t5: 't5', vae: 'vae' }, positive: 'hall', size: { width: 1344, height: 768 }, seed: 17 };
    const gguf = fluxSpikeGraph({ ...input, arm: 'gguf' });
    const nunchaku = fluxSpikeGraph({ ...input, arm: 'nunchaku' });
    assert.deepEqual(gguf['8'], nunchaku['8']);
    assert.equal(gguf['8'].inputs.steps, 25);
    assert.equal(gguf['8'].inputs.scheduler, 'beta');
    assert.deepEqual(gguf['7'].inputs, { width: 1344, height: 768, batch_size: 1 });
    assert.equal(nunchaku['1'].inputs.cache_threshold, 0);
    assert.equal(nunchaku['1'].inputs.cpu_offload, 'disable');
    assert.equal(spikeModelFiles({ ...input, arm: 'gguf' }).length, 4);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('component extraction preserves tensor bytes and dtype and refuses an existing component', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'so-flux-components-'));
    try {
        const file = path.join(dir, 'source.safetensors');
        const destination = path.join(dir, 'components');
        const header = {};
        for (const [index, key] of ['text_encoders.clip_l.transformer.text_model.test', 'text_encoders.t5xxl.transformer.encoder.test', 'vae.decoder.test'].entries()) {
            header[key] = { dtype: 'F16', shape: [1], data_offsets: [index * 2, index * 2 + 2] };
        }
        const encoded = Buffer.from(JSON.stringify(header));
        const size = Buffer.alloc(8); size.writeBigUInt64LE(BigInt(encoded.length));
        const data = Buffer.from([1, 2, 3, 4, 5, 6]);
        await fs.writeFile(file, Buffer.concat([size, encoded, data]));
        const run = spawnSync('python', ['scripts/local/flux-components.py', file, destination], { encoding: 'utf8' });
        assert.equal(run.status, 0, run.stderr);
        for (const [index, label] of ['clip_l', 't5xxl', 'ae'].entries()) {
            const bytes = await fs.readFile(path.join(destination, `${label}.safetensors`));
            const length = Number(bytes.readBigUInt64LE());
            const tensors = JSON.parse(bytes.subarray(8, 8 + length).toString());
            const row = Object.entries(tensors).find(([name]) => name !== '__metadata__')?.[1];
            assert.equal(row.dtype, 'F16');
            assert.deepEqual(bytes.subarray(8 + length), data.subarray(index * 2, index * 2 + 2));
        }
        const again = spawnSync('python', ['scripts/local/flux-components.py', file, destination], { encoding: 'utf8' });
        assert.notEqual(again.status, 0);
        assert.match(again.stderr, /Refusing to overwrite/);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

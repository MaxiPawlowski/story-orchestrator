import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { estimateNeedMiB, weightsMiB } from './models.mjs';

const frame = (header) => {
    const json = Buffer.from(JSON.stringify(header), 'utf8');
    const prefix = Buffer.alloc(8);
    prefix.writeBigUInt64LE(BigInt(json.length), 0);
    return Buffer.concat([prefix, json]);
};
const tensor = (bytes) => frame({ weight: { dtype: 'F16', shape: [bytes / 2], data_offsets: [0, bytes] } });

test('weights sum across the files a render uses and resolve under their kind', async () => {
    const dir = path.join(os.tmpdir(), `so-models-${process.pid}-${Date.now()}`);
    await fs.mkdir(dir, { recursive: true });
    try {
        await fs.writeFile(path.join(dir, 'a.safetensors'), tensor(2 * 1024 * 1024));
        await fs.writeFile(path.join(dir, 'b.safetensors'), tensor(1024 * 1024));
        const modelDirs = { checkpoints: [dir], loras: [dir] };
        assert.equal(await weightsMiB(modelDirs, [{ kind: 'checkpoints', name: 'a.safetensors' }, { kind: 'loras', name: 'b.safetensors' }]), 3);
        const need = await estimateNeedMiB({ modelDirs, files: [{ kind: 'checkpoints', name: 'a.safetensors' }], width: 1344, height: 768, hires: false });
        assert.equal(need, 2 + 2442);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('an unknown model or kind is refused, never silently estimated', async () => {
    const dir = path.join(os.tmpdir(), `so-models-bad-${process.pid}-${Date.now()}`);
    await fs.mkdir(dir, { recursive: true });
    try {
        const modelDirs = { checkpoints: [dir] };
        await assert.rejects(weightsMiB(modelDirs, [{ kind: 'checkpoints', name: 'missing.safetensors' }]), /not under a configured/);
        await assert.rejects(weightsMiB(modelDirs, [{ kind: 'loras', name: 'x.safetensors' }]), /No configured directory/);
        await assert.rejects(weightsMiB(modelDirs, [{ kind: 'checkpoints', name: '../evil.safetensors' }]), /Invalid model file name/);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readGGUFUpperBytes } from './gguf.mjs';

test('GGUF sizing validates its header and uses a conservative file-byte bound', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'so-gguf-'));
    try {
        const file = path.join(dir, 'weights.gguf');
        const bytes = Buffer.alloc(256); bytes.write('GGUF'); bytes.writeUInt32LE(3, 4); bytes.writeBigUInt64LE(1n, 8);
        await fs.writeFile(file, bytes);
        assert.equal(await readGGUFUpperBytes(file), 256);
        bytes.write('BAD!'); await fs.writeFile(file, bytes);
        await assert.rejects(readGGUFUpperBytes(file), /invalid GGUF/);
        bytes.write('GGUF'); bytes.writeUInt32LE(99, 4); await fs.writeFile(file, bytes);
        await assert.rejects(readGGUFUpperBytes(file), /invalid GGUF/);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

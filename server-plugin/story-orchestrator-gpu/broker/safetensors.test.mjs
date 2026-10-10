import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseHeaderJson, parseSafetensorsHeader, readSafetensorsBytes } from './safetensors.mjs';

const frame = (header) => {
    const json = Buffer.from(JSON.stringify(header), 'utf8');
    const prefix = Buffer.alloc(8);
    prefix.writeBigUInt64LE(BigInt(json.length), 0);
    return Buffer.concat([prefix, json]);
};

const HEADER = {
    weight: { dtype: 'F16', shape: [2, 2], data_offsets: [0, 8] },
    bias: { dtype: 'F32', shape: [1], data_offsets: [8, 12] },
    __metadata__: { format: 'pt' },
};

test('the header sum counts data offsets and ignores metadata', () => {
    assert.deepEqual(parseHeaderJson(JSON.stringify(HEADER)), { bytes: 12, tensors: 2 });
    assert.deepEqual(parseSafetensorsHeader(frame(HEADER)), { bytes: 12, tensors: 2, headerLength: Buffer.byteLength(JSON.stringify(HEADER)) });
});

test('a short or truncated header is refused, never guessed', () => {
    assert.throws(() => parseSafetensorsHeader(Buffer.alloc(4)), /Not a safetensors header/);
    const full = frame(HEADER);
    assert.throws(() => parseSafetensorsHeader(full.subarray(0, full.length - 3)), /truncated/);
    assert.throws(() => parseHeaderJson(JSON.stringify({ bad: { dtype: 'F16' } })), /no data offsets/);
});

test('reading a file touches only the header', async () => {
    const file = path.join(os.tmpdir(), `so-safetensors-${process.pid}-${Date.now()}.safetensors`);
    await fs.writeFile(file, Buffer.concat([frame(HEADER), Buffer.alloc(4096, 7)]));
    try {
        assert.deepEqual(await readSafetensorsBytes(file), { bytes: 12, tensors: 2 });
    } finally { await fs.rm(file, { force: true }); }
});

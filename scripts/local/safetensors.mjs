import { open } from 'node:fs/promises';

const PREFIX_BYTES = 8;
const MAX_HEADER_BYTES = 128 * 1024 * 1024;

export function parseHeaderJson(text) {
    const parsed = JSON.parse(text);
    let bytes = 0;
    let tensors = 0;
    for (const [name, entry] of Object.entries(parsed)) {
        if (name === '__metadata__') continue;
        const offsets = entry?.data_offsets;
        if (!Array.isArray(offsets) || offsets.length !== 2) throw new Error(`Tensor ${name} has no data offsets.`);
        const start = Number(offsets[0]);
        const end = Number(offsets[1]);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new Error(`Tensor ${name} has invalid data offsets.`);
        bytes += end - start;
        tensors += 1;
    }
    return { bytes, tensors };
}

export function parseSafetensorsHeader(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < PREFIX_BYTES) throw new Error('Not a safetensors header.');
    const headerLength = Number(buffer.readBigUInt64LE(0));
    if (!Number.isInteger(headerLength) || headerLength <= 0 || headerLength > MAX_HEADER_BYTES) throw new Error('The safetensors header length is implausible.');
    if (PREFIX_BYTES + headerLength > buffer.length) throw new Error('The safetensors header is truncated.');
    return { ...parseHeaderJson(buffer.subarray(PREFIX_BYTES, PREFIX_BYTES + headerLength).toString('utf8')), headerLength };
}

export async function readSafetensorsBytes(file) {
    const handle = await open(file, 'r');
    try {
        const prefix = Buffer.alloc(PREFIX_BYTES);
        if ((await handle.read(prefix, 0, PREFIX_BYTES, 0)).bytesRead !== PREFIX_BYTES) throw new Error('The file is too short to be safetensors.');
        const headerLength = Number(prefix.readBigUInt64LE(0));
        if (!Number.isInteger(headerLength) || headerLength <= 0 || headerLength > MAX_HEADER_BYTES) throw new Error('The safetensors header length is implausible.');
        const header = Buffer.alloc(headerLength);
        if ((await handle.read(header, 0, headerLength, PREFIX_BYTES)).bytesRead !== headerLength) throw new Error('The safetensors header is truncated.');
        return parseHeaderJson(header.toString('utf8'));
    } finally { await handle.close(); }
}

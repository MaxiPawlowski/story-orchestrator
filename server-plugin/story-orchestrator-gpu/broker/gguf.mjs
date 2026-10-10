import fs from 'node:fs/promises';

export async function readGGUFUpperBytes(file) {
    const handle = await fs.open(file, 'r');
    try {
        const header = Buffer.alloc(24);
        const { bytesRead } = await handle.read(header, 0, header.length, 0);
        if (bytesRead !== 24 || header.toString('ascii', 0, 4) !== 'GGUF' || ![2, 3].includes(header.readUInt32LE(4))
            || header.readBigUInt64LE(8) === 0n) throw new Error('Unsupported or invalid GGUF header.');
        return (await handle.stat()).size;
    } finally { await handle.close(); }
}

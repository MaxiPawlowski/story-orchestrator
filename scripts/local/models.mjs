import path from 'node:path';
import { readSafetensorsBytes } from './safetensors.mjs';
import { bytesToMiB, estimateGpuMiB, activationMarginMiB } from './estimate.mjs';
import fs from 'node:fs/promises';
import { readGGUFUpperBytes } from './gguf.mjs';

const safeName = (name) => {
    const value = String(name ?? '');
    if (!value || value.length > 200 || path.isAbsolute(value)) throw new Error('Invalid model file name.');
    if (value.split(/[\\/]/).some((part) => part === '..' || part === '.')) throw new Error('Invalid model file name.');
    return value;
};

export async function modelIdentities(modelDirs, files) {
    const identities = [];
    for (const file of files ?? []) {
        const dirs = modelDirs?.[file?.kind];
        if (!Array.isArray(dirs) || !dirs.length) throw new Error(`No configured directory for model kind ${file?.kind}.`);
        const name = safeName(file.name);
        let found = false;
        for (const dir of dirs) {
            const base = path.resolve(dir);
            const full = path.resolve(base, name);
            if (full !== base && !full.startsWith(`${base}${path.sep}`)) continue;
            try {
                const stat = await fs.stat(full);
                const gguf = name.toLowerCase().endsWith('.gguf');
                const bytes = gguf ? await readGGUFUpperBytes(full) : (await readSafetensorsBytes(full)).bytes;
                identities.push({ kind: file.kind, name, size: stat.size, modified: stat.mtimeMs, weightsMiB: bytesToMiB(bytes), sizeKind: gguf ? 'file-upper-bound' : 'tensor-bytes' });
                found = true; break;
            }
            catch (error) { if (error.code === 'ENOENT') continue; throw error; }
        }
        if (!found) throw new Error(`Model ${name} is not under a configured ${file.kind} directory.`);
    }
    if (!identities.length || identities.some((row) => row.weightsMiB <= 0)) throw new Error('No model weights were resolved for this render.');
    return identities;
}

export async function weightsMiB(modelDirs, files) {
    return (await modelIdentities(modelDirs, files)).reduce((sum, row) => sum + row.weightsMiB, 0);
}

export function estimateRamMiB({ weightMiB, width, height, hires, streaming = false }) {
    const staging = streaming ? Math.min(weightMiB, 8192) : weightMiB;
    return Math.ceil(staging + activationMarginMiB({ width, height, hires }));
}

export async function estimateNeedMiB({ modelDirs, files, width, height, hires }) {
    return estimateGpuMiB({ weightsMiB: await weightsMiB(modelDirs, files), width, height, hires: hires === true });
}

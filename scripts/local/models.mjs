import path from 'node:path';
import { readSafetensorsBytes } from './safetensors.mjs';
import { bytesToMiB, estimateGpuMiB } from './estimate.mjs';

const safeName = (name) => {
    const value = String(name ?? '');
    if (!value || value.length > 200 || path.isAbsolute(value)) throw new Error('Invalid model file name.');
    if (value.split(/[\\/]/).some((part) => part === '..' || part === '.')) throw new Error('Invalid model file name.');
    return value;
};

export async function weightsMiB(modelDirs, files) {
    let bytes = 0;
    for (const file of files ?? []) {
        const dirs = modelDirs?.[file?.kind];
        if (!Array.isArray(dirs) || !dirs.length) throw new Error(`No configured directory for model kind ${file?.kind}.`);
        const name = safeName(file.name);
        let found = false;
        for (const dir of dirs) {
            const base = path.resolve(dir);
            const full = path.resolve(base, name);
            if (full !== base && !full.startsWith(`${base}${path.sep}`)) continue;
            try { bytes += (await readSafetensorsBytes(full)).bytes; found = true; break; }
            catch (error) { if (error.code === 'ENOENT') continue; throw error; }
        }
        if (!found) throw new Error(`Model ${name} is not under a configured ${file.kind} directory.`);
    }
    if (bytes <= 0) throw new Error('No model weights were resolved for this render.');
    return bytesToMiB(bytes);
}

export async function estimateNeedMiB({ modelDirs, files, width, height, hires }) {
    return estimateGpuMiB({ weightsMiB: await weightsMiB(modelDirs, files), width, height, hires: hires === true });
}

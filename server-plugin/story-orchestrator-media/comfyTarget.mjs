import { ComfyJobs } from './jobs.mjs';

export const COMFY_DEFAULT_URL = 'http://127.0.0.1:8188';

const httpUrl = (value) => {
    if (typeof value !== 'string' || !value.trim()) return null;
    try { return /^https?:$/.test(new URL(value).protocol) ? value.trim() : null; } catch { return null; }
};

export function chooseComfyUrl({ configured, stSettings }) {
    if (configured !== undefined) {
        const url = httpUrl(configured);
        if (!url) throw new Error('ComfyUI URL must use HTTP or HTTPS.');
        return { url, from: 'config' };
    }
    const fromSt = httpUrl(stSettings?.extension_settings?.sd?.comfy_url);
    return fromSt ? { url: fromSt, from: 'sillytavern' } : { url: COMFY_DEFAULT_URL, from: 'default' };
}

export function createComfyTarget({ configured, readSettings, makeJobs = (url) => new ComfyJobs({ url }) }) {
    if (configured !== undefined) chooseComfyUrl({ configured });
    const pool = new Map();
    return async (req) => {
        const stSettings = configured === undefined ? await readSettings(req).catch(() => null) : null;
        const { url, from } = chooseComfyUrl({ configured, stSettings });
        if (!pool.has(url)) pool.set(url, makeJobs(url));
        return { url, from, jobs: pool.get(url) };
    };
}

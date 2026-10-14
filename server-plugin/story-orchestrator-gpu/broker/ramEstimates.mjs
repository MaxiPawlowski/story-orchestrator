export const MEASURED_RAM = Object.freeze([
    Object.freeze({
        id: 'qwen-image-2.1-int8-sprites',
        models: Object.freeze(['diffusionModels:qwen_image_2.1_int8_convrot.safetensors', 'textEncoders:qwen3vl_8b_int8_convrot.safetensors', 'vaes:qwen_image_2.1_vae_bf16.safetensors']),
        ramMiB: 8139,
        maxPixels: 1024 * 1024,
        streaming: true,
        method: 'max free-RAM drop from idle to the low of any lease (6,782 MiB, 8 leases, 3090 2026-10-14 R14 re-run) x 1.2',
    }),
]);

const ROW_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const MODEL_KEY = /^[A-Za-z_]+:[^:]{1,200}$/;

export function validateRamEstimates(rows) {
    if (!Array.isArray(rows) || rows.length > 32) return 'ramEstimates must be a short list.';
    for (const row of rows) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) return 'Each ramEstimates row is an object.';
        if (typeof row.id !== 'string' || !ROW_ID.test(row.id)) return 'Each ramEstimates row needs a short id.';
        if (!Array.isArray(row.models) || !row.models.length || row.models.length > 16 || row.models.some((model) => typeof model !== 'string' || !MODEL_KEY.test(model))) return `ramEstimates ${row.id}: models lists "kind:file name" strings.`;
        if (!Number.isFinite(row.ramMiB) || row.ramMiB <= 0) return `ramEstimates ${row.id}: ramMiB must be a positive number.`;
        if (row.maxPixels !== undefined && (!Number.isInteger(row.maxPixels) || row.maxPixels <= 0)) return `ramEstimates ${row.id}: maxPixels must be a positive whole number.`;
        if (row.streaming !== undefined && typeof row.streaming !== 'boolean') return `ramEstimates ${row.id}: streaming must be true or false.`;
    }
    return null;
}

const modelSet = (models) => models.map((row) => `${row.kind}:${row.name}`).sort().join('|');

export function measuredRamMiB({ models, width, height, hires = false, streaming = false, rows = [] }) {
    if (!Array.isArray(models) || !models.length) return null;
    const wanted = modelSet(models);
    const pixels = Number(width) * Number(height);
    for (const [source, list] of [['config', rows], ['measured', MEASURED_RAM]]) {
        for (const row of list ?? []) {
            if ([...row.models].sort().join('|') !== wanted) continue;
            if (row.streaming !== undefined && row.streaming !== (streaming === true)) continue;
            if (row.maxPixels !== undefined && (hires || !Number.isFinite(pixels) || pixels <= 0 || pixels > row.maxPixels)) continue;
            return { ramMiB: Math.ceil(row.ramMiB), source: `${source}:${row.id}` };
        }
    }
    return null;
}

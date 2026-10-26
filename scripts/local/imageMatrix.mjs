import { createHash } from 'node:crypto';

export const ARMS = {
    sdpa: { note: 'baseline: controller ComfyUI flags (PyTorch SDPA attention)', changesPixels: false },
    ck: { note: 'Comfy Kitchen INT8 attention (the SageAttention kernel shipped in comfy_kitchen; no download)', add: ['--use-ck-attention'], changesPixels: true },
    fp16acc: { note: '--fast fp16_accumulation (FP16 GEMMs accumulate in FP16; FP16 models only)', fast: ['fp16_accumulation'], only: ['fp16'], changesPixels: true },
    autotune: { note: '--fast autotune (cudnn benchmark algorithm search)', fast: ['autotune'], changesPixels: true },
    highvram: { note: '--highvram: weights stay on the GPU, DynamicVRAM off', add: ['--highvram'], changesPixels: false },
    nofastdisk: { note: 'pinned-RAM offload instead of disk-backed dynamic loading', drop: ['--fast-disk'], add: ['--disable-fast-disk'], changesPixels: false },
    cachedefault: { note: 'ComfyUI default RAM-pressure cache thresholds instead of --cache-ram 8', drop: ['--cache-ram'], changesPixels: false },
};

export const WORKFLOWS = {
    'sdxl-scene': { precision: 'fp16', kind: 'sdxl', checkpoint: 'waiIllustriousSDXL_v170.safetensors', aspect: 'wide',
        positive: 'an empty old stone hall, fireplace, warm light, detailed architecture, no people', estSec: 8.5 },
    'sdxl-portrait': { precision: 'fp16', kind: 'sdxl', checkpoint: 'JANKUTrainedChenkinNoobai_v777.safetensors', aspect: 'portrait',
        positive: '1girl, solo, upper body, looking at viewer, short brown hair, green eyes, travelling cloak, simple background, white background', estSec: 9.5 },
    'qwen-edit': { precision: 'int8+bf16', kind: 'qwen', diffusion: 'qwen_image_2.1_int8_convrot.safetensors', encoder: 'qwen3vl_8b_int8_convrot.safetensors',
        vae: 'qwen_image_2.1_vae_bf16.safetensors', steps: 25, resolution: 1024, estSec: 35 },
    mixed: { precision: 'mixed', kind: 'mixed', sequence: ['sdxl-scene', 'qwen-edit', 'sdxl-scene', 'qwen-edit', 'sdxl-scene', 'qwen-edit', 'sdxl-scene'], estSec: 0 },
};

export const PLANS = {
    quick: ['sdxl-scene:sdpa', 'sdxl-scene:ck', 'sdxl-scene:fp16acc', 'sdxl-portrait:sdpa', 'qwen-edit:sdpa', 'qwen-edit:ck'],
    full: ['sdxl-scene:sdpa', 'sdxl-scene:ck', 'sdxl-scene:fp16acc', 'sdxl-scene:ck+fp16acc', 'sdxl-scene:autotune', 'sdxl-scene:highvram', 'sdxl-scene:nofastdisk',
        'sdxl-portrait:sdpa', 'sdxl-portrait:ck', 'sdxl-portrait:fp16acc',
        'qwen-edit:sdpa', 'qwen-edit:ck', 'qwen-edit:highvram',
        'mixed:sdpa', 'mixed:highvram', 'mixed:cachedefault'],
};

export const armParts = (arm) => {
    const parts = arm.split('+').filter(Boolean);
    for (const part of parts) if (!ARMS[part]) throw new Error(`Unknown image arm "${part}". Arms: ${Object.keys(ARMS).join(', ')}`);
    return parts;
};

const dropFlag = (args, flag) => {
    const out = [];
    for (let i = 0; i < args.length; i += 1) {
        if (args[i] !== flag) { out.push(args[i]); continue; }
        while (i + 1 < args.length && !args[i + 1].startsWith('--')) i += 1;
    }
    return out;
};

export const comfyArgsFor = (base, arm) => {
    let args = [...base];
    const fast = [];
    for (const part of armParts(arm)) {
        const spec = ARMS[part];
        for (const flag of spec.drop ?? []) args = dropFlag(args, flag);
        args.push(...(spec.add ?? []));
        fast.push(...(spec.fast ?? []));
    }
    if (fast.length) { args = dropFlag(args, '--fast'); args.push('--fast', ...new Set(fast)); }
    return args;
};

export const applicable = (workflow, arm) => {
    const wf = WORKFLOWS[workflow];
    if (!wf) throw new Error(`Unknown image workflow "${workflow}". Workflows: ${Object.keys(WORKFLOWS).join(', ')}`);
    for (const part of armParts(arm)) {
        const only = ARMS[part].only;
        if (only && !only.includes(wf.precision)) return { ok: false, reason: `${part} applies to ${only.join('/')} models; ${workflow} computes in ${wf.precision}` };
    }
    return { ok: true };
};

export const changesPixels = (arm) => armParts(arm).some((part) => ARMS[part].changesPixels);

export const planCells = (spec) => {
    const list = PLANS[spec] ?? spec.split(',').map((cell) => cell.trim()).filter(Boolean);
    return list.map((cell) => {
        const [workflow, arm = 'sdpa'] = cell.split(':');
        const fit = applicable(workflow, arm);
        return { workflow, arm, id: `${workflow}__${arm.replace(/\+/g, '_')}`, skip: fit.ok ? null : fit.reason };
    });
};

export const COMFY_START_SEC = 25;
export const cellSeconds = (cell, warmup, runs) => {
    if (cell.skip) return 0;
    const wf = WORKFLOWS[cell.workflow];
    const load = 20;
    if (wf.kind === 'mixed') return COMFY_START_SEC + wf.sequence.reduce((sum, name) => sum + WORKFLOWS[name].estSec + load, 0);
    return COMFY_START_SEC + load + wf.estSec * (warmup + runs);
};
export const estimateMinutes = (cells, warmup, runs) => Math.ceil(cells.reduce((sum, cell) => sum + cellSeconds(cell, warmup, runs), 0) / 60);

export const DIFF_IDENTICAL = 'identical';
export const diffVerdict = (stats) => {
    if (!stats || !Number.isFinite(stats.maxAbs)) return 'unreadable';
    if (stats.maxAbs === 0) return DIFF_IDENTICAL;
    if (stats.psnr >= 40) return 'near';
    return 'changed';
};

export const ratingOrder = (salt, key) => createHash('sha256').update(`${salt}:${key}`).digest()[0] % 2 === 0;

export const ratingPack = (pairs, salt) => pairs.map((pair, index) => {
    const swap = ratingOrder(salt, `${pair.cell}:${pair.run}`);
    return { item: `p${String(index + 1).padStart(3, '0')}`, a: swap ? pair.candidate : pair.control, b: swap ? pair.control : pair.candidate,
        key: { cell: pair.cell, run: pair.run, candidateIs: swap ? 'a' : 'b' } };
});

export const median = (values) => { const sorted = values.filter(Number.isFinite).sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null; };

export const switchCost = (runs) => {
    const byWorkflow = {};
    for (const run of runs) (byWorkflow[run.workflow] ??= []).push(run);
    return Object.fromEntries(Object.entries(byWorkflow).map(([name, list]) => {
        const switched = list.filter((run) => run.switched).map((run) => run.wallMs);
        const steady = median(list.filter((run) => !run.switched && !run.cold).map((run) => run.execMs));
        return [name, { coldWallMs: list.find((run) => run.cold)?.wallMs ?? null, switchedWallMedianMs: median(switched), execMedianMs: median(list.map((run) => run.execMs)), steadyExecMs: steady }];
    }));
};

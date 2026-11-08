import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const LINUX_DEFAULTS = Object.freeze({ ctx: 131072, maxContext: 131072, slots: 1, cacheMiB: 32768, gatewayPort: 18888, backendPort: 18889,
    gpuReserveMiB: 1024, ramReserveMiB: 4096, estimatedGpuMiB: 27000, estimatedRamMiB: 3000, threads: 8, nMax: 2 });

const int = (env, name, fallback) => {
    if (env[name] === undefined || env[name] === '') return fallback;
    const value = Number(env[name]);
    if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive whole number (got ${env[name]}).`);
    return value;
};

const need = (env, name) => {
    if (!env[name]) throw new Error(`${name} is required.`);
    return env[name];
};

export function linuxControllerConfig(env) {
    const ctx = int(env, 'CTX', LINUX_DEFAULTS.ctx);
    const slots = int(env, 'SLOTS', LINUX_DEFAULTS.slots);
    if (slots > 4) throw new Error('SLOTS must be 1 to 4.');
    const maxContext = int(env, 'MAX_CONTEXT', Math.min(ctx, LINUX_DEFAULTS.maxContext));
    if (maxContext > ctx) throw new Error(`MAX_CONTEXT ${maxContext} is larger than CTX ${ctx}.`);
    const threads = String(int(env, 'THREADS', LINUX_DEFAULTS.threads));
    const gatewayPort = int(env, 'GATEWAY_PORT', LINUX_DEFAULTS.gatewayPort);
    const backendPort = int(env, 'BACKEND_PORT', LINUX_DEFAULTS.backendPort);
    if (gatewayPort === backendPort) throw new Error('GATEWAY_PORT and BACKEND_PORT must differ.');
    const ngl = env.NGL || 'all';
    const draft = env.MTP_MODEL ?? '';
    return {
        binary: need(env, 'BIN'),
        model: need(env, 'MODEL'),
        modelAlias: env.ALIAS || 'TheDrummer/Artemis-31B-v1.1-GGUF',
        backendPort,
        gatewayPort,
        stateDir: need(env, 'STATE_DIR'),
        images: false,
        reserves: { gpuMiB: int(env, 'GPU_RESERVE_MIB', LINUX_DEFAULTS.gpuReserveMiB), ramMiB: int(env, 'RAM_RESERVE_MIB', LINUX_DEFAULTS.ramReserveMiB) },
        idleRestoreMs: 0,
        keepTextResident: true,
        admissionWindowMs: 30000,
        admissionPollMs: 1000,
        maxQueue: 16,
        queueTimeoutMs: 600000,
        experiments: true,
        mode: 'custom',
        profiles: {
            play: {
                args: ['--ctx-size', String(ctx), '--n-gpu-layers', ngl, '--fit', 'off', '--threads', threads, '--threads-batch', threads, '--load-mode', 'none'],
                estimatedGpuMiB: int(env, 'EST_GPU_MIB', LINUX_DEFAULTS.estimatedGpuMiB),
                estimatedRamMiB: int(env, 'EST_RAM_MIB', LINUX_DEFAULTS.estimatedRamMiB),
            },
        },
        defaultProfile: 'play',
        maxContext,
        fitMarginMiB: 0,
        ...(slots > 1 ? { slots: { count: slots, chat: 0, side: 1 } } : {}),
        ...(draft ? { speculative: { model: draft, type: 'draft-mtp', nMax: int(env, 'NMAX', LINUX_DEFAULTS.nMax), estimatedGpuMiB: 900 } } : {}),
        memberCache: { enabled: true, store: 'ram', budgetMiB: int(env, 'CACHE_MIB', LINUX_DEFAULTS.cacheMiB), serverKeys: env.SERVER_KEYS !== '0', erase: env.SERVER_KEYS === '0', park: false, keepAcrossImages: false },
        chatFirst: true,
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const out = process.argv[2];
    if (!out) throw new Error('Usage: BIN=... MODEL=... STATE_DIR=... node scripts/remote/controllerConfig.mjs <config.json>');
    const config = linuxControllerConfig(process.env);
    await fs.mkdir(path.dirname(path.resolve(out)), { recursive: true });
    await fs.writeFile(out, `${JSON.stringify(config, null, 2)}\n`);
    console.log(`wrote ${out}: ctx ${config.profiles.play.args[1]}, maxContext ${config.maxContext}, slots ${config.slots?.count ?? 1}, member cache ${config.memberCache.budgetMiB} MiB, gateway 127.0.0.1:${config.gatewayPort}`);
}

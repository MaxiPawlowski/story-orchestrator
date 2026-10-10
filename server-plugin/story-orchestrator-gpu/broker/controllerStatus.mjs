export const CONTROLLER_DEFAULTS = Object.freeze({ maxContext: 98304, comfyUrl: 'http://127.0.0.1:8188' });

export function defaultProfileContext(config) {
    const args = config.profiles?.[config.defaultProfile]?.args ?? [];
    const at = args.indexOf('--ctx-size');
    const value = at >= 0 ? Number(args[at + 1]) : NaN;
    return Number.isInteger(value) && value > 0 ? value : null;
}

export function withControllerDefaults(config) {
    return { ...config, maxContext: config.maxContext ?? defaultProfileContext(config) ?? CONTROLLER_DEFAULTS.maxContext, comfyUrl: config.comfyUrl ?? CONTROLLER_DEFAULTS.comfyUrl };
}

export function comfyPort(config) {
    const url = new URL(config.comfyUrl);
    return url.port || (url.protocol === 'https:' ? '443' : '80');
}

export function controllerStatus({ config, scheduler, imageCache, telemetry, controllerBuild, pid, configFile }) {
    return { ...scheduler, controllerBuild, imageCache: imageCache.last, imageCacheFailure: imageCache.lastFailure,
        imageCacheHostTrim: imageCache.lastHostTrim ?? null, imageCacheMode: config.imageCacheMode ?? 'warm', telemetry,
        adapter: 'managed', guarding: true, reserves: config.reserves, pid, configFile, maxContext: config.maxContext };
}

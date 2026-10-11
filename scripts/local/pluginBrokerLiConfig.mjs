const REFUSED = /^--(?:host|port|listen|api-key|ssl-|path)/;

export function superviseConfigFromLocal(local, { stateDir, listenPort, textPort, profile = 'fast' }) {
    if (!local?.binary || !local?.model || !local?.profiles?.[profile]) throw new Error('The local config needs binary, model and the chosen profile.');
    const args = [];
    const source = local.profiles[profile].args;
    for (let index = 0; index < source.length; index += 1) {
        if (REFUSED.test(source[index])) { index += 1; continue; }
        args.push(source[index]);
    }
    return {
        adapter: 'supervise',
        listenPort,
        stateDir,
        text: { binary: local.binary, model: local.model, port: textPort, alias: local.modelAlias, maxContext: local.maxContext ?? 32768, defaultProfile: profile,
            profiles: { [profile]: { args, estimatedGpuMiB: local.profiles[profile].estimatedGpuMiB, estimatedRamMiB: local.profiles[profile].estimatedRamMiB } } },
        comfy: { url: local.comfyUrl, supervise: true, python: local.comfyPython, root: local.comfyRoot, extraArgs: ['--cache-ram', '8', '--reserve-vram', '2', ...(local.comfyExtraArgs ?? [])] },
        reserves: local.reserves,
        modelDirs: local.modelDirs,
        modelCacheRoot: local.modelCacheRoot,
        telemetryPython: local.telemetryPython,
    };
}

export function median(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function fakeRouter() {
    const routes = new Map();
    return {
        get: (route, handler) => routes.set(`GET ${route}`, handler),
        post: (route, handler) => routes.set(`POST ${route}`, handler),
        find: (method, route) => {
            const exact = routes.get(`${method} ${route}`);
            if (exact) return { handler: exact, params: {} };
            const control = route.match(/^\/control\/([a-z-]+)$/);
            const wildcard = control && routes.get(`${method} /control/:action`);
            return wildcard ? { handler: wildcard, params: { action: control[1] } } : null;
        },
    };
}

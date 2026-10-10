import path from 'node:path';

export const DEFAULT_JUDGE_ROOT = 'C:/dev/models/so-judge';
export const DEFAULT_JUDGE_PORT = 8095;
export const DEFAULT_JUDGE_MODEL = 'decider-4b';
export const ENV_ROOT = 'SO_JUDGE_MODELS_DIR';
export const ENV_PORT = 'SO_JUDGE_LOCAL_PORT';
export const ENV_THREADS = 'SO_JUDGE_LOCAL_THREADS';
export const ENV_GPU_LAYERS = 'SO_JUDGE_LOCAL_GPU_LAYERS';
export const ENV_EXTRA_INDEX = 'SO_JUDGE_PIP_EXTRA_INDEX';
export const PYTHON_VERSION = '3.12';
export const HEADROOM_GB = 1;

export const JUDGE_MODELS = Object.freeze({
    'decider-4b': Object.freeze({
        key: 'decider-4b',
        id: 'decider-4b-v2.1-Q4_K_M',
        repo: 'Mapika/decider-4b-GGUF',
        file: 'decider-4b-v2.1-Q4_K_M.gguf',
        revision: null,
        licence: 'Apache-2.0',
        weightsGB: 2.7,
        runtimeGB: 2.5,
        packages: ['decider-ai[gguf]'],
        backend: 'decider',
        verified: 'README read 2026-10-10; not run on this box yet',
    }),
    'plumb-4b': Object.freeze({
        key: 'plumb-4b',
        id: 'plumb-4b-55de0378',
        repo: 'crh225/plumb-4b',
        file: null,
        revision: '55de037801a8a9b9de3db5c0e16cef86210c2186',
        licence: 'Apache-2.0',
        weightsGB: 8.4,
        runtimeGB: 3,
        packages: ['jevk5[fast] @ git+https://github.com/allebee/jevk5@v0.2.0'],
        backend: 'proxy',
        verified: 'README read 2026-10-10; served by jevk5-serve behind the proxy backend; not run on this box yet',
    }),
});

const integer = (raw, fallback, min = 0) => (typeof raw === 'string' && /^\d+$/.test(raw.trim()) && Number(raw) >= min ? Number(raw) : fallback);

export function judgeConfig(env = process.env, { model = DEFAULT_JUDGE_MODEL, platform = process.platform } = {}) {
    const entry = JUDGE_MODELS[model];
    if (!entry) throw new Error(`unknown judge model "${model}" (known: ${Object.keys(JUDGE_MODELS).join(', ')})`);
    const root = path.posix.normalize((env[ENV_ROOT]?.trim() || DEFAULT_JUDGE_ROOT).replace(/\\/g, '/')).replace(/\/$/, '');
    const port = integer(env[ENV_PORT], DEFAULT_JUDGE_PORT, 1);
    const venv = `${root}/venv`;
    const bin = platform === 'win32' ? `${venv}/Scripts` : `${venv}/bin`;
    const exe = platform === 'win32' ? '.exe' : '';
    const modelDir = `${root}/models/${entry.key}`;
    return {
        model: entry,
        root,
        port,
        upstreamPort: port + 1,
        url: `http://127.0.0.1:${port}`,
        threads: integer(env[ENV_THREADS], 0),
        gpuLayers: integer(env[ENV_GPU_LAYERS], 0),
        extraIndex: env[ENV_EXTRA_INDEX]?.trim() || null,
        venv,
        python: `${bin}/python${exe}`,
        hf: `${bin}/hf${exe}`,
        jevk5Serve: `${bin}/jevk5-serve${exe}`,
        modelDir,
        modelPath: entry.file ? `${modelDir}/${entry.file}` : modelDir,
        cache: { HF_HOME: `${root}/hf`, HF_HUB_CACHE: `${root}/hf/hub`, UV_CACHE_DIR: `${root}/uv-cache`, PIP_CACHE_DIR: `${root}/pip-cache` },
        logDir: `${root}/logs`,
        pidFile: `${root}/server-${entry.key}.json`,
    };
}

export const requiredGB = (config, { venvPresent = false, weightsPresent = false } = {}) =>
    Math.round(((weightsPresent ? 0 : config.model.weightsGB) + (venvPresent ? 0 : config.model.runtimeGB) + HEADROOM_GB) * 10) / 10;

export function setupSteps(config) {
    const entry = config.model;
    const download = entry.file
        ? [config.hf, 'download', entry.repo, entry.file, '--local-dir', config.modelDir]
        : [config.hf, 'download', entry.repo, '--revision', entry.revision, '--local-dir', config.modelDir];
    return [
        { label: `create the Python ${PYTHON_VERSION} environment in ${config.venv}`, command: ['uv', 'venv', '--python', PYTHON_VERSION, config.venv], skipIf: 'venv' },
        { label: `install ${entry.packages.join(', ')} and huggingface_hub`, command: ['uv', 'pip', 'install', '--python', config.python, ...(config.extraIndex ? ['--extra-index-url', config.extraIndex, '--index-strategy', 'unsafe-best-match'] : []), ...entry.packages, 'huggingface_hub[cli]'], skipIf: null },
        { label: `download ${entry.repo}${entry.file ? ` ${entry.file}` : ` at ${entry.revision.slice(0, 8)}`} (~${entry.weightsGB} GB) to ${config.modelDir}`, command: download, skipIf: 'weights' },
    ];
}

export function serverCommands(config, serverScript) {
    const entry = config.model;
    const common = ['--model-id', entry.id, '--port', String(config.port), '--threads', String(config.threads), '--gpu-layers', String(config.gpuLayers)];
    if (entry.backend === 'decider') return [{ name: 'judge', command: [config.python, serverScript, '--backend', 'decider', '--model-path', config.modelPath, ...common] }];
    return [
        { name: 'upstream', command: [config.jevk5Serve, '--model', config.modelDir, '--host', '127.0.0.1', '--port', String(config.upstreamPort)] },
        { name: 'judge', command: [config.python, serverScript, '--backend', 'proxy', '--upstream', `http://127.0.0.1:${config.upstreamPort}`, '--model-path', config.modelPath, ...common] },
    ];
}

export const childEnv = (config, base = process.env) => ({
    ...base,
    ...config.cache,
    PYTHONUNBUFFERED: '1',
    ...(config.gpuLayers === 0 ? { CUDA_VISIBLE_DEVICES: '' } : {}),
});

export const PROBE_REQUEST = Object.freeze({
    state: { scene: 'The guild hall is loud. Arin slams a tankard on the table and laughs.' },
    questions: { loud: { type: 'noul', instructions: 'Is the scene in `scene` described as loud?' } },
});

export function readinessLine(health, probe, latencyMs) {
    if (!health?.ok) return { ok: false, line: 'local judge not ready: the health check failed' };
    const noul = probe?.answers?.loud?.noul;
    if (typeof noul !== 'number') return { ok: false, line: `local judge ${health.model ?? '?'} answered without a decision` };
    return { ok: true, line: `ok ${health.model} · ${latencyMs} ms · p(loud)=${noul.toFixed(2)} · ${health.modelPath ?? 'path unknown'}` };
}

import path from 'node:path';

export const LANDMARK_WEIGHTS = Object.freeze([
    { file: 'yolov3.safetensors', source: 'https://huggingface.co/hysts/anime-face-detector-yolov3/resolve/main/model.safetensors', bytes: 246_354_512,
        sha256: '23bbc708146bcbc1c910f00fe152adbc70d7658d875a0121eaf4ee61d978b2c4' },
    { file: 'hrnetv2.safetensors', source: 'https://huggingface.co/hysts/anime-face-detector-hrnetv2/resolve/main/model.safetensors', bytes: 38_917_560,
        sha256: 'e71271376406a743c01528a0460637fcc06e72aeeea583f85007cc72dc8b7a4a' },
]);
export const LANDMARK_LICENCE = 'MIT (code: github.com/hysts/anime-face-detector; weights: Hugging Face cards hysts/anime-face-detector-{yolov3,hrnetv2})';

export function landmarkConfig(env = process.env) {
    const tools = env.SO_LANDMARKS_TOOLS ?? 'C:/dev/tools/anime-face-detector';
    const port = Number(env.SO_LANDMARKS_PORT ?? 8096);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SO_LANDMARKS_PORT must be a port number.');
    return {
        tools,
        python: env.SO_LANDMARKS_PYTHON ?? path.join(tools, 'venv', 'Scripts', 'python.exe'),
        weights: env.SO_LANDMARKS_WEIGHTS ?? 'C:/dev/models/anime-face-detector',
        port,
        url: `http://127.0.0.1:${port}`,
        logFile: path.join(tools, 'logs', 'landmark-server.log'),
        pidFile: path.join(tools, 'landmark-server.pid.json'),
    };
}

export function landmarkChildEnv(env = process.env) {
    return { ...env, CUDA_VISIBLE_DEVICES: '', HF_HUB_OFFLINE: '1', PYTHONNOUSERSITE: '1' };
}

export function landmarkServerCommand(config, serverScript) {
    return [config.python, '-I', serverScript, '--host', '127.0.0.1', '--port', String(config.port), '--weights', config.weights];
}

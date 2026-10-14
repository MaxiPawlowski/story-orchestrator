import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { LANDMARK_WEIGHTS, landmarkChildEnv, landmarkConfig, landmarkServerCommand } from './landmarkConfig.mjs';

test('harvest 5: the landmark server binds loopback on CPU with Hugging Face offline', () => {
    const config = landmarkConfig({});
    assert.equal(config.url, 'http://127.0.0.1:8096');
    assert.equal(config.weights, 'C:/dev/models/anime-face-detector');
    const command = landmarkServerCommand(config, 'server.py');
    assert.deepEqual(command.slice(command.indexOf('--host'), command.indexOf('--host') + 2), ['--host', '127.0.0.1']);
    assert.ok(command.includes('-I'));
    const env = landmarkChildEnv({ PATH: 'x', CUDA_VISIBLE_DEVICES: '0' });
    assert.deepEqual({ cuda: env.CUDA_VISIBLE_DEVICES, offline: env.HF_HUB_OFFLINE, path: env.PATH }, { cuda: '', offline: '1', path: 'x' });
});

test('harvest 5: paths and port follow the environment, and a bad port is refused', () => {
    const config = landmarkConfig({ SO_LANDMARKS_TOOLS: 'D:/t', SO_LANDMARKS_PORT: '9001', SO_LANDMARKS_WEIGHTS: 'D:/w' });
    assert.equal(config.python, path.join('D:/t', 'venv', 'Scripts', 'python.exe'));
    assert.equal(config.url, 'http://127.0.0.1:9001');
    assert.equal(config.weights, 'D:/w');
    assert.throws(() => landmarkConfig({ SO_LANDMARKS_PORT: 'eighty' }), /port/);
});

test('harvest 5: every weight file has a recorded size and sha256', () => {
    assert.deepEqual(LANDMARK_WEIGHTS.map((weight) => weight.file), ['yolov3.safetensors', 'hrnetv2.safetensors']);
    for (const weight of LANDMARK_WEIGHTS) {
        assert.match(weight.sha256, /^[0-9a-f]{64}$/);
        assert.ok(weight.bytes > 1_000_000);
    }
});

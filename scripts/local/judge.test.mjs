import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { childEnv, DEFAULT_JUDGE_ROOT, JUDGE_MODELS, judgeConfig, missingDistributions, readinessLine, requiredGB, serverCommands, setupSteps } from './judgeModels.mjs';
import { testTempDirSync } from '../lib/testTemp.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

test('v2.8 14: the judge root defaults to the fast disk C:/dev/models/so-judge and moves with SO_JUDGE_MODELS_DIR', () => {
    const defaults = judgeConfig({}, { platform: 'win32' });
    assert.equal(DEFAULT_JUDGE_ROOT, 'C:/dev/models/so-judge');
    assert.equal(defaults.root, 'C:/dev/models/so-judge');
    assert.equal(defaults.url, 'http://127.0.0.1:8095');
    assert.equal(defaults.python, 'C:/dev/models/so-judge/venv/Scripts/python.exe');
    assert.equal(defaults.modelPath, 'C:/dev/models/so-judge/models/decider-4b/decider-4b-v2.1-Q4_K_M.gguf');
    const moved = judgeConfig({ SO_JUDGE_MODELS_DIR: 'D:\\judge\\', SO_JUDGE_LOCAL_PORT: '9001', SO_JUDGE_LOCAL_GPU_LAYERS: '99' }, { platform: 'win32' });
    assert.equal(moved.root, 'D:/judge');
    assert.equal(moved.port, 9001);
    assert.equal(moved.gpuLayers, 99);
    assert.throws(() => judgeConfig({}, { model: 'jev' }), /unknown judge model/);
});

test('v2.8 14: every cache the server or setup touches lives under the judge root', () => {
    const config = judgeConfig({ SO_JUDGE_MODELS_DIR: 'C:/dev/models/so-judge' }, { platform: 'win32' });
    for (const value of Object.values(config.cache)) assert.ok(value.startsWith(config.root), value);
    const env = childEnv(config, { PATH: 'x' });
    assert.equal(env.HF_HOME, 'C:/dev/models/so-judge/hf');
    assert.equal(env.UV_CACHE_DIR, 'C:/dev/models/so-judge/uv-cache');
    assert.equal(env.CUDA_VISIBLE_DEVICES, '', 'CPU by default: no GPU is visible to the server');
    assert.equal(childEnv(judgeConfig({ SO_JUDGE_LOCAL_GPU_LAYERS: '99' }), {}).CUDA_VISIBLE_DEVICES, undefined, 'control: GPU layers make the GPU visible');
});

test('v2.8 14: setup creates the venv, installs, then downloads into the root; nothing runs without --yes (the CLI checks)', () => {
    const config = judgeConfig({}, { platform: 'win32' });
    const steps = setupSteps(config);
    assert.deepEqual(steps.map((step) => step.command[0]), ['uv', 'uv', config.hf]);
    assert.deepEqual(steps[2].command, [config.hf, 'download', 'Mapika/decider-4b-GGUF', 'decider-4b-v2.1-Q4_K_M.gguf', 'tokenizer.json', 'tokenizer_config.json', 'decider_config.json', '--local-dir', 'C:/dev/models/so-judge/models/decider-4b']);
    assert.deepEqual(config.companionPaths, ['tokenizer.json', 'tokenizer_config.json', 'decider_config.json'].map((name) => `C:/dev/models/so-judge/models/decider-4b/${name}`), 'decider loads its HF tokenizer from the GGUF folder: without these the server fails at start (pod 2, 2026-10-10)');
    const plumb = setupSteps(judgeConfig({}, { model: 'plumb-4b', platform: 'win32' }));
    assert.ok(plumb[2].command.includes('--revision') && plumb[2].command.includes(JUDGE_MODELS['plumb-4b'].revision));
    const indexed = setupSteps(judgeConfig({ SO_JUDGE_PIP_EXTRA_INDEX: 'https://abetlen.github.io/llama-cpp-python/whl/cu124' }));
    assert.ok(indexed[1].command.includes('--extra-index-url'));
    const plan = spawnSync(process.execPath, [path.join(here, 'judge.mjs'), 'setup'], { encoding: 'utf8', env: { ...process.env, SO_JUDGE_MODELS_DIR: path.join(here, '.no-such-judge-root') } });
    assert.equal(plan.status, 0);
    assert.match(plan.stdout, /nothing downloaded: run again with --yes/);
});

test('v2.8 14: the space estimate counts what is missing plus 1 GB headroom', () => {
    const config = judgeConfig({});
    assert.equal(requiredGB(config), 6.2);
    assert.equal(requiredGB(config, { venvPresent: true }), 3.7);
    assert.equal(requiredGB(config, { venvPresent: true, weightsPresent: true }), 1);
    assert.equal(requiredGB(judgeConfig({}, { model: 'plumb-4b' })), 12.4);
});

test('v2.8 14: the server listens on 127.0.0.1 with the model id a calibration row binds to; Plumb sits behind the proxy backend', () => {
    const [decider] = serverCommands(judgeConfig({}, { platform: 'win32' }), 'judgeServer.py');
    assert.deepEqual(decider.command.slice(1, 6), ['judgeServer.py', '--backend', 'decider', '--model-path', 'C:/dev/models/so-judge/models/decider-4b/decider-4b-v2.1-Q4_K_M.gguf']);
    assert.ok(decider.command.includes('decider-4b-v2.1-Q4_K_M'));
    const plumb = serverCommands(judgeConfig({}, { model: 'plumb-4b', platform: 'win32' }), 'judgeServer.py');
    assert.deepEqual(plumb.map((part) => part.name), ['upstream', 'judge']);
    assert.ok(plumb[0].command.includes('127.0.0.1'));
    assert.ok(plumb[1].command.includes('http://127.0.0.1:8096'));
});

test('v2.8 14: the readiness line names the model, the latency and the path, and fails without a decision', () => {
    assert.deepEqual(readinessLine({ ok: true, model: 'decider-4b-v2.1-Q4_K_M', modelPath: 'C:/dev/models/x.gguf' }, { answers: { loud: { type: 'noul', noul: 0.91 } } }, 420),
        { ok: true, line: 'ok decider-4b-v2.1-Q4_K_M · 420 ms · p(loud)=0.91 · C:/dev/models/x.gguf' });
    assert.equal(readinessLine({ ok: true, model: 'm' }, { answers: {} }, 1).ok, false);
    assert.equal(readinessLine(null, null, 0).ok, false);
});

const python = ['python', 'python3', 'py'].find((name) => spawnSync(name, ['--version'], { encoding: 'utf8' }).status === 0);

test('v2.8 14: the Python server normalises answers to the System One shape and refuses a non-loopback host', { skip: python ? false : 'no python on PATH' }, () => {
    const selfTest = spawnSync(python, [path.join(here, 'judgeServer.py'), '--self-test'], { encoding: 'utf8' });
    assert.equal(selfTest.status, 0, selfTest.stdout + selfTest.stderr);
    assert.match(selfTest.stdout, /self-test ok/);
    const wide = spawnSync(python, [path.join(here, 'judgeServer.py'), '--host', '0.0.0.0', '--model-id', 'x'], { encoding: 'utf8' });
    assert.equal(wide.status, 2);
    assert.match(wide.stderr, /127\.0\.0\.1 only/);
});

test('v2.8 14: the install step is done once its distributions sit in the venv site-packages', () => {
    const config = judgeConfig({}, { platform: 'win32' });
    assert.equal(config.sitePackages, 'C:/dev/models/so-judge/venv/Lib/site-packages');
    assert.equal(judgeConfig({}, { platform: 'linux' }).sitePackages, 'C:/dev/models/so-judge/venv/lib/python3.12/site-packages');
    assert.equal(setupSteps(config)[1].skipIf, 'packages');
    const listing = (entries) => (dir) => (dir === config.sitePackages ? entries : assert.fail(dir));
    assert.deepEqual(missingDistributions(config, listing(['decider_ai-1.9.0.dist-info', 'llama_cpp_python-0.3.36.dist-info', 'huggingface_hub-2.2.0.dist-info', 'llama_cpp'])), []);
    assert.deepEqual(missingDistributions(config, listing(['decider_ai-1.9.0.dist-info', 'llama_cpp'])), ['llama_cpp_python', 'huggingface_hub']);
    assert.deepEqual(missingDistributions(config, () => { throw new Error('ENOENT'); }), ['decider_ai', 'llama_cpp_python', 'huggingface_hub']);
    assert.deepEqual(missingDistributions(judgeConfig({}, { model: 'plumb-4b' }), () => ['jevk5-0.2.0.dist-info', 'Huggingface_Hub-2.2.0.dist-info']), []);
});

test('v2.8 14: plan reports the install step done when the packages are installed, todo otherwise', () => {
    const root = testTempDirSync('so-judge-plan-');
    try {
        const env = { ...process.env, SO_JUDGE_MODELS_DIR: root };
        const config = judgeConfig(env);
        fs.mkdirSync(path.dirname(config.python), { recursive: true });
        fs.writeFileSync(config.python, '');
        const planLine = () => spawnSync(process.execPath, [path.join(here, 'judge.mjs'), 'plan'], { encoding: 'utf8', env }).stdout.split(/\r?\n/).find((line) => line.includes('install '));
        assert.match(planLine(), /^ {2}todo {2}install/);
        for (const name of ['decider_ai-1.9.0', 'llama_cpp_python-0.3.36', 'huggingface_hub-2.2.0']) fs.mkdirSync(path.join(config.sitePackages, `${name}.dist-info`), { recursive: true });
        assert.match(planLine(), /^ {2}done {2}install/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

import fs from 'node:fs/promises';
import path from 'node:path';

const [baseFile, output, python, arm = 'stock'] = process.argv.slice(2);
if (!baseFile || !output || !python || !['stock', 'gguf', 'nunchaku'].includes(arm)) throw new Error('Usage: candidateConfig.mjs <base config> <new config> <python> stock|gguf|nunchaku');
const config = JSON.parse(await fs.readFile(baseFile, 'utf8'));
const weights = 'D:/models/story-orchestrator-flux-spikes';
const extra = path.join(path.dirname(output), 'flux-spike-paths.yaml');
await fs.writeFile(extra, `so_flux_spikes:\n  custom_nodes: |\n    C:/dev/st-extensions-research\n    C:/dev/story-orchestrator/scripts/local\n  diffusion_models: ${weights}\n  text_encoders: ${weights}/components\n  vae: ${weights}/components\n`);
config.comfyPython = python;
config.telemetryPython = python;
config.comfyExtraArgs = ['--fast-disk', '--disable-all-custom-nodes', '--extra-model-paths-config', extra,
    ...(arm === 'stock' ? [] : ['--whitelist-custom-nodes', ...(arm === 'gguf' ? ['ComfyUI-GGUF'] : ['ComfyUI-nunchaku', 'comfyMemoryGuard'])])];
config.nativePoolTrim = arm === 'nunchaku';
if (arm === 'nunchaku') config.imageWarmReleaseMs = 500;
config.modelCacheRoot = path.join(weights, 'cache');
config.stateDir = path.join(config.stateDir, `flux-${arm}`);
config.defaultImageRamMiB = 8192;
config.modelDirs.diffusionModels.unshift(weights);
config.modelDirs.textEncoders.unshift(path.join(weights, 'components'));
config.modelDirs.vaes.unshift(path.join(weights, 'components'));
config.fluxSpike = { arm, components: { clip: 'clip_l.safetensors', t5: 't5xxl.safetensors', vae: 'ae.safetensors' },
    model: arm === 'gguf' ? 'flux1-dev-Q5_K_S.gguf' : 'svdq-int4_r32-flux.1-dev.safetensors' };
await fs.writeFile(output, JSON.stringify(config, null, 2), { flag: 'wx' });
console.log(`Candidate ${arm}: ${output}; old interpreter/config preserved.`);

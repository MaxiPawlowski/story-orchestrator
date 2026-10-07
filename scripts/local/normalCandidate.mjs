import fs from 'node:fs/promises';
import path from 'node:path';

const [base, output] = process.argv.slice(2);
if (!base || !output) throw new Error('Usage: normalCandidate.mjs <base config> <new candidate>');
const config = JSON.parse(await fs.readFile(base, 'utf8'));
config.comfyPython = 'C:/dev/tools/story-orchestrator-local/comfy-cu130/Scripts/python.exe';
config.telemetryPython = config.comfyPython;
config.comfyExtraArgs = ['--fast-disk'];
config.modelCacheRoot = 'D:/models/story-orchestrator-flux-spikes/cache';
config.stateDir = path.join(config.stateDir, 'normal-cu130');
await fs.writeFile(output, JSON.stringify(config, null, 2), { flag: 'wx' });
console.log(`Normal custom-node candidate: ${output}`);

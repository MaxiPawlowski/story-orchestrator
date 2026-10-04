import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream, createReadStream } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const configFile = process.argv[2];
if (!configFile) throw new Error('Usage: node scripts/local/install-backend.mjs <config.json>');
const root = path.dirname(configFile);
const target = path.join(root, 'llama-b11388-cuda12.4');
await fs.mkdir(target, { recursive: true });
const assets = [
    ['llama-b11388-bin-win-cuda-12.4-x64.zip', '8b86db4c087dca068063a03815955f1f8c9c19ce3ac20419aaabcec6451a4522'],
    ['cudart-llama-bin-win-cuda-12.4-x64.zip', '8c79a9b226de4b3cacfd1f83d24f962d0773be79f1e7b75c6af4ded7e32ae1d6'],
];
const exec = promisify(execFile);
for (const [name, expected] of assets) {
    const archive = path.join(root, name);
    try { await fs.access(archive); }
    catch {
        const response = await fetch(`https://github.com/ggml-org/llama.cpp/releases/download/b11388/${name}`, { signal: AbortSignal.timeout(300000) });
        if (!response.ok) throw new Error(`Download ${name} answered ${response.status}`);
        await pipeline(Readable.fromWeb(response.body), createWriteStream(archive, { flags: 'wx' }));
    }
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(archive)) hash.update(chunk);
    if (hash.digest('hex') !== expected) throw new Error(`Archive digest mismatch: ${name}`);
    await exec('powershell', ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath '${archive.replaceAll("'", "''")}' -DestinationPath '${target.replaceAll("'", "''")}' -Force`], { windowsHide: true, timeout: 180000 });
    console.log(`Verified and extracted ${name}`);
}
async function find(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.name === 'llama-server.exe') return file;
        if (entry.isDirectory()) { const candidate = await find(file); if (candidate) return candidate; }
    }
}
const binary = await find(target);
if (!binary) throw new Error('Archive has no llama-server.exe');
const config = JSON.parse(await fs.readFile(configFile, 'utf8'));
try { await fs.copyFile(configFile, path.join(root, 'config.before-cuda.json'), 1); } catch (error) { if (error.code !== 'EEXIST') throw error; }
config.binary = binary;
await fs.writeFile(configFile, JSON.stringify(config, null, 2));
console.log((await exec(binary, ['--version'], { windowsHide: true, timeout: 20000 })).stdout);
const devices = await exec(binary, ['--list-devices'], { windowsHide: true, timeout: 20000 });
console.log(devices.stdout, devices.stderr);
if (!devices.stdout.includes('3090') && !devices.stderr.includes('3090')) throw new Error('CUDA device is not visible');

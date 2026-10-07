import fs from 'node:fs/promises';
import path from 'node:path';
import { renderSignature } from './policy.mjs';

const [configFile, referenceRecord, output] = process.argv.slice(2);
if (!configFile || !referenceRecord || !output) throw new Error('Usage: customNodeCheck.mjs <config> <owned image record> <new report>');
const config = JSON.parse(await fs.readFile(configFile, 'utf8'));
const source = JSON.parse(await fs.readFile(referenceRecord, 'utf8'));
if (!source.render?.image || !source.render.image.includes('local-residency')) throw new Error('Choose an owned residency benchmark image.');
const input = new FormData();
const name = `SO-FLUX-compat-${Date.now()}.png`;
input.set('image', new Blob([await fs.readFile(source.render.image)], { type: 'image/png' }), name);
input.set('overwrite', 'false');
const upload = await fetch(`${config.comfyUrl}/upload/image`, { method: 'POST', body: input, signal: AbortSignal.timeout(60000) });
if (!upload.ok) throw new Error(`Reference upload refused ${upload.status}`);
const reference = (await upload.json()).name;
const result = { at: new Date().toISOString(), reference, checks: [] };
const gateway = `http://127.0.0.1:${config.gatewayPort}`;
const post = async (base, route, body) => {
    const response = await fetch(`${base}${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(300000) });
    const data = await response.json(); if (!response.ok) throw new Error(JSON.stringify(data)); return data;
};
let lease;
try {
    for (const file of ['birefnet.py', 'BiRefNet_config.py', 'BiRefNet-HR.safetensors', 'config.json']) await fs.stat(path.join('C:/dev/models/RMBG/BiRefNet', file));
    const graph = { '1': { class_type: 'LoadImage', inputs: { image: reference } },
        '2': { class_type: 'BiRefNetRMBG', inputs: { image: ['1', 0], model: 'BiRefNet-HR', background: 'Alpha', sensitivity: 1,
            mask_blur: 0, mask_offset: 0, invert_output: false, refine_foreground: false, background_color: '#222222' } },
        '3': { class_type: 'PreviewImage', inputs: { images: ['2', 0] } } };
    lease = await post(gateway, '/lease', { workflowKey: renderSignature(graph), needGpuMiB: 4096, needRamMiB: 4096 });
    const queued = await post(config.comfyUrl, '/prompt', { prompt: graph, client_id: 'so-flux-compat' });
    const deadline = Date.now() + 300000;
    while (Date.now() < deadline) {
        const history = await (await fetch(`${config.comfyUrl}/history/${queued.prompt_id}`, { signal: AbortSignal.timeout(60000) })).json();
        const record = history[queued.prompt_id];
        if (record?.status?.status_str === 'error') throw new Error(JSON.stringify(record.status));
        if (record?.status?.completed) {
            if (record.status.status_str !== 'success') throw new Error(JSON.stringify(record.status));
            const image = Object.values(record.outputs).flatMap((row) => row.images ?? [])[0];
            if (!image) throw new Error('Cutout produced no image.');
            const bytes = await (await fetch(`${config.comfyUrl}/view?${new URLSearchParams(image)}`)).arrayBuffer();
            const file = path.join(config.stateDir, name.replace('.png', '-cutout.png'));
            await fs.writeFile(file, Buffer.from(bytes));
            result.checks.push({ id: 'existing-birefnet-hr-cutout', promptId: queued.prompt_id, image: file, bytes: bytes.byteLength });
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (!result.checks.length) throw new Error('Cutout timed out.');
    await post(gateway, '/release', { lease: lease.lease }); lease = null;
    result.measurement = await (await fetch(`${gateway}/measurement`)).json();
    result.ok = true;
} catch (error) { result.ok = false; result.error = error.message; }
finally {
    if (lease) await post(gateway, '/release', { lease: lease.lease }).catch((error) => { result.releaseError = error.message; });
    await fs.writeFile(output, JSON.stringify(result, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ report: output, reference, ok: result.ok, error: result.error }));
}
if (!result.ok) process.exitCode = 1;

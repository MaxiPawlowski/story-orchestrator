import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { ComfyJobs } from './jobs.mjs';
import { fingerprint, pngBytes, saveSprite, readSet, deleteSprite, listSets } from './files.mjs';

export const info = { id: 'story-orchestrator-media', name: 'Story Orchestrator media', description: 'Owned ComfyUI jobs and generated sprite files.' };
const home = path.dirname(fileURLToPath(import.meta.url));

export async function init(router) {
    const config = await fs.readFile(path.join(home, 'config.json'), 'utf8').then(JSON.parse).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
        return {};
    });
    const url = config.comfyUrl ?? 'http://127.0.0.1:8188';
    if (!/^https?:$/.test(new URL(url).protocol)) throw new Error('ComfyUI URL must use HTTP or HTTPS.');
    const roots = config.modelRoots ?? {};
    const jobs = new ComfyJobs({ url });
    const references = new Map();
    const allowedNodes = new Set(['LoadImage', 'UNETLoader', 'QwenImage21Cache', 'CLIPLoader', 'VAELoader', 'TextEncodeQwenImage21',
        'KSampler', 'VAEDecode', 'SaveImage', 'PreviewImage', 'CheckpointLoaderSimple', 'LoraLoader', 'CLIPTextEncode',
        'FluxGuidance', 'ConditioningZeroOut', 'EmptySD3LatentImage', 'EmptyLatentImage', 'UpscaleModelLoader', 'ImageUpscaleWithModel', 'ImageScaleBy', 'VAEEncode']);
    const owner = (req) => {
        const root = req.user?.directories?.characters;
        if (!root) throw new Error('Open SillyTavern with a user session first.');
        return root;
    };
    const route = (method, name, run) => router[method](name, async (req, res) => {
        try { const user = owner(req); res.json(await run(req, user)); }
        catch (error) { res.status(400).json({ error: error.message }); }
    });
    route('get', '/status', async () => ({ ready: true, comfyUrl: url, fingerprints: Object.keys(roots) }));
    route('get', '/discover', async () => {
        const nodes = await (await jobs.request('/object_info')).json();
        if (nodes.LoadImage?.input?.required?.image) nodes.LoadImage.input.required.image[0] = [];
        const embeddings = await (await jobs.request('/embeddings')).json();
        const choices = (node, field) => nodes[node]?.input?.required?.[field]?.[0] ?? [];
        return {
            nodes, embeddings, checkpoints: choices('CheckpointLoaderSimple', 'ckpt_name'), diffusionModels: choices('UNETLoader', 'unet_name'),
            textEncoders: choices('CLIPLoader', 'clip_name'), vaes: choices('VAELoader', 'vae_name'),
            loras: choices('LoraLoader', 'lora_name'), upscalers: choices('UpscaleModelLoader', 'model_name'),
        };
    });
    route('post', '/fingerprint', (req) => fingerprint(roots[req.body.kind] ?? [], req.body.name));
    route('post', '/reference', async (req, user) => {
        const bytes = pngBytes(req.body.data);
        const form = new FormData();
        form.set('image', new Blob([bytes], { type: 'image/png' }), `so_${randomUUID()}.png`);
        form.set('subfolder', 'story-orchestrator');
        const response = await fetch(`${url.replace(/\/$/, '')}/upload/image`, { method: 'POST', body: form, signal: AbortSignal.timeout(30_000) });
        if (!response.ok) throw new Error(`ComfyUI reference upload answered ${response.status}.`);
        const data = await response.json();
        const name = `${data.subfolder ? `${data.subfolder}/` : ''}${data.name}`;
        references.set(name, user);
        const owned = [...references].filter(([, owner]) => owner === user);
        for (const [old] of owned.slice(0, Math.max(0, owned.length - 32))) references.delete(old);
        while (references.size > 512) references.delete(references.keys().next().value);
        return { name };
    });
    route('post', '/jobs', (req, user) => {
        const graph = req.body.graph;
        if (!graph || typeof graph !== 'object' || Array.isArray(graph) || Object.keys(graph).length > 128) throw new Error('Invalid render recipe.');
        for (const node of Object.values(graph)) {
            if (!node || !allowedNodes.has(node.class_type) || !node.inputs || typeof node.inputs !== 'object') throw new Error('The recipe contains an unsupported node.');
            if (node.class_type === 'LoadImage' && references.get(node.inputs.image) !== user) throw new Error('This reference image does not belong to this user. Upload it through the builder first.');
            if (node.class_type === 'SaveImage' && !/^so[-_][a-z0-9_-]{1,80}$/.test(node.inputs.filename_prefix)) throw new Error('Generated images need an owned output prefix.');
        }
        return jobs.submit(user, req.body.id, graph);
    });
    route('get', '/jobs/:id', (req, user) => jobs.poll(user, req.params.id));
    route('post', '/jobs/:id/cancel', (req, user) => jobs.cancel(user, req.params.id));
    route('get', '/jobs/:id/result', (req, user) => jobs.result(user, req.params.id));
    route('post', '/sprites/read', (req, root) => readSet(root, req.body.character, req.body.set));
    route('post', '/sprites/list', (req, root) => listSets(root, req.body.character));
    route('post', '/sprites/save', (req, root) => saveSprite(root, req.body));
    route('post', '/sprites/delete', (req, root) => deleteSprite(root, req.body));
    console.log('[story-orchestrator-media] owned render jobs ready');
}

export default { info, init };

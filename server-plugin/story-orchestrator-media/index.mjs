import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createComfyTarget } from './comfyTarget.mjs';
import { fingerprint, pngBytes, saveSprite, reconcileSet, deleteSprite, listSets, removeStorySprites, referencePack, referenceSets, spriteInventory, alphaRecipes,
    digest, recordReference, ownsReference, releaseReference, pruneReferences } from './files.mjs';

export const info = { id: 'story-orchestrator-media', name: 'Story Orchestrator media', description: 'Owned ComfyUI jobs and generated sprite files.' };
const home = path.dirname(fileURLToPath(import.meta.url));
export const ALLOWED_NODES = Object.freeze(['LoadImage', 'UNETLoader', 'QwenImage21Cache', 'CLIPLoader', 'VAELoader', 'TextEncodeQwenImage21',
    'KSampler', 'VAEDecode', 'SaveImage', 'PreviewImage', 'CheckpointLoaderSimple', 'LoraLoader', 'CLIPTextEncode',
    'EmptyLatentImage', 'UpscaleModelLoader', 'ImageUpscaleWithModel', 'ImageScaleBy', 'VAEEncode', 'RMBG', 'BiRefNetRMBG', 'SplitImageWithAlpha']);
const allowedNodes = new Set(ALLOWED_NODES);
export const unsupportedNode = (node) => !node || !allowedNodes.has(node.class_type) || !node.inputs || typeof node.inputs !== 'object';

export async function init(router) {
    const config = await fs.readFile(path.join(home, 'config.json'), 'utf8').then(JSON.parse).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
        return {};
    });
    const target = createComfyTarget({ configured: config.comfyUrl,
        readSettings: async (req) => JSON.parse(await fs.readFile(path.join(req.user.directories.root, 'settings.json'), 'utf8')) });
    const roots = config.modelRoots ?? {};
    const owner = (req) => {
        const root = req.user?.directories?.characters;
        if (!root) throw new Error('Open SillyTavern with a user session first.');
        return root;
    };
    const route = (method, name, run) => router[method](name, async (req, res) => {
        try { const user = owner(req); res.json(await run(req, user, await target(req))); }
        catch (error) { res.status(400).json({ error: error.message }); }
    });
    route('get', '/status', async (_req, _user, { url, from }) => ({ ready: true, comfyUrl: url, comfyUrlFrom: from, fingerprints: Object.keys(roots) }));
    route('get', '/discover', async (_req, _user, { jobs }) => {
        const nodes = await (await jobs.request('/object_info')).json();
        if (nodes.LoadImage?.input?.required?.image) nodes.LoadImage.input.required.image[0] = [];
        const embeddings = await (await jobs.request('/embeddings')).json();
        const choices = (node, field) => nodes[node]?.input?.required?.[field]?.[0] ?? [];
        return {
            nodes, embeddings, checkpoints: choices('CheckpointLoaderSimple', 'ckpt_name'), diffusionModels: choices('UNETLoader', 'unet_name'),
            textEncoders: choices('CLIPLoader', 'clip_name'), vaes: choices('VAELoader', 'vae_name'),
            loras: choices('LoraLoader', 'lora_name'), upscalers: choices('UpscaleModelLoader', 'model_name'),
            alpha: await alphaRecipes(roots, config.alphaRecipes, nodes),
        };
    });
    route('post', '/fingerprint', (req) => fingerprint(roots[req.body.kind] ?? [], req.body.name));
    route('post', '/reference', async (req, user, { url }) => {
        const bytes = pngBytes(req.body.data);
        const filename = `so_${randomUUID()}.png`;
        const name = `story-orchestrator/${filename}`;
        await recordReference(user, name, digest(bytes), req.body.scope ?? {});
        const form = new FormData();
        form.set('image', new Blob([bytes], { type: 'image/png' }), filename);
        form.set('subfolder', 'story-orchestrator');
        try {
            const response = await fetch(`${url.replace(/\/$/, '')}/upload/image`, { method: 'POST', body: form, signal: AbortSignal.timeout(30_000) });
            if (!response.ok) throw new Error(`ComfyUI reference upload answered ${response.status}.`);
            const data = await response.json();
            if (data.subfolder !== 'story-orchestrator' || data.name !== filename) throw new Error('ComfyUI changed the owned reference filename.');
        } catch (error) {
            await releaseReference(user, name);
            throw error;
        }
        return { name };
    });
    const prune = async (user, names, jobs) => {
        const queue = await (await jobs.request('/queue')).json();
        if (queue.queue_running?.length || queue.queue_pending?.length) return { deleted: [], errors: [], deferred: 'ComfyUI still has work; references stay on disk.' };
        return pruneReferences(user, config.comfyInputRoot, names);
    };
    route('post', '/reference/release', async (req, user, comfy) => {
        const result = await releaseReference(user, req.body.name);
        return { ...result, prune: await prune(user, [req.body.name], comfy.jobs) };
    });
    route('post', '/prune', (req, user, { jobs }) => prune(user, req.body.names, jobs));
    route('post', '/jobs', async (req, user, { jobs }) => {
        const graph = req.body.graph;
        if (!graph || typeof graph !== 'object' || Array.isArray(graph) || Object.keys(graph).length > 128) throw new Error('Invalid render recipe.');
        for (const node of Object.values(graph)) {
            if (unsupportedNode(node)) throw new Error('The recipe contains an unsupported node.');
            if (node.class_type === 'LoadImage' && !(await ownsReference(user, node.inputs.image))) throw new Error('This reference image does not belong to this user. Upload it through the builder first.');
            if (node.class_type === 'SaveImage' && !/^so[-_][a-z0-9_-]{1,80}$/.test(node.inputs.filename_prefix)) throw new Error('Generated images need an owned output prefix.');
            if (['RMBG', 'BiRefNetRMBG'].includes(node.class_type)) {
                const recipe = config.alphaRecipes?.find((recipe) => recipe.node === node.class_type && recipe.model === node.inputs.model);
                if (!recipe?.files?.length) throw new Error('Configure the installed background-removal files before building a base. No model is downloaded.');
                for (const file of recipe.files) await fingerprint(roots[file.kind] ?? [], file.name);
            }
        }
        return jobs.submit(user, req.body.id, graph);
    });
    route('get', '/jobs/:id', (req, user, { jobs }) => jobs.poll(user, req.params.id));
    route('post', '/jobs/:id/cancel', (req, user, { jobs }) => jobs.cancel(user, req.params.id));
    route('get', '/jobs/:id/result', (req, user, { jobs }) => jobs.result(user, req.params.id));
    route('post', '/sprites/read', (req, root) => reconcileSet(root, req.body.character, req.body.set));
    route('post', '/sprites/reference-sets', (req, root) => referenceSets(root, req.body.character));
    route('post', '/sprites/reference-pack', (req, root) => referencePack(root, req.body.character, req.body.set));
    route('get', '/sprites/inventory', (_req, root) => spriteInventory(root));
    route('post', '/sprites/list', (req, root) => listSets(root, req.body.character));
    route('post', '/sprites/save', (req, root) => saveSprite(root, req.body));
    route('post', '/sprites/remove-story', (req, root) => removeStorySprites(root, req.body.story));
    route('post', '/sprites/delete', (req, root) => deleteSprite(root, req.body));
    console.log('[story-orchestrator-media] owned render jobs ready');
}

export default { info, init };

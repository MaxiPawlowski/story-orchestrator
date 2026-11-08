import fs from 'node:fs/promises';
import path from 'node:path';
import { digest, ownsReference } from './files.mjs';
import { ComfyJobs } from './jobs.mjs';

export const LOOP_NODES = Object.freeze(['UNETLoader', 'CLIPLoader', 'VAELoader', 'ModelSamplingSD3', 'CLIPTextEncode', 'LoadImage',
    'Wan22ImageToVideoLatent', 'KSampler', 'VAEDecode', 'ImageFromBatch', 'ImageBlend', 'ImageBatch', 'SaveWEBM']);
export const LOOP_FOLDER = 'story-orchestrator-loops';
export const LOOP_MAX_BYTES = 16 * 1024 * 1024;
const KEY = /^[a-f0-9]{32}$/;
const WEBM_MAGIC = [0x1a, 0x45, 0xdf, 0xa3];
const allowed = new Set(LOOP_NODES);

export const loopPrefixFor = (key) => `so_loop_${key}`;

export async function validateLoopGraph(graph, key, owns) {
    if (!KEY.test(key ?? '')) throw new Error('The loop key is invalid.');
    if (!graph || typeof graph !== 'object' || Array.isArray(graph) || Object.keys(graph).length > 128) throw new Error('Invalid loop recipe.');
    let saves = 0;
    for (const node of Object.values(graph)) {
        if (!node || !allowed.has(node.class_type) || !node.inputs || typeof node.inputs !== 'object') throw new Error('The loop recipe contains an unsupported node.');
        if (node.class_type === 'LoadImage' && !(await owns(node.inputs.image))) throw new Error('This still does not belong to this user. Upload it first.');
        if (node.class_type === 'SaveWEBM') {
            saves += 1;
            if (node.inputs.filename_prefix !== loopPrefixFor(key)) throw new Error('A loop needs its owned output prefix.');
        }
    }
    if (saves !== 1) throw new Error('A loop recipe saves exactly one video.');
}

const loopFile = (dirs, key, ext) => path.join(dirs.userImages, LOOP_FOLDER, `${key}.${ext}`);
const loopUrl = (key) => `/user/images/${LOOP_FOLDER}/${key}.webm`;

export async function cachedLoop(dirs, key) {
    if (!KEY.test(key ?? '')) throw new Error('The loop key is invalid.');
    const meta = await fs.readFile(loopFile(dirs, key, 'json'), 'utf8').then(JSON.parse).catch(() => null);
    const stat = await fs.stat(loopFile(dirs, key, 'webm')).catch(() => null);
    if (!meta || !stat || stat.size !== meta.bytes) return { url: null };
    return { url: loopUrl(key), bytes: stat.size, sha256: meta.sha256, meta };
}

export async function writeLoop(dirs, key, bytes, meta = {}) {
    if (!KEY.test(key ?? '')) throw new Error('The loop key is invalid.');
    if (bytes.length > LOOP_MAX_BYTES) throw new Error('The loop video is too large.');
    if (!WEBM_MAGIC.every((byte, index) => bytes[index] === byte)) throw new Error('The loop is not a WebM video.');
    const folder = path.join(dirs.userImages, LOOP_FOLDER);
    await fs.mkdir(folder, { recursive: true });
    const sha256 = digest(bytes);
    const record = { owner: 'story-orchestrator', key, sha256, bytes: bytes.length, savedAt: new Date().toISOString(),
        model: typeof meta.model === 'string' ? meta.model.slice(0, 80) : null,
        promptVersion: Number.isInteger(meta.promptVersion) ? meta.promptVersion : null,
        ms: Number.isFinite(meta.ms) ? Math.round(meta.ms) : null };
    const temp = loopFile(dirs, `${key}.part`, 'webm');
    await fs.writeFile(temp, bytes);
    await fs.rename(temp, loopFile(dirs, key, 'webm'));
    await fs.writeFile(loopFile(dirs, key, 'json'), JSON.stringify(record, null, 2));
    return { url: loopUrl(key), bytes: bytes.length, sha256 };
}

export async function interruptIfRunning(jobs, job) {
    if (!job?.promptId) return false;
    await jobs.request('/interrupt', { prompt_id: job.promptId });
    return true;
}

export function mountLoopRoutes(router, { target, owner, makeJobs = (url) => new ComfyJobs({ url }) }) {
    const pool = new Map();
    const loopJobs = (url) => {
        if (!pool.has(url)) pool.set(url, makeJobs(url));
        return pool.get(url);
    };
    const route = (method, name, run) => router[method](name, async (req, res) => {
        try {
            const user = owner(req);
            const dirs = req.user?.directories;
            if (!dirs?.userImages) throw new Error('Open SillyTavern with a user session first.');
            const { url } = await target(req);
            res.json(await run(req, { user, dirs, jobs: loopJobs(url) }));
        } catch (error) { res.status(400).json({ error: error.message }); }
    });
    route('get', '/loops/cached/:key', (req, { dirs }) => cachedLoop(dirs, req.params.key));
    route('get', '/loops/queue', async (_req, { jobs }) => {
        const queue = await (await jobs.request('/queue')).json();
        return { running: queue.queue_running?.length ?? 0, pending: queue.queue_pending?.length ?? 0 };
    });
    route('post', '/loops/jobs', async (req, { user, jobs }) => {
        await validateLoopGraph(req.body.graph, req.body.key, (name) => ownsReference(user, name));
        const job = await jobs.submit(user, req.body.id, req.body.graph);
        if (jobs.jobs.has(req.body.id)) jobs.jobs.get(req.body.id).loopKey = req.body.key;
        return job;
    });
    route('get', '/loops/jobs/:id', (req, { user, jobs }) => jobs.poll(user, req.params.id));
    route('post', '/loops/jobs/:id/cancel', async (req, { user, jobs }) => {
        const before = jobs.get(user, req.params.id);
        const running = before.status === 'running';
        const view = await jobs.cancel(user, req.params.id);
        return { ...view, interrupted: running ? await interruptIfRunning(jobs, before) : false };
    });
    route('post', '/loops/jobs/:id/save', async (req, { user, dirs, jobs }) => {
        const job = jobs.get(user, req.params.id);
        if (job.status !== 'complete' || !job.output || !/\.webm$/i.test(job.output.filename ?? '')) throw new Error('This loop has no finished video.');
        if (!job.loopKey || job.loopKey !== req.body.key) throw new Error('This loop was rendered for another key.');
        const query = new URLSearchParams({ filename: job.output.filename, subfolder: job.output.subfolder ?? '', type: job.output.type });
        const bytes = Buffer.from(await (await jobs.request(`/view?${query}`)).arrayBuffer());
        return writeLoop(dirs, job.loopKey, bytes, req.body.meta ?? {});
    });
}

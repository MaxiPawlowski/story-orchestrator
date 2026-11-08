import fs from 'node:fs/promises';
import path from 'node:path';
import { digest, ownsReference } from './files.mjs';
import { ComfyJobs } from './jobs.mjs';

export const LOOP_NODES = Object.freeze(['UNETLoader', 'CLIPLoader', 'VAELoader', 'ModelSamplingSD3', 'CLIPTextEncode', 'LoadImage',
    'Wan22ImageToVideoLatent', 'RepeatImageBatch', 'VAEEncode', 'LatentCut', 'ReplaceVideoLatentFrames', 'EmptyImage', 'ImageBatch', 'ImageToMask',
    'SetLatentNoiseMask', 'KSampler', 'VAEDecode', 'ImageFromBatch', 'ColorTransfer', 'CreateVideo', 'SaveVideo', 'SaveAnimatedWEBP']);
export const LOOP_FOLDER = 'story-orchestrator-loops';
export const LOOP_MAX_BYTES = 16 * 1024 * 1024;
const KEY = /^[a-f0-9]{32}$/;
const VIDEO_EXT = 'mp4';
const isMp4 = (bytes) => bytes.length > 12 && bytes.toString('latin1', 4, 8) === 'ftyp';
const isWebp = (bytes) => bytes.length > 12 && bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP';
const allowed = new Set(LOOP_NODES);

export const loopPrefixFor = (key) => `so_loop_${key}`;

export async function validateLoopGraph(graph, key, owns) {
    if (!KEY.test(key ?? '')) throw new Error('The loop key is invalid.');
    if (!graph || typeof graph !== 'object' || Array.isArray(graph) || Object.keys(graph).length > 128) throw new Error('Invalid loop recipe.');
    let saves = 0;
    let stills = 0;
    for (const node of Object.values(graph)) {
        if (!node || !allowed.has(node.class_type) || !node.inputs || typeof node.inputs !== 'object') throw new Error('The loop recipe contains an unsupported node.');
        if (node.class_type === 'LoadImage' && !(await owns(node.inputs.image))) throw new Error('This still does not belong to this user. Upload it first.');
        if (node.class_type === 'SaveVideo') {
            saves += 1;
            if (node.inputs.filename_prefix !== loopPrefixFor(key)) throw new Error('A loop needs its owned output prefix.');
        }
        if (node.class_type === 'SaveAnimatedWEBP') {
            stills += 1;
            if (node.inputs.filename_prefix !== loopPrefixFor(key)) throw new Error('A loop needs its owned output prefix.');
        }
    }
    if (saves !== 1 || stills > 1) throw new Error('A loop recipe saves exactly one video and at most one animated WebP.');
}

const loopFile = (dirs, key, ext) => path.join(dirs.userImages, LOOP_FOLDER, `${key}.${ext}`);
const loopUrl = (key, ext = VIDEO_EXT) => `/user/images/${LOOP_FOLDER}/${key}.${ext}`;

export async function cachedLoop(dirs, key) {
    if (!KEY.test(key ?? '')) throw new Error('The loop key is invalid.');
    const meta = await fs.readFile(loopFile(dirs, key, 'json'), 'utf8').then(JSON.parse).catch(() => null);
    const stat = await fs.stat(loopFile(dirs, key, VIDEO_EXT)).catch(() => null);
    if (!meta || !stat || stat.size !== meta.bytes) return { url: null };
    const webp = meta.webp ? await fs.stat(loopFile(dirs, key, 'webp')).catch(() => null) : null;
    return { url: loopUrl(key), bytes: stat.size, sha256: meta.sha256, meta, ...(webp && webp.size === meta.webp.bytes ? { webpUrl: loopUrl(key, 'webp') } : {}) };
}

export async function writeLoop(dirs, key, bytes, meta = {}, webp = null) {
    if (!KEY.test(key ?? '')) throw new Error('The loop key is invalid.');
    if (bytes.length > LOOP_MAX_BYTES || (webp && webp.length > LOOP_MAX_BYTES)) throw new Error('The loop video is too large.');
    if (!isMp4(bytes)) throw new Error('The loop is not an MP4 video.');
    if (webp && !isWebp(webp)) throw new Error('The loop still is not a WebP image.');
    const folder = path.join(dirs.userImages, LOOP_FOLDER);
    await fs.mkdir(folder, { recursive: true });
    const sha256 = digest(bytes);
    const record = { owner: 'story-orchestrator', key, sha256, bytes: bytes.length, savedAt: new Date().toISOString(),
        model: typeof meta.model === 'string' ? meta.model.slice(0, 80) : null,
        promptVersion: Number.isInteger(meta.promptVersion) ? meta.promptVersion : null,
        tier: ['lite', 'full'].includes(meta.tier) ? meta.tier : null,
        ms: Number.isFinite(meta.ms) ? Math.round(meta.ms) : null,
        ...(webp ? { webp: { sha256: digest(webp), bytes: webp.length } } : {}) };
    const temp = loopFile(dirs, `${key}.part`, VIDEO_EXT);
    await fs.writeFile(temp, bytes);
    await fs.rename(temp, loopFile(dirs, key, VIDEO_EXT));
    if (webp) {
        const tempWebp = loopFile(dirs, `${key}.part`, 'webp');
        await fs.writeFile(tempWebp, webp);
        await fs.rename(tempWebp, loopFile(dirs, key, 'webp'));
    }
    await fs.writeFile(loopFile(dirs, key, 'json'), JSON.stringify(record, null, 2));
    return { url: loopUrl(key), bytes: bytes.length, sha256, ...(webp ? { webpUrl: loopUrl(key, 'webp') } : {}) };
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
    route('get', '/loops/jobs/:id', async (req, { user, jobs }) => {
        const view = await jobs.poll(user, req.params.id);
        const job = jobs.get(user, req.params.id);
        if (view.status !== 'failed' || !job.promptId || job.interruptChecked) return { ...view, reason: job.reason ?? view.reason };
        job.interruptChecked = true;
        const history = await (await jobs.request(`/history/${encodeURIComponent(job.promptId)}`)).json().catch(() => ({}));
        if ((history[job.promptId]?.status?.messages ?? []).some((message) => message?.[0] === 'execution_interrupted')) job.reason = 'interrupted';
        return { ...view, reason: job.reason ?? view.reason };
    });
    route('post', '/loops/jobs/:id/cancel', async (req, { user, jobs }) => {
        const before = jobs.get(user, req.params.id);
        const running = before.status === 'running';
        const view = await jobs.cancel(user, req.params.id);
        return { ...view, interrupted: running ? await interruptIfRunning(jobs, before) : false };
    });
    route('post', '/loops/jobs/:id/save', async (req, { user, dirs, jobs }) => {
        const job = jobs.get(user, req.params.id);
        if (job.status !== 'complete' || !job.promptId) throw new Error('This loop has no finished video.');
        if (!job.loopKey || job.loopKey !== req.body.key) throw new Error('This loop was rendered for another key.');
        const history = await (await jobs.request(`/history/${encodeURIComponent(job.promptId)}`)).json();
        const files = Object.values(history[job.promptId]?.outputs ?? {}).flatMap((output) => output.images ?? [])
            .filter((file) => file?.type === 'output' && typeof file.filename === 'string' && file.filename.startsWith(loopPrefixFor(job.loopKey)));
        const read = async (file) => {
            const query = new URLSearchParams({ filename: file.filename, subfolder: file.subfolder ?? '', type: file.type });
            return Buffer.from(await (await jobs.request(`/view?${query}`)).arrayBuffer());
        };
        const video = files.find((file) => /\.mp4$/i.test(file.filename));
        if (!video) throw new Error('This loop has no finished video.');
        const still = files.find((file) => /\.webp$/i.test(file.filename));
        return writeLoop(dirs, job.loopKey, await read(video), req.body.meta ?? {}, still ? await read(still) : null);
    });
}

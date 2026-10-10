import fs from 'node:fs/promises';
import { constants as fsConstants, createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const SECRET_KEYS = Object.freeze({ civitai: 'so_civitai_token', huggingface: 'api_key_huggingface' });
export const GIB = 1024 ** 3;
export const DEFAULT_MARGIN_BYTES = 2 * GIB;
const PLAN_TTL_MS = 15 * 60_000;
const MAX_REDIRECTS = 5;
const SAFE_EXTENSIONS = ['.safetensors', '.gguf'];
const PICKLE_EXTENSIONS = ['.ckpt', '.pt', '.pth', '.bin'];
export const DOWNLOAD_KINDS = Object.freeze(['checkpoints', 'loras', 'upscaleModels', 'embeddings', 'vaes', 'diffusionModels', 'textEncoders', 'textModels', 'backgroundModels']);
const CIVITAI_KIND = { Checkpoint: 'checkpoints', LORA: 'loras', LoCon: 'loras', DoRA: 'loras', Upscaler: 'upscaleModels', TextualInversion: 'embeddings', VAE: 'vaes' };

export const PROVIDERS = Object.freeze({
    civitai: { apiHost: 'civitai.com', hosts: [/^(?:[a-z0-9-]+\.)*civitai\.com$/, /^civitai-delivery-worker-prod\.[a-z0-9]+\.r2\.cloudflarestorage\.com$/] },
    huggingface: { apiHost: 'huggingface.co', hosts: [/^(?:[a-z0-9-]+\.)*huggingface\.co$/, /^(?:[a-z0-9-]+\.)*hf\.co$/] },
});

export class DownloadError extends Error {
    constructor(message, status = 400) { super(message); this.status = status; }
}
const refuse = (message, status = 400) => { throw new DownloadError(message, status); };

export const allowedHost = (provider, host) => PROVIDERS[provider]?.hosts.some((pattern) => pattern.test(host)) === true;

export function safeFileName(name) {
    const value = String(name ?? '');
    if (!value || value.length > 200 || value !== path.basename(value) || /[\\/:*?"<>|]/.test(value) || [...value].some((char) => char.charCodeAt(0) < 32)
        || value.startsWith('.') || value.includes('..')) refuse('The model file name is not a plain file name.');
    return value;
}

export function checkFormat(name, { allowPickle = false } = {}) {
    const ext = path.extname(name).toLowerCase();
    if (SAFE_EXTENSIONS.includes(ext)) return ext;
    if (PICKLE_EXTENSIONS.includes(ext)) {
        if (allowPickle) return ext;
        refuse(`${ext} files can run code when loaded; only .safetensors and .gguf are downloaded unless an admin allows pickle formats.`);
    }
    refuse(`Unsupported model file type ${ext || '(none)'}.`);
}

const positiveInt = (value, name) => {
    const number = Number(value);
    if (!Number.isInteger(number) || number <= 0) refuse(`${name} must be a positive number.`);
    return number;
};

export function readRef(provider, ref) {
    if (!ref || typeof ref !== 'object' || Array.isArray(ref)) refuse('Send a model reference, not a URL or a path.');
    if (provider === 'civitai') {
        const keys = Object.keys(ref).filter((key) => !['versionId', 'fileId', 'modelId'].includes(key));
        if (keys.length) refuse(`A Civitai reference takes versionId and fileId only, not ${keys.join(', ')}.`);
        return { versionId: positiveInt(ref.versionId, 'versionId'), ...(ref.fileId !== undefined ? { fileId: positiveInt(ref.fileId, 'fileId') } : {}) };
    }
    if (provider === 'huggingface') {
        const keys = Object.keys(ref).filter((key) => !['repo', 'file', 'revision'].includes(key));
        if (keys.length) refuse(`A Hugging Face reference takes repo, file and revision only, not ${keys.join(', ')}.`);
        if (typeof ref.repo !== 'string' || !/^[\w.-]{1,96}\/[\w.-]{1,96}$/.test(ref.repo) || ref.repo.includes('..')) refuse('repo must be owner/name.');
        if (typeof ref.file !== 'string' || !ref.file || ref.file.length > 300 || ref.file.startsWith('/') || ref.file.split('/').some((part) => !part || part === '..' || part === '.')
            || /[\\:*?"<>|]/.test(ref.file)) refuse('file must be a path inside the repository.');
        const revision = ref.revision ?? 'main';
        if (typeof revision !== 'string' || !/^[\w.-]{1,64}$/.test(revision)) refuse('revision must be a branch, tag or commit.');
        return { repo: ref.repo, file: ref.file, revision };
    }
    return refuse('Choose civitai or huggingface.');
}

const bearer = (key) => (key ? { authorization: `Bearer ${key}` } : {});

export async function resolveModel({ provider, ref, key, fetchImpl = fetch, allowPickle = false }) {
    const parsed = readRef(provider, ref);
    if (provider === 'civitai') {
        const response = await fetchImpl(`https://civitai.com/api/v1/model-versions/${parsed.versionId}`, { headers: { accept: 'application/json', ...bearer(key) }, signal: AbortSignal.timeout(20_000) });
        if (response.status === 401 || response.status === 403) refuse('Civitai refused the request; check the Civitai token.', 403);
        if (!response.ok) refuse(`Civitai answered ${response.status} for that model version.`, 502);
        const data = await response.json();
        const files = Array.isArray(data?.files) ? data.files : [];
        const file = parsed.fileId ? files.find((row) => row?.id === parsed.fileId) : files.find((row) => row?.primary) ?? files[0];
        if (!file) refuse('That model version lists no file.');
        const name = safeFileName(file.name);
        checkFormat(name, { allowPickle });
        const sha256 = typeof file.hashes?.SHA256 === 'string' ? file.hashes.SHA256.toLowerCase() : null;
        if (!sha256 || !/^[0-9a-f]{64}$/.test(sha256)) refuse('Civitai lists no SHA256 for that file, so it cannot be verified; it is not downloaded.');
        let download;
        try { download = new URL(file.downloadUrl); } catch { refuse('Civitai gave no usable download address.'); }
        if (download.protocol !== 'https:' || !allowedHost('civitai', download.hostname)) refuse('Civitai pointed the download at an unexpected host.');
        return {
            provider, ref: parsed, name, sha256, sizeBytes: Number.isFinite(file.sizeKB) ? Math.round(file.sizeKB * 1024) : null,
            kind: CIVITAI_KIND[data?.model?.type] ?? null, baseModel: typeof data?.baseModel === 'string' ? data.baseModel : null,
            nsfw: data?.model?.nsfw === true, termsUrl: `https://civitai.com/models/${Number(data?.modelId) || ''}?modelVersionId=${parsed.versionId}`,
            source: `Civitai ${data?.model?.name ?? 'model'} · ${data?.name ?? parsed.versionId}`, downloadUrl: download.href,
        };
    }
    const fileUrl = `https://huggingface.co/${parsed.repo}/resolve/${encodeURIComponent(parsed.revision)}/${parsed.file.split('/').map(encodeURIComponent).join('/')}`;
    const response = await fetchImpl(fileUrl, { method: 'HEAD', redirect: 'manual', headers: bearer(key), signal: AbortSignal.timeout(20_000) });
    if (response.status === 401 || response.status === 403) refuse('Hugging Face refused the request; the repository may be gated. Check the Hugging Face token and accept its terms on the site.', 403);
    if (![200, 301, 302, 303, 307, 308].includes(response.status)) refuse(`Hugging Face answered ${response.status} for that file.`, 502);
    const name = safeFileName(parsed.file.split('/').at(-1));
    checkFormat(name, { allowPickle });
    const etag = String(response.headers.get('x-linked-etag') ?? '').replace(/^W\//, '').replace(/"/g, '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(etag)) refuse('Hugging Face gives no SHA256 for that file (not stored in LFS), so it cannot be verified; it is not downloaded.');
    const size = Number(response.headers.get('x-linked-size'));
    return {
        provider, ref: parsed, name, sha256: etag, sizeBytes: Number.isFinite(size) && size > 0 ? size : null, kind: null, baseModel: null, nsfw: false,
        termsUrl: `https://huggingface.co/${parsed.repo}`, source: `Hugging Face ${parsed.repo} · ${parsed.file}@${response.headers.get('x-repo-commit')?.slice(0, 12) ?? parsed.revision}`,
        downloadUrl: fileUrl,
    };
}

export async function hashFile(file) {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    return hash.digest('hex');
}

const statOrNull = (file) => fs.lstat(file).catch((error) => { if (error.code === 'ENOENT') return null; throw error; });

export function createDownloads({ config = {}, fetchImpl = fetch, statfs = (dir) => fs.statfs(dir), now = Date.now, log = () => {} } = {}) {
    const roots = config.modelRoots ?? {};
    const options = config.downloads ?? {};
    const margin = Number.isFinite(options.freeMarginBytes) && options.freeMarginBytes >= 0 ? options.freeMarginBytes : DEFAULT_MARGIN_BYTES;
    const allowPickle = options.allowPickle === true;
    const maxQueue = Number.isInteger(options.maxQueue) && options.maxQueue > 0 ? options.maxQueue : 4;
    const plans = new Map();
    const jobs = new Map();
    const queues = new Map();

    const rootFor = (kind, index = 0) => {
        if (!DOWNLOAD_KINDS.includes(kind)) refuse(`Unknown model kind ${kind}.`);
        const list = roots[kind];
        if (!Array.isArray(list) || !list.length) refuse(`No folder is configured for ${kind}. An admin adds modelRoots.${kind} to the media plugin's config.json; no default folder is assumed.`, 409);
        const root = list[Number.isInteger(index) ? index : 0];
        if (typeof root !== 'string' || !path.isAbsolute(root)) refuse('Pick one of the configured folders.');
        return path.resolve(root);
    };

    const freeBytes = async (root) => {
        const stats = await statfs(root);
        return Number(stats.bavail) * Number(stats.bsize);
    };

    const roomFor = async (root, bytes) => {
        const free = await freeBytes(root);
        const need = bytes + margin;
        if (!Number.isFinite(free) || free < need) {
            refuse(`Not enough free space in ${root}: the file needs ${(bytes / GIB).toFixed(2)} GiB plus a ${(margin / GIB).toFixed(0)} GiB margin, and ${(free / GIB).toFixed(2)} GiB is free. Nothing was downloaded.`, 507);
        }
        return free;
    };

    async function plan({ user, provider, ref, kind, root: rootIndex = 0, key }) {
        const resolved = await resolveModel({ provider, ref, key, fetchImpl, allowPickle });
        const chosenKind = kind ?? resolved.kind;
        const root = rootFor(chosenKind, rootIndex);
        const target = path.resolve(root, resolved.name);
        if (path.dirname(target) !== root) refuse('The model would land outside the chosen folder.');
        const realRoot = await fs.realpath(root).catch(() => refuse(`The folder ${root} does not exist.`, 409));
        const existing = await statOrNull(target);
        let present = false;
        if (existing) {
            if (existing.isSymbolicLink() || !existing.isFile()) refuse(`${resolved.name} already exists there as something other than a plain file; nothing is overwritten.`, 409);
            if (resolved.sizeBytes !== null && existing.size !== resolved.sizeBytes) refuse(`A different ${resolved.name} already exists in ${root}; it is never overwritten.`, 409);
            if (await hashFile(target) !== resolved.sha256) refuse(`A different ${resolved.name} already exists in ${root}; it is never overwritten.`, 409);
            present = true;
        }
        const part = await statOrNull(`${target}.part`);
        if (part && (part.isSymbolicLink() || !part.isFile())) refuse('A partial download in that folder is not a plain file; remove it first.', 409);
        const free = await freeBytes(root);
        const remaining = Math.max(0, (resolved.sizeBytes ?? 0) - (part?.size ?? 0));
        const fits = present || (resolved.sizeBytes !== null && free >= remaining + margin);
        const id = randomUUID();
        const row = { id, user, provider, resolved, kind: chosenKind, root, realRoot, target, present, createdAt: now() };
        plans.set(id, row);
        for (const [planId, old] of plans) if (now() - old.createdAt > PLAN_TTL_MS) plans.delete(planId);
        const { downloadUrl: _hidden, ...shown } = resolved;
        return { id, ...shown, kind: chosenKind, root, folders: roots[chosenKind], present, freeBytes: free, marginBytes: margin, fits,
            resumeFromBytes: part?.size ?? 0, ...(resolved.sizeBytes === null ? { warning: 'The source did not state the size; free space is checked again as it downloads.' } : {}) };
    }

    const publicJob = (job) => ({ id: job.id, planId: job.planId, name: job.name, root: job.root, state: job.state, bytes: job.bytes, total: job.total, error: job.error ?? null, startedAt: job.startedAt });

    async function fetchFollowing(provider, url, headers, key, signal) {
        let current = new URL(url);
        for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
            if (current.protocol !== 'https:' || !allowedHost(provider, current.hostname)) refuse('The download was redirected to a host outside the provider; it was stopped.');
            const auth = current.hostname === PROVIDERS[provider].apiHost ? bearer(key) : {};
            const response = await fetchImpl(current.href, { headers: { ...headers, ...auth }, redirect: 'manual', signal });
            if ([301, 302, 303, 307, 308].includes(response.status)) {
                const location = response.headers.get('location');
                if (!location) refuse('The provider redirected without an address.');
                current = new URL(location, current);
                continue;
            }
            return response;
        }
        return refuse('The provider redirected too many times.');
    }

    async function run(job, row, key) {
        const { resolved, target, root } = row;
        const part = `${target}.part`;
        const sidecar = `${part}.json`;
        job.state = 'running';
        let offset = 0;
        const partStat = await statOrNull(part);
        if (partStat?.isFile()) {
            const meta = await fs.readFile(sidecar, 'utf8').then(JSON.parse).catch(() => null);
            if (meta?.sha256 === resolved.sha256 && partStat.size > 0 && (resolved.sizeBytes === null || partStat.size < resolved.sizeBytes)) offset = partStat.size;
        }
        if (resolved.sizeBytes !== null) await roomFor(root, resolved.sizeBytes - offset);
        await fs.writeFile(sidecar, JSON.stringify({ host: new URL(resolved.downloadUrl).hostname, sha256: resolved.sha256, bytes: resolved.sizeBytes }));
        const response = await fetchFollowing(row.provider, resolved.downloadUrl, offset ? { range: `bytes=${offset}-` } : {}, key, job.abort.signal);
        if (response.status === 401 || response.status === 403) refuse('The provider refused the download; check the token, or accept the model\'s terms on the site.', 403);
        if (response.status === 206) {
            const start = Number(/bytes (\d+)-/.exec(response.headers.get('content-range') ?? '')?.[1]);
            if (start !== offset) refuse('The provider resumed at the wrong position; the partial file was kept.');
        } else if (response.status === 200) offset = 0;
        else refuse(`The provider answered ${response.status}.`);
        if (!response.body) refuse('The provider sent no file.');
        const hash = createHash('sha256');
        if (offset) for await (const chunk of createReadStream(part, { end: offset - 1 })) hash.update(chunk);
        const handle = await fs.open(part, offset ? 'r+' : 'w');
        job.bytes = offset;
        job.total = resolved.sizeBytes ?? (Number(response.headers.get('content-length')) + offset || null);
        let checkedAt = offset;
        try {
            let position = offset;
            for await (const chunk of response.body) {
                hash.update(chunk);
                await handle.write(chunk, 0, chunk.length, position);
                position += chunk.length;
                job.bytes = position;
                if (resolved.sizeBytes !== null && position > resolved.sizeBytes) refuse('The provider sent more bytes than the file it described.');
                if (resolved.sizeBytes === null && position - checkedAt > GIB) { checkedAt = position; await roomFor(root, 0); }
            }
            await handle.truncate(position);
        } finally { await handle.close(); }
        job.state = 'verifying';
        const digest = hash.digest('hex');
        if (digest !== resolved.sha256 || (resolved.sizeBytes !== null && job.bytes !== resolved.sizeBytes)) {
            await fs.rm(part, { force: true });
            await fs.rm(sidecar, { force: true });
            refuse(`${resolved.name} did not match its SHA256 from the source; the partial file was deleted.`, 422);
        }
        try { await fs.link(part, target); }
        catch (error) {
            if (error.code === 'EEXIST') refuse(`${resolved.name} appeared in the folder while downloading; it was not overwritten.`, 409);
            await fs.copyFile(part, target, fsConstants.COPYFILE_EXCL);
        }
        await fs.rm(part, { force: true });
        await fs.rm(sidecar, { force: true });
        job.state = 'done';
    }

    async function pump(user) {
        const queue = queues.get(user);
        if (!queue || queue.active) return;
        const next = queue.waiting.shift();
        if (!next) return;
        queue.active = next.job;
        try { await run(next.job, next.row, next.key); }
        catch (error) {
            if (next.job.abort.signal.aborted) next.job.state = 'cancelled';
            else { next.job.state = 'failed'; next.job.error = error instanceof Error ? error.message : 'The download failed.'; }
            log(`download ${next.job.id} ${next.job.state}: ${next.job.error ?? ''}`);
        } finally {
            queue.active = null;
            next.key = null;
            void pump(user);
        }
    }

    function start({ user, planId, key }) {
        const row = plans.get(planId);
        if (!row || row.user !== user) refuse('That download card has expired; open it again.', 404);
        if (row.present) refuse(`${row.resolved.name} is already installed.`, 409);
        const queue = queues.get(user) ?? { active: null, waiting: [] };
        queues.set(user, queue);
        if (queue.waiting.length + (queue.active ? 1 : 0) >= maxQueue) refuse('The download queue is full.', 429);
        if ([...jobs.values()].some((job) => job.planId === planId && ['queued', 'running', 'verifying'].includes(job.state))) refuse('That file is already downloading.', 409);
        const job = { id: randomUUID(), planId, user, name: row.resolved.name, root: row.root, state: 'queued', bytes: 0, total: row.resolved.sizeBytes, abort: new AbortController(), startedAt: now() };
        jobs.set(job.id, job);
        queue.waiting.push({ job, row, key });
        void pump(user);
        return publicJob(job);
    }

    function cancel({ user, id }) {
        const job = jobs.get(id);
        if (!job || job.user !== user) refuse('No such download.', 404);
        const queue = queues.get(user);
        if (queue) queue.waiting = queue.waiting.filter((entry) => entry.job !== job);
        if (['queued', 'running', 'verifying'].includes(job.state)) { job.abort.abort(); job.state = 'cancelled'; }
        return publicJob(job);
    }

    const list = (user) => [...jobs.values()].filter((job) => job.user === user).map(publicJob);
    const idle = async () => { while ([...queues.values()].some((queue) => queue.active || queue.waiting.length)) await new Promise((resolve) => setTimeout(resolve, 5)); };
    const planFor = (id) => { const row = plans.get(id); return row ? { provider: row.provider } : null; };
    return { plan, planFor, start, cancel, list, idle, freeBytes };
}

export async function testKey({ provider, key, fetchImpl = fetch }) {
    if (!PROVIDERS[provider]) refuse('Choose civitai or huggingface.');
    if (!key) return { ok: false, set: false, message: 'No token is stored.' };
    const url = provider === 'civitai' ? 'https://civitai.com/api/v1/me' : 'https://huggingface.co/api/whoami-v2';
    try {
        const response = await fetchImpl(url, { headers: bearer(key), signal: AbortSignal.timeout(15_000) });
        if (response.ok) return { ok: true, set: true, message: 'The provider accepted the token.' };
        return { ok: false, set: true, message: response.status === 401 || response.status === 403 ? 'The provider refused the token.' : `The provider answered ${response.status}.` };
    } catch { return { ok: false, set: true, message: 'The provider could not be reached.' }; }
}

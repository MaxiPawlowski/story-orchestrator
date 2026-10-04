import { randomUUID } from 'node:crypto';

const settled = new Set(['cancelled', 'failed', 'complete']);

export class ComfyJobs {
    constructor({ url, fetchImpl = fetch, now = Date.now, maxJobs = 64, retentionMs = 600_000 }) {
        this.url = url.replace(/\/$/, '');
        this.fetch = fetchImpl;
        this.now = now;
        this.maxJobs = maxJobs;
        this.retentionMs = retentionMs;
        this.jobs = new Map();
    }

    async request(route, body) {
        const response = await this.fetch(`${this.url}${route}`, {
            ...(body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
            signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) throw new Error(`ComfyUI ${route.split('?')[0]} answered ${response.status}.`);
        return response;
    }

    prune() {
        for (const [key, job] of this.jobs) {
            if (settled.has(job.status) && this.now() - job.at > this.retentionMs) this.jobs.delete(key);
        }
    }

    get(owner, id) {
        const job = this.jobs.get(id);
        if (!job || job.owner !== owner) throw new Error('This render job does not belong to this user.');
        return job;
    }

    view(job) {
        return { id: job.id, status: job.status, error: job.error ?? null, promptId: job.promptId ?? null };
    }

    async submit(owner, id, graph) {
        this.prune();
        for (const job of this.jobs.values()) {
            if (job.owner === owner && !settled.has(job.status) && job.promptId) await this.poll(owner, job.id);
        }
        this.prune();
        if (!/^[a-f0-9-]{36}$/.test(id) || this.jobs.has(id)) throw new Error('Render job id is invalid or already used.');
        if (this.jobs.size >= this.maxJobs) throw new Error('Too many render jobs. Try again after the current jobs finish.');
        if ([...this.jobs.values()].some((job) => job.owner === owner && !settled.has(job.status))) throw new Error('Finish or cancel this user’s current render first.');
        const job = { id, owner, status: 'submitting', at: this.now(), input: null };
        this.jobs.set(id, job);
        try {
            const data = await (await this.request('/prompt', { prompt: graph, client_id: randomUUID() })).json();
            if (typeof data.prompt_id !== 'string' || !data.prompt_id || data.node_errors && Object.keys(data.node_errors).length) {
                throw new Error('ComfyUI refused the recipe. Check the discovered nodes and model mappings.');
            }
            job.promptId = data.prompt_id;
            if (job.status === 'cancelled') await this.removeQueued(job);
            else job.status = 'queued';
        } catch (error) {
            if (job.status !== 'cancelled') { job.status = 'failed'; job.error = error.message; }
        }
        job.at = this.now();
        return this.view(job);
    }

    async removeQueued(job) {
        if (job.promptId) await this.request('/queue', { delete: [job.promptId] });
    }

    async cancel(owner, id) {
        const job = this.get(owner, id);
        if (!settled.has(job.status)) {
            job.status = 'cancelled';
            job.at = this.now();
            await this.removeQueued(job);
        }
        return this.view(job);
    }

    async poll(owner, id) {
        const job = this.get(owner, id);
        if (settled.has(job.status) || !job.promptId) return this.view(job);
        const history = await (await this.request(`/history/${encodeURIComponent(job.promptId)}`)).json();
        if (job.status === 'cancelled') return this.view(job);
        const item = history[job.promptId];
        if (!item) {
            const queue = await (await this.request('/queue')).json();
            if (job.status === 'cancelled') return this.view(job);
            job.status = queue.queue_running?.some((entry) => entry[1] === job.promptId) ? 'running' : 'queued';
            if (this.now() - job.at > 900_000) { job.status = 'cancelled'; await this.removeQueued(job); job.error = 'The render exceeded fifteen minutes.'; }
            return this.view(job);
        }
        if (item.status?.status_str === 'error') {
            job.status = 'failed'; job.error = 'ComfyUI failed while running the recipe.';
        } else {
            const image = Object.values(item.outputs ?? {}).flatMap((output) => output.images ?? []).find((image) => ['output', 'temp'].includes(image.type));
            if (!image || typeof image.filename !== 'string') { job.status = 'failed'; job.error = 'The recipe returned no saved image.'; }
            else { job.output = image; job.status = 'complete'; }
        }
        job.at = this.now();
        return this.view(job);
    }

    async result(owner, id) {
        const job = this.get(owner, id);
        if (job.status !== 'complete' || !job.output) throw new Error('This render has no completed image.');
        const query = new URLSearchParams({ filename: job.output.filename, subfolder: job.output.subfolder ?? '', type: job.output.type });
        const response = await this.request(`/view?${query}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length > 32 * 1024 * 1024) throw new Error('The rendered image is too large.');
        return { data: bytes.toString('base64'), format: 'png' };
    }
}

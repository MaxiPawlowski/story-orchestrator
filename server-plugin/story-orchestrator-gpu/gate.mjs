import http from 'node:http';
import { randomUUID } from 'node:crypto';

export class GpuGate {
    constructor({ request = http.request, fetchImpl = fetch, upstream = null, expected = null, now = Date.now, comfy = 'http://127.0.0.1:8188', sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
        this.request = request;
        this.fetch = fetchImpl;
        this.upstream = upstream;
        this.expected = expected;
        this.now = now;
        this.comfy = comfy;
        this.sleep = sleep;
        this.phase = 'text';
        this.active = 0;
        this.waiting = [];
        this.pending = null;
        this.lease = null;
        this.leaseAt = 0;
        this.renewedAt = 0;
        this.authorization = null;
    }

    status() {
        return { phase: this.phase, activeText: this.active, waitingText: this.waiting.length, imageLease: Boolean(this.lease) };
    }

    forward(req, res) {
        const path = req.url ?? '/';
        if (!/^\/(?:v1\/|health\b|props\b|completion\b|tokenize\b|detokenize\b)/.test(path)) {
            res.writeHead(404).end();
            return;
        }
        const authorization = req.headers.authorization;
        if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) this.authorization = authorization;
        if (this.phase !== 'text' && !['GET', 'HEAD'].includes(req.method) && !/^\/(?:v1\/models\b|health\b|props\b)/.test(path)) {
            this.waiting.push({ req, res });
            req.on('aborted', () => this.drop(req));
            res.on('close', () => this.drop(req));
            return;
        }
        this.relay(req, res);
    }

    drop(req) {
        this.waiting = this.waiting.filter((entry) => entry.req !== req);
    }

    relay(req, res) {
        if (res.destroyed) return;
        this.active += 1;
        const headers = { ...req.headers, host: new URL(this.upstream).host };
        const upstream = this.request(new URL(req.url, this.upstream), { method: req.method, headers }, (response) => {
            res.writeHead(response.statusCode ?? 502, response.headers);
            response.pipe(res);
            response.on('close', finish);
        });
        let ended = false;
        const finish = () => {
            if (ended) return;
            ended = true;
            this.active -= 1;
            if (this.active === 0 && this.pending) this.pending();
        };
        upstream.on('error', () => {
            if (!res.headersSent) res.writeHead(502);
            res.end();
            finish();
        });
        res.on('close', () => { upstream.destroy(); finish(); });
        req.pipe(upstream);
    }

    async hold() {
        if (this.phase !== 'text') throw new Error('The GPU is already reserved for an image.');
        if (!this.upstream || !this.expected) throw new Error('The observed text server and its model id must be configured.');
        if (!this.authorization) throw new Error('No authenticated Artemis request has passed through this broker yet.');
        this.phase = 'reserving';
        try {
            if (this.active > 0) await new Promise((resolve) => { this.pending = resolve; });
            this.pending = null;
            const headers = { authorization: this.authorization };
            const generations = await this.fetch(`${this.upstream}/api/inference/active-generations`, { headers });
            if (!generations.ok) throw new Error(`Could not confirm text generation is idle (${generations.status}).`);
            const active = await generations.json();
            if (!active || active.count !== 0) throw new Error('Artemis is still generating.');
            const status = await this.fetch(`${this.upstream}/api/inference/status`, { headers });
            if (!status.ok) throw new Error(`Could not read the loaded model (${status.status}).`);
            const resident = await status.json();
            if (resident.loading?.length) throw new Error('A model is still loading.');
            if (resident.loaded?.some((model) => !String(model).startsWith(this.expected))) throw new Error('Another model also holds GPU memory.');
            if (resident.active_model) {
                if (!String(resident.active_model).startsWith(this.expected)) throw new Error('A different text model owns the GPU.');
                const unload = await this.fetch(`${this.upstream}/api/inference/unload`, {
                    method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
                    body: JSON.stringify({ model_path: this.expected, force_cancel_active: false }),
                });
                if (!unload.ok) throw new Error(`Unsloth refused to unload Artemis (${unload.status}).`);
            }
            const after = await this.fetch(`${this.upstream}/api/inference/status`, { headers });
            if (!after.ok) throw new Error('The unloaded model could not be verified.');
            const released = await after.json();
            if (released.active_model || released.loaded?.length) throw new Error('A text model still owns GPU memory.');
            this.lease = randomUUID();
            this.leaseAt = this.now();
            this.phase = 'image';
            return this.lease;
        } catch (error) {
            this.resume();
            throw error;
        }
    }

    renew(lease) {
        if (!this.lease || this.lease !== lease) return false;
        this.renewedAt = this.now();
        return true;
    }

    async release(lease) {
        if (!this.lease || this.lease !== lease) return false;
        this.phase = 'releasing';
        try {
            for (let attempt = 0; attempt < 120; attempt += 1) {
                const queue = await this.fetch(`${this.comfy}/queue`, { signal: AbortSignal.timeout(3000) });
                if (!queue.ok) throw new Error('ComfyUI queue is unavailable.');
                const state = await queue.json();
                if (!state.queue_running?.length && !state.queue_pending?.length) break;
                if (attempt === 119) throw new Error('ComfyUI did not finish or stop its render.');
                await this.sleep(500);
            }
            const free = await this.fetch(`${this.comfy}/free`, {
                method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ unload_models: true, free_memory: true }),
                signal: AbortSignal.timeout(3000),
            });
            if (!free.ok) throw new Error('ComfyUI could not unload its image model.');
            await this.sleep(2000);
        } catch (error) {
            if (error?.cause?.code !== 'ECONNREFUSED') {
                this.phase = 'image';
                throw error;
            }
        }
        this.resume();
        return true;
    }

    resume() {
        this.lease = null;
        this.leaseAt = 0;
        this.renewedAt = 0;
        this.phase = 'text';
        this.pending = null;
        const ready = this.waiting.splice(0);
        for (const { req, res } of ready) if (!res.destroyed && !req.aborted) this.relay(req, res);
    }

    async recover() {
        const renewed = this.renewedAt > 0;
        const elapsed = this.now() - (renewed ? this.renewedAt : this.leaseAt);
        if (this.phase !== 'image' || !this.lease || elapsed < (renewed ? 120_000 : 60_000)) return false;
        try {
            const response = await this.fetch(`${this.comfy}/queue`, { signal: AbortSignal.timeout(3000) });
            if (!response.ok) return false;
            const state = await response.json();
            if (state.queue_running?.length || state.queue_pending?.length) {
                return false;
            }
            return await this.release(this.lease);
        } catch (error) {
            if (error?.cause?.code !== 'ECONNREFUSED') return false;
            this.resume();
            return true;
        }
    }
}

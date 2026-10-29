import { createHash } from 'node:crypto';
import { sleepsLight } from './backend.mjs';

export const STREAM_USE_REVISION = 1;
const OOM_TEXT = /out of memory|OutOfMemoryError|ran out of memory/i;

export function lightStreamOptions(config) {
    const raw = config?.memberCache?.lightSleepStreamMarginMiB;
    if (raw === undefined || raw === null || raw === 0) return null;
    if (!Number.isInteger(raw) || raw < 256 || raw > 8192) throw new Error('memberCache.lightSleepStreamMarginMiB must be 0 (off) or a whole number from 256 to 8192.');
    if (!sleepsLight(config)) throw new Error('memberCache.lightSleepStreamMarginMiB needs memberCache.lightSleep.');
    const retry = config.memberCache.lightSleepStreamOomRetry;
    if (retry !== undefined && typeof retry !== 'boolean') throw new Error('memberCache.lightSleepStreamOomRetry must be true or false.');
    return { marginMiB: raw, oomRetry: retry !== false };
}

export function streamUseKey({ workflowKey, runtime, models }) {
    return `stream-use:v${STREAM_USE_REVISION}:${createHash('sha256').update(JSON.stringify({ workflowKey, runtime, models })).digest('hex')}`;
}

export function learnedUseMiB(entry) {
    return entry?.revision === STREAM_USE_REVISION && Number.isFinite(entry.useMiB) ? entry.useMiB : null;
}

export function noteStreamUse(old, { useMiB, lowGpuMiB, freeAtAdmissionMiB, oom = false }) {
    const sample = { useMiB: Math.max(0, Math.ceil(useMiB)), lowGpuMiB: Number.isFinite(lowGpuMiB) ? Math.round(lowGpuMiB) : null, freeAtAdmissionMiB: Math.round(freeAtAdmissionMiB), oom };
    const samples = [...(old?.revision === STREAM_USE_REVISION ? old.samples ?? [] : []), sample].slice(-3);
    return { revision: STREAM_USE_REVISION, kind: 'stream-use', useMiB: Math.max(...samples.map((row) => row.useMiB)), samples, runs: (old?.runs ?? 0) + 1 };
}

export function comfyOom(item) {
    if (item?.status?.status_str !== 'error') return null;
    const messages = Array.isArray(item.status.messages) ? item.status.messages : [];
    const error = messages.find((entry) => Array.isArray(entry) && entry[0] === 'execution_error')?.[1];
    const text = `${error?.exception_type ?? ''} ${error?.exception_message ?? ''}`;
    return OOM_TEXT.test(text) ? { type: error?.exception_type ?? null, node: error?.node_type ?? null, message: String(error?.exception_message ?? '').split('\n')[0].slice(0, 200) } : null;
}

export function queuedIds(queue) {
    const ids = (rows) => (Array.isArray(rows) ? rows : []).map((row) => (Array.isArray(row) ? row[1] : null)).filter((id) => typeof id === 'string');
    return { running: ids(queue?.queue_running), pending: ids(queue?.queue_pending) };
}

export function retryBody(item, id) {
    const prompt = Array.isArray(item?.prompt) ? item.prompt : null;
    const graph = prompt?.[2];
    if (!graph || typeof graph !== 'object') return null;
    const extra = prompt[3] && typeof prompt[3] === 'object' ? { ...prompt[3] } : {};
    delete extra.create_time;
    return { prompt: graph, prompt_id: id, front: true, ...(Object.keys(extra).length ? { extra_data: extra } : {}), ...(typeof extra.client_id === 'string' ? { client_id: extra.client_id } : {}) };
}

export class LightStreamStats {
    constructor() {
        this.leases = 0;
        this.oomRetries = 0;
        this.oomRetryFailed = 0;
        this.oomAfterRetry = 0;
        this.belowMargin = 0;
        this.lastLease = null;
        this.lastOom = null;
    }

    status(options) {
        return { enabled: Boolean(options), marginMiB: options?.marginMiB ?? null, oomRetry: options?.oomRetry ?? null, leases: this.leases, oomRetries: this.oomRetries,
            oomRetryFailed: this.oomRetryFailed, oomAfterRetry: this.oomAfterRetry, belowMargin: this.belowMargin, lastLease: this.lastLease, lastOom: this.lastOom };
    }
}

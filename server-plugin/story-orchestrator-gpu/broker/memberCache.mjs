import { createHash } from 'node:crypto';
import fsDefault from 'node:fs/promises';
import path from 'node:path';

export const MEMBER_CACHE_DEFAULTS = Object.freeze({ headChars: 2000, budgetMiB: 6144, minPromptChars: 16000, minCutChars: 8000, minTailChars: 1200,
    cutMarker: '<|turn>system\n', rewind: true, ramHeadroomMiB: 0, ctxCheckpoints: 3, store: 'file', park: true, erase: true, serverKeys: false });

export function memberCacheOptions(config = {}) {
    const raw = config.memberCache;
    if (!raw || raw.enabled !== true) return null;
    const merged = { ...MEMBER_CACHE_DEFAULTS, ...raw, dir: raw.dir ?? path.join(config.stateDir ?? '.', 'member-states') };
    if (!Number.isInteger(merged.budgetMiB) || merged.budgetMiB < 0 || merged.budgetMiB > 65536) throw new Error('memberCache.budgetMiB must be a whole number from 0 to 65536.');
    if (!Number.isInteger(merged.headChars) || merged.headChars < 200 || merged.headChars > 20000) throw new Error('memberCache.headChars must be a whole number from 200 to 20000.');
    if (!Number.isInteger(merged.ctxCheckpoints) || merged.ctxCheckpoints < 3 || merged.ctxCheckpoints > 32) throw new Error('memberCache.ctxCheckpoints must be a whole number from 3 to 32.');
    if (typeof merged.cutMarker !== 'string' || !merged.cutMarker) throw new Error('memberCache.cutMarker must be a non-empty string.');
    if (!['file', 'ram'].includes(merged.store)) throw new Error("memberCache.store must be 'file' or 'ram'.");
    if (merged.store === 'ram' && merged.budgetMiB < 1024) throw new Error('memberCache.budgetMiB must be at least 1024 with store ram (it sizes --cache-ram).');
    return merged;
}

export const memberKey = (prompt, headChars = MEMBER_CACHE_DEFAULTS.headChars) => createHash('sha1').update(prompt.slice(0, headChars)).digest('hex').slice(0, 16);

export function historyCut(prompt, marker = MEMBER_CACHE_DEFAULTS.cutMarker) {
    const first = prompt.indexOf(marker);
    if (first < 0) return null;
    const second = prompt.indexOf(marker, first + marker.length);
    return second > 0 ? second : null;
}

const median = (values) => { const sorted = values.filter(Number.isFinite).sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null; };
const MiB = 1048576;
const FILE = /^m-[0-9a-f]{16}\.bin$/;

export class MemberCache {
    constructor(options, { fetch: fetchImpl = fetch, baseUrl, fs = fsDefault, snapshot = null, reserves = () => ({}), now = () => Date.now() } = {}) {
        Object.assign(this, MEMBER_CACHE_DEFAULTS, options);
        this.fetch = fetchImpl;
        this.baseUrl = typeof baseUrl === 'function' ? baseUrl : () => baseUrl;
        this.fs = fs;
        this.snapshot = snapshot;
        this.reserves = typeof reserves === 'function' ? reserves : () => reserves;
        this.now = now;
        this.entries = new Map();
        this.owner = new Map();
        this.lastError = null;
        this.stats = { requests: 0, planned: 0, hits: 0, misses: 0, resident: 0, restoreFailures: 0, saves: 0, saveFailures: 0, skippedBusy: 0, skippedRam: 0, evictions: 0, evictedForImages: 0, parks: 0, erases: 0, eraseFailures: 0 };
        this.times = { restoreMs: [], prefillMs: [], rewindMs: [], saveMs: [], parkMs: [] };
    }

    async init() {
        await this.fs.mkdir(this.dir, { recursive: true });
        for (const name of await this.fs.readdir(this.dir)) if (FILE.test(name)) await this.fs.rm(path.join(this.dir, name), { force: true });
        this.entries.clear();
        this.owner.clear();
    }

    plan(body) {
        const prompt = body?.prompt;
        if (body?.stream !== true || typeof prompt !== 'string' || prompt.length < this.minPromptChars) return null;
        const cut = historyCut(prompt, this.cutMarker);
        if (cut === null || cut < this.minCutChars || prompt.length - cut < this.minTailChars) return null;
        return { key: memberKey(prompt, this.headChars), cut, prefix: prompt.slice(0, cut) };
    }

    noteOther(slot) { this.owner.set(slot, null); }

    syncBackend(pid) { if (pid !== this.pid) { this.owner.clear(); this.pid = pid; } }

    forget() { this.owner.clear(); }

    async post(route, payload, signal) {
        const began = performance.now();
        const response = await this.fetch(`${this.baseUrl()}${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal });
        const data = await response.json().catch(() => ({}));
        return { ok: response.ok, status: response.status, data, ms: Math.round(performance.now() - began) };
    }

    remember(list, value) { list.push(value); if (list.length > 50) list.shift(); }

    async before(body, slot = 0, signal = undefined) {
        this.stats.requests += 1;
        const plan = this.plan(body);
        if (!plan) { this.noteOther(slot); return null; }
        this.stats.planned += 1;
        const timing = { restoreMs: null, prefillMs: null, restored: false, resident: false };
        const ram = this.store === 'ram';
        if (this.owner.get(slot) === plan.key) { this.stats.resident += 1; timing.resident = true; }
        else if (ram) this.owner.set(slot, null);
        else {
            this.owner.set(slot, null);
            const entry = this.entries.get(plan.key);
            if (entry) {
                const restore = await this.post(`/slots/${slot}?action=restore`, { filename: entry.file }, signal);
                timing.restoreMs = restore.ms;
                if (restore.ok) { this.stats.hits += 1; entry.usedAt = this.now(); timing.restored = true; this.remember(this.times.restoreMs, restore.ms); }
                else { this.stats.restoreFailures += 1; this.lastError = `restore answered ${restore.status}`; await this.drop(plan.key); }
            } else this.stats.misses += 1;
        }
        const prefill = await this.post('/completion', { prompt: plan.prefix, n_predict: 0, cache_prompt: true, stream: false, id_slot: slot, ...(ram && this.serverKeys ? { cache_key: plan.key } : {}) }, signal);
        timing.prefillMs = prefill.ms;
        timing.prefillTokens = prefill.data?.timings?.prompt_n ?? null;
        if (!prefill.ok) { this.lastError = `prefill answered ${prefill.status}`; this.noteOther(slot); return null; }
        if (ram && !timing.resident) {
            const evaluated = Number(prefill.data?.tokens_evaluated);
            const cached = Number.isFinite(prefill.data?.timings?.cache_n) ? prefill.data.timings.cache_n : evaluated - (timing.prefillTokens ?? evaluated);
            timing.cachedTokens = Number.isFinite(cached) ? cached : null;
            if (Number.isFinite(cached) && Number.isFinite(evaluated) && evaluated > 0 && cached >= evaluated / 4) { this.stats.hits += 1; timing.restored = true; } else this.stats.misses += 1;
        }
        this.remember(this.times.prefillMs, prefill.ms);
        if (ram && this.serverKeys) {
            body.cache_key = plan.key;
            const prefixTokens = Number(prefill.data?.tokens_evaluated);
            if (Number.isInteger(prefixTokens) && prefixTokens > 0) body.cache_ckpt_max = prefixTokens;
        }
        this.owner.set(slot, plan.key);
        return { ...plan, slot, timing };
    }

    async afterOther(slot = 0, signal = AbortSignal.timeout(30000)) {
        this.owner.set(slot, null);
        if (this.store !== 'ram' || this.erase === false) return { erased: false };
        const erase = await this.post(`/slots/${slot}?action=erase`, {}, signal);
        if (erase.ok) this.stats.erases += 1; else { this.stats.eraseFailures += 1; this.lastError = `erase answered ${erase.status}`; }
        return { erased: erase.ok };
    }

    async parkInRam(plan, idle, signal) {
        if (!this.park) return { saved: false, reason: 'park-off' };
        if (!idle()) { this.stats.skippedBusy += 1; return { saved: false, reason: 'busy' }; }
        const park = await this.post('/completion', { prompt: '\n', n_predict: 0, cache_prompt: true, stream: false, id_slot: plan.slot }, signal);
        if (!park.ok) { this.lastError = `park answered ${park.status}`; return { saved: false, reason: 'park' }; }
        this.stats.parks += 1;
        this.remember(this.times.parkMs, park.ms);
        await this.afterOther(plan.slot, signal);
        return { saved: true, saveMs: park.ms, parked: true };
    }

    async afterReply(plan, { idle = () => true, signal = AbortSignal.timeout(120000) } = {}) {
        if (!plan || this.owner.get(plan.slot) !== plan.key) return { saved: false, reason: 'not-owner' };
        if (this.store === 'ram') return this.parkInRam(plan, idle, signal);
        if (this.budgetMiB === 0) return { saved: false, reason: 'budget' };
        if (!idle()) { this.stats.skippedBusy += 1; return { saved: false, reason: 'busy' }; }
        const estimate = this.estimateMiB();
        if (!(await this.roomFor(estimate))) { this.stats.skippedRam += 1; return { saved: false, reason: 'ram' }; }
        let rewindMs = null;
        if (this.rewind) {
            const rewind = await this.post('/completion', { prompt: plan.prefix, n_predict: 0, cache_prompt: true, stream: false, id_slot: plan.slot }, signal);
            if (!rewind.ok) { this.lastError = `rewind answered ${rewind.status}`; this.noteOther(plan.slot); return { saved: false, reason: 'rewind' }; }
            rewindMs = rewind.ms;
            this.remember(this.times.rewindMs, rewind.ms);
            if (!idle()) { this.stats.skippedBusy += 1; return { saved: false, reason: 'busy', rewindMs }; }
        }
        const file = `m-${plan.key}.bin`;
        const save = await this.post(`/slots/${plan.slot}?action=save`, { filename: file }, signal);
        if (!save.ok) { this.stats.saveFailures += 1; this.lastError = `save answered ${save.status}`; await this.drop(plan.key); return { saved: false, reason: 'save', rewindMs }; }
        let bytes = Number(save.data?.n_written);
        try { bytes = (await this.fs.stat(path.join(this.dir, file))).size; } catch {}
        this.stats.saves += 1;
        this.remember(this.times.saveMs, save.ms);
        this.entries.set(plan.key, { file, bytes: Number.isFinite(bytes) ? bytes : 0, savedAt: this.now(), usedAt: this.now(), cutChars: plan.cut });
        await this.trim(plan.key);
        return { saved: true, saveMs: save.ms, rewindMs, bytes };
    }

    estimateMiB() {
        const sizes = [...this.entries.values()].map((entry) => entry.bytes / MiB).filter((size) => size > 0);
        return sizes.length ? Math.max(...sizes) : 2048;
    }

    bytes() { let sum = 0; for (const entry of this.entries.values()) sum += entry.bytes; return sum; }

    async roomFor(estimateMiB) {
        if (!this.snapshot) return true;
        let available;
        try { available = (await this.snapshot())?.host?.availableMiB; } catch (error) { this.lastError = error.message; return false; }
        if (!Number.isFinite(available)) return false;
        const floor = (this.reserves().ramMiB ?? 0) + this.ramHeadroomMiB;
        while (available - estimateMiB < floor && this.entries.size) available += (await this.dropOldest()) / MiB;
        return available - estimateMiB >= floor;
    }

    async trim(keep) {
        const budget = this.budgetMiB * MiB;
        while (this.bytes() > budget && this.entries.size) {
            const oldest = [...this.entries.entries()].filter(([key]) => key !== keep).sort((a, b) => a[1].usedAt - b[1].usedAt)[0];
            await this.drop(oldest ? oldest[0] : keep);
            this.stats.evictions += 1;
        }
    }

    async dropOldest() {
        const oldest = [...this.entries.entries()].sort((a, b) => a[1].usedAt - b[1].usedAt)[0];
        if (!oldest) return 0;
        await this.drop(oldest[0]);
        this.stats.evictions += 1;
        return oldest[1].bytes;
    }

    async drop(key) {
        const entry = this.entries.get(key);
        this.entries.delete(key);
        if (entry) await this.fs.rm(path.join(this.dir, entry.file), { force: true }).catch((error) => { this.lastError = error.message; });
    }

    async makeRoom({ needRamMiB = 0, availableMiB = null } = {}) {
        if (this.store === 'ram' || !this.entries.size) return 0;
        const floor = needRamMiB + (this.reserves().ramMiB ?? 0);
        let available = Number.isFinite(availableMiB) ? availableMiB : -Infinity;
        let freed = 0;
        while (this.entries.size && available < floor) {
            const bytes = await this.dropOldest();
            freed += bytes;
            available += bytes / MiB;
            this.stats.evictedForImages += 1;
        }
        return freed;
    }

    status() {
        return { store: this.store, ...(this.store === 'ram' ? { nativeCacheMiB: this.budgetMiB, occupancy: 'held by llama-server, not reported', serverKeys: this.serverKeys, erase: this.erase } : {}), dir: this.dir, budgetMiB: this.budgetMiB, rewind: this.rewind, park: this.park, entries: this.entries.size, sizeMiB: Math.round(this.bytes() / MiB), ...this.stats, parkMsP50: median(this.times.parkMs),
            restoreMsP50: median(this.times.restoreMs), prefillMsP50: median(this.times.prefillMs), rewindMsP50: median(this.times.rewindMs), saveMsP50: median(this.times.saveMs),
            saveMsMax: this.times.saveMs.length ? Math.max(...this.times.saveMs) : null, lastError: this.lastError };
    }
}

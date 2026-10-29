export const PASS_FIELD = 'so_pass';
export const PREEMPTIBLE_PASSES = Object.freeze(['read']);
export const PREEMPT_MODES = Object.freeze(['full', 'limited']);

const whole = (value, min, max, name) => {
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`preemptReads.${name} must be a whole number from ${min} to ${max}.`);
    return value;
};

export function readPreemptionOptions(config = {}) {
    const raw = config.preemptReads;
    if (!raw || raw.enabled !== true) return null;
    const mode = raw.mode ?? 'full';
    if (!PREEMPT_MODES.includes(mode)) throw new Error(`preemptReads.mode must be one of ${PREEMPT_MODES.join(', ')}.`);
    if (mode === 'full') return { mode, maxPreempts: whole(raw.maxPreempts ?? 2, 1, 5, 'maxPreempts') };
    if (raw.maxPreempts !== undefined && raw.maxPreempts !== 1) throw new Error('preemptReads.maxPreempts is always 1 in limited mode.');
    return { mode, maxPreempts: 1, maxDecodedTokens: whole(raw.maxDecodedTokens ?? 32, 0, 4096, 'maxDecodedTokens'),
        maxRunMs: whole(raw.maxRunMs ?? 4000, 100, 600000, 'maxRunMs'), maxAgeBoundaries: whole(raw.maxAgeBoundaries ?? 1, 0, 8, 'maxAgeBoundaries'),
        probeTimeoutMs: whole(raw.probeTimeoutMs ?? 500, 50, 5000, 'probeTimeoutMs') };
}

export function takePass(body) {
    if (!body || typeof body !== 'object' || !(PASS_FIELD in body)) return null;
    const pass = body[PASS_FIELD];
    delete body[PASS_FIELD];
    return typeof pass === 'string' ? pass.slice(0, 40) : null;
}

export function decodedOf(slots, slot) {
    if (!Array.isArray(slots)) return null;
    const row = Number.isInteger(slot) ? slots.find((entry) => entry?.id === slot) : slots.filter((entry) => entry?.is_processing === true).length === 1 ? slots.find((entry) => entry?.is_processing === true) : null;
    const next = Array.isArray(row?.next_token) ? row.next_token[0] : row?.next_token;
    return Number.isInteger(next?.n_decoded) && next.n_decoded >= 0 ? next.n_decoded : null;
}

const percentile = (values, share) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] : null;
};

export class ReadPreemption {
    constructor(options, { scheduler = null, log = () => {}, now = () => Date.now(), probe = null } = {}) {
        this.options = options;
        this.mode = options.mode ?? 'full';
        this.maxPreempts = options.maxPreempts;
        this.scheduler = scheduler;
        this.log = log;
        this.now = now;
        this.probe = probe;
        this.running = null;
        this.chatsDone = 0;
        this.unsubscribe = scheduler?.onArrival ? scheduler.onArrival((lane) => this.arrived(lane)) : () => {};
        this.stats = { reads: 0, preempted: 0, requeued: 0, completed: 0, completedAfterPreempt: 0, cancelled: 0, failed: 0, retriesMax: 0 };
        this.skipped = { preempted: 0, age: 0, decoded: 0, runMs: 0, probeMissed: 0 };
        this.wastedMs = [];
        this.last = null;
        this.lastSkip = null;
    }

    preemptible(pass) { return PREEMPTIBLE_PASSES.includes(pass); }

    issue(arrivedAt) { this.stats.reads += 1; return { preempts: 0, wastedMs: 0, issuedAt: arrivedAt, issuedChats: this.chatsDone }; }

    chatDone() { this.chatsDone += 1; }

    begin(read, slot = null) {
        if (read.preempts >= this.maxPreempts) return null;
        const attempt = { read, slot, controller: new AbortController(), startedAt: this.now(), settled: false, preempted: false, checking: false };
        this.running = attempt;
        return attempt;
    }

    settle(attempt) {
        if (!attempt) return;
        attempt.settled = true;
        if (this.running === attempt) this.running = null;
    }

    chatWaits() { return !this.scheduler?.concurrentLanes?.() && this.scheduler?.chatNext?.() !== false; }

    arrived(lane) {
        const attempt = this.running;
        if (lane !== 'chat' || !attempt || attempt.settled || attempt.preempted || attempt.checking) return;
        if (!this.chatWaits()) return;
        if (this.mode === 'full') { this.preempt(attempt, null); return; }
        void this.checkLimited(attempt);
    }

    skip(reason, attempt, detail = {}) {
        this.skipped[reason] += 1;
        this.lastSkip = { at: new Date(this.now()).toISOString(), reason, preempts: attempt.read.preempts, ageBoundaries: this.chatsDone - attempt.read.issuedChats, runMs: Math.round(this.now() - attempt.startedAt), ...detail };
        return false;
    }

    async checkLimited(attempt) {
        const { read } = attempt;
        if (read.preempts >= 1) return this.skip('preempted', attempt);
        if (this.chatsDone - read.issuedChats > this.options.maxAgeBoundaries) return this.skip('age', attempt);
        if (this.now() - attempt.startedAt > this.options.maxRunMs) return this.skip('runMs', attempt);
        attempt.checking = true;
        let decoded = null;
        try { decoded = this.probe ? await this.probe(attempt, this.options.probeTimeoutMs) : null; }
        catch { decoded = null; }
        finally { attempt.checking = false; }
        if (attempt.settled || attempt.preempted || this.running !== attempt || !this.chatWaits()) return false;
        if (decoded === null) this.skipped.probeMissed += 1;
        if (decoded !== null && decoded > this.options.maxDecodedTokens) return this.skip('decoded', attempt, { decoded });
        if (this.now() - attempt.startedAt > this.options.maxRunMs) return this.skip('runMs', attempt, { decoded });
        this.preempt(attempt, decoded);
        return true;
    }

    preempt(attempt, decoded) {
        attempt.preempted = true;
        const wasted = this.now() - attempt.startedAt;
        attempt.read.preempts += 1;
        attempt.read.wastedMs += wasted;
        attempt.read.decodedAtPreempt = decoded;
        this.stats.preempted += 1;
        this.wastedMs.push(wasted);
        if (this.wastedMs.length > 200) this.wastedMs.shift();
        this.settle(attempt);
        attempt.controller.abort(new Error('A chat request preempted this story read.'));
    }

    requeued(read) {
        this.stats.requeued += 1;
        const decoded = Number.isInteger(read.decodedAtPreempt) ? `, ${read.decodedAtPreempt} tokens decoded` : '';
        this.log(`read preempted by chat: requeued after it (preempt ${read.preempts} of at most ${this.maxPreempts}, ${Math.round(this.now() - read.issuedAt)} ms since issue${decoded})`);
    }

    finished(read, outcome) {
        if (outcome === 'completed') {
            this.stats.completed += 1;
            if (read.preempts) this.stats.completedAfterPreempt += 1;
        } else this.stats[outcome] += 1;
        this.stats.retriesMax = Math.max(this.stats.retriesMax, read.preempts);
        this.last = { at: new Date(this.now()).toISOString(), outcome, preempts: read.preempts, wastedMs: Math.round(read.wastedMs), totalMs: Math.round(this.now() - read.issuedAt), ageBoundaries: this.chatsDone - read.issuedChats };
        if (read.preempts) this.log(`read ${outcome} after ${read.preempts} preempt(s): ${this.last.totalMs} ms since issue, ${this.last.wastedMs} ms of discarded work`);
    }

    status() {
        const limits = this.mode === 'limited' ? { maxDecodedTokens: this.options.maxDecodedTokens, maxRunMs: this.options.maxRunMs, maxAgeBoundaries: this.options.maxAgeBoundaries, skipped: { ...this.skipped }, lastSkip: this.lastSkip } : {};
        return { enabled: true, mode: this.mode, maxPreempts: this.maxPreempts, ...limits, ...this.stats, chatsDone: this.chatsDone, wastedMsP50: percentile(this.wastedMs, 0.5), wastedMsP95: percentile(this.wastedMs, 0.95),
            wastedMsTotal: Math.round(this.wastedMs.reduce((sum, value) => sum + value, 0)), running: Boolean(this.running), last: this.last };
    }

    close() { this.unsubscribe(); }
}

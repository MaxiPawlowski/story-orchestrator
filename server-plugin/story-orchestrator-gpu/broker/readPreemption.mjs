export const PASS_FIELD = 'so_pass';
export const PREEMPTIBLE_PASSES = Object.freeze(['read']);

export function readPreemptionOptions(config = {}) {
    const raw = config.preemptReads;
    if (!raw || raw.enabled !== true) return null;
    const maxPreempts = raw.maxPreempts ?? 2;
    if (!Number.isInteger(maxPreempts) || maxPreempts < 1 || maxPreempts > 5) throw new Error('preemptReads.maxPreempts must be a whole number from 1 to 5.');
    return { maxPreempts };
}

export function takePass(body) {
    if (!body || typeof body !== 'object' || !(PASS_FIELD in body)) return null;
    const pass = body[PASS_FIELD];
    delete body[PASS_FIELD];
    return typeof pass === 'string' ? pass.slice(0, 40) : null;
}

const percentile = (values, share) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] : null;
};

export class ReadPreemption {
    constructor(options, { scheduler = null, log = () => {}, now = () => Date.now() } = {}) {
        this.maxPreempts = options.maxPreempts;
        this.scheduler = scheduler;
        this.log = log;
        this.now = now;
        this.running = null;
        this.unsubscribe = scheduler?.onArrival ? scheduler.onArrival((lane) => this.arrived(lane)) : () => {};
        this.stats = { reads: 0, preempted: 0, requeued: 0, completed: 0, completedAfterPreempt: 0, cancelled: 0, failed: 0, retriesMax: 0 };
        this.wastedMs = [];
        this.last = null;
    }

    preemptible(pass) { return PREEMPTIBLE_PASSES.includes(pass); }

    begin(read) {
        if (read.preempts >= this.maxPreempts) return null;
        const attempt = { read, controller: new AbortController(), startedAt: this.now(), settled: false, preempted: false };
        this.running = attempt;
        return attempt;
    }

    settle(attempt) {
        if (!attempt) return;
        attempt.settled = true;
        if (this.running === attempt) this.running = null;
    }

    arrived(lane) {
        const attempt = this.running;
        if (lane !== 'chat' || !attempt || attempt.settled || attempt.preempted) return;
        if (this.scheduler?.concurrentLanes?.() || this.scheduler?.chatNext?.() === false) return;
        attempt.preempted = true;
        const wasted = this.now() - attempt.startedAt;
        attempt.read.preempts += 1;
        attempt.read.wastedMs += wasted;
        this.stats.preempted += 1;
        this.wastedMs.push(wasted);
        if (this.wastedMs.length > 200) this.wastedMs.shift();
        this.settle(attempt);
        attempt.controller.abort(new Error('A chat request preempted this story read.'));
    }

    requeued(read) {
        this.stats.requeued += 1;
        this.log(`read preempted by chat: requeued after it (preempt ${read.preempts} of at most ${this.maxPreempts}, ${Math.round(this.now() - read.issuedAt)} ms since issue)`);
    }

    finished(read, outcome) {
        if (outcome === 'completed') {
            this.stats.completed += 1;
            if (read.preempts) this.stats.completedAfterPreempt += 1;
        } else this.stats[outcome] += 1;
        this.stats.retriesMax = Math.max(this.stats.retriesMax, read.preempts);
        this.last = { at: new Date(this.now()).toISOString(), outcome, preempts: read.preempts, wastedMs: Math.round(read.wastedMs), totalMs: Math.round(this.now() - read.issuedAt) };
        if (read.preempts) this.log(`read ${outcome} after ${read.preempts} preempt(s): ${this.last.totalMs} ms since issue, ${this.last.wastedMs} ms of discarded work`);
    }

    status() {
        return { enabled: true, maxPreempts: this.maxPreempts, ...this.stats, wastedMsP50: percentile(this.wastedMs, 0.5), wastedMsP95: percentile(this.wastedMs, 0.95),
            wastedMsTotal: Math.round(this.wastedMs.reduce((sum, value) => sum + value, 0)), running: Boolean(this.running), last: this.last };
    }

    close() { this.unsubscribe(); }
}

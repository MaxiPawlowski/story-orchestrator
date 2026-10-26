export const SPILL_DEFAULTS = Object.freeze({ thresholdMiB: 512, sustainMs: 3000, stepMiB: 512, maxBackoffMiB: 2048 });

export function spillGuardOptions(config) {
    const raw = config?.spillGuard;
    if (raw?.enabled === false) return null;
    const options = { ...SPILL_DEFAULTS, ...(raw ?? {}) };
    for (const key of Object.keys(SPILL_DEFAULTS)) if (!Number.isInteger(options[key]) || options[key] < 0) throw new Error(`spillGuard.${key} must be a whole number >= 0.`);
    return options;
}

export class SpillGuard {
    constructor(options = SPILL_DEFAULTS) {
        Object.assign(this, options);
        this.tracked = new Map();
    }

    observe(sample, roles, now = Date.now()) {
        const readings = sample?.gpuProcesses;
        if (!readings) return null;
        const live = new Set();
        for (const [role, pid] of Object.entries(roles)) {
            if (!pid) continue;
            live.add(pid);
            const reading = readings[pid] ?? readings[String(pid)];
            if (!Number.isFinite(reading?.sharedMiB)) continue;
            let row = this.tracked.get(pid);
            if (!row || row.role !== role) { row = { role, baseMiB: reading.sharedMiB, overSince: null, fired: false }; this.tracked.set(pid, row); }
            row.baseMiB = Math.min(row.baseMiB, reading.sharedMiB);
            const deltaMiB = reading.sharedMiB - row.baseMiB;
            if (deltaMiB < this.thresholdMiB) { row.overSince = null; row.fired = false; continue; }
            row.overSince ??= now;
            if (row.fired || now - row.overSince < this.sustainMs) continue;
            row.fired = true;
            return { role, pid, deltaMiB: Math.round(deltaMiB), baseMiB: Math.round(row.baseMiB), sharedMiB: Math.round(reading.sharedMiB) };
        }
        for (const pid of [...this.tracked.keys()]) if (!live.has(pid)) this.tracked.delete(pid);
        return null;
    }

    nextStep(appliedMiB, deltaMiB) {
        const step = Math.max(this.stepMiB, Math.ceil(deltaMiB / 256) * 256);
        return Math.max(0, Math.min(step, this.maxBackoffMiB - appliedMiB));
    }
}

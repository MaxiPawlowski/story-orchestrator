import { median, percentile } from './poseS0.mts';

export function requireUncachedRepeat(run: string, stats: { system?: { argv?: unknown } }): void {
    if (run === 'r1') return;
    if (!Array.isArray(stats.system?.argv) || !stats.system.argv.includes('--cache-none')) {
        throw new Error('Identical-configuration repeats require a dedicated ComfyUI server started with --cache-none. Run labels never perturb generation inputs.');
    }
}

export function renderLatency(rows: Array<{ seconds?: unknown; shared?: unknown; kind?: unknown; task?: unknown; view?: unknown }>) {
    const groups = new Map<string, number[]>();
    let shared = 0, untimed = 0;
    for (const row of rows) {
        if (row.shared === true) { shared += 1; continue; }
        if (typeof row.seconds !== 'number' || !Number.isFinite(row.seconds) || row.seconds <= 0) { untimed += 1; continue; }
        const key = row.kind === 'task' ? `task:${String(row.task).replace(/_(neutral|happy|angry|worried|blink|talk)$/, '')}` : row.kind === 'pack' ? `pack:${row.view}` : String(row.kind);
        groups.set(key, [...(groups.get(key) ?? []), row.seconds]);
    }
    return { shared, untimed, timed: [...groups.values()].reduce((sum, values) => sum + values.length, 0),
        latency: Object.fromEntries([...groups].map(([key, values]) => [key, { n: values.length, median: Number(median(values).toFixed(1)), p90: Number(percentile(values, 0.9).toFixed(1)) }])) };
}

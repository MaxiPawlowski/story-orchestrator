export function admission(snapshot, requirements, reserves) {
    const gpu = snapshot.gpus.find((row) => row.uuid === requirements.gpuUuid) ?? snapshot.gpus[0];
    const needs = [requirements.gpuMiB, requirements.ramMiB, reserves.gpuMiB, reserves.ramMiB];
    const readings = [gpu?.freeMiB, snapshot.host?.availableMiB, snapshot.host?.commitFreeMiB];
    if (!gpu || [...needs, ...readings].some((value) => !Number.isFinite(value) || value < 0)) return { allowed: false, reason: 'Memory requirements or telemetry are unavailable.' };
    if (gpu.freeMiB < requirements.gpuMiB + reserves.gpuMiB) return { allowed: false, reason: 'Insufficient GPU headroom.', gpu };
    if (snapshot.host.availableMiB < requirements.ramMiB + reserves.ramMiB) return { allowed: false, reason: 'Insufficient physical RAM headroom.', gpu };
    if (snapshot.host.commitFreeMiB < requirements.ramMiB + reserves.ramMiB) return { allowed: false, reason: 'Insufficient commit headroom.', gpu };
    return { allowed: true, gpu };
}

export function withinReserve(snapshot, reserves) {
    return admission(snapshot, { gpuMiB: 0, ramMiB: 0 }, reserves).allowed;
}

export function textLatencyDecision({ budget, timings, profile, fitTarget }) {
    const full = timings?.[`${profile}:full`];
    const reduced = timings?.[`${profile}:${fitTarget}`];
    if (!Number.isFinite(budget) || budget <= 0 || !full || !reduced) return { restore: false, reason: 'Unmeasured text cost; preserve residency.' };
    if (![full.loadMs, full.tokensPerSecond, reduced.tokensPerSecond].every((value) => Number.isFinite(value) && value > 0)) return { restore: false, reason: 'Unmeasured text cost; preserve residency.' };
    const retainedMs = (reduced.promptMs ?? 0) + 1000 * budget / reduced.tokensPerSecond;
    const restoredMs = full.loadMs + (full.promptMs ?? 0) + 1000 * budget / full.tokensPerSecond;
    return { restore: restoredMs < retainedMs, retainedMs, restoredMs, reason: restoredMs < retainedMs ? 'Full residency has the lower measured reply cost.' : 'Retained residency has the lower measured reply cost.' };
}

export function stableSamples(samples) {
    if (!Array.isArray(samples) || samples.length < 2) return false;
    const within = (values) => Math.max(...values) - Math.min(...values) <= Math.ceil(Math.max(...values) * 0.15) + 512;
    return within(samples.map((row) => row.gpuMiB)) && within(samples.map((row) => row.ramMiB));
}

export function renderSignature(graph, identities = {}) {
    const nodes = Object.entries(graph).sort(([a], [b]) => a.localeCompare(b)).map(([id, node]) => ({ id, class_type: node.class_type, inputs: Object.fromEntries(Object.entries(node.inputs ?? {}).filter(([key]) => !['text', 'prompt', 'negative_prompt', 'seed', 'noise_seed', 'filename_prefix', 'image', 'instruction'].includes(key)).sort(([a], [b]) => a.localeCompare(b))) }));
    return JSON.stringify({ nodes, identities });
}

export function chooseResidency({ snapshot, footprint, reserves, textResident, profile }) {
    if (!footprint?.verified) return { action: 'swap', reason: 'Unmeasured workflow: serialize and reclaim text before rendering.' };
    const fit = admission(snapshot, { gpuMiB: footprint.additionalGpuMiB, ramMiB: footprint.additionalRamMiB }, reserves);
    if (fit.allowed) return { action: 'retain', reason: 'Measured render fits the current free GPU and physical RAM.' };
    if (textResident && profile?.sharingVerified) return { action: 'share-profile', reason: fit.reason };
    return { action: 'swap', reason: fit.reason };
}

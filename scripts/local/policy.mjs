export function admission(snapshot, requirements, reserves) {
    const gpu = snapshot.gpus.find((row) => row.uuid === requirements.gpuUuid) ?? snapshot.gpus[0];
    const needs = [requirements.gpuMiB, requirements.ramMiB, reserves.gpuMiB, reserves.ramMiB];
    if (!gpu || needs.some((value) => !Number.isFinite(value) || value < 0)) return { allowed: false, reason: 'Memory requirements or telemetry are unavailable.' };
    if (gpu.freeMiB < requirements.gpuMiB + reserves.gpuMiB) return { allowed: false, reason: 'Insufficient GPU headroom.', gpu };
    if (snapshot.host.availableMiB < requirements.ramMiB + reserves.ramMiB) return { allowed: false, reason: 'Insufficient physical RAM headroom.', gpu };
    if (snapshot.host.commitFreeMiB < requirements.ramMiB + reserves.ramMiB) return { allowed: false, reason: 'Insufficient commit headroom.', gpu };
    return { allowed: true, gpu };
}

export function withinReserve(snapshot, reserves) {
    return snapshot.host.availableMiB >= reserves.ramMiB && snapshot.gpus[0].freeMiB >= reserves.gpuMiB;
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

import { createHash } from 'node:crypto';
import { stableSamples } from './policy.mjs';

export const FOOTPRINT_REVISION = 3;

export function footprintKey({ workflowKey, runtime, models, cacheState = 'unknown', text = null }) {
    return `v${FOOTPRINT_REVISION}:${createHash('sha256').update(JSON.stringify({ workflowKey, runtime, models, cacheState, text })).digest('hex')}`;
}

export function observedFootprint(lease, old, reserves) {
    const observation = {
        gpuMiB: Math.ceil(Math.max(0, lease.peakGpu - lease.before.gpus[0].usedMiB) + 512),
        ramMiB: Math.ceil(Math.max(0, lease.before.host.availableMiB - lease.lowRam) * 1.2 + 512),
        lowRamMiB: lease.lowRam, lowGpuMiB: lease.lowGpu, lowCommitMiB: lease.lowCommit,
        sufficient: lease.highCadence === true && lease.lowRam >= reserves.ramMiB && lease.lowGpu >= reserves.gpuMiB && lease.lowCommit >= reserves.ramMiB,
    };
    const samples = [...(old?.revision === FOOTPRINT_REVISION ? old.samples ?? [] : []), observation].slice(-3);
    return { revision: FOOTPRINT_REVISION, identity: lease.identity, gpuMiB: Math.max(...samples.map((row) => row.gpuMiB)),
        ramMiB: Math.max(...samples.map((row) => row.ramMiB)), samples, runs: (old?.runs ?? 0) + 1,
        verified: samples.every((row) => row.sufficient) && stableSamples(samples) };
}

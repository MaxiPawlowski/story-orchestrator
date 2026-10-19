import { withinReserve } from './policy.mjs';
import { observedFootprint } from './footprints.mjs';

export const IMAGE_IDLE_GRACE_MS = 60000;

const identityKey = ({ workflowKey, runtime, models, text }) => JSON.stringify({ workflowKey, runtime, models, text });
const difference = (high, low) => Number.isFinite(high) && Number.isFinite(low) ? Math.max(0, high - low) : 0;

export function imageResidency(lease, snapshot, reserves) {
    const observed = observedFootprint(lease, null, reserves);
    const measured = lease.seenJob && observed.samples[0].sufficient;
    return { key: identityKey(lease.identity), baseline: lease.before, snapshot,
        gpuMiB: measured ? Math.max(lease.needGpuMiB, observed.gpuMiB) : null,
        ramMiB: measured ? Math.max(lease.needRamMiB, observed.ramMiB) : null };
}

export function residentCredit(resident, identity, snapshot, reserves) {
    if (!resident || !identity.workflowKey || resident.key !== identityKey(identity) || !withinReserve(snapshot, reserves)) return null;
    const before = resident.baseline, after = resident.snapshot;
    return {
        gpuMiB: Math.min(difference(after.gpus[0].usedMiB, before.gpus[0].usedMiB), difference(snapshot.gpus[0].usedMiB, before.gpus[0].usedMiB)),
        ramMiB: Math.min(difference(before.host.availableMiB, after.host.availableMiB), difference(before.host.availableMiB, snapshot.host.availableMiB)),
        commitMiB: Math.min(difference(before.host.commitFreeMiB, after.host.commitFreeMiB), difference(before.host.commitFreeMiB, snapshot.host.commitFreeMiB)),
    };
}

export function creditedSnapshot(snapshot, credit) {
    if (!credit) return snapshot;
    return { ...snapshot, gpus: snapshot.gpus.map((gpu, index) => index ? gpu : { ...gpu, usedMiB: gpu.usedMiB - credit.gpuMiB, freeMiB: gpu.freeMiB + credit.gpuMiB }),
        host: { ...snapshot.host, availableMiB: snapshot.host.availableMiB + Math.min(credit.ramMiB, credit.commitMiB), commitFreeMiB: snapshot.host.commitFreeMiB + Math.min(credit.ramMiB, credit.commitMiB) } };
}

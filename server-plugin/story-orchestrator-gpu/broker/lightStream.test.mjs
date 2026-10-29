import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ResidencyScheduler } from './scheduler.mjs';
import { comfyOom, lightStreamOptions, noteStreamUse, retryBody, streamUseKey } from './lightStream.mjs';
import { testTempDir } from '../../../scripts/lib/testTemp.mjs';

const TOTAL = 24576;
const reading = (freeMiB, extra = {}) => ({ highCadence: true, at: Date.now(), gpus: [{ usedMiB: TOTAL - freeMiB, freeMiB }], host: { availableMiB: 24000, commitFreeMiB: 80000 }, ...extra });
const sdxl = { workflowKey: 'scene', modelFiles: [{ kind: 'checkpoints', name: 'sdxl.safetensors' }], width: 1344, height: 768 };
const OOM_ITEM = (id, at, graph = { 3: { class_type: 'KSampler', inputs: {} } }) => ({
    prompt: [7, id, graph, { client_id: 'page', create_time: 1 }, ['9']],
    status: { status_str: 'error', completed: false, messages: [['execution_start', { prompt_id: id, timestamp: at }],
        ['execution_error', { prompt_id: id, node_type: 'VAEDecode', exception_type: 'torch.OutOfMemoryError', exception_message: 'CUDA out of memory. Tried to allocate 1.50 GiB\nThis error means you ran out of memory on your GPU.' }]] },
    outputs: {},
});

async function checkpoint() {
    const dir = await testTempDir('so-light-stream-');
    const header = Buffer.from(JSON.stringify({ w: { dtype: 'F16', shape: [1], data_offsets: [0, 6600 * 1048576] } }));
    const prefix = Buffer.alloc(8); prefix.writeBigUInt64LE(BigInt(header.length));
    await fs.writeFile(path.join(dir, 'sdxl.safetensors'), Buffer.concat([prefix, header]));
    return { checkpoints: [dir] };
}

async function rig({ marginMiB = 768, awakeMiB = 1979, lightMiB = 4773, oomRetry, history = () => ({}) } = {}) {
    const calls = [];
    const memberCache = { enabled: true, store: 'ram', budgetMiB: 4096, serverKeys: true, keepAcrossImages: true, lightSleep: true, lightSleepFreesMiB: 2800,
        ...(marginMiB ? { lightSleepStreamMarginMiB: marginMiB } : {}), ...(oomRetry === undefined ? {} : { lightSleepStreamOomRetry: oomRetry }) };
    const config = { maxQueue: 2, queueTimeoutMs: 1000, reserves: { gpuMiB: 1024, ramMiB: 2048 }, shedCeilingMiB: 0, defaultImageMiB: 12000, residencyObjective: 'switch', idleRestoreMs: 0,
        imageCacheMode: 'evict', modelDirs: await checkpoint(), streamImages: { enabled: true, minFreeGpuMiB: 2400, maxWeightMiB: 8192 }, memberCache };
    const backend = { profile: 'fast', desiredProfile: 'fast', fitTarget: null, sleeping: null };
    backend.status = () => ({ pid: backend.profile ? 42 : null, profile: backend.profile, desiredProfile: backend.desiredProfile, fitTargetMiB: backend.fitTarget, sleeping: backend.sleeping });
    backend.unload = async (options = {}) => { calls.push(options.light ? 'sleep-light' : 'unload'); backend.sleeping = options.light ? { profile: backend.profile, light: true } : null; backend.profile = null; };
    backend.dropSleeping = async () => { calls.push('drop'); backend.sleeping = null; return 4096; };
    backend.load = async (name) => { calls.push('load'); backend.profile = name; };
    const state = { render: null, footprints: {} };
    const freeNow = () => state.render ?? (backend.sleeping?.light ? lightMiB : backend.profile ? awakeMiB : 22000);
    const comfy = {
        recent: async () => history(),
        deleteHistory: async (id) => { calls.push(`delete-history ${id}`); },
        submit: async (body) => { calls.push('submit'); state.submitted = body; return { prompt_id: body.prompt_id }; },
    };
    const scheduler = new ResidencyScheduler({ config, backend, runtime: async () => ({ id: 'r', streaming: true }), snapshot: async () => reading(freeNow()),
        queue: async () => ({ queue_running: state.running ? [[1, state.running]] : [], queue_pending: [] }), freeImages: async () => { calls.push('free'); },
        startComfy: async () => {}, saveFootprints: async (data) => { state.saved = JSON.parse(JSON.stringify(data)); }, footprints: state.footprints, comfy });
    return { scheduler, calls, backend, state, config };
}

test('margin off (the default): an SDXL image too big to fit whole beside the light sleeper swaps text, as on the a2 base', async () => {
    const { scheduler, calls } = await rig({ marginMiB: 0 });
    const lease = await scheduler.reserve(sdxl);
    assert.equal(lease.decision, 'swap-text');
    assert.deepEqual(calls, ['unload', 'free']);
    assert.equal(scheduler.lease.lightStream, undefined);
    assert.equal(scheduler.status().lightStream.enabled, false);
});

test('margin on, unlearned kind: the stream floor plus the margin fits after a light sleep, so the image streams beside the kept weights and /status says why', async () => {
    const { scheduler, calls } = await rig({ marginMiB: 768 });
    const lease = await scheduler.reserve(sdxl);
    assert.equal(lease.decision, 'sleep-context');
    assert.deepEqual(calls, ['sleep-light']);
    const row = scheduler.status().lastResidency;
    assert.equal(row.lightSleep.fits, false);
    assert.deepEqual({ ...row.lightSleep.stream, needRamMiB: undefined }, { stage: 'measured', needMiB: 2400, floorMiB: 2400, learnedMiB: null, marginMiB: 768, needRamMiB: undefined,
        freeMiB: 4773, predictedMinMiB: 4773 - 2400, fits: true, useKey: undefined });
    assert.match(row.reason, /the image streams beside them: 4773 MiB free covers stream need 2400 \+ margin 768 MiB/);
    assert.doesNotMatch(row.reason, /Light sleep skipped/);
    assert.equal(scheduler.lease.lightStream.marginMiB, 768);
    assert.equal(scheduler.status().lightStream.leases, 1);
});

test('the stream use learned on release raises the next need: 4,236 MiB used leaves 537 MiB, under the 768 margin, so the next image swaps', async () => {
    const { scheduler, calls, state, backend } = await rig({ marginMiB: 768 });
    const first = await scheduler.reserve(sdxl);
    state.running = 'job-1';
    state.render = 4773 - 4236;
    await scheduler.sampleLease();
    state.running = null; state.render = null;
    await scheduler.release(first.lease);
    const entry = Object.entries(state.saved).find(([key]) => key.startsWith('stream-use:'))[1];
    assert.equal(entry.useMiB, 4236);
    assert.equal(entry.samples[0].lowGpuMiB, 537);
    const status = scheduler.status().lightStream;
    assert.equal(status.belowMargin, 1);
    assert.deepEqual({ ...status.lastLease, at: undefined }, { at: undefined, kind: 'checkpoint:sdxl 1344x768', needMiB: 2400, learnedMiB: null, marginMiB: 768, freeAtAdmissionMiB: 4773, useMiB: 4236, lowGpuMiB: 537, retried: false });
    calls.length = 0;
    backend.sleeping = null; backend.profile = 'fast';
    const second = await scheduler.reserve(sdxl);
    assert.equal(second.decision, 'swap-text');
    assert.equal(calls.includes('sleep-light'), false);
    const row = scheduler.status().lastResidency;
    assert.equal(row.lightSleep.stream.learnedMiB, 4236);
    assert.equal(row.lightSleep.stream.fits, false);
    assert.match(row.reason, /Streaming beside a light sleeper skipped: about 4779 MiB free after it, short of stream need 4236 \+ margin 768 MiB/);
});

test('a measured reading after the light sleep that misses the margin drops the sleeper and swaps', async () => {
    const { scheduler, calls } = await rig({ marginMiB: 768, lightMiB: 3000 });
    const lease = await scheduler.reserve(sdxl);
    assert.equal(lease.decision, 'swap-text');
    assert.deepEqual(calls, ['sleep-light', 'drop', 'free']);
    assert.match(scheduler.status().lastResidency.reason, /A light sleep left 3000 MiB free, short of stream need 2400 \+ margin 768 MiB; text was stopped/);
});

test('ComfyUI running out of memory beside the sleeper: the sleeper is stopped and the identical job is resubmitted once under its own id, ahead of the queue', async () => {
    let history = {};
    const { scheduler, calls, state } = await rig({ marginMiB: 768, history: () => history });
    const lease = await scheduler.reserve(sdxl);
    history = { old: OOM_ITEM('old', scheduler.lease.at - 60000), 'job-1': OOM_ITEM('job-1', scheduler.lease.at + 5) };
    await scheduler.sampleLease();
    assert.deepEqual(calls, ['sleep-light', 'drop', 'delete-history job-1', 'submit']);
    assert.deepEqual(state.submitted, { prompt: { 3: { class_type: 'KSampler', inputs: {} } }, prompt_id: 'job-1', front: true, extra_data: { client_id: 'page' }, client_id: 'page' });
    assert.equal(scheduler.lease.decision, 'swap-text');
    assert.equal(scheduler.lease.textHeldMiB, 0);
    const status = scheduler.status();
    assert.equal(status.lightStream.oomRetries, 1);
    assert.equal(status.lightStream.lastOom.retried, true);
    assert.equal(status.lightStream.lastOom.type, 'torch.OutOfMemoryError');
    assert.equal(status.lastResidency.decision, 'swap-text');
    assert.match(status.lastResidency.reason, /retried once as a full swap/);
    history = { 'job-1': OOM_ITEM('job-1', scheduler.lease.at + 9000), 'job-2': OOM_ITEM('job-2', scheduler.lease.at + 9000) };
    await scheduler.sampleLease();
    assert.equal(calls.filter((call) => call === 'submit').length, 1);
    assert.equal(scheduler.status().lightStream.oomAfterRetry, 1);
    await scheduler.release(lease.lease);
    const entry = Object.entries(state.saved).find(([key]) => key.startsWith('stream-use:'))[1];
    assert.equal(entry.samples[0].oom, true);
    assert.equal(entry.useMiB, 4773);
});

test('with lightSleepStreamOomRetry false an out-of-memory job is reported, not retried', async () => {
    let history = {};
    const { scheduler, calls } = await rig({ marginMiB: 768, oomRetry: false, history: () => history });
    await scheduler.reserve(sdxl);
    history = { 'job-1': OOM_ITEM('job-1', scheduler.lease.at + 5) };
    await scheduler.sampleLease();
    assert.deepEqual(calls, ['sleep-light']);
    assert.equal(scheduler.status().lightStream.lastOom.reason, 'retry-off');
    assert.equal(scheduler.status().lightStream.oomRetries, 0);
});

test('a successful job beside the sleeper is not retried and an OOM in a whole sleep-context lease is not watched', async () => {
    let history = {};
    const ok = await rig({ marginMiB: 768, history: () => history });
    await ok.scheduler.reserve(sdxl);
    history = { 'job-1': { prompt: [1, 'job-1', {}, {}, []], status: { status_str: 'success', completed: true, messages: [['execution_start', { timestamp: ok.scheduler.lease.at + 1 }]] }, outputs: {} } };
    await ok.scheduler.sampleLease();
    assert.deepEqual(ok.calls, ['sleep-light']);
    const whole = await rig({ marginMiB: 768, history: () => ({ 'job-1': OOM_ITEM('job-1', Date.now() + 10) }) });
    const lease = await whole.scheduler.reserve({ workflowKey: 'scene', needGpuMiB: 2816 });
    assert.equal(lease.decision, 'sleep-context');
    assert.equal(whole.scheduler.lease.lightStream, undefined);
    await whole.scheduler.sampleLease();
    assert.deepEqual(whole.calls, ['sleep-light']);
});

test('options: off by default, validated, and only with lightSleep', () => {
    const base = { memberCache: { enabled: true, store: 'ram', serverKeys: true, keepAcrossImages: true, lightSleep: true } };
    assert.equal(lightStreamOptions(base), null);
    assert.equal(lightStreamOptions({ memberCache: { ...base.memberCache, lightSleepStreamMarginMiB: 0 } }), null);
    assert.deepEqual(lightStreamOptions({ memberCache: { ...base.memberCache, lightSleepStreamMarginMiB: 512 } }), { marginMiB: 512, oomRetry: true });
    assert.throws(() => lightStreamOptions({ memberCache: { ...base.memberCache, lightSleepStreamMarginMiB: 100 } }), /256 to 8192/);
    assert.throws(() => lightStreamOptions({ memberCache: { ...base.memberCache, lightSleep: false, lightSleepStreamMarginMiB: 512 } }), /needs memberCache.lightSleep/);
    assert.throws(() => lightStreamOptions({ memberCache: { ...base.memberCache, lightSleepStreamMarginMiB: 512, lightSleepStreamOomRetry: 'yes' } }), /true or false/);
    assert.throws(() => new ResidencyScheduler({ config: { reserves: {}, memberCache: { ...base.memberCache, lightSleepStreamMarginMiB: 9000 } }, backend: { status: () => ({}) } }), /256 to 8192/);
});

test('comfyOom reads ComfyUI history errors; retryBody keeps the graph and client and drops create_time; stream use keeps the largest of 3 samples', () => {
    assert.equal(comfyOom(OOM_ITEM('a', 1)).type, 'torch.OutOfMemoryError');
    assert.equal(comfyOom(OOM_ITEM('a', 1)).node, 'VAEDecode');
    assert.equal(comfyOom({ status: { status_str: 'error', messages: [['execution_error', { exception_type: 'ValueError', exception_message: 'bad input' }]] } }), null);
    assert.equal(comfyOom({ status: { status_str: 'success', messages: [] } }), null);
    assert.equal(comfyOom({ status: { status_str: 'error', messages: [['execution_error', { exception_type: 'torch.AcceleratorError', exception_message: 'CUDA error: out of memory' }]] } }).type, 'torch.AcceleratorError');
    assert.equal(retryBody({ prompt: [1, 'x'] }, 'x'), null);
    assert.deepEqual(retryBody({ prompt: [1, 'x', { 1: {} }, { create_time: 5 }, []] }, 'x'), { prompt: { 1: {} }, prompt_id: 'x', front: true });
    let entry = null;
    for (const useMiB of [4000, 4400, 4100, 4200]) entry = noteStreamUse(entry, { useMiB, lowGpuMiB: 500, freeAtAdmissionMiB: 4773 });
    assert.equal(entry.useMiB, 4400);
    assert.equal(entry.samples.length, 3);
    entry = noteStreamUse(entry, { useMiB: 3000, lowGpuMiB: 1700, freeAtAdmissionMiB: 4773 });
    assert.equal(entry.useMiB, 4200);
    assert.notEqual(streamUseKey({ workflowKey: 'a', runtime: {}, models: [] }), streamUseKey({ workflowKey: 'b', runtime: {}, models: [] }));
});

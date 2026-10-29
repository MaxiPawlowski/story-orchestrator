import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGateway } from './gateway.mjs';
import { ResidencyScheduler, leaseKind } from './scheduler.mjs';
import { readPreemptionOptions, takePass } from './readPreemption.mjs';

const until = async (check, ms = 2000) => {
    const end = Date.now() + ms;
    while (!check()) { if (Date.now() > end) throw new Error('condition not reached'); await new Promise((resolve) => setTimeout(resolve, 2)); }
};

function rig({ preemptReads = { enabled: true }, chatFirst = true, maxQueue = 4 } = {}) {
    const config = { modelAlias: 'm', defaultProfile: 'fast', maxQueue, queueTimeoutMs: 5000, reserves: { gpuMiB: 1024, ramMiB: 1024 }, residencyObjective: 'switch', chatFirst, ...(preemptReads ? { preemptReads } : {}) };
    const state = { pid: 7, loading: false, profile: 'fast', fitTargetMiB: null };
    const backend = { url: 'http://backend', profile: 'fast', status: () => state, servedContext: () => 32768, ensure: async () => {}, forRequest: async () => {}, releaseSlot: () => {} };
    const lines = [];
    const scheduler = new ResidencyScheduler({ config, backend, snapshot: async () => ({}), queue: async () => ({}), freeImages: async () => {}, startComfy: async () => {}, saveFootprints: async () => {}, log: (line) => lines.push(line) });
    const arbiter = { backend, scheduler, status: async () => ({}), text: (run, signal, budget, lane, options) => scheduler.text(run, signal, budget, lane, options) };
    const calls = [];
    const fetchImpl = async (url, init) => {
        const body = JSON.parse(init.body);
        const row = { body, aborted: false, finish: null };
        calls.push(row);
        return new Promise((resolve, reject) => {
            const reply = () => (body.stream
                ? new Response(`data: {"content":"${body.prompt}","stop":true}\n\n`, { headers: { 'content-type': 'text/event-stream' } })
                : new Response(JSON.stringify({ content: `${body.prompt}#${calls.indexOf(row)}` }), { headers: { 'content-type': 'application/json' } }));
            row.finish = () => resolve(reply());
            init.signal?.addEventListener('abort', () => { row.aborted = true; reject(new DOMException('aborted', 'AbortError')); }, { once: true });
        });
    };
    const gateway = createGateway({ arbiter, config, fetchImpl });
    return { gateway, scheduler, calls, lines, state };
}

const post = (url, body, signal) => fetch(`${url}/completion`, { method: 'POST', body: JSON.stringify(body), signal });
const READ = { prompt: 'read', n_predict: 256, stream: false, temperature: 0.1, so_pass: 'read' };
const CHAT = { prompt: 'chat', n_predict: 400, stream: true };

test('a chat arriving while a story read decodes aborts the read and requeues the identical body after the chat; the read answers once', async () => {
    const { gateway, calls, scheduler, lines } = rig();
    const { port } = await gateway.listen(0);
    const url = `http://127.0.0.1:${port}`;
    try {
        const read = post(url, READ);
        await until(() => calls.length === 1);
        const chat = post(url, CHAT);
        await until(() => calls[0].aborted && calls.length === 2);
        assert.equal(calls[1].body.prompt, 'chat');
        calls[1].finish();
        assert.equal((await chat).status, 200);
        await until(() => calls.length === 3);
        calls[2].finish();
        const reply = await read;
        assert.equal(reply.status, 200);
        assert.deepEqual(await reply.json(), { content: 'read#2' });
        assert.deepEqual(calls.map((row) => row.body.prompt), ['read', 'chat', 'read']);
        assert.deepEqual(calls[2].body, calls[0].body);
        assert.equal('so_pass' in calls[0].body, false);
        const stats = scheduler.status().readPreemption;
        assert.equal(stats.preempted, 1);
        assert.equal(stats.requeued, 1);
        assert.equal(stats.completedAfterPreempt, 1);
        assert.equal(stats.retriesMax, 1);
        assert.ok(lines.some((line) => /^read preempted by chat: requeued after it/.test(line)));
    } finally { await gateway.close(); }
});

test('a side pass without the read marker (an inner beat) is never aborted; the chat waits behind it', async () => {
    const { gateway, calls, scheduler } = rig();
    const { port } = await gateway.listen(0);
    const url = `http://127.0.0.1:${port}`;
    try {
        const inner = post(url, { prompt: 'inner', n_predict: 64, stream: false });
        await until(() => calls.length === 1);
        const chat = post(url, CHAT);
        await new Promise((resolve) => setTimeout(resolve, 30));
        assert.equal(calls[0].aborted, false);
        assert.equal(calls.length, 1);
        calls[0].finish();
        assert.equal((await inner).status, 200);
        await until(() => calls.length === 2);
        calls[1].finish();
        assert.equal((await chat).status, 200);
        assert.equal(scheduler.status().readPreemption.preempted, 0);
    } finally { await gateway.close(); }
});

test('a read is preempted at most maxPreempts times, then runs to the end ahead of the next chat', async () => {
    const { gateway, calls, scheduler } = rig({ preemptReads: { enabled: true, maxPreempts: 1 } });
    const { port } = await gateway.listen(0);
    const url = `http://127.0.0.1:${port}`;
    try {
        const read = post(url, READ);
        await until(() => calls.length === 1);
        const first = post(url, { ...CHAT, prompt: 'chat1' });
        await until(() => calls.length === 2);
        calls[1].finish();
        await first;
        await until(() => calls.length === 3);
        const second = post(url, { ...CHAT, prompt: 'chat2' });
        await new Promise((resolve) => setTimeout(resolve, 30));
        assert.equal(calls[2].aborted, false);
        calls[2].finish();
        assert.equal((await read).status, 200);
        await until(() => calls.length === 4);
        calls[3].finish();
        await second;
        assert.deepEqual(calls.map((row) => row.body.prompt), ['read', 'chat1', 'read', 'chat2']);
        assert.equal(scheduler.status().readPreemption.preempted, 1);
    } finally { await gateway.close(); }
});

test('a read whose client leaves while it waits requeued is dropped: no second backend call, counted cancelled', async () => {
    const { gateway, calls, scheduler } = rig();
    const { port } = await gateway.listen(0);
    const url = `http://127.0.0.1:${port}`;
    try {
        const leave = new AbortController();
        const read = post(url, READ, leave.signal).catch((error) => error);
        await until(() => calls.length === 1);
        const chat = post(url, CHAT);
        await until(() => calls.length === 2);
        leave.abort();
        assert.equal((await read).name, 'AbortError');
        await until(() => scheduler.pending.length === 0);
        calls[1].finish();
        await chat;
        await new Promise((resolve) => setTimeout(resolve, 30));
        assert.equal(calls.length, 2);
        await until(() => scheduler.status().readPreemption.cancelled === 1);
    } finally { await gateway.close(); }
});

test('with preemption off the marker is still stripped and a running read is not aborted', async () => {
    const { gateway, calls, scheduler } = rig({ preemptReads: null });
    const { port } = await gateway.listen(0);
    const url = `http://127.0.0.1:${port}`;
    try {
        const read = post(url, READ);
        await until(() => calls.length === 1);
        const chat = post(url, CHAT);
        await new Promise((resolve) => setTimeout(resolve, 30));
        assert.equal(calls[0].aborted, false);
        assert.equal('so_pass' in calls[0].body, false);
        calls[0].finish();
        await read;
        await until(() => calls.length === 2);
        calls[1].finish();
        await chat;
        assert.equal(scheduler.status().readPreemption, null);
    } finally { await gateway.close(); }
});

test('without chatFirst a chat behind other queued work is not next, so the read is not aborted', async () => {
    const { gateway, calls } = rig({ chatFirst: false });
    const { port } = await gateway.listen(0);
    const url = `http://127.0.0.1:${port}`;
    try {
        const read = post(url, READ);
        await until(() => calls.length === 1);
        const inner = post(url, { prompt: 'inner', n_predict: 64, stream: false });
        await new Promise((resolve) => setTimeout(resolve, 20));
        const chat = post(url, CHAT);
        await new Promise((resolve) => setTimeout(resolve, 30));
        assert.equal(calls[0].aborted, false);
        calls[0].finish(); await read;
        await until(() => calls.length === 2); calls[1].finish(); await inner;
        await until(() => calls.length === 3); calls[2].finish(); await chat;
    } finally { await gateway.close(); }
});

test('a requeue goes after the last queued chat, ignores the queue limit, and does not announce itself as an arrival', async () => {
    const config = { maxQueue: 1, queueTimeoutMs: 1000, reserves: { gpuMiB: 1, ramMiB: 1 }, residencyObjective: 'switch', chatFirst: true };
    const backend = { status: () => ({ pid: 1, profile: 'fast', fitTargetMiB: null }) };
    const scheduler = new ResidencyScheduler({ config, backend, snapshot: async () => ({}), queue: async () => ({}), freeImages: async () => {}, startComfy: async () => {}, saveFootprints: async () => {} });
    const lanes = [];
    scheduler.onArrival((lane) => lanes.push(lane));
    let release;
    const running = scheduler.text(() => new Promise((resolve) => { release = resolve; }), null, null, 'side');
    const chat = scheduler.text(async () => 'chat', null, null, 'chat');
    const order = [];
    const requeued = scheduler.text(async () => { order.push('read'); }, null, null, 'side', { requeue: true });
    await assert.rejects(scheduler.text(async () => {}, null, null, 'side'), /queue is full/);
    assert.deepEqual(scheduler.pending.map((row) => row.lane), ['chat', 'side']);
    assert.deepEqual(lanes, ['side', 'chat']);
    release(); await running; assert.equal(await chat, 'chat'); await requeued;
    assert.deepEqual(order, ['read']);
});

test('options validate maxPreempts; takePass strips the marker and returns it', () => {
    assert.equal(readPreemptionOptions({}), null);
    assert.equal(readPreemptionOptions({ preemptReads: { enabled: false } }), null);
    assert.deepEqual(readPreemptionOptions({ preemptReads: { enabled: true } }), { maxPreempts: 2 });
    assert.throws(() => readPreemptionOptions({ preemptReads: { enabled: true, maxPreempts: 0 } }), /maxPreempts/);
    const body = { prompt: 'x', so_pass: 'read' };
    assert.equal(takePass(body), 'read');
    assert.deepEqual(body, { prompt: 'x' });
    assert.equal(takePass({ prompt: 'x' }), null);
});

test('leaseKind names the main model, the recipe and the size so SDXL scenes and qwen edits differ in controller.log', () => {
    assert.equal(leaseKind({ modelFiles: [{ kind: 'checkpoints', name: 'sdxl\\juggernautXL_v9.safetensors' }, { kind: 'loras', name: 'x.safetensors' }], width: 1024, height: 1024, hires: true }), 'checkpoint:juggernautXL_v9 1024x1024+hires');
    assert.equal(leaseKind({ workflowKey: JSON.stringify({ recipe: 'edit-v3' }), modelFiles: [{ kind: 'textEncoders', name: 'qwen_vl.safetensors' }, { kind: 'diffusionModels', name: 'qwen_image_edit_2509_fp8.safetensors' }], width: 1024, height: 1024 }), 'diffusion:qwen_image_edit_2509_fp8 edit-v3 1024x1024');
    assert.equal(leaseKind({ workflowKey: 'comfy-discovery' }), 'no-model comfy-discovery');
    assert.equal(leaseKind({}), 'no-model');
});

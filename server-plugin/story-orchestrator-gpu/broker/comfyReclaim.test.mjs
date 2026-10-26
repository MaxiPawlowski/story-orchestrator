import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { stopIdleComfy } from './comfyReclaim.mjs';

const process = ({ exits = true } = {}) => {
    const child = new EventEmitter();
    child.pid = 42; child.exitCode = null;
    child.stop = () => { if (exits) { child.exitCode = 0; child.emit('exit', 0); } };
    return child;
};
const deps = (child, overrides = {}) => {
    const kills = [];
    return { kills, deps: { child: () => child, busy: () => false, queue: async () => ({ queue_running: [], queue_pending: [] }), kill: async (target) => { kills.push(target.pid); target.stop(); }, timeoutMs: 50, ...overrides } };
};

test('an idle owned ComfyUI is stopped and counted only after it exits', async () => {
    const child = process();
    const { kills, deps: d } = deps(child);
    assert.deepEqual(await stopIdleComfy(d, { shortMiB: 50 }), { stopped: true, pid: 42 });
    assert.deepEqual(kills, [42]);
});

test('nothing owned, a lease, or queued work leaves ComfyUI running', async () => {
    assert.equal((await stopIdleComfy(deps(null).deps)).stopped, false);
    const child = process();
    const busy = deps(child, { busy: () => true });
    assert.equal((await stopIdleComfy(busy.deps)).reason, 'busy');
    const queued = deps(child, { queue: async () => ({ queue_running: [], queue_pending: [['x']] }) });
    assert.equal((await stopIdleComfy(queued.deps)).reason, 'queue');
    assert.deepEqual([...busy.kills, ...queued.kills], []);
});

test('an image arriving while the queue is read, or a replaced process, cancels the stop', async () => {
    const child = process();
    let leased = false;
    const arriving = deps(child, { busy: () => leased, queue: async () => { leased = true; return { queue_running: [], queue_pending: [] }; } });
    assert.equal((await stopIdleComfy(arriving.deps)).reason, 'changed');
    let current = child;
    const replaced = deps(child, { child: () => current, queue: async () => { current = process(); return {}; } });
    assert.equal((await stopIdleComfy(replaced.deps)).reason, 'changed');
    assert.deepEqual([...arriving.kills, ...replaced.kills], []);
});

test('a process that does not exit, or a failing kill, is not reported as freed', async () => {
    const stuck = deps(process({ exits: false }));
    assert.equal((await stopIdleComfy(stuck.deps)).reason, 'no-exit');
    const failing = deps(process(), { kill: async () => { throw new Error('access denied'); } });
    assert.match((await stopIdleComfy(failing.deps)).reason, /kill failed/);
    const unreadable = deps(process(), { queue: async () => { throw new Error('down'); } });
    assert.match((await stopIdleComfy(unreadable.deps)).reason, /queue unreadable/);
});

test('a render posted straight to ComfyUI between two queue reads keeps it running', async () => {
    const child = process();
    let reads = 0;
    const late = deps(child, { settleMs: 5, queue: async () => (++reads === 1 ? { queue_running: [], queue_pending: [] } : { queue_running: [[1, 'image-director']], queue_pending: [] }) });
    assert.equal((await stopIdleComfy(late.deps)).reason, 'queue');
    assert.deepEqual(late.kills, []);
});

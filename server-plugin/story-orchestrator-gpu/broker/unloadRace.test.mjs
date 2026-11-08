import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { spawn as realSpawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { NativeBackend } from './backend.mjs';
import { ResidencyScheduler } from './scheduler.mjs';
import { killTree } from '../../../scripts/local/orphans.mjs';
import { textState } from '../../../scripts/local/controlLine.mjs';
import { testTempDir } from '../../../scripts/lib/testTemp.mjs';

const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const until = async (check, ms = 5000) => {
    const deadline = Date.now() + ms;
    while (!check()) {
        if (Date.now() > deadline) throw new Error('condition not reached');
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
};
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };
const profiles = { fast: { args: ['--ctx-size', '32768'], estimatedGpuMiB: 4000, estimatedRamMiB: 3000 } };

async function fakeBackend(t, { healthy, kill = 'exits', extra = {} } = {}) {
    const stateDir = await testTempDir('so-unload-race-');
    const children = [];
    const killed = [];
    const backend = new NativeBackend({ defaultProfile: 'fast', maxContext: 32768, stateDir, backendPort: 18889, model: 'fixture', modelAlias: 'fixture',
        admissionWindowMs: 0, reserves: { gpuMiB: 2048, ramMiB: 4096 }, profiles, ...extra }, {
        snapshot: async () => ({ host: { availableMiB: 30000, commitFreeMiB: 60000 }, gpus: [{ freeMiB: 20000 }] }),
        fetch: async () => { if (!children.some((child) => child.exitCode === null) || !healthy()) throw new Error('not listening'); return { ok: true }; },
        spawn: () => {
            const child = new EventEmitter();
            child.pid = 7000 + children.length; child.exitCode = null;
            child.kill = () => {};
            children.push(child);
            return child;
        },
        killTree: async (pid) => {
            killed.push(pid);
            const child = children.find((row) => row.pid === pid);
            if (kill === 'exits' && child && child.exitCode === null) { child.exitCode = 1; child.emit('exit', 1); }
        },
    });
    t.after(() => rm(stateDir, { recursive: true, force: true }));
    return { backend, children, killed };
}

test('controller audit 2026-11-08: a loading text server is owned and reported from spawn, never "text unloaded"', async (t) => {
    const ready = deferred();
    let open = false;
    void ready.promise.then(() => { open = true; });
    const { backend, children, killed } = await fakeBackend(t, { healthy: () => open });
    const loading = backend.load('fast');
    await until(() => children.length === 1);
    const state = backend.status();
    assert.equal(state.pid, 7000);
    assert.equal(state.profile, null);
    assert.equal(state.loading, true);
    assert.equal(textState(state), 'text loading (pid 7000)');
    const unloading = backend.unload();
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.deepEqual(killed, []);
    ready.resolve();
    await loading;
    await unloading;
    assert.deepEqual(killed, [7000]);
    assert.equal(children[0].exitCode, 1);
    assert.equal(backend.status().pid, null);
    assert.equal(textState(backend.status()), 'text unloaded');
});

test('controller audit 2026-11-08: a kill that does not stop the server keeps it owned and shown, then a later unload stops it', async (t) => {
    const { backend, children, killed } = await fakeBackend(t, { healthy: () => true, kill: 'ignored', extra: { textStopTimeoutMs: 40 } });
    const keepAlive = setInterval(() => {}, 1000);
    t.after(() => clearInterval(keepAlive));
    await backend.load('fast');
    await assert.rejects(backend.unload(), /7000 did not stop/);
    assert.equal(backend.status().pid, 7000);
    assert.notEqual(textState(backend.status()), 'text unloaded');
    assert.equal(backend.stopping, null);
    assert.match(backend.status().lastError, /did not stop/);
    children[0].exitCode = 1; children[0].emit('exit', 1);
    assert.equal(backend.status().pid, null);
    assert.equal(backend.status().crashed?.code, 1);
    assert.deepEqual(killed, [7000]);
});

test('controller audit 2026-11-08: unload while a restore loads text is refused, plain and forced, and the load keeps its server', async () => {
    const gate = deferred();
    const backend = { profile: null, desiredProfile: 'fast', fitTarget: null, pid: null, loading: false,
        status: () => ({ pid: backend.pid, profile: backend.profile, desiredProfile: backend.desiredProfile, fitTargetMiB: backend.fitTarget, loading: backend.loading }),
        unload: async () => { backend.profile = null; backend.pid = null; },
        load: async (name) => { backend.pid = 7000; backend.loading = true; await gate.promise; backend.loading = false; backend.profile = name; },
    };
    const scheduler = new ResidencyScheduler({ config: { maxQueue: 2, queueTimeoutMs: 1000, reserves: { gpuMiB: 2048, ramMiB: 4096 }, shedCeilingMiB: 13000,
        defaultImageMiB: 12000, residencyObjective: 'switch', idleRestoreMs: 0, imageCacheMode: 'evict', profiles }, backend,
        snapshot: async () => ({ highCadence: true, gpus: [{ usedMiB: 2000, freeMiB: 22000 }], host: { availableMiB: 24000, commitFreeMiB: 80000 } }),
        queue: async () => ({ queue_running: [], queue_pending: [] }), freeImages: async () => {}, startComfy: async () => {}, saveFootprints: async () => {} });
    scheduler.manualHold = true;
    scheduler.resume();
    const restoring = scheduler.restoreNow();
    await until(() => backend.loading);
    assert.equal(scheduler.status().phase, 'restoring');
    await assert.rejects(scheduler.unload(), /active work/);
    await assert.rejects(scheduler.unload({ force: true, waitMs: 30 }), /still running/);
    assert.equal(backend.pid, 7000);
    assert.equal(textState(scheduler.status().text), 'text loading (pid 7000)');
    gate.resolve();
    await restoring;
    await scheduler.unload();
    assert.equal(backend.pid, null);
    assert.equal(scheduler.status().phase, 'manual-hold');
});

test('controller audit 2026-11-08: unload tree-kills a real dummy server and its child process, verified gone', { skip: process.platform !== 'win32', timeout: 60000 }, async (t) => {
    const stateDir = await testTempDir('so-unload-tree-');
    const grandFile = path.join(stateDir, 'grandchild.pid');
    const script = path.join(stateDir, 'dummy-server.mjs');
    writeFileSync(script, [
        `import { spawn } from 'node:child_process';`,
        `import { writeFileSync } from 'node:fs';`,
        `const grand = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { windowsHide: true, stdio: 'ignore' });`,
        `writeFileSync(${JSON.stringify(grandFile)}, String(grand.pid));`,
        `setInterval(() => {}, 1000);`,
    ].join('\n'));
    let grand = null;
    const backend = new NativeBackend({ defaultProfile: 'fast', maxContext: 32768, stateDir, backendPort: 18889, model: 'fixture', modelAlias: 'fixture',
        admissionWindowMs: 0, reserves: { gpuMiB: 2048, ramMiB: 4096 }, profiles, binary: process.execPath }, {
        snapshot: async () => ({ host: { availableMiB: 30000, commitFreeMiB: 60000 }, gpus: [{ freeMiB: 20000 }] }),
        fetch: async () => {
            if (!backend.child) throw new Error('not listening');
            try { grand = Number(readFileSync(grandFile, 'utf8')); } catch { throw new Error('not listening'); }
            return { ok: true };
        },
        spawn: (binary, _args, options) => realSpawn(binary, [script], options),
        killTree,
    });
    t.after(async () => {
        for (const pid of [backend.child?.pid, grand]) if (pid && alive(pid)) process.kill(pid);
        await rm(stateDir, { recursive: true, force: true });
    });
    await backend.load('fast');
    const server = backend.status().pid;
    assert.ok(alive(server));
    assert.ok(grand && alive(grand));
    await backend.unload();
    await until(() => !alive(grand), 10000);
    assert.equal(alive(server), false);
    assert.equal(alive(grand), false);
    assert.equal(textState(backend.status()), 'text unloaded');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { testTempDirSync } from '../lib/testTemp.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };

const hardKill = async ({ reaper, waitMs }) => {
    const dir = testTempDirSync('so-orphans-win-');
    const ledgerFile = path.join(dir, 'owned-text.json');
    const orphans = pathToFileURL(path.join(here, 'orphans.mjs')).href;
    const controller = [
        `const o = await import(${JSON.stringify(orphans)});`,
        `const ledger = o.createLedger(${JSON.stringify(ledgerFile)});`,
        `const { spawn } = await import('node:child_process');`,
        `const wrapped = o.recordingSpawn({ spawn, binary: process.execPath, port: null, ledger });`,
        `const child = wrapped(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { windowsHide: true, stdio: 'ignore', detached: true });`,
        `${reaper ? '' : 'void 0 && '}o.startReaper({ script: ${JSON.stringify(path.join(here, 'textReaper.mjs'))}, ledgerFile: ledger.file, binary: process.execPath });`,
        `console.log('ready ' + child.pid);`,
        `setInterval(() => {}, 1000);`,
    ].join('\n');
    const parent = spawn(process.execPath, ['--input-type=module', '-e', controller], { windowsHide: true, stdio: ['ignore', 'pipe', 'inherit'] });
    const childPid = await new Promise((resolve, reject) => {
        let out = '';
        parent.stdout.on('data', (chunk) => { out += chunk; const match = /ready (\d+)/.exec(out); if (match) resolve(Number(match[1])); });
        parent.once('exit', (code) => reject(new Error(`fake controller exited ${code}`)));
    });
    if (!alive(childPid)) throw new Error('fake text server did not start');
    process.kill(parent.pid);
    const deadline = Date.now() + waitMs;
    while (alive(childPid) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 250));
    const left = alive(childPid);
    if (left) process.kill(childPid);
    return left;
};
const windows = { skip: process.platform !== 'win32', timeout: 240000 };

test('control: a text server outside the controller job outlives a hard-killed controller without the reaper', windows, async () => {
    assert.equal(await hardKill({ reaper: false, waitMs: 3000 }), true);
});

test('a hard-killed controller leaves no text server behind: the reaper stops the recorded child', windows, async () => {
    assert.equal(await hardKill({ reaper: true, waitMs: 180000 }), false);
});

test('startup reap stops a recorded text server whose controller is gone and keeps one whose owner lives', windows, async () => {
    const { createLedger, reapOrphans } = await import('./orphans.mjs');
    const ledger = createLedger(path.join(testTempDirSync('so-orphans-reap-'), 'owned-text.json'));
    const exit = `const { spawn } = await import('node:child_process'); const c = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore', windowsHide: true }); c.unref(); console.log('pid ' + c.pid);`;
    const orphanPid = await new Promise((resolve, reject) => {
        const parent = spawn(process.execPath, ['--input-type=module', '-e', exit], { windowsHide: true, stdio: ['ignore', 'pipe', 'inherit'] });
        let out = '';
        parent.stdout.on('data', (chunk) => { out += chunk; });
        parent.once('exit', () => { const match = /pid (\d+)/.exec(out); if (match) resolve(Number(match[1])); else reject(new Error('no orphan pid')); });
    });
    const owned = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore', windowsHide: true });
    try {
        ledger.add({ pid: orphanPid, binary: process.execPath });
        ledger.add({ pid: owned.pid, binary: process.execPath });
        const result = await reapOrphans({ binary: process.execPath, port: null, ledger });
        assert.deepEqual(result, { reaped: [orphanPid], survivors: [] });
        assert.equal(alive(orphanPid), false);
        assert.equal(alive(owned.pid), true);
        assert.deepEqual(ledger.read().map((row) => row.pid), [owned.pid]);
    } finally {
        if (alive(orphanPid)) process.kill(orphanPid);
        owned.kill();
    }
});

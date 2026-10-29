import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { createLedger, guardTextOnExit, killTree, killTreeSync, orphanedTextServers, parseQuery, PS_QUERY, queryProcesses, reapOrphans, recordingSpawn, runReaper, sameExe, startReaper } from './orphans.mjs';
import { testTempDirSync } from '../lib/testTemp.mjs';

const BIN = 'C:/tools/llama/llama-server.exe';
const EXE = 'C:\\tools\\llama\\llama-server.exe';
const memLedger = (entries = []) => {
    let rows = [...entries];
    return { file: 'mem', read: () => rows.map((row) => ({ ...row })), add(entry) { rows = [...rows.filter((row) => row.pid !== entry.pid), entry]; }, remove(pid) { rows = rows.filter((row) => row.pid !== pid); } };
};
const procs = (...rows) => new Map(rows.map((row) => [row.pid, row]));
const fakeQuery = (world) => async ({ pids, port }) => ({ listeners: port === world.port ? [...(world.listeners ?? [])] : [], processes: new Map(world.processes) });

test('sameExe matches normalized Windows paths case-insensitively and basenames for bare binaries', () => {
    assert.equal(sameExe(EXE, BIN), true);
    assert.equal(sameExe('C:\\TOOLS\\Llama\\LLAMA-SERVER.EXE', BIN), true);
    assert.equal(sameExe('C:\\other\\llama-server.exe', BIN), false);
    assert.equal(sameExe('C:\\other\\llama-server.exe', 'llama-server.exe'), true);
    assert.equal(sameExe(null, BIN), false);
    assert.equal(sameExe(EXE, ''), false);
});

test('ledger persists entries on disk, replaces a pid and tolerates a missing or broken file', () => {
    const dir = testTempDirSync('so-orphans-');
    const file = path.join(dir, 'state', 'owned-text.json');
    const ledger = createLedger(file);
    assert.deepEqual(ledger.read(), []);
    ledger.add({ pid: 10, binary: BIN });
    ledger.add({ pid: 11, binary: BIN });
    ledger.add({ pid: 10, binary: BIN, port: 1 });
    assert.deepEqual(createLedger(file).read(), [{ pid: 11, binary: BIN }, { pid: 10, binary: BIN, port: 1 }]);
    ledger.remove(11);
    assert.deepEqual(ledger.read().map((row) => row.pid), [10]);
    fs.writeFileSync(file, '{not json');
    assert.deepEqual(ledger.read(), []);
    fs.writeFileSync(file, JSON.stringify({ entries: [{ pid: 'x' }, { pid: -1 }, { pid: 7 }] }));
    assert.deepEqual(ledger.read(), [{ pid: 7 }]);
});

test('recordingSpawn records only the text binary and forgets it on exit', () => {
    const ledger = memLedger();
    const live = new Set();
    const children = [];
    const spawn = (file) => { const child = new EventEmitter(); child.pid = 100 + children.length; child.file = file; children.push(child); return child; };
    const wrapped = recordingSpawn({ spawn, binary: BIN, port: 18889, ledger, live, ownerPid: 42, now: () => 0 });
    const text = wrapped(BIN, ['--port', '18889'], {});
    const comfy = wrapped('python.exe', ['main.py'], {});
    assert.equal(comfy.file, 'python.exe');
    assert.deepEqual([...live], [text.pid]);
    assert.deepEqual(ledger.read(), [{ pid: text.pid, binary: BIN, port: 18889, ownerPid: 42, startedAt: new Date(0).toISOString() }]);
    text.emit('exit', 0);
    assert.deepEqual([...live], []);
    assert.deepEqual(ledger.read(), []);
});

test('recordingSpawn still returns the child when the ledger cannot be written', () => {
    const lines = [];
    const ledger = { add() { throw new Error('disk full'); }, remove() {} };
    const spawn = () => Object.assign(new EventEmitter(), { pid: 5 });
    const child = recordingSpawn({ spawn, binary: BIN, port: 1, ledger, log: (line) => lines.push(line) })(BIN, []);
    assert.equal(child.pid, 5);
    assert.match(lines[0], /could not record text server pid 5/);
});

test('orphanedTextServers kills only matching binaries whose parent is gone, reused or the dead owner', () => {
    const processes = procs(
        { pid: 1, ppid: 900, exe: EXE, created: 1000 },
        { pid: 2, ppid: 50, exe: EXE, created: 1000 },
        { pid: 50, ppid: 4, exe: 'C:\\node.exe', created: 500 },
        { pid: 3, ppid: 60, exe: EXE, created: 1000 },
        { pid: 60, ppid: 4, exe: 'C:\\other.exe', created: 2000 },
        { pid: 4, ppid: 0, exe: 'C:\\Windows\\explorer.exe', created: 10 },
        { pid: 5, ppid: 900, exe: 'C:\\python.exe', created: 1000 },
        { pid: 6, ppid: 70, exe: EXE, created: 1000 },
        { pid: 70, ppid: 4, exe: 'C:\\node.exe', created: 100 },
    );
    assert.deepEqual(orphanedTextServers({ processes, candidates: [1, 2, 3, 5, 6, 99, 1], binary: BIN }), [1, 3]);
    assert.deepEqual(orphanedTextServers({ processes, candidates: [1, 2, 3, 5, 6], binary: BIN, ownerGone: (proc) => proc.ppid === 70 }), [1, 3, 6]);
});

test('reapOrphans kills a recorded orphan and an unrecorded orphan holding the port, keeps a live-owned server', async () => {
    const world = {
        port: 18889,
        listeners: [21],
        processes: procs(
            { pid: 20, ppid: 800, exe: EXE, created: 1 },
            { pid: 21, ppid: 801, exe: EXE, created: 1 },
            { pid: 22, ppid: 30, exe: EXE, created: 5 },
            { pid: 30, ppid: 1, exe: 'C:\\node.exe', created: 2 },
            { pid: 23, ppid: 1, exe: 'C:\\Windows\\notepad.exe', created: 9 },
        ),
    };
    const ledger = memLedger([{ pid: 20 }, { pid: 22 }, { pid: 23 }, { pid: 24 }]);
    const killed = [];
    const kill = async (pid) => { killed.push(pid); world.processes.delete(pid); };
    const asked = [];
    const query = async (args) => { asked.push(args); return fakeQuery(world)(args); };
    const result = await reapOrphans({ binary: BIN, port: 18889, ledger, query, kill, sleep: async () => {} });
    assert.deepEqual(killed, [20, 21]);
    assert.deepEqual(result, { reaped: [20, 21], survivors: [] });
    assert.deepEqual(asked[0], { pids: [20, 22, 23, 24], port: 18889 });
    assert.deepEqual(ledger.read().map((row) => row.pid), [22]);
});

test('reapOrphans reports a survivor that ignored the kill and keeps it recorded', async () => {
    const world = { port: 1, listeners: [], processes: procs({ pid: 40, ppid: 999, exe: EXE, created: 1 }) };
    const ledger = memLedger([{ pid: 40 }]);
    const lines = [];
    const result = await reapOrphans({ binary: BIN, port: 1, ledger, query: fakeQuery(world), kill: async () => {}, sleep: async () => {}, settleTries: 3, log: (line) => lines.push(line) });
    assert.deepEqual(result, { reaped: [], survivors: [40] });
    assert.deepEqual(ledger.read().map((row) => row.pid), [40]);
    assert.ok(lines.some((line) => /did not stop/.test(line)));
});

test('reapOrphans does nothing when nothing is recorded and the port is free', async () => {
    const killed = [];
    const result = await reapOrphans({ binary: BIN, port: 18889, ledger: memLedger(), query: fakeQuery({ port: 18889, processes: new Map() }), kill: async (pid) => killed.push(pid), sleep: async () => {} });
    assert.deepEqual(result, { reaped: [], survivors: [] });
    assert.deepEqual(killed, []);
});

test('runReaper kills the dead controller\'s text server even while the controller process is still listed', async () => {
    const world = { processes: procs({ pid: 50, ppid: 7, exe: EXE, created: 10 }, { pid: 7, ppid: 1, exe: 'C:\\node.exe', created: 5 }, { pid: 51, ppid: 8, exe: EXE, created: 10 }, { pid: 8, ppid: 1, exe: 'C:\\node.exe', created: 5 }) };
    const ledger = memLedger([{ pid: 50, ownerPid: 7 }, { pid: 51, ownerPid: 8 }]);
    const killed = [];
    const sleeps = [];
    const result = await runReaper({ ledger, binary: BIN, ownerPid: 7, query: fakeQuery(world), kill: async (pid) => { killed.push(pid); world.processes.delete(pid); }, sleep: async (ms) => sleeps.push(ms), attempts: 2, retryMs: 5 });
    assert.deepEqual(killed, [50]);
    assert.deepEqual(result.reaped, [50]);
    assert.deepEqual(ledger.read().map((row) => row.pid), [51]);
    assert.ok(sleeps.includes(5));
});

test('runReaper stops early once the ledger is empty', async () => {
    let queries = 0;
    const result = await runReaper({ ledger: memLedger(), binary: BIN, ownerPid: 1, query: async () => { queries += 1; return { listeners: [], processes: new Map() }; }, sleep: async () => { throw new Error('no wait'); } });
    assert.deepEqual(result, { reaped: [], survivors: [] });
    assert.equal(queries, 1);
});

test('guardTextOnExit stops through the controller on a signal, sync-kills live pids on exit, and releases', async () => {
    const proc = new EventEmitter();
    const exits = [];
    proc.exit = (code) => { exits.push(code); };
    const live = new Set([71, 72]);
    const synced = [];
    let stops = 0;
    const guard = guardTextOnExit({ live, proc, stop: async () => { stops += 1; }, killSync: (pid) => synced.push(pid) });
    proc.emit('SIGBREAK');
    proc.emit('SIGINT');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(stops, 1);
    assert.deepEqual(exits, [149]);
    proc.emit('exit', 0);
    assert.deepEqual(synced, [71, 72]);
    guard.release();
    assert.equal(proc.listenerCount('exit'), 0);
    assert.equal(proc.listenerCount('SIGTERM'), 0);
});

test('guardTextOnExit exits with the signal code even when stop fails', async () => {
    const proc = new EventEmitter();
    const exits = [];
    proc.exit = (code) => exits.push(code);
    guardTextOnExit({ live: new Set(), proc, stop: async () => { throw new Error('boom'); }, killSync: () => {} });
    proc.emit('SIGTERM');
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(exits, [143]);
});

test('killTree and killTreeSync use taskkill /t /f on Windows and skip invalid pids', async () => {
    const calls = [];
    await killTree(123, { platform: 'win32', run: (file, args, done) => { calls.push([file, args]); done(); } });
    await killTree(0, { platform: 'win32', run: () => { throw new Error('not called'); } });
    killTreeSync(456, { platform: 'win32', run: (file, args) => calls.push([file, args]) });
    killTreeSync(789, { platform: 'win32', run: () => { throw new Error('already gone'); } });
    assert.deepEqual(calls, [['taskkill.exe', ['/pid', '123', '/t', '/f']], ['taskkill.exe', ['/pid', '456', '/t', '/f']]]);
});

test('startReaper spawns a detached watcher holding a stdin pipe to the controller', () => {
    const calls = [];
    const stdin = Object.assign(new EventEmitter(), { unref() { calls.push('stdin.unref'); } });
    const child = Object.assign(new EventEmitter(), { stdin, unref() { calls.push('unref'); } });
    const spawned = startReaper({ script: 'reaper.mjs', ledgerFile: 'owned.json', binary: BIN, ownerPid: 9, execPath: 'node.exe', spawn: (...args) => { calls.push(args); return child; } });
    assert.equal(spawned, child);
    assert.deepEqual(calls[0], ['node.exe', ['reaper.mjs', 'owned.json', BIN, '9'], { detached: true, windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] }]);
    assert.deepEqual(calls.slice(1), ['unref', 'stdin.unref']);
});

test('queryProcesses parses the PowerShell answer and is inert off Windows', async () => {
    const scripts = [];
    const answer = JSON.stringify({ listeners: 21, processes: [{ pid: 21, ppid: 3, exe: EXE, created: 1700 }, { pid: 3, ppid: 0, exe: null, created: null }, { pid: 'bad' }] });
    const result = await queryProcesses({ pids: [20, 0, 'x'], port: 18889 }, { platform: 'win32', run: async (script) => { scripts.push(script); return answer; } });
    assert.deepEqual(result.listeners, [21]);
    assert.deepEqual([...result.processes.keys()], [21, 3]);
    assert.deepEqual(result.processes.get(21), { pid: 21, ppid: 3, exe: EXE, created: 1700 });
    assert.match(scripts[0], /\$ids = @\(20\)/);
    assert.match(scripts[0], /-LocalPort 18889 -State Listen/);
    assert.doesNotMatch(PS_QUERY([1], null), /Get-NetTCPConnection/);
    assert.deepEqual(parseQuery(''), { listeners: [], processes: new Map() });
    const off = await queryProcesses({ pids: [1], port: 1 }, { platform: 'linux', run: async () => { throw new Error('not called'); } });
    assert.equal(off.supported, false);
    assert.equal(off.processes.size, 0);
});

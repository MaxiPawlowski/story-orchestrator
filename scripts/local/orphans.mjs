import fsDefault from 'node:fs';
import path from 'node:path';
import { execFile, execFileSync, spawn as spawnDefault } from 'node:child_process';

export const STOP_SIGNALS = Object.freeze([['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129], ['SIGBREAK', 149]]);

export function sameExe(actual, binary) {
    if (typeof actual !== 'string' || typeof binary !== 'string' || !actual || !binary) return false;
    const a = path.win32.normalize(actual).toLowerCase();
    const b = path.win32.normalize(binary).toLowerCase();
    return path.win32.isAbsolute(b) ? a === b : path.win32.basename(a) === path.win32.basename(b);
}

export function createLedger(file, fs = fsDefault) {
    const read = () => {
        try {
            const data = JSON.parse(fs.readFileSync(file, 'utf8'));
            return Array.isArray(data?.entries) ? data.entries.filter((entry) => Number.isInteger(entry?.pid) && entry.pid > 0) : [];
        } catch { return []; }
    };
    const write = (entries) => {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify({ entries }, null, 1));
    };
    return {
        file, read,
        add(entry) { write([...read().filter((row) => row.pid !== entry.pid), entry]); },
        remove(pid) { const rows = read(); if (rows.some((row) => row.pid === pid)) write(rows.filter((row) => row.pid !== pid)); },
    };
}

export function recordingSpawn({ spawn = spawnDefault, binary, port, ledger, live = new Set(), ownerPid = process.pid, now = Date.now, log = () => {} }) {
    return (file, ...rest) => {
        const child = spawn(file, ...rest);
        const pid = child?.pid;
        if (file !== binary || !Number.isInteger(pid)) return child;
        live.add(pid);
        try { ledger.add({ pid, binary, port, ownerPid, startedAt: new Date(now()).toISOString() }); }
        catch (error) { log(`could not record text server pid ${pid}: ${error.message}`); }
        child.once?.('exit', () => {
            live.delete(pid);
            try { ledger.remove(pid); } catch {}
        });
        return child;
    };
}

export const PS_QUERY = (pids, port) => [
    `$ids = @(${pids.filter((pid) => Number.isInteger(pid) && pid > 0).join(',')})`,
    `$listeners = @()`,
    Number.isInteger(port) && port > 0 ? `$listeners = @(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { [int]$_.OwningProcess })` : '',
    `$all = @(Get-CimInstance Win32_Process)`,
    `$want = @($ids + $listeners)`,
    `$found = @($all | Where-Object { $want -contains [int]$_.ProcessId })`,
    `$parents = @($found | ForEach-Object { [int]$_.ParentProcessId })`,
    `$rows = @($all | Where-Object { ($want -contains [int]$_.ProcessId) -or ($parents -contains [int]$_.ProcessId) } | ForEach-Object { @{ pid = [int]$_.ProcessId; ppid = [int]$_.ParentProcessId; exe = $_.ExecutablePath; created = if ($_.CreationDate) { ([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() } else { $null } } })`,
    `ConvertTo-Json -Compress -Depth 4 -InputObject @{ listeners = $listeners; processes = $rows }`,
].filter(Boolean).join('; ');

export function parseQuery(stdout) {
    const data = JSON.parse(String(stdout).trim() || '{}');
    const listeners = [].concat(data.listeners ?? []).map(Number).filter((pid) => Number.isInteger(pid) && pid > 0);
    const processes = new Map();
    for (const row of [].concat(data.processes ?? [])) {
        const pid = Number(row?.pid);
        if (!Number.isInteger(pid) || pid <= 0) continue;
        processes.set(pid, { pid, ppid: Number(row.ppid), exe: typeof row.exe === 'string' ? row.exe : null, created: Number.isFinite(row.created) ? row.created : null });
    }
    return { listeners, processes };
}

const runPowerShell = (script) => new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 90000, maxBuffer: 16 * 1024 * 1024 },
        (error, stdout) => (error ? reject(error) : resolve(stdout)));
});

export async function queryProcesses({ pids = [], port = null } = {}, { platform = process.platform, run = runPowerShell } = {}) {
    if (platform !== 'win32') return { listeners: [], processes: new Map(), supported: false };
    return { ...parseQuery(await run(PS_QUERY(pids, port))), supported: true };
}

export function killTree(pid, { platform = process.platform, run = (file, args, done) => execFile(file, args, { windowsHide: true }, () => done()) } = {}) {
    return new Promise((done) => {
        if (!Number.isInteger(pid) || pid <= 0) { done(); return; }
        if (platform === 'win32') { run('taskkill.exe', ['/pid', String(pid), '/t', '/f'], () => done()); return; }
        try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch {} }
        done();
    });
}

export function killTreeSync(pid, { platform = process.platform, run = (file, args) => execFileSync(file, args, { stdio: 'ignore', windowsHide: true, timeout: 10000 }) } = {}) {
    if (!Number.isInteger(pid) || pid <= 0) return;
    if (platform === 'win32') { try { run('taskkill.exe', ['/pid', String(pid), '/t', '/f']); } catch {} return; }
    try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch {} }
}

export function orphanedTextServers({ processes, candidates, binary, ownerGone = () => false }) {
    const out = [];
    for (const pid of new Set(candidates)) {
        const proc = processes.get(pid);
        if (!proc || !sameExe(proc.exe, binary)) continue;
        const parent = processes.get(proc.ppid);
        const parentReused = Boolean(parent) && Number.isFinite(parent.created) && Number.isFinite(proc.created) && parent.created > proc.created;
        if (!parent || parentReused || ownerGone(proc)) out.push(pid);
    }
    return out;
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function reapOrphans({ binary, port = null, ledger, query = queryProcesses, kill = killTree, ownerGone, log = () => {}, sleep = pause, settleMs = 500, settleTries = 20 }) {
    const recorded = ledger.read();
    const { listeners, processes } = await query({ pids: recorded.map((entry) => entry.pid), port });
    const reaped = orphanedTextServers({ processes, candidates: [...recorded.map((entry) => entry.pid), ...listeners], binary, ownerGone });
    for (const pid of reaped) {
        log(`stopping orphaned text server pid ${pid} (${processes.get(pid).exe})`);
        await kill(pid);
    }
    let survivors = [...reaped];
    for (let tries = 0; survivors.length && tries < settleTries; tries += 1) {
        await sleep(settleMs);
        const after = await query({ pids: survivors, port: null });
        survivors = survivors.filter((pid) => after.processes.has(pid) && sameExe(after.processes.get(pid).exe, binary));
    }
    for (const entry of recorded) {
        const proc = processes.get(entry.pid);
        if (!proc || !sameExe(proc.exe, binary) || (reaped.includes(entry.pid) && !survivors.includes(entry.pid))) ledger.remove(entry.pid);
    }
    if (survivors.length) log(`orphaned text server(s) ${survivors.join(', ')} did not stop`);
    return { reaped: reaped.filter((pid) => !survivors.includes(pid)), survivors };
}

export function guardTextOnExit({ live, stop, proc = process, killSync = killTreeSync, stopTimeoutMs = 20000 }) {
    let stopping = false;
    const onSignal = (code) => {
        if (stopping) return;
        stopping = true;
        const timer = setTimeout(() => proc.exit(code), stopTimeoutMs);
        timer.unref?.();
        void Promise.resolve().then(stop).catch(() => {}).finally(() => { clearTimeout(timer); proc.exit(code); });
    };
    const handlers = STOP_SIGNALS.map(([signal, code]) => [signal, () => onSignal(code)]);
    for (const [signal, handler] of handlers) proc.on(signal, handler);
    const onExit = () => { for (const pid of [...live]) killSync(pid); };
    proc.on('exit', onExit);
    return { release() { for (const [signal, handler] of handlers) proc.off(signal, handler); proc.off('exit', onExit); } };
}

export function startReaper({ script, ledgerFile, binary, ownerPid = process.pid, spawn = spawnDefault, execPath = process.execPath }) {
    const child = spawn(execPath, [script, ledgerFile, binary, String(ownerPid)], { detached: true, windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
    child.on?.('error', () => {});
    child.unref?.();
    child.stdin?.on?.('error', () => {});
    child.stdin?.unref?.();
    return child;
}

export async function runReaper({ ledger, binary, ownerPid, query = queryProcesses, kill = killTree, log = () => {}, sleep = pause, attempts = 3, retryMs = 2000 }) {
    const ownerGone = (proc) => proc.ppid === ownerPid;
    const total = { reaped: [], survivors: [] };
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        const result = await reapOrphans({ binary, ledger, query, kill, ownerGone, log, sleep });
        total.reaped.push(...result.reaped);
        total.survivors = result.survivors;
        if (!ledger.read().length) break;
        await sleep(retryMs);
    }
    return total;
}

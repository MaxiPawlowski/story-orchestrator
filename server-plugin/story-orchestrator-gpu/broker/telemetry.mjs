import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';

const exec = promisify(execFile);

export function parseNvidiaSmi(stdout) {
    return stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => {
        const [uuid, total, used, free, utilization] = line.split(',').map((part) => part.trim());
        return { uuid, totalMiB: Number(total), usedMiB: Number(used), freeMiB: Number(free), utilization: Number(utilization) };
    });
}

export async function gpuMemory() {
    const { stdout } = await exec('nvidia-smi', ['--query-gpu=uuid,memory.total,memory.used,memory.free,utilization.gpu', '--format=csv,noheader,nounits'], { windowsHide: true, timeout: 10000 });
    return parseNvidiaSmi(stdout);
}

export function parseMeminfo(text) {
    const kib = (name) => Number(new RegExp(`^${name}:\\s+(\\d+)`, 'm').exec(text)?.[1]);
    const total = kib('MemTotal');
    const available = kib('MemAvailable');
    const limit = kib('CommitLimit');
    const committed = kib('Committed_AS');
    return { totalMiB: total / 1024, availableMiB: available / 1024,
        commitFreeMiB: Number.isFinite(limit) && Number.isFinite(committed) ? Math.max(0, limit - committed) / 1024 : available / 1024 };
}

export async function hostMemory(platform = process.platform) {
    if (platform === 'win32') {
        const command = '$o=Get-CimInstance Win32_OperatingSystem; $p=Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory; [pscustomobject]@{totalMiB=$o.TotalVisibleMemorySize/1024;availableMiB=$o.FreePhysicalMemory/1024;commitFreeMiB=$o.FreeVirtualMemory/1024;pagesInputPerSec=$p.PagesInputPersec} | ConvertTo-Json -Compress';
        const { stdout } = await exec('powershell', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 15000 });
        return JSON.parse(stdout);
    }
    if (platform === 'linux') return parseMeminfo(await fs.readFile('/proc/meminfo', 'utf8'));
    const free = os.freemem() / 1024 / 1024;
    return { totalMiB: os.totalmem() / 1024 / 1024, availableMiB: free, commitFreeMiB: free };
}

export async function memorySnapshot() {
    const [gpus, host] = await Promise.all([gpuMemory(), hostMemory()]);
    return { at: new Date().toISOString(), gpus, host };
}

export function probeReserves(snapshot) {
    const gpu = snapshot?.gpus?.[0];
    const host = snapshot?.host;
    if (!Number.isFinite(gpu?.totalMiB) || gpu.totalMiB <= 0 || !Number.isFinite(host?.totalMiB) || host.totalMiB <= 0) return null;
    return { gpuMiB: Math.max(1024, Math.ceil(gpu.totalMiB * 0.1)), ramMiB: Math.max(2048, Math.ceil(host.totalMiB * 0.1)), from: 'probe' };
}

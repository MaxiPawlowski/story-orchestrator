import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export async function gpuMemory() {
    const { stdout } = await exec('nvidia-smi', ['--query-gpu=uuid,memory.total,memory.used,memory.free,utilization.gpu', '--format=csv,noheader,nounits'], { windowsHide: true, timeout: 10000 });
    return stdout.trim().split(/\r?\n/).map((line) => {
        const [uuid, total, used, free, utilization] = line.split(',').map((part) => part.trim());
        return { uuid, totalMiB: Number(total), usedMiB: Number(used), freeMiB: Number(free), utilization: Number(utilization) };
    });
}

export async function hostMemory() {
    const command = '$o=Get-CimInstance Win32_OperatingSystem; $p=Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory; [pscustomobject]@{totalMiB=$o.TotalVisibleMemorySize/1024;availableMiB=$o.FreePhysicalMemory/1024;commitFreeMiB=$o.FreeVirtualMemory/1024;pagesInputPerSec=$p.PagesInputPersec} | ConvertTo-Json -Compress';
    const { stdout } = await exec('powershell', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 15000 });
    return JSON.parse(stdout);
}

export async function memorySnapshot() {
    const [gpus, host] = await Promise.all([gpuMemory(), hostMemory()]);
    return { at: new Date().toISOString(), gpus, host };
}

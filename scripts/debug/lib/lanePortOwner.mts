import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { posix, win32 } from 'node:path';

export type PortHolder = { pid: number | null; commandLine: string | null };
export type PortOwnership = 'own' | 'other' | 'unknown';

export function listeningPids(netstat: string, port: number): number[] {
  const pids = new Set<number>();
  for (const line of netstat.split(/\r?\n/)) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 5 || cols[0].toUpperCase() !== 'TCP' || cols[3].toUpperCase() !== 'LISTENING') continue;
    if (Number(cols[1].slice(cols[1].lastIndexOf(':') + 1)) !== port) continue;
    const pid = Number(cols[4]);
    if (Number.isInteger(pid) && pid > 0) pids.add(pid);
  }
  return [...pids];
}

export function dataRootOf(commandLine: string): string | null {
  const match = commandLine.match(/--dataRoot(?:=|\s+)(?:"([^"]+)"|'([^']+)'|(\S+))/);
  return match ? (match[1] ?? match[2] ?? match[3]) : null;
}

const normalRoot = (path: string, platform: string) => {
  if (platform !== 'win32') return posix.resolve(path).replace(/\/+$/, '');
  return win32.resolve(path).replace(/[\\/]+$/, '').toLowerCase();
};

export function portOwnership(holder: PortHolder, lane: { data: string; pid: number | null }, platform: string = process.platform): PortOwnership {
  if (holder.commandLine !== null) {
    const root = dataRootOf(holder.commandLine);
    return root !== null && normalRoot(root, platform) === normalRoot(lane.data, platform) ? 'own' : 'other';
  }
  if (holder.pid !== null && lane.pid !== null && holder.pid === lane.pid) return 'own';
  return 'unknown';
}

const run = (file: string, args: string[]) => new Promise<string | null>((done) => execFile(file, args, { windowsHide: true, timeout: 15000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => done(error ? null : String(stdout))));

export async function portHolder(port: number): Promise<PortHolder> {
  if (process.platform === 'win32') {
    const netstat = await run('netstat.exe', ['-ano', '-p', 'tcp']);
    const pid = netstat === null ? null : (listeningPids(netstat, port)[0] ?? null);
    if (pid === null) return { pid: null, commandLine: null };
    const commandLine = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine`]);
    return { pid, commandLine: commandLine?.trim() || null };
  }
  const pid = Number((await run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']))?.split(/\s+/)[0] ?? '') || null;
  if (pid === null) return { pid: null, commandLine: null };
  const commandLine = await readFile(`/proc/${pid}/cmdline`, 'utf-8').then((text) => text.split('\u0000').join(' ').trim() || null, () => null);
  return { pid, commandLine };
}

export const holderSummary = (holder: PortHolder) => ({ pid: holder.pid, dataRoot: holder.commandLine === null ? null : dataRootOf(holder.commandLine), commandLine: holder.commandLine?.slice(0, 200) ?? null });

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const treeDriver = fileURLToPath(new URL('./treeDriver.mts', import.meta.url));

export function spawnShellWrapper(mode: 'guard' | 'bare') {
  const command = `"${process.execPath}" "${treeDriver}" ${mode}`;
  return process.platform === 'win32'
    ? spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `"${command}"`], { stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true, windowsVerbatimArguments: true })
    : spawn('/bin/sh', ['-c', `${command}; sleep 60`], { stdio: ['ignore', 'pipe', 'inherit'] });
}

import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const configFile = process.env.SO_LOCAL_CONFIG ?? 'C:/dev/tools/story-orchestrator-local/config.json';
const config = JSON.parse(await fs.readFile(configFile, 'utf8'));
const status = await (await fetch(`http://127.0.0.1:${config.gatewayPort}/status`)).json();
const queue = await (await fetch(`${config.comfyUrl}/queue`)).json();
if (status.activeText || queue.queue_running?.length || queue.queue_pending?.length) throw new Error('Active work must finish before recovering the owned controller.');
const exec = promisify(execFile);
const { stdout } = await exec('powershell', ['-NoProfile', '-NonInteractive', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId=${Number(status.pid)}").CommandLine`], { windowsHide: true, timeout: 10000 });
if (!stdout.includes('scripts\\local\\controller.mjs') && !stdout.includes('scripts/local/controller.mjs')) throw new Error('Process identity does not match the local controller.');
await exec('taskkill', ['/PID', String(status.pid), '/T', '/F'], { windowsHide: true, timeout: 10000 });
console.log('Stopped only the verified controller tree after confirming both engines idle. Run cli.mjs start.');

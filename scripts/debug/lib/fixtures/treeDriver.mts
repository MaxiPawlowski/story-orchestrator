import { spawn } from 'node:child_process';
import { guardChildren } from '../childTree.mts';

const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', windowsHide: true });
if (process.argv[2] === 'guard') guardChildren(() => [child], { intervalMs: 200 });
process.stdout.write(`${JSON.stringify({ driver: process.pid, child: child.pid })}\n`);
setInterval(() => {}, 1000);

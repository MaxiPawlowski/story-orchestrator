import { execFile, execFileSync } from 'node:child_process';

type Run = (file: string, args: string[], done: () => void) => unknown;
type Proc = { ppid: number; on(event: string, listener: (...args: unknown[]) => void): unknown; off(event: string, listener: (...args: unknown[]) => void): unknown; exit(code: number): void };

export function killTree(pid: number, platform: string = process.platform, run: Run = (file, args, done) => execFile(file, args, { windowsHide: true }, () => done())): Promise<void> {
  return new Promise((done) => {
    if (platform === 'win32') { run('taskkill.exe', ['/pid', String(pid), '/t', '/f'], () => done()); return; }
    try { process.kill(-pid, 'SIGTERM'); } catch { try { process.kill(pid, 'SIGTERM'); } catch { /* gone */ } }
    done();
  });
}

export function killTreeSync(pid: number): void {
  if (process.platform === 'win32') { try { execFileSync('taskkill.exe', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true }); } catch { /* gone */ } return; }
  try { process.kill(-pid, 'SIGTERM'); } catch { try { process.kill(pid, 'SIGTERM'); } catch { /* gone */ } }
}

export function parentAlive(ppid: number, probe: (pid: number) => unknown = (pid) => process.kill(pid, 0)): boolean {
  try { probe(ppid); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
}

export interface GuardDeps { proc?: Proc; kill?: (pid: number) => Promise<void>; killSync?: (pid: number) => void; alive?: (ppid: number) => boolean; intervalMs?: number; watchParent?: boolean }

const STOPS: Array<[string, number]> = [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129], ['SIGBREAK', 149]];

export function guardChildren(children: () => readonly { pid?: number }[], deps: GuardDeps = {}): { release(): void } {
  const proc = deps.proc ?? process, kill = deps.kill ?? killTree, killSync = deps.killSync ?? killTreeSync, alive = deps.alive ?? parentAlive;
  const parent = proc.ppid;
  const pids = () => children().flatMap((child) => (child.pid ? [child.pid] : []));
  let stopping = false;
  const stop = async (code: number) => {
    if (stopping) return;
    stopping = true;
    await Promise.all(pids().map((pid) => kill(pid)));
    proc.exit(code);
  };
  const handlers = STOPS.map(([signal, code]) => [signal, () => { void stop(code); }] as const);
  for (const [signal, handler] of handlers) proc.on(signal, handler);
  const onExit = () => { if (!stopping) for (const pid of pids()) killSync(pid); };
  proc.on('exit', onExit);
  const timer = deps.watchParent === false ? null : setInterval(() => { if (!alive(parent)) void stop(1); }, deps.intervalMs ?? 2000);
  timer?.unref?.();
  return { release() { if (timer) clearInterval(timer); for (const [signal, handler] of handlers) proc.off(signal, handler); proc.off('exit', onExit); } };
}

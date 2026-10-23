import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { guardChildren, killTree, parentAlive } from './childTree.mts';
import { spawnShellWrapper } from './fixtures/treeShell.mts';

const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function killedWrapper(mode: 'guard' | 'bare', waitMs: number) {
  const wrapper = spawnShellWrapper(mode);
  const pids = await new Promise<{ driver: number; child: number }>((resolve, reject) => {
    let text = '';
    wrapper.stdout.on('data', (chunk) => { text += chunk; const line = text.split(/\r?\n/).find((row) => row.startsWith('{')); if (line) resolve(JSON.parse(line)); });
    wrapper.once('exit', () => reject(new Error('the wrapper exited before its driver started')));
  });
  wrapper.kill();
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline && alive(pids.child)) await sleep(100);
  const childAlive = alive(pids.child);
  await killTree(pids.driver);
  if (alive(pids.child)) await killTree(pids.child);
  return { childAlive };
}

test('a driver whose wrapper shell is killed leaves its node child running unless it guards its children', async () => {
  assert.equal((await killedWrapper('bare', 4000)).childAlive, true);
  assert.equal((await killedWrapper('guard', 30_000)).childAlive, false);
});

test('the guard tree-kills children on a stop signal and when the parent is gone, once, and taskkill /T is the Windows tree kill', async () => {
  const proc = Object.assign(new EventEmitter(), { ppid: 7, exitCode: undefined as number | undefined, exit(code: number) { this.exitCode = code; } });
  const killed: number[] = [];
  let parent = true;
  const guard = guardChildren(() => [{ pid: 11 }, { pid: undefined }], { proc, kill: async (pid) => { killed.push(pid); }, killSync: (pid) => { killed.push(-pid); },
    alive: () => parent, intervalMs: 10 });
  proc.emit('SIGTERM');
  proc.emit('SIGINT');
  await sleep(5);
  assert.deepEqual(killed, [11]);
  assert.equal(proc.exitCode, 143);
  guard.release();
  killed.length = 0; proc.exitCode = undefined;
  const orphan = guardChildren(() => [{ pid: 12 }], { proc, kill: async (pid) => { killed.push(pid); }, killSync: (pid) => { killed.push(-pid); }, alive: () => parent, intervalMs: 10 });
  parent = false;
  await sleep(60);
  assert.deepEqual(killed, [12]);
  assert.equal(proc.exitCode, 1);
  orphan.release();
  const exiting = guardChildren(() => [{ pid: 13 }], { proc, kill: async () => {}, killSync: (pid) => { killed.push(-pid); }, alive: () => true, intervalMs: 1000 });
  proc.emit('exit');
  assert.deepEqual(killed, [12, -13]);
  exiting.release();
  const detached = guardChildren(() => [{ pid: 14 }], { proc: { ...proc, on: proc.on.bind(proc), off: proc.off.bind(proc), ppid: 7 }, kill: async (pid) => { killed.push(pid); }, alive: () => false, intervalMs: 5, watchParent: false });
  await sleep(30);
  assert.deepEqual(killed, [12, -13]);
  detached.release();
  const calls: unknown[][] = [];
  await killTree(42, 'win32', ((file: string, args: string[], done: () => void) => { calls.push([file, args]); done(); }) as never);
  assert.deepEqual(calls, [['taskkill.exe', ['/pid', '42', '/t', '/f']]]);
  assert.equal(parentAlive(1, () => { throw Object.assign(new Error('no'), { code: 'ESRCH' }); }), false);
  assert.equal(parentAlive(1, () => { throw Object.assign(new Error('denied'), { code: 'EPERM' }); }), true);
});

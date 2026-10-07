import { test } from 'node:test';
import assert from 'node:assert/strict';
import { superviseTunnel, tunnelWindow, type TunnelEvent, type TunnelProc } from './podTunnel.mts';

function harness(script: Array<number | 'exit'>, { stopAfter = Infinity } = {}) {
  let clock = Date.parse('2026-10-07T10:00:00.000Z');
  const events: TunnelEvent[] = [];
  const spawned: number[] = [];
  let exit: ((code: number) => void) | null = null;
  let step = 0;
  let pid = 100;
  return {
    events,
    spawned,
    deps: {
      target: () => ({ host: '1.2.3.4', sshPort: 17235, localPort: 18080 }),
      spawn(): TunnelProc {
        pid += 1;
        spawned.push(pid);
        const exited = new Promise<number | null>((done) => { exit = done; });
        return { pid, exited, kill: () => exit?.(0) };
      },
      async probe() {
        const next = script[step++];
        if (next === 'exit') {
          exit?.(255);
          await Promise.resolve();
          return 0;
        }
        return next ?? 200;
      },
      record: (event: TunnelEvent) => events.push(event),
      now: () => new Date(clock),
      sleep: async (ms: number) => { clock += ms; await Promise.resolve(); },
      stopped: () => step >= stopAfter,
      probeMs: 10_000,
      heartbeatMs: 60_000,
      backoffMs: 5_000,
    },
  };
}

test('the supervisor logs connect, drop, ssh exit and reconnect with timestamps, and stops cleanly', async () => {
  const run = harness([0, 200, 200, 0, 200, 'exit', 503, 200], { stopAfter: 8 });
  await superviseTunnel(run.deps);
  const kinds = run.events.map((event) => event.kind);
  assert.deepEqual(kinds.filter((kind) => kind !== 'heartbeat' && kind !== 'health'), ['spawn', 'up', 'down', 'up', 'down', 'exit', 'spawn', 'up', 'stop']);
  assert.equal(run.spawned.length, 2, 'one reconnect after the ssh process died');
  assert.equal(run.events.find((event) => event.kind === 'exit')!.code, 255);
  assert.ok(run.events.every((event) => Number.isFinite(Date.parse(event.at))));
  assert.ok(run.events.some((event) => event.kind === 'health' && event.health === 503), 'a loading server (503) is a reachable tunnel, recorded as health');
});

test('a heartbeat is written while nothing changes, so a long quiet row still proves the supervisor ran', async () => {
  const run = harness(Array(20).fill(200), { stopAfter: 20 });
  await superviseTunnel(run.deps);
  assert.ok(run.events.filter((event) => event.kind === 'heartbeat').length >= 2);
});

const at = (iso: string) => Date.parse(iso);
const ev = (time: string, kind: TunnelEvent['kind'], extra: Partial<TunnelEvent> = {}): TunnelEvent => ({ at: time, kind, ...extra });

test('tunnel window: state at row start, drops inside, and a supervisor that was not running is a problem', () => {
  const events = [
    ev('2026-10-07T10:00:00Z', 'spawn'), ev('2026-10-07T10:00:05Z', 'up'),
    ev('2026-10-07T10:01:05Z', 'heartbeat', { state: 'up' }),
    ev('2026-10-07T10:01:30Z', 'down'), ev('2026-10-07T10:01:31Z', 'exit', { code: 255 }), ev('2026-10-07T10:01:36Z', 'spawn'), ev('2026-10-07T10:01:40Z', 'up'),
    ev('2026-10-07T10:02:40Z', 'heartbeat', { state: 'up' }),
  ];
  const window = tunnelWindow(events, at('2026-10-07T10:01:10Z'), at('2026-10-07T10:02:45Z'));
  assert.equal(window.stateAtStart, 'up');
  assert.equal(window.drops.length, 1);
  assert.equal(window.ups.length, 1);
  assert.deepEqual(window.problems, []);
  assert.match(tunnelWindow([], 0, 1).problems.join(' '), /was not running/);
  const stoppedEarly = tunnelWindow([...events.slice(0, 3), ev('2026-10-07T10:01:20Z', 'stop')], at('2026-10-07T10:01:10Z'), at('2026-10-07T10:09:00Z'));
  assert.match(stoppedEarly.problems.join(' '), /stopped during the row/);
  const lateStart = tunnelWindow([ev('2026-10-07T11:00:00Z', 'spawn')], at('2026-10-07T10:00:00Z'), at('2026-10-07T11:00:01Z'));
  assert.match(lateStart.problems.join(' '), /near the row start/);
});

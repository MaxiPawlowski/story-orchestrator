export const PROBE_MS = 10_000;
export const HEARTBEAT_MS = 60_000;
export const BACKOFF_MS = 5_000;
export const BACKOFF_MAX_MS = 60_000;

export type TunnelEventKind = 'spawn' | 'up' | 'down' | 'exit' | 'heartbeat' | 'health' | 'no-target' | 'stop';
export interface TunnelEvent { at: string; kind: TunnelEventKind; pid?: number | null; code?: number | null; host?: string; sshPort?: number; localPort?: number; health?: number; state?: 'up' | 'down'; reason?: string }

export interface TunnelProc { pid: number | null; exited: Promise<number | null>; kill(): void }
export interface TunnelTarget { host: string; sshPort: number; localPort: number }

export interface TunnelDeps {
  target(): TunnelTarget | null;
  spawn(target: TunnelTarget): TunnelProc;
  probe(target: TunnelTarget): Promise<number>;
  record(event: TunnelEvent): void;
  now(): Date;
  sleep(ms: number): Promise<void>;
  stopped(): boolean;
  probeMs?: number;
  heartbeatMs?: number;
  backoffMs?: number;
  backoffMaxMs?: number;
}

export async function superviseTunnel(deps: TunnelDeps): Promise<void> {
  const probeMs = deps.probeMs ?? PROBE_MS;
  const heartbeatMs = deps.heartbeatMs ?? HEARTBEAT_MS;
  let backoff = deps.backoffMs ?? BACKOFF_MS;
  const at = () => deps.now().toISOString();
  while (!deps.stopped()) {
    const target = deps.target();
    if (!target) {
      deps.record({ at: at(), kind: 'no-target', reason: 'no target.json (so-pod.mts target <k> --host <ip> --ssh-port <port>)' });
      await deps.sleep(backoff);
      continue;
    }
    const proc = deps.spawn(target);
    let exitCode: number | null | undefined;
    proc.exited.then((code) => { exitCode = code; }, () => { exitCode = null; });
    deps.record({ at: at(), kind: 'spawn', pid: proc.pid, host: target.host, sshPort: target.sshPort, localPort: target.localPort });
    let state: 'up' | 'down' | 'connecting' = 'connecting';
    let health: number | null = null;
    let lastBeat = deps.now().getTime();
    while (exitCode === undefined && !deps.stopped()) {
      const status = await deps.probe(target).catch(() => 0);
      if (exitCode !== undefined) break;
      if (status > 0 && state !== 'up') {
        state = 'up';
        backoff = deps.backoffMs ?? BACKOFF_MS;
        deps.record({ at: at(), kind: 'up', pid: proc.pid, localPort: target.localPort, health: status });
      } else if (status === 0 && state === 'up') {
        state = 'down';
        deps.record({ at: at(), kind: 'down', pid: proc.pid, reason: 'probe failed while the ssh process is alive' });
      }
      if (status > 0 && status !== health) deps.record({ at: at(), kind: 'health', health: status });
      if (status > 0) health = status;
      const now = deps.now().getTime();
      if (now - lastBeat >= heartbeatMs) {
        deps.record({ at: at(), kind: 'heartbeat', state: state === 'up' ? 'up' : 'down', health: health ?? 0 });
        lastBeat = now;
      }
      await Promise.race([deps.sleep(probeMs), proc.exited.catch(() => null)]);
    }
    if (deps.stopped()) {
      proc.kill();
      deps.record({ at: at(), kind: 'stop', pid: proc.pid, state: state === 'up' ? 'up' : 'down' });
      return;
    }
    if (state === 'up') deps.record({ at: at(), kind: 'down', pid: proc.pid, reason: 'ssh exited' });
    deps.record({ at: at(), kind: 'exit', pid: proc.pid, code: exitCode ?? null });
    await deps.sleep(backoff);
    backoff = Math.min(backoff * 2, deps.backoffMaxMs ?? BACKOFF_MAX_MS);
  }
}

export interface TunnelWindow { stateAtStart: 'up' | 'down' | 'unknown'; aliveAtStart: boolean; aliveAtEnd: boolean; drops: TunnelEvent[]; ups: TunnelEvent[]; events: number; problems: string[] }

export function tunnelWindow(events: TunnelEvent[], start: number, end: number, { staleMs = 2 * HEARTBEAT_MS + PROBE_MS } = {}): TunnelWindow {
  const time = (event: TunnelEvent) => Date.parse(event.at);
  const sorted = events.filter((event) => Number.isFinite(time(event))).sort((a, b) => time(a) - time(b));
  const before = sorted.filter((event) => time(event) <= start);
  const inside = sorted.filter((event) => time(event) > start && time(event) <= end);
  let stateAtStart: TunnelWindow['stateAtStart'] = 'unknown';
  for (const event of before) {
    if (event.kind === 'up') stateAtStart = 'up';
    else if (event.kind === 'down' || event.kind === 'exit' || event.kind === 'stop' || event.kind === 'no-target') stateAtStart = 'down';
    else if (event.kind === 'heartbeat' && event.state) stateAtStart = event.state;
  }
  const lastBefore = before[before.length - 1];
  const aliveAtStart = Boolean(lastBefore && start - time(lastBefore) <= staleMs && lastBefore.kind !== 'stop') || inside.some((event) => time(event) - start <= staleMs);
  const last = sorted.filter((event) => time(event) <= end + 5_000).pop();
  const aliveAtEnd = Boolean(last && end - time(last) <= staleMs && last.kind !== 'stop');
  const problems: string[] = [];
  if (!sorted.length) problems.push('no tunnel events: the tunnel supervisor (so-pod.mts up) was not running');
  else {
    if (!aliveAtStart) problems.push('the tunnel supervisor logged nothing near the row start: it was not running');
    if (!aliveAtEnd) problems.push('the tunnel supervisor logged nothing near the row end: it stopped during the row');
  }
  return { stateAtStart, aliveAtStart, aliveAtEnd, drops: inside.filter((event) => event.kind === 'down'), ups: inside.filter((event) => event.kind === 'up'), events: inside.length, problems };
}

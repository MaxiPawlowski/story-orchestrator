import type { WriteResult } from "@utils/writeResult";
import { loopTargetId, nextTarget, type LoopTarget } from "./plan";

export interface ResolvedLoop { key: string; target: LoopTarget }

export interface LoopSchedulerDeps {
  enabled(): boolean;
  idle(): Promise<boolean>;
  resolve(target: LoopTarget, signal: AbortSignal): Promise<ResolvedLoop | null>;
  cached(key: string, signal: AbortSignal): Promise<string | null>;
  render(loop: ResolvedLoop, signal: AbortSignal): Promise<WriteResult<{ url: string }>>;
  publish(target: LoopTarget, url: string): void;
  retryable?(reason: string): boolean;
  wait(ms: number, signal: AbortSignal): Promise<void>;
  log?(event: string, detail: Record<string, unknown>): void;
}

export const LOOP_IDLE_RECHECK_MS = 15_000;
export const LOOP_FAILURES_PER_TARGET = 2;

export class LoopScheduler {
  private pre: LoopTarget[] = [];
  private current: LoopTarget | null = null;
  private settled = new Set<string>();
  private failures = new Map<string, number>();
  private session: AbortController | null = null;
  private job: AbortController | null = null;
  private kick: (() => void) | null = null;

  constructor(private readonly deps: LoopSchedulerDeps) {}

  start(pre: readonly LoopTarget[], current: LoopTarget | null): void {
    this.stop();
    this.pre = [...pre];
    this.current = current;
    this.session = new AbortController();
    void this.pump(this.session.signal);
  }

  setCurrent(current: LoopTarget | null): void {
    this.current = current;
    this.wake();
  }

  preempt(): boolean {
    if (!this.job) return false;
    this.job.abort();
    return true;
  }

  stop(): void {
    this.session?.abort();
    this.session = null;
    this.job?.abort();
    this.job = null;
    this.settled = new Set();
    this.failures = new Map();
  }

  wake(): void { this.kick?.(); }

  get busy(): boolean { return this.job !== null; }

  private async idleWait(ms: number, signal: AbortSignal): Promise<void> {
    const local = new AbortController();
    const stop = () => local.abort();
    signal.addEventListener("abort", stop, { once: true });
    this.kick = stop;
    try { await this.deps.wait(ms, local.signal).catch(() => undefined); }
    finally { this.kick = null; signal.removeEventListener("abort", stop); }
  }

  private async pump(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      const target = this.deps.enabled() ? nextTarget(this.current, this.pre, this.settled) : null;
      if (!target) { await this.idleWait(60_000, signal); continue; }
      const id = loopTargetId(target);
      const resolved = await this.deps.resolve(target, signal).catch(() => null);
      if (signal.aborted) return;
      if (!resolved) { this.settled.add(id); continue; }
      const hit = await this.deps.cached(resolved.key, signal).catch(() => null);
      if (signal.aborted) return;
      if (hit) { this.settled.add(id); this.deps.publish(target, hit); this.deps.log?.("hit", { key: resolved.key, mode: target.mode }); continue; }
      if (!(await this.deps.idle())) { await this.idleWait(LOOP_IDLE_RECHECK_MS, signal); continue; }
      if (signal.aborted) return;
      const job = new AbortController();
      const forward = () => job.abort();
      signal.addEventListener("abort", forward, { once: true });
      this.job = job;
      let result: WriteResult<{ url: string }> | null = null;
      try { result = await this.deps.render(resolved, job.signal); }
      catch (error) { result = job.signal.aborted ? null : { ok: false, reason: error instanceof Error ? error.message : String(error) }; }
      finally { this.job = null; signal.removeEventListener("abort", forward); }
      if (signal.aborted) return;
      if (!result || (!result.ok && this.deps.retryable?.(result.reason))) { this.deps.log?.("preempted", { key: resolved.key }); await this.idleWait(LOOP_IDLE_RECHECK_MS, signal); continue; }
      if (result.ok) { this.settled.add(id); this.deps.publish(target, result.url); this.deps.log?.("rendered", { key: resolved.key, mode: target.mode }); continue; }
      const failures = (this.failures.get(id) ?? 0) + 1;
      this.failures.set(id, failures);
      this.deps.log?.("failed", { key: resolved.key, reason: result.reason, failures });
      if (failures >= LOOP_FAILURES_PER_TARGET) this.settled.add(id);
      else await this.idleWait(LOOP_IDLE_RECHECK_MS, signal);
    }
  }
}

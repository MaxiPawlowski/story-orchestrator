export const hostGenerating = async (): Promise<boolean> => (await import("@services/stHost/generation")).isHostGenerating();

export async function waitForTextPriority(deps: {
  status(): Promise<{ activeText?: number; waitingText?: number; fairImages?: boolean } | null>;
  current(): boolean;
  now(): number;
  sleep(): Promise<void>;
  signal: AbortSignal;
  loud?(): Promise<boolean>;
}, timeoutMs = 600_000): Promise<void> {
  const deadline = deps.now() + timeoutMs;
  for (;;) {
    deps.signal.throwIfAborted();
    if (!deps.current()) throw new Error("The look changed while waiting for the text model.");
    const status = await deps.status();
    deps.signal.throwIfAborted();
    if (!deps.current()) throw new Error("The look changed while waiting for the text model.");
    const loud = await deps.loud?.() ?? false;
    deps.signal.throwIfAborted();
    if (!loud && (!status || status.fairImages || !(status.activeText || status.waitingText))) return;
    if (deps.now() >= deadline) throw new Error("Text requests are still waiting. The changed-look render was deferred.");
    await deps.sleep();
  }
}

export async function outsideTurns(deps: { loud(): Promise<boolean>; sleep(): Promise<void>; signal: AbortSignal }): Promise<void> {
  while (await deps.loud()) { deps.signal.throwIfAborted(); await deps.sleep(); }
  deps.signal.throwIfAborted();
}

export async function leaseOutsideTurns<Lease>(deps: {
  acquire(): Promise<Lease>;
  release(lease: Lease): Promise<void>;
  loud(): Promise<boolean>;
  sleep(): Promise<void>;
  signal: AbortSignal;
}): Promise<Lease> {
  for (;;) {
    await outsideTurns(deps);
    const lease = await deps.acquire();
    if (!await deps.loud()) return lease;
    await deps.release(lease);
  }
}

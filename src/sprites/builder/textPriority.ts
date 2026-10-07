export async function waitForTextPriority(deps: {
  status(): Promise<{ activeText?: number; waitingText?: number } | null>;
  current(): boolean;
  now(): number;
  sleep(): Promise<void>;
  signal: AbortSignal;
}, timeoutMs = 600_000): Promise<void> {
  const deadline = deps.now() + timeoutMs;
  for (;;) {
    deps.signal.throwIfAborted();
    if (!deps.current()) throw new Error("The look changed while waiting for the text model.");
    const status = await deps.status();
    deps.signal.throwIfAborted();
    if (!deps.current()) throw new Error("The look changed while waiting for the text model.");
    if (!status || !(status.activeText || status.waitingText)) return;
    if (deps.now() >= deadline) throw new Error("Text requests are still waiting. The changed-look render was deferred.");
    await deps.sleep();
  }
}

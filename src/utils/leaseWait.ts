export const LEASE_BUSY = /already owns the local GPU/;
export const LEASE_RAM_SHORT = /Host RAM is short/;
export const LEASE_PATIENCE_MS = 15 * 60_000;
export const RAM_SHORT_STEP_MS = 20_000;

export interface BusyWait { signal?: AbortSignal; now(): number; sleep(ms: number, signal?: AbortSignal): Promise<void>; patienceMs?: number; stepMs?: number; held?: () => boolean }

export async function waitWhileBusy<T>(attempt: () => Promise<T>, wait: BusyWait): Promise<T> {
  let deadline = wait.now() + (wait.patienceMs ?? LEASE_PATIENCE_MS);
  for (;;) {
    if (wait.held?.()) {
      const start = wait.now();
      wait.signal?.throwIfAborted();
      await wait.sleep(wait.stepMs ?? 1500, wait.signal);
      deadline += wait.now() - start;
      continue;
    }
    try { return await attempt(); }
    catch (error) {
      const ramShort = error instanceof Error && LEASE_RAM_SHORT.test(error.message);
      if (!(error instanceof Error) || !(ramShort || LEASE_BUSY.test(error.message)) || wait.now() >= deadline) throw error;
      wait.signal?.throwIfAborted();
      await wait.sleep(ramShort ? RAM_SHORT_STEP_MS : wait.stepMs ?? 1500, wait.signal);
      wait.signal?.throwIfAborted();
    }
  }
}

export const abortableSleep = (ms: number, signal?: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
});

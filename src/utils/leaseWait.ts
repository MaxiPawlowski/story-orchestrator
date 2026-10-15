export const LEASE_BUSY = /already owns the local GPU/;
export const LEASE_PATIENCE_MS = 15 * 60_000;

export interface BusyWait { signal?: AbortSignal; now(): number; sleep(ms: number, signal?: AbortSignal): Promise<void>; patienceMs?: number; stepMs?: number }

export async function waitWhileBusy<T>(attempt: () => Promise<T>, wait: BusyWait): Promise<T> {
  const deadline = wait.now() + (wait.patienceMs ?? LEASE_PATIENCE_MS);
  for (;;) {
    try { return await attempt(); }
    catch (error) {
      if (!(error instanceof Error) || !LEASE_BUSY.test(error.message) || wait.now() >= deadline) throw error;
      wait.signal?.throwIfAborted();
      await wait.sleep(wait.stepMs ?? 1500, wait.signal);
      wait.signal?.throwIfAborted();
    }
  }
}

export const abortableSleep = (ms: number, signal?: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
});

import { JUDGE_BUSY_RETRY_MS, JUDGE_DEFAULT_MAX_IN_FLIGHT } from "./policy";

export class JudgeBusyError extends Error {
  constructor(readonly status: number) {
    super(`judge plugin busy (${status})`);
    this.name = "JudgeBusyError";
  }
}

export class JudgeGateCancelledError extends Error {
  constructor() {
    super("judge call cancelled while queued");
    this.name = "AbortError";
  }
}

export const isJudgeBusy = (error: unknown): error is JudgeBusyError => error instanceof JudgeBusyError;

export interface JudgeGate {
  acquire(signal?: AbortSignal): Promise<() => void>;
  setCapacity(capacity: number): void;
  capacity(): number;
  inFlight(): number;
  queued(): number;
  backoff(attempt: number, signal?: AbortSignal): Promise<void>;
}

interface Waiter {
  grant: (release: () => void) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) {
    reject(new JudgeGateCancelledError());
    return;
  }
  const onAbort = () => { clearTimeout(timer); reject(new JudgeGateCancelledError()); };
  const timer = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms);
  signal?.addEventListener("abort", onAbort, { once: true });
});

const validCapacity = (value: number) => (Number.isFinite(value) && value >= 1 ? Math.floor(value) : JUDGE_DEFAULT_MAX_IN_FLIGHT);

export function createJudgeGate(options: { capacity?: number; retryMs?: number; wait?: (ms: number, signal?: AbortSignal) => Promise<void> } = {}): JudgeGate {
  let limit = validCapacity(options.capacity ?? JUDGE_DEFAULT_MAX_IN_FLIGHT);
  let running = 0;
  const waiting: Waiter[] = [];
  const wait = options.wait ?? sleep;
  const retryMs = options.retryMs ?? JUDGE_BUSY_RETRY_MS;

  const release = () => {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      running -= 1;
      drain();
    };
  };

  const drain = () => {
    while (running < limit && waiting.length) {
      const next = waiting.shift() as Waiter;
      if (next.onAbort) next.signal?.removeEventListener("abort", next.onAbort);
      running += 1;
      next.grant(release());
    }
  };

  return {
    acquire(signal) {
      if (signal?.aborted) return Promise.reject(new JudgeGateCancelledError());
      if (running < limit && !waiting.length) {
        running += 1;
        return Promise.resolve(release());
      }
      return new Promise((resolve, reject) => {
        const waiter: Waiter = { grant: resolve, ...(signal ? { signal } : {}) };
        if (signal) {
          waiter.onAbort = () => {
            const index = waiting.indexOf(waiter);
            if (index >= 0) waiting.splice(index, 1);
            reject(new JudgeGateCancelledError());
          };
          signal.addEventListener("abort", waiter.onAbort, { once: true });
        }
        waiting.push(waiter);
      });
    },
    setCapacity(capacity) {
      limit = validCapacity(capacity);
      drain();
    },
    capacity: () => limit,
    inFlight: () => running,
    queued: () => waiting.length,
    backoff: (attempt, signal) => wait(retryMs * attempt, signal),
  };
}

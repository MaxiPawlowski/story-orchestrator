export const YIELD_MAX_MS = 15_000;

export const READ_WAIT_BOUND_MS = 120_000;

export const unrefTimer = (timer: unknown): void => {
  if (timer && typeof timer === "object" && "unref" in timer && typeof timer.unref === "function") timer.unref();
};

export type YieldOutcome = "settled" | "expired";

export const boundedWait = (ahead: Promise<unknown>, ms = YIELD_MAX_MS): Promise<YieldOutcome> => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const bound = new Promise<YieldOutcome>((resolve) => { timer = globalThis.setTimeout(() => resolve("expired"), ms); });
  const settled = Promise.resolve(ahead).then((): YieldOutcome => "settled", (): YieldOutcome => "settled");
  return Promise.race([settled, bound]).finally(() => { if (timer !== null) globalThis.clearTimeout(timer); });
};

export class YieldGate {
  private waiting: Promise<void> | null = null;
  private spent = false;

  private readonly resume: Array<() => unknown>;

  constructor(private readonly ahead: () => Promise<unknown> | null | undefined, ...resume: Array<() => unknown>) {
    this.resume = resume;
  }

  isWaiting(): boolean {
    return this.waiting !== null;
  }

  holds(): boolean {
    if (this.waiting) return true;
    const ahead = this.spent ? null : this.ahead();
    this.spent = false;
    if (!ahead) return false;
    const waiting = boundedWait(ahead).then((outcome) => {
      if (this.waiting !== waiting) return;
      this.waiting = null;
      this.spent = outcome === "expired";
      this.resume.forEach((wake) => { void wake(); });
    });
    this.waiting = waiting;
    return true;
  }
}

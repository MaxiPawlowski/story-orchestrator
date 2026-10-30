export const YIELD_MAX_MS = 15_000;

export const READ_WAIT_BOUND_MS = 120_000;

const unrefTimer = (timer: unknown): void => {
  if (timer && typeof timer === "object" && "unref" in timer && typeof timer.unref === "function") timer.unref();
};

export const readWaitClock = (changed: () => void) => {
  let since: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return <T extends { inFlight: boolean }>(snapshot: T): T & { inFlightSince: number | null } => {
    if (snapshot.inFlight && since === null) {
      since = Date.now();
      timer = globalThis.setTimeout(changed, READ_WAIT_BOUND_MS + 50);
      unrefTimer(timer);
    }
    if (!snapshot.inFlight && since !== null) {
      since = null;
      if (timer !== null) globalThis.clearTimeout(timer);
      timer = null;
    }
    return { ...snapshot, inFlightSince: since };
  };
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

  holdsNoting(changed: () => void): boolean {
    const before = this.isWaiting();
    const holds = this.holds();
    if (holds !== before) changed();
    return holds;
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

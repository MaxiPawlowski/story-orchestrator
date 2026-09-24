type SignalStatics = typeof AbortSignal & { any?: (signals: AbortSignal[]) => AbortSignal };

const statics: SignalStatics = AbortSignal;

export const NEVER_ABORTS: AbortSignal = new AbortController().signal;

export function anySignal(signals: Array<AbortSignal | null | undefined>): AbortSignal {
  const live = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  if (!live.length) return NEVER_ABORTS;
  if (live.length === 1) return live[0];
  if (typeof statics.any === "function") return statics.any(live);
  const controller = new AbortController();
  const aborted = live.find((signal) => signal.aborted);
  if (aborted) {
    controller.abort(aborted.reason);
    return controller.signal;
  }
  const detach = () => live.forEach((signal) => signal.removeEventListener("abort", onAbort));
  function onAbort(this: AbortSignal) {
    detach();
    controller.abort(this.reason);
  }
  live.forEach((signal) => signal.addEventListener("abort", onAbort, { once: true }));
  return controller.signal;
}

export const abortReasonName = (signal: AbortSignal | null | undefined): string | null => {
  if (!signal?.aborted) return null;
  const reason: unknown = signal.reason;
  return typeof reason === "object" && reason !== null && "name" in reason && typeof reason.name === "string" ? reason.name : "AbortError";
};

export const timeoutAbortReason = (message: string): Error => {
  const error = new Error(message);
  error.name = "TimeoutError";
  return error;
};

import type { ModelFailureKind } from "@services/STAPI";
import { TIMEOUT_RETRY_SCALE } from "./callBudget";

export class ModelCallError extends Error {
  constructor(readonly kind: ModelFailureKind, message: string, readonly profileId: string | null = null, readonly timeoutMs: number | null = null) {
    super(message);
    this.name = "ModelCallError";
  }
}

export const isLapse = (error: unknown): boolean => error instanceof ModelCallError && error.kind === "lapsed";

export const lapseAsEmpty = (error: unknown): string => {
  if (isLapse(error)) return "";
  throw error;
};

export const isTimeout = (error: unknown): error is ModelCallError => error instanceof ModelCallError && error.kind === "timeout";

/** v2.4 acceptance A11: a timed-out call gets one more ask at TIMEOUT_RETRY_SCALE times its budget, then gives up naming both. */
export async function retryOnTimeout<T>(ask: (timeoutScale: number) => Promise<T>): Promise<T> {
  try {
    return await ask(1);
  } catch (first) {
    if (!isTimeout(first)) throw first;
    try {
      return await ask(TIMEOUT_RETRY_SCALE);
    } catch (retry) {
      if (!isTimeout(retry)) throw retry;
      throw new ModelCallError("timeout", `the memory model did not answer within ${first.timeoutMs} ms, nor within ${retry.timeoutMs} ms on one retry`, retry.profileId, retry.timeoutMs);
    }
  }
}

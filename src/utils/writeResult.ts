// v2.3 plan 06. R3 was a `false` read as success, so every host WRITE answers with a result that
// says whether it reached the host and, when it did not, why. `reason` is player-safe wording: it is
// what the requirements panel and the journal show, so "the backend cannot take this" reads the same
// whether it came from a probe or from the write itself.
//
// It lives in `utils/` rather than in `stHost/` because it is a SHAPE, not a host seam: a component
// that reports why a write failed must not reach past `STAPI.ts` into the host modules to name it.
export type WriteResult<T extends object = Record<never, never>> =
  | ({ ok: true } & T)
  | { ok: false; reason: string };

export const wrote = <T extends object>(detail: T = {} as T): WriteResult<T> => ({ ok: true, ...detail });

export const couldNot = (reason: string): WriteResult<never> => ({ ok: false, reason });

export function describeFailure(result: { ok: false; reason: string } | { ok: true }): string | null {
  return result.ok ? null : result.reason;
}

export const SETTLE_ENV = 'SO_SESSION_SETTLE_MS';
export const DEFAULT_SETTLE_MS = 180000;

export function settleTimeoutMs(env: Record<string, string | undefined> = process.env): number {
  const raw = env[SETTLE_ENV];
  if (raw === undefined || raw === '') return DEFAULT_SETTLE_MS;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${SETTLE_ENV}=${raw} is not a positive number of milliseconds`);
  return Math.round(value);
}

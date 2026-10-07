export const RAM_GATE_ENV = 'SO_MIN_FREE_RAM_GIB';
const GIB = 1024 ** 3;

export const ramGateBytes = (env: Record<string, string | undefined>): number | null => {
  const value = Number(env[RAM_GATE_ENV]);
  return Number.isFinite(value) && value > 0 ? value * GIB : null;
};

export interface RamPause { at: string; freeGiB: number }

export async function waitForFreeRam(minBytes: number | null, deps: { freemem: () => number; sleep: (ms: number) => Promise<unknown>; log: (line: string) => void; now: () => number; intervalMs?: number }, label: string): Promise<{ pausedMs: number; pauses: RamPause[] }> {
  const pauses: RamPause[] = [];
  if (minBytes === null) return { pausedMs: 0, pauses };
  const began = deps.now();
  for (let free = deps.freemem(); free < minBytes; free = deps.freemem()) {
    const freeGiB = Math.round((free / GIB) * 100) / 100;
    pauses.push({ at: new Date(deps.now()).toISOString(), freeGiB });
    deps.log(`PAUSE ${label}: free RAM ${freeGiB} GiB < ${Math.round((minBytes / GIB) * 100) / 100} GiB, waiting`);
    await deps.sleep(deps.intervalMs ?? 60000);
  }
  return { pausedMs: pauses.length ? deps.now() - began : 0, pauses };
}

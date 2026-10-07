import { gpuBrokerStatus } from "@services/stHost/gpuBroker";
import { beginRun, type RunOwnership } from "@runtime/runToken";
import { waitForTextPriority } from "./textPriority";
import { SpriteBatchLease } from "./batchLease";
import { log } from "@utils/log";

let active: SpriteBatchLease | null = null;
let closeActive: (() => Promise<void>) | null = null;

export const activeSpriteBatch = (): SpriteBatchLease | null => active;
export const endSpriteBatch = async (): Promise<void> => { await closeActive?.(); };

export async function beginSpriteBatch(ownership: RunOwnership): Promise<() => Promise<void>> {
  if (active) throw new Error("A sprite-build batch is already open.");
  const run = beginRun(ownership);
  const batch = new SpriteBatchLease({ current: () => run.stillOwns(),
    mayRetain: async () => {
      const status = await gpuBrokerStatus();
      return status?.adapter === "managed" && status.guarding && status.activeText === 0 && status.waitingText === 0
        && (status.gpuFreeMiB ?? 0) >= 2048 && (status.ramAvailableMiB ?? 0) >= 4096;
    },
    waitForText: () => waitForTextPriority({ status: gpuBrokerStatus, current: () => run.stillOwns(), signal: run.signal,
      now: Date.now, sleep: () => new Promise((done) => setTimeout(done, 250)) }),
    schedule: (work, ms) => setTimeout(work, ms), unschedule: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
    failed: (error) => log.warn("The sprite batch could not release its GPU lease", error),
  });
  active = batch;
  const close = async () => { try { await batch.close(); } finally { if (active === batch) { active = null; closeActive = null; } run.release(); } };
  closeActive = close;
  run.signal.addEventListener("abort", () => { void close().catch((error) => log.warn("The departed sprite batch could not close", error)); }, { once: true });
  return close;
}

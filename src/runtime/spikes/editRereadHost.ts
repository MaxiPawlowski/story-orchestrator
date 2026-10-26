import { rollbackRereadReason } from "@extraction/rereadReason";
import type { SchedulerJob } from "@extraction/scheduler";
import type { RuntimeManager } from "../runtimeManager";
import type { RunGuard } from "../runToken";
import { EDIT_HOLD_CAP_MS, type RereadOutcome } from "./editReread";

export const EDIT_READ_WINDOW = 8;

export interface EditReadLane {
  schedule(job: SchedulerJob): void;
}

export const editReadWindow = (messageId: number) => ({ from: Math.max(0, messageId - EDIT_READ_WINDOW + 1), to: messageId });

export const readEdited = async (manager: Pick<RuntimeManager, "runExtractionNow">, messageId: number, run: RunGuard,
  lane: EditReadLane | null = null, capMs = EDIT_HOLD_CAP_MS): Promise<RereadOutcome> => {
  if (!run.stillOwns()) return "unread";
  const reason = rollbackRereadReason(messageId, "edit");
  const read = async (): Promise<RereadOutcome> => (run.stillOwns() && await manager.runExtractionNow(undefined, reason, editReadWindow(messageId)) ? "committed" : "unread");
  if (!lane) return read();
  return new Promise<RereadOutcome>((resolve) => {
    const timer = globalThis.setTimeout(() => resolve("unread"), capMs);
    const settle = (outcome: RereadOutcome) => { globalThis.clearTimeout(timer); resolve(outcome); };
    lane.schedule({ priority: 0, reason, dropped: () => settle("unread"), run: async () => {
      try { settle(await read()); } catch (error) { settle("unread"); throw error; }
    } });
  });
};

import { log } from "@utils/log";

export type ReplyRepairId = "thought-leak" | "keep-last";

export const REPLY_REPAIR_ORDER: readonly ReplyRepairId[] = ["thought-leak", "keep-last"];

export type ReplyRepair = (messageId: number) => void;

export interface ReplyRepairChain {
  add: (id: ReplyRepairId, repair: ReplyRepair) => () => void;
}

export const createReplyRepairs = (listen: (run: ReplyRepair) => () => void): ReplyRepairChain => {
  const repairs = new Map<ReplyRepairId, ReplyRepair>();
  let stop: (() => void) | null = null;
  const run: ReplyRepair = (messageId) => {
    for (const id of REPLY_REPAIR_ORDER) {
      const repair = repairs.get(id);
      if (!repair) continue;
      try {
        repair(messageId);
      } catch (error) { log.warn("a reply repair failed", id, error); }
    }
  };
  return {
    add: (id, repair) => {
      repairs.set(id, repair);
      stop ??= listen(run);
      return () => {
        if (repairs.get(id) !== repair) return;
        repairs.delete(id);
        if (repairs.size > 0) return;
        stop?.();
        stop = null;
      };
    },
  };
};

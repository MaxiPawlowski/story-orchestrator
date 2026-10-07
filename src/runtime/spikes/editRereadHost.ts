import { rollbackRereadReason } from "@extraction/rereadReason";
import type { RuntimeManager } from "../runtimeManager";
import type { RunGuard } from "../runToken";
import type { RereadOutcome } from "./editReread";

export const EDIT_READ_WINDOW = 8;

export const editReadWindow = (messageId: number) => ({ from: Math.max(0, messageId - EDIT_READ_WINDOW + 1), to: messageId });

export const readEdited = async (manager: Pick<RuntimeManager, "runExtractionNow">, messageId: number, run: RunGuard): Promise<RereadOutcome> => {
  if (!run.stillOwns()) return "unread";
  return (await manager.runExtractionNow(undefined, rollbackRereadReason(messageId, "edit"), editReadWindow(messageId))) ? "committed" : "unread";
};

import { useRef, useState } from "react";
import { busyWork } from "@runtime/busy";
import { log } from "@utils/log";

export const useBusyWork = (work: (() => Promise<unknown> | unknown) | undefined, chatId: string | null = null, disabled = false) => {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!work || lock.current || disabled) return;
    lock.current = true;
    setBusy(true);
    const job = busyWork.begin("action", chatId);
    try { await work(); } catch (error) { log.warn("an action failed", error); } finally {
      lock.current = false;
      setBusy(false);
      job.end();
    }
  };
  return { busy, run };
};

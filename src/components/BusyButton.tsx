import { useRef, useState, type ButtonHTMLAttributes } from "react";
import { busyWork } from "@runtime/busy";
import { log } from "@utils/log";

export interface BusyButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  work: () => Promise<unknown> | unknown;
  chatId?: string | null;
}

export function BusyButton({ work, chatId = null, disabled, children, ...props }: BusyButtonProps) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (lock.current || disabled) return;
    lock.current = true;
    setBusy(true);
    const job = busyWork.begin("action", chatId);
    try { await work(); } catch (error) { log.warn("an action failed", error); } finally {
      lock.current = false;
      setBusy(false);
      job.end();
    }
  };
  return <button type="button" {...props} disabled={disabled || busy} aria-busy={busy} onClick={() => void run()}>{children}</button>;
}

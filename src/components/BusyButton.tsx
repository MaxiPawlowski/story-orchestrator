import type { ButtonHTMLAttributes } from "react";
import { useBusyWork } from "@components/ui/useBusyWork";

export interface BusyButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  work: () => Promise<unknown> | unknown;
  chatId?: string | null;
}

export function BusyButton({ work, chatId = null, disabled, children, ...props }: BusyButtonProps) {
  const { busy, run } = useBusyWork(work, chatId, disabled);
  return <button type="button" {...props} disabled={disabled || busy} aria-busy={busy} onClick={() => void run()}>{children}</button>;
}

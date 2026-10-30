import { useCallback, useState } from "react";
import { StatusText } from "@components/ui/StatusText";

export type ActionOutcome = string | null | void;

export const useActionStatus = () => {
  const [text, setText] = useState<string | null>(null);
  const run = useCallback(async (work: () => Promise<ActionOutcome> | ActionOutcome) => {
    setText(null);
    const outcome = await work();
    setText(typeof outcome === "string" && outcome ? outcome : null);
  }, []);
  return { text, run, show: setText };
};

export const ActionStatus = ({ text, id, tone = "warning" }: { text: string | null; id?: string; tone?: "warning" | "success" | "plain" }) => (text
  ? <StatusText id={id} role="status" data-so="action-status" tone={tone === "warning" ? "warn" : tone === "success" ? "ok" : "neutral"}>{text}</StatusText>
  : null);

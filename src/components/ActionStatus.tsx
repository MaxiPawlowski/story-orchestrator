import { useCallback, useState } from "react";

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
  ? <p id={id} role="status" data-so="action-status" className={`text-xs m-0 ${tone === "warning" ? "so-warning-text" : tone === "success" ? "so-success-text" : ""}`}>{text}</p>
  : null);

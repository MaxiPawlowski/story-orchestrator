import type { ReplyEffort } from "@utils/reasoningEffort";
import { DEFAULT_REPLY_EFFORT, REPLY_EFFORTS } from "@utils/replyEffort";
import { FieldLabel } from "./Field";

export const REPLY_EFFORT_LABELS: Record<ReplyEffort, string> = {
  off: "Off (no thinking)",
  low: "Low (128 tokens)",
  medium: "Medium (400 tokens, recommended)",
  high: "High (no cap)",
};


export const ReplyThinkingField = ({ value, onChange }: { value: ReplyEffort | undefined; onChange: (effort: ReplyEffort) => void }) => (
  <div className="flex flex-col gap-1 text-sm">
    <FieldLabel htmlFor="so-reply-effort" setting="extraction.replyEffort" />
    <select id="so-reply-effort" value={value ?? DEFAULT_REPLY_EFFORT} onChange={(event) => onChange(event.target.value as ReplyEffort)}>
      {REPLY_EFFORTS.map((level) => <option key={level} value={level}>{REPLY_EFFORT_LABELS[level]}</option>)}
    </select>
  </div>
);

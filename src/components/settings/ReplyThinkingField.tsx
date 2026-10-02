import type { ReplyEffort } from "@utils/reasoningEffort";
import { DEFAULT_REPLY_EFFORT, REPLY_EFFORTS } from "@utils/replyEffort";
import { FieldLabel } from "./Field";

export const REPLY_EFFORT_LABELS: Record<ReplyEffort, string> = {
  off: "Off (no thinking)",
  low: "Low (128 tokens)",
  medium: "Medium (400 tokens, recommended)",
  high: "High (no cap)",
};

const HELP = "How long the main chat model may think before each reply in a story chat. Sent per reply, and only when the setup thinks: "
  + "llama.cpp Text Completion whose prompt opens a thought, or llama-server Chat Completion with reasoning requested. Other backends get nothing. "
  + "The memory model never gets it. Medium was as clean as no cap in group narration and starts replying about 8 s sooner; Low broke the form of 2 group replies in 20.";

export const ReplyThinkingField = ({ value, onChange }: { value: ReplyEffort | undefined; onChange: (effort: ReplyEffort) => void }) => (
  <div className="flex flex-col gap-1 text-sm">
    <FieldLabel htmlFor="so-reply-effort" label="Reply thinking" help={HELP} />
    <select id="so-reply-effort" value={value ?? DEFAULT_REPLY_EFFORT} onChange={(event) => onChange(event.target.value as ReplyEffort)}>
      {REPLY_EFFORTS.map((level) => <option key={level} value={level}>{REPLY_EFFORT_LABELS[level]}</option>)}
    </select>
  </div>
);

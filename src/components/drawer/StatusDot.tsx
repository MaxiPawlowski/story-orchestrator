export type StatusTone = "ok" | "warn" | "error";

const TONE_CLASS: Record<StatusTone, string> = { ok: "status-success", warn: "status-warning", error: "status-error" };
const TONE_ICON: Record<StatusTone, string> = { ok: "fa-check", warn: "fa-exclamation", error: "fa-xmark" };

export const StatusIcon = ({ tone }: { tone: StatusTone }) => (
  <span aria-hidden="true" data-tone={tone} className={`status-indicator ${TONE_CLASS[tone]}`}>
    <i className={`fa-solid ${TONE_ICON[tone]}`} />
  </span>
);

export const StatusDot = ({ tone, label, word }: { tone: StatusTone; label: string; word: string }) => (
  <>
    <StatusIcon tone={tone} />
    <span>{label}</span>
    <span data-so="status-word" data-tone={tone} className="so-status-word">{word}</span>
  </>
);

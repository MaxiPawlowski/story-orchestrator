import { keepLastQuestion, type KeepLastQuestionReason } from "@pacing/keepLastQuestion";
import type { WriteResult } from "@utils/writeResult";
import { visibleReplyText } from "./emptyReply";

export interface AskingReply {
  mes: string;
  reasoning: string;
  isUser: boolean;
  name?: string;
}

export interface KeepLastQuestionDeps {
  enabled: () => boolean;
  asking: (speaker: string) => boolean;
  read: (messageId: number) => AskingReply | null;
  write: (messageId: number, text: { mes: string; reasoning: string }) => WriteResult;
  journal: (summary: string, note: string) => void;
}

export const QUESTIONS_TRIMMED = "A line meant to ask you one thing asked more; only its last question was kept";

export const QUESTIONS_KEPT = "A line meant to ask you one thing asked more; it was kept as written";

const REASON_WORDS: Record<KeepLastQuestionReason, string> = {
  empty: "nothing", "too-short": "too few words", unbalanced: "an unclosed quote or action", "question-count": "no single question",
};

export const keepLastQuestionPass = (deps: KeepLastQuestionDeps) => (messageId: number): void => {
  const reply = deps.read(messageId);
  if (!reply || reply.isUser || !reply.name || !visibleReplyText(reply.mes) || !deps.asking(reply.name) || !deps.enabled()) return;
  const result = keepLastQuestion(reply.mes);
  if (result.action === "rejected") {
    deps.journal(QUESTIONS_KEPT, `message ${messageId}: ${result.questions} questions; trimming would leave ${result.reasons.map((reason) => REASON_WORDS[reason]).join(" and ")}`);
    return;
  }
  if (result.action === "untouched" || result.text === reply.mes) return;
  if (!deps.write(messageId, { mes: result.text, reasoning: reply.reasoning }).ok) return;
  deps.journal(QUESTIONS_TRIMMED, result.joined
    ? `message ${messageId}: a short follow-up was joined to its question`
    : `message ${messageId}: ${result.questions} questions down to one, ${result.removedWords} words removed`);
};

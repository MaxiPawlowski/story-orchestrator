import { useId, useState, type FormEvent } from "react";
import type { KnowledgeShowMe } from "@copilot/knowledge/types";
import { ASK_TEXT } from "@features/askCopy";
import { log } from "@utils/log";

export type AskBoxPersona = "player" | "author";

export interface AskAnswerView {
  status: "answered" | "failed";
  answer: string;
  topics: ReadonlyArray<{ id: string; title: string }>;
  showMe: KnowledgeShowMe | null;
}

export type AskBoxReply = AskAnswerView | { error: string };

export interface AskBoxProps {
  persona: AskBoxPersona;
  id?: string;
  onAsk: (question: string) => Promise<AskBoxReply>;
  onShowMe?: (target: KnowledgeShowMe) => void;
  canShow?: (target: KnowledgeShowMe) => boolean;
}

const isError = (reply: AskBoxReply): reply is { error: string } => "error" in reply;

export function AskBox({ persona, id = "so-help-ask", onAsk, onShowMe, canShow = () => true }: AskBoxProps) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<AskBoxReply | null>(null);
  const fieldId = useId();
  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (busy || !question.trim()) return;
    setBusy(true);
    try {
      setReply(await onAsk(question.trim()));
    } catch (caught) {
      log.warn("ask: the question failed", caught);
      setReply({ error: ASK_TEXT.failed });
    } finally {
      setBusy(false);
    }
  };
  const answer = reply && !isError(reply) ? reply : null;
  const showMe = answer?.showMe && onShowMe && canShow(answer.showMe) ? answer.showMe : null;
  return (
    <section id={id} data-so="ask" data-persona={persona} aria-label={ASK_TEXT.heading} className="so-ask flex flex-col gap-2 text-sm">
      <form className="flex flex-col gap-2" onSubmit={(event) => void submit(event)}>
        <label htmlFor={fieldId} className="font-medium text-xs">{ASK_TEXT.question}</label>
        <textarea
          id={fieldId}
          data-so="ask-question"
          className="text_pole"
          rows={2}
          value={question}
          placeholder={persona === "player" ? ASK_TEXT.placeholderPlayer : ASK_TEXT.placeholderAuthor}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) void submit(); }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" data-so="ask-submit" className="menu_button text-xs" disabled={busy || !question.trim()}>{busy ? ASK_TEXT.busy : ASK_TEXT.submit}</button>
          <span data-so="ask-note" className="text-xs opacity-70">{persona === "player" ? ASK_TEXT.playerNote : ASK_TEXT.authorNote}</span>
        </div>
      </form>
      <div data-so="ask-answer" role="status" aria-live="polite" aria-label={ASK_TEXT.answer} className="flex flex-col gap-1">
        {busy && <span className="text-xs opacity-70">{ASK_TEXT.busy}</span>}
        {!busy && reply && isError(reply) && <span data-so="ask-error" className="text-xs so-warning-text">{reply.error}</span>}
        {!busy && answer && <div data-so="ask-text" data-status={answer.status} className="whitespace-pre-wrap">{answer.answer}</div>}
        {!busy && answer && answer.topics.length > 0 && (
          <div className="text-xs opacity-80">
            {ASK_TEXT.from}:{" "}
            {answer.topics.map((topic, index) => (
              <span key={topic.id} data-so="ask-topic" data-topic={topic.id}>{index ? "; " : ""}{topic.title}</span>
            ))}
          </div>
        )}
        {!busy && showMe && onShowMe && (
          <button type="button" data-so="ask-show-me" className="menu_button self-start text-xs" onClick={() => onShowMe(showMe)}>
            {showMe.kind === "doc" ? ASK_TEXT.readMore : ASK_TEXT.showMe}
          </button>
        )}
      </div>
    </section>
  );
}

export default AskBox;

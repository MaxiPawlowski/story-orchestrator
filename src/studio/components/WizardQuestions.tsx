import React, { useState } from "react";
import { YOU_DECIDE, type WizardAnswer, type WizardQuestion } from "@wizard/index";

interface Props {
  questions: WizardQuestion[];
  summary?: string;
  busy?: boolean;
  onAnswer: (answers: WizardAnswer[]) => void;
  onDismiss: () => void;
}

// The interview: the wizard asks before it invents. Every question can be left blank — "You decide"
// hands the whole set back empty and the wizard proceeds under stated defaults, so the author is
// never trapped in a questionnaire.
const WizardQuestions: React.FC<Props> = ({ questions, summary, busy = false, onAnswer, onDismiss }) => {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const set = (id: string, text: string) => setAnswers((previous) => ({ ...previous, [id]: text }));
  const collect = (): WizardAnswer[] => questions.map((question) => ({ id: question.id, text: answers[question.id] ?? "" }));

  return (
    <section id="so-wizard-questions" data-so="wizard-questions" className="st-subpanel flex flex-col gap-2 p-2" aria-label="Wizard questions">
      <div className="flex items-center gap-2">
        <span className="st-pill px-2 py-0.5 text-[10px]">asking first</span>
        <span className="text-sm">{summary || `${questions.length} question(s) before proposing`}</span>
        <button type="button" className="st-button secondary ml-auto" onClick={onDismiss}>Dismiss</button>
      </div>
      {questions.map((question) => (
        <div key={question.id} className="flex flex-col gap-1">
          <label className="text-sm" htmlFor={`so-wizard-answer-${question.id}`}>{question.text}</label>
          {question.why ? <span className="text-[11px] st-muted">{question.why}</span> : null}
          {question.options?.length ? (
            <div className="flex flex-wrap gap-1" role="group" aria-label={`Options for ${question.text}`}>
              {question.options.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`st-tab rounded px-2 py-0.5 text-xs ${answers[question.id] === option ? "st-tab-active" : ""}`}
                  aria-pressed={answers[question.id] === option}
                  onClick={() => set(question.id, option)}
                >
                  {option}
                </button>
              ))}
            </div>
          ) : null}
          <input
            id={`so-wizard-answer-${question.id}`}
            className="text_pole st-input"
            placeholder="Answer, or leave blank and let the wizard decide"
            value={answers[question.id] ?? ""}
            onChange={(event) => set(question.id, event.target.value)}
          />
        </div>
      ))}
      <div className="flex items-center gap-2">
        <button id="so-wizard-answer" type="button" className="st-button primary" disabled={busy} onClick={() => onAnswer(collect())}>{busy ? "Working…" : "Send answers"}</button>
        <button id="so-wizard-you-decide" type="button" className="st-button secondary" disabled={busy} onClick={() => onAnswer(questions.map((question) => ({ id: question.id, text: "" })))}>You decide</button>
        <span className="text-[11px] st-muted">{YOU_DECIDE}</span>
      </div>
    </section>
  );
};

export default WizardQuestions;

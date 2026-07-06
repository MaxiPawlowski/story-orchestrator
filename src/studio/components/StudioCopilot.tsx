import React, { useState } from "react";
import { COPILOT_STAGES, applyOp, type AuthoringStageInput, type CopilotMessage, type CopilotStage, type ProposalResult } from "@copilot/index";
import { useDraftStore } from "../draft";
import ProposalReview from "./ProposalReview";

const STAGE_LABELS: Record<CopilotStage, string> = {
  qualities: "Qualities",
  checkpoints: "Checkpoints",
  transitions: "Transitions",
  effects: "Effects & Cast",
};

type Props = {
  enabled?: boolean;
  runStage?: (input: AuthoringStageInput) => Promise<ProposalResult>;
};

const StudioCopilot: React.FC<Props> = ({ enabled = true, runStage }) => {
  const mutate = useDraftStore((state) => state.mutate);
  const [stage, setStage] = useState<CopilotStage>("qualities");
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<CopilotMessage[]>([]);
  const [result, setResult] = useState<ProposalResult | null>(null);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = enabled && Boolean(runStage);

  const send = async () => {
    if (!runStage || busy) return;
    const authorText = message.trim();
    setBusy(true);
    setError(null);
    const nextHistory: CopilotMessage[] = authorText ? [...history, { role: "author", text: authorText }] : history;
    try {
      const stageResult = await runStage({ draft: useDraftStore.getState().draft, stage, message: authorText, history });
      setResult(stageResult);
      setAccepted(new Set());
      const summary = stageResult.status === "ok"
        ? stageResult.proposal.summary || `Proposed ${stageResult.proposal.ops.length} change(s).`
        : `Could not produce a valid proposal: ${stageResult.issues[0] ?? "unknown error"}`;
      setHistory([...nextHistory, { role: "copilot", text: summary }]);
      setMessage("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Copilot request failed");
      setHistory(nextHistory);
    } finally {
      setBusy(false);
    }
  };

  const acceptOp = (index: number) => {
    if (!result || accepted.has(index)) return;
    const op = result.proposal.ops[index];
    mutate((current) => applyOp(current, op));
    setAccepted((previous) => new Set(previous).add(index));
  };

  const acceptAll = () => {
    if (!result) return;
    result.proposal.ops.forEach((op, index) => {
      if (!accepted.has(index)) mutate((current) => applyOp(current, op));
    });
    setAccepted(new Set(result.proposal.ops.map((_, index) => index)));
  };

  const dismiss = () => {
    setResult(null);
    setAccepted(new Set());
  };

  if (!available) {
    return (
      <div className="st-subpanel rounded p-3 text-sm st-muted" aria-label="Copilot unavailable">
        The authoring copilot is off or no memory LLM profile is selected. Enable it in the settings panel and pick a Connection Manager profile.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3" aria-label="Authoring copilot">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Copilot stage">
        {COPILOT_STAGES.map((entry) => (
          <button
            key={entry}
            type="button"
            className={`st-tab rounded px-3 py-1 text-sm ${stage === entry ? "st-tab-active" : ""}`}
            aria-pressed={stage === entry}
            onClick={() => setStage(entry)}
          >
            {STAGE_LABELS[entry]}
          </button>
        ))}
      </div>

      <ul className="st-subpanel flex min-h-[80px] flex-1 flex-col gap-2 overflow-auto p-2 text-sm" aria-label="Copilot conversation">
        {history.length === 0 ? (
          <li className="st-muted">Describe your premise, then run a stage to get a proposal.</li>
        ) : (
          history.map((entry, index) => (
            <li key={index} className={entry.role === "author" ? "text-right" : ""}>
              <span className="st-pill px-2 py-0.5 text-[10px]">{entry.role === "author" ? "You" : "Copilot"}</span>
              <span className="ml-2">{entry.text}</span>
            </li>
          ))
        )}
      </ul>

      {error ? <div className="st-alert-error rounded px-3 py-2 text-sm" role="alert">{error}</div> : null}

      {result ? <ProposalReview result={result} acceptedIndices={accepted} onAccept={acceptOp} onAcceptAll={acceptAll} onDismiss={dismiss} /> : null}

      <div className="flex items-end gap-2">
        <textarea
          className="text_pole st-input min-h-[60px] flex-1"
          aria-label="Copilot message"
          placeholder={`Ask the copilot to propose ${STAGE_LABELS[stage].toLowerCase()}…`}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
        <button type="button" className="st-button" disabled={busy} onClick={() => void send()}>{busy ? "Working…" : "Run stage"}</button>
      </div>
    </div>
  );
};

export default StudioCopilot;

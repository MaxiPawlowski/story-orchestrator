import React from "react";
import { diffProposal, type ProposalResult } from "@copilot/index";

interface Props {
  result: ProposalResult;
  acceptedIndices: Set<number>;
  onAccept: (index: number) => void;
  onAcceptAll: () => void;
  onDismiss: () => void;
}

const ACTION_LABEL: Record<string, string> = { add: "add", update: "change", remove: "remove" };

const ProposalReview: React.FC<Props> = ({ result, acceptedIndices, onAccept, onAcceptAll, onDismiss }) => {
  if (result.status === "failed") {
    return (
      <section className="st-subpanel flex flex-col gap-2 p-2" aria-label="Copilot proposal">
        <div className="flex items-center gap-2">
          <span className="st-alert-error rounded px-2 py-0.5 text-[11px]">Invalid proposal</span>
          <button type="button" className="st-button secondary ml-auto" onClick={onDismiss}>Dismiss</button>
        </div>
        <ul className="flex flex-col gap-1 text-sm">
          {result.issues.map((issue, index) => <li key={index} className="st-text-error">{issue}</li>)}
        </ul>
      </section>
    );
  }

  const diff = diffProposal(result.proposal.ops);
  const warnings = result.preview.diagnostics.filter((entry) => entry.severity === "warning");
  const allAccepted = diff.items.length > 0 && diff.items.every((item) => acceptedIndices.has(item.index));

  return (
    <section className="st-subpanel flex flex-col gap-2 p-2" aria-label="Copilot proposal">
      <div className="flex items-center gap-2">
        <span className="st-pill px-2 py-0.5 text-[10px]">{result.stage}</span>
        <span className="text-sm">{result.proposal.summary || `${diff.items.length} change(s)`}</span>
        <button type="button" className="st-button ml-auto" disabled={allAccepted || diff.items.length === 0} onClick={onAcceptAll}>Accept all</button>
        <button type="button" className="st-button secondary" onClick={onDismiss}>Dismiss</button>
      </div>
      <ul className="flex flex-col gap-1" aria-label="Proposed changes">
        {diff.items.map((item) => {
          const isAccepted = acceptedIndices.has(item.index);
          return (
            <li key={item.index} className="flex items-center gap-2 text-sm">
              <span className="st-pill px-2 py-0.5 text-[10px]">{ACTION_LABEL[item.action]}</span>
              <span>{item.label}</span>
              <button type="button" className="st-button secondary ml-auto" disabled={isAccepted} onClick={() => onAccept(item.index)}>{isAccepted ? "Accepted" : "Accept"}</button>
            </li>
          );
        })}
      </ul>
      {warnings.length ? (
        <div className="flex flex-col gap-0.5" aria-label="Proposal warnings">
          <span className="text-[11px] st-muted">Warnings ({warnings.length})</span>
          {warnings.map((entry, index) => <span key={index} className="text-[11px] st-muted">{entry.message}</span>)}
        </div>
      ) : null}
    </section>
  );
};

export default ProposalReview;

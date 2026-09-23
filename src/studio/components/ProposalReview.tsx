import React from "react";
import { diffProposal, type ProposalResult } from "@copilot/index";
import { emptyEnvironment, entryKey, type ExistingEntry, type ProvisioningEnvironment, type ProvisioningOp } from "@wizard/index";
import ProvisioningCard from "./ProvisioningCard";

interface Props {
  result: ProposalResult;
  acceptedIndices: Set<number>;
  onAccept: (index: number) => void;
  onAcceptAll: () => void;
  onDismiss: () => void;
  environment?: ProvisioningEnvironment;
  provisioningBusy?: string | number | null;
  provisioningResults?: Record<string | number, { ok: boolean; message: string }>;
  // Keyed by `entryKey(lorebook, comment)`. A missing key reads as "not resolved yet".
  entryPreviews?: Record<string, ExistingEntry | null>;
  onProvision?: (index: string | number, op: ProvisioningOp) => void;
}

const ACTION_LABEL: Record<string, string> = { add: "add", update: "change", remove: "remove" };

const ProposalReview: React.FC<Props> = ({ result, acceptedIndices, onAccept, onAcceptAll, onDismiss, environment, provisioningBusy = null, provisioningResults = {}, entryPreviews = {}, onProvision }) => {
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
        <span className="text-sm">{result.proposal.summary || `${diff.items.length + diff.provisioning.length} change(s)`}</span>
        <button type="button" className="st-button ml-auto" disabled={allAccepted || diff.items.length === 0} onClick={onAcceptAll}>Accept all</button>
        <button type="button" className="st-button secondary" onClick={onDismiss}>Dismiss</button>
      </div>
      {diff.items.length > 0 && (
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
      )}
      {/* Provisioning writes to the user's install, so it never rides "Accept all" — each card is
          edited and applied on its own (spec addendum §Story wizard). */}
      {diff.provisioning.length > 0 && (
        <div className="flex flex-col gap-2" data-so="provisioning" aria-label="Provisioning steps">
          <span className="text-[11px] st-muted">These create things in SillyTavern. Review each one — they are not part of Accept all.</span>
          {diff.provisioning.map((item) => {
            const op = item.op as ProvisioningOp;
            return (
              <ProvisioningCard
                key={item.index}
                op={op}
                environment={environment ?? emptyEnvironment()}
                applied={provisioningResults[item.index]?.ok === true}
                result={provisioningResults[item.index]?.message ?? null}
                failed={provisioningResults[item.index]?.ok === false}
                busy={provisioningBusy === item.index}
                existing={op.kind === "upsertLorebookEntry" ? entryPreviews[entryKey(op.lorebook, op.comment)] : undefined}
                onApply={(next) => onProvision?.(item.index, next)}
              />
            );
          })}
        </div>
      )}
      {warnings.length ? (
        <div className="flex flex-col gap-0.5" aria-label="Proposal warnings">
          <span className="text-[11px] st-muted">Warnings ({warnings.length})</span>
          {warnings.map((entry, index) => (
            <span key={index} className="text-[11px] st-muted">
              <span data-so="diagnostic-consequence" className="opacity-100">{entry.consequence ?? entry.message}</span>
              {entry.consequence ? ` — ${entry.message}` : ""}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
};

export default ProposalReview;

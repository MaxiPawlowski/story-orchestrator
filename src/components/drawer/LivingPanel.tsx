import { useState } from "react";
import type { LivingAuthorView, LivingProposalRow } from "@runtime/livingSnapshot";
import { savedLine, type LivingSaveResult } from "./LivingSave";

export interface LivingActions {
  decide(id: string, status: "accepted" | "rejected", edit?: { name?: string; objective?: string }): Promise<boolean> | void;
  regenerate(id: string): Promise<unknown> | void;
  runNow(): Promise<unknown> | void;
  save(includeUnreached: boolean): Promise<LivingSaveResult>;
}

const STATUS_COPY: Record<LivingProposalRow["status"], string> = {
  proposed: "waiting for you",
  accepted: "lands at the next reply",
  applied: "in the story",
  rejected: "rejected",
  withdrawn: "withdrawn",
  failed: "nothing usable",
};

const ProposalCard = ({ row, actions }: { row: LivingProposalRow; actions?: LivingActions }) => {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(row.name);
  const [objective, setObjective] = useState(row.objective);
  const waiting = row.status === "proposed" && !row.stale;
  return (
    <div data-so="living-proposal" data-id={row.id} data-status={row.status} data-kind={row.branch ? "branch" : "next"} className="border-t border-solid border-white/10 mt-1 pt-1">
      <div className="opacity-100">
        {row.branch ? "Branch: " : "Next: "}{row.name || "(nothing written)"}{" "}
        <span className="opacity-70">· {row.stale ? "out of date" : STATUS_COPY[row.status]} · after {row.frontierId}</span>
      </div>
      {row.branch && (
        <div data-so="living-branch-why">
          {row.branch.prepared ? "Prepared ahead: one more way forward from here" : `The story branched because ${row.branch.why || "the player went another way"}`}
          {row.branch.toName ? <span className="opacity-70"> · rejoins at {row.branch.toName}</span> : null}
        </div>
      )}
      {row.objective && !editing && <div className="opacity-80">{row.objective}</div>}
      {row.reason && row.status !== "failed" && <div className="opacity-70">Why: {row.reason}</div>}
      {row.issues.length > 0 && <div data-so="living-issues" className="so-warning-text">{row.issues.join("; ")}</div>}
      {editing && (
        <div className="flex flex-col gap-1">
          <label className="flex flex-col">Name<input data-so="living-edit-name" className="text_pole" value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="flex flex-col">
            What happens
            <textarea data-so="living-edit-objective" className="text_pole" rows={3} value={objective} onChange={(event) => setObjective(event.target.value)} />
          </label>
        </div>
      )}
      {actions && (
        <div className="flex flex-wrap items-center gap-1 mt-1">
          {waiting && !editing && (
            <>
              <button type="button" className="menu_button" data-so="living-accept" onClick={() => void actions.decide(row.id, "accepted")}>Accept</button>
              <button type="button" className="menu_button" data-so="living-reject" onClick={() => void actions.decide(row.id, "rejected")}>Reject</button>
              <button type="button" className="menu_button" data-so="living-edit" onClick={() => setEditing(true)}>Edit</button>
            </>
          )}
          {waiting && editing && (
            <>
              <button type="button" className="menu_button" data-so="living-accept-edited"
                onClick={() => { setEditing(false); void actions.decide(row.id, "accepted", { name, objective }); }}>Accept edited</button>
              <button type="button" className="menu_button" data-so="living-edit-cancel"
                onClick={() => { setEditing(false); setName(row.name); setObjective(row.objective); }}>Cancel</button>
            </>
          )}
          {(waiting || row.status === "failed") && !editing && (
            <button type="button" className="menu_button" data-so="living-regenerate" onClick={() => void actions.regenerate(row.id)}>Write it again</button>
          )}
        </div>
      )}
    </div>
  );
};

export const LivingPanel = ({ view, canSave, actions }: { view: LivingAuthorView; canSave: boolean; actions?: LivingActions }) => {
  const [includeUnreached, setIncludeUnreached] = useState(false);
  const [saved, setSaved] = useState<LivingSaveResult | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!actions) return;
    setSaving(true);
    try {
      setSaved(await actions.save(includeUnreached));
    } finally {
      setSaving(false);
    }
  };
  return (
    <section id="so-living" aria-label={view.living ? "Living story" : "Story branches"} className="text-xs opacity-90">
      <div className="font-medium">{view.living ? "Living story" : "Story branches"}</div>
      {view.living && (
        <div data-so="living-summary" className="opacity-80">
          {view.enabled ? `Director on, ${view.autonomy === "auto" ? "writes on its own" : "suggests, you decide"}` : "Director off in settings"}
          {` · ${view.reachedGenerated} of ${view.generated} written turning points reached · ${view.chapters} chapter(s) · ${view.passes} pass(es)`}
          {view.frontierId ? ` · next after ${view.frontierId}` : " · nothing to write yet"}
        </div>
      )}
      {!view.branching && <div className="opacity-70">Branching off in settings.</div>}
      {view.living && actions && (
        <div className="flex flex-wrap items-center gap-1 mt-1">
          <button id="so-living-run" type="button" className="menu_button" disabled={!view.enabled || !view.frontierId} onClick={() => void actions.runNow()}>Write the next turning point now</button>
        </div>
      )}
      {view.proposals.length === 0
        ? <div className="opacity-70 mt-1">Nothing written yet.</div>
        : view.proposals.map((row) => <ProposalCard key={row.id} row={row} actions={actions} />)}
      {canSave && actions && (
        <div data-so="living-author-save" className="flex flex-col gap-1 mt-2">
          <label className="flex items-center gap-1">
            <input id="so-living-include-unreached" type="checkbox" checked={includeUnreached} onChange={(event) => setIncludeUnreached(event.target.checked)} />
            Keep turning points nobody reached
          </label>
          <div className="flex flex-wrap items-center gap-1">
            <button id="so-living-author-save" type="button" className="menu_button" disabled={saving} onClick={() => void save()}>Save as story</button>
          </div>
          {saved && <div data-so="living-save-result" className={saved.ok ? "" : "so-warning-text"}>{savedLine(saved)}</div>}
        </div>
      )}
    </section>
  );
};

export default LivingPanel;

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { showConfirmPopup } from "@services/STAPI";
import type { AuthoringStageInput, ProposalResult } from "@copilot/index";
import { useDraftStore } from "./draft";
import { setStoryField } from "./mutations";
import QualityEditor from "./components/QualityEditor";
import CheckpointEditor from "./components/CheckpointEditor";
import TransitionEditor from "./components/TransitionEditor";
import DiagnosticsPanel from "./components/DiagnosticsPanel";
import StudioGraph from "./components/StudioGraph";
import StudioCopilot from "./components/StudioCopilot";
import StudioToolbar from "./components/StudioToolbar";

export type StudioTab = "graph" | "qualities" | "checkpoints" | "transitions" | "diagnostics" | "copilot";

const BASE_TABS: Array<{ id: StudioTab; label: string }> = [
  { id: "graph", label: "Graph" },
  { id: "qualities", label: "Qualities" },
  { id: "checkpoints", label: "Checkpoints" },
  { id: "transitions", label: "Transitions" },
  { id: "diagnostics", label: "Diagnostics" },
];

type Props = {
  onClose: () => void;
  copilotEnabled?: boolean;
  runCopilotStage?: (input: AuthoringStageInput) => Promise<ProposalResult>;
};

const StudioModal: React.FC<Props> = ({ onClose, copilotEnabled = true, runCopilotStage }) => {
  const [tab, setTab] = useState<StudioTab>("graph");
  const tabs = copilotEnabled ? [...BASE_TABS, { id: "copilot" as StudioTab, label: "Copilot" }] : BASE_TABS;
  const activeTab = tabs.some((entry) => entry.id === tab) ? tab : "graph";
  const draft = useDraftStore((state) => state.draft);
  const dirty = useDraftStore((state) => state.dirty);
  const errors = useDraftStore((state) => state.errors);
  const diagnostics = useDraftStore((state) => state.diagnostics);
  const mutate = useDraftStore((state) => state.mutate);
  const undo = useDraftStore((state) => state.undo);
  const redo = useDraftStore((state) => state.redo);
  const canUndo = useDraftStore((state) => state.past.length > 0);
  const canRedo = useDraftStore((state) => state.future.length > 0);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    titleRef.current?.focus();
  }, []);

  const requestClose = async () => {
    if (useDraftStore.getState().dirty && !(await showConfirmPopup("Discard unsaved Studio changes?", { okButton: "Discard", cancelButton: "Keep editing" }))) return;
    onClose();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      void requestClose();
      return;
    }
    if (event.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>("button, input, select, textarea, [tabindex]:not([tabindex='-1'])")).filter((element) => !element.hasAttribute("disabled") && element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const renderTab = () => {
    if (activeTab === "qualities") return <QualityEditor />;
    if (activeTab === "checkpoints") return <CheckpointEditor />;
    if (activeTab === "transitions") return <TransitionEditor />;
    if (activeTab === "diagnostics") return <DiagnosticsPanel />;
    if (activeTab === "copilot") return <StudioCopilot enabled={copilotEnabled} runStage={runCopilotStage} />;
    return <StudioGraph onOpenCheckpoint={() => setTab("checkpoints")} />;
  };

  return createPortal(
    <dialog
      ref={dialogRef}
      id="so-studio-modal"
      className="st-modal-overlay fixed inset-0 z-[4100] p-4"
      aria-label="Checkpoint Studio"
      onKeyDown={handleKeyDown}
      onCancel={(event) => { event.preventDefault(); void requestClose(); }}
    >
      <div ref={panelRef} className="st-panel flex h-[85dvh] w-[min(1100px,95dvw)] flex-col overflow-hidden shadow-lg">
        <div className="st-panel-header flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
          <span className="font-semibold whitespace-nowrap">Checkpoint Studio</span>
          <input
            ref={titleRef}
            className="text_pole st-input min-w-0 flex-1"
            aria-label="Story title"
            value={draft.title}
            onChange={(event) => mutate((current) => setStoryField(current, "title", event.target.value))}
          />
          {dirty ? <span className="st-pill px-2 py-0.5 text-[11px]" aria-label="Unsaved changes">Unsaved</span> : null}
          {errors.length > 0 ? <span className="st-alert-error rounded px-2 py-0.5 text-[11px]" aria-label={`${errors.length} validation ${errors.length === 1 ? "error" : "errors"}`}>{errors.length} {errors.length === 1 ? "error" : "errors"}</span> : null}
          {diagnostics.length > 0 ? <span className="st-pill px-2 py-0.5 text-[11px]" aria-label={`${diagnostics.length} diagnostics`}>{diagnostics.length} {diagnostics.length === 1 ? "issue" : "issues"}</span> : null}
          <button type="button" className="st-button secondary" onClick={() => void requestClose()} aria-label="Close studio">Close</button>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-3 py-2" role="tablist" aria-label="Studio sections">
          {tabs.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={activeTab === entry.id}
              className={`st-tab rounded px-3 py-1 text-sm ${activeTab === entry.id ? "st-tab-active" : ""}`}
              onClick={() => setTab(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto p-3" role="tabpanel" aria-label={activeTab}>
          {renderTab()}
        </div>

        <div className="st-panel-header flex flex-wrap items-center gap-2 border-t px-3 py-2">
          <button type="button" className="st-button secondary" onClick={undo} disabled={!canUndo}>Undo</button>
          <button type="button" className="st-button secondary" onClick={redo} disabled={!canRedo}>Redo</button>
          <StudioToolbar />
        </div>
      </div>
    </dialog>,
    document.body,
  );
};

export default StudioModal;

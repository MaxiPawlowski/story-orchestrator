import React, { useState } from "react";
import { useDraftStore } from "./draft";
import { setStoryField } from "./mutations";
import QualityEditor from "./components/QualityEditor";
import CheckpointEditor from "./components/CheckpointEditor";
import TransitionEditor from "./components/TransitionEditor";
import DiagnosticsPanel from "./components/DiagnosticsPanel";
import StudioGraph from "./components/StudioGraph";
import StudioToolbar from "./components/StudioToolbar";

export type StudioTab = "graph" | "qualities" | "checkpoints" | "transitions" | "diagnostics";

const TABS: Array<{ id: StudioTab; label: string }> = [
  { id: "graph", label: "Graph" },
  { id: "qualities", label: "Qualities" },
  { id: "checkpoints", label: "Checkpoints" },
  { id: "transitions", label: "Transitions" },
  { id: "diagnostics", label: "Diagnostics" },
];

type Props = { onClose: () => void };

const StudioModal: React.FC<Props> = ({ onClose }) => {
  const [tab, setTab] = useState<StudioTab>("graph");
  const draft = useDraftStore((state) => state.draft);
  const dirty = useDraftStore((state) => state.dirty);
  const errors = useDraftStore((state) => state.errors);
  const diagnostics = useDraftStore((state) => state.diagnostics);
  const mutate = useDraftStore((state) => state.mutate);
  const undo = useDraftStore((state) => state.undo);
  const redo = useDraftStore((state) => state.redo);
  const canUndo = useDraftStore((state) => state.past.length > 0);
  const canRedo = useDraftStore((state) => state.future.length > 0);

  const renderTab = () => {
    if (tab === "qualities") return <QualityEditor />;
    if (tab === "checkpoints") return <CheckpointEditor />;
    if (tab === "transitions") return <TransitionEditor />;
    if (tab === "diagnostics") return <DiagnosticsPanel />;
    return <StudioGraph />;
  };

  return (
    <div id="so-studio-modal" className="st-modal-overlay fixed inset-0 z-[4100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Checkpoint Studio">
      <div className="st-panel flex h-[85dvh] w-[min(1100px,95dvw)] flex-col overflow-hidden shadow-lg">
        <div className="st-panel-header flex items-center gap-3 px-3 py-2">
          <span className="font-semibold whitespace-nowrap">Checkpoint Studio</span>
          <input
            className="text_pole st-input min-w-0 flex-1"
            aria-label="Story title"
            value={draft.title}
            onChange={(event) => mutate((current) => setStoryField(current, "title", event.target.value))}
          />
          {dirty ? <span className="st-pill px-2 py-0.5 text-[11px]" aria-label="Unsaved changes">Unsaved</span> : null}
          {errors.length > 0 ? <span className="st-alert-error rounded px-2 py-0.5 text-[11px]" aria-label={`${errors.length} validation errors`}>{errors.length} errors</span> : null}
          {diagnostics.length > 0 ? <span className="st-pill px-2 py-0.5 text-[11px]" aria-label={`${diagnostics.length} diagnostics`}>{diagnostics.length} issues</span> : null}
          <button type="button" className="st-button secondary" onClick={onClose} aria-label="Close studio">Close</button>
        </div>

        <div className="flex items-center gap-2 px-3 py-2" role="tablist" aria-label="Studio sections">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={tab === entry.id}
              className={`st-tab rounded px-3 py-1 text-sm ${tab === entry.id ? "st-tab-active" : ""}`}
              onClick={() => setTab(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto p-3" role="tabpanel" aria-label={tab}>
          {renderTab()}
        </div>

        <div className="st-panel-header flex items-center gap-2 border-t px-3 py-2">
          <button type="button" className="st-button secondary" onClick={undo} disabled={!canUndo}>Undo</button>
          <button type="button" className="st-button secondary" onClick={redo} disabled={!canRedo}>Redo</button>
          <StudioToolbar />
        </div>
      </div>
    </div>
  );
};

export default StudioModal;

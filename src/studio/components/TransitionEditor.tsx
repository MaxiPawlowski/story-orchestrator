import React, { useState } from "react";
import { renderGateText, type Transition } from "@engine/index";
import { useDraftStore } from "../draft";
import { addTransition, removeTransition, setTransitionGate, updateTransition } from "../mutations";
import GateBuilder from "./GateBuilder";

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="flex flex-col gap-1 text-sm">
    <span className="text-xs st-muted">{label}</span>
    {children}
  </label>
);

const TransitionEditor: React.FC = () => {
  const draft = useDraftStore((state) => state.draft);
  const mutate = useDraftStore((state) => state.mutate);
  const transitions = draft.transitions;
  const checkpoints = draft.checkpoints;
  const anchors = checkpoints.filter((checkpoint) => checkpoint.type === "anchor");

  const [selectedIndex, setSelectedIndex] = useState<number>(transitions.length ? 0 : -1);
  const selected = selectedIndex >= 0 ? transitions[selectedIndex] ?? null : null;

  const patch = (change: Partial<Transition>) => {
    if (!selected) return;
    mutate((current) => updateTransition(current, selectedIndex, change));
  };

  const handleAdd = () => {
    mutate((current) => addTransition(current));
    setSelectedIndex(transitions.length);
  };

  const handleDelete = () => {
    if (selectedIndex < 0) return;
    const index = selectedIndex;
    mutate((current) => removeTransition(current, index));
    setSelectedIndex(transitions.length - 2 >= 0 ? Math.min(index, transitions.length - 2) : -1);
  };

  const progress = selected?.effects?.progress;

  return (
    <div className="flex gap-3">
      <div className="flex w-56 flex-col gap-2">
        <button type="button" className="st-button primary" onClick={handleAdd} disabled={checkpoints.length === 0}>+ Transition</button>
        <ul className="flex flex-col gap-1" aria-label="Transitions">
          {transitions.length === 0 ? <li className="text-sm st-muted">No transitions yet</li> : null}
          {transitions.map((transition, index) => (
            <li key={index}>
              <button
                type="button"
                aria-pressed={index === selectedIndex}
                className={`st-chip flex w-full flex-col items-start px-2 py-1 text-left text-sm ${index === selectedIndex ? "st-tab-active" : ""}`}
                onClick={() => setSelectedIndex(index)}
              >
                <span className="truncate">{transition.from} → {transition.to}</span>
                <span className="truncate text-[10px] st-muted">{renderGateText(transition.gate) || "(always)"}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex-1">
        {!selected ? (
          <div className="st-subpanel p-4 text-sm st-muted">Select or add a transition.</div>
        ) : (
          <div className="st-subpanel flex flex-col gap-3 p-3">
            <div className="grid grid-cols-3 gap-3">
              <Field label="From">
                <select className="text_pole st-input" value={selected.from} onChange={(event) => patch({ from: event.target.value })}>
                  {checkpoints.map((checkpoint) => <option key={checkpoint.id} value={checkpoint.id}>{checkpoint.name}</option>)}
                </select>
              </Field>
              <Field label="To">
                <select className="text_pole st-input" value={selected.to} onChange={(event) => patch({ to: event.target.value })}>
                  {checkpoints.map((checkpoint) => <option key={checkpoint.id} value={checkpoint.id}>{checkpoint.name}</option>)}
                </select>
              </Field>
              <Field label="Priority">
                <input type="number" className="text_pole st-input" value={selected.priority} onChange={(event) => { const parsed = parseInt(event.target.value, 10); patch({ priority: Number.isFinite(parsed) ? parsed : 0 }); }} />
              </Field>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs st-muted">Gate</span>
              <GateBuilder gate={selected.gate} qualities={draft.qualities} onChange={(gate) => mutate((current) => setTransitionGate(current, selectedIndex, gate))} />
            </div>

            <div className="st-subpanel flex flex-col gap-2 p-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={progress !== undefined}
                  onChange={(event) => patch({ effects: event.target.checked ? { progress: { anchor: anchors[0]?.id ?? "", amount: 1 } } : undefined })}
                />
                Progress effect
              </label>
              {progress ? (
                <div className="grid grid-cols-2 gap-3 pl-6">
                  <Field label="Anchor">
                    <select className="text_pole st-input" value={progress.anchor} onChange={(event) => patch({ effects: { progress: { anchor: event.target.value, amount: progress.amount } } })}>
                      <option value="" disabled>anchor…</option>
                      {anchors.map((anchor) => <option key={anchor.id} value={anchor.id}>{anchor.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Amount">
                    <input type="number" className="text_pole st-input" value={progress.amount} onChange={(event) => { const parsed = parseFloat(event.target.value); patch({ effects: { progress: { anchor: progress.anchor, amount: Number.isFinite(parsed) ? parsed : 0 } } }); }} />
                  </Field>
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Extractor trigger">
                <input className="text_pole st-input" value={selected.extractor_trigger ?? ""} onChange={(event) => patch({ extractor_trigger: event.target.value || undefined })} />
              </Field>
              <Field label="Extraction hint">
                <input className="text_pole st-input" value={selected.extraction_hint ?? ""} onChange={(event) => patch({ extraction_hint: event.target.value || undefined })} />
              </Field>
            </div>

            <div className="flex items-center gap-2 border-t st-divider pt-3">
              <button type="button" className="st-button danger" onClick={handleDelete}>Delete transition</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TransitionEditor;

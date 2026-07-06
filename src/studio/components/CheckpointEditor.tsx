import React, { useState } from "react";
import { TENSION_LEVELS, type ArcBridge, type Checkpoint, type CheckpointEffects, type PrimitiveValue, type TensionLevel } from "@engine/index";
import { useDraftStore } from "../draft";
import { addCheckpoint, clearStartCheckpoint, removeCheckpoint, setArcBridges, setStartCheckpoint, updateCheckpoint } from "../mutations";
import SnapshotEditor from "./SnapshotEditor";
import EffectsEditor from "./EffectsEditor";
import ScopePreview from "./ScopePreview";

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="flex flex-col gap-1 text-sm">
    <span className="text-xs st-muted">{label}</span>
    {children}
  </label>
);

const optionalInt = (raw: string): number | undefined => {
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const optionalFloat = (raw: string): number | undefined => {
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const ArcBridgesPanel: React.FC = () => {
  const draft = useDraftStore((state) => state.draft);
  const mutate = useDraftStore((state) => state.mutate);
  const bridges = draft.arc_bridges ?? [];
  const anchors = draft.checkpoints.filter((checkpoint) => checkpoint.type === "anchor");

  const update = (index: number, patch: Partial<ArcBridge>) => mutate((current) => setArcBridges(current, bridges.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry))));

  return (
    <div className="st-subpanel mt-3 flex flex-col gap-2 p-3">
      <div className="text-xs st-muted">Story arc bridges</div>
      {bridges.map((bridge, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <input className="text_pole st-input flex-1" aria-label={`Arc match ${index + 1}`} placeholder="arc keyword" value={bridge.arcMatch} onChange={(event) => update(index, { arcMatch: event.target.value })} />
          <select className="text_pole st-input" aria-label={`Arc bridge anchor ${index + 1}`} value={bridge.anchor} onChange={(event) => update(index, { anchor: event.target.value })}>
            <option value="" disabled>anchor…</option>
            {anchors.map((anchor) => <option key={anchor.id} value={anchor.id}>{anchor.name}</option>)}
          </select>
          <input type="number" className="text_pole st-input w-24" aria-label={`Arc bridge amount ${index + 1}`} value={bridge.amount} onChange={(event) => update(index, { amount: optionalFloat(event.target.value) ?? 0 })} />
          <button type="button" className="st-button danger" aria-label={`Remove arc bridge ${index + 1}`} onClick={() => mutate((current) => setArcBridges(current, bridges.filter((_, entryIndex) => entryIndex !== index)))}>×</button>
        </div>
      ))}
      <button type="button" className="st-button secondary self-start" onClick={() => mutate((current) => setArcBridges(current, [...bridges, { arcMatch: "", anchor: anchors[0]?.id ?? "", amount: 1 }]))} disabled={anchors.length === 0}>+ Arc bridge</button>
    </div>
  );
};

const CheckpointEditor: React.FC = () => {
  const draft = useDraftStore((state) => state.draft);
  const mutate = useDraftStore((state) => state.mutate);
  const checkpoints = draft.checkpoints;
  const [selectedId, setSelectedId] = useState<string | null>(checkpoints[0]?.id ?? null);

  const selected = checkpoints.find((checkpoint) => checkpoint.id === selectedId) ?? null;
  const isStub = selected ? Boolean(draft.scaffolding?.[selected.id]) : false;

  const patch = (change: Partial<Checkpoint>) => {
    if (!selected) return;
    mutate((current) => updateCheckpoint(current, selected.id, change));
  };

  const handleAdd = () => {
    let createdId = "";
    mutate((current) => {
      const next = addCheckpoint(current);
      createdId = next.checkpoints[next.checkpoints.length - 1].id;
      return next;
    });
    if (createdId) setSelectedId(createdId);
  };

  const handleDelete = () => {
    if (!selected) return;
    const removedId = selected.id;
    mutate((current) => removeCheckpoint(current, removedId));
    setSelectedId(checkpoints.find((checkpoint) => checkpoint.id !== removedId)?.id ?? null);
  };

  const setStart = (checked: boolean) => {
    if (!selected) return;
    mutate((current) => (checked ? setStartCheckpoint(current, selected.id) : clearStartCheckpoint(current, selected.id)));
  };

  return (
    <div>
      <div className="flex gap-3">
        <div className="flex w-56 flex-col gap-2">
          <button type="button" className="st-button primary" onClick={handleAdd}>+ Checkpoint</button>
          <ul className="flex flex-col gap-1" aria-label="Checkpoints">
            {checkpoints.map((checkpoint) => (
              <li key={checkpoint.id}>
                <button
                  type="button"
                  aria-pressed={checkpoint.id === selectedId}
                  className={`st-chip flex w-full items-center justify-between px-2 py-1 text-left text-sm ${checkpoint.id === selectedId ? "st-tab-active" : ""}`}
                  onClick={() => setSelectedId(checkpoint.id)}
                >
                  <span className="truncate">{checkpoint.name || checkpoint.id}</span>
                  <span className="text-[10px] st-muted">{checkpoint.start ? "start · " : ""}{checkpoint.type}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex-1">
          {!selected ? (
            <div className="st-subpanel p-4 text-sm st-muted">Select or add a checkpoint.</div>
          ) : (
            <div className="st-subpanel flex flex-col gap-3 p-3">
              <div className="flex items-center gap-2 text-xs st-muted">
                <span>ID: {selected.id}</span>
                {isStub ? <span className="st-pill px-2 py-0.5">stub</span> : null}
              </div>
              <Field label="Name">
                <input className="text_pole st-input" value={selected.name} onChange={(event) => patch({ name: event.target.value })} />
              </Field>
              <Field label="Objective">
                <textarea className="text_pole st-input min-h-[3rem]" value={selected.objective} onChange={(event) => patch({ objective: event.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Type">
                  <select className="text_pole st-input" value={selected.type} onChange={(event) => patch({ type: event.target.value as Checkpoint["type"] })}>
                    <option value="anchor">anchor</option>
                    <option value="intermediate">intermediate</option>
                  </select>
                </Field>
                <label className="flex items-end gap-2 pb-1 text-sm">
                  <input type="checkbox" checked={!!selected.start} onChange={(event) => setStart(event.target.checked)} />
                  Start checkpoint
                </label>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Tension target">
                  <select className="text_pole st-input" value={selected.tension_target ?? ""} onChange={(event) => patch({ tension_target: (event.target.value || undefined) as TensionLevel | undefined })}>
                    <option value="">— none —</option>
                    {TENSION_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
                  </select>
                </Field>
                <Field label="Target turn length">
                  <input type="number" className="text_pole st-input" value={selected.target_turn_length ?? ""} onChange={(event) => patch({ target_turn_length: optionalInt(event.target.value) })} />
                </Field>
                <Field label="Convergence threshold">
                  <input type="number" className="text_pole st-input" value={selected.convergence_threshold ?? ""} onChange={(event) => patch({ convergence_threshold: optionalFloat(event.target.value) })} />
                </Field>
              </div>
              <Field label="Guidance">
                <textarea className="text_pole st-input min-h-[3rem]" value={selected.guidance ?? ""} onChange={(event) => patch({ guidance: event.target.value || undefined })} />
              </Field>

              <div className="flex flex-col gap-1">
                <span className="text-xs st-muted">State snapshot</span>
                <SnapshotEditor
                  snapshot={selected.state_snapshot ?? {}}
                  qualities={draft.qualities}
                  onChange={(next: Record<string, PrimitiveValue>) => patch({ state_snapshot: Object.keys(next).length ? next : undefined })}
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs st-muted">Effects</span>
                <EffectsEditor
                  effects={selected.effects ?? {}}
                  roster={draft.roster}
                  onChange={(next: CheckpointEffects) => patch({ effects: Object.keys(next).length ? next : undefined })}
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs st-muted">Extraction scope preview</span>
                <ScopePreview checkpointId={selected.id} />
              </div>

              <div className="flex items-center gap-2 border-t st-divider pt-3">
                <button type="button" className="st-button danger" onClick={handleDelete}>Delete checkpoint</button>
              </div>
            </div>
          )}
        </div>
      </div>
      <ArcBridgesPanel />
    </div>
  );
};

export default CheckpointEditor;

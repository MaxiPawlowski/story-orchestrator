import React from "react";
import type { PrimitiveValue, Quality } from "@engine/index";
import { defaultValueForOp } from "../gateOptions";
import PrimitiveValueInput from "./PrimitiveValueInput";

const defaultValueFor = (quality: Quality): PrimitiveValue => defaultValueForOp(quality, "==") as PrimitiveValue;

const SnapshotEditor: React.FC<{ snapshot: Record<string, PrimitiveValue>; qualities: Quality[]; onChange: (next: Record<string, PrimitiveValue>) => void }> = ({ snapshot, qualities, onChange }) => {
  const rows = Object.entries(snapshot);
  const usedKeys = new Set(rows.map(([key]) => key));
  const available = qualities.filter((quality) => !usedKeys.has(quality.key));

  const renameRow = (previousKey: string, nextKey: string) => {
    if (previousKey === nextKey) return;
    const quality = qualities.find((entry) => entry.key === nextKey);
    const next: Record<string, PrimitiveValue> = {};
    rows.forEach(([key, value]) => {
      if (key === previousKey) next[nextKey] = quality ? defaultValueFor(quality) : value;
      else next[key] = value;
    });
    onChange(next);
  };

  const removeRow = (key: string) => {
    const next = { ...snapshot };
    delete next[key];
    onChange(next);
  };

  const addRow = () => {
    const quality = available[0];
    if (!quality) return;
    onChange({ ...snapshot, [quality.key]: defaultValueFor(quality) });
  };

  return (
    <div className="flex flex-col gap-2">
      {rows.length === 0 ? <div className="text-xs st-muted">No snapshot values</div> : null}
      {rows.map(([key, value]) => {
        const quality = qualities.find((entry) => entry.key === key);
        return (
          <div key={key} className="flex flex-wrap items-center gap-2">
            <select aria-label="Snapshot quality" className="text_pole st-input" value={key} onChange={(event) => renameRow(key, event.target.value)}>
              {qualities.map((entry) => <option key={entry.key} value={entry.key} disabled={entry.key !== key && usedKeys.has(entry.key)}>{entry.key}</option>)}
            </select>
            <PrimitiveValueInput quality={quality} value={value} label="Snapshot value" onChange={(next) => onChange({ ...snapshot, [key]: next })} />
            <button type="button" className="st-button danger" aria-label={`Remove snapshot ${key}`} onClick={() => removeRow(key)}>×</button>
          </div>
        );
      })}
      <button type="button" className="st-button secondary self-start" onClick={addRow} disabled={available.length === 0}>+ Snapshot value</button>
    </div>
  );
};

export default SnapshotEditor;

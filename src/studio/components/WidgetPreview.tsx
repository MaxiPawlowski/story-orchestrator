import React, { useMemo, useState } from "react";
import type { PrimitiveValue, StoryWidget } from "@engine/index";
import { useDraftStore } from "../draft";
import { previewCheckpoints, previewKeys, previewWidget, sampleDefault, startValues } from "../widgetPreview";
import PrimitiveValueInput from "./PrimitiveValueInput";

const WidgetPreview: React.FC<{ widget: StoryWidget }> = ({ widget }) => {
  const draft = useDraftStore((state) => state.draft);
  const [values, setValues] = useState<Record<string, PrimitiveValue>>({});
  const [reached, setReached] = useState<string[]>([]);
  const keys = useMemo(() => previewKeys(widget, draft), [widget, draft]);
  const checkpoints = useMemo(() => previewCheckpoints(widget), [widget]);
  const start = useMemo(() => startValues(draft), [draft]);
  const shown = (key: string): PrimitiveValue => {
    const quality = draft.qualities.find((entry) => entry.key === key);
    return values[key] ?? start[key] ?? sampleDefault(quality?.type, quality?.values);
  };
  const sample = Object.fromEntries(keys.map((key) => [key, shown(key)]));
  const preview = previewWidget(draft, widget.id, { values: sample, reached });
  const name = widget.id;
  return (
    <details data-so="widget-preview" className="flex flex-col gap-2">
      <summary className="text-xs cursor-pointer">Preview {name} over a sample state</summary>
      <div className="flex flex-wrap gap-2 pt-2">
        {keys.map((key) => {
          const quality = draft.qualities.find((entry) => entry.key === key);
          return (
            <label key={key} className="flex flex-col gap-1 text-xs">
              <span className="st-muted">{key}</span>
              <PrimitiveValueInput quality={quality} label={`${name} sample ${key}`} value={shown(key)}
                onChange={(value) => setValues((current) => ({ ...current, [key]: value }))} />
            </label>
          );
        })}
        {checkpoints.map((id) => (
          <label key={id} className="flex items-center gap-1 text-xs">
            <input type="checkbox" aria-label={`${name} sample reached ${id}`} checked={reached.includes(id)}
              onChange={(event) => setReached((current) => (event.target.checked ? [...current, id] : current.filter((entry) => entry !== id)))} />
            reached {id}
          </label>
        ))}
      </div>
      {preview.status === "shown"
        ? (
          <ul data-so="widget-preview-lines" aria-label={`${name} preview`} className="flex flex-col gap-0.5 list-none p-0 m-0 text-xs">
            {preview.lines.map((line, index) => <li key={index}>{line}</li>)}
          </ul>
        )
        : <div data-so="widget-preview-empty" className="text-xs st-muted">{preview.reason}</div>}
    </details>
  );
};

export default WidgetPreview;

import React, { useEffect, useState } from "react";
import type { GateNode, Quality } from "@engine/index";
import GateBuilder from "./GateBuilder";

export const optionalText = (value: string): string | undefined => (value.trim() ? value : undefined);

export const TextField: React.FC<{ label: string; value: string; onChange: (value: string) => void; placeholder?: string }> = ({ label, value, onChange, placeholder }) => (
  <label className="flex flex-1 flex-col gap-1 text-sm">
    <span className="text-xs st-muted">{label}</span>
    <input className="text_pole st-input" aria-label={label} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
  </label>
);

export const OptionalGate: React.FC<{ label: string; gate: GateNode | undefined; qualities: Quality[]; onChange: (gate: GateNode | undefined) => void }> = ({
  label, gate, qualities, onChange,
}) => (
  <div className="flex flex-col gap-1">
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" aria-label={label} checked={gate !== undefined} onChange={(event) => onChange(event.target.checked ? { all: [] } : undefined)} />
      {label}
    </label>
    {gate && <GateBuilder gate={gate} qualities={qualities} onChange={onChange} />}
  </div>
);

export const JsonField: React.FC<{ label: string; value: unknown; onChange: (value: unknown) => void; hint?: string }> = ({ label, value, onChange, hint }) => {
  const shown = value === undefined ? "" : JSON.stringify(value, null, 1);
  const [text, setText] = useState(shown);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => setText(shown), [shown]);
  const commit = (current: string) => {
    if (!current.trim()) {
      setProblem(null);
      onChange(undefined);
      return;
    }
    try {
      onChange(JSON.parse(current));
      setProblem(null);
    } catch {
      setProblem("This is not valid JSON yet; the field keeps its last good value.");
    }
  };
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs st-muted">{label}{hint ? ` — ${hint}` : ""}</span>
      <textarea className="text_pole st-input font-mono text-xs" aria-label={label} rows={4} value={text}
        onChange={(event) => setText(event.target.value)} onBlur={(event) => commit(event.currentTarget.value)} />
      {problem && <span data-so="json-problem" className="text-xs st-text-error">{problem}</span>}
    </label>
  );
};

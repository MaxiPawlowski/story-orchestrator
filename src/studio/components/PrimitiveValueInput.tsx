import React from "react";
import type { PrimitiveValue, Quality } from "@engine/index";

const PrimitiveValueInput: React.FC<{ quality?: Quality; value: PrimitiveValue; onChange: (value: PrimitiveValue) => void; label?: string }> = ({ quality, value, onChange, label = "Value" }) => {
  if (!quality) {
    return <input aria-label={label} className="text_pole st-input" value={String(value ?? "")} disabled />;
  }
  if (quality.type === "bool") {
    return (
      <select aria-label={label} className="text_pole st-input" value={String(value)} onChange={(event) => onChange(event.target.value === "true")}>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }
  if (quality.type === "int" || quality.type === "float") {
    return (
      <input
        type="number"
        aria-label={label}
        className="text_pole st-input w-28"
        value={typeof value === "number" ? value : ""}
        onChange={(event) => {
          const parsed = quality.type === "int" ? parseInt(event.target.value, 10) : parseFloat(event.target.value);
          onChange(Number.isFinite(parsed) ? parsed : 0);
        }}
      />
    );
  }
  if (quality.type === "enum") {
    return (
      <select aria-label={label} className="text_pole st-input" value={String(value)} onChange={(event) => onChange(event.target.value)}>
        {(quality.values ?? []).map((entry) => <option key={entry} value={entry}>{entry}</option>)}
      </select>
    );
  }
  return <input type="text" aria-label={label} className="text_pole st-input" value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} />;
};

export default PrimitiveValueInput;

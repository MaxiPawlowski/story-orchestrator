import React from "react";
import { GATE_OPERATORS, renderGateText, type GateLeaf, type GateNode, type GateOperator, type PrimitiveValue, type Quality } from "@engine/index";
import MultiSelect from "@components/studio/MultiSelect";
import { coerceOpForQuality, defaultLeaf, defaultValueForOp, opsForType } from "../gateOptions";
import PrimitiveValueInput from "./PrimitiveValueInput";

const StringListInput: React.FC<{ values: string[]; onChange: (next: string[]) => void }> = ({ values, onChange }) => (
  <div className="flex flex-col gap-1">
    {values.map((value, index) => (
      <div key={index} className="flex items-center gap-2">
        <input
          className="text_pole st-input"
          aria-label={`Gate value ${index + 1}`}
          value={value}
          onChange={(event) => onChange(values.map((entry, entryIndex) => (entryIndex === index ? event.target.value : entry)))}
        />
        <button type="button" className="st-button danger" aria-label={`Remove value ${index + 1}`} onClick={() => onChange(values.filter((_, entryIndex) => entryIndex !== index))}>×</button>
      </div>
    ))}
    <button type="button" className="st-button secondary self-start" onClick={() => onChange([...values, ""])}>+ Value</button>
  </div>
);

const GateValueInput: React.FC<{ quality?: Quality; op: GateOperator; value: PrimitiveValue | PrimitiveValue[]; onChange: (value: PrimitiveValue | PrimitiveValue[]) => void }> = ({ quality, op, value, onChange }) => {
  if (!quality) return <span className="text-xs st-text-error">select a quality</span>;
  if (op === "in") {
    const list = Array.isArray(value) ? value.map(String) : [];
    if (quality.type === "enum") {
      return <MultiSelect options={(quality.values ?? []).map((entry) => ({ value: entry, label: entry }))} value={list} onChange={onChange} />;
    }
    return <StringListInput values={list} onChange={onChange} />;
  }
  const single: PrimitiveValue = Array.isArray(value) ? "" : value;
  return <PrimitiveValueInput quality={quality} value={single} onChange={onChange} label="Gate value" />;
};

const LeafRow: React.FC<{ leaf: GateLeaf; qualities: Quality[]; onChange: (leaf: GateLeaf) => void; onRemove?: () => void }> = ({ leaf, qualities, onChange, onRemove }) => {
  const quality = qualities.find((entry) => entry.key === leaf.q);
  const ops = quality ? opsForType(quality.type) : [...GATE_OPERATORS];

  const handleQuality = (key: string) => {
    const nextQuality = qualities.find((entry) => entry.key === key);
    if (!nextQuality) {
      onChange({ ...leaf, q: key });
      return;
    }
    const op = coerceOpForQuality(nextQuality, leaf.op);
    onChange({ q: key, op, v: defaultValueForOp(nextQuality, op) });
  };

  const handleOp = (op: GateOperator) => {
    if (!quality) {
      onChange({ ...leaf, op });
      return;
    }
    const membershipChanged = (op === "in") !== (leaf.op === "in");
    onChange({ ...leaf, op, v: membershipChanged ? defaultValueForOp(quality, op) : leaf.v });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Gate quality" className="text_pole st-input" value={leaf.q} onChange={(event) => handleQuality(event.target.value)}>
        <option value="" disabled>quality…</option>
        {qualities.map((entry) => <option key={entry.key} value={entry.key}>{entry.key}</option>)}
      </select>
      <select aria-label="Gate operator" className="text_pole st-input" value={leaf.op} onChange={(event) => handleOp(event.target.value as GateOperator)}>
        {ops.map((op) => <option key={op} value={op}>{op}</option>)}
      </select>
      <GateValueInput quality={quality} op={leaf.op} value={leaf.v} onChange={(v) => onChange({ ...leaf, v })} />
      {onRemove ? <button type="button" className="st-button danger" aria-label="Remove condition" onClick={onRemove}>×</button> : null}
    </div>
  );
};

const GateNodeEditor: React.FC<{ node: GateNode; qualities: Quality[]; onChange: (node: GateNode) => void; onRemove?: () => void }> = ({ node, qualities, onChange, onRemove }) => {
  if ("q" in node) {
    return <LeafRow leaf={node} qualities={qualities} onChange={onChange} onRemove={onRemove} />;
  }

  if ("not" in node) {
    return (
      <div className="st-subpanel flex flex-col gap-2 p-2">
        <div className="flex items-center gap-2 text-xs st-muted">
          <span>NOT</span>
          {onRemove ? <button type="button" className="st-button danger" aria-label="Remove NOT" onClick={onRemove}>×</button> : null}
        </div>
        <div className="border-l st-divider pl-3">
          <GateNodeEditor node={node.not} qualities={qualities} onChange={(child) => onChange({ not: child })} />
        </div>
      </div>
    );
  }

  const children = "all" in node ? node.all : node.any;
  const setChildren = (next: GateNode[]) => onChange("all" in node ? { all: next } : { any: next });

  return (
    <div className="st-subpanel flex flex-col gap-2 p-2">
      <div className="flex items-center gap-2">
        <select
          aria-label="Group operator"
          className="text_pole st-input"
          value={"all" in node ? "all" : "any"}
          onChange={(event) => onChange(event.target.value === "all" ? { all: children } : { any: children })}
        >
          <option value="all">ALL (AND)</option>
          <option value="any">ANY (OR)</option>
        </select>
        {onRemove ? <button type="button" className="st-button danger" aria-label="Remove group" onClick={onRemove}>×</button> : null}
      </div>
      <div className="flex flex-col gap-2 border-l st-divider pl-3">
        {children.length === 0 ? <div className="text-xs st-muted">no conditions</div> : null}
        {children.map((child, index) => (
          <GateNodeEditor
            key={index}
            node={child}
            qualities={qualities}
            onChange={(next) => setChildren(children.map((entry, entryIndex) => (entryIndex === index ? next : entry)))}
            onRemove={() => setChildren(children.filter((_, entryIndex) => entryIndex !== index))}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="st-button secondary" onClick={() => setChildren([...children, defaultLeaf(qualities)])}>+ Condition</button>
        <button type="button" className="st-button secondary" onClick={() => setChildren([...children, { all: [] }])}>+ Group</button>
        <button type="button" className="st-button secondary" onClick={() => setChildren([...children, { not: defaultLeaf(qualities) }])}>+ NOT</button>
      </div>
    </div>
  );
};

const GateBuilder: React.FC<{ gate: GateNode; qualities: Quality[]; onChange: (gate: GateNode) => void }> = ({ gate, qualities, onChange }) => (
  <div className="flex flex-col gap-2">
    <GateNodeEditor node={gate} qualities={qualities} onChange={onChange} />
    <div className="text-xs st-muted">Preview: <code className="st-chip px-1">{renderGateText(gate) || "(always true)"}</code></div>
  </div>
);

export default GateBuilder;

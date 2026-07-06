import React, { useMemo, useState } from "react";
import { QUALITY_SOURCES, QUALITY_TYPES, type Quality, type QualitySource, type QualityType } from "@engine/index";
import { useDraftStore } from "../draft";
import { addQuality, newQuality, nextId, removeQuality, updateQuality } from "../mutations";
import { findQualityUsages, reservedQualityKeys } from "../qualityUsage";

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="flex flex-col gap-1 text-sm">
    <span className="text-xs st-muted">{label}</span>
    {children}
  </label>
);

const EnumValuesEditor: React.FC<{ values: string[]; onChange: (next: string[]) => void }> = ({ values, onChange }) => (
  <div className="flex flex-col gap-1">
    <span className="text-xs st-muted">Enum values</span>
    {values.map((value, index) => (
      <div key={index} className="flex items-center gap-2">
        <input
          className="text_pole st-input flex-1"
          aria-label={`Enum value ${index + 1}`}
          value={value}
          onChange={(event) => onChange(values.map((entry, entryIndex) => (entryIndex === index ? event.target.value : entry)))}
        />
        <button type="button" className="st-button danger" aria-label={`Remove enum value ${index + 1}`} onClick={() => onChange(values.filter((_, entryIndex) => entryIndex !== index))}>×</button>
      </div>
    ))}
    <button type="button" className="st-button secondary self-start" onClick={() => onChange([...values, ""])}>+ Value</button>
  </div>
);

const QualityEditor: React.FC = () => {
  const draft = useDraftStore((state) => state.draft);
  const mutate = useDraftStore((state) => state.mutate);
  const qualities = draft.qualities;
  const reserved = useMemo(() => reservedQualityKeys(draft), [draft]);

  const [selectedKey, setSelectedKey] = useState<string | null>(qualities[0]?.key ?? null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  const selected = qualities.find((quality) => quality.key === selectedKey) ?? null;
  const isReserved = selected ? reserved.has(selected.key) : false;

  const patch = (change: Partial<Quality>) => {
    if (!selected) return;
    mutate((current) => updateQuality(current, selected.key, change));
  };

  const handleAdd = () => {
    const key = nextId(qualities.map((quality) => quality.key), "quality");
    mutate((current) => addQuality(current, newQuality(key)));
    setSelectedKey(key);
  };

  const handleTypeChange = (type: QualityType) => {
    const change: Partial<Quality> = { type };
    if (type === "enum") change.values = selected?.values ?? [];
    else change.values = undefined;
    patch(change);
  };

  const handleSourceChange = (source: QualitySource) => {
    const change: Partial<Quality> = { source };
    if (source === "code") change.ledger_binding = undefined;
    patch(change);
  };

  const handleRenameKey = (nextKey: string) => {
    if (!selected) return;
    const previous = selected.key;
    mutate((current) => updateQuality(current, previous, { key: nextKey }));
    setSelectedKey(nextKey);
  };

  const setScopeHint = (field: "from" | "until", value: string) => {
    if (!selected) return;
    const nextHint = { ...selected.scope_hint, [field]: value || undefined };
    const cleaned = nextHint.from || nextHint.until ? nextHint : undefined;
    patch({ scope_hint: cleaned });
  };

  const setLedgerBinding = (field: "entity" | "field", value: string) => {
    if (!selected) return;
    const nextBinding = { entity: selected.ledger_binding?.entity ?? "", field: selected.ledger_binding?.field ?? "", [field]: value };
    const cleaned = nextBinding.entity || nextBinding.field ? nextBinding : undefined;
    patch({ ledger_binding: cleaned });
  };

  const handleDelete = () => {
    if (!selected) return;
    const usages = findQualityUsages(draft, selected.key);
    if (usages.length && confirmKey !== selected.key) {
      setConfirmKey(selected.key);
      return;
    }
    const removedKey = selected.key;
    mutate((current) => removeQuality(current, removedKey));
    setConfirmKey(null);
    const remaining = qualities.filter((quality) => quality.key !== removedKey);
    setSelectedKey(remaining[0]?.key ?? null);
  };

  const usages = selected ? findQualityUsages(draft, selected.key) : [];

  return (
    <div className="flex gap-3">
      <div className="flex w-56 flex-col gap-2">
        <button type="button" className="st-button primary" onClick={handleAdd}>+ Quality</button>
        <ul className="flex flex-col gap-1" aria-label="Qualities">
          {qualities.length === 0 ? <li className="text-sm st-muted">No qualities yet</li> : null}
          {qualities.map((quality) => (
            <li key={quality.key}>
              <button
                type="button"
                aria-pressed={quality.key === selectedKey}
                className={`st-chip flex w-full items-center justify-between px-2 py-1 text-left text-sm ${quality.key === selectedKey ? "st-tab-active" : ""}`}
                onClick={() => { setSelectedKey(quality.key); setConfirmKey(null); }}
              >
                <span className="truncate">{quality.key || "(unnamed)"}</span>
                <span className="text-[10px] st-muted">{reserved.has(quality.key) ? "derived" : quality.type}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex-1">
        {!selected ? (
          <div className="st-subpanel p-4 text-sm st-muted">Select or add a quality to edit it.</div>
        ) : (
          <div className="st-subpanel flex flex-col gap-3 p-3">
            {isReserved ? <div className="st-alert-error rounded px-2 py-1 text-xs">This is a derived quality ({selected.key}); the engine manages it.</div> : null}
            <Field label="Key">
              <input className="text_pole st-input" value={selected.key} disabled={isReserved} onChange={(event) => handleRenameKey(event.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <select className="text_pole st-input" value={selected.type} disabled={isReserved} onChange={(event) => handleTypeChange(event.target.value as QualityType)}>
                  {QUALITY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </Field>
              <Field label="Source">
                <select className="text_pole st-input" value={selected.source} disabled={isReserved} onChange={(event) => handleSourceChange(event.target.value as QualitySource)}>
                  {QUALITY_SOURCES.map((source) => <option key={source} value={source}>{source}</option>)}
                </select>
              </Field>
            </div>

            {selected.type === "enum" ? (
              <EnumValuesEditor values={selected.values ?? []} onChange={(values) => patch({ values })} />
            ) : null}

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!selected.latching} disabled={isReserved} onChange={(event) => patch({ latching: event.target.checked })} />
                Latching
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!selected.monotonic} disabled={isReserved} onChange={(event) => patch({ monotonic: event.target.checked })} />
                Monotonic
              </label>
            </div>

            <Field label="Rubric">
              <textarea className="text_pole st-input min-h-[4rem]" value={selected.rubric} disabled={isReserved} onChange={(event) => patch({ rubric: event.target.value })} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Scope hint from">
                <select className="text_pole st-input" value={selected.scope_hint?.from ?? ""} onChange={(event) => setScopeHint("from", event.target.value)}>
                  <option value="">— none —</option>
                  {draft.checkpoints.map((checkpoint) => <option key={checkpoint.id} value={checkpoint.id}>{checkpoint.name}</option>)}
                </select>
              </Field>
              <Field label="Scope hint until">
                <select className="text_pole st-input" value={selected.scope_hint?.until ?? ""} onChange={(event) => setScopeHint("until", event.target.value)}>
                  <option value="">— none —</option>
                  {draft.checkpoints.map((checkpoint) => <option key={checkpoint.id} value={checkpoint.id}>{checkpoint.name}</option>)}
                </select>
              </Field>
            </div>

            {selected.source === "extractor" ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Ledger entity">
                  <input className="text_pole st-input" value={selected.ledger_binding?.entity ?? ""} onChange={(event) => setLedgerBinding("entity", event.target.value)} />
                </Field>
                <Field label="Ledger field">
                  <input className="text_pole st-input" value={selected.ledger_binding?.field ?? ""} onChange={(event) => setLedgerBinding("field", event.target.value)} />
                </Field>
              </div>
            ) : null}

            <div className="flex items-center gap-2 border-t st-divider pt-3">
              <button type="button" className="st-button danger" disabled={isReserved} onClick={handleDelete}>Delete quality</button>
              {confirmKey === selected.key ? (
                <span className="text-xs st-text-error">Used in {usages.length} place(s) — click Delete again to confirm.</span>
              ) : null}
            </div>

            {confirmKey === selected.key && usages.length ? (
              <ul className="flex flex-col gap-1 text-xs st-muted" aria-label="Quality usages">
                {usages.map((usage, index) => <li key={index}>{usage.kind}: {usage.location}</li>)}
              </ul>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

export default QualityEditor;

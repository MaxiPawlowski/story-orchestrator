import React, { useMemo, useState } from "react";
import { QUALITY_SOURCES, QUALITY_TYPES, READ_AS_TYPES, type EvidenceFrom, type Quality, type QualitySource, type QualityType, type StoryV2 } from "@engine/index";
import { useDraftStore } from "../draft";
import { addQuality, newQuality, nextId, removeQuality, updateQuality } from "../mutations";
import { findQualityUsages, reservedQualityKeys } from "../qualityUsage";
import QualityReadEditor from "./QualityReadEditor";

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

interface QualityListProps {
  qualities: Quality[];
  selectedKey: string | null;
  reserved: Set<string>;
  onAdd: () => void;
  onSelect: (key: string) => void;
}

const QualityList = ({ qualities, selectedKey, reserved, onAdd, onSelect }: QualityListProps) => (
  <div className="flex w-full flex-col gap-2 sm:w-56">
    <button type="button" className="st-button primary" onClick={onAdd}>+ Quality</button>
    <ul className="flex flex-col gap-1" aria-label="Qualities">
      {qualities.length === 0 ? <li className="text-sm st-muted">No qualities yet</li> : null}
      {qualities.map((quality) => (
        <li key={quality.key}>
          <button
            type="button"
            aria-pressed={quality.key === selectedKey}
            className={`st-chip flex w-full items-center justify-between px-2 py-1 text-left text-sm ${quality.key === selectedKey ? "st-tab-active" : ""}`}
            onClick={() => onSelect(quality.key)}
          >
            <span className="truncate">{quality.key || "(unnamed)"}</span>
            <span className="text-[10px] st-muted">{reserved.has(quality.key) ? "derived" : quality.type}</span>
          </button>
        </li>
      ))}
    </ul>
  </div>
);

interface ShapeProps {
  selected: Quality;
  isReserved: boolean;
  patch: (change: Partial<Quality>) => void;
  onRename: (key: string) => void;
  onType: (type: QualityType) => void;
  onSource: (source: QualitySource) => void;
}

const QualityShapeFields = ({ selected, isReserved, patch, onRename, onType, onSource }: ShapeProps) => (
  <>
    <Field label="Key">
      <input className="text_pole st-input" value={selected.key} disabled={isReserved} onChange={(event) => onRename(event.target.value)} />
    </Field>
    <p data-so="quality-macro-help" className="text-[10px] st-muted">
      In a prompt: {`{{story_quality_${selected.key}}}`} works everywhere; {`{{story_quality::${selected.key}}}`} needs SillyTavern&apos;s new macro engine.
    </p>
    <div className="grid grid-cols-2 gap-3">
      <Field label="Type">
        <select className="text_pole st-input" value={selected.type} disabled={isReserved} onChange={(event) => onType(event.target.value as QualityType)}>
          {QUALITY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      </Field>
      <Field label="Source">
        <select className="text_pole st-input" value={selected.source} disabled={isReserved} onChange={(event) => onSource(event.target.value as QualitySource)}>
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
  </>
);

interface ScopeProps {
  selected: Quality;
  isReserved: boolean;
  draft: StoryV2;
  patch: (change: Partial<Quality>) => void;
  onScope: (field: "from" | "until", value: string) => void;
  onLedger: (field: "entity" | "field", value: string) => void;
}

const CheckpointOptions = ({ draft }: { draft: StoryV2 }) => (
  <>
    <option value="">— none —</option>
    {draft.checkpoints.map((checkpoint) => <option key={checkpoint.id} value={checkpoint.id}>{checkpoint.name}</option>)}
  </>
);

const QualityScopeFields = ({ selected, isReserved, draft, patch, onScope, onLedger }: ScopeProps) => (
  <>
    <div className="grid grid-cols-2 gap-3">
      <Field label="Scope hint from">
        <select className="text_pole st-input" value={selected.scope_hint?.from ?? ""} onChange={(event) => onScope("from", event.target.value)}>
          <CheckpointOptions draft={draft} />
        </select>
      </Field>
      <Field label="Scope hint until">
        <select className="text_pole st-input" value={selected.scope_hint?.until ?? ""} onChange={(event) => onScope("until", event.target.value)}>
          <CheckpointOptions draft={draft} />
        </select>
      </Field>
    </div>

    {selected.source === "extractor" ? (
      <div className="grid grid-cols-2 gap-3">
        <Field label="Ledger entity">
          <input className="text_pole st-input" value={selected.ledger_binding?.entity ?? ""} onChange={(event) => onLedger("entity", event.target.value)} />
        </Field>
        <Field label="Ledger field">
          <input className="text_pole st-input" value={selected.ledger_binding?.field ?? ""} onChange={(event) => onLedger("field", event.target.value)} />
        </Field>
      </div>
    ) : null}

    <Field label="Evidence may come from">
      <select
        data-so="quality-evidence-from"
        className="text_pole st-input"
        value={selected.evidence_from ?? ""}
        disabled={isReserved || selected.source !== "extractor"}
        onChange={(event) => patch({ evidence_from: (event.target.value || undefined) as EvidenceFrom | undefined })}
      >
        <option value="">Any line (default)</option>
        <option value="any">Any line (decided)</option>
        <option value="world">Only lines the player did not write</option>
      </select>
    </Field>

    {selected.source === "extractor" ? (
      <Field label="Commitment evidence (regex)">
        <input
          data-so="quality-commit-evidence"
          className="text_pole st-input"
          value={selected.commit_evidence ?? ""}
          disabled={isReserved}
          placeholder="take|accept|sign|I swear"
          onChange={(event) => patch({ commit_evidence: event.target.value || undefined })}
        />
        <span className="text-[10px] st-muted">
          A reading only sets this quality when the quote it cited matches. Use it for one-way commitments
          (taking a posting, swearing an oath) so a scene aside can never advance the story.
        </span>
      </Field>
    ) : null}

    {selected.source === "extractor" && !isReserved ? (
      <QualityReadEditor quality={selected} storyTitle={draft.title} checkpoint={draft.checkpoints.find((checkpoint) => checkpoint.start) ?? draft.checkpoints[0] ?? null} onChange={patch} />
    ) : null}
  </>
);

const QualityDeleteRow = ({ isReserved, confirming, usages, onDelete }: { isReserved: boolean; confirming: boolean; usages: ReturnType<typeof findQualityUsages>; onDelete: () => void }) => (
  <>
    <div className="flex items-center gap-2 border-t st-divider pt-3">
      <button type="button" className="st-button danger" disabled={isReserved} onClick={onDelete}>Delete quality</button>
      {confirming ? (
        <span className="text-xs st-text-error">Used in {usages.length} place(s) — click Delete again to confirm.</span>
      ) : null}
    </div>

    {confirming && usages.length ? (
      <ul className="flex flex-col gap-1 text-xs st-muted" aria-label="Quality usages">
        {usages.map((usage, index) => <li key={index}>{usage.kind}: {usage.location}</li>)}
      </ul>
    ) : null}
  </>
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
    if (selected?.read_as && !READ_AS_TYPES[selected.read_as].includes(type)) {
      change.read_as = undefined;
      change.criteria = undefined;
    }
    patch(change);
  };

  const handleSourceChange = (source: QualitySource) => {
    const change: Partial<Quality> = { source };
    if (source === "code") {
      change.ledger_binding = undefined;
      change.read_as = undefined;
      change.criteria = undefined;
      change.evidence_from = undefined;
      change.commit_evidence = undefined;
    }
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
    <div className="flex flex-col gap-3 sm:flex-row">
      <QualityList qualities={qualities} selectedKey={selectedKey} reserved={reserved} onAdd={handleAdd} onSelect={(key) => { setSelectedKey(key); setConfirmKey(null); }} />
      <div className="flex-1">
        {!selected ? (
          <div className="st-subpanel p-4 text-sm st-muted">Select or add a quality to edit it.</div>
        ) : (
          <div className="st-subpanel flex flex-col gap-3 p-3">
            {isReserved ? <div className="st-alert-error rounded px-2 py-1 text-xs">This is a derived quality ({selected.key}); the engine manages it.</div> : null}
            <QualityShapeFields selected={selected} isReserved={isReserved} patch={patch} onRename={handleRenameKey} onType={handleTypeChange} onSource={handleSourceChange} />
            <QualityScopeFields selected={selected} isReserved={isReserved} draft={draft} patch={patch} onScope={setScopeHint} onLedger={setLedgerBinding} />
            <QualityDeleteRow isReserved={isReserved} confirming={confirmKey === selected.key} usages={usages} onDelete={handleDelete} />
          </div>
        )}
      </div>
    </div>
  );
};

export default QualityEditor;

import React, { useMemo, useState } from "react";

export type Option = { value: string; label: string };

type Props = {
  options: Option[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  className?: string;
  listHeight?: number; // pixels
};

const MultiSelect: React.FC<Props> = ({ options, value, onChange, placeholder = "Search…", className = "", listHeight = 180 }) => {
  const [query, setQuery] = useState("");

  const normalizedSelected = useMemo(() => new Set(value ?? []), [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...options].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
    if (!q) return sorted;
    return sorted.filter((opt) => opt.label.toLowerCase().includes(q));
  }, [options, query]);

  const toggle = (val: string) => {
    const set = new Set(normalizedSelected);
    if (set.has(val)) set.delete(val); else set.add(val);
    onChange(Array.from(set));
  };

  const selectAllFiltered = () => {
    const set = new Set(normalizedSelected);
    filtered.forEach((opt) => set.add(opt.value));
    onChange(Array.from(set));
  };

  const clearAll = () => onChange([]);

  const selectedCount = normalizedSelected.size;

  return (
    <div className={`w-full ${className}`}>
      <div className="flex items-center gap-2 mb-2">
        <input
          type="text"
          className="text_pole st-input w-full"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="whitespace-nowrap text-[11px] st-muted">{selectedCount} selected</div>
      </div>
      <div className="flex items-center gap-2 mb-2 text-[11px]">
        <button
          type="button"
          className="st-button secondary px-2 py-0.5 text-[11px]"
          onClick={selectAllFiltered}
        >
          Select filtered
        </button>
        <button
          type="button"
          className="st-button secondary px-2 py-0.5 text-[11px]"
          onClick={clearAll}
        >
          Clear
        </button>
      </div>
      <div
        className="rounded border st-border st-bg-active overflow-auto"
        style={{ maxHeight: listHeight, minHeight: Math.min(listHeight, 120) }}
      >
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-[12px] st-muted">No results</div>
        ) : (
          <ul className="divide-y st-divider">
            {filtered.map((opt) => {
              const checked = normalizedSelected.has(opt.value);
              const isInactive = /\(not in lorebook\)\s*$/i.test(opt.label);
              return (
                <li key={opt.value} className="px-3 py-1.5 text-sm flex items-center gap-2 cursor-pointer hover:st-bg-hover" onClick={() => toggle(opt.value)}>
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded st-border st-bg-active st-text-active"
                    checked={checked}
                    onChange={() => toggle(opt.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className={`truncate ${isInactive ? "opacity-70" : ""}`}>{opt.label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default MultiSelect;


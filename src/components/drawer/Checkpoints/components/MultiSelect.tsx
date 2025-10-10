import React from "react";

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
  const [query, setQuery] = React.useState("");

  const normalizedSelected = React.useMemo(() => new Set(value ?? []), [value]);

  const filtered = React.useMemo(() => {
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
          className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="whitespace-nowrap text-[11px] text-slate-400">{selectedCount} selected</div>
      </div>
      <div className="flex items-center gap-2 mb-2 text-[11px]">
        <button
          type="button"
          className="inline-flex items-center justify-center rounded border bg-slate-800 border-slate-700 px-2 py-0.5 text-[11px] font-medium text-slate-200 transition hover:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-500"
          onClick={selectAllFiltered}
        >
          Select filtered
        </button>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded border bg-slate-800 border-slate-700 px-2 py-0.5 text-[11px] font-medium text-slate-200 transition hover:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-500"
          onClick={clearAll}
        >
          Clear
        </button>
      </div>
      <div
        className="rounded border border-slate-700 bg-slate-800 overflow-auto"
        style={{ maxHeight: listHeight, minHeight: Math.min(listHeight, 120) }}
      >
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-[12px] text-slate-400">No results</div>
        ) : (
          <ul className="divide-y divide-slate-700">
            {filtered.map((opt) => {
              const checked = normalizedSelected.has(opt.value);
              const isInactive = /\(not in lorebook\)\s*$/i.test(opt.label);
              return (
                <li key={opt.value} className="px-3 py-1.5 text-sm flex items-center gap-2 cursor-pointer hover:bg-slate-900" onClick={() => toggle(opt.value)}>
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-700 text-slate-300 focus:ring-1 focus:ring-slate-500"
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


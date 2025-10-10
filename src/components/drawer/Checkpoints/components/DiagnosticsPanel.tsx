import React from "react";

type Diagnostic = { ok: boolean; name: string; detail: string };

type Props = { diagnostics: Diagnostic[] };

const DiagnosticsPanel: React.FC<Props> = ({ diagnostics }) => {
  return (
    <div className="rounded-lg border border-slate-800 bg-[var(--SmartThemeBlurTintColor)] shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-2 font-semibold">Diagnostics</div>
      <div className="flex flex-col gap-2 p-3">
        {!diagnostics.length ? <div className="text-xs text-slate-400">Run diagnostics to view results.</div> : null}
        {diagnostics.map((item, idx) => (
          <div key={`${item.name}-${idx}`} className={item.ok ? "text-emerald-300" : "text-rose-300"}>
            <div className="font-medium">{item.name}</div>
            <div className="text-xs opacity-80">{item.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DiagnosticsPanel;


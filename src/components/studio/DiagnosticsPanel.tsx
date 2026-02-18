import React from "react";

type Diagnostic = { ok: boolean; name: string; detail: string };

type Props = { diagnostics: Diagnostic[] };

const DiagnosticsPanel: React.FC<Props> = ({ diagnostics }) => {
  const hasErrors = diagnostics.some((d) => !d.ok);

  if (!hasErrors) {
    return null;
  }

  return (
    <div className="st-panel shadow-sm">
      <div className="st-panel-header flex items-center justify-between gap-2 px-3 py-2 font-semibold">Diagnostics</div>
      <div className="flex flex-col gap-2 p-3">
        {diagnostics.filter((item) => !item.ok).map((item, idx) => (
          <div key={`${item.name}-${idx}`} className="st-text-error">
            <div className="font-medium">{item.name}</div>
            <div className="text-xs opacity-80">{item.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DiagnosticsPanel;


import React from "react";

type Props = {
  disabled?: boolean;
  hasChanges: boolean;
  savePending?: boolean;
  saveDisabled?: boolean;
  saveAsDisabled?: boolean;
  canAddTransition: boolean;
  onAddCheckpoint: () => void;
  onAddTransition: () => void;
  onExport: () => void;
  onImportPick: () => void;
  onRunDiagnostics: () => void;
  onReset: () => void;
  onSave: () => void;
  onSaveAs: () => void;
};

const Toolbar: React.FC<Props> = ({
  disabled,
  hasChanges,
  savePending,
  saveDisabled,
  saveAsDisabled,
  canAddTransition,
  onAddCheckpoint,
  onAddTransition,
  onExport,
  onImportPick,
  onRunDiagnostics,
  onReset,
  onSave,
  onSaveAs,
}) => {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className="inline-flex items-center justify-center rounded border bg-slate-800 border-slate-700 px-3 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={onAddCheckpoint}
        disabled={!!disabled}
      >
        + Checkpoint
      </button>
      <button
        type="button"
        className="inline-flex items-center justify-center rounded border bg-slate-800 border-slate-700 px-3 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={onAddTransition}
        disabled={!!disabled || !canAddTransition}
      >
        + Transition
      </button>
      <button
        type="button"
        className="inline-flex items-center justify-center rounded border bg-slate-800 border-slate-700 px-3 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={onExport}
        disabled={!canAddTransition}
      >
        Export JSON
      </button>
      <button
        type="button"
        className="inline-flex items-center justify-center rounded border bg-slate-800 border-slate-700 px-3 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={onImportPick}
      >
        Import JSON
      </button>
      <button
        type="button"
        className="inline-flex items-center justify-center rounded border bg-slate-800 border-slate-700 px-3 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={onRunDiagnostics}
      >
        Run Diagnostics
      </button>
      <button
        type="button"
        className="inline-flex items-center justify-center rounded border bg-slate-800 border-slate-700 px-3 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={onSave}
        disabled={!!saveDisabled}
      >
        {savePending ? "Saving..." : "Save"}
      </button>
      <button
        type="button"
        className="inline-flex items-center justify-center rounded border bg-slate-800 border-slate-700 px-3 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={onSaveAs}
        disabled={!!saveAsDisabled || !!savePending}
      >
        Save As
      </button>
      <button
        type="button"
        className="inline-flex items-center justify-center rounded border bg-slate-800 border-slate-700 px-3 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={onReset}
        disabled={!hasChanges}
      >
        Reset Draft
      </button>
    </div>
  );
};

export default Toolbar;

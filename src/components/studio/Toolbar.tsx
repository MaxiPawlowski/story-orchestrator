import React from "react";

type Props = {
  hasChanges: boolean;
  savePending?: boolean;
  saveDisabled?: boolean;
  saveAsDisabled?: boolean;
  canAddTransition: boolean;
  onExport: () => void;
  onImportPick: () => void;
  onReset: () => void;
  onSave: () => void;
  onSaveAs: () => void;
};

const Toolbar: React.FC<Props> = ({
  hasChanges,
  savePending,
  saveDisabled,
  saveAsDisabled,
  canAddTransition,
  onExport,
  onImportPick,
  onReset,
  onSave,
  onSaveAs,
}) => {
  return (
    <>
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
    </>
  );
};

export default Toolbar;

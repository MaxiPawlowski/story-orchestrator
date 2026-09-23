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
        className="st-button secondary"
        onClick={onExport}
        disabled={!canAddTransition}
      >
        Export JSON
      </button>
      <button
        type="button"
        className="st-button secondary"
        onClick={onImportPick}
      >
        Import JSON
      </button>
      <button
        type="button"
        className="st-button primary"
        onClick={onSave}
        disabled={!!saveDisabled}
      >
        {savePending ? "Saving..." : "Save"}
      </button>
      <button
        type="button"
        className="st-button primary"
        onClick={onSaveAs}
        disabled={!!saveAsDisabled || !!savePending}
      >
        Save As
      </button>
      {/* v2.3 plan 09: the draft's state is stated, not implied by a disabled button — an author
          who does not know the draft is unsaved is the author who loses it. */}
      {hasChanges && <span id="so-draft-unsaved" className="st-pill px-1 text-[10px]" role="status">unsaved draft</span>}
      <button
        type="button"
        className="st-button secondary"
        onClick={onReset}
        disabled={!hasChanges}
      >
        Reset Draft
      </button>
    </>
  );
};

export default Toolbar;

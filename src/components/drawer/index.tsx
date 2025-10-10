import Requirements from "./Requirements";
import Checkpoints from "./Checkpoints";

import { useCallback, useEffect, useRef, useState } from "react";
import { useStoryContext } from "@hooks/useStoryContext";
import CheckpointEditorModal from "./Checkpoints/CheckpointEditorModal";
import { Story } from "@utils/story-schema";

const DrawerWrapper = () => {
  const [isMinimized, setIsMinimized] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const {
    ready,
    title,
    checkpoints: checkpointRows,
    currentUserName,
    requirementsReady
  } = useStoryContext();
  const { story, validate, applyStory } = useStoryContext();
  const [showEditor, setShowEditor] = useState(false);

  const handleApply = useCallback((input: Story) => {
    return applyStory(input);
  }, [applyStory]);

  useEffect(() => {
    console.log('[DrawerWrapper] Story Orchestrator ready:', ready, 'Title:', title);
  }, [ready, title]);

  return (
    <div className="rounded">
      <div className="flex items-center justify-between px-3">
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium">Hi {currentUserName}</span>
        </div>
        <button
          type="button"
          className="text-xs px-2 py-1 border rounded bg-transparent"
          onClick={() => setShowEditor((prev) => !prev)}
        >
          {showEditor ? "Hide Editor" : "Open Editor"}
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={isMinimized ? 'Restore' : 'Minimize'}
            title={isMinimized ? 'Restore' : 'Minimize'}
            className="px-2 py-1 text-sm rounded border bg-transparent"
            onClick={() => setIsMinimized((s) => !s)}
          >
            {isMinimized ? '▢' : '▁'}
          </button>

          <button
            type="button"
            aria-label="Close"
            title="Close"
            className="px-2 py-1 text-sm rounded border bg-transparent"
            onClick={() => document.getElementById("drawer-manager")?.remove()}
          >
            ✕
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="p-2">
          {!requirementsReady && <Requirements />}
          {ready && requirementsReady && checkpointRows.length > 0 && (
            <Checkpoints
              title={title}
              checkpoints={checkpointRows}
            />
          )}
        </div>
      )}


      <CheckpointEditorModal
        open={showEditor}
        onClose={() => setShowEditor(false)}
        sourceStory={story}
        validate={validate}
        onApply={handleApply}
        disabled={!story}
      />

    </div>
  );
};

export default DrawerWrapper;




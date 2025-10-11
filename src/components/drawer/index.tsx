import Requirements from "./Requirements";
import Checkpoints from "./Checkpoints";

import { useState } from "react";
import { useStoryContext } from "@hooks/useStoryContext";

const DrawerWrapper = () => {
  const [isMinimized, setIsMinimized] = useState(false);
  const {
    ready,
    title,
    checkpoints: checkpointRows,
    currentUserName,
    requirementsReady
  } = useStoryContext();
  const { story, validate, applyStory } = useStoryContext();

  return (
    <div className="rounded">
      <div className="flex items-center justify-between px-3">
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium">Hi {currentUserName}</span>
        </div>
        {/* editor control moved to Settings panel */}
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


      {/* CheckpointEditorModal is rendered from Settings now */}

    </div>
  );
};

export default DrawerWrapper;




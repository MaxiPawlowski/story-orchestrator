import Requirements from "./Requirements";
import Checkpoints from "./Checkpoints";

import { useEffect, useState } from "react";
import { useStoryContext } from "@hooks/useStoryContext";

const DrawerWrapper = () => {
  const [isOpen, setIsOpen] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const {
    ready,
    title,
    checkpoints: checkpointRows,
    currentUserName,
    requirementsReady
  } = useStoryContext();

  useEffect(() => {
    console.log('[DrawerWrapper] Story Orchestrator ready:', ready, 'Title:', title);
  }, [ready, title]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="rounded">
      <div className="flex items-center justify-between px-3">
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium">Hi {currentUserName}</span>
        </div>

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
            onClick={() => setIsOpen(false)}
          >
            ✕
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="p-2">
          <Requirements />
          {ready && requirementsReady && checkpointRows.length > 0 && (
            <Checkpoints
              title={title}
              checkpoints={checkpointRows}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default DrawerWrapper;




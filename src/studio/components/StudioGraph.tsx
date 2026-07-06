import React, { useMemo, useState } from "react";
import GraphPanel from "@components/studio/GraphPanel";
import { useDraftStore } from "../draft";
import { addCheckpoint, addTransition } from "../mutations";
import { toGraphDraft, toMermaid } from "../graphAdapter";

const StudioGraph: React.FC = () => {
  const draft = useDraftStore((state) => state.draft);
  const mutate = useDraftStore((state) => state.mutate);
  const selectCheckpoint = useDraftStore((state) => state.selectCheckpoint);
  const selectedCheckpointId = useDraftStore((state) => state.selectedCheckpointId);

  const graphDraft = useMemo(() => toGraphDraft(draft), [draft]);
  const mermaid = useMemo(() => toMermaid(draft), [draft]);
  const [copied, setCopied] = useState(false);

  const handleCopyMermaid = async () => {
    try {
      await navigator.clipboard?.writeText(mermaid);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex h-full min-h-[24rem] flex-col gap-2">
      <div className="flex min-h-[20rem] flex-1">
        <GraphPanel
          draft={graphDraft}
          selectedId={selectedCheckpointId}
          canAddTransition={draft.checkpoints.length > 0}
          onSelect={selectCheckpoint}
          onAddCheckpoint={() => mutate((current) => addCheckpoint(current))}
          onAddTransition={() => mutate((current) => addTransition(current))}
        />
      </div>
      <details className="st-subpanel p-2 text-xs">
        <summary className="cursor-pointer">Mermaid export</summary>
        <div className="mt-2 flex flex-col gap-2">
          <button type="button" className="st-button secondary self-start" onClick={handleCopyMermaid}>{copied ? "Copied" : "Copy"}</button>
          <pre className="overflow-auto whitespace-pre-wrap" aria-label="Mermaid source">{mermaid}</pre>
        </div>
      </details>
    </div>
  );
};

export default StudioGraph;

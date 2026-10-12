import React, { useMemo, useState } from "react";
import GraphPanel from "@components/studio/GraphPanel";
import { useDraftStore } from "../draft";
import { addCheckpoint, addTransition, newTransition, removeCheckpoint } from "../mutations";
import { toGraphDraft, toMermaid } from "../graphAdapter";
import CheckpointEditor from "./CheckpointEditor";
import TransitionEditor from "./TransitionEditor";

type Props = {
  onOpenCheckpoint?: (id: string) => void;
  backgroundNames?: string[];
};

const StudioGraph: React.FC<Props> = ({ onOpenCheckpoint, backgroundNames = [] }) => {
  const draft = useDraftStore((state) => state.draft);
  const mutate = useDraftStore((state) => state.mutate);
  const selectCheckpoint = useDraftStore((state) => state.selectCheckpoint);
  const selectedCheckpointId = useDraftStore((state) => state.selectedCheckpointId);

  const graphDraft = useMemo(() => toGraphDraft(draft), [draft]);
  const mermaid = useMemo(() => toMermaid(draft), [draft]);
  const [copied, setCopied] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [source, setSource] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"checkpoint" | "transition" | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [transitionIndex, setTransitionIndex] = useState(0);
  const [menuId, setMenuId] = useState<string | null>(null);
  const choose = (id: string) => {
    selectCheckpoint(id);
    if (connecting) {
      if (!source) { setSource(id); return; }
      const index = draft.transitions.length;
      mutate((current) => {
        const priorities = current.transitions.filter((edge) => edge.from === source && edge.to === id).map((edge) => edge.priority);
        return addTransition(current, { ...newTransition(source, id), priority: priorities.length ? Math.max(...priorities) + 1 : 0 });
      });
      setTransitionIndex(index);
      setConnecting(false); setSource(null); setSheet("transition");
      return;
    }
    if (window.matchMedia("(max-width: 699px)").matches) setSheet("checkpoint");
    else onOpenCheckpoint?.(id);
  };

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
      <p className="m-0 text-xs st-muted sm:hidden" data-so="graph-narrow-hint">Pinch to zoom, drag to pan, tap a checkpoint to edit. Choose + Transition, then tap its source and target.</p>
      {connecting && <div role="status" className="st-subpanel p-2">{source ? "Tap the destination checkpoint." : "Tap the source checkpoint."}
        <button className="st-button secondary" onClick={() => { setConnecting(false); setSource(null); }}>Cancel transition</button></div>}
      <div className="flex min-h-[20rem] flex-1">
        <GraphPanel
          draft={graphDraft}
          selectedId={selectedCheckpointId}
          canAddTransition={draft.checkpoints.length > 0}
          onSelect={choose}
          onLongPress={(id) => { selectCheckpoint(id); setMenuId(id); }}
          onAddCheckpoint={() => {
            mutate((current) => addCheckpoint(current));
            const id = useDraftStore.getState().draft.checkpoints.at(-1)?.id;
            if (id) choose(id);
          }}
          onAddTransition={() => { setConnecting(true); setSource(null); setSheet(null); }}
        />
      </div>
      {menuId && <div className="so-graph-sheet" role="region" aria-label="Checkpoint actions">
        <h3>{draft.checkpoints.find((checkpoint) => checkpoint.id === menuId)?.name}</h3>
        <button className="st-button" onClick={() => { choose(menuId); setSheet("checkpoint"); setMenuId(null); }}>Edit checkpoint</button>
        <button className="st-button" onClick={() => { setConnecting(true); setSource(menuId); setMenuId(null); }}>Connect from here</button>
        <button className="st-button secondary" onClick={() => { mutate((current) => removeCheckpoint(current, menuId)); setMenuId(null); }}>Remove checkpoint</button>
        <button className="st-button secondary" onClick={() => setMenuId(null)}>Back to graph</button>
      </div>}
      {sheet && <div className={`so-graph-sheet ${expanded ? "so-graph-sheet-expanded" : ""}`} role="region" aria-label={`${sheet} editor`}
        onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setSheet(null); } }}>
        <div className="so-graph-sheet-actions"><button className="st-button secondary" onClick={() => setSheet(null)}>Back to graph</button>
          <button className="st-button secondary" onClick={() => setExpanded(!expanded)}>{expanded ? "Collapse editor" : "Expand editor"}</button></div>
        <div className="so-graph-sheet-content">{sheet === "checkpoint" ? <CheckpointEditor compact backgroundNames={backgroundNames} />
          : <TransitionEditor key={transitionIndex} initialIndex={transitionIndex} />}</div>
      </div>}
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

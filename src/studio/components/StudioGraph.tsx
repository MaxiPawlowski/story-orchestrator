import React, { useEffect, useMemo, useState } from "react";
import GraphPanel from "@components/studio/GraphPanel";
import { Button } from "@components/ui/Button";
import { IconButton } from "@components/ui/IconButton";
import { useDraftStore } from "../draft";
import { addCheckpoint, addTransition, newTransition, removeCheckpoint } from "../mutations";
import { toGraphDraft } from "../graphAdapter";
import CheckpointEditor from "./CheckpointEditor";
import TransitionEditor from "./TransitionEditor";
import "../mobile.css";

type Props = {
  backgroundNames?: string[];
};

export const SPLIT_QUERY = "(min-width: 1000px)";

const useSplit = (): boolean => {
  const query = useMemo(() => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(SPLIT_QUERY) : null), []);
  const [split, setSplit] = useState(() => Boolean(query?.matches));
  useEffect(() => {
    if (!query) return undefined;
    const change = () => setSplit(query.matches);
    change();
    query.addEventListener?.("change", change);
    return () => query.removeEventListener?.("change", change);
  }, [query]);
  return split;
};

type Pane = "checkpoint" | "transition";

const EditorBody = ({ pane, transitionIndex, backgroundNames }: { pane: Pane; transitionIndex: number; backgroundNames: string[] }) => (pane === "checkpoint"
  ? <CheckpointEditor compact backgroundNames={backgroundNames} />
  : <TransitionEditor key={transitionIndex} initialIndex={transitionIndex} />);

const StudioGraph: React.FC<Props> = ({ backgroundNames = [] }) => {
  const draft = useDraftStore((state) => state.draft);
  const mutate = useDraftStore((state) => state.mutate);
  const selectCheckpoint = useDraftStore((state) => state.selectCheckpoint);
  const selectedCheckpointId = useDraftStore((state) => state.selectedCheckpointId);
  const split = useSplit();

  const graphDraft = useMemo(() => toGraphDraft(draft), [draft]);
  const [connecting, setConnecting] = useState(false);
  const [source, setSource] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Pane | null>(null);
  const [pane, setPane] = useState<Pane>("checkpoint");
  const [snap, setSnap] = useState<"half" | "full">("half");
  const [transitionIndex, setTransitionIndex] = useState(0);
  const [menuId, setMenuId] = useState<string | null>(null);
  const open = (next: Pane) => {
    setPane(next);
    if (!split) setSheet(next);
  };
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
      setConnecting(false); setSource(null); open("transition");
      return;
    }
    open("checkpoint");
  };

  const graph = (
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
  );

  return (
    <div className="flex h-full min-h-[24rem] flex-col gap-2" data-so="studio-graph" data-split={split || undefined}>
      <p className="m-0 text-xs st-muted sm:hidden" data-so="graph-narrow-hint">Pinch to zoom, drag to pan, tap a checkpoint to edit. Choose + Transition, then tap its source and target.</p>
      {connecting && <div role="status" className="st-subpanel flex flex-wrap items-center gap-2 p-2">{source ? "Tap the destination checkpoint." : "Tap the source checkpoint."}
        <Button size="sm" onClick={() => { setConnecting(false); setSource(null); }}>Cancel transition</Button></div>}
      {split ? (
        <div className="so-studio-split">
          <div className="so-studio-split-graph">{graph}</div>
          <section className="so-studio-split-editor" aria-label={pane === "checkpoint" ? "Checkpoint editor" : "Transition editor"} data-so="graph-editor" data-pane={pane}>
            {pane === "transition" && <div className="so-studio-split-head">
              <span className="font-semibold">Transition</span>
              <Button size="sm" variant="ghost" icon="fa-arrow-left" onClick={() => setPane("checkpoint")}>Back to checkpoint</Button>
            </div>}
            <EditorBody pane={pane} transitionIndex={transitionIndex} backgroundNames={backgroundNames} />
          </section>
        </div>
      ) : <div className="flex min-h-[20rem] flex-1">{graph}</div>}
      {menuId && <div className="so-graph-sheet" role="region" aria-label="Checkpoint actions">
        <h3>{draft.checkpoints.find((checkpoint) => checkpoint.id === menuId)?.name}</h3>
        <Button onClick={() => { setMenuId(null); setPane("checkpoint"); setSheet("checkpoint"); }}>Edit checkpoint</Button>
        <Button onClick={() => { setConnecting(true); setSource(menuId); setMenuId(null); }}>Connect from here</Button>
        <Button variant="danger" onClick={() => { mutate((current) => removeCheckpoint(current, menuId)); setMenuId(null); }}>Remove checkpoint</Button>
        <Button variant="ghost" onClick={() => setMenuId(null)}>Back to graph</Button>
      </div>}
      {!split && sheet && <div className="so-graph-sheet" data-snap={snap} role="region" aria-label={`${sheet} editor`}
        onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setSheet(null); } }}>
        <div className="so-graph-sheet-actions">
          <span className="so-graph-sheet-title">{sheet === "checkpoint" ? draft.checkpoints.find((checkpoint) => checkpoint.id === selectedCheckpointId)?.name ?? "Checkpoint" : "Transition"}</span>
          <IconButton icon={snap === "half" ? "fa-up-right-and-down-left-from-center" : "fa-down-left-and-up-right-to-center"} label={snap === "half" ? "Expand editor" : "Collapse editor"}
            onClick={() => setSnap(snap === "half" ? "full" : "half")} />
          <IconButton icon="fa-xmark" label="Back to graph" onClick={() => setSheet(null)} />
        </div>
        <div className="so-graph-sheet-content"><EditorBody pane={sheet} transitionIndex={transitionIndex} backgroundNames={backgroundNames} /></div>
      </div>}
    </div>
  );
};

export default StudioGraph;

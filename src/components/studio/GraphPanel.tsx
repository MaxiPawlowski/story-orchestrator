import React, { useEffect, useMemo, useRef, useState } from "react";
import cytoscape, { Core, EventObject, StylesheetJson } from "cytoscape";
import HelpTooltip from "./HelpTooltip";
import {
  buildGraphElements,
  createGraphStyles,
  type LayoutName,
  resizeAndFitGraph,
  resolveGraphThemeColors,
  runGraphLayout,
  syncGraphElements,
  type StoryGraphDraft,
} from "./graphPanelUtils";

type Props = {
  draft: StoryGraphDraft;
  selectedId: string | null;
  disabled?: boolean;
  canAddTransition: boolean;
  onSelect: (id: string) => void;
  onAddCheckpoint: () => void;
  onAddTransition: () => void;
};

const GraphPanel: React.FC<Props> = ({ draft, selectedId, onSelect, disabled, onAddCheckpoint, onAddTransition, canAddTransition }) => {
  const [layout, setLayout] = useState<LayoutName>("dagre");
  const [dagreReady, setDagreReady] = useState(false);
  const [cyReady, setCyReady] = useState(false);
  const [layoutTrigger, setLayoutTrigger] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const selectHandlerRef = useRef(onSelect);

  useEffect(() => {
    selectHandlerRef.current = onSelect;
  }, [onSelect]);

  const themeColors = useMemo(resolveGraphThemeColors, []);

  const elements = useMemo(() => buildGraphElements(draft, selectedId), [draft, selectedId]);

  useEffect(() => {
    let cy: Core | null = null;
    let timeoutHandle: number | null = null;
    let cancelled = false;

    const initialize = () => {
      if (cancelled) return;
      const container = containerRef.current;
      if (!container || !container.isConnected || container.offsetWidth === 0 || container.offsetHeight === 0) {
        timeoutHandle = window.setTimeout(initialize, 100);
        return;
      }

      try {
        cy = cytoscape({
          container,
          elements: [],
          boxSelectionEnabled: false,
          style: createGraphStyles(themeColors) as StylesheetJson,
        });
      } catch {
        timeoutHandle = window.setTimeout(initialize, 200);
        return;
      }

      const handleTap = (event: EventObject) => {
        const id = event.target.id();
        if (id) {
          selectHandlerRef.current?.(id);
        }
      };
      cy.on("tap", "node", handleTap);
      cyRef.current = cy;
      setCyReady(true);

      cleanup = () => {
        try {
          cy?.off("tap", "node", handleTap);
        } catch (err) {
          console.warn("[Story - GraphPanel] Failed to remove tap handler", err);
        }
        try {
          cy?.destroy();
        } catch (err) {
          console.warn("[Story - GraphPanel] Failed to destroy cytoscape instance", err);
        }
        cyRef.current = null;
        cy = null;
        setCyReady(false);
      };
    };

    let cleanup: (() => void) | null = null;

    timeoutHandle = window.setTimeout(initialize, 0);

    return () => {
      cancelled = true;
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
      }
      if (cleanup) cleanup();
    };
  }, [themeColors]);

  useEffect(() => {
    if (!cyReady) return;
    const container = containerRef.current;
    const cy = cyRef.current;
    if (!container || !cy) return;

    const fitCy = () => {
      const instance = cyRef.current;
      if (!instance) return;
      resizeAndFitGraph(instance);
    };

    fitCy();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", fitCy);
      return () => window.removeEventListener("resize", fitCy);
    }

    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(fitCy);
    });
    observer.observe(container);

    return () => observer.disconnect();
  }, [cyReady]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    syncGraphElements(cy, elements, layout, dagreReady);
  }, [elements, cyReady, layout, dagreReady]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || cy.elements().length === 0) return;
    runGraphLayout(cy, layout, dagreReady);
  }, [layoutTrigger, layout, cyReady, dagreReady]);

  useEffect(() => {
    let cancelled = false;
    import("cytoscape-dagre")
      .then((mod) => {
        if (cancelled) return;
        const register = "default" in mod ? mod.default : mod;
        if (typeof register === "function") {
          register(cytoscape);
          setDagreReady(true);
        }
      })
      .catch((err) => {
        console.warn("[Story - GraphPanel] Failed to load cytoscape-dagre", err);
        setDagreReady(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (!dagreReady && layout === "dagre") {
    return (
      <div className="flex items-center justify-center p-4">
        <span className="text-sm st-muted">Loading Dagre layout...</span>
      </div>
    );
  }

  return (
    <div className="st-panel flex flex-1 flex-col overflow-hidden shadow-sm">
      <div className="st-panel-header flex items-center justify-between gap-2 px-3 py-2">
        <div className="font-semibold">Graph <HelpTooltip title="Click a Checkpoint to configure it" /></div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="st-button secondary"
            onClick={onAddCheckpoint}
            disabled={!!disabled}
          >
            + Checkpoint
          </button>
          <button
            type="button"
            className="st-button secondary"
            onClick={onAddTransition}
            disabled={!!disabled || !canAddTransition}
          >
            + Transition
          </button>
          <button
            type="button"
            className="st-button secondary"
            onClick={() => setLayoutTrigger((prev) => prev + 1)}
          >
            Re-layout
          </button>
          <select
            value={layout}
            aria-label="Graph layout"
            onChange={(e) => {
              setLayout(e.target.value as LayoutName);
              setLayoutTrigger((prev) => prev + 1);
            }}
            className="text_pole st-input w-full mb-0"
          >
            <option value="breadthfirst">Breadthfirst</option>
            <option value="grid">Grid</option>
            <option value="cose">COSE</option>
            <option value="dagre" disabled={!dagreReady}>
              Dagre {dagreReady ? "" : "(unavailable)"}
            </option>
          </select>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 min-h-[20rem] w-full bg-[var(--SmartThemeBlurTintColor)]" />
    </div>
  );
};

export default GraphPanel;

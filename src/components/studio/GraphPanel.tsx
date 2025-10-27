import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import cytoscape, { Core, ElementDefinition, EventObject, LayoutOptions } from "cytoscape";
import { StoryDraft, LayoutName } from "@utils/checkpoint-studio";
import HelpTooltip from "./HelpTooltip";

type Props = {
  draft: StoryDraft;
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

  const elements = useMemo(() => {
    const nodes: ElementDefinition[] = draft.checkpoints.map((cp) => ({
      group: "nodes",
      data: { id: cp.id, label: cp.name || cp.id, type: draft.start === cp.id ? "start" : "checkpoint" },
      classes: selectedId === cp.id ? "selected" : undefined,
    }));
    const nodeIds = new Set(nodes.map((n) => n.data.id));
    const edges: ElementDefinition[] = draft.transitions
      .filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to))
      .map((e) => ({ group: "edges", data: { id: e.id, source: e.from, target: e.to, label: e.label || "" } }));
    return [...nodes, ...edges];
  }, [draft, selectedId]);

  const runLayout = useCallback((cy: Core, name: LayoutName) => {
    if (cy.elements().length === 0) return;
    const layoutName = name === "dagre" && !dagreReady ? "breadthfirst" : name;
    const options = { name: layoutName } as LayoutOptions;
    try {
      const layoutObj = cy.layout(options);
      if (layoutObj && typeof layoutObj.run === "function") layoutObj.run();
      else cy.layout({ name: "grid" }).run();
    } catch (err) {
      console.warn("[Story - GraphPanel] Primary layout failed, falling back to grid", err);
      try {
        cy.layout({ name: "grid" }).run();
      } catch (err2) {
        console.warn("[Story - GraphPanel] Grid layout fallback also failed", err2);
      }
    }
    try {
      cy.fit(undefined, 32);
    } catch (err) {
      console.warn("[Story - GraphPanel] Failed to fit cytoscape view", err);
    }
  }, [dagreReady]);

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
          style: [
            { selector: "node", style: { "background-color": "#1f2937", "border-color": "#3b82f6", "border-width": "1px", color: "#f8fafc", label: "data(label)", "text-max-width": "140px", "text-wrap": "wrap", "font-size": "11px", padding: "8px" } },
            { selector: "node[type = 'start']", style: { "background-color": "#2563eb" } },
            { selector: "node.selected", style: { "border-width": "3px", "border-color": "#facc15" } },
            { selector: "edge", style: { "curve-style": "bezier", "target-arrow-shape": "triangle", "line-color": "#94a3b8", "target-arrow-color": "#94a3b8", label: "data(label)", color: "#f8fafc", "font-size": "10px", "text-background-color": "#0f172a", "text-background-opacity": "0.6", "text-background-padding": "4px" } },
          ] as any,
        });
      } catch {
        timeoutHandle = window.setTimeout(initialize, 200);
        return;
      }

      const handleTap = (event: EventObject) => {
        const id = (event?.target as any)?.id?.();
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
  }, []);

  useEffect(() => {
    if (!cyReady) return;
    const container = containerRef.current;
    const cy = cyRef.current;
    if (!container || !cy) return;

    const fitCy = () => {
      const instance = cyRef.current;
      if (!instance) return;
      try {
        instance.resize();
        instance.fit(undefined, 32);
      } catch (err) {
        console.warn("[Story - GraphPanel] Failed to resize/fit cytoscape", err);
      }
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

    // Save current positions before removing elements
    const positions = new Map<string, { x: number; y: number }>();
    cy.nodes().forEach((node) => {
      const pos = node.position();
      positions.set(node.id(), { x: pos.x, y: pos.y });
    });

    const hadNodes = positions.size > 0;

    cy.elements().remove();
    cy.add(elements);

    // Restore positions for existing nodes
    let restoredCount = 0;
    cy.nodes().forEach((node) => {
      const savedPos = positions.get(node.id());
      if (savedPos) {
        node.position(savedPos);
        restoredCount++;
      }
    });

    // Only run layout when there are new nodes without saved positions
    const hasNewNodes = cy.nodes().length > restoredCount;
    const needsLayout = !hadNodes || hasNewNodes;

    if (needsLayout && elements.length > 0) {
      runLayout(cy, layout);
    }
  }, [elements, cyReady, layout, runLayout]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || cy.elements().length === 0) return;
    runLayout(cy, layout);
  }, [layoutTrigger, layout, cyReady, runLayout]);

  useEffect(() => {
    let cancelled = false;
    import("cytoscape-dagre")
      .then((mod) => {
        if (cancelled) return;
        const register = (mod as unknown as { default?: (instance: typeof cytoscape) => void }).default;
        const fn: ((instance: typeof cytoscape) => void) | undefined = register || (mod as unknown as (instance: typeof cytoscape) => void);
        if (typeof fn === "function") {
          fn(cytoscape);
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
        <span className="text-sm text-slate-400">Loading Dagre layout...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-slate-800 bg-[var(--SmartThemeBlurTintColor)] shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
        <div className="font-semibold">Graph <HelpTooltip title="Click a Checkpoint to configure it" /></div>
        <div className="flex items-center gap-2">
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
            className="inline-flex items-center justify-center rounded border bg-slate-800 border-slate-700 px-3 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500"
            onClick={() => setLayoutTrigger((prev) => prev + 1)}
          >
            Re-layout
          </button>
          <select
            value={layout}
            onChange={(e) => {
              setLayout(e.target.value as LayoutName);
              setLayoutTrigger((prev) => prev + 1);
            }}
            className="w-full rounded border border-slate-700 bg-slate-800 mb-0 px-3 py-1 text-xs text-slate-200 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-600"
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

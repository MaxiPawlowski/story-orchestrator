import type { Core, ElementDefinition, ShapedLayoutOptions } from "cytoscape";
import { log } from "@utils/log";

export type LayoutName = "breadthfirst" | "grid" | "cose" | "dagre";

export interface StoryGraphTransitionDraft {
  id?: string;
  _stableId?: string;
  to: string;
  label?: string;
}

export interface StoryGraphCheckpointDraft {
  id: string;
  name?: string;
  type?: "anchor" | "intermediate" | "stub";
  chapter?: string;
  transitions?: StoryGraphTransitionDraft[];
}

export interface StoryGraphChapter {
  id: string;
  label: string;
}

export interface StoryGraphDraft {
  start?: string;
  chapters?: StoryGraphChapter[];
  checkpoints: StoryGraphCheckpointDraft[];
}

export const CHAPTER_LANE_PREFIX = "chapter:";

export type GraphThemeColors = {
  bgActive: string;
  bgTint: string;
  border: string;
  text: string;
  info: string;
  warning: string;
};

const fallbackThemeColors: GraphThemeColors = {
  bgActive: "currentColor",
  bgTint: "transparent",
  border: "currentColor",
  text: "currentColor",
  info: "currentColor",
  warning: "currentColor",
};

const readThemeValue = (root: CSSStyleDeclaration, names: string[], fallback: string): string => {
  for (const name of names) {
    const value = root.getPropertyValue(name).trim();
    if (value) return value;
  }
  return fallback;
};

export const resolveGraphThemeColors = (): GraphThemeColors => {
  if (typeof window === "undefined") {
    return fallbackThemeColors;
  }

  const root = getComputedStyle(document.documentElement);
  return {
    bgActive: readThemeValue(root, ["--st-bg-active", "--SmartThemeBodyActiveColor"], fallbackThemeColors.bgActive),
    bgTint: readThemeValue(root, ["--st-bg-tint", "--SmartThemeBlurTintColor"], fallbackThemeColors.bgTint),
    border: readThemeValue(root, ["--st-border", "--SmartThemeBorderColor"], fallbackThemeColors.border),
    text: readThemeValue(root, ["--st-text-active", "--SmartThemeActiveColor"], fallbackThemeColors.text),
    info: readThemeValue(root, ["--st-info", "--SmartThemeQuoteColor"], fallbackThemeColors.info),
    warning: readThemeValue(root, ["--st-warning", "--SmartThemeWarningColor"], fallbackThemeColors.warning),
  };
};

export const buildGraphElements = (draft: StoryGraphDraft, selectedId: string | null): ElementDefinition[] => {
  const checkpoints = draft.checkpoints.filter((cp) => cp.id && cp.id.trim());
  const lanes = new Set((draft.chapters ?? []).map((chapter) => chapter.id));
  const lanesUsed = new Set(checkpoints.map((cp) => cp.chapter).filter((id): id is string => Boolean(id && lanes.has(id))));
  const laneNodes: ElementDefinition[] = (draft.chapters ?? [])
    .filter((chapter) => lanesUsed.has(chapter.id))
    .map((chapter) => ({ group: "nodes", data: { id: `${CHAPTER_LANE_PREFIX}${chapter.id}`, label: chapter.label, type: "chapter" }, selectable: false }));
  const nodes: ElementDefinition[] = checkpoints
    .map((cp) => ({
      group: "nodes",
      data: {
        id: cp.id, label: cp.name || cp.id, type: cp.type ?? "checkpoint",
        ...(cp.chapter && lanesUsed.has(cp.chapter) ? { parent: `${CHAPTER_LANE_PREFIX}${cp.chapter}` } : {}),
      },
      classes: [selectedId === cp.id ? "selected" : "", draft.start === cp.id ? "start" : ""].filter(Boolean).join(" ") || undefined,
    }));
  const nodeIds = new Set(nodes.map((node) => node.data.id));
  const edges: ElementDefinition[] = draft.checkpoints
    .flatMap((cp) => (cp.transitions ?? []).map((transition) => ({ ...transition, from: cp.id })))
    .filter((edge) => (edge.id || edge._stableId) && nodeIds.has(edge.from) && nodeIds.has(edge.to))
    .map((edge) => {
      const fullLabel = edge.label || "";
      const label = fullLabel.length > 28 ? `${fullLabel.slice(0, 26)}…` : fullLabel;
      return {
        group: "edges" as const,
        data: { id: edge.id || edge._stableId, source: edge.from, target: edge.to, label, fullLabel },
      };
    });

  return [...laneNodes, ...nodes, ...edges];
};

export const createGraphStyles = (themeColors: GraphThemeColors) => ([
  {
    selector: "node",
    style: {
      "background-color": themeColors.bgActive,
      "border-color": themeColors.info,
      "border-width": "1px",
      color: themeColors.text,
      label: "data(label)",
      "text-max-width": "140px",
      "text-wrap": "wrap",
      "font-size": "11px",
      padding: "8px",
    },
  },
  { selector: "node[type = 'anchor']", style: { "background-color": themeColors.info, shape: "ellipse" } },
  { selector: "node[type = 'intermediate']", style: { shape: "round-rectangle" } },
  { selector: "node[type = 'stub']", style: { "background-color": themeColors.warning, shape: "diamond" } },
  {
    selector: "node[type = 'chapter']",
    style: {
      "background-color": themeColors.bgTint,
      "background-opacity": "0.35",
      "border-style": "dashed",
      "border-color": themeColors.border,
      "text-valign": "top",
      "text-halign": "center",
      "font-weight": "bold",
      "font-size": "12px",
      padding: "18px",
      shape: "round-rectangle",
    },
  },
  { selector: "node.start", style: { "border-width": "3px", "border-style": "double", "border-color": themeColors.info } },
  { selector: "node.selected", style: { "border-width": "3px", "border-color": themeColors.warning } },
  {
    selector: "edge",
    style: {
      "curve-style": "bezier",
      "target-arrow-shape": "triangle",
      "line-color": themeColors.border,
      "target-arrow-color": themeColors.border,
      label: "data(label)",
      color: themeColors.text,
      "font-size": "10px",
      "text-background-color": themeColors.bgTint,
      "text-background-opacity": "0.8",
      "text-background-padding": "4px",
    },
  },
]);

export const runGraphLayout = (cy: Core, name: LayoutName, dagreReady: boolean): void => {
  if (cy.elements().length === 0) return;
  const layoutName = name === "dagre" && !dagreReady ? "breadthfirst" : name;
  const options: ShapedLayoutOptions = { name: layoutName, nodeDimensionsIncludeLabels: true, spacingFactor: 1.2, padding: 24 };
  try {
    const layout = cy.layout(options);
    if (layout && typeof layout.run === "function") layout.run();
    else cy.layout({ name: "grid" }).run();
  } catch (err) {
    log.warn("graph panel: Primary layout failed, falling back to grid", err);
    try {
      cy.layout({ name: "grid" }).run();
    } catch (fallbackErr) {
      log.warn("graph panel: Grid layout fallback also failed", fallbackErr);
    }
  }
  try {
    cy.fit(undefined, 32);
  } catch (err) {
    log.warn("graph panel: Failed to fit cytoscape view", err);
  }
};

export const resizeAndFitGraph = (cy: Core): void => {
  try {
    cy.resize();
    cy.fit(undefined, 32);
  } catch (err) {
    log.warn("graph panel: Failed to resize/fit cytoscape", err);
  }
};

export const syncGraphElements = (
  cy: Core,
  elements: ElementDefinition[],
  layout: LayoutName,
  dagreReady: boolean,
): void => {
  const positions = new Map<string, { x: number; y: number }>();
  cy.nodes().forEach((node) => {
    const pos = node.position();
    positions.set(node.id(), { x: pos.x, y: pos.y });
  });

  const hadNodes = positions.size > 0;

  cy.elements().remove();
  cy.add(elements);

  let restoredCount = 0;
  const placeable = cy.nodes().filter((node) => !node.isParent());
  placeable.forEach((node) => {
    const savedPos = positions.get(node.id());
    if (savedPos) {
      node.position(savedPos);
      restoredCount++;
    }
  });

  if ((!hadNodes || placeable.length > restoredCount) && elements.length > 0) {
    runGraphLayout(cy, layout, dagreReady);
  }
};

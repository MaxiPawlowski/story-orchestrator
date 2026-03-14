import type { Core, ElementDefinition, LayoutOptions } from "cytoscape";
import type { LayoutName, StoryDraft } from "@utils/checkpoint-studio";

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

export const buildGraphElements = (draft: StoryDraft, selectedId: string | null): ElementDefinition[] => {
  const nodes: ElementDefinition[] = draft.checkpoints
    .filter((cp) => cp.id && cp.id.trim())
    .map((cp) => ({
      group: "nodes",
      data: { id: cp.id, label: cp.name || cp.id, type: draft.start === cp.id ? "start" : "checkpoint" },
      classes: selectedId === cp.id ? "selected" : undefined,
    }));
  const nodeIds = new Set(nodes.map((node) => node.data.id));
  const edges: ElementDefinition[] = draft.checkpoints
    .flatMap((cp) => (cp.transitions ?? []).map((transition) => ({ ...transition, from: cp.id })))
    .filter((edge) => (edge.id || edge._stableId) && nodeIds.has(edge.from) && nodeIds.has(edge.to))
    .map((edge) => ({
      group: "edges",
      data: { id: edge.id || edge._stableId, source: edge.from, target: edge.to, label: edge.label || "" },
    }));

  return [...nodes, ...edges];
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
  { selector: "node[type = 'start']", style: { "background-color": themeColors.info } },
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
  const options = { name: layoutName } as LayoutOptions;
  try {
    const layout = cy.layout(options);
    if (layout && typeof layout.run === "function") layout.run();
    else cy.layout({ name: "grid" }).run();
  } catch (err) {
    console.warn("[Story - GraphPanel] Primary layout failed, falling back to grid", err);
    try {
      cy.layout({ name: "grid" }).run();
    } catch (fallbackErr) {
      console.warn("[Story - GraphPanel] Grid layout fallback also failed", fallbackErr);
    }
  }
  try {
    cy.fit(undefined, 32);
  } catch (err) {
    console.warn("[Story - GraphPanel] Failed to fit cytoscape view", err);
  }
};

export const resizeAndFitGraph = (cy: Core): void => {
  try {
    cy.resize();
    cy.fit(undefined, 32);
  } catch (err) {
    console.warn("[Story - GraphPanel] Failed to resize/fit cytoscape", err);
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
  cy.nodes().forEach((node) => {
    const savedPos = positions.get(node.id());
    if (savedPos) {
      node.position(savedPos);
      restoredCount++;
    }
  });

  if ((!hadNodes || cy.nodes().length > restoredCount) && elements.length > 0) {
    runGraphLayout(cy, layout, dagreReady);
  }
};

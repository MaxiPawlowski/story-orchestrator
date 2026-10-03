import { isRecord } from "@utils/guards";

export interface PanelGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export const DOCK_BELOW = 768;
export const PANEL_MIN = { w: 260, h: 180 };
export const MOVE_STEP = 16;
export const PANELS_KEY = "panels";

export const PANEL_DEFAULTS: Record<string, PanelGeometry> = {
  help: { x: 80, y: 80, w: 420, h: 520 },
  activity: { x: 120, y: 100, w: 440, h: 480 },
};

const fallback: PanelGeometry = { x: 80, y: 80, w: 420, h: 480 };

export const docked = (viewport: Viewport): boolean => viewport.width < DOCK_BELOW;

export const clampPanel = (geometry: PanelGeometry, viewport: Viewport): PanelGeometry => {
  const w = Math.max(PANEL_MIN.w, Math.min(geometry.w, viewport.width));
  const h = Math.max(PANEL_MIN.h, Math.min(geometry.h, viewport.height));
  return {
    w, h,
    x: Math.max(0, Math.min(geometry.x, viewport.width - w)),
    y: Math.max(0, Math.min(geometry.y, viewport.height - h)),
  };
};

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const readGeometry = (value: unknown): PanelGeometry | null =>
  (isRecord(value) && finite(value.x) && finite(value.y) && finite(value.w) && finite(value.h) ? { x: value.x, y: value.y, w: value.w, h: value.h } : null);

export const sanitizePanels = (value: unknown): Record<string, PanelGeometry> => (isRecord(value)
  ? Object.fromEntries(Object.entries(value).flatMap(([id, geometry]) => {
    const read = readGeometry(geometry);
    return read ? [[id, read] as const] : [];
  }))
  : {});

export const panelGeometry = (stored: Record<string, PanelGeometry>, id: string, viewport: Viewport): PanelGeometry =>
  clampPanel(stored[id] ?? PANEL_DEFAULTS[id] ?? fallback, viewport);

export type PanelKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

export const movedBy = (geometry: PanelGeometry, key: PanelKey, viewport: Viewport, step = MOVE_STEP): PanelGeometry => {
  const dx = key === "ArrowLeft" ? -step : key === "ArrowRight" ? step : 0;
  const dy = key === "ArrowUp" ? -step : key === "ArrowDown" ? step : 0;
  return clampPanel({ ...geometry, x: geometry.x + dx, y: geometry.y + dy }, viewport);
};

export const isPanelKey = (key: string): key is PanelKey => key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown";

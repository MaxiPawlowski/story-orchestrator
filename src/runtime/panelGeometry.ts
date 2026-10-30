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
  guide: { x: 100, y: 60, w: 780, h: 620 },
  journal: { x: 140, y: 90, w: 420, h: 540 },
  "stat-sheet": { x: 180, y: 120, w: 340, h: 420 },
  inspector: { x: 4000, y: 72, w: 400, h: 600 },
};

const fallback: PanelGeometry = { x: 80, y: 80, w: 420, h: 480 };

export const docked = (viewport: Viewport): boolean => viewport.width < DOCK_BELOW;

export const shownPanels = <T>(open: readonly T[], viewport: Viewport): T[] => (docked(viewport) ? open.slice(-1) : [...open]);

export const dockInset = (formTop: number | null, viewportHeight: number): number =>
  (formTop === null || !Number.isFinite(formTop) ? 0 : Math.max(0, Math.min(viewportHeight, Math.round(viewportHeight - formTop))));

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

export const panelFits = (stored: Record<string, PanelGeometry>, id: string): boolean => !stored[id] || stored[id].h === (PANEL_DEFAULTS[id] ?? fallback).h;

export const panelGeometry = (stored: Record<string, PanelGeometry>, id: string, viewport: Viewport): PanelGeometry =>
  clampPanel(stored[id] ?? PANEL_DEFAULTS[id] ?? fallback, viewport);

export type PanelKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

export const movedBy = (geometry: PanelGeometry, key: PanelKey, viewport: Viewport, step = MOVE_STEP): PanelGeometry => {
  const dx = key === "ArrowLeft" ? -step : key === "ArrowRight" ? step : 0;
  const dy = key === "ArrowUp" ? -step : key === "ArrowDown" ? step : 0;
  return clampPanel({ ...geometry, x: geometry.x + dx, y: geometry.y + dy }, viewport);
};

export const isPanelKey = (key: string): key is PanelKey => key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown";

export const SHEET_DOCK_KEY = "sheet-dock";
export const SHEET_WINDOW_KEY = "sheet";
export const SHEET_WIDTH = { min: 300, max: 640, initial: 380 };
export const SHEET_PEEK = 56;

export interface SheetDock {
  width: number;
  overlay: boolean;
}

export const sheetDock = (viewportWidth: number, chatRight: number, wanted: number): SheetDock => {
  const room = Math.max(0, Math.round(viewportWidth - chatRight));
  const want = Math.max(SHEET_WIDTH.min, Math.min(SHEET_WIDTH.max, Math.round(wanted)));
  if (room >= SHEET_WIDTH.min) return { width: Math.min(want, room), overlay: false };
  return { width: Math.min(want, Math.max(SHEET_WIDTH.min, viewportWidth)), overlay: true };
};

export type SheetSnap = "peek" | "half" | "full";

export const SHEET_SNAPS: readonly SheetSnap[] = ["peek", "half", "full"];

export const sheetSnaps = (viewportHeight: number, formTop: number, chatTop: number, lastReplyHeight: number): Record<SheetSnap, number> => {
  const area = Math.max(0, Math.round(formTop - chatTop));
  const full = Math.max(SHEET_PEEK, area);
  const keep = Math.min(Math.max(0, lastReplyHeight), area / 2);
  const half = Math.max(SHEET_PEEK, Math.min(full, Math.round(viewportHeight * 0.4), Math.round(area - keep)));
  return { peek: Math.min(SHEET_PEEK, full), half, full };
};

export const nearestSnap = (height: number, snaps: Record<SheetSnap, number>): SheetSnap =>
  SHEET_SNAPS.reduce((best, snap) => (Math.abs(snaps[snap] - height) < Math.abs(snaps[best] - height) ? snap : best), "half" as SheetSnap);

export const nextSnap = (snap: SheetSnap): SheetSnap => SHEET_SNAPS[(SHEET_SNAPS.indexOf(snap) + 1) % SHEET_SNAPS.length];

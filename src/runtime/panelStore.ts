import { getContext } from "@services/STAPI";
import { settingsRoot, writableSettingsRoot } from "./settingsRoot";
import { PANELS_KEY, sanitizePanels, type PanelGeometry } from "./panelGeometry";

export const readPanels = (): Record<string, PanelGeometry> => sanitizePanels(settingsRoot()[PANELS_KEY]);

export const savePanel = (id: string, geometry: PanelGeometry): void => {
  writableSettingsRoot()[PANELS_KEY] = { ...readPanels(), [id]: geometry };
  getContext().saveSettingsDebounced?.();
};

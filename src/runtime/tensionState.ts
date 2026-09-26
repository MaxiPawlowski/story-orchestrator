import type { TensionRuntimeState } from "./types";

export const defaultTension = (): TensionRuntimeState => ({ levels: [], smoothed: null });

export const sanitizeTension = (value: TensionRuntimeState | undefined): TensionRuntimeState => ({
  levels: Array.isArray(value?.levels) ? value.levels.slice(-50) : [],
  smoothed: typeof value?.smoothed === "number" ? value.smoothed : null,
});

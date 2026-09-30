import { TENSION_LEVELS, type TensionLevel } from "@engine/index";
import type { TensionHistoryRow, TensionRuntimeState } from "./types";

export const TENSION_HISTORY_LIMIT = 50;

export const defaultTension = (): TensionRuntimeState => ({ levels: [], smoothed: null, history: [] });

const isHistoryRow = (row: unknown): row is TensionHistoryRow => {
  const value = row as Partial<TensionHistoryRow> | null;
  return Boolean(value) && typeof value?.messageId === "number" && Number.isFinite(value.messageId)
    && typeof value.smoothed === "number" && (TENSION_LEVELS as readonly unknown[]).includes(value.level);
};

export const sanitizeTension = (value: TensionRuntimeState | undefined): TensionRuntimeState => ({
  levels: Array.isArray(value?.levels) ? value.levels.slice(-50) : [],
  smoothed: typeof value?.smoothed === "number" ? value.smoothed : null,
  history: Array.isArray(value?.history) ? value.history.filter(isHistoryRow).slice(-TENSION_HISTORY_LIMIT) : [],
});

export const appendTensionHistory = (history: TensionHistoryRow[], row: { messageId: number; level: TensionLevel | undefined; smoothed: number }): TensionHistoryRow[] => {
  if (!row.level || !Number.isFinite(row.messageId)) return history;
  const kept = history.filter((existing) => existing.messageId !== row.messageId);
  return [...kept, { messageId: row.messageId, level: row.level, smoothed: row.smoothed }].slice(-TENSION_HISTORY_LIMIT);
};

export const rollbackTensionHistory = (history: TensionHistoryRow[], messageId: number): TensionHistoryRow[] =>
  (Number.isFinite(messageId) ? history.filter((row) => row.messageId < messageId) : history);

import type { PlayerTurn, PressureCrossing } from "@pacing/engagement";
import type { PromisesState } from "@memory/promises/types";
import type { MemoryRuntimeState } from "./types";
import { playerTurnIds } from "./agencyRecovery";

export interface EngagementSignals {
  memoryIds: number[];
  relationEvents: number[];
  resolutions?: number[];
  pressures?: PressureCrossing[];
}

export interface EngagementSources {
  memory: Pick<MemoryRuntimeState, "entries" | "ledger">;
  promises?: PromisesState | null;
}

const ids = (rows: ReadonlyArray<{ messageId?: number }>): number[] =>
  rows.flatMap((row) => (typeof row.messageId === "number" && Number.isFinite(row.messageId) ? [row.messageId] : []));

export const engagementSignalsFrom = (sources: EngagementSources): EngagementSignals => ({
  memoryIds: [...ids(sources.memory.entries), ...ids(sources.memory.ledger ?? [])],
  relationEvents: (sources.promises?.rows ?? []).flatMap((row) => [row.source.messageId, ...row.events.map((event) => event.source.messageId)]),
});

const textOf = (row: unknown): string => {
  const mes = (row as { mes?: unknown } | null)?.mes;
  return typeof mes === "string" ? mes : "";
};

export const playerTurnsOf = (rows: readonly unknown[]): PlayerTurn[] => playerTurnIds(rows).map((id) => ({ id, text: textOf(rows[id]) }));

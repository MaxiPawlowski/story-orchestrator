import type { BoundaryLogEntry, EngineState, NormalizedStoryV2 } from "@engine/index";
import type { FactionAuthorRow } from "@engine/factions/standing";
import { gameLayer } from "@engine/validate/gameLayer";
import { scopeDropped } from "@extraction/scope";
import type { ScopeSourceContext } from "@extraction/scopeSources";
import type { LedgerEntry } from "@memory/types";

export interface FactionAuthorMove {
  id: string;
  add: number;
  heardBy: string;
  boundary: number | null;
  messageId: number | null;
}

export interface FactionAuthorEntry extends Omit<FactionAuthorRow, "moves"> {
  moves: FactionAuthorMove[];
  ledger: string[];
}

export interface FactionAuthorView {
  rows: FactionAuthorEntry[];
  scopeOverflow: string[];
}

const ledgerLines = (ledger: readonly LedgerEntry[], name: string): string[] => {
  const replaced = new Set(ledger.flatMap((entry) => (entry.supersedes ? [entry.supersedes] : [])));
  return ledger.filter((entry) => entry.entityType === "faction" && !replaced.has(entry.id) && entry.entity.trim().toLowerCase() === name.trim().toLowerCase())
    .map((entry) => `${entry.field}: ${entry.value}`);
};

export const factionAuthorSlice = (
  story: NormalizedStoryV2 | null, state: EngineState | null, authorView: boolean, log: readonly BoundaryLogEntry[], ledger: readonly LedgerEntry[], scopeContext?: ScopeSourceContext,
): FactionAuthorView | null => {
  const layer = story?.factions?.length && state && authorView ? gameLayer() : null;
  if (!story || !state || !layer) return null;
  const messageAt = (boundary: number | null) => (boundary === null ? null : log.find((entry) => entry.boundary === boundary)?.context.lastMessageId ?? null);
  return {
    rows: layer.factions.factionAuthorRows(story, state.blackboard.values).map((row) => ({
      ...row,
      moves: row.moves.map((move) => ({ ...move, messageId: messageAt(move.boundary) })),
      ledger: ledgerLines(ledger, row.name),
    })),
    scopeOverflow: scopeDropped(story, state, "faction", scopeContext),
  };
};

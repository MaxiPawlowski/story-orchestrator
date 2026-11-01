import { DEFAULT_RECALL_TOKENS, recallCandidates, recallMentions, renderRecall, selectRecall } from "../../src/memory/archiveRecall";
import { recencyWeights, type ScoreContext } from "../../src/memory/score";
import type { MemoryEntry } from "../../src/memory/types";
import type { MemoryRuntimeState } from "../../src/runtime/types";

export const PROBE_RECALL_WINDOW = 3;

export function probeArchiveRecall(memory: MemoryRuntimeState, chat: ReadonlyArray<{ mes: string; is_user?: boolean }>, boundary: number, resting: (entries: MemoryEntry[]) => MemoryEntry[]): string {
  const spoken = chat.filter((row) => row.mes.trim());
  const rows = memory.settings.retrievalQuery !== false ? spoken.slice(-PROBE_RECALL_WINDOW) : spoken.filter((row) => row.is_user).slice(-1);
  const weights = recencyWeights(rows.length);
  const parts = rows.map((row, index) => ({ text: row.mes, weight: weights[index] }));
  const text = parts.map((part) => part.text).join("\n");
  const candidates = resting(recallCandidates(memory.entries, text));
  if (!candidates.length) return "";
  const context: ScoreContext = {
    boundary, turnText: text, turnEntities: recallMentions(memory.entries, text), weights: memory.settings.scoreWeights,
    ...(memory.settings.retrievalQuery !== false ? { queryParts: parts } : {}),
    ...(memory.settings.strengthRetention !== false ? { useRecency: true } : {}),
  };
  return renderRecall(selectRecall(candidates, memory.chapters ?? [], context, { tokens: memory.settings.chapters?.recallTokens ?? DEFAULT_RECALL_TOKENS }));
}

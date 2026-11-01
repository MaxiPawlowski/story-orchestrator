import { acceptCompaction, type CompactionCandidate, type CompactionRefusal } from "@memory/compactionGate";
export { CompactionAttempts, compactionKey } from "@memory/compactionGate";
import { judgeSummary, type SummaryGuardVerdict } from "@memory/summaryGuard";
import type { MemoryCoordinator } from "./coordinators/memoryCoordinator";

export type ShortTermVerdict = SummaryGuardVerdict | { ok: false; reason: CompactionRefusal };

export function shortTermVerdict(memory: Pick<MemoryCoordinator, "chapters" | "getEntities">, candidate: CompactionCandidate): ShortTermVerdict {
  const accepted = acceptCompaction(candidate);
  if (!accepted.ok) return accepted;
  const state = memory.chapters.host.memory();
  return judgeSummary({ ...state, chapters: state.chapters ?? [] }, memory.getEntities(), candidate.summary, candidate.previous, candidate.window);
}

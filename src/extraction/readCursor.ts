import type { EngineHistory } from "@engine/index";

export function readCursorSeed(history: EngineHistory | null): number | null {
  if (!history?.log.length) return null;
  const ends = history.log
    .flatMap((entry) => entry.queue.applied)
    .filter((entry) => entry.source !== "mechanical" && entry.turnRange)
    .map((entry) => entry.turnRange?.to ?? -1);
  return ends.length ? Math.max(...ends) : -1;
}

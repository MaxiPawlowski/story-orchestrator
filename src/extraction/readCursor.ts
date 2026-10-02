import type { EngineHistory } from "@engine/index";
import type { SharedReadAudit } from "./types";

export function readCursorSeed(history: EngineHistory | null): number | null {
  if (!history?.log.length) return null;
  const ends = history.log
    .flatMap((entry) => entry.queue.applied)
    .filter((entry) => entry.source !== "mechanical" && entry.turnRange)
    .map((entry) => entry.turnRange?.to ?? -1);
  return ends.length ? Math.max(...ends) : -1;
}

export function droppedReadEnd(seed: number | null, audits: readonly Pick<SharedReadAudit, "window" | "acceptedDeltas">[]): number | null {
  const applied = seed ?? -1;
  const ends = audits.filter((audit) => audit.acceptedDeltas.length > 0 && audit.window.to > applied).map((audit) => audit.window.to);
  return ends.length ? Math.max(...ends) : null;
}

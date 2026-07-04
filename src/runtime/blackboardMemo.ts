import type { RuntimeSnapshot } from "./types";

export function renderBlackboardMemo(snapshot: RuntimeSnapshot): string {
  const entries = Object.entries(snapshot.blackboard);
  if (!entries.length) return "Story blackboard: empty";
  return entries.map(([key, value]) => {
    const meta = snapshot.blackboardMeta[key];
    const latch = meta?.latched ? ", latched" : "";
    return `${key}: ${String(value)} (${meta?.source ?? "unknown"}${latch})`;
  }).join("\n");
}

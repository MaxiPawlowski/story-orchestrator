import { addGatedEntry, checkpointWorldInfo, gatedWorldInfo, type BoundaryLogEntry, type GatedWorldInfo, type NormalizedStoryV2 } from "@engine/index";
import { bookKey } from "./worldInfoMatch";

export interface WorldInfoBookPlan {
  lorebook: string;
  enable: string[];
  disable: string[];
}

// A lorebook is global, so its flags say nothing about this chat. The chat's state is rebuilt from
// its own path instead: every gated entry starts off, then each checkpoint entered switches its
// entries in order (enables, then disables), which is what one continuous run of that path leaves.
export function worldInfoPlan(story: NormalizedStoryV2, path: string[]): WorldInfoBookPlan[] {
  const enabled: GatedWorldInfo = new Map();
  for (const id of path) {
    const { enable, disable } = checkpointWorldInfo(story.checkpointById[id]);
    enable.forEach((ref) => ref.comments.forEach((comment) => addGatedEntry(enabled, ref.lorebook, comment)));
    disable.forEach((ref) => ref.comments.forEach((comment) => enabled.get(ref.lorebook)?.delete(comment)));
  }
  return [...gatedWorldInfo([story])].map(([lorebook, comments]) => {
    const on = enabled.get(lorebook) ?? new Set<string>();
    return { lorebook, enable: [...comments].filter((comment) => on.has(comment)), disable: [...comments].filter((comment) => !on.has(comment)) };
  });
}

// Switching a chat away from a story turns off everything that story gates, except what the story
// taking over gates too: that story's own plan decides those.
// The book is matched the way the file write resolves it (file id, case-insensitive), or two stories
// spelling one book differently would release what the incoming story had just switched on.
export function releasePlan(owners: unknown[], keep: unknown | null): WorldInfoBookPlan[] {
  const kept: GatedWorldInfo = new Map();
  for (const [lorebook, comments] of gatedWorldInfo(keep ? [keep] : [])) comments.forEach((comment) => addGatedEntry(kept, bookKey(lorebook), comment));
  return [...gatedWorldInfo(owners)]
    .map(([lorebook, comments]) => ({ lorebook, enable: [], disable: [...comments].filter((comment) => !kept.get(bookKey(lorebook))?.has(comment)) }))
    .filter((plan) => plan.disable.length > 0);
}

export function stagedPath(path: string[], log: BoundaryLogEntry[]): string[] {
  const jump = [...log].reverse().find((entry) => entry.source === "manual");
  if (!jump) return path;
  const at = jump.after.visitedPath.length - 1;
  return at > 0 && path[at] === jump.after.activeCheckpointId ? path.slice(at) : path;
}

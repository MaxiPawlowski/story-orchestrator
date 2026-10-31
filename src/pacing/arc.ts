import type { BoundaryLogEntry, EngineState, NormalizedStory, TensionLevel } from "@engine/index";
import { TENSION_NUMERIC } from "./tension";

export type ArcProgressMode = "anchors" | "path";

export const ARC_PROGRESS_MODES: readonly ArcProgressMode[] = ["anchors", "path"];
export const DEFAULT_ARC_PROGRESS: ArcProgressMode = "path";
export const DEFAULT_TARGET_TURNS = 6;
export const PEAK_RUN = 2;
export const RELAX_BOUNDARIES = 3;

export const isArcProgressMode = (value: unknown): value is ArcProgressMode => value === "anchors" || value === "path";

const remainingCache = new WeakMap<NormalizedStory, Map<string, number>>();

export function anchorsToEnding(story: NormalizedStory, from: string): number {
  const cached = remainingCache.get(story) ?? new Map<string, number>();
  remainingCache.set(story, cached);
  const hit = cached.get(from);
  if (hit !== undefined) return hit;
  const cost = new Map<string, number>([[from, 0]]);
  const queue: string[] = [from];
  let best = Number.POSITIVE_INFINITY;
  while (queue.length) {
    queue.sort((a, b) => (cost.get(a) ?? 0) - (cost.get(b) ?? 0));
    const at = queue.shift() as string;
    const here = cost.get(at) ?? 0;
    const out = story.outgoingByCheckpoint[at] ?? [];
    if (!out.length) best = Math.min(best, here);
    for (const transition of out) {
      const step = here + (story.checkpointById[transition.to]?.type === "anchor" ? 1 : 0);
      if (step < (cost.get(transition.to) ?? Number.POSITIVE_INFINITY)) {
        cost.set(transition.to, step);
        queue.push(transition.to);
      }
    }
  }
  const remaining = Number.isFinite(best) ? best : 0;
  cached.set(from, remaining);
  return remaining;
}

const rawProgress = (story: NormalizedStory, at: string, visited: number, ramp: number): number => {
  const remaining = anchorsToEnding(story, at);
  const total = visited + remaining;
  if (!total) return 0;
  const onAnchor = story.checkpointById[at]?.type === "anchor";
  return Math.min(1, Math.max(0, (onAnchor ? visited - 1 + ramp : visited) / total));
};

export function pathProgress(story: NormalizedStory, state: Pick<EngineState, "visitedPath" | "activeCheckpointId">, playerTurns: number): number {
  let visited = 0;
  let best = 0;
  state.visitedPath.forEach((id, index) => {
    if (story.checkpointById[id]?.type === "anchor") visited += 1;
    const last = index === state.visitedPath.length - 1;
    const target = story.checkpointById[id]?.target_turn_length ?? DEFAULT_TARGET_TURNS;
    const ramp = last && id === state.activeCheckpointId ? Math.min(1, Math.max(0, playerTurns) / Math.max(1, target)) : 1;
    best = Math.max(best, rawProgress(story, id, visited, ramp));
  });
  return best;
}

export function anchorProgress(story: NormalizedStory, state: Pick<EngineState, "visitedAnchors">): number | null {
  const total = story.checkpoints.filter((checkpoint) => checkpoint.type === "anchor").length;
  return total ? state.visitedAnchors.length / total : null;
}

export interface TensionPoint {
  messageId: number;
  smoothed: number;
}

export function relaxDrop(history: readonly TensionPoint[]): TensionPoint | null {
  const critical = TENSION_NUMERIC.critical;
  const last = history[history.length - 1];
  if (!last || last.smoothed >= critical) return null;
  let drop = history.length - 1;
  while (drop > 0 && history[drop - 1].smoothed < critical) drop -= 1;
  let run = 0;
  for (let index = drop - 1; index >= 0 && history[index].smoothed >= critical; index -= 1) run += 1;
  return run >= PEAK_RUN ? history[drop] : null;
}

export function relaxActive(history: readonly TensionPoint[], log: readonly Pick<BoundaryLogEntry, "context">[]): boolean {
  const drop = relaxDrop(history);
  if (!drop) return false;
  const since = log.filter((entry) => entry.context.lastMessageId >= drop.messageId).length;
  return since <= RELAX_BOUNDARIES;
}

export const relaxCap = (expected: number | null, relax: boolean, tensionTarget: TensionLevel | undefined): number | null =>
  (expected !== null && relax && tensionTarget !== "peak" ? Math.min(expected, TENSION_NUMERIC.tense) : expected);

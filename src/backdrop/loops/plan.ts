export type LoopMode = "pre" | "auto" | false;

export interface LoopCheckpoint {
  id: string;
  effects?: { background?: { name?: string } | null; backdrop?: { loop?: LoopMode } | null } | null;
}

export interface LoopStory { checkpoints?: LoopCheckpoint[]; backdrop_defaults?: { loop?: LoopMode } | null }

export interface LoopTarget { checkpoint: string; background: string; still: string; mode: "pre" | "auto" }

export const backgroundStill = (name: string): string => `/backgrounds/${encodeURIComponent(name)}`;

export const backgroundNameOf = (url: string): string => {
  const path = url.split(/[?#]/)[0] ?? "";
  const last = path.slice(path.lastIndexOf("/") + 1);
  try { return decodeURIComponent(last); } catch { return last; }
};

export const loopModeOf = (story: LoopStory | null | undefined, checkpoint: LoopCheckpoint | null | undefined): LoopMode => {
  const own = checkpoint?.effects?.backdrop?.loop;
  if (own !== undefined) return own;
  return story?.backdrop_defaults?.loop ?? "auto";
};

export function preTargets(story: LoopStory | null | undefined): LoopTarget[] {
  const seen = new Set<string>();
  const targets: LoopTarget[] = [];
  for (const checkpoint of story?.checkpoints ?? []) {
    const background = checkpoint.effects?.background?.name?.trim();
    if (!background || loopModeOf(story, checkpoint) !== "pre" || seen.has(background)) continue;
    seen.add(background);
    targets.push({ checkpoint: checkpoint.id, background, still: backgroundStill(background), mode: "pre" });
  }
  return targets;
}

export function currentTarget(story: LoopStory | null | undefined, checkpointId: string | null | undefined, still: string | null | undefined): LoopTarget | null {
  const url = still?.trim();
  if (!url) return null;
  const checkpoint = story?.checkpoints?.find((entry) => entry.id === checkpointId) ?? null;
  const mode = loopModeOf(story, checkpoint);
  if (mode === false) return null;
  return { checkpoint: checkpoint?.id ?? "", background: backgroundNameOf(url), still: url, mode: mode === "pre" ? "pre" : "auto" };
}

export const loopTargetId = (target: LoopTarget): string => target.still;

export function nextTarget(current: LoopTarget | null, pre: readonly LoopTarget[], settled: ReadonlySet<string>): LoopTarget | null {
  if (current && !settled.has(loopTargetId(current))) return current;
  return pre.find((target) => !settled.has(loopTargetId(target))) ?? null;
}

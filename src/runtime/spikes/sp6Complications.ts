import { TENSION_CURRENT_KEY, agencyForCheckpoint, type ArcTemplate, type BoundaryLogEntry, type NormalizedStoryV2 } from "@engine/index";
import { getSteeringHint } from "@pacing/index";
import { isRecord } from "@utils/guards";
import { computeExpectedTension } from "../snapshot";
import { withholds, type GenerationIntent } from "../generationLifecycle";

export const COMPLICATION_KEY = "story_orchestrator_complication";
export const COMPLICATION_DEPTH = 5;
export const DEFAULT_COMPLICATION_AFTER = 3;

export interface Complication {
  id: string;
  text: string;
}

export interface ComplicationPool {
  after: number;
  items: Complication[];
}

export interface ComplicationRelease {
  boundary: number;
  checkpointId: string;
  id: string;
  text: string;
}

export interface ReleaseInput {
  story: NormalizedStoryV2;
  pools: Record<string, ComplicationPool>;
  log: readonly BoundaryLogEntry[];
  shape: ArcTemplate | null;
}

const readItem = (value: unknown, index: number): Complication | null => {
  if (typeof value === "string") return value.trim() ? { id: `c${index + 1}`, text: value.trim() } : null;
  if (!isRecord(value) || typeof value.text !== "string" || !value.text.trim()) return null;
  return { id: typeof value.id === "string" && value.id.trim() ? value.id.trim() : `c${index + 1}`, text: value.text.trim() };
};

export const readComplicationPools = (raw: unknown): Record<string, ComplicationPool> => {
  if (!isRecord(raw) || !Array.isArray(raw.checkpoints)) return {};
  const pools: Record<string, ComplicationPool> = {};
  for (const checkpoint of raw.checkpoints) {
    if (!isRecord(checkpoint) || typeof checkpoint.id !== "string" || !Array.isArray(checkpoint.complications)) continue;
    const items = checkpoint.complications.map(readItem).filter((item): item is Complication => item !== null);
    const after = typeof checkpoint.complication_after === "number" && Number.isInteger(checkpoint.complication_after) && checkpoint.complication_after >= 1
      ? checkpoint.complication_after
      : DEFAULT_COMPLICATION_AFTER;
    if (items.length) pools[checkpoint.id] = { after, items };
  }
  return pools;
};

const directionOf = (story: NormalizedStoryV2, entry: BoundaryLogEntry, shape: ArcTemplate | null): string => {
  const state = entry.after;
  const smoothed = state.blackboard.values[TENSION_CURRENT_KEY];
  const target = story.checkpointById[state.activeCheckpointId]?.tension_target;
  const expected = computeExpectedTension(story, state, target, shape);
  return getSteeringHint(typeof smoothed === "number" ? smoothed : null, expected)?.direction ?? "none";
};

export const deriveReleases = ({ story, pools, log, shape }: ReleaseInput): ComplicationRelease[] => {
  const releases: ComplicationRelease[] = [];
  const spent = new Set<string>();
  let streak = 0;
  let streakAt: string | null = null;
  for (const entry of log) {
    const checkpointId = entry.after.activeCheckpointId;
    if (checkpointId !== streakAt || entry.fired) {
      streak = 0;
      streakAt = checkpointId;
    }
    streak = directionOf(story, entry, shape) === "escalate" ? streak + 1 : 0;
    const pool = pools[checkpointId];
    if (!pool || streak < pool.after) continue;
    streak = 0;
    const next = pool.items.find((item) => !spent.has(`${checkpointId}:${item.id}`));
    if (!next) continue;
    spent.add(`${checkpointId}:${next.id}`);
    releases.push({ boundary: entry.boundary, checkpointId, id: next.id, text: next.text });
  }
  return releases;
};

export const pendingRelease = (input: ReleaseInput): ComplicationRelease | null => {
  const latest = input.log[input.log.length - 1];
  if (!latest) return null;
  const last = deriveReleases(input).at(-1);
  return last && last.boundary === latest.boundary ? last : null;
};

export const composeComplication = (story: NormalizedStoryV2, release: ComplicationRelease): string => {
  const policy = agencyForCheckpoint(story, release.checkpointId);
  const clause = policy.never_narrate_player_action ? " Do not narrate the player's own words or decisions." : "";
  return `World pressure: ${release.text} Let it land in this reply as something the world does.${clause}`;
};

export const logDirections = ({ story, log, shape }: Pick<ReleaseInput, "story" | "log" | "shape">): string[] =>
  log.map((entry) => directionOf(story, entry, shape));

export interface PromptPort {
  set(key: string, text: string, depth: number): void;
  clear(key: string): void;
}

export type ComplicationEvent = { kind: "set"; release: ComplicationRelease } | { kind: "clear" };

export const createComplicationSeam = (read: () => ReleaseInput | null, prompt: PromptPort, record: (event: ComplicationEvent) => void = () => undefined) => {
  let held = false;
  const clear = () => {
    if (!held) return;
    prompt.clear(COMPLICATION_KEY);
    held = false;
    record({ kind: "clear" });
  };
  const set = () => {
    const input = read();
    const release = input ? pendingRelease(input) : null;
    if (!input || !release) return clear();
    prompt.set(COMPLICATION_KEY, composeComplication(input.story, release), COMPLICATION_DEPTH);
    held = true;
    record({ kind: "set", release });
  };
  return (intent: GenerationIntent) => {
    if (intent.kind === "opened") return withholds(intent.type) ? clear() : set();
    if (intent.kind === "nested") return intent.withholds ? clear() : undefined;
    if (intent.kind === "reapply") return set();
    if (intent.kind === "closed") return clear();
  };
};

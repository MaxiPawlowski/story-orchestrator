import type { NormalizedStoryV2 } from "@engine/index";

export interface WorldInfoRef {
  lorebook: string;
  comments: string[];
}

export interface WorldInfoBookPlan {
  lorebook: string;
  enable: string[];
  disable: string[];
}

type GatedSet = Map<string, Set<string>>;

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const readStrings = (value: unknown): string[] => (Array.isArray(value) ? value : [value])
  .filter((entry): entry is string => typeof entry === "string")
  .map((entry) => entry.trim())
  .filter((entry) => entry.length > 0);

const readRefs = (value: unknown): WorldInfoRef[] => (Array.isArray(value) ? value : [value]).flatMap((entry) => {
  if (!isRecord(entry)) return [];
  const lorebook = readStrings(entry.lorebook)[0] ?? readStrings(entry.book)[0] ?? "";
  const comments = readStrings(entry.comments ?? entry.comment);
  return lorebook && comments.length ? [{ lorebook, comments }] : [];
});

export function readWorldInfoEffect(value: unknown): { enable: WorldInfoRef[]; disable: WorldInfoRef[] } {
  if (!isRecord(value)) return { enable: [], disable: [] };
  return { enable: readRefs(value.enable), disable: readRefs(value.disable) };
}

const checkpointWorldInfo = (checkpoint: unknown) =>
  readWorldInfoEffect(isRecord(checkpoint) && isRecord(checkpoint.effects) ? checkpoint.effects.world_info : undefined);

const addTo = (set: GatedSet, lorebook: string, comment: string) => {
  const comments = set.get(lorebook) ?? new Set<string>();
  comments.add(comment);
  set.set(lorebook, comments);
};

// Every entry some checkpoint switches on or off. Those entries belong to the story, not to the
// lorebook: their flag is written for whichever chat is open, and nothing outside this set is touched.
export function gatedWorldInfo(stories: unknown[]): GatedSet {
  const gated: GatedSet = new Map();
  for (const story of stories) {
    const checkpoints = isRecord(story) && Array.isArray(story.checkpoints) ? story.checkpoints : [];
    for (const checkpoint of checkpoints) {
      const { enable, disable } = checkpointWorldInfo(checkpoint);
      for (const ref of [...enable, ...disable]) ref.comments.forEach((comment) => addTo(gated, ref.lorebook, comment));
    }
  }
  return gated;
}

// A lorebook is global, so its flags say nothing about this chat. The chat's state is rebuilt from
// its own path instead: every gated entry starts off, then each checkpoint entered switches its
// entries in order (enables, then disables), which is what one continuous run of that path leaves.
export function worldInfoPlan(story: NormalizedStoryV2, path: string[]): WorldInfoBookPlan[] {
  const enabled: GatedSet = new Map();
  for (const id of path) {
    const { enable, disable } = checkpointWorldInfo(story.checkpointById[id]);
    enable.forEach((ref) => ref.comments.forEach((comment) => addTo(enabled, ref.lorebook, comment)));
    disable.forEach((ref) => ref.comments.forEach((comment) => enabled.get(ref.lorebook)?.delete(comment)));
  }
  return [...gatedWorldInfo([story])].map(([lorebook, comments]) => {
    const on = enabled.get(lorebook) ?? new Set<string>();
    return { lorebook, enable: [...comments].filter((comment) => on.has(comment)), disable: [...comments].filter((comment) => !on.has(comment)) };
  });
}

// Switching a chat away from a story turns off everything that story gates, except what the story
// taking over gates too: that story's own plan decides those.
export function releasePlan(owners: unknown[], keep: unknown | null): WorldInfoBookPlan[] {
  const kept = gatedWorldInfo(keep ? [keep] : []);
  return [...gatedWorldInfo(owners)]
    .map(([lorebook, comments]) => ({ lorebook, enable: [], disable: [...comments].filter((comment) => !kept.get(lorebook)?.has(comment)) }))
    .filter((plan) => plan.disable.length > 0);
}

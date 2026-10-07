import { isRecord } from "@utils/guards";
export interface WorldInfoRef {
  lorebook: string;
  comments: string[];
}

export type GatedWorldInfo = Map<string, Set<string>>;

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

export const checkpointWorldInfo = (checkpoint: unknown) =>
  readWorldInfoEffect(isRecord(checkpoint) && isRecord(checkpoint.effects) ? checkpoint.effects.world_info : undefined);

const questRewardWorldInfo = (story: unknown) => (isRecord(story) && Array.isArray(story.quests) ? story.quests : [])
  .map((quest) => readWorldInfoEffect(isRecord(quest) && isRecord(quest.reward) && isRecord(quest.reward.effects) ? quest.reward.effects.world_info : undefined));

export const addGatedEntry = (set: GatedWorldInfo, lorebook: string, comment: string) => {
  const comments = set.get(lorebook) ?? new Set<string>();
  comments.add(comment);
  set.set(lorebook, comments);
};

// Every entry some checkpoint switches on or off. Those entries belong to the story, not to the
// lorebook: their flag is written for whichever chat is open, and nothing outside this set is touched.
export function gatedWorldInfo(stories: unknown[]): GatedWorldInfo {
  const gated: GatedWorldInfo = new Map();
  for (const story of stories) {
    const checkpoints = isRecord(story) && Array.isArray(story.checkpoints) ? story.checkpoints : [];
    for (const checkpoint of checkpoints) {
      const { enable, disable } = checkpointWorldInfo(checkpoint);
      for (const ref of [...enable, ...disable]) ref.comments.forEach((comment) => addGatedEntry(gated, ref.lorebook, comment));
    }
    for (const reward of questRewardWorldInfo(story)) {
      for (const ref of [...reward.enable, ...reward.disable]) ref.comments.forEach((comment) => addGatedEntry(gated, ref.lorebook, comment));
    }
  }
  return gated;
}

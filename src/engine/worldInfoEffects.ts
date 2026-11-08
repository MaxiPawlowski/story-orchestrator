import { isRecord } from "@utils/guards";
export interface WorldInfoRef {
  lorebook: string;
  comments: string[];
  until?: string;
  lasting?: true;
}

export const LORE_UNTIL_CHAPTER = "chapter";

export type GatedWorldInfo = Map<string, Set<string>>;

const readStrings = (value: unknown): string[] => (Array.isArray(value) ? value : [value])
  .filter((entry): entry is string => typeof entry === "string")
  .map((entry) => entry.trim())
  .filter((entry) => entry.length > 0);

const readRefs = (value: unknown): WorldInfoRef[] => (Array.isArray(value) ? value : [value]).flatMap((entry) => {
  if (!isRecord(entry)) return [];
  const lorebook = readStrings(entry.lorebook)[0] ?? readStrings(entry.book)[0] ?? "";
  const comments = readStrings(entry.comments ?? entry.comment);
  const until = readStrings(entry.until)[0];
  return lorebook && comments.length ? [{ lorebook, comments, ...(until ? { until } : {}), ...(entry.lasting === true ? { lasting: true as const } : {}) }] : [];
});

export function readWorldInfoEffect(value: unknown): { enable: WorldInfoRef[]; disable: WorldInfoRef[] } {
  if (!isRecord(value)) return { enable: [], disable: [] };
  return { enable: readRefs(value.enable), disable: readRefs(value.disable) };
}

export const checkpointWorldInfo = (checkpoint: unknown) =>
  readWorldInfoEffect(isRecord(checkpoint) && isRecord(checkpoint.effects) ? checkpoint.effects.world_info : undefined);

export type LoreEnd = { chapter: string } | { until: string } | null;

export type PathLore = Map<string, Map<string, LoreEnd>>;

export interface PathLoreStory {
  checkpointById?: Record<string, unknown>;
  chapterByCheckpoint?: Record<string, string>;
  checkpoints?: unknown[];
}

const checkpointAt = (story: PathLoreStory, id: string): unknown =>
  story.checkpointById?.[id] ?? (story.checkpoints ?? []).find((checkpoint) => isRecord(checkpoint) && checkpoint.id === id);

export const chapterAt = (story: PathLoreStory, id: string): string | undefined => {
  const checkpoint = checkpointAt(story, id);
  const own = isRecord(checkpoint) && typeof checkpoint.chapter === "string" && checkpoint.chapter.trim() ? checkpoint.chapter : undefined;
  return own ?? story.chapterByCheckpoint?.[id];
};

export const loreEnd = (ref: WorldInfoRef, chapter: string | undefined): LoreEnd => {
  if (ref.lasting) return null;
  if (ref.until && ref.until !== LORE_UNTIL_CHAPTER) return { until: ref.until };
  return chapter ? { chapter } : null;
};

const ended = (end: LoreEnd, id: string, chapter: string | undefined) =>
  end !== null && ("until" in end ? end.until === id : chapter !== undefined && chapter !== end.chapter);

// One continuous run of the path: entering a checkpoint first ends what its chapter change or its id ends,
// then applies its own switches. With lifetimes off nothing ends on its own.
export function loreAlongPath(story: PathLoreStory, path: readonly string[], lifetime: boolean, visit?: (id: string, on: PathLore) => void): PathLore {
  const on: PathLore = new Map();
  for (const id of path) {
    const chapter = chapterAt(story, id);
    if (lifetime) for (const comments of on.values()) for (const [comment, end] of comments) if (ended(end, id, chapter)) comments.delete(comment);
    const { enable, disable } = checkpointWorldInfo(checkpointAt(story, id));
    for (const ref of enable) {
      const book = on.get(ref.lorebook) ?? new Map<string, LoreEnd>();
      ref.comments.forEach((comment) => book.set(comment, lifetime ? loreEnd(ref, chapter) : null));
      on.set(ref.lorebook, book);
    }
    disable.forEach((ref) => ref.comments.forEach((comment) => on.get(ref.lorebook)?.delete(comment)));
    visit?.(id, on);
  }
  return on;
}

const listOf = (value: unknown, key: string): unknown[] => (isRecord(value) && Array.isArray(value[key]) ? value[key] as unknown[] : []);

const effectWorldInfo = (item: unknown) => readWorldInfoEffect(isRecord(item) && isRecord(item.effects) ? item.effects.world_info : undefined);

const questRewardWorldInfo = (story: unknown) => listOf(story, "quests").flatMap((quest) => [
  effectWorldInfo(isRecord(quest) ? quest.reward : undefined),
  ...listOf(quest, "resolutions").flatMap((resolution) => listOf(resolution, "consequences").map(effectWorldInfo)),
]);

const agendaWorldInfo = (story: unknown) => (isRecord(story) && Array.isArray(story.roster) ? story.roster : [])
  .flatMap((member) => (isRecord(member) && Array.isArray(member.agenda) ? member.agenda : []))
  .flatMap((agenda) => (isRecord(agenda) && Array.isArray(agenda.steps) ? agenda.steps : []))
  .map((step) => readWorldInfoEffect(isRecord(step) && isRecord(step.effect) ? step.effect.world_info : undefined));

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
    for (const reward of [...questRewardWorldInfo(story), ...agendaWorldInfo(story)]) {
      for (const ref of [...reward.enable, ...reward.disable]) ref.comments.forEach((comment) => addGatedEntry(gated, ref.lorebook, comment));
    }
  }
  return gated;
}

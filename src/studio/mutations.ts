import type {
  ArcBridge, ArcTemplate, Chapter, ChapterSealPolicy, Checkpoint, CheckpointEffects, GateNode, PrimitiveValue, Quality, RosterMember,
  StoryBriefing, StoryRequirements, StoryLoreSelect, StorySceneRead, StoryStagecraft, Transition,
} from "@engine/index";
import type { StoryDraft } from "./draft";

export const nextId = (existing: Iterable<string>, base: string): string => {
  const used = new Set(existing);
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
};

export const newQuality = (key: string): Quality => ({ key, type: "string", source: "extractor", rubric: "" });

export const addQuality = (draft: StoryDraft, quality?: Quality): StoryDraft => {
  if (quality?.key && draft.qualities.some((entry) => entry.key === quality.key)) return draft;
  const key = quality?.key || nextId(draft.qualities.map((entry) => entry.key), "quality");
  const value = quality ? { ...quality, key } : newQuality(key);
  return { ...draft, qualities: [...draft.qualities, value] };
};

export const updateQuality = (draft: StoryDraft, key: string, patch: Partial<Quality>): StoryDraft => ({
  ...draft,
  qualities: draft.qualities.map((entry) => (entry.key === key ? { ...entry, ...patch } : entry)),
});

export const removeQuality = (draft: StoryDraft, key: string): StoryDraft => ({
  ...draft,
  qualities: draft.qualities.filter((entry) => entry.key !== key),
});

export const newCheckpoint = (id: string): Checkpoint => ({ id, name: id, objective: "", type: "intermediate" });

export const addCheckpoint = (draft: StoryDraft, checkpoint?: Checkpoint): StoryDraft => {
  if (checkpoint?.id && draft.checkpoints.some((entry) => entry.id === checkpoint.id)) return draft;
  const id = checkpoint?.id || nextId(draft.checkpoints.map((entry) => entry.id), "checkpoint");
  const value = checkpoint ? { ...checkpoint, id } : newCheckpoint(id);
  return { ...draft, checkpoints: [...draft.checkpoints, value] };
};

export const updateCheckpoint = (draft: StoryDraft, id: string, patch: Partial<Checkpoint>): StoryDraft => ({
  ...draft,
  checkpoints: draft.checkpoints.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
});

export const removeCheckpoint = (draft: StoryDraft, id: string): StoryDraft => ({
  ...draft,
  checkpoints: draft.checkpoints.filter((entry) => entry.id !== id),
  transitions: draft.transitions.filter((entry) => entry.from !== id && entry.to !== id),
});

export const setStartCheckpoint = (draft: StoryDraft, id: string): StoryDraft => ({
  ...draft,
  checkpoints: draft.checkpoints.map((entry) => ({ ...entry, start: entry.id === id ? true : undefined })),
});

export const clearStartCheckpoint = (draft: StoryDraft, id: string): StoryDraft =>
  updateCheckpoint(draft, id, { start: undefined });

export const setCheckpointSnapshot = (draft: StoryDraft, id: string, snapshot: Record<string, PrimitiveValue>): StoryDraft =>
  updateCheckpoint(draft, id, { state_snapshot: snapshot });

export const setCheckpointEffects = (draft: StoryDraft, id: string, effects: CheckpointEffects): StoryDraft =>
  updateCheckpoint(draft, id, { effects });

export const newTransition = (from: string, to: string): Transition => ({ from, to, gate: { all: [] }, priority: 0 });

export const sameTransitionKey = (left: Pick<Transition, "from" | "to" | "priority">, right: Pick<Transition, "from" | "to" | "priority">): boolean =>
  left.from === right.from && left.to === right.to && left.priority === right.priority;

const freePriority = (draft: StoryDraft, from: string, to: string): number => {
  const taken = draft.transitions.filter((entry) => entry.from === from && entry.to === to).map((entry) => entry.priority);
  return taken.length ? Math.max(...taken) + 1 : 0;
};

export const addTransition = (draft: StoryDraft, transition?: Transition): StoryDraft => {
  if (transition) return draft.transitions.some((entry) => sameTransitionKey(entry, transition)) ? draft : { ...draft, transitions: [...draft.transitions, transition] };
  const from = draft.checkpoints[0]?.id ?? "";
  const to = draft.checkpoints[1]?.id ?? draft.checkpoints[0]?.id ?? "";
  return { ...draft, transitions: [...draft.transitions, { ...newTransition(from, to), priority: freePriority(draft, from, to) }] };
};

export const updateTransition = (draft: StoryDraft, index: number, patch: Partial<Transition>): StoryDraft => ({
  ...draft,
  transitions: draft.transitions.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)),
});

export const removeTransition = (draft: StoryDraft, index: number): StoryDraft => ({
  ...draft,
  transitions: draft.transitions.filter((_, entryIndex) => entryIndex !== index),
});

export const setTransitionGate = (draft: StoryDraft, index: number, gate: GateNode): StoryDraft =>
  updateTransition(draft, index, { gate });

export const newRosterMember = (id: string): RosterMember => ({ id });

export const addRosterMember = (draft: StoryDraft, member?: RosterMember): StoryDraft => {
  if (member?.id && draft.roster.some((entry) => entry.id === member.id)) return draft;
  const id = member?.id || nextId(draft.roster.map((entry) => entry.id), "member");
  return { ...draft, roster: [...draft.roster, member ? { ...member, id } : newRosterMember(id)] };
};

export const updateRosterMember = (draft: StoryDraft, id: string, patch: Partial<RosterMember>): StoryDraft => ({
  ...draft,
  roster: draft.roster.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
});

export const removeRosterMember = (draft: StoryDraft, id: string): StoryDraft => ({
  ...draft,
  roster: draft.roster.filter((entry) => entry.id !== id),
});

export const setStoryField = <K extends keyof StoryDraft>(draft: StoryDraft, key: K, value: StoryDraft[K]): StoryDraft => ({
  ...draft,
  [key]: value,
});

export const setArcBridges = (draft: StoryDraft, bridges: ArcBridge[]): StoryDraft => ({ ...draft, arc_bridges: bridges.length ? bridges : undefined });

export const newArcBridge = (anchor: string): ArcBridge => ({ arcMatch: "", anchor, amount: 1 });

export const addArcBridge = (draft: StoryDraft, bridge?: ArcBridge): StoryDraft =>
  setArcBridges(draft, [...(draft.arc_bridges ?? []), bridge ?? newArcBridge(draft.checkpoints.find((entry) => entry.type === "anchor")?.id ?? "")]);

export const updateArcBridge = (draft: StoryDraft, index: number, patch: Partial<ArcBridge>): StoryDraft =>
  setArcBridges(draft, (draft.arc_bridges ?? []).map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)));

export const removeArcBridge = (draft: StoryDraft, index: number): StoryDraft =>
  setArcBridges(draft, (draft.arc_bridges ?? []).filter((_, entryIndex) => entryIndex !== index));

export const setArcTemplate = (draft: StoryDraft, template: ArcTemplate | undefined): StoryDraft => {
  const { arc_template: _dropped, ...rest } = draft;
  return template ? { ...rest, arc_template: template } : rest;
};

// Entries stay as typed, like setSceneRead: the editor calls this on every keystroke, so trimming
// here ate the space in "Max Power" and dropped a new blank row. Parse trims and drops blanks.
// An empty list is an absent requirement, never a requirement for nothing.
export const setRequirements = (draft: StoryDraft, requirements: StoryRequirements): StoryDraft => {
  const kept: StoryRequirements = {};
  (["personas", "members", "lorebooks"] as const).forEach((key) => {
    const values = requirements[key] ?? [];
    if (values.length) kept[key] = values;
  });
  const { requirements: _dropped, ...rest } = draft;
  return Object.keys(kept).length ? { ...rest, requirements: kept } : rest;
};

// The curator's write scope, kept as typed like setRequirements. An empty list drops the block
// entirely — the safe default is a story that grants no background agent any lorebook.
export const setStagecraft = (draft: StoryDraft, stagecraft: StoryStagecraft): StoryDraft => {
  const lorebooks = stagecraft.lorebooks ?? [];
  const exclude = ("exclude" in stagecraft ? stagecraft.exclude : draft.stagecraft?.exclude) ?? [];
  const { stagecraft: _dropped, ...rest } = draft;
  return lorebooks.length || exclude.length ? { ...rest, stagecraft: { lorebooks, ...(exclude.length ? { exclude } : {}) } } : rest;
};

// The scene tracker's vocabulary, kept as typed (the parser trims on load), so a new
// empty row and a space typed mid-name survive the keystroke. An empty block drops out.
export const setSceneRead = (draft: StoryDraft, sceneRead: StorySceneRead): StoryDraft => {
  const next: StorySceneRead = {
    ...(sceneRead.locations?.length ? { locations: sceneRead.locations } : {}),
    ...(sceneRead.times?.length ? { times: sceneRead.times } : {}),
    ...(sceneRead.inject === false ? { inject: false } : {}),
  };
  const { scene_read: _dropped, ...rest } = draft;
  return Object.keys(next).length ? { ...rest, scene_read: next } : rest;
};

// Lore-select's scope, kept as typed like setSceneRead. No book means no block.
export const setLoreSelect = (draft: StoryDraft, loreSelect: StoryLoreSelect): StoryDraft => {
  const { lore_select: _dropped, ...rest } = draft;
  if (!loreSelect.lorebooks.length && !loreSelect.exclusive) return rest;
  return {
    ...rest,
    lore_select: {
      lorebooks: loreSelect.lorebooks,
      ...(loreSelect.top_k !== undefined ? { top_k: loreSelect.top_k } : {}),
      ...(loreSelect.min_p !== undefined ? { min_p: loreSelect.min_p } : {}),
      ...(loreSelect.exclusive ? { exclusive: true } : {}),
    },
  };
};

// Kept as typed so a rule can be written word by word; validation trims and caps it.
export const setBriefing = (draft: StoryDraft, briefing: StoryBriefing | undefined): StoryDraft => {
  const { briefing: _dropped, ...rest } = draft;
  return briefing ? { ...rest, briefing } : rest;
};

export const setHouseRules = (draft: StoryDraft, rules: string[]): StoryDraft => {
  const { house_rules: _dropped, ...rest } = draft;
  return rules.length ? { ...rest, house_rules: rules } : rest;
};

export const addChapter = (draft: StoryDraft, chapter?: Chapter): StoryDraft => {
  const chapters = draft.chapters ?? [];
  if (chapter && chapters.some((entry) => entry.id === chapter.id)) return draft;
  const id = chapter?.id ?? nextId(chapters.map((entry) => entry.id), "chapter");
  return { ...draft, chapters: [...chapters, chapter ?? { id, title: id }] };
};

export const updateChapter = (draft: StoryDraft, id: string, patch: Partial<Omit<Chapter, "id">>): StoryDraft => ({
  ...draft,
  chapters: (draft.chapters ?? []).map((chapter) => (chapter.id === id ? { ...chapter, ...patch } : chapter)),
});

export const removeChapter = (draft: StoryDraft, id: string): StoryDraft => {
  const { chapters: _dropped, ...rest } = draft;
  const chapters = (draft.chapters ?? []).filter((chapter) => chapter.id !== id);
  const checkpoints = draft.checkpoints.map((checkpoint) => {
    if (checkpoint.chapter !== id) return checkpoint;
    const { chapter: _gone, ...kept } = checkpoint;
    return kept;
  });
  return chapters.length ? { ...rest, chapters, checkpoints } : { ...rest, checkpoints };
};

export const setCheckpointChapter = (draft: StoryDraft, checkpointId: string, chapterId: string): StoryDraft => ({
  ...draft,
  checkpoints: draft.checkpoints.map((checkpoint) => {
    if (checkpoint.id !== checkpointId) return checkpoint;
    const { chapter: _dropped, ...rest } = checkpoint;
    return chapterId ? { ...rest, chapter: chapterId } : rest;
  }),
});

export const setChapterPolicy = (draft: StoryDraft, id: string, seal: ChapterSealPolicy): StoryDraft => ({
  ...draft,
  chapters: (draft.chapters ?? []).map((chapter) => {
    if (chapter.id !== id) return chapter;
    const { seal: _dropped, ...rest } = chapter;
    return Object.keys(seal).length ? { ...rest, seal } : rest;
  }),
});

const CHAPTER_OPTIONAL = { player_title: undefined, kind: undefined, final: undefined };

const definedOnly = <T extends object>(value: T): T => Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;

export const setChapters = (draft: StoryDraft, chapters: Chapter[], assign: Record<string, string> = {}): StoryDraft => {
  const wanted = new Set(chapters.map((chapter) => chapter.id));
  const pruned = (draft.chapters ?? []).filter((chapter) => !wanted.has(chapter.id)).reduce((current, chapter) => removeChapter(current, chapter.id), draft);
  const written = chapters.reduce((current, { id, seal, ...fields }) => {
    const placed = (current.chapters ?? []).some((chapter) => chapter.id === id)
      ? updateChapter(current, id, { ...CHAPTER_OPTIONAL, ...fields })
      : addChapter(current, { id, ...fields });
    return setChapterPolicy(placed, id, seal ?? {});
  }, pruned);
  const ordered = written.chapters
    ? { ...written, chapters: chapters.map((chapter) => definedOnly(written.chapters?.find((entry) => entry.id === chapter.id) ?? chapter)) }
    : written;
  return Object.entries(assign).reduce((current, [checkpointId, chapterId]) => setCheckpointChapter(current, checkpointId, chapterId), ordered);
};

export const setStoryId = (draft: StoryDraft, id: string): StoryDraft => {
  const { id: _dropped, ...rest } = draft;
  const next = id.trim().toLowerCase();
  return next ? { ...rest, id: next } : rest;
};

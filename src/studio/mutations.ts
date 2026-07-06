import type {
  ArcBridge,
  Checkpoint,
  CheckpointEffects,
  GateNode,
  PrimitiveValue,
  Quality,
  RosterMember,
  Transition,
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

export const addTransition = (draft: StoryDraft, transition?: Transition): StoryDraft => {
  const from = transition?.from ?? draft.checkpoints[0]?.id ?? "";
  const to = transition?.to ?? draft.checkpoints[1]?.id ?? draft.checkpoints[0]?.id ?? "";
  const value = transition ?? newTransition(from, to);
  return { ...draft, transitions: [...draft.transitions, value] };
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

export const setArcBridges = (draft: StoryDraft, bridges: ArcBridge[]): StoryDraft => ({ ...draft, arc_bridges: bridges });

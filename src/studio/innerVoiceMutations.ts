import type { RosterView } from "@engine/index";
import type { StoryDraft } from "./draft";

const withoutKey = <T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> => {
  const { [key]: _dropped, ...rest } = value;
  return rest;
};

export const setRosterDrive = (draft: StoryDraft, id: string, drive: string): StoryDraft => ({
  ...draft,
  roster: draft.roster.map((entry) => (entry.id !== id ? entry : drive ? { ...entry, drive } : withoutKey(entry, "drive"))),
});

export const setRosterView = (draft: StoryDraft, id: string, view: RosterView): StoryDraft => ({
  ...draft,
  roster: draft.roster.map((entry) => (entry.id !== id ? entry : view === "omniscient" ? { ...entry, view } : withoutKey(entry, "view"))),
});

export const setCheckpointMotive = (draft: StoryDraft, checkpointId: string, rosterId: string, motive: string): StoryDraft => ({
  ...draft,
  checkpoints: draft.checkpoints.map((entry) => {
    if (entry.id !== checkpointId) return entry;
    const motives = { ...withoutKey(entry.motives ?? {}, rosterId), ...(motive ? { [rosterId]: motive } : {}) };
    return Object.keys(motives).length ? { ...entry, motives } : withoutKey(entry, "motives");
  }),
});

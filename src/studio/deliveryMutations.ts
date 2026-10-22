import type { RosterPolish } from "@engine/index";
import type { StoryDraft } from "./draft";

export type PolishPatch = { [K in keyof RosterPolish]?: RosterPolish[K] | undefined };

const emptyValue = (value: unknown): boolean =>
  value === undefined || value === "" || (Array.isArray(value) && value.length === 0) || (typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length === 0);

const merged = (current: RosterPolish | undefined, patch: PolishPatch): RosterPolish | undefined => {
  const next: Record<string, unknown> = { ...(current ?? {}) };
  (Object.keys(patch) as Array<keyof RosterPolish>).forEach((key) => {
    const value = patch[key];
    if (emptyValue(value) || (key === "enabled" && value === true) || (key === "dialogue" && value === "keep")) delete next[key];
    else next[key] = value;
  });
  const content = Object.keys(next).filter((key) => key !== "enabled");
  return content.length ? next as RosterPolish : undefined;
};

export const setMemberPolish = (draft: StoryDraft, id: string, patch: PolishPatch | null): StoryDraft => ({
  ...draft,
  roster: draft.roster.map((entry) => {
    if (entry.id !== id) return entry;
    const { polish: current, ...rest } = entry;
    const polish = patch === null ? undefined : merged(current, patch);
    return polish ? { ...rest, polish } : rest;
  }),
});

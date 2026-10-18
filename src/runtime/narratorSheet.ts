import type { BoundaryLogEntry, EngineState, NormalizedStory, PrimitiveValue, Quality } from "@engine/index";
import { deriveRefs, neutralText, recapWithheld } from "./consequences";
import { bandWarn, sheetGroups, sheetItem } from "./gameSheet";
import type { EffectRef } from "./recapPort";

export const SHEET_HEADER = "What the player's sheet shows right now. Keep the story consistent with it and never mention the sheet:";
export const WARN_HEADER = "Warnings the player sees on the sheet:";
export const JUST_HAPPENED_HEADER = "Just happened, already decided (show it where it fits; never undo it):";
export const JUST_HAPPENED_MAX = 6;

type Values = Readonly<Record<string, PrimitiveValue>>;

export const narratedQualities = (story: NormalizedStory): Quality[] =>
  story.qualities.filter((quality) => quality.display?.public === true && quality.display.narrate !== false);

export const sheetLines = (story: NormalizedStory, values: Values): string[] =>
  sheetGroups(narratedQualities(story), values, null).flatMap((group) => group.items.map((item) => `- ${group.label}: ${item.label}${item.text ? `: ${item.text}` : ""}`));

export const warnLines = (story: NormalizedStory, values: Values): string[] => narratedQualities(story).flatMap((quality) => {
  const display = quality.display;
  const warn = display && sheetItem(quality, values, null) ? bandWarn(display, values[quality.key]) : null;
  return warn ? [`- ${display?.label}: ${warn}`] : [];
});

const shownRef = (story: NormalizedStory, ref: EffectRef): boolean => ref.visible && (ref.kind === "quest"
  || (ref.kind === "milestone" && !(story.milestones ?? []).find((milestone) => milestone.id === ref.id)?.secret));

const bandMoves = (story: NormalizedStory, entry: BoundaryLogEntry): string[] => narratedQualities(story).flatMap((quality) => {
  if (!quality.display?.bands) return [];
  const before = sheetItem(quality, entry.before.blackboard.values, null)?.text;
  const after = sheetItem(quality, entry.after.blackboard.values, null)?.text;
  return after && before !== after ? [`${quality.display.label}: now ${after}`] : [];
});

export const justHappened = (story: NormalizedStory, state: EngineState, entries: readonly BoundaryLogEntry[]): string[] => {
  const withheld = recapWithheld(story, state).map((name) => name.toLowerCase());
  const named = (text: string) => withheld.some((name) => text.toLowerCase().includes(name));
  const rows = [...entries].sort((left, right) => left.boundary - right.boundary).flatMap((entry) => [
    ...deriveRefs(story, entry).filter((ref) => shownRef(story, ref)).map((ref) => neutralText(story, ref)).filter((text): text is string => Boolean(text)),
    ...bandMoves(story, entry),
  ]).filter((text) => !named(text));
  return rows.slice(-JUST_HAPPENED_MAX).map((text) => `- ${text}`);
};

export const narratorLines = (story: NormalizedStory, state: EngineState, entries: readonly BoundaryLogEntry[]): string[] => {
  const values = state.blackboard.values;
  const sheet = sheetLines(story, values);
  const warns = warnLines(story, values);
  const rows = justHappened(story, state, entries);
  return [
    ...(sheet.length ? [SHEET_HEADER, ...sheet] : []),
    ...(warns.length ? [WARN_HEADER, ...warns] : []),
    ...(rows.length ? [JUST_HAPPENED_HEADER, ...rows] : []),
  ];
};

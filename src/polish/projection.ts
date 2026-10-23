import type { DeliverySheet } from "@engine/deliverySchema";
import { termPresent } from "@utils/termPresent";

export interface StyleProjection {
  notes: string[];
  moodLine: string | null;
  rhythm: string | null;
  prefer: string[];
  avoid: string[];
  tics: string[];
  dropped: number;
}

export interface ProjectionInput {
  sheet?: DeliverySheet;
  mood?: string | null;
  withheld: readonly string[];
  resting?: (text: string) => string;
}

const sentencesOf = (text: string): string[] => text.trim().match(/[^.!?…]+(?:[.!?…]+|$)/g)?.map((part) => part.trim()).filter(Boolean) ?? [];

export const projectStyle = (input: ProjectionInput): StyleProjection => {
  let dropped = 0;
  const names = input.withheld.map((name) => name.trim()).filter(Boolean);
  const keep = (text: string): boolean => {
    const safe = !names.some((name) => termPresent(text, name)) && (!input.resting || input.resting(text) === text);
    if (!safe) dropped += 1;
    return safe;
  };
  const list = (items: readonly string[] | undefined) => (items ?? []).filter(keep);
  const sheet = input.sheet;
  const moodText = input.mood ? sheet?.by_mood?.[input.mood] : undefined;
  const notes = sentencesOf(sheet?.notes ?? "").filter(keep);
  const moodLine = moodText ? sentencesOf(moodText).filter(keep).join(" ") || null : null;
  return { notes, moodLine, rhythm: sheet?.rhythm ?? null, prefer: list(sheet?.prefer), avoid: list(sheet?.avoid), tics: list(sheet?.tics), dropped };
};

export const projectionTexts = (projection: StyleProjection): string[] =>
  [...projection.notes, ...(projection.moodLine ? [projection.moodLine] : []), ...projection.prefer];

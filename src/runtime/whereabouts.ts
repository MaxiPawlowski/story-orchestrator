import type { NormalizedStory, PrimitiveValue } from "@engine/index";
import { gameLayer } from "@engine/validate/gameLayer";

export const awayRosterIds = (story: NormalizedStory | null, values: Readonly<Record<string, PrimitiveValue>>): string[] =>
  (story?.life ? gameLayer()?.life.awayMembers(story, values) ?? [] : []);

export const presentRosterIds = (story: NormalizedStory | null, values: Readonly<Record<string, PrimitiveValue>>, enabled: string[]): string[] => {
  const away = new Set(awayRosterIds(story, values));
  return away.size ? enabled.filter((id) => !away.has(id)) : enabled;
};

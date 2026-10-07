import type { NormalizedStoryV2, PrimitiveValue } from "@engine/index";
import { gameLayer } from "@engine/validate/gameLayer";

export const awayRosterIds = (story: NormalizedStoryV2 | null, values: Readonly<Record<string, PrimitiveValue>>): string[] =>
  (story?.life ? gameLayer()?.life.awayMembers(story, values) ?? [] : []);

export const presentRosterIds = (story: NormalizedStoryV2 | null, values: Readonly<Record<string, PrimitiveValue>>, enabled: string[]): string[] => {
  const away = new Set(awayRosterIds(story, values));
  return away.size ? enabled.filter((id) => !away.has(id)) : enabled;
};

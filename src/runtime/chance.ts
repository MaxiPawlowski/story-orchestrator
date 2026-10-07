import { chanceSeed, rollOutcome, seededStream, unitDraw } from "@engine/chance";
import type { DerivedQualityView, NormalizedStoryV2, PrimitiveValue, Quality } from "@engine/index";
import { checkGateValues } from "./storyCheckDraws";
import type { LoadedStory } from "./types";

export interface ChanceIds {
  chatId: string;
  storyId: string;
}

export interface ChanceContext extends ChanceIds {
  boundary: number;
  qualities: readonly Quality[];
  story?: NormalizedStoryV2;
}

export const chanceContext = (loaded: Pick<LoadedStory, "story" | "record"> | null, chatId: string | null, boundary: number): ChanceContext | null => {
  const storyId = loaded?.story.id ?? loaded?.record.id;
  return loaded && storyId && chatId ? { chatId, storyId, boundary, qualities: loaded.story.qualities, story: loaded.story } : null;
};

export type ChanceDrawKind = "npc" | "talk";

export interface ChanceDraw extends ChanceIds {
  kind: ChanceDrawKind;
  key: string;
  boundary: number;
  unit: number;
}

export interface ChanceSeams {
  derive: (view: DerivedQualityView) => Array<{ q: string; v: PrimitiveValue }>;
  npcRoll: (key: string) => number | null;
  talkRandom: () => (() => number) | null;
}

export const TALK_DRAW_KEY = "talk";

export const chanceGateValues = (qualities: readonly Quality[], ids: ChanceIds, view: DerivedQualityView): Array<{ q: string; v: PrimitiveValue }> =>
  qualities.flatMap(({ key, type, source, roll }) => {
    if (!roll || source !== "code") return [];
    const value = rollOutcome(roll, type, unitDraw([ids.chatId, ids.storyId, view.checkpointStartedBoundary, key]));
    return value === null ? [] : [{ q: key, v: value }];
  });

export const npcRollDraw = (ids: ChanceIds, boundary: number, key: string): number => unitDraw([ids.chatId, ids.storyId, boundary, key]);

export const talkDrawStream = (ids: ChanceIds, boundary: number): (() => number) =>
  seededStream(chanceSeed([ids.chatId, ids.storyId, boundary, TALK_DRAW_KEY]));

const drawListeners = new Set<(draw: ChanceDraw) => void>();

export const onChanceDraw = (listener: (draw: ChanceDraw) => void): (() => void) => {
  drawListeners.add(listener);
  return () => { drawListeners.delete(listener); };
};

const announce = (draw: ChanceDraw) => drawListeners.forEach((listener) => listener(draw));

export const createChanceSeams = (read: () => ChanceContext | null, record: (draw: ChanceDraw) => void = announce): ChanceSeams => ({
  derive: (view) => {
    const context = read();
    return context ? [...chanceGateValues(context.qualities, context, view), ...checkGateValues(context.story, context, view)] : [];
  },
  npcRoll: (key) => {
    const context = read();
    if (!context) return null;
    const unit = npcRollDraw(context, context.boundary, key);
    record({ kind: "npc", key, chatId: context.chatId, storyId: context.storyId, boundary: context.boundary, unit });
    return unit;
  },
  talkRandom: () => {
    const context = read();
    if (!context) return null;
    const stream = talkDrawStream(context, context.boundary);
    return () => {
      const unit = stream();
      record({ kind: "talk", key: TALK_DRAW_KEY, chatId: context.chatId, storyId: context.storyId, boundary: context.boundary, unit });
      return unit;
    };
  },
});
